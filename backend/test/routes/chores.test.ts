import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import chores from '../../src/routes/chores.js';
import type { AppEnv } from '../../src/types.js';

const HOUSEHOLD_A = 1;
const HOUSEHOLD_B = 2;
const ROOM_A = 1;

function testApp(householdId: number) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('householdId', householdId);
    c.set('isAdmin', true);
    c.set('timezone', null);
    await next();
  });
  app.route('/api/chores', chores);
  return { request: (input: string, init?: RequestInit) => app.request(input, init, env) };
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (?, ?, ?)').bind(
      HOUSEHOLD_A,
      'Household A',
      'UTC',
    ),
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (?, ?, ?)').bind(
      HOUSEHOLD_B,
      'Household B',
      'UTC',
    ),
    env.DB.prepare('INSERT INTO rooms (id, household_id, name) VALUES (?, ?, ?)').bind(
      ROOM_A,
      HOUSEHOLD_A,
      'Living Room',
    ),
  ]);
});

const validChoreBody = {
  name: 'Vacuum',
  roomId: ROOM_A,
  dateLastCompleted: '2026-06-01T00:00:00.000Z',
  duration: 20,
  frequency: 7,
};

describe('GET /api/chores', () => {
  it('returns 200 and the household-scoped list for an authenticated request', async () => {
    await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });

    const res = await testApp(HOUSEHOLD_A).request('/api/chores');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/chores', () => {
  it('returns 400 for missing required fields', async () => {
    const res = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vacuum' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 and the created chore for valid input', async () => {
    const res = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: { id: number; name: string } };
    expect(body.data.name).toBe('Vacuum');
  });

  it('deduplicates a repeated clientId, never creating a second row', async () => {
    const app = testApp(HOUSEHOLD_A);
    const bodyWithClientId = JSON.stringify({ ...validChoreBody, clientId: 'client-uuid-1' });

    const firstRes = await app.request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyWithClientId,
    });
    const secondRes = await app.request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyWithClientId,
    });

    const first = ((await firstRes.json()) as { data: { id: number } }).data;
    const second = ((await secondRes.json()) as { data: { id: number } }).data;
    expect(second.id).toBe(first.id);

    const listRes = await app.request('/api/chores');
    const list = ((await listRes.json()) as { data: unknown[] }).data;
    expect(list).toHaveLength(1);
  });
});

describe('PUT /api/chores/:id', () => {
  it('returns 409 for a stale version', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validChoreBody, name: 'Vacuum Deluxe', version: 99 }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 200 and the updated chore for a matching version', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;

    const res = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validChoreBody, name: 'Vacuum Deluxe', version: created.version }),
    });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/chores/:id/complete', () => {
  it('returns 400 when dateLastCompleted is missing', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent chore', async () => {
    const res = await testApp(HOUSEHOLD_A).request('/api/chores/999999/complete', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: '2026-07-01T00:00:00.000Z' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 and updates dateLastCompleted', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: '2026-07-01T00:00:00.000Z' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { dateLastCompleted: string } };
    expect(body.data.dateLastCompleted).toBe('2026-07-01T00:00:00.000Z');
  });

  it('keeps the later completion when an earlier one arrives afterward — never conflicts', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const laterRes = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: '2026-07-01T03:00:00.000Z' }),
    });
    expect(laterRes.status).toBe(200);

    const earlierRes = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: '2026-07-01T02:00:00.000Z' }),
    });
    expect(earlierRes.status).toBe(200);
    const body = (await earlierRes.json()) as { data: { dateLastCompleted: string } };
    expect(body.data.dateLastCompleted).toBe('2026-07-01T03:00:00.000Z');
  });
});

describe('DELETE /api/chores/:id', () => {
  it('returns 404 for a nonexistent chore', async () => {
    const res = await testApp(HOUSEHOLD_A).request('/api/chores/999999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('returns 200 for a successful delete', async () => {
    const createRes = await testApp(HOUSEHOLD_A).request('/api/chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validChoreBody),
    });
    const created = ((await createRes.json()) as { data: { id: number } }).data;

    const res = await testApp(HOUSEHOLD_A).request(`/api/chores/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
