import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorageAdapter } from '../../src/adapters/storage/LocalDiskStorageAdapter';

describe('LocalDiskStorageAdapter signed URLs', () => {
  let dir: string;
  let storage: LocalDiskStorageAdapter;
  const bytes = Buffer.from('fake-image-bytes');

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'nforce-storage-'));
    storage = new LocalDiskStorageAdapter(dir, 'test-secret-at-least-32-chars-long!!', 'http://x');
    await storage.put('photo.jpg', bytes, 'image/jpeg');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function parts(url: string) {
    const u = new URL(url);
    return {
      key: decodeURIComponent(u.pathname.split('/').pop()!),
      exp: u.searchParams.get('exp')!,
      sig: u.searchParams.get('sig')!,
    };
  }

  it('serves the bytes for a fresh, correctly-signed link', async () => {
    const { key, exp, sig } = parts(await storage.signedUrl('photo.jpg', 60));
    await expect(storage.readSigned(key, exp, sig)).resolves.toEqual(bytes);
  });

  it('refuses a link whose expiry has passed', async () => {
    const { key, exp, sig } = parts(await storage.signedUrl('photo.jpg', -10));
    await expect(storage.readSigned(key, exp, sig)).resolves.toBeNull();
  });

  it('refuses a hand-extended expiry (signature covers exp)', async () => {
    const { key, exp, sig } = parts(await storage.signedUrl('photo.jpg', 60));
    const extended = String(Number(exp) + 86_400);
    await expect(storage.readSigned(key, extended, sig)).resolves.toBeNull();
  });

  it('refuses a valid signature pointed at a different key', async () => {
    await storage.put('other.jpg', Buffer.from('other'), 'image/jpeg');
    const { exp, sig } = parts(await storage.signedUrl('photo.jpg', 60));
    await expect(storage.readSigned('other.jpg', exp, sig)).resolves.toBeNull();
  });

  it('refuses a garbage signature', async () => {
    const { key, exp } = parts(await storage.signedUrl('photo.jpg', 60));
    await expect(storage.readSigned(key, exp, 'not-a-signature')).resolves.toBeNull();
  });

  it('refuses path traversal in the key', async () => {
    const { exp, sig } = parts(await storage.signedUrl('photo.jpg', 60));
    await expect(storage.readSigned('../../etc/passwd', exp, sig)).resolves.toBeNull();
  });

  it('delete removes the object and is safe to repeat', async () => {
    await storage.put('gone.jpg', bytes, 'image/jpeg');
    await storage.delete('gone.jpg');
    await storage.delete('gone.jpg');
    const { key, exp, sig } = parts(await storage.signedUrl('gone.jpg', 60));
    await expect(storage.readSigned(key, exp, sig)).resolves.toBeNull();
  });
});
