// Thin launcher for `wrangler dev` (backend `npm run dev`): resolves ports, builds the
// args, spawns wrangler, forwards termination signals and propagates the exit code.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWranglerArgs } from './dev-args.mjs';
import { loadPorts } from './ports.mjs';

const { ports, source } = loadPorts();
const args = buildWranglerArgs({ ports, source });

const child = spawn('npx', ['wrangler', ...args], {
  cwd: fileURLToPath(new URL('../backend', import.meta.url)),
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  process.exit(code ?? 1);
});
