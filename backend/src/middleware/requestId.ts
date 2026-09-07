import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers['x-request-id'];
  req.id = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
