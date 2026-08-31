import path from 'node:path';
import preact from '@preact/preset-vite';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Stamped into the GFX request URLs so a deploy invalidates the day-long
// /gfx/** browser cache. Filenames there are stable, so without this a changed
// .egf stays invisible to returning clients for up to 24 hours.
const buildId = Date.now().toString(36);

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [preact(), tailwind()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    port: 3000,
  },
});
