export type BootstrapResult = {
  organizationId: number;
  userId: number;
};

export async function bootstrapAdmin(
  db: D1Database,
  orgName: string,
  adminEmail: string,
  timezone = 'UTC',
): Promise<BootstrapResult> {
  const existing = await db
    .prepare('SELECT id FROM organizations WHERE name = ?')
    .bind(orgName)
    .first<{ id: number }>();
  if (existing) {
    throw new Error(
      `An organization named "${orgName}" already exists (id ${existing.id}) — refusing to create a duplicate`,
    );
  }

  const orgResult = await db
    .prepare('INSERT INTO organizations (name, timezone) VALUES (?, ?)')
    .bind(orgName, timezone)
    .run();
  const organizationId = orgResult.meta.last_row_id;

  const userResult = await db
    .prepare("INSERT INTO users (organization_id, email, role) VALUES (?, ?, 'admin')")
    .bind(organizationId, adminEmail)
    .run();

  return { organizationId, userId: userResult.meta.last_row_id };
}
