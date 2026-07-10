# Chore Reaper

Multi-tenant, cloud-hosted chore/task tracker on Cloudflare (Workers + Hono, D1, Pages, Access).

Live at [chores.4irl.app](https://chores.4irl.app). Seeded once from a sibling project (`chores4irl`) —
no ongoing dependency on it.

- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — the full map: request flow, multi-tenancy/auth model,
  database, environments, CI/CD, and a "where to look for X" index. Read this first for any non-trivial
  change.
- **[`TRADEOFFS.md`](TRADEOFFS.md)** — what this cloud-native design costs relative to a fully local
  deployment, and why it was chosen anyway.

## Architecture at a glance

```mermaid
flowchart TD
    Browser["Browser (SPA)"]

    subgraph Edge["Cloudflare Edge"]
        Access["Cloudflare Access<br/>Zero Trust login, JWT issuance"]
    end

    subgraph Frontend["Cloudflare Pages"]
        SPA["React 19 + Vite + Tailwind<br/>PWA, offline outbox + cache"]
    end

    subgraph Backend["Cloudflare Worker (Hono)"]
        direction TB
        MW1["accessAuth<br/>verify JWT via JWKS"]
        MW2["householdScope<br/>resolve user → household → role"]
        MW3["requireGlobalAdmin<br/>/api/admin/* only"]
        Routes["Routes<br/>chores / rooms / households / members / me / admin"]
        DataAccess["Data-access layer<br/>chores.ts, rooms.ts, households.ts, ..."]
        MW1 --> MW2 --> Routes
        MW1 --> MW3 --> Routes
        Routes --> DataAccess
    end

    D1[("Cloudflare D1<br/>SQLite, household_id scoped")]
    AccessAPI["Cloudflare Access API<br/>allowlist grant/revoke"]

    Browser -->|"login redirect"| Access
    Access -->|"CF_Authorization cookie"| Browser
    Browser -->|"loads app"| SPA
    SPA -->|"apiFetch(): /api/* + X-Household-Id"| Access
    Access -->|"attaches Cf-Access-Jwt-Assertion"| MW1
    DataAccess --> D1
    DataAccess -.->|"auto-provision on new member"| AccessAPI
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full request-flow walkthrough, the multi-tenancy/auth
model, database schema notes, and local dev / production environment details.
