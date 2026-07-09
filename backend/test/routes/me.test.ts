import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedHouseholdMember, seedAdditionalMembership } from '../helpers/seed.js';

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)').bind(
      'Household A',
      'America/New_York',
    ),
  ]);
  await seedHouseholdMember({
    id: 1,
    householdId: 1,
    email: 'admin@example.com',
    isAdmin: true,
    timezone: 'America/Los_Angeles',
  });
  await seedHouseholdMember({ id: 2, householdId: 1, email: 'member@example.com' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/me', () => {
  it('returns the authenticated user, with their own timezone set', async () => {
    const token = await signTestJwt({ email: 'admin@example.com', aud: TEST_ACCESS_AUD });

    const res = await app.request('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, testEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 1,
      email: 'admin@example.com',
      timezone: 'America/Los_Angeles',
      isAdmin: true,
      swipeStyle: 'ios',
      memberships: [
        {
          householdId: 1,
          householdName: 'Household A',
          householdTimezone: 'America/New_York',
        },
      ],
      currentHouseholdId: 1,
    });
  });

  it('falls back to the current household timezone when the user has no personal timezone set', async () => {
    const token = await signTestJwt({ email: 'member@example.com', aud: TEST_ACCESS_AUD });

    const res = await app.request('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, testEnv());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timezone: string };
    expect(body.timezone).toBe('America/New_York');
  });

  it('lists every household the user belongs to, with the resolved current one flagged separately', async () => {
    await env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (2, ?, ?)')
      .bind('Household B', 'Europe/London')
      .run();
    await seedAdditionalMembership(1, 2);

    const token = await signTestJwt({ email: 'admin@example.com', aud: TEST_ACCESS_AUD });
    const res = await app.request(
      '/api/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token, 'X-Household-Id': '2' } },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      isAdmin: boolean;
      memberships: { householdId: number }[];
      currentHouseholdId: number;
    };
    expect(body.currentHouseholdId).toBe(2);
    expect(body.memberships.map((m) => m.householdId).sort()).toEqual([1, 2]);
    // isAdmin is global — stays true regardless of which household is active.
    expect(body.isAdmin).toBe(true);
  });
});

describe('PATCH /api/me/swipe-style', () => {
  it("updates the caller's own swipe style and it's reflected in a subsequent GET /api/me", async () => {
    const token = await signTestJwt({ email: 'admin@example.com', aud: TEST_ACCESS_AUD });

    const patchRes = await app.request(
      '/api/me/swipe-style',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': token },
        body: JSON.stringify({ swipeStyle: 'android' }),
      },
      testEnv(),
    );
    expect(patchRes.status).toBe(200);
    expect(await patchRes.json()).toEqual({ success: true, data: { swipeStyle: 'android' } });

    const getRes = await app.request('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, testEnv());
    const body = (await getRes.json()) as { swipeStyle: string };
    expect(body.swipeStyle).toBe('android');
  });

  it('rejects a value other than "ios" or "android"', async () => {
    const token = await signTestJwt({ email: 'admin@example.com', aud: TEST_ACCESS_AUD });

    const res = await app.request(
      '/api/me/swipe-style',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': token },
        body: JSON.stringify({ swipeStyle: 'windows-phone' }),
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });
});
