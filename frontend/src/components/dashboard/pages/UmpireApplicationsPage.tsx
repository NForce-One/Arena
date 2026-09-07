import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import { MatchRow, matchesQuery, statusLabel, type UmpireOutletContext } from './UmpireLayout';
import styles from './UmpirePage.module.css';

type StatusFilter = 'all' | 'applied' | 'accepted' | 'declined';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'applied', label: 'Applied' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];

export function DashboardUmpireApplicationsPage() {
  const { open } = useOutletContext<UmpireOutletContext>();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const applicationsList = useMemo(
    () => (open ?? []).filter((f) => f.myStatus !== null && f.myStatus !== 'invited'),
    [open],
  );
  const visibleApplications = useMemo(
    () =>
      applicationsList
        .filter((f) => statusFilter === 'all' || f.myStatus === statusFilter)
        .filter((f) => matchesQuery(q, f.homeTeam, f.awayTeam, f.tournamentName, f.ground))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [applicationsList, q, statusFilter],
  );

  const emptyTitle = q
    ? `No applications match "${query.trim()}"`
    : statusFilter === 'all'
      ? "You haven't applied to any matches yet."
      : `No ${statusFilter} applications.`;
  const emptyBody = q
    ? 'Try a different team, tournament or ground name.'
    : statusFilter === 'all'
      ? 'Apply to an open match and its status will show up here.'
      : 'Try a different status filter.';

  return (
    <section className={styles.panel} aria-label="My applications">
      <header className={styles.header}>
        <div>
          <h2 className={styles.h2}>
            My applications {open !== null && `(${applicationsList.length})`}
          </h2>
          <p className={styles.deck}>Matches you've applied to officiate, and their status.</p>
        </div>
      </header>

      <div className={styles.filterRow} role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`${styles.filterChip ?? ''} ${
              statusFilter === f.value ? (styles.filterChipActive ?? '') : ''
            }`}
            aria-pressed={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {open === null && <p className={styles.deck}>Loading…</p>}

      {open !== null &&
        (visibleApplications.length > 0 ? (
          <div key={`applications-${q}-${statusFilter}`} className={styles.rows}>
            {visibleApplications.map((f, i) => (
              <MatchRow
                key={f.id}
                id={f.id}
                homeTeam={f.homeTeam}
                awayTeam={f.awayTeam}
                tournamentName={f.tournamentName}
                ground={f.ground}
                startsAt={f.startsAt}
                index={i}
                action={
                  f.myStatus && <span className={styles.statusChip}>{statusLabel(f.myStatus)}</span>
                }
              />
            ))}
          </div>
        ) : (
          <div key={`applications-empty-${q}-${statusFilter}`} className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="clipboard" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
            <p className={styles.emptyBody}>{emptyBody}</p>
          </div>
        ))}
    </section>
  );
}
