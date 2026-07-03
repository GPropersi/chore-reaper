import { existsSync, copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gitDir = path.join(repoRoot, '.git');
const hooksSrcDir = path.join(repoRoot, 'scripts', 'git-hooks');
const hooksDestDir = path.join(gitDir, 'hooks');

if (!existsSync(gitDir)) {
  // Not a git checkout (e.g. installed as a dependency) — nothing to do.
  process.exit(0);
}

mkdirSync(hooksDestDir, { recursive: true });

for (const hookName of ['pre-commit']) {
  const src = path.join(hooksSrcDir, hookName);
  const dest = path.join(hooksDestDir, hookName);
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  console.log(`Installed .git/hooks/${hookName}`);
}
