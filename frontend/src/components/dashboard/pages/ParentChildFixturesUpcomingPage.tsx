import { useOutletContext } from 'react-router';
import { FixtureRow } from '../ui/FixtureRow';
import type { ParentChildFixturesOutletContext } from './ParentChildFixturesLayout';
import fixtureStyles from './FixturesPage.module.css';
import styles from './ParentPage.module.css';

export function DashboardParentChildFixturesUpcomingPage() {
  const { upcoming } = useOutletContext<ParentChildFixturesOutletContext>();

  if (upcoming.length === 0) {
    return <p className={styles.emptySmall}>No upcoming fixtures.</p>;
  }

  return (
    <div className={fixtureStyles.rows}>
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
