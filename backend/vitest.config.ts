import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
      DIRECT_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
      JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      WEB_ORIGIN: 'http://localhost:5173',
    },
  },
});
