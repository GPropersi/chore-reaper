import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD, TEST_JWKS_URL } from '../helpers/access-test-env.js';
import { seedHouseholdMember } from '../helpers/seed.js';
import primaryJwks from '../fixtures/test-jwks.json' with { type: 'json' };

const ACCESS_ALLOWLIST_ENV = {
  CLOUDFLARE_ACCESS_API_TOKEN: 'test-token',
  CF_ACCOUNT_ID: 'test-account',
  ACCESS_POLICY_ID: 'test-policy',
};

// Reusable policies are edited via the standalone endpoint, not an
// app-nested path — see access-allowlist.ts.
const POLICY_URL = 'https://api.cloudflare.com/client/v4/accounts/test-account/access/policies/test-policy';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Stubs both the JWKS endpoint (needed for accessAuth to verify the request's
// own JWT) and the Cloudflare Access policy endpoint the route calls out to
// after adding a member, so these tests can exercise the real
// grantAccessListEntry implementation end-to-end rather than re-stubbing its
// already-covered internals (see access-allowlist.test.ts for those cases).
function stubJwksAndPolicy(policyInclude: unknown[], putStatus = 200) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === TEST_JWKS_URL) return jsonResponse(primaryJwks);
    if (url === POLICY_URL && init?.method === 'PUT') {
      return jsonResponse(
        { result: { decision: 'allow', include: JSON.parse(init.body as string).include } },
        putStatus,
      );
    }
    if (url === POLICY_URL) return jsonResponse({ result: { decision: 'allow', include: policyInclude } });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function policyCalls(fetchMock: ReturnType<typeof stubJwksAndPolicy>) {
  return fetchMock.mock.calls.filter(([input]) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    return url === POLICY_URL;
  });
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
  await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin-a@example.com', isAdmin: true });
  await seedHouseholdMember({ id: 2, householdId: 2, email: 'admin-b@example.com', isAdmin: true });
  await seedHouseholdMember({ id: 3, householdId: 1, email: 'member-a@example.com' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/members', () => {
  it('returns 403 for a non-admin adding a brand-new user (no account anywhere yet)', async () => {
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('allows a non-admin to add an email that already has an account elsewhere', async () => {
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'admin-b@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
  });

  it('creates a member scoped to the admin own household, ignoring a different householdId in the body', async () => {
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com', householdId: 2 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { householdId: number; email: string } };
    expect(body.data.householdId).toBe(1);
    expect(body.data.email).toBe('new@example.com');
  });

  it('normalizes the email (trim + lowercase) when creating a member', async () => {
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: '  New@Example.com  ' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe('new@example.com');
  });

  it('lets a member authenticate regardless of email-casing differences between creation and login', async () => {
    const createRes = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'Jane@Example.com' }),
      },
      testEnv(),
    );
    expect(createRes.status).toBe(201);

    const meRes = await app.request('/api/me', { headers: await authHeader('JANE@EXAMPLE.com') }, testEnv());

    expect(meRes.status).toBe(200);
  });

  it('adding an email that already belongs to another household creates only a new membership, not a duplicate account', async () => {
    // admin-b@example.com already has a users row (household 2) from beforeEach —
    // adding them to household 1 must not touch/duplicate that row.
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'admin-b@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { householdId: number; isAdmin: boolean } };
    expect(body.data.householdId).toBe(1);
    // admin-b is a global admin from their original household — that status
    // carries over here rather than resetting for the new membership.
    expect(body.data.isAdmin).toBe(true);

    const usersCount = await env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?')
      .bind('admin-b@example.com')
      .first<{ count: number }>();
    expect(usersCount?.count).toBe(1);

    const memberships = await env.DB.prepare(
      'SELECT household_id FROM household_members WHERE user_id = 2',
    ).all<{
      household_id: number;
    }>();
    expect(memberships.results.map((m) => m.household_id).sort()).toEqual([1, 2]);
  });

  it('returns 409 when the email is already a member of the current household', async () => {
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'member-a@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });

  it('grants Cloudflare Access on creation and returns no warning when the grant succeeds', async () => {
    const fetchMock = stubJwksAndPolicy([]);
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string }; warning?: string };
    expect(body.data.email).toBe('new@example.com');
    expect(body.warning).toBeUndefined();

    // Proves the grant actually ran (not just that no warning happened to
    // appear) — the route must have GET'd and PUT'd the real policy endpoint.
    const calls = policyCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[1][1]?.method).toBe('PUT');
    expect(JSON.parse(calls[1][1]!.body as string).include).toEqual([
      { email: { email: 'new@example.com' } },
    ]);
  });

  it('returns no warning when the email is already on the Access allow-list (idempotent grant)', async () => {
    const fetchMock = stubJwksAndPolicy([{ email: { email: 'new@example.com' } }]);
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { warning?: string };
    expect(body.warning).toBeUndefined();

    // Proves the presence-check actually ran against the real policy
    // endpoint (GET only) rather than the grant call never having happened.
    const calls = policyCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]?.method).toBeUndefined(); // GET, not PUT
  });

  it('still creates the member and returns 201 with a warning when the Access grant fails', async () => {
    // stubAccessJwks() (from beforeEach) 404s any URL other than the JWKS
    // endpoint, so the policy GET this route triggers fails naturally here —
    // no extra stubbing needed to exercise the degraded path.
    const res = await app.request(
      '/api/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'gracefail@example.com' }),
      },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string }; warning?: string };
    expect(body.data.email).toBe('gracefail@example.com');
    expect(body.warning).toContain('gracefail@example.com');

    // The D1 row itself must exist regardless of the Access-API failure —
    // the member is never left uncreated over a Cloudflare API problem.
    const listRes = await app.request(
      '/api/members',
      { headers: await authHeader('admin-a@example.com') },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    const listBody = (await listRes.json()) as { data: { email: string }[] };
    expect(listBody.data.map((u) => u.email)).toContain('gracefail@example.com');
  });
});

describe('POST /api/members/requests', () => {
  it('returns 400 when email is missing', async () => {
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('creates a pending request for a non-admin adding a brand-new email', async () => {
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { requestedEmail: string; householdId: number; status: string };
    };
    expect(body.data).toMatchObject({ requestedEmail: 'new@example.com', householdId: 1, status: 'pending' });
  });

  it('returns 409 when the email already has an account', async () => {
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'admin-a@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 for a duplicate pending request', async () => {
    await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      testEnv(),
    );
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });
});

describe('GET /api/members', () => {
  it('lists only same-household members for an admin', async () => {
    const res = await app.request(
      '/api/members',
      { headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string }[] };
    const emails = body.data.map((u) => u.email).sort();
    expect(emails).toEqual(['admin-a@example.com', 'member-a@example.com']);
  });
});

describe('DELETE /api/members/:id', () => {
  it('cannot target a member in a different household (404)', async () => {
    const res = await app.request(
      '/api/members/2',
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('deletes a same-household member', async () => {
    const res = await app.request(
      '/api/members/3',
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });

  it('removing a member from one household does not affect their membership in another', async () => {
    // Give admin-b (household 2 only, from beforeEach) a second membership in household 1.
    await env.DB.prepare('INSERT INTO household_members (user_id, household_id) VALUES (2, 1)').run();

    const res = await app.request(
      '/api/members/2',
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);

    const remainingMembership = await env.DB.prepare(
      'SELECT id FROM household_members WHERE user_id = 2 AND household_id = 2',
    ).first<{ id: number }>();
    expect(remainingMembership).toBeTruthy();

    const usersRow = await env.DB.prepare('SELECT id FROM users WHERE id = 2').first<{ id: number }>();
    expect(usersRow).toBeTruthy();
  });
});
