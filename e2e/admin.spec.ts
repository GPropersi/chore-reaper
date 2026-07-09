import { test, expect } from '@playwright/test';
import { signE2eJwt } from './sign-jwt.js';

test('non-admin sees a plain "House" tab, can view it, but cannot add a brand-new user directly — can request instead', async ({
  page,
}) => {
  const token = await signE2eJwt('member-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await expect(page.getByTestId('admin-nav-link')).toHaveText('House');

  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Member' }).click();
  const modal = page.getByTestId('add-member-modal-backdrop');
  await modal.getByLabel('Email').fill('brand-new-e2e@example.com');
  await modal.getByRole('button', { name: 'Save' }).click();

  // The rejection text now renders inside the modal (portal content, still
  // attached to document.body) rather than the old page-level banner.
  await expect(page.getByText(/ask a household admin/i)).toBeVisible();

  await modal.getByRole('button', { name: 'Ask an admin to add this person' }).click();
  await expect(modal.getByText('Request sent — an admin will review it.')).toBeVisible();
});

test('admin sees the pending join request and can approve it', async ({ page }) => {
  const token = await signE2eJwt('admin-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  const requestList = page.getByTestId('join-request-list');
  await expect(requestList.getByText('brand-new-e2e@example.com')).toBeVisible();

  await requestList.getByRole('button', { name: 'Approve' }).click();

  await expect(requestList.getByText('brand-new-e2e@example.com')).not.toBeVisible();
  await expect(page.getByTestId('member-list').getByText('brand-new-e2e@example.com')).toBeVisible();
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
  await modal.getByRole('button', { name: 'Save' }).click();

  // Scoped to the member list, not a bare page-wide getByText: with fixture
  // Cloudflare credentials in this environment, the Access allow-list grant
  // fails gracefully and surfaces a warning banner that also contains this
  // email as text, so an unscoped locator matches both and is ambiguous.
  await expect(page.getByTestId('member-list').getByText('new-e2e-member@example.com')).toBeVisible();
});

test('admin can add a user to a household other than their own current one via the searchable dropdown', async ({
  page,
}) => {
  const token = await signE2eJwt('admin-e2e@example.com');
  await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });

  await page.goto('/');
  await page.getByTestId('admin-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByRole('button', { name: 'Add User' }).click();
  const modal = page.getByTestId('add-user-modal-backdrop');
  await modal.getByLabel('Household').fill('Household B');
  await modal.getByRole('option', { name: 'E2E Household B' }).click();
  await modal.getByLabel('Email').fill('other-house-e2e@example.com');
  await modal.getByRole('button', { name: 'Save' }).click();

  // Household B isn't the currently-viewed household, so the member list here
  // stays unchanged and a confirmation shows instead. The admin isn't a member
  // of Household B themselves, so the frontend's `memberships` list (which
  // only covers the viewer's own households) can't resolve its name — it
  // falls back to generic wording rather than guessing.
  await expect(page.getByText('Added other-house-e2e@example.com to the selected household.')).toBeVisible();
  await expect(page.getByTestId('member-list').getByText('other-house-e2e@example.com')).not.toBeVisible();
});
