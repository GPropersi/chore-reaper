import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ChoresView from './ChoresView';

const mockChores = [
  {
    id: 1,
    name: 'Vacuum',
    room: 'Living Room',
    dateLastCompleted: '2026-06-01T00:00:00.000Z',
    duration: 20,
    frequency: 7,
    version: 1,
  },
  {
    id: 2,
    name: 'Dishes',
    room: 'Kitchen',
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

function getBarSummaries(): { name: string | null; color: string | undefined }[] {
  return screen.getAllByTestId('chore-bar').map((bar) => ({
    name: bar.querySelector('.font-medium')?.textContent ?? null,
    color: bar.querySelector('[data-testid="progress-bar"]')?.className,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

describe('ChoresView', () => {
  it('fetches /api/chores and renders them', async () => {
    stubChoresFetch();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    render(<ChoresView organizationTimezone="Pacific/Kiritimati" timezone="Pacific/Niue" />);

    await vi.waitFor(() => expect(screen.getByText('Vacuum')).toBeInTheDocument());
    expect(screen.getByText('Dishes')).toBeInTheDocument();
  });

  it('renders identical chore ordering and bar colors for two users in the same org with different personal timezones', async () => {
    stubChoresFetch();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    const { unmount: unmountA } = render(
      <ChoresView organizationTimezone="America/New_York" timezone="Asia/Tokyo" />,
    );
    await waitFor(() => expect(screen.getAllByTestId('chore-bar')).toHaveLength(2));
    const summariesA = getBarSummaries();
    unmountA();

    stubChoresFetch();
    const { unmount: unmountB } = render(
      <ChoresView organizationTimezone="America/New_York" timezone="Australia/Perth" />,
    );
    await waitFor(() => expect(screen.getAllByTestId('chore-bar')).toHaveLength(2));
    const summariesB = getBarSummaries();
    unmountB();

    expect(summariesB).toEqual(summariesA);
  });
});
