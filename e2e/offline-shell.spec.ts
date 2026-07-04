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

test('a brand-new offline profile fails to load rather than hanging or blank-screening', async ({
  browser,
}) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();

  await expect(page.goto('/')).rejects.toThrow();

  await context.close();
});
