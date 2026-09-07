import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/server.ts'],
    format: ['esm'],
    target: 'node24',
    sourcemap: true,
    clean: true,
    noExternal: ['@nforce/shared'],
  },
  {
    entry: { lambda: 'src/lambda.ts' },
    format: ['esm'],
    target: 'node22',
    sourcemap: true,
    clean: false,
    noExternal: ['@nforce/shared'],
  },
]);
