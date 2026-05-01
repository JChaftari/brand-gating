import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Shopify CLI sets HOST (the dev tunnel) and PORT (the assigned local port)
// when it runs the frontend role. We expose SHOPIFY_API_KEY to import.meta.env
// (and to %SHOPIFY_API_KEY% in index.html) via envPrefix.
export default defineConfig(() => {
  const host = process.env.HOST?.replace(/^https?:\/\//, '');

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'SHOPIFY_'],
    server: {
      host: 'localhost',
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: true,
      hmr: host
        ? {
            protocol: 'wss',
            host,
            clientPort: 443,
          }
        : undefined,
    },
  };
});
