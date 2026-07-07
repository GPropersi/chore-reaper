import { describe, it, expect, afterEach, vi } from 'vitest';
import { apiUrl, apiFetch } from './api';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  });
}

const ORIGINAL_HOSTNAME = window.location.hostname;

afterEach(() => {
  setHostname(ORIGINAL_HOSTNAME);
  vi.unstubAllGlobals();
});

describe('apiUrl', () => {
  it('returns the path unchanged on the production custom domain', () => {
    setHostname('chores.4irl.app');
    expect(apiUrl('/api/chores')).toBe('/api/chores');
  });

  it('returns the path unchanged in local dev', () => {
    setHostname('localhost');
    expect(apiUrl('/api/chores')).toBe('/api/chores');
  });

  it('prefixes with the production API origin on a Cloudflare Pages preview domain', () => {
    setHostname('feat-x-branch.chores4irl-frontend.pages.dev');
    expect(apiUrl('/api/chores')).toBe('https://chores.4irl.app/api/chores');
  });

  it('prefixes on the Pages project default domain too, not just branch previews', () => {
    setHostname('chores4irl-frontend.pages.dev');
    expect(apiUrl('/api/me')).toBe('https://chores.4irl.app/api/me');
  });
});

describe('apiFetch', () => {
  it('always sends credentials: include, and prefixes the URL when on a preview domain', async () => {
    setHostname('feat-x-branch.chores4irl-frontend.pages.dev');
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/chores', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledWith('https://chores.4irl.app/api/chores', {
      method: 'POST',
      credentials: 'include',
    });
  });

  it('does not let a caller override credentials away from include', async () => {
    setHostname('chores.4irl.app');
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/me', { credentials: 'omit' } as RequestInit);

    expect(fetchMock).toHaveBeenCalledWith('/api/me', { credentials: 'include' });
  });
});
