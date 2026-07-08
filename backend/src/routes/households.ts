import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { updateHouseholdTimezone, isValidTimezone } from '../households.js';
import type { AppEnv } from '../types.js';

const households = new Hono<AppEnv>();

households.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  // An admin can only patch their own household — the path param is
  // re-validated against the caller's own session, never trusted on its
  // own, the same discipline used everywhere else for household-adjacent
  // input.
  if (Number.isNaN(id) || id !== c.var.householdId) {
    return c.json({ success: false, error: 'Invalid household id' } satisfies ApiResponse<never>, 400);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const timezone = typeof body.timezone === 'string' ? body.timezone : '';
  if (!isValidTimezone(timezone)) {
    return c.json({ success: false, error: 'Invalid timezone' } satisfies ApiResponse<never>, 400);
  }

  const household = await updateHouseholdTimezone(c.env.DB, c.var.householdId, timezone);
  return c.json({ success: true, data: household } satisfies ApiResponse<typeof household>);
});

export default households;
