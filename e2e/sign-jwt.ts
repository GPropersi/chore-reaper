import { importJWK, SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const privateJwk = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../backend/test/fixtures/test-signing-key.json', import.meta.url)),
    'utf-8',
  ),
);

export const E2E_ACCESS_AUD = 'e2e-test-audience';

export async function signE2eJwt(email: string): Promise<string> {
  const key = await importJWK({ ...privateJwk, alg: 'RS256' }, 'RS256');
  const now = Date.now();

  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: privateJwk.kid })
    .setIssuedAt(new Date(now))
    .setExpirationTime(new Date(now + 3_600_000))
    .setAudience(E2E_ACCESS_AUD)
    .sign(key);
}
