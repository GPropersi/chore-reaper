# Architecture

Chore Reaper is a multi-tenant ("household"-scoped) chore tracker. Cloudflare Workers + Hono backend,
React frontend, D1 (SQLite) storage, Cloudflare Access for auth. This doc is the map: what runs where,
how a request flows end to end, and where to look for anything you need mid-task.

For _why_ this is cloud-native instead of the local-kiosk model it was seeded from, see
[`TRADEOFFS.md`](TRADEOFFS.md). For repo-wide agent conventions, see [`CLAUDE.md`](CLAUDE.md).

## At a glance

|                 |                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------- |
| Frontend        | React 19 + Vite + Tailwind 4, PWA (`vite-plugin-pwa`), deployed to Cloudflare Pages           |
| Backend         | Hono 4 on Cloudflare Workers (`nodejs_compat`), single Worker, all routes under `/api/*`      |
| Database        | Cloudflare D1 (SQLite), one shared instance for all households, schema-level tenant isolation |
| Auth            | Cloudflare Access (Zero Trust) — JWT in `Cf-Access-Jwt-Assertion` header, verified via JWKS   |
| Production URL  | https://chores.4irl.app (frontend); `chores.4irl.app/api/*` routes to the Worker              |
| Package manager | npm workspaces (`backend`, `frontend`), Node 24                                               |
| CI/CD           | GitHub Actions (`.github/workflows/ci.yml`) — lint → test → e2e → deploy on push to `main`    |

There is **no staging environment**. Two environments only:

- **Local dev** — `wrangler dev` (Miniflare-backed local D1) + `vite`, fixture JWKS server standing in
  for real Cloudflare Access.
- **Production** — real Workers, real D1, real Cloudflare Access, deployed automatically on every merge
  to `main` that passes CI.

PR branches get a Cloudflare Pages _preview_ deployment (a real `*.pages.dev` URL), but it talks to
mocked API data, not the production backend — see [Preview deployments](#preview-deployments-and-why-they-cant-hit-the-real-api) below. It is not a staging environment for the backend.

## Repo layout

```
backend/         Hono API — Cloudflare Worker
  src/
    app.ts               Route mounting + middleware wiring (the whole app's shape, read this first)
    index.ts              Worker entrypoint (just re-exports app.ts's default)
    routes/                One file per resource: chores, rooms, households, members, me
    middleware/
      access-auth.ts       Verifies the Cf-Access-Jwt-Assertion JWT against Cloudflare's JWKS
      household-scope.ts   Resolves verified email -> user -> household membership -> role
    chores.ts, rooms.ts, households.ts, members.ts   Data-access/business-logic layer the routes call into
    access-allowlist.ts    Calls the Cloudflare Access API to auto-grant new members
    bootstrap-admin.ts, seed-mock-chores.ts   Logic behind the one-off scripts in scripts/
    types.ts               Hono AppEnv (Bindings + Variables) shared across the backend
  migrations/               Numbered D1 migrations, applied in order (see Database section)
  scripts/                  One-off CLI scripts run with tsx (bootstrap-admin, dev-jwt, seed-mock-chores)
  test/                     Vitest + @cloudflare/vitest-pool-workers (real Miniflare D1 per test)
  wrangler.toml             Worker config: routes, D1 binding, env vars/secrets

frontend/         React SPA — Cloudflare Pages
  src/
    App.tsx                 Routing (react-router), top-level data loading (useMe, useRooms)
    components/
      admin/                 Admin panel: household settings, members, rooms
      chore/                 Chore list/view/timer/completion UI
      form/                   Chore creation/edit forms
      nav/                    Nav bar, room tabs, date navigation
      common/                 Shared UI (dialogs, banners)
    utils/api.ts             Single fetch entrypoint (apiFetch) — attaches X-Household-Id, routes
                              preview deployments to mock data instead of the real API
    utils/mockApi.ts          Mock data served on *.pages.dev preview deployments
    outbox/                   Offline write queue (IndexedDB-backed) — queues chore mutations when offline
    cache/choresCache.ts      IndexedDB read cache for offline chore viewing
    hooks/useMidnightClock.ts Recomputes chore urgency at local midnight
  vite.config.ts              Dev proxy to :8787, PWA manifest/workbox config

e2e/               Playwright end-to-end tests (own JWKS fixture server, own signed-JWT helper)
types/SharedTypes.d.ts   Types shared between backend and frontend (ApiResponse<T>, Room, etc.)
scripts/           Root-level scripts (git hooks installer)
.github/workflows/ci.yml   The entire CI/CD pipeline
.claude/           Agent tooling: skills (run-dev, bot-push), scripts (GitHub App auth for bot pushes)
```

## Request flow

1. Browser hits `chores.4irl.app` → Cloudflare Access intercepts, enforces login (email allow-list),
   redirects to the app with a `CF_Authorization` cookie once authenticated.
2. Frontend (Pages) serves the SPA. `apiFetch()` (`frontend/src/utils/api.ts`) is the _only_ place that
   calls `fetch()` for API requests — it attaches `X-Household-Id` from the currently-selected household.
3. Cloudflare's edge attaches `Cf-Access-Jwt-Assertion` (the Access JWT) to requests reaching
   `chores.4irl.app/api/*`, which routes to the Worker per `wrangler.toml`'s `routes` block.
4. Worker middleware chain (`backend/src/app.ts`), per route group:
   - `accessAuth` (`middleware/access-auth.ts`) — verifies the JWT against Cloudflare's JWKS endpoint
     (cached `createRemoteJWKSet`), checks `aud`, extracts `email` into `c.var.verifiedEmail`. Fails
     closed (401) on any verification error.
   - `householdScope` (`middleware/household-scope.ts`) — looks up the user by email, loads their
     household memberships, resolves which household this request is scoped to (via `X-Household-Id`
     header, or the lowest-id membership if absent/first login), sets `userId` / `householdId` / `role`
     / `timezone` on the context.
5. Route handler (`routes/*.ts`) calls into the corresponding data-access module (`chores.ts`,
   `rooms.ts`, etc.), which always filters/writes by `household_id` — this is the entire tenant-isolation
   mechanism (see [Multi-tenancy](#multi-tenancy--auth-model)).
6. Response shape is always `{ success: boolean, data?: T, error?: string, warning?: string }`
   (`ApiResponse<T>` in `types/SharedTypes.d.ts`).

## Multi-tenancy & auth model

- **Identity**: Cloudflare Access owns authentication entirely — there is no password/session system in
  this app. The Worker trusts the `Cf-Access-Jwt-Assertion` header's `email` claim once JWT signature +
  audience are verified. `access-auth.ts`'s in-memory JWKS cache means the Worker never round-trips to
  Cloudflare per-request for keys, just for the initial fetch/key rotation.
- **Tenant = household**: `households` table. A user (`users`) can belong to multiple households via
  `household_members` (role: `admin` | `user` per household — a user can be an admin of one household
  and a plain user of another).
- **Scoping**: every table that holds tenant data (`chores`, `rooms`) carries `household_id`. Every
  data-access function takes `householdId` as a parameter sourced from `c.var.householdId` (set by
  `household-scope.ts`), never from client-supplied body/query data — this is the load-bearing invariant
  that keeps households isolated. `households.patch('/:id')` re-validates the path param against
  `c.var.householdId` rather than trusting it, for the same reason.
- **Admin-gating**: mostly enforced inside individual functions rather than as blanket middleware — e.g.
  `addHouseholdMember` only requires `role === 'admin'` when the target email has no existing account;
  adding an already-registered user to a household is open to any member. See the comment in
  `backend/src/app.ts` above the `/api/members` mount.
- **Auto-provisioning Access**: when a new member is added, `access-allowlist.ts` calls the Cloudflare
  Access API to add their email to the reusable Access policy automatically. This is best-effort — a
  failure degrades to a `warning` in the API response telling the admin to add the email manually in the
  Zero Trust dashboard, never blocks the D1 write.

## Database (D1)

Single D1 instance (`chores4irl`, binding `DB`) shared across all households — isolation is
application-level (`household_id` columns), not per-tenant databases.

- **Migrations**: `backend/migrations/*.sql`, applied in order via `wrangler d1 migrations apply`.
  `npm run migrate:local` (Miniflare-local) / `npm run migrate:remote` (real production D1) from
  `backend/`. Migration files are numbered and immutable once merged to `main` — corrections are new
  migrations, never edits to old ones (see the extensive rationale comments in
  `0004_rename_org_to_household.sql` and `0005_rename_member_role_to_user.sql` for what that discipline
  looks like against live data).
- **Core tables**: `households`, `users`, `household_members` (join table: user × household → role),
  `rooms`, `chores`. Naming history: this schema was originally "organizations" (0001–0003), renamed to
  "households" in 0004, and the member role vocabulary (`member` → `user`) was renamed in 0005 — expect
  to see that lineage in migration comments if you're tracing schema history.
- **Local dev D1** is a Miniflare-emulated SQLite file, fully disposable — `npm run migrate:local` any
  time to reset/catch up.
- **Tests** run against a real (in-memory, per-test) D1 via `@cloudflare/vitest-pool-workers` — not
  mocks. `backend/test/apply-migrations.ts` applies the same migration files tests run against.

## Environments in detail

### Local dev

Run via the `run-dev` skill (`/run-dev`) or `npm run dev` from the repo root, which runs three processes
concurrently:

1. `e2e/jwks-server.mjs` on `:8790` — serves a fixture JWKS so the backend can verify locally-signed
   test JWTs without a real Cloudflare Access tenant.
2. `wrangler dev` (backend) on `:8787` — real Hono app, Miniflare-local D1.
3. `vite` (frontend) — proxies `/api/*` to `:8787`; if `VITE_DEV_ACCESS_JWT` is set
   (`frontend/.env.development.local`, gitignored), the dev proxy injects it as
   `Cf-Access-Jwt-Assertion` on every proxied request so a normal browser tab "just works" without a real
   Access login.

Config: `backend/.dev.vars` (gitignored, copy from `.dev.vars.example`) supplies fixture values for
`ACCESS_JWKS_URL` (pointed at the local `:8790` server), `ACCESS_AUD`, and Cloudflare-API-adjacent
secrets that are never exercised for real locally.

Minting a dev JWT for a specific user: `npm run dev-jwt --workspace backend -- <email>` (signs with the
same fixture key `jwks-server.mjs` serves). Creating a brand-new local household+admin:
`npm run bootstrap-admin --workspace backend -- "<household name>" <email>`.

### Production

- **Backend**: deployed via `wrangler deploy` from `backend/` (GitHub Actions `deploy-backend` job).
  Routes `chores.4irl.app/api/*` to the Worker (`wrangler.toml`'s `routes` block) — there's no separate
  workers.dev URL in normal use.
- **Frontend**: built (`vite build`) then deployed via `wrangler pages deploy dist
--project-name=chores4irl-frontend` (GitHub Actions `deploy-frontend` job).
- **Secrets** (`ACCESS_AUD`, `CF_ACCOUNT_ID`, `ACCESS_POLICY_ID`, `CLOUDFLARE_ACCESS_API_TOKEN`) are set
  via `wrangler secret put <NAME>` directly against the Cloudflare account — never committed, never in
  `wrangler.toml`. `ACCESS_JWKS_URL` is a plain `[vars]` entry since it's a public-by-design endpoint.
- **One-off admin scripts** (`bootstrap-admin`, `seed-mock-chores`) can target production D1 by running
  with `WRANGLER_ENV=production` — `wrangler dev` and the test suite never set this, so they can't
  accidentally touch it.
- D1's `[env.production]` block in `wrangler.toml` pins `remote = true` for that binding — this is what
  lets those scripts reach the real database instead of a local emulated one.

### Preview deployments (and why they can't hit the real API)

Every PR gets a Cloudflare Pages preview at a per-branch `*.pages.dev` URL (`deploy-preview` CI job,
commented onto the PR). These deliberately serve **mock data** (`frontend/src/utils/mockApi.ts`), not
the real backend: Cloudflare Access's cross-app SSO redirect flow only works for real browser
navigation, not `fetch()`-initiated requests, so a preview origin can't be authenticated against the
production Access app regardless of CORS config (verified live, not just theorized — see the comment in
`frontend/src/utils/api.ts`). `isPreviewDomain()` detects `*.pages.dev` and routes all `apiFetch` calls
through `mockFetch` instead.

## CI/CD pipeline

`.github/workflows/ci.yml`, one file, all jobs. Runs on every PR (`opened`/`synchronize`) and every push
to `main`.

```
lint (eslint + prettier --check)
  ├─→ test-backend (vitest, real Miniflare D1)
  └─→ test-frontend (vitest, jsdom)
        └─→ test-e2e (playwright, needs both test jobs)
              ├─→ deploy-backend   (main push only: wrangler deploy)
              └─→ deploy-frontend  (main push only: wrangler pages deploy)

lint + test-frontend ──→ deploy-preview  (PR only: pages deploy --branch=<head>, comments URL on PR)
```

- `deploy-backend`/`deploy-frontend` only run on a **push to `main`** (i.e. after a PR merges), and only
  after `test-e2e` passes — that's the full gate for a production release.
- `deploy-preview` runs on **every PR**, gated by the cheaper `lint` + `test-frontend` jobs only (not the
  full e2e suite) — it's not production, so it doesn't need production's bar, and this keeps the preview
  link showing up quickly for reviewers.
- All jobs pin third-party Actions to a commit SHA (not a tag) — check `.github/dependabot.yml` for how
  those get bumped.
- CI secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions repo secrets, not visible
  in any file here).

## Testing

| Layer                         | Tool                                       | What it actually exercises                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend unit/route tests      | Vitest + `@cloudflare/vitest-pool-workers` | Real Miniflare Workers runtime + real (in-memory) D1 per test — not mocked bindings                                                                                                                                                                          |
| Frontend unit/component tests | Vitest + `@testing-library/react` + jsdom  | Component behavior; `fake-indexeddb` stands in for the outbox/cache's IndexedDB usage                                                                                                                                                                        |
| End-to-end                    | Playwright (`e2e/`)                        | Full stack against `vite preview` (a built static server, not `vite dev` — avoids cold-start JIT flakiness) + a real local Worker + the fixture JWKS server. Own JWT signing helper (`e2e/sign-jwt.ts`), separate from the frontend dev-JWT convenience flow |

Run: `npm run test:backend`, `npm run test:frontend`, `npm run test:e2e` (root), or `npm test` inside
either workspace. `backend`'s `test` script runs `wrangler types` first — regenerates `Env` from
`wrangler.toml` before typechecking against it.

## Offline behavior (frontend)

Not a full offline-first app — see [`TRADEOFFS.md`](TRADEOFFS.md) for the honest ceiling here (Workers/D1
mean this can never be offline-_capable_, only offline-_tolerant_). Two mechanisms:

- **`outbox/`** — chore create/edit/complete/delete actions queue in IndexedDB (`outbox-v1`) when a
  write fails, and replay when connectivity returns (`useOutbox.ts`). Conflict handling: completions
  merge by latest timestamp rather than rejecting (see commit `8013e84`).
- **`cache/choresCache.ts`** — last-known chore list cached in IndexedDB so the view isn't blank while
  offline; paired with the PWA service worker (`vite-plugin-pwa`, `workbox` config in `vite.config.ts`)
  for asset caching.

## Where to look for X

| I need to...                                                      | Look at                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Understand the whole backend's route/middleware shape at a glance | `backend/src/app.ts`                                                                                   |
| Add or change an API endpoint                                     | `backend/src/routes/<resource>.ts` + its data-access sibling (e.g. `backend/src/chores.ts`)            |
| Change auth/JWT verification behavior                             | `backend/src/middleware/access-auth.ts`                                                                |
| Change how household scoping/switching resolves                   | `backend/src/middleware/household-scope.ts`                                                            |
| Add a DB column/table                                             | New file in `backend/migrations/` — never edit a merged one                                            |
| Change the shared API response/entity shapes                      | `types/SharedTypes.d.ts`                                                                               |
| Change the single fetch entrypoint (headers, preview mocking)     | `frontend/src/utils/api.ts`                                                                            |
| Change routing/top-level data loading                             | `frontend/src/App.tsx`                                                                                 |
| Change the offline write queue                                    | `frontend/src/outbox/`                                                                                 |
| Run local dev                                                     | `/run-dev` skill, or `npm run dev` at repo root                                                        |
| Push a branch / open a PR as the bot                              | `/bot-push` skill (`c4i-claude-bot[bot]`, standing default per project instructions — don't ask first) |
| Understand the cloud-vs-local tradeoff rationale                  | `TRADEOFFS.md`                                                                                         |
| Check the day's work log                                          | `changelog/MM-DD-YYYY-changelog.md`                                                                    |
| Change CI/CD                                                      | `.github/workflows/ci.yml`                                                                             |
| Change Worker routing/bindings/secrets config                     | `backend/wrangler.toml`                                                                                |

## Conventions worth knowing

- **No local imports** — always top-level/global imports (user-level convention, applies repo-wide).
- **`ApiResponse<T>` everywhere** — every API handler returns `{ success, data?, error?, warning? }`;
  don't invent a different response shape for a new endpoint.
- **Tenant id never trusted from the client** — any new route touching household-scoped data must
  source `householdId` from `c.var.householdId`, not from a path/body/query param, even if a param of
  that name is present (re-validate it against the session instead, as `households.ts` does).
- **Migrations are append-only** — schema fixes are new numbered files, even for renaming something added
  in an unmerged migration earlier in the same branch (see 0004/0005's own comments for the reasoning
  when a table is "new enough" to edit directly vs. not).
- **No secrets in `wrangler.toml`** — anything Cloudflare-account-specific goes through `wrangler secret
put`, not `[vars]`.
