import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { ApiResponse, HouseholdListItem } from '@customTypes/SharedTypes';
import FormField from '../form/FormField';
import TimezoneSelect from '../form/TimezoneSelect';
import HouseholdSearchSelect, { type HouseholdSelection } from '../form/HouseholdSearchSelect';
import { apiFetch } from '../../utils/api';

export type AddUserInput = {
  email: string;
  timezone: string;
  makeAdmin: boolean;
} & ({ householdId: number } | { newHouseholdName: string; newHouseholdTimezone: string });

type AddUserModalProps = {
  onSubmit: (input: AddUserInput) => void;
  onCancel: () => void;
};

export default function AddUserModal({ onSubmit, onCancel }: AddUserModalProps) {
  const [households, setHouseholds] = useState<HouseholdListItem[]>([]);
  const [household, setHousehold] = useState<HouseholdSelection | null>(null);
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  // UTC is the same default CreateHouseholdModal/bootstrap-admin.ts use for a
  // brand-new household — deliberately separate from the member's own
  // `timezone` above, which is a distinct, optional, per-person setting.
  const [newHouseholdTimezone, setNewHouseholdTimezone] = useState('UTC');
  const [makeAdmin, setMakeAdmin] = useState(false);

  useEffect(() => {
    apiFetch('/api/admin/households')
      .then((res) => res.json())
      .then((body: ApiResponse<HouseholdListItem[]>) => setHouseholds(body.data ?? []));
  }, []);

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (household == null || !email) return;
    const householdFields =
      household.type === 'existing'
        ? { householdId: household.id }
        : { newHouseholdName: household.name, newHouseholdTimezone };
    onSubmit({ ...householdFields, email, timezone, makeAdmin });
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="add-user-modal-backdrop"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 className="text-white font-semibold text-lg mb-4">Add User</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <HouseholdSearchSelect
            id="add-user-household"
            label="Household"
            households={households}
            value={household}
            onChange={setHousehold}
          />
          {household?.type === 'new' && (
            <TimezoneSelect
              id="new-household-timezone"
              label="Household Timezone"
              value={newHouseholdTimezone}
              onChange={setNewHouseholdTimezone}
            />
          )}
          <FormField
            name="email"
            label="Email"
            value={email}
            onChange={(_, value) => setEmail(value)}
            required
          />
          <TimezoneSelect id="timezone" label="Timezone" value={timezone} onChange={setTimezone} allowUnset />

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              className="rounded"
            />
            Make Admin
          </label>

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={household == null || !email}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
