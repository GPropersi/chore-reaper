import { describe, it, expect, afterEach, vi } from 'vitest';
import { apiFetch, setCurrentOrgId, getCurrentOrgId } from './api';
import { resetMockData } from './mockApi';

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
  resetMockData();
  setCurrentOrgId(null);
  localStorage.clear();
});

describe('apiFetch', () => {
  it('calls the real network on the production custom domain', async () => {
    setHostname('chores.4irl.app');
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response('{}')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/chores', { method: 'POST' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chores');
    expect(init?.method).toBe('POST');
  });

  it('calls the real network in local dev', async () => {
    setHostname('localhost');
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/me');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('never touches the network on a Cloudflare Pages preview domain — routes to mock data instead', async () => {
    setHostname('feat-x-branch.chores4irl-frontend.pages.dev');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/me');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberships: { role: string }[] };
    expect(body.memberships[0].role).toBe('admin');
  });

  it('routes on the Pages project default domain too, not just branch previews', async () => {
    setHostname('chores4irl-frontend.pages.dev');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/chores');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches an X-Org-Id header once a current org is set', async () => {
    setHostname('localhost');
    setCurrentOrgId(2);
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response('{}')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/chores');

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get('X-Org-Id')).toBe('2');
  });

  it('sends no X-Org-Id header when no org has been selected', async () => {
    setHostname('localhost');
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response('{}')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/chores');

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Headers).get('X-Org-Id')).toBeNull();
  });
});

describe('setCurrentOrgId / getCurrentOrgId', () => {
  it('persists the chosen org id across calls via localStorage', () => {
    setCurrentOrgId(5);
    expect(getCurrentOrgId()).toBe(5);
    expect(localStorage.getItem('current-org-id-v1')).toBe('5');
  });

  it('clears the stored org id when set to null', () => {
    setCurrentOrgId(5);
    setCurrentOrgId(null);
    expect(getCurrentOrgId()).toBeNull();
    expect(localStorage.getItem('current-org-id-v1')).toBeNull();
  });
});
