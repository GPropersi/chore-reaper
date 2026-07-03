import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Setup files run outside per-test-file storage isolation and may run
// multiple times; applyD1Migrations() only applies unapplied migrations, so
// repeat calls here are safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
