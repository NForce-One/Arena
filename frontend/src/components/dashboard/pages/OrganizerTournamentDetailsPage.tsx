import {
  TEAM_SELECTION_MODE_LABELS,
  TOURNAMENT_GENDER_CATEGORY_LABELS,
  TOURNAMENT_STRUCTURE_LABELS,
  type SurfaceTypeDto,
} from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import type { OrganizerTournamentContext } from './OrganizerTournamentLayout';
import styles from './OrganizerTournamentPage.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatMonthValue(v: string): string {
  const [y, m] = v.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`.trim();
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US');
}

function birthWindowLabel(bornAfter: string | null, bornBefore: string | null): string | null {
  if (bornAfter && bornBefore) {
    return `Born between ${formatMonthValue(bornAfter)} and ${formatMonthValue(bornBefore)}`;
  }
  if (bornAfter) return `Born after ${formatMonthValue(bornAfter)} (no younger cutoff)`;
  if (bornBefore) return `Born before ${formatMonthValue(bornBefore)} (no older cutoff)`;
  return null;
}

function InlineBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
      {children}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <p className={styles.detailValue}>
        {children ?? <span className={styles.deck}>Not set</span>}
      </p>
    </div>
  );
}

export function DashboardOrganizerTournamentDetailsPage() {
  const { tournament, regSummary, reload } = useOutletContext<OrganizerTournamentContext>();
  const navigate = useNavigate();
  const [banner, setBanner] = useState<string | null>(null);
  const [surfaceTypes, setSurfaceTypes] = useState<SurfaceTypeDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm(): void;
  } | null>(null);

  const loadSurfaceTypes = useCallback(async () => {
    try {
      const data = await api<{ surfaceTypes: SurfaceTypeDto[] }>('/api/surface-types');
      setSurfaceTypes(data.surfaceTypes);
    } catch {
    }
  }, []);

  useEffect(() => {
    void loadSurfaceTypes();
  }, [loadSurfaceTypes]);

  const isDraft = tournament.status === 'draft';
  const surfaceTypeName = tournament.surfaceTypeId
    ? (surfaceTypes.find((s) => s.id === tournament.surfaceTypeId)?.name ?? null)
    : null;

  async function doTransition(action: 'publish' | 'close') {
    if (saving) return;
    setBanner(null);
    setSaving(true);
    try {
      await api(`/api/tournaments/${tournament.id}/${action}`, { method: 'POST' });
      await reload();
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    } finally {
      setSaving(false);
    }
  }

  function transition(action: 'publish' | 'close') {
    if (saving) return;
    setPendingConfirm(
      action === 'publish'
        ? {
            title: 'Publish this tournament?',
            message:
              'Once published, it becomes publicly visible and can no longer be edited or reverted to draft.',
            confirmLabel: 'Publish',
            onConfirm: () => void doTransition('publish'),
          }
        : {
            title: 'Close registration?',
            message:
              'Once closed, no one can register or be invited. There is no way to reopen it.',
            confirmLabel: 'Close registration',
            onConfirm: () => void doTransition('close'),
          },
    );
  }

  async function doRemove() {
    if (saving) return;
    setSaving(true);
    try {
      await api(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
      navigate('/organizer/tournaments');
    } catch (err) {
      setBanner(errorsFrom(err).banner);
      setSaving(false);
    }
  }

  function remove() {
    if (saving) return;
    setPendingConfirm({
      title: 'Delete this tournament?',
      message:
        'This permanently deletes the tournament along with every registration, fixture, and result under it. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => void doRemove(),
    });
  }

  return (
    <section className={styles.panel} aria-label="Tournament details">
      <h2 className={styles.h2}>Details</h2>

      {banner && <InlineBanner>{banner}</InlineBanner>}

      <h3 className={styles.h3}>Basics</h3>
      <div className={styles.detailsGrid}>
        <DetailField label="Name">{tournament.name}</DetailField>
        <DetailField label="Structure">
          {TOURNAMENT_STRUCTURE_LABELS[tournament.structure]}
        </DetailField>
        <DetailField label="Team selection">
          {TEAM_SELECTION_MODE_LABELS[tournament.teamSelectionMode]}
        </DetailField>
      </div>
      {tournament.description && (
        <div className={styles.field} style={{ marginTop: 16 }}>
          <span className={styles.label}>Description</span>
          <p className={styles.detailValue}>{tournament.description}</p>
        </div>
      )}

      <h3 className={styles.h3}>Schedule</h3>
      <div className={styles.detailsGrid}>
        <DetailField label="Start date">{formatDate(tournament.startDate)}</DetailField>
        <DetailField label="End date">{formatDate(tournament.endDate)}</DetailField>
        <DetailField
          label={tournament.teamSelectionMode === 'draft_based' ? 'Player slots' : 'Team slots'}
        >
          {tournament.capacity != null ? `${tournament.capacity} spots` : 'No limit'}
        </DetailField>
      </div>

      <h3 className={styles.h3}>Location &amp; surface</h3>
      <div className={styles.detailsGrid}>
        <DetailField label="City">{tournament.locationCity}</DetailField>
        <DetailField label="State">{tournament.locationState}</DetailField>
        <DetailField label="Surface">{surfaceTypeName}</DetailField>
        {tournament.teamSelectionMode === 'prebuilt_rosters' && (
          <DetailField label="Max marquee players">
            {tournament.maxMarqueePlayers != null ? tournament.maxMarqueePlayers : null}
          </DetailField>
        )}
      </div>

      <h3 className={styles.h3}>Entry &amp; prizes</h3>
      <div className={styles.detailsGrid}>
        <DetailField label="Prize pool">
          {tournament.prizePoolAmount != null ? formatMoney(tournament.prizePoolAmount) : null}
        </DetailField>
      </div>
      {tournament.prizePoolDescription && (
        <div className={styles.field} style={{ marginTop: 16 }}>
          <span className={styles.label}>Prize pool details</span>
          <p className={styles.detailValue}>{tournament.prizePoolDescription}</p>
        </div>
      )}

      {(tournament.rules || tournament.rulesDocumentUrl) && (
        <>
          <h3 className={styles.h3}>Rules</h3>
          {tournament.rules && <p className={styles.detailValue}>{tournament.rules}</p>}
          {tournament.rulesDocumentUrl && (
            <a
              className={styles.btnLink}
              href={tournament.rulesDocumentUrl}
              target="_blank"
              rel="noreferrer"
            >
              View rules document
              <Icon name="arrow-right" size={14} />
            </a>
          )}
        </>
      )}

      <h3 className={styles.h3}>Age groups</h3>
      <div className={styles.ageGroupDetailList}>
        {tournament.ageGroups.map((ag) => {
          const birthWindow = birthWindowLabel(ag.bornAfter, ag.bornBefore);
          return (
            <div key={ag.id} className={styles.ageGroupDetailCard}>
              <span className={styles.rosterMiniRow}>
                {ag.name} · {TOURNAMENT_GENDER_CATEGORY_LABELS[ag.genderCategory]} · {ag.format}
              </span>
              <p className={styles.deck} style={{ margin: '6px 0 0' }}>
                Registration: {formatDate(ag.registrationStartDate)} –{' '}
                {formatDate(ag.registrationEndDate)}
                {birthWindow ? ` · ${birthWindow}` : ''}
                {' · '}
                {ag.entryFee != null ? `${formatMoney(ag.entryFee)} entry fee` : 'Free to register'}
                {ag.oversPerInnings != null ? ` · ${ag.oversPerInnings} overs` : ''}
              </p>
            </div>
          );
        })}
      </div>

      <p className={styles.statLine}>
        <b>{tournament.registeredCount}</b>{' '}
        {tournament.teamSelectionMode === 'draft_based' ? 'players' : 'teams'} registered
        {tournament.capacity != null ? ` of ${tournament.capacity} spots` : ' · no limit set'}
        {regSummary && regSummary.teams + regSummary.players > 0 && (
          <>
            {' · '}
            {regSummary.teams > 0 && `${regSummary.teams} team${regSummary.teams === 1 ? '' : 's'}`}
            {regSummary.teams > 0 && regSummary.players > 0 && ', '}
            {regSummary.players > 0 &&
              `${regSummary.players} individually registered player${regSummary.players === 1 ? '' : 's'}`}
            {', each registration counts as one spot'}
          </>
        )}
      </p>

      <div className={styles.actionsRow}>
        {isDraft && (
          <Link className={styles.btnPrimary} to={`/organizer/tournaments/${tournament.id}/edit`}>
            Edit tournament
          </Link>
        )}
        {tournament.status === 'draft' && (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={saving}
            onClick={() => transition('publish')}
          >
            Publish
          </button>
        )}
        {tournament.status === 'published' && (
          <button
            type="button"
            className={styles.btnGhost}
            disabled={saving}
            onClick={() => transition('close')}
          >
            Close registration
          </button>
        )}
        <button
          type="button"
          className={styles.btnGhost}
          disabled={saving}
          onClick={() => remove()}
        >
          Delete tournament
        </button>
        <Link className={styles.btnLink} to={`/tournaments/${tournament.id}`}>
          {isDraft ? 'Preview public page' : 'View public page'}
          <Icon name="arrow-right" size={14} />
        </Link>
      </div>

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </section>
  );
}
