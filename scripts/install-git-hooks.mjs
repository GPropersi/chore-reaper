import { execFileSync } from 'node:child_process';
import { existsSync, copyFileSync, chmodSync, mkdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gitDir = path.join(repoRoot, '.git');
const hooksSrcDir = path.join(repoRoot, 'scripts', 'git-hooks');

if (!existsSync(gitDir)) {
  // Not a git checkout (e.g. installed as a dependency) — nothing to do.
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let hooksDestDir;
try {
  // Skip when this checkout's git root is an enclosing repo (e.g. an empty `.git`
  // directory makes git resolve the parent repo), so we never write into it.
  if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(repoRoot)) {
    process.exit(0);
  }
  // `.git` is a file in a linked worktree, so ask git where hooks live.
  hooksDestDir = git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
} catch {
  // Not a usable git repo (e.g. tarball install) — skip quietly.
  process.exit(0);
}

mkdirSync(hooksDestDir, { recursive: true });

for (const hookName of ['pre-commit']) {
  const src = path.join(hooksSrcDir, hookName);
  const dest = path.join(hooksDestDir, hookName);
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  console.log(`Installed ${dest}`);
}
