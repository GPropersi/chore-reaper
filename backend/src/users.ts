export type UserWire = {
  id: number;
  organizationId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

export type UserInput = {
  email: string;
  role: 'admin' | 'member';
  timezone?: string | null;
};

type MembershipListRow = {
  id: number;
  organization_id: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

export async function getUsersByOrg(db: D1Database, organizationId: number): Promise<UserWire[]> {
  const result = await db
    .prepare(
      `SELECT u.id AS id, om.organization_id AS organization_id, u.email AS email,
              om.role AS role, u.timezone AS timezone
       FROM org_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = ?
       ORDER BY u.id`,
    )
    .bind(organizationId)
    .all<MembershipListRow>();
  return result.results.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    timezone: row.timezone,
  }));
}

export type AddOrgMemberResult =
  | { status: 'created'; user: UserWire }
  | { status: 'added_existing'; user: UserWire }
  | { status: 'already_member' };

export async function addOrgMember(
  db: D1Database,
  organizationId: number,
  input: UserInput,
  invitedBy: number,
): Promise<AddOrgMemberResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .prepare('SELECT id, email, timezone FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string; timezone: string | null }>();

  if (existing) {
    const existingMembership = await db
      .prepare('SELECT id FROM org_members WHERE user_id = ? AND organization_id = ?')
      .bind(existing.id, organizationId)
      .first<{ id: number }>();
    if (existingMembership) {
      return { status: 'already_member' };
    }

    await db
      .prepare('INSERT INTO org_members (user_id, organization_id, role, invited_by) VALUES (?, ?, ?, ?)')
      .bind(existing.id, organizationId, input.role, invitedBy)
      .run();

    return {
      status: 'added_existing',
      user: {
        id: existing.id,
        organizationId,
        email: existing.email,
        role: input.role,
        timezone: existing.timezone,
      },
    };
  }

  // Brand-new person. `users.organization_id`/`role`/`invited_by` are still
  // physically NOT NULL columns (a follow-up migration removes them once the
  // org_members cutover is verified in production), so this keeps writing a
  // value into them for constraint compliance — application code never reads
  // them back; org_members is the sole source of truth for org/role from here.
  const result = await db
    .prepare('INSERT INTO users (organization_id, email, role, timezone, invited_by) VALUES (?, ?, ?, ?, ?)')
    .bind(organizationId, email, input.role, input.timezone ?? null, invitedBy)
    .run();
  const newUserId = result.meta.last_row_id;

  await db
    .prepare('INSERT INTO org_members (user_id, organization_id, role, invited_by) VALUES (?, ?, ?, ?)')
    .bind(newUserId, organizationId, input.role, invitedBy)
    .run();

  const row = await db
    .prepare('SELECT id, email, timezone FROM users WHERE id = ?')
    .bind(newUserId)
    .first<{ id: number; email: string; timezone: string | null }>();

  return {
    status: 'created',
    user: { id: row!.id, organizationId, email: row!.email, role: input.role, timezone: row!.timezone },
  };
}

export async function removeOrgMember(
  db: D1Database,
  organizationId: number,
  userId: number,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM org_members WHERE user_id = ? AND organization_id = ?')
    .bind(userId, organizationId)
    .run();
  return result.meta.changes > 0;
}
