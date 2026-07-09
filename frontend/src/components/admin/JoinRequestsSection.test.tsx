import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinRequestsSection from './JoinRequestsSection';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

const pendingRequests = [
  {
    id: 1,
    householdId: 1,
    householdName: 'The Smith House',
    requestedEmail: 'requested@example.com',
    requestedByEmail: 'member@example.com',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('JoinRequestsSection', () => {
  it('renders the fetched pending requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: true, data: pendingRequests })),
    );

    render(<JoinRequestsSection />);

    expect(await screen.findByText('requested@example.com')).toBeInTheDocument();
    expect(screen.getByText(/The Smith House/)).toBeInTheDocument();
    expect(screen.getByText(/member@example.com/)).toBeInTheDocument();
  });

  it('renders nothing when there are no pending requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: true, data: [] })),
    );

    const { container } = render(<JoinRequestsSection />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('Approve calls POST /api/admin/join-requests/:id/approve and removes the item', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/admin/join-requests' && method === 'GET') {
        return jsonResponse({ success: true, data: pendingRequests });
      }
      if (url === '/api/admin/join-requests/1/approve' && method === 'POST') {
        return jsonResponse({ success: true, data: { id: 5, email: 'requested@example.com' } });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<JoinRequestsSection />);
    await screen.findByText('requested@example.com');

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await vi.waitFor(() => expect(screen.queryByText('requested@example.com')).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('surfaces a warning when approve returns one, without re-adding the item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/admin/join-requests' && method === 'GET') {
          return jsonResponse({ success: true, data: pendingRequests });
        }
        if (url === '/api/admin/join-requests/1/approve' && method === 'POST') {
          return jsonResponse({
            success: true,
            data: { id: 5, email: 'requested@example.com' },
            warning: 'Could not add to the Cloudflare Access allow-list automatically.',
          });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<JoinRequestsSection />);
    await screen.findByText('requested@example.com');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('Could not add to the Cloudflare Access allow-list automatically.'),
    ).toBeInTheDocument();
  });

  it('calls onApproved with the created member when approve returns one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/admin/join-requests' && method === 'GET') {
          return jsonResponse({ success: true, data: pendingRequests });
        }
        if (url === '/api/admin/join-requests/1/approve' && method === 'POST') {
          return jsonResponse({
            success: true,
            data: { id: 5, householdId: 1, email: 'requested@example.com', isAdmin: false, timezone: null },
          });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();
    const onApproved = vi.fn();

    render(<JoinRequestsSection onApproved={onApproved} />);
    await screen.findByText('requested@example.com');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await vi.waitFor(() =>
      expect(onApproved).toHaveBeenCalledWith({
        id: 5,
        householdId: 1,
        email: 'requested@example.com',
        isAdmin: false,
        timezone: null,
      }),
    );
  });

  it('Deny calls POST /api/admin/join-requests/:id/deny and removes the item', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/admin/join-requests' && method === 'GET') {
        return jsonResponse({ success: true, data: pendingRequests });
      }
      if (url === '/api/admin/join-requests/1/deny' && method === 'POST') {
        return jsonResponse({ success: true, data: null });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<JoinRequestsSection />);
    await screen.findByText('requested@example.com');

    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await vi.waitFor(() => expect(screen.queryByText('requested@example.com')).not.toBeInTheDocument());
  });
});
