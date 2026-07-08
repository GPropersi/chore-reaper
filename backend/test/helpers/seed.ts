import { env } from 'cloudflare:workers';

export type SeedUserSpec = {
  id: number;
  householdId: number;
  email: string;
  isAdmin?: boolean;
  timezone?: string | null;
};

// Seeds the users row and the authoritative household_members row — mirrors
// exactly what addHouseholdMember does for a brand-new person, so tests
// reflect real app state. Admin status is global (on users), not per-membership.
export async function seedHouseholdMember(spec: SeedUserSpec) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, timezone, is_admin) VALUES (?, ?, ?, ?)').bind(
      spec.id,
      spec.email,
      spec.timezone ?? null,
      spec.isAdmin ? 1 : 0,
    ),
    env.DB.prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)').bind(
      spec.id,
      spec.householdId,
    ),
  ]);
}

// A second membership for a user who already has a `users` row — the
// multi-household case. Does not touch the users row at all.
export async function seedAdditionalMembership(userId: number, householdId: number) {
  await env.DB.prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)')
    .bind(userId, householdId)
    .run();
}
