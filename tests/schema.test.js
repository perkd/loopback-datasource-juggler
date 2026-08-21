// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

/* global getSchema:false */
const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

const db = getSchema();
const slave = getSchema();
let Model, SlaveModel;

describe('dataSource', function() {
  it('should define Model', function() {
    Model = db.define('Model');
    assert.strictEqual(Model.dataSource, db);
    const m = new Model;
    assert.strictEqual(m.getDataSource(), db);
  });

  it('should clone existing model', function() {
    SlaveModel = slave.copyModel(Model);
    assert.strictEqual(SlaveModel.dataSource, slave);
    assert.notStrictEqual(slave, db);
    const sm = new SlaveModel;
    assert.ok(sm instanceof Model);
    assert.notStrictEqual(sm.getDataSource(), db);
    assert.strictEqual(sm.getDataSource(), slave);
  });

  it('should automigrate', async function() {
    await db.automigrate();
  });

  it('should create transaction', async function() {
    const tr = db.transaction();
    assert.strictEqual(tr.connected, false);
    assert.strictEqual(tr.connecting, false);
    let called = false;
    tr.models.Model.create(Array(3), function() {
      called = true;
    });
    assert.strictEqual(tr.connected, false);
    assert.strictEqual(tr.connecting, true);

    const countBefore = await db.models.Model.count();
    assert.ok(countBefore != null);
    assert.strictEqual(countBefore, 0);
    assert.strictEqual(called, false);

    await new Promise((resolve, reject) => {
      tr.exec(function(err) {
        if (err) return reject(err);
        setTimeout(resolve, 100);
      });
    });

    assert.strictEqual(called, true);
    const countAfter = await db.models.Model.count();
    assert.strictEqual(countAfter, 3);
  });
});
