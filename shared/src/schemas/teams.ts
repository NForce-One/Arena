import { z } from 'zod';
import { emailSchema } from './auth';

export const teamRoleSchema = z.enum(['captain', 'player']);

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const createDraftTeamSchema = z.object({
  tournamentAgeGroupId: z.string().min(1, 'Age group is required'),
  name: z.string().trim().min(1, 'Name is required').max(100),
});
export type CreateDraftTeamInput = z.infer<typeof createDraftTeamSchema>;

export const assignDraftPlayerSchema = z.object({
  userId: z.string().min(1),
});
export type AssignDraftPlayerInput = z.infer<typeof assignDraftPlayerSchema>;

export const inviteRosterMemberSchema = z
  .object({
    email: emailSchema.optional(),
    userId: z.string().min(1).optional(),
    roleInTeam: teamRoleSchema.default('player'),
  })
  .refine((v) => !!v.email !== !!v.userId, 'Provide exactly one of email or userId');
export type InviteRosterMemberInput = z.infer<typeof inviteRosterMemberSchema>;

export const rosterInviteResponseSchema = z.object({
  decision: z.enum(['accept', 'decline']),
});
export type RosterInviteResponseInput = z.infer<typeof rosterInviteResponseSchema>;

export const requestToJoinSchema = z.object({
  roleInTeam: teamRoleSchema.default('player'),
});
export type RequestToJoinInput = z.infer<typeof requestToJoinSchema>;

export const rosterRequestResponseSchema = rosterInviteResponseSchema;
export type RosterRequestResponseInput = RosterInviteResponseInput;
