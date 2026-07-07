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

type MockUser = {
  id: number;
  organizationId: number;
  email: string;
  role: 'admin' | 'member';
  timezone: string | null;
};

type MockRoom = {
  id: number;
  organizationId: number;
  name: string;
};

function seedMe() {
  return {
    id: 1,
    email: 'preview@example.com',
    role: 'admin' as const,
    organizationId: 1,
    organizationTimezone: 'America/Chicago',
    timezone: 'America/Chicago',
  };
}

function daysAgoIso(now: number, days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function seedRooms(): MockRoom[] {
  return [
    { id: 1, organizationId: 1, name: 'Living Room' },
    { id: 2, organizationId: 1, name: 'Kitchen' },
    { id: 3, organizationId: 1, name: 'Bathroom' },
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

function seedUsers(): MockUser[] {
  return [
    { id: 1, organizationId: 1, email: 'preview@example.com', role: 'admin', timezone: 'America/Chicago' },
    { id: 2, organizationId: 1, email: 'roommate@example.com', role: 'member', timezone: null },
  ];
}

let chores: ChoreWire[] = seedChores();
let users: MockUser[] = seedUsers();
let rooms: MockRoom[] = seedRooms();
let me = seedMe();
let nextChoreId = 4;
let nextUserId = 3;
let nextRoomId = 4;

export function resetMockData(): void {
  chores = seedChores();
  users = seedUsers();
  rooms = seedRooms();
  me = seedMe();
  nextChoreId = 4;
  nextUserId = 3;
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
const USER_ID_RE = /^\/api\/users\/(\d+)$/;
const ROOM_ID_RE = /^\/api\/rooms\/(\d+)$/;
const ORGANIZATION_ID_RE = /^\/api\/organizations\/(\d+)$/;

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

  if (path === '/api/users' && method === 'GET') {
    return jsonResponse({ success: true, data: users });
  }
  if (path === '/api/users' && method === 'POST') {
    const body = parseBody(init);
    const user = { organizationId: 1, timezone: null, ...body, id: nextUserId++ } as MockUser;
    users = [...users, user];
    return jsonResponse({ success: true, data: user }, 201);
  }
  const userIdMatch = path.match(USER_ID_RE);
  if (userIdMatch && method === 'DELETE') {
    const id = Number(userIdMatch[1]);
    if (!users.some((u) => u.id === id)) return jsonResponse({ success: false, error: 'not found' }, 404);
    users = users.filter((u) => u.id !== id);
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
    const room: MockRoom = { id: nextRoomId++, organizationId: 1, name };
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

  const orgIdMatch = path.match(ORGANIZATION_ID_RE);
  if (orgIdMatch && method === 'PATCH') {
    const body = parseBody(init);
    const timezone = String(body.timezone ?? me.organizationTimezone);
    me = { ...me, organizationTimezone: timezone };
    return jsonResponse({
      success: true,
      data: { id: Number(orgIdMatch[1]), name: 'Preview Org', timezone },
    });
  }

  return jsonResponse({ success: false, error: `mock not implemented for ${method} ${path}` }, 501);
}
