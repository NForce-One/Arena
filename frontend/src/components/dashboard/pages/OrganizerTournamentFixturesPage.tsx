import type {
  FixtureDto,
  FixtureRostersDto,
  GroundSearchResultDto,
  ResultDto,
  TournamentAgeGroupDto,
  UmpireDirectoryEntryDto,
} from '@nforce/shared';
import { TOURNAMENT_GENDER_CATEGORY_LABELS } from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router';
import { DateTimeField } from '../../DateTimeField';
import { GroundPicker } from '../../GroundPicker';
import { api } from '../../../lib/apiClient';
import {
  formatSlot,
  todayISODate,
  wallClockLocalToISO,
  wallDay,
  wallTime,
} from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DraftTeamsPanel } from './DraftTeamsPanel';
import type { OrganizerTournamentContext } from './OrganizerTournamentLayout';
import {
  matchLengthOptions,
  toDateInput,
  toDateTimeLocalInput,
  validDateOrNull,
} from './organizerTournamentShared';
import styles from './OrganizerTournamentPage.module.css';

const GROUND_STATUS_LABEL: Record<string, string> = {
  requested: 'Invited',
  confirmed: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

const UMPIRE_STATUS_LABEL: Record<FixtureDto['umpires'][number]['status'], string> = {
  applied: 'Applied',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

function InlineBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
      {children}
    </div>
  );
}

function composeScore(runs: string, wickets: string, overs: string): string {
  const r = runs.trim();
  if (!r) return '';
  const w = wickets.trim();
  const base = w ? (w === '10' ? `${r} all out` : `${r}/${w}`) : r;
  const o = overs.trim();
  return o ? `${base} (${o} ov)` : base;
}

function parseScore(score: string): { runs: string; wickets: string; overs: string } {
  const oversMatch = score.match(/\(\s*([\d.]+)\s*ov\s*\)/i);
  const overs = oversMatch ? oversMatch[1]! : '';
  const rest = score.replace(/\(\s*[\d.]+\s*ov\s*\)/i, '').trim();
  const allOut = rest.match(/^(\d+)\s+all\s*out$/i);
  if (allOut) return { runs: allOut[1]!, wickets: '10', overs };
  const withWickets = rest.match(/^(\d+)\/(\d+)$/);
  if (withWickets) return { runs: withWickets[1]!, wickets: withWickets[2]!, overs };
  const runsOnly = rest.match(/^(\d+)$/);
  if (runsOnly) return { runs: runsOnly[1]!, wickets: '', overs };
  return { runs: '', wickets: '', overs: '' };
}

function TeamScoreEntry({
  label,
  runs,
  onRunsChange,
  wickets,
  onWicketsChange,
  overs,
  onOversChange,
}: {
  label: string;
  runs: string;
  onRunsChange(v: string): void;
  wickets: string;
  onWicketsChange(v: string): void;
  overs: string;
  onOversChange(v: string): void;
}) {
  return (
    <div className={styles.teamScoreEntry}>
      <span className={styles.label}>{label} score</span>
      <div className={styles.teamScoreRow}>
        <label className={styles.teamScoreField}>
          <span className={styles.teamScoreFieldLabel}>Runs</span>
          <input
            type="number"
            min={0}
            className={styles.input}
            value={runs}
            onChange={(e) => onRunsChange(e.target.value)}
          />
        </label>
        <label className={styles.teamScoreField}>
          <span className={styles.teamScoreFieldLabel}>Wickets</span>
          <input
            type="number"
            min={0}
            max={10}
            className={styles.input}
            value={wickets}
            onChange={(e) => onWicketsChange(e.target.value)}
          />
        </label>
        <label className={styles.teamScoreField}>
          <span className={styles.teamScoreFieldLabel}>Overs</span>
          <input
            type="number"
            min={0}
            step="0.1"
            className={styles.input}
            value={overs}
            onChange={(e) => onOversChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function PlayerScoreSide({
  label,
  players,
  individual,
  onToggle,
  runs,
  onRunsChange,
  wickets,
  onWicketsChange,
  total,
  onTotalChange,
}: {
  label: string;
  players: { userId: string; name: string }[] | null;
  individual: boolean;
  onToggle(v: boolean): void;
  runs: Record<string, string>;
  onRunsChange(userId: string, value: string): void;
  wickets: Record<string, string>;
  onWicketsChange(userId: string, value: string): void;
  total: string;
  onTotalChange(v: string): void;
}) {
  const sum = Object.values(runs).reduce((acc, v) => acc + (Number(v) || 0), 0);
  return (
    <div>
      <div className={styles.scoreToggleRow}>
        <label className={styles.scoreToggleLabel}>
          <input
            type="checkbox"
            checked={individual}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>Enter individual scores for {label}</span>
        </label>
      </div>
      {individual && (
        <div className={styles.playerScoresBlock}>
          {players === null ? (
            <p className={styles.deck}>Loading squad…</p>
          ) : players.length === 0 ? (
            <p className={styles.deck}>No accepted squad members for {label}.</p>
          ) : (
            <>
              <table className={`${styles.table} ${styles.playerScoreTable}`}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th className={styles.scoreCol}>Batting (runs)</th>
                    <th className={styles.scoreCol}>Bowling (wickets)</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.userId}>
                      <td className="num">{i + 1}</td>
                      <td>{p.name}</td>
                      <td className={styles.scoreCol}>
                        <input
                          type="number"
                          min={0}
                          className={styles.playerScoreInput}
                          value={runs[p.userId] ?? ''}
                          onChange={(e) => onRunsChange(p.userId, e.target.value)}
                        />
                      </td>
                      <td className={styles.scoreCol}>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          className={styles.playerScoreInput}
                          value={wickets[p.userId] ?? ''}
                          onChange={(e) => onWicketsChange(p.userId, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className={styles.field}>
                <span className={styles.label}>Total runs</span>
                <input
                  type="number"
                  min={0}
                  className={styles.input}
                  value={total}
                  onChange={(e) => onTotalChange(e.target.value)}
                />
              </label>
              <p className={styles.sumHint}>
                Sum of batting scores: {sum}. The total above follows this automatically until you
                edit it yourself (e.g. to add extras).
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FixtureCard({
  fixture,
  tournamentId,
  grounds,
  umpires,
  minDate,
  maxDate,
  onAssign,
  onInvite,
  onChanged,
}: {
  fixture: FixtureDto;
  tournamentId: string;
  grounds: GroundSearchResultDto[];
  umpires: UmpireDirectoryEntryDto[];
  minDate: string;
  maxDate: string;
  onAssign(fixtureId: string, umpireId: string): void;
  onInvite(fixtureId: string, umpireId: string): Promise<void>;
  onChanged(): void;
}) {
  const [editTeamsOpen, setEditTeamsOpen] = useState(false);
  const [homeRuns, setHomeRuns] = useState('');
  const [homeWickets, setHomeWickets] = useState('');
  const [homeOvers, setHomeOvers] = useState('');
  const [awayRuns, setAwayRuns] = useState('');
  const [awayWickets, setAwayWickets] = useState('');
  const [awayOvers, setAwayOvers] = useState('');
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [resultMeta, setResultMeta] = useState<{ enteredByName: string; enteredAt: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<{
    umpireId: string;
    umpireName: string;
  } | null>(null);
  const [confirmFutureResult, setConfirmFutureResult] = useState(false);

  const [rosters, setRosters] = useState<FixtureRostersDto | null>(null);
  const [homeIndividual, setHomeIndividual] = useState(false);
  const [awayIndividual, setAwayIndividual] = useState(false);
  const [homePlayerRuns, setHomePlayerRuns] = useState<Record<string, string>>({});
  const [awayPlayerRuns, setAwayPlayerRuns] = useState<Record<string, string>>({});
  const [homePlayerWickets, setHomePlayerWickets] = useState<Record<string, string>>({});
  const [awayPlayerWickets, setAwayPlayerWickets] = useState<Record<string, string>>({});
  const [homeRunsTotal, setHomeRunsTotal] = useState('');
  const [awayRunsTotal, setAwayRunsTotal] = useState('');
  const [homeTotalTouched, setHomeTotalTouched] = useState(false);
  const [awayTotalTouched, setAwayTotalTouched] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState(() => ({
    startsAt: toDateTimeLocalInput(fixture.startsAt),
    durationMinutes: String(fixture.durationMinutes),
    groundId: fixture.groundId ?? '',
  }));

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUmpireId, setInviteUmpireId] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const eligibleUmpires = umpires.filter(
    (u) =>
      !fixture.umpires.some(
        (fu) => fu.umpireId === u.id && fu.status !== 'declined' && fu.status !== 'withdrawn',
      ),
  );

  function openInvite() {
    setInviteUmpireId('');
    setInviteError(null);
    setInviteOpen(true);
  }

  async function sendInvite() {
    if (!inviteUmpireId) return;
    setInviteError(null);
    setInviteBusy(true);
    try {
      await onInvite(fixture.id, inviteUmpireId);
      setInviteOpen(false);
    } catch (err) {
      setInviteError(errorsFrom(err).banner);
    } finally {
      setInviteBusy(false);
    }
  }

  const rescheduleStart = validDateOrNull(reschedule.startsAt);
  const rescheduleMins = Number(reschedule.durationMinutes);
  const rescheduleEnd =
    rescheduleStart && rescheduleMins > 0
      ? new Date(rescheduleStart.getTime() + rescheduleMins * 60_000)
      : null;
  const rescheduleSlot =
    rescheduleStart && rescheduleEnd
      ? `${wallDay(rescheduleStart.toISOString())} ${wallTime(rescheduleStart.toISOString())}–${wallTime(rescheduleEnd.toISOString())}`
      : null;

  function openReschedule() {
    setReschedule({
      startsAt: toDateTimeLocalInput(fixture.startsAt),
      durationMinutes: String(fixture.durationMinutes),
      groundId: fixture.groundId ?? '',
    });
    setRescheduleError(null);
    setRescheduleOpen(true);
  }

  async function saveReschedule() {
    setRescheduleError(null);
    try {
      await api(`/api/fixtures/${fixture.id}`, {
        method: 'PATCH',
        body: {
          startsAt: wallClockLocalToISO(reschedule.startsAt),
          durationMinutes: Number(reschedule.durationMinutes),
          groundId: reschedule.groundId || null,
        },
      });
      setRescheduleOpen(false);
      onChanged();
    } catch (err) {
      setRescheduleError(errorsFrom(err).banner);
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await api<{ result: ResultDto | null }>(`/api/fixtures/${fixture.id}/result`);
      if (data.result) {
        const home = parseScore(data.result.homeScore);
        setHomeRuns(home.runs);
        setHomeWickets(home.wickets);
        setHomeOvers(home.overs);
        const away = parseScore(data.result.awayScore);
        setAwayRuns(away.runs);
        setAwayWickets(away.wickets);
        setAwayOvers(away.overs);
        setWinnerTeamId(data.result.winnerTeamId ?? '');
        setResultMeta({
          enteredByName: data.result.enteredByName,
          enteredAt: data.result.enteredAt,
        });
        if (data.result.homePlayerScores.length > 0) {
          setHomeIndividual(true);
          setHomePlayerRuns(
            Object.fromEntries(data.result.homePlayerScores.map((p) => [p.userId, String(p.runs)])),
          );
          setHomePlayerWickets(
            Object.fromEntries(
              data.result.homePlayerScores.map((p) => [p.userId, String(p.wickets)]),
            ),
          );
        }
        if (data.result.awayPlayerScores.length > 0) {
          setAwayIndividual(true);
          setAwayPlayerRuns(
            Object.fromEntries(data.result.awayPlayerScores.map((p) => [p.userId, String(p.runs)])),
          );
          setAwayPlayerWickets(
            Object.fromEntries(
              data.result.awayPlayerScores.map((p) => [p.userId, String(p.wickets)]),
            ),
          );
        }
        if (data.result.homeRunsTotal != null) {
          setHomeRunsTotal(String(data.result.homeRunsTotal));
          setHomeTotalTouched(true);
        }
        if (data.result.awayRunsTotal != null) {
          setAwayRunsTotal(String(data.result.awayRunsTotal));
          setAwayTotalTouched(true);
        }
      }
    } catch {
    }
  }, [fixture.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || rosters) return;
    void api<{ rosters: FixtureRostersDto }>(`/api/fixtures/${fixture.id}/rosters`)
      .then((data) => setRosters(data.rosters))
      .catch(() => {
      });
  }, [open, rosters, fixture.id]);

  function playerScoresPayload(
    individual: boolean,
    runs: Record<string, string>,
    wickets: Record<string, string>,
    total: string,
  ): {
    scores: { userId: string; runs: number; wickets: number }[];
    total: number | undefined;
  } | null {
    if (!individual) return null;
    const userIds = new Set([...Object.keys(runs), ...Object.keys(wickets)]);
    const scores = [...userIds]
      .filter(
        (userId) => (runs[userId] ?? '').trim() !== '' || (wickets[userId] ?? '').trim() !== '',
      )
      .map((userId) => ({
        userId,
        runs: Number(runs[userId] || '0') || 0,
        wickets: Number(wickets[userId] || '0') || 0,
      }));
    return { scores, total: total.trim() === '' ? undefined : Number(total) };
  }

  async function save() {
    setError(null);
    try {
      const home = playerScoresPayload(
        homeIndividual,
        homePlayerRuns,
        homePlayerWickets,
        homeRunsTotal,
      );
      const away = playerScoresPayload(
        awayIndividual,
        awayPlayerRuns,
        awayPlayerWickets,
        awayRunsTotal,
      );
      const data = await api<{ result: ResultDto }>(`/api/fixtures/${fixture.id}/result`, {
        method: 'PUT',
        body: {
          homeScore: composeScore(homeRuns, homeWickets, homeOvers),
          awayScore: composeScore(awayRuns, awayWickets, awayOvers),
          winnerTeamId: winnerTeamId || null,
          ...(home ? { homePlayerScores: home.scores, homeRunsTotal: home.total } : {}),
          ...(away ? { awayPlayerScores: away.scores, awayRunsTotal: away.total } : {}),
        },
      });
      setResultMeta({
        enteredByName: data.result.enteredByName,
        enteredAt: data.result.enteredAt,
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  function handleHomeRunsChange(userId: string, value: string) {
    setHomePlayerRuns((prev) => {
      const next = { ...prev, [userId]: value };
      if (!homeTotalTouched) {
        setHomeRunsTotal(String(Object.values(next).reduce((acc, v) => acc + (Number(v) || 0), 0)));
      }
      return next;
    });
  }

  function handleAwayRunsChange(userId: string, value: string) {
    setAwayPlayerRuns((prev) => {
      const next = { ...prev, [userId]: value };
      if (!awayTotalTouched) {
        setAwayRunsTotal(String(Object.values(next).reduce((acc, v) => acc + (Number(v) || 0), 0)));
      }
      return next;
    });
  }

  return (
    <div className={styles.fixtureCard}>
      <div className={styles.fixtureTop}>
        <div>
          <p className={styles.fixtureTeams}>
            {fixture.homeTeam}
            <span className={styles.vs}>vs</span>
            {fixture.awayTeam}
            {fixture.ageGroupLabel && (
              <span className={styles.ageGroupChip}>{fixture.ageGroupLabel}</span>
            )}
          </p>
          <p className={styles.fixtureMeta}>
            {formatSlot(fixture.startsAt)}
            {fixture.ground ? (
              <>
                {` · ${fixture.ground}`}
                {fixture.groundBookingStatus && GROUND_STATUS_LABEL[fixture.groundBookingStatus]
                  ? ` (${GROUND_STATUS_LABEL[fixture.groundBookingStatus]})`
                  : ''}
              </>
            ) : (
              <span className={styles.noGroundChip}>No ground assigned</span>
            )}
          </p>
          {fixture.umpires.length > 0 && (
            <p className={styles.umpireLine}>
              <span className={styles.umpireLabel}>Umpires:</span>
              {fixture.umpires.map((u) => (
                <span key={u.umpireId} className={styles.umpireEntry}>
                  {u.umpireName} ({UMPIRE_STATUS_LABEL[u.status]})
                  {u.status === 'applied' && (
                    <button
                      type="button"
                      className={`${styles.btnLink ?? ''} ${styles.btnSmall ?? ''}`}
                      onClick={() =>
                        setPendingAssign({ umpireId: u.umpireId, umpireName: u.umpireName })
                      }
                    >
                      Assign
                    </button>
                  )}
                </span>
              ))}
            </p>
          )}
          {resultMeta && (
            <p className={styles.resultWinner}>
              {winnerTeamId === fixture.homeTeamId
                ? `${fixture.homeTeam} won`
                : winnerTeamId === fixture.awayTeamId
                  ? `${fixture.awayTeam} won`
                  : 'Match drawn'}
            </p>
          )}
        </div>
        <div className={styles.fixtureActions}>
          <button
            type="button"
            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Cancel' : 'Result'}
          </button>
          <button
            type="button"
            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
            onClick={() => (rescheduleOpen ? setRescheduleOpen(false) : openReschedule())}
          >
            {rescheduleOpen ? 'Cancel' : 'Reschedule'}
          </button>
          <button
            type="button"
            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
            onClick={() => (inviteOpen ? setInviteOpen(false) : openInvite())}
          >
            {inviteOpen ? 'Cancel' : 'Invite umpire'}
          </button>
          {fixture.ageGroupId && (
            <button
              type="button"
              className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
              onClick={() => setEditTeamsOpen((o) => !o)}
            >
              {editTeamsOpen ? 'Cancel' : 'Edit teams'}
            </button>
          )}
        </div>
      </div>

      {error && <InlineBanner>{error}</InlineBanner>}
      {open && (
        <div className={styles.fixtureExpand}>
          <div className={styles.resultFormGrid}>
            <TeamScoreEntry
              label={fixture.homeTeam}
              runs={homeRuns}
              onRunsChange={setHomeRuns}
              wickets={homeWickets}
              onWicketsChange={setHomeWickets}
              overs={homeOvers}
              onOversChange={setHomeOvers}
            />
            <TeamScoreEntry
              label={fixture.awayTeam}
              runs={awayRuns}
              onRunsChange={setAwayRuns}
              wickets={awayWickets}
              onWicketsChange={setAwayWickets}
              overs={awayOvers}
              onOversChange={setAwayOvers}
            />
            <label className={styles.teamScoreEntry}>
              <span className={styles.label}>Winner</span>
              {}
              <span className={styles.teamScoreField}>
                <span className={styles.teamScoreFieldLabel} aria-hidden="true">
                  &nbsp;
                </span>
                <select
                  className={styles.select}
                  value={winnerTeamId}
                  onChange={(e) => setWinnerTeamId(e.target.value)}
                >
                  <option value="">Draw / no result</option>
                  <option value={fixture.homeTeamId}>{fixture.homeTeam} won</option>
                  <option value={fixture.awayTeamId}>{fixture.awayTeam} won</option>
                </select>
              </span>
            </label>
          </div>

          <PlayerScoreSide
            label={fixture.homeTeam}
            players={rosters?.home.players ?? null}
            individual={homeIndividual}
            onToggle={setHomeIndividual}
            runs={homePlayerRuns}
            onRunsChange={handleHomeRunsChange}
            wickets={homePlayerWickets}
            onWicketsChange={(userId, v) =>
              setHomePlayerWickets((prev) => ({ ...prev, [userId]: v }))
            }
            total={homeRunsTotal}
            onTotalChange={(v) => {
              setHomeTotalTouched(true);
              setHomeRunsTotal(v);
            }}
          />
          <PlayerScoreSide
            label={fixture.awayTeam}
            players={rosters?.away.players ?? null}
            individual={awayIndividual}
            onToggle={setAwayIndividual}
            runs={awayPlayerRuns}
            onRunsChange={handleAwayRunsChange}
            wickets={awayPlayerWickets}
            onWicketsChange={(userId, v) =>
              setAwayPlayerWickets((prev) => ({ ...prev, [userId]: v }))
            }
            total={awayRunsTotal}
            onTotalChange={(v) => {
              setAwayTotalTouched(true);
              setAwayRunsTotal(v);
            }}
          />

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                if (new Date(fixture.startsAt).getTime() > Date.now()) {
                  setConfirmFutureResult(true);
                } else {
                  void save();
                }
              }}
            >
              Save result
            </button>
          </div>
        </div>
      )}

      {rescheduleError && <InlineBanner>{rescheduleError}</InlineBanner>}
      {rescheduleOpen && (
        <div className={styles.fixtureExpand}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>New date &amp; time</span>
              <DateTimeField
                value={reschedule.startsAt}
                onChange={(v) => setReschedule((f) => ({ ...f, startsAt: v }))}
                minDate={minDate}
                maxDate={maxDate}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Match length</span>
              <select
                aria-label="Match length"
                className={styles.select}
                value={reschedule.durationMinutes}
                onChange={(e) => setReschedule((f) => ({ ...f, durationMinutes: e.target.value }))}
              >
                {matchLengthOptions(reschedule.durationMinutes).map((m) => (
                  <option key={m.minutes} value={String(m.minutes)}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.rescheduleNote}>
            New slot: {rescheduleSlot ? <b>{rescheduleSlot}</b> : 'pick a date and time'}. This
            opens a fresh booking request. Any previous confirmation for this match is cancelled,
            never silently reused.
          </p>
          <GroundPicker
            grounds={grounds}
            value={reschedule.groundId}
            onChange={(groundId) => setReschedule((f) => ({ ...f, groundId }))}
            startsAt={rescheduleStart}
            endsAt={rescheduleEnd}
          />
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void saveReschedule()}
            >
              Save new time
            </button>
          </div>
        </div>
      )}

      {inviteError && <InlineBanner>{inviteError}</InlineBanner>}
      {inviteOpen && (
        <div className={styles.fixtureExpand}>
          {eligibleUmpires.length === 0 ? (
            <p className={styles.deck}>
              No other umpires are registered on the platform to invite.
            </p>
          ) : (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Umpire</span>
                <select
                  aria-label="Umpire to invite"
                  className={styles.select}
                  value={inviteUmpireId}
                  onChange={(e) => setInviteUmpireId(e.target.value)}
                >
                  <option value="">Choose an umpire…</option>
                  {eligibleUmpires.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}){u.verified ? '' : ' · unverified'}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!inviteUmpireId || inviteBusy}
                  onClick={() => void sendInvite()}
                >
                  {inviteBusy ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {editTeamsOpen && fixture.ageGroupId && (
        <div className={styles.fixtureExpand}>
          <p className={styles.deck}>
            These two teams are shared by every match in this tournament. Moving a player here also
            changes their side in any other scheduled match between the same two teams.
          </p>
          <DraftTeamsPanel
            tournamentId={tournamentId}
            ageGroupId={fixture.ageGroupId}
            onTeamsLoaded={() => {}}
          />
        </div>
      )}
      <ConfirmDialog
        open={pendingAssign !== null}
        title="Assign this umpire?"
        message={
          pendingAssign
            ? `Assign ${pendingAssign.umpireName} to this fixture? Any other applicants won't be assigned.`
            : ''
        }
        confirmLabel="Assign"
        onConfirm={() => {
          if (pendingAssign) onAssign(fixture.id, pendingAssign.umpireId);
          setPendingAssign(null);
        }}
        onCancel={() => setPendingAssign(null)}
      />
      <ConfirmDialog
        open={confirmFutureResult}
        title="This match hasn't happened yet"
        message={`${formatSlot(fixture.startsAt)} is still in the future. Enter a result for it anyway?`}
        confirmLabel="Enter result anyway"
        onConfirm={() => {
          setConfirmFutureResult(false);
          void save();
        }}
        onCancel={() => setConfirmFutureResult(false)}
      />
    </div>
  );
}

export function DashboardOrganizerTournamentFixturesPage() {
  const { tournament } = useOutletContext<OrganizerTournamentContext>();

  if (tournament.status === 'draft') {
    return (
      <section className={styles.panel} aria-label="Fixtures">
        <h2 className={styles.h2}>Fixtures</h2>
        <p className={styles.deck}>Fixtures open once this tournament is published.</p>
      </section>
    );
  }

  return (
    <FixturesContent
      tournamentId={tournament.id}
      startDate={tournament.startDate}
      endDate={tournament.endDate}
      ageGroups={tournament.ageGroups}
    />
  );
}

function FixturesContent({
  tournamentId,
  startDate,
  endDate,
  ageGroups,
}: {
  tournamentId: string;
  startDate: string;
  endDate: string;
  ageGroups: TournamentAgeGroupDto[];
}) {
  const [fixtures, setFixtures] = useState<FixtureDto[] | null>(null);
  const [grounds, setGrounds] = useState<GroundSearchResultDto[]>([]);
  const [umpires, setUmpires] = useState<UmpireDirectoryEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterAgeGroupId, setFilterAgeGroupId] = useState('');

  const load = useCallback(async () => {
    try {
      const [fx, gr, um] = await Promise.all([
        api<{ fixtures: FixtureDto[] }>(`/api/tournaments/${tournamentId}/fixtures`),
        api<{ grounds: GroundSearchResultDto[] }>('/api/grounds/search?q='),
        api<{ umpires: UmpireDirectoryEntryDto[] }>('/api/fixtures/umpire-directory'),
      ]);
      setFixtures(fx.fixtures);
      setGrounds(gr.grounds);
      setUmpires(um.umpires);
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const windowStart = toDateInput(startDate);
  const windowEnd = toDateInput(endDate);
  const today = todayISODate();
  const minPickable = windowStart > today ? windowStart : today;

  async function assign(fixtureId: string, umpireId: string) {
    setError(null);
    try {
      await api(`/api/fixtures/${fixtureId}/assign`, { body: { umpireId } });
      await load();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  async function invite(fixtureId: string, umpireId: string) {
    await api(`/api/fixtures/${fixtureId}/invite-umpire`, { body: { umpireId } });
    await load();
  }

  if (fixtures === null) return null;

  const visibleFixtures = filterAgeGroupId
    ? fixtures.filter((f) => f.ageGroupId === filterAgeGroupId)
    : fixtures;

  return (
    <section className={styles.panel} aria-label="Fixtures">
      <h2 className={styles.h2}>Fixtures</h2>
      {error && <InlineBanner>{error}</InlineBanner>}
      {ageGroups.length > 1 && (
        <label className={styles.field}>
          <span className={styles.label}>Age group</span>
          <select
            className={styles.select}
            value={filterAgeGroupId}
            onChange={(e) => setFilterAgeGroupId(e.target.value)}
          >
            <option value="">All age groups</option>
            {ageGroups.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name} · {TOURNAMENT_GENDER_CATEGORY_LABELS[ag.genderCategory]}
              </option>
            ))}
          </select>
        </label>
      )}
      {fixtures.length === 0 && <p className={styles.deck}>No matches scheduled yet.</p>}
      {fixtures.length > 0 && visibleFixtures.length === 0 && (
        <p className={styles.deck}>No matches scheduled for this age group yet.</p>
      )}
      {visibleFixtures.length > 0 && (
        <div className={styles.fixtureList}>
          {visibleFixtures.map((f) => (
            <FixtureCard
              key={f.id}
              fixture={f}
              tournamentId={tournamentId}
              grounds={grounds}
              umpires={umpires}
              minDate={minPickable}
              maxDate={windowEnd}
              onAssign={assign}
              onInvite={invite}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}
    </section>
  );
}
