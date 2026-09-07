import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id: string }).id,
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
