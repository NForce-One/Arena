import type {
  AgeGroupDto,
  OrganizerRegistrationsDto,
  OrganizerTournamentDto,
} from '@nforce/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { PageTabs } from '../ui/PageTabs';
import styles from './OrganizerTournamentPage.module.css';

export interface OrganizerTournamentContext {
  tournament: OrganizerTournamentDto;
  ageGroups: AgeGroupDto[];
  regSummary: { teams: number; players: number } | null;
  reload: () => Promise<void>;
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

export function DashboardOrganizerTournamentLayout() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<OrganizerTournamentDto | null>(null);
  const [ageGroups, setAgeGroups] = useState<AgeGroupDto[]>([]);
  const [regSummary, setRegSummary] = useState<{ teams: number; players: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, ag] = await Promise.all([
        api<{ tournament: OrganizerTournamentDto }>(`/api/tournaments/${id}`),
        api<{ ageGroups: AgeGroupDto[] }>('/api/age-groups'),
      ]);
      setTournament(t.tournament);
      setAgeGroups(ag.ageGroups);

      if (t.tournament.status !== 'draft') {
        const regs = await api<{ registrations: OrganizerRegistrationsDto }>(
          `/api/tournaments/${id}/registrations/detail`,
        );
        setRegSummary({
          teams: regs.registrations.teams.filter((tm) => tm.status === 'active').length,
          players: regs.registrations.players.length,
        });
      } else {
        setRegSummary(null);
      }
    } catch (err) {
      setBanner(errorsFrom(err).banner);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (banner && !tournament) {
    return (
      <div className={styles.page}>
        <section className={styles.panel}>
          <InlineBanner>{banner}</InlineBanner>
          <Link to="/organizer/tournaments" className={styles.backLink}>
            ← Back to my tournaments
          </Link>
        </section>
      </div>
    );
  }
  if (!tournament) {
    return (
      <div className={styles.page}>
        <p className={styles.deck}>Loading…</p>
      </div>
    );
  }

  const isDraft = tournament.status === 'draft';
  const tabs = [
    { to: `/organizer/tournaments/${tournament.id}`, label: 'Details', end: true },
    ...(!isDraft
      ? [{ to: `/organizer/tournaments/${tournament.id}/registrations`, label: 'Registrations' }]
      : []),
    ...(!isDraft
      ? [
          { to: `/organizer/tournaments/${tournament.id}/fixtures`, label: 'Fixtures' },
          {
            to: `/organizer/tournaments/${tournament.id}/schedule-match`,
            label: 'Schedule a Match',
          },
        ]
      : []),
  ];

  const context: OrganizerTournamentContext = { tournament, ageGroups, regSummary, reload: load };

  return (
    <div className={styles.page}>
      <Link to="/organizer/tournaments" className={styles.backLink}>
        ← My tournaments
      </Link>

      <div className={styles.headerRow}>
        <h2 className={styles.title}>{tournament.name}</h2>
        <span className={`${styles.status ?? ''} ${statusClass(tournament.status)}`}>
          {tournament.status}
        </span>
      </div>

      <PageTabs items={tabs} />

      {banner && <InlineBanner>{banner}</InlineBanner>}

      <Outlet context={context} />
    </div>
  );
}
