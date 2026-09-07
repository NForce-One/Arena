import { MIN_AGE_YEARS, signupSchema, updateProfileSchema } from '@nforce/shared';
import { describe, expect, it } from 'vitest';

const valid = {
  name: 'Real Person',
  email: 'real.person@gmail.com',
  password: 'ValidPass1!',
};

function errorFor(input: unknown, path: string): string | undefined {
  const r = signupSchema.safeParse(input);
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path.join('.') === path)?.message;
}

describe('signupSchema', () => {
  it('accepts a well-formed signup with no date of birth', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a name that is more than whitespace', () => {
    expect(errorFor({ ...valid, name: '   ' }, 'name')).toBe('Name is required');
  });

  it('rejects a name with no letters (e.g. a bare digit string)', () => {
    expect(errorFor({ ...valid, name: '12345' }, 'name')).toBe(
      'Name must contain at least one letter',
    );
  });

  it('accepts names with apostrophes, hyphens and accents alongside letters', () => {
    expect(signupSchema.safeParse({ ...valid, name: "O'Brien-José 2nd" }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(errorFor({ ...valid, email: 'not-an-email' }, 'email')).toBe(
      'Enter a valid email address',
    );
  });

  it('accepts any correctly-formatted email domain (no allowlist)', () => {
    expect(signupSchema.safeParse({ ...valid, email: 'someone@example.com' }).success).toBe(true);
    expect(signupSchema.safeParse({ ...valid, email: 'someone@gmaill.com' }).success).toBe(true);
  });

  it('normalises email case and surrounding space', () => {
    const parsed = signupSchema.parse({ ...valid, email: '  Real.Person@Gmail.com  ' });
    expect(parsed.email).toBe('real.person@gmail.com');
  });

  it.each([
    ['too short', 'Ab1!', 'At least 8 characters'],
    ['no letter', '12345678!', 'A letter (a–z or A–Z)'],
    ['no number', 'Abcdefgh!', 'A number (0–9)'],
    ['no special character', 'Abcdefgh1', 'A special character (!@#$%…)'],
  ])('rejects a password that is %s', (_label, password, message) => {
    expect(errorFor({ ...valid, password }, 'password')).toBe(message);
  });

  it('rejects a password over 100 characters', () => {
    expect(errorFor({ ...valid, password: 'A1!'.padEnd(150, 'x') }, 'password')).toBe(
      'Password must be at most 100 characters',
    );
  });

  describe('date of birth', () => {
    it('accepts a plausible past date', () => {
      expect(signupSchema.safeParse({ ...valid, dateOfBirth: '1995-05-05' }).success).toBe(true);
    });

    it('rejects an unparsable date', () => {
      expect(errorFor({ ...valid, dateOfBirth: 'not-a-date' }, 'dateOfBirth')).toBe(
        'Enter a valid date',
      );
    });

    it('rejects a date of birth in the future', () => {
      const nextYear = new Date();
      nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
      expect(
        errorFor({ ...valid, dateOfBirth: nextYear.toISOString().slice(0, 10) }, 'dateOfBirth'),
      ).toBe('Date of birth cannot be in the future');
    });

    it(`rejects a date of birth less than ${MIN_AGE_YEARS} years ago`, () => {
      const now = new Date();
      const tooRecent = new Date(
        Date.UTC(now.getUTCFullYear() - MIN_AGE_YEARS + 1, now.getUTCMonth(), now.getUTCDate()),
      );
      expect(
        errorFor({ ...valid, dateOfBirth: tooRecent.toISOString().slice(0, 10) }, 'dateOfBirth'),
      ).toBe(`Date of birth must be at least ${MIN_AGE_YEARS} years ago`);
    });

    it('rejects an implausibly early year (typo guard, rolling 100-year floor)', () => {
      expect(errorFor({ ...valid, dateOfBirth: '0202-05-05' }, 'dateOfBirth')).toBe(
        'Enter a date within the past 100 years',
      );
    });
  });

  describe('adult-age cross-check (signup only)', () => {
    it('accepts a DOB that computes to exactly 18', () => {
      const now = new Date();
      const boundary = new Date(
        Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()),
      );
      expect(
        signupSchema.safeParse({ ...valid, dateOfBirth: boundary.toISOString().slice(0, 10) })
          .success,
      ).toBe(true);
    });

    it('rejects a DOB under 18, even though it satisfies MIN_AGE_YEARS', () => {
      const now = new Date();
      const tooYoung = new Date(
        Date.UTC(now.getUTCFullYear() - 12, now.getUTCMonth(), now.getUTCDate()),
      );
      expect(
        errorFor({ ...valid, dateOfBirth: tooYoung.toISOString().slice(0, 10) }, 'dateOfBirth'),
      ).toBe('You must be at least 18 to create your own account');
    });

    it('accepts signup with no dateOfBirth at all — the checkbox alone gates it', () => {
      expect(signupSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects an under-18 DOB on a parentOnly signup too — a parent must be an adult', () => {
      const now = new Date();
      const tooYoung = new Date(
        Date.UTC(now.getUTCFullYear() - 12, now.getUTCMonth(), now.getUTCDate()),
      );
      expect(
        signupSchema.safeParse({
          ...valid,
          parentOnly: true,
          dateOfBirth: tooYoung.toISOString().slice(0, 10),
        }).success,
      ).toBe(false);
    });
  });

  describe('requestedRole', () => {
    it('accepts each of the four requestable roles', () => {
      for (const role of ['organizer', 'team_manager', 'ground_owner', 'umpire']) {
        expect(signupSchema.safeParse({ ...valid, requestedRole: role }).success).toBe(true);
      }
    });

    it('accepts signup with no requestedRole at all (just a player)', () => {
      expect(signupSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects platform_admin — never self-service', () => {
      expect(signupSchema.safeParse({ ...valid, requestedRole: 'platform_admin' }).success).toBe(
        false,
      );
    });

    it('rejects player — automatic, never something to "request"', () => {
      expect(signupSchema.safeParse({ ...valid, requestedRole: 'player' }).success).toBe(false);
    });
  });

  describe('parentOnly', () => {
    it('accepts parentOnly with no requestedRole', () => {
      expect(signupSchema.safeParse({ ...valid, parentOnly: true }).success).toBe(true);
    });

    it('rejects parentOnly combined with a requestedRole — mutually exclusive tiles', () => {
      expect(
        errorFor({ ...valid, parentOnly: true, requestedRole: 'organizer' }, 'requestedRole'),
      ).toBe('Choose only one of a role request, a parent-only signup, or an invite');
    });
  });

  describe('inviteToken', () => {
    it('accepts inviteToken alone, with no requestedRole or parentOnly', () => {
      expect(signupSchema.safeParse({ ...valid, inviteToken: 'tok_abc' }).success).toBe(true);
    });

    it('rejects inviteToken combined with a requestedRole', () => {
      expect(
        errorFor({ ...valid, inviteToken: 'tok_abc', requestedRole: 'organizer' }, 'requestedRole'),
      ).toBe('Choose only one of a role request, a parent-only signup, or an invite');
    });

    it('rejects inviteToken combined with parentOnly', () => {
      expect(
        errorFor({ ...valid, inviteToken: 'tok_abc', parentOnly: true }, 'requestedRole'),
      ).toBe('Choose only one of a role request, a parent-only signup, or an invite');
    });
  });
});

describe('updateProfileSchema date of birth', () => {
  it('allows an empty string to clear the stored value', () => {
    expect(updateProfileSchema.safeParse({ name: 'A', dateOfBirth: '' }).success).toBe(true);
  });

  it('applies the same future-date rule as signup', () => {
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    const r = updateProfileSchema.safeParse({
      name: 'A',
      dateOfBirth: nextYear.toISOString().slice(0, 10),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Date of birth cannot be in the future');
    }
  });

  it('still accepts the MIN_AGE_YEARS boundary date (timezones ahead of UTC must not be rejected)', () => {
    const now = new Date();
    const boundary = new Date(
      Date.UTC(now.getUTCFullYear() - MIN_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()),
    );
    expect(
      updateProfileSchema.safeParse({ name: 'A', dateOfBirth: boundary.toISOString().slice(0, 10) })
        .success,
    ).toBe(true);
  });
});
