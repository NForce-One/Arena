import { useOutletContext } from 'react-router';
import { FixtureRow } from '../ui/FixtureRow';
import type { ParentChildFixturesOutletContext } from './ParentChildFixturesLayout';
import fixtureStyles from './FixturesPage.module.css';
import styles from './ParentPage.module.css';

export function DashboardParentChildFixturesPastPage() {
  const { past } = useOutletContext<ParentChildFixturesOutletContext>();

  if (past.length === 0) {
    return (
      <p className={styles.emptySmall}>
        Played matches will show up here once a result is entered.
      </p>
    );
  }

  return (
    <div className={fixtureStyles.rows}>
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
