const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createRouter = require('./routes');

test('Atlas APIs require the configured access key, redact errors and reject stale choices', async () => {
  const previous = process.env.ATLAS_SYNC_ADMIN_TOKEN;
  process.env.ATLAS_SYNC_ADMIN_TOKEN = 'test-access-key';
  const app = express();
  app.use(express.json());
  let received;
  app.use('/api/atlas-sync', createRouter({
    status: async () => ({ configured: true, host: 'sample.mongodb.net' }),
    test: async () => { throw new Error('mongodb+srv://customer:private-secret@sample.mongodb.net'); },
    resolve: async (...args) => { received = args; return { conflicts: 0 }; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/atlas-sync`;
  const headers = { Authorization: 'Bearer test-access-key', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/status`)).status, 401);
    assert.equal((await fetch(`${base}/status`, { headers: { Authorization: 'Bearer wrong-key' } })).status, 401);
    const response = await fetch(`${base}/status`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const failure = await fetch(`${base}/test`, { method: 'POST', headers, body: '{}' });
    assert.equal(failure.status, 500);
    assert.equal((await failure.text()).includes('private-secret'), false);
    const revision = { side: 'local', localHash: 'local', cloudHash: 'cloud' };
    assert.equal((await fetch(`${base}/conflicts/key/resolve`, { method: 'POST', headers,
      body: JSON.stringify(revision) })).status, 200);
    assert.deepEqual(received, ['key', 'local', revision]);
    delete process.env.ATLAS_SYNC_ADMIN_TOKEN;
    assert.equal((await fetch(`${base}/status`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.ATLAS_SYNC_ADMIN_TOKEN;
    else process.env.ATLAS_SYNC_ADMIN_TOKEN = previous;
  }
});
