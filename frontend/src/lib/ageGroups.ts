import type { TournamentAgeGroupDto } from '@nforce/shared';
import { TOURNAMENT_GENDER_CATEGORY_LABELS } from '@nforce/shared';

export function summarizeAgeGroups(ageGroups: TournamentAgeGroupDto[]): string {
  if (ageGroups.length === 0) return 'Open';
  return ageGroups
    .map((g) => `${g.name} (${TOURNAMENT_GENDER_CATEGORY_LABELS[g.genderCategory]})`)
    .join(', ');
}

export function ageGroupClosedSuffix(ag: {
  registrationStartDate: string;
  registrationEndDate: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today < ag.registrationStartDate.slice(0, 10)) return ' (registration not open yet)';
  if (today > ag.registrationEndDate.slice(0, 10)) return ' (registration closed)';
  return '';
}

export function hasYouthAgeGroup(ageGroups: TournamentAgeGroupDto[]): boolean {
  return ageGroups.some((g) => g.name !== 'Open');
}

export function summarizeFormats(ageGroups: TournamentAgeGroupDto[]): string {
  const formats = Array.from(new Set(ageGroups.map((g) => g.format))).sort((a, b) =>
    a.localeCompare(b),
  );
  return formats.join(' / ');
}

export function isAgeGroupRegistrationOpen(ag: {
  registrationStartDate: string;
  registrationEndDate: string;
}): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return (
    today >= ag.registrationStartDate.slice(0, 10) && today <= ag.registrationEndDate.slice(0, 10)
  );
}

function fmtWindowDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function registrationWindowNote(ag: {
  registrationStartDate: string;
  registrationEndDate: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today < ag.registrationStartDate.slice(0, 10)) {
    return `Registration opens ${fmtWindowDate(ag.registrationStartDate)}.`;
  }
  return `Registration closed ${fmtWindowDate(ag.registrationEndDate)}.`;
}

export function defaultOpenAgeGroupId(ageGroups: TournamentAgeGroupDto[]): string {
  const open = ageGroups.find((ag) => isAgeGroupRegistrationOpen(ag));
  return (open ?? ageGroups[0])?.id ?? '';
}
