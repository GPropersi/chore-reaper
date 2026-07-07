import { mockFetch } from './mockApi';

const PREVIEW_HOST_SUFFIX = '.pages.dev';

// Cloudflare Pages preview deployments live on *.pages.dev, a different
// origin from production. Pointing them at the real Access-protected
// production API turned out to be structurally impossible — Access's
// cross-app SSO redirect flow doesn't work for fetch()-initiated requests,
// only real browser navigation, regardless of CORS configuration (verified
// live). Previews get local mock data instead — see mockApi.ts.
function isPreviewDomain(): boolean {
  return window.location.hostname.endsWith(PREVIEW_HOST_SUFFIX);
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (isPreviewDomain()) {
    return mockFetch(path, init);
  }
  return fetch(path, init);
}
