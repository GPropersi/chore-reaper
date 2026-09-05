import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('the app shell loads offline after a prior visit installed the service worker', async ({
  page,
  context,
}) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await expect(page.locator('#NavBar')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.goto('/');

  await expect(page.locator('#NavBar')).toBeVisible();
});

test('a denylisted path is not served the cached SPA shell while offline', async ({ page, context }) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  // Prime the service worker with an online visit first — the whole point of
  // this test is that a *denylisted* navigation is treated differently from
  // the plain-shell navigation the first test covers.
  await page.goto('/');
  await expect(page.locator('#NavBar')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);

  // `/api/*` matches the SW's navigateFallbackDenylist (/^\/api\//), so this
  // top-level navigation must BYPASS the cached index.html fallback and hit the
  // network — which, offline, fails — rather than being served the stale shell.
  // If the denylist regressed, the SW would answer with index.html and this
  // navigation would resolve with the shell markup (#NavBar visible) instead of
  // rejecting. Reaching the network (and failing offline) is exactly what lets
  // Cloudflare Access re-authenticate a recovery navigation in production.
  await expect(page.goto('/api/chores')).rejects.toThrow();
});

test('Retry unregisters the active service worker so the recovery navigation hits the network (DD-1)', async ({
  page,
}) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  // Prime a real, installed service worker with an online visit first — this is
  // exactly the returning/installed-user state DD-1 targets, where `/` (not
  // denylisted) would otherwise be answered the stale precached shell.
  await page.goto('/');
  await expect(page.locator('#NavBar')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Force the stale-session ("Retry to sign in") banner: /api/chores is
  // denylisted from the SW fallback, so this 401 reaches ChoresView and flips
  // it to the online+stale state that renders the Retry button.
  await page.route('**/api/chores', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Unauthorized' }),
    }),
  );
  await page.reload();
  await expect(page.getByTestId('status-banner-action')).toBeVisible();

  // The SW is installed and controlling at this point.
  const before = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  expect(before).toBeGreaterThan(0);

  // Keep the SW from silently re-installing after the Retry navigation, so the
  // "it was torn down" assertion has a deterministic window — the behavior
  // under test is that Retry unregisters it, not whether it later re-installs.
  await page.addInitScript(() => {
    navigator.serviceWorker.register = () => new Promise<ServiceWorkerRegistration>(() => {});
  });

  await page.getByTestId('status-banner-action').click();

  // Retry unregistered the SW before navigating — a deterministic proxy for
  // "the recovery navigation is a real network navigation, not a SW-served
  // cache hit," which is what lets Cloudflare Access re-authenticate.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)))
    .toBe(0);
});

test('a brand-new offline profile fails to load rather than hanging or blank-screening', async ({
  browser,
}) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();

  await expect(page.goto('/')).rejects.toThrow();

  await context.close();
});
