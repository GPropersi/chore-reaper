import { describe, it, expect, beforeEach } from 'vitest';
import { mockFetch, resetMockData } from './mockApi';

type ChoreWire = {
  id: number;
  name: string;
  roomId: number;
  dateLastCompleted: string;
  duration: number;
  frequency: number;
  version: number;
};

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeEach(() => {
  resetMockData();
});

describe('mockFetch: /api/me', () => {
  it('returns a fake authenticated admin user', async () => {
    const res = await mockFetch('/api/me');
    expect(res.status).toBe(200);
    const me = await json<{ role: string; email: string }>(res);
    expect(me.role).toBe('admin');
    expect(me.email).toBeTruthy();
  });
});

describe('mockFetch: PATCH /api/organizations/:id', () => {
  it('updates the timezone and reflects it in a subsequent GET /api/me', async () => {
    const res = await mockFetch('/api/organizations/1', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'Europe/London' }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ data: { timezone: string } }>(res);
    expect(body.data.timezone).toBe('Europe/London');

    const meRes = await json<{ organizationTimezone: string }>(await mockFetch('/api/me'));
    expect(meRes.organizationTimezone).toBe('Europe/London');
  });
});

describe('mockFetch: /api/chores', () => {
  it('GET returns a non-empty seeded list wrapped in ApiResponse', async () => {
    const res = await mockFetch('/api/chores');
    const body = await json<{ success: boolean; data: ChoreWire[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('POST creates a chore and it appears in a subsequent GET', async () => {
    const createRes = await mockFetch('/api/chores', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mop Floors',
        roomId: 2,
        dateLastCompleted: '2026-07-01T00:00:00.000Z',
        duration: 15,
        frequency: 3,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await json<{ data: ChoreWire }>(createRes);
    expect(created.data.name).toBe('Mop Floors');
    expect(created.data.id).toBeTypeOf('number');
    expect(created.data.version).toBe(1);

    const listRes = await mockFetch('/api/chores');
    const list = await json<{ data: ChoreWire[] }>(listRes);
    expect(list.data.map((c) => c.name)).toContain('Mop Floors');
  });

  it('PUT edits an existing chore and increments its version', async () => {
    const before = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    const target = before.data[0];

    const res = await mockFetch(`/api/chores/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Renamed Chore',
        roomId: target.roomId,
        dateLastCompleted: target.dateLastCompleted,
        duration: target.duration,
        frequency: target.frequency,
        version: target.version,
      }),
    });
    expect(res.status).toBe(200);
    const updated = await json<{ data: ChoreWire }>(res);
    expect(updated.data.name).toBe('Renamed Chore');
    expect(updated.data.version).toBe(target.version + 1);
  });

  it('PATCH .../complete updates dateLastCompleted', async () => {
    const before = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    const target = before.data[0];
    const newDate = '2026-07-07T00:00:00.000Z';

    const res = await mockFetch(`/api/chores/${target.id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ dateLastCompleted: newDate }),
    });
    expect(res.status).toBe(200);
    const updated = await json<{ data: ChoreWire }>(res);
    expect(updated.data.dateLastCompleted).toBe(newDate);
  });

  it('DELETE removes a chore so it no longer appears in a subsequent GET', async () => {
    const before = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    const target = before.data[0];

    const res = await mockFetch(`/api/chores/${target.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const after = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    expect(after.data.map((c) => c.id)).not.toContain(target.id);
  });

  it('returns 404 for a PUT/DELETE against a chore id that does not exist', async () => {
    const res = await mockFetch('/api/chores/999999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('mockFetch: /api/users', () => {
  it('GET returns a non-empty seeded list', async () => {
    const res = await mockFetch('/api/users');
    const body = await json<{ success: boolean; data: unknown[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('POST creates a user and it appears in a subsequent GET', async () => {
    const createRes = await mockFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'preview@example.com', role: 'member' }),
    });
    expect(createRes.status).toBe(201);

    const listRes = await mockFetch('/api/users');
    const list = await json<{ data: { email: string }[] }>(listRes);
    expect(list.data.map((u) => u.email)).toContain('preview@example.com');
  });

  it('DELETE removes a user', async () => {
    const before = await json<{ data: { id: number }[] }>(await mockFetch('/api/users'));
    const target = before.data[0];

    await mockFetch(`/api/users/${target.id}`, { method: 'DELETE' });

    const after = await json<{ data: { id: number }[] }>(await mockFetch('/api/users'));
    expect(after.data.map((u) => u.id)).not.toContain(target.id);
  });
});

describe('mockFetch: /api/rooms', () => {
  it('GET returns a non-empty seeded list', async () => {
    const res = await mockFetch('/api/rooms');
    const body = await json<{ success: boolean; data: { id: number; name: string }[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('POST creates a room and it appears in a subsequent GET', async () => {
    const createRes = await mockFetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: 'Garage' }),
    });
    expect(createRes.status).toBe(201);

    const listRes = await mockFetch('/api/rooms');
    const list = await json<{ data: { name: string }[] }>(listRes);
    expect(list.data.map((r) => r.name)).toContain('Garage');
  });

  it('POST returns 409 for a duplicate name', async () => {
    const res = await mockFetch('/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'Kitchen' }) });
    expect(res.status).toBe(409);
  });

  it('DELETE returns 409 when the room still has chores', async () => {
    const before = await json<{ data: { id: number; roomId: number }[] }>(await mockFetch('/api/chores'));
    const inUseRoomId = before.data[0].roomId;

    const res = await mockFetch(`/api/rooms/${inUseRoomId}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
  });

  it('DELETE removes an empty room', async () => {
    const createRes = await mockFetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: 'Garage' }),
    });
    const created = await json<{ data: { id: number } }>(createRes);

    const res = await mockFetch(`/api/rooms/${created.data.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const after = await json<{ data: { id: number }[] }>(await mockFetch('/api/rooms'));
    expect(after.data.map((r) => r.id)).not.toContain(created.data.id);
  });
});

describe('resetMockData', () => {
  it('restores the original seed data, discarding any mutations', async () => {
    await mockFetch('/api/chores', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Temporary',
        roomId: 2,
        dateLastCompleted: '2026-07-01T00:00:00.000Z',
        duration: 1,
        frequency: 1,
      }),
    });
    const beforeReset = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    expect(beforeReset.data.map((c) => c.name)).toContain('Temporary');

    resetMockData();

    const afterReset = await json<{ data: ChoreWire[] }>(await mockFetch('/api/chores'));
    expect(afterReset.data.map((c) => c.name)).not.toContain('Temporary');
  });
});
