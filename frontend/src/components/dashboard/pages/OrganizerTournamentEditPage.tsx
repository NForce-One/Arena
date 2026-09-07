import type { OrganizerTournamentDto } from '@nforce/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../../lib/apiClient';
import { errorsFrom } from '../../../lib/forms';
import { CricketLoader } from '../../CricketLoader';
import { TournamentWizard } from './OrganizerTournamentsNewPage';
import { wizardValuesFromTournament } from './OrganizerTournamentWizardShared';
import styles from './OrganizerTournamentsPage.module.css';

export function DashboardOrganizerTournamentEditPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<OrganizerTournamentDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<{ tournament: OrganizerTournamentDto }>(`/api/tournaments/${id}`);
      setTournament(data.tournament);
    } catch (err) {
      setError(errorsFrom(err).banner ?? 'Could not load this tournament.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Edit tournament">
          <p className={`${styles.banner ?? ''} ${styles.bannerError ?? ''}`} role="alert">
            {error}
          </p>
        </section>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className={styles.page}>
        <CricketLoader label="Loading tournament…" />
      </div>
    );
  }

  if (tournament.status !== 'draft') {
    return (
      <div className={styles.page}>
        <section className={styles.panel} aria-label="Edit tournament">
          <p className={styles.deck}>
            {tournament.name} is {tournament.status}. Only a draft tournament can be edited.
          </p>
          <Link className={styles.btnLink ?? ''} to={`/organizer/tournaments/${tournament.id}`}>
            Back to tournament
          </Link>
        </section>
      </div>
    );
  }

  return (
    <TournamentWizard
      mode="edit"
      tournamentId={tournament.id}
      initialValues={wizardValuesFromTournament(tournament)}
    />
  );
}
