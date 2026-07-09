// Mirrors migration 0009_protect_owner_account.sql's trigger definition —
// kept in one place so tests that need to remove a giovannigp@gmail.com row
// they seeded (that row is otherwise permanently undeletable, by design)
// don't each hand-roll a copy that could drift from the real migration.
const TRIGGER_SQL = `CREATE TRIGGER prevent_owner_account_deletion
BEFORE DELETE ON users
WHEN OLD.email = 'giovannigp@gmail.com'
BEGIN
    SELECT RAISE(ABORT, 'This account cannot be deleted');
END`;

// A seeded giovannigp@gmail.com row survives any normal DELETE by design,
// which would otherwise poison every other test file's own blanket
// `DELETE FROM users` reset (this suite's D1 storage isn't isolated per
// file). Call this in a `finally` block to drop the trigger just long
// enough to remove the row this test seeded (and anything with a live FK to
// it — same cascade deleteUser() does), then restore the trigger
// immediately. Uses .prepare().run() throughout, not .exec() — D1's .exec()
// mis-splits a multi-statement CREATE TRIGGER ... BEGIN ... END body on the
// semicolons inside it.
export async function cleanupProtectedOwnerRow(db: D1Database, userId: number): Promise<void> {
  await db.prepare('DROP TRIGGER prevent_owner_account_deletion').run();
  await db.prepare('DELETE FROM household_members WHERE user_id = ?').bind(userId).run();
  await db.prepare('UPDATE household_members SET invited_by = NULL WHERE invited_by = ?').bind(userId).run();
  await db.prepare('DELETE FROM join_requests WHERE requested_by = ?').bind(userId).run();
  await db.prepare('UPDATE join_requests SET resolved_by = NULL WHERE resolved_by = ?').bind(userId).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  await db.prepare(TRIGGER_SQL).run();
}
