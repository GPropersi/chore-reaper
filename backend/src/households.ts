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
