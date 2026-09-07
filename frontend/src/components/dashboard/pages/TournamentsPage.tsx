import type { PublicTournamentSummaryDto } from '@nforce/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { StateField } from '../../StateField';
import { summarizeAgeGroups, summarizeFormats } from '../../../lib/ageGroups';
import { deriveTournamentState, type DisplayState } from '../../../lib/tournamentState';
import { dedupeLocationValues, sameLocation } from '../../../lib/location';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { useTournamentsPageTabs } from '../../../hooks/useTournamentsPageTabs';
import { WelcomeBanner } from '../ui/WelcomeBanner';
import { TournamentCard } from '../ui/TournamentCard';
import { Icon } from '../ui/Icon';
import { PageTabs } from '../ui/PageTabs';
import styles from './TournamentsPage.module.css';

type Filter = 'all' | DisplayState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'closed', label: 'Closed' },
];

export function DashboardTournamentsPage() {
  const pageTabs = useTournamentsPageTabs();
  const [tournaments, setTournaments] = useState<PublicTournamentSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [pillReady, setPillReady] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const chipRefs = useRef(new Map<Filter, HTMLButtonElement | null>());
  const { query, setQuery } = useSearchQuery();
  const q = query.trim().toLowerCase();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFormat = searchParams.get('format') ?? '';
  const urlDate = searchParams.get('date') ?? '';
  const hasUrlFilters = Boolean(urlFormat || urlDate);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  useEffect(() => {
    const urlQ = searchParams.get('q');
    if (urlQ) setQuery(urlQ);
    const urlCity = searchParams.get('city');
    if (urlCity) setCity(urlCity);
    const urlState = searchParams.get('state');
    if (urlState) setState(urlState);
  }, []);

  useEffect(() => {
    void api<{ tournaments: PublicTournamentSummaryDto[] }>('/api/public/tournaments')
      .then((data) => setTournaments(data.tournaments))
      .catch(() => setError('Could not load tournaments. Is the backend running?'));
  }, []);

  const decorated = useMemo(
    () => (tournaments ?? []).map((t) => ({ tournament: t, state: deriveTournamentState(t) })),
    [tournaments],
  );

  const cities = useMemo(
    () => dedupeLocationValues((tournaments ?? []).map((t) => t.locationCity)),
    [tournaments],
  );

  const visible = useMemo(() => {
    let list = filter === 'all' ? decorated : decorated.filter((d) => d.state === filter);
    if (urlFormat) {
      list = list.filter(({ tournament: t }) => t.ageGroups.some((g) => g.format === urlFormat));
    }
    if (urlDate) {
      list = list.filter(({ tournament: t }) => t.fixtureDates.includes(urlDate));
    }
    if (city) {
      list = list.filter(({ tournament: t }) => sameLocation(t.locationCity, city));
    }
    if (state) {
      list = list.filter(({ tournament: t }) => sameLocation(t.locationState, state));
    }
    if (!q) return list;
    return list.filter(
      ({ tournament: t }) =>
        t.name.toLowerCase().includes(q) ||
        t.organizerName.toLowerCase().includes(q) ||
        summarizeFormats(t.ageGroups).toLowerCase().includes(q) ||
        summarizeAgeGroups(t.ageGroups).toLowerCase().includes(q) ||
        (t.locationCity ?? '').toLowerCase().includes(q) ||
        (t.locationState ?? '').toLowerCase().includes(q),
    );
  }, [filter, decorated, q, urlFormat, urlDate, city, state]);

  function clearUrlFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete('format');
    next.delete('date');
    setSearchParams(next, { replace: true });
  }

  useLayoutEffect(() => {
    const el = chipRefs.current.get(filter);
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth });
    const raf = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(raf);
  }, [filter, tournaments]);

  const activeLabel = FILTERS.find((f) => f.id === filter)?.label.toLowerCase() ?? 'that';

  return (
    <div className={styles.page}>
      <WelcomeBanner />
      <PageTabs items={pageTabs} />

      <section className={styles.list} aria-label="Tournaments">
        <header className={styles.header}>
          <div>
            <h2 className={styles.h2}>Tournaments</h2>
            <p className={styles.deck}>
              Live fixtures, results and standings across every league on the arena.
            </p>
          </div>
          <div className={styles.filters} role="tablist" aria-label="Filter tournaments">
            <span
              className={`${styles.pill ?? ''} ${pillReady ? (styles.pillReady ?? '') : ''}`}
              style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }}
              aria-hidden="true"
            />
            {FILTERS.map((f) => (
              <button
                key={f.id}
                ref={(el) => {
                  chipRefs.current.set(f.id, el);
                }}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`${styles.chip ?? ''} ${filter === f.id ? (styles.chipActive ?? '') : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </header>

        {tournaments !== null && (
          <div className={styles.locationFilters}>
            <select
              className={styles.locationSelect}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-label="Filter by city"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <StateField
              value={state}
              onChange={setState}
              allOptionLabel="All states"
              ariaLabel="Filter by state"
            />
            {(city || state) && (
              <button
                type="button"
                className={styles.clearUrlFilters}
                onClick={() => {
                  setCity('');
                  setState('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {hasUrlFilters && (
          <p className={styles.deck}>
            Filtered by{urlFormat ? ` format "${urlFormat}"` : ''}
            {urlFormat && urlDate ? ' and' : ''}
            {urlDate ? ` date ${urlDate}` : ''} from your search.{' '}
            <button type="button" className={styles.clearUrlFilters} onClick={clearUrlFilters}>
              Clear
            </button>
          </p>
        )}

        {error && <p className={styles.empty}>{error}</p>}

        {!error && tournaments === null && <p className={styles.deck}>Loading…</p>}

        {!error &&
          tournaments !== null &&
          (visible.length > 0 ? (
            <div key={`${filter}-${q}`} className={styles.rows}>
              {visible.map((d, i) => (
                <TournamentCard key={d.tournament.id} tournament={d.tournament} index={i} />
              ))}
            </div>
          ) : (
            <div key={`empty-${filter}-${q}`} className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="trophy" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>
                {q ? `No tournaments match "${query.trim()}"` : `No ${activeLabel} tournaments`}
              </h3>
              <p className={styles.emptyBody}>
                {q
                  ? 'Try a different name, organizer or format.'
                  : "When organizers publish a new league in this window, it'll show up here."}
              </p>
            </div>
          ))}
      </section>
    </div>
  );
}
