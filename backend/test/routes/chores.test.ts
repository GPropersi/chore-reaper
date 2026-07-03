import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import chores from '../../src/routes/chores.js';
import type { AppEnv } from '../../src/types.js';

const ORG_A = 1;
const ORG_B = 2;

function testApp(organizationId: number) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('organizationId', organizationId);
    c.set('role', 'admin');
    c.set('timezone', null);
    await next();
  });
  app.route('/api/chores', chores);
  return { request: (input: string, init?: RequestInit) => app.request(input, init, env) };
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (?, ?, ?)').bind(
      ORG_A,
      'Org A',
      'UTC',
    ),
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (?, ?, ?)').bind(
      ORG_B,
      'Org B',
      'UTC',
    ),
  ]);
});

const validChoreBody = {
  name: 'Vacuum',
  room: 'Living Room',
  dateLastCompleted: '2026-06-01T00:00:00.000Z',
  duration: 20,
  frequency: 7,
};

describe('GET /api/chores', () => {
  it('returns 200 and the org-scoped list for an authenticated request', async () => {
    await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });

    const res = await testApp(ORG_A).request('/api/chores');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/chores', () => {
  it('returns 400 for missing required fields', async () => {
    const res = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vacuum' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 and the created chore for valid input', async () => {
    const res = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: { id: number; name: string } };
    expect(body.data.name).toBe('Vacuum');
  });
});

describe('PUT /api/chores/:id', () => {
  it('returns 409 for a stale version', async () => {
    const createRes = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(ORG_A).request(`/api/chores/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validChoreBody, name: 'Vacuum Deluxe', version: 99 }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 200 and the updated chore for a matching version', async () => {
    const createRes = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;

    const res = await testApp(ORG_A).request(`/api/chores/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validChoreBody, name: 'Vacuum Deluxe', version: created.version }),
    });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/chores/:id/complete', () => {
  it('returns 400 when dateLastCompleted is missing', async () => {
    const createRes = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(ORG_A).request(`/api/chores/${created.id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent chore', async () => {
    const res = await testApp(ORG_A).request('/api/chores/999999/complete', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: '2026-07-01T00:00:00.000Z', version: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/chores/:id', () => {
  it('returns 404 for a nonexistent chore', async () => {
    const res = await testApp(ORG_A).request('/api/chores/999999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('returns 200 for a successful delete', async () => {
    const createRes = await testApp(ORG_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(ORG_A).request(`/api/chores/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
