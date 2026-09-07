import type { AvailabilityRuleDto } from '../types/api';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

export function isWithinAvailability(
  rules: AvailabilityRuleDto[],
  startsAt: Date,
  endsAt: Date,
): boolean {
  if (rules.length === 0) return false;
  const day = DAY_NAMES[startsAt.getUTCDay()]!;
  const startMin = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
  const endMin = endsAt.getUTCHours() * 60 + endsAt.getUTCMinutes();
  const bookingDate = startsAt.toISOString().slice(0, 10);
  if (endsAt.getUTCDate() !== startsAt.getUTCDate() || endMin <= startMin) return false;
  return rules.some((r) => {
    const days = r.days.toLowerCase();
    const dayOk = days === 'all' || days.split(/[,\s]+/).includes(day);
    const dateOk =
      (!r.startDate || bookingDate >= r.startDate) && (!r.endDate || bookingDate <= r.endDate);
    return dayOk && dateOk && startMin >= minutesOf(r.from) && endMin <= minutesOf(r.to);
  });
}

export interface AvailabilityProblem {
  reason: string;
  openWindows?: { from: string; to: string }[];
}

export function availabilityProblem(
  rules: AvailabilityRuleDto[],
  startsAt: Date,
  endsAt: Date,
): AvailabilityProblem | null {
  if (isWithinAvailability(rules, startsAt, endsAt)) return null;
  if (rules.length === 0) return { reason: 'No availability set' };
  if (endsAt.getUTCDate() !== startsAt.getUTCDate()) return { reason: 'Runs past midnight' };

  const day = DAY_NAMES[startsAt.getUTCDay()]!;
  const bookingDate = startsAt.toISOString().slice(0, 10);
  const openThatDay = rules.filter((r) => {
    const days = r.days.toLowerCase();
    const dayOk = days === 'all' || days.split(/[,\s]+/).includes(day);
    const dateOk =
      (!r.startDate || bookingDate >= r.startDate) && (!r.endDate || bookingDate <= r.endDate);
    return dayOk && dateOk;
  });
  if (openThatDay.length === 0) return { reason: 'Closed that day' };
  return {
    reason: 'Outside opening hours',
    openWindows: openThatDay.map((r) => ({ from: r.from, to: r.to })),
  };
}
