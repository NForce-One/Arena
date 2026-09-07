import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  VERIFY_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(24),
  RESET_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(60),

  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

  RATE_LIMIT_ENABLED: z
    .string()
    .default('1')
    .transform((v) => v !== '0'),

  STORAGE_ADAPTER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('var/uploads'),
  PUBLIC_API_BASE_URL: z.string().default(''),
  S3_BUCKET: z.string().optional(),

  EMAIL_ADAPTER: z.enum(['console', 'ses']).default('console'),
  EMAIL_FROM: z.string().default('NForce Arena <no-reply@example.com>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration:\n${details}\n\nCopy .env.example to backend/.env (or set the equivalent variables in your deployment target) and fill in the values.`,
  );
}

export const env = Object.freeze(parsed.data);
