import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { cleanupProtectedOwnerRow } from './helpers/protected-owner.js';

// Covers migration 0009_protect_owner_account.sql — a BEFORE DELETE trigger
// that makes deleting the app owner's account (giovannigp@gmail.com)
// actually impossible at the database layer, not just discouraged by
// application code. This is deliberately exercised with a raw DELETE
// statement (bypassing deleteUser() in admin-users.ts entirely) to prove the
// trigger itself is what blocks it, independent of any app-level check.
beforeEach(async () => {
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
});

describe('prevent_owner_account_deletion trigger', () => {
  it('rejects a raw DELETE against the protected email', async () => {
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (1, ?)').bind('giovannigp@gmail.com').run();

    try {
      await expect(env.DB.prepare('DELETE FROM users WHERE id = 1').run()).rejects.toThrow();

      const stillThere = await env.DB.prepare('SELECT id FROM users WHERE id = 1').first();
      expect(stillThere).not.toBeNull();
    } finally {
      await cleanupProtectedOwnerRow(env.DB, 1);
    }
  });

  it('does not interfere with deleting any other user', async () => {
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (1, ?)').bind('someone@example.com').run();

    await env.DB.prepare('DELETE FROM users WHERE id = 1').run();

    const gone = await env.DB.prepare('SELECT id FROM users WHERE id = 1').first();
    expect(gone).toBeNull();
  });
});
