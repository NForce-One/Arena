export interface StorageAdapter {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const PHOTO_URL_TTL_SECONDS = 15 * 60;

export const RULES_DOCUMENT_URL_TTL_SECONDS = 60 * 60;
