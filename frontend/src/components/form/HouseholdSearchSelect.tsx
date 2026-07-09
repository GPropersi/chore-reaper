import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

export type HouseholdOption = {
  id: number;
  name: string;
};

export type HouseholdSelection = { type: 'existing'; id: number } | { type: 'new'; name: string };

type HouseholdSearchSelectProps = {
  id: string;
  label: string;
  households: HouseholdOption[];
  value: HouseholdSelection | null;
  onChange: (value: HouseholdSelection | null) => void;
};

export default function HouseholdSearchSelect({
  id,
  label,
  households,
  value,
  onChange,
}: HouseholdSearchSelectProps) {
  const [query, setQuery] = useState(() => {
    if (value?.type === 'existing') return households.find((h) => h.id === value.id)?.name ?? '';
    if (value?.type === 'new') return value.name;
    return '';
  });
  const [isOpen, setIsOpen] = useState(false);

  const trimmedQuery = query.trim();

  const matches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return households;
    return households.filter((h) => h.name.toLowerCase().includes(q));
  }, [trimmedQuery, households]);

  const hasExactMatch = households.some((h) => h.name.toLowerCase() === trimmedQuery.toLowerCase());
  const canCreate = trimmedQuery.length > 0 && !hasExactMatch;

  function handleQueryChange(next: string) {
    setQuery(next);
    setIsOpen(true);
    // Typing after a selection invalidates it — the parent must re-gate
    // submission until a fresh option (or "create new") is clicked below.
    if (value != null) onChange(null);
  }

  function handleSelect(household: HouseholdOption) {
    setQuery(household.name);
    setIsOpen(false);
    onChange({ type: 'existing', id: household.id });
  }

  function handleCreateNew() {
    setIsOpen(false);
    onChange({ type: 'new', name: trimmedQuery });
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
        className={`bg-gray-700 text-white rounded px-3 py-2 text-base sm:text-sm border ${
          value?.type === 'new' ? 'border-emerald-500' : 'border-transparent'
        }`}
      />
      {value?.type === 'new' && (
        <p className="text-xs text-emerald-400 flex items-center gap-1">
          <Plus size={12} /> Will create a new household named &ldquo;{value.name}&rdquo;
        </p>
      )}
      {isOpen && (matches.length > 0 || canCreate) && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-10 mt-1 bg-gray-700 rounded-lg max-h-48 overflow-y-auto shadow-lg"
        >
          {matches.map((household) => (
            <li
              key={household.id}
              role="option"
              aria-selected={value?.type === 'existing' && household.id === value.id}
              // Prevents the input's blur (which would close this list) from
              // firing before the click is registered.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(household)}
              className="px-3 py-2 text-white text-sm hover:bg-gray-600 cursor-pointer"
            >
              {household.name}
            </li>
          ))}
          {canCreate && (
            <li
              role="option"
              aria-selected={value?.type === 'new'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreateNew}
              className="px-3 py-2 text-emerald-400 text-sm hover:bg-gray-600 cursor-pointer flex items-center gap-1 border-t border-gray-600"
            >
              <Plus size={14} /> Create new household &ldquo;{trimmedQuery}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
