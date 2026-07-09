import { useEffect, useState } from 'react';
import type { HouseholdListItem, ApiResponse } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';
import CreateHouseholdModal, { type CreateHouseholdInput } from './CreateHouseholdModal';

type HouseholdsDirectoryProps = {
  // Bumped by AdminPanel when AddUserModal creates a household out-of-band
  // (its inline "create new household" option) — this section otherwise has
  // no way to learn about that, since it fetches its own list independently
  // rather than sharing state with AddUserModal's own household fetch.
  refreshKey?: number;
};

// Mostly self-contained like JoinRequestsSection, unlike UsersDirectory
// (which AdminPanel orchestrates externally): its own Create Household flow
// updates its list locally with no parent coordination needed. refreshKey is
// the one exception, for the cross-component case above.
export default function HouseholdsDirectory({ refreshKey }: HouseholdsDirectoryProps) {
  const [households, setHouseholds] = useState<HouseholdListItem[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/households')
      .then((res) => res.json())
      .then((body: ApiResponse<HouseholdListItem[]>) => setHouseholds(body.data ?? []));
  }, [refreshKey]);

  async function handleCreate(input: CreateHouseholdInput) {
    const res = await apiFetch('/api/admin/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as ApiResponse<HouseholdListItem>;
    if (body.success && body.data) {
      setHouseholds((prev) => [...prev, body.data as HouseholdListItem]);
      setError(null);
      setIsCreateOpen(false);
    } else {
      setError(body.error ?? 'Could not create household');
    }
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Households</h2>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIsCreateOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          Create Household
        </button>
      </div>

      <ul className="space-y-2" data-testid="admin-household-list">
        {households.map((household) => (
          <li
            key={household.id}
            className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2"
          >
            <p className="text-white text-sm">{household.name}</p>
          </li>
        ))}
      </ul>

      {isCreateOpen && (
        <CreateHouseholdModal onSubmit={handleCreate} onCancel={() => setIsCreateOpen(false)} error={error} />
      )}
    </div>
  );
}
