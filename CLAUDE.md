# chore-reaper — Project Instructions

`ARCHITECTURE.md` is the main documentation for this app — stack, dev/staging/prod environments,
frontend/backend design, CI/CD, database/migrations, auth model, and a "where to look for X" index.
Read it first for any non-trivial task. **Keep it current**: when a change alters anything it documents
(routes, middleware, schema/migrations, environments, CI/CD, deploy process, repo layout), update the
relevant section of `ARCHITECTURE.md` in the same piece of work — treat it as load-bearing docs, not a
one-time snapshot.

Read `README.md` in the repo root for architecture/design rationale. The Cloudflare setup and cutover
plan (formerly `CLOUDFLARE.md`/`CLOUD_PLAN.md`) is complete — Part A and Part B are both fully done, the
app is live at chores.4irl.app, and those planning docs have been removed.

## Claude Config

<!-- Consumed by the stronghold's central generic skills (see ~/code/CLAUDE.md).
     Stable keys — do not rename. This repo now uses the SHARED consolidated bot
     (`gpropersi-claude`, one GitHub App across all repos) via the central push script + the
     tracked stronghold generator (`~/code/.claude/scripts/generate-gh-token.sh`) — the old
     repo-local `chore-reaper-claude` App toolkit under .claude/scripts/ is retired. Account-specific App/install IDs and GraphQL IDs are NOT
     inlined here (secrets policy); only the public bot login + noreply email are recorded. -->

- **Repo slug:** `GPropersi/chore-reaper` (this directory is named `tasktracker` but the repo is `chore-reaper`, live at chores.4irl.app)
- **Default branch:** `main`
- **Plans/reviews layout:** `plans/<topic>/` (gitignored; not currently present in the tree — created on demand)
- **Bot identity:** `gpropersi-claude[bot]` `141576524+gpropersi-claude[bot]@users.noreply.github.com` <!-- consolidated shared bot; replaced repo-local c4i-claude-bot -->
- **Bot push script:** `~/code/.claude/scripts/gh-app-push.sh` (central, repo-agnostic; derives the repo from `origin`, pushes as the shared bot)
- **Token generator:** `~/code/.claude/scripts/generate-gh-token.sh` (tracked in the stronghold — the shared consolidated `gpropersi-claude` App; one generator serves every repo, auto-resolves the installation from the repo's owner. Only the private key `~/.claude/u4i-app.pem` lives outside git)
- **Container runtime:** n/a (Node/TS monorepo run via npm workspaces; no root docker-compose — deploys to Cloudflare Workers/D1)
- **App URL (Playwright MCP):** `http://localhost:5173` (Playwright `baseURL`; e2e webServer builds frontend then `vite preview` on :5173, backend dev on :8787, jwks on :8790)
- **Test login:** n/a (e2e seeds a household via `e2e/global-setup.ts` against a local D1; no interactive login recorded — TODO if a login flow is needed)
- **Commands:** (via root `Makefile` — thin wrappers around the npm workspace scripts; `make help` lists all)
  | Purpose            | Command                                                                           |
  | ------------------ | --------------------------------------------------------------------------------- |
  | Integration tests  | `make test-backend` (backend workspace vitest)                                    |
  | UI/e2e tests       | `make test-e2e` (Playwright)                                                      |
  | JS/unit tests      | `make test-frontend` (frontend workspace vitest)                                  |
  | Build              | `make build` (frontend production build)                                          |
  | Lint / format      | `make lint` (eslint) / `make format` (prettier) — lint-staged also runs on commit |
  | Dev                | `make dev` (concurrently: jwks + backend + frontend)                              |
  | DB migrate (local) | `make migrate-local` (apply pending migrations to local Miniflare D1)             |
  | DB migrate (prod)  | `make migrate-remote` (apply to remote production D1 — deploy-time)               |
  | DB migrate status  | `make migrate-list` (local) / `make migrate-list-remote` (prod)                   |
  | New migration      | `make migrate-new name=<snake_case_desc>` (scaffold next numbered file)           |
- **GitHub project board:** n/a
- **Issue labels:** resolve at runtime via `gh label list --repo GPropersi/chore-reaper` (do not invent labels)
- **PR reviewer:** n/a
