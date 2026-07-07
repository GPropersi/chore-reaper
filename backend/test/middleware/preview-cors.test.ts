import { describe, it, expect } from 'vitest';
import app from '../../src/app.js';
import { stubAccessJwks, testEnv } from '../helpers/access-test-env.js';

const PREVIEW_ORIGIN = 'https://feat-x-branch.chores4irl-frontend.pages.dev';

describe('CORS for Pages preview origins', () => {
  it('allows a request whose Origin matches the Pages preview pattern', async () => {
    stubAccessJwks();
    const res = await app.request('/api/me', { headers: { Origin: PREVIEW_ORIGIN } }, testEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PREVIEW_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('does not allow a request whose Origin does not match the pattern', async () => {
    stubAccessJwks();
    const res = await app.request('/api/me', { headers: { Origin: 'https://evil.example.com' } }, testEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example.com');
  });

  it('answers an OPTIONS preflight from a matching preview origin without requiring auth', async () => {
    const res = await app.request(
      '/api/chores',
      {
        method: 'OPTIONS',
        headers: {
          Origin: PREVIEW_ORIGIN,
          'Access-Control-Request-Method': 'POST',
        },
      },
      testEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PREVIEW_ORIGIN);
  });

  it('still requires a valid Access JWT for the actual (non-OPTIONS) request, even with a matching Origin', async () => {
    stubAccessJwks();
    const res = await app.request('/api/me', { headers: { Origin: PREVIEW_ORIGIN } }, testEnv());
    // No Cf-Access-Jwt-Assertion header supplied — CORS being satisfied must
    // not bypass authentication for the real request.
    expect(res.status).toBe(401);
  });
});
