import { ADULT_AGE_YEARS, MAX_AGE_YEARS, MIN_AGE_YEARS } from '@nforce/shared';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function monthValueToISODate(monthValue: string): string {
  return monthValue ? `${monthValue}-01` : '';
}

export function isoDateToMonthValue(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function todayISOMonth(): string {
  return todayISODate().slice(0, 7);
}

export function dobMonthBounds(): { min: string; max: string } {
  const now = new Date();
  const max = `${now.getFullYear() - MIN_AGE_YEARS}-${pad(now.getMonth() + 1)}`;
  const min = `${now.getFullYear() - MAX_AGE_YEARS}-${pad(now.getMonth() + 1)}`;
  return { min, max };
}

export function signupDobMonthBounds(): { min: string; max: string } {
  const now = new Date();
  const max = `${now.getFullYear() - ADULT_AGE_YEARS}-${pad(now.getMonth() + 1)}`;
  const min = `${now.getFullYear() - MAX_AGE_YEARS}-${pad(now.getMonth() + 1)}`;
  return { min, max };
}

export function buildMonthGrid(viewYear: number, viewMonth: number): Date[] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const gridStart = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
}

export function buildTimeSlots(stepMinutes: number): string[] {
  const out: string[] = [];
  for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
    out.push(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  }
  return out;
}

export function wallClockToISO(dateISO: string, time: string): string {
  return `${dateISO}T${time.length === 5 ? time : time.slice(0, 5)}:00.000Z`;
}

export function wallClockLocalToISO(value: string): string {
  const [date, time] = value.split('T');
  return wallClockToISO(date ?? '', time ?? '00:00');
}

export function wallClockNowISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000Z`;
}

const WALL: Intl.DateTimeFormatOptions = { timeZone: 'UTC' };

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    ...WALL,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function wallTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    ...WALL,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function wallDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    ...WALL,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function wallDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, WALL);
}

export function ruleWindow(from: string, to: string): string {
  return `${from}–${to}`;
}
