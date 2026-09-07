import { z } from 'zod';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date (YYYY-MM-DD)');

export const availabilityRuleSchema = z
  .object({
    days: z.string().trim().min(1, 'Days is required (e.g. "all" or "mon,tue")'),
    from: timeSchema,
    to: timeSchema,
    startDate: dateSchema.nullish(),
    endDate: dateSchema.nullish(),
  })
  .refine((v) => v.from < v.to, { message: 'Start time must be before end time', path: ['to'] })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: 'Available-from date must be on or before the available-until date',
    path: ['endDate'],
  });
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

export const createGroundSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  location: z.string().trim().min(1, 'Location is required').max(100),
  capacity: z.number().int().positive().nullish(),
  facilities: z.array(z.string().trim().min(1).max(40)).default([]),
  availabilityRules: z
    .array(availabilityRuleSchema)
    .min(1, 'At least one availability window is required'),
});
export type CreateGroundInput = z.infer<typeof createGroundSchema>;

export const updateGroundSchema = createGroundSchema.partial().extend({
  facilities: z.array(z.string().trim().min(1).max(40)).optional(),
});
export type UpdateGroundInput = z.infer<typeof updateGroundSchema>;
