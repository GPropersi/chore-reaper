import { useEffect, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { AdminUser, ApiResponse } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';
import ConfirmDialog from '../common/ConfirmDialog';
import SwipeableRow from '../common/SwipeableRow';

type UsersDirectoryProps = {
  currentUserId: number;
  headerAction?: ReactNode;
  // Bumped by AdminPanel whenever a user is added or a join request is
  // approved — this section otherwise has no way to learn about that, since
  // it fetches its own list independently rather than sharing state with
  // AddUserModal/JoinRequestsSection.
  refreshKey?: number;
};

export default function UsersDirectory({ currentUserId, headerAction, refreshKey }: UsersDirectoryProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pendingPromoteId, setPendingPromoteId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/users')
      .then((res) => res.json())
      .then((body: ApiResponse<AdminUser[]>) => setUsers(body.data ?? []));
  }, [refreshKey]);

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

  async function handleConfirmPromote() {
    const id = pendingPromoteId;
    if (id == null) return;
    const res = await apiFetch(`/api/admin/users/${id}/promote`, { method: 'POST' });
    const body = (await res.json()) as ApiResponse<AdminUser>;
    if (body.success && body.data) {
      const updated = body.data;
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
    } else {
      setWarning(body.error ?? 'Could not promote user');
    }
    setPendingPromoteId(null);
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
          <li key={user.id}>
            <SwipeableRow
              actions={
                user.id !== currentUserId
                  ? [
                      {
                        key: 'delete',
                        label: 'Delete',
                        icon: <Trash2 size={14} />,
                        onClick: () => setPendingDeleteId(user.id),
                        colorClass: 'bg-red-600',
                      },
                    ]
                  : []
              }
            >
              <div className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
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
                    {user.households.length > 0
                      ? user.households.map((h) => h.name).join(', ')
                      : 'No households'}
                  </p>
                  {!user.isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingPromoteId(user.id);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 text-sm"
                    >
                      Promote
                    </button>
                  )}
                </div>
              </div>
            </SwipeableRow>
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

      {pendingPromoteId != null && (
        <ConfirmDialog
          message="Make this user an admin? They will gain full admin access across every household."
          confirmLabel="Promote"
          onConfirm={handleConfirmPromote}
          onCancel={() => setPendingPromoteId(null)}
        />
      )}
    </div>
  );
}
