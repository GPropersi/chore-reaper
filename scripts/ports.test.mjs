import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32 as zlibCrc32 } from 'node:zlib';

import {
  DEFAULT_PORTS,
  REPO_ROOT,
  crc32,
  formatEnvFile,
  loadPorts,
  parseEnvFile,
  probePort,
  resolvePorts,
} from './ports.mjs';

const allFree = () => true;
const slotOf = (slug) => (zlibCrc32(slug) % 99) + 1;

/** Find a slug whose hash slot is `slot` (no slotOf seam exists in the API). */
function slugForSlot(slot) {
  for (let i = 0; i < 100000; i += 1) {
    const slug = `wt-${i}`;
    if (slotOf(slug) === slot) return slug;
  }
  throw new Error(`no slug found for slot ${slot}`);
}

const tmpDirs = [];
function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ports-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('DEFAULT_PORTS', () => {
  it('uses the TT_* keys with today values', () => {
    assert.deepEqual(DEFAULT_PORTS, {
      TT_JWKS_PORT: 8790,
      TT_BACKEND_PORT: 8787,
      TT_FRONTEND_PORT: 5173,
    });
  });
});

describe('crc32', () => {
  it('matches the standard check vector', () => {
    assert.equal(crc32('123456789'), 0xcbf43926);
  });

  it('matches node:zlib crc32 for several inputs', () => {
    for (const s of ['', 'a', 'proof-a', 'feature-login-flow', 'café-ünïcode-✓']) {
      assert.equal(crc32(s), zlibCrc32(s), `crc32(${JSON.stringify(s)})`);
    }
  });
});

describe('resolvePorts', () => {
  it('returns the defaults with slot 0 for the primary', async () => {
    const result = await resolvePorts({ primary: true, env: {}, isFree: allFree });
    assert.deepEqual(result, {
      TT_JWKS_PORT: 8790,
      TT_BACKEND_PORT: 8787,
      TT_FRONTEND_PORT: 5173,
      TT_SLOT: 0,
    });
  });

  it('returns the defaults when there is no slug', async () => {
    const result = await resolvePorts({ env: {}, isFree: allFree });
    assert.equal(result.TT_SLOT, 0);
    assert.equal(result.TT_JWKS_PORT, 8790);
  });

  it('gives different slugs distinct slots and non-overlapping ports; same slug is stable', async () => {
    const a = await resolvePorts({ slug: 'proof-a', env: {}, isFree: allFree });
    const a2 = await resolvePorts({ slug: 'proof-a', env: {}, isFree: allFree });
    const b = await resolvePorts({ slug: 'proof-b', env: {}, isFree: allFree });
    assert.deepEqual(a, a2);
    assert.notEqual(a.TT_SLOT, b.TT_SLOT);
    const portsA = new Set([a.TT_JWKS_PORT, a.TT_BACKEND_PORT, a.TT_FRONTEND_PORT]);
    for (const p of [b.TT_JWKS_PORT, b.TT_BACKEND_PORT, b.TT_FRONTEND_PORT]) {
      assert.equal(portsA.has(p), false, `port ${p} overlaps`);
    }
  });

  it('uses slot (crc32 % 99) + 1 and default + slot for all three ports', async () => {
    for (const slug of ['proof-a', 'proof-b', 'feature-x']) {
      const slot = slotOf(slug);
      const result = await resolvePorts({ slug, env: {}, isFree: allFree });
      // Slots that collide with the primary defaults walk on; only assert the formula when unmoved.
      if (result.TT_SLOT !== slot) continue;
      assert.equal(result.TT_JWKS_PORT, 8790 + slot);
      assert.equal(result.TT_BACKEND_PORT, 8787 + slot);
      assert.equal(result.TT_FRONTEND_PORT, 5173 + slot);
    }
    const slug = slugForSlot(10);
    const result = await resolvePorts({ slug, env: {}, isFree: allFree });
    assert.deepEqual(result, {
      TT_JWKS_PORT: 8800,
      TT_BACKEND_PORT: 8797,
      TT_FRONTEND_PORT: 5183,
      TT_SLOT: 10,
    });
  });

  it('explicit env wins over everything', async () => {
    const result = await resolvePorts({
      slug: 'proof-a',
      env: { TT_JWKS_PORT: '19000', TT_BACKEND_PORT: '19001', TT_FRONTEND_PORT: '19002' },
      isFree: () => false,
    });
    assert.equal(result.TT_JWKS_PORT, 19000);
    assert.equal(result.TT_BACKEND_PORT, 19001);
    assert.equal(result.TT_FRONTEND_PORT, 19002);
  });

  it('throws on non-numeric or out-of-range env', async () => {
    await assert.rejects(resolvePorts({ slug: 'x', env: { TT_JWKS_PORT: 'abc' } }), /TT_JWKS_PORT/);
    await assert.rejects(resolvePorts({ slug: 'x', env: { TT_BACKEND_PORT: '70000' } }), /TT_BACKEND_PORT/);
    await assert.rejects(resolvePorts({ slug: 'x', env: { TT_FRONTEND_PORT: '0' } }), /TT_FRONTEND_PORT/);
  });

  it('skips a slot whose ports are held (sync isFree)', async () => {
    const slug = slugForSlot(10);
    const held = new Set([8800]); // slot 10 JWKS port
    const result = await resolvePorts({ slug, env: {}, isFree: (p) => !held.has(p) });
    assert.notEqual(result.TT_SLOT, 10);
  });

  it('skips a slot whose ports are held (async isFree)', async () => {
    const slug = slugForSlot(10);
    const held = new Set([5183]); // slot 10 frontend port
    const result = await resolvePorts({
      slug,
      env: {},
      isFree: async (p) => !held.has(p),
    });
    assert.notEqual(result.TT_SLOT, 10);
    assert.equal(result.TT_SLOT, 11);
  });

  it('skips a slot in claimedSlots', async () => {
    const slug = slugForSlot(10);
    const result = await resolvePorts({
      slug,
      env: {},
      claimedSlots: new Set([10]),
      isFree: allFree,
    });
    assert.notEqual(result.TT_SLOT, 10);
  });

  it('wraps within 1..99', async () => {
    const slug = slugForSlot(99);
    const result = await resolvePorts({
      slug,
      env: {},
      claimedSlots: new Set([99]),
      isFree: allFree,
    });
    assert.equal(result.TT_SLOT, 1);
  });

  it('throws naming the env override when all 99 slots are exhausted', async () => {
    await assert.rejects(
      resolvePorts({ slug: 'proof-a', env: {}, isFree: () => false }),
      /TT_JWKS_PORT|TT_BACKEND_PORT|TT_FRONTEND_PORT/,
    );
  });

  it('never reserves slot 0 via a file: slot 3 (backend 8790) is moved off the primary JWKS port', async () => {
    const slug = slugForSlot(3);
    const result = await resolvePorts({
      slug,
      env: {},
      claimedSlots: new Set(),
      isFree: allFree,
    });
    assert.notEqual(result.TT_SLOT, 3);
    const defaults = new Set([8790, 8787, 5173]);
    for (const p of [result.TT_JWKS_PORT, result.TT_BACKEND_PORT, result.TT_FRONTEND_PORT]) {
      assert.equal(defaults.has(p), false, `port ${p} collides with primary defaults`);
    }
  });

  it('separates the bases across slots: slot 4 (backend 8791) is rejected when slot 1 (JWKS 8791) is claimed', async () => {
    const slug = slugForSlot(4);
    const result = await resolvePorts({
      slug,
      env: {},
      claimedSlots: new Set([1]),
      isFree: allFree,
    });
    assert.notEqual(result.TT_SLOT, 4);
    const claimedPorts = new Set([8791, 8788, 5174]);
    for (const p of [result.TT_JWKS_PORT, result.TT_BACKEND_PORT, result.TT_FRONTEND_PORT]) {
      assert.equal(claimedPorts.has(p), false, `port ${p} collides with claimed slot 1`);
    }
  });
});

describe('parseEnvFile / formatEnvFile', () => {
  it('parses KEY=VALUE lines, ignoring comments and blanks', () => {
    const text = '# comment\n\nSLUG=proof-a\n  TT_SLOT=5  \nPRIMARY_ROOT=/a/b=c\n';
    assert.deepEqual(parseEnvFile(text), {
      SLUG: 'proof-a',
      TT_SLOT: '5',
      PRIMARY_ROOT: '/a/b=c',
    });
  });

  it('round-trips through formatEnvFile', () => {
    const obj = { SLUG: 'x', TT_SLOT: 7, TT_JWKS_PORT: 8797 };
    assert.deepEqual(parseEnvFile(formatEnvFile(obj)), {
      SLUG: 'x',
      TT_SLOT: '7',
      TT_JWKS_PORT: '8797',
    });
    assert.ok(formatEnvFile(obj).endsWith('\n'));
  });
});

describe('loadPorts', () => {
  it('returns defaults with source "default" when there is no file and no env', () => {
    const cwd = makeTmp();
    const { ports, source } = loadPorts({ cwd, env: {} });
    assert.deepEqual(ports, DEFAULT_PORTS);
    assert.equal(source, 'default');
  });

  it('reads <cwd>/.worktree.env with source "file"', () => {
    const cwd = makeTmp();
    fs.writeFileSync(
      path.join(cwd, '.worktree.env'),
      'SLUG=x\nTT_JWKS_PORT=8800\nTT_BACKEND_PORT=8797\nTT_FRONTEND_PORT=5183\n',
    );
    const { ports, source } = loadPorts({ cwd, env: {} });
    assert.deepEqual(ports, {
      TT_JWKS_PORT: 8800,
      TT_BACKEND_PORT: 8797,
      TT_FRONTEND_PORT: 5183,
    });
    assert.equal(source, 'file');
  });

  it('env wins over file and reports source "env"', () => {
    const cwd = makeTmp();
    fs.writeFileSync(path.join(cwd, '.worktree.env'), 'TT_JWKS_PORT=8800\nTT_BACKEND_PORT=8797\n');
    const { ports, source } = loadPorts({ cwd, env: { TT_JWKS_PORT: '9999' } });
    assert.equal(ports.TT_JWKS_PORT, 9999);
    assert.equal(ports.TT_BACKEND_PORT, 8797);
    assert.equal(ports.TT_FRONTEND_PORT, 5173);
    assert.equal(source, 'env');
  });

  it('throws on non-numeric or out-of-range env', () => {
    const cwd = makeTmp();
    assert.throws(() => loadPorts({ cwd, env: { TT_BACKEND_PORT: 'nope' } }), /TT_BACKEND_PORT/);
    assert.throws(() => loadPorts({ cwd, env: { TT_FRONTEND_PORT: '65536' } }), /TT_FRONTEND_PORT/);
  });

  it('anchors to REPO_ROOT when no cwd is given', () => {
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    assert.equal(path.resolve(REPO_ROOT), path.resolve(scriptsDir, '..'));
    assert.equal(loadPorts({ env: {} }).source, loadPorts({ cwd: REPO_ROOT, env: {} }).source);
  });
});

describe('probePort', () => {
  it('resolves false while a server holds the port and true after it closes', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const { port } = server.address();
    assert.equal(await probePort(port), false);
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await probePort(port), true);
  });
});
