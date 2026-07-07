const PREVIEW_HOST_SUFFIX = '.pages.dev';
const PRODUCTION_API_ORIGIN = 'https://chores.4irl.app';

// Cloudflare Pages previews (and the project's own default *.pages.dev
// domain) are a different origin from the production custom domain the
// backend Worker's route is bound to, so relative /api/... paths 404 there —
// there's no Worker listening on that hostname at all. Point preview builds
// at the real production API instead; the backend's CORS middleware
// (preview-cors.ts) is what allows the browser to actually read the response.
export function apiUrl(path: string): string {
  if (window.location.hostname.endsWith(PREVIEW_HOST_SUFFIX)) {
    return `${PRODUCTION_API_ORIGIN}${path}`;
  }
  return path;
}

// credentials: 'include' is required for the browser to send the Access
// session cookie cross-origin (on the production/local-dev same-origin path
// this is a no-op — cookies already go out by default there).
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: 'include' });
}
