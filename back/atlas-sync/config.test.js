const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConfigStore, validateConnection } = require('./config');

const uri = 'mongodb+srv://customer:secret-password@sample.mongodb.net/?retryWrites=true&w=majority';

test('accepts Atlas SRV connections and rejects unsafe targets or TLS options', () => {
  assert.equal(validateConnection(uri, 'market_cloud').host, 'sample.mongodb.net');
  for (const invalid of [uri.replace('mongodb+srv:', 'mongodb:'), uri.replace('sample.mongodb.net', 'localhost'),
    uri.replace('sample.mongodb.net', 'mongodb.net.evil.test'), uri + '&tls=false', uri + '&tlsAllowInvalidCertificates=true',
    uri + '&tlsCertificateKeyFile=secrets.pem', uri + '&readPreference=secondary', uri.replace('w=majority', 'w=0')]) {
    assert.throws(() => validateConnection(invalid, 'market_cloud'));
  }
  for (const name of ['admin', 'local', 'config', 'a.b', '$danger', '', '../other']) {
    assert.throws(() => validateConnection(uri, name));
  }
});

test('stores credentials encrypted, survives restart and removes only connection settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-atlas-config-test-'));
  try {
    const store = new ConfigStore(directory);
    assert.equal(store.read(), null);
    store.write({ ...validateConnection(uri, 'market_cloud'), enabled: true });
    const stored = fs.readFileSync(store.filename, 'utf8');
    assert.equal(stored.includes('secret-password'), false);
    assert.equal(stored.includes('mongodb+srv'), false);
    const restarted = new ConfigStore(directory);
    assert.deepEqual(restarted.read(), { uri, host: 'sample.mongodb.net', database: 'market_cloud', enabled: true });
    restarted.write({ ...restarted.read(), enabled: false });
    assert.equal(restarted.read().enabled, false);
    restarted.remove();
    assert.equal(restarted.read(), null);
    assert.equal(fs.existsSync(path.join(directory, 'encryption.key')), true);
  } finally {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('market-atlas-config-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
