import { useEffect, useState } from 'react';
import type { Chore, Room } from '@customTypes/SharedTypes';
import { useMidnightClock } from '../../hooks/useMidnightClock';
import { useRoomFilter } from '../../hooks/useRoomFilter';
import { orderChores } from '@utils/choreSort';
import ChoreList from './ChoreList';
import ChoreFormModal from '../form/ChoreFormModal';
import ConfirmDialog from '../common/ConfirmDialog';
import StatusBanner from '../common/StatusBanner';
import { useOutbox } from '../../outbox/useOutbox';
import type { ChorePayload, FlushResult, Outbox, OutboxEntry } from '../../outbox/outbox';
import { readChoresCache, writeChoresCache } from '../../cache/choresCache';
import { apiFetch } from '../../utils/api';
import { getDeviceTimezone } from '@utils/deviceTimezone';
import { cityLabel, utcOffsetLabel } from '@utils/timezones';

type ChoreWire = Omit<Chore, 'dateLastCompleted'> & { dateLastCompleted: string; version: number };
type ChoreWithVersion = Chore & { version: number };

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

function wireToChore(wire: ChoreWire): ChoreWithVersion {
  return { ...wire, dateLastCompleted: new Date(wire.dateLastCompleted) };
}

type ChoresViewProps = {
  householdTimezone: string;
  outbox?: Outbox;
  selectedRoom?: string;
  rooms: Room[];
};

function toChorePayload(input: Omit<Chore, 'id'>): ChorePayload {
  return { ...input, dateLastCompleted: input.dateLastCompleted.toISOString() };
}

function pendingCreateToChore(entry: Extract<OutboxEntry, { type: 'create' }>): ChoreWithVersion {
  return {
    ...entry.payload,
    id: entry.tempId,
    dateLastCompleted: new Date(entry.payload.dateLastCompleted),
    version: 0,
  };
}

function mergePendingCreates(chores: ChoreWithVersion[], entries: OutboxEntry[]): ChoreWithVersion[] {
  const existingIds = new Set(chores.map((c) => c.id));
  const pending = entries
    .filter((e) => e.type === 'create' && !existingIds.has(e.tempId))
    .map((e) => pendingCreateToChore(e as Extract<OutboxEntry, { type: 'create' }>));
  return pending.length > 0 ? [...chores, ...pending] : chores;
}

type MutateOptions<T> = {
  optimisticApply: () => void;
  request: () => Promise<Response>;
  onSuccess: (data: T) => void;
  onConflict?: () => void;
  onNetworkFailure?: () => void;
};

async function mutate<T>({
  optimisticApply,
  request,
  onSuccess,
  onConflict,
  onNetworkFailure,
}: MutateOptions<T>) {
  optimisticApply();
  try {
    const res = await request();
    if (res.status === 409) {
      onConflict?.();
      return;
    }
    const body = (await res.json()) as ApiResponse<T>;
    if (body.success && body.data !== undefined) {
      onSuccess(body.data);
    }
  } catch {
    onNetworkFailure?.();
  }
}

export default function ChoresView({
  householdTimezone,
  outbox: outboxProp,
  selectedRoom = 'all',
  rooms,
}: ChoresViewProps) {
  const today = useMidnightClock(householdTimezone);
  // Chore due dates/ordering run entirely on the household's clock (not the
  // viewer's device), so a member whose device disagrees with it should know
  // why a chore might look due/overdue at a time that doesn't match their
  // own local clock.
  const deviceTimezone = getDeviceTimezone();
  const timezoneMismatch = deviceTimezone !== householdTimezone;
  const [chores, setChores] = useState<ChoreWithVersion[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [conflictChoreId, setConflictChoreId] = useState<number | null>(null);

  function handleFlushResults(results: FlushResult[]) {
    for (const result of results) {
      if (result.outcome !== 'success' || result.data === undefined) continue;
      const data = result.data as ChoreWire;
      const { entry } = result;
      if (entry.type === 'create') {
        setChores((prev) => prev.map((c) => (c.id === entry.tempId ? wireToChore(data) : c)));
      } else if (entry.type === 'edit' || entry.type === 'complete') {
        setChores((prev) => prev.map((c) => (c.id === entry.choreId ? wireToChore(data) : c)));
      }
    }
  }

  const { append, entries } = useOutbox(outboxProp, handleFlushResults);

  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    async function renderFromCache() {
      const cached = await readChoresCache<ChoreWire[]>();
      setChores(mergePendingCreates((cached ?? []).map(wireToChore), entries));
      setIsStale(true);
    }

    async function load() {
      if (!navigator.onLine) {
        await renderFromCache();
        return;
      }
      try {
        const res = await apiFetch('/api/chores');
        const body = (await res.json()) as ApiResponse<ChoreWire[]>;
        const data = body.data ?? [];
        setChores(mergePendingCreates(data.map(wireToChore), entries));
        setIsStale(false);
        await writeChoresCache(data);
      } catch {
        await renderFromCache();
      }
    }

    load();
    window.addEventListener('online', load);
    return () => window.removeEventListener('online', load);
    // `entries` is intentionally read only at mount — it merges in whatever was left over from a
    // prior session, not live updates from this one (those already flow through `chores` directly).
    // Depending on it here would re-fetch from the network on every outbox append/removal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleComplete(id: number, date: Date) {
    const payload = { dateLastCompleted: date.toISOString() };
    mutate<ChoreWire>({
      optimisticApply: () =>
        setChores((prev) => prev.map((c) => (c.id === id ? { ...c, dateLastCompleted: date } : c))),
      request: () =>
        apiFetch(`/api/chores/${id}/complete`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: (data) => setChores((prev) => prev.map((c) => (c.id === id ? wireToChore(data) : c))),
      onNetworkFailure: () => append({ type: 'complete', choreId: id, payload }),
    });
  }

  function handleDelete(id: number) {
    mutate<null>({
      optimisticApply: () => setChores((prev) => prev.filter((c) => c.id !== id)),
      request: () => apiFetch(`/api/chores/${id}`, { method: 'DELETE' }),
      onSuccess: () => {},
      onNetworkFailure: () => append({ type: 'delete', choreId: id }),
    });
  }

  function handleAddSubmit(input: Omit<Chore, 'id'>) {
    const tempId = -Date.now();
    const payload = toChorePayload(input);
    setIsAddOpen(false);
    mutate<ChoreWire>({
      optimisticApply: () => setChores((prev) => [...prev, { ...input, id: tempId, version: 0 }]),
      request: () =>
        apiFetch('/api/chores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      onSuccess: (data) => setChores((prev) => prev.map((c) => (c.id === tempId ? wireToChore(data) : c))),
      onNetworkFailure: () => append({ type: 'create', tempId, payload }),
    });
  }

  function handleEditSubmit(input: Omit<Chore, 'id'>) {
    const id = editingId;
    if (id == null) return;
    const baseVersion = chores.find((c) => c.id === id)?.version ?? 1;
    const payload = toChorePayload(input);
    setEditingId(null);
    mutate<ChoreWire>({
      optimisticApply: () => setChores((prev) => prev.map((c) => (c.id === id ? { ...c, ...input } : c))),
      request: () =>
        apiFetch(`/api/chores/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, version: baseVersion }),
        }),
      onSuccess: (data) => setChores((prev) => prev.map((c) => (c.id === id ? wireToChore(data) : c))),
      onConflict: () => setConflictChoreId(id),
      onNetworkFailure: () => append({ type: 'edit', choreId: id, baseVersion, payload }),
    });
  }

  async function handleDiscardConflict() {
    setConflictChoreId(null);
    const res = await apiFetch('/api/chores');
    const body = (await res.json()) as ApiResponse<ChoreWire[]>;
    setChores((body.data ?? []).map(wireToChore));
  }

  function handleKeepEditing() {
    setEditingId(conflictChoreId);
    setConflictChoreId(null);
  }

  const editingChore = chores.find((c) => c.id === editingId);

  const visibleChores = useRoomFilter(chores, selectedRoom);

  return (
    <div>
      {isStale && (
        <StatusBanner
          tone="stale"
          message="Showing cached data — you're offline or the server is unreachable."
        />
      )}
      <div className="flex items-center p-4">
        {timezoneMismatch && (
          <span data-testid="timezone-mismatch-notice" className="text-amber-400 text-xs mr-3">
            Your device is set to {cityLabel(deviceTimezone)} ({utcOffsetLabel(deviceTimezone)}), but this
            household runs on {cityLabel(householdTimezone)} ({utcOffsetLabel(householdTimezone)}) — due dates
            use the household's clock.
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-lg"
        >
          + Add Chore
        </button>
      </div>
      <ChoreList
        chores={orderChores(visibleChores, today, householdTimezone)}
        day={today}
        householdTimezone={householdTimezone}
        isSimulating={false}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onEdit={setEditingId}
      />
      {isAddOpen && (
        <ChoreFormModal
          mode="add"
          defaultRoomId={selectedRoom}
          rooms={rooms}
          onSubmit={handleAddSubmit}
          onCancel={() => setIsAddOpen(false)}
        />
      )}
      {editingChore && (
        <ChoreFormModal
          mode="edit"
          rooms={rooms}
          initialChore={editingChore}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditingId(null)}
        />
      )}
      {conflictChoreId != null && (
        <ConfirmDialog
          message="This chore was changed elsewhere."
          confirmLabel="Discard my changes"
          cancelLabel="Keep editing"
          onConfirm={handleDiscardConflict}
          onCancel={handleKeepEditing}
        />
      )}
    </div>
  );
}
