CREATE TABLE org_members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    invited_by      INTEGER REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_org_members_user_org ON org_members(user_id, organization_id);
CREATE INDEX idx_org_members_organization_id ON org_members(organization_id);

-- Backfill: one org_members row per existing users row, carrying that row's
-- current organization_id + role forward exactly. Additive only — users
-- keeps its organization_id/role/invited_by columns untouched for now (the
-- application code from here on reads/writes via org_members exclusively,
-- but tolerates the old columns still existing). A follow-up migration
-- rebuilds `users` down to {id, email, timezone, created_at} once the
-- org_members cutover is deployed and verified in production — SQLite
-- requires a full table rebuild to drop a column, which is riskier to do
-- blind against live data than this additive step.
INSERT INTO org_members (user_id, organization_id, role, invited_by)
SELECT id, organization_id, role, invited_by FROM users;
