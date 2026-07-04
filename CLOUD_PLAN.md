# Chore Reaper: Execution Plan

Execution-focused companion to `CLOUDFLARE.md` (design/rationale). This document is the how and in what
order — it is self-contained enough to execute without additional context.

## Picking this up cold

This repo was seeded once from a sibling project (`chores4irl`, a single-household kiosk app) — the
components under `frontend/src/`, the utils/hooks, `types/SharedTypes.d.ts`, and the reference backend
in `reference/express-backend/` all came from there. There is no ongoing dependency on that project;
nothing here needs it to exist, and reference material is not kept in sync with it going forward.

Planning is complete, implementation has not started. Read `CLOUDFLARE.md` first if a "why" is unclear;
this document should otherwise be sufficient to execute on its own.

**The split**: every task below is tagged **[A]** or **[B]**.

- **Part A — Code.** Everything tagged `[A]` can be built and fully test-verified with zero Cloudflare
  account interaction — no live D1, no live Access, no dashboard. Wrangler's local dev mode emulates
  Workers + D1 entirely locally (Miniflare-backed); auth is tested against a local test key pair, never
  real Access. Do all of Part A first, get it green, then stop.
- **Part B — Cloudflare setup & cutover.** Everything tagged `[B]` requires a real Cloudflare account:
  dashboard configuration, real D1/Pages/Access provisioning, swapping placeholder config for real
  values, deploying, and live verification. Start Part B only once Part A is fully green.

**Definition of done for Part A**: every `[A]` checkbox checked, all tests in `backend/` and `frontend/`
passing, `wrangler dev` boots locally against the local D1 binding. At that point the code is
deployable — it just hasn't been deployed.

Each task that carries logic gets a TDD cycle (**RED** — the failing test to write first, **GREEN** — the
minimal implementation that passes it, **REFACTOR** — cleanup once green, only where there's something
worth doing). Tasks that are pure configuration, dashboard clicking, or manual verification get a
**Verify** step instead of a forced red/green — that's most of Part B.

## Testing stack

| Layer                          | Tooling                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker/Hono unit + integration | `vitest` + `@cloudflare/vitest-pool-workers` — runs against the real Workers runtime (Miniflare-backed), including a local D1 binding, so tests exercise real D1 SQL rather than a mock |
| Frontend units/hooks/utils     | `vitest`                                                                                                                                                                                |
| Frontend components            | `vitest` + `@testing-library/react`                                                                                                                                                     |
| IndexedDB in tests             | `fake-indexeddb` polyfill under the vitest/jsdom environment                                                                                                                            |
| E2e                            | Playwright, with `page.context().setOffline()` for offline scenarios and `page.route()` interception for conflict/error scenarios                                                       |

**Verify current package names/APIs before scaffolding** — `@cloudflare/vitest-pool-workers` and the D1
local-testing story are actively evolving; confirm the current recommended setup against Cloudflare's
docs at implementation time rather than trusting this list as gospel.

## Conventions

Fixed decisions referenced throughout — set once here rather than re-decided per task.

- **D1 binding name**: `env.DB`, declared in `backend/wrangler.toml`'s `[[d1_databases]]` block.
- **Access config is env-driven, never hardcoded**: `ACCESS_JWKS_URL` and `ACCESS_AUD` are read from
  environment/wrangler config, not literals in code. This is the single fact that makes the Part A/B
  split possible — Part A code reads these vars and is tested against local/fixture values; Part B's only
  job for this piece is setting the real values.
  - Real values, for Part B: JWKS lives at `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs`;
    `ACCESS_AUD` is the Application's Audience Tag, found in the Access dashboard for the specific
    Application created in Phase 0 [B].
- **Test JWTs**: signed with a static test key pair generated once and checked into
  `backend/test/fixtures/` (or generated at test-setup time — either is fine, pick one and be
  consistent). Tests and local dev never talk to real Access.
- **First-admin bootstrap**: a script, `backend/scripts/bootstrap-admin.ts`, takes an org name and an
  admin email as arguments and inserts one `organizations` row plus one `users` row with
  `role: 'admin'` directly via the D1 binding — the only way a `users` row can exist before any admin
  routes are usable (see Phase 1.8). Written and tested in Part A against local D1; run for real against
  production D1 in Part B.

---

## Phase 0 — Project scaffolding

- [x] **[A]** Root `package.json` with `workspaces: ["backend", "frontend"]`; `backend/package.json` and
      `frontend/package.json`
- [x] **[A]** `backend/`: `wrangler init`; add `wrangler.toml` with a `[[d1_databases]]` binding
      named `DB` (see Conventions) using a placeholder `database_id` — sufficient for local emulation
- [x] **[A]** `backend/`: install Hono, `jose` (JWT verification), `@cloudflare/vitest-pool-workers`
- [x] **[A]** `frontend/`: scaffold via Vite (React + TypeScript); install Tailwind, `date-fns`,
      `date-fns-tz`, `react-swipeable` — the seeded components under `frontend/src/components/` already
      assume these
- [x] **[A]** Generate the test key pair and `.dev.vars`/test-env entries for `ACCESS_JWKS_URL`/
      `ACCESS_AUD` per Conventions
- [x] **[A] Verify**: `wrangler dev` boots `backend/` locally with the `DB` binding reachable; a placeholder
      Worker route returns 200
- [ ] **[B]** `wrangler d1 create chore-reaper` (or equivalent); replace the placeholder `database_id` in
      `wrangler.toml` with the real one
- [ ] **[B]** Create a Cloudflare Pages project pointed at `frontend/`'s build output
- [ ] **[B]** Stand up the Zero Trust team + an Access Application for the chosen hostname
- [ ] **[B]** Configure Access login methods: One-Time PIN as default, Google/GitHub OAuth as optional
      secondary
- [ ] **[B]** Record the real `ACCESS_JWKS_URL`/`ACCESS_AUD` for this Application (see Conventions) —
      not yet wired into any environment; that happens per-task below as each piece goes live

---

## Phase 1 — Data + auth foundation (`CLOUDFLARE.md` §2–§4, §8)

### 1.1 D1 schema & migrations

- [x] **[A]** Write migration `0001_init.sql`: `organizations`, `users`, `chores` (with
      `organization_id`, `version` integer default 1), matching the shape in `CLOUDFLARE.md` §4 plus the
      `version` column from §7
- [x] **[A] Verify**: `wrangler d1 migrations apply` succeeds against the local D1 binding; `wrangler d1
execute --command "SELECT * FROM chores"` returns an empty, correctly-shaped result
- [ ] **[B]** Apply the same migration to the real remote D1 database created in Phase 0

### 1.2 Chore data-access layer (port `reference/express-backend/chores.ts` into `backend/src/chores.ts`, D1-backed)

- [x] **[A] RED**: `getAllChores(db, organizationId)` returns only chores belonging to that org, given a
      D1 seeded with chores in two different orgs
- [x] **[A] GREEN**: implement `getAllChores` with `WHERE organization_id = ?`
- [x] **[A] RED**: `createChore(db, organizationId, input)` inserts with `version = 1` and returns the
      row with a D1-assigned id
- [x] **[A] GREEN**: implement `createChore`
- [x] **[A] RED**: `updateChore(db, organizationId, id, input, expectedVersion)` succeeds and increments
      `version` by 1 when `expectedVersion` matches the row's current version
- [x] **[A] RED**: `updateChore(...)` returns a distinguishable "conflict" result (not a thrown error)
      when `expectedVersion` doesn't match the row's current version
- [x] **[A] RED**: `updateChore(...)` returns `null`/not-found when the id doesn't exist _or_ belongs to
      a different `organizationId` — same result for both cases, so a caller can't distinguish
      "doesn't exist" from "exists in someone else's org" (see 1.5's cross-org test — this is the
      data-layer half of that guarantee)
- [x] **[A] GREEN**: implement `updateChore` with the version check folded into the `WHERE` clause
      (`WHERE id = ? AND organization_id = ? AND version = ?`) so the check is atomic, not
      read-then-write
- [x] **[A] RED**: `completeChore` and `deleteChore` — same org-scoping and (for complete) version-check
      pattern as above
- [x] **[A] GREEN**: implement both
- [x] **[A] REFACTOR**: extract the `WHERE id = ? AND organization_id = ?` fragment shared across all
      four mutators into one helper, so org-scoping can't be accidentally omitted from a future query

### 1.3 Hono route port (`reference/express-backend/app.ts` into `backend/src/app.ts`)

- [x] **[A] RED**: `GET /api/chores` returns 200 and the org-scoped list for an authenticated request
      (using a test double for the auth middleware at this stage — see 1.4)
- [x] **[A] GREEN**: implement the route calling the 1.2 functions
- [x] **[A] RED**: `POST /api/chores` with missing required fields returns 400 (port the existing
      validation from the reference `app.ts`)
- [x] **[A] RED**: `POST /api/chores` with valid input returns 201 and the created chore
- [x] **[A] RED**: `PUT /api/chores/:id` with a stale `version` in the body returns 409, not 200
- [x] **[A] RED**: `PATCH /api/chores/:id/complete` and `DELETE /api/chores/:id` — port existing
      validation and not-found behavior from the reference `app.ts`
- [x] **[A] GREEN**: implement each route
- [x] **[A] REFACTOR**: confirm every route handler is wrapped by the org-scoping middleware (1.5)
      rather than each individually re-deriving `organizationId` — one place to get this right, not five

### 1.4 Access JWT validation middleware

- [x] **[A] RED**: `ACCESS_JWKS_URL` and `ACCESS_AUD` are read from env/config at request time, not
      imported as literals — a test that swaps the configured JWKS URL to a second fixture and confirms
      the middleware validates against _that_ one proves this isn't hardcoded
- [x] **[A] RED**: a request with a valid `Cf-Access-Jwt-Assertion` signed by the test key pair (per
      Conventions) resolves `c.get('user')` with the correct verified email
- [x] **[A] RED**: a request with an expired JWT is rejected with 401
- [x] **[A] RED**: a request with a JWT signed by the wrong key is rejected with 401
- [x] **[A] RED**: a request with no `Cf-Access-Jwt-Assertion` header is rejected with 401
- [x] **[A] GREEN**: implement using `jose`'s JWKS-fetch-and-verify helpers, caching the JWKS response
      per Cloudflare's documented cache guidance
- [x] **[A] REFACTOR**: confirm JWKS fetch failures fail closed (reject the request) rather than open

### 1.5 Org-scoping / authorization middleware — highest-stakes code in this repo

- [x] **[A] RED**: given a verified email from 1.4, middleware looks up the corresponding `users` row and
      attaches `{id, organizationId, role, timezone}` to the request context
- [x] **[A] RED**: a verified email with no matching `users` row is rejected with 401 (not 500) — an
      Access-allow-listed email that was never provisioned into the app's own `users` table must not
      silently pass through
- [x] **[A] RED (the critical one)**: end-to-end through a full route — a user authenticated as org A,
      requesting a chore id that belongs to org B, gets 404. Not 403 — 404, so the response doesn't
      confirm the id exists at all
- [x] **[A] RED**: the same user, listing `GET /api/chores`, never receives any org B chore in the
      response, seeded alongside org A chores in the same test
- [x] **[A] GREEN**: implement the middleware; wire it in front of every `/api/chores/*` and
      `/api/users/*` route
- [x] **[A] RED**: `role !== 'admin'` on `/api/users/*` routes returns 403
- [x] **[A] GREEN**: implement the role check
- [x] **[A] REFACTOR**: considered — deferred a custom lint rule (no lint config exists yet in this fresh
      repo; adding one is a separate scope decision). In its place, every `chores.ts` mutator already
      requires `organizationId` as a mandatory parameter and funnels the `WHERE` clause through the shared
      `fetchByOrg`/`applyVersionedMutation` helpers (1.2), and route handlers only ever read
      `organizationId` from `c.var` (set once by `orgScope`), never re-derived per-route — the same
      structural guarantee a query-builder wrapper would give, without new infra.

### 1.6 `GET /api/me`

- [x] **[A] RED**: returns `{id, email, role, organizationId, organizationTimezone, timezone}` for the
      authenticated user
- [x] **[A] GREEN**: implement, reusing the context attached in 1.5

### 1.7 Admin user-management routes

- [x] **[A] RED**: `POST /api/users` as a non-admin returns 403
- [x] **[A] RED**: `POST /api/users` as an admin creates a `users` row scoped to the admin's own
      `organization_id` (an admin cannot create a user in a different org, even by passing a different
      `organizationId` in the body — the org is taken from the session, never trusted from the request)
- [x] **[A] RED**: `GET /api/users` as an admin lists only same-org users
- [x] **[A] RED**: `DELETE /api/users/:id` cannot target a user in a different org (404, same reasoning
      as 1.5's chore test)
- [x] **[A] GREEN**: implement each route
- [x] **[A] REFACTOR**: same org-from-session-not-from-body discipline should be audited across every
      mutating route added in this phase, not just users — confirmed: `users.ts` routes only ever read
      `organizationId` from `c.var` (never from the request body), matching `chores.ts`'s discipline

### 1.8 First-admin bootstrap

Closes the chicken-and-egg gap: nothing above can be exercised end-to-end without at least one admin
already existing, and there's no self-registration to create one.

- [x] **[A] RED**: `bootstrap-admin.ts`, run against an empty D1 with an org name and admin email, results
      in exactly one `organizations` row and one `users` row with `role: 'admin'` correctly linked
- [x] **[A] RED**: running it a second time (org already exists) fails loudly rather than silently
      creating a duplicate org
- [x] **[A] GREEN**: implement the script — `src/bootstrap-admin.ts` holds the tested core function;
      `scripts/bootstrap-admin.ts` is a thin CLI wrapper using Wrangler's `getPlatformProxy()` to obtain a
      real `env.DB` binding outside the Workers runtime. Manually verified end-to-end against local D1: a
      fresh run creates the org+admin row, a second run with the same org name exits 1 with a clear error
- [ ] **[B]** Run it for real against the production D1 database to create the first real org + admin —
      the email used here must also be added to the Access policy allow-list (Phase 0 [B]'s Application)
      so that person can actually log in

### 1.9 Frontend: routing + admin panel

- [x] **[A]** Introduce a router (React Router or Wouter) — the seeded components have no routing at
      all; add `/` and `/admin`
- [x] **[A] RED** (component test): the `NavBar` renders an "Admin" entry when the current user's role is
      `admin`, and omits it otherwise
- [x] **[A] GREEN**: implement the conditional render, sourcing role from the `/api/me` response already
      fetched at app load
- [x] **[A] RED** (component test): `AdminPanel` renders the fetched user list (mock `/api/users`)
- [x] **[A] RED** (component test): the add-user form submits `{email, role, timezone}` to
      `POST /api/users` and appends the result to the visible list on success
- [x] **[A] RED** (component test): remove-user flows through `ConfirmDialog` before calling
      `DELETE /api/users/:id` — mirrors the existing chore-delete confirmation pattern
- [x] **[A] GREEN**: implement `AdminPanel`, reusing `FormField`, the `ChoreFormModal` shell, and
      `ConfirmDialog` — all already seeded under `frontend/src/components/`
- [x] **[A] RED** (e2e): logging in as a non-admin never shows the Admin tab; logging in as an admin,
      adding a user, and seeing them appear in the list end-to-end — "logging in" here means the e2e
      harness sets a valid test-key-signed JWT (per Conventions) as the Access assertion header/cookie
      directly, not a real Access login flow
- [x] **[A] GREEN**: wire it up against the real (local dev) backend, running against local D1 —
      `playwright.config.ts` boots a JWKS fixture server, `wrangler dev`, and the Vite dev server
      (proxying `/api` to the backend); `e2e/global-setup.ts` applies migrations and seeds an org + admin + member user via `wrangler d1 execute --local` before the suite runs. Both e2e tests pass

### 1.10 Access dashboard configuration & live verification

- [ ] **[B]** Add allow-listed emails / policy for initial real users (beyond the bootstrap admin from
      1.8)
- **[B] Verify**: manually log in via OTP and via OAuth (if enabled) against the real Application;
  confirm the injected JWT header reaches the Worker and 1.4's middleware — now pointed at the real
  `ACCESS_JWKS_URL`/`ACCESS_AUD` from Phase 0 — accepts it

---

## Phase 2 — Timezone: org-level scoring, per-user display (`CLOUDFLARE.md` §5)

All of this phase is **[A]** — pure frontend logic, no Cloudflare account dependency.
`useMidnightClock.ts`, `choreSort.ts`, and `choreBarMath.ts` start as seeded.

**Scope note**: this phase's own tests (2.2's e2e case in particular) require a real chore list
rendered somewhere in the app, which didn't exist yet — `Home` was still a placeholder from Phase 1.
Closing that gap required two additions not originally itemized above: `backend/src/seed-mock-chores.ts`
(+ `backend/scripts/seed-mock-chores.ts` CLI wrapper, `npm run seed-mock-chores`), a mock-data builder
following the `bootstrap-admin.ts` pattern for seeding realistic dev/test chore data into an org; and a
new `ChoresView` component (`frontend/src/components/chore/ChoresView.tsx`) that fetches
`GET /api/chores`, sorts via `orderChores` using org-timezone "today", and renders `ChoreList` wired to
the already-built complete/delete endpoints — wired into `App.tsx`'s `Home` route in place of the
placeholder. Both were glue over already-built, already-tested backend routes — no new backend logic.

### 2.1 Timezone-aware "today", driven by the org

- [x] **[A] RED**: `useMidnightClock(timezone: string)` — given a fixed system clock and `timezone =
'Pacific/Kiritimati'` (UTC+14) vs `timezone = 'Pacific/Niue'` (UTC-11), the computed "next
      midnight" target differs by the expected offset. Testing against two extreme, far-apart zones (not
      just "any non-UTC zone") is deliberate — it's the only way to prove the hook is actually using the
      passed-in timezone rather than coincidentally matching the test runner's own local timezone
- [x] **[A] GREEN**: implement using `date-fns-tz`'s `toZonedTime`/`fromZonedTime`, removing any direct
      `new Date()`-as-ambient-local-time dependency
- [x] **[A] REFACTOR**: confirmed `choreSort.ts` and `choreBarMath.ts` need no changes from their seeded
      form — they already take `today`/`day` as explicit parameters; only _which_ timezone the caller
      resolves "today" from changes

### 2.2 Wire the org's timezone into scoring — not the viewing user's

- [x] **[A] RED**: `GET /api/me` returns both `organizationTimezone` (from `organizations.timezone`) and
      `timezone` (the user's own, display-only, falling back to `organizationTimezone` if unset) as
      distinct fields — this was already built and tested ahead of schedule in Phase 1.6
- [x] **[A] GREEN**: implement — already done in Phase 1.6
- [x] **[A] RED**: given a mocked `/api/me` response, `App` passes `organizationTimezone` — not the
      browser's ambient timezone, and not the user's personal `timezone` — into `useMidnightClock`
- [x] **[A] GREEN**: implement — a new `ChoresView` component wires `/api/chores` fetching + sorting +
      rendering into `Home`, replacing the placeholder; `App` passes `me.organizationTimezone` into it
- [x] **[A] RED (the property that matters)**: two _different_ authenticated users in the _same_ org,
      each with a different personal `timezone` set, produce **identical** urgency ordering and overdue
      status for the same seeded chore data
- [x] **[A] GREEN**: confirmed by 2.2's wiring once org-level timezone is what's threaded through
- [x] **[A] RED** (e2e): two Playwright contexts with different emulated timezones (`timezoneId` in
      `browserNewContext` options), logged in (via test-key-signed JWTs, per 1.9) as two different users
      in the same org, render the exact same sort order and bar colors for the same chore list
- [x] **[A] GREEN**: `e2e/timezone-parity.spec.ts`; `e2e/global-setup.ts` extended to seed per-user
      personal timezones and a couple of sample chores for the E2E org

### 2.3 Personal timezone for display only

- [x] **[A] RED**: a timestamp rendered via `CompletionInfo` (or equivalent) is formatted in the
      _viewing user's_ own `timezone`, distinct from and independent of whatever `organizationTimezone`
      is driving the score in the same view
- [x] **[A] GREEN**: implement, sourcing from `/api/me`'s `timezone` field for formatting only — never
      fed into `useMidnightClock` or any scoring path

---

## Phase 3 — Deploy (`CLOUDFLARE.md` §6)

Almost entirely **[B]** by nature — deploying and going live requires a real Cloudflare account.

### 3.1 CI pipeline

Unlike a monorepo with unrelated sibling content, this repo _is_ the cloud app — no path-scoping is
needed on the CI trigger; a normal push/PR-triggered workflow is fine.

- [x] **[A]** `.github/workflows/ci.yml`: a `lint` job (ESLint + Prettier `--check`), then `test-backend`
      (vitest + `@cloudflare/vitest-pool-workers`, local D1/Miniflare, no secrets needed) and
      `test-frontend` (vitest), both `needs: lint` so a lint/format failure skips the test jobs entirely —
      triggered on `pull_request` `opened`/`synchronize` (rather than the originally-suggested
      push/PR-to-`main`, to fail fast on every PR push without waiting for a merge). One file, not the
      separate `lint.yml`/`test.yml` this started as — merged so the `needs: lint` gate could work at all
      (`needs` only orders jobs within a single workflow file)
- [x] **[A]** Add `test-e2e`, needs `[test-backend, test-frontend]` (and transitively `lint`, once those
      pass) — Playwright against local `wrangler dev` + `vite preview`, using test-key-signed JWTs per
      Phase 1.9's Convention. Stays fully local even in CI; no live Cloudflare account is ever touched by a
      test. Uses `vite preview` (not `vite dev`) deliberately: `vite dev`'s cold-start JIT compile proved
      flaky under Playwright's default assertion timeout. Also fixed a real fresh-checkout gap this
      surfaced — `.dev.vars` is gitignored, so the e2e job copies `backend/.dev.vars.example` into place
      before running, or `wrangler dev` falls back to `wrangler.toml`'s placeholder JWKS URL/audience and
      every request 401s. `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` (for the
      Playwright report on failure) are all pinned to commit SHAs
- [ ] **[B]** Add `CLOUDFLARE_API_TOKEN` (scoped to Workers/Pages/D1 edit only, not full account access)
      and `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets
- [ ] **[B]** Add `deploy-backend` and `deploy-frontend` jobs, both `needs: [test-e2e]` and gated
      `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` — never on `pull_request`
      events, so no PR deploys before it's merged. Use `cloudflare/wrangler-action` (Cloudflare's
      official action) for both `wrangler deploy` and `wrangler pages deploy`
- [ ] **[B]** Deliberately **do not** auto-apply D1 migrations in this pipeline. Bundling
      `wrangler d1 migrations apply --remote` into a routine merge-triggered deploy means a bad migration
      can land silently as a side effect of an unrelated PR. Apply migrations as a separate, deliberate,
      manually-run step (by hand, or a dedicated `workflow_dispatch`-only job) before merging code that
      depends on the new schema
- **[B] Verify**: a merge to `main` triggers the deploy jobs; a deliberately-broken test blocks them
- [ ] **[B]** Consider a basic branch-protection ruleset (require the test jobs to pass before merge) —
      not required for the app to function, but cheap insurance against merging straight past a red CI run

### 3.2 Deploy & cutover

- [ ] **[B]** `wrangler deploy` `backend/` to a staging environment
- **[B] Verify**: staging `/api/chores` responds correctly through the real Access Application (not just
  local dev)
- [ ] **[B]** Deploy `frontend/`'s build to Cloudflare Pages, pointed at the staging Worker
- **[B] Verify**: staging frontend loads, authenticates via Access, and renders the chore list
- [ ] **[B]** Point custom domain / DNS at Pages + Worker routes
- **[B] Verify**: TLS is live, public hostname resolves, Access still gates it correctly
- [ ] **[B]** Note `wrangler rollback` (Worker) and Cloudflare Pages' built-in deployment history
      (one-click rollback in the dashboard) as the safety net if a deploy passes CI but breaks something
      CI didn't catch

---

## Phase 4 — Offline outbox + local-first frontend (`CLOUDFLARE.md` §7)

All of this phase is **[A]** — pure logic and frontend work, no Cloudflare account dependency.

### 4.1 Optimistic concurrency — frontend integration, edit-chore flow only

Conflict handling (409) only exists on `PUT /api/chores/:id` (edit). `PATCH /api/chores/:id/complete`
never returns 409 — `completeChore` merges via a monotonic max on `date_last_completed` and always
succeeds (or 404s if the row is gone). `DELETE` and `POST` never version-check either. So this task is
scoped to the edit-chore flow, and requires that flow to exist first — there is currently no edit-chore
UI wired anywhere (`ChoreFormModal`/`ChoreForm` are seeded but unused, `ChoresView` only wires
complete/delete).

- [x] **[A]** 4.0 prerequisite: wire a minimal create-chore and edit-chore flow into `ChoresView.tsx`
      using the already-seeded `ChoreFormModal`/`ChoreForm` and `ChoreList`'s `onEdit` prop — POST for
      create, PUT (with `version`) for edit. Without this there is nothing that can produce a 409.
- [x] **[A] RED**: editing a chore, then submitting a PUT whose `version` is stale (mocked 409 response)
      results in the UI surfacing a distinguishable "changed elsewhere" state for that chore — not the
      generic error path
- [x] **[A] GREEN**: implement 409-specific handling in the edit handler
- [x] **[A] REFACTOR**: build one consistent try/catch/rollback pattern across all four mutation handlers
      in `ChoresView.tsx` (create/edit/complete/delete), with the 409 branch as one case inside that
      shared pattern rather than a parallel path bolted onto edit alone — implemented as a shared
      `mutate({ optimisticApply, request, onSuccess, onConflict?, onNetworkFailure? })` helper; all four
      handlers apply their local state change immediately, then reconcile or (on network failure) simply
      leave the optimistic state in place — `onNetworkFailure` is the seam 4.2's outbox plugs into

### 4.2 Outbox core

- [x] **[A] RED**: a mutation attempted while `navigator.onLine === false` is appended to the outbox
      (`{id: uuid, type, choreId?, payload, baseVersion, createdAt}`) instead of firing a network request
- [x] **[A] RED**: the outbox is persisted to `localStorage` after every append
- [x] **[A] RED**: re-instantiating the outbox (simulating a page reload) reads the previously-persisted
      queue back
- [x] **[A] GREEN**: implement the outbox module (plain TS, no framework dependency — testable in
      isolation) — `frontend/src/outbox/outbox.ts` (`createOutbox(fetchImpl)`) + `useOutbox.ts` (React
      wiring via `useSyncExternalStore`), wired into `ChoresView.tsx`'s `mutate()` `onNetworkFailure` seam
- [x] **[A] RED**: an `online` event triggers flush, replaying queued mutations in original order
- [x] **[A] RED**: a successful replay removes that entry from the outbox and from `localStorage`
- [x] **[A] RED**: a 409 during replay drops that specific entry (with the conflict surfaced per 4.1) but
      continues flushing the remaining queue — one stale entry must not block everything behind it
- [x] **[A] GREEN**: implement flush/replay logic — also added beyond the ground truth: a 404 on a
      `delete` replay is treated as success (goal state "row gone" already holds) rather than retried;
      any other error halts the flush, leaving that entry and the rest queued in order; construction with
      `navigator.onLine === true` and a non-empty persisted queue flushes immediately rather than waiting
      for a fresh `online` event
- [x] **[A] RED**: replaying the same `create` mutation twice (simulating an ack lost after the server
      actually applied it) does not create a duplicate row. Split across two layers, both green: the
      outbox module's own test proves it sends the identical `clientId` (the entry's own uuid) on every
      replay of the same entry; `backend/test/chores.test.ts`'s dedup tests (added in the idempotency-key
      task below) prove the D1 layer collapses repeats of that `clientId` to one row. A true single test
      spanning both layers via a live local D1 is deferred to 4.5's full offline e2e checkpoint
- [x] **[A] GREEN**: implement idempotency-key checking on the Worker's create route — a nullable
      `client_id` column on `chores` with a unique index scoped to `(organization_id, client_id)`
      (added directly to `0001_init.sql`, not a new migration, since nothing has been deployed yet);
      `createChore` accepts an optional `clientId`, and a repeat of a `client_id` already used in that
      org returns the existing row instead of erroring or inserting a duplicate. This is a permanent
      dedupe key, not a bounded recent window — simpler, and sufficient since a client-generated UUID
      is never reused for a different logical mutation

### 4.3 IndexedDB read cache

- [x] **[A] RED**: after a successful `GET /api/chores`, the result is written to IndexedDB
- [x] **[A] RED**: on load, if the network fetch fails or `navigator.onLine === false`, the UI renders
      from the IndexedDB cache, marked as stale, instead of blocking or showing nothing
- [x] **[A] GREEN**: implement using `fake-indexeddb` in tests, real IndexedDB in the browser —
      `frontend/src/cache/choresCache.ts` (hand-rolled `read`/`write`/`clear` over one object store, no
      new dependency), `frontend/src/components/common/StatusBanner.tsx`, wired into `ChoresView.tsx`'s
      load effect
- [x] **[A] REFACTOR**: confirm the "stale" banner clears automatically once a live fetch succeeds —
      the load effect also listens for the `online` event and retries, clearing staleness on success

### 4.4 Service worker / app shell caching

- [x] **[A]** Configure `vite-plugin-pwa` with a cache-first strategy for built assets — added to
      `frontend/vite.config.ts` (`registerType: 'autoUpdate'`, `injectRegister: 'auto'`, Workbox
      `generateSW` precaching `**/*.{js,css,html,svg,png}`); `frontend/public/pwa-192.png`/`pwa-512.png`
      placeholder icons added so manifest generation has at least one
- [x] **[A] RED** (e2e): with the service worker registered and the app previously loaded once, a
      Playwright context with `setOffline(true)` still successfully loads the app shell on a fresh
      navigation
- [x] **[A] GREEN**: confirm the generated service worker satisfies this (largely plugin-configuration,
      not hand-written logic) — `e2e/offline-shell.spec.ts`; `npx vite build` confirmed 9 entries
      precached and `sw.js`/`registerSW.js` generated correctly
- [x] **[A] Verify**: a completely fresh browser profile (nothing cached yet) attempting to load while
      offline fails gracefully with a clear message, not a blank screen — automated as the second case in
      `e2e/offline-shell.spec.ts` rather than left purely manual: a fresh `browser.newContext({offline:
true})` asserts `page.goto('/')` rejects outright instead of hanging or rendering nothing

### 4.5 Full offline e2e

- [x] **[A] RED**: go offline mid-session → mark a chore complete → verify optimistic UI update → go
      back online → verify the outbox flushes and the server-confirmed state matches
- [x] **[A] RED**: go offline → add a new chore → reload the page while still offline → the new chore is
      still visible (from the outbox + IndexedDB cache, not lost on reload)
- [x] **[A] GREEN**: `e2e/offline-outbox.spec.ts` — three scenarios: offline-complete-then-sync,
      offline-add-then-reload-while-offline, and a genuine cross-layer idempotency proof (a real row is
      created directly against the backend using the same `clientId` the outbox will retry with,
      simulating an ack lost after the server already applied the mutation — confirms exactly one row
      results). This surfaced two real gaps beyond "should already pass," not just an integration
      checkpoint: - `ChoresView.tsx` never merged still-pending outbox `create` entries into the rendered list on
      load — a reload while offline before that create ever synced would drop it, since the IndexedDB
      cache only holds what was last successfully fetched from the server. Fixed via
      `mergePendingCreates` in the load effect, covered first by a component-level RED/GREEN test
      before the e2e proof. - `App.tsx`'s `useMe()` had no error handling at all on its `/api/me` fetch — a rejected fetch
      (offline) left `loading` stuck `true` forever, so the whole authenticated app (including
      `ChoresView`) never mounted. Fixed by caching the last-successful `/api/me` response in
      `localStorage` and falling back to it on fetch failure, mirroring the chores cache pattern. - Also fixed along the way: `playwright.config.ts`'s frontend `webServer` used `port: 5173`
      (TCP-listener-only readiness), which raced the `vite preview` static-file middleware's actual
      startup often enough to be non-flaky-but-still-real; switched to `url:` so readiness waits for
      a genuine HTTP response. These new e2e specs also mutate/create real rows against the shared
      seeded org (global-setup only wipes once per suite run, not per file), so each test restores or
      deletes what it touched to avoid breaking sibling spec files.

---

## Sequencing notes

- Within Part A: Phases 1 and 2 can overlap once 1.6 (`/api/me`) exists — 2.2 depends on it directly.
  Phase 4 depends on Phase 1's `version` column (1.1) and D1 mutators (1.2) being stable.
- **Do not start Part B until Part A's Phase 1 auth/org-scoping tests are green.** Deploying unverified
  authorization logic to a public URL is the one place in this plan where skipping ahead has real
  consequences beyond wasted time — everything else in Part A is safe to finish out of strict order, but
  this one gate is not optional.
