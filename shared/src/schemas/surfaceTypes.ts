import { z } from 'zod';

export const createSurfaceTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50),
});
export type CreateSurfaceTypeInput = z.infer<typeof createSurfaceTypeSchema>;
