import serverlessExpress from '@codegenie/serverless-express';
import { buildApp } from './app';
import { env } from './config/env';
import { dbPing } from './lib/prisma';

const app = buildApp({ dbPing, rateLimit: env.RATE_LIMIT_ENABLED ? undefined : false });

export const handler = serverlessExpress({ app });
