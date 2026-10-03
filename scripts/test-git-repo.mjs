import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_IDENTITY = [
  '-c',
  'user.name=test',
  '-c',
  'user.email=test@example.invalid',
  '-c',
  'commit.gpgsign=false',
];

/** Run git with an argument array (no shell) and a fixed test identity. */
export function git(cwd, args) {
  return execFileSync('git', [...GIT_IDENTITY, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Create a throwaway git repo (one commit on `main`) inside a fresh temp dir.
 * With `withOrigin`, also creates a bare `origin.git`, pushes `main` and fetches,
 * so `origin/main` exists. Returns `{ root, originRoot, cleanup }`.
 */
export function makeTempRepo({ dirName, withOrigin } = {}) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tt-repo-')));
  const root = path.join(parent, dirName ?? 'repo');
  mkdirSync(root);
  git(root, ['init', '-b', 'main']);
  git(root, ['commit', '--allow-empty', '-m', 'initial']);

  let originRoot = null;
  if (withOrigin) {
    originRoot = path.join(parent, 'origin.git');
    mkdirSync(originRoot);
    git(originRoot, ['init', '--bare', '-b', 'main']);
    git(root, ['remote', 'add', 'origin', originRoot]);
    git(root, ['push', 'origin', 'main']);
    git(root, ['fetch', 'origin']);
  }

  return {
    root,
    originRoot,
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  };
}
