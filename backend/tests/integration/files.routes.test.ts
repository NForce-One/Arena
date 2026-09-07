import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { LocalDiskStorageAdapter } from '../../src/adapters/storage/LocalDiskStorageAdapter';

describe('GET /api/files/:key content type', () => {
  let dir: string;
  let storage: LocalDiskStorageAdapter;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'nforce-files-route-'));
    storage = new LocalDiskStorageAdapter(dir, 'test-secret-at-least-32-chars-long!!', '');
    app = buildApp({ storage });
    await storage.put('rules.pdf', Buffer.from('%PDF-fake-bytes'), 'application/pdf');
    await storage.put('rules.txt', Buffer.from('Standard playing conditions apply.'), 'text/plain');
    await storage.put('photo.jpg', Buffer.from('fake-jpeg-bytes'), 'image/jpeg');
    await storage.put('mystery.bin', Buffer.from('???'), 'application/octet-stream');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function get(key: string) {
    const url = await storage.signedUrl(key, 60);
    const { pathname, search } = new URL(url, 'http://x');
    return request(app).get(pathname + search);
  }

  it('serves a PDF as application/pdf, downloadable', async () => {
    const res = await get('rules.pdf');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('serves a text document as text/plain, downloadable', async () => {
    const res = await get('rules.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('still serves a photo inline as image/jpeg, no Content-Disposition', async () => {
    const res = await get('photo.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('falls back to a generic download for an unrecognized extension', async () => {
    const res = await get('mystery.bin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment');
  });
});
