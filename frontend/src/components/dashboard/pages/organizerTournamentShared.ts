import { wallClockLocalToISO } from '../../../lib/calendar';

export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export const MATCH_LENGTHS = [
  { minutes: 180, label: '3 hours (T10 / short format)' },
  { minutes: 210, label: '3½ hours (T20)' },
  { minutes: 240, label: '4 hours' },
  { minutes: 300, label: '5 hours' },
  { minutes: 420, label: '7 hours (One Day)' },
  { minutes: 480, label: '8 hours (full day)' },
];

export function validDateOrNull(value: string): Date | null {
  if (!value) return null;
  const d = new Date(wallClockLocalToISO(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function describeMinutes(mins: number): string {
  const preset = MATCH_LENGTHS.find((m) => m.minutes === mins);
  if (preset) return preset.label;
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hours` : `${h}h ${m}m`;
}

export function matchLengthOptions(current: string): { minutes: number; label: string }[] {
  const mins = Number(current);
  if (!Number.isFinite(mins) || mins <= 0 || MATCH_LENGTHS.some((m) => m.minutes === mins)) {
    return MATCH_LENGTHS;
  }
  return [{ minutes: mins, label: `${describeMinutes(mins)} (current)` }, ...MATCH_LENGTHS];
}

export function formatDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
