import { z } from 'zod';

function isoDateTime(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} must be a valid date/time`)
    .refine((v) => new Date(v) > new Date(), `${label} cannot be in the past`);
}

export const scheduleFixtureSchema = z
  .object({
    homeTeamId: z.string().min(1, 'Home team is required'),
    awayTeamId: z.string().min(1, 'Away team is required'),
    groundId: z.string().min(1).nullish(),
    startsAt: isoDateTime('Start time'),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    umpireEmails: z.array(z.string().trim().toLowerCase()).default([]),
  })
  .refine((v) => v.homeTeamId !== v.awayTeamId, {
    message: 'Home and away teams must be different',
    path: ['awayTeamId'],
  });
export type ScheduleFixtureInput = z.infer<typeof scheduleFixtureSchema>;

export const rescheduleFixtureSchema = z.object({
  startsAt: isoDateTime('Start time'),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  groundId: z.string().min(1).nullish(),
});
export type RescheduleFixtureInput = z.infer<typeof rescheduleFixtureSchema>;
