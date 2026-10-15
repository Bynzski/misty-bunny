import { defineConfig } from 'vite';

export default defineConfig({
  // The game is served from the root of its own hostname by Caddy, so assets
  // are addressed from '/' rather than relatively. A relative base happens to
  // work while the page is only ever loaded at "/", but it silently resolves
  // against whatever path the document was requested at, which is the wrong
  // answer the moment anything serves this build from a subdirectory.
  base: '/',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    // No sourcemaps: nothing about a production build needs them, and a map
    // beside the bundle republishes the readable source of every module.
    sourcemap: false,
    // The bundle is one three.js scene plus the game; splitting it would only
    // add a second request the first frame has to wait on.
    chunkSizeWarningLimit: 1024,
  },
});