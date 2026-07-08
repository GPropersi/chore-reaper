-- Renames the org concept to "household" throughout: `organizations` has
-- existed since 0001_init.sql (already deployed to production); `org_members`
-- is new in this same unmerged branch (0003, not yet deployed). SQLite/D1
-- support RENAME TO / RENAME COLUMN as atomic metadata operations — no table
-- rebuild, no data loss — and automatically update REFERENCES clauses in
-- dependent tables' schemas when the referenced table is renamed, so
-- chores/rooms/users/org_members's `REFERENCES organizations(id)` clauses get
-- repointed to `households(id)` by the first statement below.

ALTER TABLE organizations RENAME TO households;
ALTER TABLE org_members RENAME TO household_members;

ALTER TABLE users RENAME COLUMN organization_id TO household_id;
ALTER TABLE chores RENAME COLUMN organization_id TO household_id;
ALTER TABLE rooms RENAME COLUMN organization_id TO household_id;
ALTER TABLE household_members RENAME COLUMN organization_id TO household_id;

-- Recreate indexes under matching names — RENAME COLUMN updates what an
-- index references, but not the index's own name, which would otherwise
-- still say "organization_id" cosmetically.
DROP INDEX idx_users_organization_id;
CREATE INDEX idx_users_household_id ON users(household_id);

DROP INDEX idx_chores_organization_id;
CREATE INDEX idx_chores_household_id ON chores(household_id);

DROP INDEX idx_chores_org_client_id;
CREATE UNIQUE INDEX idx_chores_household_client_id ON chores(household_id, client_id) WHERE client_id IS NOT NULL;

DROP INDEX idx_rooms_org_name;
CREATE UNIQUE INDEX idx_rooms_household_name ON rooms(household_id, name);

DROP INDEX idx_rooms_organization_id;
CREATE INDEX idx_rooms_household_id ON rooms(household_id);

DROP INDEX idx_org_members_user_org;
CREATE UNIQUE INDEX idx_household_members_user_household ON household_members(user_id, household_id);

DROP INDEX idx_org_members_organization_id;
CREATE INDEX idx_household_members_household_id ON household_members(household_id);
