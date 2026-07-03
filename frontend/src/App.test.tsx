import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';
import { useMidnightClock } from './hooks/useMidnightClock';

vi.mock('./hooks/useMidnightClock', () => ({
  useMidnightClock: vi.fn(() => new Date('2026-07-01T00:00:00.000Z')),
}));

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it("passes the org's timezone — not the viewing user's personal timezone — into useMidnightClock", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') {
          return jsonResponse({
            id: 1,
            email: 'a@example.com',
            role: 'member',
            organizationId: 1,
            organizationTimezone: 'America/New_York',
            timezone: 'Asia/Tokyo',
          });
        }
        if (url === '/api/chores') {
          return jsonResponse({ success: true, data: [] });
        }
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<App />);

    await vi.waitFor(() => expect(vi.mocked(useMidnightClock)).toHaveBeenCalled());
    expect(useMidnightClock).toHaveBeenCalledWith('America/New_York');
    expect(useMidnightClock).not.toHaveBeenCalledWith('Asia/Tokyo');
  });
});
