import { useEffect, useState } from 'react';
import type { AdminUser, ApiResponse } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';

export default function UsersDirectory() {
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    apiFetch('/api/admin/users')
      .then((res) => res.json())
      .then((body: ApiResponse<AdminUser[]>) => setUsers(body.data ?? []));
  }, []);

  return (
    <div className="mt-8">
      <h2 className="text-white text-lg font-semibold mb-4">Users</h2>

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
            <p className="text-gray-400 text-xs text-right">
              {user.households.length > 0 ? user.households.map((h) => h.name).join(', ') : 'No households'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
