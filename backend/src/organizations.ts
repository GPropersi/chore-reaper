export type OrgWire = {
  id: number;
  name: string;
  timezone: string;
};

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function updateOrganizationTimezone(
  db: D1Database,
  organizationId: number,
  timezone: string,
): Promise<OrgWire | null> {
  await db.prepare('UPDATE organizations SET timezone = ? WHERE id = ?').bind(timezone, organizationId).run();
  const row = await db
    .prepare('SELECT id, name, timezone FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first<OrgWire>();
  return row ?? null;
}
