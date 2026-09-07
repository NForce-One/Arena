import { z } from 'zod';
import { clearableDateOfBirthSchema } from './dateOfBirth';
import { personNameSchema } from './personName';
import { toTitleCase } from './tournaments';

export const updateProfileSchema = z.object({
  name: personNameSchema(50),
  dateOfBirth: clearableDateOfBirthSchema.nullish(),
  academyName: z.string().trim().max(80).nullish(),
  state: z.string().trim().max(100).transform(toTitleCase).nullish(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateNotifyPublishStatesSchema = z.object({
  states: z
    .array(z.string().trim().min(1).max(100).transform(toTitleCase))
    .max(50)
    .transform((states) => [...new Set(states)]),
});
export type UpdateNotifyPublishStatesInput = z.infer<typeof updateNotifyPublishStatesSchema>;
