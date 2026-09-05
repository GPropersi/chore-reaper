type StatusBannerProps = {
  tone: 'stale' | 'offline' | 'warning';
  message: string;
  action?: { label: string; onClick: () => void };
};

const toneClasses = {
  stale: 'bg-amber-900 text-amber-100',
  offline: 'bg-gray-700 text-gray-100',
  warning: 'bg-red-900 text-red-100',
};

export default function StatusBanner({ tone, message, action }: StatusBannerProps) {
  return (
    <div
      data-testid="status-banner"
      role="status"
      // Programmatically focusable so focus can be parked here when the Retry
      // button is dropped (e.g. going offline) instead of falling to <body>.
      tabIndex={-1}
      className={`${toneClasses[tone]} text-sm text-center py-2 px-4${
        action ? ' flex items-center justify-center gap-3 flex-wrap' : ''
      }`}
    >
      <span>{message}</span>
      {action && (
        <button
          type="button"
          data-testid="status-banner-action"
          onClick={action.onClick}
          aria-label="Retry — reload and sign in again"
          className="bg-amber-300 text-amber-950 text-sm font-semibold py-1.5 px-4 rounded-lg min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
