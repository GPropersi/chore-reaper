import { formatInTimeZone } from 'date-fns-tz';

type CompletionInfoProps = {
  date: Date;
  daysSince: number;
  timezone: string;
};

export default function CompletionInfo({ date, daysSince, timezone }: CompletionInfoProps) {
  return (
    <div className="text-white text-right text-xs min-w-0">
      <span className="sr-only">Last Completed: </span>
      {formatInTimeZone(date, timezone, 'EEE MMM d yyyy')}
      <div className="text-white text-sm font-bold">
        {daysSince} {daysSince === 1 ? 'day' : 'days'} ago
      </div>
    </div>
  );
}
