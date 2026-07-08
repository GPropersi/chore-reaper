import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimezoneSelect from './TimezoneSelect';
import { IANA_TIMEZONES } from '../../utils/timezones';

describe('TimezoneSelect', () => {
  it('renders every supported IANA timezone as an option', () => {
    render(<TimezoneSelect id="tz" label="Timezone" value="UTC" onChange={vi.fn()} />);

    const select = screen.getByLabelText('Timezone') as HTMLSelectElement;
    expect(select.options.length).toBe(IANA_TIMEZONES.length);
  });

  it('does not render an unset option by default', () => {
    render(<TimezoneSelect id="tz" label="Timezone" value="UTC" onChange={vi.fn()} />);

    expect(screen.queryByText('Same as household')).not.toBeInTheDocument();
  });

  it('renders a "Same as household" option when allowUnset is set', () => {
    render(<TimezoneSelect id="tz" label="Timezone" value="" onChange={vi.fn()} allowUnset />);

    expect(screen.getByText('Same as household')).toBeInTheDocument();
  });

  it('calls onChange with the selected value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimezoneSelect id="tz" label="Timezone" value="UTC" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Timezone'), 'America/Chicago');

    expect(onChange).toHaveBeenCalledWith('America/Chicago');
  });
});
