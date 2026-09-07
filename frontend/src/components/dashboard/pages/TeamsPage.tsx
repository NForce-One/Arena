import type { PendingManagerInviteDto, TeamDto } from '@nforce/shared';
import { createTeamSchema } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm, type FieldErrors } from '../../../lib/forms';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import { TeamMonogram } from '../ui/TeamMonogram';
import styles from './TeamsPage.module.css';

function TeamTile({
  team,
  pendingCount,
  index,
}: {
  team: TeamDto;
  pendingCount: number;
  index: number;
}) {
  const stagger: CSSProperties = { animationDelay: `${60 + index * 40}ms` };
  return (
    <Link to={`/teams/${team.id}`} className={styles.teamTile} style={stagger}>
      <TeamMonogram name={team.name} size="lg" />
      <span className={styles.teamTileName}>{team.name}</span>
      <span className={styles.teamTileSub}>
        {team.roster.length} {team.roster.length === 1 ? 'player' : 'players'}
      </span>
      {}
      <span
        className={styles.teamTileBadge}
        style={pendingCount === 0 ? { visibility: 'hidden' } : undefined}
      >
        <Icon name="trophy" size={11} />
        <span>
          {pendingCount} pending {pendingCount === 1 ? 'invitation' : 'invitations'}
        </span>
      </span>
    </Link>
  );
}

export function DashboardTeamsPage() {
  const [teams, setTeams] = useState<TeamDto[] | null>(null);
  const [inviteCounts, setInviteCounts] = useState<Record<string, number>>({});
  const [pendingManagerInvites, setPendingManagerInvites] = useState<PendingManagerInviteDto[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const data = await api<{ teams: TeamDto[] }>('/api/teams/mine');
      setTeams(data.teams);
      const counts = await Promise.all(
        data.teams.map(async (t) => {
          try {
            const inv = await api<{ invitations: unknown[] }>(
              `/api/teams/${t.id}/tournament-invitations`,
            );
            return [t.id, inv.invitations.length] as const;
          } catch {
            return [t.id, 0] as const;
          }
        }),
      );
      setInviteCounts(Object.fromEntries(counts));
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
    try {
      const pending = await api<{ invites: PendingManagerInviteDto[] }>(
        '/api/teams/pending-manager-invites',
      );
      setPendingManagerInvites(pending.invites);
    } catch {
      setPendingManagerInvites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBanner(null);
    const parsed = validateForm(createTeamSchema, { name });
    if (!parsed.ok) {
      setFields(parsed.fields);
      return;
    }
    setFields({});
    setCreating(true);
    try {
      await api('/api/teams', { body: parsed.data });
      setName('');
      setShowCreate(false);
      await load();
    } catch (err) {
      const e = errorsFrom(err);
      setFields(e.fields);
      setBanner(e.banner);
    } finally {
      setCreating(false);
    }
  }

  const visible = useMemo(() => {
    const all = teams ?? [];
    if (!q) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.roster.some((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    );
  }, [teams, q]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="My teams">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>My teams</h2>
            <p className={styles.deck}>Create a team, then invite players to the squad.</p>
          </div>
        </header>

        {banner && (
          <p className={styles.bannerError} role="alert">
            {banner}
          </p>
        )}

        {teams === null && !banner && <p className={styles.deck}>Loading…</p>}

        {teams !== null && (
          <div key={q} className={styles.rows}>
            {}
            {!q &&
              (showCreate ? (
                <div className={styles.createTile}>
                  <input
                    className={styles.createInput}
                    placeholder="Team name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                  <div className={styles.createTileActions}>
                    <button
                      type="button"
                      className={styles.saveBtn}
                      onClick={() => void create()}
                      disabled={creating}
                    >
                      {creating ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={() => {
                        setShowCreate(false);
                        setFields({});
                      }}
                      disabled={creating}
                    >
                      Cancel
                    </button>
                  </div>
                  {fields.name && <p className={styles.fieldError}>{fields.name}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.addChildTile ?? ''} ${
                    pendingManagerInvites.length > 0 ? (styles.addChildTileInvited ?? '') : ''
                  }`}
                  onClick={() => setShowCreate(true)}
                >
                  <span className={styles.addChildIcon}>
                    <Icon name="plus" size={20} />
                  </span>
                  <span className={styles.addChildLabel}>Create team</span>
                  {pendingManagerInvites.length > 0 && (
                    <span className={styles.inviteNudge}>
                      <Icon name="bell" size={11} />
                      <span>
                        {pendingManagerInvites[0]!.organizerName} invited you
                        {pendingManagerInvites.length > 1
                          ? ` (+${pendingManagerInvites.length - 1} more)`
                          : ''}
                      </span>
                    </span>
                  )}
                </button>
              ))}
            {visible.map((t, i) => (
              <TeamTile key={t.id} team={t} pendingCount={inviteCounts[t.id] ?? 0} index={i} />
            ))}
          </div>
        )}

        {teams !== null && q && visible.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="users" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>No teams match "{query.trim()}"</h3>
            <p className={styles.emptyBody}>Try a different team, player or email.</p>
          </div>
        )}
      </section>
    </div>
  );
}
