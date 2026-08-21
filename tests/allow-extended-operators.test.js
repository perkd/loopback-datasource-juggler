// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('node:assert/strict');
const {describe, it} = require('node:test');

const DataSource = require('..').DataSource;

describe('allowExtendedOperators', () => {
  function createTestModel(connectorSettings, modelSettings) {
    const ds = createTestDataSource(connectorSettings);
    const TestModel = ds.createModel('TestModel', {value: String}, modelSettings);

    TestModel.observe('persist', function(ctx, next) {
      ctx.Model.lastPersistedData = ctx.data;
      next();
    });

    return TestModel;
  }

  function createTestDataSource(connectorSettings) {
    connectorSettings = connectorSettings || {};
    connectorSettings.connector = {
      initialize: (dataSource, cb) => {
        dataSource.connector = new TestConnector(dataSource);
      },
    };

    return new DataSource(connectorSettings);
  }

  function extendedQuery() {
    // datasource modifies the query,
    // we have to build a new object for each test
    return {where: {value: {$exists: true}}};
  }

  function setCustomData() {
    return {$set: {value: 'changed'}};
  }

  function updateShouldHaveFailed() {
    throw new Error('updateAttributes() should have failed.');
  }

  class TestConnector {
    constructor(dataSource) {
    }

    create(model, data, options, callback) {
      callback();
    }

    updateAttributes(model, id, data, options, callback) {
      callback();
    }

    all(model, filter, options, callback) {
      // return the raw "value" query
      const instanceFound = {
        value: filter.where.value,
      };
      callback(null, [instanceFound]);
    }
  }

  function assertOperatorNotAllowed(err) {
    assert.ok(err);
    assert.match(err.message, /Operators "\$exists" are not allowed in query/);
    assert.strictEqual(err.code, 'OPERATOR_NOT_ALLOWED_IN_QUERY');
    assert.strictEqual(err.statusCode, 400);
    assert.ok(Object.prototype.hasOwnProperty.call(err.details, 'operators'));
    assert.ok(Object.prototype.hasOwnProperty.call(err.details, 'where'));
  }

  describe('dataSource.settings.allowExtendedOperators', () => {
    describe('DAO.find()', () => {
      it('reports invalid operator by default', () => {
        const TestModel = createTestModel();
        return TestModel.find(extendedQuery()).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('preserves extended operators with allowExtendedOperators set', () => {
        const TestModel = createTestModel({allowExtendedOperators: true});
        return TestModel.find(extendedQuery()).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`Model.settings.allowExtendedOperators` override data source settings - ' +
        'reports invalid operator', () => {
        const TestModel = createTestModel({allowExtendedOperators: true}, {allowExtendedOperators: false});
        return TestModel.find(extendedQuery()).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`Model.settings.allowExtendedOperators` override data source settings - ' +
        'preserves extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: false}, {allowExtendedOperators: true});
        return TestModel.find(extendedQuery()).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`options.allowExtendedOperators` override data source settings - ' +
        'reports invalid operator', () => {
        const TestModel = createTestModel({allowExtendedOperators: true});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: false}).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`options.allowExtendedOperators` override data source settings - ' +
        'preserves extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: false});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: true}).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });
    });

    describe('DAO.updateAttributes()', () => {
      it('`options.allowExtendedOperators` override data source settings - disable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: false}, {strict: true});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData(), {allowExtendedOperators: true})
            .then(() => {
              assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
            });
        });
      });

      it('`options.allowExtendedOperators` override data source settings - enable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: true}, {strict: true});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData(), {allowExtendedOperators: false})
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });

      it('`Model.settings.allowExtendedOperators` override data source settings - ' +
        'disable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: false},
          {strict: true, allowExtendedOperators: true});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData()).then(() => {
            assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
          });
        });
      });

      it('`Model.settings.allowExtendedOperators` override data source settings - ' +
        'enable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: true},
          {strict: true, allowExtendedOperators: false});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData())
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });
    });
  });

  describe('Model.settings.allowExtendedOperators', () => {
    describe('DAO.find()', () => {
      it('preserves extended operators with allowExtendedOperators set', () => {
        const TestModel = createTestModel({}, {allowExtendedOperators: true});
        return TestModel.find(extendedQuery()).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor Model settings - ' +
        'reports invalid operator', () => {
        const TestModel = createTestModel({allowExtendedOperators: true}, {allowExtendedOperators: false});
        return TestModel.find(extendedQuery()).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor Model settings - ' +
        'preserves extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: false}, {allowExtendedOperators: true});
        return TestModel.find(extendedQuery()).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`options.allowExtendedOperators` override Model settings - converts extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: true});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: false}).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`options.allowExtendedOperators` Model settings - preserves extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: false});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: true}).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });
    });

    describe('DAO.updateAttributes()', () => {
      it('`options.allowExtendedOperators` override Model settings - disable strict check', () => {
        const TestModel = createTestModel({}, {strict: true, allowExtendedOperators: false});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData(), {allowExtendedOperators: true})
            .then(() => {
              assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
            });
        });
      });

      it('`options.allowExtendedOperators` override Model settings - enabled strict check', () => {
        const TestModel = createTestModel({}, {strict: true, allowExtendedOperators: true});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData(), {allowExtendedOperators: false})
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor Model settings - disable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: false},
          {strict: true, allowExtendedOperators: true});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData()).then(() => {
            assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
          });
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor Model settings - ' +
        'enable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: true},
          {strict: true, allowExtendedOperators: false});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData())
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });
    });
  });

  describe('options.allowExtendedOperators', () => {
    describe('DAO.find()', () => {
      it('preserves extended operators with allowExtendedOperators set', () => {
        const TestModel = createTestModel();
        return TestModel.find(extendedQuery(), {allowExtendedOperators: true}).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor options settings - ' +
        'converts extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: true});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: false}).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor options settings - ' +
        'preserves extended operators', () => {
        const TestModel = createTestModel({allowExtendedOperators: false});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: true}).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });

      it('`Model.settings.allowExtendedOperators` honor options settings - ' +
        'converts extended operators', () => {
        const TestModel = createTestModel({}, {allowExtendedOperators: true});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: false}).catch(err => {
          assertOperatorNotAllowed(err);
        });
      });

      it('`Model.settings.allowExtendedOperators` honor options settings - ' +
        'preserves extended operators', () => {
        const TestModel = createTestModel({}, {allowExtendedOperators: false});
        return TestModel.find(extendedQuery(), {allowExtendedOperators: true}).then(results => {
          assert.deepStrictEqual(results[0].value, {$exists: true});
        });
      });
    });

    describe('DAO.updateAttributes()', () => {
      it('`Model.settings.allowExtendedOperators` honor options settings - disable strict check', () => {
        const TestModel = createTestModel({}, {strict: true, allowExtendedOperators: false});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData(), {allowExtendedOperators: true})
            .then(() => {
              assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
            });
        });
      });

      it('`Model.settings.allowExtendedOperators` honor options settings - enable strict check', () => {
        const TestModel = createTestModel({}, {strict: true, allowExtendedOperators: true});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData(), {allowExtendedOperators: false})
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor options settings - disable strict check', () => {
        const TestModel = createTestModel({}, {strict: true});
        return TestModel.create({value: 'test'}).then((instance) => {
          return instance.updateAttributes(setCustomData(), {allowExtendedOperators: true})
            .then(() => {
              assert.deepStrictEqual(TestModel.lastPersistedData, setCustomData());
            });
        });
      });

      it('`dataSource.settings.allowExtendedOperators` honor options settings - enable strict check', () => {
        const TestModel = createTestModel({allowExtendedOperators: true}, {strict: true});
        return TestModel.create({value: 'test'}).then((inst) => {
          return inst.updateAttributes(setCustomData(), {allowExtendedOperators: false})
            .then(updateShouldHaveFailed, function onError(err) {
              assert.ok(err);
              assert.strictEqual(err.name, 'ValidationError');
            });
        });
      });
    });
  });
});
