import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  createJoinRequest,
  listPendingJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
} from '../src/join-requests.js';
import { seedHouseholdMember, seedAdditionalMembership } from './helpers/seed.js';

const HOUSEHOLD_A = 1;
const HOUSEHOLD_B = 2;

beforeEach(async () => {
  await env.DB.exec('DELETE FROM join_requests');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (?, ?, ?)').bind(
      HOUSEHOLD_A,
      'Household A',
      'UTC',
    ),
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (?, ?, ?)').bind(
      HOUSEHOLD_B,
      'Household B',
      'UTC',
    ),
  ]);
  await seedHouseholdMember({ id: 1, householdId: HOUSEHOLD_A, email: 'member-a@example.com' });
});

describe('createJoinRequest', () => {
  it('creates a pending request for a brand-new email', async () => {
    const result = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('expected created');
    expect(result.request).toMatchObject({
      householdId: HOUSEHOLD_A,
      requestedEmail: 'new@example.com',
      status: 'pending',
    });
  });

  it('normalizes the email (trim + lowercase)', async () => {
    const result = await createJoinRequest(env.DB, HOUSEHOLD_A, '  New@Example.com  ', 1);
    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('expected created');
    expect(result.request.requestedEmail).toBe('new@example.com');
  });

  it('rejects an email that already has an account', async () => {
    const result = await createJoinRequest(env.DB, HOUSEHOLD_A, 'member-a@example.com', 1);
    expect(result.status).toBe('already_registered');
  });

  it('rejects a duplicate pending request for the same household+email', async () => {
    await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    const result = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    expect(result.status).toBe('duplicate');
  });

  it('allows the same email to be requested for a different household', async () => {
    await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    const result = await createJoinRequest(env.DB, HOUSEHOLD_B, 'new@example.com', 1);
    expect(result.status).toBe('created');
  });
});

describe('listPendingJoinRequests', () => {
  it('lists only pending requests, joined with household name and requester email', async () => {
    await createJoinRequest(env.DB, HOUSEHOLD_A, 'pending@example.com', 1);
    const denied = await createJoinRequest(env.DB, HOUSEHOLD_A, 'denied@example.com', 1);
    if (denied.status !== 'created') throw new Error('expected created');
    await denyJoinRequest(env.DB, denied.request.id, 1);

    const list = await listPendingJoinRequests(env.DB);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      requestedEmail: 'pending@example.com',
      householdName: 'Household A',
      requestedByEmail: 'member-a@example.com',
      status: 'pending',
    });
  });
});

describe('approveJoinRequest', () => {
  it('returns not_found for an unknown id', async () => {
    const result = await approveJoinRequest(env.DB, 999, 1);
    expect(result.status).toBe('not_found');
  });

  it('returns already_resolved for a request that was already denied', async () => {
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');
    await denyJoinRequest(env.DB, created.request.id, 1);

    const result = await approveJoinRequest(env.DB, created.request.id, 1);
    expect(result.status).toBe('already_resolved');
  });

  it('creates the user and household membership, marking the request approved', async () => {
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');

    const result = await approveJoinRequest(env.DB, created.request.id, 1);
    expect(result.status).toBe('approved');
    if (result.status !== 'approved') throw new Error('expected approved');
    expect(result.member).toMatchObject({ email: 'new@example.com', householdId: HOUSEHOLD_A });

    const row = await env.DB.prepare('SELECT status, resolved_by FROM join_requests WHERE id = ?')
      .bind(created.request.id)
      .first<{ status: string; resolved_by: number }>();
    expect(row).toMatchObject({ status: 'approved', resolved_by: 1 });

    const userRow = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind('new@example.com')
      .first<{ id: number }>();
    expect(userRow).toBeTruthy();
  });

  it('preserves the original requester as invited_by, not the approving admin', async () => {
    await seedHouseholdMember({ id: 2, householdId: HOUSEHOLD_A, email: 'admin@example.com', isAdmin: true });
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');

    await approveJoinRequest(env.DB, created.request.id, 2);

    const membership = await env.DB.prepare(
      'SELECT invited_by FROM household_members WHERE user_id = (SELECT id FROM users WHERE email = ?)',
    )
      .bind('new@example.com')
      .first<{ invited_by: number }>();
    expect(membership?.invited_by).toBe(1);
  });

  it('returns a null member when the requested email became an existing member before approval', async () => {
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'race@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');
    // Someone else added this email directly while the request was pending.
    await env.DB.prepare('INSERT INTO users (email, is_admin) VALUES (?, 0)').bind('race@example.com').run();
    const userId = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind('race@example.com')
      .first<{ id: number }>();
    await seedAdditionalMembership(userId!.id, HOUSEHOLD_A);

    const result = await approveJoinRequest(env.DB, created.request.id, 1);
    expect(result.status).toBe('approved');
    if (result.status !== 'approved') throw new Error('expected approved');
    expect(result.member).toBeNull();
  });
});

describe('denyJoinRequest', () => {
  it('returns not_found for an unknown id', async () => {
    const result = await denyJoinRequest(env.DB, 999, 1);
    expect(result).toBe('not_found');
  });

  it('marks a pending request denied with no side effects on users/household_members', async () => {
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');

    const result = await denyJoinRequest(env.DB, created.request.id, 1);
    expect(result).toBe('denied');

    const userRow = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind('new@example.com')
      .first();
    expect(userRow).toBeNull();
  });

  it('returns already_resolved for a request that was already approved', async () => {
    const created = await createJoinRequest(env.DB, HOUSEHOLD_A, 'new@example.com', 1);
    if (created.status !== 'created') throw new Error('expected created');
    await approveJoinRequest(env.DB, created.request.id, 1);

    const result = await denyJoinRequest(env.DB, created.request.id, 1);
    expect(result).toBe('already_resolved');
  });
});
