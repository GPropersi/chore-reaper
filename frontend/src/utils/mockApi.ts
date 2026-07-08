// Local, in-memory stand-in for the real backend, used only when the app is
// running on a Cloudflare Pages preview domain (see api.ts). Authenticating
// a preview against the real Access-protected production API turned out to
// be structurally impossible — Access's cross-app SSO redirect flow doesn't
// work for script-initiated fetch() calls, only real browser navigation, and
// that's true regardless of CORS configuration (verified live: even with a
// valid production session, the intermediate SSO redirect hop is
// CORS-blocked because it's Cloudflare's own infrastructure). Rather than a
// broken "half-authenticated" preview, previews get their own disposable,
// fully-interactive fake dataset — no network calls, no shared production
// data, resets on every reload.

type ChoreWire = {
  id: number;
  name: string;
  details?: string | null;
  roomId: number;
  dateLastCompleted: string;
  duration: number;
  frequency: number;
  version: number;
};

type MockMember = {
  id: number;
  householdId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

type MockRoom = {
  id: number;
  householdId: number;
  name: string;
};

function seedMe() {
  return {
    id: 1,
    email: 'preview@example.com',
    timezone: 'America/Chicago',
    memberships: [
      {
        householdId: 1,
        householdName: 'Preview Household',
        householdTimezone: 'America/Chicago',
        role: 'admin' as const,
      },
    ],
    currentHouseholdId: 1,
  };
}

function daysAgoIso(now: number, days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function seedRooms(): MockRoom[] {
  return [
    { id: 1, householdId: 1, name: 'Living Room' },
    { id: 2, householdId: 1, name: 'Kitchen' },
    { id: 3, householdId: 1, name: 'Bathroom' },
  ];
}

function seedChores(): ChoreWire[] {
  const now = Date.now();
  return [
    {
      id: 1,
      name: 'Vacuum',
      roomId: 1,
      dateLastCompleted: daysAgoIso(now, 3),
      duration: 20,
      frequency: 7,
      version: 1,
    },
    {
      id: 2,
      name: 'Dishes',
      roomId: 2,
      dateLastCompleted: daysAgoIso(now, 0),
      duration: 5,
      frequency: 1,
      version: 1,
    },
    {
      id: 3,
      name: "Clip Maple's Nails",
      roomId: 3,
      dateLastCompleted: daysAgoIso(now, 20),
      duration: 10,
      frequency: 18,
      version: 1,
    },
  ];
}

function seedMembers(): MockMember[] {
  return [
    { id: 1, householdId: 1, email: 'preview@example.com', role: 'admin', timezone: 'America/Chicago' },
    { id: 2, householdId: 1, email: 'roommate@example.com', role: 'member', timezone: null },
  ];
}

let chores: ChoreWire[] = seedChores();
let members: MockMember[] = seedMembers();
let rooms: MockRoom[] = seedRooms();
let me = seedMe();
let nextChoreId = 4;
let nextMemberId = 3;
let nextRoomId = 4;

export function resetMockData(): void {
  chores = seedChores();
  members = seedMembers();
  rooms = seedRooms();
  me = seedMe();
  nextChoreId = 4;
  nextMemberId = 3;
  nextRoomId = 4;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body) return {};
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const CHORE_ID_RE = /^\/api\/chores\/(\d+)$/;
const CHORE_COMPLETE_RE = /^\/api\/chores\/(\d+)\/complete$/;
const MEMBER_ID_RE = /^\/api\/members\/(\d+)$/;
const ROOM_ID_RE = /^\/api\/rooms\/(\d+)$/;
const HOUSEHOLD_ID_RE = /^\/api\/households\/(\d+)$/;

export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (path === '/api/me' && method === 'GET') {
    return jsonResponse(me);
  }

  if (path === '/api/chores' && method === 'GET') {
    return jsonResponse({ success: true, data: chores });
  }
  if (path === '/api/chores' && method === 'POST') {
    const body = parseBody(init);
    const chore = { ...body, id: nextChoreId++, version: 1 } as ChoreWire;
    chores = [...chores, chore];
    return jsonResponse({ success: true, data: chore }, 201);
  }

  const completeMatch = path.match(CHORE_COMPLETE_RE);
  if (completeMatch && method === 'PATCH') {
    const id = Number(completeMatch[1]);
    const body = parseBody(init);
    const existing = chores.find((c) => c.id === id);
    if (!existing) return jsonResponse({ success: false, error: 'not found' }, 404);
    const updated = {
      ...existing,
      dateLastCompleted: body.dateLastCompleted as string,
      version: existing.version + 1,
    };
    chores = chores.map((c) => (c.id === id ? updated : c));
    return jsonResponse({ success: true, data: updated });
  }

  const choreIdMatch = path.match(CHORE_ID_RE);
  if (choreIdMatch && method === 'PUT') {
    const id = Number(choreIdMatch[1]);
    const existing = chores.find((c) => c.id === id);
    if (!existing) return jsonResponse({ success: false, error: 'not found' }, 404);
    const body = parseBody(init);
    const updated = { ...existing, ...body, id, version: existing.version + 1 } as ChoreWire;
    chores = chores.map((c) => (c.id === id ? updated : c));
    return jsonResponse({ success: true, data: updated });
  }
  if (choreIdMatch && method === 'DELETE') {
    const id = Number(choreIdMatch[1]);
    if (!chores.some((c) => c.id === id)) return jsonResponse({ success: false, error: 'not found' }, 404);
    chores = chores.filter((c) => c.id !== id);
    return jsonResponse({ success: true, data: null });
  }

  if (path === '/api/members' && method === 'GET') {
    return jsonResponse({ success: true, data: members });
  }
  if (path === '/api/members' && method === 'POST') {
    const body = parseBody(init);
    const member = { householdId: 1, timezone: null, ...body, id: nextMemberId++ } as MockMember;
    members = [...members, member];
    return jsonResponse({ success: true, data: member }, 201);
  }
  const memberIdMatch = path.match(MEMBER_ID_RE);
  if (memberIdMatch && method === 'DELETE') {
    const id = Number(memberIdMatch[1]);
    if (!members.some((m) => m.id === id)) return jsonResponse({ success: false, error: 'not found' }, 404);
    members = members.filter((m) => m.id !== id);
    return jsonResponse({ success: true, data: null });
  }

  if (path === '/api/rooms' && method === 'GET') {
    return jsonResponse({ success: true, data: rooms });
  }
  if (path === '/api/rooms' && method === 'POST') {
    const body = parseBody(init);
    const name = String(body.name ?? '');
    if (rooms.some((r) => r.name === name)) {
      return jsonResponse({ success: false, error: 'A room with this name already exists' }, 409);
    }
    const room: MockRoom = { id: nextRoomId++, householdId: 1, name };
    rooms = [...rooms, room];
    return jsonResponse({ success: true, data: room }, 201);
  }
  const roomIdMatch = path.match(ROOM_ID_RE);
  if (roomIdMatch && method === 'PUT') {
    const id = Number(roomIdMatch[1]);
    const existing = rooms.find((r) => r.id === id);
    if (!existing) return jsonResponse({ success: false, error: 'not found' }, 404);
    const body = parseBody(init);
    const name = String(body.name ?? existing.name);
    if (rooms.some((r) => r.id !== id && r.name === name)) {
      return jsonResponse({ success: false, error: 'A room with this name already exists' }, 409);
    }
    const updated = { ...existing, name };
    rooms = rooms.map((r) => (r.id === id ? updated : r));
    return jsonResponse({ success: true, data: updated });
  }
  if (roomIdMatch && method === 'DELETE') {
    const id = Number(roomIdMatch[1]);
    if (!rooms.some((r) => r.id === id)) return jsonResponse({ success: false, error: 'not found' }, 404);
    const choreCount = chores.filter((c) => c.roomId === id).length;
    if (choreCount > 0) {
      return jsonResponse(
        {
          success: false,
          error: `${choreCount} chore(s) are still in this room — reassign or delete them first`,
        },
        409,
      );
    }
    rooms = rooms.filter((r) => r.id !== id);
    return jsonResponse({ success: true, data: null });
  }

  const householdIdMatch = path.match(HOUSEHOLD_ID_RE);
  if (householdIdMatch && method === 'PATCH') {
    const householdId = Number(householdIdMatch[1]);
    const body = parseBody(init);
    const current = me.memberships.find((m) => m.householdId === householdId);
    const timezone = String(body.timezone ?? current?.householdTimezone ?? 'UTC');
    me = {
      ...me,
      memberships: me.memberships.map((m) =>
        m.householdId === householdId ? { ...m, householdTimezone: timezone } : m,
      ),
    };
    return jsonResponse({ success: true, data: { id: householdId, name: 'Preview Household', timezone } });
  }

  return jsonResponse({ success: false, error: `mock not implemented for ${method} ${path}` }, 501);
}
