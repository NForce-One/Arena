import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { FakeRateLimitStore } from '../helpers/fakes';

function rateLimitStoreFactory() {
  return (prefix: string) => new FakeRateLimitStore(prefix);
}

describe('auth rate limiting', () => {
  it('blocks the Nth+1 attempt with the standard 429 envelope, per form', async () => {
    const app = buildApp({
      rateLimit: { windowMs: 60_000, limit: 3 },
      rateLimitStoreFactory: rateLimitStoreFactory(),
    });

    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/signup').send({});
    }
    const blocked = await request(app).post('/api/auth/signup').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.body.error.requestId).toBeTruthy();

    const forgotPassword = await request(app).post('/api/auth/forgot-password').send({});
    expect(forgotPassword.status).not.toBe(429);
  });

  it('window expiry restores access', async () => {
    const app = buildApp({
      rateLimit: { windowMs: 300, limit: 1 },
      rateLimitStoreFactory: rateLimitStoreFactory(),
    });
    await request(app).post('/api/auth/signup').send({});
    expect((await request(app).post('/api/auth/signup').send({})).status).toBe(429);
    await new Promise((r) => setTimeout(r, 350));
    expect((await request(app).post('/api/auth/signup').send({})).status).not.toBe(429);
  });

  it('does not rate-limit unrelated endpoints', async () => {
    const app = buildApp({
      rateLimit: { windowMs: 60_000, limit: 1 },
      rateLimitStoreFactory: rateLimitStoreFactory(),
    });
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
  });

  it('a single shared store counts hits consistently regardless of which "container" (limiter instance) handled each request — the exact bug an in-memory store has on Lambda', async () => {
    const sharedCounts = new Map<string, { count: number; resetAt: number }>();
    function sharedStoreFactory(prefix: string) {
      const store = new FakeRateLimitStore(prefix);
      store.counts = sharedCounts;
      return store;
    }
    const containerA = buildApp({
      rateLimit: { windowMs: 60_000, limit: 3 },
      rateLimitStoreFactory: sharedStoreFactory,
    });
    const containerB = buildApp({
      rateLimit: { windowMs: 60_000, limit: 3 },
      rateLimitStoreFactory: sharedStoreFactory,
    });

    await request(containerA).post('/api/auth/signup').send({});
    await request(containerB).post('/api/auth/signup').send({});
    await request(containerA).post('/api/auth/signup').send({});

    const onB = await request(containerB).post('/api/auth/signup').send({});
    expect(onB.status).toBe(429);
    const onA = await request(containerA).post('/api/auth/signup').send({});
    expect(onA.status).toBe(429);
  });
});
