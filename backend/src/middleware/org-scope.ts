import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

type UserRow = {
  id: number;
  organization_id: number;
  role: 'admin' | 'member';
  timezone: string | null;
};

export const orgScope = createMiddleware<AppEnv>(async (c, next) => {
  const email = c.var.verifiedEmail;
  const user = await c.env.DB.prepare('SELECT id, organization_id, role, timezone FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  c.set('userId', user.id);
  c.set('organizationId', user.organization_id);
  c.set('role', user.role);
  c.set('timezone', user.timezone);

  await next();
});
