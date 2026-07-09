---
name: run-dev
description: Start or stop chore-reaper's full local dev stack (JWKS auth fixture + backend `wrangler dev` + frontend `vite`) as one background process tree, and report the URL to open in a real browser. Use when the user asks to run/start/launch local dev, open the app locally, or stop/kill the local dev servers. `/run-dev` starts (or reports the URL if already running); `/run-dev stop` tears it down.
---

# run-dev

Runs `npm run dev` (the root `concurrently` script — jwks-server + `wrangler dev` + `vite`) as a
detached background process tree, tracked by a pidfile so a **later `/run-dev stop` call, even in a
different conversation, can still find and kill it.** State lives in `.claude/run-dev/` (gitignored):
`dev.pid` (the top-level process PID) and `dev.log` (combined output).

Repo root for all commands below: wherever `package.json`'s `workspaces` field lists `backend`/`frontend`
(this repo's root) — this is the Bash tool's default working directory for the whole session, so no `cd`
is normally needed. If you ever land in a subdirectory and need to get back, run `git rev-parse
--show-toplevel` as its own plain command (no `cd "$(...)"` — that shell-substitution shape always
requires manual approval and can't be pre-approved) and `cd` to the literal path it prints.

## Prerequisites (check once, first run only)

Before starting, verify:
1. `backend/.dev.vars` exists — if not, `cp backend/.dev.vars.example backend/.dev.vars`.
2. Local D1 is migrated — `npm run migrate:local --workspace backend` (idempotent, safe to re-run).
3. `frontend/.env.development.local` exists and has `VITE_DEV_ACCESS_JWT=...` set — if not, this is a
   real gap, not something to silently paper over: tell the user you need an email to mint a dev token
   for (an existing user in local D1, or one to bootstrap), then either
   `npm run bootstrap-admin --workspace backend -- "<household>" <email>` to create one, or reuse an existing
   local user. Then `npm run dev-jwt --workspace backend -- <email>` and write the printed token into
   `frontend/.env.development.local` as `VITE_DEV_ACCESS_JWT=<token>`. Don't guess an email silently.

If all three already exist, skip straight to Start/Stop.

## Start (default — no argument, or argument is not "stop")

1. Check if it's already running. Read `.claude/run-dev/dev.pid` directly (Read tool, or a plain `cat
   .claude/run-dev/dev.pid 2>/dev/null` — don't wrap it in `kill -0 "$(cat ...)"`, that inline
   substitution shape always requires manual approval). If the file doesn't exist, it's not running. If it
   does, take the literal PID value from the output and check it as its own plain command:
   ```bash
   kill -0 <literal PID> 2>/dev/null && echo "already running" || echo "not running"
   ```
   If already running, just re-extract and report the URL from the existing log (last step below) —
   don't start a second copy.

2. Otherwise, launch it detached and capture the real OS PID (not a Claude-session task ID — this must
   be killable from a fresh session too):
   ```bash
   mkdir -p .claude/run-dev
   nohup npm run dev > .claude/run-dev/dev.log 2>&1 &
   echo $! > .claude/run-dev/dev.pid
   disown 2>/dev/null || true
   ```

3. Poll the log (up to ~30s) until both the backend and frontend report ready. Use brace expansion
   (`{1..30}`), not `$(seq 1 30)` — both loop 30 times, but brace expansion isn't command substitution so
   it doesn't trip the manual-approval gate:
   ```bash
   for i in {1..30}; do
     grep -q 'Ready on http' .claude/run-dev/dev.log 2>/dev/null && \
     grep -q 'Local:' .claude/run-dev/dev.log 2>/dev/null && break
     sleep 1
   done
   ```

4. Extract the actual frontend URL (Vite falls back to another port if 5173 is taken — don't assume it):
   ```bash
   grep -o 'Local:   http://localhost:[0-9]*' .claude/run-dev/dev.log | tail -1
   ```
   Sanity-check auth works before handing the URL to the user:
   ```bash
   curl -s <that URL>/api/me
   ```
   If that returns `{"success":false,"error":"Unauthorized"}` instead of a user object, the
   `VITE_DEV_ACCESS_JWT` is missing/stale/pointed at a user that no longer exists in local D1 — fix
   under Prerequisites step 3, don't just hand over a broken URL.

5. Report the URL to the user as something to open in their own browser (this shell shares localhost
   with their real browser — it is not an isolated sandbox).

## Stop (argument is "stop")

Kill the whole process tree the pidfile points at — `npm run dev` → `concurrently` → three children
(jwks node process, `wrangler dev`, `vite`). Killing only the top PID can leave those orphaned, so walk
descendants first.

All of `npm run dev`'s descendants (`concurrently` → jwks/wrangler/vite → wrangler-cli → esbuild/workerd)
stay in one OS process group — confirmed empirically (2026-07-09): killing the *process group* the
pidfile's PID belongs to takes down every descendant in one shot, no recursive `pgrep` walk needed. This
also means the whole thing stays substitution-free — every step below is a plain command, reading the
previous step's plain-text output and splicing the literal value into the next call.

1. Read `.claude/run-dev/dev.pid` directly (Read tool, or plain `cat .claude/run-dev/dev.pid
   2>/dev/null`) to get the literal PID. If the file doesn't exist, report "not running" and stop here.
2. `kill -0 <literal PID> 2>/dev/null` — if this fails (non-zero exit), the pidfile was stale: report
   "pidfile was stale — process already gone", `rm -f .claude/run-dev/dev.pid`, and stop here.
3. `ps -o pgid= -p <literal PID>` — prints the process group ID as plain text. Take that literal number.
4. Kill the whole group and clean up:
   ```bash
   kill -TERM -- -<literal PGID> 2>/dev/null
   sleep 1
   kill -KILL -- -<literal PGID> 2>/dev/null || true
   rm -f .claude/run-dev/dev.pid
   echo "stopped"
   ```

Confirm the ports are actually free afterward (`lsof -i :8790 -i :8787 -sTCP:LISTEN -P` should be empty;
the frontend port varies, don't bother checking it) and report the result to the user in one line —
don't leave `.claude/run-dev/dev.log` around forever, but no need to delete it either (next start
overwrites it).

## Gotchas

- Don't use the Bash tool's own `run_in_background: true` for the start command — the `nohup ... &`
  pattern above already backgrounds it at the OS level and returns immediately, and critically produces
  a PID that survives independent of this Claude session, which a future `/run-dev stop` needs.
- Port 5173 may already be in use by something unrelated to this project (seen previously: a stray SSH
  tunnel) — Vite auto-falls back to 5174+, which is why the URL must be read from the log, never assumed.
- `frontend/.env.development.local` and `backend/.dev.vars` are both gitignored on purpose (real/test
  secrets) — never suggest committing them.
