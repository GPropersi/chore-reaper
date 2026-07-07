import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('../backend', import.meta.url));

function wrangler(args: string[]) {
  execFileSync('npx', ['wrangler', ...args], { cwd: backendDir, stdio: 'inherit' });
}

export default function globalSetup() {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--local']);
  wrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--command',
    'DELETE FROM chores; DELETE FROM rooms; DELETE FROM users; DELETE FROM organizations;',
  ]);
  wrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--command',
    "INSERT INTO organizations (id, name, timezone) VALUES (1, 'E2E Org', 'UTC'); " +
      "INSERT INTO users (id, organization_id, email, role, timezone) VALUES (1, 1, 'admin-e2e@example.com', 'admin', 'America/Los_Angeles'); " +
      "INSERT INTO users (id, organization_id, email, role, timezone) VALUES (2, 1, 'member-e2e@example.com', 'member', 'Europe/London'); " +
      "INSERT INTO rooms (id, organization_id, name) VALUES (1, 1, 'Living Room'); " +
      "INSERT INTO rooms (id, organization_id, name) VALUES (2, 1, 'Kitchen'); " +
      "INSERT INTO chores (organization_id, name, room_id, date_last_completed, duration, frequency, version) VALUES (1, 'Vacuum', 1, '2026-06-01T00:00:00.000Z', 20, 7, 1); " +
      "INSERT INTO chores (organization_id, name, room_id, date_last_completed, duration, frequency, version) VALUES (1, 'Dishes', 2, '2026-06-20T00:00:00.000Z', 5, 1, 1);",
  ]);
}
