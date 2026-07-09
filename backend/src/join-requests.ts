import { adminAddHouseholdMember, type MemberWire } from './members.js';

export type JoinRequestWire = {
  id: number;
  householdId: number;
  requestedEmail: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
};

export type JoinRequestListItem = JoinRequestWire & {
  householdName: string;
  requestedByEmail: string;
};

type JoinRequestRow = {
  id: number;
  household_id: number;
  requested_email: string;
  requested_by: number;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
};

export type CreateJoinRequestResult =
  | { status: 'created'; request: JoinRequestWire }
  | { status: 'already_registered' }
  | { status: 'duplicate' };

export async function createJoinRequest(
  db: D1Database,
  householdId: number,
  rawEmail: string,
  requestedBy: number,
): Promise<CreateJoinRequestResult> {
  const email = rawEmail.trim().toLowerCase();

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{
    id: number;
  }>();
  if (existingUser) {
    return { status: 'already_registered' };
  }

  const existingRequest = await db
    .prepare(
      "SELECT id FROM join_requests WHERE household_id = ? AND requested_email = ? AND status = 'pending'",
    )
    .bind(householdId, email)
    .first<{ id: number }>();
  if (existingRequest) {
    return { status: 'duplicate' };
  }

  const result = await db
    .prepare('INSERT INTO join_requests (household_id, requested_email, requested_by) VALUES (?, ?, ?)')
    .bind(householdId, email, requestedBy)
    .run();

  const row = await db
    .prepare('SELECT id, household_id, requested_email, status, created_at FROM join_requests WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<JoinRequestRow>();

  return { status: 'created', request: toWire(row!) };
}

export async function listPendingJoinRequests(db: D1Database): Promise<JoinRequestListItem[]> {
  const result = await db
    .prepare(
      `SELECT jr.id AS id, jr.household_id AS household_id, jr.requested_email AS requested_email,
              jr.status AS status, jr.created_at AS created_at,
              h.name AS household_name, ru.email AS requested_by_email
       FROM join_requests jr
       JOIN households h ON h.id = jr.household_id
       JOIN users ru ON ru.id = jr.requested_by
       WHERE jr.status = 'pending'
       ORDER BY jr.created_at`,
    )
    .all<JoinRequestRow & { household_name: string; requested_by_email: string }>();

  return result.results.map((row) => ({
    ...toWire(row),
    householdName: row.household_name,
    requestedByEmail: row.requested_by_email,
  }));
}

export type ResolveJoinRequestResult =
  | { status: 'approved'; member: MemberWire | null }
  | { status: 'not_found' }
  | { status: 'already_resolved' };

export async function approveJoinRequest(
  db: D1Database,
  requestId: number,
  resolvedBy: number,
): Promise<ResolveJoinRequestResult> {
  const request = await db
    .prepare(
      'SELECT id, household_id, requested_email, requested_by, status, created_at FROM join_requests WHERE id = ?',
    )
    .bind(requestId)
    .first<JoinRequestRow & { requested_by: number }>();
  if (!request) {
    return { status: 'not_found' };
  }
  if (request.status !== 'pending') {
    return { status: 'already_resolved' };
  }

  // invitedBy is the original requester, preserving household_members'
  // "who invited this person" semantics — resolved_by (below) separately
  // tracks which admin approved the request.
  const added = await adminAddHouseholdMember(
    db,
    request.household_id,
    { email: request.requested_email },
    request.requested_by,
  );

  await db
    .prepare(
      "UPDATE join_requests SET status = 'approved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(resolvedBy, requestId)
    .run();

  return {
    status: 'approved',
    member: added.status === 'already_member' ? null : (added as { member: MemberWire }).member,
  };
}

export async function denyJoinRequest(
  db: D1Database,
  requestId: number,
  resolvedBy: number,
): Promise<'denied' | 'not_found' | 'already_resolved'> {
  const request = await db.prepare('SELECT status FROM join_requests WHERE id = ?').bind(requestId).first<{
    status: 'pending' | 'approved' | 'denied';
  }>();
  if (!request) {
    return 'not_found';
  }
  if (request.status !== 'pending') {
    return 'already_resolved';
  }

  await db
    .prepare(
      "UPDATE join_requests SET status = 'denied', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(resolvedBy, requestId)
    .run();

  return 'denied';
}

function toWire(row: JoinRequestRow): JoinRequestWire {
  return {
    id: row.id,
    householdId: row.household_id,
    requestedEmail: row.requested_email,
    status: row.status,
    createdAt: row.created_at,
  };
}
