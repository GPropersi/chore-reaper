import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getRoomsByHousehold, createRoom, renameRoom, deleteRoom } from '../rooms.js';
import type { AppEnv } from '../types.js';

const rooms = new Hono<AppEnv>();

rooms.get('/', async (c) => {
  const data = await getRoomsByHousehold(c.env.DB, c.var.householdId);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

rooms.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name || typeof body.name !== 'string') {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  const result = await createRoom(c.env.DB, c.var.householdId, body.name);
  if (result.status === 'duplicate') {
    return c.json(
      { success: false, error: 'A room with this name already exists' } satisfies ApiResponse<never>,
      409,
    );
  }
  return c.json({ success: true, data: result.room } satisfies ApiResponse<typeof result.room>, 201);
});

rooms.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name || typeof body.name !== 'string') {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  const result = await renameRoom(c.env.DB, c.var.householdId, id, body.name);
  if (result.status === 'not_found') {
    return c.json({ success: false, error: 'Room not found' } satisfies ApiResponse<never>, 404);
  }
  if (result.status === 'duplicate') {
    return c.json(
      { success: false, error: 'A room with this name already exists' } satisfies ApiResponse<never>,
      409,
    );
  }
  return c.json({ success: true, data: result.room } satisfies ApiResponse<typeof result.room>);
});

rooms.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }
  const result = await deleteRoom(c.env.DB, c.var.householdId, id);
  if (result.status === 'not_found') {
    return c.json({ success: false, error: 'Room not found' } satisfies ApiResponse<never>, 404);
  }
  if (result.status === 'in_use') {
    return c.json(
      {
        success: false,
        error: `${result.choreCount} chore(s) are still in this room — reassign or delete them first`,
      } satisfies ApiResponse<never>,
      409,
    );
  }
  return c.json({ success: true, data: null } satisfies ApiResponse<null>);
});

export default rooms;
