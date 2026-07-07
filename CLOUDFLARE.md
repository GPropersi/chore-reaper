# Chore Reaper: Architecture (Cloudflare, Free Tier)

Multi-tenant, cloud-hosted chore/task tracker. This repo is a one-time seed from a sibling project
(`chores4irl` — a single-household, Raspberry Pi kiosk version of the same idea) — the reference material
in `reference/express-backend/` and the components under `frontend/src/` came from there, but this repo
has no ongoing dependency on it. Built cloud-native from the ground up rather than adapted in place.

## Requirements

1. Cloud-based database
2. User-based authentication, no self-registration — users are added manually by an admin
3. Configurable timezones — one org-level timezone drives scoring consistently for every viewer in
   that org; each user's own timezone controls only how dates/times are _displayed_ to them, never the
   underlying score (see §5 for why per-viewer scoring was considered and rejected)
4. Organizations to group users by
5. Cloud-based frontend/backend
6. Low-maintenance, low-complexity sync for frontend devices that go offline
7. No app-operated email sending — Cloudflare's own email (e.g. Access's One-Time PIN) is acceptable,
   since it requires no email infrastructure, vendor, or code on the app's side
8. Cloudflare-first; free tier only unless a requirement genuinely cannot be met on it

## Summary of the stack

| Layer             | Choice                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Backend host      | Cloudflare Workers + [Hono](https://hono.dev/)                                                    |
| Database          | Cloudflare D1 (SQLite-based)                                                                      |
| Frontend host     | Cloudflare Pages                                                                                  |
| Auth              | Cloudflare Access (Zero Trust), One-Time PIN login — no OAuth account required, no app-sent email |
| Real-time updates | Polling (Durable Objects as a later, optional upgrade)                                            |
| Offline sync      | Client-side outbox + optimistic-concurrency `version` column                                      |
| Migrations        | Drizzle (or raw SQL) + Wrangler D1 migrations                                                     |

Every piece maps to a Cloudflare free-tier product; no paid step is required for the core design.

## Repository layout

```
chore-reaper/
  backend/                    Workers + Hono + D1
  frontend/                   React + Vite, Cloudflare Pages target
  types/                      SharedTypes.d.ts — the Chore/ApiResponse contract, both sides import from here
  reference/express-backend/  Read-only reference copies of the sibling project's Express+SQLite backend
                               (chores.ts, app.ts, db.ts) — a porting reference for Phase 1, not part of
                               the buildable app. Not kept in sync with the sibling project going forward.
```

`frontend/src/components/`, `frontend/src/utils/` (`choreSort.ts`, `choreBarMath.ts`), and
`frontend/src/hooks/` (`useMidnightClock.ts`, `useRoomFilter.ts`) are seeded from the sibling project's
equivalents as starting points, expected to diverge from here — routing, an admin panel, auth-aware data
fetching, and the offline outbox all get added on top. `useChoreEvents.ts` (the sibling project's SSE
hook) was deliberately not carried over — this design defaults to polling instead (see §7).

## 1. Compute: Workers + Hono

Cloudflare Workers (free tier: 100,000 requests/day). Workers are a fetch-handler model on V8 isolates,
not a long-running process, so the API is built on **Hono** — a lightweight router built for Workers with
an Express-like API (`app.get('/api/chores', handler)`). `reference/express-backend/app.ts` shows the
route shapes to port; the port is mechanical, not a rewrite.

**Free-tier sanity check**: 20 organizations x 4 people, each polling every 30s during ~2 active hours/day,
is roughly 19,000 requests/day — under a fifth of the 100k/day cap. Comfortable headroom, not a squeeze.

## 2. Database: Cloudflare D1

**D1** is Cloudflare's serverless SQLite. `reference/express-backend/chores.ts`'s query shape
(`db.prepare(...).all()`) is close enough to D1's API (`env.DB.prepare(...).bind(...).all()`) that
porting is mechanical.

Free tier is generous at this scale — roughly 5GB storage, millions of reads/day, ~100k writes/day
(**verify exact current numbers on Cloudflare's pricing page before committing** — these limits shift
over time). Chore mutations are a handful per user per day, so the write quota is not a real constraint.

**Migrations**: Wrangler has built-in D1 migration support (`wrangler d1 migrations create/apply`), or
pair it with Drizzle's D1 driver for a type-safety layer.

## 3. Auth: Cloudflare Access, One-Time PIN by default

**Cloudflare Access (Zero Trust)** sits in front of the app and handles authentication entirely.
Configure it with **One-Time PIN (OTP) as the default login method**, and optionally enable Google/GitHub
OAuth alongside it — Access supports multiple login methods on the same Application simultaneously, so
this is a config toggle, not an architecture fork; users pick whichever's more convenient at the login
screen.

OTP resolves the "no OAuth account required" goal directly: a user enters their email, Cloudflare's own
infrastructure sends a one-time code to it, they enter the code, Access issues the session. No Google or
GitHub account needed — just an email address, which everyone already has. The email is sent by
**Cloudflare**, not the app — no email infrastructure, vendor, or code lives in this codebase, which is
what requirement #7 is actually after. The one practical cost: OTP adds live friction at login — the
person needs to check their inbox and retrieve a code each time a session expires, unlike OAuth's
often-one-click flow if they're already logged into Google in that browser.

Either way, the backend never touches a password: Cloudflare injects a signed JWT
(`Cf-Access-Jwt-Assertion`) once a user authenticates, the Worker validates it against Cloudflare's
public JWKS, and reads the verified email out of it. This deletes an entire category of code a
conventional design would need — no password hashing, no session cookies, no login page, no
invite-token generation or expiry.

### Provisioning a user (no registration, admin-only, no email)

1. Admin adds the person's email to a Cloudflare Access policy allow-list — via the Cloudflare
   dashboard, or optionally via Cloudflare's Zero Trust API if an "add user" button is later built into
   the app's own admin UI.
2. Admin creates the corresponding `users` row (email, `organization_id`, role, timezone) in D1.

Both steps are manual; neither is self-serve registration. Login itself may send an email (Cloudflare's
OTP code), but nothing in this codebase sends, queues, or manages one. Free tier covers on the order of
dozens of seats (historically ~50 — **verify the current figure**), which comfortably covers a handful
of organizations, not a public SaaS.

**Open decision**: Access policies are naturally managed at the Cloudflare-account level, not per-tenant.
The low-complexity default is to keep **all user provisioning centralized to the platform operator**,
rather than letting each org's own admin self-serve-add teammates. Delegating that down would require a
scoped wrapper around Cloudflare's Zero Trust API per org — real added complexity for a feature not
explicitly required. Decide explicitly whether "admin" in requirement #2 means the platform operator or
each org's own admin — the free/low-complexity path strongly favors the former. See §8 for building this
as an in-app admin panel instead of operating entirely through the Cloudflare dashboard and direct D1
access.

Roles (`admin` / `member`) live in the app's own `users` table and are enforced by Worker-side
middleware after validating the Access JWT.

**Email is the only link between the two systems above** — Access's allow-list and D1's `users` row
share no ID, just an email string, so a casing mismatch between them (`Jane@Company.com` in one,
`jane@company.com` in the other) would otherwise let someone past Access's own gate only to get a 401
from the app. Email is normalized (trimmed + lowercased) at every point it's written or compared: the
verified email pulled off the JWT (`accessAuth` middleware), and every `users` row insert
(`createUser`, `bootstrap-admin.ts`) — so the match is case-insensitive by construction rather than by
convention.

## 4. Organizations

```
organizations
  id, name, timezone, created_at

users
  id, organization_id (FK), email (unique, verified via Access JWT),
  role ('admin' | 'member'), timezone (IANA string, nullable -> falls back to organizations.timezone),
  created_at, invited_by (nullable)
```

`organizations.timezone` is authoritative for scoring (see §5) — not just a provisioning default.
`users.timezone` is display-only: it controls how dates/times are rendered to that person, never what
the underlying urgency score is.

- One user, one org — no multi-org membership. Matches the actual mental model (an org = a household or
  team) and avoids "which org am I acting as right now" state that nothing here needs.
- Org creation stays outside the app entirely, consistent with "no registration system" — the platform
  operator creates a new org plus its first admin user via a small internal script or an
  operator-only route, not a public flow.
- **Every query must be scoped `WHERE organization_id = req.user.organizationId`.** This is the single
  most security-critical line of the whole design — a missed org filter on any query is a
  cross-tenant data leak. Worth a lint rule or a query-wrapper helper that makes the unscoped query
  impossible to write by accident.

## 5. Timezone: org-level for scoring, per-user for display

The urgency-scoring algorithm (`choreSort.ts`) computes `differenceInDays(startOfDay(today),
startOfDay(dateLastCompleted))` — a count of **local-midnight crossings**, not a fixed elapsed duration.
That's a meaningfully different quantity than "hours since completed": elapsed duration between two
absolute instants is the same number for every observer, anywhere; "what calendar day is it" is not —
it's relative to whichever timezone you're asking in.

If each viewer's _own_ timezone drove that calculation, two org members in different timezones could get
genuinely different urgency scores for the same chore at the same real moment — not a display
difference, an actual disagreement about how overdue something is. **The fix: one canonical timezone per
org, used for scoring by every viewer.** `organizations.timezone` drives `useMidnightClock`'s "today" for
_every_ user in that org, regardless of where they personally are. This preserves the human "did we skip
a day" framing calendar-day math is chosen for in the first place, while guaranteeing every viewer
computes the identical score for the identical chore — because everyone's "today" is now the same
"today."

`users.timezone` still exists and is still configurable per person — but its only job is **display**:
formatting a completion timestamp, or a future "due at" label, in that specific viewer's own local
clock. It has no effect on score, sort order, or overdue/urgency status.

### Implementation

- `GET /api/me` (§8) returns both: `organizationTimezone` (scoring-authoritative, from
  `organizations.timezone`) and `timezone` (display-only, that user's own, falling back to
  `organizationTimezone` if unset).
- `useMidnightClock(timezone: string)` is called with `organizationTimezone`, not the viewing user's
  personal `timezone` — computing local midnight via `date-fns-tz` (`toZonedTime`/`fromZonedTime`)
  against the org's reference zone, never the browser's ambient `new Date()` and never the individual
  viewer's own setting.
- `choreSort.ts` and `choreBarMath.ts` need no changes from their seeded form — they already take
  `today`/`day` as explicit parameters; only _which_ timezone the caller resolves "today" from matters.
- Anywhere a timestamp is rendered for display only (e.g. `CompletionInfo`'s "X days ago" / date text) —
  format using the _viewing user's_ own `timezone`, separately from the scoring path above.

Store `dateLastCompleted` as an absolute instant (D1 `TEXT` ISO-8601 or equivalent).

## 6. Frontend: Cloudflare Pages

Free, generous, direct fit for the Vite/React build. No reverse proxy or static-file server needed —
Pages handles that layer entirely.

## 7. Real-time updates and offline sync

Workers are stateless per-request isolates — there is no shared-memory event bus to hold open SSE
connections the way a long-running Node process could. The Cloudflare-native tool for real push is
**Durable Objects**, but their free-tier availability and limits are the murkiest part of the current
Cloudflare stack and should be verified directly before relying on them.

**Default to plain polling instead.** For a task list that changes a handful of times a day, the latency
win of push-based updates over a short poll interval isn't worth the added infrastructure (a dedicated
SSE route, a pub/sub bus, client-side connection-lifecycle handling). Polling is simpler, unambiguously
within the free tier (ordinary Worker requests — see the request-volume math in §1). Durable Objects
remain a documented upgrade path if real push is wanted later.

### Local-first frontend (surviving an outage)

There's a hard ceiling worth stating plainly: the moment the app needs anything from the actual
database, it needs Cloudflare reachable — Workers and D1 only exist on the internet. No frontend
technique conjures a live, writable database when the real one lives in the cloud. What's achievable is
**offline-tolerant**, not offline-capable-forever.

Within that ceiling, two additions make a real difference:

- **A service worker caching the built app shell** (HTML/JS/CSS), so the app loads instantly even with
  zero connectivity instead of a blank screen. `vite-plugin-pwa` generates most of this without much
  hand-written code.
- **IndexedDB caching of the last-fetched chore list**, rendered immediately on load if offline and
  clearly marked as stale ("showing cached data as of...").

Together with the offline outbox below, these handle the realistic failure mode — a wifi blip, a brief
ISP outage — well. They do not handle a multi-day outage with full read/write against fresh org-wide
data, or a brand-new device that's never once connected; closing that gap fully would mean a true
local-first database (IndexedDB as the primary read/write store, syncing opportunistically to D1 — the
RxDB/ElectricSQL/CRDT family of approach), which is a real complexity escalation against the
low-complexity requirement everywhere else in this design. Defer it unless surviving a multi-day outage
with full functionality turns out to be a hard requirement rather than a nice-to-have.

**Offline outbox**:

- A service worker handles the app _shell_ (above); it does not need full PWA install semantics or the
  Background Sync API. `navigator.onLine` plus `online`/`offline` event listeners, driving a
  `localStorage`-persisted outbox, covers the write side (device loses wifi, comes back) with far less
  surface area than background sync would.
- **Outbox shape**: an array of `{id: uuid, type, choreId?, payload, baseVersion, createdAt}` persisted
  to `localStorage` so it survives a reload. Flush in order on reconnect.
- **Conflict resolution**: add a `version` integer column to `chores` in D1, bumped on every write. Each
  queued mutation carries the `baseVersion` it assumed. On replay, if the server's current `version` has
  moved past `baseVersion`, reject with 409 — no merge logic. The client surfaces "this was changed
  elsewhere, here's the latest" and drops the stale mutation.
- **Idempotency**: the client-generated UUID doubles as an idempotency key, so a mutation that actually
  landed but whose ack was lost on disconnect isn't double-applied on retry.

## 8. Admin panel

A tab inside the app, not operated entirely through the Cloudflare dashboard and direct D1 access.

### Public URL access

Cloudflare Access is applied at Cloudflare's edge, in front of a normal public hostname — DNS resolves,
TLS terminates, anyone can reach the URL. Access intercepts every request before it reaches the
Worker/Pages content: unauthenticated or non-allow-listed visitors hit Cloudflare's own login /
access-denied page and never touch the app or its data. This is what makes "share a URL" work with no
VPN, no Tailscale, no IP allow-listing on the user's end — just an OTP or OAuth login. It's a one-time
setup at the Cloudflare account level (one Zero Trust "team," one Access "application" for the
hostname); onboarding a new organization is adding their users' emails to the same policy, not standing
up a new Access instance. Rejected requests are also stopped at Cloudflare's edge before the Worker
runs, so unauthenticated traffic doesn't count against the Workers free-tier request quota.

### What building it needs

- **Backend routes**: `GET/POST/PATCH/DELETE /api/users`, gated by middleware that checks
  `role === 'admin'` server-side — not just hidden client-side.
- **Frontend view**: an "Admin" entry in `NavBar`, conditionally rendered only when the logged-in
  user's role is admin, opening a panel with a user list (email, role, timezone) and an add/remove-user
  form. Reuses existing patterns — `FormField`, the modal shell `ChoreFormModal` uses, `ConfirmDialog`
  for removing a user — so the net-new UI surface is small.
- **A `GET /api/me` endpoint** (`{id, email, role, organizationId, organizationTimezone, timezone}`), the
  one genuinely new piece both this and §5 (timezone) depend on — build once, consume from both.
- **Routing**: the seeded components have none — a single view, no navigation. This is the first place
  routing (React Router, or something lighter like Wouter) actually becomes necessary — worth adding now
  since a real "access denied" / logged-out state is also needed, which routing makes cleaner than ad hoc
  conditionals.

### The half-onboarding pitfall

If the "add user" form only writes the D1 `users` row and doesn't also call Cloudflare's Zero Trust API
to add the email to the Access allow-list, the admin has only half-onboarded that person — they're in
the database but still can't log in until the operator manually adds them in the Cloudflare dashboard.
Two options, pick one deliberately:

- **Fully self-service**: wire the Zero Trust API call into the same submit action. The Worker then
  holds a Cloudflare API token scoped to modify who can reach the app — a real secret with real blast
  radius. Store it as a Worker secret, scope it as tightly as Cloudflare allows.
- **Stay manual**: keep Access provisioning a dashboard step, but say so explicitly in the UI ("this
  person also needs to be granted access — contact the operator"). Silently doing neither is the failure
  mode to avoid.

**Went with fully self-service** (`backend/src/access-allowlist.ts`, wired into `POST /api/users`). The
central constraint that shaped it: this account's Zero Trust team (`urls4irl.cloudflareaccess.com`) is
shared with the sibling `urls4irl` project, and Cloudflare Access API-token permissions can't be scoped
to a single Application — a token capable of editing this app's allow-list can, in principle, reach
`urls4irl`'s Access Application too. Mitigated by: no new HTTP route (the grant only ever fires as a side
effect of the existing admin-gated `POST /api/users`, so half-onboarding can't be structurally
reintroduced); a narrowly-permissioned token (`Access: Policies Edit`, not `Access: Apps and Policies
Edit`); read-then-append-only policy updates that fail closed on any unexpected shape; add-only, never
remove (see below); and a periodic manual Cloudflare Audit Log review as the detective control for what
token scoping alone can't close.

**Multi-tenancy note**: `orgScope` scopes D1 writes to the admin's own organization, but the Access
allow-list itself is Application-wide, not org-scoped — an admin of _any_ org in this app can grant
Access-level login for the whole app, not just their own org. This is correct today (Access is a
perimeter gate for the app, not per-org) and isn't a new escalation versus the fully-manual process this
replaces — just worth knowing if this app ever supports many organizations.

**Verified live in production** (2026-07-07): the policy targeted is a _reusable_ Cloudflare Access
policy (`"reusable": true`), which must be edited via the standalone
`/accounts/{account_id}/access/policies/{policy_id}` endpoint — the app-nested
`/access/apps/{app_id}/policies/{policy_id}` path can read a reusable policy but isn't the documented way
to write to one. `ACCESS_APP_ID` turned out to be unnecessary for this reason and was dropped entirely.
`ACCESS_AUD`, `CF_ACCOUNT_ID`, and `ACCESS_POLICY_ID` are all set as Worker secrets
(`wrangler secret put`), not `wrangler.toml` vars — nothing Cloudflare-account-specific is committed to
this public repo. The Access Application was rebuilt from scratch during this rollout (fresh audience
tag, hostname/login-method/session-duration reconfigured, the existing reusable allow-list policy
re-attached), since the original `ACCESS_AUD` had already been committed to git history earlier in
development. Live end-to-end grant confirmed working against the real Cloudflare API.

**Deliberately add-only, never remove**: removing an allow-list entry doesn't revoke already-issued
bearer JWTs anyway (session duration here is 6–12 months, see Phase 0 above) — an automated "remove"
would risk security theater (an admin believing access was cut off when it wasn't) on top of being able
to lock out the household if it went wrong. Revocation stays a deliberate, manual dashboard step.

## What this replaces (vs. a conventional cloud stack)

| Layer         | A conventional cloud plan                 | This plan (Cloudflare, free)                          |
| ------------- | ----------------------------------------- | ----------------------------------------------------- |
| Backend host  | Fly.io/Render, long-running Node          | Cloudflare Workers + Hono                             |
| Database      | Managed Postgres                          | Cloudflare D1 (SQLite)                                |
| Frontend host | Vercel/Netlify/CDN                        | Cloudflare Pages                                      |
| Auth          | Password + session cookie + email invites | Cloudflare Access (OTP/OAuth), no email, no passwords |
| Real-time     | SSE via an event bus                      | Polling (Durable Objects as a later upgrade)          |
| Offline sync  | Outbox + `version` field                  | Same                                                  |
| Migrations    | Drizzle + Postgres driver                 | Drizzle (or raw SQL) + D1/Wrangler migrations         |

## Suggested build order

1. **Data + auth foundation** — D1, migrations, `organizations`/`users` tables, Cloudflare Access
   (OTP/OAuth) wired in front of the Worker, org-scoped query middleware, `GET /api/me`, and the admin
   panel UI (§8) so user management doesn't stay a manual operator task past the first organization.
2. **Per-user timezone** — targeted implementation in `useMidnightClock.ts`.
3. **Cloud deploy** — Workers + Pages + D1, custom domain, TLS.
4. **Offline outbox + `version` field** — benefits from auth/org/timezone already being stable, and is
   the most novel piece of the whole design.

See `CLOUD_PLAN.md` for the detailed, TDD'd task breakdown.
