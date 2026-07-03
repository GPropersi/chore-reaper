import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('non-admin never sees the Admin tab', async ({ page }) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');

  await expect(page.getByTestId('admin-nav-link')).toHaveCount(0);
});

test('admin can add a user and see them appear in the list', async ({ page }) => {
  const token = await signE2eJwt('admin-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await expect(page.getByTestId('admin-nav-link')).toBeVisible();

  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.getByRole('button', { name: 'Add User' }).click();
  await page.getByLabel('Email').fill('new-e2e-user@example.com');
  await page.getByLabel('Role').selectOption('member');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('new-e2e-user@example.com')).toBeVisible();
});
