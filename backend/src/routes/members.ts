import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getMembersByHousehold, addHouseholdMember, removeHouseholdMember } from '../members.js';
import { createJoinRequest } from '../join-requests.js';
import { grantAccessAndDescribeWarning } from '../access-allowlist.js';
import type { AppEnv } from '../types.js';

const members = new Hono<AppEnv>();

members.get('/', async (c) => {
  const data = await getMembersByHousehold(c.env.DB, c.var.householdId);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

members.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.email) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  // householdId always comes from the caller's own session, never the
  // request body — a member cannot add a member to a different household by
  // passing a different householdId here. Any household member can call
  // this (adding someone who already has an account elsewhere); only the
  // brand-new-account path inside addHouseholdMember is admin-gated, and that
  // check is against the caller's global admin status, not a per-household role.
  const result = await addHouseholdMember(
    c.env.DB,
    c.var.householdId,
    { email: String(body.email), timezone: body.timezone ? String(body.timezone) : null },
    c.var.userId,
    c.var.isAdmin,
  );

  if (result.status === 'already_member') {
    return c.json(
      {
        success: false,
        error: 'This email is already a member of this household',
      } satisfies ApiResponse<never>,
      409,
    );
  }

  if (result.status === 'new_user_requires_admin') {
    return c.json(
      {
        success: false,
        error: "This person doesn't have an account yet — ask a household admin to add them.",
      } satisfies ApiResponse<never>,
      403,
    );
  }

  const data = result.member;

  const warning = await grantAccessAndDescribeWarning(c.env, data.email, {
    householdId: c.var.householdId,
    actor: c.var.verifiedEmail,
  });

  return c.json(
    { success: true, data, ...(warning ? { warning } : {}) } satisfies ApiResponse<typeof data>,
    201,
  );
});

// Escalation path for the new_user_requires_admin case above: a non-admin
// member can't add a brand-new account directly, but can ask an admin to.
// householdId is sourced from the caller's own session, same invariant as
// every other member-scoped write in this file.
members.post('/requests', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.email) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }

  const result = await createJoinRequest(c.env.DB, c.var.householdId, String(body.email), c.var.userId);

  if (result.status === 'already_registered') {
    return c.json(
      {
        success: false,
        error: 'This person already has an account — add them directly instead.',
      } satisfies ApiResponse<never>,
      409,
    );
  }

  if (result.status === 'duplicate') {
    return c.json(
      { success: false, error: 'A request for this email is already pending.' } satisfies ApiResponse<never>,
      409,
    );
  }

  return c.json({ success: true, data: result.request } satisfies ApiResponse<typeof result.request>, 201);
});

members.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }
  const removed = await removeHouseholdMember(c.env.DB, c.var.householdId, id);
  if (!removed) {
    return c.json({ success: false, error: 'Member not found' } satisfies ApiResponse<never>, 404);
  }
  return c.json({ success: true, data: null } satisfies ApiResponse<null>);
});

export default members;
