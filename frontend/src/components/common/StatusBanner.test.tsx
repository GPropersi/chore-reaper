import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
