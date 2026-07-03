import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'node jwks-server.mjs',
      cwd: './e2e',
      port: 8790,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      cwd: './backend',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // A built + `vite preview` server, not `vite dev` — avoids the cold-start
      // JIT-compile latency of the dev server, which was flaky enough to
      // intermittently fail the first assertion after `page.goto('/')`.
      command: 'npm run build && npm run preview -- --port 5173 --strictPort',
      cwd: './frontend',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
