import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Replit sets PORT and BASE_PATH; fall back to sane defaults for local runs.
const port = Number(process.env.PORT ?? 22913);
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  server: { port, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
  build: {
    outDir: process.env.SINGLE ? 'dist/single' : 'dist/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    // The single-file build also inlines models so the page needs no other files.
    assetsInlineLimit: process.env.SINGLE ? 20_000_000 : 4096,
    // SINGLE=1 makes one JS file (used to publish a shareable web build).
    // PAGE=planner or PAGE=armory with SINGLE=1 builds that page as one file instead of the game.
    rollupOptions: process.env.SINGLE
      ? { input: resolve(__dirname, process.env.PAGE ? `${process.env.PAGE}.html` : 'index.html'), output: { inlineDynamicImports: true } }
      : { input: { main: resolve(__dirname, 'index.html'), planner: resolve(__dirname, 'planner.html'), armory: resolve(__dirname, 'armory.html') } },
  },
});
