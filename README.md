# Chore Reaper

Multi-tenant, cloud-hosted chore/task tracker on Cloudflare (Workers + Hono, D1, Pages, Access).

Seeded once from a sibling project (`chores4irl`) — no ongoing dependency on it.

- **`CLOUDFLARE.md`** — architecture and design rationale.
- **`CLOUD_PLAN.md`** — the execution plan: every task tagged `[A]` (buildable and testable with zero
  Cloudflare account access) or `[B]` (requires a real Cloudflare account). Start with Part A.
- **`TRADEOFFS.md`** — what this design costs relative to a fully local deployment, and why it was
  chosen anyway.
- **`reference/express-backend/`** — read-only reference copies of the sibling project's Express+SQLite
  backend, used as a porting guide for Phase 1. Not part of the buildable app; not kept in sync.

Nothing is built yet. See `CLOUD_PLAN.md`'s "Picking this up cold" section to start.
