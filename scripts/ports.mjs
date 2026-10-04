// Port resolver shared by every Node consumer (vite.config.ts, playwright.config.ts,
// e2e/jwks-server.mjs, dev-backend.mjs) and the worktree script.
//
// Each worktree gets one slot 1..99 derived from its slug; all three ports are
// `default + slot`. The primary clone is slot 0 (the defaults). Env keys are
// namespaced TT_* so a developer's shell cannot collide with generic names.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORTS = Object.freeze({
  TT_JWKS_PORT: 8790,
  TT_BACKEND_PORT: 8787,
  TT_FRONTEND_PORT: 5173,
});

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const PORT_KEYS = Object.keys(DEFAULT_PORTS);
const SLOT_COUNT = 99;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (IEEE) of a string's UTF-8 bytes, as an unsigned integer. */
export function crc32(str) {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(str, 'utf8')) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Parse KEY=VALUE lines; comments (#) and blank lines are ignored. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** Serialize an object as KEY=VALUE lines (trailing newline). */
export function formatEnvFile(obj) {
  return Object.entries(obj)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
    .concat('\n');
}

function parsePort(key, value) {
  const text = String(value).trim();
  const num = Number(text);
  if (!/^\d+$/.test(text) || num < 1 || num > 65535) {
    throw new Error(`${key} must be an integer port between 1 and 65535 (got ${JSON.stringify(value)})`);
  }
  return num;
}

function portsForSlot(slot) {
  return {
    TT_JWKS_PORT: DEFAULT_PORTS.TT_JWKS_PORT + slot,
    TT_BACKEND_PORT: DEFAULT_PORTS.TT_BACKEND_PORT + slot,
    TT_FRONTEND_PORT: DEFAULT_PORTS.TT_FRONTEND_PORT + slot,
  };
}

/** Resolves true when the port can be bound on 0.0.0.0 (IPv4 only); only EADDRINUSE means held. */
export function probePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(false);
      else reject(err);
    });
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true));
    });
  });
}

function envOverrides(env) {
  const out = {};
  for (const key of PORT_KEYS) {
    if (env[key] !== undefined && env[key] !== '') out[key] = parsePort(key, env[key]);
  }
  return out;
}

/**
 * Pick ports for a worktree. Primary or no slug: the defaults (slot 0). Explicit TT_*_PORT
 * env values win per key. Otherwise walk slots from the slug hash until a candidate neither
 * overlaps a claimed slot's ports (slot 0 is always claimed) nor has a held port.
 */
export async function resolvePorts({
  slug,
  primary = false,
  env = process.env,
  claimedSlots = new Set(),
  isFree = probePort,
} = {}) {
  const overrides = envOverrides(env);
  let base;
  let slot = 0;

  if (primary || !slug) {
    base = { ...DEFAULT_PORTS };
  } else if (PORT_KEYS.every((key) => key in overrides)) {
    base = {};
  } else {
    const claimedPorts = new Set();
    for (const claimed of new Set([0, ...claimedSlots])) {
      for (const port of Object.values(portsForSlot(claimed))) claimedPorts.add(port);
    }
    const start = crc32(slug) % SLOT_COUNT;
    let found = null;
    for (let i = 0; i < SLOT_COUNT && found === null; i += 1) {
      const candidate = ((start + i) % SLOT_COUNT) + 1;
      const candidatePorts = portsForSlot(candidate);
      const values = Object.values(candidatePorts);
      if (values.some((port) => claimedPorts.has(port))) continue;
      let free = true;
      for (const port of values) {
        if (!(await isFree(port))) {
          free = false;
          break;
        }
      }
      if (free) found = { candidate, candidatePorts };
    }
    if (found === null) {
      throw new Error(
        `no free port slot (1-${SLOT_COUNT}) for "${slug}": set TT_JWKS_PORT, TT_BACKEND_PORT and TT_FRONTEND_PORT explicitly`,
      );
    }
    base = found.candidatePorts;
    slot = found.candidate;
  }

  return { ...base, ...overrides, TT_SLOT: slot };
}

/**
 * Resolve ports for a running process: defaults < <cwd>/.worktree.env < env.
 * `cwd` defaults to the repo root. `source` is 'default' | 'file' | 'env' (env wins).
 */
export function loadPorts({ cwd = REPO_ROOT, env = process.env } = {}) {
  const ports = { ...DEFAULT_PORTS };
  let source = 'default';

  const file = path.join(cwd, '.worktree.env');
  if (fs.existsSync(file)) {
    const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'));
    for (const key of PORT_KEYS) {
      if (parsed[key] !== undefined) {
        ports[key] = parsePort(key, parsed[key]);
        source = 'file';
      }
    }
  }

  const overrides = envOverrides(env);
  if (Object.keys(overrides).length > 0) {
    Object.assign(ports, overrides);
    source = 'env';
  }

  return { ports, source };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'print') {
    process.stdout.write(formatEnvFile(loadPorts().ports));
  } else {
    process.stderr.write('usage: node scripts/ports.mjs print\n');
    process.exitCode = 1;
  }
}
