const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, EJSON } = require('bson');
const { hash, decide, apply } = require('./reconcile');

test('hashes preserve BSON types, ignore object key order, and respect array order', () => {
  const document = { _id: new ObjectId(), created: new Date('2026-01-01'), items: [1, 2] };
  assert.equal(hash(document), hash(EJSON.parse(EJSON.stringify(document))));
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.notEqual(hash(document), hash({ ...document, created: document.created.toISOString() }));
  assert.notEqual(hash({ items: [1, 2] }), hash({ items: [2, 1] }));
});

test('three-way reconciliation handles initial merge, offline edits and deletions', () => {
  const before = { _id: 'record', value: 1 };
  const local = { ...before, value: 2 };
  const cloud = { ...before, value: 3 };
  assert.equal(decide(undefined, before, null), 'push');
  assert.equal(decide(undefined, null, before), 'pull');
  assert.equal(decide(undefined, local, cloud), 'conflict');
  assert.equal(decide(hash(before), local, before), 'push');
  assert.equal(decide(hash(before), before, cloud), 'pull');
  assert.equal(decide(hash(before), null, before), 'push');
  assert.equal(decide(hash(before), before, null), 'pull');
  assert.equal(decide(hash(before), null, cloud), 'conflict');
  assert.equal(decide(hash(before), local, null), 'conflict');
  assert.equal(decide(hash(before), local, cloud), 'conflict');
  assert.equal(decide(hash(before), local, local), 'equal');
  assert.equal(decide(hash(before), null, null), 'equal');
});

test('atomic destination comparisons prevent overwriting concurrent edits', async () => {
  const before = { _id: 'record', value: 1 };
  const after = { _id: 'record', value: 2 };
  let filter;
  const collection = {
    replaceOne: async actual => { filter = actual; return { matchedCount: 0 }; },
    deleteOne: async actual => { filter = actual; return { deletedCount: 0 }; },
  };
  assert.equal(await apply(collection, before, after), false);
  assert.deepEqual(filter.$expr.$eq, ['$$ROOT', { $literal: before }]);
  assert.equal(await apply(collection, before, null), false);
});
