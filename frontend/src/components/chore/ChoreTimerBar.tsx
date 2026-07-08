import { useMemo, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { SwipeEventData } from 'react-swipeable';
import { Pencil, Trash2 } from 'lucide-react';
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
  const editIconRef = useRef<HTMLSpanElement>(null);
  const deleteIconRef = useRef<HTMLSpanElement>(null);

  // The row itself never visibly moved during a swipe — onSwipedLeft/Right
  // only fired once the gesture was already complete, with no feedback in
  // between. Track deltaX directly on the DOM node (skipping React state) so
  // the row follows the finger at native touchmove rate, then spring back.
  //
  // This distance also doubles as react-swipeable's own `delta` trigger
  // threshold below — they used to be two separate numbers (80 here, 50
  // there), so the action could fire before the drag/icon reveal had
  // visually caught up, reading as "I barely swiped and it already
  // deleted." Keeping one constant means the icon only reaches full
  // opacity right as a release would actually trigger the action.
  const SWIPE_TRIGGER_DISTANCE = 120;

  function snapBack() {
    const el = barRef.current;
    if (el) {
      el.style.transition = 'transform 150ms ease-out';
      el.style.transform = '';
    }
    for (const iconEl of [editIconRef.current, deleteIconRef.current]) {
      if (!iconEl) continue;
      iconEl.style.transition = 'opacity 150ms ease-out';
      iconEl.style.opacity = '0';
    }
  }

  const { ref: attachSwipeRef, ...swipeHandlers } = useSwipeable({
    onSwipeStart: () => {
      const el = barRef.current;
      if (el) el.style.transition = 'none';
      for (const iconEl of [editIconRef.current, deleteIconRef.current]) {
        if (iconEl) iconEl.style.transition = 'none';
      }
    },
    onSwiping: ({ deltaX, dir }: SwipeEventData) => {
      const el = barRef.current;
      if (!el || (dir !== 'Left' && dir !== 'Right')) return;
      const clamped = Math.max(-SWIPE_TRIGGER_DISTANCE, Math.min(SWIPE_TRIGGER_DISTANCE, deltaX));
      el.style.transform = `translateX(${clamped}px)`;

      // Swiping left deletes, revealing the trash icon on the right (where
      // the bar is sliding away from); swiping right edits, revealing the
      // edit icon on the left. Opacity ramps with drag distance so the icon
      // previews the action instead of just appearing abruptly at the end.
      const progress = Math.min(1, Math.abs(clamped) / SWIPE_TRIGGER_DISTANCE);
      if (deleteIconRef.current) {
        deleteIconRef.current.style.opacity = dir === 'Left' ? String(progress) : '0';
      }
      if (editIconRef.current) {
        editIconRef.current.style.opacity = dir === 'Right' ? String(progress) : '0';
      }
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
    delta: SWIPE_TRIGGER_DISTANCE,
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
    <div className="relative h-20 sm:h-16 w-full rounded-full shadow overflow-hidden">
      {/* Background reveal layer: previews which action a swipe will trigger
          (edit on the left, delete on the right), exposed underneath as the
          row above slides away — not just a generic "you can swipe" cue. */}
      <div className="absolute inset-0 flex items-center justify-between px-6 bg-gray-800">
        <span
          ref={editIconRef}
          aria-hidden="true"
          data-testid="edit-icon-preview"
          className="text-indigo-400 opacity-0"
        >
          <Pencil size={22} />
        </span>
        <span
          ref={deleteIconRef}
          aria-hidden="true"
          data-testid="delete-icon-preview"
          className="text-red-400 opacity-0"
        >
          <Trash2 size={22} />
        </span>
      </div>

      <div
        {...swipeHandlers}
        ref={(el) => {
          attachSwipeRef(el);
          barRef.current = el;
        }}
        data-testid="chore-bar"
        className={`relative h-full w-full bg-gray-800 rounded-full overflow-hidden touch-pan-y ${isSimulating ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer'}`}
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
    </div>
  );
}
