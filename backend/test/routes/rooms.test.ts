import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';

const ORG_A = 1;
const ORG_B = 2;
const ROOM_A = 1;
const ROOM_B = 2;

async function authHeader(email: string) {
  const token = await signTestJwt({ email, aud: TEST_ACCESS_AUD });
  return { 'Cf-Access-Jwt-Assertion': token };
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind('Org A', 'UTC'),
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (2, ?, ?)').bind('Org B', 'UTC'),
    env.DB.prepare('INSERT INTO rooms (id, organization_id, name) VALUES (?, ?, ?)').bind(
      ROOM_A,
      ORG_A,
      'Kitchen',
    ),
    env.DB.prepare('INSERT INTO rooms (id, organization_id, name) VALUES (?, ?, ?)').bind(
      ROOM_B,
      ORG_B,
      'Kitchen',
    ),
    env.DB.prepare('INSERT INTO users (id, organization_id, email, role) VALUES (1, 1, ?, ?)').bind(
      'admin-a@example.com',
      'admin',
    ),
    env.DB.prepare('INSERT INTO users (id, organization_id, email, role) VALUES (2, 1, ?, ?)').bind(
      'member-a@example.com',
      'member',
    ),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/rooms', () => {
  it('is accessible to a non-admin member and returns only same-org rooms', async () => {
    const res = await app.request(
      '/api/rooms',
      { headers: await authHeader('member-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data.map((r) => r.name)).toEqual(['Kitchen']);
  });
});

describe('POST /api/rooms', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      '/api/rooms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ name: 'Garage' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('creates a room scoped to the admin own org', async () => {
    const res = await app.request(
      '/api/rooms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ name: 'Garage' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { organizationId: number; name: string } };
    expect(body.data.organizationId).toBe(ORG_A);
    expect(body.data.name).toBe('Garage');
  });

  it('returns 409 for a duplicate name in the same org', async () => {
    const res = await app.request(
      '/api/rooms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ name: 'Kitchen' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/rooms/:id', () => {
  it('cannot target a room in a different org (404)', async () => {
    const res = await app.request(
      `/api/rooms/${ROOM_B}`,
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 and refuses to delete a room that still has chores', async () => {
    await app.request(
      '/api/chores',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({
          name: 'Wash dishes',
          roomId: ROOM_A,
          dateLastCompleted: '2026-06-01T00:00:00.000Z',
          duration: 10,
          frequency: 1,
        }),
      },
      testEnv(),
    );

    const res = await app.request(
      `/api/rooms/${ROOM_A}`,
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(409);
  });

  it('deletes an empty same-org room', async () => {
    const res = await app.request(
      `/api/rooms/${ROOM_A}`,
      { method: 'DELETE', headers: await authHeader('admin-a@example.com') },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });
});
