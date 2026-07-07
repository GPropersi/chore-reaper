import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

type UserRow = {
  id: number;
  timezone: string | null;
};

type MembershipRow = {
  organization_id: number;
  role: 'admin' | 'member';
};

export const orgScope = createMiddleware<AppEnv>(async (c, next) => {
  const email = c.var.verifiedEmail;
  const user = await c.env.DB.prepare('SELECT id, timezone FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const memberships = await c.env.DB.prepare(
    'SELECT organization_id, role FROM org_members WHERE user_id = ?',
  )
    .bind(user.id)
    .all<MembershipRow>();

  if (memberships.results.length === 0) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const headerOrgId = c.req.header('X-Org-Id');
  let membership: MembershipRow | undefined;

  if (headerOrgId != null) {
    const requestedOrgId = Number(headerOrgId);
    if (Number.isNaN(requestedOrgId)) {
      return c.json({ success: false, error: 'Invalid X-Org-Id header' }, 400);
    }
    membership = memberships.results.find((m) => m.organization_id === requestedOrgId);
    if (!membership) {
      // Authenticated email, but not a member of this specific org — distinct
      // from the 401 above (unknown email entirely).
      return c.json({ success: false, error: 'Not a member of this organization' }, 403);
    }
  } else if (memberships.results.length === 1) {
    // Zero-friction fallback for the (still common) single-org case — no
    // header required when there's only one membership to resolve to.
    membership = memberships.results[0];
  } else {
    return c.json({ success: false, error: 'Multiple organizations — X-Org-Id header required' }, 400);
  }

  c.set('userId', user.id);
  c.set('organizationId', membership.organization_id);
  c.set('role', membership.role);
  c.set('timezone', user.timezone);

  await next();
});
