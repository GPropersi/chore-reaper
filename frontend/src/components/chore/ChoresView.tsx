import { useEffect, useState } from 'react';
import type { Chore } from '@customTypes/SharedTypes';
import { useMidnightClock } from '../../hooks/useMidnightClock';
import { orderChores } from '@utils/choreSort';
import ChoreList from './ChoreList';

type ChoreWire = Omit<Chore, 'dateLastCompleted'> & { dateLastCompleted: string; version: number };
type ChoreWithVersion = Chore & { version: number };

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

function wireToChore(wire: ChoreWire): ChoreWithVersion {
  return { ...wire, dateLastCompleted: new Date(wire.dateLastCompleted) };
}

type ChoresViewProps = {
  organizationTimezone: string;
  timezone: string;
};

export default function ChoresView({ organizationTimezone, timezone }: ChoresViewProps) {
  const today = useMidnightClock(organizationTimezone);
  const [chores, setChores] = useState<ChoreWithVersion[]>([]);

  useEffect(() => {
    fetch('/api/chores')
      .then((res) => res.json())
      .then((body: ApiResponse<ChoreWire[]>) => setChores((body.data ?? []).map(wireToChore)));
  }, []);

  async function handleComplete(id: number, date: Date) {
    const res = await fetch(`/api/chores/${id}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLastCompleted: date.toISOString() }),
    });
    const body = (await res.json()) as ApiResponse<ChoreWire>;
    if (body.success && body.data) {
      const updated = wireToChore(body.data);
      setChores((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/chores/${id}`, { method: 'DELETE' });
    const body = (await res.json()) as ApiResponse<null>;
    if (body.success) {
      setChores((prev) => prev.filter((c) => c.id !== id));
    }
  }

  return (
    <ChoreList
      chores={orderChores(chores, today)}
      day={today}
      timezone={timezone}
      isSimulating={false}
      onComplete={handleComplete}
      onDelete={handleDelete}
    />
  );
}
