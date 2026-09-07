import type {
  PlayerSearchResultDto,
  PublicTournamentSummaryDto,
  RecruitablePlayerDto,
  RosterMemberDto,
} from '@nforce/shared';
import { inviteRosterMemberSchema } from '@nforce/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import type { TeamOutletContext } from './TeamDetailLayout';
import styles from './TeamsPage.module.css';

function statusClass(status: RosterMemberDto['status']): string {
  if (status === 'accepted') return styles.statusAccepted ?? '';
  if (status === 'declined') return styles.statusDeclined ?? '';
  if (status === 'requested') return styles.statusRequested ?? '';
  return styles.statusInvited ?? '';
}

function RosterRow({
  member,
  onRemove,
  onRespond,
}: {
  member: RosterMemberDto;
  onRemove(): void;
  onRespond(decision: 'accept' | 'decline'): void;
}) {
  return (
    <div className={styles.rosterRow}>
      <div className={styles.rosterIdentity}>
        <Link to={`/players/${member.userId}`} className={styles.rosterName}>
          {member.name}
        </Link>
        <span
          className={styles.rosterEmail}
          title={member.isManagedChild ? `Managed by ${member.managedByParentName}` : member.email}
        >
          {member.isManagedChild ? `Managed by ${member.managedByParentName}` : member.email}
        </span>
      </div>
      <span className={styles.roleTag}>{member.roleInTeam}</span>
      <span className={`${styles.statusChip ?? ''} ${statusClass(member.status)}`}>
        {member.status}
      </span>
      {member.status === 'requested' ? (
        <div className={styles.rosterActions}>
          <button type="button" className={styles.acceptBtn} onClick={() => onRespond('accept')}>
            Accept
          </button>
          <button type="button" className={styles.declineBtn} onClick={() => onRespond('decline')}>
            Decline
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={onRemove}
          aria-label={`Remove ${member.name} from the squad`}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

function RecruitFromTournament({ onPick }: { onPick(player: RecruitablePlayerDto): void }) {
  const [tournaments, setTournaments] = useState<PublicTournamentSummaryDto[] | null>(null);
  const [tournamentId, setTournamentId] = useState('');
  const [players, setPlayers] = useState<RecruitablePlayerDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ tournaments: PublicTournamentSummaryDto[] }>('/api/public/tournaments').then(
      (data) => setTournaments(data.tournaments),
    );
  }, []);

  useEffect(() => {
    if (!tournamentId) {
      setPlayers(null);
      return;
    }
    let cancelled = false;
    setError(null);
    setPlayers(null);
    void api<{ players: RecruitablePlayerDto[] }>(
      `/api/tournaments/${tournamentId}/recruitable-players`,
    )
      .then((data) => {
        if (!cancelled) setPlayers(data.players);
      })
      .catch((err) => {
        if (!cancelled) setError(errorsFrom(err).banner);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  return (
    <div className={styles.recruitBlock}>
      <h4 className={styles.subHead}>
        <Icon name="search" size={14} />
        <span>Recruit from a tournament</span>
      </h4>
      <select
        className={styles.recruitSelect}
        value={tournamentId}
        onChange={(e) => setTournamentId(e.target.value)}
      >
        <option value="">Pick a tournament…</option>
        {(tournaments ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {error && (
        <p className={styles.bannerError} role="alert">
          {error}
        </p>
      )}

      {tournamentId &&
        !error &&
        (players === null ? (
          <p className={styles.emptySmall}>Loading…</p>
        ) : players.length === 0 ? (
          <p className={styles.emptySmall}>No players registered solo for this tournament yet.</p>
        ) : (
          <div className={styles.recruitList}>
            {players.map((p) => (
              <button
                key={p.userId}
                type="button"
                className={styles.recruitRow}
                onClick={() => onPick(p)}
              >
                <span className={styles.recruitName}>{p.name}</span>
                <span
                  className={styles.recruitEmail}
                  title={p.isManagedChild ? `Managed by ${p.managedByParentName}` : p.email}
                >
                  {p.isManagedChild ? `Managed by ${p.managedByParentName}` : p.email}
                </span>
                <span className={styles.recruitAdd}>
                  <Icon name="plus" size={13} />
                </span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

export function DashboardTeamSquadPage() {
  const { team, reload } = useOutletContext<TeamOutletContext>();

  const [nameQuery, setNameQuery] = useState('');
  const [nameResults, setNameResults] = useState<PlayerSearchResultDto[]>([]);
  const [pickedPlayer, setPickedPlayer] = useState<{ userId: string; label: string } | null>(null);
  const [roleInTeam, setRoleInTeam] = useState<'captain' | 'player'>('player');
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const inviteSearchRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (nameResults.length === 0) return;
    function onPointerDown(e: MouseEvent) {
      if (inviteSearchRef.current && !inviteSearchRef.current.contains(e.target as Node)) {
        setNameResults([]);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [nameResults.length]);

  async function searchToInvite(q: string) {
    setNameQuery(q);
    setPickedPlayer(null);
    setError(null);
    const seq = ++searchSeq.current;
    if (q.trim().length < 2) {
      setNameResults([]);
      return;
    }
    try {
      const data = await api<{ players: PlayerSearchResultDto[] }>(
        `/api/players/search?q=${encodeURIComponent(q)}`,
      );
      if (seq !== searchSeq.current) return;
      setNameResults(data.players);
    } catch {
      if (seq === searchSeq.current) setNameResults([]);
    }
  }

  function pickPlayer(userId: string, label: string) {
    searchSeq.current++;
    setPickedPlayer({ userId, label });
    setNameQuery(label);
    setNameResults([]);
    setError(null);
  }

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm(): void;
  } | null>(null);

  async function invite() {
    setError(null);
    if (!pickedPlayer) return;
    const parsed = validateForm(inviteRosterMemberSchema, {
      userId: pickedPlayer.userId,
      roleInTeam,
    });
    if (!parsed.ok) {
      setError(Object.values(parsed.fields)[0] ?? 'Invalid input');
      return;
    }
    setInviting(true);
    try {
      await api(`/api/teams/${team.id}/roster`, { body: parsed.data });
      setNameQuery('');
      setPickedPlayer(null);
      await reload();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setInviting(false);
    }
  }

  async function doRemove(userId: string) {
    setError(null);
    try {
      await api(`/api/teams/${team.id}/roster/${userId}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  function remove(userId: string, name: string) {
    setPendingConfirm({
      title: 'Remove from squad?',
      message: `Remove ${name} from ${team.name}? They'll need a fresh invitation to rejoin.`,
      confirmLabel: 'Remove',
      onConfirm: () => void doRemove(userId),
    });
  }

  async function doRespond(userId: string, decision: 'accept' | 'decline') {
    setError(null);
    try {
      await api(`/api/teams/${team.id}/roster/${userId}/respond`, { body: { decision } });
      await reload();
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }

  function respond(userId: string, decision: 'accept' | 'decline', name: string) {
    if (decision === 'accept') {
      void doRespond(userId, decision);
      return;
    }
    setPendingConfirm({
      title: 'Decline this request?',
      message: `Decline ${name}'s request to join ${team.name}? They can request again later.`,
      confirmLabel: 'Decline',
      onConfirm: () => void doRespond(userId, decision),
    });
  }

  return (
    <>
      <div className={styles.rosterSection}>
        <h4 className={styles.subHead}>
          <Icon name="users" size={14} />
          <span>Squad</span>
        </h4>
        {team.roster.length === 0 ? (
          <p className={styles.emptySmall}>No squad members yet.</p>
        ) : (
          <div className={styles.rosterList}>
            {team.roster.map((r) => (
              <RosterRow
                key={r.userId}
                member={r}
                onRemove={() => remove(r.userId, r.name)}
                onRespond={(decision) => respond(r.userId, decision, r.name)}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className={styles.bannerError} role="alert">
          {error}
        </p>
      )}

      <RecruitFromTournament
        onPick={(p) => {
          pickPlayer(
            p.userId,
            p.isManagedChild ? `${p.name} (managed by ${p.managedByParentName})` : p.name,
          );
        }}
      />

      <div className={styles.inviteRow}>
        <div className={styles.inviteSearch} ref={inviteSearchRef}>
          <input
            className={styles.inviteInput}
            placeholder="Search player by name…"
            value={nameQuery}
            readOnly={!!pickedPlayer}
            onChange={(e) => void searchToInvite(e.target.value)}
          />
          {pickedPlayer && (
            <button
              type="button"
              className={styles.inviteClear}
              aria-label="Clear picked player"
              onClick={() => {
                setPickedPlayer(null);
                setNameQuery('');
                setNameResults([]);
              }}
            >
              <Icon name="x" size={13} />
            </button>
          )}
          {nameResults.length > 0 && (
            <div className={styles.recruitList}>
              {nameResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.recruitRow}
                  onClick={() => pickPlayer(p.id, p.name)}
                >
                  <span className={styles.recruitName}>{p.name}</span>
                  {p.managedByParentName && (
                    <span
                      className={styles.recruitEmail}
                      title={`Managed by ${p.managedByParentName}`}
                    >
                      Managed by {p.managedByParentName}
                    </span>
                  )}
                  <span className={styles.recruitAdd}>
                    <Icon name="plus" size={13} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          className={styles.inviteSelect}
          value={roleInTeam}
          onChange={(e) => setRoleInTeam(e.target.value as 'captain' | 'player')}
        >
          <option value="player">Player</option>
          <option value="captain">Captain</option>
        </select>
        <button
          type="button"
          className={styles.inviteBtn}
          onClick={() => void invite()}
          disabled={inviting || !pickedPlayer}
        >
          <Icon name="plus" size={14} />
          <span>{inviting ? 'Inviting…' : 'Invite to squad'}</span>
        </button>
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
    </>
  );
}
