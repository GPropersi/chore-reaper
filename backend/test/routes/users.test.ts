import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';

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
