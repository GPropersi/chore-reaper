-- Tracks a member's request to add someone who doesn't have an account yet.
-- addHouseholdMember() already lets any member add an *existing* user to
-- their household; this table backs the escalation path for the
-- no-account-yet case, which previously just hard-403'd
-- (new_user_requires_admin) with no way to follow up. An admin resolves each
-- row via approve (creates the user + household_members row, same as the
-- admin-direct-add path) or deny (no side effects beyond the status flip).

CREATE TABLE join_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id    INTEGER NOT NULL REFERENCES households(id),
    requested_email TEXT NOT NULL,
    requested_by    INTEGER NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    resolved_by     INTEGER REFERENCES users(id),
    resolved_at     TEXT
);

CREATE INDEX idx_join_requests_status ON join_requests(status);

-- Belt-and-suspenders alongside the app-level pre-check: prevents duplicate
-- pending requests for the same household+email before an admin resolves
-- the first one. Partial index (WHERE status = 'pending') rather than a
-- plain unique constraint, since the same email can legitimately be
-- requested-and-denied-and-requested-again over time.
CREATE UNIQUE INDEX idx_join_requests_pending_unique
    ON join_requests(household_id, requested_email) WHERE status = 'pending';
