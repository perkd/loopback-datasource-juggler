// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

const nodeTest = require('node:test');
const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} = nodeTest;
const assert = require('node:assert/strict');

/* global getSchema:false, connectorCapabilities:false */
const bdd = require('./helpers/bdd-if');
require('./init.js');
const uid = require('./helpers/uid-generator');

let db, User;

describe('basic-querying', function() {
  before(async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      const userModelDef = {
        seq: {type: Number, index: true},
        name: {type: String, index: true, sort: true},
        email: {type: String, index: true},
        birthday: {type: Date, index: true},
        role: {type: String, index: true},
        order: {type: Number, index: true, sort: true},
        tag: {type: String, index: true},
        vip: {type: Boolean},
        address: {
          street: String,
          city: String,
          state: String,
          zipCode: String,
          tags: [
            {
              tag: String,
            },
          ],
        },
        friends: [
          {
            name: String,
          },
        ],
        addressLoc: {
          lat: Number,
          lng: Number,
        },
      };

      db = getSchema();
      // connectors that do not support geo-point types
      connectorCapabilities.geoPoint = (db.adapter.name != 'dashdb') && (db.adapter.name != 'db2') &&
    (db.adapter.name != 'informix') && (db.adapter.name != 'cassandra');
      if (connectorCapabilities.geoPoint) userModelDef.addressLoc = {type: 'GeoPoint'};
      User = db.define('User', userModelDef);
      db.automigrate(done);
    });
  });

  describe('ping', function() {
    it('should be able to test connections', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db.ping(function(err) {
          assert.ok(err == null);
          done();
        });
      });
    });
  });

  describe('findById', function() {
    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db = getSchema();
        User.destroyAll(done);
      });
    });

    it('should query by id: not found', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        const unknownId = uid.fromConnector(db) || 1;
        User.findById(unknownId, function(err, u) {
          assert.ok(u == null);
          assert.ok(err == null);
          done();
        });
      });
    });

    it('should query by id: found', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.create(function(err, u) {
          assert.ok(err == null);
          assert.ok(u.id != null);
          User.findById(u.id, function(err, u) {
            assert.ok(u != null);
            assert.ok(err == null);
            assert.ok(u instanceof User);
            done();
          });
        });
      });
    });
  });

  describe('findByIds', function() {
    let createdUsers;
    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db = getSchema();
        const people = [
          {name: 'a', vip: true},
          {name: 'b', vip: null},
          {name: 'c'},
          {name: 'd', vip: true},
          {name: 'e'},
          {name: 'f'},
        ];
        db.automigrate(['User'], function(err) {
          User.create(people, function(err, users) {
            assert.ok(err == null);
            // Users might be created in parallel and the generated ids can be
            // out of sequence
            createdUsers = users;
            done();
          });
        });
      });
    });

    it('should query by ids', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findByIds(
          [createdUsers[2].id, createdUsers[1].id, createdUsers[0].id],
          function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            const names = users.map(function(u) {
              return u.name;
            });
            assert.deepStrictEqual(names,
              [createdUsers[2].name, createdUsers[1].name, createdUsers[0].name]);
            done();
          },
        );
      });
    });

    it('should query by ids and condition', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findByIds([
          createdUsers[0].id,
          createdUsers[1].id,
          createdUsers[2].id,
          createdUsers[3].id],
        {where: {vip: true}}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          const names = users.map(function(u) {
            return u.name;
          });
          assert.deepStrictEqual(names, createdUsers.slice(0, 4).
            filter(function(u) {
              return u.vip;
            }).map(function(u) {
              return u.name;
            }));
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.nullDataValueExists !== false,
      'should query by ids to check null property', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.findByIds([
            createdUsers[0].id,
            createdUsers[1].id],
          {where: {vip: null}}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.deepStrictEqual(users.length, 1);
            assert.deepStrictEqual(users[0].name, createdUsers[1].name);
            done();
          });
        });
      });
  });

  describe('find', function() {
    before(seed);

    before(function setupDelayingLoadedHook() {
      User.observe('loaded', nextAfterDelay);
    });

    after(function removeDelayingLoadHook() {
      User.removeObserver('loaded', nextAfterDelay);
    });

    it('should query collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 6);
          done();
        });
      });
    });

    it('should query limited collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({limit: 3}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 3);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportPagination !== false, 'should query collection with skip & ' +
    'limit', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({skip: 1, limit: 4, order: 'seq'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.deepStrictEqual(users[0].seq, 1);
          assert.strictEqual(users.length, 4);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportPagination !== false, 'should query collection with offset & ' +
    'limit', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({offset: 2, limit: 3, order: 'seq'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.deepStrictEqual(users[0].seq, 2);
          assert.strictEqual(users.length, 3);
          done();
        });
      });
    });

    it('should query filtered collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {role: 'lead'}}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 2);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort !== false, 'should query collection sorted by numeric ' +
    'field', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'order'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          users.forEach(function(u, i) {
            assert.deepStrictEqual(u.order, i + 1);
          });
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort !== false, 'should query collection desc sorted by ' +
    'numeric field', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'order DESC'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          users.forEach(function(u, i) {
            assert.deepStrictEqual(u.order, users.length - i);
          });
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort !== false, 'should query collection sorted by string ' +
    'field', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'name'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.shift().name, 'George Harrison');
          assert.strictEqual(users.shift().name, 'John Lennon');
          assert.strictEqual(users.pop().name, 'Stuart Sutcliffe');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort !== false, 'should query collection desc sorted by ' +
    'string field', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'name DESC'}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.pop().name, 'George Harrison');
          assert.strictEqual(users.pop().name, 'John Lennon');
          assert.strictEqual(users.shift().name, 'Stuart Sutcliffe');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort !== false, 'should query sorted desc by order integer field' +
    ' even though there is an async model loaded hook', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'order DESC'}, function(err, users) {
          if (err) return done(err);
          assert.ok(users != null);
          const order = users.map(function(u) { return u.order; });
          assert.deepStrictEqual(order, [6, 5, 4, 3, 2, 1]);
          done();
        });
      });
    });

    it('should support "and" operator that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {and: [
          {name: 'John Lennon'},
          {role: 'lead'},
        ]}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          done();
        });
      });
    });

    it('should support "and" operator that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {and: [
          {name: 'John Lennon'},
          {role: 'member'},
        ]}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportOrOperator !== false, 'should support "or" that is ' +
    'satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {or: [
          {name: 'John Lennon'},
          {role: 'lead'},
        ]}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportOrOperator !== false, 'should support "or" operator that is ' +
    'not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {or: [
          {name: 'XYZ'},
          {role: 'Hello1'},
        ]}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.nullDataValueExists !== false,
      'should support where date "neq" null', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {birthday: {'neq': null},
          }}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
            assert.ok(['John Lennon', 'Paul McCartney'].includes(users[0].name));
            assert.ok(['John Lennon', 'Paul McCartney'].includes(users[1].name));
            done();
          });
        });
      });

    bdd.itIf(connectorCapabilities.nullDataValueExists !== false,
      'should support where date is null', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {birthday: null,
          }}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
            done();
          });
        });
      });

    it('should support date "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {birthday: {'gte': new Date('1980-12-08')},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    it('should support date "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {birthday: {'gt': new Date('1980-12-08')},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should support date "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {birthday: {'gt': new Date('1980-12-07')},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should support date "lt" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {birthday: {'lt': new Date('1980-12-07')},
          }}, function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'Paul McCartney');
            done();
          });
        });
      });

    it('should support number "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {'gte': 3}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
          const expectedNames = [
            'George Harrison', 'Ringo Starr', 'Pete Best', 'Stuart Sutcliffe',
          ];
          assert.ok(expectedNames.every(name => users.map(u => u.name).includes(name)));
          done();
        });
      });
    });

    it('should support number "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {'gt': 6},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should support number "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {'gt': 5},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'Ringo Starr');
          done();
        });
      });
    });

    it('should support number "lt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {'lt': 2},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'Paul McCartney');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.ignoreUndefinedConditionValue !== false, 'should support number "gt" ' +
    'that is satisfied by null value', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'seq', where: {order: {'gt': null}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.ignoreUndefinedConditionValue !== false, 'should support number "lt" ' +
    'that is not satisfied by null value', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {'lt': null}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.ignoreUndefinedConditionValue !== false, 'should support string "gte" ' +
    'that is satisfied by null value', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({order: 'seq', where: {name: {'gte': null}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should support string "gte" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {'gte': 'Paul McCartney'}}}, function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
            for (let ix = 0; ix < users.length; ix++) {
              assert.ok(users[ix].name >= 'Paul McCartney');
            }
            done();
          });
        });
      });

    it('should support string "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {name: {'gt': 'xyz'},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should support string "gt" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {'gt': 'Paul McCartney'},
          }}, function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
            for (let ix = 0; ix < users.length; ix++) {
              assert.ok(users[ix].name > 'Paul McCartney');
            }
            done();
          });
        });
      });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should support string "lt" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {'lt': 'Paul McCartney'},
          }}, function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
            for (let ix = 0; ix < users.length; ix++) {
              assert.ok(users[ix].name < 'Paul McCartney');
            }
            done();
          });
        });
      });

    it('should support boolean "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {'gte': true},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok((['John Lennon', 'Stuart Sutcliffe', 'Paul McCartney']).includes(users[ix].name));
            assert.strictEqual(users[ix].vip, true);
          }
          done();
        });
      });
    });

    it('should support boolean "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {'gt': true},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should support boolean "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {'gt': false},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok((['John Lennon', 'Stuart Sutcliffe', 'Paul McCartney']).includes(users[ix].name));
            assert.strictEqual(users[ix].vip, true);
          }
          done();
        });
      });
    });

    it('should support boolean "lt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {'lt': true},
        }}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok((['Ringo Starr', 'George Harrison']).includes(users[ix].name));
            assert.strictEqual(users[ix].vip, false);
          }
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportInq, 'supports non-empty inq', function() {
      // note there is no record with seq=100
      return User.find({where: {seq: {inq: [0, 1, 100]}}})
        .then(result => {
          const seqsFound = result.map(r => r.seq);
          assert.deepStrictEqual(seqsFound, [0, 1]);
        });
    });

    bdd.itIf(connectorCapabilities.supportInq, 'supports empty inq', function() {
      return User.find({where: {seq: {inq: []}}})
        .then(result => {
          const seqsFound = result.map(r => r.seq);
          assert.deepStrictEqual(seqsFound, []);
        });
    });

    const itWhenIlikeSupported = connectorCapabilities.ilike;
    bdd.describeIf(itWhenIlikeSupported, 'ilike', function() {
      it('should support "like" that is satisfied',
        async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({where: {name: {like: 'John'}}},
              function(err, users) {
                if (err) return done(err);
                assert.strictEqual(users.length, 1);
                assert.strictEqual(users[0].name, 'John Lennon');
                done();
              });
          });
        });

      it('should sanitize invalid usage of like', async () => {
        const users = await User.find({where: {tag: {like: '['}}});
        assert.strictEqual(users.length, 1);
        assert.ok(Object.prototype.hasOwnProperty.call(users[0], 'name')); assert.strictEqual(users[0].name, 'John Lennon');
      });

      it('should support "like" that is not satisfied',
        async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({where: {name: {like: 'Bob'}}},
              function(err, users) {
                if (err) return done(err);
                assert.strictEqual(users.length, 0);
                done();
              });
          });
        });
      it('should support "ilike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {ilike: 'john'}}},
            function(err, users) {
              if (err) return done(err);
              assert.strictEqual(users.length, 1);
              assert.strictEqual(users[0].name, 'John Lennon');
              done();
            });
        });
      });
      it('should support "ilike" that is not satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {ilike: 'bob'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 0);
            done();
          });
        });
      });

      it('should properly sanitize invalid ilike filter', async () => {
        const users = await User.find({where: {name: {ilike: '['}}});
        assert.strictEqual(users.length, 0);
      });
    });

    const itWhenNilikeSupported = connectorCapabilities.nilike !== false;
    bdd.describeIf(itWhenNilikeSupported, 'nilike', function() {
      it('should support "nlike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {nlike: 'John'}}},
            function(err, users) {
              if (err) return done(err);
              assert.strictEqual(users.length, 5);
              assert.strictEqual(users[0].name, 'Paul McCartney');
              done();
            });
        });
      });

      it('should support "nilike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {nilike: 'john'}}},
            function(err, users) {
              if (err) return done(err);
              assert.strictEqual(users.length, 5);
              assert.strictEqual(users[0].name, 'Paul McCartney');
              done();
            });
        });
      });
    });

    describe('geo queries', function() {
      describe('near filter', function() {
        it('supports a basic "near" query', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({
              where: {
                addressLoc: {
                  near: {lat: 29.9, lng: -90.07},
                },
              },
            }, function(err, users) {
              if (err) done(err);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
              assert.strictEqual(users[0].name, 'John Lennon');
              assert.ok(users[0] instanceof User);
              assert.notStrictEqual(users[0].addressLoc, null);
              done();
            });
          });
        });

        it('supports "near" inside a coumpound query with "and"', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({
              where: {
                and: [
                  {
                    addressLoc: {
                      near: {lat: 29.9, lng: -90.07},
                    },
                  },
                  {
                    vip: true,
                  },
                ],
              },
            }, function(err, users) {
              if (err) done(err);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
              assert.strictEqual(users[0].name, 'John Lennon');
              assert.ok(users[0] instanceof User);
              assert.notStrictEqual(users[0].addressLoc, null);
              assert.strictEqual(users[0].vip, true);
              done();
            });
          });
        });

        it('supports "near" inside a complex coumpound query with multiple "and"', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({
              where: {
                and: [
                  {
                    and: [
                      {
                        addressLoc: {
                          near: {lat: 29.9, lng: -90.07},
                        },
                      },
                      {
                        order: 2,
                      },
                    ],
                  },
                  {
                    vip: true,
                  },
                ],
              },
            }, function(err, users) {
              if (err) done(err);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
              assert.strictEqual(users[0].name, 'John Lennon');
              assert.ok(users[0] instanceof User);
              assert.notStrictEqual(users[0].addressLoc, null);
              assert.strictEqual(users[0].vip, true);
              assert.strictEqual(users[0].order, 2);
              done();
            });
          });
        });

        it('supports multiple "near" queries with "or"', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({
              where: {
                or: [
                  {
                    addressLoc: {
                      near: {lat: 29.9, lng: -90.04},
                      maxDistance: 300,
                    },
                  },
                  {
                    addressLoc: {
                      near: {lat: 22.97, lng: -88.03},
                      maxDistance: 50,
                    },
                  },
                ],
              },
            }, function(err, users) {
              if (err) done(err);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
              assert.notStrictEqual(users[0].addressLoc, null);
              assert.strictEqual(users[0].name, 'Paul McCartney');
              assert.ok(users[0] instanceof User);
              assert.notStrictEqual(users[1].addressLoc, null);
              assert.strictEqual(users[1].name, 'John Lennon');
              done();
            });
          });
        });

        it('supports multiple "near" queries with "or" ' +
          'inside a coumpound query with "and"', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({
              where: {
                and: [
                  {
                    or: [
                      {
                        addressLoc: {
                          near: {lat: 29.9, lng: -90.04},
                          maxDistance: 300,
                        },
                      },
                      {
                        addressLoc: {
                          near: {lat: 22.7, lng: -89.03},
                          maxDistance: 50,
                        },
                      },
                    ],
                  },
                  {
                    vip: true,
                  },
                ],
              },
            }, function(err, users) {
              if (err) done(err);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
              assert.notStrictEqual(users[0].addressLoc, null);
              assert.strictEqual(users[0].name, 'John Lennon');
              assert.ok(users[0] instanceof User);
              assert.strictEqual(users[0].vip, true);
              done();
            });
          });
        });
      });
    });

    it('should only include fields as specified', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        let remaining = 0;

        function sample(fields) {
          return {
            expect: function(arr) {
              remaining++;
              User.find({fields: fields}, function(err, users) {
                remaining--;
                if (err) return done(err);

                assert.ok(users != null);

                if (remaining === 0) {
                  done();
                }

                users.forEach(function(user) {
                  const obj = user.toObject();

                  Object.keys(obj)
                    .forEach(function(key) {
                    // if the obj has an unexpected value
                      if (obj[key] !== undefined && arr.indexOf(key) === -1) {
                        console.log('Given fields:', fields);
                        console.log('Got:', key, obj[key]);
                        console.log('Expected:', arr);
                        throw new Error('should not include data for key: ' + key);
                      }
                    });
                });
              });
            },
          };
        }

        sample({name: true}).expect(['name']);
        sample({name: false}).expect([
          'id', 'seq', 'email', 'role', 'order', 'birthday', 'vip', 'address', 'friends', 'addressLoc', 'tag',
        ]);
        sample({name: false, id: true}).expect(['id']);
        sample({id: true}).expect(['id']);
        sample('id').expect(['id']);
        sample(['id']).expect(['id']);
        sample(['email']).expect(['email']);
      });
    });

    it('should ignore non existing properties when excluding', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        return User.find({fields: {notExist: false}}, (err, users) => {
          if (err) return done(err);
          users.forEach(user => {
            switch (user.seq) { // all fields depending on each document
              case 0:
              case 1:
                assert.ok(['id', 'seq', 'name', 'order', 'role',
                  'birthday', 'vip', 'address', 'friends']
                  .every(key => Object.keys(user.__data).includes(key)));
                break;
              case 4: // seq 4
                assert.ok((['id', 'seq', 'name', 'order']).every(item => Object.keys(user.__data).includes(item)));
                break;
              default: // Other records, seq 2, 3, 5
                assert.ok((['id', 'seq', 'name', 'order', 'vip']).every(item => Object.keys(user.__data).includes(item)));
            }
          });
          done();
        });
      });
    });

    const describeWhenNestedSupported = connectorCapabilities.nestedProperty;
    bdd.describeIf(describeWhenNestedSupported, 'query with nested property', function() {
      it('should support nested property in query', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {'address.city': 'San Jose'}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 1);
            for (let i = 0; i < users.length; i++) {
              assert.deepStrictEqual(users[i].address.city, 'San Jose');
            }
            done();
          });
        });
      });

      it('should support nested property with regex over arrays in query', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {'friends.name': {regexp: /^Ringo/}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 2);
            const expectedUsers = ['John Lennon', 'Paul McCartney'];
            assert.notStrictEqual(expectedUsers.indexOf(users[0].name), -1);
            assert.notStrictEqual(expectedUsers.indexOf(users[1].name), -1);
            done();
          });
        });
      });

      it('should support nested property with gt in query', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {'address.city': {gt: 'San'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 2);
            for (let i = 0; i < users.length; i++) {
              assert.deepStrictEqual(users[i].address.state, 'CA');
            }
            done();
          });
        });
      });

      bdd.itIf(connectorCapabilities.adhocSort,
        'should support nested property for order in query',
        async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({where: {'address.state': 'CA'}, order: 'address.city DESC'},
              function(err, users) {
                if (err) return done(err);
                assert.strictEqual(users.length, 2);
                assert.deepStrictEqual(users[0].address.city, 'San Mateo');
                assert.deepStrictEqual(users[1].address.city, 'San Jose');
                done();
              });
          });
        });

      it('should support multi-level nested array property in query', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {'address.tags.tag': 'business'}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].address.tags[0].tag, 'business');
            assert.strictEqual(users[0].address.tags[1].tag, 'rent');
            done();
          });
        });
      });

      it('should fail when querying with an invalid value for a type',
        async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.find({where: {birthday: 'notadate'}}, function(err, users) {
              assert.ok(err != null);
              assert.strictEqual(err.message, 'Invalid date: notadate');
              done();
            });
          });
        });

      it('preserves empty values from the database', async () => {
      // https://github.com/strongloop/loopback-datasource-juggler/issues/1692

        // Initially, all Players were always active, no property was needed
        const Player = db.define('Player', {name: String});

        await db.automigrate('Player');
        const created = await Player.create({name: 'Pen'});

        // Later on, we decide to introduce `active` property
        Player.defineProperty('active', {
          type: Boolean,
          default: false,
        });
        await db.autoupdate('Player');

        // And query existing data
        const found = await Player.findOne();
        assert.ok([
          undefined, // databases supporting `undefined` value
          null, // databases representing `undefined` as `null` (e.g. SQL)
        ].includes(found.toObject().active));
      });

      describe('check __parent relationship in embedded models', () => {
        beforeEach(() => {
          User.modelBuilder.settings.parentRef = true;
        });

        afterEach(() => {
          User.modelBuilder.settings.parentRef = false;
        });

        it('should fill the parent in embedded model', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          assert.ok(user.address);
          assert.ok(Object.prototype.hasOwnProperty.call(user.address, '__parent'));
          assert.ok(user.address.__parent instanceof User);
          assert.strictEqual(user.address.__parent, user);
        });
        it('should assign the container model as parent in list property', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          assert.ok(user.friends);
          assert.ok(Object.prototype.hasOwnProperty.call(user.friends, 'parent'));
          assert.ok(user.friends.parent instanceof User);
          assert.strictEqual(user.friends.parent, user);
        });
        it('should have the complete chain of parents available in embedded list element', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          user.friends.forEach((userFriend) => {
            assert.ok(Object.prototype.hasOwnProperty.call(userFriend, '__parent'));
            assert.strictEqual(userFriend.__parent, user);
          });
        });
      });
    });
  });

  describe('find after createAll', function() {
    before(async function seedData() {
      await seed(true);
    });

    before(function setupDelayingLoadedHook() {
      User.observe('loaded', nextAfterDelay);
    });

    after(function removeDelayingLoadHook() {
      User.removeObserver('loaded', nextAfterDelay);
    });

    it('should query collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 6);
          done();
        });
      });
    });

    it('should query limited collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({limit: 3}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 3);
          done();
        });
      });
    });

    bdd.itIf(
      connectorCapabilities.supportPagination !== false,
      'should query collection with skip & ' + 'limit',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({skip: 1, limit: 4, order: 'seq'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            assert.deepStrictEqual(users[0].seq, 1);
            assert.strictEqual(users.length, 4);
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.supportPagination !== false,
      'should query collection with offset & ' + 'limit',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({offset: 2, limit: 3, order: 'seq'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            assert.deepStrictEqual(users[0].seq, 2);
            assert.strictEqual(users.length, 3);
            done();
          });
        });
      }
      ,
    );

    it('should query filtered collection', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {role: 'lead'}}, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 2);
          done();
        });
      });
    });

    bdd.itIf(
      connectorCapabilities.adhocSort !== false,
      'should query collection sorted by numeric ' + 'field',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({order: 'order'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            users.forEach(function(u, i) {
              assert.deepStrictEqual(u.order, i + 1);
            });
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort !== false,
      'should query collection desc sorted by ' + 'numeric field',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({order: 'order DESC'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            users.forEach(function(u, i) {
              assert.deepStrictEqual(u.order, users.length - i);
            });
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort !== false,
      'should query collection sorted by string ' + 'field',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({order: 'name'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            assert.strictEqual(users.shift().name, 'George Harrison');
            assert.strictEqual(users.shift().name, 'John Lennon');
            assert.strictEqual(users.pop().name, 'Stuart Sutcliffe');
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort !== false,
      'should query collection desc sorted by ' + 'string field',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({order: 'name DESC'}, function(err, users) {
            assert.ok(users != null);
            assert.ok(err == null);
            assert.strictEqual(users.pop().name, 'George Harrison');
            assert.strictEqual(users.pop().name, 'John Lennon');
            assert.strictEqual(users.shift().name, 'Stuart Sutcliffe');
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort !== false,
      'should query sorted desc by order integer field' +
          ' even though there is an async model loaded hook',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({order: 'order DESC'}, function(err, users) {
            if (err) return done(err);
            assert.ok(users != null);
            const order = users.map(function(u) {
              return u.order;
            });
            assert.deepStrictEqual(order, [6, 5, 4, 3, 2, 1]);
            done();
          });
        });
      }
      ,
    );

    it('should support "and" operator that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(
          {where: {and: [{name: 'John Lennon'}, {role: 'lead'}]}},
          function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
            done();
          },
        );
      });
    });

    it('should support "and" operator that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(
          {where: {and: [{name: 'John Lennon'}, {role: 'member'}]}},
          function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
            done();
          },
        );
      });
    });

    bdd.itIf(
      connectorCapabilities.supportOrOperator !== false,
      'should support "or" that is ' + 'satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {or: [{name: 'John Lennon'}, {role: 'lead'}]}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
              done();
            },
          );
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.supportOrOperator !== false,
      'should support "or" operator that is ' + 'not satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {or: [{name: 'XYZ'}, {role: 'Hello1'}]}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
              done();
            },
          );
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.nullDataValueExists !== false,
      'should support where date "neq" null',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {birthday: {neq: null}}}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
            assert.ok(['John Lennon', 'Paul McCartney'].includes(users[0].name));
            assert.ok(['John Lennon', 'Paul McCartney'].includes(users[1].name));
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.nullDataValueExists !== false,
      'should support where date is null',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {birthday: null}}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
            done();
          });
        });
      }
      ,
    );

    it('should support date "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(
          {where: {birthday: {gte: new Date('1980-12-08')}}},
          function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          },
        );
      });
    });

    it('should support date "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(
          {where: {birthday: {gt: new Date('1980-12-08')}}},
          function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
            done();
          },
        );
      });
    });

    it('should support date "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find(
          {where: {birthday: {gt: new Date('1980-12-07')}}},
          function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          },
        );
      });
    });

    bdd.itIf(
      connectorCapabilities.cloudantCompatible !== false,
      'should support date "lt" that is satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {birthday: {lt: new Date('1980-12-07')}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
              assert.strictEqual(users[0].name, 'Paul McCartney');
              done();
            },
          );
        });
      }
      ,
    );

    it('should support number "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {gte: 3}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
          const expectedNames = [
            'George Harrison',
            'Ringo Starr',
            'Pete Best',
            'Stuart Sutcliffe',
          ];
          assert.ok(expectedNames.every(name => users.map((u) => u.name).includes(name)));
          done();
        });
      });
    });

    it('should support number "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {gt: 6}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should support number "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {gt: 5}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'Ringo Starr');
          done();
        });
      });
    });

    it('should support number "lt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {order: {lt: 2}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'Paul McCartney');
          done();
        });
      });
    });

    bdd.itIf(
      connectorCapabilities.ignoreUndefinedConditionValue !== false,
      'should support number "gt" ' + 'that is satisfied by null value',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {order: 'seq', where: {order: {gt: null}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
              done();
            },
          );
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.ignoreUndefinedConditionValue !== false,
      'should support number "lt" ' + 'that is not satisfied by null value',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {order: {lt: null}}}, function(err, users) {
            assert.ok(err == null);
            assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.ignoreUndefinedConditionValue !== false,
      'should support string "gte" ' + 'that is satisfied by null value',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {order: 'seq', where: {name: {gte: null}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
              done();
            },
          );
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.cloudantCompatible !== false,
      'should support string "gte" that is satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {name: {gte: 'Paul McCartney'}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 4);
              for (let ix = 0; ix < users.length; ix++) {
                assert.ok(users[ix].name >= 'Paul McCartney');
              }
              done();
            },
          );
        });
      }
      ,
    );

    it('should support string "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {name: {gt: 'xyz'}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    bdd.itIf(
      connectorCapabilities.cloudantCompatible !== false,
      'should support string "gt" that is satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {name: {gt: 'Paul McCartney'}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
              for (let ix = 0; ix < users.length; ix++) {
                assert.ok(users[ix].name > 'Paul McCartney');
              }
              done();
            },
          );
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.cloudantCompatible !== false,
      'should support string "lt" that is satisfied',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find(
            {where: {name: {lt: 'Paul McCartney'}}},
            function(err, users) {
              assert.ok(err == null);
              assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
              for (let ix = 0; ix < users.length; ix++) {
                assert.ok(users[ix].name < 'Paul McCartney');
              }
              done();
            },
          );
        });
      }
      ,
    );

    it('should support boolean "gte" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {gte: true}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok([
              'John Lennon',
              'Stuart Sutcliffe',
              'Paul McCartney',
            ].includes(users[ix].name));
            assert.strictEqual(users[ix].vip, true);
          }
          done();
        });
      });
    });

    it('should support boolean "gt" that is not satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {gt: true}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should support boolean "gt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {gt: false}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok([
              'John Lennon',
              'Stuart Sutcliffe',
              'Paul McCartney',
            ].includes(users[ix].name));
            assert.strictEqual(users[ix].vip, true);
          }
          done();
        });
      });
    });

    it('should support boolean "lt" that is satisfied', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.find({where: {vip: {lt: true}}}, function(err, users) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
          for (let ix = 0; ix < users.length; ix++) {
            assert.ok((['Ringo Starr', 'George Harrison']).includes(users[ix].name));
            assert.strictEqual(users[ix].vip, false,
              users[ix].name + ' should not be VIP');
          }
          done();
        });
      });
    });

    bdd.itIf(
      connectorCapabilities.supportInq,
      'supports non-empty inq',
      function() {
        // note there is no record with seq=100
        return User.find({where: {seq: {inq: [0, 1, 100]}}}).then(
          (result) => {
            const seqsFound = result.map((r) => r.seq);
            assert.deepStrictEqual(seqsFound, [0, 1]);
          },
        );
      },
    );

    bdd.itIf(
      connectorCapabilities.supportInq,
      'supports empty inq',
      function() {
        return User.find({where: {seq: {inq: []}}}).then((result) => {
          const seqsFound = result.map((r) => r.seq);
          assert.deepStrictEqual(seqsFound, []);
        });
      },
    );

    const itWhenIlikeSupported = connectorCapabilities.ilike;
    bdd.describeIf(itWhenIlikeSupported, 'ilike', function() {
      it('should support "like" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {like: 'John'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          });
        });
      });

      it('should sanitize invalid usage of like', async () => {
        const users = await User.find({where: {tag: {like: '['}}});
        assert.strictEqual(users.length, 1);
        assert.ok(Object.prototype.hasOwnProperty.call(users[0], 'name')); assert.strictEqual(users[0].name, 'John Lennon');
      });

      it('should support "like" that is not satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {like: 'Bob'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 0);
            done();
          });
        });
      });
      it('should support "ilike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {ilike: 'john'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          });
        });
      });
      it('should support "ilike" that is not satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {ilike: 'bob'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 0);
            done();
          });
        });
      });

      it('should properly sanitize invalid ilike filter', async () => {
        const users = await User.find({where: {name: {ilike: '['}}});
        assert.strictEqual(users.length, 0);
      });
    });

    const itWhenNilikeSupported = connectorCapabilities.nilike !== false;
    bdd.describeIf(itWhenNilikeSupported, 'nilike', function() {
      it('should support "nlike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {nlike: 'John'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 5);
            assert.strictEqual(users[0].name, 'Paul McCartney');
            done();
          });
        });
      });

      it('should support "nilike" that is satisfied', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({where: {name: {nilike: 'john'}}}, function(err, users) {
            if (err) return done(err);
            assert.strictEqual(users.length, 5);
            assert.strictEqual(users[0].name, 'Paul McCartney');
            done();
          });
        });
      });

      describe('geo queries', function() {
        describe('near filter', function() {
          it('supports a basic "near" query', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {
                  where: {
                    addressLoc: {
                      near: {lat: 29.9, lng: -90.07},
                    },
                  },
                },
                function(err, users) {
                  if (err) done(err);
                  assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 3);
                  assert.strictEqual(users[0].name, 'John Lennon');
                  assert.ok(users[0] instanceof User);
                  assert.notStrictEqual(users[0].addressLoc, null);
                  done();
                },
              );
            });
          });

          it('supports "near" inside a coumpound query with "and"', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {
                  where: {
                    and: [
                      {
                        addressLoc: {
                          near: {lat: 29.9, lng: -90.07},
                        },
                      },
                      {
                        vip: true,
                      },
                    ],
                  },
                },
                function(err, users) {
                  if (err) done(err);
                  assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
                  assert.strictEqual(users[0].name, 'John Lennon');
                  assert.ok(users[0] instanceof User);
                  assert.notStrictEqual(users[0].addressLoc, null);
                  assert.strictEqual(users[0].vip, true);
                  done();
                },
              );
            });
          });

          it('supports "near" inside a complex coumpound query with multiple "and"', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {
                  where: {
                    and: [
                      {
                        and: [
                          {
                            addressLoc: {
                              near: {lat: 29.9, lng: -90.07},
                            },
                          },
                          {
                            order: 2,
                          },
                        ],
                      },
                      {
                        vip: true,
                      },
                    ],
                  },
                },
                function(err, users) {
                  if (err) done(err);
                  assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
                  assert.strictEqual(users[0].name, 'John Lennon');
                  assert.ok(users[0] instanceof User);
                  assert.notStrictEqual(users[0].addressLoc, null);
                  assert.strictEqual(users[0].vip, true);
                  assert.strictEqual(users[0].order, 2);
                  done();
                },
              );
            });
          });

          it('supports multiple "near" queries with "or"', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {
                  where: {
                    or: [
                      {
                        addressLoc: {
                          near: {lat: 29.9, lng: -90.04},
                          maxDistance: 300,
                        },
                      },
                      {
                        addressLoc: {
                          near: {lat: 22.97, lng: -88.03},
                          maxDistance: 50,
                        },
                      },
                    ],
                  },
                },
                function(err, users) {
                  if (err) done(err);
                  assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 2);
                  assert.notStrictEqual(users[0].addressLoc, null);
                  assert.strictEqual(users[0].name, 'Paul McCartney');
                  assert.ok(users[0] instanceof User);
                  assert.notStrictEqual(users[1].addressLoc, null);
                  assert.strictEqual(users[1].name, 'John Lennon');
                  done();
                },
              );
            });
          });

          it(
            'supports multiple "near" queries with "or" ' +
              'inside a coumpound query with "and"',
            async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.find(
                  {
                    where: {
                      and: [
                        {
                          or: [
                            {
                              addressLoc: {
                                near: {lat: 29.9, lng: -90.04},
                                maxDistance: 300,
                              },
                            },
                            {
                              addressLoc: {
                                near: {lat: 22.7, lng: -89.03},
                                maxDistance: 50,
                              },
                            },
                          ],
                        },
                        {
                          vip: true,
                        },
                      ],
                    },
                  },
                  function(err, users) {
                    if (err) done(err);
                    assert.ok(Object.prototype.hasOwnProperty.call(users, 'length')); assert.strictEqual(users.length, 1);
                    assert.notStrictEqual(users[0].addressLoc, null);
                    assert.strictEqual(users[0].name, 'John Lennon');
                    assert.ok(users[0] instanceof User);
                    assert.strictEqual(users[0].vip, true);
                    done();
                  },
                );
              });
            }
            ,
          );
        });
      });

      it('should only include fields as specified', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          let remaining = 0;

          function sample(fields) {
            return {
              expect: function(arr) {
                remaining++;
                User.find({fields: fields}, function(err, users) {
                  remaining--;
                  if (err) return done(err);

                  assert.ok(users != null);

                  if (remaining === 0) {
                    done();
                  }

                  users.forEach(function(user) {
                    const obj = user.toObject();

                    Object.keys(obj).forEach(function(key) {
                      // if the obj has an unexpected value
                      if (obj[key] !== undefined && arr.indexOf(key) === -1) {
                        console.log('Given fields:', fields);
                        console.log('Got:', key, obj[key]);
                        console.log('Expected:', arr);
                        throw new Error(
                          'should not include data for key: ' + key,
                        );
                      }
                    });
                  });
                });
              },
            };
          }

          sample({name: true}).expect(['name']);
          sample({name: false}).expect([
            'id',
            'seq',
            'email',
            'role',
            'order',
            'birthday',
            'vip',
            'address',
            'friends',
            'addressLoc',
            'tag',
          ]);
          sample({name: false, id: true}).expect(['id']);
          sample({id: true}).expect(['id']);
          sample('id').expect(['id']);
          sample(['id']).expect(['id']);
          sample(['email']).expect(['email']);
        });
      });

      it('should ignore non existing properties when excluding', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          return User.find({fields: {notExist: false}}, (err, users) => {
            if (err) return done(err);
            users.forEach((user) => {
              switch (
                user.seq // all fields depending on each document
              ) {
                case 0:
                case 1:
                  assert.ok([
                    'id',
                    'seq',
                    'name',
                    'order',
                    'role',
                    'birthday',
                    'vip',
                    'address',
                    'friends',
                  ].every(key => Object.keys(user.__data).includes(key)));
                  break;
                case 4: // seq 4
                  assert.ok([
                    'id',
                    'seq',
                    'name',
                    'order',
                  ].every(key => Object.keys(user.__data).includes(key)));
                  break;
                default: // Other records, seq 2, 3, 5
                  assert.ok([
                    'id',
                    'seq',
                    'name',
                    'order',
                    'vip',
                  ].every(key => Object.keys(user.__data).includes(key)));
              }
            });
            done();
          });
        });
      });

      const describeWhenNestedSupported = connectorCapabilities.nestedProperty;
      bdd.describeIf(
        describeWhenNestedSupported,
        'query with nested property',
        function() {
          it('should support nested property in query', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {where: {'address.city': 'San Jose'}},
                function(err, users) {
                  if (err) return done(err);
                  assert.strictEqual(users.length, 1);
                  for (let i = 0; i < users.length; i++) {
                    assert.deepStrictEqual(users[i].address.city, 'San Jose');
                  }
                  done();
                },
              );
            });
          });

          it('should support nested property with regex over arrays in query', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {where: {'friends.name': {regexp: /^Ringo/}}},
                function(err, users) {
                  if (err) return done(err);
                  assert.strictEqual(users.length, 2);
                  const expectedUsers = ['John Lennon', 'Paul McCartney'];
                  assert.notStrictEqual(expectedUsers.indexOf(users[0].name), -1);
                  assert.notStrictEqual(expectedUsers.indexOf(users[1].name), -1);
                  done();
                },
              );
            });
          });

          it('should support nested property with gt in query', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {where: {'address.city': {gt: 'San'}}},
                function(err, users) {
                  if (err) return done(err);
                  assert.strictEqual(users.length, 2);
                  for (let i = 0; i < users.length; i++) {
                    assert.deepStrictEqual(users[i].address.state, 'CA');
                  }
                  done();
                },
              );
            });
          });

          bdd.itIf(
            connectorCapabilities.adhocSort,
            'should support nested property for order in query',
            async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.find(
                  {where: {'address.state': 'CA'}, order: 'address.city DESC'},
                  function(err, users) {
                    if (err) return done(err);
                    assert.strictEqual(users.length, 2);
                    assert.deepStrictEqual(users[0].address.city, 'San Mateo');
                    assert.deepStrictEqual(users[1].address.city, 'San Jose');
                    done();
                  },
                );
              });
            }
            ,
          );

          it('should support multi-level nested array property in query', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find(
                {where: {'address.tags.tag': 'business'}},
                function(err, users) {
                  if (err) return done(err);
                  assert.strictEqual(users.length, 1);
                  assert.strictEqual(users[0].address.tags[0].tag, 'business');
                  assert.strictEqual(users[0].address.tags[1].tag, 'rent');
                  done();
                },
              );
            });
          });

          it('should fail when querying with an invalid value for a type', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.find({where: {birthday: 'notadate'}}, function(err, users) {
                assert.ok(err != null);
                assert.strictEqual(err.message, 'Invalid date: notadate');
                done();
              });
            });
          });
        },
      );

      it('preserves empty values from the database', async () => {
      // https://github.com/strongloop/loopback-datasource-juggler/issues/1692

        // Initially, all Players were always active, no property was needed
        const Player = db.define('Player', {name: String});

        await db.automigrate('Player');
        const created = await Player.create({name: 'Pen'});

        // Later on, we decide to introduce `active` property
        Player.defineProperty('active', {
          type: Boolean,
          default: false,
        });
        await db.autoupdate('Player');

        // And query existing data
        const found = await Player.findOne();
        assert.ok([
          undefined, // databases supporting `undefined` value
          null, // databases representing `undefined` as `null` (e.g. SQL)
        ].includes(found.toObject().active));
      });

      describe('check __parent relationship in embedded models', () => {
        beforeEach(() => {
          User.modelBuilder.settings.parentRef = true;
        });

        afterEach(() => {
          User.modelBuilder.settings.parentRef = false;
        });

        it('should fill the parent in embedded model', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          assert.ok(user.address);
          assert.ok(Object.prototype.hasOwnProperty.call(user.address, '__parent'));
          assert.ok(user.address.__parent instanceof User);
          assert.strictEqual(user.address.__parent, user);
        });
        it('should assign the container model as parent in list property', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          assert.ok(user.friends);
          assert.ok(Object.prototype.hasOwnProperty.call(user.friends, 'parent'));
          assert.ok(user.friends.parent instanceof User);
          assert.strictEqual(user.friends.parent, user);
        });
        it('should have the complete chain of parents available in embedded list element', async () => {
          const user = await User.findOne({where: {name: 'John Lennon'}});
          user.friends.forEach((userFriend) => {
            assert.ok(Object.prototype.hasOwnProperty.call(userFriend, '__parent'));
            assert.strictEqual(userFriend.__parent, user);
          });
        });
      });
    });
  });

  describe('count', function() {
    before(seed);

    it('should query total count', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.count(function(err, n) {
          assert.ok(err == null);
          assert.ok(n != null);
          assert.strictEqual(n, 6);
          done();
        });
      });
    });

    it('should query filtered count', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.count({role: 'lead'}, function(err, n) {
          assert.ok(err == null);
          assert.ok(n != null);
          assert.strictEqual(n, 2);
          done();
        });
      });
    });
  });

  describe('count after createAll', function() {
    before(async function seedData() {
      await seed(true);
    });

    it('should query total count', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.count(function(err, n) {
          assert.ok(err == null);
          assert.ok(n != null);
          assert.strictEqual(n, 6);
          done();
        });
      });
    });

    it('should query filtered count', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.count({role: 'lead'}, function(err, n) {
          assert.ok(err == null);
          assert.ok(n != null);
          assert.strictEqual(n, 2);
          done();
        });
      });
    });
  });

  describe('findOne', function() {
    before(seed);

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should find first record (default sort by id)', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.all({order: 'id'}, function(err, users) {
            User.findOne(function(e, u) {
              assert.ok(e == null);
              assert.ok(u != null);
              assert.strictEqual(u.id.toString(), users[0].id.toString());
              done();
            });
          });
        });
      });

    bdd.itIf(connectorCapabilities.adhocSort, 'should find first record', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne({order: 'order'}, function(e, u) {
          assert.ok(e == null);
          assert.ok(u != null);
          assert.strictEqual(u.order, 1);
          assert.strictEqual(u.name, 'Paul McCartney');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort, 'should find last record', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne({order: 'order DESC'}, function(e, u) {
          assert.ok(e == null);
          assert.ok(u != null);
          assert.strictEqual(u.order, 6);
          assert.strictEqual(u.name, 'Ringo Starr');
          done();
        });
      });
    });

    bdd.itIf(connectorCapabilities.adhocSort, 'should find last record in filtered set', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne({
          where: {role: 'lead'},
          order: 'order DESC',
        }, function(e, u) {
          assert.ok(e == null);
          assert.ok(u != null);
          assert.strictEqual(u.order, 2);
          assert.strictEqual(u.name, 'John Lennon');
          done();
        });
      });
    });

    it('should work even when find by id', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne(function(e, u) {
          User.findOne({where: {id: u.id}}, function(err, user) {
            assert.ok(err == null);
            assert.ok(user != null);
            done();
          });
        });
      });
    });
  });

  describe('findOne after createAll', function() {
    before(async function seedData() {
      await seed(true);
    });

    bdd.itIf(
      connectorCapabilities.cloudantCompatible !== false,
      'should find first record (default sort by id)',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.all({order: 'id'}, function(err, users) {
            User.findOne(function(e, u) {
              assert.ok(e == null);
              assert.ok(u != null);
              assert.strictEqual(u.id.toString(), users[0].id.toString());
              done();
            });
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort,
      'should find first record',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.findOne({order: 'order'}, function(e, u) {
            assert.ok(e == null);
            assert.ok(u != null);
            assert.strictEqual(u.order, 1);
            assert.strictEqual(u.name, 'Paul McCartney');
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort,
      'should find last record',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.findOne({order: 'order DESC'}, function(e, u) {
            assert.ok(e == null);
            assert.ok(u != null);
            assert.strictEqual(u.order, 6);
            assert.strictEqual(u.name, 'Ringo Starr');
            done();
          });
        });
      }
      ,
    );

    bdd.itIf(
      connectorCapabilities.adhocSort,
      'should find last record in filtered set',
      async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.findOne(
            {
              where: {role: 'lead'},
              order: 'order DESC',
            },
            function(e, u) {
              assert.ok(e == null);
              assert.ok(u != null);
              assert.strictEqual(u.order, 2);
              assert.strictEqual(u.name, 'John Lennon');
              done();
            },
          );
        });
      }
      ,
    );

    it('should work even when find by id', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne(function(e, u) {
          User.findOne({where: {id: u.id}}, function(err, user) {
            assert.ok(err == null);
            assert.ok(user != null);
            done();
          });
        });
      });
    });
  });

  describe('exists', function() {
    before(seed);

    it('should check whether record exist', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne(function(e, u) {
          User.exists(u.id, function(err, exists) {
            assert.ok(err == null);
            assert.ok(exists != null);
            assert.ok(exists);
            done();
          });
        });
      });
    });

    it('should check whether record not exist', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        const unknownId = uid.fromConnector(db) || 42;
        User.destroyAll(function() {
          User.exists(unknownId, function(err, exists) {
            assert.ok(err == null);
            assert.ok(!exists);
            done();
          });
        });
      });
    });
  });

  describe('exists after createAll', function() {
    before(async function seedData() {
      await seed(true);
    });

    it('should check whether record exist', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.findOne(function(e, u) {
          User.exists(u.id, function(err, exists) {
            assert.ok(err == null);
            assert.ok(exists != null);
            assert.ok(exists);
            done();
          });
        });
      });
    });

    it('should check whether record not exist', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        const unknownId = uid.fromConnector(db) || 42;
        User.destroyAll(function() {
          User.exists(unknownId, function(err, exists) {
            assert.ok(err == null);
            assert.ok(!exists);
            done();
          });
        });
      });
    });

    describe('updateAll', function() {
      let numAndDateModel, numAndDateArrayModel;

      before(function() {
        numAndDateModel = db.define('numAndDateModel', {
          dateProp: Date,
          numProp: Number,
        });
        // 'numAndDateArrayModel' is too long an identifier name for Oracle DB
        numAndDateArrayModel = db.define('numAndDateArrMod', {
          dateArray: [Date],
          numArray: [Number],
        });
        return db.automigrate(['numAndDateModel', 'numAndDateArrMod']);
      });

      it('coerces primitive datatypes on update', async () => {
        const createDate = new Date('2019-02-21T12:00:00').toISOString();
        const createData = {
          dateProp: createDate,
          numProp: '1',
        };
        const updateDate = new Date('2019-04-15T12:00:00').toISOString();
        const updateData = {
          dateProp: updateDate,
          numProp: '3',
        };
        const created = await numAndDateModel.create(createData);
        const updated = await numAndDateModel.updateAll({id: created.id}, updateData);
        const found = await numAndDateModel.findById(created.id);
        assert.deepStrictEqual(found.dateProp, new Date(updateDate));
        assert.strictEqual(found.numProp, 3);
      });

      // PostgreSQL connector does not support arrays at the moment
      bdd.itIf(connectorCapabilities.supportsArrays !== false,
        'coerces primitive array datatypes on update', async () => {
          const createDate = new Date('2019-02-21T12:00:00').toISOString();
          const createData = {
            dateArray: [createDate, createDate],
            numArray: ['1', '2'],
          };
          const updateDate = new Date('2019-04-15T12:00:00').toISOString();
          const updateData = {
            dateArray: [updateDate, updateDate],
            numArray: ['3', '4'],
          };
          const created = await numAndDateArrayModel.create(createData);
          const updated = await numAndDateArrayModel.updateAll({id: created.id}, updateData);
          const found = await numAndDateArrayModel.findById(created.id);
          assert.deepStrictEqual(found.dateArray[0], new Date(updateDate));
          assert.deepStrictEqual(found.dateArray[1], new Date(updateDate));
          assert.strictEqual(found.numArray[0], 3);
          assert.strictEqual(found.numArray[1], 4);
        });
    });

    describe('regexp operator', function() {
      const invalidDataTypes = [0, true, {}, [], Function, null];

      before(seed);

      it('should return an error for invalid data types', async function() {
      // `undefined` is not tested because the `removeUndefined` function
      // in `lib/dao.js` removes it before coercion
        for (const v of invalidDataTypes) {
          await new Promise((resolve, reject) => {
            User.find({where: {name: {regexp: v}}}, function(err) {
              try {
                assert.ok(err != null);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });
        }
      });
    });
  });

  async function seed(useCreateAll = false) {
    const beatles = [
      {
        seq: 0,
        name: 'John Lennon',
        email: 'john@b3atl3s.co.uk',
        role: 'lead',
        birthday: new Date('1980-12-08'),
        order: 2,
        vip: true,
        tag: '[singer]',
        address: {
          street: '123 A St',
          city: 'San Jose',
          state: 'CA',
          zipCode: '95131',
          tags: [
            {tag: 'business'},
            {tag: 'rent'},
          ],
        },
        friends: [
          {name: 'Paul McCartney'},
          {name: 'George Harrison'},
          {name: 'Ringo Starr'},
        ],
        addressLoc: {lat: 29.97, lng: -90.03},
      },
      {
        seq: 1,
        name: 'Paul McCartney',
        email: 'paul@b3atl3s.co.uk',
        role: 'lead',
        birthday: new Date('1942-06-18'),
        order: 1,
        vip: true,
        address: {
          street: '456 B St',
          city: 'San Mateo',
          state: 'CA',
          zipCode: '94065',
        },
        friends: [
          {name: 'John Lennon'},
          {name: 'George Harrison'},
          {name: 'Ringo Starr'},
        ],
        addressLoc: {lat: 22.97, lng: -88.03},
      },
      {
        seq: 2,
        name: 'George Harrison',
        birthday: null,
        order: 5,
        vip: false,
        addressLoc: {lat: 22.7, lng: -89.03},
      },
      {seq: 3, name: 'Ringo Starr', order: 6, birthday: null, vip: false},
      {seq: 4, name: 'Pete Best', order: 4, birthday: null},
      {seq: 5, name: 'Stuart Sutcliffe', order: 3, birthday: null, vip: true},
    ];

    if (useCreateAll) {
      await seedUsingCreateAll(beatles);
    } else {
      await seedUsingCreate(beatles);
    }
  }

  async function seedUsingCreate(beatles) {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      User.destroyAll(function(err) {
        if (err) return done(err);
        Promise.all(beatles.map(beatle => User.create(beatle))).then(() => done(), done);
      });
    });
  }

  async function seedUsingCreateAll(beatles) {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      User.destroyAll(function(err) {
        if (err) return done(err);
        User.createAll(beatles, done);
      });
    });
  }

  function nextAfterDelay(ctx, next) {
    const randomTimeoutTrigger = Math.floor(Math.random() * 100);
    setTimeout(function() { process.nextTick(next); }, randomTimeoutTrigger);
  }

  function invoke(fn, ...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, ...results) => {
        if (err) return reject(err);
        resolve(results.length <= 1 ? results[0] : results);
      });
    });
  }
});
