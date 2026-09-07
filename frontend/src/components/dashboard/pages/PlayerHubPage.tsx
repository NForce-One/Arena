import type { MyRosterInvitationDto, TournamentInvitationDto } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMyTournamentEntries } from '../../../hooks/useMyTournamentEntries';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { wallClockNowISO } from '../../../lib/calendar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FixtureRow } from '../ui/FixtureRow';
import { Icon } from '../ui/Icon';
import shellStyles from './FixturesPage.module.css';
import styles from './PlayerHubPage.module.css';

type PendingInvitation =
  | { kind: 'tournament'; id: string; tournamentId: string; label: string; sub: string }
  | { kind: 'roster'; id: string; label: string; sub: string };

type Tab = 'invitations' | 'matches' | 'results' | 'registrations';

export function DashboardPlayerHubPage() {
  const [tab, setTab] = useState<Tab>('invitations');

  const [tournamentInvites, setTournamentInvites] = useState<TournamentInvitationDto[] | null>(
    null,
  );
  const [rosterInvites, setRosterInvites] = useState<MyRosterInvitationDto[] | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    invitation: PendingInvitation;
    decision: 'accept' | 'decline';
  } | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api<{ invitations: TournamentInvitationDto[] }>('/api/player-invitations/mine'),
        api<{ invitations: MyRosterInvitationDto[] }>('/api/teams/invitations'),
      ]);
      setTournamentInvites(t.invitations);
      setRosterInvites(r.invitations);
    } catch (err) {
      setInvitesError(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const {
    entries,
    fixtures,
    error: fixturesError,
    reload: reloadEntries,
  } = useMyTournamentEntries();

  const pendingInvitations: PendingInvitation[] = [
    ...(tournamentInvites ?? [])
      .filter((inv) => inv.status === 'invited')
      .map((inv): PendingInvitation => ({
        kind: 'tournament',
        id: inv.id,
        tournamentId: inv.tournamentId,
        label: inv.tournamentName,
        sub: inv.ageGroupLabel,
      })),
    ...(rosterInvites ?? []).map((inv): PendingInvitation => ({
      kind: 'roster',
      id: inv.teamId,
      label: inv.teamName,
      sub: `Squad invite · ${inv.roleInTeam === 'captain' ? 'Captain' : 'Player'}`,
    })),
  ];

  async function respond(invitation: PendingInvitation, decision: 'accept' | 'decline') {
    setPendingDecision(null);
    setRespondError(null);
    setBusy(invitation.id);
    try {
      const path =
        invitation.kind === 'tournament'
          ? `/api/player-invitations/${invitation.id}/respond`
          : `/api/teams/${invitation.id}/roster/respond`;
      await api(path, { body: { decision } });
      await loadInvitations();
      if (invitation.kind === 'tournament' && decision === 'accept') await reloadEntries();
    } catch (err) {
      setRespondError(errorsFrom(err).banner);
    } finally {
      setBusy(null);
    }
  }

  const nowIso = wallClockNowISO();
  const upcoming = (fixtures ?? [])
    .filter((r) => !r.fixture.result && r.fixture.startsAt >= nowIso)
    .sort((a, b) => a.fixture.startsAt.localeCompare(b.fixture.startsAt));
  const played = (fixtures ?? [])
    .filter((r) => r.fixture.result || r.fixture.startsAt < nowIso)
    .sort((a, b) => b.fixture.startsAt.localeCompare(a.fixture.startsAt));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'invitations', label: 'Invitations', count: pendingInvitations.length },
    { id: 'matches', label: 'My Matches' },
    { id: 'results', label: 'Results' },
    { id: 'registrations', label: 'My Registrations' },
  ];

  return (
    <div className={shellStyles.page}>
      <section className={shellStyles.panel} aria-label="My requests">
        <header className={shellStyles.header}>
          <div>
            <h2 className={shellStyles.h2}>My Requests</h2>
            <p className={shellStyles.deck}>
              Tournament and squad invitations, your matches, and what you're registered for, all in
              one place.
            </p>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Player hub sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? (styles.tabActive ?? '') : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              {!!t.count && <span className={styles.tabBadge}>{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'invitations' && (
          <div className={styles.tabPanel}>
            {invitesError && (
              <p className={shellStyles.empty} role="alert">
                {invitesError}
              </p>
            )}
            {respondError && <p className={styles.bannerError}>{respondError}</p>}
            {!invitesError && tournamentInvites === null && (
              <p className={shellStyles.deck}>Loading…</p>
            )}
            {!invitesError &&
              tournamentInvites !== null &&
              (pendingInvitations.length === 0 ? (
                <div className={shellStyles.empty}>
                  <span className={shellStyles.emptyIcon}>
                    <Icon name="bell" size={26} />
                  </span>
                  <h3 className={shellStyles.emptyTitle}>No pending invitations</h3>
                  <p className={shellStyles.emptyBody}>
                    Tournament invites from an organizer and squad invites from a team manager will
                    show up here.
                  </p>
                </div>
              ) : (
                <div className={styles.inviteList}>
                  {pendingInvitations.map((inv) => (
                    <div className={styles.inviteRow} key={`${inv.kind}-${inv.id}`}>
                      <div className={styles.inviteText}>
                        {inv.kind === 'tournament' ? (
                          <Link
                            to={`/tournaments/${inv.tournamentId}`}
                            className={styles.inviteName}
                          >
                            {inv.label}
                          </Link>
                        ) : (
                          <span className={styles.inviteName}>{inv.label}</span>
                        )}
                        <span className={styles.inviteSub}>{inv.sub}</span>
                      </div>
                      <div className={styles.inviteActions}>
                        <button
                          type="button"
                          className={styles.acceptBtn}
                          disabled={busy === inv.id}
                          onClick={() =>
                            setPendingDecision({ invitation: inv, decision: 'accept' })
                          }
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className={styles.declineBtn}
                          disabled={busy === inv.id}
                          onClick={() =>
                            setPendingDecision({ invitation: inv, decision: 'decline' })
                          }
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        {tab === 'matches' && (
          <div className={styles.tabPanel}>
            {fixturesError && <p className={shellStyles.empty}>{fixturesError}</p>}
            {!fixturesError && fixtures === null && <p className={shellStyles.deck}>Loading…</p>}
            {!fixturesError &&
              fixtures !== null &&
              (upcoming.length === 0 ? (
                <div className={shellStyles.empty}>
                  <span className={shellStyles.emptyIcon}>
                    <Icon name="calendar" size={26} />
                  </span>
                  <h3 className={shellStyles.emptyTitle}>No upcoming matches</h3>
                  <p className={shellStyles.emptyBody}>
                    Register for a tournament and your matches will show up here.
                  </p>
                </div>
              ) : (
                <div className={shellStyles.rows}>
                  {upcoming.map((r, i) => (
                    <FixtureRow
                      key={r.fixture.id}
                      fixture={r.fixture}
                      tournamentName={r.tournamentName}
                      perspective={r.perspective}
                      index={i}
                    />
                  ))}
                </div>
              ))}
          </div>
        )}

        {tab === 'results' && (
          <div className={styles.tabPanel}>
            {fixturesError && <p className={shellStyles.empty}>{fixturesError}</p>}
            {!fixturesError && fixtures === null && <p className={shellStyles.deck}>Loading…</p>}
            {!fixturesError &&
              fixtures !== null &&
              (played.length === 0 ? (
                <div className={shellStyles.empty}>
                  <span className={shellStyles.emptyIcon}>
                    <Icon name="trophy" size={26} />
                  </span>
                  <h3 className={shellStyles.emptyTitle}>No results yet</h3>
                  <p className={shellStyles.emptyBody}>
                    Once your matches are played, results show up here.
                  </p>
                </div>
              ) : (
                <div className={shellStyles.rows}>
                  {played.map((r, i) => (
                    <FixtureRow
                      key={r.fixture.id}
                      fixture={r.fixture}
                      tournamentName={r.tournamentName}
                      perspective={r.perspective}
                      index={i}
                    />
                  ))}
                </div>
              ))}
          </div>
        )}

        {tab === 'registrations' && (
          <div className={styles.tabPanel}>
            {fixturesError && <p className={shellStyles.empty}>{fixturesError}</p>}
            {!fixturesError && entries === null && <p className={shellStyles.deck}>Loading…</p>}
            {!fixturesError &&
              entries !== null &&
              (entries.length === 0 ? (
                <div className={shellStyles.empty}>
                  <span className={shellStyles.emptyIcon}>
                    <Icon name="clipboard" size={26} />
                  </span>
                  <h3 className={shellStyles.emptyTitle}>Not registered for anything yet</h3>
                  <p className={shellStyles.emptyBody}>
                    Browse tournaments and register. What you're in shows up here.
                  </p>
                </div>
              ) : (
                <div className={styles.inviteList}>
                  {entries.map((e) => (
                    <Link
                      to={`/tournaments/${e.tournament.id}`}
                      className={styles.inviteRow}
                      key={e.registration.id}
                    >
                      <div className={styles.inviteText}>
                        <span className={styles.inviteName}>{e.tournament.name}</span>
                        <span className={styles.inviteSub}>
                          {e.registration.entityType === 'team'
                            ? e.registration.entityName
                            : 'Registered individually'}
                          {' · '}
                          {e.registration.ageGroupLabel}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDecision !== null}
        title={
          pendingDecision?.decision === 'accept'
            ? 'Accept this invitation?'
            : 'Decline this invitation?'
        }
        message={
          pendingDecision
            ? pendingDecision.decision === 'accept'
              ? `Accept the invitation to ${pendingDecision.invitation.label}?`
              : `Decline the invitation to ${pendingDecision.invitation.label}? Whoever sent it will need to send a new one if you change your mind.`
            : ''
        }
        confirmLabel={pendingDecision?.decision === 'accept' ? 'Accept' : 'Decline'}
        onConfirm={() =>
          pendingDecision && void respond(pendingDecision.invitation, pendingDecision.decision)
        }
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
