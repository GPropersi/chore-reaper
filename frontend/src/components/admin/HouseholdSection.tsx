import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import TimezoneSelect from '../form/TimezoneSelect';
import StatusBanner from '../common/StatusBanner';
import SwitchHouseholdModal from './SwitchHouseholdModal';
import { apiFetch } from '../../utils/api';

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

type Membership = {
  householdId: number;
  householdName: string;
};

type HouseholdSectionProps = {
  householdId: number;
  householdName: string;
  householdTimezone: string;
  onTimezoneChange: (timezone: string) => void;
  memberships: Membership[];
  currentHouseholdId: number;
  onSwitchHousehold: (householdId: number) => void;
};

export default function HouseholdSection({
  householdId,
  householdName,
  householdTimezone,
  onTimezoneChange,
  memberships,
  currentHouseholdId,
  onSwitchHousehold,
}: HouseholdSectionProps) {
  const [timezone, setTimezone] = useState(householdTimezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const res = await apiFetch(`/api/households/${householdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });
    const body = (await res.json()) as ApiResponse<{ timezone: string }>;
    if (body.success && body.data) {
      onTimezoneChange(body.data.timezone);
      setSaved(true);
    } else {
      setError(body.error ?? 'Could not update timezone');
    }
  }

  return (
    <div className="mb-8">
      {error && <StatusBanner tone="warning" message={error} />}
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-white text-lg font-semibold">Household</h2>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-gray-300 text-sm" data-testid="household-name">
          {householdName}
        </p>
        {memberships.length > 1 && (
          <button
            type="button"
            aria-label="Switch household"
            onClick={() => setIsSwitcherOpen(true)}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-700 min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isSwitcherOpen && (
        <SwitchHouseholdModal
          memberships={memberships}
          currentHouseholdId={currentHouseholdId}
          onSelect={(id) => {
            onSwitchHousehold(id);
            setIsSwitcherOpen(false);
          }}
          onCancel={() => setIsSwitcherOpen(false)}
        />
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1">
          <TimezoneSelect
            id="household-timezone"
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            required
          />
        </div>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          Save
        </button>
      </form>
      {saved && (
        <p className="text-green-400 text-xs mt-2" role="status">
          Saved.
        </p>
      )}
    </div>
  );
}
