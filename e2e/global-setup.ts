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
    'DELETE FROM chores; DELETE FROM users; DELETE FROM organizations;',
  ]);
  wrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--command',
    "INSERT INTO organizations (id, name, timezone) VALUES (1, 'E2E Org', 'UTC'); " +
      "INSERT INTO users (id, organization_id, email, role) VALUES (1, 1, 'admin-e2e@example.com', 'admin'); " +
      "INSERT INTO users (id, organization_id, email, role) VALUES (2, 1, 'member-e2e@example.com', 'member');",
  ]);
}
