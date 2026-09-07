import { useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { wallClockNowISO } from '../../../lib/calendar';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import { PageTabs, type PageTabItem } from '../ui/PageTabs';
import { MatchRow, matchesQuery, type UmpireOutletContext } from './UmpireLayout';
import styles from './UmpirePage.module.css';

const scheduleTabs: PageTabItem[] = [
  { to: '/umpire', label: 'Upcoming', end: true },
  { to: '/umpire/past', label: 'Past' },
];

function ScheduleList({
  variant,
  q,
  query,
}: {
  variant: 'upcoming' | 'past';
  q: string;
  query: string;
}) {
  const { schedule } = useOutletContext<UmpireOutletContext>();

  const visibleSchedule = useMemo(() => {
    const filtered = (schedule ?? []).filter((s) =>
      matchesQuery(q, s.homeTeam, s.awayTeam, s.tournamentName, s.ground),
    );
    const today = wallClockNowISO().slice(0, 10);
    return variant === 'upcoming'
      ? filtered
          .filter((s) => s.startsAt.slice(0, 10) >= today)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      : filtered
          .filter((s) => s.startsAt.slice(0, 10) < today)
          .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }, [schedule, q, variant]);

  const emptyTitle = q
    ? `No ${variant} matches match "${query.trim()}"`
    : variant === 'upcoming'
      ? 'No upcoming matches.'
      : 'No past matches yet.';
  const emptyBody = q
    ? 'Try a different team, tournament or ground name.'
    : variant === 'upcoming'
      ? "Matches you've accepted to officiate will appear here once scheduled."
      : "Matches you've officiated will move here once their date passes.";

  if (schedule === null) return <p className={styles.deck}>Loading…</p>;

  if (visibleSchedule.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <Icon name="calendar" size={30} />
        </span>
        <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
        <p className={styles.emptyBody}>{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className={styles.rows}>
      {visibleSchedule.map((s, i) => (
        <MatchRow
          key={s.fixtureId}
          id={s.fixtureId}
          homeTeam={s.homeTeam}
          awayTeam={s.awayTeam}
          tournamentName={s.tournamentName}
          ground={s.ground}
          startsAt={s.startsAt}
          index={i}
        />
      ))}
    </div>
  );
}

function SchedulePage({ variant }: { variant: 'upcoming' | 'past' }) {
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  return (
    <section className={styles.panel} aria-label="My schedule">
      <header className={styles.header}>
        <div>
          <h2 className={styles.h2}>My schedule</h2>
          <p className={styles.deck}>Matches you've accepted to officiate.</p>
        </div>
      </header>

      <PageTabs items={scheduleTabs} />

      <ScheduleList variant={variant} q={q} query={query} />
    </section>
  );
}

export function DashboardUmpireSchedulePage() {
  return <SchedulePage variant="upcoming" />;
}

export function DashboardUmpireSchedulePastPage() {
  return <SchedulePage variant="past" />;
}
