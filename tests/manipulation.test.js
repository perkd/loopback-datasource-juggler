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

let db, Person;
const ValidationError = require('..').ValidationError;

const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const throwingSetter = (value) => {
  if (!value) return; // no-op
  throw new Error('Intentional error triggered from a property setter');
};

describe('manipulation', function() {
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

      Person = db.define('Person', {
        name: String,
        gender: String,
        married: Boolean,
        age: {type: Number, index: true},
        dob: Date,
        createdAt: {type: Date, default: Date},
        throwingSetter: {type: String, default: null},
      }, {forceId: true, strict: true});

      Person.setter.throwingSetter = throwingSetter;

      db.automigrate(['Person'], done);
    });
  });

  // A simplified implementation of LoopBack's User model
  // to reproduce problems related to properties with dynamic setters
  // For the purpose of the tests, we use a counter instead of a hash fn.
  let StubUser;
  let stubPasswordCounter;

  before(async function setupStubUserModel() {
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
      StubUser = db.createModel('StubUser', {password: String}, {forceId: true});
      StubUser.setter.password = function(plain) {
        if (plain.length === 0) throw new Error('password cannot be empty');
        let hashed = false;
        if (!plain) return;
        const pos = plain.indexOf('-');
        if (pos !== -1) {
          const head = plain.substr(0, pos);
          const tail = plain.substr(pos + 1, plain.length);
          hashed = head.toUpperCase() === tail;
        }
        if (hashed) return;
        this.$password = plain + '-' + plain.toUpperCase();
      };
      db.automigrate('StubUser', done);
    });
  });

  beforeEach(function resetStubPasswordCounter() {
    stubPasswordCounter = 0;
  });

  describe('create', function() {
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
        Person.destroyAll(done);
      });
    });

    describe('forceId', function() {
      let TestForceId;
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
          TestForceId = db.define('TestForceId');
          db.automigrate('TestForceId', done);
        });
      });

      it('it defaults to forceId:true for generated id property', async function() {
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
          TestForceId.create({id: 1}, function(err, t) {
            assert.ok(err != null);
            assert.match(err.message, /can\'t be set/);
            done();
          });
        });
      });
    });

    it('should create instance', async function() {
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
        Person.create({name: 'Anatoliy'}, function(err, p) {
          if (err) return done(err);
          assert.ok(p != null);
          assert.strictEqual(p.name, 'Anatoliy');
          Person.findById(p.id, function(err, person) {
            if (err) return done(err);
            assert.deepStrictEqual(person.id, p.id);
            assert.strictEqual(person.name, 'Anatoliy');
            done();
          });
        });
      });
    });

    it('should create instance (promise variant)', async function() {
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
        Person.create({name: 'Anatoliy'})
          .then(function(p) {
            assert.strictEqual(p.name, 'Anatoliy');
            assert.ok(p != null);
            return Person.findById(p.id)
              .then(function(person) {
                assert.deepStrictEqual(person.id, p.id);
                assert.strictEqual(person.name, 'Anatoliy');
                done();
              });
          })
          .catch(done);
      });
    });

    it('should return rejected promise when model initialization failed', async () => {
      await assert.rejects(
        Person.create({name: 'Sad Fail', age: 25, throwingSetter: 'something'}),
        /Intentional error triggered from a property setter/,
      );
    });

    it('should instantiate an object', async function() {
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
        const p = new Person({name: 'Anatoliy'});
        assert.strictEqual(p.name, 'Anatoliy');
        assert.strictEqual(p.isNewRecord(), true);
        p.save(function(err, inst) {
          if (err) return done(err);
          assert.strictEqual(inst.isNewRecord(), false);
          assert.strictEqual(inst, p);
          done();
        });
      });
    });

    it('should instantiate an object (promise variant)', async function() {
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
        const p = new Person({name: 'Anatoliy'});
        assert.strictEqual(p.name, 'Anatoliy');
        assert.strictEqual(p.isNewRecord(), true);
        p.save()
          .then(function(inst) {
            assert.strictEqual(inst.isNewRecord(), false);
            assert.strictEqual(inst, p);
            done();
          })
          .catch(done);
      });
    });

    it('should not return instance of object', async function() {
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
        const person = Person.create(function(err, p) {
          if (err) return done(err);
          assert.ok(p.id != null);
          if (person) assert.ok(!(person instanceof Person));
          done();
        });
      });
    });

    it('should not allow user-defined value for the id of object - create', async function() {
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
        Person.create({id: 123456}, function(err, p) {
          assert.ok(err instanceof ValidationError);
          assert.strictEqual(err.statusCode, 422);
          assert.deepStrictEqual(err.details.messages.id, ['can\'t be set']);
          assert.ok(p instanceof Person);
          assert.strictEqual(p.isNewRecord(), true);
          done();
        });
      });
    });

    it('should not allow user-defined value for the id of object - create (promise variant)', async function() {
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
        Person.create({id: 123456})
          .then(function(p) {
            done(new Error('Person.create should have failed.'));
          }, function(err) {
            assert.ok(err instanceof ValidationError);
            assert.strictEqual(err.statusCode, 422);
            assert.deepStrictEqual(err.details.messages.id, ['can\'t be set']);
            done();
          })
          .catch(done);
      });
    });

    it('should not allow user-defined value for the id of object - save', async function() {
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
        const p = new Person({id: 123456});
        assert.strictEqual(p.isNewRecord(), true);
        p.save(function(err, inst) {
          assert.ok(err instanceof ValidationError);
          assert.strictEqual(err.statusCode, 422);
          assert.deepStrictEqual(err.details.messages.id, ['can\'t be set']);
          assert.strictEqual(inst.isNewRecord(), true);
          done();
        });
      });
    });

    it('should not allow user-defined value for the id of object - save (promise variant)', async function() {
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
        const p = new Person({id: 123456});
        assert.strictEqual(p.isNewRecord(), true);
        p.save()
          .then(function(inst) {
            done(new Error('save should have failed.'));
          }, function(err) {
            assert.ok(err instanceof ValidationError);
            assert.strictEqual(err.statusCode, 422);
            assert.deepStrictEqual(err.details.messages.id, ['can\'t be set']);
            done();
          })
          .catch(done);
      });
    });

    it('should work when called without callback', async function() {
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
        Person.afterCreate = function(next) {
          assert.ok(this instanceof Person);
          assert.strictEqual(this.name, 'Nickolay');
          assert.ok(this.id != null);
          Person.afterCreate = null;
          next();
          setTimeout(done, 10);
        };
        Person.create({name: 'Nickolay'});
      });
    });

    it('should create instance with blank data', async function() {
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
        Person.create(function(err, p) {
          if (err) return done(err);
          assert.ok(p != null);
          assert.ok(p.name == null);
          Person.findById(p.id, function(err, person) {
            if (err) return done(err);
            assert.deepStrictEqual(person.id, p.id);
            assert.ok(person.name == null);
            done();
          });
        });
      });
    });

    it('should create instance with blank data (promise variant)', async function() {
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
        Person.create()
          .then(function(p) {
            assert.ok(p != null);
            assert.ok(p.name == null);
            return Person.findById(p.id)
              .then(function(person) {
                assert.deepStrictEqual(person.id, p.id);
                assert.ok(person.name == null);
                done();
              });
          }).catch(done);
      });
    });

    it('should work when called with no data and callback', async function() {
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
        Person.afterCreate = function(next) {
          assert.ok(this instanceof Person);
          assert.ok(this.name == null);
          assert.ok(this.id != null);
          Person.afterCreate = null;
          next();
          setTimeout(done, 30);
        };
        Person.create();
      });
    });

    it('should create batch of objects', async function() {
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
        const batch = [
          {name: 'Shaltay'},
          {name: 'Boltay'},
          {},
        ];
        const res = Person.create(batch, function(e, ps) {
          assert.ok(!(res instanceof Array));
          assert.ok(e == null);
          assert.ok(ps != null);
          assert.ok(ps instanceof Array);
          assert.strictEqual(ps.length, batch.length);

          Person.validatesPresenceOf('name');
          Person.create(batch, function(errors, persons) {
            delete Person.validations;
            assert.ok(errors != null);
            assert.strictEqual(errors.length, batch.length);
            assert.ok(errors[0] == null);
            assert.ok(errors[1] == null);
            assert.ok(errors[2] != null);

            assert.ok(persons != null);
            assert.strictEqual(persons.length, batch.length);
            assert.strictEqual(persons[0].errors, false);
            done();
          });
        });
      });
    });

    it('should create batch of objects (promise variant)', async function() {
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
        const batch = [
          {name: 'ShaltayPromise'},
          {name: 'BoltayPromise'},
          {},
        ];
        Person.create(batch).then(function(ps) {
          assert.ok(ps != null);
          assert.ok(ps instanceof Array);
          assert.strictEqual(ps.length, batch.length);

          Person.validatesPresenceOf('name');
          Person.create(batch, function(errors, persons) {
            delete Person.validations;
            assert.ok(errors != null);
            assert.strictEqual(errors.length, batch.length);
            assert.ok(errors[0] == null);
            assert.ok(errors[1] == null);
            assert.ok(errors[2] != null);

            assert.ok(persons != null);
            assert.strictEqual(persons.length, batch.length);
            assert.strictEqual(persons[0].errors, false);
            done();
          });
        });
      });
    });

    it('should create batch of objects with beforeCreate', async function() {
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
        Person.beforeCreate = function(next, data) {
          if (data && data.name === 'A') {
            return next(null, {id: 'a', name: 'A'});
          } else {
            return next();
          }
        };
        const batch = [
          {name: 'A'},
          {name: 'B'},
          undefined,
        ];
        Person.create(batch, function(e, ps) {
          assert.ok(e == null);
          assert.ok(ps != null);
          assert.ok(ps instanceof Array);
          assert.strictEqual(ps.length, batch.length);
          assert.deepStrictEqual(ps[0], {id: 'a', name: 'A'});
          done();
        });
      });
    });

    it('should preserve properties with "undefined" value', async function() {
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
        Person.create(
          {name: 'a-name', gender: undefined},
          function(err, created) {
            if (err) return done(err);
            const result = created.toObject();
            assert.deepStrictEqual(result.id, created.id);
            assert.deepStrictEqual(result.name, 'a-name');
            assert.strictEqual(result.gender, undefined);

            Person.findById(created.id, function(err, found) {
              if (err) return done(err);
              const result = found.toObject();
              assert.deepStrictEqual(result.id, created.id);
              assert.deepStrictEqual(result.name, 'a-name');
              assert.ok(result.gender == null);
              done();
            });
          },
        );
      });
    });

    bdd.itIf(connectorCapabilities.refuseDuplicateInsert !== false, 'should refuse to create ' +
    'object with duplicate id', async function() {
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
        // NOTE(bajtos) We cannot reuse Person model here,
        // `settings.forceId` aborts the CREATE request at the validation step.
        const Product = db.define('ProductTest', {name: String}, {forceId: false});
        db.automigrate('ProductTest', function(err) {
          if (err) return done(err);

          Product.create({name: 'a-name'}, function(err, p) {
            if (err) return done(err);
            Product.create({id: p.id, name: 'duplicate'}, function(err, result) {
              if (!err) {
                return done(new Error('Create should have rejected duplicate id.'));
              }
              assert.match(err.message, /duplicate/i);
              done();
            });
          });
        });
      });
    });
  });

  describe('save', function() {
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
        Person.destroyAll(function(err) {
          if (err) return done(err);
          Person.create({name: 'Test Person', age: 25}, function(err, p) {
            if (err) return done(err);
            done();
          });
        });
      });
    });

    it('should save new object', async function() {
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
        const p = new Person;
        assert.ok(p.id == null);
        p.save(function(err) {
          if (err) return done(err);
          assert.ok(p.id != null);
          done();
        });
      });
    });

    it('should save new object (promise variant)', async function() {
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
        const p = new Person;
        assert.ok(p.id == null);
        p.save()
          .then(function() {
            assert.ok(p.id != null);
            done();
          })
          .catch(done);
      });
    });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should save existing object', async function() {
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
          // Cloudant could not guarantee findOne always return the same item
          Person.findOne(function(err, p) {
            if (err) return done(err);
            p.name = 'Hans';
            p.save(function(err) {
              if (err) return done(err);
              assert.strictEqual(p.name, 'Hans');
              Person.findOne(function(err, p) {
                if (err) return done(err);
                assert.strictEqual(p.name, 'Hans');
                done();
              });
            });
          });
        });
      });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should save existing object (promise variant)', async function() {
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
          // Cloudant could not guarantee findOne always return the same item
          Person.findOne()
            .then(function(p) {
              p.name = 'Fritz';
              return p.save()
                .then(function() {
                  return Person.findOne()
                    .then(function(p) {
                      assert.strictEqual(p.name, 'Fritz');
                      done();
                    });
                });
            })
            .catch(done);
        });
      });

    it('should save invalid object (skipping validation)', async function() {
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
        Person.findOne(function(err, p) {
          if (err) return done(err);
          p.isValid = function(cb) {
            process.nextTick(function() {
              cb(false);
            });
          };
          p.name = 'Nana';
          p.save(function(err) {
            assert.ok(err != null);
            p.save({validate: false}, function(err) {
              if (err) return done(err);
              done();
            });
          });
        });
      });
    });

    it('should save invalid object (skipping validation - promise variant)', async function() {
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
        Person.findOne()
          .then(function(p) {
            p.isValid = function(cb) {
              process.nextTick(function() {
                cb(false);
              });
            };
            p.name = 'Nana';
            return p.save()
              .then(function(d) {
                done(new Error('save should have failed.'));
              }, function(err) {
                assert.ok(err != null);
                p.save({validate: false})
                  .then(function(d) {
                    assert.ok(d != null);
                    done();
                  });
              });
          })
          .catch(done);
      });
    });

    it('should save throw error on validation', async function() {
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
        Person.findOne(function(err, p) {
          if (err) return done(err);
          p.isValid = function(cb) {
            cb(false);
            return false;
          };
          assert.throws(() => {
            p.save({
              'throws': true,
            });
          }, ValidationError);
          done();
        });
      });
    });

    it('should preserve properties with dynamic setters', async function() {
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
        // This test reproduces a problem discovered by LoopBack unit-test
        // "User.hasPassword() should match a password after it is changed"
        StubUser.create({password: 'foo'}, function(err, created) {
          if (err) return done(err);
          assert.strictEqual(created.password, 'foo-FOO');
          created.password = 'bar';
          created.save(function(err, saved) {
            if (err) return done(err);
            assert.deepStrictEqual(created.id, saved.id);
            assert.strictEqual(saved.password, 'bar-BAR');
            StubUser.findById(created.id, function(err, found) {
              if (err) return done(err);
              assert.deepStrictEqual(created.id, found.id);
              assert.strictEqual(found.password, 'bar-BAR');
              done();
            });
          });
        });
      });
    });
  });

  describe('updateAttributes', function() {
    let person;

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
        Person.destroyAll(function(err) {
          if (err) return done(err);
          Person.create({name: 'Mary', age: 15}, function(err, p) {
            if (err) return done(err);
            person = p;
            done();
          });
        });
      });
    });

    it('should have updated password hashed with updateAttribute',
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
          StubUser.create({password: 'foo'}, function(err, created) {
            if (err) return done(err);
            created.updateAttribute('password', 'test', function(err, created) {
              if (err) return done(err);
              assert.strictEqual(created.password, 'test-TEST');
              StubUser.findById(created.id, function(err, found) {
                if (err) return done(err);
                assert.strictEqual(found.password, 'test-TEST');
                done();
              });
            });
          });
        });
      });

    it('should reject created StubUser with empty password', async function() {
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
        StubUser.create({email: 'b@example.com', password: ''}, function(err, createdUser) {
          assert.match((err.message), /password cannot be empty/);
          done();
        });
      });
    });

    it('should reject updated empty password with updateAttribute', async function() {
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
        StubUser.create({password: 'abc123'}, function(err, createdUser) {
          if (err) return done(err);
          createdUser.updateAttribute('password', '', function(err, updatedUser) {
            assert.match((err.message), /password cannot be empty/);
            done();
          });
        });
      });
    });

    it('should update one attribute', async function() {
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
        person.updateAttribute('name', 'Paul Graham', function(err, p) {
          if (err) return done(err);
          Person.all(function(e, ps) {
            if (e) return done(e);
            assert.strictEqual(ps.length, 1);
            assert.strictEqual(ps.pop().name, 'Paul Graham');
            done();
          });
        });
      });
    });

    it('should update one attribute (promise variant)', async function() {
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
        person.updateAttribute('name', 'Teddy Graham')
          .then(function(p) {
            return Person.all()
              .then(function(ps) {
                assert.strictEqual(ps.length, 1);
                assert.strictEqual(ps.pop().name, 'Teddy Graham');
                done();
              });
          }).catch(done);
      });
    });

    it('should ignore undefined values on updateAttributes', async function() {
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
        person.updateAttributes({'name': 'John', age: undefined},
          function(err, p) {
            if (err) return done(err);
            Person.findById(p.id, function(e, p) {
              if (e) return done(e);
              assert.strictEqual(p.name, 'John');
              assert.strictEqual(p.age, 15);
              done();
            });
          });
      });
    });

    bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
      'should discard undefined values before strict validation',
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
          Person.definition.settings.strict = true;
          Person.findById(person.id, function(err, p) {
            if (err) return done(err);
            p.updateAttributes({name: 'John', unknownVar: undefined},
              function(err, p) {
              // if uknownVar was defined, it would return validationError
                if (err) return done(err);
                assert.deepStrictEqual(person.id, p.id);
                Person.findById(p.id, function(e, p) {
                  if (e) return done(e);
                  assert.strictEqual(p.name, 'John');
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, 'unknownVar'));
                  done();
                });
              });
          });
        });
      });

    it('should allow unknown attributes when strict: false',
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
          Person.definition.settings.strict = false;
          Person.findById(person.id, function(err, p) {
            if (err) return done(err);
            p.updateAttributes({name: 'John', foo: 'bar'},
              function(err, p) {
                if (err) return done(err);
                assert.ok(Object.prototype.hasOwnProperty.call(p, 'foo'));
                done();
              });
          });
        });
      });

    it('should remove unknown attributes when strict: filter',
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
          Person.definition.settings.strict = 'filter';
          Person.findById(person.id, function(err, p) {
            if (err) return done(err);
            p.updateAttributes({name: 'John', foo: 'bar'},
              function(err, p) {
                if (err) return done(err);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, 'foo'));
                done();
              });
          });
        });
      });

    // Prior to version 3.0 `strict: true` used to silently remove unknown properties,
    // now return validationError upon unknown properties
    it('should return error on unknown attributes when strict: true',
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
          // Using {foo: 'bar'} only causes dependent test failures due to the
          // stripping of object properties when in strict mode (ie. {foo: 'bar'}
          // changes to '{}' and breaks other tests
          Person.definition.settings.strict = true;
          Person.findById(person.id, function(err, p) {
            if (err) return done(err);
            p.updateAttributes({name: 'John', foo: 'bar'},
              function(err, p) {
                assert.ok(err != null);
                assert.strictEqual(err.name, 'ValidationError');
                assert.ok(err.message.includes('`foo` is not defined in the model'));
                assert.ok(!Object.prototype.hasOwnProperty.call(p, 'foo'));
                Person.findById(p.id, function(e, p) {
                  if (e) return done(e);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, 'foo'));
                  done();
                });
              });
          });
        });
      });

    // strict: throw is deprecated, use strict: true instead
    // which returns Validation Error for unknown properties
    it('should fallback to strict:true when using strict: throw', async function() {
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
        Person.definition.settings.strict = 'throw';
        Person.findById(person.id, function(err, p) {
          if (err) return done(err);
          p.updateAttributes({foo: 'bar'},
            function(err, p) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.ok(err.message.includes('`foo` is not defined in the model'));
              Person.findById(person.id, function(e, p) {
                if (e) return done(e);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, 'foo'));
                done();
              });
            });
        });
      });
    });

    // strict: validate is deprecated, use strict: true instead
    // behavior remains the same as before, because validate is now default behavior
    it('should fallback to strict:true when using strict:validate', async function() {
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
        Person.definition.settings.strict = 'validate';
        Person.findById(person.id, function(err, p) {
          if (err) return done(err);
          p.updateAttributes({foo: 'bar'},
            function(err, p) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.ok(err.message.includes('`foo` is not defined in the model'));
              Person.findById(person.id, function(e, p) {
                if (e) return done(e);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, 'foo'));
                done();
              });
            });
        });
      });
    });

    it('should allow same id value on updateAttributes', async function() {
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
        person.updateAttributes({id: person.id, name: 'John'},
          function(err, p) {
            if (err) return done(err);
            Person.findById(p.id, function(e, p) {
              if (e) return done(e);
              assert.strictEqual(p.name, 'John');
              assert.strictEqual(p.age, 15);
              done();
            });
          });
      });
    });

    it('should allow same stringified id value on updateAttributes',
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
          let pid = person.id;
          if (typeof person.id === 'object' || typeof person.id === 'number') {
          // For example MongoDB ObjectId
            pid = person.id.toString();
          }
          person.updateAttributes({id: pid, name: 'John'},
            function(err, p) {
              if (err) return done(err);
              Person.findById(p.id, function(e, p) {
                if (e) return done(e);
                assert.strictEqual(p.name, 'John');
                assert.strictEqual(p.age, 15);
                done();
              });
            });
        });
      });

    it('should fail if an id value is to be changed on updateAttributes',
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
          person.updateAttributes({id: person.id + 1, name: 'John'},
            function(err, p) {
              assert.ok(err != null);
              done();
            });
        });
      });

    it('has an alias "patchAttributes"', async function() {
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
        assert.strictEqual(person.updateAttributes, person.patchAttributes);
        done();
      });
    });

    it('should allow model instance on updateAttributes', async function() {
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
        person.updateAttributes(new Person({'name': 'John', age: undefined}),
          function(err, p) {
            if (err) return done(err);
            Person.findById(p.id, function(e, p) {
              if (e) return done(e);
              assert.strictEqual(p.name, 'John');
              assert.strictEqual(p.age, 15);
              done();
            });
          });
      });
    });

    it('should allow model instance on updateAttributes (promise variant)', async function() {
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
        person.updateAttributes(new Person({'name': 'Jane', age: undefined}))
          .then(function(p) {
            return Person.findById(p.id)
              .then(function(p) {
                assert.strictEqual(p.name, 'Jane');
                assert.strictEqual(p.age, 15);
                done();
              });
          })
          .catch(done);
      });
    });

    it('should raises on connector error', async function() {
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
        const fakeConnector = {
          updateAttributes: function(model, id, data, options, cb) {
            cb(new Error('Database Error'));
          },
        };
        person.getConnector = function() { return fakeConnector; };
        person.updateAttributes({name: 'John'}, function(err, p) {
          assert.ok(err != null);
          done();
        });
      });
    });
  });

  describe('updateOrCreate', function() {
    let Post, Todo;

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
        Post = db.define('Post', {
          title: {type: String, id: true},
          content: {type: String},
        });
        Todo = db.define('Todo', {
          content: String,
        });
        // Here `Person` model overrides the one outside 'updataOrCreate'
        // with forceId: false. Related test cleanup see issue:
        // https://github.com/strongloop/loopback-datasource-juggler/issues/1317
        Person = db.define('Person', {
          name: String,
          gender: String,
          married: Boolean,
          age: {type: Number, index: true},
          dob: Date,
          createdAt: {type: Date, default: Date},
        }, {forceId: false});
        db.automigrate(['Post', 'Todo', 'Person'], done);
      });
    });

    beforeEach(async function deleteModelsInstances() {
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
        Todo.deleteAll(done);
      });
    });

    it('has an alias "patchOrCreate"', function() {
      assert.strictEqual(StubUser.updateOrCreate, StubUser.patchOrCreate);
    });

    it('creates a model when one does not exist', async function() {
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
        Todo.updateOrCreate({content: 'a'}, function(err, data) {
          if (err) return done(err);

          Todo.findById(data.id, function(err, todo) {
            assert.ok(todo != null);
            assert.ok(todo.content != null);
            assert.strictEqual(todo.content, 'a');

            done();
          });
        });
      });
    });

    it('updates a model if it exists', async function() {
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
        Todo.create({content: 'a'}, function(err, todo) {
          Todo.updateOrCreate({id: todo.id, content: 'b'}, function(err, data) {
            if (err) return done(err);

            assert.ok(data != null);
            assert.ok(data.id != null);
            assert.deepStrictEqual(data.id, todo.id);
            assert.ok(data.content != null);
            assert.strictEqual(data.content, 'b');

            done();
          });
        });
      });
    });

    it('should reject updated empty password with updateOrCreate', async function() {
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
        StubUser.create({password: 'abc123'}, function(err, createdUser) {
          if (err) return done(err);
          StubUser.updateOrCreate({id: createdUser.id, 'password': ''}, function(err, updatedUser) {
            assert.match((err.message), /password cannot be empty/);
            done();
          });
        });
      });
    });

    it('throws error for queries with array input', async function() {
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
        Todo.updateOrCreate([{content: 'a'}], function(err, data) {
          assert.ok(err != null);
          assert.ok(err.message.includes('bulk'));
          assert.ok(data == null);

          done();
        });
      });
    });

    it('should preserve properties with dynamic setters on create', async function() {
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
        StubUser.updateOrCreate({password: 'foo'}, function(err, created) {
          if (err) return done(err);
          assert.strictEqual(created.password, 'foo-FOO');
          StubUser.findById(created.id, function(err, found) {
            if (err) return done(err);
            assert.strictEqual(found.password, 'foo-FOO');
            done();
          });
        });
      });
    });

    it('should preserve properties with dynamic setters on update', async function() {
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
        StubUser.create({password: 'foo'}, function(err, created) {
          if (err) return done(err);
          const data = {id: created.id, password: 'bar'};
          StubUser.updateOrCreate(data, function(err, updated) {
            if (err) return done(err);
            assert.strictEqual(updated.password, 'bar-BAR');
            StubUser.findById(created.id, function(err, found) {
              if (err) return done(err);
              assert.strictEqual(found.password, 'bar-BAR');
              done();
            });
          });
        });
      });
    });

    it('should preserve properties with "undefined" value', async function() {
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
        Person.create(
          {name: 'a-name', gender: undefined},
          function(err, instance) {
            if (err) return done(err);
            const result = instance.toObject();
            assert.deepStrictEqual(result.id, instance.id);
            assert.strictEqual(result.name, 'a-name');
            assert.strictEqual(result.gender, undefined);

            Person.updateOrCreate(
              {id: instance.id, name: 'updated name'},
              function(err, updated) {
                if (err) return done(err);
                const result = updated.toObject();
                assert.deepStrictEqual(result.id, instance.id);
                assert.strictEqual(result.name, 'updated name');
                assert.ok(result.gender == null);

                done();
              },
            );
          },
        );
      });
    });

    it('updates specific instances when PK is not an auto-generated id', async function() {
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
        // skip the test if the connector is mssql
        // https://github.com/strongloop/loopback-connector-mssql/pull/92#r72853474
        const dsName = Post.dataSource.name;
        if (dsName === 'mssql') return done();

        Post.create([
          {title: 'postA', content: 'contentA'},
          {title: 'postB', content: 'contentB'},
        ], function(err, instance) {
          if (err) return done(err);

          Post.updateOrCreate({
            title: 'postA', content: 'newContent',
          }, function(err, instance) {
            if (err) return done(err);

            const result = instance.toObject();
            assert.deepStrictEqual(result, {
              title: 'postA',
              content: 'newContent',
            });
            Post.find(function(err, posts) {
              if (err) return done(err);

              assert.strictEqual(posts.length, 2);
              assert.strictEqual(posts[0].title, 'postA');
              assert.strictEqual(posts[0].content, 'newContent');
              assert.strictEqual(posts[1].title, 'postB');
              assert.strictEqual(posts[1].content, 'contentB');
              done();
            });
          });
        });
      });
    });

    it('should allow save() of the created instance', async function() {
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
        const unknownId = uid.fromConnector(db) || 999;
        Person.updateOrCreate(
          {id: unknownId, name: 'a-name'},
          function(err, inst) {
            if (err) return done(err);
            inst.save(done);
          },
        );
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

      // And updateOrCreate an existing record
      const found = await Player.updateOrCreate({id: created.id, name: 'updated'});
      assert.ok([
        undefined, // databases supporting `undefined` value
        null, // databases representing `undefined` as `null`
      ].includes(found.toObject().active));
    });
  });

  bdd.describeIf(connectorCapabilities.supportForceId !== false,
    'updateOrCreate when forceId is true', function() {
      let Post;
      before(async function definePostModel() {
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
          const ds = getSchema();
          Post = ds.define('Post', {
            title: {type: String, length: 255},
            content: {type: String},
          }, {forceId: true});
          ds.automigrate('Post', done);
        });
      });

      it('fails when id does not exist in db & validate is true', async function() {
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
          const unknownId = uid.fromConnector(db) || 123;
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.updateOrCreate(post, {validate: true}, (err) => {
            assert.strictEqual(err.statusCode, 404);
            done();
          });
        });
      });

      it('fails when id does not exist in db & validate is false', async function() {
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
          const unknownId = uid.fromConnector(db) || 123;
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.updateOrCreate(post, {validate: false}, (err) => {
            assert.strictEqual(err.statusCode, 404);
            done();
          });
        });
      });

      it('fails when id does not exist in db & validate is false when using updateAttributes',
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
            const unknownId = uid.fromConnector(db) || 123;
            const post = new Post({id: unknownId});
            post.updateAttributes({title: 'updated title', content: 'AAA'}, {validate: false}, (err) => {
              assert.strictEqual(err.statusCode, 404);
              done();
            });
          });
        });

      it('works on create if the request does not include an id', async function() {
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
          const post = {title: 'a', content: 'AAA'};
          Post.updateOrCreate(post, (err, p) => {
            if (err) return done(err);
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.content, post.content);
            done();
          });
        });
      });

      it('works on update if the request includes an existing id in db', async function() {
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
          Post.create({title: 'a', content: 'AAA'}, (err, post) => {
            if (err) return done(err);
            post = post.toObject();
            delete post.content;
            post.title = 'b';
            Post.updateOrCreate(post, function(err, p) {
              if (err) return done(err);
              assert.strictEqual(p.id, post.id);
              assert.strictEqual(p.title, 'b');
              done();
            });
          });
        });
      });
    });

  const hasReplaceById = connectorCapabilities.cloudantCompatible !== false &&
    !!getSchema().connector.replaceById;

  if (!hasReplaceById) {
    describe('replaceById - not implemented', {skip: true}, function() {});
  } else {
    describe('replaceOrCreate', function() {
      let Post, unknownId;
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
          unknownId = uid.fromConnector(db) || 123;
          Post = db.define('Post', {
            title: {type: String, length: 255, index: true},
            content: {type: String},
            comments: [String],
          }, {forceId: false});
          db.automigrate('Post', done);
        });
      });

      it('works without options on create (promise variant)', async function() {
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
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.replaceOrCreate(post)
            .then(function(p) {
              assert.ok(p != null);
              assert.ok(p instanceof Post);
              assert.deepStrictEqual(p.id, post.id);
              assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
              assert.strictEqual(p.title, post.title);
              assert.strictEqual(p.content, post.content);
              return Post.findById(p.id)
                .then(function(p) {
                  assert.deepStrictEqual(p.id, post.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p.id, '_id'));
                  assert.strictEqual(p.title, p.title);
                  assert.strictEqual(p.content, p.content);
                  done();
                });
            })
            .catch(done);
        });
      });

      it('works with options on create (promise variant)', async function() {
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
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.replaceOrCreate(post, {validate: false})
            .then(function(p) {
              assert.ok(p != null);
              assert.ok(p instanceof Post);
              assert.deepStrictEqual(p.id, post.id);
              assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
              assert.strictEqual(p.title, post.title);
              assert.strictEqual(p.content, post.content);
              return Post.findById(p.id)
                .then(function(p) {
                  assert.deepStrictEqual(p.id, post.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p.id, '_id'));
                  assert.strictEqual(p.title, p.title);
                  assert.strictEqual(p.content, p.content);
                  done();
                });
            })
            .catch(done);
        });
      });

      it('works without options on update (promise variant)', async function() {
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
          const post = {title: 'a', content: 'AAA', comments: ['Comment1']};
          Post.create(post)
            .then(function(created) {
              created = created.toObject();
              delete created.comments;
              delete created.content;
              created.title = 'b';
              return Post.replaceOrCreate(created)
                .then(function(p) {
                  assert.ok(p != null);
                  assert.ok(p instanceof Post);
                  assert.deepStrictEqual(p.id, created.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                  assert.strictEqual(p.title, 'b');
                  assert.ok([null, undefined].includes(p.content));
                  assert.ok([null, undefined].includes(p.comments));

                  return Post.findById(created.id)
                    .then(function(p) {
                      assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                      assert.strictEqual(p.title, 'b');
                      assert.ok(p.content == null);
                      assert.ok(p.comments == null);
                      done();
                    });
                });
            })
            .catch(done);
        });
      });

      it('works with options on update (promise variant)', async function() {
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
          const post = {title: 'a', content: 'AAA', comments: ['Comment1']};
          Post.create(post)
            .then(function(created) {
              created = created.toObject();
              delete created.comments;
              delete created.content;
              created.title = 'b';
              return Post.replaceOrCreate(created, {validate: false})
                .then(function(p) {
                  assert.ok(p != null);
                  assert.ok(p instanceof Post);
                  assert.deepStrictEqual(p.id, created.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                  assert.strictEqual(p.title, 'b');
                  assert.ok([null, undefined].includes(p.content));
                  assert.ok([null, undefined].includes(p.comments));

                  return Post.findById(created.id)
                    .then(function(p) {
                      assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                      assert.strictEqual(p.title, 'b');
                      assert.ok(p.content == null);
                      assert.ok(p.comments == null);
                      done();
                    });
                });
            })
            .catch(done);
        });
      });

      it('works without options on update (callback variant)', async function() {
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
          Post.create({title: 'a', content: 'AAA', comments: ['Comment1']},
            function(err, post) {
              if (err) return done(err);
              post = post.toObject();
              delete post.comments;
              delete post.content;
              post.title = 'b';
              Post.replaceOrCreate(post, function(err, p) {
                if (err) return done(err);
                assert.deepStrictEqual(p.id, post.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                assert.strictEqual(p.title, 'b');
                assert.ok([null, undefined].includes(p.content));
                assert.ok([null, undefined].includes(p.comments));

                Post.findById(post.id, function(err, p) {
                  if (err) return done(err);
                  assert.deepStrictEqual(p.id, post.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                  assert.strictEqual(p.title, 'b');
                  assert.ok(p.content == null);
                  assert.ok(p.comments == null);
                  done();
                });
              });
            });
        });
      });

      it('works with options on update (callback variant)', async function() {
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
          Post.create({title: 'a', content: 'AAA', comments: ['Comment1']},
            {validate: false},
            function(err, post) {
              if (err) return done(err);
              post = post.toObject();
              delete post.comments;
              delete post.content;
              post.title = 'b';
              Post.replaceOrCreate(post, function(err, p) {
                if (err) return done(err);
                assert.deepStrictEqual(p.id, post.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                assert.strictEqual(p.title, 'b');
                assert.ok([null, undefined].includes(p.content));
                assert.ok([null, undefined].includes(p.comments));

                Post.findById(post.id, function(err, p) {
                  if (err) return done(err);
                  assert.deepStrictEqual(p.id, post.id);
                  assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                  assert.strictEqual(p.title, 'b');
                  assert.ok(p.content == null);
                  assert.ok(p.comments == null);
                  done();
                });
              });
            });
        });
      });

      it('works without options on create (callback variant)', async function() {
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
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.replaceOrCreate(post, function(err, p) {
            if (err) return done(err);
            assert.deepStrictEqual(p.id, post.id);
            assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.content, post.content);

            Post.findById(p.id, function(err, p) {
              if (err) return done(err);
              assert.deepStrictEqual(p.id, post.id);
              assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
              assert.strictEqual(p.title, post.title);
              assert.strictEqual(p.content, post.content);
              done();
            });
          });
        });
      });

      it('works with options on create (callback variant)', async function() {
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
          const post = {id: unknownId, title: 'a', content: 'AAA'};
          Post.replaceOrCreate(post, {validate: false}, function(err, p) {
            if (err) return done(err);
            assert.deepStrictEqual(p.id, post.id);
            assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.content, post.content);

            Post.findById(p.id, function(err, p) {
              if (err) return done(err);
              assert.deepStrictEqual(p.id, post.id);
              assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
              assert.strictEqual(p.title, post.title);
              assert.strictEqual(p.content, post.content);
              done();
            });
          });
        });
      });
    });

    bdd.describeIf(hasReplaceById && connectorCapabilities.supportForceId !== false, 'replaceOrCreate ' +
  'when forceId is true', function() {
      let Post, unknownId;
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
          unknownId = uid.fromConnector(db) || 123;
          Post = db.define('Post', {
            title: {type: String, length: 255},
            content: {type: String},
          }, {forceId: true});
          db.automigrate('Post', done);
        });
      });

      it('fails when id does not exist in db', async function() {
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
          const post = {id: unknownId, title: 'a', content: 'AAA'};

          Post.replaceOrCreate(post, function(err, p) {
            assert.strictEqual(err.statusCode, 404);
            done();
          });
        });
      });

      it('works on create if the request does not include an id', async function() {
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
          const post = {title: 'a', content: 'AAA'};
          Post.replaceOrCreate(post, function(err, p) {
            if (err) return done(err);
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.content, post.content);
            done();
          });
        });
      });

      it('works on update if the request includes an existing id in db', async function() {
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
          Post.create({title: 'a', content: 'AAA'},
            function(err, post) {
              if (err) return done(err);
              post = post.toObject();
              delete post.content;
              post.title = 'b';
              Post.replaceOrCreate(post, function(err, p) {
                if (err) return done(err);
                assert.deepStrictEqual(p.id, post.id);
                done();
              });
            });
        });
      });
    });

    if (!hasReplaceById) {
      describe('replaceAttributes/replaceById - not implemented', {skip: true}, function() {});
    } else {
      describe('replaceAttributes', function() {
        let postInstance;
        let Post;
        const ds = getSchema();
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
            Post = ds.define('Post', {
              title: {type: String, length: 255, index: true},
              content: {type: String},
              comments: [String],
            });
            ds.automigrate('Post', done);
          });
        });
        beforeEach(async function() {
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
            // TODO(bajtos) add API to lib/observer - remove observers for all hooks
            Post._observers = {};
            Post.destroyAll(function() {
              Post.create({title: 'a', content: 'AAA'}, function(err, p) {
                if (err) return done(err);
                postInstance = p;
                done();
              });
            });
          });
        });

        it('should have updated password hashed with replaceAttributes',
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
              StubUser.create({password: 'foo'}, function(err, created) {
                if (err) return done(err);
                created.replaceAttributes({password: 'test'}, function(err, created) {
                  if (err) return done(err);
                  assert.strictEqual(created.password, 'test-TEST');
                  StubUser.findById(created.id, function(err, found) {
                    if (err) return done(err);
                    assert.strictEqual(found.password, 'test-TEST');
                    done();
                  });
                });
              });
            });
          });

        it('should reject updated empty password with replaceAttributes', async function() {
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
            StubUser.create({password: 'abc123'}, function(err, createdUser) {
              if (err) return done(err);
              createdUser.replaceAttributes({'password': ''}, function(err, updatedUser) {
                assert.match((err.message), /password cannot be empty/);
                done();
              });
            });
          });
        });

        it('should ignore PK if it is set for `instance`' +
      'in `before save` operation hook', async function() {
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              changePostIdInHook('before save');
              p.replaceAttributes({title: 'b'}, function(err, data) {
                if (err) return done(err);
                assert.deepStrictEqual(data.id, postInstance.id);
                Post.find(function(err, p) {
                  if (err) return done(err);
                  assert.deepStrictEqual(p[0].id, postInstance.id);
                  done();
                });
              });
            });
          });
        });

        it('should set cannotOverwritePKInBeforeSaveHook flag, if `instance` in' +
      '`before save` operation hook is set, so we report a warning just once',
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              changePostIdInHook('before save');
              p.replaceAttributes({title: 'b'}, function(err, data) {
                if (err) return done(err);
                assert.strictEqual(Post._warned.cannotOverwritePKInBeforeSaveHook, true);
                assert.deepStrictEqual(data.id, postInstance.id);
                done();
              });
            });
          });
        });

        it('should ignore PK if it is set for `data`' +
      'in `loaded` operation hook', async function() {
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              changePostIdInHook('loaded');
              p.replaceAttributes({title: 'b'}, function(err, data) {
                assert.deepStrictEqual(data.id, postInstance.id);
                if (err) return done(err);
                // clear observers to make sure `loaded`
                // hook does not affect `find()` method
                Post.clearObservers('loaded');
                Post.find(function(err, p) {
                  if (err) return done(err);
                  assert.deepStrictEqual(p[0].id, postInstance.id);
                  done();
                });
              });
            });
          });
        });

        it('should set cannotOverwritePKInLoadedHook flag, if `instance` in' +
      '`before save` operation hook is set, so we report a warning just once',
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              changePostIdInHook('loaded');
              p.replaceAttributes({title: 'b'}, function(err, data) {
                if (err) return done(err);
                assert.strictEqual(Post._warned.cannotOverwritePKInLoadedHook, true);
                assert.deepStrictEqual(data.id, postInstance.id);
                done();
              });
            });
          });
        });

        it('works without options(promise variant)', async function() {
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
            Post.findById(postInstance.id)
              .then(function(p) {
                p.replaceAttributes({title: 'b'})
                  .then(function(p) {
                    assert.ok(p != null);
                    assert.ok(p instanceof Post);
                    assert.strictEqual(p.title, 'b');
                    assert.ok([null, undefined].includes(p.content));
                    return Post.findById(postInstance.id)
                      .then(function(p) {
                        assert.strictEqual(p.title, 'b');
                        assert.ok(p.content == null);
                        done();
                      });
                  });
              })
              .catch(done);
          });
        });

        it('works with options(promise variant)', async function() {
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
            Post.findById(postInstance.id)
              .then(function(p) {
                p.replaceAttributes({title: 'b'}, {validate: false})
                  .then(function(p) {
                    assert.ok(p != null);
                    assert.ok(p instanceof Post);
                    assert.strictEqual(p.title, 'b');
                    assert.ok([null, undefined].includes(p.content));
                    return Post.findById(postInstance.id)
                      .then(function(p) {
                        assert.strictEqual(p.title, 'b');
                        assert.ok(p.content == null);
                        done();
                      });
                  });
              })
              .catch(done);
          });
        });

        it('should fail when changing id', async function() {
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
            const unknownId = uid.fromConnector(db) || 999;
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              p.replaceAttributes({title: 'b', id: unknownId}, function(err, p) {
                assert.ok(err != null);
                const expectedErrMsg = 'id property (id) cannot be updated from ' +
              postInstance.id + ' to ' + unknownId;
                assert.strictEqual(err.message, expectedErrMsg);
                done();
              });
            });
          });
        });

        it('works without options(callback variant)', async function() {
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              p.replaceAttributes({title: 'b'}, function(err, p) {
                if (err) return done(err);
                assert.ok([null, undefined].includes(p.content));
                assert.strictEqual(p.title, 'b');
                done();
              });
            });
          });
        });

        it('works with options(callback variant)', async function() {
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
            Post.findById(postInstance.id, function(err, p) {
              if (err) return done(err);
              p.replaceAttributes({title: 'b'}, {validate: false}, function(err, p) {
                if (err) return done(err);
                assert.ok([null, undefined].includes(p.content));
                assert.strictEqual(p.title, 'b');
                done();
              });
            });
          });
        });

        function changePostIdInHook(operationHook) {
          Post.observe(operationHook, function(ctx, next) {
            (ctx.data || ctx.instance).id = 99;
            next();
          });
        }
      });
    }
  }

  bdd.describeIf(hasReplaceById, 'replaceById', function() {
    let Post;
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
        Post = db.define('Post', {
          title: {type: String, length: 255},
          content: {type: String},
          throwingSetter: {type: String, default: null},
        }, {forceId: true});
        Post.setter.throwingSetter = throwingSetter;
        db.automigrate('Post', done);
      });
    });

    bdd.itIf(connectorCapabilities.supportForceId !== false, 'fails when id does not exist in db ' +
    'using replaceById', async function() {
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
        const unknownId = uid.fromConnector(db) || 123;
        const post = {id: unknownId, title: 'a', content: 'AAA'};
        Post.replaceById(post.id, post, function(err, p) {
          assert.strictEqual(err.statusCode, 404);
          done();
        });
      });
    });

    it('correctly coerces the PK value', async () => {
      const created = await Post.create({
        title: 'a title',
        content: 'a content',
      });

      // Emulate what happens when model instance is received by REST API clients
      const data = JSON.parse(JSON.stringify(created));

      // Modify some of the data
      data.title = 'Draft';

      // Call replaceById to modify the database record
      await Post.replaceById(data.id, data);

      // Verify what has been stored
      const found = await Post.findById(data.id);
      assert.deepStrictEqual(found.toObject(), {
        id: created.id,
        title: 'Draft',
        content: 'a content',
        throwingSetter: null,
      });

      // Verify that no warnings were triggered
      assert.strictEqual(Object.keys(Post._warned).length, 0);
    });

    it('should return rejected promise when model initialization failed', async () => {
      const firstNotFailedPost = await Post.create({title: 'Sad Post'}); // no property with failing setter
      await assert.rejects(
        Post.replaceById(firstNotFailedPost.id, {
          title: 'Sad Post', throwingSetter: 'somethingElse',
        }),
        /Intentional error triggered from a property setter/,
      );
    });
  });

  describe('findOrCreate', function() {
    it('should create a record with if new', async function() {
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
        Person.findOrCreate({name: 'Zed', gender: 'male'},
          function(err, p, created) {
            if (err) return done(err);
            assert.ok(p != null);
            assert.ok(p instanceof Person);
            assert.strictEqual(p.name, 'Zed');
            assert.strictEqual(p.gender, 'male');
            assert.strictEqual(created, true);
            done();
          });
      });
    });

    it('should find a record if exists', async function() {
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
        Person.findOrCreate(
          {where: {name: 'Zed'}},
          {name: 'Zed', gender: 'male'},
          function(err, p, created) {
            if (err) return done(err);
            assert.ok(p != null);
            assert.ok(p instanceof Person);
            assert.strictEqual(p.name, 'Zed');
            assert.strictEqual(p.gender, 'male');
            assert.strictEqual(created, false);
            done();
          },
        );
      });
    });

    it('should create a record with if new (promise variant)', async function() {
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
        Person.findOrCreate({name: 'Jed', gender: 'male'})
          .then(function(res) {
            assert.ok(res != null);
            assert.ok(res instanceof Array);
            assert.strictEqual(res.length, 2);
            const p = res[0];
            const created = res[1];
            assert.ok(p instanceof Person);
            assert.strictEqual(p.name, 'Jed');
            assert.strictEqual(p.gender, 'male');
            assert.strictEqual(created, true);
            done();
          })
          .catch(done);
      });
    });

    it('should find a record if exists (promise variant)', async function() {
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
        Person.findOrCreate(
          {where: {name: 'Jed'}},
          {name: 'Jed', gender: 'male'},
        )
          .then(function(res) {
            assert.ok(res instanceof Array);
            assert.strictEqual(res.length, 2);
            const p = res[0];
            const created = res[1];
            assert.ok(p instanceof Person);
            assert.strictEqual(p.name, 'Jed');
            assert.strictEqual(p.gender, 'male');
            assert.strictEqual(created, false);
            done();
          })
          .catch(done);
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

      // And findOrCreate an existing record
      const [found] = await Player.findOrCreate({id: created.id}, {name: 'updated'});
      assert.ok([
        undefined, // databases supporting `undefined` value
        null, // databases representing `undefined` as `null`
      ].includes(found.toObject().active));
    });
  });

  describe('destroy', function() {
    it('should destroy record', async function() {
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
        Person.create(function(err, p) {
          if (err) return done(err);
          p.destroy(function(err) {
            if (err) return done(err);
            Person.exists(p.id, function(err, ex) {
              if (err) return done(err);
              assert.ok(!ex);
              done();
            });
          });
        });
      });
    });

    it('should destroy record (promise variant)', async function() {
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
        Person.create()
          .then(function(p) {
            return p.destroy()
              .then(function() {
                return Person.exists(p.id)
                  .then(function(ex) {
                    assert.ok(!ex);
                    done();
                  });
              });
          })
          .catch(done);
      });
    });

    it('should destroy all records', async function() {
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
        Person.destroyAll(function(err) {
          if (err) return done(err);
          Person.all(function(err, posts) {
            if (err) return done(err);
            assert.strictEqual(posts.length, 0);
            Person.count(function(err, count) {
              if (err) return done(err);
              assert.deepStrictEqual(count, 0);
              done();
            });
          });
        });
      });
    });

    it('should destroy all records (promise variant)', async function() {
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
        Person.create()
          .then(function() {
            return Person.destroyAll()
              .then(function() {
                return Person.all()
                  .then(function(ps) {
                    assert.strictEqual(ps.length, 0);
                    return Person.count()
                      .then(function(count) {
                        assert.deepStrictEqual(count, 0);
                        done();
                      });
                  });
              });
          })
          .catch(done);
      });
    });

    // TODO: implement destroy with filtered set
    it('should destroy filtered set of records');
  });

  bdd.describeIf(connectorCapabilities.reportDeletedCount !== false &&
  connectorCapabilities.deleteWithOtherThanId !== false, 'deleteAll/destroyAll', function() {
    beforeEach(async function clearOldData() {
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
        Person.deleteAll(done);
      });
    });

    beforeEach(async function createTestData() {
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
        Person.create([{
          name: 'John',
        }, {
          name: 'Jane',
        }], function(err, data) {
          assert.ok(err == null);
          done();
        });
      });
    });

    it('should be defined as function', function() {
      assert.strictEqual(typeof Person.deleteAll, 'function');
      assert.strictEqual(typeof Person.destroyAll, 'function');
    });

    it('should only delete instances that satisfy the where condition',
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
          Person.deleteAll({name: 'John'}, function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            Person.find({where: {name: 'John'}}, function(err, data) {
              if (err) return done(err);
              assert.strictEqual(data.length, 0);
              Person.find({where: {name: 'Jane'}}, function(err, data) {
                if (err) return done(err);
                assert.strictEqual(data.length, 1);
                done();
              });
            });
          });
        });
      });

    it('should report zero deleted instances when no matches are found',
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
          Person.deleteAll({name: 'does-not-match'}, function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 0);
            Person.count(function(err, count) {
              if (err) return done(err);
              assert.strictEqual(count, 2);
              done();
            });
          });
        });
      });

    it('should delete all instances when the where condition is not provided',
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
          Person.deleteAll(function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 2);
            Person.count(function(err, count) {
              if (err) return done(err);
              assert.strictEqual(count, 0);
              done();
            });
          });
        });
      });
  });

  bdd.describeIf(connectorCapabilities.reportDeletedCount === false &&
  connectorCapabilities.deleteWithOtherThanId === false, 'deleteAll/destroyAll case 2', function() {
    let idJohn, idJane;
    beforeEach(async function clearOldData() {
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
        Person.deleteAll(done);
      });
    });

    beforeEach(async function createTestData() {
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
        Person.create([{
          name: 'John',
        }, {
          name: 'Jane',
        }], function(err, data) {
          assert.ok(err == null);
          data.forEach(function(person) {
            if (person.name === 'John') idJohn = person.id;
            if (person.name === 'Jane') idJane = person.id;
          });
          assert.ok(idJohn != null);
          assert.ok(idJane != null);
          done();
        });
      });
    });

    it('should be defined as function', function() {
      assert.strictEqual(typeof Person.deleteAll, 'function');
      assert.strictEqual(typeof Person.destroyAll, 'function');
    });

    it('should only delete instances that satisfy the where condition',
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
          Person.deleteAll({id: idJohn}, function(err, info) {
            if (err) return done(err);
            assert.ok(info.count == null);
            Person.find({where: {name: 'John'}}, function(err, data) {
              if (err) return done(err);
              assert.ok(data.count == null);
              assert.strictEqual(data.length, 0);
              Person.find({where: {name: 'Jane'}}, function(err, data) {
                if (err) return done(err);
                assert.strictEqual(data.length, 1);
                done();
              });
            });
          });
        });
      });

    it('should report zero deleted instances when no matches are found',
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
          const unknownId = uid.fromConnector(db) || 1234567890;
          Person.deleteAll({id: unknownId}, function(err, info) {
            if (err) return done(err);
            assert.ok(info.count == null);
            Person.count(function(err, count) {
              if (err) return done(err);
              assert.strictEqual(count, 2);
              done();
            });
          });
        });
      });

    it('should delete all instances when the where condition is not provided',
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
          Person.deleteAll(function(err, info) {
            if (err) return done(err);
            assert.ok(info.count == null);
            Person.count(function(err, count) {
              if (err) return done(err);
              assert.strictEqual(count, 0);
              done();
            });
          });
        });
      });
  });

  describe('deleteById', function() {
    beforeEach(givenSomePeople);
    afterEach(function() {
      Person.settings.strictDelete = false;
    });

    it('should allow deleteById(id) - success', async function() {
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
        Person.findOne(function(e, p) {
          Person.deleteById(p.id, function(err, info) {
            if (err) return done(err);
            if (connectorCapabilities.reportDeletedCount !== false) {
              assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            } else {
              assert.ok(info.count == null);
            }
            done();
          });
        });
      });
    });

    it('should allow deleteById(id) - fail', async function() {
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
        const unknownId = uid.fromConnector(db) || 9999;
        Person.settings.strictDelete = false;
        Person.deleteById(unknownId, function(err, info) {
          if (err) return done(err);
          if (connectorCapabilities.reportDeletedCount !== false) {
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 0);
          } else {
            assert.ok(info.count == null);
          }
          done();
        });
      });
    });

    it('should allow deleteById(id) - fail with error', async function() {
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
        const unknownId = uid.fromConnector(db) || 9999;
        const errMsg = 'No instance with id ' + unknownId.toString() + ' found for Person';
        Person.settings.strictDelete = true;
        Person.deleteById(unknownId, function(err) {
          assert.ok(err != null);
          assert.strictEqual(err.message, errMsg);
          assert.ok(Object.prototype.hasOwnProperty.call(err, 'code')); assert.strictEqual(err.code, 'NOT_FOUND');
          assert.ok(Object.prototype.hasOwnProperty.call(err, 'statusCode')); assert.strictEqual(err.statusCode, 404);
          done();
        });
      });
    });
  });

  describe('prototype.delete', function() {
    beforeEach(givenSomePeople);
    afterEach(function() {
      Person.settings.strictDelete = false;
    });

    it('should allow delete(id) - success', async function() {
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
        Person.findOne(function(e, p) {
          if (e) return done(e);
          p.delete(function(err, info) {
            if (err) return done(err);
            if (connectorCapabilities.reportDeletedCount !== false) {
              assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            } else {
              assert.ok(info.count == null);
            }
            done();
          });
        });
      });
    });

    it('should allow delete(id) - fail', async function() {
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
        Person.settings.strictDelete = false;
        Person.findOne(function(e, p) {
          if (e) return done(e);
          p.delete(function(err, info) {
            if (err) return done(err);
            if (connectorCapabilities.reportDeletedCount !== false) {
              assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            } else {
              assert.ok(info.count == null);
            }
            p.delete(function(err, info) {
              if (err) return done(err);
              if (connectorCapabilities.reportDeletedCount !== false) {
                assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 0);
              } else {
                assert.ok(info.count == null);
              }
              done();
            });
          });
        });
      });
    });

    bdd.itIf(connectorCapabilities.supportStrictDelete !== false, 'should allow delete(id) - ' +
      'fail with error', async function() {
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
        Person.settings.strictDelete = true;
        Person.findOne(function(err, u) {
          if (err) return done(err);
          u.delete(function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            u.delete(function(err) {
              assert.ok(err != null);
              assert.strictEqual(err.message, 'No instance with id ' + u.id + ' found for Person');
              assert.ok(Object.prototype.hasOwnProperty.call(err, 'code')); assert.strictEqual(err.code, 'NOT_FOUND');
              assert.ok(Object.prototype.hasOwnProperty.call(err, 'statusCode')); assert.strictEqual(err.statusCode, 404);
              done();
            });
          });
        });
      });
    });
  });

  describe('initialize', function() {
    it('should initialize object properly', function() {
      const hw = 'Hello word',
        now = Date.now(),
        person = new Person({name: hw});

      assert.strictEqual(person.name, hw);
      person.name = 'Goodbye, Lenin';
      assert.strictEqual((person.createdAt >= now), true);
      assert.strictEqual(person.isNewRecord(), true);
    });

    describe('Date $now function (type: Date)', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel1', {
            createdAt: {type: Date, default: '$now'},
          });
          db.automigrate('CustomModel1', done);
        });
      });

      it('should report current date as default value for date property',
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
            const now = Date.now();

            CustomModel.create(function(err, model) {
              assert.ok(err == null);
              assert.ok(model.createdAt instanceof Date);
              assert.strictEqual((model.createdAt >= now), true);
            });

            done();
          });
        });
    });

    describe('Date $now function (type: String)', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel2', {
            now: {type: String, default: '$now'},
          });
          db.automigrate('CustomModel2', done);
        });
      });

      it('should report \'$now\' as default value for string property',
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
            CustomModel.create(function(err, model) {
              if (err) return done(err);
              assert.strictEqual(typeof model.now, 'string');
              assert.strictEqual(model.now, '$now');
              done();
            });
          });
        });
    });

    describe('now defaultFn', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel3', {
            now: {type: Date, defaultFn: 'now'},
          });
          db.automigrate('CustomModel3', done);
        });
      });

      it('should generate current time when "defaultFn" is "now"',
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
            const now = Date.now();
            CustomModel.create(function(err, model) {
              if (err) return done(err);
              assert.ok(model.now instanceof Date);
              assert.ok(model.now >= now && model.now <= now + 200);
              done();
            });
          });
        });
    });

    describe('guid defaultFn', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel4', {
            guid: {type: String, defaultFn: 'guid'},
          });
          db.automigrate('CustomModel4', done);
        });
      });

      it('should generate a new id when "defaultFn" is "guid"', async function() {
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
          CustomModel.create(function(err, model) {
            if (err) return done(err);
            assert.match(model.guid, UUID_REGEXP);
            done();
          });
        });
      });
    });

    describe('uuid defaultFn', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel5', {
            guid: {type: String, defaultFn: 'uuid'},
          });
          db.automigrate('CustomModel5', done);
        });
      });

      it('should generate a new id when "defaultfn" is "uuid"', async function() {
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
          CustomModel.create(function(err, model) {
            if (err) return done(err);
            assert.match(model.guid, UUID_REGEXP);
            done();
          });
        });
      });
    });

    describe('uuidv4 defaultFn', function() {
      let CustomModel;

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
          CustomModel = db.define('CustomModel5', {
            guid: {type: String, defaultFn: 'uuidv4'},
          });
          db.automigrate('CustomModel5', done);
        });
      });

      it('should generate a new id when "defaultfn" is "uuidv4"', async function() {
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
          CustomModel.create(function(err, model) {
            assert.ok(err == null);
            assert.match(model.guid, UUID_REGEXP);
            done();
          });
        });
      });
    });

    describe('nanoid defaultFn', function() {
      let ModelWithNanoId;
      before(createModelWithNanoId);

      it('should generate a new id when "defaultFn" is "nanoid"', async function() {
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
          const NANOID_REGEXP = /^[0-9a-z_\-]{7,14}$/i;
          ModelWithNanoId.create(function(err, modelWithNanoId) {
            if (err) return done(err);
            assert.match(modelWithNanoId.nanoid, NANOID_REGEXP);
            done();
          });
        });
      });

      async function createModelWithNanoId() {
        ModelWithNanoId = db.define('ModelWithNanoId', {
          nanoid: {type: String, defaultFn: 'nanoid'},
        });
        await db.automigrate('ModelWithNanoId');
      }
    });

    describe('shortid defaultFn', function() {
      let ModelWithShortId;
      before(createModelWithShortId);

      it('should generate a new id when "defaultFn" is "shortid"', async function() {
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
          const SHORTID_REGEXP = /^[0-9a-z_\-]{7,14}$/i;
          ModelWithShortId.create(function(err, modelWithShortId) {
            if (err) return done(err);
            assert.match(modelWithShortId.shortid, SHORTID_REGEXP);
            done();
          });
        });
      });

      async function createModelWithShortId() {
        ModelWithShortId = db.define('ModelWithShortId', {
          shortid: {type: String, defaultFn: 'shortid'},
        });
        await db.automigrate('ModelWithShortId');
      }
    });

    // it('should work when constructor called as function', function() {
    //     var p = Person({name: 'John Resig'});
    //     assert.ok(p instanceof Person);
    //     assert.strictEqual(p.name, 'John Resig');
    // });
  });

  describe('property value coercion', function() {
    it('should coerce boolean types properly', function() {
      let p1 = new Person({name: 'John', married: 'false'});
      assert.strictEqual(p1.married, false);

      p1 = new Person({name: 'John', married: 'true'});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: '1'});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: '0'});
      assert.strictEqual(p1.married, false);

      p1 = new Person({name: 'John', married: true});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: false});
      assert.strictEqual(p1.married, false);

      p1 = new Person({name: 'John', married: 'null'});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: ''});
      assert.strictEqual(p1.married, false);

      p1 = new Person({name: 'John', married: 'X'});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: 0});
      assert.strictEqual(p1.married, false);

      p1 = new Person({name: 'John', married: 1});
      assert.strictEqual(p1.married, true);

      p1 = new Person({name: 'John', married: null});
      assert.strictEqual(p1.married, null);

      p1 = new Person({name: 'John', married: undefined});
      assert.strictEqual(p1.married, undefined);
    });

    it('should coerce date types properly', function() {
      let p1 = new Person({name: 'John', dob: '2/1/2015'});
      assert.deepStrictEqual(p1.dob, new Date('2/1/2015'));

      p1 = new Person({name: 'John', dob: '2/1/2015'});
      assert.deepStrictEqual(p1.dob, new Date('2/1/2015'));

      p1 = new Person({name: 'John', dob: '12'});
      assert.deepStrictEqual(p1.dob, new Date('12'));

      p1 = new Person({name: 'John', dob: 12});
      assert.deepStrictEqual(p1.dob, new Date(12));

      p1 = new Person({name: 'John', dob: null});
      assert.strictEqual(p1.dob, null);

      p1 = new Person({name: 'John', dob: undefined});
      assert.strictEqual(p1.dob, undefined);

      p1 = new Person({name: 'John', dob: 'X'});
      assert.deepStrictEqual(p1.dob.toString(), 'Invalid Date');
    });
  });

  describe('update/updateAll', function() {
    let idBrett, idCarla, idDonna, idFrank, idGrace, idHarry;
    let filterBrett, filterHarry;

    beforeEach(async function clearOldData() {
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
        Person.destroyAll(done);
      });
    });

    beforeEach(async function createTestData() {
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
        Person.create([{
          name: 'Brett Boe',
          age: 19,
        }, {
          name: 'Carla Coe',
          age: 20,
        }, {
          name: 'Donna Doe',
          age: 21,
        }, {
          name: 'Frank Foe',
          age: 22,
        }, {
          name: 'Grace Goe',
          age: 23,
        }], function(err, data) {
          assert.ok(err == null);
          data.forEach(function(person) {
            if (person.name === 'Brett Boe') idBrett = person.id;
            if (person.name === 'Carla Coe') idCarla = person.id;
            if (person.name === 'Donna Doe') idDonna = person.id;
            if (person.name === 'Frank Foe') idFrank = person.id;
            if (person.name === 'Grace Goe') idGrace = person.id;
          });
          assert.ok(idBrett != null);
          assert.ok(idCarla != null);
          assert.ok(idDonna != null);
          assert.ok(idFrank != null);
          assert.ok(idGrace != null);
          done();
        });
      });
    });

    it('should be defined as a function', function() {
      assert.strictEqual(typeof Person.update, 'function');
      assert.strictEqual(typeof Person.updateAll, 'function');
    });

    it('should not update instances that do not satisfy the where condition',
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
          idHarry = uid.fromConnector(db) || undefined;
          const filter = connectorCapabilities.updateWithOtherThanId === false ?
            {id: idHarry} : {name: 'Harry Hoe'};
          Person.update(filter, {name: 'Marta Moe'}, function(err,
            info) {
            if (err) return done(err);
            if (connectorCapabilities.reportDeletedCount !== false) {
              assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 0);
            } else {
              assert.ok(info.count == null);
            }
            Person.find({where: {name: 'Harry Hoe'}}, function(err, people) {
              if (err) return done(err);
              assert.strictEqual(people.length, 0);
              done();
            });
          });
        });
      });

    it('should only update instances that satisfy the where condition',
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
          const filter = connectorCapabilities.deleteWithOtherThanId === false ?
            {id: idBrett} : {name: 'Brett Boe'};
          Person.update(filter, {name: 'Harry Hoe'}, function(err,
            info) {
            if (err) return done(err);
            if (connectorCapabilities.reportDeletedCount !== false) {
              assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            } else {
              assert.ok(info.count == null);
            }
            Person.find({where: {age: 19}}, function(err, people) {
              if (err) return done(err);
              assert.strictEqual(people.length, 1);
              assert.strictEqual(people[0].name, 'Harry Hoe');
              done();
            });
          });
        });
      });

    it('should reject updated empty password with updateAll', async function() {
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
        StubUser.create({password: 'abc123'}, function(err, createdUser) {
          if (err) return done(err);
          StubUser.updateAll({where: {id: createdUser.id}}, {'password': ''}, function(err, updatedUser) {
            assert.match((err.message), /password cannot be empty/);
            done();
          });
        });
      });
    });

    bdd.itIf(connectorCapabilities.updateWithoutId !== false,
      'should update all instances when the where condition is not provided', async function() {
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
          filterHarry = connectorCapabilities.deleteWithOtherThanId === false ?
            {id: idHarry} : {name: 'Harry Hoe'};
          filterBrett = connectorCapabilities.deleteWithOtherThanId === false ?
            {id: idBrett} : {name: 'Brett Boe'};
          Person.update(filterHarry, function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 5);
            Person.find({where: filterBrett}, function(err, people) {
              if (err) return done(err);
              assert.strictEqual(people.length, 0);
              Person.find({where: filterHarry}, function(err, people) {
                if (err) return done(err);
                assert.strictEqual(people.length, 5);
                done();
              });
            });
          });
        });
      });

    bdd.itIf(connectorCapabilities.ignoreUndefinedConditionValue !== false, 'should ignore where ' +
    'conditions with undefined values', async function() {
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
        Person.update(filterBrett, {name: undefined, gender: 'male'},
          function(err, info) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(info, 'count')); assert.strictEqual(info.count, 1);
            Person.find({where: filterBrett}, function(err, people) {
              if (err) return done(err);
              assert.strictEqual(people.length, 1);
              assert.strictEqual(people[0].name, 'Brett Boe');
              done();
            });
          });
      });
    });

    it('should not coerce invalid values provided in where conditions', async function() {
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
        Person.update({name: 'Brett Boe'}, {dob: 'notadate'}, function(err) {
          assert.ok(err != null);
          assert.strictEqual(err.message, 'Invalid date: notadate');
          done();
        });
      });
    });
  });

  describe('upsertWithWhere', function() {
    let ds, Person;
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
        ds = getSchema();
        Person = ds.define('Person', {
          id: {type: Number, id: true},
          name: {type: String},
          city: {type: String},
        });
        ds.automigrate('Person', done);
      });
    });

    it('has an alias "patchOrCreateWithWhere"', function() {
      assert.strictEqual(StubUser.upsertWithWhere, StubUser.patchOrCreateWithWhere);
    });

    it('should preserve properties with dynamic setters on create', async function() {
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
        StubUser.upsertWithWhere({password: 'foo'}, {password: 'foo'}, function(err, created) {
          if (err) return done(err);
          assert.strictEqual(created.password, 'foo-FOO');
          StubUser.findById(created.id, function(err, found) {
            if (err) return done(err);
            assert.strictEqual(found.password, 'foo-FOO');
            done();
          });
        });
      });
    });

    it('should preserve properties with dynamic setters on update', async function() {
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
        StubUser.create({password: 'foo'}, function(err, created) {
          if (err) return done(err);
          const data = {password: 'bar'};
          StubUser.upsertWithWhere({id: created.id}, data, function(err, updated) {
            if (err) return done(err);
            assert.strictEqual(updated.password, 'bar-BAR');
            StubUser.findById(created.id, function(err, found) {
              if (err) return done(err);
              assert.strictEqual(found.password, 'bar-BAR');
              done();
            });
          });
        });
      });
    });

    it('should preserve properties with "undefined" value', async function() {
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
        Person.create(
          {id: 10, name: 'Ritz', city: undefined},
          function(err, instance) {
            if (err) return done(err);
            const created = instance.toObject();
            assert.deepStrictEqual(created.id, 10);
            assert.deepStrictEqual(created.name, 'Ritz');
            assert.strictEqual(created.city, undefined);

            Person.upsertWithWhere({id: 10},
              {name: 'updated name'},
              function(err, updated) {
                if (err) return done(err);
                const result = updated.toObject();
                assert.deepStrictEqual(result.id, instance.id);
                assert.deepStrictEqual(result.name, 'updated name');
                assert.ok(result.city == null);
                done();
              });
          },
        );
      });
    });

    it('should allow save() of the created instance', async function() {
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
        Person.upsertWithWhere({id: 999},
        // Todo @mountain: This seems a bug why in data object still I need to pass id?
          {id: 999, name: 'a-name'},
          function(err, inst) {
            if (err) return done(err);
            inst.save(done);
          });
      });
    });

    it('works without options on create (promise variant)', async function() {
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
        const person = {id: 123, name: 'a', city: 'city a'};
        Person.upsertWithWhere({id: 123}, person)
          .then(function(p) {
            assert.ok(p != null);
            assert.ok(p instanceof Person);
            assert.deepStrictEqual(p.id, person.id);
            assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
            assert.strictEqual(p.name, person.name);
            assert.strictEqual(p.city, person.city);
            return Person.findById(p.id)
              .then(function(p) {
                assert.deepStrictEqual(p.id, person.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p.id, '_id'));
                assert.strictEqual(p.name, person.name);
                assert.strictEqual(p.city, person.city);
                done();
              });
          })
          .catch(done);
      });
    });

    it('works with options on create (promise variant)', async function() {
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
        const person = {id: 234, name: 'b', city: 'city b'};
        Person.upsertWithWhere({id: 234}, person, {validate: false})
          .then(function(p) {
            assert.ok(p != null);
            assert.ok(p instanceof Person);
            assert.deepStrictEqual(p.id, person.id);
            assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
            assert.strictEqual(p.name, person.name);
            assert.strictEqual(p.city, person.city);
            return Person.findById(p.id)
              .then(function(p) {
                assert.deepStrictEqual(p.id, person.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p.id, '_id'));
                assert.strictEqual(p.name, person.name);
                assert.strictEqual(p.city, person.city);
                done();
              });
          })
          .catch(done);
      });
    });

    it('works without options on update (promise variant)', async function() {
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
        const person = {id: 456, name: 'AAA', city: 'city AAA'};
        Person.create(person)
          .then(function(created) {
            created = created.toObject();
            delete created.city;
            created.name = 'BBB';
            return Person.upsertWithWhere({id: 456}, created)
              .then(function(p) {
                assert.ok(p != null);
                assert.ok(p instanceof Person);
                assert.deepStrictEqual(p.id, created.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                assert.strictEqual(p.name, 'BBB');
                assert.strictEqual(p.city, 'city AAA');
                return Person.findById(created.id)
                  .then(function(p) {
                    assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                    assert.strictEqual(p.name, 'BBB');
                    assert.strictEqual(p.city, 'city AAA');
                    done();
                  });
              });
          })
          .catch(done);
      });
    });

    it('works with options on update (promise variant)', async function() {
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
        const person = {id: 789, name: 'CCC', city: 'city CCC'};
        Person.create(person)
          .then(function(created) {
            created = created.toObject();
            delete created.city;
            created.name = 'Carlton';
            return Person.upsertWithWhere({id: 789}, created, {validate: false})
              .then(function(p) {
                assert.ok(p != null);
                assert.ok(p instanceof Person);
                assert.deepStrictEqual(p.id, created.id);
                assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                assert.strictEqual(p.name, 'Carlton');
                assert.strictEqual(p.city, 'city CCC');
                return Person.findById(created.id)
                  .then(function(p) {
                    assert.ok(!Object.prototype.hasOwnProperty.call(p, '_id'));
                    assert.strictEqual(p.name, 'Carlton');
                    assert.strictEqual(p.city, 'city CCC');
                    done();
                  });
              });
          })
          .catch(done);
      });
    });

    it('fails the upsertWithWhere operation when data object is empty', async function() {
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
        const options = {};
        Person.upsertWithWhere({name: 'John Lennon'}, {}, options,
          function(err) {
            assert.strictEqual(err.message, 'data object cannot be empty!');
            done();
          });
      });
    });

    it('creates a new record when no matching instance is found', async function() {
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
        Person.upsertWithWhere({city: 'Florida'}, {name: 'Nick Carter', id: 1, city: 'Florida'},
          function(err, created) {
            if (err) return done(err);
            Person.findById(1, function(err, data) {
              if (err) return done(err);
              assert.strictEqual(data.id, 1);
              assert.strictEqual(data.name, 'Nick Carter');
              assert.strictEqual(data.city, 'Florida');
              done();
            });
          });
      });
    });

    bdd.itIf(connectorCapabilities.atomicUpsertWithWhere !== true,
      'fails the upsertWithWhere operation when multiple instances are ' +
      'retrieved based on the filter criteria', async function() {
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
          Person.create([
            {id: '2', name: 'Howie', city: 'Florida'},
            {id: '3', name: 'Kevin', city: 'Florida'},
          ], function(err, instance) {
            if (err) return done(err);
            Person.upsertWithWhere({city: 'Florida'}, {
              id: '4', name: 'Brian',
            }, function(err) {
              assert.strictEqual(err.message, 'There are multiple instances found.' +
              'Upsert Operation will not be performed!');
              done();
            });
          });
        });
      });

    bdd.itIf(connectorCapabilities.atomicUpsertWithWhere === true,
      'upsertWithWhere update the first matching instance when multiple instances are ' +
      'retrieved based on the filter criteria', async () => {
        // The first matching instance is determinate from specific connector implementation
        // For example for mongodb connector the sort parameter is used (default to _id asc)
        await Person.create([
          {id: '4', name: 'Howie', city: 'Turin'},
          {id: '3', name: 'Kevin', city: 'Turin'},
        ]);
        await Person.upsertWithWhere({city: 'Turin'}, {name: 'Brian'});

        const updatedInstance = await Person.findById('3');
        assert.ok(updatedInstance != null);
        assert.strictEqual(updatedInstance.name, 'Brian');

        const notUpdatedInstance = await Person.findById('4');
        assert.ok(notUpdatedInstance != null);
        assert.strictEqual(notUpdatedInstance.name, 'Howie');
      });

    it('updates the record when one matching instance is found ' +
        'based on the filter criteria', async function() {
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
        Person.create([
          {id: '5', name: 'Howie', city: 'Kentucky'},
        ], function(err, instance) {
          if (err) return done(err);
          Person.upsertWithWhere({city: 'Kentucky'}, {
            name: 'Brian',
          }, {validate: false}, function(err, instance) {
            if (err) return done(err);
            Person.findById(5, function(err, data) {
              if (err) return done(err);
              assert.strictEqual(data.id, 5);
              assert.strictEqual(data.name, 'Brian');
              assert.strictEqual(data.city, 'Kentucky');
              done();
            });
          });
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

      // And upsertWithWhere an existing record
      const found = await Player.upsertWithWhere({id: created.id}, {name: 'updated'});
      assert.ok([
        undefined, // databases supporting `undefined` value
        null, // databases representing `undefined` as `null` (e.g. SQL)
      ].includes(found.toObject().active));
    });

    it('preserves custom type of auto-generated id property', async () => {
      // NOTE: This test is trying to reproduce the behavior observed
      // when using property defined as follows:
      //  {type: 'string', generated: true, mongodb: {dataType: 'ObjectID'}}
      // We want to test that behavior for all connectors, which is tricky,
      // because not all connectors support autogenerated string PK values.

      const User = db.define('UserWithStringId', {
        id: {
          type: String,
          id: true,
          useDefaultIdType: false,
          // `useDefaultIdType` is applied only when `generated: true`
          generated: true,
        },
        name: String,
      }, {forceId: false});

      // disable `generated: true` because many SQL databases cannot
      // auto-generate string ids
      User.definition.properties.id.generated = false;
      User.definition.rawProperties.id.generated = false;
      await db.automigrate(User.modelName);

      const userId = 'custom user id';

      const createdUser = await User.create({id: userId, name: 'testUser'});
      // strict equality check
      assert.strictEqual(createdUser.id, userId);

      const foundUser = await User.findById(userId);
      // strict equality check
      assert.strictEqual(foundUser.id, userId);
    });
  });

  async function givenSomePeople() {
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
        {name: 'John Lennon', gender: 'male'},
        {name: 'Paul McCartney', gender: 'male'},
        {name: 'George Harrison', gender: 'male'},
        {name: 'Ringo Starr', gender: 'male'},
        {name: 'Pete Best', gender: 'male'},
        {name: 'Stuart Sutcliffe', gender: 'male'},
      ];

      Person.destroyAll(function(err) {
        if (err) return done(err);
        Promise.all(beatles.map(person => Person.create(person))).then(() => done(), done);
      });
    });
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
