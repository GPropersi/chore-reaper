import { useEffect, useState, type ReactNode } from 'react';
import type { AdminUser, ApiResponse } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';
import ConfirmDialog from '../common/ConfirmDialog';

type UsersDirectoryProps = {
  currentUserId: number;
  headerAction?: ReactNode;
};

export default function UsersDirectory({ currentUserId, headerAction }: UsersDirectoryProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/users')
      .then((res) => res.json())
      .then((body: ApiResponse<AdminUser[]>) => setUsers(body.data ?? []));
  }, []);

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    if (id == null) return;
    const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      setUsers((prev) => prev.filter((user) => user.id !== id));
      setWarning(body.warning ?? null);
    } else {
      setWarning(body.error ?? 'Could not delete user');
    }
    setPendingDeleteId(null);
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Users</h2>
        {headerAction}
      </div>

      {warning && (
        <p className="text-amber-400 text-xs mb-2" role="status">
          {warning}
        </p>
      )}

      <ul className="space-y-2" data-testid="admin-user-list">
        {users.map((user) => (
          <li key={user.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-white text-sm">{user.email}</p>
                {user.isAdmin && (
                  <span
                    data-testid="admin-badge"
                    className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400 bg-indigo-900/50 px-2 py-0.5 rounded-full"
                  >
                    Admin
                  </span>
                )}
              </div>
              {user.timezone && <p className="text-gray-400 text-xs">{user.timezone}</p>}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-gray-400 text-xs text-right">
                {user.households.length > 0 ? user.households.map((h) => h.name).join(', ') : 'No households'}
              </p>
              {user.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(user.id)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pendingDeleteId != null && (
        <ConfirmDialog
          message="Delete this user? This removes them from every household and revokes their access."
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
