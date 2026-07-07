import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { updateOrganizationTimezone, isValidTimezone } from '../organizations.js';
import type { AppEnv } from '../types.js';

const organizations = new Hono<AppEnv>();

organizations.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  // An admin can only patch their own org — the path param is re-validated
  // against the caller's own session, never trusted on its own, the same
  // discipline used everywhere else for org-adjacent input.
  if (Number.isNaN(id) || id !== c.var.organizationId) {
    return c.json({ success: false, error: 'Invalid organization id' } satisfies ApiResponse<never>, 400);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const timezone = typeof body.timezone === 'string' ? body.timezone : '';
  if (!isValidTimezone(timezone)) {
    return c.json({ success: false, error: 'Invalid timezone' } satisfies ApiResponse<never>, 400);
  }

  const org = await updateOrganizationTimezone(c.env.DB, c.var.organizationId, timezone);
  return c.json({ success: true, data: org } satisfies ApiResponse<typeof org>);
});

export default organizations;
