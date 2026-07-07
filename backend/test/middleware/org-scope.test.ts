import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { orgScope } from '../../src/middleware/org-scope.js';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
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
  stubApp.use('*', orgScope);
  stubApp.get('/whoami', (c) =>
    c.json({
      userId: c.var.userId,
      organizationId: c.var.organizationId,
      role: c.var.role,
      timezone: c.var.timezone,
    }),
  );
  return stubApp;
}

async function seedOrgsAndUsers() {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind('Org A', 'UTC'),
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (2, ?, ?)').bind('Org B', 'UTC'),
    env.DB.prepare('INSERT INTO rooms (id, organization_id, name) VALUES (?, 1, ?)').bind(
      ROOM_A,
      'Living Room',
    ),
    env.DB.prepare('INSERT INTO rooms (id, organization_id, name) VALUES (?, 2, ?)').bind(
      ROOM_B,
      'Living Room',
    ),
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (1, 1, ?, ?, ?)',
    ).bind('admin-a@example.com', 'admin', 'America/Chicago'),
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (2, 2, ?, ?, ?)',
    ).bind('admin-b@example.com', 'admin', null),
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (3, 1, ?, ?, ?)',
    ).bind('member-a@example.com', 'member', null),
  ]);
}

function authHeader(email: string) {
  return signTestJwt({ email, aud: TEST_ACCESS_AUD }).then((token) => ({ 'Cf-Access-Jwt-Assertion': token }));
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('orgScope', () => {
  it('attaches {id, organizationId, role, timezone} for a matching users row', async () => {
    await seedOrgsAndUsers();

    const res = await appWithStubEmail('member-a@example.com').request('/whoami', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 3, organizationId: 1, role: 'member', timezone: null });
  });

  it('rejects with 401 (not 500) when the verified email has no matching users row', async () => {
    const res = await appWithStubEmail('ghost@example.com').request('/whoami', {}, env);

    expect(res.status).toBe(401);
  });
});

describe('cross-org access through the full app', () => {
  it('returns 404 (not 403) when a user requests a chore id belonging to a different org', async () => {
    await seedOrgsAndUsers();

    const createRes = await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-b@example.com')) },
        body: JSON.stringify(validChoreBody(ROOM_B)),
      },
      testEnv(),
    );
    const orgBChore = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await app.request(
      `/api/chores/${orgBChore.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_A), version: 1 }),
      },
      testEnv(),
    );

    expect(res.status).toBe(404);
  });

  it("never includes another org's chores in GET /api/chores", async () => {
    await seedOrgsAndUsers();

    await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_A), name: 'Org A Chore' }),
      },
      testEnv(),
    );
    await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-b@example.com')) },
        body: JSON.stringify({ ...validChoreBody(ROOM_B), name: 'Org B Chore' }),
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
    expect(body.data[0].name).toBe('Org A Chore');
  });
});

describe('requireAdmin on /api/users/*', () => {
  it('returns 403 for a non-admin user', async () => {
    await seedOrgsAndUsers();

    const res = await app.request(
      '/api/users',
      { headers: await authHeader('member-a@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(403);
  });
});
