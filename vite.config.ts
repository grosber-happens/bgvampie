import { defineConfig } from 'vite';

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
    rollupOptions: process.env.SINGLE ? { output: { inlineDynamicImports: true } } : {},
  },
});
