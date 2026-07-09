import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SwitchHouseholdModal from './SwitchHouseholdModal';

afterEach(() => {
  cleanup();
});

const memberships = [
  { householdId: 1, householdName: 'The Smith House' },
  { householdId: 2, householdName: 'The Jones House' },
  { householdId: 3, householdName: 'Beach Cabin' },
];

describe('SwitchHouseholdModal', () => {
  it('lists every membership', () => {
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'The Smith House' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Jones House' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beach Cabin' })).toBeInTheDocument();
  });

  it('filters the list case-insensitively as the user types', async () => {
    const user = userEvent.setup();
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Search households'), 'jones');

    expect(screen.getByRole('button', { name: 'The Jones House' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'The Smith House' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Beach Cabin' })).not.toBeInTheDocument();
  });

  it('shows a message when no household matches the search', async () => {
    const user = userEvent.setup();
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Search households'), 'nonexistent');
    expect(screen.getByText('No households match.')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked household id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Beach Cabin' }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('marks the current household as aria-current', () => {
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={2}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'The Jones House' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'The Smith House' })).toHaveAttribute('aria-current', 'false');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <SwitchHouseholdModal
        memberships={memberships}
        currentHouseholdId={1}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId('switch-household-modal-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });
});
