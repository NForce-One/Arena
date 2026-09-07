import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './StorageAdapter';

export class LocalDiskStorageAdapter implements StorageAdapter {
  constructor(
    private readonly rootDir: string,
    private readonly secret: string,
    private readonly publicBaseUrl = '',
  ) {}

  private resolve(key: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) {
      throw new Error(`Unsafe storage key: ${key}`);
    }
    return path.join(this.rootDir, key);
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${key}.${exp}`).digest('base64url');
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.sign(key, exp);
    return `${this.publicBaseUrl}/api/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async readSigned(key: string, exp: string, sig: string): Promise<Buffer | null> {
    const expSeconds = Number(exp);
    if (!Number.isFinite(expSeconds) || expSeconds < Math.floor(Date.now() / 1000)) return null;

    const expected = Buffer.from(this.sign(key, expSeconds));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
}
