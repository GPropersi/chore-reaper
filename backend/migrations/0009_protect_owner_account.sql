-- Guards the app owner's account (giovannigp@gmail.com) against deletion at
-- the database layer, not just in application code — defense-in-depth in
-- case a future code path (or a manual `wrangler d1 execute` against
-- production) tries to delete it directly. The app-level check in
-- deleteUser() (backend/src/admin-users.ts) is what surfaces a friendly
-- error to the caller; this trigger is what makes the delete actually
-- impossible rather than merely discouraged.
CREATE TRIGGER prevent_owner_account_deletion
BEFORE DELETE ON users
WHEN OLD.email = 'giovannigp@gmail.com'
BEGIN
    SELECT RAISE(ABORT, 'This account cannot be deleted');
END;
