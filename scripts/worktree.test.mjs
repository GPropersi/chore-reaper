import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './ports.mjs';
import { git, makeTempRepo } from './test-git-repo.mjs';
import {
  acquireSlotLock,
  createWorktree,
  dnsSlug,
  linkFiles,
  newWorktree,
  parseWorktreeArgs,
  planNew,
  readClaimedSlots,
  removeWorktree,
  writeWorktreeEnv,
} from './worktree.mjs';

const cleanups = [];
after(() => {
  for (const fn of cleanups) fn();
});

/** A fake primary named `tasktracker` with an origin and the two linkable files. */
function primaryWithOrigin() {
  const repo = makeTempRepo({ dirName: 'tasktracker', withOrigin: true });
  cleanups.push(repo.cleanup);
  return repo;
}

function commonDir(root) {
  return git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
}

const allFree = () => true;

describe('dnsSlug', () => {
  it('lowercases, replaces invalid chars, strips edges, cuts to 40', () => {
    assert.equal(dnsSlug('Feat/Foo_Bar'), 'feat-foo-bar');
    assert.equal(dnsSlug('--abc'), 'abc');
    assert.equal(dnsSlug('a'.repeat(45)), 'a'.repeat(40));
    assert.equal(dnsSlug(`${'a'.repeat(39)}/b`), 'a'.repeat(39));
  });

  it('throws on an empty result', () => {
    assert.throws(() => dnsSlug('---'), /empty/i);
    assert.throws(() => dnsSlug(''), /empty/i);
  });
});

describe('planNew', () => {
  it('defaults name from branch and branch from name', () => {
    const { root } = primaryWithOrigin();
    const a = planNew({ primaryRoot: root, branch: 'feat/x' });
    assert.equal(a.slug, 'feat-x');
    assert.equal(a.branch, 'feat/x');
    const b = planNew({ primaryRoot: root, name: 'proof-a' });
    assert.equal(b.branch, 'proof-a');
    assert.equal(b.path, path.join(root, '.claude', 'worktrees', 'proof-a'));
    assert.equal(b.base, 'origin/main');
  });

  it('refuses a slug equal to the primary basename or chore-reaper', () => {
    const { root } = primaryWithOrigin();
    assert.throws(() => planNew({ primaryRoot: root, name: 'tasktracker' }), /tasktracker/);
    assert.throws(() => planNew({ primaryRoot: root, name: 'chore-reaper' }), /chore-reaper/);
  });

  it('refuses an existing worktree dir and bad branch names', () => {
    const { root } = primaryWithOrigin();
    mkdirSync(path.join(root, '.claude', 'worktrees', 'taken'), { recursive: true });
    assert.throws(() => planNew({ primaryRoot: root, name: 'taken' }), /exists/);
    assert.throws(() => planNew({ primaryRoot: root, name: 'ok', branch: '-bad' }), /branch/);
    assert.throws(() => planNew({ primaryRoot: root, name: 'ok', branch: 'a@{b' }), /branch/);
    assert.throws(() => planNew({ primaryRoot: root, name: 'ok', branch: 'a..b' }), /branch/);
  });

  it('rejects a missing base ref before any git mutation, naming git fetch', () => {
    const repo = makeTempRepo({ dirName: 'tasktracker' });
    cleanups.push(repo.cleanup);
    const excludeFile = path.join(commonDir(repo.root), 'info', 'exclude');
    const before = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : null;
    assert.throws(() => planNew({ primaryRoot: repo.root, name: 'proof' }), /git fetch/);
    assert.equal(existsSync(path.join(repo.root, '.claude', 'worktrees', 'proof')), false);
    assert.equal(git(repo.root, ['branch', '--list', 'proof']), '');
    const after = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : null;
    assert.equal(after, before);
  });

  it('skips the base check when the branch already exists locally', () => {
    const repo = makeTempRepo({ dirName: 'tasktracker' });
    cleanups.push(repo.cleanup);
    git(repo.root, ['branch', 'existing']);
    const plan = planNew({ primaryRoot: repo.root, name: 'existing' });
    assert.equal(plan.mode, 'local');
  });
});

describe('createWorktree', () => {
  it('creates a new branch from origin/main with no tracking', () => {
    const { root } = primaryWithOrigin();
    const plan = planNew({ primaryRoot: root, name: 'proof-a', branch: 'proof/a' });
    createWorktree({ primaryRoot: root, plan });
    assert.equal(git(plan.path, ['branch', '--show-current']), 'proof/a');
    assert.equal(git(root, ['for-each-ref', '--format=%(upstream)', 'refs/heads/proof/a']), '');
  });

  it('checks out an existing local branch', () => {
    const { root } = primaryWithOrigin();
    git(root, ['branch', 'loc']);
    const plan = planNew({ primaryRoot: root, name: 'loc' });
    createWorktree({ primaryRoot: root, plan });
    assert.equal(git(plan.path, ['branch', '--show-current']), 'loc');
  });

  it('adds a tracking worktree for origin/<branch>', () => {
    const { root } = primaryWithOrigin();
    git(root, ['branch', 'remote-only']);
    git(root, ['push', 'origin', 'remote-only']);
    git(root, ['branch', '-D', 'remote-only']);
    git(root, ['fetch', 'origin']);
    const plan = planNew({ primaryRoot: root, name: 'remote-only' });
    assert.equal(plan.mode, 'remote');
    createWorktree({ primaryRoot: root, plan });
    assert.equal(git(plan.path, ['branch', '--show-current']), 'remote-only');
    assert.equal(git(root, ['config', '--get', 'branch.remote-only.remote']), 'origin');
  });

  it('excludes .worktree.env idempotently via info/exclude', () => {
    const { root } = primaryWithOrigin();
    const excludeFile = path.join(commonDir(root), 'info', 'exclude');
    const planA = planNew({ primaryRoot: root, name: 'a' });
    createWorktree({ primaryRoot: root, plan: planA });
    const planB = planNew({ primaryRoot: root, name: 'b' });
    createWorktree({ primaryRoot: root, plan: planB });
    const lines = readFileSync(excludeFile, 'utf8')
      .split('\n')
      .filter((l) => l === '/.worktree.env');
    assert.equal(lines.length, 1);
    writeFileSync(path.join(planA.path, '.worktree.env'), 'X=1\n');
    assert.equal(git(planA.path, ['status', '--porcelain']), '');
  });
});

describe('linkFiles', () => {
  it('symlinks, never clobbers, skips correct links, copies .dev.vars.example fallback', () => {
    const { root } = primaryWithOrigin();
    const plan = planNew({ primaryRoot: root, name: 'lnk' });
    createWorktree({ primaryRoot: root, plan });
    const wt = plan.path;
    mkdirSync(path.join(root, 'backend'), { recursive: true });
    mkdirSync(path.join(root, 'frontend'), { recursive: true });
    mkdirSync(path.join(wt, 'backend'), { recursive: true });
    mkdirSync(path.join(wt, 'frontend'), { recursive: true });
    writeFileSync(path.join(root, 'backend', '.dev.vars'), 'A=1\n');

    const warnings = [];
    linkFiles({ primaryRoot: root, worktreeRoot: wt, warn: (m) => warnings.push(m) });
    const devVars = path.join(wt, 'backend', '.dev.vars');
    assert.ok(lstatSync(devVars).isSymbolicLink());
    assert.equal(readlinkSync(devVars), path.join(root, 'backend', '.dev.vars'));
    // frontend source missing -> warn and skip
    assert.equal(existsSync(path.join(wt, 'frontend', '.env.development.local')), false);
    assert.equal(warnings.length, 1);

    // idempotent
    linkFiles({ primaryRoot: root, worktreeRoot: wt, warn: () => {} });
    assert.ok(lstatSync(devVars).isSymbolicLink());

    // never clobber a real file
    writeFileSync(path.join(root, 'frontend', '.env.development.local'), 'B=1\n');
    writeFileSync(path.join(wt, 'frontend', '.env.development.local'), 'REAL\n');
    linkFiles({ primaryRoot: root, worktreeRoot: wt, warn: () => {} });
    assert.equal(lstatSync(path.join(wt, 'frontend', '.env.development.local')).isSymbolicLink(), false);
    assert.equal(readFileSync(path.join(wt, 'frontend', '.env.development.local'), 'utf8'), 'REAL\n');

    // no primary .dev.vars -> copy the example instead
    const plan2 = planNew({ primaryRoot: root, name: 'lnk2' });
    createWorktree({ primaryRoot: root, plan: plan2 });
    mkdirSync(path.join(plan2.path, 'backend'), { recursive: true });
    writeFileSync(path.join(plan2.path, 'backend', '.dev.vars.example'), 'EX=1\n');
    rmSync(path.join(root, 'backend', '.dev.vars'));
    linkFiles({ primaryRoot: root, worktreeRoot: plan2.path, warn: () => {} });
    const copied = path.join(plan2.path, 'backend', '.dev.vars');
    assert.equal(lstatSync(copied).isSymbolicLink(), false);
    assert.equal(readFileSync(copied, 'utf8'), 'EX=1\n');
  });
});

describe('removeWorktree', () => {
  it('removes a clean worktree along with ignored state, keeps the branch', () => {
    const { root } = primaryWithOrigin();
    const plan = planNew({ primaryRoot: root, name: 'rm-ok', branch: 'rm/ok' });
    createWorktree({ primaryRoot: root, plan });
    mkdirSync(path.join(plan.path, 'backend', '.wrangler'), { recursive: true });
    writeFileSync(path.join(plan.path, '.worktree.env'), 'TT_SLOT=1\n');
    removeWorktree({ worktreeRoot: plan.path });
    assert.equal(existsSync(plan.path), false);
    assert.equal(git(root, ['branch', '--list', 'rm/ok']).includes('rm/ok'), true);
    assert.equal(git(root, ['worktree', 'list']).includes('rm-ok'), false);
  });

  it('a refused remove leaves all state intact', () => {
    const { root } = primaryWithOrigin();
    const plan = planNew({ primaryRoot: root, name: 'rm-dirty' });
    createWorktree({ primaryRoot: root, plan });
    mkdirSync(path.join(plan.path, 'backend', '.wrangler'), { recursive: true });
    writeFileSync(path.join(plan.path, '.worktree.env'), 'TT_SLOT=1\n');
    writeFileSync(path.join(plan.path, 'untracked.txt'), 'x\n');
    assert.throws(() => removeWorktree({ worktreeRoot: plan.path }));
    assert.ok(existsSync(plan.path));
    assert.ok(existsSync(path.join(plan.path, 'backend', '.wrangler')));
    assert.ok(existsSync(path.join(plan.path, '.worktree.env')));
  });

  it('refuses the primary and paths outside .claude/worktrees', () => {
    const { root } = primaryWithOrigin();
    assert.throws(() => removeWorktree({ worktreeRoot: root }), /primary|worktrees/);
    const outside = path.join(path.dirname(root), 'outside');
    git(root, ['worktree', 'add', '--no-track', '-b', 'outside', outside, 'origin/main']);
    assert.throws(() => removeWorktree({ worktreeRoot: outside }), /worktrees/);
  });
});

describe('parseWorktreeArgs', () => {
  it('reads WT_* and treats empty strings as unset', () => {
    assert.deepEqual(parseWorktreeArgs({ WT_NAME: 'n', WT_BRANCH: '', WT_BASE: '' }), {
      name: 'n',
      branch: undefined,
      base: undefined,
    });
  });

  it('returns hostile values verbatim as data', () => {
    const v = `it's "q" $(rm -rf /) a b`;
    assert.equal(parseWorktreeArgs({ WT_NAME: v }).name, v);
  });
});

describe('writeWorktreeEnv', () => {
  it('writes 0600, round-trips, leaves no temp file', () => {
    const { root } = primaryWithOrigin();
    const dir = path.join(root, 'sub');
    mkdirSync(dir);
    writeWorktreeEnv({
      dir,
      slug: 'sub',
      primaryRoot: root,
      ports: { TT_JWKS_PORT: 8791, TT_BACKEND_PORT: 8788, TT_FRONTEND_PORT: 5174, TT_SLOT: 1 },
    });
    const file = path.join(dir, '.worktree.env');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const parsed = parseEnvFile(readFileSync(file, 'utf8'));
    assert.equal(parsed.SLUG, 'sub');
    assert.equal(parsed.PRIMARY_ROOT, root);
    assert.equal(parsed.IS_PRIMARY, '0');
    assert.equal(parsed.TT_SLOT, '1');
    assert.equal(parsed.TT_JWKS_PORT, '8791');
    assert.equal(parsed.TT_BACKEND_PORT, '8788');
    assert.equal(parsed.TT_FRONTEND_PORT, '5174');
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.startsWith('.worktree.env')),
      ['.worktree.env'],
    );
  });
});

describe('readClaimedSlots', () => {
  it('collects TT_SLOT from sibling env files and skips junk', () => {
    const { root } = primaryWithOrigin();
    const wts = path.join(root, '.claude', 'worktrees');
    for (const [name, content] of [
      ['a', 'TT_SLOT=5\n'],
      ['b', 'TT_SLOT=9\n'],
      ['c', 'garbage'],
      ['d', 'TT_SLOT=abc\n'],
    ]) {
      mkdirSync(path.join(wts, name), { recursive: true });
      writeFileSync(path.join(wts, name, '.worktree.env'), content);
    }
    mkdirSync(path.join(wts, 'nofile'));
    assert.deepEqual([...readClaimedSlots(root)].sort(), [5, 9]);
  });

  it('returns an empty set with no worktrees dir', () => {
    const { root } = primaryWithOrigin();
    assert.equal(readClaimedSlots(root).size, 0);
  });
});

describe('acquireSlotLock', () => {
  it('claims atomically, writes pid, releases', () => {
    const { root } = primaryWithOrigin();
    const lock = path.join(commonDir(root), 'tt-worktree-slot.lock');
    const release = acquireSlotLock(root);
    assert.ok(existsSync(lock));
    assert.equal(readFileSync(path.join(lock, 'pid'), 'utf8').trim(), String(process.pid));
    assert.throws(() => acquireSlotLock(root), /another worktree-new/);
    release();
    assert.equal(existsSync(lock), false);
  });

  it('clears a stale lock (dead or unparsable pid)', () => {
    const { root } = primaryWithOrigin();
    const lock = path.join(commonDir(root), 'tt-worktree-slot.lock');
    mkdirSync(lock);
    writeFileSync(path.join(lock, 'pid'), '2147483646\n');
    const r1 = acquireSlotLock(root);
    r1();
    mkdirSync(lock);
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    const r2 = acquireSlotLock(root);
    r2();
    assert.equal(existsSync(lock), false);
  });

  it('does not clear a fresh lock that has no pid yet', () => {
    const { root } = primaryWithOrigin();
    const lock = path.join(commonDir(root), 'tt-worktree-slot.lock');
    mkdirSync(lock);
    assert.throws(() => acquireSlotLock(root), /another worktree-new/);
    assert.ok(existsSync(lock));
  });
});

describe('worktree.mjs CLI', () => {
  const script = fileURLToPath(new URL('./worktree.mjs', import.meta.url));
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('WT_')));

  function runCli(cwd, args) {
    return spawnSync('node', [script, ...args], { cwd, env: cleanEnv, encoding: 'utf8' });
  }

  it('rm outside a worktree refuses', () => {
    const { root } = primaryWithOrigin();
    const result = runCli(root, ['rm']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to remove/);
    assert.ok(existsSync(root));
  });

  it('new without a name fails clearly and creates nothing', () => {
    const { root } = primaryWithOrigin();
    const result = runCli(root, ['new']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /a name or branch is required/);
    assert.equal(existsSync(path.join(root, '.claude', 'worktrees')), false);
  });
});

describe('newWorktree', () => {
  it('creates, links, assigns ports, writes env, then runs setup once', async () => {
    const { root } = primaryWithOrigin();
    const calls = [];
    const result = await newWorktree({
      primaryRoot: root,
      name: 'full-a',
      branch: 'full/a',
      isFree: allFree,
      runSetup: ({ worktreeRoot }) => {
        calls.push(worktreeRoot);
        assert.ok(existsSync(path.join(worktreeRoot, '.worktree.env')));
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], result.path);
    const env = parseEnvFile(readFileSync(path.join(result.path, '.worktree.env'), 'utf8'));
    assert.ok(Number(env.TT_SLOT) >= 1);
    assert.equal(Number(env.TT_BACKEND_PORT), 8787 + Number(env.TT_SLOT));
    assert.equal(existsSync(path.join(commonDir(root), 'tt-worktree-slot.lock')), false);
  });

  it('gives sibling worktrees distinct slots', async () => {
    const { root } = primaryWithOrigin();
    const slots = new Set();
    for (const name of ['s1', 's2', 's3']) {
      const r = await newWorktree({
        primaryRoot: root,
        name,
        isFree: allFree,
        runSetup: () => {},
      });
      slots.add(r.ports.TT_SLOT);
    }
    assert.equal(slots.size, 3);
  });

  it('leaves the worktree for recovery when setup fails', async () => {
    const { root } = primaryWithOrigin();
    const wtPath = path.join(root, '.claude', 'worktrees', 'fail-setup');
    await assert.rejects(
      newWorktree({
        primaryRoot: root,
        name: 'fail-setup',
        isFree: allFree,
        runSetup: () => {
          throw new Error('npm ci exploded');
        },
      }),
      (err) => {
        assert.ok(err.message.includes(wtPath));
        assert.ok(err.message.includes(`make -C ${wtPath} install migrate-local`));
        assert.ok(err.message.includes(`make -C ${wtPath} worktree-rm`));
        return true;
      },
    );
    assert.ok(existsSync(wtPath));
    assert.ok(existsSync(path.join(wtPath, '.worktree.env')));
    assert.match(git(root, ['branch', '--list', 'fail-setup']), /fail-setup/);
  });

  it('rejects while the lock is held, before resolving ports', async () => {
    const { root } = primaryWithOrigin();
    const lock = path.join(commonDir(root), 'tt-worktree-slot.lock');
    mkdirSync(lock);
    writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
    let probed = false;
    await assert.rejects(
      newWorktree({
        primaryRoot: root,
        name: 'locked',
        isFree: () => {
          probed = true;
          return true;
        },
        runSetup: () => {},
      }),
      (err) => err.message.includes(lock) && /another worktree-new/.test(err.message),
    );
    assert.equal(probed, false);
    assert.equal(existsSync(path.join(root, '.claude', 'worktrees', 'locked', '.worktree.env')), false);
  });

  it('releases the lock and leaves the worktree with a recovery hint when port resolution fails', async () => {
    const { root } = primaryWithOrigin();
    const wtPath = path.join(root, '.claude', 'worktrees', 'exhausted');
    await assert.rejects(
      newWorktree({
        primaryRoot: root,
        name: 'exhausted',
        isFree: () => false,
        runSetup: () => {},
      }),
      (err) => {
        assert.match(err.message, /TT_JWKS_PORT/);
        assert.ok(err.message.includes(wtPath));
        assert.ok(err.message.includes(`make -C ${wtPath} worktree-rm`));
        return true;
      },
    );
    assert.ok(existsSync(wtPath));
    assert.match(git(root, ['branch', '--list', 'exhausted']), /exhausted/);
    assert.equal(existsSync(path.join(commonDir(root), 'tt-worktree-slot.lock')), false);
  });
});
