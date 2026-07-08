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
    'DELETE FROM chores; DELETE FROM rooms; DELETE FROM household_members; DELETE FROM users; DELETE FROM households;',
  ]);
  wrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--command',
    "INSERT INTO households (id, name, timezone) VALUES (1, 'E2E Household', 'UTC'); " +
      "INSERT INTO users (id, email, timezone, is_admin) VALUES (1, 'admin-e2e@example.com', 'America/Los_Angeles', 1); " +
      "INSERT INTO users (id, email, timezone, is_admin) VALUES (2, 'member-e2e@example.com', 'Europe/London', 0); " +
      'INSERT INTO household_members (user_id, household_id) VALUES (1, 1); ' +
      'INSERT INTO household_members (user_id, household_id) VALUES (2, 1); ' +
      "INSERT INTO rooms (id, household_id, name) VALUES (1, 1, 'Living Room'); " +
      "INSERT INTO rooms (id, household_id, name) VALUES (2, 1, 'Kitchen'); " +
      "INSERT INTO chores (household_id, name, room_id, date_last_completed, duration, frequency, version) VALUES (1, 'Vacuum', 1, '2026-06-01T00:00:00.000Z', 20, 7, 1); " +
      "INSERT INTO chores (household_id, name, room_id, date_last_completed, duration, frequency, version) VALUES (1, 'Dishes', 2, '2026-06-20T00:00:00.000Z', 5, 1, 1);",
  ]);
}
