import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { git, makeTempRepo } from './test-git-repo.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.join(scriptsDir, 'install-git-hooks.mjs');
const HOOK = path.join(scriptsDir, 'git-hooks', 'pre-commit');

const cleanups = [];
after(() => {
  for (const cleanup of cleanups) cleanup();
});

/** Copy the installer and hook into `<dir>/scripts/` at the same relative paths. */
function copyInstaller(dir) {
  const scripts = path.join(dir, 'scripts');
  fs.mkdirSync(path.join(scripts, 'git-hooks'), { recursive: true });
  fs.copyFileSync(INSTALLER, path.join(scripts, 'install-git-hooks.mjs'));
  fs.copyFileSync(HOOK, path.join(scripts, 'git-hooks', 'pre-commit'));
  return path.join(scripts, 'install-git-hooks.mjs');
}

function runInstaller(installerPath, cwd) {
  return execFileSync('node', [installerPath], { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function hooksDir(cwd) {
  return git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
}

function assertExecutable(file) {
  assert.ok(fs.existsSync(file), `${file} should exist`);
  fs.accessSync(file, fs.constants.X_OK);
}

function makeRepoWithInstaller() {
  const repo = makeTempRepo();
  cleanups.push(repo.cleanup);
  copyInstaller(repo.root);
  git(repo.root, ['add', '.']);
  git(repo.root, ['commit', '-m', 'add installer']);
  return repo;
}

describe('install-git-hooks', () => {
  it('installs into the common hooks dir from a linked worktree', () => {
    const repo = makeRepoWithInstaller();
    const worktree = path.join(path.dirname(repo.root), 'linked');
    git(repo.root, ['worktree', 'add', '--no-track', '-b', 'wt-branch', worktree]);
    assert.ok(fs.statSync(path.join(worktree, '.git')).isFile());

    runInstaller(path.join(worktree, 'scripts', 'install-git-hooks.mjs'), worktree);

    assertExecutable(path.join(hooksDir(worktree), 'pre-commit'));
  });

  it('still installs into .git/hooks in the primary checkout', () => {
    const repo = makeRepoWithInstaller();

    runInstaller(path.join(repo.root, 'scripts', 'install-git-hooks.mjs'), repo.root);

    assertExecutable(path.join(repo.root, '.git', 'hooks', 'pre-commit'));
  });

  it('writes nothing outside a git repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-nogit-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const installer = copyInstaller(dir);

    const output = runInstaller(installer, dir);

    assert.doesNotMatch(output, /Installed/);
    assert.equal(fs.existsSync(path.join(dir, '.git')), false);
    assert.equal(fs.existsSync(path.join(dir, 'hooks')), false);
  });

  it('does not install into the enclosing repo from a nested dir without .git', () => {
    const repo = makeRepoWithInstaller();
    const nested = path.join(repo.root, 'nested');
    const installer = copyInstaller(nested);

    runInstaller(installer, nested);

    assert.equal(fs.existsSync(path.join(hooksDir(repo.root), 'pre-commit')), false);
  });

  it('does not install into the enclosing repo from a nested dir with an empty .git', () => {
    const repo = makeRepoWithInstaller();
    const nested = path.join(repo.root, 'nested');
    const installer = copyInstaller(nested);
    fs.mkdirSync(path.join(nested, '.git'));

    runInstaller(installer, nested);

    assert.equal(fs.existsSync(path.join(hooksDir(repo.root), 'pre-commit')), false);
  });
});
