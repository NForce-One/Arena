import type { PublicTournamentSummaryDto } from '@nforce/shared';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/apiClient';
import { summarizeFormats } from '../../../lib/ageGroups';
import { dedupeLocationValues } from '../../../lib/location';

export type Tournament = PublicTournamentSummaryDto;

export function usePublicTournaments(): Tournament[] | null {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  useEffect(() => {
    void api<{ tournaments: Tournament[] }>('/api/public/tournaments')
      .then((data) => setTournaments(data.tournaments))
      .catch(() => setTournaments([]));
  }, []);
  return tournaments;
}

export function formatsLabel(t: Tournament): string {
  return summarizeFormats(t.ageGroups);
}

export function formatsIn(tournaments: Tournament[]): string[] {
  return Array.from(new Set(tournaments.flatMap((t) => t.ageGroups.map((g) => g.format)))).sort(
    (a, b) => a.localeCompare(b),
  );
}

export function statesIn(tournaments: Tournament[]): string[] {
  return dedupeLocationValues(tournaments.map((t) => t.locationState));
}

export function filterTournaments(
  tournaments: Tournament[],
  query: { q?: string; format?: string; date?: string },
): Tournament[] {
  const q = query.q?.trim().toLowerCase() ?? '';
  return tournaments
    .filter((t) => {
      if (q && !`${t.name} ${t.organizerName} ${formatsLabel(t)}`.toLowerCase().includes(q)) {
        return false;
      }
      if (query.format && !t.ageGroups.some((g) => g.format === query.format)) return false;
      if (query.date) {
        const picked = new Date(query.date).getTime();
        if (picked < new Date(t.startDate).getTime() || picked > new Date(t.endDate).getTime()) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function dayMs(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function todayMs(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}
const DAY_MS = 86_400_000;

function weekBounds(today: Date, weeksAhead: 0 | 1): readonly [number, number] {
  const dow = today.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = todayMs(today) + mondayOffset * DAY_MS + weeksAhead * 7 * DAY_MS;
  return [monday, monday + 6 * DAY_MS] as const;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function isHappeningThisWeek(t: Tournament, today: Date = new Date()): boolean {
  const [ws, we] = weekBounds(today, 0);
  return overlaps(dayMs(t.startDate), dayMs(t.endDate), ws, we);
}

export function isHappeningNextWeek(t: Tournament, today: Date = new Date()): boolean {
  const [ws, we] = weekBounds(today, 1);
  return overlaps(dayMs(t.startDate), dayMs(t.endDate), ws, we);
}

export function isRegistrationClosingSoon(t: Tournament, today: Date = new Date()): boolean {
  const now = todayMs(today);
  const [, horizon] = weekBounds(today, 1);
  return t.ageGroups.some((g) => {
    const closes = dayMs(g.registrationEndDate);
    return closes >= now && closes <= horizon;
  });
}

export function daysUntilRegistrationCloses(
  t: Tournament,
  today: Date = new Date(),
): number | null {
  const now = todayMs(today);
  const closingDates = t.ageGroups.map((g) => dayMs(g.registrationEndDate)).filter((c) => c >= now);
  if (closingDates.length === 0) return null;
  return Math.round((Math.min(...closingDates) - now) / DAY_MS);
}

export function daysUntilStart(t: Tournament, today: Date = new Date()): number {
  return Math.round((dayMs(t.startDate) - todayMs(today)) / DAY_MS);
}

export function suggestTournaments(tournaments: Tournament[], q: string, limit = 5): Tournament[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return tournaments
    .filter(
      (t) => t.name.toLowerCase().includes(query) || t.organizerName.toLowerCase().includes(query),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}
