import { createPortal } from 'react-dom';
import { useState } from 'react';
import FormField from '../form/FormField';
import TimezoneSelect from '../form/TimezoneSelect';

export type CreateHouseholdInput = {
  name: string;
  timezone: string;
};

type CreateHouseholdModalProps = {
  onSubmit: (input: CreateHouseholdInput) => void;
  onCancel: () => void;
  error?: string | null;
};

export default function CreateHouseholdModal({ onSubmit, onCancel, error }: CreateHouseholdModalProps) {
  const [name, setName] = useState('');
  // UTC is the same default bootstrap-admin.ts uses for a brand-new household.
  const [timezone, setTimezone] = useState('UTC');

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), timezone });
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="create-household-modal-backdrop"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 className="text-white font-semibold text-lg mb-4">Create Household</h3>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField name="name" label="Name" value={name} onChange={(_, value) => setName(value)} required />
          <TimezoneSelect id="household-timezone" label="Timezone" value={timezone} onChange={setTimezone} />

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={!name.trim()}
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
