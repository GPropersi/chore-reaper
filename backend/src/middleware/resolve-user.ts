import { createMiddleware } from 'hono/factory';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import type { BaseEnv } from '../types.js';

// Per-user auth: resolves the Access-verified email to a users row and stashes
// userId. Mirrors require-global-admin.ts minus the is_admin/Forbidden branch
// and the household vars. Deliberately NOT layered on householdScope —
// notifications are per-user, and householdScope 401s on zero household
// memberships (an unrelated constraint). Typed against BaseEnv, so c.var here
// exposes only { verifiedEmail, userId } — the household-only fields are not
// type-visible on this middleware or the notifications route that mounts it.
export const resolveUser = createMiddleware<BaseEnv>(async (c, next) => {
  const email = c.var.verifiedEmail;
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number }>();

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' } satisfies ApiResponse<never>, 401);
  }

  c.set('userId', user.id);

  await next();
});
