import { useRef, useState, useMemo } from 'react';
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

// How far the row must be dragged before a swipe "commits" to opening the
// action buttons underneath, rather than springing back to closed.
const SWIPE_TRIGGER_DISTANCE = 120;
// How far the row stays parked once opened — enough room for both circular
// buttons (h-12/w-12) side by side with a gap, or just one if there's no
// edit handler. Matches iOS Messages' floating circular swipe actions.
const OPEN_OFFSET_BOTH = 150;
const OPEN_OFFSET_DELETE_ONLY = 80;

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
  const openOffset = onEdit ? OPEN_OFFSET_BOTH : OPEN_OFFSET_DELETE_ONLY;

  // Swiping no longer performs delete/edit directly — a single left-swipe
  // reveals both real, pressable buttons together and holds the row open
  // (like iOS Mail), so a completed swipe gesture can't by itself delete
  // anything; a separate, deliberate tap on a revealed button is required.
  // Only one direction does anything now — edit lives next to delete
  // instead of behind its own opposite-direction swipe.
  const [isOpen, setIsOpen] = useState(false);

  const swipingRef = useRef(false);
  const justOpenedRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  function snapBack() {
    const el = barRef.current;
    if (el) {
      el.style.transition = 'transform 150ms ease-out';
      el.style.transform = '';
    }
    for (const btn of [editButtonRef.current, deleteButtonRef.current]) {
      if (!btn) continue;
      btn.style.transition = 'opacity 150ms ease-out';
      btn.style.opacity = '0';
    }
  }

  function open() {
    setIsOpen(true);
    const el = barRef.current;
    if (el) {
      el.style.transition = 'transform 150ms ease-out';
      el.style.transform = `translateX(-${openOffset}px)`;
    }
    for (const btn of [editButtonRef.current, deleteButtonRef.current]) {
      if (!btn) continue;
      btn.style.transition = 'opacity 150ms ease-out';
      btn.style.opacity = '1';
    }
  }

  function closeSwipe() {
    setIsOpen(false);
    snapBack();
  }

  const { ref: attachSwipeRef, ...swipeHandlers } = useSwipeable({
    onSwipeStart: () => {
      if (isOpen) return;
      const el = barRef.current;
      if (el) el.style.transition = 'none';
      for (const btn of [editButtonRef.current, deleteButtonRef.current]) {
        if (btn) btn.style.transition = 'none';
      }
    },
    onSwiping: ({ deltaX, dir }: SwipeEventData) => {
      // Once open, further drags are ignored — tap a revealed button or tap
      // the row to close, rather than fighting the anchored position.
      // Swiping right does nothing — only left reveals the action buttons.
      if (isOpen || dir !== 'Left') return;
      const el = barRef.current;
      if (!el) return;
      const clamped = Math.max(-SWIPE_TRIGGER_DISTANCE, Math.min(SWIPE_TRIGGER_DISTANCE, deltaX));
      el.style.transform = `translateX(${clamped}px)`;

      // Opacity ramps with drag distance so the buttons preview the reveal
      // instead of appearing abruptly once the swipe commits.
      const progress = Math.min(1, Math.abs(clamped) / SWIPE_TRIGGER_DISTANCE);
      if (deleteButtonRef.current) deleteButtonRef.current.style.opacity = String(progress);
      if (editButtonRef.current) editButtonRef.current.style.opacity = String(progress);
    },
    onSwipedLeft: () => {
      if (isOpen) return;
      swipingRef.current = true;
      if (isSimulating) return;
      justOpenedRef.current = true;
      open();
    },
    onTouchStartOrOnMouseDown: () => {
      swipingRef.current = false;
    },
    onTouchEndOrOnMouseUp: () => {
      // onSwipedLeft and this both fire on the same release — skip the
      // reset this one time so it doesn't immediately undo the open we
      // just committed to above.
      if (justOpenedRef.current) {
        justOpenedRef.current = false;
        return;
      }
      if (!isOpen) snapBack();
    },
    delta: SWIPE_TRIGGER_DISTANCE,
    trackMouse: true,
    // Passive touch listeners (the default when this is false) let iOS
    // Safari's own scroll/gesture recognizer claim the touch sequence before
    // onSwipedLeft ever fires — true forces a non-passive listener so this
    // element can actually win the gesture on iOS.
    preventScrollOnSwipe: true,
  });

  function handleBarClick() {
    if (isSimulating) return;
    if (swipingRef.current) {
      swipingRef.current = false;
      return;
    }
    if (isOpen) {
      closeSwipe();
      return;
    }
    onComplete(chore.id, new Date());
  }

  function handleDeleteTap(e: React.MouseEvent) {
    e.stopPropagation();
    if (isSimulating) return;
    closeSwipe();
    onDelete(chore.id);
  }

  function handleEditTap(e: React.MouseEvent) {
    e.stopPropagation();
    if (isSimulating || !onEdit) return;
    closeSwipe();
    onEdit(chore.id);
  }

  return (
    <div className="relative h-20 sm:h-16 w-full">
      {/* Background layer: floating circular buttons on the page's own
          background (no rectangular block behind them), matching iOS
          Messages' swipe actions — edit sits next to delete so a single
          left-swipe reveals both, rather than each living behind its own
          opposite-direction swipe. Fades in as a preview while dragging,
          then becomes real pressable buttons once the swipe commits and
          holds the row open — swiping alone never performs the action. */}
      <div className="absolute inset-0 flex items-center justify-end gap-3 px-3">
        {onEdit && (
          <button
            ref={editButtonRef}
            type="button"
            disabled={!isOpen}
            onClick={handleEditTap}
            aria-label="Confirm edit"
            data-testid="edit-icon-preview"
            className={`h-12 w-12 rounded-full flex items-center justify-center bg-indigo-600 text-white opacity-0 ${isOpen ? '' : 'pointer-events-none'}`}
          >
            <Pencil size={20} />
          </button>
        )}
        <button
          ref={deleteButtonRef}
          type="button"
          disabled={!isOpen}
          onClick={handleDeleteTap}
          aria-label="Confirm delete"
          data-testid="delete-icon-preview"
          className={`h-12 w-12 rounded-full flex items-center justify-center bg-red-600 text-white opacity-0 ${isOpen ? '' : 'pointer-events-none'}`}
        >
          <Trash2 size={20} />
        </button>
      </div>

      <div
        {...swipeHandlers}
        ref={(el) => {
          attachSwipeRef(el);
          barRef.current = el;
        }}
        data-testid="chore-bar"
        className={`relative h-full w-full bg-gray-800 rounded-full shadow overflow-hidden touch-pan-y ${isSimulating ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer'}`}
        onClick={handleBarClick}
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
