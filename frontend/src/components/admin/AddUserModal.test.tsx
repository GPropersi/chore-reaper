import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddUserModal from './AddUserModal';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

const households = [
  { id: 1, name: 'The Smith House' },
  { id: 2, name: 'The Jones House' },
];

function stubHouseholdsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/admin/households') return jsonResponse({ success: true, data: households });
      throw new Error(`Unhandled fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AddUserModal', () => {
  it('fetches and lists households from GET /api/admin/households', async () => {
    stubHouseholdsFetch();
    const user = userEvent.setup();
    render(<AddUserModal onSubmit={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByLabelText('Household'));
    expect(await screen.findByRole('option', { name: 'The Smith House' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'The Jones House' })).toBeInTheDocument();
  });

  it('disables Save until a household is selected and an email is entered', async () => {
    stubHouseholdsFetch();
    const user = userEvent.setup();
    render(<AddUserModal onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByLabelText('Household'));
    await user.click(await screen.findByRole('option', { name: 'The Smith House' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('submits householdId, email, timezone, and makeAdmin', async () => {
    stubHouseholdsFetch();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddUserModal onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.click(screen.getByLabelText('Household'));
    await user.click(await screen.findByRole('option', { name: 'The Jones House' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.selectOptions(screen.getByLabelText('Timezone'), 'America/New_York');
    await user.click(screen.getByLabelText('Make Admin'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 2,
      email: 'new@example.com',
      timezone: 'America/New_York',
      makeAdmin: true,
    });
  });

  it('defaults makeAdmin to false when the checkbox is left unchecked', async () => {
    stubHouseholdsFetch();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddUserModal onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.click(screen.getByLabelText('Household'));
    await user.click(await screen.findByRole('option', { name: 'The Smith House' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ makeAdmin: false }));
  });

  it('lets an admin create a brand-new household inline and submits newHouseholdName', async () => {
    stubHouseholdsFetch();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddUserModal onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Household'), 'The Lake House');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(await screen.findByRole('option', { name: /Create new household/ }));
    expect(screen.getByText(/Will create a new household named/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      newHouseholdName: 'The Lake House',
      email: 'new@example.com',
      timezone: '',
      makeAdmin: false,
    });
  });
});
