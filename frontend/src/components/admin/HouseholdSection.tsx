import { useState } from 'react';
import TimezoneSelect from '../form/TimezoneSelect';
import StatusBanner from '../common/StatusBanner';
import { apiFetch } from '../../utils/api';

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

type HouseholdSectionProps = {
  householdId: number;
  householdTimezone: string;
  onTimezoneChange: (timezone: string) => void;
};

export default function HouseholdSection({
  householdId,
  householdTimezone,
  onTimezoneChange,
}: HouseholdSectionProps) {
  const [timezone, setTimezone] = useState(householdTimezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Household</h2>
      </div>
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
