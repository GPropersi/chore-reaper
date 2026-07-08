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
