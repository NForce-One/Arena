import { z } from 'zod';
import { ROLE_NAMES } from '../types/roles';

export const roleChangeSchema = z.object({
  role: z.enum(ROLE_NAMES),
});
export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
