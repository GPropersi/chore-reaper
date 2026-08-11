import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { getProvisioning, saveProvisioning, setEnabled } from '../src/notifications.js';

const USER_ID = 1;

beforeEach(async () => {
  await env.DB.exec('DELETE FROM user_notifications');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.prepare('INSERT INTO users (id, email, is_admin) VALUES (?, ?, 0)')
    .bind(USER_ID, 'user@example.com')
    .run();
});

describe('getProvisioning', () => {
  it('returns null when no user_notifications row exists', async () => {
    expect(await getProvisioning(env.DB, USER_ID)).toBeNull();
  });

  it('returns personHash/subscriberToken/enabled for an existing row', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });

    expect(await getProvisioning(env.DB, USER_ID)).toEqual({
      personHash: 'hash-1',
      subscriberToken: 'tk_1',
      enabled: true,
    });
  });

  it("reflects the row's current enabled value", async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });
    await setEnabled(env.DB, USER_ID, false);

    expect((await getProvisioning(env.DB, USER_ID))?.enabled).toBe(false);
  });
});

describe('saveProvisioning', () => {
  it('inserts then updates in place on re-call, keeping exactly one row', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-2', subscriberToken: 'tk_2' });

    const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ?')
      .bind(USER_ID)
      .first<{ n: number }>();
    expect(countRow?.n).toBe(1);
    expect(await getProvisioning(env.DB, USER_ID)).toEqual({
      personHash: 'hash-2',
      subscriberToken: 'tk_2',
      enabled: true,
    });
  });

  it('resets enabled to 1 on re-call, re-enabling a previously soft-off row', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });
    await setEnabled(env.DB, USER_ID, false);

    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });

    expect((await getProvisioning(env.DB, USER_ID))?.enabled).toBe(true);
  });

  it('bumps updated_at on an in-place update', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });
    // Backdate deterministically — CURRENT_TIMESTAMP has 1s granularity, so a
    // same-second re-call could otherwise land on an identical value.
    await env.DB.prepare("UPDATE user_notifications SET updated_at = '2000-01-01 00:00:00' WHERE user_id = ?")
      .bind(USER_ID)
      .run();

    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });

    const row = await env.DB.prepare('SELECT updated_at FROM user_notifications WHERE user_id = ?')
      .bind(USER_ID)
      .first<{ updated_at: string }>();
    expect(row?.updated_at).not.toBe('2000-01-01 00:00:00');
  });
});

describe('setEnabled', () => {
  it('soft-off retains personHash/subscriberToken and flips enabled to false', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });

    const result = await setEnabled(env.DB, USER_ID, false);

    expect(result).toEqual({ status: 'ok' });
    expect(await getProvisioning(env.DB, USER_ID)).toEqual({
      personHash: 'hash-1',
      subscriberToken: 'tk_1',
      enabled: false,
    });
  });

  it('re-enables a soft-off row', async () => {
    await saveProvisioning(env.DB, USER_ID, { personHash: 'hash-1', subscriberToken: 'tk_1' });
    await setEnabled(env.DB, USER_ID, false);

    const result = await setEnabled(env.DB, USER_ID, true);

    expect(result).toEqual({ status: 'ok' });
    expect((await getProvisioning(env.DB, USER_ID))?.enabled).toBe(true);
  });

  it('returns not_provisioned when the user has no user_notifications row', async () => {
    expect(await setEnabled(env.DB, USER_ID, false)).toEqual({ status: 'not_provisioned' });
  });
});
