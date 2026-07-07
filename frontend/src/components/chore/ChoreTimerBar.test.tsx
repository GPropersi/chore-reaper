import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChoreTimerBar from './ChoreTimerBar';
import type { Chore } from '@customTypes/SharedTypes';

const chore: Chore = {
  id: 1,
  name: 'Vacuum',
  details: null,
  roomId: 1,
  dateLastCompleted: new Date('2026-06-01T00:00:00.000Z'),
  duration: 20,
  frequency: 7,
};

afterEach(() => {
  cleanup();
});

describe('ChoreTimerBar', () => {
  it('renders visible swipe-hint chevrons unconditionally, not just on focus', () => {
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        timezone="UTC"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('swipe-hint-left')).toBeInTheDocument();
    expect(screen.getByTestId('swipe-hint-right')).toBeInTheDocument();
  });

  it('keeps the swipe-hint chevrons non-interactive so they never block a tap-to-complete', () => {
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        timezone="UTC"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('swipe-hint-left')).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('swipe-hint-right')).toHaveClass('pointer-events-none');
  });

  it('still completes the chore on a tap of the bar itself', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        timezone="UTC"
        isSimulating={false}
        onComplete={onComplete}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('chore-bar'));

    expect(onComplete).toHaveBeenCalledWith(1, expect.any(Date));
  });
});
