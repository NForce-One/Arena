import type {
  ExternalInviteDto,
  OrganizerRegistrationsDto,
  PaymentStatusValue,
  PlayerSearchResultDto,
  SendExternalInviteResultDto,
  TeamRegistrationDetailDto,
  TeamSearchResultDto,
  TournamentAgeGroupDto,
  TournamentInvitationDto,
} from '@nforce/shared';
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router';
import { api } from '../../../lib/apiClient';
import {
  eligibilityOverrideReason,
  isWindowNotYetOpen,
  shouldOfferCapacityOverride,
  shouldOfferEligibilityOverride,
  shouldOfferWindowOverride,
} from '../../../lib/eligibility';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { PlayerContactProfileModal } from '../ui/PlayerContactProfileModal';
import type { OrganizerTournamentContext } from './OrganizerTournamentLayout';
import styles from './OrganizerTournamentPage.module.css';

function InlineBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
      {children}
    </div>
  );
}

function rosterStatusClass(status: string): string {
  return `${styles.rosterMiniStatus ?? ''} ${styles[status] ?? ''}`;
}

function EligibilityWarning() {
  return (
    <span className={styles.eligibilityWarn} title="Doesn't meet this age group's requirements">
      Doesn't meet requirements
    </span>
  );
}

function CapacityOverrideBadge() {
  return (
    <span
      className={styles.eligibilityWarn}
      title="Registered anyway even though the tournament was already full when this invite was sent"
    >
      Over capacity
    </span>
  );
}

const PAYMENT_TAG_CLASS: Record<PaymentStatusValue, string> = {
  unpaid: 'chip',
  partial: 'chip chip-warn',
  completed: 'chip chip-ok',
};

function PaymentCell({
  registrationId,
  userId,
  status,
  amountPaid,
  onSaved,
}: {
  registrationId: string;
  userId?: string;
  status: PaymentStatusValue;
  amountPaid: number | null;
  onSaved(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState<PaymentStatusValue>(status);
  const [amountDraft, setAmountDraft] = useState(amountPaid != null ? String(amountPaid) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setError(null);
    setStatusDraft(status);
    setAmountDraft(amountPaid != null ? String(amountPaid) : '');
    setEditing(true);
  }

  async function save() {
    const nextAmount = statusDraft === 'partial' ? Number(amountDraft) : null;
    setSaving(true);
    setError(null);
    try {
      const path = userId
        ? `/api/registrations/${registrationId}/payment/${userId}`
        : `/api/registrations/${registrationId}/team-payment`;
      await api(path, {
        method: 'PATCH',
        body: { status: statusDraft, amountPaid: nextAmount },
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={styles.paymentCell}>
        <div className={styles.paymentView}>
          <span className={`${PAYMENT_TAG_CLASS[status]} ${styles.paymentTag ?? ''}`}>
            {PAYMENT_STATUS_LABELS[status]}
            {status === 'partial' && amountPaid != null ? ` · ${amountPaid}` : ''}
          </span>
          <button
            type="button"
            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
            onClick={startEdit}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  const canSave =
    statusDraft !== 'partial' || (amountDraft.trim() !== '' && Number(amountDraft) > 0);

  return (
    <div className={styles.paymentCell}>
      <select
        className={styles.paymentSelect}
        value={statusDraft}
        disabled={saving}
        onChange={(e) => setStatusDraft(e.target.value as PaymentStatusValue)}
      >
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {statusDraft === 'partial' && (
        <input
          type="number"
          min={0}
          step="0.01"
          className={styles.paymentAmountInput}
          value={amountDraft}
          onChange={(e) => setAmountDraft(e.target.value)}
          placeholder="Amount paid"
          disabled={saving}
        />
      )}
      <div className={styles.paymentEditActions}>
        <button
          type="button"
          className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''}`}
          disabled={saving || !canSave}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
      {error && <p className={styles.paymentError}>{error}</p>}
    </div>
  );
}

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
}

type RegTab = 'teams' | 'players';

function TeamRegistrationCard({
  team,
  onRemoveRegistration,
  onRosterChanged,
  onViewProfile,
}: {
  team: TeamRegistrationDetailDto;
  onRemoveRegistration(registrationId: string, label: string): void;
  onRosterChanged(): void;
  onViewProfile(userId: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<PlayerSearchResultDto[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ userId: string; name: string } | null>(null);
  const acceptedCount = team.roster.filter((m) => m.status === 'accepted').length;

  async function searchToAdd(q: string) {
    setAddQuery(q);
    if (q.trim().length < 2) {
      setAddResults([]);
      return;
    }
    try {
      const data = await api<{ players: PlayerSearchResultDto[] }>(
        `/api/players/search?q=${encodeURIComponent(q)}`,
      );
      setAddResults(data.players);
    } catch {
      setAddResults([]);
    }
  }

  async function addMember(userId: string) {
    setAddError(null);
    try {
      await api(`/api/teams/${team.teamId}/roster`, { body: { userId, roleInTeam: 'player' } });
      setAddQuery('');
      setAddResults([]);
      onRosterChanged();
    } catch (err) {
      setAddError(errorsFrom(err).banner);
    }
  }

  async function confirmRemoveMember() {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    setRemoveError(null);
    try {
      await api(`/api/teams/${team.teamId}/roster/${target.userId}`, { method: 'DELETE' });
      onRosterChanged();
    } catch (err) {
      setRemoveError(errorsFrom(err).banner);
    }
  }

  return (
    <div className={styles.teamRegCard}>
      <button
        type="button"
        className={styles.teamRegHead}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className={styles.teamRegName}>{team.teamName}</span>
        {team.capacityOverridden && <CapacityOverrideBadge />}
        <span className={styles.teamRegMeta}>
          {acceptedCount} player{acceptedCount === 1 ? '' : 's'} registered · managed by{' '}
          {team.managerName}
          {team.managerAcademyName ? ` (${team.managerAcademyName})` : ''}
        </span>
        <span
          className={`${styles.status ?? ''} ${
            team.status === 'active' ? (styles.statusPublished ?? '') : (styles.statusClosed ?? '')
          }`}
        >
          {team.status}
        </span>
      </button>
      <div className={styles.teamPaymentRow}>
        <span className={styles.label}>Team payment</span>
        <PaymentCell
          registrationId={team.registrationId}
          status={team.teamPaymentStatus}
          amountPaid={team.teamPaymentAmountPaid}
          onSaved={onRosterChanged}
        />
      </div>
      {team.status === 'active' && (
        <div className={styles.teamRegActions}>
          <button
            type="button"
            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveRegistration(team.registrationId, team.teamName);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {expanded && (
        <>
          {removeError && <InlineBanner>{removeError}</InlineBanner>}
          {team.roster.length === 0 ? (
            <p className={styles.deck}>No roster members yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Requirements</th>
                  <th>Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {team.roster.map((m, i) => (
                  <tr key={m.userId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.searchRowName ?? ''} ${styles.linkBtn ?? ''}`}
                        onClick={() => onViewProfile(m.userId)}
                      >
                        {m.name}
                      </button>
                    </td>
                    <td>
                      <span className={rosterStatusClass(m.status)}>{m.status}</span>
                    </td>
                    <td>{m.eligible ? 'Complies' : <EligibilityWarning />}</td>
                    <td>
                      <PaymentCell
                        registrationId={team.registrationId}
                        userId={m.userId}
                        status={m.paymentStatus}
                        amountPaid={m.paymentAmountPaid}
                        onSaved={onRosterChanged}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
                        onClick={() => setRemoveTarget({ userId: m.userId, name: m.name })}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {addError && <InlineBanner>{addError}</InlineBanner>}
          <label className={styles.field}>
            <span className={styles.label}>Add a player to this roster</span>
            <input
              className={styles.input}
              placeholder="Search player by name…"
              value={addQuery}
              onChange={(e) => void searchToAdd(e.target.value)}
            />
          </label>
          {addResults.length > 0 && (
            <div className={styles.searchResults}>
              {addResults.map((p) => (
                <div className={styles.searchRow} key={p.id}>
                  <div>
                    <span className={styles.searchRowName}>{p.name}</span>
                    {p.managedByParentName && (
                      <span className={styles.searchRowMeta}>
                        Managed by {p.managedByParentName}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''}`}
                    onClick={() => void addMember(p.id)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove from roster?"
        message={
          removeTarget
            ? `Remove ${removeTarget.name} from ${team.teamName}'s roster? They'll need a fresh invitation to rejoin.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={() => void confirmRemoveMember()}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function ExternalInviteByEmail({
  role,
  email,
  onEmailChange,
  onSend,
  sending,
  canSend,
  error,
  result,
  invites,
  ageGroupId,
}: {
  role: 'player' | 'team_manager';
  email: string;
  onEmailChange(v: string): void;
  onSend(): void;
  sending: boolean;
  canSend: boolean;
  error: string | null;
  result: string | null;
  invites: ExternalInviteDto[];
  ageGroupId: string;
}) {
  const roleInvites = invites.filter(
    (inv) =>
      inv.role === role && (!inv.tournamentAgeGroupId || inv.tournamentAgeGroupId === ageGroupId),
  );
  const showEmailError = email.length > 0 && !email.includes('@');
  return (
    <>
      <h3 className={styles.h3}>Invite Someone New by Email</h3>
      <p className={styles.deck}>
        They don&apos;t need an account yet. We&apos;ll email them a link to sign up, and{' '}
        {role === 'player'
          ? 'their invitation will be waiting for them.'
          : "they'll get manager access. Once they create their first team, their invitation to this tournament will be waiting for them."}
      </p>
      {error && <InlineBanner>{error}</InlineBanner>}
      {result && <p className={styles.deck}>{result}</p>}
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Email address</span>
          <input
            type="email"
            className={styles.input}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value.trim())}
            aria-invalid={showEmailError}
          />
          {showEmailError && <p className={styles.fieldError}>Enter a valid email address.</p>}
        </label>
      </div>
      <button
        type="button"
        className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''} ${styles.sendInviteBtn ?? ''}`}
        disabled={sending || !canSend}
        onClick={onSend}
      >
        {sending ? 'Sending…' : 'Send Invite'}
      </button>

      {roleInvites.length > 0 && (
        <>
          <h3 className={styles.h3}>Invited by Email</h3>
          {roleInvites.map((inv) => (
            <div className={styles.invitationRow} key={inv.id}>
              <span className={styles.searchRowName}>{inv.email}</span>
              <span className={styles.searchRowMeta}>
                {inv.ageGroupLabel ? `${inv.ageGroupLabel} · ` : ''}
                {inv.status === 'fulfilled' ? 'Joined' : 'Pending'}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

export function DashboardOrganizerTournamentRegistrationsPage() {
  const { tournament } = useOutletContext<OrganizerTournamentContext>();

  if (tournament.status === 'draft') {
    return (
      <section className={styles.panel} aria-label="Registrations">
        <h2 className={styles.h2}>Registrations</h2>
        <p className={styles.deck}>Registrations open once this tournament is published.</p>
      </section>
    );
  }

  return (
    <RegistrationsContent
      tournamentId={tournament.id}
      ageGroups={tournament.ageGroups}
      isDraftBased={tournament.teamSelectionMode === 'draft_based'}
    />
  );
}

function RegistrationsContent({
  tournamentId,
  ageGroups,
  isDraftBased,
}: {
  tournamentId: string;
  ageGroups: TournamentAgeGroupDto[];
  isDraftBased: boolean;
}) {
  const [detail, setDetail] = useState<OrganizerRegistrationsDto | null>(null);
  const [tab, setTab] = useState<RegTab>(isDraftBased ? 'players' : 'teams');
  const [invitations, setInvitations] = useState<TournamentInvitationDto[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamSearchResultDto[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerSearchResultDto[]>([]);
  const [inviteAgeGroupId, setInviteAgeGroupId] = useState(() => ageGroups[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const [externalEmail, setExternalEmail] = useState('');
  const [externalInvites, setExternalInvites] = useState<ExternalInviteDto[]>([]);
  const [sendingExternal, setSendingExternal] = useState(false);
  const [externalResult, setExternalResult] = useState<string | null>(null);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [regs, invs, extInvs] = await Promise.all([
        api<{ registrations: OrganizerRegistrationsDto }>(
          `/api/tournaments/${tournamentId}/registrations/detail`,
        ),
        api<{ invitations: TournamentInvitationDto[] }>(
          `/api/tournaments/${tournamentId}/invitations`,
        ),
        api<{ invites: ExternalInviteDto[] }>(`/api/tournaments/${tournamentId}/external-invites`),
      ]);
      setDetail(regs.registrations);
      setInvitations(invs.invitations);
      setExternalInvites(extInvs.invites);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId]);

  async function sendExternalInvite(role: 'player' | 'team_manager') {
    setExternalError(null);
    setExternalResult(null);
    const email = externalEmail.trim();
    if (!email) return;
    setSendingExternal(true);
    try {
      const result = await api<SendExternalInviteResultDto>(
        `/api/tournaments/${tournamentId}/external-invites`,
        {
          body: { email, role, tournamentAgeGroupId: inviteAgeGroupId },
        },
      );
      setExternalEmail('');
      if (result.outcome === 'invited_by_email') {
        setExternalResult(`Invite sent to ${email}.`);
      } else if (result.outcome === 'invited_directly') {
        setExternalResult(`${result.name} already has an account, invited directly.`);
      } else {
        setExternalResult(`${result.name} already has an account, access granted.`);
      }
      await load();
    } catch (err) {
      setExternalError(errorsFrom(err).banner);
    } finally {
      setSendingExternal(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const data = await api<{ teams: TeamSearchResultDto[] }>(
        `/api/teams/search?q=${encodeURIComponent(q)}`,
      );
      setResults(data.teams);
    } catch {
      setResults([]);
    }
  }

  async function searchPlayers(q: string) {
    setPlayerQuery(q);
    if (q.trim().length < 2) {
      setPlayerResults([]);
      return;
    }
    try {
      const data = await api<{ players: PlayerSearchResultDto[] }>(
        `/api/players/search?q=${encodeURIComponent(q)}`,
      );
      setPlayerResults(data.players);
    } catch {
      setPlayerResults([]);
    }
  }

  async function invite(
    teamId: string,
    overrideRegistrationWindow = false,
    overrideEligibility = false,
    overrideCapacity = false,
  ) {
    if (!inviteAgeGroupId) return;
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/invite-team`, {
        body: {
          teamId,
          tournamentAgeGroupId: inviteAgeGroupId,
          overrideRegistrationWindow,
          overrideEligibility,
          overrideCapacity,
        },
      });
      setQuery('');
      setResults([]);
      await load();
    } catch (err) {
      if (!overrideRegistrationWindow && shouldOfferWindowOverride(err)) {
        setPendingConfirm({
          title: isWindowNotYetOpen(err)
            ? "Registration hasn't opened yet"
            : 'Registration window is closed',
          message: `${eligibilityOverrideReason(err)} The team's manager will still be able to accept. Invite anyway?`,
          confirmLabel: 'Invite anyway',
          onConfirm: () => void invite(teamId, true, overrideEligibility, overrideCapacity),
        });
        return;
      }
      if (!overrideEligibility && shouldOfferEligibilityOverride(err)) {
        setPendingConfirm({
          title: "This roster doesn't meet the requirements",
          message: `${eligibilityOverrideReason(err)} The team's manager will still be able to accept. Invite anyway?`,
          confirmLabel: 'Invite anyway',
          onConfirm: () => void invite(teamId, overrideRegistrationWindow, true, overrideCapacity),
        });
        return;
      }
      if (!overrideCapacity && shouldOfferCapacityOverride(err)) {
        setPendingConfirm({
          title: 'This tournament is already full',
          message:
            "This won't stop the invite. The team's manager will still be able to accept, going past the stated team slots. Invite anyway?",
          confirmLabel: 'Invite anyway',
          onConfirm: () =>
            void invite(teamId, overrideRegistrationWindow, overrideEligibility, true),
        });
        return;
      }
      setError(errorsFrom(err).banner);
    }
  }

  async function invitePlayer(
    userId: string,
    overrideEligibility = false,
    overrideRegistrationWindow = false,
    overrideCapacity = false,
  ) {
    if (!inviteAgeGroupId) return;
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/invite-player`, {
        body: {
          userId,
          tournamentAgeGroupId: inviteAgeGroupId,
          overrideEligibility,
          overrideRegistrationWindow,
          overrideCapacity,
        },
      });
      setPlayerQuery('');
      setPlayerResults([]);
      await load();
    } catch (err) {
      if (!overrideRegistrationWindow && shouldOfferWindowOverride(err)) {
        setPendingConfirm({
          title: isWindowNotYetOpen(err)
            ? "Registration hasn't opened yet"
            : 'Registration window is closed',
          message: `${eligibilityOverrideReason(err)} The player will still be able to accept. Invite anyway?`,
          confirmLabel: 'Invite anyway',
          onConfirm: () => void invitePlayer(userId, overrideEligibility, true, overrideCapacity),
        });
        return;
      }
      if (!overrideEligibility && shouldOfferEligibilityOverride(err)) {
        setPendingConfirm({
          title: "This doesn't meet the requirements",
          message: `${eligibilityOverrideReason(err)} Do you want to proceed anyway?`,
          confirmLabel: 'Proceed anyway',
          onConfirm: () =>
            void invitePlayer(userId, true, overrideRegistrationWindow, overrideCapacity),
        });
        return;
      }
      if (!overrideCapacity && shouldOfferCapacityOverride(err)) {
        setPendingConfirm({
          title: 'This tournament is already full',
          message:
            "This won't stop the invite. The player will still be able to accept, going past the stated player slots. Invite anyway?",
          confirmLabel: 'Invite anyway',
          onConfirm: () =>
            void invitePlayer(userId, overrideEligibility, overrideRegistrationWindow, true),
        });
        return;
      }
      setError(errorsFrom(err).banner);
    }
  }

  async function doRemove(registrationId: string) {
    setError(null);
    try {
      await api(`/api/registrations/${registrationId}/withdraw`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  function remove(registrationId: string, label: string) {
    setPendingConfirm({
      title: 'Remove from tournament?',
      message: `Remove ${label} from this tournament? They can register again later if needed.`,
      confirmLabel: 'Remove',
      onConfirm: () => void doRemove(registrationId),
    });
  }

  if (detail === null) return null;

  const visibleTeams = detail.teams.filter(
    (t) => t.tournamentAgeGroupId === inviteAgeGroupId && t.status === 'active',
  );
  const visiblePlayers = detail.players.filter((p) => p.tournamentAgeGroupId === inviteAgeGroupId);

  return (
    <section className={styles.panel} aria-label="Registrations">
      <h2 className={styles.h2}>Registrations</h2>
      {error && <InlineBanner>{error}</InlineBanner>}

      {!isDraftBased && (
        <div className={styles.subTabs} role="tablist" aria-label="Registration type">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'teams'}
            className={`${styles.subTab ?? ''} ${tab === 'teams' ? (styles.subTabActive ?? '') : ''}`}
            onClick={() => setTab('teams')}
          >
            Teams ({visibleTeams.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'players'}
            className={`${styles.subTab ?? ''} ${tab === 'players' ? (styles.subTabActive ?? '') : ''}`}
            onClick={() => setTab('players')}
          >
            Players ({visiblePlayers.length})
          </button>
        </div>
      )}

      {ageGroups.length > 1 && (
        <label className={styles.field}>
          <span className={styles.label}>Age group</span>
          <select
            className={styles.select}
            value={inviteAgeGroupId}
            onChange={(e) => setInviteAgeGroupId(e.target.value)}
          >
            {ageGroups.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {tab === 'teams' &&
        (visibleTeams.length === 0 ? (
          <p className={styles.deck}>No teams registered yet.</p>
        ) : (
          <div className={styles.teamRegList}>
            {visibleTeams.map((t) => (
              <TeamRegistrationCard
                key={t.registrationId}
                team={t}
                onRemoveRegistration={remove}
                onRosterChanged={load}
                onViewProfile={setViewingPlayerId}
              />
            ))}
          </div>
        ))}

      {tab === 'players' &&
        (visiblePlayers.length === 0 ? (
          <p className={styles.deck}>No individually registered players.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Requirements</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((p) => (
                <tr key={p.registrationId}>
                  <td>
                    <button
                      type="button"
                      className={`${styles.searchRowName ?? ''} ${styles.linkBtn ?? ''}`}
                      onClick={() => setViewingPlayerId(p.userId)}
                    >
                      {p.name}
                    </button>
                    {p.capacityOverridden && (
                      <>
                        {' '}
                        <CapacityOverrideBadge />
                      </>
                    )}
                  </td>
                  <td>{p.eligible ? 'Complies' : <EligibilityWarning />}</td>
                  <td>
                    <PaymentCell
                      registrationId={p.registrationId}
                      userId={p.userId}
                      status={p.paymentStatus}
                      amountPaid={p.paymentAmountPaid}
                      onSaved={load}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
                      onClick={() => remove(p.registrationId, p.name)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {tab === 'teams' && (
        <>
          <h3 className={styles.h3}>Invite a Team</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Search teams</span>
              <input
                className={styles.input}
                placeholder="Search team by name…"
                value={query}
                onChange={(e) => void search(e.target.value)}
              />
            </label>
          </div>
          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map((t) => (
                <div className={styles.searchRow} key={t.id}>
                  <div>
                    <span className={styles.searchRowName}>{t.name}</span>
                    <span className={styles.searchRowMeta}>managed by {t.managerName}</span>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''}`}
                    disabled={!inviteAgeGroupId}
                    onClick={() => void invite(t.id)}
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}

          <ExternalInviteByEmail
            role="team_manager"
            email={externalEmail}
            onEmailChange={setExternalEmail}
            onSend={() => void sendExternalInvite('team_manager')}
            sending={sendingExternal}
            canSend={!!externalEmail && externalEmail.includes('@') && !!inviteAgeGroupId}
            error={externalError}
            result={externalResult}
            invites={externalInvites}
            ageGroupId={inviteAgeGroupId}
          />
        </>
      )}

      {tab === 'players' && (
        <>
          <h3 className={styles.h3}>Invite a Player</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Search players</span>
              <input
                className={styles.input}
                placeholder="Search player by name…"
                value={playerQuery}
                onChange={(e) => void searchPlayers(e.target.value)}
              />
            </label>
          </div>
          {playerResults.length > 0 && (
            <div className={styles.searchResults}>
              {playerResults.map((p) => (
                <div className={styles.searchRow} key={p.id}>
                  <div>
                    <span className={styles.searchRowName}>{p.name}</span>
                    {p.managedByParentName && (
                      <span className={styles.searchRowMeta}>
                        Managed by {p.managedByParentName}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''}`}
                    disabled={!inviteAgeGroupId}
                    onClick={() => void invitePlayer(p.id)}
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}

          <ExternalInviteByEmail
            role="player"
            email={externalEmail}
            onEmailChange={setExternalEmail}
            onSend={() => void sendExternalInvite('player')}
            sending={sendingExternal}
            canSend={!!externalEmail && externalEmail.includes('@') && !!inviteAgeGroupId}
            error={externalError}
            result={externalResult}
            invites={externalInvites}
            ageGroupId={inviteAgeGroupId}
          />
        </>
      )}

      {(() => {
        const scopedInvitations = invitations.filter(
          (inv) =>
            (tab === 'teams' ? inv.entityType === 'team' : inv.entityType === 'player') &&
            inv.tournamentAgeGroupId === inviteAgeGroupId,
        );
        const latestByEntity = new Map<string, TournamentInvitationDto>();
        for (const inv of scopedInvitations) {
          const existing = latestByEntity.get(inv.entityId);
          if (!existing || inv.createdAt > existing.createdAt) {
            latestByEntity.set(inv.entityId, inv);
          }
        }
        const tabInvitations = [...latestByEntity.values()];
        if (tabInvitations.length === 0) return null;
        return (
          <>
            <h3 className={styles.h3}>Invitations Sent</h3>
            {tabInvitations.map((inv) => (
              <div className={styles.invitationRow} key={inv.id}>
                <span className={styles.searchRowName} title={inv.entityName}>
                  {inv.entityName}
                </span>
                <span className={styles.searchRowMeta}>{inv.ageGroupLabel}</span>
                <span
                  className={`${styles.status ?? ''} ${
                    inv.status === 'accepted'
                      ? (styles.statusPublished ?? '')
                      : inv.status === 'declined'
                        ? (styles.statusClosed ?? '')
                        : (styles.statusDraft ?? '')
                  }`}
                >
                  {inv.status}
                </span>
              </div>
            ))}
          </>
        );
      })()}

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
      <PlayerContactProfileModal
        tournamentId={viewingPlayerId ? tournamentId : null}
        userId={viewingPlayerId}
        onClose={() => setViewingPlayerId(null)}
      />
    </section>
  );
}
