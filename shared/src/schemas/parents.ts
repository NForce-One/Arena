import { z } from 'zod';
import { dateOfBirthSchema } from './dateOfBirth';
import { emailSchema } from './auth';
import { personNameSchema } from './personName';

export const addChildSchema = z.object({
  name: personNameSchema(50),
  dateOfBirth: dateOfBirthSchema,
});
export type AddChildInput = z.infer<typeof addChildSchema>;

export const updateChildSchema = z.object({
  name: personNameSchema(50),
  dateOfBirth: dateOfBirthSchema,
});
export type UpdateChildInput = z.infer<typeof updateChildSchema>;

export const inviteChildToClaimSchema = z.object({
  email: emailSchema,
});
export type InviteChildToClaimInput = z.infer<typeof inviteChildToClaimSchema>;
