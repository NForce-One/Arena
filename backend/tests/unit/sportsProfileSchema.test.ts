import { sportsProfileSchema } from '@nforce/shared';
import { describe, expect, it } from 'vitest';

const valid = {
  phone: '5551234567',
  school: 'Riverside High',
  jerseyNumber: 7,
  jerseyName: 'ROCKET',
  jerseySize: 'l',
  battingStyle: 'right_handed',
  bowlingStyle: 'right_arm_fast',
  playingRole: 'all_rounder',
  emergencyContactName: 'Jane Doe',
  emergencyContactPhone: '5559990000',
  gender: 'male',
  consentAccepted: true,
};

describe('sportsProfileSchema', () => {
  it('accepts a fully filled-in profile', () => {
    expect(sportsProfileSchema.safeParse(valid).success).toBe(true);
  });

  it('requires the Contact-step and Jersey-step fields, not just gender and consent', () => {
    const r = sportsProfileSchema.safeParse({ gender: 'male', consentAccepted: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(
        expect.arrayContaining([
          'phone',
          'school',
          'emergencyContactName',
          'emergencyContactPhone',
          'jerseyNumber',
          'jerseyName',
          'jerseySize',
        ]),
      );
    }
  });

  it('requires gender — RegistrationService.assertGenderEligible reads it to gate mens/womens brackets, so leaving it unset would silently strand a consented player', () => {
    const { gender: _drop, ...withoutGender } = valid;
    expect(sportsProfileSchema.safeParse(withoutGender).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...withoutGender, gender: null }).success).toBe(false);
  });

  it('requires consentAccepted to be literally true — missing, false, or absent all fail', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, consentAccepted: false }).success).toBe(false);
    const { consentAccepted: _drop, ...withoutConsent } = valid;
    expect(sportsProfileSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it('requires an emergency contact name with at least one letter — blank or digits-only both fail', () => {
    expect(
      sportsProfileSchema.safeParse({ ...valid, emergencyContactName: '5551234' }).success,
    ).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, emergencyContactName: '' }).success).toBe(
      false,
    );
  });

  it('rejects a jersey number outside 0-99', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, jerseyNumber: -1 }).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, jerseyNumber: 100 }).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, jerseyNumber: 99 }).success).toBe(true);
    expect(sportsProfileSchema.safeParse({ ...valid, jerseyNumber: 0 }).success).toBe(true);
  });

  it('rejects an unrecognized enum value for jerseySize/battingStyle/bowlingStyle/playingRole', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, jerseySize: 'xxxxl' }).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, battingStyle: 'ambidextrous' }).success).toBe(
      false,
    );
    expect(sportsProfileSchema.safeParse({ ...valid, bowlingStyle: 'underarm' }).success).toBe(
      false,
    );
    expect(sportsProfileSchema.safeParse({ ...valid, playingRole: 'fielder' }).success).toBe(false);
  });

  it("bowlingStyle accepts 'none' for a player who doesn't bowl", () => {
    expect(sportsProfileSchema.safeParse({ ...valid, bowlingStyle: 'none' }).success).toBe(true);
  });

  it("requires battingStyleOther/bowlingStyleOther text when the style is 'other'", () => {
    expect(sportsProfileSchema.safeParse({ ...valid, battingStyle: 'other' }).success).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, battingStyle: 'other', battingStyleOther: '  ' })
        .success,
    ).toBe(false);
    expect(
      sportsProfileSchema.safeParse({
        ...valid,
        battingStyle: 'other',
        battingStyleOther: 'Switch hitter',
      }).success,
    ).toBe(true);
    expect(sportsProfileSchema.safeParse({ ...valid, bowlingStyle: 'other' }).success).toBe(false);
    expect(
      sportsProfileSchema.safeParse({
        ...valid,
        bowlingStyle: 'other',
        bowlingStyleOther: 'Underarm spin',
      }).success,
    ).toBe(true);
  });

  it('clears stale *Other text once the style moves away from "other"', () => {
    const r = sportsProfileSchema.safeParse({
      ...valid,
      battingStyle: 'right_handed',
      battingStyleOther: 'leftover text from an earlier edit',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.battingStyleOther).toBeNull();
  });

  it('rejects a malformed or blank phone number — phone is required', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, phone: 'call me maybe' }).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, phone: '' }).success).toBe(false);
  });

  it('rejects a school name with no letters, or blank — school is required', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, school: '12345' }).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, school: '' }).success).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, school: "St. Mary's High School" }).success,
    ).toBe(true);
  });

  it('requires jersey number, display name, and size', () => {
    const { jerseyNumber: _n, ...withoutNumber } = valid;
    expect(sportsProfileSchema.safeParse(withoutNumber).success).toBe(false);
    const { jerseyName: _nm, ...withoutName } = valid;
    expect(sportsProfileSchema.safeParse(withoutName).success).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, jerseyName: '' }).success).toBe(false);
    const { jerseySize: _s, ...withoutSize } = valid;
    expect(sportsProfileSchema.safeParse(withoutSize).success).toBe(false);
  });

  it('requires emergency contact phone', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, emergencyContactPhone: '' }).success).toBe(
      false,
    );
  });

  it('rejects a phone number with formatting characters — digits only, no +/-/()/spaces', () => {
    expect(sportsProfileSchema.safeParse({ ...valid, phone: '+1 (555) 123-4567' }).success).toBe(
      false,
    );
    expect(sportsProfileSchema.safeParse({ ...valid, phone: '555 123 4567' }).success).toBe(false);
  });

  it('accepts a height/weight/gender combination with matching units', () => {
    const r = sportsProfileSchema.safeParse({
      ...valid,
      heightValue: 178,
      heightUnit: 'cm',
      weightValue: 70,
      weightUnit: 'kg',
      gender: 'male',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a height or weight value with no unit, and vice versa', () => {
    expect(
      sportsProfileSchema.safeParse({ ...valid, heightValue: 178, heightUnit: null }).success,
    ).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, heightValue: null, heightUnit: 'cm' }).success,
    ).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, weightValue: 70, weightUnit: null }).success,
    ).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, weightValue: null, weightUnit: 'kg' }).success,
    ).toBe(false);
  });

  it('rejects an unrecognized height/weight unit or gender value', () => {
    expect(
      sportsProfileSchema.safeParse({ ...valid, heightValue: 5, heightUnit: 'meters' }).success,
    ).toBe(false);
    expect(
      sportsProfileSchema.safeParse({ ...valid, weightValue: 150, weightUnit: 'stone' }).success,
    ).toBe(false);
    expect(sportsProfileSchema.safeParse({ ...valid, gender: 'unspecified' }).success).toBe(false);
  });
});
