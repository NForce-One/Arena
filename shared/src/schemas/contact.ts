import { z } from 'zod';

export const contactMessageSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(150),
  message: z.string().trim().min(1, 'Message is required').max(2000),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
