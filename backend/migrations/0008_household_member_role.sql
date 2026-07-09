-- Adds a per-membership `role` column to household_members, decoupled from
-- the global `users.is_admin` flag (which controls app-wide admin access,
-- not household standing). This is prep work for a future role-based system
-- within a household — e.g. a "head" role — not wired into any app logic
-- yet. Every existing and new row defaults to 'member'. Unlike the
-- admin/user `role` column removed in 0006 (a table rebuild forced by
-- changing an existing CHECK), this is a brand-new column with a constant
-- default, which SQLite's ALTER TABLE ADD COLUMN supports directly —
-- including a CHECK constraint on the new column itself, as long as it
-- doesn't reference other columns.
ALTER TABLE household_members
    ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'head'));
