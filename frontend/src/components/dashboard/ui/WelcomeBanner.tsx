import { ROLE_LABELS } from '@nforce/shared';
import { useAuth } from '../../../auth/AuthContext';
import { Icon } from './Icon';
import styles from './WelcomeBanner.module.css';

export function WelcomeBanner() {
  const { user } = useAuth();
  if (!user) return null;

  const primaryRole = user.roles[0];
  const roleLabel = primaryRole ? ROLE_LABELS[primaryRole] : 'Member';

  return (
    <section className={styles.banner} aria-label="Welcome">
      <div className={styles.copy}>
        <h1 className={styles.h1}>
          Welcome <span className={styles.name}>{user.name}</span>
        </h1>
        <p className={styles.sub}>
          Signed in as <b>{roleLabel}</b>.
        </p>
      </div>

      <div className={styles.roleChip}>
        <span className={styles.avatar} aria-hidden="true">
          <Icon name="person" size={20} />
        </span>
        <div className={styles.roleText}>
          <div className={styles.roleLabel}>Your role{user.roles.length > 1 ? 's' : ''}</div>
          <div className={styles.roleValue}>
            {user.roles.map((r) => ROLE_LABELS[r]).join(', ') || 'Member'}
          </div>
        </div>
      </div>
    </section>
  );
}
