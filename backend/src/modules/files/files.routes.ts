import { Router } from 'express';
import type { LocalDiskStorageAdapter } from '../../adapters/storage/LocalDiskStorageAdapter';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
};

const INLINE_IMAGE_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg']);

export function buildFileRoutes(storage: LocalDiskStorageAdapter): Router {
  const router = Router();

  router.get('/:key', async (req, res) => {
    const key = req.params.key ?? '';
    const exp = typeof req.query.exp === 'string' ? req.query.exp : '';
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

    const bytes = await storage.readSigned(key, exp, sig);
    if (!bytes) {
      res.status(404).json({
        error: { code: 'LINK_EXPIRED', message: 'This link has expired or is not valid.' },
      });
      return;
    }

    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Content-Type', contentType);
    if (!INLINE_IMAGE_EXTENSIONS.has(ext)) {
      res.setHeader('Content-Disposition', `attachment; filename="rules.${ext || 'bin'}"`);
    }
    res.send(bytes);
  });

  return router;
}
