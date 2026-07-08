import { describe, it, expect } from 'vitest';
import { calcDurationWeightedScore } from './choreSort';
import type { Chore } from '@customTypes/SharedTypes';

function makeChore(overrides: Partial<Chore>): Chore {
  return {
    id: 1,
    name: 'Test',
    roomId: 1,
    dateLastCompleted: new Date('2026-01-01T23:30:00.000Z'),
    duration: 10,
    frequency: 2,
    ...overrides,
  };
}

describe('calcDurationWeightedScore', () => {
  it('floors "days since" using the given household timezone, not the runtime default', () => {
    // Same two instants, only 2.5 hours apart, straddling the UTC day boundary.
    const today = new Date('2026-01-02T02:00:00.000Z');
    const chore = makeChore({ dateLastCompleted: new Date('2026-01-01T23:30:00.000Z') });

    // UTC: completed Jan 1, "today" is Jan 2 -> 1 day since -> score = 10 * (1/2) = 5.
    expect(calcDurationWeightedScore(chore, today, 'UTC')).toBe(5);

    // Pacific/Kiritimati (UTC+14): both instants land on the same local calendar
    // day (Jan 2) -> 0 days since -> score 0. Proves the household timezone
    // actually drives the day-boundary math, not wherever the code happens to run.
    expect(calcDurationWeightedScore(chore, today, 'Pacific/Kiritimati')).toBe(0);
  });
});
