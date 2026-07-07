import { useEffect, useState } from 'react';
import type { Room } from '@customTypes/SharedTypes';
import ConfirmDialog from '../common/ConfirmDialog';
import StatusBanner from '../common/StatusBanner';
import AddUserModal, { type AddUserInput } from './AddUserModal';
import RoomsSection from './RoomsSection';
import { apiFetch } from '../../utils/api';

export type AdminUser = {
  id: number;
  organizationId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string; warning?: string };

type AdminPanelProps = {
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

export default function AdminPanel({ rooms, onRoomsChange }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/users')
      .then((res) => res.json())
      .then((body: ApiResponse<AdminUser[]>) => setUsers(body.data ?? []));
  }, []);

  async function handleAddUser(input: AddUserInput) {
    const res = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as ApiResponse<AdminUser>;
    if (body.success && body.data) {
      setUsers((prev) => [...prev, body.data as AdminUser]);
    }
    setWarning(body.warning ?? null);
    setIsAddOpen(false);
  }

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    if (id == null) return;
    const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      setUsers((prev) => prev.filter((user) => user.id !== id));
    }
    setPendingDeleteId(null);
  }

  return (
    <div className="p-4">
      {warning && <StatusBanner tone="warning" message={warning} />}

      <RoomsSection rooms={rooms} onRoomsChange={onRoomsChange} />

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Users</h2>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          Add User
        </button>
      </div>

      <ul className="space-y-2" data-testid="user-list">
        {users.map((user) => (
          <li key={user.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
            <div>
              <p className="text-white text-sm">{user.email}</p>
              <p className="text-gray-400 text-xs">
                {user.role}
                {user.timezone ? ` · ${user.timezone}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingDeleteId(user.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {isAddOpen && <AddUserModal onSubmit={handleAddUser} onCancel={() => setIsAddOpen(false)} />}

      {pendingDeleteId != null && (
        <ConfirmDialog
          message="Remove this user?"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
