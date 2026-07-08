-- Renames the non-admin role value from 'member' to 'user': "member" is
-- ambiguous once every person in a household — admins included — is a
-- household member. The role that actually needs its own name is the
-- non-admin one, and "user" matches the users table this role lives on.
--
-- The role is enforced by a CHECK constraint baked into each table's DDL,
-- which SQLite can't alter in place — same table-rebuild requirement as the
-- room-NOT-NULL relaxation in 0002. Two tables carry this CHECK: `users`
-- (has held real production rows since 0001_init.sql) and
-- `household_members` (new in this same unmerged branch, not yet deployed,
-- rebuilt here anyway to keep all such changes in dedicated migrations
-- rather than editing past ones).
--
-- D1 enforces foreign keys, and DROP TABLE performs an implicit DELETE FROM
-- first — so dropping `users` while `household_members.user_id` or `users`'
-- own self-referencing `invited_by` still point at live rows fails with
-- SQLITE_CONSTRAINT_FOREIGNKEY (confirmed by testing this migration against
-- a populated local D1, not just the always-empty-then-seeded DB the test
-- suite uses, which never has real FK-referencing data at migration time
-- and silently doesn't exercise this at all). PRAGMA foreign_keys=OFF does
-- not help either — wrangler applies a whole migration file as one
-- transaction, and per SQLite's docs this pragma is a no-op inside one.
-- Instead: snapshot household_members and users.invited_by into plain
-- tables (no FK constraints) first, null out the columns that reference
-- `users` before dropping it, then restore the real values once the
-- rebuilt table is back under the `users` name and can reference itself
-- again.

CREATE TABLE users_invited_by_snapshot AS SELECT id, invited_by FROM users;

CREATE TABLE household_members_snapshot AS SELECT * FROM household_members;
DROP TABLE household_members;

CREATE TABLE users_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id    INTEGER NOT NULL REFERENCES households(id),
    email           TEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    timezone        TEXT,
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    invited_by      INTEGER REFERENCES users(id)
);

INSERT INTO users_new (id, household_id, email, role, timezone, created_at, invited_by)
SELECT id, household_id, email,
       CASE WHEN role = 'member' THEN 'user' ELSE role END,
       timezone, created_at, NULL
FROM users;

UPDATE users SET invited_by = NULL;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

UPDATE users SET invited_by = (
  SELECT invited_by FROM users_invited_by_snapshot WHERE users_invited_by_snapshot.id = users.id
);
DROP TABLE users_invited_by_snapshot;

CREATE INDEX idx_users_household_id ON users(household_id);

CREATE TABLE household_members_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    household_id    INTEGER NOT NULL REFERENCES households(id),
    role            TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    invited_by      INTEGER REFERENCES users(id)
);

INSERT INTO household_members_new (id, user_id, household_id, role, created_at, invited_by)
SELECT id, user_id, household_id,
       CASE WHEN role = 'member' THEN 'user' ELSE role END,
       created_at, invited_by
FROM household_members_snapshot;

DROP TABLE household_members_snapshot;
ALTER TABLE household_members_new RENAME TO household_members;

CREATE UNIQUE INDEX idx_household_members_user_household ON household_members(user_id, household_id);
CREATE INDEX idx_household_members_household_id ON household_members(household_id);
