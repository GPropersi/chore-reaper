import { useMemo, useState } from 'react';

export type HouseholdOption = {
  id: number;
  name: string;
};

type HouseholdSearchSelectProps = {
  id: string;
  label: string;
  households: HouseholdOption[];
  value: number | null;
  onChange: (householdId: number | null) => void;
};

export default function HouseholdSearchSelect({
  id,
  label,
  households,
  value,
  onChange,
}: HouseholdSearchSelectProps) {
  const selected = households.find((h) => h.id === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return households;
    return households.filter((h) => h.name.toLowerCase().includes(q));
  }, [query, households]);

  function handleQueryChange(next: string) {
    setQuery(next);
    setIsOpen(true);
    // Typing after a selection invalidates it — the parent must re-gate
    // submission until a fresh option is clicked below.
    if (value != null) onChange(null);
  }

  function handleSelect(household: HouseholdOption) {
    setQuery(household.name);
    setIsOpen(false);
    onChange(household.id);
  }

  return (
    <div className="flex flex-col gap-1 relative">
      <label htmlFor={id} className="text-sm text-gray-400">
        {label}
      </label>
      <input
        id={id}
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        // 16px below sm avoids iOS Safari's zoom-on-focus, same as FormField/TimezoneSelect.
        className="bg-gray-700 text-white rounded px-3 py-2 text-base sm:text-sm"
      />
      {isOpen && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-10 mt-1 bg-gray-700 rounded-lg max-h-48 overflow-y-auto shadow-lg"
        >
          {matches.map((household) => (
            <li
              key={household.id}
              role="option"
              aria-selected={household.id === value}
              // Prevents the input's blur (which would close this list) from
              // firing before the click is registered.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(household)}
              className="px-3 py-2 text-white text-sm hover:bg-gray-600 cursor-pointer"
            >
              {household.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
