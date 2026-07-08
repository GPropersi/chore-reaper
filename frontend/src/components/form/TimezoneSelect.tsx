import { MAJOR_TIMEZONES, utcOffsetLabel } from '../../utils/timezones';

type TimezoneSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowUnset?: boolean;
  required?: boolean;
};

export default function TimezoneSelect({
  id,
  label,
  value,
  onChange,
  allowUnset = false,
  required = false,
}: TimezoneSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        // 16px below sm avoids iOS Safari's zoom-on-focus for <select>.
        className="bg-gray-700 text-white rounded px-3 py-2 text-base sm:text-sm"
      >
        {allowUnset && <option value="">Same as household</option>}
        {MAJOR_TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.city} ({utcOffsetLabel(tz.value)})
          </option>
        ))}
      </select>
    </div>
  );
}
