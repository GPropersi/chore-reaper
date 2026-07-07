import { Hono } from 'hono';
import type { ApiResponse } from '../../../types/SharedTypes.js';
import { getMembersByOrg, addOrgMember, removeOrgMember } from '../members.js';
import { grantAccessListEntry } from '../access-allowlist.js';
import type { AppEnv } from '../types.js';

const members = new Hono<AppEnv>();

members.get('/', async (c) => {
  const data = await getMembersByOrg(c.env.DB, c.var.organizationId);
  return c.json({ success: true, data } satisfies ApiResponse<typeof data>);
});

members.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.email || (body.role !== 'admin' && body.role !== 'member')) {
    return c.json({ success: false, error: 'Missing required fields' } satisfies ApiResponse<never>, 400);
  }
  // organizationId always comes from the admin's own session, never the
  // request body — an admin cannot add a member to a different org by
  // passing a different organizationId here.
  const result = await addOrgMember(
    c.env.DB,
    c.var.organizationId,
    { email: String(body.email), role: body.role, timezone: body.timezone ? String(body.timezone) : null },
    c.var.userId,
  );

  if (result.status === 'already_member') {
    return c.json(
      {
        success: false,
        error: 'This email is already a member of this organization',
      } satisfies ApiResponse<never>,
      409,
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
        organizationId: c.var.organizationId,
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
  const removed = await removeOrgMember(c.env.DB, c.var.organizationId, id);
  if (!removed) {
    return c.json({ success: false, error: 'Member not found' } satisfies ApiResponse<never>, 404);
  }
  return c.json({ success: true, data: null } satisfies ApiResponse<null>);
});

export default members;
