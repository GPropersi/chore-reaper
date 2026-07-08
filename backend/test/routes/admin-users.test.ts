import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedHouseholdMember } from '../helpers/seed.js';

async function authHeader(email: string) {
  const token = await signTestJwt({ email, aud: TEST_ACCESS_AUD });
  return { 'Cf-Access-Jwt-Assertion': token };
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)').bind('Household A', 'UTC'),
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (2, ?, ?)').bind('Household B', 'UTC'),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/admin/users', () => {
  it('returns every user with their household affiliations, for an admin caller', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    await env.DB.prepare('INSERT INTO household_members (user_id, household_id) VALUES (2, 2)').run();

    const res = await app.request(
      '/api/admin/users',
      { headers: await authHeader('admin@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: number; email: string; isAdmin: boolean; households: { id: number; name: string }[] }[];
    };
    const byEmail = new Map(body.data.map((u) => [u.email, u]));

    expect(byEmail.get('admin@example.com')).toMatchObject({ isAdmin: true, households: [{ id: 1 }] });
    const member = byEmail.get('member@example.com');
    expect(member?.isAdmin).toBe(false);
    expect(member?.households.map((h) => h.id).sort()).toEqual([1, 2]);
  });

  it('includes a user with zero household memberships', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await env.DB.prepare('INSERT INTO users (email, is_admin) VALUES (?, 0)')
      .bind('orphan@example.com')
      .run();

    const res = await app.request(
      '/api/admin/users',
      { headers: await authHeader('admin@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string; households: unknown[] }[] };
    const orphan = body.data.find((u) => u.email === 'orphan@example.com');
    expect(orphan?.households).toEqual([]);
  });

  it('succeeds for an admin who belongs to zero households themselves', async () => {
    await env.DB.prepare('INSERT INTO users (email, is_admin) VALUES (?, 1)')
      .bind('global-admin@example.com')
      .run();

    const res = await app.request(
      '/api/admin/users',
      { headers: await authHeader('global-admin@example.com') },
      testEnv(),
    );

    // Proves requireGlobalAdmin doesn't depend on the caller having any
    // household_members row — unlike householdScope, which would 401 here.
    expect(res.status).toBe(200);
  });

  it('returns 403 for a non-admin', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'member@example.com' });

    const res = await app.request(
      '/api/admin/users',
      { headers: await authHeader('member@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(403);
  });

  it('returns 401 for an unrecognized email', async () => {
    const res = await app.request(
      '/api/admin/users',
      { headers: await authHeader('ghost@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(401);
  });
});
