import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        work: resolve(__dirname, 'work.html')
      },
      output: {
        manualChunks: {
          three: ['three'],
          post: ['postprocessing']
        }
      }
    }
  },
  server: { host: true }
});
