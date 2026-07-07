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
  room: string;
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

const MOCK_ME = {
  id: 1,
  email: 'preview@example.com',
  role: 'admin' as const,
  organizationId: 1,
  organizationTimezone: 'America/Chicago',
  timezone: 'America/Chicago',
};

function daysAgoIso(now: number, days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function seedChores(): ChoreWire[] {
  const now = Date.now();
  return [
    {
      id: 1,
      name: 'Vacuum',
      room: 'Living Room',
      dateLastCompleted: daysAgoIso(now, 3),
      duration: 20,
      frequency: 7,
      version: 1,
    },
    {
      id: 2,
      name: 'Dishes',
      room: 'Kitchen',
      dateLastCompleted: daysAgoIso(now, 0),
      duration: 5,
      frequency: 1,
      version: 1,
    },
    {
      id: 3,
      name: "Clip Maple's Nails",
      room: 'Bathroom',
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
let nextChoreId = 4;
let nextUserId = 3;

export function resetMockData(): void {
  chores = seedChores();
  users = seedUsers();
  nextChoreId = 4;
  nextUserId = 3;
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

export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (path === '/api/me' && method === 'GET') {
    return jsonResponse(MOCK_ME);
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

  return jsonResponse({ success: false, error: `mock not implemented for ${method} ${path}` }, 501);
}
