import { z } from 'zod';

export const ALLOWED_RULES_DOCUMENT_TYPES = ['application/pdf', 'text/plain'] as const;

export const MAX_RULES_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const uploadRulesDocumentSchema = z.object({
  contentType: z.enum(ALLOWED_RULES_DOCUMENT_TYPES, {
    message: 'Rules document must be a PDF or plain text file',
  }),
  data: z.string().min(1, 'Document data is required'),
});
export type UploadRulesDocumentInput = z.infer<typeof uploadRulesDocumentSchema>;
