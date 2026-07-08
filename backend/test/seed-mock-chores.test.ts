import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { seedMockChores } from '../src/seed-mock-chores.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)')
    .bind('Acme', 'UTC')
    .run();
});

describe('seedMockChores', () => {
  it('inserts a realistic mix of overdue and on-track chores scoped to the given household', async () => {
    const now = new Date('2026-07-03T12:00:00.000Z');
    const result = await seedMockChores(env.DB, 1, now);

    const rows = await env.DB.prepare('SELECT * FROM chores WHERE household_id = ?').bind(1).all();
    expect(rows.results).toHaveLength(result.count);
    expect(result.count).toBeGreaterThan(1);

    const overdueCount = rows.results.filter((r) => {
      const daysSince = (now.getTime() - new Date(r.date_last_completed as string).getTime()) / 86_400_000;
      return daysSince > (r.frequency as number);
    }).length;
    expect(overdueCount).toBeGreaterThan(0);
    expect(overdueCount).toBeLessThan(rows.results.length);
  });

  it('never seeds chores into a different household', async () => {
    await env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (2, ?, ?)')
      .bind('Other Household', 'UTC')
      .run();

    await seedMockChores(env.DB, 1);

    const otherHouseholdChores = await env.DB.prepare('SELECT * FROM chores WHERE household_id = ?')
      .bind(2)
      .all();
    expect(otherHouseholdChores.results).toHaveLength(0);
  });

  it('fails loudly rather than silently duplicating when the household already has chores', async () => {
    const firstResult = await seedMockChores(env.DB, 1);
    await expect(seedMockChores(env.DB, 1)).rejects.toThrow();

    const rows = await env.DB.prepare('SELECT * FROM chores WHERE household_id = ?').bind(1).all();
    expect(rows.results).toHaveLength(firstResult.count);
  });
});
