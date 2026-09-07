import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.BACKEND_PORT || '3000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://localhost:${backendPort}`,
      },
    },
  };
});
