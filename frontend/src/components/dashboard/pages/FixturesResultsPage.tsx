import { useOutletContext } from 'react-router';
import { FixtureRow } from '../ui/FixtureRow';
import { Icon } from '../ui/Icon';
import type { FixturesOutletContext } from './FixturesLayout';
import styles from './FixturesPage.module.css';

export function DashboardFixturesResultsPage() {
  const { past } = useOutletContext<FixturesOutletContext>();

  if (past.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <Icon name="calendar" size={30} />
        </span>
        <h3 className={styles.emptyTitle}>No results yet</h3>
        <p className={styles.emptyBody}>
          Played matches will show up here once a result is entered.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.rows}>
      {past.map((r, i) => (
        <FixtureRow
          key={r.fixture.id}
          fixture={r.fixture}
          tournamentName={r.tournamentName}
          perspective={r.perspective}
          index={i}
        />
      ))}
    </div>
  );
}
