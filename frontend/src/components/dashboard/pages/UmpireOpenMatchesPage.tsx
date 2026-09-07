import { useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import { MatchRow, matchesQuery, type UmpireOutletContext } from './UmpireLayout';
import styles from './UmpirePage.module.css';

export function DashboardUmpireOpenMatchesPage() {
  const { open, busyIds, apply } = useOutletContext<UmpireOutletContext>();
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const openList = useMemo(() => (open ?? []).filter((f) => f.myStatus === null), [open]);
  const visibleOpen = useMemo(
    () =>
      openList.filter((f) => matchesQuery(q, f.homeTeam, f.awayTeam, f.tournamentName, f.ground)),
    [openList, q],
  );

  const emptyTitle = q ? `No open matches match "${query.trim()}"` : 'No open matches right now.';
  const emptyBody = q
    ? 'Try a different team, tournament or ground name.'
    : 'Check back soon. Organizers post fixtures here when they need an umpire.';

  return (
    <section className={styles.panel} aria-label="Open matches">
      <header className={styles.header}>
        <div>
          <h2 className={styles.h2}>Open matches</h2>
          <p className={styles.deck}>Apply to officiate a match that doesn't have an umpire yet.</p>
        </div>
      </header>

      {open === null && <p className={styles.deck}>Loading…</p>}

      {open !== null &&
        (visibleOpen.length > 0 ? (
          <div key={`open-${q}`} className={styles.rows}>
            {visibleOpen.map((f, i) => (
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
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={busyIds.has(f.id)}
                    onClick={() => void apply(f.id)}
                  >
                    {busyIds.has(f.id) ? 'Applying…' : 'Apply'}
                  </button>
                }
              />
            ))}
          </div>
        ) : (
          <div key={`open-empty-${q}`} className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name="ball" size={30} />
            </span>
            <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
            <p className={styles.emptyBody}>{emptyBody}</p>
          </div>
        ))}
    </section>
  );
}
