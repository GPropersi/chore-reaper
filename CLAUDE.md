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
