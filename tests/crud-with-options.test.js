// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

const {after, afterEach, before, beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false */
require('./init.js');
let db, User, options, filter;

describe('crud-with-options', function() {
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
      User = db.define('User', {
        id: {type: Number, id: true},
        seq: {type: Number, index: true},
        name: {type: String, index: true, sort: true},
        email: {type: String, index: true},
        birthday: {type: Date, index: true},
        role: {type: String, index: true},
        order: {type: Number, index: true, sort: true},
        vip: {type: Boolean},
        address: {type: {city: String, area: String}},
      });
      options = {};
      filter = {fields: ['name', 'id']};

      db.automigrate(['User'], done);
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
        User.destroyAll(done);
      });
    });

    it('should allow findById(id, options, cb)', async function() {
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
        User.findById(1, options, function(err, u) {
          assert.ok(u == null);
          assert.ok(err == null);
          done();
        });
      });
    });

    it('should allow findById(id, filter, cb)', async function() {
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
        User.findById(1, filter, function(err, u) {
          assert.ok(u == null);
          assert.ok(err == null);
          done();
        });
      });
    });

    it('should allow findById(id)', function() {
      User.findById(1);
    });

    it('should allow findById(id, filter)', function() {
      User.findById(1, filter);
    });

    it('should allow findById(id, options)', function() {
      User.findById(1, options);
    });

    it('should allow findById(id, filter, options)', function() {
      User.findById(1, filter, options);
    });

    it('should throw when invalid filter are provided for findById',
      async function() {
        assert.throws(() => {
          User.findById(1, '123', function(err, u) {});
        }, /The filter argument must be an object/);
      });

    it('should throw when invalid options are provided for findById',
      async function() {
        assert.throws(() => {
          User.findById(1, filter, '123', function(err, u) {});
        }, /The options argument must be an object/);
      });

    it('should report an invalid id via callback for findById',
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
          User.findById(undefined, {}, function(err, u) {
            assert.deepStrictEqual(err,
              new Error('Model::findById requires the id argument'));
            done();
          });
        });
      });

    it('should allow findById(id, filter, cb) for a matching id',
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
          User.create({name: 'x', email: 'x@y.com'}, function(err, u) {
            assert.ok(err == null);
            assert.ok(u.id != null);
            User.findById(u.id, filter, function(err, u) {
              assert.ok(u != null);
              assert.ok(err == null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'x');
              assert.strictEqual(u.email, undefined);
              done();
            });
          });
        });
      });

    it('should allow findById(id, options, cb) for a matching id',
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
          User.create({name: 'y', email: 'y@y.com'}, function(err, u) {
            assert.ok(err == null);
            assert.ok(u.id != null);
            User.findById(u.id, options, function(err, u) {
              assert.ok(u != null);
              assert.ok(err == null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'y');
              assert.strictEqual(u.email, 'y@y.com');
              done();
            });
          });
        });
      });

    it('should allow findById(id, filter, options, cb) for a matching id',
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
          User.create({name: 'z', email: 'z@y.com'}, function(err, u) {
            assert.ok(err == null);
            assert.ok(u.id != null);
            User.findById(u.id, filter, options, function(err, u) {
              assert.ok(u != null);
              assert.ok(err == null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'z');
              assert.strictEqual(u.email, undefined);
              done();
            });
          });
        });
      });

    it('should allow promise-style findById',
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
          User.create({id: 15, name: 'w', email: 'w@y.com'}).then(function(u) {
            assert.ok(u.id != null);
            return User.findById(u.id).then(function(u) {
              assert.ok(u != null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'w');
              assert.strictEqual(u.email, 'w@y.com');
              return u;
            });
          }).then(function(u) {
            assert.ok(u != null);
            assert.ok(u.id != null);
            return User.findById(u.id, filter).then(function(u) {
              assert.ok(u != null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'w');
              assert.strictEqual(u.email, undefined);
              return u;
            });
          }).then(function(u) {
            assert.ok(u != null);
            assert.ok(u.id != null);
            return User.findById(u.id, options).then(function(u) {
              assert.ok(u != null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'w');
              assert.strictEqual(u.email, 'w@y.com');
              return u;
            });
          }).then(function(u) {
            assert.ok(u != null);
            assert.ok(u.id != null);
            return User.findById(u.id, filter, options).then(function(u) {
              assert.ok(u != null);
              assert.ok(u instanceof User);
              assert.strictEqual(u.name, 'w');
              assert.strictEqual(u.email, undefined);
              done();
            });
          }).catch(function(err) {
            done(err);
          });
        });
      });
  });

  describe('findByIds', function() {
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
        const people = [
          {id: 1, name: 'a', vip: true},
          {id: 2, name: 'b'},
          {id: 3, name: 'c'},
          {id: 4, name: 'd', vip: true},
          {id: 5, name: 'e'},
          {id: 6, name: 'f'},
        ];
        // Use automigrate so that serial keys are 1-6
        db.automigrate(['User'], function(err) {
          User.create(people, options, function(err, users) {
            done();
          });
        });
      });
    });

    it('should allow findByIds(ids, cb)', async function() {
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
        User.findByIds([3, 2, 1], function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          const names = users.map(function(u) { return u.name; });
          assert.deepStrictEqual(names, ['c', 'b', 'a']);
          done();
        });
      });
    });

    it('should allow findByIds(ids, filter, options, cb)',
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
          User.findByIds([4, 3, 2, 1],
            {where: {vip: true}}, options, function(err, users) {
              assert.ok(users != null);
              assert.ok(err == null);
              const names = users.map(function(u) {
                return u.name;
              });
              assert.deepStrictEqual(names, ['d', 'a']);
              done();
            });
        });
      });
  });

  describe('find', function() {
    before(seed);

    it('should allow find(cb)', async function() {
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

    it('should allow find(filter, cb)', async function() {
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

    it('should allow find(filter, options, cb)', async function() {
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
        User.find({}, options, function(err, users) {
          assert.ok(users != null);
          assert.ok(err == null);
          assert.strictEqual(users.length, 6);
          done();
        });
      });
    });

    it('should allow find(filter, options)', function() {
      User.find({limit: 3}, options);
    });

    it('should allow find(filter)', function() {
      User.find({limit: 3});
    });

    it('should skip trailing undefined args', async function() {
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
        }, undefined, undefined);
      });
    });

    it('should throw on an invalid query arg', function() {
      assert.throws(() => {
        User.find('invalid query', function(err, users) {
          // noop
        });
      }, /The query argument must be an object/);
    });

    it('should throw on an invalid options arg', function() {
      assert.throws(() => {
        User.find({limit: 3}, 'invalid option', function(err, users) {
          // noop
        });
      }, /The options argument must be an object/);
    });

    it('should throw on an invalid cb arg', function() {
      assert.throws(() => {
        User.find({limit: 3}, {}, 'invalid cb');
      }, /The cb argument must be a function/);
    });
  });

  describe('count', function() {
    before(seed);

    it('should allow count(cb)', async function() {
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

    it('should allow count(where, cb)', async function() {
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

    it('should allow count(where, options, cb)', async function() {
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
        User.count({role: 'lead'}, options, function(err, n) {
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

    it('should allow findOne(cb)', async function() {
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
        User.find({order: 'id'}, function(err, users) {
          User.findOne(function(e, u) {
            assert.ok(e == null);
            assert.ok(u != null);
            assert.strictEqual(u.id.toString(), users[0].id.toString());
            done();
          });
        });
      });
    });

    it('should allow findOne(filter, options, cb)', async function() {
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
        User.findOne({order: 'order'}, options, function(e, u) {
          assert.ok(e == null);
          assert.ok(u != null);
          assert.strictEqual(u.order, 1);
          assert.strictEqual(u.name, 'Paul McCartney');
          done();
        });
      });
    });

    it('should allow findOne(filter, cb)', async function() {
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

    it('should allow trailing undefined args', async function() {
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
        }, undefined);
      });
    });
  });

  describe('exists', function() {
    before(seed);

    it('should allow exists(id, cb)', async function() {
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

    it('should allow exists(id, options, cb)', async function() {
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
        User.destroyAll(function() {
          User.exists(42, options, function(err, exists) {
            assert.ok(err == null);
            assert.ok(!exists);
            done();
          });
        });
      });
    });
  });

  describe('save', function() {
    it('should allow save(options, cb)', async function() {
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
        const options = {foo: 'bar'};
        let opts;

        User.observe('after save', function(ctx, next) {
          opts = ctx.options;
          next();
        });

        const u = new User();
        u.save(options, function(err) {
          assert.ok(err == null);
          assert.strictEqual(options, opts);
          done();
        });
      });
    });
  });

  describe('destroyAll with options', function() {
    beforeEach(seed);

    it('should allow destroyAll(where, options, cb)', async function() {
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
        User.destroyAll({name: 'John Lennon'}, options, function(err) {
          assert.ok(err == null);
          User.find({where: {name: 'John Lennon'}}, function(err, data) {
            assert.ok(err == null);
            assert.strictEqual(data.length, 0);
            User.find({where: {name: 'Paul McCartney'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 1);
              done();
            });
          });
        });
      });
    });

    it('should allow destroyAll(where, cb)', async function() {
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
        User.destroyAll({name: 'John Lennon'}, function(err) {
          assert.ok(err == null);
          User.find({where: {name: 'John Lennon'}}, function(err, data) {
            assert.ok(err == null);
            assert.strictEqual(data.length, 0);
            User.find({where: {name: 'Paul McCartney'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 1);
              done();
            });
          });
        });
      });
    });

    it('should allow destroyAll(cb)', async function() {
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
          assert.ok(err == null);
          User.find({where: {name: 'John Lennon'}}, function(err, data) {
            assert.ok(err == null);
            assert.strictEqual(data.length, 0);
            User.find({where: {name: 'Paul McCartney'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 0);
              done();
            });
          });
        });
      });
    });
  });

  describe('updateAll ', function() {
    beforeEach(seed);

    it('should allow updateAll(where, data, cb)', async function() {
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
        User.update({name: 'John Lennon'}, {name: 'John Smith'}, function(err) {
          assert.ok(err == null);
          User.find({where: {name: 'John Lennon'}}, function(err, data) {
            assert.ok(err == null);
            assert.strictEqual(data.length, 0);
            User.find({where: {name: 'John Smith'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 1);
              done();
            });
          });
        });
      });
    });

    it('should allow updateAll(where, data, options, cb)', async function() {
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
        User.update({name: 'John Lennon'}, {name: 'John Smith'}, options,
          function(err) {
            assert.ok(err == null);
            User.find({where: {name: 'John Lennon'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 0);
              User.find({where: {name: 'John Smith'}}, function(err, data) {
                assert.ok(err == null);
                assert.strictEqual(data.length, 1);
                done();
              });
            });
          });
      });
    });

    it('should allow updateAll(data, cb)', async function() {
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
        User.update({name: 'John Smith'}, function() {
          User.find({where: {name: 'John Lennon'}}, function(err, data) {
            assert.ok(err == null);
            assert.strictEqual(data.length, 0);
            User.find({where: {name: 'John Smith'}}, function(err, data) {
              assert.ok(err == null);
              assert.strictEqual(data.length, 6);
              done();
            });
          });
        });
      });
    });
  });

  describe('updateAttributes', function() {
    beforeEach(seed);
    it('preserves document properties not modified by the patch', function() {
      return User.findOne({where: {name: 'John Lennon'}})
        .then(function(user) {
          return user.updateAttributes({address: {city: 'Volos'}});
        })
        .then(function() {
          return User.findOne({where: {name: 'John Lennon'}}); // retrieve the user again from the db
        })
        .then(function(updatedUser) {
          assert.strictEqual(updatedUser.address.city, 'Volos');
          assert.notStrictEqual(updatedUser.address.area, null);
          assert.strictEqual(updatedUser.address.area, undefined);
        });
    });
  });
});

describe('upsertWithWhere', function() {
  beforeEach(seed);
  it('rejects upsertWithWhere (options,cb)', async function() {
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
      try {
        User.upsertWithWhere({}, function(err) {
          if (err) return done(err);
        });
      } catch (ex) {
        assert.strictEqual(ex.message, 'The data argument must be an object');
        done();
      }
    });
  });

  it('rejects upsertWithWhere (cb)', async function() {
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
      try {
        User.upsertWithWhere(function(err) {
          if (err) return done(err);
        });
      } catch (ex) {
        assert.strictEqual(ex.message, 'The where argument must be an object');
        done();
      }
    });
  });

  it('allows upsertWithWhere by accepting where,data and cb as arguments', async function() {
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
      User.upsertWithWhere({name: 'John Lennon'}, {name: 'John Smith'}, function(err) {
        if (err) return done(err);
        User.find({where: {name: 'John Lennon'}}, function(err, data) {
          if (err) return done(err);
          assert.strictEqual(data.length, 0);
          User.find({where: {name: 'John Smith'}}, function(err, data) {
            if (err) return done(err);
            assert.strictEqual(data.length, 1);
            assert.strictEqual(data[0].name, 'John Smith');
            assert.strictEqual(data[0].email, 'john@b3atl3s.co.uk');
            assert.strictEqual(data[0].role, 'lead');
            assert.strictEqual(data[0].order, 2);
            assert.strictEqual(data[0].vip, true);
            done();
          });
        });
      });
    });
  });

  it('allows upsertWithWhere by accepting where, data, options, and cb as arguments', async function() {
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
      options = {};
      User.upsertWithWhere({name: 'John Lennon'}, {name: 'John Smith'}, options, function(err) {
        if (err) return done(err);
        User.find({where: {name: 'John Smith'}}, function(err, data) {
          if (err) return done(err);
          assert.strictEqual(data.length, 1);
          assert.strictEqual(data[0].name, 'John Smith');
          assert.strictEqual(data[0].seq, 0);
          assert.strictEqual(data[0].email, 'john@b3atl3s.co.uk');
          assert.strictEqual(data[0].role, 'lead');
          assert.strictEqual(data[0].order, 2);
          assert.strictEqual(data[0].vip, true);
          done();
        });
      });
    });
  });
});

async function seed() {
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
    const beatles = [
      {
        id: 0,
        seq: 0,
        name: 'John Lennon',
        email: 'john@b3atl3s.co.uk',
        role: 'lead',
        birthday: new Date('1980-12-08'),
        order: 2,
        vip: true,
      },
      {
        id: 1,
        seq: 1,
        name: 'Paul McCartney',
        email: 'paul@b3atl3s.co.uk',
        role: 'lead',
        birthday: new Date('1942-06-18'),
        order: 1,
        vip: true,
      },
      {id: 2, seq: 2, name: 'George Harrison', order: 5, vip: false},
      {id: 3, seq: 3, name: 'Ringo Starr', order: 6, vip: false},
      {id: 4, seq: 4, name: 'Pete Best', order: 4},
      {id: 5, seq: 5, name: 'Stuart Sutcliffe', order: 3, vip: true},
    ];

    User.destroyAll(function(err) {
      if (err) return done(err);
      User.createAll(beatles, done);
    });
  });
}
