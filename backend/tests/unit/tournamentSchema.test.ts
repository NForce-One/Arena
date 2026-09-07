import { createTournamentSchema } from '@nforce/shared';
import { describe, expect, it } from 'vitest';

describe('createTournamentSchema', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

  const base = {
    name: 'Spring Cup',
    structure: 'round_robin' as const,
    teamSelectionMode: 'prebuilt_rosters' as const,
    notifyOnPublish: false,
    startDate: iso(10),
    endDate: iso(20),
    locationCity: 'Dallas',
    locationState: 'Texas',
  };

  it('rejects a bracket whose registration end date is after the tournament end date', () => {
    const r = createTournamentSchema.safeParse({
      ...base,
      ageGroups: [
        {
          ageGroupId: 'age-open',
          genderCategory: 'mixed',
          registrationStartDate: iso(1),
          registrationEndDate: iso(25),
          format: 'T20',
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts a bracket whose registration end date is on or before the tournament end date', () => {
    const r = createTournamentSchema.safeParse({
      ...base,
      ageGroups: [
        {
          ageGroupId: 'age-open',
          genderCategory: 'mixed',
          registrationStartDate: iso(1),
          registrationEndDate: iso(20),
          format: 'T20',
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a bracket whose registration stays open past the tournament start date, as long as it closes by the end date', () => {
    const r = createTournamentSchema.safeParse({
      ...base,
      ageGroups: [
        {
          ageGroupId: 'age-open',
          genderCategory: 'mixed',
          registrationStartDate: iso(1),
          registrationEndDate: iso(15),
          format: 'T20',
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  describe('birth-date cutoffs', () => {
    const nextMonth = (() => {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() + 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const currentMonth = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();

    function withAgeGroup(overrides: Record<string, unknown>) {
      return createTournamentSchema.safeParse({
        ...base,
        ageGroups: [
          {
            ageGroupId: 'age-open',
            genderCategory: 'mixed',
            registrationStartDate: iso(1),
            registrationEndDate: iso(15),
            format: 'T20',
            ...overrides,
          },
        ],
      });
    }

    it('rejects a bornAfter cutoff in the future', () => {
      expect(withAgeGroup({ bornAfter: nextMonth }).success).toBe(false);
    });

    it('rejects a bornBefore cutoff in the future', () => {
      expect(withAgeGroup({ bornBefore: nextMonth }).success).toBe(false);
    });

    it('accepts the current month as a cutoff', () => {
      expect(withAgeGroup({ bornAfter: currentMonth }).success).toBe(true);
    });

    it('rejects an implausibly early year (typo guard)', () => {
      expect(withAgeGroup({ bornBefore: '0202-01' }).success).toBe(false);
    });
  });

  describe('notifyAudience', () => {
    const validAgeGroups = [
      {
        ageGroupId: 'age-open',
        genderCategory: 'mixed' as const,
        registrationStartDate: iso(1),
        registrationEndDate: iso(15),
        format: 'T20',
      },
    ];

    it('defaults notifyAudiences to ["everyone"] when omitted', () => {
      const r = createTournamentSchema.parse({ ...base, ageGroups: validAgeGroups });
      expect(r.notifyAudiences).toEqual(['everyone']);
    });

    it('rejects notifyAudiences "state" with no notifyState, when notifyOnPublish is on', () => {
      const r = createTournamentSchema.safeParse({
        ...base,
        notifyOnPublish: true,
        notifyAudiences: ['state'],
        ageGroups: validAgeGroups,
      });
      expect(r.success).toBe(false);
    });

    it('accepts notifyAudiences "state" with notifyState set', () => {
      const r = createTournamentSchema.safeParse({
        ...base,
        notifyOnPublish: true,
        notifyAudiences: ['state'],
        notifyState: 'Texas',
        ageGroups: validAgeGroups,
      });
      expect(r.success).toBe(true);
    });

    it('does not require notifyState for "state" when notifyOnPublish is off', () => {
      const r = createTournamentSchema.safeParse({
        ...base,
        notifyOnPublish: false,
        notifyAudiences: ['state'],
        ageGroups: validAgeGroups,
      });
      expect(r.success).toBe(true);
    });

    it('rejects "everyone" combined with another audience', () => {
      const r = createTournamentSchema.safeParse({
        ...base,
        notifyOnPublish: true,
        notifyAudiences: ['everyone', 'last_year_players'],
        ageGroups: validAgeGroups,
      });
      expect(r.success).toBe(false);
    });

    it('accepts multiple non-"everyone" audiences combined', () => {
      const r = createTournamentSchema.safeParse({
        ...base,
        notifyOnPublish: true,
        notifyAudiences: ['last_year_players', 'last_year_managers', 'state'],
        notifyState: 'Texas',
        ageGroups: validAgeGroups,
      });
      expect(r.success).toBe(true);
    });
  });
});
