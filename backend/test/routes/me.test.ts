import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import app from '../../src/app.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM chores');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM organizations');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations (id, name, timezone) VALUES (1, ?, ?)').bind(
      'Org A',
      'America/New_York',
    ),
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (1, 1, ?, ?, ?)',
    ).bind('admin@example.com', 'admin', 'America/Los_Angeles'),
    env.DB.prepare(
      'INSERT INTO users (id, organization_id, email, role, timezone) VALUES (2, 1, ?, ?, NULL)',
    ).bind('member@example.com', 'member'),
  ]);
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
      role: 'admin',
      organizationId: 1,
      organizationTimezone: 'America/New_York',
      timezone: 'America/Los_Angeles',
    });
  });

  it('falls back to organizationTimezone when the user has no personal timezone set', async () => {
    const token = await signTestJwt({ email: 'member@example.com', aud: TEST_ACCESS_AUD });

    const res = await app.request('/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } }, testEnv());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { timezone: string; organizationTimezone: string };
    expect(body.timezone).toBe('America/New_York');
    expect(body.organizationTimezone).toBe('America/New_York');
  });
});
