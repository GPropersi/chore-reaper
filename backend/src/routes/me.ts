import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const me = new Hono<AppEnv>();

me.get('/', async (c) => {
  const org = await c.env.DB.prepare('SELECT timezone FROM organizations WHERE id = ?')
    .bind(c.var.organizationId)
    .first<{ timezone: string }>();

  return c.json({
    id: c.var.userId,
    email: c.var.verifiedEmail,
    role: c.var.role,
    organizationId: c.var.organizationId,
    organizationTimezone: org!.timezone,
    timezone: c.var.timezone ?? org!.timezone,
  });
});

export default me;
