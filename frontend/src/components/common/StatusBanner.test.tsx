import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBanner from './StatusBanner';

describe('StatusBanner', () => {
  it('renders the given message', () => {
    render(<StatusBanner tone="stale" message="Showing cached data as of 12:00 PM." />);

    expect(screen.getByText('Showing cached data as of 12:00 PM.')).toBeInTheDocument();
  });

  it('applies a distinguishable style per tone', () => {
    const { rerender } = render(<StatusBanner tone="stale" message="Stale" />);
    const staleClass = screen.getByTestId('status-banner').className;

    rerender(<StatusBanner tone="offline" message="Offline" />);
    const offlineClass = screen.getByTestId('status-banner').className;

    expect(staleClass).not.toBe(offlineClass);
  });

  it('renders an optional action button and invokes its callback on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <StatusBanner tone="stale" message="Session may have expired." action={{ label: 'Retry', onClick }} />,
    );

    await user.click(screen.getByRole('button', { name: /Retry/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders no button when no action is given (existing call sites unchanged)', () => {
    render(<StatusBanner tone="stale" message="Showing cached data." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Showing cached data.')).toBeInTheDocument();
  });
});
