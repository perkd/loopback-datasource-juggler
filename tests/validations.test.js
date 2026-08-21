// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test was migrated from mocha assertions
'use strict';

const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false */
require('./init.js');

const j = require('../');
let db, User;
const ValidationError = j.ValidationError;

function getValidAttributes() {
  return {
    name: 'Anatoliy',
    email: 'email@example.com',
    state: '',
    age: 26,
    gender: 'male',
    createdByAdmin: false,
    createdByScript: true,
  };
}

describe('validations', function() {
  let User, Entry, Employee;

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
        email: String,
        name: String,
        password: String,
        state: String,
        age: Number,
        gender: String,
        domain: String,
        pendingPeriod: Number,
        createdByAdmin: Boolean,
        createdByScript: Boolean,
        updatedAt: Date,
      });
      Entry = db.define('Entry', {
        id: {type: 'string', id: true, generated: false},
        name: {type: 'string'},
      });
      Employee = db.define('Employee', {
        id: {type: Number, id: true, generated: false},
        name: {type: String},
        age: {type: Number},
      }, {
        validateUpdate: true,
      });
      Entry.validatesUniquenessOf('id');
      db.automigrate(function(err) {
        assert.ok(err == null);
        Employee.create(empData, done);
      });
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
      User.destroyAll(function() {
        delete User.validations;
        done();
      });
    });
  });

  after(async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Employee.destroyAll(done);
    });
  });

  describe('commons', function() {
    describe('skipping', function() {
      it('should NOT skip when `if` is fulfilled', function() {
        User.validatesPresenceOf('pendingPeriod', {if: 'createdByAdmin'});
        const user = new User;
        user.createdByAdmin = true;
        assert.strictEqual(user.isValid(), false);
        assert.deepStrictEqual(user.errors.pendingPeriod, ['can\'t be blank']);
        user.pendingPeriod = 1;
        assert.strictEqual(user.isValid(), true);
      });

      it('should skip when `if` is NOT fulfilled', function() {
        User.validatesPresenceOf('pendingPeriod', {if: 'createdByAdmin'});
        const user = new User;
        user.createdByAdmin = false;
        assert.strictEqual(user.isValid(), true);
        assert.strictEqual(user.errors, false);
        user.pendingPeriod = 1;
        assert.strictEqual(user.isValid(), true);
      });

      it('should NOT skip when `unless` is fulfilled', function() {
        User.validatesPresenceOf('pendingPeriod', {unless: 'createdByAdmin'});
        const user = new User;
        user.createdByAdmin = false;
        assert.strictEqual(user.isValid(), false);
        assert.deepStrictEqual(user.errors.pendingPeriod, ['can\'t be blank']);
        user.pendingPeriod = 1;
        assert.strictEqual(user.isValid(), true);
      });

      it('should skip when `unless` is NOT fulfilled', function() {
        User.validatesPresenceOf('pendingPeriod', {unless: 'createdByAdmin'});
        const user = new User;
        user.createdByAdmin = true;
        assert.strictEqual(user.isValid(), true);
        assert.strictEqual(user.errors, false);
        user.pendingPeriod = 1;
        assert.strictEqual(user.isValid(), true);
      });
    });

    describe('skipping in async validation', function() {
      it('should skip when `if` is NOT fulfilled', async function() {
        User.validateAsync('pendingPeriod', function(err, next) {
          if (!this.pendingPeriod) err();
          next();
        }, {if: 'createdByAdmin', code: 'presence', message: "can't be blank"});
        const user = new User;
        user.createdByAdmin = false;

        await new Promise((resolve, reject) => {
          user.isValid(function(valid) {
            try {
              assert.strictEqual(valid, true);
              assert.strictEqual(user.errors, false);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });

      it('should NOT skip when `if` is fulfilled', async function() {
        User.validateAsync('pendingPeriod', function(err, next) {
          if (!this.pendingPeriod) err();
          next();
        }, {if: 'createdByAdmin', code: 'presence', message: "can't be blank"});
        const user = new User;
        user.createdByAdmin = true;

        await new Promise((resolve, reject) => {
          user.isValid(function(valid) {
            try {
              assert.strictEqual(valid, false);
              assert.deepStrictEqual(user.errors.pendingPeriod, ["can't be blank"]);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });

      it('should skip when `unless` is NOT fulfilled', async function() {
        User.validateAsync('pendingPeriod', function(err, next) {
          if (!this.pendingPeriod) err();
          next();
        }, {unless: 'createdByAdmin', code: 'presence', message: "can't be blank"});
        const user = new User;
        user.createdByAdmin = true;

        await new Promise((resolve, reject) => {
          user.isValid(function(valid) {
            try {
              assert.strictEqual(valid, true);
              assert.strictEqual(user.errors, false);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });

      it('should NOT skip when `unless` is fulfilled', async function() {
        User.validateAsync('pendingPeriod', function(err, next) {
          if (!this.pendingPeriod) err();
          next();
        }, {unless: 'createdByAdmin', code: 'presence', message: "can't be blank"});
        const user = new User;
        user.createdByAdmin = false;

        await new Promise((resolve, reject) => {
          user.isValid(function(valid) {
            try {
              assert.strictEqual(valid, false);
              assert.deepStrictEqual(user.errors.pendingPeriod, ["can't be blank"]);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });

    describe('lifecycle', function() {
      it('should work on create', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create(function(e, u) {
            assert.ok(e != null);
            User.create({name: 'Valid'}, function(e, d) {
              assert.ok(e == null);
              done();
            });
          });
        });
      });

      it('should work on update', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create({name: 'Valid'}, function(e, d) {
            d.updateAttribute('name', null, function(e) {
              assert.ok(e != null);
              assert.ok(e instanceof Error);
              assert.ok(e instanceof ValidationError);
              d.updateAttribute('name', 'Vasiliy', function(e) {
                assert.ok(e == null);
                done();
              });
            });
          });
        });
      });

      it('should ignore errors on upsert by default', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          // It's important to pass an existing id value to updateOrCreate,
          // otherwise DAO falls back to regular create()
          User.create({name: 'a-name'}, (err, u) => {
            if (err) return done(err);
            User.updateOrCreate({id: u.id}, done);
          });
        });
      });

      it('should be skipped by upsert when disabled via settings', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const Customer = User.extend('Customer');
          Customer.attachTo(db);
          db.autoupdate(function(err) {
            if (err) return done(err);
            // It's important to pass an existing id value,
            // otherwise DAO falls back to regular create()
            Customer.create({name: 'a-name'}, (err, u) => {
              if (err) return done(err);

              Customer.prototype.isValid = function() {
                throw new Error('isValid() should not be called at all');
              };
              Customer.settings.validateUpsert = false;

              Customer.updateOrCreate({id: u.id, name: ''}, done);
            });
          });
        });
      });

      it('should work on upsert when enabled via settings', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.validatesPresenceOf('name');
          User.settings.validateUpsert = true;
          // It's important to pass an existing id value,
          // otherwise DAO falls back to regular create()
          User.create({name: 'a-name'}, (err, u) => {
            if (err) return done(err);
            User.upsert({id: u.id, name: ''}, function(err, u) {
              if (!err) return done(new Error('Validation should have failed.'));
              assert.ok(err instanceof ValidationError);
              done();
            });
          });
        });
      });

      it('should return error code', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create(function(e, u) {
            assert.ok(e != null);
            assert.deepStrictEqual(e.details.codes.name, ['presence']);
            done();
          });
        });
      });

      it('should allow to modify error after validation', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.afterValidate = function(next) {
            next();
          };
          done();
        });
      });

      it('should include validation messages in err.message', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create(function(e, u) {
            assert.ok(e != null);
            assert.match(e.message, /`name` can't be blank/);
            done();
          });
        });
      });

      it('should include property value in err.message', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create(function(e, u) {
            assert.ok(e != null);
            assert.match(e.message, /`name` can't be blank \(value: undefined\)/);
            done();
          });
        });
      });

      it('should include model name in err.message', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          delete User.validations;
          User.validatesPresenceOf('name');
          User.create(function(e, u) {
            assert.ok(e != null);
            assert.match(e.message, /`User` instance/i);
            done();
          });
        });
      });

      it('should return validation metadata', function() {
        const expected = {name: [{validation: 'presence', options: {}}]};
        delete User.validations;
        User.validatesPresenceOf('name');
        const validations = User.validations;
        assert.deepStrictEqual(validations, expected);
      });
    });
  });

  describe('validation with or without options', function() {
    it('should work on update with options', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validatesPresenceOf('name');
        User.create({name: 'Valid'}, function(e, d) {
          d.updateAttribute('name', null, {options: 'options'}, function(e) {
            try {
              assert.ok(e != null);
              assert.ok(e instanceof Error);
              assert.ok(e instanceof ValidationError);
            } catch (error) {
              return reject(error);
            }

            d.updateAttribute('name', 'Vasiliy', {options: 'options'}, err => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });

    it('passes options to custom sync validator', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validate('name', function(err, options) {
          if (options.testFlag !== 'someValue') err();
        });
        User.create({name: 'Valid'}, {testFlag: 'someValue'}, function(e, d) {
          d.updateAttribute('name', null, {testFlag: 'otherValue'}, function(e) {
            try {
              assert.ok(e != null);
              assert.ok(e instanceof ValidationError);
            } catch (error) {
              return reject(error);
            }

            d.updateAttribute('name', 'Vasiliy', {testFlag: 'someValue'}, err => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });

    it('passes options to async validator', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validateAsync('name', function(err, options, next) {
          if (options.testFlag !== 'someValue') {
            console.error(
              'Unexpected validation options: %j Expected %j',
              options, {testFlag: 'someValue'},
            );
            err();
          }
          process.nextTick(function() { next(); });
        });
        User.create({name: 'Valid'}, {testFlag: 'someValue'}, function(e, d) {
          if (e) return reject(e);
          d.updateAttribute('name', null, {testFlag: 'otherValue'}, function(e) {
            try {
              assert.ok(e != null);
              assert.ok(e instanceof ValidationError);
            } catch (error) {
              return reject(error);
            }

            d.updateAttribute('name', 'Vasiliy', {testFlag: 'someValue'}, err => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });

    it('should work on update without options', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validatesPresenceOf('name');
        User.create({name: 'Valid'}, function(e, d) {
          d.updateAttribute('name', null, function(e) {
            try {
              assert.ok(e != null);
              assert.ok(e instanceof Error);
              assert.ok(e instanceof ValidationError);
            } catch (error) {
              return reject(error);
            }

            d.updateAttribute('name', 'Vasiliy', function(e) {
              try {
                assert.ok(e == null);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('should work on create with options', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validatesPresenceOf('name');
        User.create(function(e) {
          try {
            assert.ok(e != null);
          } catch (error) {
            return reject(error);
          }

          User.create({name: 'Valid'}, {options: 'options'}, function(e) {
            try {
              assert.ok(e == null);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });

    it('should work on create without options', async function() {
      await new Promise((resolve, reject) => {
        delete User.validations;
        User.validatesPresenceOf('name');
        User.create(function(e) {
          try {
            assert.ok(e != null);
          } catch (error) {
            return reject(error);
          }

          User.create({name: 'Valid'}, function(e) {
            try {
              assert.ok(e == null);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });
  });

  describe('presence', function() {
    it('should validate presence', function() {
      User.validatesPresenceOf('name', 'email');

      const validations = User.validations;
      assert.deepStrictEqual(validations.name, [{validation: 'presence', options: {}}]);
      assert.deepStrictEqual(validations.email, [{validation: 'presence', options: {}}]);

      const u = new User;
      assert.notStrictEqual(u.isValid(), true);
      u.name = 1;
      assert.notStrictEqual(u.isValid(), true);
      u.email = 2;
      assert.strictEqual(u.isValid(), true);
    });

    it('should reject NaN value as a number', function() {
      User.validatesPresenceOf('age');
      const u = new User();
      assert.strictEqual(u.isValid(), false);
      u.age = NaN;
      assert.strictEqual(u.isValid(), false);
      u.age = 1;
      assert.strictEqual(u.isValid(), true);
    });

    it('should allow "NaN" value as a string', function() {
      User.validatesPresenceOf('name');
      const u = new User();
      assert.strictEqual(u.isValid(), false);
      u.name = 'NaN';
      assert.strictEqual(u.isValid(), true);
    });

    it('should skip validation by property (if/unless)', function() {
      User.validatesPresenceOf('domain', {unless: 'createdByScript'});

      const user = new User(getValidAttributes());
      assert.strictEqual(user.isValid(), true);

      user.createdByScript = false;
      assert.strictEqual(user.isValid(), false);
      assert.deepStrictEqual(user.errors.domain, ['can\'t be blank']);

      user.domain = 'domain';
      assert.strictEqual(user.isValid(), true);
    });

    describe('validate presence on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesPresenceOf('name', 'age');
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: 'Foo-new'},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.age[0], 'can\'t be blank');
              done();
            });
        });
      });
    });
  });

  describe('absence', function() {
    it('should validate absence', function() {
      User.validatesAbsenceOf('reserved', {if: 'locked'});
      let u = new User({reserved: 'foo', locked: true});
      assert.notStrictEqual(u.isValid(), true);
      u.reserved = null;
      assert.strictEqual(u.isValid(), true);
      u = new User({reserved: 'foo', locked: false});
      assert.strictEqual(u.isValid(), true);
    });

    describe('validate absence on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesAbsenceOf('name');
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                data.name = 'Foo';
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: 'Foo-new', age: 5},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'can\'t be set');
              done();
            });
        });
      });
    });
  });

  describe('uniqueness', function() {
    it('should validate uniqueness', async function() {
      User.validatesUniquenessOf('email');
      const u = new User({email: 'hey'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function() {
          const u2 = new User({email: 'hey'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, false);
          });
        });
      })), false);

      await new Promise(resolve => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function() {
            const u2 = new User({email: 'hey'});
            u2.isValid(function(valid) {
              assert.strictEqual(valid, false);
              resolve();
            });
          });
        });
      });
    });

    it('should handle same object modification', async function() {
      User.validatesUniquenessOf('email');
      const u = new User({email: 'hey'});

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function() {
            u.name = 'Goghi';
            u.isValid(function(valid) {
              assert.strictEqual(valid, true);
              u.save(function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });
    });

    it('should support multi-key constraint', async function() {
      const EMAIL = 'user@xample.com';
      const SiteUser = db.define('SiteUser', {
        siteId: String,
        email: String,
      });
      SiteUser.validatesUniquenessOf('email', {scopedTo: ['siteId']});

      await new Promise((resolve, reject) => {
        db.automigrate(function(err) {
          if (err) return reject(err);
          SiteUser.create({siteId: 1, email: EMAIL}, function(err) {
            if (err) return reject(err);
            SiteUser.create({siteId: 2, email: EMAIL}, function(err) {
              if (err) return reject(err);
              const user3 = new SiteUser({siteId: 1, email: EMAIL});
              user3.isValid(function(valid) {
                try {
                  assert.strictEqual(valid, false);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
            });
          });
        });
      });
    });

    it('should skip blank values', async function() {
      User.validatesUniquenessOf('email');
      const u = new User({email: '  '});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function() {
          const u2 = new User({email: null});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, true);
          });
        });
      })), false);

      await new Promise(resolve => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function() {
            const u2 = new User({email: null});
            u2.isValid(function(valid) {
              assert.strictEqual(valid, true);
              resolve();
            });
          });
        });
      });
    });

    it('should work with if/unless', async function() {
      User.validatesUniquenessOf('email', {
        if: function() { return true; },
        unless: function() { return false; },
      });
      const u = new User({email: 'hello'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
      })), false);

      await new Promise(resolve => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          resolve();
        });
      });
    });

    it('should work with id property on create', async function() {
      await new Promise((resolve, reject) => {
        Entry.create({id: 'entry'}, function(err) {
          if (err) return reject(err);
          const e = new Entry({id: 'entry'});
          assert.strictEqual(Boolean(e.isValid(function(valid) {
            assert.strictEqual(valid, false);
          })), false);
          e.isValid(function(valid) {
            try {
              assert.strictEqual(valid, false);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });

    it('should work with id property after create', async function() {
      await new Promise((resolve, reject) => {
        Entry.findById('entry', function(err, e) {
          if (err) return reject(err);
          assert.strictEqual(Boolean(e.isValid(function(valid) {
            assert.strictEqual(valid, true);
          })), false);
          e.isValid(function(valid) {
            try {
              assert.strictEqual(valid, true);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });

    it('passes case insensitive validation', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: true});
      const u = new User({email: 'hey'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'HEY'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, false);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'HEY'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, false);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('passed case sensitive validation', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: false});
      const u = new User({email: 'hey'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'HEY'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, true);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'HEY'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, true);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('passes case insensitive validation with string that needs escaping', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: true});
      const u = new User({email: 'me+me@my.com'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'ME+ME@MY.COM'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, false);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'ME+ME@MY.COM'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, false);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('passed case sensitive validation with string that needs escaping', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: false});
      const u = new User({email: 'me+me@my.com'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'ME+ME@MY.COM'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, true);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'ME+ME@MY.COM'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, true);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('passes partial case insensitive validation with string that needs escaping', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: true});
      const u = new User({email: 'also+me@my.com'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'Me@My.com'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, true);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'Me@My.com'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, true);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    it('passes partial case sensitive validation with string that needs escaping', async function() {
      User.validatesUniquenessOf('email', {ignoreCase: false});
      const u = new User({email: 'also+me@my.com'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
        u.save(function(err) {
          assert.ok(err == null);
          const u2 = new User({email: 'Me@My.com'});
          u2.isValid(function(valid) {
            assert.strictEqual(valid, true);
          });
        });
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          assert.strictEqual(valid, true);
          u.save(function(err) {
            if (err) return reject(err);
            const u2 = new User({email: 'Me@My.com'});
            u2.isValid(function(valid) {
              try {
                assert.strictEqual(valid, true);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });
    });

    describe('validate uniqueness on update', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Employee.destroyAll(function(err) {
            if (err) return reject(err);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              if (err) return reject(err);
              Employee.create(empData, function(err, inst) {
                if (err) return reject(err);
                try {
                  assert.ok(inst != null);
                } catch (error) {
                  return reject(error);
                }
                Employee.validatesUniquenessOf('name');
                resolve();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data, function(err, emp) {
            if (err) return reject(err);
            try {
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
            } catch (error) {
              return reject(error);
            }
            Employee.find({where: {id: 1}}, function(err, emp) {
              if (err) return reject(err);
              try {
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          Employee.updateAll({where: {id: 1}}, {name: 'Bar', age: 5}, function(err, emp) {
            try {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'is not unique');
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });
  });

  describe('format', function() {
    it('should validate the format of valid strings', function() {
      User.validatesFormatOf('name', {with: /[a-z][A-Z]*$/});
      const u = new User({name: 'valid name'});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate the format of invalid strings', function() {
      User.validatesFormatOf('name', {with: /[a-z][A-Z]*$/});
      const u = new User({name: 'invalid name!'});
      assert.strictEqual(u.isValid(), false);
    });

    it('should validate the format of valid numbers', function() {
      User.validatesFormatOf('age', {with: /^\d+$/});
      const u = new User({age: 30});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate the format of invalid numbers', function() {
      User.validatesFormatOf('age', {with: /^\d+$/});
      const u = new User({age: 'thirty'});
      assert.strictEqual(u.isValid(), false);
    });

    it('should overwrite default blank message with custom format message', function() {
      const CUSTOM_MESSAGE = 'custom validation message';
      User.validatesFormatOf('name', {with: /[a-z][A-Z]*$/, message: CUSTOM_MESSAGE});
      const u = new User({name: 'invalid name string 123'});
      assert.strictEqual(u.isValid(), false);
      assert.deepStrictEqual(u.errors.name, [CUSTOM_MESSAGE]);
      assert.deepStrictEqual(u.errors.codes.name, ['format']);
    });

    it('should skip missing values when allowing blank', function() {
      User.validatesFormatOf('email', {with: /^\S+@\S+\.\S+$/, allowBlank: true});
      const u = new User({});
      assert.strictEqual(u.isValid(), true);
    });

    it('should skip null values when allowing null', function() {
      User.validatesFormatOf('email', {with: /^\S+@\S+\.\S+$/, allowNull: true});
      const u = new User({email: null});
      assert.strictEqual(u.isValid(), true);
    });

    it('should not skip missing values', function() {
      User.validatesFormatOf('email', {with: /^\S+@\S+\.\S+$/});
      const u = new User({});
      assert.strictEqual(u.isValid(), false);
    });

    it('should not skip null values', function() {
      User.validatesFormatOf('email', {with: /^\S+@\S+\.\S+$/});
      const u = new User({email: null});
      assert.strictEqual(u.isValid(), false);
    });

    describe('validate format correctly on bulk creation with global flag enabled in RegExp', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesFormatOf('name', {with: /^[a-z]+$/g, allowNull: false});
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met for all items', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.create([
            {name: 'test'},
            {name: 'test'},
            {name: 'test'},
            {name: 'test'},
            {name: 'test'},
            {name: 'test'},
          ], (err, instances) => {
            assert.ok(err == null);
            assert.ok(instances != null);
            assert.strictEqual(instances.length, 6);
            done();
          });
        });
      });
    });

    describe('validate format on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesFormatOf('name', {with: /^\w+\s\w+$/, allowNull: false});
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo Mo', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: '45foo', age: 5},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'is invalid');
              done();
            });
        });
      });
    });
  });

  describe('numericality', function() {
    it('passes when given numeric values', function() {
      User.validatesNumericalityOf('age');
      const user = new User({age: 10});
      assert.strictEqual(user.isValid(), true);
    });

    it('fails when given non-numeric values', function() {
      User.validatesNumericalityOf('age');
      const user = new User({age: 'notanumber'});
      assert.strictEqual(user.isValid(), false);
      assert.deepStrictEqual(user.errors.age, ['is not a number']);
    });

    it('fails when given undefined values', function() {
      User.validatesNumericalityOf('age');
      const user = new User({});
      assert.strictEqual(user.isValid(), false);
      assert.deepStrictEqual(user.errors.age, ['is blank']);
    });

    it('skips undefined values when allowBlank option is true', function() {
      User.validatesNumericalityOf('age', {allowBlank: true});
      const user = new User({});
      assert.strictEqual(user.isValid(), true);
    });

    it('fails when given non-numeric values when allowBlank option is true', function() {
      User.validatesNumericalityOf('age', {allowBlank: true});
      const user = new User({age: 'test'});
      assert.strictEqual(user.isValid(), false);
      assert.deepStrictEqual(user.errors.age, ['is not a number']);
    });

    it('fails when given null values', function() {
      User.validatesNumericalityOf('age');
      const user = new User({age: null});
      assert.strictEqual(user.isValid(), false);
      assert.deepStrictEqual(user.errors.age, ['is null']);
    });

    it('passes when given null values when allowNull option is true', function() {
      User.validatesNumericalityOf('age', {allowNull: true});
      const user = new User({age: null});
      assert.strictEqual(user.isValid(), true);
    });

    it('passes when given float values', function() {
      User.validatesNumericalityOf('age');
      const user = new User({age: 13.37});
      assert.strictEqual(user.isValid(), true);
    });

    it('fails when given non-integer values when int option is true', function() {
      User.validatesNumericalityOf('age', {int: true});
      const user = new User({age: 13.37});
      assert.strictEqual(user.isValid(), false);
      assert.match(user.errors.age[0], /is not an integer/);
    });

    describe('validate numericality on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesNumericalityOf('age');
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {age: {someAge: 5}},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.age[0], 'is not a number');
              done();
            });
        });
      });
    });
  });

  describe('inclusion', function() {
    it('fails when included value is not used for property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('name', {in: ['bob', 'john']});
        User.create({name: 'bobby'}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /is not included in the list/);
          done();
        });
      });
    });

    it('passes when included value is used for property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('name', {in: ['bob', 'john']});
        User.create({name: 'bob'}, function(err, user) {
          if (err) return done(err);
          assert.deepStrictEqual(user.name, 'bob');
          done();
        });
      });
    });

    it('fails with a custom error message', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('name', {in: ['bob', 'john'], message: 'not used'});
        User.create({name: 'dude'}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /not used/);
          done();
        });
      });
    });

    it('fails with a null value when allowNull is false', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('name', {in: ['bob'], allowNull: false});
        User.create({name: null}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /is null/);
          done();
        });
      });
    });

    it('passes with a null value when allowNull is true', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('name', {in: ['bob'], allowNull: true});
        User.create({name: null}, done);
      });
    });

    it('fails if value is used for integer property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('age', {in: [123, 456]});
        User.create({age: 789}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.age[0], /is not included in the list/);
          done();
        });
      });
    });

    it('passes with an empty value when allowBlank option is true', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('gender', {in: ['male', 'female'], allowBlank: true});
        User.create({gender: ''}, done);
      });
    });

    it('fails with an empty value when allowBlank option is false', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesInclusionOf('gender', {in: ['male', 'female'], allowBlank: false});
        User.create({gender: ''}, function(err) {
          assert.ok(err instanceof ValidationError);
          assert.strictEqual(getErrorDetails(err), '`gender` is blank (value: "").');
          done();
        });
      });
    });

    function getErrorDetails(err) {
      return err.message.replace(/^.*Details: /, '');
    }

    describe('validate inclusion on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesInclusionOf('name', {in: ['Foo-new']});
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: 'Foo-new2', age: 5},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'is not included in ' +
            'the list');
              done();
            });
        });
      });
    });
  });

  describe('exclusion', function() {
    it('fails when excluded value is used for property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('name', {in: ['bob']});
        User.create({name: 'bob'}, function(err, user) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /is reserved/);
          done();
        });
      });
    });

    it('passes when excluded value not found for property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('name', {in: ['dude']});
        User.create({name: 'bob'}, function(err, user) {
          if (err) return done(err);
          assert.deepStrictEqual(user.name, 'bob');
          done();
        });
      });
    });

    it('fails with a custom error message', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('name', {in: ['bob'], message: 'cannot use this'});
        User.create({name: 'bob'}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /cannot use this/);
          done();
        });
      });
    });

    it('fails with a null value when allowNull is false', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('name', {in: ['bob'], allowNull: false});
        User.create({name: null}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.name[0], /is null/);
          done();
        });
      });
    });

    it('passes with a null value when allowNull is true', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('name', {in: ['bob'], allowNull: true});
        User.create({name: null}, done);
      });
    });

    it('fails if value is used for integer property', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        User.validatesExclusionOf('age', {in: [123, 456]});
        User.create({age: 123}, function(err) {
          assert.ok(err instanceof Error);
          assert.match(err.details.messages.age[0], /is reserved/);
          done();
        });
      });
    });

    describe('validate exclusion on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesExclusionOf('name', {in: ['Bob']});
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: 'Bob', age: 5},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'is reserved');
              done();
            });
        });
      });
    });
  });

  describe('length', function() {
    it('should validate length');

    describe('validate length on update', function() {
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
          Employee.destroyAll(function(err) {
            assert.ok(err == null);
            delete Employee.validations;
            db.automigrate('Employee', function(err) {
              assert.ok(err == null);
              Employee.create(empData, function(err, inst) {
                assert.ok(err == null);
                assert.ok(inst != null);
                Employee.validatesLengthOf('name', {min: 5});
                done();
              });
            });
          });
        });
      });

      it('succeeds when validate condition is met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const data = {name: 'Foo-new', age: 5};
          Employee.updateAll({id: 1}, data,
            function(err, emp) {
              assert.ok(err == null);
              assert.ok(emp != null);
              assert.strictEqual(emp.count, 1);
              Employee.find({where: {id: 1}}, function(err, emp) {
                assert.ok(err == null);
                assert.ok(emp != null);
                data.id = 1;
                assert.deepStrictEqual(data, emp[0].toObject());
                done();
              });
            });
        });
      });

      it('throws err when validate condition is not met', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Employee.updateAll({where: {id: 1}}, {name: 'Bob', age: 5},
            function(err, emp) {
              assert.ok(err != null);
              assert.ok(emp == null);
              assert.strictEqual(err.statusCode, 422);
              assert.strictEqual(err.details.messages.name[0], 'too short');
              done();
            });
        });
      });
    });
  });

  describe('custom', function() {
    it('should validate using custom sync validation', function() {
      User.validate('email', function(err) {
        if (this.email === 'hello') err();
      }, {code: 'invalid-email'});
      const u = new User({email: 'hello'});
      assert.strictEqual(Boolean(u.isValid()), false);
      assert.deepStrictEqual(u.errors.codes, {email: ['invalid-email']});
    });

    it('should validate and return detailed error messages', function() {
      User.validate('global', function(err) {
        if (this.email === 'hello' || this.email === 'hey') {
          this.errors.add('email', 'Cannot be `' + this.email + '`', 'invalid-email');
          err(false); // false: prevent global error message
        }
      });
      const u = new User({email: 'hello'});
      assert.strictEqual(Boolean(u.isValid()), false);
      assert.deepStrictEqual(u.errors.email, ['Cannot be `hello`']);
      assert.deepStrictEqual(u.errors.codes, {email: ['invalid-email']});
    });

    it('should validate using custom async validation', async function() {
      User.validateAsync('email', function(err, next) {
        process.nextTick(next);
      }, {
        if: function() { return true; },
        unless: function() { return false; },
      });
      const u = new User({email: 'hello'});
      assert.strictEqual(Boolean(u.isValid(function(valid) {
        assert.strictEqual(valid, true);
      })), false);

      await new Promise((resolve, reject) => {
        u.isValid(function(valid) {
          try {
            assert.strictEqual(valid, true);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  describe('invalid value formatting', function() {
    let origMaxLen;
    beforeEach(function saveAndSetMaxLen() {
      origMaxLen = ValidationError.maxPropertyStringLength;
    });

    afterEach(function restoreMaxLen() {
      ValidationError.maxPropertyStringLength = origMaxLen;
    });

    it('should truncate long strings', function() {
      ValidationError.maxPropertyStringLength = 9;
      const err = givenValidationError('prop', '1234567890abc', 'is invalid');
      assert.strictEqual(getErrorDetails(err), '`prop` is invalid (value: "12...abc").');
    });

    it('should truncate long objects', function() {
      ValidationError.maxPropertyStringLength = 12;
      const err = givenValidationError('prop', {foo: 'bar'}, 'is invalid');
      assert.strictEqual(getErrorDetails(err), '`prop` is invalid (value: { foo:... }).');
    });

    it('should truncate long arrays', function() {
      ValidationError.maxPropertyStringLength = 12;
      const err = givenValidationError('prop', [{a: 1, b: 2}], 'is invalid');
      assert.strictEqual(getErrorDetails(err), '`prop` is invalid (value: [ { a...} ]).');
    });

    it('should print only top-level object properties', function() {
      const err = givenValidationError('prop', {a: {b: 'c'}}, 'is invalid');
      assert.strictEqual(getErrorDetails(err), '`prop` is invalid (value: { a: [Object] }).');
    });

    it('should print only top-level props of objects in array', function() {
      const err = givenValidationError('prop', [{a: {b: 'c'}}], 'is invalid');
      assert.strictEqual(getErrorDetails(err), '`prop` is invalid (value: [ { a: [Object] } ]).');
    });

    it('should exclude colors from Model values', function() {
      const obj = new User();
      obj.email = 'test@example.com';
      const err = givenValidationError('user', obj, 'is invalid');
      assert.strictEqual(getErrorDetails(err),
        '`user` is invalid (value: { email: \'test@example.com\' }).');
    });

    function givenValidationError(propertyName, propertyValue, errorMessage) {
      const jsonVal = {};
      jsonVal[propertyName] = propertyValue;
      const errorVal = {};
      errorVal[propertyName] = [errorMessage];

      const obj = {
        errors: errorVal,
        toJSON: function() { return jsonVal; },
      };
      return new ValidationError(obj);
    }

    function getErrorDetails(err) {
      return err.message.replace(/^.*Details: /, '');
    }
  });

  describe('date', function() {
    it('should validate a date object', function() {
      User.validatesDateOf('updatedAt');
      const u = new User({updatedAt: new Date()});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate a date string', function() {
      User.validatesDateOf('updatedAt');
      const u = new User({updatedAt: '2000-01-01'});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate a null date', function() {
      User.validatesDateOf('updatedAt');
      const u = new User({updatedAt: null});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate an undefined date', function() {
      User.validatesDateOf('updatedAt');
      const u = new User({updatedAt: undefined});
      assert.strictEqual(u.isValid(), true);
    });

    it('should validate an invalid date string', function() {
      User.validatesDateOf('updatedAt');
      const u = new User({updatedAt: 'invalid date string'});
      assert.notStrictEqual(u.isValid(), true);
      assert.deepStrictEqual(u.errors.updatedAt, ['is not a valid date']);
      assert.deepStrictEqual(u.errors.codes.updatedAt, ['date']);
    });

    it('should attach validation by default to all date properties', function() {
      const AnotherUser = db.define('User', {
        email: String,
        name: String,
        password: String,
        state: String,
        age: Number,
        gender: String,
        domain: String,
        pendingPeriod: Number,
        createdByAdmin: Boolean,
        createdByScript: Boolean,
        updatedAt: Date,
      });
      const u = new AnotherUser({updatedAt: 'invalid date string'});
      assert.notStrictEqual(u.isValid(), true);
      assert.deepStrictEqual(u.errors.updatedAt, ['is not a valid date']);
      assert.deepStrictEqual(u.errors.codes.updatedAt, ['date']);
    });

    it('should overwrite default blank message with custom format message', function() {
      const CUSTOM_MESSAGE = 'custom validation message';
      User.validatesDateOf('updatedAt', {message: CUSTOM_MESSAGE});
      const u = new User({updatedAt: 'invalid date string'});
      assert.notStrictEqual(u.isValid(), true);
      assert.deepStrictEqual(u.errors.updatedAt, [CUSTOM_MESSAGE]);
      assert.deepStrictEqual(u.errors.codes.updatedAt, ['date']);
    });
  });
});

const empData = [{
  id: 1,
  name: 'Foo',
  age: 1,
}, {
  id: 2,
  name: 'Bar',
  age: 2,
}, {
  id: 3,
  name: 'Baz',
  age: 3,
}];

