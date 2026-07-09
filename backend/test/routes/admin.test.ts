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
  await seedHouseholdMember({ id: 1, householdId: 1, email: 'admin@example.com', isAdmin: true });
  await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/admin/households', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      '/api/admin/households',
      { headers: await authHeader('member@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('lists every household in the app, alphabetically', async () => {
    const res = await app.request(
      '/api/admin/households',
      { headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: number; name: string }[] };
    expect(body.data.map((h) => h.name)).toEqual(['Household A', 'Household B']);
  });
});

describe('POST /api/admin/members', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member@example.com')) },
        body: JSON.stringify({ householdId: 2, email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown householdId', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 999, email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('adds a brand-new user to a household other than the admin own current one', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 2, email: 'new@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { householdId: number; email: string; isAdmin: boolean } };
    expect(body.data).toMatchObject({ householdId: 2, email: 'new@example.com', isAdmin: false });
  });

  it('sets is_admin when makeAdmin is true, on the create path', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 2, email: 'new-admin@example.com', makeAdmin: true }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { isAdmin: boolean } };
    expect(body.data.isAdmin).toBe(true);
  });

  it('ignores makeAdmin when the email already has an account (added_existing path)', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 2, email: 'member@example.com', makeAdmin: true }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { isAdmin: boolean } };
    expect(body.data.isAdmin).toBe(false);
  });

  it('returns 409 when already a member of the target household', async () => {
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 1, email: 'member@example.com' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });

  it('grants Cloudflare Access on creation', async () => {
    const fetchMock = stubJwksAndPolicy([]);
    const res = await app.request(
      '/api/admin/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin@example.com')) },
        body: JSON.stringify({ householdId: 2, email: 'new@example.com' }),
      },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { warning?: string };
    expect(body.warning).toBeUndefined();
    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
  });
});

describe('GET /api/admin/join-requests', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      '/api/admin/join-requests',
      { headers: await authHeader('member@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('lists pending requests across every household with household name and requester email', async () => {
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
      '/api/admin/join-requests',
      { headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { requestedEmail: string; householdName: string; requestedByEmail: string; status: string }[];
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      requestedEmail: 'requested@example.com',
      householdName: 'Household A',
      requestedByEmail: 'member@example.com',
      status: 'pending',
    });
  });
});

describe('POST /api/admin/join-requests/:id/approve', () => {
  async function createRequest() {
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member@example.com')) },
        body: JSON.stringify({ email: 'requested@example.com' }),
      },
      testEnv(),
    );
    const body = (await res.json()) as { data: { id: number } };
    return body.data.id;
  }

  it('returns 404 for an unknown id', async () => {
    const res = await app.request(
      '/api/admin/join-requests/999/approve',
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('creates the member and grants access', async () => {
    const id = await createRequest();
    const fetchMock = stubJwksAndPolicy([]);

    const res = await app.request(
      `/api/admin/join-requests/${id}/approve`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string; householdId: number } };
    expect(body.data).toMatchObject({ email: 'requested@example.com', householdId: 1 });

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
  });

  it('returns 409 for an already-resolved request', async () => {
    const id = await createRequest();
    await app.request(
      `/api/admin/join-requests/${id}/approve`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    const res = await app.request(
      `/api/admin/join-requests/${id}/approve`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });
});

describe('POST /api/admin/join-requests/:id/deny', () => {
  async function createRequest() {
    const res = await app.request(
      '/api/members/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member@example.com')) },
        body: JSON.stringify({ email: 'requested@example.com' }),
      },
      testEnv(),
    );
    const body = (await res.json()) as { data: { id: number } };
    return body.data.id;
  }

  it('returns 404 for an unknown id', async () => {
    const res = await app.request(
      '/api/admin/join-requests/999/deny',
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('denies with no D1 side effects on users/household_members', async () => {
    const id = await createRequest();
    const res = await app.request(
      `/api/admin/join-requests/${id}/deny`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);

    const userRow = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind('requested@example.com')
      .first();
    expect(userRow).toBeNull();
  });

  it('returns 409 for an already-resolved request', async () => {
    const id = await createRequest();
    await app.request(
      `/api/admin/join-requests/${id}/deny`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    const res = await app.request(
      `/api/admin/join-requests/${id}/deny`,
      { method: 'POST', headers: await authHeader('admin@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });
});
