import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPanel from './AdminPanel';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

const initialMembers = [
  { id: 1, householdId: 1, email: 'admin@example.com', role: 'admin', timezone: 'America/Chicago' },
  { id: 2, householdId: 1, email: 'member@example.com', role: 'member', timezone: null },
];

const noRoomsProps = {
  rooms: [],
  onRoomsChange: () => {},
  householdId: 1,
  householdTimezone: 'America/Chicago',
  onHouseholdTimezoneChange: () => {},
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/members' && method === 'GET') {
        return jsonResponse({ success: true, data: initialMembers });
      }
      if (url === '/api/members' && method === 'POST') {
        const body = JSON.parse(init!.body as string);
        return jsonResponse({ success: true, data: { id: 3, householdId: 1, ...body } });
      }
      if (url.startsWith('/api/members/') && method === 'DELETE') {
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
  it('renders the fetched member list', async () => {
    render(<AdminPanel {...noRoomsProps} />);

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
  });

  it('submits the add-member form to POST /api/members and appends the result to the list', async () => {
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add Member' }));
    const modal = screen.getByTestId('add-member-modal-backdrop');
    await user.type(within(modal).getByLabelText('Email'), 'new@example.com');
    await user.selectOptions(within(modal).getByLabelText('Role'), 'admin');
    await user.selectOptions(within(modal).getByLabelText('Timezone'), 'America/New_York');
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

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

  it('surfaces a warning banner when POST /api/members returns one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/members' && method === 'GET') {
          return jsonResponse({ success: true, data: initialMembers });
        }
        if (url === '/api/members' && method === 'POST') {
          const body = JSON.parse(init!.body as string);
          return jsonResponse({
            success: true,
            data: { id: 3, householdId: 1, ...body },
            warning:
              'Member added, but could not be added to the Cloudflare Access allow-list automatically.',
          });
        }
        throw new Error(`Unhandled fetch: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add Member' }));
    const modal = screen.getByTestId('add-member-modal-backdrop');
    await user.type(within(modal).getByLabelText('Email'), 'new@example.com');
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Member added, but could not be added to the Cloudflare Access allow-list automatically.',
      ),
    ).toBeInTheDocument();
  });

  it('renders no warning banner when POST /api/members returns none', async () => {
    const user = userEvent.setup();
    render(<AdminPanel {...noRoomsProps} />);
    await screen.findByText('admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Add Member' }));
    const modal = screen.getByTestId('add-member-modal-backdrop');
    await user.type(within(modal).getByLabelText('Email'), 'new@example.com');
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

    await screen.findByText('new@example.com');
    expect(screen.queryByTestId('status-banner')).not.toBeInTheDocument();
  });

  it('flows remove-member through ConfirmDialog before calling DELETE', async () => {
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
