import { z } from 'zod';

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export const uploadPhotoSchema = z.object({
  contentType: z.enum(ALLOWED_PHOTO_TYPES, {
    message: 'Photo must be a JPEG, PNG or WebP image',
  }),
  data: z.string().min(1, 'Photo data is required'),
});
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
