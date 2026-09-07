import { z } from 'zod';

export const createOrganizerAgeGroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
});
export type CreateOrganizerAgeGroupInput = z.infer<typeof createOrganizerAgeGroupSchema>;
