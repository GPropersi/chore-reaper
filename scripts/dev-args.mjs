// Pure helpers that turn resolved ports into dev-server arguments/options.
// `source` is loadPorts()'s 'default' | 'file' | 'env'. At 'default' (primary with no
// overrides) every helper preserves today's behavior exactly.

/** Args for `wrangler dev`. Ports from a file/env also repoint the Worker at the matching JWKS server. */
export function buildWranglerArgs({ ports, source }) {
  if (source === 'default') return ['dev'];
  return [
    'dev',
    '--port',
    String(ports.TT_BACKEND_PORT),
    '--var',
    `ACCESS_JWKS_URL:http://localhost:${ports.TT_JWKS_PORT}/jwks`,
  ];
}

/** Vite `server` options: strictPort only when ports are overridden, so a collision fails fast. */
export function buildViteServerOptions({ ports, source }) {
  if (source === 'default') return { port: ports.TT_FRONTEND_PORT };
  return { port: ports.TT_FRONTEND_PORT, strictPort: true };
}

/** Vite `preview` options: empty at default so bare `vite preview` keeps its own port (4173). */
export function buildVitePreviewOptions({ ports, source }) {
  if (source === 'default') return {};
  return { port: ports.TT_FRONTEND_PORT, strictPort: true };
}
