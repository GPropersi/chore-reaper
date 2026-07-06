import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD, TEST_JWKS_URL } from '../helpers/access-test-env.js';
import primaryJwks from '../fixtures/test-jwks.json' with { type: 'json' };

const ACCESS_ALLOWLIST_ENV = {
  CLOUDFLARE_ACCESS_API_TOKEN: 'test-token',
  CF_ACCOUNT_ID: 'test-account',
  ACCESS_APP_ID: 'test-app',
  ACCESS_POLICY_ID: 'test-policy',
};

const POLICY_URL =
  'https://api.cloudflare.com/client/v4/accounts/test-account/access/apps/test-app/policies/test-policy';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Stubs both the JWKS endpoint (needed for accessAuth to verify the request's
// own JWT) and the Cloudflare Access policy endpoint the route calls out to
// after creating a user, so these tests can exercise the real
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
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind('Org A', 'UTC'),
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (2, ?, ?)').bind('Org B', 'UTC'),
    env.DB.prepare('INSERT INTO users (id, organization_id, email, role) VALUES (1, 1, ?, ?)').bind(
      'admin-a@example.com',
      'admin',
    ),
    env.DB.prepare('INSERT INTO users (id, organization_id, email, role) VALUES (2, 2, ?, ?)').bind(
      'admin-b@example.com',
      'admin',
    ),
    env.DB.prepare('INSERT INTO users (id, organization_id, email, role) VALUES (3, 1, ?, ?)').bind(
      'member-a@example.com',
      'member',
    ),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/users', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com', role: 'member' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('creates a user scoped to the admin own org, ignoring a different organizationId in the body', async () => {
    const res = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com', role: 'member', organizationId: 2 }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { organizationId: number; email: string } };
    expect(body.data.organizationId).toBe(1);
    expect(body.data.email).toBe('new@example.com');
  });

  it('normalizes the email (trim + lowercase) when creating a user', async () => {
    const res = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: '  New@Example.com  ', role: 'member' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe('new@example.com');
  });

  it('lets a user authenticate regardless of email-casing differences between creation and login', async () => {
    const createRes = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'Jane@Example.com', role: 'member' }),
      },
      testEnv(),
    );
    expect(createRes.status).toBe(201);

    const meRes = await app.request('/api/me', { headers: await authHeader('JANE@EXAMPLE.com') }, testEnv());

    expect(meRes.status).toBe(200);
  });

  it('grants Cloudflare Access on creation and returns no warning when the grant succeeds', async () => {
    const fetchMock = stubJwksAndPolicy([]);
    const res = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com', role: 'member' }),
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
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'new@example.com', role: 'member' }),
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

  it('still creates the user and returns 201 with a warning when the Access grant fails', async () => {
    // stubAccessJwks() (from beforeEach) 404s any URL other than the JWKS
    // endpoint, so the policy GET this route triggers fails naturally here —
    // no extra stubbing needed to exercise the degraded path.
    const res = await app.request(
      '/api/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ email: 'gracefail@example.com', role: 'member' }),
      },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string }; warning?: string };
    expect(body.data.email).toBe('gracefail@example.com');
    expect(body.warning).toContain('gracefail@example.com');

    // The D1 row itself must exist regardless of the Access-API failure —
    // the user is never left uncreated over a Cloudflare API problem.
    const listRes = await app.request(
      '/api/users',
      { headers: await authHeader('admin-a@example.com') },
      { ...testEnv(), ...ACCESS_ALLOWLIST_ENV },
    );
    const listBody = (await listRes.json()) as { data: { email: string }[] };
    expect(listBody.data.map((u) => u.email)).toContain('gracefail@example.com');
  });
});

describe('GET /api/users', () => {
  it('lists only same-org users for an admin', async () => {
    const res = await app.request(
      '/api/users',
      { headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string }[] };
    const emails = body.data.map((u) => u.email).sort();
    expect(emails).toEqual(['admin-a@example.com', 'member-a@example.com']);
  });
});

describe('DELETE /api/users/:id', () => {
  it('cannot target a user in a different org (404)', async () => {
    const res = await app.request(
      '/api/users/2',
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('deletes a same-org user', async () => {
    const res = await app.request(
      '/api/users/3',
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });
});
