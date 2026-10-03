import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWranglerArgs, buildVitePreviewOptions, buildViteServerOptions } from './dev-args.mjs';

const ports = { TT_JWKS_PORT: 18790, TT_BACKEND_PORT: 18787, TT_FRONTEND_PORT: 15173 };

test('buildWranglerArgs: default source adds no flags', () => {
  assert.deepEqual(buildWranglerArgs({ ports, source: 'default' }), ['dev']);
});

for (const source of ['file', 'env']) {
  test(`buildWranglerArgs: ${source} source passes --port and --var`, () => {
    assert.deepEqual(buildWranglerArgs({ ports, source }), [
      'dev',
      '--port',
      '18787',
      '--var',
      'ACCESS_JWKS_URL:http://localhost:18790/jwks',
    ]);
  });

  test(`buildViteServerOptions: ${source} source is strict`, () => {
    assert.deepEqual(buildViteServerOptions({ ports, source }), { port: 15173, strictPort: true });
  });

  test(`buildVitePreviewOptions: ${source} source is strict`, () => {
    assert.deepEqual(buildVitePreviewOptions({ ports, source }), {
      port: 15173,
      strictPort: true,
    });
  });
}

test('buildViteServerOptions: default source has no strictPort key', () => {
  const result = buildViteServerOptions({ ports, source: 'default' });
  assert.deepEqual(result, { port: 15173 });
  assert.equal('strictPort' in result, false);
});

test('buildVitePreviewOptions: default source is empty', () => {
  assert.deepEqual(buildVitePreviewOptions({ ports, source: 'default' }), {});
});
