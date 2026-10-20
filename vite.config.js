import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';
import jarvisVault from './vault/jarvisVault.js';

export default defineConfig({
  plugins: [
    react(),
    jarvisVault('vault/jarvis.glb'),
    // Production only, and only the Jarvis modules: the rest of the site stays plainly minified.
    {
      ...obfuscator({
        include: ['**/src/three/jarvis/**'],
        options: {
          compact: true,
          identifierNamesGenerator: 'hexadecimal',
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 1,
          // Light enough not to cost frame time in the render loop.
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.3,
          splitStrings: true,
          splitStringsChunkLength: 8,
          transformObjectKeys: true,
          unicodeEscapeSequence: false,
        },
      }),
      apply: 'build',
    },
  ],
  // Served from rmrtechdev.github.io/portfolio/
  base: '/portfolio/',
  // host: reachable from phones on the LAN for on-device review. HTTPS (npm run dev:https) is needed for iOS
  // motion permission; the cert covers the LAN IP at the time of `npm run cert:dev`, so rerun it if the IP changes.
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['minimac', 'minimac.tail279361.ts.net'],
    https: process.env.DEV_HTTPS ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') } : undefined,
  },
  // Tailnet names used by `tailscale serve` to reach the preview from other devices.
  preview: { allowedHosts: ['minimac', 'minimac.tail279361.ts.net'] },
  // three.js lands in its own lazy chunk (~240 KB gzip), loaded after first paint.
  build: { outDir: 'build', chunkSizeWarningLimit: 1000 },
});
