import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

type UserRow = {
  id: number;
  is_admin: number;
};

// Deliberately separate from householdScope, not layered on top of it —
// householdScope 401s when a caller has zero household_members rows, but a
// global admin must be able to reach admin-only, cross-household views (like
// the all-users directory) even with no household membership of their own.
export const requireGlobalAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const email = c.var.verifiedEmail;
  const user = await c.env.DB.prepare('SELECT id, is_admin FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  if (user.is_admin !== 1) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  c.set('userId', user.id);
  c.set('isAdmin', true);

  await next();
});
