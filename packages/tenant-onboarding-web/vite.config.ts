/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0033
 *
 * Vite/Vitest build + test configuration for the onboarding-web SPA.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // TWO entry points. blank.html is the Microsoft sign-in callback and must be BUILT, not served
      // from public/, so its bridge script is bundled and hash-injected. Without this input the file
      // is simply absent from dist/ and every sign-in fails on a 404 callback.
      input: {
        main: resolve(__dirname, 'index.html'),
        blank: resolve(__dirname, 'blank.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in the browser; Vite proxies /api to the NestJS server (IPv4 explicit,
    // to avoid an unrelated IPv6 localhost:3000 dev server on this machine). No CORS.
    proxy: { '/api': 'http://127.0.0.1:4610' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
