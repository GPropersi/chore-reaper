import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Room } from '@customTypes/SharedTypes';
import ConfirmDialog from '../common/ConfirmDialog';
import StatusBanner from '../common/StatusBanner';
import SwipeableRow from '../common/SwipeableRow';
import { apiFetch } from '../../utils/api';

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

type RoomsSectionProps = {
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

function byName(a: Room, b: Room) {
  return a.name.localeCompare(b.name);
}

export default function RoomsSection({ rooms, onRoomsChange }: RoomsSectionProps) {
  const [newRoomName, setNewRoomName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    setError(null);
    const res = await apiFetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json()) as ApiResponse<Room>;
    if (body.success && body.data) {
      onRoomsChange([...rooms, body.data].sort(byName));
      setNewRoomName('');
    } else {
      setError(body.error ?? 'Could not add room');
    }
  }

  function startRename(room: Room) {
    setEditingId(room.id);
    setEditingName(room.name);
    setError(null);
  }

  async function handleRename(id: number) {
    if (editingId !== id) return;
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    const res = await apiFetch(`/api/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json()) as ApiResponse<Room>;
    if (body.success && body.data) {
      const updated = body.data;
      onRoomsChange(rooms.map((r) => (r.id === id ? updated : r)).sort(byName));
    } else {
      setError(body.error ?? 'Could not rename room');
    }
  }

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id == null) return;
    setError(null);
    const res = await apiFetch(`/api/rooms/${id}`, { method: 'DELETE' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      onRoomsChange(rooms.filter((r) => r.id !== id));
    } else {
      setError(body.error ?? 'Could not delete room');
    }
  }

  return (
    <div className="mb-8">
      {error && <StatusBanner tone="warning" message={error} />}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-lg font-semibold">Rooms</h2>
      </div>

      <form onSubmit={handleAddRoom} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="New room name"
          aria-label="New room name"
          // 16px below sm avoids iOS Safari's zoom-on-focus.
          className="bg-gray-700 text-white rounded px-3 py-2 text-base sm:text-sm flex-1"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          Add Room
        </button>
      </form>

      <ul className="space-y-2" data-testid="room-list">
        {rooms.map((room) => (
          <li key={room.id}>
            <SwipeableRow
              actions={[
                {
                  key: 'remove',
                  label: 'Remove',
                  icon: <Trash2 size={14} />,
                  onClick: () => setPendingDeleteId(room.id),
                  colorClass: 'bg-red-600',
                },
              ]}
            >
              <div className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
                {editingId === room.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleRename(room.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(room.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    aria-label={`Rename ${room.name}`}
                    // 16px below sm avoids iOS Safari's zoom-on-focus.
                    className="bg-gray-700 text-white rounded px-2 py-1 text-base sm:text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(room);
                    }}
                    className="text-white text-sm text-left"
                  >
                    {room.name}
                  </button>
                )}
              </div>
            </SwipeableRow>
          </li>
        ))}
      </ul>

      {pendingDeleteId != null && (
        <ConfirmDialog
          message="Remove this room? Rooms still containing chores can't be removed."
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
