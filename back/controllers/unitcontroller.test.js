const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const Module = require('node:module');

const controllerPath = require.resolve('./unitcontroller');
const unitPath = require.resolve('../model/unitmodule');
const productPath = require.resolve('../model/productmodule');

// Load the controller against in-memory models, then immediately restore the
// cache. Neither the app nor the real models (and their database dependencies)
// are imported by these tests.
function loadController(unitOverrides = {}, productOverrides = {}) {
  const unit = {
    find: async () => [],
    findOne: async () => null,
    findOneAndUpdate: async () => {
      throw new Error('Unexpected unit update');
    },
    create: async () => {
      throw new Error('Unexpected unit creation');
    },
    ...unitOverrides,
  };
  const product = {
    distinct: async () => [],
    ...productOverrides,
  };
  const paths = [controllerPath, unitPath, productPath];
  const previous = new Map(paths.map((filename) => [filename, require.cache[filename]]));
  try {
    for (const [filename, exports] of [[unitPath, unit], [productPath, product]]) {
      const mock = new Module(filename);
      mock.filename = filename;
      mock.loaded = true;
      mock.exports = exports;
      require.cache[filename] = mock;
    }
    delete require.cache[controllerPath];
    return require(controllerPath);
  } finally {
    for (const filename of paths) {
      const cached = previous.get(filename);
      if (cached) require.cache[filename] = cached;
      else delete require.cache[filename];
    }
  }
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('unit controller', { concurrency: false }, () => {
  test('GET merges saved and legacy units, normalizes names, and sorts the unique results', async () => {
    const requestedQueries = [];
    const controller = loadController({
      find: async (filter, projection) => {
        requestedQueries.push(['unit', filter, projection]);
        return [
          { name: '  Tray ', deleted: false },
          { name: 'bag' },
          { name: 'Loose\t pack', deleted: false },
          { name: ' ' },
          { name: null },
          { name: undefined },
          { name: 12 },
          { name: 'BOX' },
        ];
      },
    }, {
      distinct: async (field) => {
        requestedQueries.push(['product', field]);
        return ['TRAY', 'Bag', '   box ', ' kilo ', 'Loose \n pack', false, {}, ''];
      },
    });
    const res = response();

    await controller.getUnits({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [
      { name: 'bag' },
      { name: 'BOX' },
      { name: 'kilo' },
      { name: 'Loose pack' },
      { name: 'Tray' },
    ]);
    assert.deepEqual(requestedQueries, [
      ['unit', {}, { name: 1, nameKey: 1, deleted: 1 }],
      ['product', 'Unit'],
    ]);
  });

  test('GET returns an empty list when all stored values are blank or non-strings', async () => {
    const controller = loadController({
      find: async () => [null, undefined, '', '\t \n', 0].map((name) => ({ name })),
    }, {
      distinct: async () => [false, {}, []],
    });
    const res = response();

    await controller.getUnits({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  test('GET suppresses deleted units from saved and legacy names regardless of case or whitespace', async () => {
    const controller = loadController({
      find: async () => [
        { name: '  Bulk\t bags ', nameKey: 'bulk bags', deleted: true },
        { name: 'bulk bags' },
        { name: 'Tray', nameKey: 'tray', deleted: true },
        { name: 'BOX', deleted: false },
        { name: 'Bag' },
      ],
    }, {
      distinct: async () => ['BULK BAGS', ' bulk \n bags ', ' tray ', 'box', 'Kilogram'],
    });
    const res = response();

    await controller.getUnits({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [{ name: 'Bag' }, { name: 'BOX' }, { name: 'Kilogram' }]);
  });

  test('POST creates a normalized unit and returns the created document', async () => {
    const savedDocument = { _id: 'new-unit', name: 'Paper Sack', nameKey: 'paper sack', deleted: false };
    let duplicateQuery;
    let createdData;
    const controller = loadController({
      findOne: async (query) => {
        duplicateQuery = query;
        return null;
      },
      create: async (data) => {
        createdData = data;
        return savedDocument;
      },
    }, {
      distinct: async () => ['Bag', null, '', false],
    });
    const res = response();

    await controller.createUnit({ body: { name: '  Paper\t Sack \n ' } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, savedDocument);
    assert.deepEqual(duplicateQuery, { nameKey: 'paper sack' });
    assert.deepEqual(createdData, { name: 'Paper Sack', nameKey: 'paper sack', deleted: false });
  });

  test('POST rejects an existing saved unit without creating another document', async () => {
    let createCalls = 0;
    let productCalls = 0;
    const controller = loadController({
      findOne: async (query) => {
        assert.deepEqual(query, { nameKey: 'bag' });
        return { _id: 'existing-unit' };
      },
      create: async () => { createCalls += 1; },
    }, {
      distinct: async () => { productCalls += 1; return []; },
    });
    const res = response();

    await controller.createUnit({ body: { name: '  BAG ' } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already exists/i);
    assert.equal(createCalls, 0);
    assert.equal(productCalls, 0);
  });

  test('POST restores a deleted unit with its requested normalized name and returns the restored document', async () => {
    const restored = { _id: 'saved-unit', name: 'BULK bags', nameKey: 'bulk bags', deleted: false };
    let updateCall;
    let productCalls = 0;
    const controller = loadController({
      findOne: async (query) => {
        assert.deepEqual(query, { nameKey: 'bulk bags' });
        return { _id: 'saved-unit', name: 'Bulk Bags', nameKey: 'bulk bags', deleted: true };
      },
      findOneAndUpdate: async (...args) => {
        updateCall = args;
        return restored;
      },
    }, {
      distinct: async () => { productCalls += 1; return ['bulk bags']; },
    });
    const res = response();

    await controller.createUnit({ body: { name: '  BULK\t bags ' } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, restored);
    assert.deepEqual(updateCall, [
      { nameKey: 'bulk bags', deleted: true },
      { $set: { name: 'BULK bags', deleted: false } },
      { new: true, runValidators: true },
    ]);
    assert.equal(productCalls, 0);
  });

  test('POST returns 409 when a concurrent request has already restored the deleted unit', async () => {
    const controller = loadController({
      findOne: async () => ({ name: 'Bag', nameKey: 'bag', deleted: true }),
      findOneAndUpdate: async () => null,
    }, {
      distinct: async () => { throw new Error('Unexpected legacy lookup'); },
    });
    const res = response();

    await controller.createUnit({ body: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already exists/i);
  });

  test('POST rejects a case-insensitive legacy product unit with normalized whitespace', async () => {
    let createCalls = 0;
    const controller = loadController({
      create: async () => { createCalls += 1; },
    }, {
      distinct: async (field) => {
        assert.equal(field, 'Unit');
        return [null, '', 3, '  BULK \t BAGS\n'];
      },
    });
    const res = response();

    await controller.createUnit({ body: { name: 'Bulk bags' } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already exists/i);
    assert.equal(createCalls, 0);
  });

  test('POST reports a duplicate when another request wins the unique-index race', async () => {
    const controller = loadController({
      create: async () => {
        throw Object.assign(new Error('Duplicate key'), { code: 11000 });
      },
    });
    const res = response();

    await controller.createUnit({ body: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already exists/i);
  });

  test('POST rejects missing, blank, non-string, and overlong names before querying models', async (t) => {
    const invalidBodies = [
      ['missing body', undefined],
      ['missing name', {}],
      ['null name', { name: null }],
      ['number name', { name: 1 }],
      ['boolean name', { name: true }],
      ['object name', { name: { name: 'Bag' } }],
      ['array name', { name: ['Bag'] }],
      ['empty name', { name: '' }],
      ['whitespace name', { name: ' \t\n ' }],
      ['101-character name', { name: 'x'.repeat(101) }],
    ];
    for (const [label, body] of invalidBodies) {
      await t.test(label, async () => {
        let modelCalls = 0;
        const unexpectedModelCall = async () => { modelCalls += 1; };
        const controller = loadController({
          findOne: unexpectedModelCall,
          findOneAndUpdate: unexpectedModelCall,
          create: unexpectedModelCall,
        }, {
          distinct: unexpectedModelCall,
        });
        const res = response();

        await controller.createUnit({ body }, res);

        assert.equal(res.statusCode, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.equal(modelCalls, 0);
      });
    }
  });

  test('POST accepts exactly 100 normalized characters despite surrounding whitespace', async () => {
    const name = 'x'.repeat(100);
    let createdData;
    const controller = loadController({
      create: async (data) => {
        createdData = data;
        return { _id: 'boundary-unit', ...data };
      },
    });
    const res = response();

    await controller.createUnit({ body: { name: ` \n ${name}\t ` } }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(createdData, { name, nameKey: name, deleted: false });
  });

  test('POST measures the name limit after collapsing internal whitespace', async () => {
    let createdData;
    const controller = loadController({
      create: async (data) => {
        createdData = data;
        return data;
      },
    });
    const res = response();

    await controller.createUnit({ body: { name: `A${' '.repeat(101)}B` } }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(createdData, { name: 'A B', nameKey: 'a b', deleted: false });
  });

  test('GET reports failures from either model as 500', async (t) => {
    for (const source of ['unit', 'product']) {
      await t.test(source, async () => {
        const fail = async () => { throw new Error(`${source} lookup failed`); };
        const controller = loadController(
          source === 'unit' ? { find: fail } : {},
          source === 'product' ? { distinct: fail } : {},
        );
        const res = response();

        await controller.getUnits({}, res);

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, `${source} lookup failed`);
      });
    }
  });

  test('POST reports lookup failures as 500 without creating a unit', async (t) => {
    for (const source of ['unit', 'product']) {
      await t.test(source, async () => {
        let createCalls = 0;
        const fail = async () => { throw new Error(`${source} lookup failed`); };
        const controller = loadController({
          ...(source === 'unit' ? { findOne: fail } : {}),
          create: async () => { createCalls += 1; },
        }, source === 'product' ? { distinct: fail } : {});
        const res = response();

        await controller.createUnit({ body: { name: 'Bag' } }, res);

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, `${source} lookup failed`);
        assert.equal(createCalls, 0);
      });
    }
  });

  test('POST reports an unexpected creation failure as 500', async () => {
    const controller = loadController({
      create: async () => { throw new Error('Unit creation failed'); },
    });
    const res = response();

    await controller.createUnit({ body: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'Unit creation failed');
  });

  test('POST reports a restoration failure as 500', async () => {
    const controller = loadController({
      findOne: async () => ({ name: 'Bag', nameKey: 'bag', deleted: true }),
      findOneAndUpdate: async () => { throw new Error('Unit restoration failed'); },
    });
    const res = response();

    await controller.createUnit({ body: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'Unit restoration failed');
  });

  test('DELETE soft-deletes an active saved unit without querying or updating products', async () => {
    let updateCall;
    let productCalls = 0;
    const controller = loadController({
      findOne: async (query) => {
        assert.deepEqual(query, { nameKey: 'bag' });
        return { _id: 'saved-unit', name: 'Bag', nameKey: 'bag' };
      },
      findOneAndUpdate: async (...args) => {
        updateCall = args;
        return { _id: 'saved-unit', name: 'Bag', nameKey: 'bag', deleted: true };
      },
    }, {
      distinct: async () => { productCalls += 1; return []; },
    });
    const res = response();

    await controller.deleteUnit({ query: { name: '  BAG ' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Unit deleted successfully.', name: 'BAG' });
    assert.deepEqual(updateCall, [
      { nameKey: 'bag' },
      { $set: { deleted: true } },
      { new: true, runValidators: true },
    ]);
    assert.equal(productCalls, 0);
  });

  test('DELETE suppresses a legacy product unit by creating a deleted unit record', async () => {
    let createdData;
    const controller = loadController({
      create: async (data) => {
        createdData = data;
        return { _id: 'suppressed-unit', ...data };
      },
    }, {
      distinct: async (field) => {
        assert.equal(field, 'Unit');
        return [null, '', false, '  BULK \n BAGS '];
      },
    });
    const res = response();

    await controller.deleteUnit({ query: { name: '  Bulk\t bags ' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(createdData, { name: 'Bulk bags', nameKey: 'bulk bags', deleted: true });
    assert.deepEqual(res.body, { message: 'Unit deleted successfully.', name: 'Bulk bags' });
  });

  test('DELETE is idempotent for an already deleted unit and performs no further writes', async () => {
    let updateCalls = 0;
    let createCalls = 0;
    let productCalls = 0;
    const controller = loadController({
      findOne: async () => ({ name: 'Bag', nameKey: 'bag', deleted: true }),
      findOneAndUpdate: async () => { updateCalls += 1; },
      create: async () => { createCalls += 1; },
    }, {
      distinct: async () => { productCalls += 1; return []; },
    });
    const res = response();

    await controller.deleteUnit({ query: { name: '  Bag ' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Unit deleted successfully.', name: 'Bag' });
    assert.equal(updateCalls, 0);
    assert.equal(createCalls, 0);
    assert.equal(productCalls, 0);
  });

  test('DELETE returns 404 for a unit missing from both saved and product units', async () => {
    const controller = loadController({}, {
      distinct: async () => ['Bag', null, ''],
    });
    const res = response();

    await controller.deleteUnit({ query: { name: 'Carton' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('DELETE returns 404 if the saved unit disappears before the update', async () => {
    const controller = loadController({
      findOne: async () => ({ name: 'Bag', nameKey: 'bag', deleted: false }),
      findOneAndUpdate: async () => null,
    });
    const res = response();

    await controller.deleteUnit({ query: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(typeof res.body.error, 'string');
  });

  test('DELETE rejects missing, blank, non-string, and overlong query names before querying models', async (t) => {
    const invalidQueries = [
      ['missing query', undefined],
      ['missing name', {}],
      ['null name', { name: null }],
      ['number name', { name: 1 }],
      ['boolean name', { name: true }],
      ['object name', { name: { name: 'Bag' } }],
      ['array name', { name: ['Bag'] }],
      ['empty name', { name: '' }],
      ['whitespace name', { name: ' \t\n ' }],
      ['101-character name', { name: 'x'.repeat(101) }],
    ];
    for (const [label, query] of invalidQueries) {
      await t.test(label, async () => {
        let modelCalls = 0;
        const unexpectedModelCall = async () => { modelCalls += 1; };
        const controller = loadController({
          findOne: unexpectedModelCall,
          findOneAndUpdate: unexpectedModelCall,
          create: unexpectedModelCall,
        }, {
          distinct: unexpectedModelCall,
        });
        const res = response();

        await controller.deleteUnit({ query }, res);

        assert.equal(res.statusCode, 400);
        assert.equal(typeof res.body.error, 'string');
        assert.equal(modelCalls, 0);
      });
    }
  });

  test('DELETE accepts a normalized name of exactly 100 characters', async () => {
    const name = 'x'.repeat(100);
    const controller = loadController({
      findOne: async (query) => {
        assert.deepEqual(query, { nameKey: name });
        return { name, nameKey: name, deleted: true };
      },
    });
    const res = response();

    await controller.deleteUnit({ query: { name: ` \n ${name}\t ` } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Unit deleted successfully.', name });
  });

  test('DELETE recovers a concurrent legacy suppression by updating the winning record', async () => {
    let recoveryCall;
    const controller = loadController({
      create: async () => {
        throw Object.assign(new Error('Duplicate key'), { code: 11000 });
      },
      findOneAndUpdate: async (...args) => {
        recoveryCall = args;
        return { name: 'Bag', nameKey: 'bag', deleted: true };
      },
    }, {
      distinct: async () => ['bag'],
    });
    const res = response();

    await controller.deleteUnit({ query: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'Unit deleted successfully.', name: 'Bag' });
    assert.deepEqual(recoveryCall, [
      { nameKey: 'bag' },
      { $set: { deleted: true } },
      { new: true, runValidators: true },
    ]);
  });

  test('DELETE returns 500 if the suppression race cannot find a winning record', async () => {
    const controller = loadController({
      create: async () => {
        throw Object.assign(new Error('Duplicate key'), { code: 11000 });
      },
      findOneAndUpdate: async () => null,
    }, {
      distinct: async () => ['bag'],
    });
    const res = response();

    await controller.deleteUnit({ query: { name: 'Bag' } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(typeof res.body.error, 'string');
  });

  test('DELETE reports lookup, write, and race-recovery failures as 500', async (t) => {
    const fail = async () => { throw new Error('Unit deletion failed'); };
    const activeUnit = async () => ({ name: 'Bag', nameKey: 'bag', deleted: false });
    const legacyUnits = async () => ['bag'];
    const duplicateFailure = async () => {
      throw Object.assign(new Error('Duplicate key'), { code: 11000 });
    };
    const cases = [
      ['saved lookup', { findOne: fail }, {}],
      ['legacy lookup', {}, { distinct: fail }],
      ['saved update', { findOne: activeUnit, findOneAndUpdate: fail }, {}],
      ['legacy suppression creation', { create: fail }, { distinct: legacyUnits }],
      ['suppression race recovery', { create: duplicateFailure, findOneAndUpdate: fail }, { distinct: legacyUnits }],
    ];
    for (const [label, unit, product] of cases) {
      await t.test(label, async () => {
        const controller = loadController(unit, product);
        const res = response();

        await controller.deleteUnit({ query: { name: 'Bag' } }, res);

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, 'Unit deletion failed');
      });
    }
  });
});
