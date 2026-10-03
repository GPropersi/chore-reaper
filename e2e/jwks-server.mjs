import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPorts } from '../scripts/ports.mjs';

const jwks = readFileSync(
  fileURLToPath(new URL('../backend/test/fixtures/test-jwks.json', import.meta.url)),
  'utf-8',
);

const {
  ports: { TT_JWKS_PORT: PORT },
} = loadPorts();

createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(jwks);
}).listen(PORT, () => {
  console.log(`JWKS fixture server listening on :${PORT}`);
});
