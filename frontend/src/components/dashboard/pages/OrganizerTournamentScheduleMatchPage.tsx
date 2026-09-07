import type {
  GroundSearchResultDto,
  RegistrationDto,
  TeamDto,
  TournamentAgeGroupDto,
  UmpireDirectoryEntryDto,
} from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router';
import { DateTimeField } from '../../DateTimeField';
import { GroundPicker } from '../../GroundPicker';
import { api } from '../../../lib/apiClient';
import { todayISODate, wallClockLocalToISO, wallDay, wallTime } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { Icon } from '../ui/Icon';
import { DraftTeamsPanel } from './DraftTeamsPanel';
import type { OrganizerTournamentContext } from './OrganizerTournamentLayout';
import {
  MATCH_LENGTHS,
  formatDay,
  toDateInput,
  validDateOrNull,
} from './organizerTournamentShared';
import styles from './OrganizerTournamentPage.module.css';

function InlineBanner({
  kind,
  children,
}: {
  kind: 'error' | 'info' | 'success';
  children: ReactNode;
}) {
  const kindClass =
    kind === 'error'
      ? (styles.bannerError ?? '')
      : kind === 'success'
        ? (styles.bannerSuccess ?? '')
        : (styles.bannerInfo ?? '');
  return (
    <div
      className={`${styles.banner ?? ''} ${kindClass}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function DashboardOrganizerTournamentScheduleMatchPage() {
  const { tournament } = useOutletContext<OrganizerTournamentContext>();

  if (tournament.status === 'draft') {
    return (
      <section className={styles.panel} aria-label="Schedule a match">
        <h2 className={styles.h2}>Schedule a Match</h2>
        <p className={styles.deck}>Match scheduling opens once this tournament is published.</p>
      </section>
    );
  }

  return (
    <ScheduleMatchContent
      tournamentId={tournament.id}
      startDate={tournament.startDate}
      endDate={tournament.endDate}
      isDraftBased={tournament.teamSelectionMode === 'draft_based'}
      ageGroups={tournament.ageGroups}
    />
  );
}

function ScheduleMatchContent({
  tournamentId,
  startDate,
  endDate,
  isDraftBased,
  ageGroups,
}: {
  tournamentId: string;
  startDate: string;
  endDate: string;
  isDraftBased: boolean;
  ageGroups: TournamentAgeGroupDto[];
}) {
  const [teams, setTeams] = useState<RegistrationDto[]>([]);
  const [ageGroupId, setAgeGroupId] = useState(() => ageGroups[0]?.id ?? '');
  const [draftTeams, setDraftTeams] = useState<TeamDto[]>([]);
  const [grounds, setGrounds] = useState<GroundSearchResultDto[]>([]);
  const [umpires, setUmpires] = useState<UmpireDirectoryEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    homeTeamId: '',
    awayTeamId: '',
    groundId: '',
    startsAt: '',
    durationMinutes: '210',
  });
  const [invitedUmpireIds, setInvitedUmpireIds] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [regs, gr, um] = await Promise.all([
        api<{ registrations: RegistrationDto[] }>(`/api/tournaments/${tournamentId}/registrations`),
        api<{ grounds: GroundSearchResultDto[] }>('/api/grounds/search?q='),
        api<{ umpires: UmpireDirectoryEntryDto[] }>('/api/fixtures/umpire-directory'),
      ]);
      setTeams(regs.registrations.filter((r) => r.entityType === 'team' && r.status === 'active'));
      setGrounds(gr.grounds);
      setUmpires(um.umpires);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function schedule() {
    setError(null);
    setScheduled(false);
    try {
      await api(`/api/tournaments/${tournamentId}/fixtures`, {
        body: {
          homeTeamId: form.homeTeamId,
          awayTeamId: form.awayTeamId,
          groundId: form.groundId || null,
          startsAt: wallClockLocalToISO(form.startsAt),
          durationMinutes: Number(form.durationMinutes),
          umpireEmails: invitedUmpireIds
            .map((id) => umpires.find((u) => u.id === id)?.email)
            .filter((e): e is string => Boolean(e)),
        },
      });
      setForm((f) => ({ ...f, startsAt: '' }));
      setInvitedUmpireIds([]);
      setScheduled(true);
      window.setTimeout(() => setScheduled(false), 4000);
    } catch (err) {
      const { banner, fields } = errorsFrom(err);
      setError(banner ?? Object.values(fields)[0] ?? 'Could not schedule the match.');
    }
  }

  const selectedGround = grounds.find((g) => g.id === form.groundId) ?? null;
  const windowStart = toDateInput(startDate);
  const windowEnd = toDateInput(endDate);
  const today = todayISODate();
  const minPickable = windowStart > today ? windowStart : today;
  const slotStart = validDateOrNull(form.startsAt);
  const durationMins = Number(form.durationMinutes);
  const slotEnd =
    slotStart && durationMins > 0 ? new Date(slotStart.getTime() + durationMins * 60_000) : null;
  const requestedSlot = (() => {
    if (!slotStart || !slotEnd) return null;
    const crossesDay = slotStart.toISOString().slice(0, 10) !== slotEnd.toISOString().slice(0, 10);
    const s = slotStart.toISOString();
    const e = slotEnd.toISOString();
    return `${wallDay(s)} ${wallTime(s)}–${wallTime(e)}${crossesDay ? ' (next day)' : ''}`;
  })();

  const sideOptions = isDraftBased
    ? draftTeams.map((t) => ({ id: t.id, name: t.name }))
    : teams
        .filter((t) => ageGroups.length <= 1 || t.tournamentAgeGroupId === ageGroupId)
        .map((t) => ({ id: t.entityId, name: t.entityName }));

  return (
    <section className={styles.panel} aria-label="Schedule a match">
      <h2 className={styles.h2}>Schedule a Match</h2>
      {error && <InlineBanner kind="error">{error}</InlineBanner>}
      {ageGroups.length > 1 && (
        <label className={styles.field}>
          <span className={styles.label}>Age group</span>
          <select
            className={styles.select}
            value={ageGroupId}
            onChange={(e) => {
              setAgeGroupId(e.target.value);
              setForm((f) => ({ ...f, homeTeamId: '', awayTeamId: '' }));
            }}
          >
            {ageGroups.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isDraftBased && (
        <DraftTeamsPanel
          tournamentId={tournamentId}
          ageGroupId={ageGroupId}
          onTeamsLoaded={setDraftTeams}
        />
      )}
      {sideOptions.length < 2 ? (
        <InlineBanner kind="info">
          {isDraftBased ? (
            <span>
              <b>This tournament needs two teams before a match can be scheduled.</b> Use the panel
              above to draft players from this tournament's pool onto two teams.
            </span>
          ) : (
            <span>
              <b>
                {sideOptions.length === 0
                  ? 'No teams have registered yet.'
                  : 'Only one team has registered so far.'}
              </b>{' '}
              A match needs two registered teams. Use <i>Invite a team</i> on the{' '}
              <Link to={`/organizer/tournaments/${tournamentId}/registrations`}>Registrations</Link>{' '}
              page to invite one. It joins once its manager accepts. Team managers can also register
              themselves from the public tournament page.
            </span>
          )}
        </InlineBanner>
      ) : (
        <>
          <h4 className={styles.h4}>1. The two sides</h4>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Home team</span>
              <select
                aria-label="Home team"
                className={styles.select}
                value={form.homeTeamId}
                onChange={(e) => {
                  const homeTeamId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    homeTeamId,
                    awayTeamId: f.awayTeamId === homeTeamId ? '' : f.awayTeamId,
                  }));
                }}
              >
                <option value="">Home team…</option>
                {sideOptions
                  .filter((t) => t.id !== form.awayTeamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Away team</span>
              <select
                aria-label="Away team"
                className={styles.select}
                value={form.awayTeamId}
                onChange={(e) => {
                  const awayTeamId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    awayTeamId,
                    homeTeamId: f.homeTeamId === awayTeamId ? '' : f.homeTeamId,
                  }));
                }}
              >
                <option value="">Away team…</option>
                {sideOptions
                  .filter((t) => t.id !== form.homeTeamId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {}
          <h4 className={styles.h4}>2. Start time and match length</h4>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Start date &amp; time</span>
              <DateTimeField
                value={form.startsAt}
                onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))}
                minDate={minPickable}
                maxDate={windowEnd}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Match length</span>
              <select
                aria-label="Match length"
                className={styles.select}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              >
                {MATCH_LENGTHS.map((m) => (
                  <option key={m.minutes} value={String(m.minutes)}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.deck}>
            Must fall inside this tournament&apos;s window:{' '}
            <b>
              {formatDay(startDate)} – {formatDay(endDate)}
            </b>
            .
            {requestedSlot && (
              <>
                {' '}
                Runs <b>{requestedSlot}</b>.
              </>
            )}
          </p>

          <h4 className={styles.h4}>3. Ground (optional)</h4>
          <GroundPicker
            grounds={grounds}
            value={form.groundId}
            onChange={(groundId) => setForm((f) => ({ ...f, groundId }))}
            startsAt={slotStart}
            endsAt={slotEnd}
          />
          {selectedGround && (
            <p className={styles.deck}>
              A booking request will be sent to <b>{selectedGround.name}</b>&apos;s owner, who can
              confirm or decline it.
            </p>
          )}

          {}
          <h4 className={styles.h4}>4. Invite umpires (optional)</h4>
          {umpires.length === 0 ? (
            <p className={styles.deck}>No umpires are registered on the platform yet.</p>
          ) : (
            <>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Add an umpire</span>
                  <select
                    className={styles.select}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) setInvitedUmpireIds((prev) => [...new Set([...prev, id])]);
                    }}
                  >
                    <option value="">Add an umpire…</option>
                    {umpires
                      .filter((u) => !invitedUmpireIds.includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email}){u.verified ? '' : ' · unverified'}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {invitedUmpireIds.length === 0 ? (
                <p className={styles.deck}>No umpires invited. You can also assign one later.</p>
              ) : (
                <div className={styles.chipList}>
                  {invitedUmpireIds.map((id) => {
                    const u = umpires.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <span key={id} className={styles.chipRemovable}>
                        {u.name}
                        <button
                          type="button"
                          className={styles.chipRemoveBtn}
                          aria-label={`Remove ${u.name}`}
                          onClick={() =>
                            setInvitedUmpireIds((prev) => prev.filter((x) => x !== id))
                          }
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {scheduled && (
            <InlineBanner kind="success">
              <Icon name="shield-check" size={15} />
              <span>
                Match scheduled. View it on the{' '}
                <Link to={`/organizer/tournaments/${tournamentId}/fixtures`}>Fixtures</Link> tab.
              </span>
            </InlineBanner>
          )}
          <div className={styles.actionsRow}>
            <button type="button" className={styles.btnPrimary} onClick={() => void schedule()}>
              Schedule match
            </button>
          </div>
        </>
      )}
    </section>
  );
}
