CREATE TABLE rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX idx_rooms_org_name ON rooms(organization_id, name);
CREATE INDEX idx_rooms_organization_id ON rooms(organization_id);

-- Backfill: one room per distinct existing chores.room value, per org.
INSERT INTO rooms (organization_id, name)
SELECT DISTINCT organization_id, room FROM chores;

-- SQLite can't relax a column's NOT NULL constraint via a plain ALTER TABLE,
-- so this is a full table rebuild: recreate chores with `room` now nullable
-- (kept, not dropped, as a recovery path) plus the new `room_id` FK, copy
-- every row across with room_id resolved from the rooms just backfilled
-- above, then swap the tables. A follow-up migration drops `room` entirely
-- and tightens `room_id` to NOT NULL once the app's cutover to room_id is
-- deployed and verified in production.
CREATE TABLE chores_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id     INTEGER NOT NULL REFERENCES organizations(id),
    name                TEXT NOT NULL,
    details             TEXT,
    room                TEXT,
    room_id             INTEGER REFERENCES rooms(id),
    date_last_completed TEXT NOT NULL,
    duration            INTEGER NOT NULL,
    frequency           INTEGER NOT NULL,
    urgency             TEXT CHECK (urgency IN ('low', 'medium', 'high')),
    long_term_task      INTEGER NOT NULL DEFAULT 0,
    version             INTEGER NOT NULL DEFAULT 1,
    client_id           TEXT
);

INSERT INTO chores_new
  (id, organization_id, name, details, room, room_id, date_last_completed, duration, frequency, urgency, long_term_task, version, client_id)
SELECT
  c.id, c.organization_id, c.name, c.details, c.room,
  (SELECT r.id FROM rooms r WHERE r.organization_id = c.organization_id AND r.name = c.room),
  c.date_last_completed, c.duration, c.frequency, c.urgency, c.long_term_task, c.version, c.client_id
FROM chores c;

DROP TABLE chores;
ALTER TABLE chores_new RENAME TO chores;

CREATE INDEX idx_chores_organization_id ON chores(organization_id);
CREATE UNIQUE INDEX idx_chores_org_client_id ON chores(organization_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_chores_room_id ON chores(room_id);
