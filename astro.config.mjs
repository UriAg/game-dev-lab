import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  integrations: [preact()],
  vite: { build: { target: 'esnext', chunkSizeWarningLimit: 3000 }, worker: { format: 'es' } },
});
