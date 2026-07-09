-- Per-user preference for how chore-row swipe gestures behave: 'ios'
-- (default — left-swipe reveals edit+delete together, a tap then confirms)
-- or 'android' (swipe right commits delete, swipe left commits edit
-- directly, no confirm tap). Same ADD COLUMN + CHECK technique as 0008's
-- household_members.role — a brand-new column with a constant default,
-- which SQLite's ALTER TABLE ADD COLUMN supports directly.
ALTER TABLE users
    ADD COLUMN swipe_style TEXT NOT NULL DEFAULT 'ios' CHECK (swipe_style IN ('ios', 'android'));
