import { vi } from 'vitest';
import { env } from 'cloudflare:workers';
import primaryJwks from '../fixtures/test-jwks.json' with { type: 'json' };

export const TEST_ACCESS_AUD = 'test-audience';
export const TEST_JWKS_URL = 'https://fixture.example.com/certs';

export function stubAccessJwks() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === TEST_JWKS_URL) {
        return new Response(JSON.stringify(primaryJwks), { headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

export function testEnv() {
  return { ...env, ACCESS_JWKS_URL: TEST_JWKS_URL, ACCESS_AUD: TEST_ACCESS_AUD };
}
