import { z } from 'zod';
import { dateOfBirthSchema, isAdultDate, UNDER_18_SIGNUP_DOB_MESSAGE } from './dateOfBirth';
import { personNameSchema } from './personName';
import { requestedRoleSchema } from './roleRequests';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export interface PasswordRequirement {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const passwordRequirements: PasswordRequirement[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'letter', label: 'A letter (a–z or A–Z)', test: (v) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'A number (0–9)', test: (v) => /[0-9]/.test(v) },
  {
    id: 'special',
    label: 'A special character (!@#$%…)',
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export const passwordSchema = passwordRequirements.reduce<z.ZodType<string>>(
  (schema, req) => schema.refine(req.test, req.label),
  z.string().max(100, 'Password must be at most 100 characters'),
);

export const signupSchema = z
  .object({
    name: personNameSchema(50),
    email: emailSchema,
    password: passwordSchema,
    dateOfBirth: dateOfBirthSchema.optional(),
    requestedRole: requestedRoleSchema.optional(),
    parentOnly: z.boolean().optional(),
    inviteToken: z.string().min(1).optional(),
  })
  .refine((v) => [v.parentOnly, v.requestedRole, v.inviteToken].filter(Boolean).length <= 1, {
    message: 'Choose only one of a role request, a parent-only signup, or an invite',
    path: ['requestedRole'],
  })
  .refine((v) => !v.dateOfBirth || isAdultDate(v.dateOfBirth), {
    message: UNDER_18_SIGNUP_DOB_MESSAGE,
    path: ['dateOfBirth'],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is missing'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is missing'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const claimAccountSchema = z.object({
  token: z.string().min(1, 'Claim token is missing'),
  password: passwordSchema,
});
export type ClaimAccountInput = z.infer<typeof claimAccountSchema>;

export const requestEmailChangeSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1, 'Current password is required'),
});
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1, 'Confirmation token is missing'),
});
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
