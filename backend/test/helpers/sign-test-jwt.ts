import { importJWK, SignJWT } from 'jose';
import primaryKey from '../fixtures/test-signing-key.json' with { type: 'json' };
import secondaryKey from '../fixtures/test-signing-key-2.json' with { type: 'json' };

type SignOptions = {
  email: string;
  aud: string;
  key?: 'primary' | 'secondary';
  expiresInSeconds?: number;
};

export async function signTestJwt({
  email,
  aud,
  key = 'primary',
  expiresInSeconds = 3600,
}: SignOptions): Promise<string> {
  const jwk = key === 'primary' ? primaryKey : secondaryKey;
  const privateKey = await importJWK({ ...jwk, alg: 'RS256' }, 'RS256');

  const now = Date.now();
  const issuedAt = new Date(now);
  const expiresAt = new Date(now + expiresInSeconds * 1000);

  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setAudience(aud)
    .sign(privateKey);
}
