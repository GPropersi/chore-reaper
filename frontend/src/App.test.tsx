import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const meResponse = {
  id: 1,
  email: 'a@example.com',
  role: 'member',
  organizationId: 1,
  organizationTimezone: 'America/New_York',
  timezone: 'Asia/Tokyo',
};

const roomsResponse = {
  success: true,
  data: [
    { id: 1, organizationId: 1, name: 'Living Room' },
    { id: 2, organizationId: 1, name: 'Kitchen' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  cleanup();
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
        if (url === '/api/rooms') {
          return jsonResponse(roomsResponse);
        }
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<App />);

    await vi.waitFor(() => expect(vi.mocked(useMidnightClock)).toHaveBeenCalled());
    expect(useMidnightClock).toHaveBeenCalledWith('America/New_York');
    expect(useMidnightClock).not.toHaveBeenCalledWith('Asia/Tokyo');
  });

  it('falls back to the last-cached /api/me response when a later fetch fails (e.g. offline reload)', async () => {
    vi.mocked(useMidnightClock).mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') return jsonResponse(meResponse);
        if (url === '/api/chores') return jsonResponse({ success: true, data: [] });
        if (url === '/api/rooms') return jsonResponse(roomsResponse);
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );
    const { unmount } = render(<App />);
    await vi.waitFor(() => expect(vi.mocked(useMidnightClock)).toHaveBeenCalledWith('America/New_York'));
    unmount();
    vi.mocked(useMidnightClock).mockClear();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    render(<App />);

    await vi.waitFor(() => expect(vi.mocked(useMidnightClock)).toHaveBeenCalledWith('America/New_York'));
  });

  it('renders a tab per distinct chore room and filters chores when a tab is selected', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') return jsonResponse(meResponse);
        if (url === '/api/chores') {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 1,
                name: 'Vacuum',
                roomId: 1,
                dateLastCompleted: '2026-06-01T00:00:00.000Z',
                duration: 20,
                frequency: 7,
                version: 1,
              },
              {
                id: 2,
                name: 'Dishes',
                roomId: 2,
                dateLastCompleted: '2026-06-20T00:00:00.000Z',
                duration: 5,
                frequency: 1,
                version: 1,
              },
            ],
          });
        }
        if (url === '/api/rooms') return jsonResponse(roomsResponse);
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<App />);

    await vi.waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByText('Dishes')).toBeInTheDocument();

    const kitchenTab = await screen.findByRole('button', { name: 'Kitchen' });
    expect(screen.getByRole('button', { name: 'Living Room' })).toBeInTheDocument();

    await user.click(kitchenTab);

    expect(screen.getByText('Dishes')).toBeInTheDocument();
    expect(screen.queryByText('Vacuum')).not.toBeInTheDocument();
  });

  it('navigates back to Home when a room tab is clicked while on the Admin page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') return jsonResponse({ ...meResponse, role: 'admin' });
        if (url === '/api/chores') {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 1,
                name: 'Vacuum',
                roomId: 1,
                dateLastCompleted: '2026-06-01T00:00:00.000Z',
                duration: 20,
                frequency: 7,
                version: 1,
              },
            ],
          });
        }
        if (url === '/api/users') return jsonResponse({ success: true, data: [] });
        if (url === '/api/rooms') return jsonResponse(roomsResponse);
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<App />);

    await screen.findByText('Vacuum');
    await user.click(screen.getByTestId('admin-nav-link'));
    await screen.findByRole('heading', { name: 'Users' });
    expect(screen.queryByText('Vacuum')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(await screen.findByText('Vacuum')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument();
  });
});
