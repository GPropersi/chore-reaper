import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('Settings modal renders the Notifications section', async ({ page }) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  // Wait for the chores view to be ready before opening Settings.
  await expect(page.getByTestId('chore-bar').first()).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();

  // Scope assertions to the modal, per the admin.spec.ts modal-scoping convention.
  const modal = page.getByTestId('settings-modal-backdrop');
  await expect(modal).toBeVisible();
  // Exact match targets the plain-<p> section label, not the "Enable push
  // notifications" toggle label that also contains the word.
  await expect(modal.getByText('Notifications', { exact: true })).toBeVisible();
});
