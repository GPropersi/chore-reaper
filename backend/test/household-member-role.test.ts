import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { seedHouseholdMember } from './helpers/seed.js';

// Covers migration 0008_household_member_role.sql — role isn't wired into
// any app logic yet (prep work for a future household role-based system),
// so there's no route/function to exercise this through; these assert the
// schema itself behaves as intended.
beforeEach(async () => {
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)')
    .bind('Household A', 'UTC')
    .run();
});

describe('household_members.role', () => {
  it('defaults to member when not specified', async () => {
    await seedHouseholdMember({ id: 1, householdId: 1, email: 'member@example.com' });

    const row = await env.DB.prepare('SELECT role FROM household_members WHERE user_id = 1').first<{
      role: string;
    }>();
    expect(row?.role).toBe('member');
  });

  it('accepts head as a valid role', async () => {
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (1, ?)').bind('head@example.com').run();
    await env.DB.prepare('INSERT INTO household_members (user_id, household_id, role) VALUES (1, 1, ?)')
      .bind('head')
      .run();

    const row = await env.DB.prepare('SELECT role FROM household_members WHERE user_id = 1').first<{
      role: string;
    }>();
    expect(row?.role).toBe('head');
  });

  it('rejects a role outside the allowed set', async () => {
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (1, ?)').bind('bogus@example.com').run();

    await expect(
      env.DB.prepare('INSERT INTO household_members (user_id, household_id, role) VALUES (1, 1, ?)')
        .bind('owner')
        .run(),
    ).rejects.toThrow();
  });
});
