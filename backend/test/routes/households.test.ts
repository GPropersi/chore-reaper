import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedHouseholdMember } from '../helpers/seed.js';

const HOUSEHOLD_A = 1;
const HOUSEHOLD_B = 2;

async function authHeader(email: string) {
  const token = await signTestJwt({ email, aud: TEST_ACCESS_AUD });
  return { 'Cf-Access-Jwt-Assertion': token };
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)').bind('Household A', 'UTC'),
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (2, ?, ?)').bind('Household B', 'UTC'),
  ]);
  await seedHouseholdMember({ id: 1, householdId: HOUSEHOLD_A, email: 'admin-a@example.com', isAdmin: true });
  await seedHouseholdMember({
    id: 2,
    householdId: HOUSEHOLD_A,
    email: 'member-a@example.com',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PATCH /api/households/:id', () => {
  it('allows a non-admin household member to update the timezone (open household privileges)', async () => {
    const res = await app.request(
      `/api/households/${HOUSEHOLD_A}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ timezone: 'America/Chicago' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid timezone string', async () => {
    const res = await app.request(
      `/api/households/${HOUSEHOLD_A}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ timezone: 'Not/AZone' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the id in the path isn't the admin's own household", async () => {
    const res = await app.request(
      `/api/households/${HOUSEHOLD_B}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ timezone: 'America/Chicago' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);

    const householdB = await env.DB.prepare('SELECT timezone FROM households WHERE id = ?')
      .bind(HOUSEHOLD_B)
      .first<{ timezone: string }>();
    expect(householdB?.timezone).toBe('UTC');
  });

  it('updates the timezone for a valid admin request', async () => {
    const res = await app.request(
      `/api/households/${HOUSEHOLD_A}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ timezone: 'America/Chicago' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { timezone: string } };
    expect(body.data.timezone).toBe('America/Chicago');

    const householdA = await env.DB.prepare('SELECT timezone FROM households WHERE id = ?')
      .bind(HOUSEHOLD_A)
      .first<{ timezone: string }>();
    expect(householdA?.timezone).toBe('America/Chicago');
  });
});
