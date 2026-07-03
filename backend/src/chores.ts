import type { Chore } from '../../types/SharedTypes.js';

type ChoreRow = {
  id: number;
  organization_id: number;
  name: string;
  details: string | null;
  room: string;
  date_last_completed: string;
  duration: number;
  frequency: number;
  urgency: 'low' | 'medium' | 'high' | null;
  long_term_task: number;
  version: number;
};

export type ChoreWire = Omit<Chore, 'dateLastCompleted'> & {
  dateLastCompleted: string;
  version: number;
};

export type ChoreInput = Omit<Chore, 'id' | 'dateLastCompleted'> & {
  dateLastCompleted: Chore['dateLastCompleted'] | string;
};

export type MutationResult =
  { status: 'ok'; chore: ChoreWire } | { status: 'conflict' } | { status: 'not_found' };

function rowToChore(row: ChoreRow): ChoreWire {
  return {
    id: row.id,
    name: row.name,
    details: row.details ?? null,
    room: row.room,
    dateLastCompleted: row.date_last_completed,
    duration: row.duration,
    frequency: row.frequency,
    urgency: row.urgency ?? undefined,
    longTermTask: row.long_term_task === 1 ? true : undefined,
    version: row.version,
  };
}

function dateLastCompletedString(value: Chore['dateLastCompleted'] | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function getAllChores(db: D1Database, organizationId: number): Promise<ChoreWire[]> {
  const result = await db
    .prepare('SELECT * FROM chores WHERE organization_id = ? ORDER BY id')
    .bind(organizationId)
    .all<ChoreRow>();
  return result.results.map(rowToChore);
}

export async function createChore(
  db: D1Database,
  organizationId: number,
  input: ChoreInput,
): Promise<ChoreWire> {
  const result = await db
    .prepare(
      `INSERT INTO chores
        (organization_id, name, details, room, date_last_completed, duration, frequency, urgency, long_term_task, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      organizationId,
      input.name,
      input.details ?? null,
      input.room,
      dateLastCompletedString(input.dateLastCompleted),
      input.duration,
      input.frequency,
      input.urgency ?? null,
      input.longTermTask ? 1 : 0,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM chores WHERE id = ? AND organization_id = ?')
    .bind(result.meta.last_row_id, organizationId)
    .first<ChoreRow>();
  return rowToChore(row!);
}

async function fetchByOrg(db: D1Database, organizationId: number, id: number): Promise<ChoreRow | null> {
  const row = await db
    .prepare('SELECT * FROM chores WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<ChoreRow>();
  return row ?? null;
}

async function applyVersionedMutation(
  db: D1Database,
  organizationId: number,
  id: number,
  expectedVersion: number,
  run: () => Promise<D1Result>,
): Promise<MutationResult> {
  const existing = await fetchByOrg(db, organizationId, id);
  if (!existing) return { status: 'not_found' };

  const result = await run();
  if (result.meta.changes === 0) {
    // Row exists in this org — the WHERE clause only excludes on a version mismatch.
    return { status: 'conflict' };
  }

  const row = await fetchByOrg(db, organizationId, id);
  return { status: 'ok', chore: rowToChore(row!) };
}

export async function updateChore(
  db: D1Database,
  organizationId: number,
  id: number,
  input: ChoreInput,
  expectedVersion: number,
): Promise<MutationResult> {
  return applyVersionedMutation(db, organizationId, id, expectedVersion, () =>
    db
      .prepare(
        `UPDATE chores
         SET name = ?, details = ?, room = ?, date_last_completed = ?,
             duration = ?, frequency = ?, urgency = ?, long_term_task = ?,
             version = version + 1
         WHERE id = ? AND organization_id = ? AND version = ?`,
      )
      .bind(
        input.name,
        input.details ?? null,
        input.room,
        dateLastCompletedString(input.dateLastCompleted),
        input.duration,
        input.frequency,
        input.urgency ?? null,
        input.longTermTask ? 1 : 0,
        id,
        organizationId,
        expectedVersion,
      )
      .run(),
  );
}

export async function completeChore(
  db: D1Database,
  organizationId: number,
  id: number,
  dateLastCompleted: string,
  expectedVersion: number,
): Promise<MutationResult> {
  return applyVersionedMutation(db, organizationId, id, expectedVersion, () =>
    db
      .prepare(
        `UPDATE chores
         SET date_last_completed = ?, version = version + 1
         WHERE id = ? AND organization_id = ? AND version = ?`,
      )
      .bind(dateLastCompleted, id, organizationId, expectedVersion)
      .run(),
  );
}

export async function deleteChore(db: D1Database, organizationId: number, id: number): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM chores WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .run();
  return result.meta.changes > 0;
}
