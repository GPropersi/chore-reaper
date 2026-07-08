import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChoresView from './ChoresView';
import { createOutbox } from '../../outbox/outbox';
import { writeChoresCache, clearChoresCache } from '../../cache/choresCache';
import { getDeviceTimezone } from '@utils/deviceTimezone';

vi.mock('@utils/deviceTimezone', () => ({
  getDeviceTimezone: vi.fn(() => 'America/New_York'),
}));

const mockRooms = [
  { id: 1, householdId: 1, name: 'Living Room' },
  { id: 2, householdId: 1, name: 'Kitchen' },
];

const mockChores = [
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
];

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

function stubChoresFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/chores' && method === 'GET') {
        return jsonResponse({ success: true, data: mockChores });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
  await clearChoresCache();
});

describe('ChoresView', () => {
  it('fetches /api/chores and renders them', async () => {
    stubChoresFetch();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    render(<ChoresView householdTimezone="Pacific/Kiritimati" rooms={mockRooms} />);

    await vi.waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByText('Dishes')).toBeInTheDocument();
  });

  it('filters visible chores by selectedRoom', async () => {
    stubChoresFetch();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    render(
      <ChoresView
        householdTimezone="Pacific/Kiritimati"

        selectedRoom="2"
        rooms={mockRooms}
      />,
    );

    await vi.waitFor(() => expect(screen.getByText('Dishes')).toBeInTheDocument());
    expect(screen.queryByText('Vacuum')).not.toBeInTheDocument();
  });

  it("shows a notice when the viewer's device timezone differs from the household's", async () => {
    stubChoresFetch();
    vi.mocked(getDeviceTimezone).mockReturnValue('Asia/Tokyo');

    render(<ChoresView householdTimezone="America/New_York" rooms={mockRooms} />);

    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByTestId('timezone-mismatch-notice')).toHaveTextContent(
      /Tokyo \(UTC[+-]\d+(:\d{2})?\).*New York \(UTC[+-]\d+(:\d{2})?\)/,
    );
  });

  it("hides the notice when the viewer's device timezone matches the household's", async () => {
    stubChoresFetch();
    vi.mocked(getDeviceTimezone).mockReturnValue('America/New_York');

    render(<ChoresView householdTimezone="America/New_York" rooms={mockRooms} />);

    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.queryByTestId('timezone-mismatch-notice')).not.toBeInTheDocument();
  });

  it('creates a new chore via the add-chore form and renders it', async () => {
    const user = userEvent.setup();
    const createdChore = {
      id: 3,
      name: 'Mop Floors',
      roomId: 2,
      dateLastCompleted: '2026-06-15T00:00:00.000Z',
      duration: 15,
      frequency: 3,
      version: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/chores' && method === 'GET') {
          return jsonResponse({ success: true, data: mockChores });
        }
        if (url === '/api/chores' && method === 'POST') {
          return jsonResponse({ success: true, data: createdChore });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add chore/i }));
    await user.type(screen.getByLabelText('Name'), 'Mop Floors');
    await user.selectOptions(screen.getByLabelText('Room'), 'Kitchen');
    await user.type(screen.getByLabelText('Last Completed'), '2026-06-15');
    await user.type(screen.getByLabelText('Duration (minutes)'), '15');
    await user.type(screen.getByLabelText('Frequency (days)'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Mop Floors')).toBeInTheDocument());
  });

  it('edits an existing chore via the edit-chore form, sending its current version', async () => {
    const user = userEvent.setup();
    const updatedChore = {
      id: 1,
      name: 'Vacuum Deluxe',
      roomId: 1,
      dateLastCompleted: '2026-06-01T00:00:00.000Z',
      duration: 20,
      frequency: 7,
      version: 2,
    };
    let putBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/chores' && method === 'GET') {
          return jsonResponse({ success: true, data: mockChores });
        }
        if (url === '/api/chores/1' && method === 'PUT') {
          putBody = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse({ success: true, data: updatedChore });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    await user.click(screen.getAllByLabelText('Edit chore')[0]);
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Vacuum');
    await user.clear(nameInput);
    await user.type(nameInput, 'Vacuum Deluxe');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('Vacuum Deluxe')).toBeInTheDocument());
    expect(putBody).toMatchObject({ version: 1 });
  });

  it('shows a distinguishable conflict dialog, not a generic error, when an edit hits a stale version', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/chores' && method === 'GET') {
          return jsonResponse({ success: true, data: mockChores });
        }
        if (url === '/api/chores/1' && method === 'PUT') {
          return Promise.resolve(
            new Response(JSON.stringify({ success: false, error: 'Chore was changed elsewhere' }), {
              status: 409,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    await user.click(screen.getAllByLabelText('Edit chore')[0]);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('This chore was changed elsewhere.')).toBeInTheDocument());
    expect(screen.getByTestId('confirm-dialog-backdrop')).toBeInTheDocument();
  });

  it('keeps the optimistic completion visible when the complete request fails over the network', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/chores' && method === 'GET') {
          return jsonResponse({ success: true, data: mockChores });
        }
        if (url === '/api/chores/1/complete' && method === 'PATCH') {
          return Promise.reject(new Error('network unavailable'));
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    const vacuumBar = screen.getByText('Vacuum').closest('[data-testid="chore-bar"]') as HTMLElement;
    await user.click(vacuumBar);

    await waitFor(() => expect(within(vacuumBar).getByText('0 days ago')).toBeInTheDocument());
  });

  it('keeps a chore removed from the list when the delete request fails over the network', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/chores' && method === 'GET') {
          return jsonResponse({ success: true, data: mockChores });
        }
        if (url === '/api/chores/1' && method === 'DELETE') {
          return Promise.reject(new Error('network unavailable'));
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    const vacuumBar = screen.getByText('Vacuum').closest('[data-testid="chore-bar"]') as HTMLElement;
    await user.click(within(vacuumBar).getByLabelText('Delete chore'));

    await waitFor(() => expect(screen.queryByText('Vacuum')).not.toBeInTheDocument());
  });

  it('queues a failed complete mutation onto the outbox and reconciles once it later flushes', async () => {
    const user = userEvent.setup();
    let completeAttempts = 0;
    let putBody: Record<string, unknown> | null = null;
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/chores' && method === 'GET') {
        return jsonResponse({ success: true, data: mockChores });
      }
      if (url === '/api/chores/1/complete' && method === 'PATCH') {
        completeAttempts += 1;
        if (completeAttempts === 1) return Promise.reject(new Error('offline'));
        return jsonResponse({
          success: true,
          data: {
            id: 1,
            name: 'Vacuum',
            roomId: 1,
            dateLastCompleted: '2026-07-02T00:00:00.000Z',
            duration: 20,
            frequency: 7,
            version: 2,
          },
        });
      }
      if (url === '/api/chores/1' && method === 'PUT') {
        putBody = init?.body ? JSON.parse(init.body as string) : null;
        return jsonResponse({
          success: true,
          data: {
            id: 1,
            name: 'Vacuum Deluxe',
            roomId: 1,
            dateLastCompleted: '2026-07-02T00:00:00.000Z',
            duration: 20,
            frequency: 7,
            version: 3,
          },
        });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const testOutbox = createOutbox(fetchImpl);

    render(<ChoresView householdTimezone="UTC" outbox={testOutbox} rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());

    const vacuumBar = screen.getByText('Vacuum').closest('[data-testid="chore-bar"]') as HTMLElement;
    await user.click(vacuumBar);

    await waitFor(() => expect(testOutbox.getEntries()).toHaveLength(1));

    await act(async () => {
      await testOutbox.flush();
    });
    await waitFor(() => expect(testOutbox.getEntries()).toHaveLength(0));

    const vacuumBarAfterSync = screen.getByText('Vacuum').closest('[data-testid="chore-bar"]') as HTMLElement;
    await user.click(within(vacuumBarAfterSync).getByLabelText('Edit chore'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(putBody).toMatchObject({ version: 2 }));

    testOutbox.dispose();
  });

  it('renders from the IndexedDB cache and marks it stale when the initial fetch fails', async () => {
    await writeChoresCache(mockChores);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);

    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByTestId('status-banner')).toBeInTheDocument();
  });

  it('renders from the IndexedDB cache and marks it stale when offline at load time', async () => {
    await writeChoresCache(mockChores);
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('fetch should not be called while offline');
      }),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);

    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByTestId('status-banner')).toBeInTheDocument();
  });

  it('clears the stale banner automatically once a live fetch succeeds', async () => {
    await writeChoresCache(mockChores);
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: true, data: mockChores })),
    );

    render(<ChoresView householdTimezone="UTC" rooms={mockRooms} />);
    await waitFor(() => expect(screen.getByTestId('status-banner')).toBeInTheDocument());

    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.queryByTestId('status-banner')).not.toBeInTheDocument());
  });

  it('shows a chore still pending in the outbox after a reload while offline (not lost)', async () => {
    await writeChoresCache(mockChores);
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('fetch should not be called while offline');
      }),
    );
    const testOutbox = createOutbox(vi.fn());
    testOutbox.append({
      type: 'create',
      tempId: -123,
      payload: {
        name: 'Mop Floors',
        roomId: 2,
        dateLastCompleted: '2026-06-15T00:00:00.000Z',
        duration: 15,
        frequency: 3,
      },
    });

    render(<ChoresView householdTimezone="UTC" outbox={testOutbox} rooms={mockRooms} />);

    await waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByText('Mop Floors')).toBeInTheDocument();

    testOutbox.dispose();
  });
});
