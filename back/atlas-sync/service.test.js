const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AtlasSyncService } = require('./service');

test('background checks retry failure, respect pause, and do not overlap an active check', { timeout: 3000 }, async () => {
  let enabled = true;
  let attempts = 0;
  let resolveRetried;
  const retried = new Promise(resolve => { resolveRetried = resolve; });
  const service = new AtlasSyncService({ intervalMs: 20, getLocalDb: () => ({}),
    store: { read: () => ({ enabled }) } });
  service.sync = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Offline');
    resolveRetried();
  };
  try {
    service.start();
    assert.equal(attempts, 1);
    await retried;
    assert.equal(attempts, 2);
    enabled = false;
    await new Promise(resolve => setTimeout(resolve, 65));
    assert.equal(attempts, 2);
    enabled = true;
    service.running = true;
    await new Promise(resolve => setTimeout(resolve, 65));
    assert.equal(attempts, 2);
    service.running = false;
    let resolveResumed;
    const resumed = new Promise(resolve => { resolveResumed = resolve; });
    service.sync = async () => { attempts += 1; resolveResumed(); };
    await resumed;
    assert.equal(attempts, 3);
  } finally { service.stop(); }
});

test('simultaneous sync and settings edits are rejected while a check is active', async () => {
  const service = new AtlasSyncService();
  service.running = true;
  await assert.rejects(() => service.sync(), /sync is running/);
  await assert.rejects(() => service.save({}), /sync is running/);
  await assert.rejects(() => service.disconnect(), /sync is running/);
  await assert.rejects(() => service.resolve('key', 'local'), /sync is running/);
});
