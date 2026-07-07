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
  const existingOrg = await db
    .prepare('SELECT id FROM organizations WHERE name = ?')
    .bind(orgName)
    .first<{ id: number }>();
  if (existingOrg) {
    throw new Error(
      `An organization named "${orgName}" already exists (id ${existingOrg.id}) — refusing to create a duplicate`,
    );
  }

  const orgResult = await db
    .prepare('INSERT INTO organizations (name, timezone) VALUES (?, ?)')
    .bind(orgName, timezone)
    .run();
  const organizationId = orgResult.meta.last_row_id;

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const existingUser = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first<{ id: number }>();

  // Same person bootstrapping a second org (e.g. running this script twice
  // with the same email for two different households) reuses their existing
  // `users` row — email is a person's single identity — and just gains a new
  // org_members row for the new org.
  let userId: number | bigint;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    const userResult = await db
      .prepare("INSERT INTO users (organization_id, email, role) VALUES (?, ?, 'admin')")
      .bind(organizationId, normalizedEmail)
      .run();
    userId = userResult.meta.last_row_id;
  }

  await db
    .prepare("INSERT INTO org_members (user_id, organization_id, role) VALUES (?, ?, 'admin')")
    .bind(userId, organizationId)
    .run();

  return { organizationId, userId };
}
