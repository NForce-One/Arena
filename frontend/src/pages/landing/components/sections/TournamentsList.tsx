import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { StateField } from '../../../../components/StateField';
import { summarizeAgeGroups } from '../../../../lib/ageGroups';
import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import {
  daysUntilRegistrationCloses,
  daysUntilStart,
  formatsLabel,
  isHappeningNextWeek,
  isHappeningThisWeek,
  isRegistrationClosingSoon,
  usePublicTournaments,
} from '../../data/tournaments';
import { sameLocation } from '../../../../lib/location';
import styles from './TournamentsList.module.css';

type Timing = 'all' | 'this-week' | 'next-week' | 'closing-soon';

const VISIBLE_DESKTOP = 12;
const VISIBLE_MOBILE = 3;

function fmtStart(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtEnd(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TournamentsList() {
  const all = usePublicTournaments();
  const isMobile = useMediaQuery('(max-width: 720px)');
  const initialVisible = isMobile ? VISIBLE_MOBILE : VISIBLE_DESKTOP;
  const [ageGroup, setAgeGroup] = useState<string>('All');
  const [state, setState] = useState<string>('All');
  const [timing, setTiming] = useState<Timing>('all');
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const thisWeekCount = useMemo(
    () => (all ?? []).filter((t) => isHappeningThisWeek(t)).length,
    [all],
  );
  const nextWeekCount = useMemo(
    () => (all ?? []).filter((t) => isHappeningNextWeek(t)).length,
    [all],
  );
  const closingSoonCount = useMemo(
    () => (all ?? []).filter((t) => isRegistrationClosingSoon(t)).length,
    [all],
  );

  const ageGroups = useMemo(
    () =>
      Array.from(new Set((all ?? []).flatMap((t) => t.ageGroups.map((g) => g.name)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [all],
  );
  const tournaments = useMemo(
    () =>
      (all ?? [])
        .filter((t) => ageGroup === 'All' || t.ageGroups.some((g) => g.name === ageGroup))
        .filter((t) => state === 'All' || sameLocation(t.locationState, state))
        .filter((t) => {
          if (timing === 'all') return true;
          if (timing === 'this-week') return isHappeningThisWeek(t);
          if (timing === 'next-week') return isHappeningNextWeek(t);
          return isRegistrationClosingSoon(t);
        })
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [all, ageGroup, state, timing],
  );

  const filtersActive = ageGroup !== 'All' || state !== 'All' || timing !== 'all';

  useEffect(() => {
    setExpanded(false);
  }, [ageGroup, state, timing]);

  function toggleTiming(next: Timing) {
    setTiming((current) => (current === next ? 'all' : next));
  }

  const visibleTournaments = expanded ? tournaments : tournaments.slice(0, initialVisible);
  const hasMore = !expanded && tournaments.length > initialVisible;
  const canCollapse = expanded && tournaments.length > initialVisible;

  function collapse() {
    setExpanded(false);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section ref={sectionRef} className={`band bleed ${styles.section}`} id="tournaments">
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <span className={styles.titleAccent}>Tournaments</span>
          </h2>
          <p className={styles.deck}>Every fixture on the platform, sorted by first ball.</p>
        </div>
      </div>

      <div className={styles.enclosure}>
        <div className={styles.highlights} role="group" aria-label="Tournament timing highlights">
          <button
            type="button"
            className={`${styles.highlightCard} ${timing === 'this-week' ? styles.highlightCardActive : ''}`}
            aria-pressed={timing === 'this-week'}
            onClick={() => toggleTiming('this-week')}
          >
            <span className={styles.highlightIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 11h18" />
              </svg>
            </span>
            <span className={styles.highlightText}>
              <span className={styles.highlightCount}>{thisWeekCount}</span>
              <span className={styles.highlightLabel}>Happening this week</span>
            </span>
          </button>

          <button
            type="button"
            className={`${styles.highlightCard} ${timing === 'next-week' ? styles.highlightCardActive : ''}`}
            aria-pressed={timing === 'next-week'}
            onClick={() => toggleTiming('next-week')}
          >
            <span className={styles.highlightIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
            <span className={styles.highlightText}>
              <span className={styles.highlightCount}>{nextWeekCount}</span>
              <span className={styles.highlightLabel}>Upcoming next week</span>
            </span>
          </button>

          <button
            type="button"
            className={`${styles.highlightCard} ${timing === 'closing-soon' ? styles.highlightCardActive : ''}`}
            aria-pressed={timing === 'closing-soon'}
            onClick={() => toggleTiming('closing-soon')}
          >
            <span className={styles.highlightIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </span>
            <span className={styles.highlightText}>
              <span className={styles.highlightCount}>{closingSoonCount}</span>
              <span className={styles.highlightLabel}>Registration closing soon</span>
            </span>
          </button>
        </div>

        <div className={styles.filters} role="group" aria-label="Filter tournaments">
          <div className={styles.filterRight}>
            <StateField
              value={state === 'All' ? '' : state}
              onChange={(v) => setState(v || 'All')}
              allOptionLabel="All states"
              ariaLabel="Filter by state"
            />

            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Age group</span>
              <select
                className={styles.select}
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                aria-label="Filter by age group"
              >
                <option value="All">All age groups</option>
                {ageGroups.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <p className={styles.count} aria-live="polite">
              {tournaments.length} {tournaments.length === 1 ? 'tournament' : 'tournaments'}
            </p>

            {filtersActive && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => {
                  setAgeGroup('All');
                  setState('All');
                  setTiming('all');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {all !== null && tournaments.length === 0 ? (
          <p className={styles.empty}>
            {all.length === 0
              ? 'No tournaments published yet. Check back soon.'
              : 'No tournaments match these filters yet.'}
          </p>
        ) : (
          <ul className={styles.grid}>
            {visibleTournaments.map((t) => (
              <li key={t.id}>
                <article className={styles.card}>
                  <div className={styles.media}>
                    <img src="/assets/hero-day-3.png" alt="" aria-hidden="true" />
                    <span className={styles.formatBadge}>{formatsLabel(t)}</span>
                  </div>

                  <div className={styles.body}>
                    <h3 className={styles.name}>{t.name}</h3>

                    {(() => {
                      const thisWeek = isHappeningThisWeek(t);
                      const nextWeek = !thisWeek && isHappeningNextWeek(t);
                      const closingIn = isRegistrationClosingSoon(t)
                        ? daysUntilRegistrationCloses(t)
                        : null;
                      if (!thisWeek && !nextWeek && closingIn === null) return null;
                      return (
                        <div className={styles.urgencyRow}>
                          {thisWeek && (
                            <span className={`${styles.urgencyBadge} ${styles.urgencyThisWeek}`}>
                              Happening this week
                            </span>
                          )}
                          {nextWeek && (
                            <span className={`${styles.urgencyBadge} ${styles.urgencyThisWeek}`}>
                              {(() => {
                                const days = daysUntilStart(t);
                                return `Starts in ${days} ${days === 1 ? 'day' : 'days'}`;
                              })()}
                            </span>
                          )}
                          {closingIn !== null && (
                            <span className={`${styles.urgencyBadge} ${styles.urgencyClosing}`}>
                              {closingIn <= 0
                                ? 'Registration closes today'
                                : `Registration closes in ${closingIn} ${closingIn === 1 ? 'day' : 'days'}`}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <p className={styles.metaLine}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                      {t.organizerName}
                      {t.organizerAcademyName ? ` (${t.organizerAcademyName})` : ''}
                    </p>

                    {(t.locationCity || t.locationState) && (
                      <p className={styles.metaLine}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11Z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        {[t.locationCity, t.locationState].filter(Boolean).join(', ')}
                      </p>
                    )}

                    <p className={styles.metaLine}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M8 3v4M16 3v4M3 11h18" />
                      </svg>
                      {fmtStart(t.startDate)} – {fmtEnd(t.endDate)}
                    </p>

                    <div className={styles.footRow}>
                      <div className={styles.stats}>
                        <span className={styles.teams}>{t.teamsCount} Teams</span>
                        <span className={styles.spots}>{summarizeAgeGroups(t.ageGroups)}</span>
                      </div>
                      <Link to={`/tournaments/${t.id}`} className={styles.viewDetails}>
                        View Details
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <div className={styles.seeMoreRow}>
            <button type="button" className={styles.seeMore} onClick={() => setExpanded(true)}>
              See More
            </button>
          </div>
        )}
        {canCollapse && (
          <div className={styles.seeMoreRow}>
            <button type="button" className={styles.seeMore} onClick={collapse}>
              See Less
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
