import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

describe('app skeleton', () => {
  const app = buildApp();

  it('GET /api/health returns ok with db not yet configured', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db.status).toBe('not_configured');
  });

  it('unknown route returns the standard error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('/api/does-not-exist');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('echoes an inbound x-request-id for cross-system tracing', async () => {
    const res = await request(app).get('/api/health').set('x-request-id', 'trace-me-123');
    expect(res.headers['x-request-id']).toBe('trace-me-123');
  });
});
