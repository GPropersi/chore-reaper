type RoomRow = {
  id: number;
  organization_id: number;
  name: string;
};

export type RoomWire = {
  id: number;
  organizationId: number;
  name: string;
};

export type CreateRoomResult = { status: 'ok'; room: RoomWire } | { status: 'duplicate' };
export type RenameRoomResult =
  { status: 'ok'; room: RoomWire } | { status: 'not_found' } | { status: 'duplicate' };
export type DeleteRoomResult =
  { status: 'ok' } | { status: 'not_found' } | { status: 'in_use'; choreCount: number };

function rowToRoom(row: RoomRow): RoomWire {
  return { id: row.id, organizationId: row.organization_id, name: row.name };
}

export async function getRoomsByOrg(db: D1Database, organizationId: number): Promise<RoomWire[]> {
  const result = await db
    .prepare('SELECT id, organization_id, name FROM rooms WHERE organization_id = ? ORDER BY name')
    .bind(organizationId)
    .all<RoomRow>();
  return result.results.map(rowToRoom);
}

export async function createRoom(
  db: D1Database,
  organizationId: number,
  name: string,
): Promise<CreateRoomResult> {
  let lastRowId: number | bigint;
  try {
    const result = await db
      .prepare('INSERT INTO rooms (organization_id, name) VALUES (?, ?)')
      .bind(organizationId, name)
      .run();
    lastRowId = result.meta.last_row_id;
  } catch (err) {
    if (!String(err).includes('UNIQUE constraint failed')) throw err;
    return { status: 'duplicate' };
  }

  const row = await db
    .prepare('SELECT id, organization_id, name FROM rooms WHERE id = ? AND organization_id = ?')
    .bind(lastRowId, organizationId)
    .first<RoomRow>();
  return { status: 'ok', room: rowToRoom(row!) };
}

export async function renameRoom(
  db: D1Database,
  organizationId: number,
  id: number,
  name: string,
): Promise<RenameRoomResult> {
  const existing = await db
    .prepare('SELECT id, organization_id, name FROM rooms WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<RoomRow>();
  if (!existing) return { status: 'not_found' };

  try {
    await db
      .prepare('UPDATE rooms SET name = ? WHERE id = ? AND organization_id = ?')
      .bind(name, id, organizationId)
      .run();
  } catch (err) {
    if (!String(err).includes('UNIQUE constraint failed')) throw err;
    return { status: 'duplicate' };
  }

  const row = await db
    .prepare('SELECT id, organization_id, name FROM rooms WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<RoomRow>();
  return { status: 'ok', room: rowToRoom(row!) };
}

export async function deleteRoom(
  db: D1Database,
  organizationId: number,
  id: number,
): Promise<DeleteRoomResult> {
  const existing = await db
    .prepare('SELECT id FROM rooms WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<{ id: number }>();
  if (!existing) return { status: 'not_found' };

  const inUse = await db
    .prepare('SELECT COUNT(*) as count FROM chores WHERE room_id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<{ count: number }>();
  if (inUse && inUse.count > 0) {
    return { status: 'in_use', choreCount: inUse.count };
  }

  await db.prepare('DELETE FROM rooms WHERE id = ? AND organization_id = ?').bind(id, organizationId).run();
  return { status: 'ok' };
}

export async function roomBelongsToOrg(db: D1Database, organizationId: number, id: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM rooms WHERE id = ? AND organization_id = ?')
    .bind(id, organizationId)
    .first<{ id: number }>();
  return row != null;
}
