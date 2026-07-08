import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

type UserRow = {
  id: number;
  timezone: string | null;
};

type MembershipRow = {
  household_id: number;
  role: 'admin' | 'user';
};

export const householdScope = createMiddleware<AppEnv>(async (c, next) => {
  const email = c.var.verifiedEmail;
  const user = await c.env.DB.prepare('SELECT id, timezone FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const memberships = await c.env.DB.prepare(
    'SELECT household_id, role FROM household_members WHERE user_id = ? ORDER BY household_id',
  )
    .bind(user.id)
    .all<MembershipRow>();

  if (memberships.results.length === 0) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const headerHouseholdId = c.req.header('X-Household-Id');
  let membership: MembershipRow;

  if (headerHouseholdId != null) {
    const requestedHouseholdId = Number(headerHouseholdId);
    if (Number.isNaN(requestedHouseholdId)) {
      return c.json({ success: false, error: 'Invalid X-Household-Id header' }, 400);
    }
    const requested = memberships.results.find((m) => m.household_id === requestedHouseholdId);
    if (!requested) {
      // Authenticated email, but not a member of this specific household —
      // distinct from the 401 above (unknown email entirely).
      return c.json({ success: false, error: 'Not a member of this household' }, 403);
    }
    membership = requested;
  } else {
    // No header — resolve deterministically to the lowest-id membership
    // rather than erroring. Covers the common single-household case (only
    // one row to pick) and first-ever login for someone bootstrapped into
    // multiple households before ever choosing one: land in a default
    // household, same as most multi-tenant products, and let the frontend's
    // switcher correct it from there if it's not the one they wanted.
    membership = memberships.results[0];
  }

  c.set('userId', user.id);
  c.set('householdId', membership.household_id);
  c.set('role', membership.role);
  c.set('timezone', user.timezone);

  await next();
});
