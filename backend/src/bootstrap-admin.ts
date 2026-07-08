export type BootstrapResult = {
  householdId: number;
  userId: number;
};

export async function bootstrapAdmin(
  db: D1Database,
  householdName: string,
  adminEmail: string,
  timezone = 'UTC',
): Promise<BootstrapResult> {
  const existingHousehold = await db
    .prepare('SELECT id FROM households WHERE name = ?')
    .bind(householdName)
    .first<{ id: number }>();
  if (existingHousehold) {
    throw new Error(
      `A household named "${householdName}" already exists (id ${existingHousehold.id}) — refusing to create a duplicate`,
    );
  }

  const householdResult = await db
    .prepare('INSERT INTO households (name, timezone) VALUES (?, ?)')
    .bind(householdName, timezone)
    .run();
  const householdId = householdResult.meta.last_row_id;

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const existingUser = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first<{ id: number }>();

  // Same person bootstrapping a second household (e.g. running this script
  // twice with the same email for two different households) reuses their
  // existing `users` row — email is a person's single identity — and just
  // gains a new household_members row for the new household. Admin is
  // global, so bootstrapping always grants it, even to someone who already
  // had a non-admin account from some other household.
  let userId: number | bigint;
  if (existingUser) {
    userId = existingUser.id;
    await db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(userId).run();
  } else {
    const userResult = await db
      .prepare('INSERT INTO users (email, is_admin) VALUES (?, 1)')
      .bind(normalizedEmail)
      .run();
    userId = userResult.meta.last_row_id;
  }

  await db
    .prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)')
    .bind(userId, householdId)
    .run();

  return { householdId, userId };
}
