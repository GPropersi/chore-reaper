import { differenceInDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Chore } from '@customTypes/SharedTypes';

// Calendar-day flooring is timezone-dependent (an instant near midnight can
// fall on different days depending which zone reads it), so both timestamps
// must be interpreted in the same zone — the household's — rather than
// whichever timezone the viewer's own device happens to be set to.
function daysSinceInZone(today: Date, dateLastCompleted: Date, timezone: string): number {
  return differenceInDays(
    startOfDay(toZonedTime(today, timezone)),
    startOfDay(toZonedTime(dateLastCompleted, timezone)),
  );
}

export function calcDurationWeightedScore(chore: Chore, today: Date, timezone: string): number {
  const daysSince = daysSinceInZone(today, chore.dateLastCompleted, timezone);
  const percentOverdue = daysSince / chore.frequency;
  return chore.duration * percentOverdue;
}

function orderSubList(chores: Chore[], today: Date, timezone: string): Chore[] {
  return [...chores].sort(
    (a, b) => calcDurationWeightedScore(b, today, timezone) - calcDurationWeightedScore(a, today, timezone),
  );
}

export function orderChores(chores: Chore[], today: Date, timezone: string): Chore[] {
  const shortTerm = chores.filter((c) => !c.longTermTask);
  const longTerm = chores.filter((c) => c.longTermTask);
  return [...orderSubList(shortTerm, today, timezone), ...orderSubList(longTerm, today, timezone)];
}
