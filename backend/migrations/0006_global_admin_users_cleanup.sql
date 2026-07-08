-- "Admin" moves from a per-household attribute (household_members.role) to a
-- global, per-account one (users.is_admin) — a household member and their
-- household admin/user status were never actually different concepts in
-- practice, but the old shape let the same person be admin of one household
-- and merely a member of another, which the app never intended to support.
-- households only track membership from here on; the app itself has users
-- and admins.
--
-- This also finally does the cleanup 0003_org_members.sql's own comment
-- promised and never delivered: users.household_id/role/invited_by have been
-- dead weight since household_members became the source of truth — written
-- on every insert for NOT NULL compliance, never read back by any query.
--
-- Same table-rebuild requirement/technique as 0005 (SQLite can't ALTER a
-- CHECK constraint or drop a column referenced by a live FK in one step; See
-- 0005's own comment for the full explanation of the snapshot-then-rebuild
-- dance forced by D1 enforcing FKs plus DROP TABLE's implicit DELETE FROM).
-- users.invited_by is NOT restored this time (unlike 0005) — it's being
-- dropped for good, not renamed, so it's simply nulled out before the drop
-- and never comes back.

CREATE TABLE household_members_snapshot AS SELECT * FROM household_members;
DROP TABLE household_members;

UPDATE users SET invited_by = NULL;

CREATE TABLE users_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    timezone   TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    is_admin   INTEGER NOT NULL DEFAULT 0
);

-- Seed is_admin from the old per-household model: anyone who was 'admin' of
-- at least one household becomes a global admin. Nobody loses access as a
-- side effect of this migration.
INSERT INTO users_new (id, email, timezone, created_at, is_admin)
SELECT u.id, u.email, u.timezone, u.created_at,
       CASE WHEN EXISTS (
         SELECT 1 FROM household_members_snapshot hms
         WHERE hms.user_id = u.id AND hms.role = 'admin'
       ) THEN 1 ELSE 0 END
FROM users u;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE household_members_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    household_id INTEGER NOT NULL REFERENCES households(id),
    created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    invited_by   INTEGER REFERENCES users(id)
);

INSERT INTO household_members_new (id, user_id, household_id, created_at, invited_by)
SELECT id, user_id, household_id, created_at, invited_by
FROM household_members_snapshot;

DROP TABLE household_members_snapshot;
ALTER TABLE household_members_new RENAME TO household_members;

CREATE UNIQUE INDEX idx_household_members_user_household ON household_members(user_id, household_id);
CREATE INDEX idx_household_members_household_id ON household_members(household_id);
