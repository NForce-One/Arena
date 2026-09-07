import { Link, useOutletContext } from 'react-router';
import { Icon } from '../ui/Icon';
import type { ParentChildOutletContext } from './ParentChildDetailLayout';
import styles from './ParentPage.module.css';

export function DashboardParentChildRegistrationsPage() {
  const { child, activeRegistrations, rowError, onWithdraw } =
    useOutletContext<ParentChildOutletContext>();

  return (
    <div className={styles.section}>
      <h4 className={styles.subHead}>
        <Icon name="trophy" size={14} />
        <span>Active registrations</span>
      </h4>
      {rowError && (
        <p className={styles.bannerError} role="alert">
          {rowError}
        </p>
      )}
      {activeRegistrations.length === 0 ? (
        <p className={styles.emptySmall}>Not registered for any tournament yet.</p>
      ) : (
        <div className={styles.regList}>
          {activeRegistrations.map((r) => (
            <div className={styles.regRow} key={r.registrationId}>
              <Link to={`/tournaments/${r.tournamentId}`} className={styles.regName}>
                {r.tournamentName}
              </Link>
              {child.isMinor && (
                <button type="button" className={styles.withdrawBtn} onClick={() => onWithdraw(r)}>
                  Withdraw
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
