import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ApiResponse, JoinRequest } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';
import SwipeableRow from '../common/SwipeableRow';
import type { Member } from './AdminPanel';

type JoinRequestsSectionProps = {
  // Approving a request creates the member server-side, but this component
  // has no view of AdminPanel's own member list — the parent decides whether
  // (and how) to reflect the new member, e.g. only if it lands in the
  // household currently being viewed.
  onApproved?: (member: Member) => void;
};

export default function JoinRequestsSection({ onApproved }: JoinRequestsSectionProps) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/join-requests')
      .then((res) => res.json())
      .then((body: ApiResponse<JoinRequest[]>) => setRequests(body.data ?? []));
  }, []);

  async function handleApprove(id: number) {
    const res = await apiFetch(`/api/admin/join-requests/${id}/approve`, { method: 'POST' });
    const body = (await res.json()) as ApiResponse<Member | null>;
    if (body.success) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setWarning(body.warning ?? null);
      if (body.data) onApproved?.(body.data);
    }
  }

  async function handleDeny(id: number) {
    const res = await apiFetch(`/api/admin/join-requests/${id}/deny`, { method: 'POST' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (requests.length === 0 && !warning) return null;

  return (
    <div className="mt-8">
      <h2 className="text-white text-lg font-semibold mb-4">Join Requests</h2>
      {warning && (
        <p className="text-amber-400 text-xs mb-2" role="status">
          {warning}
        </p>
      )}
      <ul className="space-y-2" data-testid="join-request-list">
        {requests.map((request) => (
          <li key={request.id}>
            <SwipeableRow
              actions={[
                {
                  key: 'approve',
                  label: 'Approve',
                  icon: <Check size={14} />,
                  onClick: () => handleApprove(request.id),
                  colorClass: 'bg-green-600',
                },
                {
                  key: 'deny',
                  label: 'Deny',
                  icon: <X size={14} />,
                  onClick: () => handleDeny(request.id),
                  colorClass: 'bg-red-600',
                },
              ]}
            >
              <div className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
                <div>
                  <p className="text-white text-sm">{request.requestedEmail}</p>
                  <p className="text-gray-400 text-xs">
                    {request.householdName} · requested by {request.requestedByEmail}
                  </p>
                </div>
              </div>
            </SwipeableRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
