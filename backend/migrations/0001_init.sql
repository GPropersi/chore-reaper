CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    timezone   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    email           TEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    timezone        TEXT,
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    invited_by      INTEGER REFERENCES users(id)
);

CREATE INDEX idx_users_organization_id ON users(organization_id);

CREATE TABLE chores (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id     INTEGER NOT NULL REFERENCES organizations(id),
    name                TEXT NOT NULL,
    details             TEXT,
    room                TEXT NOT NULL,
    date_last_completed TEXT NOT NULL,
    duration            INTEGER NOT NULL,
    frequency           INTEGER NOT NULL,
    urgency             TEXT CHECK (urgency IN ('low', 'medium', 'high')),
    long_term_task      INTEGER NOT NULL DEFAULT 0,
    version             INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_chores_organization_id ON chores(organization_id);
