import { formatInTimeZone } from 'date-fns-tz';

type CompletionInfoProps = {
  date: Date;
  daysSince: number;
  householdTimezone: string;
};

export default function CompletionInfo({ date, daysSince, householdTimezone }: CompletionInfoProps) {
  return (
    <div className="text-white text-right text-xs min-w-0">
      <span className="sr-only">Last Completed: </span>
      {formatInTimeZone(date, householdTimezone, 'EEE MMM d yyyy')}
      <div className="text-white text-sm font-bold">
        {daysSince} {daysSince === 1 ? 'day' : 'days'} ago
      </div>
    </div>
  );
}
