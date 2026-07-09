import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getAllUsersWithHouseholds, deleteUser, promoteUserToAdmin } from '../admin-users.js';
import { listAllHouseholds, createHousehold, isValidTimezone } from '../households.js';
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

// Previously the only way to create a household was the bootstrap-admin CLI
// script (backend/src/bootstrap-admin.ts) — this is the in-app equivalent,
// minus the script's bundled "create the first admin user" step, since an
// admin can already add people to the new household via POST
// /api/admin/members once it exists.
admin.post('/households', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }

  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
  if (!isValidTimezone(timezone)) {
    return c.json({ success: false, error: 'Invalid timezone' } satisfies ApiResponse<never>, 400);
  }

  const result = await createHousehold(c.env.DB, name, timezone);
  if (result.status === 'duplicate_name') {
    return c.json(
      { success: false, error: `A household named "${name}" already exists` } satisfies ApiResponse<never>,
      409,
    );
  }

  const data = result.household;
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>, 201);
});

// Cross-household add: unlike POST /api/members, householdId is admin-supplied
// rather than sourced from the caller's own session — that's the entire point
// of this route (an admin adding someone to a household they may not belong
// to themselves), and it's safe only because requireGlobalAdmin already
// verified the caller is a global admin.
//
// A caller may supply newHouseholdName instead of householdId, to create the
// household and the member in one step. newHouseholdTimezone is the new
// household's own timezone — deliberately separate from the member-level
// `timezone` field below, same validation contract as POST /households
// (default UTC when omitted, 400 when present but invalid).
admin.post('/members', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const newHouseholdName = typeof body.newHouseholdName === 'string' ? body.newHouseholdName.trim() : '';

  if (!body.email || (!newHouseholdName && Number.isNaN(Number(body.householdId)))) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }

  let householdId: number;
  if (newHouseholdName) {
    const newHouseholdTimezone =
      typeof body.newHouseholdTimezone === 'string' && body.newHouseholdTimezone
        ? body.newHouseholdTimezone
        : 'UTC';
    if (!isValidTimezone(newHouseholdTimezone)) {
      return c.json({ success: false, error: 'Invalid timezone' } satisfies ApiResponse<never>, 400);
    }
    const householdResult = await createHousehold(c.env.DB, newHouseholdName, newHouseholdTimezone);
    if (householdResult.status === 'duplicate_name') {
      return c.json(
        {
          success: false,
          error: `A household named "${newHouseholdName}" already exists`,
        } satisfies ApiResponse<never>,
        409,
      );
    }
    householdId = householdResult.household.id;
  } else {
    householdId = Number(body.householdId);
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
  if (result.status === 'protected') {
    return c.json(
      { success: false, error: 'This account cannot be deleted' } satisfies ApiResponse<never>,
      403,
    );
  }

  const warning = await revokeAccessAndDescribeWarning(c.env, result.email, {
    userId: id,
    actor: c.var.verifiedEmail,
  });

  return c.json({ success: true, data: null, ...(warning ? { warning } : {}) } satisfies ApiResponse<null>);
});

// Grants global admin (users.is_admin) — separate from household_members.role,
// which isn't wired into any app logic yet. One-way: there's no demote route.
admin.post('/users/:id/promote', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, error: 'Invalid id' } satisfies ApiResponse<never>, 400);
  }

  const result = await promoteUserToAdmin(c.env.DB, id);
  if (result.status === 'not_found') {
    return c.json({ success: false, error: 'User not found' } satisfies ApiResponse<never>, 404);
  }

  return c.json({ success: true, data: result.user } satisfies ApiResponse<typeof result.user>);
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
