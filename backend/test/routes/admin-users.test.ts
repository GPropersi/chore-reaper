import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD, TEST_JWKS_URL } from '../helpers/access-test-env.js';
import { seedHouseholdMember, seedAdditionalMembership } from '../helpers/seed.js';
import { cleanupProtectedOwnerRow } from '../helpers/protected-owner.js';
import primaryJwks from '../fixtures/test-jwks.json' with { type: 'json' };

const ACCESS_ALLOWLIST_ENV = {
  CLOUDFLARE_ACCESS_API_TOKEN: 'test-token',
  CF_ACCOUNT_ID: 'test-account',
  ACCESS_POLICY_ID: 'test-policy',
};

const POLICY_URL = 'https://api.cloudflare.com/client/v4/accounts/test-account/access/policies/test-policy';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubJwksAndPolicy(policyInclude: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === TEST_JWKS_URL) return jsonResponse(primaryJwks);
    if (url === POLICY_URL && init?.method === 'PUT') {
      return jsonResponse({
        result: { decision: 'allow', include: JSON.parse(init.body as string).include },
      });
    }
    if (url === POLICY_URL) return jsonResponse({ result: { decision: 'allow', include: policyInclude } });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function authHeader(email: string) {
  const token = await signTestJwt({ email, aud: TEST_ACCESS_AUD });
  return { 'Cf-Access-Jwt-Assertion': token };
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM join_requests');
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

describe('DELETE /api/admin/users/:id', () => {
  it('returns 403 for a non-admin', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('member@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when the caller targets their own account', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });

    const res = await app.request(
      '/api/admin/users/1',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(400);

    const stillThere = await env.DB.prepare('SELECT id FROM users WHERE id = 1').first();
    expect(stillThere).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });

    const res = await app.request(
      '/api/admin/users/999',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when another admin targets the protected owner account, and leaves it in place', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'giovannigp@gmail.com', isAdmin: true });

    try {
      const res = await app.request(
        '/api/admin/users/2',
        { method: 'DELETE', headers: await authHeader('admin@example.com') },
        testEnv(),
      );
      expect(res.status).toBe(403);

      const stillThere = await env.DB.prepare('SELECT id FROM users WHERE id = 2').first();
      expect(stillThere).not.toBeNull();
    } finally {
      // This row is (correctly) never deletable through the app, so it
      // would otherwise survive into every other test file's own blanket
      // `DELETE FROM users` reset — see cleanupProtectedOwnerRow's own
      // comment for why.
      await cleanupProtectedOwnerRow(env.DB, 2);
    }
  });

  it('deletes the user and their memberships across every household', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    await seedAdditionalMembership(2, 2);

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);

    const userRow = await env.DB.prepare('SELECT id FROM users WHERE id = 2').first();
    expect(userRow).toBeNull();
    const memberships = await env.DB.prepare('SELECT id FROM household_members WHERE user_id = 2').all();
    expect(memberships.results).toHaveLength(0);
  });

  it('clears invited_by on rows the deleted user invited, instead of blocking the delete', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (3, ?)').bind('invitee@example.com').run();
    await env.DB.prepare(
      'INSERT INTO household_members (user_id, household_id, invited_by) VALUES (3, 1, 2)',
    ).run();

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);

    const invitedRow = await env.DB.prepare(
      'SELECT invited_by FROM household_members WHERE user_id = 3',
    ).first<{ invited_by: number | null }>();
    expect(invitedRow?.invited_by).toBeNull();
  });

  it('deletes pending join requests the user made, rather than leaving them orphaned', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member@example.com')) },
        body: JSON.stringify({ email: 'requested@example.com' }),
      },
      testEnv(),
    );

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);

    const requests = await env.DB.prepare('SELECT id FROM join_requests WHERE requested_by = 2').all();
    expect(requests.results).toHaveLength(0);
  });

  it('revokes Cloudflare Access on deletion', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    const fetchMock = stubJwksAndPolicy([{ email: { email: 'member@example.com' } }]);

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { warning?: string };
    expect(body.warning).toBeUndefined();

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const putBody = JSON.parse(putCalls[0][1]!.body as string);
    expect(putBody.include).toEqual([]);
  });

  it('surfaces a warning but still deletes the user when the Access API fails', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === TEST_JWKS_URL) return jsonResponse(primaryJwks);
        return new Response('nope', { status: 500 });
      }),
    );

    const res = await app.request(
      '/api/admin/users/2',
      { method: 'DELETE', headers: await authHeader('admin@example.com') },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { warning?: string };
    expect(body.warning).toContain('Zero Trust dashboard');

    const userRow = await env.DB.prepare('SELECT id FROM users WHERE id = 2').first();
    expect(userRow).toBeNull();
  });
});

describe('POST /api/admin/users/:id/promote', () => {
  it('returns 403 for a non-admin', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });

    const res = await app.request(
      '/api/admin/users/2/promote',
      { method: 'POST', headers: await authHeader('member@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(403);

    const stillMember = await env.DB.prepare('SELECT is_admin FROM users WHERE id = 2').first<{
      is_admin: number;
    }>();
    expect(stillMember?.is_admin).toBe(0);
  });

  it('returns 404 for an unknown id', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });

    const res = await app.request(
      '/api/admin/users/999/promote',
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('grants global admin and returns the updated user', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
    await seedAdditionalMembership(2, 2);

    const res = await app.request(
      '/api/admin/users/2/promote',
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: number; email: string; isAdmin: boolean; households: { id: number }[] };
    };
    expect(body.data).toMatchObject({ id: 2, email: 'member@example.com', isAdmin: true });
    expect(body.data.households.map((h) => h.id).sort()).toEqual([1, 2]);

    const userRow = await env.DB.prepare('SELECT is_admin FROM users WHERE id = 2').first<{
      is_admin: number;
    }>();
    expect(userRow?.is_admin).toBe(1);
  });

  it('does not touch household_members.role', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
    await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });

    await app.request(
      '/api/admin/users/2/promote',
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );

    const membership = await env.DB.prepare(
      'SELECT role FROM household_members WHERE user_id = 2 AND household_id = 1',
    ).first<{ role: string }>();
    expect(membership?.role).toBe('member');
  });
});
