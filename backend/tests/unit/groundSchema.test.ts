import { updateGroundSchema } from '@nforce/shared';
import { describe, expect, it } from 'vitest';

describe('updateGroundSchema', () => {
  it('omitting facilities leaves it undefined, not defaulted to []', () => {
    const parsed = updateGroundSchema.parse({
      availabilityRules: [{ days: 'all', from: '06:00', to: '22:00' }],
    });
    expect(parsed.facilities).toBeUndefined();
    expect('facilities' in parsed).toBe(false);
  });

  it('still accepts and validates facilities when the caller actually sends them', () => {
    const parsed = updateGroundSchema.parse({ facilities: ['Club', 'Practice Pitches'] });
    expect(parsed.facilities).toEqual(['Club', 'Practice Pitches']);
  });
});
