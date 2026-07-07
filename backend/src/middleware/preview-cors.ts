import { cors } from 'hono/cors';

// Cloudflare Pages preview deployments live on *.chores4irl-frontend.pages.dev
// — a different origin from the production chores.4irl.app domain the Worker's
// own route is bound to — so the browser treats API calls from a preview as
// cross-origin and needs CORS plus a credentialed cookie to authenticate.
// Scoped narrowly to this one Pages project's own domain namespace, never a
// blanket wildcard: this app is Access-gated, and a broader origin allowlist
// would let any matching site make credentialed requests on a logged-in
// user's behalf.
const PREVIEW_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.chores4irl-frontend\.pages\.dev$/;

export const previewCors = cors({
  origin: (origin) => (PREVIEW_ORIGIN_PATTERN.test(origin) ? origin : undefined),
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
});
