import { z } from 'zod';
import { ROLE_NAMES } from '../types/roles';

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  body: z.string().trim().min(1, 'Body is required').max(2000),
  targetRoles: z.array(z.enum(ROLE_NAMES)).max(ROLE_NAMES.length).default([]),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
