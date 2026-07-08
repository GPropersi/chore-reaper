import { env } from 'cloudflare:workers';

export type SeedUserSpec = {
  id: number;
  householdId: number;
  email: string;
  role: 'admin' | 'user';
  timezone?: string | null;
};

// Seeds both the (still-physically-present, legacy) users.household_id/role
// columns and the authoritative household_members row — mirrors exactly what
// addHouseholdMember does for a brand-new person, so tests reflect real app state.
export async function seedHouseholdMember(spec: SeedUserSpec) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, household_id, email, role, timezone) VALUES (?, ?, ?, ?, ?)').bind(
      spec.id,
      spec.householdId,
      spec.email,
      spec.role,
      spec.timezone ?? null,
    ),
    env.DB.prepare('INSERT INTO household_members (user_id, household_id, role) VALUES (?, ?, ?)').bind(
      spec.id,
      spec.householdId,
      spec.role,
    ),
  ]);
}

// A second membership for a user who already has a `users` row — the
// multi-household case. Does not touch the users row at all.
export async function seedAdditionalMembership(userId: number, householdId: number, role: 'admin' | 'user') {
  await env.DB.prepare('INSERT INTO household_members (user_id, household_id, role) VALUES (?, ?, ?)')
    .bind(userId, householdId, role)
    .run();
}
