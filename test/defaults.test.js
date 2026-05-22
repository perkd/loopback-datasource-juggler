// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

/* global getSchema:false */
const {describe, it, before} = require('node:test');
const assert = require('node:assert/strict');
require('./init.js');
const db = getSchema();

describe('defaults', function() {
  let Server;

  before(function() {
    Server = db.define('Server', {
      host: String,
      port: {type: Number, default: 80},
      createdAt: {type: Date, default: '$now'},
    });
  });

  it('should apply defaults on new', function() {
    const s = new Server;
    assert.equal(s.port, 80);
  });

  it('should apply defaults on create', async function() {
    const s = await Server.create();
    assert.equal(s.port, 80);
  });

  it('should NOT apply defaults on read', async function() {
    db.defineProperty('Server', 'host', {
      type: String,
      default: 'localhost',
    });
    const servers = await Server.all();
    assert.equal(servers[0].host, undefined);
  });

  it('should ignore defaults with limited fields', async function() {
    const s = await Server.create({host: 'localhost', port: 8080});
    assert.equal(s.port, 8080);
    const server = await Server.findById(s.id, {fields: ['host']});
    assert.equal(server.host, 'localhost');
    assert.equal(server.port, undefined);
  });

  it('should apply defaults in upsert create', async function() {
    const server = await Server.upsert({port: 8181});
    assert.ok(server.createdAt);
  });

  it('should preserve defaults in upsert update', async function() {
    const server = await Server.findOne({});
    const s = await Server.upsert({id: server.id, port: 1337});
    assert.equal(s.port, 1337);
    assert.deepEqual(server.createdAt, s.createdAt);
  });

  describe('applyDefaultOnWrites', function() {
    it('does not affect default behavior when not set', async () => {
      const Apple = db.define('Apple', {
        color: {type: String, default: 'red'},
        taste: {type: String, default: 'sweet'},
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create();
      assert.equal(apple.color, 'red');
      assert.equal(apple.taste, 'sweet');
    });

    it('removes the property when set to `false`', async () => {
      const Apple = db.define('Apple', {
        color: {type: String, default: 'red', applyDefaultOnWrites: false},
        taste: {type: String, default: 'sweet'},
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({color: 'red', taste: 'sweet'});
      const found = await Apple.findById(apple.id);
      assert.equal(found.color, undefined);
      assert.equal(found.taste, 'sweet');
    });

    it('removes nested property in an object when set to `false`', async () => {
      const Apple = db.define('Apple', {
        name: {type: String},
        qualities: {
          color: {type: String, default: 'red', applyDefaultOnWrites: false},
          taste: {type: String, default: 'sweet'},
        },
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({name: 'Honeycrisp', qualities: {taste: 'sweet'}});
      const found = await Apple.findById(apple.id);
      assert.equal(found.qualities.color, undefined);
      assert.equal(found.qualities.taste, 'sweet');
    });

    it('removes nested property in an array when set to `false', async () => {
      const Apple = db.define('Apple', {
        name: {type: String},
        qualities: [
          {color: {type: String, default: 'red', applyDefaultOnWrites: false}},
          {taste: {type: String, default: 'sweet'}},
        ],
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({name: 'Honeycrisp', qualities: [{taste: 'sweet'}]});
      const found = await Apple.findById(apple.id);
      assert.equal(found.qualities[0].color, undefined);
      assert.equal(found.qualities.length, 1);
    });
  });

  describe('persistDefaultValues', function() {
    it('removes property if value matches default', async () => {
      const Apple = db.define('Apple', {
        color: {type: String, default: 'red', persistDefaultValues: false},
        taste: {type: String, default: 'sweet'},
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({color: 'red', taste: 'sweet'});
      const found = await Apple.findById(apple.id);
      assert.equal(found.color, undefined);
      assert.equal(found.taste, 'sweet');
    });

    it('removes property if value matches default in an object', async () => {
      const Apple = db.define('Apple', {
        name: {type: String},
        qualities: {
          color: {type: String, default: 'red', persistDefaultValues: false},
          taste: {type: String, default: 'sweet'},
        },
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({name: 'Honeycrisp', qualities: {taste: 'sweet'}});
      const found = await Apple.findById(apple.id);
      assert.equal(found.qualities.color, undefined);
      assert.equal(found.qualities.taste, 'sweet');
    });

    it('removes property if value matches default in an array', async () => {
      const Apple = db.define('Apple', {
        name: {type: String},
        qualities: [
          {color: {type: String, default: 'red', persistDefaultValues: false}},
          {taste: {type: String, default: 'sweet'}},
        ],
      }, {applyDefaultsOnReads: false});

      const apple = await Apple.create({name: 'Honeycrisp', qualities: [{taste: 'sweet'}]});
      const found = await Apple.findById(apple.id);
      assert.equal(found.qualities[0].color, undefined);
      assert.equal(found.qualities.length, 1);
    });
  });
});
