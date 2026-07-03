# Changelog — 07/03/2026

- [06:39] git-commit: Created the repo's initial commit (`37cb116`) — CLOUD_PLAN.md Phase 0/Phase 1 implementation plus lint/format/CI infra, 93 files. Pre-commit hook ran clean (no changes needed).
- [07:00] code-change: Renamed the project from "tasktracker" to "chore-reaper" (user's pick) — root `package.json` name, `backend/wrangler.toml` worker/D1 names, and every markdown reference (`README.md`, `CLOUDFLARE.md`, `CLOUD_PLAN.md`, `TRADEOFFS.md`, `CLAUDE.md`). Regenerated `package-lock.json` and `wrangler types`; reran the full backend/frontend/e2e suite plus lint/format — all clean. Local working directory and any GitHub remote are left untouched — this only covers in-repo naming.
