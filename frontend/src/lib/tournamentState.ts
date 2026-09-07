export type DisplayState = 'live' | 'upcoming' | 'past' | 'closed';

export function deriveTournamentState(
  t: { status: string; startDate: string; endDate: string },
  today: Date = new Date(),
): DisplayState {
  if (t.status === 'closed') return 'closed';
  const start = new Date(t.startDate);
  const end = new Date(t.endDate);
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (todayMs < startMs) return 'upcoming';
  if (todayMs > endMs) return 'past';
  return 'live';
}
