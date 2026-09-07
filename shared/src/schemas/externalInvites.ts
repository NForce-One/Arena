import { z } from 'zod';
import { emailSchema } from './auth';

export const externalInviteRoleSchema = z.enum(['player', 'team_manager']);
export type ExternalInviteRole = z.infer<typeof externalInviteRoleSchema>;

export const sendExternalInviteSchema = z.object({
  email: emailSchema,
  role: externalInviteRoleSchema,
  tournamentAgeGroupId: z.string().min(1),
});
export type SendExternalInviteInput = z.infer<typeof sendExternalInviteSchema>;
