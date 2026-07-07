import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(jwksUrl: string) {
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

export const accessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const jwks = getJWKS(c.env.ACCESS_JWKS_URL);
    const { payload } = await jwtVerify(token, jwks, { audience: c.env.ACCESS_AUD });
    if (typeof payload.email !== 'string') {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    c.set('verifiedEmail', payload.email.trim().toLowerCase());
  } catch {
    // Any failure here — bad signature, expired token, unreachable JWKS
    // endpoint — must fail closed (reject) rather than let the request
    // through unauthenticated.
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  await next();
});
