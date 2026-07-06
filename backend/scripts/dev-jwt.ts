import { importJWK, SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [email] = process.argv.slice(2);

if (!email) {
  console.error('Usage: dev-jwt.ts <email>');
  process.exit(1);
}

const privateJwk = JSON.parse(
  readFileSync(fileURLToPath(new URL('../test/fixtures/test-signing-key.json', import.meta.url)), 'utf-8'),
);

const key = await importJWK({ ...privateJwk, alg: 'RS256' }, 'RS256');
const now = Date.now();

const token = await new SignJWT({ email: email.trim().toLowerCase() })
  .setProtectedHeader({ alg: 'RS256', kid: privateJwk.kid })
  .setIssuedAt(new Date(now))
  .setExpirationTime(new Date(now + 30 * 24 * 60 * 60 * 1000))
  .setAudience('e2e-test-audience')
  .sign(key);

console.log(token);
