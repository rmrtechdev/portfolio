import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served from rmrtechdev.github.io/portfolio/
  base: '/portfolio/',
  server: { port: 3000 },
  // Tailnet names used by `tailscale serve` to reach the preview from other devices.
  preview: { allowedHosts: ['minimac', 'minimac.tail279361.ts.net'] },
  // three.js lands in its own lazy chunk (~240 KB gzip), loaded after first paint.
  build: { outDir: 'build', chunkSizeWarningLimit: 1000 },
});
