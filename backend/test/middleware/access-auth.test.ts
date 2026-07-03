import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { accessAuth } from '../../src/middleware/access-auth.js';
import { signTestJwt } from '../helpers/sign-test-jwt.js';
import type { AppEnv } from '../../src/types.js';
import primaryJwks from '../fixtures/test-jwks.json' with { type: 'json' };
import secondaryJwks from '../fixtures/test-jwks-2.json' with { type: 'json' };

const JWKS_URL_A = 'https://fixture-a.example.com/certs';
const JWKS_URL_B = 'https://fixture-b.example.com/certs';
const AUD = 'test-audience';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.use('*', accessAuth);
  app.get('/protected', (c) => c.json({ email: c.var.verifiedEmail }));
  return app;
}

function requestAs(jwksUrl: string, token?: string) {
  const app = buildApp();
  const headers: Record<string, string> = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return app.request('/protected', { headers }, { ...env, ACCESS_JWKS_URL: jwksUrl, ACCESS_AUD: AUD });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === JWKS_URL_A) return jsonResponse(primaryJwks);
      if (url === JWKS_URL_B) return jsonResponse(secondaryJwks);
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('accessAuth', () => {
  it('reads ACCESS_JWKS_URL/ACCESS_AUD from env, not a hardcoded literal', async () => {
    const token = await signTestJwt({ email: 'user@example.com', aud: AUD, key: 'secondary' });

    // Configured to consult fixture A (primary-only JWKS): the secondary-signed
    // token has no matching kid there, so verification fails.
    const resAgainstA = await requestAs(JWKS_URL_A, token);
    expect(resAgainstA.status).toBe(401);

    // Same token, only the configured JWKS URL changes to fixture B (which
    // holds the secondary public key) — verification now succeeds. This
    // proves the middleware consults whichever URL is configured, not a
    // hardcoded one.
    const resAgainstB = await requestAs(JWKS_URL_B, token);
    expect(resAgainstB.status).toBe(200);
  });

  it('resolves the verified email for a valid token signed by the test key pair', async () => {
    const token = await signTestJwt({ email: 'admin@example.com', aud: AUD, key: 'primary' });

    const res = await requestAs(JWKS_URL_A, token);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe('admin@example.com');
  });

  it('rejects an expired token with 401', async () => {
    const token = await signTestJwt({
      email: 'admin@example.com',
      aud: AUD,
      key: 'primary',
      expiresInSeconds: -10,
    });

    const res = await requestAs(JWKS_URL_A, token);

    expect(res.status).toBe(401);
  });

  it('rejects a token signed by the wrong key with 401', async () => {
    const token = await signTestJwt({ email: 'admin@example.com', aud: AUD, key: 'secondary' });

    const res = await requestAs(JWKS_URL_A, token);

    expect(res.status).toBe(401);
  });

  it('rejects a request with no Cf-Access-Jwt-Assertion header with 401', async () => {
    const res = await requestAs(JWKS_URL_A);

    expect(res.status).toBe(401);
  });

  it('fails closed (401, not 500 or pass-through) when the JWKS endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable');
      }),
    );
    const token = await signTestJwt({ email: 'admin@example.com', aud: AUD, key: 'primary' });

    // A URL never used by an earlier test in this file, so the module-level
    // JWKS cache can't mask the fetch failure with an already-cached result.
    const res = await requestAs('https://fixture-unreachable.example.com/certs', token);

    expect(res.status).toBe(401);
  });
});
