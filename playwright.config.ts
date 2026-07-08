import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // All spec files share one seeded household against one local D1 (global-setup
  // runs once for the whole suite, not per file) — offline-outbox.spec.ts in
  // particular creates/deletes real chores against it mid-test. `fullyParallel:
  // false` only serializes tests *within* a file; different files still land on
  // separate workers by default and can race each other's mutations, which is
  // what caused timezone-parity.spec.ts to intermittently see 3 chores instead
  // of the 2 seeded ones. `workers: 1` forces every file to run strictly
  // serially against the shared state.
  workers: 1,
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
      // `url` (not `port`) so readiness waits for an actual HTTP 2xx/3xx response,
      // not just the TCP listener binding — the static-file middleware can lag
      // a moment behind the port opening, which showed up as a 404 on the very
      // first navigation once vite-plugin-pwa's extra build step made this gap
      // wide enough to hit reliably.
      command: 'npm run build && npm run preview -- --port 5173 --strictPort',
      cwd: './frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
