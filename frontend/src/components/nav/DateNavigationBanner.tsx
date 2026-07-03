import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type DateNavigationBannerProps = {
  simulatedDate: Date;
  dayOffset: number;
  onPrev: () => void;
  onNext: () => void;
};

export default function DateNavigationBanner({
  simulatedDate,
  dayOffset,
  onPrev,
  onNext,
}: DateNavigationBannerProps) {
  const prevHidden = dayOffset === 0;

  // Derives the slide direction from the change in dayOffset since the last
  // render — updating state during render (rather than a ref in an effect)
  // keeps this correct under concurrent rendering. See:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevDayOffset, setPrevDayOffset] = useState(dayOffset);
  const [slideClass, setSlideClass] = useState('');
  if (dayOffset !== prevDayOffset) {
    setSlideClass(dayOffset < prevDayOffset ? 'slide-in-left' : 'slide-in-right');
    setPrevDayOffset(dayOffset);
  }

  return (
    <div className="flex items-center justify-center gap-3 my-3 flex-shrink-0 text-white relative">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous day"
        tabIndex={prevHidden ? -1 : undefined}
        className={`p-2 rounded-full hover:bg-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center ${prevHidden ? 'invisible' : ''}`}
      >
        <ChevronLeft className="w-6 h-6" aria-hidden="true" />
      </button>
      <div className="overflow-hidden min-w-0 flex-1 max-w-xs sm:max-w-sm">
        <h1
          key={simulatedDate.toDateString()}
          className={`text-center text-2xl sm:text-3xl font-semibold tracking-wide ${slideClass}`}
        >
          {simulatedDate.toDateString()}
        </h1>
      </div>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next day"
        className="p-2 rounded-full hover:bg-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <ChevronRight className="w-6 h-6" aria-hidden="true" />
      </button>
    </div>
  );
}
