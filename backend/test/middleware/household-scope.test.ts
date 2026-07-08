import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { householdScope } from '../../src/middleware/household-scope.js';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedHouseholdMember, seedAdditionalMembership } from '../helpers/seed.js';
import type { AppEnv } from '../../src/types.js';

const ROOM_A = 1;
const ROOM_B = 2;

function validChoreBody(roomId: number) {
  return {
    name: 'Vacuum',
    roomId,
    dateLastCompleted: '2026-06-01T00:00:00.000Z',
    duration: 20,
    frequency: 7,
  };
}

function appWithStubEmail(email: string) {
  const stubApp = new Hono<AppEnv>();
  stubApp.use('*', async (c, next) => {
    c.set('verifiedEmail', email);
    await next();
  });
  stubApp.use('*', householdScope);
  stubApp.get('/whoami', (c) =>
    c.json({
      userId: c.var.userId,
      householdId: c.var.householdId,
      role: c.var.role,
      timezone: c.var.timezone,
    }),
  );
  return stubApp;
}

async function seedHouseholdsAndUsers() {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)').bind('Household A', 'UTC'),
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (2, ?, ?)').bind('Household B', 'UTC'),
    env.DB.prepare('INSERT INTO rooms (id, household_id, name) VALUES (?, 1, ?)').bind(ROOM_A, 'Living Room'),
    env.DB.prepare('INSERT INTO rooms (id, household_id, name) VALUES (?, 2, ?)').bind(ROOM_B, 'Living Room'),
  ]);
  await seedHouseholdMember({
    id: 1,
    householdId: 1,
    email: 'admin-a@example.com',
    role: 'admin',
    timezone: 'America/Chicago',
  });
  await seedHouseholdMember({ id: 2, householdId: 2, email: 'admin-b@example.com', role: 'admin' });
  await seedHouseholdMember({ id: 3, householdId: 1, email: 'member-a@example.com', role: 'user' });
}

function authHeader(email: string) {
  return signTestJwt({ email, aud: TEST_ACCESS_AUD }).then((token) => ({ 'Cf-Access-Jwt-Assertion': token }));
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('householdScope', () => {
  it('attaches {id, householdId, role, timezone} for a matching users row', async () => {
    await seedHouseholdsAndUsers();

    const res = await appWithStubEmail('member-a@example.com').request('/whoami', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 3, householdId: 1, role: 'user', timezone: null });
  });

  it('rejects with 401 (not 500) when the verified email has no matching users row', async () => {
    const res = await appWithStubEmail('ghost@example.com').request('/whoami', {}, env);

    expect(res.status).toBe(401);
  });

  it('resolves household 1 without a header when the user has exactly one membership (zero-friction single-household case)', async () => {
    await seedHouseholdsAndUsers();

    const res = await appWithStubEmail('admin-a@example.com').request('/whoami', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ householdId: 1, role: 'admin' });
  });

  describe('multi-household membership', () => {
    it('resolves to the household named by X-Household-Id when the user belongs to more than one', async () => {
      await seedHouseholdsAndUsers();
      await seedAdditionalMembership(1, 2, 'user');

      const res = await appWithStubEmail('admin-a@example.com').request(
        '/whoami',
        { headers: { 'X-Household-Id': '2' } },
        env,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ householdId: 2, role: 'user' });
    });

    it('never leaks the other household just because the same email/JWT is used', async () => {
      await seedHouseholdsAndUsers();
      await seedAdditionalMembership(1, 2, 'user');

      const resHouseholdA = await appWithStubEmail('admin-a@example.com').request(
        '/whoami',
        { headers: { 'X-Household-Id': '1' } },
        env,
      );
      const resHouseholdB = await appWithStubEmail('admin-a@example.com').request(
        '/whoami',
        { headers: { 'X-Household-Id': '2' } },
        env,
      );

      expect((await resHouseholdA.json()) as { householdId: number }).toMatchObject({ householdId: 1 });
      expect((await resHouseholdB.json()) as { householdId: number }).toMatchObject({ householdId: 2 });
    });

    it('resolves to the lowest-id membership (not a hard error) when multiple exist and no header is given', async () => {
      await seedHouseholdsAndUsers();
      await seedAdditionalMembership(1, 2, 'user');

      const res = await appWithStubEmail('admin-a@example.com').request('/whoami', {}, env);

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ householdId: 1, role: 'admin' });
    });

    it('resolving without a header is consistent every time — never alternates between memberships', async () => {
      await seedHouseholdsAndUsers();
      await seedAdditionalMembership(1, 2, 'user');

      const first = await appWithStubEmail('admin-a@example.com').request('/whoami', {}, env);
      const second = await appWithStubEmail('admin-a@example.com').request('/whoami', {}, env);

      expect((await first.json()) as { householdId: number }).toMatchObject({ householdId: 1 });
      expect((await second.json()) as { householdId: number }).toMatchObject({ householdId: 1 });
    });

    it('returns 403 when X-Household-Id names a real household the user is not a member of', async () => {
      await seedHouseholdsAndUsers();

      const res = await appWithStubEmail('admin-a@example.com').request(
        '/whoami',
        { headers: { 'X-Household-Id': '2' } },
        env,
      );

      expect(res.status).toBe(403);
    });

    it("reads the CURRENT household's per-membership role, not a stale one from another household", async () => {
      await seedHouseholdsAndUsers();
      // admin-a is admin of household 1, but only a 'user' role member of household 2.
      await seedAdditionalMembership(1, 2, 'user');

      // Adding a brand-new user is the one action still gated on role — proves
      // the role read here is household 2's ('user'), not household 1's
      // ('admin'), even though it's the same person via the same JWT.
      const res = await app.request(
        '/api/members',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Household-Id': '2',
            ...(await authHeader('admin-a@example.com')),
          },
          body: JSON.stringify({ email: 'brand-new@example.com', role: 'user' }),
        },
        testEnv(),
      );

      expect(res.status).toBe(403);
    });
  });
});

describe('cross-household access through the full app', () => {
  it('returns 404 (not 403) when a user requests a chore id belonging to a different household', async () => {
    await seedHouseholdsAndUsers();

    const createRes = await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-b@example.com')) },
        body: JSON.stringify(validChoreBody(ROOM_B)),
      },
      testEnv(),
    );
    const householdBChore = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await app.request(
      `/api/chores/${householdBChore.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_A), version: 1 }),
      },
      testEnv(),
    );

    expect(res.status).toBe(404);
  });

  it("never includes another household's chores in GET /api/chores", async () => {
    await seedHouseholdsAndUsers();

    await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_A), name: 'Household A Chore' }),
      },
      testEnv(),
    );
    await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-b@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_B), name: 'Household B Chore' }),
      },
      testEnv(),
    );

    const res = await app.request(
      '/api/chores',
      { headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Household A Chore');
  });
});

describe('member permissions on /api/members/*', () => {
  it('GET is accessible to a non-admin member (open household privileges)', async () => {
    await seedHouseholdsAndUsers();

    const res = await app.request(
      '/api/members',
      { headers: await authHeader('member-a@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(200);
  });

  it('a non-admin member can add someone who already has an account elsewhere', async () => {
    await seedHouseholdsAndUsers();

    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'admin-b@example.com', role: 'user' }),
      },
      testEnv(),
    );

    expect(res.status).toBe(201);
  });

  it('a non-admin member cannot add a brand-new user (403)', async () => {
    await seedHouseholdsAndUsers();

    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'brand-new@example.com', role: 'user' }),
      },
      testEnv(),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ask a household admin/i);
  });
});
