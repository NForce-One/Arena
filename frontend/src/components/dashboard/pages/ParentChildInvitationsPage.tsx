import { Link, useOutletContext } from 'react-router';
import { Icon } from '../ui/Icon';
import type { ParentChildOutletContext } from './ParentChildDetailLayout';
import styles from './ParentPage.module.css';

export function DashboardParentChildInvitationsPage() {
  const { child, pendingInvitations, invitationError, invitationBusy, onRespondInvitation } =
    useOutletContext<ParentChildOutletContext>();

  return (
    <div className={styles.section}>
      <h4 className={styles.subHead}>
        <Icon name="bell" size={14} />
        <span>Pending invitations</span>
      </h4>
      {invitationError && (
        <p className={styles.bannerError} role="alert">
          {invitationError}
        </p>
      )}
      {pendingInvitations.length === 0 ? (
        <p className={styles.emptySmall}>No pending invitations.</p>
      ) : (
        <div className={styles.regList}>
          {pendingInvitations.map((inv) => (
            <div className={styles.inviteRow} key={`${inv.kind}-${inv.id}`}>
              <div className={styles.inviteText}>
                {inv.kind === 'tournament' ? (
                  <Link to={`/tournaments/${inv.tournamentId}`} className={styles.regName}>
                    {inv.label}
                  </Link>
                ) : (
                  <span className={styles.regName}>{inv.label}</span>
                )}
                <span className={styles.inviteSub}>
                  {inv.kind === 'tournament' ? inv.sub : `Squad invite · ${inv.sub}`}
                </span>
              </div>
              {child.isMinor && (
                <div className={styles.inviteActions}>
                  <button
                    type="button"
                    className={styles.acceptBtn}
                    disabled={invitationBusy === inv.id}
                    onClick={() => onRespondInvitation(inv, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className={styles.declineBtn}
                    disabled={invitationBusy === inv.id}
                    onClick={() => onRespondInvitation(inv, 'decline')}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
