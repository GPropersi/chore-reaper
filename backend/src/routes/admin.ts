import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getAllUsersWithHouseholds } from '../admin-users.js';
import type { AppEnv } from '../types.js';

const admin = new Hono<AppEnv>();

admin.get('/users', async (c) => {
  const data = await getAllUsersWithHouseholds(c.env.DB);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

export default admin;
