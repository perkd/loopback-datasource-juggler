// Copyright IBM Corp. 2017,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
/* global getSchema:false */
const {describe, it, before, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
require('./init.js');
const DataSource = require('..').DataSource;
const EventEmitter = require('events');
const Connector = require('loopback-connector').Connector;
const Transaction = require('loopback-connector').Transaction;

describe('Transactions on memory connector', function() {
  let db, tx;

  before(() => {
    db = getSchema();
    db.define('Model');
  });

  it('returns an EventEmitter object', () => {
    tx = db.transaction();
    assert.ok(tx instanceof EventEmitter);
  });

  it('exposes and caches slave models', () => {
    testModelCaching(tx.models, db.models);
  });

  it('changes count when committing', async () => {
    const countBefore = await countModels(db.models.Model);
    assert.ok(countBefore !== undefined);
    assert.equal(countBefore, 0);

    tx.models.Model.create(Array(1), () => {
      // Only called after tx.commit()!
    });
    await commit(tx);

    const countAfter = await countModels(db.models.Model);
    assert.ok(countAfter !== undefined);
    assert.equal(countAfter, 1);
  });
});

describe('Transactions on test connector without execute()', () => {
  let db, tx;

  before(() => {
    db = createDataSource();
  });

  beforeEach(resetState);

  it('resolves to an EventEmitter', async () => {
    const promise = db.transaction();
    assert.ok(promise instanceof Promise);
    const transaction = await promise;
    assert.ok(transaction);
    assert.ok(transaction instanceof EventEmitter);
    tx = transaction;
  });

  it('beginTransaction returns a transaction', async () => {
    const transaction = await db.beginTransaction(Transaction.READ_UNCOMMITTED);
    assert.ok(transaction);
    assert.equal(typeof transaction.commit, 'function');
    assert.equal(typeof transaction.rollback, 'function');
  });

  it('exposes and caches slave models', () => {
    testModelCaching(tx.models, db.models);
  });

  it('does not allow nesting of transactions', () => {
    assert.throws(() => tx.transaction(), /Nesting transactions is not supported/);
  });

  it('calls commit() on the connector', async () => {
    const tx = await db.transaction();
    await commit(tx);
    assert.deepEqual(callCount, {commit: 1, rollback: 0, create: 0});
  });

  it('calls rollback() on the connector', async () => {
    const tx = await db.transaction();
    await rollback(tx);
    assert.deepEqual(callCount, {commit: 0, rollback: 1, create: 0});
  });
});

describe('Transactions on test connector with execute()', () => {
  let db;

  before(() => {
    db = createDataSource();
  });

  beforeEach(resetState);

  it('passes models and calls commit() automatically', async () => {
    await transactionWithCallback(db, models => {
      testModelCaching(models, db.models);
      return models.Model.create({});
    });
    assert.deepEqual(callCount, {commit: 1, rollback: 0, create: 1});
    assert.equal(transactionPassed, true);
  });

  it('calls rollback() automatically when throwing an error', async () => {
    let error;
    await assert.rejects(
      transactionWithCallback(db, models => {
        error = new Error('exception');
        throw error;
      }),
      err => err === error,
    );
    assert.deepEqual(callCount, {commit: 0, rollback: 1, create: 0});
  });

  it('reports execution timeouts', async () => {
    let timedOut = false;
    const lateCreateResult = new Promise((resolve, reject) => {
      transactionWithCallback(db, models => {
        setTimeout(() => {
          models.Model.create({}, function(err) {
            if (!timedOut) {
              reject(new Error('Timeout was ineffective'));
            } else {
              resolve(err);
            }
          });
        }, 50);
      }, {
        timeout: 25,
      }).catch(err => {
        timedOut = true;
        assert.ok(err);
        assert.equal(err.code, 'TRANSACTION_TIMEOUT');
        assert.equal(err.message, 'Transaction is rolled back due to timeout');
        assert.deepEqual(callCount, {commit: 0, rollback: 1, create: 0});
      });
    });

    const err = await lateCreateResult;
    assert.ok(err);
    assert.match(err.message, /^The transaction is not active:/);
  });
});

function createDataSource() {
  const db = new DataSource({
    initialize: (dataSource, cb) => {
      dataSource.connector = new TestConnector();
      cb();
    },
  });
  db.define('Model');
  return db;
}

function testModelCaching(txModels, dbModels) {
  assert.ok(txModels);
  // Test models caching mechanism:
  // Model property should be a accessor with a getter first:
  const accessor = Object.getOwnPropertyDescriptor(txModels, 'Model');
  assert.ok(accessor);
  assert.ok(accessor.get);
  assert.equal(typeof accessor.get, 'function');
  const Model = txModels.Model;
  assert.ok(Model);
  // After accessing it once, it should be a normal cached property:
  const desc = Object.getOwnPropertyDescriptor(txModels, 'Model');
  assert.ok(desc.value);
  assert.equal(Model, txModels.Model);
  assert.ok(Model.prototype instanceof dbModels.Model);
}

let callCount;
let transactionPassed;

function resetState() {
  callCount = {commit: 0, rollback: 0, create: 0};
  transactionPassed = false;
}

function countModels(Model) {
  return new Promise((resolve, reject) => {
    Model.count((err, count) => {
      if (err) return reject(err);
      resolve(count);
    });
  });
}

function commit(tx) {
  return new Promise((resolve, reject) => {
    tx.commit(err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function rollback(tx) {
  return new Promise((resolve, reject) => {
    tx.rollback(err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function transactionWithCallback(db, worker, options) {
  return new Promise((resolve, reject) => {
    const callback = err => {
      if (err) return reject(err);
      resolve();
    };

    if (options) {
      db.transaction(worker, options, callback);
    } else {
      db.transaction(worker, callback);
    }
  });
}

class TestConnector extends Connector {
  constructor() {
    super('test');
  }

  beginTransaction(isolationLevel, cb) {
    this.currentTransaction = new Transaction(this, this);
    process.nextTick(() => cb(null, this.currentTransaction));
  }

  commit(tx, cb) {
    callCount.commit++;
    cb();
  }

  rollback(tx, cb) {
    callCount.rollback++;
    cb();
  }

  create(model, data, options, cb) {
    callCount.create++;
    const transaction = options.transaction;
    const current = this.currentTransaction;
    transactionPassed = transaction &&
      (current === transaction || current === transaction.connection);
    cb();
  }
}
