import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const me = new Hono<AppEnv>();

type MembershipRow = {
  household_id: number;
  household_name: string;
  household_timezone: string;
  role: 'admin' | 'member';
};

me.get('/', async (c) => {
  const memberships = await c.env.DB.prepare(
    `SELECT hm.household_id AS household_id, h.name AS household_name,
            h.timezone AS household_timezone, hm.role AS role
     FROM household_members hm
     JOIN households h ON h.id = hm.household_id
     WHERE hm.user_id = ?
     ORDER BY h.name`,
  )
    .bind(c.var.userId)
    .all<MembershipRow>();

  const current = memberships.results.find((m) => m.household_id === c.var.householdId);

  return c.json({
    id: c.var.userId,
    email: c.var.verifiedEmail,
    timezone: c.var.timezone ?? current?.household_timezone ?? null,
    memberships: memberships.results.map((m) => ({
      householdId: m.household_id,
      householdName: m.household_name,
      householdTimezone: m.household_timezone,
      role: m.role,
    })),
    currentHouseholdId: c.var.householdId,
  });
});

export default me;
