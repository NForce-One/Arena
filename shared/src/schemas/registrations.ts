import { z } from 'zod';

export const registerSchema = z.object({
  teamId: z.string().min(1).nullish(),
  tournamentAgeGroupId: z.string().min(1, 'Age group is required'),
  overrideEligibility: z.boolean().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const registerChildSchema = z.object({
  tournamentAgeGroupId: z.string().min(1, 'Age group is required'),
});
export type RegisterChildInput = z.infer<typeof registerChildSchema>;

export const inviteTeamSchema = z.object({
  teamId: z.string().min(1, 'Team is required'),
  tournamentAgeGroupId: z.string().min(1, 'Age group is required'),
  overrideRegistrationWindow: z.boolean().optional(),
  overrideEligibility: z.boolean().optional(),
  overrideCapacity: z.boolean().optional(),
});
export type InviteTeamInput = z.infer<typeof inviteTeamSchema>;

export const invitePlayerSchema = z.object({
  userId: z.string().min(1, 'Player is required'),
  tournamentAgeGroupId: z.string().min(1, 'Age group is required'),
  overrideEligibility: z.boolean().optional(),
  overrideRegistrationWindow: z.boolean().optional(),
  overrideCapacity: z.boolean().optional(),
});
export type InvitePlayerInput = z.infer<typeof invitePlayerSchema>;

export const invitationResponseSchema = z.object({
  decision: z.enum(['accept', 'decline']),
  overrideEligibility: z.boolean().optional(),
});
export type InvitationResponseInput = z.infer<typeof invitationResponseSchema>;

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'completed'] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  completed: 'Completed',
};

export const updatePaymentSchema = z
  .object({
    status: z.enum(PAYMENT_STATUSES),
    amountPaid: z.number().nonnegative().max(999999).nullish(),
  })
  .refine((v) => v.status !== 'partial' || (v.amountPaid != null && v.amountPaid > 0), {
    message: 'Enter the amount paid so far',
    path: ['amountPaid'],
  });
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
