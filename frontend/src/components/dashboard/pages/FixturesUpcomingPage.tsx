import { useOutletContext } from 'react-router';
import { FixtureRow } from '../ui/FixtureRow';
import { Icon } from '../ui/Icon';
import type { FixturesOutletContext } from './FixturesLayout';
import styles from './FixturesPage.module.css';

export function DashboardFixturesUpcomingPage() {
  const { upcoming } = useOutletContext<FixturesOutletContext>();

  if (upcoming.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <Icon name="calendar" size={30} />
        </span>
        <h3 className={styles.emptyTitle}>No upcoming fixtures</h3>
        <p className={styles.emptyBody}>Check the Recent Results tab, or check back later.</p>
      </div>
    );
  }

  return (
    <div className={styles.rows}>
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
  );
}
