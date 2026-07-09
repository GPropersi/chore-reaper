export type AdminUserWire = {
  id: number;
  email: string;
  timezone: string | null;
  isAdmin: boolean;
  households: { id: number; name: string }[];
};

type Row = {
  user_id: number;
  email: string;
  timezone: string | null;
  is_admin: number;
  household_id: number | null;
  household_name: string | null;
};

export async function getAllUsersWithHouseholds(db: D1Database): Promise<AdminUserWire[]> {
  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.email AS email, u.timezone AS timezone, u.is_admin AS is_admin,
              h.id AS household_id, h.name AS household_name
       FROM users u
       LEFT JOIN household_members hm ON hm.user_id = u.id
       LEFT JOIN households h ON h.id = hm.household_id
       ORDER BY u.email, h.name`,
    )
    .all<Row>();

  const byId = new Map<number, AdminUserWire>();
  for (const row of result.results) {
    let user = byId.get(row.user_id);
    if (!user) {
      user = {
        id: row.user_id,
        email: row.email,
        timezone: row.timezone,
        isAdmin: row.is_admin === 1,
        households: [],
      };
      byId.set(row.user_id, user);
    }
    if (row.household_id != null && row.household_name != null) {
      user.households.push({ id: row.household_id, name: row.household_name });
    }
  }
  return Array.from(byId.values());
}

export type DeleteUserResult = { status: 'deleted'; email: string } | { status: 'not_found' };

// Cascades a user delete across every table with a live FK to users(id) —
// D1 enforces foreign keys, so these have to run in this order (see the
// snapshot-then-rebuild rationale comments on migrations 0004-0006 for how
// seriously this repo takes that constraint). household_members.invited_by
// and join_requests.resolved_by are nullable, so rows the user *acted on*
// survive with that reference cleared; join_requests.requested_by is
// NOT NULL, so the user's own pending/resolved requests are deleted outright
// rather than orphaned.
export async function deleteUser(db: D1Database, userId: number): Promise<DeleteUserResult> {
  const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{
    email: string;
  }>();
  if (!user) {
    return { status: 'not_found' };
  }

  await db.batch([
    db.prepare('DELETE FROM household_members WHERE user_id = ?').bind(userId),
    db.prepare('UPDATE household_members SET invited_by = NULL WHERE invited_by = ?').bind(userId),
    db.prepare('DELETE FROM join_requests WHERE requested_by = ?').bind(userId),
    db.prepare('UPDATE join_requests SET resolved_by = NULL WHERE resolved_by = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  return { status: 'deleted', email: user.email };
}
