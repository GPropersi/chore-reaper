import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SwipeableRow from './SwipeableRow';

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('SwipeableRow', () => {
  it('renders children with no action buttons when actions is empty', () => {
    render(
      <SwipeableRow actions={[]}>
        <p>Row content</p>
      </SwipeableRow>,
    );
    expect(screen.getByText('Row content')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('on a non-touch pointer, renders the action as a plain, immediately clickable button', async () => {
    stubPointer(false);
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <SwipeableRow
        actions={[{ key: 'delete', label: 'Delete', icon: <span />, onClick, colorClass: 'bg-red-600' }]}
      >
        <p>Row content</p>
      </SwipeableRow>,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('on a touch pointer, the revealed preview button starts disabled and the sr-only fallback stays usable', async () => {
    stubPointer(true);
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <SwipeableRow
        actions={[{ key: 'delete', label: 'Delete', icon: <span />, onClick, colorClass: 'bg-red-600' }]}
      >
        <p>Row content</p>
      </SwipeableRow>,
    );

    // Two buttons now share a name-adjacent pair: the swipe-revealed preview
    // (distinct aria-label) and the always-usable sr-only fallback (name
    // "Delete") — only the fallback is queryable by that exact name.
    const fallback = screen.getByRole('button', { name: 'Delete' });
    await user.click(fallback);
    expect(onClick).toHaveBeenCalledTimes(1);

    const preview = screen.getByRole('button', { name: 'Confirm delete' });
    expect(preview).toBeDisabled();
  });
});
