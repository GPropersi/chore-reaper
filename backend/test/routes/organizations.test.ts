import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedOrgMember } from '../helpers/seed.js';

const ORG_A = 1;
const ORG_B = 2;

async function authHeader(email: string) {
  const token = await signTestJwt({ email, aud: TEST_ACCESS_AUD });
  return { 'Cf-Access-Jwt-Assertion': token };
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM rooms');
  await env.DB.exec('DELETE FROM org_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind('Org A', 'UTC'),
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (2, ?, ?)').bind('Org B', 'UTC'),
  ]);
  await seedOrgMember({ id: 1, organizationId: ORG_A, email: 'admin-a@example.com', role: 'admin' });
  await seedOrgMember({ id: 2, organizationId: ORG_A, email: 'member-a@example.com', role: 'member' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PATCH /api/organizations/:id', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await app.request(
      `/api/organizations/${ORG_A}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('member-a@example.com')) },
        body: JSON.stringify({ timezone: 'America/Chicago' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid timezone string', async () => {
    const res = await app.request(
      `/api/organizations/${ORG_A}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ timezone: 'Not/AZone' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the id in the path isn't the admin's own org", async () => {
    const res = await app.request(
      `/api/organizations/${ORG_B}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader('admin-a@example.com')) },
        body: JSON.stringify({ timezone: 'America/Chicago' }),
      },
      testEnv(),
    );
    expect(res.status).toBe(400);

    const orgB = await env.DB.prepare('SELECT timezone FROM organizations WHERE id = ?')
      .bind(ORG_B)
      .first<{ timezone: string }>();
    expect(orgB?.timezone).toBe('UTC');
  });

  it('updates the timezone for a valid admin request', async () => {
    const res = await app.request(
      `/api/organizations/${ORG_A}`,
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

    const orgA = await env.DB.prepare('SELECT timezone FROM organizations WHERE id = ?')
      .bind(ORG_A)
      .first<{ timezone: string }>();
    expect(orgA?.timezone).toBe('America/Chicago');
  });
});
