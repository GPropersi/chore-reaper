export type UserRow = {
  id: number;
  organization_id: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

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

function rowToUser(row: UserRow): UserWire {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    timezone: row.timezone,
  };
}

export async function getUsersByOrg(db: D1Database, organizationId: number): Promise<UserWire[]> {
  const result = await db
    .prepare(
      'SELECT id, organization_id, email, role, timezone FROM users WHERE organization_id = ? ORDER BY id',
    )
    .bind(organizationId)
    .all<UserRow>();
  return result.results.map(rowToUser);
}

export async function createUser(
  db: D1Database,
  organizationId: number,
  input: UserInput,
  invitedBy: number,
): Promise<UserWire> {
  const result = await db
    .prepare('INSERT INTO users (organization_id, email, role, timezone, invited_by) VALUES (?, ?, ?, ?, ?)')
    .bind(organizationId, input.email.trim().toLowerCase(), input.role, input.timezone ?? null, invitedBy)
    .run();

  const row = await db
    .prepare(
      'SELECT id, organization_id, email, role, timezone FROM users WHERE id = ? AND organization_id = ?',
    )
    .bind(result.meta.last_row_id, organizationId)
    .first<UserRow>();
  return rowToUser(row!);
}

export async function deleteUserInOrg(db: D1Database, organizationId: number, id: number): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM users WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .run();
  return result.meta.changes > 0;
}
