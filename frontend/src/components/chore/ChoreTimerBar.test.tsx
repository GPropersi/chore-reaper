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
  it('renders a visible swipe-hint chevron unconditionally, not just on focus', () => {
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        householdTimezone="UTC"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('swipe-hint-left')).toBeInTheDocument();
  });

  it('keeps the swipe-hint chevron non-interactive so it never blocks a tap-to-complete', () => {
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        householdTimezone="UTC"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('swipe-hint-left')).toHaveClass('pointer-events-none');
  });

  it('computes "days ago" using the household timezone\'s day boundary, not the runtime default', () => {
    // Completed 23:30 UTC on Jan 1; "day" is 02:00 UTC on Jan 2 — only 2.5
    // hours later, but straddling the UTC midnight boundary.
    const straddlingChore: Chore = {
      ...chore,
      dateLastCompleted: new Date('2026-01-01T23:30:00.000Z'),
    };

    const { rerender } = render(
      <ChoreTimerBar
        chore={straddlingChore}
        day={new Date('2026-01-02T02:00:00.000Z')}
        householdTimezone="UTC"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('1 day ago')).toBeInTheDocument();

    // Pacific/Kiritimati (UTC+14): both instants land on the same local
    // calendar day, so it's still "today" — 0 days ago.
    rerender(
      <ChoreTimerBar
        chore={straddlingChore}
        day={new Date('2026-01-02T02:00:00.000Z')}
        householdTimezone="Pacific/Kiritimati"
        isSimulating={false}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('0 days ago')).toBeInTheDocument();
  });

  it('still completes the chore on a tap of the bar itself', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ChoreTimerBar
        chore={chore}
        day={new Date('2026-07-01T00:00:00.000Z')}
        householdTimezone="UTC"
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
