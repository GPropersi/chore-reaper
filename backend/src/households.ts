export type HouseholdWire = {
  id: number;
  name: string;
  timezone: string;
};

export type HouseholdListItem = {
  id: number;
  name: string;
};

export async function listAllHouseholds(db: D1Database): Promise<HouseholdListItem[]> {
  const result = await db.prepare('SELECT id, name FROM households ORDER BY name').all<HouseholdListItem>();
  return result.results;
}

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function updateHouseholdTimezone(
  db: D1Database,
  householdId: number,
  timezone: string,
): Promise<HouseholdWire | null> {
  await db.prepare('UPDATE households SET timezone = ? WHERE id = ?').bind(timezone, householdId).run();
  const row = await db
    .prepare('SELECT id, name, timezone FROM households WHERE id = ?')
    .bind(householdId)
    .first<HouseholdWire>();
  return row ?? null;
}

export type CreateHouseholdResult =
  { status: 'created'; household: HouseholdWire } | { status: 'duplicate_name' };

// The only other place a household gets created is bootstrap-admin.ts (a
// CLI script for the very first household + admin), which also creates a
// user and household_members row in the same call — this is deliberately
// bare, creating only the households row. An admin adding people to the
// new household is already covered by the existing POST /api/admin/members
// (cross-household add) flow, so there's no need to duplicate that here.
export async function createHousehold(
  db: D1Database,
  name: string,
  timezone: string,
): Promise<CreateHouseholdResult> {
  const existing = await db.prepare('SELECT id FROM households WHERE name = ?').bind(name).first<{
    id: number;
  }>();
  if (existing) {
    return { status: 'duplicate_name' };
  }

  const result = await db
    .prepare('INSERT INTO households (name, timezone) VALUES (?, ?)')
    .bind(name, timezone)
    .run();

  return { status: 'created', household: { id: result.meta.last_row_id, name, timezone } };
}
