import type { ChildFixtureEntryDto } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { wallClockNowISO } from '../../../lib/calendar';
import { errorsFrom } from '../../../lib/forms';
import { CricketLoader } from '../../CricketLoader';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import styles from './ParentPage.module.css';

export interface ParentChildFixturesOutletContext {
  upcoming: ChildFixtureEntryDto[];
  past: ChildFixtureEntryDto[];
}

export function DashboardParentChildFixturesLayout() {
  const { id } = useParams<{ id: string }>();
  const [fixtures, setFixtures] = useState<ChildFixtureEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<{ fixtures: ChildFixtureEntryDto[] }>(
        `/api/parent/children/${id}/fixtures`,
      );
      setFixtures(data.fixtures);
    } catch (err) {
      setError(errorsFrom(err).banner ?? 'Could not load fixtures.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const rows = fixtures ?? [];
    const nowIso = wallClockNowISO();
    const upcoming = rows
      .filter((r) => !r.fixture.result && r.fixture.startsAt >= nowIso)
      .sort((a, b) => a.fixture.startsAt.localeCompare(b.fixture.startsAt));
    const past = rows
      .filter((r) => r.fixture.result || r.fixture.startsAt < nowIso)
      .sort((a, b) => b.fixture.startsAt.localeCompare(a.fixture.startsAt));
    return { upcoming, past };
  }, [fixtures]);

  if (error) {
    return (
      <p className={styles.bannerError} role="alert">
        {error}
      </p>
    );
  }

  if (fixtures === null) {
    return <CricketLoader label="Loading fixtures…" />;
  }

  const tabs: PageTabItem[] = [
    { to: `/parent/children/${id}/fixtures`, label: 'Upcoming', end: true },
    { to: `/parent/children/${id}/fixtures/past`, label: 'Recent Results' },
  ];

  return (
    <div className={styles.section}>
      <h4 className={styles.subHead}>
        <Icon name="calendar" size={14} />
        <span>Fixtures</span>
      </h4>
      {fixtures.length === 0 ? (
        <p className={styles.emptySmall}>
          No fixtures yet — they'll show up here once their team's matches are scheduled.
        </p>
      ) : (
        <>
          <PageTabs items={tabs} />
          <Outlet context={{ upcoming, past } satisfies ParentChildFixturesOutletContext} />
        </>
      )}
    </div>
  );
}
