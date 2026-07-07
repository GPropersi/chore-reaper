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
    'SELECT organization_id, role FROM org_members WHERE user_id = ? ORDER BY organization_id',
  )
    .bind(user.id)
    .all<MembershipRow>();

  if (memberships.results.length === 0) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const headerOrgId = c.req.header('X-Org-Id');
  let membership: MembershipRow;

  if (headerOrgId != null) {
    const requestedOrgId = Number(headerOrgId);
    if (Number.isNaN(requestedOrgId)) {
      return c.json({ success: false, error: 'Invalid X-Org-Id header' }, 400);
    }
    const requested = memberships.results.find((m) => m.organization_id === requestedOrgId);
    if (!requested) {
      // Authenticated email, but not a member of this specific org — distinct
      // from the 401 above (unknown email entirely).
      return c.json({ success: false, error: 'Not a member of this organization' }, 403);
    }
    membership = requested;
  } else {
    // No header — resolve deterministically to the lowest-id membership
    // rather than erroring. Covers the common single-org case (only one row
    // to pick) and first-ever login for someone bootstrapped into multiple
    // orgs before ever choosing one: land in a default org, same as most
    // multi-org products, and let the frontend's org switcher correct it
    // from there if it's not the one they wanted.
    membership = memberships.results[0];
  }

  c.set('userId', user.id);
  c.set('organizationId', membership.organization_id);
  c.set('role', membership.role);
  c.set('timezone', user.timezone);

  await next();
});
