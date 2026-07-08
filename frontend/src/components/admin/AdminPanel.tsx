import { useEffect, useState } from 'react';
import type { Room } from '@customTypes/SharedTypes';
import ConfirmDialog from '../common/ConfirmDialog';
import StatusBanner from '../common/StatusBanner';
import AddMemberModal, { type AddMemberInput } from './AddMemberModal';
import RoomsSection from './RoomsSection';
import HouseholdSection from './HouseholdSection';
import { apiFetch } from '../../utils/api';

export type Member = {
  id: number;
  householdId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string; warning?: string };

type AdminPanelProps = {
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
  householdId: number;
  householdTimezone: string;
  onHouseholdTimezoneChange: (timezone: string) => void;
};

export default function AdminPanel({
  rooms,
  onRoomsChange,
  householdId,
  householdTimezone,
  onHouseholdTimezoneChange,
}: AdminPanelProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/members')
      .then((res) => res.json())
      .then((body: ApiResponse<Member[]>) => setMembers(body.data ?? []));
  }, []);

  async function handleAddMember(input: AddMemberInput) {
    const res = await apiFetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as ApiResponse<Member>;
    if (body.success && body.data) {
      setMembers((prev) => [...prev, body.data as Member]);
      setWarning(body.warning ?? null);
      setIsAddOpen(false);
    } else {
      // Keep the modal open on failure (e.g. already a member of this household)
      // so the admin can see what went wrong and correct the email/role.
      setWarning(body.error ?? 'Could not add member');
    }
  }

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    if (id == null) return;
    const res = await apiFetch(`/api/members/${id}`, { method: 'DELETE' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      setMembers((prev) => prev.filter((member) => member.id !== id));
    }
    setPendingDeleteId(null);
  }

  return (
    <div className="p-4">
      {warning && <StatusBanner tone="warning" message={warning} />}

      <HouseholdSection
        householdId={householdId}
        householdTimezone={householdTimezone}
        onTimezoneChange={onHouseholdTimezoneChange}
      />

      <RoomsSection rooms={rooms} onRoomsChange={onRoomsChange} />

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Members</h2>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          Add Member
        </button>
      </div>

      <ul className="space-y-2" data-testid="member-list">
        {members.map((member) => (
          <li key={member.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
            <div>
              <p className="text-white text-sm">{member.email}</p>
              <p className="text-gray-400 text-xs">
                {member.role}
                {member.timezone ? ` · ${member.timezone}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingDeleteId(member.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {isAddOpen && <AddMemberModal onSubmit={handleAddMember} onCancel={() => setIsAddOpen(false)} />}

      {pendingDeleteId != null && (
        <ConfirmDialog
          message="Remove this member?"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
