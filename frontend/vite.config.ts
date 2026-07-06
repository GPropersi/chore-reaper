/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Local-only: `wrangler dev` enforces a real Cloudflare Access JWT on every
  // request, which a browser never sends. When VITE_DEV_ACCESS_JWT is set
  // (via a gitignored frontend/.env.development.local — see backend's
  // `dev-jwt` script), the dev proxy attaches it automatically so you can
  // just open the app in a normal browser tab. Unset in CI/production, and
  // `vite preview`'s proxy below is untouched, so this never reaches a
  // deployed build.
  const devAccessJwt = loadEnv(mode, process.cwd(), 'VITE_').VITE_DEV_ACCESS_JWT;

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'Chore Reaper',
          short_name: 'Chore Reaper',
          theme_color: '#4f46e5',
          background_color: '#111827',
          display: 'standalone',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@customTypes': fileURLToPath(new URL('../types', import.meta.url)),
        '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
        '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          configure: (proxy) => {
            if (!devAccessJwt) return;
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Cf-Access-Jwt-Assertion', devAccessJwt);
            });
          },
        },
      },
    },
    // `vite preview` (used by the e2e suite, per CLOUD_PLAN.md — a built, static
    // server avoids the cold-start JIT-compile flakiness of `vite dev`) has its
    // own proxy config, separate from `server.proxy` above.
    preview: {
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
    },
  };
});
