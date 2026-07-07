type StatusBannerProps = {
  tone: 'stale' | 'offline' | 'warning';
  message: string;
};

const toneClasses = {
  stale: 'bg-amber-900 text-amber-100',
  offline: 'bg-gray-700 text-gray-100',
  warning: 'bg-red-900 text-red-100',
};

export default function StatusBanner({ tone, message }: StatusBannerProps) {
  return (
    <div
      data-testid="status-banner"
      role="status"
      className={`${toneClasses[tone]} text-sm text-center py-2 px-4`}
    >
      {message}
    </div>
  );
}
