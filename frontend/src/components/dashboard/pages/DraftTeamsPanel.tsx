import type {
  OrganizerRegistrationsDto,
  PlayerRegistrationDetailDto,
  TeamDto,
} from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
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

export function DraftTeamsPanel({
  tournamentId,
  ageGroupId,
  onTeamsLoaded,
}: {
  tournamentId: string;
  ageGroupId: string;
  onTeamsLoaded(teams: TeamDto[]): void;
}) {
  const [draftTeams, setDraftTeams] = useState<TeamDto[] | null>(null);
  const [pool, setPool] = useState<PlayerRegistrationDetailDto[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function flashSaved(message: string) {
    setSaved(message);
    window.setTimeout(() => setSaved(null), 2500);
  }

  const load = useCallback(async () => {
    if (!ageGroupId) return;
    try {
      const [dt, regs] = await Promise.all([
        api<{ teams: TeamDto[] }>(
          `/api/tournaments/${tournamentId}/draft-teams?tournamentAgeGroupId=${ageGroupId}`,
        ),
        api<{ registrations: OrganizerRegistrationsDto }>(
          `/api/tournaments/${tournamentId}/registrations/detail`,
        ),
      ]);
      setDraftTeams(dt.teams);
      onTeamsLoaded(dt.teams);
      setPool(regs.registrations.players.filter((p) => p.tournamentAgeGroupId === ageGroupId));
    } catch (err) {
      setError(errorsFrom(err).banner);
    }
  }, [tournamentId, ageGroupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTeam() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/draft-teams`, {
        body: { tournamentAgeGroupId: ageGroupId, name: newName.trim() },
      });
      setNewName('');
      await load();
      flashSaved('Team created.');
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setCreating(false);
    }
  }

  async function moveTo(teamId: string, userId: string) {
    setMoving(userId);
    setError(null);
    try {
      await api(`/api/teams/${teamId}/draft-roster`, { body: { userId } });
      await load();
      flashSaved('Saved, lineup updated.');
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setMoving(null);
    }
  }

  async function sendToPool(teamId: string, userId: string) {
    setMoving(userId);
    setError(null);
    try {
      await api(`/api/teams/${teamId}/roster/${userId}`, { method: 'DELETE' });
      await load();
      flashSaved('Saved, lineup updated.');
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setMoving(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    await load();
    setRefreshing(false);
  }

  const draftedUserIds = new Set((draftTeams ?? []).flatMap((t) => t.roster.map((r) => r.userId)));
  const undrafted = pool.filter((p) => !draftedUserIds.has(p.userId));

  return (
    <div className={styles.draftTeamsPanel}>
      <div className={styles.draftTeamsPanelHead}>
        <h4 className={styles.h4}>Split the drafted pool into two teams</h4>
        <button
          type="button"
          className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? 'Refreshing…' : 'Refresh pool'}
        </button>
      </div>
      {saved && <InlineBanner kind="success">{saved}</InlineBanner>}
      {error && <InlineBanner kind="error">{error}</InlineBanner>}
      {draftTeams === null ? (
        <p className={styles.deck}>Loading…</p>
      ) : (
        <>
          {draftTeams.length < 2 ? (
            <InlineBanner kind="info">
              {draftTeams.length === 0 ? (
                <>
                  Create two teams below, then click a player to move them onto one. No invitations
                  needed, everyone here has already registered for this tournament.
                </>
              ) : (
                <>Create one more team below, then start moving players onto it.</>
              )}
            </InlineBanner>
          ) : (
            pool.length === 0 && (
              <InlineBanner kind="info">
                No players have registered for this tournament yet.
              </InlineBanner>
            )
          )}

          <div className={styles.draftTeamColumns}>
            <div className={styles.draftTeamColumn}>
              <h5 className={styles.draftTeamColumnHead}>Unassigned pool ({undrafted.length})</h5>
              {undrafted.length === 0 ? (
                <p className={styles.emptySmall}>Nobody left to draft.</p>
              ) : (
                <ul className={styles.draftPlayerList}>
                  {undrafted.map((p) => (
                    <li key={p.userId} className={styles.draftPlayerRow}>
                      <span className={styles.draftPlayerName}>{p.name}</span>
                      <div className={styles.draftMoveActions}>
                        {draftTeams.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
                            disabled={moving === p.userId}
                            onClick={() => void moveTo(t.id, p.userId)}
                          >
                            → {t.name}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {draftTeams.map((t) => (
              <div key={t.id} className={styles.draftTeamColumn}>
                <h5 className={styles.draftTeamColumnHead}>
                  {t.name} ({t.roster.length})
                </h5>
                {t.roster.length === 0 ? (
                  <p className={styles.emptySmall}>No players drafted onto this team yet.</p>
                ) : (
                  <ul className={styles.draftPlayerList}>
                    {t.roster.map((r) => (
                      <li key={r.userId} className={styles.draftPlayerRow}>
                        <span className={styles.draftPlayerName}>{r.name}</span>
                        <div className={styles.draftMoveActions}>
                          {draftTeams
                            .filter((other) => other.id !== t.id)
                            .map((other) => (
                              <button
                                key={other.id}
                                type="button"
                                className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
                                disabled={moving === r.userId}
                                onClick={() => void moveTo(other.id, r.userId)}
                              >
                                → {other.name}
                              </button>
                            ))}
                          <button
                            type="button"
                            className={`${styles.btnGhost ?? ''} ${styles.btnSmall ?? ''}`}
                            disabled={moving === r.userId}
                            onClick={() => void sendToPool(t.id, r.userId)}
                          >
                            ← Pool
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {draftTeams.length < 2 && (
            <div className={styles.draftTeamCreateRow}>
              <label className={styles.field}>
                <span className={styles.label}>New team name</span>
                <input
                  className={styles.input}
                  placeholder={draftTeams.length === 0 ? 'e.g. Team A' : 'e.g. Team B'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`${styles.btnPrimary ?? ''} ${styles.btnSmall ?? ''}`}
                disabled={creating || !newName.trim()}
                onClick={() => void createTeam()}
              >
                {creating ? 'Creating…' : 'Create team'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
