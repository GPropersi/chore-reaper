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

<!-- Consumed by the stronghold's central generic skills (see /Users/ggpropersi/code/CLAUDE.md).
     Stable keys — do not rename. This repo has its OWN GitHub-App bot toolkit under .claude/scripts/
     (a DISTINCT App from urls4irl's) — the Token generator and Bot push script keys point at the
     repo-local scripts, NOT ~/.claude/. Account-specific App/install IDs and GraphQL IDs are NOT
     inlined here (secrets policy); only the public bot login + noreply email are recorded. -->

- **Repo slug:** `GPropersi/chore-reaper` (this directory is named `tasktracker` but the repo is `chore-reaper`, live at chores.4irl.app)
- **Default branch:** `main`
- **Plans/reviews layout:** `plans/<topic>/` (gitignored; not currently present in the tree — created on demand)
- **Bot identity:** `c4i-claude-bot[bot]` `300508129+c4i-claude-bot[bot]@users.noreply.github.com`
- **Bot push script:** `.claude/scripts/gh-app-push.sh` (repo-local; pushes to `GPropersi/chore-reaper` as `c4i-claude-bot[bot]`)
- **Token generator:** `.claude/scripts/generate-gh-token.sh` (repo-local; the `chore-reaper-claude` GitHub App — distinct from urls4irl's; PEM at `~/.claude/chore-reaper-app.pem`)
- **Container runtime:** n/a (Node/TS monorepo run via npm workspaces; no root docker-compose — deploys to Cloudflare Workers/D1)
- **App URL (Playwright MCP):** `http://localhost:5173` (Playwright `baseURL`; e2e webServer builds frontend then `vite preview` on :5173, backend dev on :8787, jwks on :8790)
- **Test login:** n/a (e2e seeds a household via `e2e/global-setup.ts` against a local D1; no interactive login recorded — TODO if a login flow is needed)
- **Commands:**
  | Purpose           | Command                                                                            |
  | ----------------- | ---------------------------------------------------------------------------------- |
  | Integration tests | `npm run test:backend` (backend workspace)                                         |
  | UI/e2e tests      | `npm run test:e2e` (Playwright)                                                    |
  | JS/unit tests     | `npm run test:frontend` (frontend workspace)                                       |
  | Build             | `npm run build:frontend`                                                           |
  | Lint / format     | `npm run lint` (eslint) / `npm run format` (prettier) — lint-staged runs on commit |
  | Dev               | `npm run dev` (concurrently: jwks + backend + frontend)                            |
- **GitHub project board:** n/a
- **Issue labels:** resolve at runtime via `gh label list --repo GPropersi/chore-reaper` (do not invent labels)
- **PR reviewer:** n/a
