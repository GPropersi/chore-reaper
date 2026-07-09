import { useRef, useState, type ReactNode } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { SwipeEventData } from 'react-swipeable';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice';

export type SwipeAction = {
  key: string;
  // Accessible name for the always-available sr-only fallback button (visible
  // text too), so keyboard/AT users never depend on the swipe gesture itself.
  label: string;
  // aria-label for the circular button revealed by swiping. Defaults to
  // `Confirm ${label}` so it never collides with the fallback button's name.
  previewLabel?: string;
  icon: ReactNode;
  onClick: () => void;
  colorClass: string;
};

type SwipeableRowProps = {
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
};

// How far the row must be dragged before a swipe "commits" to opening the
// action buttons underneath, rather than springing back to closed.
const SWIPE_TRIGGER_DISTANCE = 120;
// How far the row stays parked once opened — enough room for the circular
// buttons (h-9/w-9) side by side with a gap. Sized for a compact list row
// (~40-44px tall) rather than the taller chore bar — a 48px button here
// would poke out above/below the row itself, since the button layer is only
// as tall as the row's own content.
const OPEN_OFFSET_MULTI = 120;
const OPEN_OFFSET_SINGLE = 64;

export default function SwipeableRow({ actions, children, className = '' }: SwipeableRowProps) {
  const isTouch = useIsTouchDevice();
  const openOffset = actions.length > 1 ? OPEN_OFFSET_MULTI : OPEN_OFFSET_SINGLE;

  // Swiping never performs an action directly — a left-swipe reveals real,
  // pressable buttons and holds the row open (like iOS Mail), so a completed
  // gesture can't by itself delete/approve/deny anything; a separate,
  // deliberate tap on a revealed button is required.
  const [isOpen, setIsOpen] = useState(false);

  const swipingRef = useRef(false);
  const justCommittedRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function animateTo(nextOpen: boolean) {
    const el = rowRef.current;
    if (el) {
      el.style.transition = 'transform 150ms ease-out';
      el.style.transform = nextOpen ? `translateX(-${openOffset}px)` : '';
    }
    for (const btn of buttonRefs.current) {
      if (!btn) continue;
      btn.style.transition = 'opacity 150ms ease-out';
      btn.style.opacity = nextOpen ? '1' : '0';
    }
  }

  function commitOpen() {
    setIsOpen(true);
    animateTo(true);
  }

  function commitClose() {
    setIsOpen(false);
    animateTo(false);
  }

  const { ref: attachSwipeRef, ...swipeHandlers } = useSwipeable({
    onSwipeStart: () => {
      const el = rowRef.current;
      if (el) el.style.transition = 'none';
      for (const btn of buttonRefs.current) {
        if (btn) btn.style.transition = 'none';
      }
    },
    onSwiping: ({ deltaX, dir }: SwipeEventData) => {
      const el = rowRef.current;
      if (!el) return;
      if (!isOpen) {
        // Closed: only a left-swipe previews opening.
        if (dir !== 'Left') return;
        const clamped = Math.max(-SWIPE_TRIGGER_DISTANCE, Math.min(0, deltaX));
        el.style.transform = `translateX(${clamped}px)`;
        const progress = Math.min(1, Math.abs(clamped) / SWIPE_TRIGGER_DISTANCE);
        for (const btn of buttonRefs.current) {
          if (btn) btn.style.opacity = String(progress);
        }
      } else {
        // Open: only a right-swipe (swiping back) previews closing.
        if (dir !== 'Right') return;
        const dragged = Math.max(0, Math.min(SWIPE_TRIGGER_DISTANCE, deltaX));
        const position = Math.min(0, -openOffset + dragged);
        el.style.transform = `translateX(${position}px)`;
        const remaining = String(1 - Math.min(1, dragged / SWIPE_TRIGGER_DISTANCE));
        for (const btn of buttonRefs.current) {
          if (btn) btn.style.opacity = remaining;
        }
      }
    },
    onSwipedLeft: (data) => {
      if (isOpen) return;
      swipingRef.current = true;
      if (data.absX < SWIPE_TRIGGER_DISTANCE) return;
      justCommittedRef.current = true;
      commitOpen();
    },
    onSwipedRight: (data) => {
      if (!isOpen) return;
      swipingRef.current = true;
      if (data.absX < SWIPE_TRIGGER_DISTANCE) return;
      justCommittedRef.current = true;
      commitClose();
    },
    onTouchStartOrOnMouseDown: () => {
      swipingRef.current = false;
    },
    onTouchEndOrOnMouseUp: () => {
      if (justCommittedRef.current) {
        justCommittedRef.current = false;
        return;
      }
      animateTo(isOpen);
    },
    delta: 10,
    trackMouse: true,
    preventScrollOnSwipe: true,
  });

  function handleRowClick() {
    if (swipingRef.current) {
      swipingRef.current = false;
      return;
    }
    if (isOpen) {
      commitClose();
    }
  }

  function handleActionTap(e: React.MouseEvent, action: SwipeAction) {
    e.stopPropagation();
    commitClose();
    action.onClick();
  }

  if (actions.length === 0) {
    return <div className={className}>{children}</div>;
  }

  // Swiping is a touch affordance — a mouse-driven "drag to reveal" doesn't
  // read as discoverable on desktop, so non-touch pointers get the actions
  // rendered plainly alongside the row instead of hidden behind a gesture.
  if (!isTouch) {
    return (
      <div className={`flex items-stretch gap-2 ${className}`}>
        <div className="flex-1 min-w-0">{children}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              title={action.label}
              className={`h-7 w-7 rounded-full flex items-center justify-center text-white hover:opacity-90 ${action.colorClass}`}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div className="absolute inset-0 flex items-center justify-end gap-3 px-3">
        {actions.map((action, i) => (
          <button
            key={action.key}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            disabled={!isOpen}
            onClick={(e) => handleActionTap(e, action)}
            aria-label={action.previewLabel ?? `Confirm ${action.label.toLowerCase()}`}
            className={`h-9 w-9 rounded-full flex items-center justify-center text-white opacity-0 ${action.colorClass} ${isOpen ? '' : 'pointer-events-none'}`}
          >
            {action.icon}
          </button>
        ))}
      </div>

      <div
        {...swipeHandlers}
        ref={(el) => {
          attachSwipeRef(el);
          rowRef.current = el;
        }}
        className="relative w-full touch-pan-y"
        onClick={handleRowClick}
      >
        {children}

        {/* Swipe is the primary affordance; these sr-only buttons are the keyboard/AT fallback. */}
        {actions.map((action, i) => (
          <button
            key={action.key}
            type="button"
            className={`sr-only focus:not-sr-only focus:absolute focus:top-1/2 focus:-translate-y-1/2 focus:z-10 focus:px-3 focus:py-1 focus:text-white focus:text-sm focus:rounded-full ${action.colorClass}`}
            style={{ right: `${12 + i * 48}px` }}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            aria-label={action.label}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
