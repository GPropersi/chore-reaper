import { IANA_TIMEZONES } from '../../utils/timezones';

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
        className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
      >
        {allowUnset && <option value="">Same as household</option>}
        {IANA_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </div>
  );
}
