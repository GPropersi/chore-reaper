import { env } from 'cloudflare:workers';

export type SeedUserSpec = {
  id: number;
  organizationId: number;
  email: string;
  role: 'admin' | 'member';
  timezone?: string | null;
};

// Seeds both the (still-physically-present, legacy) users.organization_id/role
// columns and the authoritative org_members row — mirrors exactly what
// addOrgMember does for a brand-new person, so tests reflect real app state.
export async function seedOrgMember(spec: SeedUserSpec) {
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (?, ?, ?, ?, ?)',
    ).bind(spec.id, spec.organizationId, spec.email, spec.role, spec.timezone ?? null),
    env.DB.prepare('INSERT INTO org_members (user_id, organization_id, role) VALUES (?, ?, ?)').bind(
      spec.id,
      spec.organizationId,
      spec.role,
    ),
  ]);
}

// A second membership for a user who already has a `users` row — the
// multi-org case. Does not touch the users row at all.
export async function seedAdditionalMembership(
  userId: number,
  organizationId: number,
  role: 'admin' | 'member',
) {
  await env.DB.prepare('INSERT INTO org_members (user_id, organization_id, role) VALUES (?, ?, ?)')
    .bind(userId, organizationId, role)
    .run();
}
