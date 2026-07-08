import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('non-admin sees a plain "House" tab, can view it, but cannot add a brand-new user', async ({ page }) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await expect(page.getByTestId('admin-nav-link')).toHaveText('House');

  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Member' }).click();
  const modal = page.getByTestId('add-member-modal-backdrop');
  await modal.getByLabel('Email').fill('brand-new-e2e@example.com');
  await modal.getByLabel('Role').selectOption('user');
  await modal.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(/ask a household admin/i)).toBeVisible();
});

test('admin can add a member and see them appear in the list', async ({ page }) => {
  const token = await signE2eJwt('admin-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await expect(page.getByTestId('admin-nav-link')).toHaveText('House / Admin');

  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Member' }).click();
  // Scoped to the modal: the Admin page now also has a Household section
  // with its own "Save" button, so an unscoped locator is ambiguous.
  const modal = page.getByTestId('add-member-modal-backdrop');
  await modal.getByLabel('Email').fill('new-e2e-member@example.com');
  await modal.getByLabel('Role').selectOption('user');
  await modal.getByRole('button', { name: 'Save' }).click();

  // Scoped to the member list, not a bare page-wide getByText: with fixture
  // Cloudflare credentials in this environment, the Access allow-list grant
  // fails gracefully and surfaces a warning banner that also contains this
  // email as text, so an unscoped locator matches both and is ambiguous.
  await expect(page.getByTestId('member-list').getByText('new-e2e-member@example.com')).toBeVisible();
});
