
export function ageAsOf(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export interface AgeGroupBounds {
  bornAfter: Date | null;
  bornBefore: Date | null;
}

function monthFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function isDobEligible(dateOfBirth: Date | null, info: AgeGroupBounds): boolean {
  if (info.bornAfter == null && info.bornBefore == null) return true;
  if (!dateOfBirth) return false;
  const dobMonth = monthFloor(dateOfBirth);
  if (info.bornAfter != null && dobMonth < monthFloor(info.bornAfter)) return false;
  if (info.bornBefore != null && dobMonth > monthFloor(info.bornBefore)) return false;
  return true;
}

export function isGenderEligible(
  userGender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null,
  category: 'mens' | 'womens' | 'mixed',
): boolean {
  if (category === 'mixed') return true;
  if (category === 'mens') return userGender === 'male';
  return userGender === 'female';
}

export interface RegistrationWindow {
  registrationStartDate: Date;
  registrationEndDate: Date;
}

export function isRegistrationWindowOpen(window: RegistrationWindow, now = new Date()): boolean {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return today >= window.registrationStartDate && today <= window.registrationEndDate;
}

export interface RegistrationWindowStatus {
  open: boolean;
  notYetOpen: boolean;
  message: string;
}

export function registrationWindowStatus(
  window: RegistrationWindow,
  now = new Date(),
): RegistrationWindowStatus {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const notYetOpen = today < window.registrationStartDate;
  const open = !notYetOpen && today <= window.registrationEndDate;
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const message = notYetOpen
    ? `Registration for this age group opens ${fmt(window.registrationStartDate)}.`
    : `Registration for this age group closed ${fmt(window.registrationEndDate)}.`;
  return { open, notYetOpen, message };
}
