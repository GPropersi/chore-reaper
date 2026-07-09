export type MemberWire = {
  id: number;
  householdId: number;
  email: string;
  isAdmin: boolean;
  timezone: string | null;
};

export type MemberInput = {
  email: string;
  timezone?: string | null;
};

type MembershipListRow = {
  id: number;
  household_id: number;
  email: string;
  is_admin: number;
  timezone: string | null;
};

export async function getMembersByHousehold(db: D1Database, householdId: number): Promise<MemberWire[]> {
  const result = await db
    .prepare(
      `SELECT u.id AS id, hm.household_id AS household_id, u.email AS email,
              u.is_admin AS is_admin, u.timezone AS timezone
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = ?
       ORDER BY u.id`,
    )
    .bind(householdId)
    .all<MembershipListRow>();
  return result.results.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    isAdmin: row.is_admin === 1,
    timezone: row.timezone,
  }));
}

export type AddHouseholdMemberResult =
  | { status: 'created'; member: MemberWire }
  | { status: 'added_existing'; member: MemberWire }
  | { status: 'already_member' }
  | { status: 'new_user_requires_admin' };

export async function addHouseholdMember(
  db: D1Database,
  householdId: number,
  input: MemberInput,
  invitedBy: number,
  callerIsAdmin: boolean,
): Promise<AddHouseholdMemberResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .prepare('SELECT id, email, timezone, is_admin FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string; timezone: string | null; is_admin: number }>();

  if (existing) {
    // Any household member — admin or not — can add someone who already has
    // an account elsewhere to their own household. No admin gate here.
    const existingMembership = await db
      .prepare('SELECT id FROM household_members WHERE user_id = ? AND household_id = ?')
      .bind(existing.id, householdId)
      .first<{ id: number }>();
    if (existingMembership) {
      return { status: 'already_member' };
    }

    await db
      .prepare('INSERT INTO household_members (user_id, household_id, invited_by) VALUES (?, ?, ?)')
      .bind(existing.id, householdId, invitedBy)
      .run();

    return {
      status: 'added_existing',
      member: {
        id: existing.id,
        householdId,
        email: existing.email,
        isAdmin: existing.is_admin === 1,
        timezone: existing.timezone,
      },
    };
  }

  // Brand-new person — this is the one action that's actually admin-gated:
  // creating a new users row is "adding a user to the app," distinct from
  // adding an existing user as a member of this household. Admin status is
  // global, so this is a straight boolean check, not a per-household lookup.
  if (!callerIsAdmin) {
    return { status: 'new_user_requires_admin' };
  }

  const result = await db
    .prepare('INSERT INTO users (email, timezone) VALUES (?, ?)')
    .bind(email, input.timezone ?? null)
    .run();
  const newUserId = result.meta.last_row_id;

  await db
    .prepare('INSERT INTO household_members (user_id, household_id, invited_by) VALUES (?, ?, ?)')
    .bind(newUserId, householdId, invitedBy)
    .run();

  const row = await db
    .prepare('SELECT id, email, timezone FROM users WHERE id = ?')
    .bind(newUserId)
    .first<{ id: number; email: string; timezone: string | null }>();

  return {
    status: 'created',
    member: { id: row!.id, householdId, email: row!.email, isAdmin: false, timezone: row!.timezone },
  };
}

export type AdminMemberInput = {
  email: string;
  timezone?: string | null;
  makeAdmin?: boolean;
};

export type AdminAddHouseholdMemberResult =
  | { status: 'created'; member: MemberWire }
  | { status: 'added_existing'; member: MemberWire }
  | { status: 'already_member' }
  | { status: 'household_not_found' };

// Admin-only counterpart to addHouseholdMember: the caller supplies an
// arbitrary target household (not their own session's), so — unlike
// addHouseholdMember, where householdId always comes from the caller's own
// verified membership — this has to validate that household actually exists.
// No callerIsAdmin gate: this is only ever reached via requireGlobalAdmin.
export async function adminAddHouseholdMember(
  db: D1Database,
  householdId: number,
  input: AdminMemberInput,
  invitedBy: number,
): Promise<AdminAddHouseholdMemberResult> {
  const household = await db.prepare('SELECT id FROM households WHERE id = ?').bind(householdId).first<{
    id: number;
  }>();
  if (!household) {
    return { status: 'household_not_found' };
  }

  const email = input.email.trim().toLowerCase();

  const existing = await db
    .prepare('SELECT id, email, timezone, is_admin FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string; timezone: string | null; is_admin: number }>();

  if (existing) {
    // makeAdmin has no effect here — this person already has an account, and
    // this endpoint only grants admin at account-creation time, same as
    // addHouseholdMember never promotes an existing account either.
    const existingMembership = await db
      .prepare('SELECT id FROM household_members WHERE user_id = ? AND household_id = ?')
      .bind(existing.id, householdId)
      .first<{ id: number }>();
    if (existingMembership) {
      return { status: 'already_member' };
    }

    await db
      .prepare('INSERT INTO household_members (user_id, household_id, invited_by) VALUES (?, ?, ?)')
      .bind(existing.id, householdId, invitedBy)
      .run();

    return {
      status: 'added_existing',
      member: {
        id: existing.id,
        householdId,
        email: existing.email,
        isAdmin: existing.is_admin === 1,
        timezone: existing.timezone,
      },
    };
  }

  const isAdmin = input.makeAdmin ?? false;
  const result = await db
    .prepare('INSERT INTO users (email, timezone, is_admin) VALUES (?, ?, ?)')
    .bind(email, input.timezone ?? null, isAdmin ? 1 : 0)
    .run();
  const newUserId = result.meta.last_row_id;

  await db
    .prepare('INSERT INTO household_members (user_id, household_id, invited_by) VALUES (?, ?, ?)')
    .bind(newUserId, householdId, invitedBy)
    .run();

  const row = await db
    .prepare('SELECT id, email, timezone FROM users WHERE id = ?')
    .bind(newUserId)
    .first<{ id: number; email: string; timezone: string | null }>();

  return {
    status: 'created',
    member: { id: row!.id, householdId, email: row!.email, isAdmin, timezone: row!.timezone },
  };
}

export async function removeHouseholdMember(
  db: D1Database,
  householdId: number,
  userId: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM household_members WHERE user_id = ? AND household_id = ?')
    .bind(userId, householdId)
    .run();
  return result.meta.changes > 0;
}
