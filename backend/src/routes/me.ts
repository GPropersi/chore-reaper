import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const me = new Hono<AppEnv>();

type MembershipRow = {
  organization_id: number;
  organization_name: string;
  organization_timezone: string;
  role: 'admin' | 'member';
};

me.get('/', async (c) => {
  const memberships = await c.env.DB.prepare(
    `SELECT om.organization_id AS organization_id, o.name AS organization_name,
            o.timezone AS organization_timezone, om.role AS role
     FROM org_members om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = ?
     ORDER BY o.name`,
  )
    .bind(c.var.userId)
    .all<MembershipRow>();

  const current = memberships.results.find((m) => m.organization_id === c.var.organizationId);

  return c.json({
    id: c.var.userId,
    email: c.var.verifiedEmail,
    timezone: c.var.timezone ?? current?.organization_timezone ?? null,
    memberships: memberships.results.map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organization_name,
      organizationTimezone: m.organization_timezone,
      role: m.role,
    })),
    currentOrganizationId: c.var.organizationId,
  });
});

export default me;
