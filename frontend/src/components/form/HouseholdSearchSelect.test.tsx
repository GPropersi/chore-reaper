import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HouseholdSearchSelect from './HouseholdSearchSelect';

const households = [
  { id: 1, name: 'The Smith House' },
  { id: 2, name: 'The Jones House' },
  { id: 3, name: 'Beach Cabin' },
];

describe('HouseholdSearchSelect', () => {
  it('lists every household when the input is focused with no query', async () => {
    const user = userEvent.setup();
    render(
      <HouseholdSearchSelect
        id="h"
        label="Household"
        households={households}
        value={null}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Household'));
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters case-insensitively as the user types', async () => {
    const user = userEvent.setup();
    render(
      <HouseholdSearchSelect
        id="h"
        label="Household"
        households={households}
        value={null}
        onChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Household'), 'jones');
    expect(screen.getByRole('option', { name: 'The Jones House' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'The Smith House' })).not.toBeInTheDocument();
  });

  it('calls onChange with the id and updates displayed text when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <HouseholdSearchSelect
        id="h"
        label="Household"
        households={households}
        value={null}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('Household'));
    await user.click(screen.getByRole('option', { name: 'Beach Cabin' }));

    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.getByLabelText('Household')).toHaveValue('Beach Cabin');
  });

  it('invalidates the selection (calls onChange with null) when typing after a selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <HouseholdSearchSelect
        id="h"
        label="Household"
        households={households}
        value={1}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Household'), 'x');
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
