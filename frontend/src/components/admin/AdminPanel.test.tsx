import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPanel from './AdminPanel';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

const initialUsers = [
  { id: 1, organizationId: 1, email: 'admin@example.com', role: 'admin', timezone: 'America/Chicago' },
  { id: 2, organizationId: 1, email: 'member@example.com', role: 'member', timezone: null },
];

const noRoomsProps = { rooms: [], onRoomsChange: () => {} };

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/users' && method === 'GET') {
        return jsonResponse({ success: true, data: initialUsers });
      }
      if (url === '/api/users' && method === 'POST') {
        const body = JSON.parse(init!.body as string);
        return jsonResponse({ success: true, data: { id: 3, organizationId: 1, ...body } });
      }
      if (url.startsWith('/api/users/') && method === 'DELETE') {
        return jsonResponse({ success: true, data: null });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminPanel', () => {
  it('renders the fetched user list', async () => {
    render(<AdminPanel {...noRoomsProps} />);

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
  });

  it('submits the add-user form to POST /api/users and appends the result to the list', async () => {
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add User' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'admin');
    await user.type(screen.getByLabelText('Timezone'), 'America/New_York');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall![1]!.body as string)).toEqual({
      email: 'new@example.com',
      role: 'admin',
      timezone: 'America/New_York',
    });
  });

  it('surfaces a warning banner when POST /api/users returns one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/users' && method === 'GET') {
          return jsonResponse({ success: true, data: initialUsers });
        }
        if (url === '/api/users' && method === 'POST') {
          const body = JSON.parse(init!.body as string);
          return jsonResponse({
            success: true,
            data: { id: 3, organizationId: 1, ...body },
            warning:
              'User created, but could not be added to the Cloudflare Access allow-list automatically.',
          });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add User' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'User created, but could not be added to the Cloudflare Access allow-list automatically.',
      ),
    ).toBeInTheDocument();
  });

  it('renders no warning banner when POST /api/users returns none', async () => {
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add User' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('new@example.com');
    expect(screen.queryByTestId('status-banner')).not.toBeInTheDocument();
  });

  it('flows remove-user through ConfirmDialog before calling DELETE', async () => {
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    // ConfirmDialog is open; DELETE must not have fired yet.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
    expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
  });
});
