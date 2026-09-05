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

test('a brand-new offline profile fails to load rather than hanging or blank-screening', async ({
  browser,
}) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();

  await expect(page.goto('/')).rejects.toThrow();

  await context.close();
});
