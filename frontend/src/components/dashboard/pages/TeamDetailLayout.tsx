import type { TeamDto, TournamentInvitationDto } from '@nforce/shared';
import { updateTeamSchema } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom, validateForm } from '../../../lib/forms';
import { CricketLoader } from '../../CricketLoader';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import { TeamMonogram } from '../ui/TeamMonogram';
import styles from './TeamsPage.module.css';

export interface TeamOutletContext {
  team: TeamDto;
  reload: () => Promise<void>;
  invitations: TournamentInvitationDto[];
  reloadInvitations: () => Promise<void>;
}

export function DashboardTeamDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<TournamentInvitationDto[]>([]);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<{ team: TeamDto }>(`/api/teams/${id}`);
      setTeam(data.team);
    } catch (err) {
      setLoadError(errorsFrom(err).banner ?? 'Could not load this team.');
    }
  }, [id]);

  const reloadInvitations = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<{ invitations: TournamentInvitationDto[] }>(
        `/api/teams/${id}/tournament-invitations`,
      );
      setInvitations(data.invitations);
    } catch {
    }
  }, [id]);

  useEffect(() => {
    void reload();
    void reloadInvitations();
  }, [reload, reloadInvitations]);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openRename() {
    if (!team) return;
    setDraftName(team.name);
    setRenameError(null);
    setRenaming(true);
  }

  async function saveName() {
    if (!team) return;
    setRenameError(null);
    const parsed = validateForm(updateTeamSchema, { name: draftName });
    if (!parsed.ok) {
      setRenameError(Object.values(parsed.fields)[0] ?? 'Invalid input');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/teams/${team.id}`, { method: 'PATCH', body: parsed.data });
      setRenaming(false);
      await reload();
    } catch (err) {
      setRenameError(errorsFrom(err).banner);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Team">
          <p className={styles.bannerError} role="alert">
            {loadError}
          </p>
          <Link to="/teams" className={styles.renameToggle}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Teams</span>
          </Link>
        </section>
      </div>
    );
  }

  if (!team) {
    return (
      <div className={styles.page}>
        <CricketLoader label="Loading team…" />
      </div>
    );
  }

  const tabs: PageTabItem[] = [
    { to: `/teams/${team.id}`, label: 'Squad & Invites', end: true },
    {
      to: `/teams/${team.id}/tournament-requests`,
      label: 'Tournament Requests',
      count: invitations.length,
    },
  ];

  const context: TeamOutletContext = { team, reload, invitations, reloadInvitations };

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label={team.name}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>{team.name}</h2>
            <p className={styles.deck}>Manage the squad, invites and tournament requests.</p>
          </div>
          <Link to="/teams" className={styles.renameToggle}>
            <Icon name="arrow-right" size={13} />
            <span>Back to My Teams</span>
          </Link>
        </header>

        <article className={styles.teamCard}>
          <header className={styles.teamHead}>
            <div className={styles.teamHeadLeft}>
              <TeamMonogram name={team.name} size="lg" />
              {renaming ? (
                <div className={styles.renameRow}>
                  <input
                    aria-label="Team name"
                    className={styles.renameInput}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={() => void saveName()}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save name'}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setRenaming(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.teamHeadText}>
                  <h3 className={styles.teamName}>{team.name}</h3>
                  <span className={styles.teamSub}>
                    {team.roster.length} {team.roster.length === 1 ? 'player' : 'players'} in squad
                  </span>
                </div>
              )}
            </div>
            {!renaming && (
              <button type="button" className={styles.renameToggle} onClick={openRename}>
                <Icon name="gear" size={13} />
                <span>Rename</span>
              </button>
            )}
          </header>

          {renaming && renameError && (
            <p className={styles.bannerError} role="alert">
              {renameError}
            </p>
          )}
        </article>

        <PageTabs items={tabs} />
        <Outlet context={context} />
      </section>
    </div>
  );
}
