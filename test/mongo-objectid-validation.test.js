'use strict';

const {before, describe, it} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false */
require('./init.js');

const j = require('../');
const ValidationError = j.ValidationError;
const {
  collectObjectIdPaths,
  isValidObjectIdValue,
  registerMongoObjectIdValidations,
} = require('../lib/mongo-objectid-validation');

function createMongoConnector() {
  const connector = {
    name: 'mongodb',
    getDefaultIdType: function() {
      return function ObjectID(id) { return id; };
    },
    create: function(model, data, options, cb) {
      process.nextTick(() => cb(null, '507f1f77bcf86cd799439011'));
    },
    initialize: function(dataSource, cb) {
      dataSource.connector = connector;
      cb(null);
    },
  };
  return connector;
}

function createMongoDataSource() {
  return new j.DataSource({
    connector: createMongoConnector(),
    lazyConnect: true,
  });
}

function isValidAsync(inst) {
  return new Promise(resolve => {
    inst.isValid(valid => resolve(valid));
  });
}

function createAsync(Model, data) {
  return new Promise((resolve, reject) => {
    Model.create(data, (err, inst) => {
      if (err) reject(err);
      else resolve(inst);
    });
  });
}

describe('mongo-objectid-validation', function() {
  describe('collectObjectIdPaths', function() {
    it('collects top-level and nested ObjectId paths', function() {
      const Spot = j.ModelBuilder.defaultInstance.define('SpotForOidTest', {
        placeId: {type: String},
        resourceId: {type: String},
      }, {idInjection: false});

      const properties = {
        orderId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
        destination: {
          type: Spot,
        },
      };

      Spot.definition.properties.placeId.mongodb = {dataType: 'ObjectID'};

      const paths = collectObjectIdPaths(properties, [], '');
      const fullPaths = paths.map(p => p.fullPath).sort();

      assert.deepEqual(fullPaths, ['destination.placeId', 'orderId']);
    });
  });

  describe('isValidObjectIdValue', function() {
    it('accepts valid hex strings and rejects templates', function() {
      assert.equal(isValidObjectIdValue('666c78d9f2d1ff00392c13aa'), true);
      assert.equal(isValidObjectIdValue('{{spot.placeId}}'), false);
      assert.equal(isValidObjectIdValue([
        '666c78d9f2d1ff00392c13aa',
        '507f1f77bcf86cd799439011',
      ]), true);
      assert.equal(isValidObjectIdValue([
        '666c78d9f2d1ff00392c13aa',
        '{{spot.placeId}}',
      ]), false);
      assert.equal(isValidObjectIdValue(null), true);
      assert.equal(isValidObjectIdValue(''), true);
    });
  });

  describe('registerMongoObjectIdValidations', function() {
    let db, Fulfillment;

    before(function() {
      db = createMongoDataSource();

      const Spot = db.createModel('SpotOidVal', {
        placeId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
      }, {idInjection: false});

      Fulfillment = db.createModel('FulfillmentOidVal', {
        id: {
          type: String,
          id: true,
          mongodb: {dataType: 'ObjectID'},
        },
        orderId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
        placeId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
        relatedIds: {
          type: [String],
          mongodb: {dataType: 'ObjectID'},
        },
        destination: {
          type: Spot,
        },
      });
    });

    it('registers validations once per model', function() {
      assert.equal(Fulfillment.__objectIdValidationsRegistered, true);
      assert.ok(Array.isArray(Fulfillment.__objectIdPaths));
      assert.ok(Fulfillment.__objectIdPaths.length >= 3);
    });

    it('fails isValid for invalid placeId before persist', async function() {
      const inst = new Fulfillment({
        orderId: '666c78d9f2d1ff00392c13aa',
        placeId: '{{spot.placeId}}',
        destination: {
          placeId: '666c78d9f2d1ff00392c13aa',
        },
      });

      const valid = await isValidAsync(inst);
      assert.equal(valid, false);
      assert.ok(inst.errors.placeId);
    });

    it('fails isValid for invalid nested destination.placeId', async function() {
      const inst = new Fulfillment({
        orderId: '666c78d9f2d1ff00392c13aa',
        placeId: '666c78d9f2d1ff00392c13aa',
        destination: {
          placeId: '{{spot.placeId}}',
        },
      });

      const valid = await isValidAsync(inst);
      assert.equal(valid, false);
      assert.ok(inst.errors['destination.placeId']);
    });

    it('passes isValid for valid ObjectId values', async function() {
      const inst = new Fulfillment({
        orderId: '666c78d9f2d1ff00392c13aa',
        placeId: '666c78d9f2d1ff00392c13aa',
        relatedIds: [
          '666c78d9f2d1ff00392c13aa',
          '507f1f77bcf86cd799439011',
        ],
        destination: {
          placeId: '666c78d9f2d1ff00392c13aa',
        },
      });

      const valid = await isValidAsync(inst);
      assert.equal(valid, true);
    });

    it('fails isValid for invalid ObjectId array items', async function() {
      const inst = new Fulfillment({
        orderId: '666c78d9f2d1ff00392c13aa',
        placeId: '666c78d9f2d1ff00392c13aa',
        relatedIds: [
          '666c78d9f2d1ff00392c13aa',
          '{{spot.placeId}}',
        ],
      });

      const valid = await isValidAsync(inst);
      assert.equal(valid, false);
      assert.ok(inst.errors.relatedIds);
    });

    it('returns ValidationError on create with invalid ObjectId', async function() {
      await assert.rejects(
        () => createAsync(Fulfillment, {
          orderId: '666c78d9f2d1ff00392c13aa',
          placeId: '{{spot.placeId}}',
          destination: {
            placeId: '666c78d9f2d1ff00392c13aa',
          },
        }),
        err => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.details.codes.placeId.includes('objectid'));
          return true;
        },
      );
    });

    it('does not register for non-mongodb connectors', function() {
      const memoryDb = getSchema();
      const Widget = memoryDb.define('WidgetOidVal', {
        placeId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
      });

      assert.equal(Widget.__objectIdValidationsRegistered, undefined);
    });
  });

  describe('registerMongoObjectIdValidations direct', function() {
    it('respects validateObjectIds: false on model settings', function() {
      const ModelClass = j.ModelBuilder.defaultInstance.define('SkipOidVal', {
        placeId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
      });

      registerMongoObjectIdValidations(ModelClass, {validateObjectIds: false}, {
        connector: {name: 'mongodb'},
      });

      assert.equal(ModelClass.__objectIdValidationsRegistered, undefined);
    });

    it('registers when datasource connector is configured as a string', function() {
      const ModelClass = j.ModelBuilder.defaultInstance.define('StringConnectorOidVal', {
        placeId: {
          type: String,
          mongodb: {dataType: 'ObjectID'},
        },
      });

      registerMongoObjectIdValidations(ModelClass, {}, {
        settings: {connector: 'mongodb'},
      });

      assert.equal(ModelClass.__objectIdValidationsRegistered, true);
    });
  });
});
