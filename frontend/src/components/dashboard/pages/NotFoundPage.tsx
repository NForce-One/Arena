import { Link } from 'react-router';
import { Icon } from '../ui/Icon';
import styles from './NotFoundPage.module.css';

export function DashboardNotFoundPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="search" size={28} />
        </span>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.deck}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link to="/tournaments" className={styles.home}>
          <Icon name="chevron-right" size={14} />
          <span>Back to tournaments</span>
        </Link>
      </div>
    </div>
  );
}
