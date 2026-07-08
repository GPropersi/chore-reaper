import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getMembersByHousehold, addHouseholdMember, removeHouseholdMember } from '../members.js';
import { grantAccessListEntry } from '../access-allowlist.js';
import type { AppEnv } from '../types.js';

const members = new Hono<AppEnv>();

members.get('/', async (c) => {
  const data = await getMembersByHousehold(c.env.DB, c.var.householdId);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

members.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.email || (body.role !== 'admin' && body.role !== 'user')) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  // householdId always comes from the caller's own session, never the
  // request body — a member cannot add a member to a different household by
  // passing a different householdId here. Any household member can call
  // this (adding someone who already has an account elsewhere); only the
  // brand-new-account path inside addHouseholdMember is admin-gated.
  const result = await addHouseholdMember(
    c.env.DB,
    c.var.householdId,
    { email: String(body.email), role: body.role, timezone: body.timezone ? String(body.timezone) : null },
    c.var.userId,
    c.var.role,
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

  // The D1 write above is authoritative and is never rolled back over an
  // Access-API problem — a failed auto-grant just degrades to the same
  // manual fallback ("add them in the dashboard") that existed before this
  // feature, which is better than failing member-creation over a transient
  // Cloudflare API hiccup. This function is designed to never throw, but the
  // try/catch is defense-in-depth so a bug in it can never fail this request.
  let warning: string | undefined;
  try {
    const grant = await grantAccessListEntry(c.env, data.email);
    if (grant.status === 'failed') {
      warning = `Member added, but could not be added to the Cloudflare Access allow-list automatically (${grant.reason}). Add ${data.email} manually in the Zero Trust dashboard.`;
    }
    console.log(
      JSON.stringify({
        event: grant.status === 'failed' ? 'access-grant-failed' : 'access-grant',
        email: data.email,
        householdId: c.var.householdId,
        actor: c.var.verifiedEmail,
        ...('reason' in grant ? { reason: grant.reason } : {}),
      }),
    );
  } catch (err) {
    warning = `Member added, but could not be added to the Cloudflare Access allow-list automatically. Add ${data.email} manually in the Zero Trust dashboard.`;
    console.log(JSON.stringify({ event: 'access-grant-threw', email: data.email, error: String(err) }));
  }

  return c.json(
    { success: true, data, ...(warning ? { warning } : {}) } satisfies ApiResponse<typeof data>,
    201,
  );
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
