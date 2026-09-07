import type { OrganizerTournamentDto } from '@nforce/shared';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { summarizeAgeGroups, summarizeFormats } from '../../../lib/ageGroups';
import { useSearchQuery } from '../../../hooks/useSearchQuery';
import { Icon } from '../ui/Icon';
import { PageTabs } from '../ui/PageTabs';
import styles from './OrganizerTournamentsPage.module.css';

const TABS = [
  { to: '/organizer/tournaments', label: 'My Tournaments', end: true },
  { to: '/organizer/tournaments/new', label: 'Create Tournament' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endLabel = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return sameYear
    ? `${startLabel} – ${endLabel}, ${start.getUTCFullYear()}`
    : `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}, ${end.getUTCFullYear()}`;
}

function InlineBanner({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
      {children}
    </div>
  );
}

function statusClass(status: OrganizerTournamentDto['status']): string {
  if (status === 'published') return styles.statusPublished ?? '';
  if (status === 'closed') return styles.statusClosed ?? '';
  return styles.statusDraft ?? '';
}

export function DashboardOrganizerTournamentsPage() {
  const [tournaments, setTournaments] = useState<OrganizerTournamentDto[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const { query } = useSearchQuery();
  const q = query.trim().toLowerCase();

  const load = useCallback(async () => {
    try {
      const t = await api<{ tournaments: OrganizerTournamentDto[] }>('/api/tournaments/mine');
      setTournaments(t.tournaments);
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = tournaments ?? [];
    const filtered = q
      ? list.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            summarizeFormats(t.ageGroups).toLowerCase().includes(q),
        )
      : list;
    return [...filtered].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  }, [tournaments, q]);

  return (
    <div className={styles.page}>
      <PageTabs items={TABS} />

      <section className={styles.panel} aria-label="My tournaments">
        <header className={styles.header}>
          <h2 className={styles.h2}>My Tournaments</h2>
          <p className={styles.deck}>Create a tournament, then publish it once it&apos;s ready.</p>
        </header>

        {banner && <InlineBanner>{banner}</InlineBanner>}

        {tournaments === null && !banner && <p className={styles.deck}>Loading…</p>}

        {tournaments &&
          (visible.length > 0 ? (
            <div className={styles.rows}>
              {visible.map((t) => (
                <Link key={t.id} to={`/organizer/tournaments/${t.id}`} className={styles.row}>
                  <div className={styles.rowHead}>
                    <h3 className={styles.rowName}>{t.name}</h3>
                    <span className={`${styles.status ?? ''} ${statusClass(t.status)}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className={styles.rowChips}>
                    <span className={styles.rowFormat}>{summarizeFormats(t.ageGroups)}</span>
                    <span className={styles.rowAge} title={summarizeAgeGroups(t.ageGroups)}>
                      {summarizeAgeGroups(t.ageGroups)}
                    </span>
                  </div>
                  <p className={styles.rowMeta}>
                    {[t.locationCity, t.locationState].filter(Boolean).join(', ') ||
                      'Location not set'}
                  </p>
                  <div className={styles.rowFoot}>
                    <span className={styles.rowDate}>{formatRange(t.startDate, t.endDate)}</span>
                    <span
                      className={styles.rowRegistered}
                      title={
                        t.teamSelectionMode === 'draft_based'
                          ? 'Players registered'
                          : 'Teams registered'
                      }
                    >
                      <Icon name="users" size={13} />
                      <span>
                        {t.registeredCount}
                        {t.capacity != null ? ` / ${t.capacity}` : ''}
                      </span>
                    </span>
                    <span className={styles.chevron} aria-hidden="true">
                      <Icon name="chevron-right" size={18} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : tournaments.length > 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="trophy" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>No matches</h3>
              <p className={styles.emptyBody}>Try a different name or format.</p>
            </div>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon name="trophy" size={30} />
              </span>
              <h3 className={styles.emptyTitle}>No tournaments yet</h3>
              <p className={styles.emptyBody}>
                Create your first tournament from the Create Tournament tab above. It starts as a
                draft you can edit freely until you publish it.
              </p>
            </div>
          ))}
      </section>
    </div>
  );
}
