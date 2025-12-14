import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    react()
  ],
  output: 'server',
  adapter: vercel(),
  vite: {
    optimizeDeps: {
      include: ['@masonry-grid/react']
    }
  }
});
