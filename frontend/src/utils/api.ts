import { mockFetch } from './mockApi';

const PREVIEW_HOST_SUFFIX = '.pages.dev';
const CURRENT_HOUSEHOLD_ID_KEY = 'current-household-id-v1';

// Cloudflare Pages preview deployments live on *.pages.dev, a different
// origin from production. Pointing them at the real Access-protected
// production API turned out to be structurally impossible — Access's
// cross-app SSO redirect flow doesn't work for fetch()-initiated requests,
// only real browser navigation, regardless of CORS configuration (verified
// live). Previews get local mock data instead — see mockApi.ts.
function isPreviewDomain(): boolean {
  return window.location.hostname.endsWith(PREVIEW_HOST_SUFFIX);
}

// undefined = not yet read from localStorage; null = explicitly "no
// household selected". Lazily initialized (not at module load) to match the
// rest of the app's convention of only touching localStorage inside a
// function call.
let currentHouseholdId: number | null | undefined;

function resolveCurrentHouseholdId(): number | null {
  if (currentHouseholdId === undefined) {
    const stored = localStorage.getItem(CURRENT_HOUSEHOLD_ID_KEY);
    currentHouseholdId = stored ? Number(stored) : null;
  }
  return currentHouseholdId;
}

// The sole network entry point (apiFetch) attaches X-Household-Id to every
// request once this is set, so callers never need to thread a household id
// through individual fetch calls — set once by useMe() after login and again
// on every household-switcher change.
export function setCurrentHouseholdId(householdId: number | null): void {
  currentHouseholdId = householdId;
  if (householdId == null) {
    localStorage.removeItem(CURRENT_HOUSEHOLD_ID_KEY);
  } else {
    localStorage.setItem(CURRENT_HOUSEHOLD_ID_KEY, String(householdId));
  }
}

export function getCurrentHouseholdId(): number | null {
  return resolveCurrentHouseholdId();
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const householdId = resolveCurrentHouseholdId();
  const headers = new Headers(init?.headers);
  if (householdId != null) {
    headers.set('X-Household-Id', String(householdId));
  }
  const initWithHouseholdHeader: RequestInit = { ...init, headers };

  if (isPreviewDomain()) {
    return mockFetch(path, initWithHouseholdHeader);
  }
  return fetch(path, initWithHouseholdHeader);
}
