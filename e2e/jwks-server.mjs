import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jwks = readFileSync(
  fileURLToPath(new URL('../backend/test/fixtures/test-jwks.json', import.meta.url)),
  'utf-8',
);

const PORT = 8790;

createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(jwks);
}).listen(PORT, () => {
  console.log(`JWKS fixture server listening on :${PORT}`);
});
