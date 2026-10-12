const crypto = require('node:crypto');
const { EJSON } = require('bson');

// Canonical Extended JSON preserves ObjectIds, dates and numeric BSON types.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function hash(document) {
  if (document == null) return null;
  const json = canonical(EJSON.serialize(document, { relaxed: false }));
  return crypto.createHash('sha256').update(JSON.stringify(json)).digest('hex');
}

function recordKey(collection, id) {
  return hash({ collection, id });
}

function decide(baseHash, local, cloud) {
  const localHash = hash(local);
  const cloudHash = hash(cloud);
  if (localHash === cloudHash) return 'equal';
  if (cloudHash === (baseHash ?? null)) return 'push';
  if (localHash === (baseHash ?? null)) return 'pull';
  return 'conflict';
}

// The comparison happens atomically at MongoDB, including missing fields. An
// application edit after our scan must never be overwritten by a stale snapshot.
function unchangedFilter(document) {
  return { _id: document._id, $expr: { $eq: ['$$ROOT', { $literal: document }] } };
}

async function apply(collection, expected, desired) {
  if (!expected && !desired) return true;
  if (!expected) {
    try {
      await collection.insertOne(desired);
      return true;
    } catch (error) {
      // Same-ID insert races are retried; other unique-index collisions are
      // surfaced as conflicts, rather than silently dropping either record.
      if (error.code === 11000 && await collection.findOne({ _id: desired._id })) return false;
      throw error;
    }
  }
  const filter = unchangedFilter(expected);
  const result = desired
    ? await collection.replaceOne(filter, desired, { maxTimeMS: 10000 })
    : await collection.deleteOne(filter, { maxTimeMS: 10000 });
  return desired ? result.matchedCount === 1 : result.deletedCount === 1;
}

module.exports = { hash, recordKey, decide, apply };
