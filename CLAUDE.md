# tasktracker — Project Instructions

## Bootstrap phase — delete this section once it's no longer needed

This repo was freshly seeded and has no working code yet, only reference material — a fresh agent has
nothing to infer conventions from, so this section exists to bridge that gap. It is scaffolding, not
permanent project doctrine.

**Remove this entire section** the first time either becomes true:

1. `CLOUD_PLAN.md`'s tasks are substantially complete (Part A fully checked off, ideally Part B too), or
2. the codebase has grown enough of its own real structure — working tests, a running app, its own
   established conventions — that a fresh agent can pick those up directly from the code instead of
   needing this file to point the way.

If you're an agent reading this and either condition looks true, say so and ask before deleting it
rather than assuming — but do flag it; don't just leave stale bootstrap instructions sitting here
indefinitely. When it's removed, note it in this project's usual changelog/commit-message convention so
there's a record of why the file changed shape.

### Standing instructions while this section exists

- **Start here.** Before doing anything else, read `README.md`, `CLOUDFLARE.md`, and `CLOUD_PLAN.md` in
  the repo root. `CLOUD_PLAN.md` is the execution plan — work from it, don't re-derive the architecture
  from scratch.
- **Respect the `[A]`/`[B]` split.** Only work on `[A]`-tagged tasks unless explicitly told otherwise —
  `[B]` tasks require real Cloudflare account access (dashboard config, real D1/Pages/Access, deploy
  secrets) that may not be set up yet. A bare "continue the build" means the next unchecked `[A]` task,
  not `[B]`.
- **Follow the TDD cycle as written** — RED (failing test first), GREEN (minimal implementation),
  REFACTOR (only where the task calls for it). Tasks marked `Verify` instead are config/manual steps —
  don't force a fake red/green onto them.
- **`reference/express-backend/`** is read-only porting material from a sibling project (`chores4irl`).
  Don't modify it and don't try to keep it in sync with anything — it's a one-time snapshot, not a live
  dependency.
- **Check off tasks in `CLOUD_PLAN.md`** as they're completed (`- [ ]` → `- [x]`) so progress is visible
  across sessions without needing to re-read prior conversation history.
