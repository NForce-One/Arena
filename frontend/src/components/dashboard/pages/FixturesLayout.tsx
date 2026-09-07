import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { wallClockNowISO } from '../../../lib/calendar';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { useMyTournamentEntries, type MyFixture } from '../../../hooks/useMyTournamentEntries';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import styles from './FixturesPage.module.css';

export type { MyFixture };

export interface FixturesOutletContext {
  upcoming: MyFixture[];
  past: MyFixture[];
}

export function DashboardFixturesLayout() {
  const { fixtures: rows, error } = useMyTournamentEntries();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const { upcoming, past } = useMemo(() => {
    const filtered = (rows ?? []).filter((r) => {
      if (!q) return true;
      const home = r.fixture.homeTeam.toLowerCase();
      const away = r.fixture.awayTeam.toLowerCase();
      const ground = (r.fixture.ground ?? '').toLowerCase();
      return home.includes(q) || away.includes(q) || ground.includes(q);
    });
    const nowIso = wallClockNowISO();
    const upcoming = filtered
      .filter((r) => !r.fixture.result && r.fixture.startsAt >= nowIso)
      .sort((a, b) => a.fixture.startsAt.localeCompare(b.fixture.startsAt));
    const past = filtered
      .filter((r) => r.fixture.result || r.fixture.startsAt < nowIso)
      .sort((a, b) => b.fixture.startsAt.localeCompare(a.fixture.startsAt));
    return { upcoming, past };
  }, [rows, q]);

  const hasAny = upcoming.length + past.length > 0;

  const tabs: PageTabItem[] = [
    { to: '/fixtures', label: 'Upcoming', end: true },
    { to: '/fixtures/results', label: 'Recent Results' },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-label="Fixtures">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Fixtures</h2>
            <p className={styles.deck}>
              Your matches across every league: live scores, kickoffs and results.
            </p>
          </div>
          <div className={styles.summary} aria-hidden="true">
            <span className={styles.summaryPill}>
              <span className={styles.summaryValue}>{upcoming.length}</span>
              <span className={styles.summaryLabel}>upcoming</span>
            </span>
            <span className={styles.summaryPill}>
              <span className={styles.summaryValue}>{past.length}</span>
              <span className={styles.summaryLabel}>played</span>
            </span>
          </div>
        </header>

        {error && <p className={styles.empty}>{error}</p>}
        {!error && rows === null && <p className={styles.deck}>Loading…</p>}

        {!error && rows !== null && !hasAny && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="calendar" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>
              {q ? `No fixtures match "${query.trim()}"` : 'No fixtures yet'}
            </h3>
            <p className={styles.emptyBody}>
              {q
                ? 'Try a team or ground name.'
                : 'Register for a tournament and your matches will show up here: kickoffs and results.'}
            </p>
          </div>
        )}

        {!error && rows !== null && hasAny && (
          <>
            <PageTabs items={tabs} />
            <Outlet context={{ upcoming, past } satisfies FixturesOutletContext} />
          </>
        )}
      </section>
    </div>
  );
}
