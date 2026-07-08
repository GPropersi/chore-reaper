import { useMemo, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { SwipeEventData } from 'react-swipeable';
import { differenceInDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Chore } from '@customTypes/SharedTypes';
import { computeBar } from '@utils/choreBarMath';
import ProgressBar from './ProgressBar';
import ChoreInfo from './ChoreInfo';
import CompletionInfo from './CompletionInfo';

type ChoreTimerBarProps = {
  chore: Chore;
  day: Date;
  householdTimezone: string;
  isSimulating: boolean;
  onComplete: (id: number, date: Date) => void;
  onDelete: (id: number) => void;
  onEdit?: (id: number) => void;
};

export default function ChoreTimerBar({
  chore,
  day,
  householdTimezone,
  isSimulating,
  onComplete,
  onDelete,
  onEdit,
}: ChoreTimerBarProps) {
  const daysSince = useMemo(
    () =>
      differenceInDays(
        startOfDay(toZonedTime(day, householdTimezone)),
        startOfDay(toZonedTime(chore.dateLastCompleted, householdTimezone)),
      ),
    [day, chore.dateLastCompleted, householdTimezone],
  );

  const { isOverdue, barWidth, barColor } = computeBar(daysSince, chore.frequency);

  const swipingRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);

  // The row itself never visibly moved during a swipe — onSwipedLeft/Right
  // only fired once the gesture was already complete, with no feedback in
  // between. Track deltaX directly on the DOM node (skipping React state) so
  // the row follows the finger at native touchmove rate, then spring back.
  const SWIPE_VISUAL_MAX = 80;

  function snapBack() {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = 'transform 150ms ease-out';
    el.style.transform = '';
  }

  const { ref: attachSwipeRef, ...swipeHandlers } = useSwipeable({
    onSwipeStart: () => {
      const el = barRef.current;
      if (el) el.style.transition = 'none';
    },
    onSwiping: ({ deltaX, dir }: SwipeEventData) => {
      const el = barRef.current;
      if (!el || (dir !== 'Left' && dir !== 'Right')) return;
      const clamped = Math.max(-SWIPE_VISUAL_MAX, Math.min(SWIPE_VISUAL_MAX, deltaX));
      el.style.transform = `translateX(${clamped}px)`;
    },
    onSwipedLeft: () => {
      swipingRef.current = true;
      if (!isSimulating) onDelete(chore.id);
    },
    onSwipedRight: () => {
      swipingRef.current = true;
      if (!isSimulating && onEdit) onEdit(chore.id);
    },
    onTouchStartOrOnMouseDown: () => {
      swipingRef.current = false;
    },
    onTouchEndOrOnMouseUp: snapBack,
    delta: 50,
    trackMouse: true,
    // Passive touch listeners (the default when this is false) let iOS
    // Safari's own scroll/gesture recognizer claim the touch sequence before
    // onSwipedLeft/onSwipedRight ever fire — true forces a non-passive
    // listener so this element can actually win the gesture on iOS.
    preventScrollOnSwipe: true,
  });

  function resetTask() {
    if (isSimulating) return;
    if (swipingRef.current) {
      swipingRef.current = false;
      return;
    }
    onComplete(chore.id, new Date());
  }

  return (
    <div
      {...swipeHandlers}
      ref={(el) => {
        attachSwipeRef(el);
        barRef.current = el;
      }}
      data-testid="chore-bar"
      className={`relative h-20 sm:h-16 w-full bg-gray-800 rounded-full shadow overflow-hidden touch-pan-y ${isSimulating ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer'}`}
      onClick={resetTask}
    >
      <ProgressBar width={barWidth} color={barColor} />
      <div className="absolute inset-0 px-4 grid grid-cols-3 items-center gap-2">
        <ChoreInfo name={chore.name} />
        <div className="text-xs text-white text-opacity-80 text-center">Every {chore.frequency} days</div>
        <CompletionInfo
          date={chore.dateLastCompleted}
          daysSince={daysSince}
          householdTimezone={householdTimezone}
        />
      </div>

      {isOverdue && <span className="sr-only">Overdue</span>}

      {/* Persistent visible cue that this row is swipeable — visible on every
          render, on every platform, unlike the sr-only buttons below which
          only appear on keyboard focus. */}
      <span
        aria-hidden="true"
        data-testid="swipe-hint-left"
        className="absolute left-1 top-1/2 -translate-y-1/2 text-white text-opacity-30 text-lg leading-none pointer-events-none select-none"
      >
        ‹
      </span>
      <span
        aria-hidden="true"
        data-testid="swipe-hint-right"
        className="absolute right-1 top-1/2 -translate-y-1/2 text-white text-opacity-30 text-lg leading-none pointer-events-none select-none"
      >
        ›
      </span>

      {/* Swipe is the primary delete/edit affordance (F5); these sr-only buttons are the keyboard/AT fallback. */}
      {onEdit && (
        <button
          type="button"
          className="sr-only focus:not-sr-only focus:absolute focus:right-12 focus:top-1/2 focus:-translate-y-1/2 focus:z-10 focus:px-3 focus:py-1 focus:bg-indigo-600 focus:text-white focus:text-sm focus:rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(chore.id);
          }}
          aria-label="Edit chore"
        >
          Edit chore
        </button>
      )}
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-1/2 focus:-translate-y-1/2 focus:z-10 focus:px-3 focus:py-1 focus:bg-red-600 focus:text-white focus:text-sm focus:rounded-full"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(chore.id);
        }}
        aria-label="Delete chore"
      >
        Delete chore
      </button>
    </div>
  );
}
