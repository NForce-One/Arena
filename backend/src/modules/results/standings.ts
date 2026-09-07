import type { ResultOutcome, StandingRow } from './result.repo';

export function computeStandings(teamIds: string[], outcomes: ResultOutcome[]): StandingRow[] {
  const table = new Map<string, StandingRow>();
  for (const teamId of teamIds) {
    table.set(teamId, { teamId, played: 0, won: 0, lost: 0, drawn: 0, points: 0 });
  }
  const ensure = (teamId: string): StandingRow => {
    let row = table.get(teamId);
    if (!row) {
      row = { teamId, played: 0, won: 0, lost: 0, drawn: 0, points: 0 };
      table.set(teamId, row);
    }
    return row;
  };

  for (const o of outcomes) {
    for (const teamId of [o.homeTeamId, o.awayTeamId]) {
      const row = ensure(teamId);
      row.played += 1;
      if (o.winnerTeamId === null) {
        row.drawn += 1;
        row.points += 1;
      } else if (o.winnerTeamId === teamId) {
        row.won += 1;
        row.points += 2;
      } else {
        row.lost += 1;
      }
    }
  }

  return [...table.values()];
}
