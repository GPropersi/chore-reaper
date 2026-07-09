import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';

type Membership = {
  householdId: number;
  householdName: string;
};

type SwitchHouseholdModalProps = {
  memberships: Membership[];
  currentHouseholdId: number;
  onSelect: (householdId: number) => void;
  onCancel: () => void;
};

export default function SwitchHouseholdModal({
  memberships,
  currentHouseholdId,
  onSelect,
  onCancel,
}: SwitchHouseholdModalProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memberships;
    return memberships.filter((m) => m.householdName.toLowerCase().includes(q));
  }, [query, memberships]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="switch-household-modal-backdrop"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 className="text-white font-semibold text-lg mb-4">Switch Household</h3>
        <input
          type="text"
          aria-label="Search households"
          placeholder="Search households…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          // 16px below sm avoids iOS Safari's zoom-on-focus, same as FormField.
          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-base sm:text-sm mb-3"
        />
        <ul className="space-y-1 max-h-64 overflow-y-auto" data-testid="switch-household-list">
          {matches.map((m) => (
            <li key={m.householdId}>
              <button
                type="button"
                onClick={() => onSelect(m.householdId)}
                aria-current={m.householdId === currentHouseholdId}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  m.householdId === currentHouseholdId
                    ? 'bg-indigo-900/50 text-indigo-300'
                    : 'text-white hover:bg-gray-700'
                }`}
              >
                {m.householdName}
              </button>
            </li>
          ))}
          {matches.length === 0 && <p className="text-gray-400 text-sm px-1 py-2">No households match.</p>}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
