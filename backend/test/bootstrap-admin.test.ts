import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { bootstrapAdmin } from '../src/bootstrap-admin.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
});

describe('bootstrapAdmin', () => {
  it('creates exactly one household row, one admin user row, and one household_members row, all correctly linked', async () => {
    const result = await bootstrapAdmin(env.DB, 'Acme Household', 'admin@example.com');

    const households = await env.DB.prepare('SELECT * FROM households').all();
    expect(households.results).toHaveLength(1);
    expect(households.results[0].id).toBe(result.householdId);
    expect(households.results[0].name).toBe('Acme Household');

    const users = await env.DB.prepare('SELECT * FROM users').all();
    expect(users.results).toHaveLength(1);
    expect(users.results[0].id).toBe(result.userId);
    expect(users.results[0].email).toBe('admin@example.com');

    const memberships = await env.DB.prepare('SELECT * FROM household_members').all();
    expect(memberships.results).toHaveLength(1);
    expect(memberships.results[0].user_id).toBe(result.userId);
    expect(memberships.results[0].household_id).toBe(result.householdId);
    expect(memberships.results[0].role).toBe('admin');
  });

  it('normalizes the admin email (trim + lowercase) before storing', async () => {
    await bootstrapAdmin(env.DB, 'Acme Household', '  Admin@Example.com  ');

    const users = await env.DB.prepare('SELECT * FROM users').all();
    expect(users.results[0].email).toBe('admin@example.com');
  });

  it('fails loudly rather than silently creating a duplicate when the household already exists', async () => {
    await bootstrapAdmin(env.DB, 'Acme Household', 'admin@example.com');

    await expect(bootstrapAdmin(env.DB, 'Acme Household', 'someone-else@example.com')).rejects.toThrow();

    const households = await env.DB.prepare('SELECT * FROM households').all();
    expect(households.results).toHaveLength(1);
    const users = await env.DB.prepare('SELECT * FROM users').all();
    expect(users.results).toHaveLength(1);
  });

  it('reuses the existing users row when the same admin email bootstraps a second, different household', async () => {
    const first = await bootstrapAdmin(env.DB, 'Household One', 'admin@example.com');
    const second = await bootstrapAdmin(env.DB, 'Household Two', 'admin@example.com');

    expect(second.userId).toBe(first.userId);
    expect(second.householdId).not.toBe(first.householdId);

    const users = await env.DB.prepare('SELECT * FROM users').all();
    expect(users.results).toHaveLength(1);

    const memberships = await env.DB.prepare('SELECT household_id FROM household_members WHERE user_id = ?')
      .bind(first.userId)
      .all<{ household_id: number }>();
    expect(memberships.results.map((m) => m.household_id).sort()).toEqual(
      [first.householdId, second.householdId].sort(),
    );
  });
});
