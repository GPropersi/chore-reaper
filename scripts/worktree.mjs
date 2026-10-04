// Standalone worktree lifecycle for tasktracker (also the owned `worktree-new` /
// `worktree-rm` targets that the stronghold's wt.sh dispatches to).
//
//   node scripts/worktree.mjs new --name <slug> [--branch <b>] [--base <ref>]   (run from the primary)
//   node scripts/worktree.mjs rm                                                (run inside the worktree)
//
// Every git call goes through execFileSync with an argument array (no shell), so branch
// names and paths are always data.

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEnvFile, parseEnvFile, probePort, resolvePorts } from './ports.mjs';

const REPO_NAMES = new Set(['tasktracker', 'chore-reaper']);
const LINK_FILES = ['backend/.dev.vars', 'frontend/.env.development.local'];
const LOCK_NAME = 'tt-worktree-slot.lock';
const LOCK_GRACE_MS = 5000;

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOk(cwd, args) {
  try {
    runGit(cwd, args);
    return true;
  } catch {
    return false;
  }
}

function commonDir(root) {
  return runGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
}

function worktreesDir(primaryRoot) {
  return path.join(primaryRoot, '.claude', 'worktrees');
}

/** Lowercase, non-[a-z0-9-] to '-', strip leading '-', cut to 40, strip trailing '-'. */
export function dnsSlug(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  if (!slug) throw new Error(`slug is empty after normalizing ${JSON.stringify(value)}`);
  return slug;
}

function defaultBranch(primaryRoot) {
  const file = path.join(primaryRoot, 'CLAUDE.md');
  if (existsSync(file)) {
    const match = readFileSync(file, 'utf8').match(/^- \*\*Default branch:\*\*\s*`([^`]+)`/m);
    if (match) return match[1];
  }
  return 'main';
}

/** Treat an empty string (what make passes for an omitted arg) as unset. */
export function parseWorktreeArgs(env) {
  const pick = (key) => (env[key] === undefined || env[key] === '' ? undefined : env[key]);
  return { name: pick('WT_NAME'), branch: pick('WT_BRANCH'), base: pick('WT_BASE') };
}

/**
 * Validate a `new` request and decide how the branch is checked out. Pure validation:
 * runs no git mutation. Returns { slug, branch, base, path, mode: 'local'|'remote'|'new' }.
 */
export function planNew({ primaryRoot, name, branch, base }) {
  const rawName = name ?? (branch ? dnsSlug(branch) : undefined);
  if (!rawName) throw new Error('a name or branch is required');
  const slug = dnsSlug(rawName);
  const branchName = branch ?? rawName;

  if (REPO_NAMES.has(slug) || slug === path.basename(primaryRoot)) {
    throw new Error(`refused slug "${slug}": it collides with the repo name (tasktracker / chore-reaper)`);
  }
  const wtPath = path.join(worktreesDir(primaryRoot), slug);
  if (existsSync(wtPath)) throw new Error(`worktree ${wtPath} already exists`);

  // The explicit '-' guard stops a branch name from being parsed as a git option.
  if (branchName.startsWith('-') || !gitOk(primaryRoot, ['check-ref-format', '--branch', branchName])) {
    throw new Error(`invalid branch name ${JSON.stringify(branchName)}`);
  }

  let mode = 'new';
  const baseRef = base ?? `origin/${defaultBranch(primaryRoot)}`;
  if (gitOk(primaryRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`])) {
    mode = 'local';
  } else if (gitOk(primaryRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`])) {
    mode = 'remote';
  } else if (!gitOk(primaryRoot, ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`])) {
    throw new Error(`base ref ${baseRef} not found: run git fetch origin (or pass base=<existing ref>)`);
  }

  return { slug, branch: branchName, base: baseRef, path: wtPath, mode };
}

function excludeWorktreeEnv(primaryRoot) {
  const file = path.join(commonDir(primaryRoot), 'info', 'exclude');
  mkdirSync(path.dirname(file), { recursive: true });
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (existing.split('\n').includes('/.worktree.env')) return;
  appendFileSync(file, `${existing === '' || existing.endsWith('\n') ? '' : '\n'}/.worktree.env\n`);
}

/** Create the worktree for a plan from planNew and ignore .worktree.env via info/exclude. */
export function createWorktree({ primaryRoot, plan }) {
  mkdirSync(worktreesDir(primaryRoot), { recursive: true });
  excludeWorktreeEnv(primaryRoot);
  if (plan.mode === 'local') {
    runGit(primaryRoot, ['worktree', 'add', plan.path, plan.branch]);
  } else if (plan.mode === 'remote') {
    runGit(primaryRoot, [
      'worktree',
      'add',
      '--track',
      '-b',
      plan.branch,
      plan.path,
      `origin/${plan.branch}`,
    ]);
  } else {
    runGit(primaryRoot, ['worktree', 'add', '--no-track', '-b', plan.branch, plan.path, plan.base]);
  }
}

/** Symlink the untracked config files from the primary; never clobber a real file. */
export function linkFiles({ primaryRoot, worktreeRoot, warn = console.warn }) {
  for (const rel of LINK_FILES) {
    const source = path.join(primaryRoot, rel);
    const dest = path.join(worktreeRoot, rel);
    mkdirSync(path.dirname(dest), { recursive: true });

    let destExists = true;
    try {
      lstatSync(dest);
    } catch {
      destExists = false;
    }
    if (destExists) {
      if (lstatSync(dest).isSymbolicLink() && readlinkSync(dest) === source) continue;
      warn(`worktree: ${rel} already exists in the worktree, leaving it alone`);
      continue;
    }

    if (existsSync(source)) {
      symlinkSync(source, dest);
    } else if (rel === 'backend/.dev.vars' && existsSync(`${dest}.example`)) {
      copyFileSync(`${dest}.example`, dest);
    } else {
      warn(`worktree: ${rel} not found in the primary, skipping`);
    }
  }
}

/** Remove a worktree with a non-force `git worktree remove`; never deletes the branch. */
export function removeWorktree({ worktreeRoot }) {
  const root = realpathSync(worktreeRoot);
  const primaryRoot = path.dirname(realpathSync(commonDir(root)));
  if (root === primaryRoot) throw new Error('refusing to remove the primary checkout');
  if (!root.startsWith(`${worktreesDir(primaryRoot)}${path.sep}`)) {
    throw new Error(`refusing to remove ${root}: not under ${worktreesDir(primaryRoot)}`);
  }
  runGit(primaryRoot, ['worktree', 'remove', root]);
}

/** Atomically write <dir>/.worktree.env with mode 0600. */
export function writeWorktreeEnv({ dir, slug, primaryRoot, ports }) {
  const file = path.join(dir, '.worktree.env');
  const tmp = `${file}.tmp-${process.pid}`;
  const content = formatEnvFile({
    SLUG: slug,
    PRIMARY_ROOT: primaryRoot,
    IS_PRIMARY: 0,
    TT_SLOT: ports.TT_SLOT,
    TT_JWKS_PORT: ports.TT_JWKS_PORT,
    TT_BACKEND_PORT: ports.TT_BACKEND_PORT,
    TT_FRONTEND_PORT: ports.TT_FRONTEND_PORT,
  });
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, file);
}

/** TT_SLOT values recorded by sibling worktrees. */
export function readClaimedSlots(primaryRoot) {
  const slots = new Set();
  const dir = worktreesDir(primaryRoot);
  if (!existsSync(dir)) return slots;
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry, '.worktree.env');
    if (!existsSync(file)) continue;
    try {
      const slot = parseEnvFile(readFileSync(file, 'utf8')).TT_SLOT;
      if (/^\d+$/.test(slot ?? '')) slots.add(Number(slot));
    } catch {
      // unreadable env file: skip
    }
  }
  return slots;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function isFreshLock(lock) {
  try {
    return Date.now() - statSync(lock).mtimeMs < LOCK_GRACE_MS;
  } catch {
    return false;
  }
}

/**
 * Claim the slot lock: exclusive mkdir of <git-common-dir>/tt-worktree-slot.lock holding a
 * pid file. A lock whose pid is dead, or missing/unparsable and older than LOCK_GRACE_MS, is
 * cleared and retried once.
 * Returns release().
 */
export function acquireSlotLock(primaryRoot) {
  const lock = path.join(commonDir(primaryRoot), LOCK_NAME);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(lock);
      writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
      return () => rmSync(lock, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let pid = NaN;
      try {
        pid = Number.parseInt(readFileSync(path.join(lock, 'pid'), 'utf8'), 10);
      } catch {
        // missing pid file: stale unless the lock is brand new (see grace below)
      }
      if (Number.isInteger(pid) && pid > 0 && pidAlive(pid)) break;
      // A fresh lock with no readable pid yet is a racing holder between mkdir and its pid
      // write: count it as held rather than clearing it.
      if (!(Number.isInteger(pid) && pid > 0) && isFreshLock(lock)) break;
      rmSync(lock, { recursive: true, force: true });
    }
  }
  throw new Error(
    `another worktree-new is running (lock: ${lock}); if none is, remove that directory and retry`,
  );
}

function defaultRunSetup({ worktreeRoot }) {
  execFileSync('make', ['-C', worktreeRoot, 'install', 'migrate-local'], { stdio: 'inherit' });
}

/** Create a worktree end to end: plan, create, link, slot + ports under lock, env file, setup. */
export async function newWorktree({
  primaryRoot,
  name,
  branch,
  base,
  isFree = probePort,
  runSetup = defaultRunSetup,
}) {
  const plan = planNew({ primaryRoot, name, branch, base });
  createWorktree({ primaryRoot, plan });
  linkFiles({ primaryRoot, worktreeRoot: plan.path });

  const release = acquireSlotLock(primaryRoot);
  let ports;
  try {
    ports = await resolvePorts({
      slug: plan.slug,
      claimedSlots: readClaimedSlots(primaryRoot),
      isFree,
    });
    writeWorktreeEnv({ dir: plan.path, slug: plan.slug, primaryRoot, ports });
  } catch (err) {
    throw new Error(
      `worktree created at ${plan.path} but port/env setup failed: ${err.message}\n` +
        `  discard it:   make -C ${plan.path} worktree-rm`,
      { cause: err },
    );
  } finally {
    release();
  }

  try {
    await runSetup({ worktreeRoot: plan.path });
  } catch (err) {
    throw new Error(
      `worktree created at ${plan.path} but setup failed: ${err.message}\n` +
        `  retry setup:  make -C ${plan.path} install migrate-local\n` +
        `  discard it:   make -C ${plan.path} worktree-rm`,
      { cause: err },
    );
  }
  return { path: plan.path, branch: plan.branch, ports };
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--name', '--branch', '--base'].includes(key) || argv[i + 1] === undefined) {
      throw new Error(`unexpected argument ${JSON.stringify(key)}`);
    }
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'new') {
    const args = { ...parseWorktreeArgs(process.env), ...parseFlags(rest) };
    const primaryRoot = path.dirname(realpathSync(commonDir(process.cwd())));
    const result = await newWorktree({ primaryRoot, ...args });
    const { TT_SLOT, TT_JWKS_PORT, TT_BACKEND_PORT, TT_FRONTEND_PORT } = result.ports;
    console.log(
      `worktree: created ${result.path} on branch ${result.branch} ` +
        `(slot=${TT_SLOT} jwks=${TT_JWKS_PORT} backend=${TT_BACKEND_PORT} frontend=${TT_FRONTEND_PORT})`,
    );
  } else if (command === 'rm') {
    const worktreeRoot = runGit(process.cwd(), ['rev-parse', '--show-toplevel']);
    removeWorktree({ worktreeRoot });
    console.log(`worktree: removed ${worktreeRoot} (branch kept)`);
  } else {
    throw new Error('usage: node scripts/worktree.mjs new --name <slug> [--branch <b>] [--base <ref>] | rm');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`worktree: ${err.message}`);
    process.exitCode = 1;
  });
}
