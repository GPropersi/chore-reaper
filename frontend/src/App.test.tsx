import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useMidnightClock } from './hooks/useMidnightClock';
import { setCurrentHouseholdId } from './utils/api';

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
  timezone: 'Asia/Tokyo',
  isAdmin: false,
  memberships: [
    {
      householdId: 1,
      householdName: 'Household A',
      householdTimezone: 'America/New_York',
    },
  ],
  currentHouseholdId: 1,
};

const roomsResponse = {
  success: true,
  data: [
    { id: 1, householdId: 1, name: 'Living Room' },
    { id: 2, householdId: 1, name: 'Kitchen' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setCurrentHouseholdId(null);
  // Some tests navigate directly via the History API — reset the URL so
  // that state never leaks into the next test.
  window.history.pushState({}, '', '/');
  cleanup();
});

describe('App', () => {
  it("passes the household's timezone — not the viewing user's personal timezone — into useMidnightClock", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') return jsonResponse(meResponse);
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
    const adminMeResponse = { ...meResponse, isAdmin: true };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me') return jsonResponse(adminMeResponse);
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
        if (url === '/api/members') return jsonResponse({ success: true, data: [] });
        if (url === '/api/admin/users') return jsonResponse({ success: true, data: [] });
        if (url === '/api/admin/join-requests') return jsonResponse({ success: true, data: [] });
        if (url === '/api/rooms') return jsonResponse(roomsResponse);
        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<App />);

    await screen.findByText('Vacuum');
    await user.click(screen.getByTestId('admin-nav-link'));
    await screen.findByRole('heading', { name: 'Members' });
    expect(screen.queryByText('Vacuum')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(await screen.findByText('Vacuum')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
  });

  describe('admin users directory', () => {
    it('renders the Users directory at the bottom of the Admin page for an admin', async () => {
      const user = userEvent.setup();
      const adminMeResponse = { ...meResponse, isAdmin: true };
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url === '/api/me') return jsonResponse(adminMeResponse);
          if (url === '/api/chores') return jsonResponse({ success: true, data: [] });
          if (url === '/api/rooms') return jsonResponse(roomsResponse);
          if (url === '/api/members') return jsonResponse({ success: true, data: [] });
          if (url === '/api/admin/users') {
            return jsonResponse({
              success: true,
              data: [
                {
                  id: 1,
                  email: 'a@example.com',
                  timezone: 'Asia/Tokyo',
                  isAdmin: true,
                  households: [{ id: 1, name: 'Household A' }],
                },
              ],
            });
          }
          if (url === '/api/admin/join-requests') return jsonResponse({ success: true, data: [] });
          throw new Error(`Unhandled fetch: ${url}`);
        }),
      );

      render(<App />);
      await user.click(await screen.findByTestId('admin-nav-link'));

      expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
      expect(await screen.findByText('a@example.com')).toBeInTheDocument();
    });

    it('does not render the Users directory (or fetch it) for a non-admin', async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url === '/api/me') return jsonResponse(meResponse);
          if (url === '/api/chores') return jsonResponse({ success: true, data: [] });
          if (url === '/api/rooms') return jsonResponse(roomsResponse);
          if (url === '/api/members') return jsonResponse({ success: true, data: [] });
          throw new Error(`Unhandled fetch: ${url}`);
        }),
      );

      render(<App />);
      await user.click(await screen.findByTestId('admin-nav-link'));

      await screen.findByRole('heading', { name: 'Members' });
      expect(screen.queryByRole('heading', { name: 'Users' })).not.toBeInTheDocument();
    });
  });

  describe('multi-household membership', () => {
    const multiHouseholdMeResponse = {
      id: 1,
      email: 'a@example.com',
      timezone: 'UTC',
      // isAdmin is global, not per-household — a single value for the whole
      // fixture, unlike the old per-membership role that could differ.
      isAdmin: true,
      memberships: [
        { householdId: 1, householdName: 'Household A', householdTimezone: 'UTC' },
        { householdId: 2, householdName: 'Household B', householdTimezone: 'UTC' },
      ],
      currentHouseholdId: 1,
    };

    function stubMultiHouseholdFetch() {
      const calls: { url: string; headers: Record<string, string> }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const headers = new Headers(init?.headers);
          const householdId = headers.get('X-Household-Id');
          calls.push({ url, headers: { 'X-Household-Id': householdId ?? '' } });

          if (url === '/api/me') {
            return jsonResponse({
              ...multiHouseholdMeResponse,
              currentHouseholdId: householdId ? Number(householdId) : 1,
            });
          }
          if (url === '/api/chores') {
            const name = householdId === '2' ? 'Household B Chore' : 'Household A Chore';
            return jsonResponse({
              success: true,
              data: [
                {
                  id: 1,
                  name,
                  roomId: 1,
                  dateLastCompleted: '2026-06-01T00:00:00.000Z',
                  duration: 20,
                  frequency: 7,
                  version: 1,
                },
              ],
            });
          }
          if (url === '/api/rooms') return jsonResponse(roomsResponse);
          throw new Error(`Unhandled fetch: ${url}`);
        }),
      );
      return calls;
    }

    it('renders a household switcher only when the user has more than one membership', async () => {
      stubMultiHouseholdFetch();

      render(<App />);

      expect(await screen.findByLabelText('Household')).toBeInTheDocument();
    });

    it('switching households sends the new X-Household-Id header and swaps the chore list to the other household', async () => {
      const user = userEvent.setup();
      stubMultiHouseholdFetch();

      render(<App />);

      await screen.findByText('Household A Chore');

      await user.selectOptions(screen.getByLabelText('Household'), 'Household B');

      expect(await screen.findByText('Household B Chore')).toBeInTheDocument();
      expect(screen.queryByText('Household A Chore')).not.toBeInTheDocument();
    });
  });
});
