import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedOrgMember, seedAdditionalMembership } from '../helpers/seed.js';

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM org_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind(
      'Org A',
      'America/New_York',
    ),
  ]);
  await seedOrgMember({
    id: 1,
    organizationId: 1,
    email: 'admin@example.com',
    role: 'admin',
    timezone: 'America/Los_Angeles',
  });
  await seedOrgMember({ id: 2, organizationId: 1, email: 'member@example.com', role: 'member' });
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
      memberships: [
        {
          organizationId: 1,
          organizationName: 'Org A',
          organizationTimezone: 'America/New_York',
          role: 'admin',
        },
      ],
      currentOrganizationId: 1,
    });
  });

  it('falls back to the current org timezone when the user has no personal timezone set', async () => {
    const token = await signTestJwt({ email: 'member@example.com', aud: TEST_ACCESS_AUD });

    const res = await app.request('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, testEnv());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timezone: string };
    expect(body.timezone).toBe('America/New_York');
  });

  it('lists every organization the user belongs to, with the resolved current one flagged separately', async () => {
    await env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (2, ?, ?)')
      .bind('Org B', 'Europe/London')
      .run();
    await seedAdditionalMembership(1, 2, 'member');

    const token = await signTestJwt({ email: 'admin@example.com', aud: TEST_ACCESS_AUD });
    const res = await app.request(
      '/api/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token, 'X-Org-Id': '2' } },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      memberships: { organizationId: number; role: string }[];
      currentOrganizationId: number;
    };
    expect(body.currentOrganizationId).toBe(2);
    expect(body.memberships.map((m) => m.organizationId).sort()).toEqual([1, 2]);
    expect(body.memberships.find((m) => m.organizationId === 2)?.role).toBe('member');
  });
});
