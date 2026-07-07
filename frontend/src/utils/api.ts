import { mockFetch } from './mockApi';

const PREVIEW_HOST_SUFFIX = '.pages.dev';
const CURRENT_ORG_ID_KEY = 'current-org-id-v1';

// Cloudflare Pages preview deployments live on *.pages.dev, a different
// origin from production. Pointing them at the real Access-protected
// production API turned out to be structurally impossible — Access's
// cross-app SSO redirect flow doesn't work for fetch()-initiated requests,
// only real browser navigation, regardless of CORS configuration (verified
// live). Previews get local mock data instead — see mockApi.ts.
function isPreviewDomain(): boolean {
  return window.location.hostname.endsWith(PREVIEW_HOST_SUFFIX);
}

// undefined = not yet read from localStorage; null = explicitly "no org
// selected". Lazily initialized (not at module load) to match the rest of
// the app's convention of only touching localStorage inside a function call.
let currentOrgId: number | null | undefined;

function resolveCurrentOrgId(): number | null {
  if (currentOrgId === undefined) {
    const stored = localStorage.getItem(CURRENT_ORG_ID_KEY);
    currentOrgId = stored ? Number(stored) : null;
  }
  return currentOrgId;
}

// The sole network entry point (apiFetch) attaches X-Org-Id to every request
// once this is set, so callers never need to thread an org id through
// individual fetch calls — set once by useMe() after login and again on
// every org-switcher change.
export function setCurrentOrgId(organizationId: number | null): void {
  currentOrgId = organizationId;
  if (organizationId == null) {
    localStorage.removeItem(CURRENT_ORG_ID_KEY);
  } else {
    localStorage.setItem(CURRENT_ORG_ID_KEY, String(organizationId));
  }
}

export function getCurrentOrgId(): number | null {
  return resolveCurrentOrgId();
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const orgId = resolveCurrentOrgId();
  const headers = new Headers(init?.headers);
  if (orgId != null) {
    headers.set('X-Org-Id', String(orgId));
  }
  const initWithOrgHeader: RequestInit = { ...init, headers };

  if (isPreviewDomain()) {
    return mockFetch(path, initWithOrgHeader);
  }
  return fetch(path, initWithOrgHeader);
}
