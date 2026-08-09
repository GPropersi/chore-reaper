import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { accessAuth } from '../../src/middleware/access-auth.js';
import { resolveUser } from '../../src/middleware/resolve-user.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import { stubAccessJwks, testEnv, TEST_ACCESS_AUD } from '../helpers/access-test-env.js';
import { seedHouseholdMember } from '../helpers/seed.js';
import type { AppEnv } from '../../src/types.js';

// A tiny app exercising the real accessAuth -> resolveUser chain, exactly as
// app.ts mounts them for /api/notifications/* (Step 4).
function appWithResolveUser() {
  const app = new Hono<AppEnv>();
  app.use('*', accessAuth);
  app.use('*', resolveUser);
  app.get('/whoami', (c) => c.json({ userId: c.var.userId }));
  return app;
}

function authHeader(email: string) {
  return signTestJwt({ email, aud: TEST_ACCESS_AUD }).then((token) => ({
    'Cf-Access-Jwt-Assertion': token,
  }));
}

beforeEach(async () => {
  stubAccessJwks();
  await env.DB.exec('DELETE FROM household_members');
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM households');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveUser', () => {
  it('resolves the verified email to its users.id and reaches the handler', async () => {
    await env.DB.prepare('INSERT INTO households (id, name, timezone) VALUES (1, ?, ?)')
      .bind('Household A', 'UTC')
      .run();
    await seedHouseholdMember({ id: 7, householdId: 1, email: 'member@example.com' });

    const res = await appWithResolveUser().request(
      '/whoami',
      { headers: await authHeader('member@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 7 });
  });

  it('rejects with 401 when the verified email has no matching users row', async () => {
    const res = await appWithResolveUser().request(
      '/whoami',
      { headers: await authHeader('ghost@example.com') },
      testEnv(),
    );

    expect(res.status).toBe(401);
  });
});
