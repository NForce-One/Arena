import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { dbPing } from './lib/prisma';

const app = buildApp({ dbPing, rateLimit: env.RATE_LIMIT_ENABLED ? undefined : false });

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
