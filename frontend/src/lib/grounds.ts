import type { AvailabilityRuleDto } from '@nforce/shared';

function fmtDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function describeRuleDates(r: AvailabilityRuleDto): string {
  if (r.startDate && r.endDate) return ` (${fmtDate(r.startDate)} – ${fmtDate(r.endDate)})`;
  if (r.startDate) return ` (from ${fmtDate(r.startDate)})`;
  if (r.endDate) return ` (until ${fmtDate(r.endDate)})`;
  return '';
}

export function describeRuleDays(r: AvailabilityRuleDto): string {
  const trimmed = r.days.trim();
  if (trimmed.toLowerCase() === 'all') return 'Every day';
  return trimmed
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => d[0]!.toUpperCase() + d.slice(1))
    .join(', ');
}

export function describeRule(r: AvailabilityRuleDto): string {
  return `${describeRuleDays(r)} ${r.from}–${r.to}${describeRuleDates(r)}`;
}

export function describeAvailability(rules: AvailabilityRuleDto[] | undefined): string {
  if (!rules || rules.length === 0) return 'No availability set';
  return rules.map(describeRule).join('; ');
}
