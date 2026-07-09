import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const me = new Hono<AppEnv>();

type MembershipRow = {
  household_id: number;
  household_name: string;
  household_timezone: string;
};

me.get('/', async (c) => {
  const memberships = await c.env.DB.prepare(
    `SELECT hm.household_id AS household_id, h.name AS household_name,
            h.timezone AS household_timezone
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
    isAdmin: c.var.isAdmin,
    swipeStyle: c.var.swipeStyle,
    memberships: memberships.results.map((m) => ({
      householdId: m.household_id,
      householdName: m.household_name,
      householdTimezone: m.household_timezone,
    })),
    currentHouseholdId: c.var.householdId,
  });
});

me.patch('/swipe-style', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const swipeStyle = body.swipeStyle;
  if (swipeStyle !== 'ios' && swipeStyle !== 'android') {
    return c.json({ success: false, error: 'Invalid swipe style' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET swipe_style = ? WHERE id = ?')
    .bind(swipeStyle, c.var.userId)
    .run();

  return c.json({ success: true, data: { swipeStyle } });
});

export default me;
