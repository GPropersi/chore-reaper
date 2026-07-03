import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getUsersByOrg, createUser, deleteUserInOrg } from '../users.js';
import type { AppEnv } from '../types.js';

const users = new Hono<AppEnv>();

users.get('/', async (c) => {
  const data = await getUsersByOrg(c.env.DB, c.var.organizationId);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

users.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.email || (body.role !== 'admin' && body.role !== 'member')) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  // organizationId always comes from the admin's own session, never the
  // request body — an admin cannot create a user in a different org by
  // passing a different organizationId here.
  const data = await createUser(
    c.env.DB,
    c.var.organizationId,
    { email: String(body.email), role: body.role, timezone: body.timezone ? String(body.timezone) : null },
    c.var.userId,
  );
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>, 201);
});

users.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }
  const deleted = await deleteUserInOrg(c.env.DB, c.var.organizationId, id);
  if (!deleted) {
    return c.json({ success: false, error: 'User not found' } satisfies ApiResponse<never>, 404);
  }
  return c.json({ success: true, data: null } satisfies ApiResponse<null>);
});

export default users;
