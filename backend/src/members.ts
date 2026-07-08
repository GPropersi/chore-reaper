export type MemberWire = {
  id: number;
  householdId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

export type MemberInput = {
  email: string;
  role: 'admin' | 'member';
  timezone?: string | null;
};

type MembershipListRow = {
  id: number;
  household_id: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

export async function getMembersByHousehold(db: D1Database, householdId: number): Promise<MemberWire[]> {
  const result = await db
    .prepare(
      `SELECT u.id AS id, om.household_id AS household_id, u.email AS email,
              om.role AS role, u.timezone AS timezone
       FROM household_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.household_id = ?
       ORDER BY u.id`,
    )
    .bind(householdId)
    .all<MembershipListRow>();
  return result.results.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    role: row.role,
    timezone: row.timezone,
  }));
}

export type AddHouseholdMemberResult =
  | { status: 'created'; member: MemberWire }
  | { status: 'added_existing'; member: MemberWire }
  | { status: 'already_member' };

export async function addHouseholdMember(
  db: D1Database,
  householdId: number,
  input: MemberInput,
  invitedBy: number,
): Promise<AddHouseholdMemberResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .prepare('SELECT id, email, timezone FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string; timezone: string | null }>();

  if (existing) {
    const existingMembership = await db
      .prepare('SELECT id FROM household_members WHERE user_id = ? AND household_id = ?')
      .bind(existing.id, householdId)
      .first<{ id: number }>();
    if (existingMembership) {
      return { status: 'already_member' };
    }

    await db
      .prepare('INSERT INTO household_members (user_id, household_id, role, invited_by) VALUES (?, ?, ?, ?)')
      .bind(existing.id, householdId, input.role, invitedBy)
      .run();

    return {
      status: 'added_existing',
      member: {
        id: existing.id,
        householdId,
        email: existing.email,
        role: input.role,
        timezone: existing.timezone,
      },
    };
  }

  // Brand-new person. `users.household_id`/`role`/`invited_by` are still
  // physically NOT NULL columns (a follow-up migration removes them once the
  // household_members cutover is verified in production), so this keeps writing a
  // value into them for constraint compliance — application code never reads
  // them back; household_members is the sole source of truth for household/role from here.
  const result = await db
    .prepare('INSERT INTO users (household_id, email, role, timezone, invited_by) VALUES (?, ?, ?, ?, ?)')
    .bind(householdId, email, input.role, input.timezone ?? null, invitedBy)
    .run();
  const newUserId = result.meta.last_row_id;

  await db
    .prepare('INSERT INTO household_members (user_id, household_id, role, invited_by) VALUES (?, ?, ?, ?)')
    .bind(newUserId, householdId, input.role, invitedBy)
    .run();

  const row = await db
    .prepare('SELECT id, email, timezone FROM users WHERE id = ?')
    .bind(newUserId)
    .first<{ id: number; email: string; timezone: string | null }>();

  return {
    status: 'created',
    member: { id: row!.id, householdId, email: row!.email, role: input.role, timezone: row!.timezone },
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
