import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import rateLimit, { type IncrementResponse, type Options, type Store } from 'express-rate-limit';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

export const DEFAULT_AUTH_RATE_LIMIT: RateLimitConfig = { windowMs: 15 * 60_000, limit: 5 };

export class PostgresRateLimitStore implements Store {
  localKeys = false;
  windowMs = 0;

  constructor(
    readonly db: PrismaClient,
    readonly prefix: string,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const newResetAt = new Date(Date.now() + this.windowMs);
    const rows = await this.db.$queryRaw<{ count: number; reset_at: Date }[]>`
      INSERT INTO rate_limit_counters (key, count, reset_at)
      VALUES (${this.fullKey(key)}, 1, ${newResetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_counters.reset_at <= now() THEN 1
          ELSE rate_limit_counters.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_counters.reset_at <= now() THEN ${newResetAt}
          ELSE rate_limit_counters.reset_at
        END
      RETURNING count, reset_at
    `;
    const row = rows[0]!;
    return { totalHits: row.count, resetTime: row.reset_at };
  }

  async decrement(key: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE rate_limit_counters SET count = GREATEST(count - 1, 0) WHERE key = ${this.fullKey(key)}
    `;
  }

  async resetKey(key: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM rate_limit_counters WHERE key = ${this.fullKey(key)}`;
  }
}

export function makeAuthRateLimiter(config: RateLimitConfig, store?: Store): RequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(store ? { store } : {}),
    handler: (req, res) => {
      const info = (req as { rateLimit?: { resetTime?: Date } }).rateLimit;
      const resetTime = info?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(config.windowMs / 1000);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait and try again.',
          details: { retryAfterSeconds },
          requestId: req.id,
        },
      });
    },
  });
}

export interface LoginAttemptTracker {
  recordFailure(key: string): Promise<{ count: number; resetTime: Date }>;
  clear(key: string): Promise<void>;
}

export type WindowedStore = Store & { windowMs: number };

export function makeLoginAttemptTracker(
  store: WindowedStore,
  windowMs: number,
): LoginAttemptTracker {
  store.windowMs = windowMs;
  return {
    async recordFailure(key) {
      const { totalHits, resetTime } = await store.increment(key);
      return { count: totalHits, resetTime: resetTime ?? new Date(Date.now() + windowMs) };
    },
    async clear(key) {
      await store.resetKey(key);
    },
  };
}
