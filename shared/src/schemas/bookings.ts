import { z } from 'zod';

function isoDateTime(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} must be a valid date/time`)
    .refine((v) => new Date(v) > new Date(), `${label} cannot be in the past`);
}

export const requestBookingSchema = z
  .object({
    groundId: z.string().min(1, 'Ground is required'),
    startsAt: isoDateTime('Start time'),
    endsAt: isoDateTime('End time'),
    fixtureId: z.string().min(1).nullish(),
  })
  .refine((v) => new Date(v.startsAt) < new Date(v.endsAt), {
    message: 'Start time must be before the end time',
    path: ['endsAt'],
  });
export type RequestBookingInput = z.infer<typeof requestBookingSchema>;
