import type {
  PublicFixtureDto,
  PublicTournamentDetailDto,
  PublicTournamentSummaryDto,
  RegistrationDto,
} from '@nforce/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/apiClient';

export interface MyFixture {
  fixture: PublicFixtureDto;
  tournamentName: string;
  perspective: string | null;
}

export interface MyTournamentEntry {
  tournament: PublicTournamentSummaryDto;
  registration: RegistrationDto;
}

export function useMyTournamentEntries() {
  const [entries, setEntries] = useState<MyTournamentEntry[] | null>(null);
  const [fixtures, setFixtures] = useState<MyFixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { tournaments } = await api<{ tournaments: PublicTournamentSummaryDto[] }>(
        '/api/public/tournaments',
      );
      const mine = await Promise.all(
        tournaments.map(async (t) => {
          try {
            const { registrations } = await api<{ registrations: RegistrationDto[] }>(
              `/api/tournaments/${t.id}/my-registrations`,
            );
            return registrations
              .filter((r) => r.status === 'active')
              .map((registration): MyTournamentEntry => ({ tournament: t, registration }));
          } catch {
            return [];
          }
        }),
      );
      const registeredIn = mine.flat();

      const uniqueTournaments = new Map(registeredIn.map((e) => [e.tournament.id, e.tournament]));
      const perspectiveByTournamentId = new Map<string, string | null>();
      for (const { tournament, registration } of registeredIn) {
        if (registration.entityType === 'team') {
          perspectiveByTournamentId.set(tournament.id, registration.entityName);
        } else if (!perspectiveByTournamentId.has(tournament.id)) {
          perspectiveByTournamentId.set(tournament.id, null);
        }
      }

      const perTournamentFixtures = await Promise.all(
        [...uniqueTournaments.values()].map(async (tournament) => {
          try {
            const { tournament: detail } = await api<{ tournament: PublicTournamentDetailDto }>(
              `/api/public/tournaments/${tournament.id}`,
            );
            const perspective = perspectiveByTournamentId.get(tournament.id) ?? null;
            return detail.fixtures.map((fixture): MyFixture => ({
              fixture,
              tournamentName: tournament.name,
              perspective,
            }));
          } catch {
            return [];
          }
        }),
      );

      if (!cancelledRef.current) {
        setEntries(registeredIn);
        setFixtures(perTournamentFixtures.flat());
      }
    } catch {
      if (!cancelledRef.current) setError('Could not load your tournaments.');
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return { entries, fixtures, error, reload: load };
}
