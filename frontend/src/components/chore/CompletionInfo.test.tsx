import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompletionInfo from './CompletionInfo';

describe('CompletionInfo', () => {
  it("formats the completion date in the viewing user's own timezone, independent of daysSince", () => {
    const date = new Date('2026-01-01T23:30:00.000Z');

    const { rerender } = render(<CompletionInfo date={date} daysSince={3} timezone="Pacific/Kiritimati" />);
    // UTC+14: 2026-01-01T23:30Z is already 2026-01-02 locally there.
    expect(screen.getByText(/Jan 2 2026/)).toBeInTheDocument();

    rerender(<CompletionInfo date={date} daysSince={3} timezone="Pacific/Niue" />);
    // UTC-11: the same instant is still 2026-01-01 locally there.
    expect(screen.getByText(/Jan 1 2026/)).toBeInTheDocument();

    // daysSince is scoring-driven (household-timezone based) and must stay put regardless
    // of which display timezone is passed in.
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
  });
});
