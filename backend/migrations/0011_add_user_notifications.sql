-- First brand-new table since 0007's join_requests. Backs Phase 1 of the
-- notifications pipe (Chore Reaper ↔ self-hosted 4irl-notifs): one row per user
-- who has enabled push notifications, holding what's needed to re-display their
-- ntfy subscribe QR without re-provisioning.
--
-- This is a plain CREATE TABLE, not an ADD COLUMN, so none of the
-- snapshot-then-rebuild dance the 0004-0006 rename migrations needed applies —
-- there's no existing table to preserve, just a new one.
--
-- Shape notes:
--   - id + a separate UNIQUE index on user_id follows this repo's convention
--     (every table has an autoincrement id; natural keys get their own UNIQUE
--     index) — see join_requests (0007). UNIQUE(user_id) enforces one
--     notifications row per user, which the enable/disable soft-off path relies on.
--   - person_hash / subscriber_token are the per-user credentials returned by
--     4irl-notifs provisioning. subscriber_token is stored server-side (no prior
--     token-column precedent, but it's a per-user credential, not an account
--     secret) so a soft-off then re-enable can re-show the subscribe QR without
--     re-provisioning (which would reset the token).
--   - enabled is the soft-off flag (1 = on). Disable flips it to 0 while keeping
--     person_hash/subscriber_token, so re-enable is a flag flip, not a re-provision.
--   - user_id REFERENCES users(id) with no ON DELETE clause, matching every other
--     table here; the cascade on user deletion is hand-rolled in
--     admin-users.ts deleteUser()'s db.batch().
CREATE TABLE user_notifications (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    person_hash       TEXT NOT NULL,
    subscriber_token  TEXT NOT NULL,
    enabled           INTEGER NOT NULL DEFAULT 1,
    provisioned_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX idx_user_notifications_user_id ON user_notifications(user_id);
