import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HouseholdSection from './HouseholdSection';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const baseProps = {
  householdId: 1,
  householdName: 'The Smith House',
  householdTimezone: 'UTC',
  onTimezoneChange: vi.fn(),
  memberships: [{ householdId: 1, householdName: 'The Smith House' }],
  currentHouseholdId: 1,
  onSwitchHousehold: vi.fn(),
};

describe('HouseholdSection', () => {
  it('submits the selected timezone to PATCH /api/households/:id and reports it back on success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/households/1' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        return jsonResponse({ success: true, data: { id: 1, name: 'Household', timezone: body.timezone } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onTimezoneChange = vi.fn();

    render(<HouseholdSection {...baseProps} onTimezoneChange={onTimezoneChange} />);

    await user.selectOptions(screen.getByLabelText('Timezone'), 'America/Chicago');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Saved.');
    expect(onTimezoneChange).toHaveBeenCalledWith('America/Chicago');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      timezone: 'America/Chicago',
    });
  });

  it('shows an error banner instead of a saved message when the request fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: false, error: 'Invalid timezone' }, 400)),
    );

    render(<HouseholdSection {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Invalid timezone')).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('renders the household name', () => {
    render(<HouseholdSection {...baseProps} />);
    expect(screen.getByText('The Smith House')).toBeInTheDocument();
  });

  it('hides the switcher button when the viewer belongs to only one household', () => {
    render(<HouseholdSection {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Switch household' })).not.toBeInTheDocument();
  });

  it('opens the switcher modal, and selecting a household calls onSwitchHousehold and closes it', async () => {
    const user = userEvent.setup();
    const onSwitchHousehold = vi.fn();
    render(
      <HouseholdSection
        {...baseProps}
        memberships={[
          { householdId: 1, householdName: 'The Smith House' },
          { householdId: 2, householdName: 'The Jones House' },
        ]}
        onSwitchHousehold={onSwitchHousehold}
      />,
    );

    const switcherButton = screen.getByRole('button', { name: 'Switch household' });
    await user.click(switcherButton);

    const modal = screen.getByTestId('switch-household-modal-backdrop');
    await user.click(within(modal).getByRole('button', { name: 'The Jones House' }));

    expect(onSwitchHousehold).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId('switch-household-modal-backdrop')).not.toBeInTheDocument();
  });
});
