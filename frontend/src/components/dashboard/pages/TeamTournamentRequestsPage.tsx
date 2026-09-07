import type { PublicTournamentSummaryDto, RegistrationDto } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import type { TeamOutletContext } from './TeamDetailLayout';
import styles from './TeamsPage.module.css';

interface TeamTournamentEntry {
  tournament: PublicTournamentSummaryDto;
  registration: RegistrationDto;
}

export function DashboardTeamTournamentRequestsPage() {
  const { team, invitations, reloadInvitations } = useOutletContext<TeamOutletContext>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm(): void;
  } | null>(null);

  const [activeRegistrations, setActiveRegistrations] = useState<TeamTournamentEntry[]>([]);

  const loadRegistrations = useCallback(async () => {
    try {
      const { tournaments } = await api<{ tournaments: PublicTournamentSummaryDto[] }>(
        '/api/public/tournaments',
      );
      const found = await Promise.all(
        tournaments.map(async (t): Promise<TeamTournamentEntry | null> => {
          try {
            const { registrations } = await api<{ registrations: RegistrationDto[] }>(
              `/api/tournaments/${t.id}/my-registrations`,
            );
            const mine = registrations.find(
              (r) => r.status === 'active' && r.entityType === 'team' && r.entityId === team.id,
            );
            return mine ? { tournament: t, registration: mine } : null;
          } catch {
            return null;
          }
        }),
      );
      setActiveRegistrations(found.filter((e): e is TeamTournamentEntry => e !== null));
    } catch {
    }
  }, [team.id]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  async function doRespond(invitationId: string, decision: 'accept' | 'decline') {
    setError(null);
    setBusy(invitationId);
    try {
      await api(`/api/team-invitations/${invitationId}/respond`, { body: { decision } });
      await reloadInvitations();
      if (decision === 'accept') await loadRegistrations();
    } catch (err) {
      setError(errorsFrom(err).banner);
    } finally {
      setBusy(null);
    }
  }

  function respond(invitationId: string, decision: 'accept' | 'decline', tournamentName: string) {
    if (busy !== null) return;
    if (decision === 'accept') {
      void doRespond(invitationId, decision);
      return;
    }
    setPendingConfirm({
      title: 'Decline this invitation?',
      message: `Decline the invitation to ${tournamentName}? The organizer will see this team declined.`,
      confirmLabel: 'Decline',
      onConfirm: () => void doRespond(invitationId, decision),
    });
  }

  return (
    <>
      <div className={styles.rosterSection}>
        <h4 className={styles.subHead}>
          <Icon name="trophy" size={14} />
          <span>Tournament invitations</span>
        </h4>
        {error && (
          <p className={styles.bannerError} role="alert">
            {error}
          </p>
        )}
        {invitations.length === 0 ? (
          <p className={styles.emptySmall}>No pending tournament invitations.</p>
        ) : (
          <div className={styles.tourneyInviteRows}>
            {invitations.map((inv) => (
              <div className={styles.tourneyInviteRow} key={inv.id}>
                <Link to={`/tournaments/${inv.tournamentId}`} className={styles.tourneyInviteName}>
                  {inv.tournamentName}
                </Link>
                <div className={styles.tourneyInviteActions}>
                  <button
                    type="button"
                    className={styles.acceptBtn}
                    disabled={busy === inv.id}
                    onClick={() => respond(inv.id, 'accept', inv.tournamentName)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={styles.declineBtn}
                    disabled={busy === inv.id}
                    onClick={() => respond(inv.id, 'decline', inv.tournamentName)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.rosterSection}>
        <h4 className={styles.subHead}>
          <Icon name="shield-check" size={14} />
          <span>Active registrations</span>
        </h4>
        {activeRegistrations.length === 0 ? (
          <p className={styles.emptySmall}>Not registered for any tournament yet.</p>
        ) : (
          <div className={styles.regList}>
            {activeRegistrations.map((e) => (
              <div className={styles.regRow} key={e.registration.id}>
                <Link to={`/tournaments/${e.tournament.id}`} className={styles.regName}>
                  {e.tournament.name}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        cancelLabel="Cancel"
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}
