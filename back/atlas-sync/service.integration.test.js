const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { AtlasSyncService } = require('./service');
const { recordKey } = require('./reconcile');

// Explicit opt-in: all writes use disposable test databases, never the app DB.
test('sync recovery, deletes, conflicts, restart, counters and concurrent edits against MongoDB', {
  skip: process.env.RUN_ATLAS_SYNC_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const connectionUri = process.env.ATLAS_SYNC_TEST_URI || 'mongodb://127.0.0.1:27017';
  const client = new mongoose.mongo.MongoClient(connectionUri, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  const prefix = `market_atlas_test_${crypto.randomBytes(8).toString('hex')}`;
  const local = client.db(`${prefix}_local`);
  const cloud = client.db(`${prefix}_cloud`);
  const metadata = client.db(`${prefix}_metadata`);
  let offline = false;
  let configured = { uri: 'mongodb+srv://customer:secret@sample.mongodb.net/', host: 'sample.mongodb.net',
    database: cloud.databaseName, enabled: true };
  const store = { read: () => configured, write: value => { configured = value; }, remove: () => { configured = null; } };
  const options = { store, getLocalDb: () => local, getMetadataDb: () => metadata,
    collections: ['customers', 'units', 'counters'], createClient: () => {
      if (offline) return { connect: async () => { throw new Error('Disconnected'); }, close: async () => {} };
      return new mongoose.mongo.MongoClient(connectionUri, { serverSelectionTimeoutMS: 3000 });
    } };
  try {
    const service = new AtlasSyncService(options);
    await local.collection('customers').insertOne({ _id: 'local-only', name: 'Local customer', createdAt: new Date('2026-01-01') });
    await cloud.collection('customers').insertOne({ _id: 'cloud-only', name: 'Cloud customer' });
    await local.collection('units').createIndex({ nameKey: 1 }, { unique: true });
    await local.collection('units').insertOne({ _id: 'unit', nameKey: 'bag' });
    await service.sync();
    assert.equal(await local.collection('customers').countDocuments(), 2);
    assert.equal(await cloud.collection('customers').countDocuments(), 2);
    assert.ok((await cloud.collection('customers').findOne({ _id: 'local-only' })).createdAt instanceof Date);
    assert.ok((await cloud.collection('units').listIndexes().toArray()).some(index => index.unique));

    offline = true;
    await local.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Offline edit' } });
    await local.collection('customers').deleteOne({ _id: 'cloud-only' });
    await assert.rejects(() => service.sync(), /Cannot complete Atlas sync/);
    assert.equal((await service.status()).pending, 2);
    assert.equal((await cloud.collection('customers').findOne({ _id: 'local-only' })).name, 'Local customer');

    offline = false;
    const restarted = new AtlasSyncService(options);
    await restarted.sync();
    assert.equal((await cloud.collection('customers').findOne({ _id: 'local-only' })).name, 'Offline edit');
    assert.equal(await cloud.collection('customers').findOne({ _id: 'cloud-only' }), null);
    assert.equal((await restarted.status()).pending, 0);
    await cloud.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Atlas edit' } });
    await restarted.sync();
    assert.equal((await local.collection('customers').findOne({ _id: 'local-only' })).name, 'Atlas edit');

    await local.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Local conflict' } });
    await cloud.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Cloud conflict' } });
    await restarted.sync();
    assert.equal((await restarted.status()).conflicts, 1);
    const key = recordKey('customers', 'local-only');
    const firstReview = await restarted.conflictDetail(key);
    assert.match(firstReview.local, /Local conflict/);
    assert.match(firstReview.cloud, /Cloud conflict/);
    await cloud.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Cloud changed again' } });
    await assert.rejects(() => restarted.resolve(key, 'local', firstReview), /changed since/);
    await assert.rejects(() => restarted.resolve(key, 'local', firstReview), /versions changed/);
    await restarted.resolve(key, 'cloud', await restarted.conflictDetail(key));
    assert.equal((await local.collection('customers').findOne({ _id: 'local-only' })).name, 'Cloud changed again');
    assert.equal((await restarted.status()).conflicts, 0);

    await local.collection('customers').deleteOne({ _id: 'local-only' });
    await cloud.collection('customers').updateOne({ _id: 'local-only' }, { $set: { name: 'Edit versus delete' } });
    await restarted.sync();
    assert.equal((await restarted.conflictDetail(key)).local, null);
    await restarted.resolve(key, 'local', await restarted.conflictDetail(key));
    assert.equal(await cloud.collection('customers').findOne({ _id: 'local-only' }), null);
    await restarted.sync();
    assert.equal(await local.collection('customers').countDocuments(), 0);

    await local.collection('counters').insertOne({ _id: 'sale', seq: 5 });
    await restarted.sync();
    await local.collection('counters').updateOne({ _id: 'sale' }, { $set: { seq: 7 } });
    await cloud.collection('counters').updateOne({ _id: 'sale' }, { $set: { seq: 10 } });
    await restarted.sync();
    assert.equal((await local.collection('counters').findOne({ _id: 'sale' })).seq, 10);
    await cloud.collection('counters').updateOne({ _id: 'sale' }, { $set: { seq: 2 } });
    await restarted.sync();
    assert.equal((await cloud.collection('counters').findOne({ _id: 'sale' })).seq, 10);

    // A remote deletion is guarded by the entire old destination document.
    await local.collection('customers').insertOne({ _id: 'race', name: 'Original' });
    await restarted.sync();
    await cloud.collection('customers').deleteOne({ _id: 'race' });
    const snapshot = restarted.snapshot.bind(restarted);
    let edited = false;
    restarted.snapshot = async (database, name) => {
      const result = await snapshot(database, name);
      if (!edited && database.databaseName === cloud.databaseName && name === 'customers') {
        edited = true;
        await local.collection('customers').updateOne({ _id: 'race' }, { $set: { name: 'Concurrent app edit' } });
      }
      return result;
    };
    await restarted.sync();
    assert.equal((await local.collection('customers').findOne({ _id: 'race' })).name, 'Concurrent app edit');
    await restarted.sync();
    assert.equal((await restarted.status()).conflicts, 1);

    // A unique-index collision is retained for review without replacing either ID.
    await cloud.collection('units').insertOne({ _id: 'cloud-unit', nameKey: 'crate' });
    await local.collection('units').insertOne({ _id: 'local-unit', nameKey: 'crate' });
    await restarted.sync();
    assert.ok((await restarted.listConflicts()).some(row => row.message.includes('unique field')));
    await assert.rejects(() => restarted.save({ ...configured, database: 'another_target' }), /Confirm/);
    await restarted.disconnect();
    assert.equal((await restarted.status()).configured, false);
    assert.ok(await local.collection('customers').findOne({ _id: 'race' }));
  } finally {
    for (const database of [local, cloud, metadata]) {
      assert.ok(database.databaseName.startsWith(`${prefix}_`));
      await database.dropDatabase();
    }
    await client.close();
  }
});
