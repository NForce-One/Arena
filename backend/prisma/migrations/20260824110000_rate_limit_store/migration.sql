-- Shared, Postgres-backed rate-limit hit counters — replaces
-- express-rate-limit's default in-memory store, which silently resets per
-- Lambda execution environment (each concurrent container has its own
-- memory), letting the same real IP exceed the stated 5-attempts/15-min
-- limit whenever requests land on different containers. See
-- PostgresRateLimitStore / rateLimiters.ts.

CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);
