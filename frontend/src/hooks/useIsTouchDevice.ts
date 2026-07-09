import { useEffect, useState } from 'react';

// `(pointer: coarse)` reflects the *primary* pointer's precision, so a laptop
// with a touchscreen but a mouse as primary input still reports fine — unlike
// `'ontouchstart' in window`, which is true on plenty of non-touch-primary
// hardware and would wrongly enable swipe gestures for mouse users.
function computeIsTouch(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(computeIsTouch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(pointer: coarse)');
    const handleChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isTouch;
}
