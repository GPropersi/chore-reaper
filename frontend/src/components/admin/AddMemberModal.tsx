import { createPortal } from 'react-dom';
import { useState } from 'react';
import FormField from '../form/FormField';
import TimezoneSelect from '../form/TimezoneSelect';

export type AddMemberInput = {
  email: string;
  role: 'admin' | 'member';
  timezone: string;
};

type AddMemberModalProps = {
  onSubmit: (input: AddMemberInput) => void;
  onCancel: () => void;
};

export default function AddMemberModal({ onSubmit, onCancel }: AddMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [timezone, setTimezone] = useState('');

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({ email, role, timezone });
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="add-member-modal-backdrop"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 className="text-white font-semibold text-lg mb-4">Add Member</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField
            name="email"
            label="Email"
            value={email}
            onChange={(_, value) => setEmail(value)}
            required
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm text-gray-400">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <TimezoneSelect id="timezone" label="Timezone" value={timezone} onChange={setTimezone} allowUnset />

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg"
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
