import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getAllUsersWithHouseholds, deleteUser } from '../admin-users.js';
import { listAllHouseholds } from '../households.js';
import { adminAddHouseholdMember } from '../members.js';
import { listPendingJoinRequests, approveJoinRequest, denyJoinRequest } from '../join-requests.js';
import { grantAccessAndDescribeWarning, revokeAccessAndDescribeWarning } from '../access-allowlist.js';
import type { AppEnv } from '../types.js';

const admin = new Hono<AppEnv>();

admin.get('/users', async (c) => {
  const data = await getAllUsersWithHouseholds(c.env.DB);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

admin.get('/households', async (c) => {
  const data = await listAllHouseholds(c.env.DB);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

// Cross-household add: unlike POST /api/members, householdId is admin-supplied
// rather than sourced from the caller's own session — that's the entire point
// of this route (an admin adding someone to a household they may not belong
// to themselves), and it's safe only because requireGlobalAdmin already
// verified the caller is a global admin.
admin.post('/members', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const householdId = Number(body.householdId);
  if (!body.email || Number.isNaN(householdId)) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }

  const result = await adminAddHouseholdMember(
    c.env.DB,
    householdId,
    {
      email: String(body.email),
      timezone: body.timezone ? String(body.timezone) : null,
      makeAdmin: body.makeAdmin === true,
    },
    c.var.userId,
  );

  if (result.status === 'household_not_found') {
    return c.json({ success: false, error: 'Household not found' } satisfies ApiResponse<never>, 404);
  }
  if (result.status === 'already_member') {
    return c.json(
      {
        success: false,
        error: 'This email is already a member of this household',
      } satisfies ApiResponse<never>,
      409,
    );
  }

  const data = result.member;
  const warning = await grantAccessAndDescribeWarning(c.env, data.email, {
    householdId,
    actor: c.var.verifiedEmail,
  });

  return c.json(
    { success: true, data, ...(warning ? { warning } : {}) } satisfies ApiResponse<typeof data>,
    201,
  );
});

// Deletes a user account outright — not just a single household membership,
// unlike DELETE /api/members/:id. Cascades across every household the user
// belongs to (deleteUser) and best-effort revokes their Cloudflare Access
// entry, mirroring the grant flow on the add-member paths above.
admin.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }
  if (id === c.var.userId) {
    return c.json(
      { success: false, error: 'You cannot delete your own account' } satisfies ApiResponse<never>,
      400,
    );
  }

  const result = await deleteUser(c.env.DB, id);
  if (result.status === 'not_found') {
    return c.json({ success: false, error: 'User not found' } satisfies ApiResponse<never>, 404);
  }

  const warning = await revokeAccessAndDescribeWarning(c.env, result.email, {
    userId: id,
    actor: c.var.verifiedEmail,
  });

  return c.json({ success: true, data: null, ...(warning ? { warning } : {}) } satisfies ApiResponse<null>);
});

admin.get('/join-requests', async (c) => {
  const data = await listPendingJoinRequests(c.env.DB);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

admin.post('/join-requests/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }

  const result = await approveJoinRequest(c.env.DB, id, c.var.userId);
  if (result.status === 'not_found') {
    return c.json({ success: false, error: 'Join request not found' } satisfies ApiResponse<never>, 404);
  }
  if (result.status === 'already_resolved') {
    return c.json(
      { success: false, error: 'This request has already been resolved' } satisfies ApiResponse<never>,
      409,
    );
  }

  const warning = result.member
    ? await grantAccessAndDescribeWarning(c.env, result.member.email, { actor: c.var.verifiedEmail })
    : undefined;

  return c.json({
    success: true,
    data: result.member,
    ...(warning ? { warning } : {}),
  } satisfies ApiResponse<typeof result.member>);
});

admin.post('/join-requests/:id/deny', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }

  const result = await denyJoinRequest(c.env.DB, id, c.var.userId);
  if (result === 'not_found') {
    return c.json({ success: false, error: 'Join request not found' } satisfies ApiResponse<never>, 404);
  }
  if (result === 'already_resolved') {
    return c.json(
      { success: false, error: 'This request has already been resolved' } satisfies ApiResponse<never>,
      409,
    );
  }

  return c.json({ success: true, data: null } satisfies ApiResponse<null>);
});

export default admin;
