// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

/* global getSchema:false */
const assert = require('node:assert/strict');
const {afterEach, before, beforeEach, describe, it} = require('node:test');

require('./init.js');

let db;
let User;

describe('hooks', function() {
  before(async function() {
    db = getSchema();

    User = db.define('User', {
      email: {type: String, index: true},
      name: String,
      password: String,
      state: String,
    });

    await db.automigrate('User');
  });

  describe('initialize', function() {
    afterEach(function() {
      User.afterInitialize = null;
    });

    it('should be triggered on new', async function() {
      await new Promise((resolve) => {
        User.afterInitialize = function() {
          resolve();
        };
        new User();
      });
    });

    it('should be triggered on create', async function() {
      User.afterInitialize = function() {
        if (this.name === 'Nickolay') {
          this.name += ' Rozental';
        }
      };

      const user = await User.create({name: 'Nickolay'});
      assert.ok(user.id);
      assert.strictEqual(user.name, 'Nickolay Rozental');
    });
  });

  describe('create', function() {
    afterEach(removeHooks('Create'));

    it('should be triggered on create', async function() {
      const hookPromise = addHooks('Create');
      await User.create();
      await hookPromise;
    });

    it('should not be triggered on new', function() {
      User.beforeCreate = function(next) {
        assert.fail('This should not be called');
        next();
      };
      new User();
    });

    it('should be triggered on new+save', async function() {
      const hookPromise = addHooks('Create');
      await (new User()).save();
      await hookPromise;
    });

    it('afterCreate should not be triggered on failed create', async function() {
      const old = User.dataSource.connector.create;
      User.dataSource.connector.create = function(modelName, id, cb) {
        cb(new Error('error'));
      };

      User.afterCreate = function() {
        throw new Error('shouldn\'t be called');
      };

      await new Promise((resolve) => {
        User.create(function() {
          User.dataSource.connector.create = old;
          resolve();
        });
      });
    });

    it('afterCreate should not be triggered on failed beforeCreate', async function() {
      User.beforeCreate = function(next) {
        next(new Error('fail in beforeCreate'));
      };

      const old = User.dataSource.connector.create;
      User.dataSource.connector.create = function() {
        throw new Error('shouldn\'t be called');
      };

      User.afterCreate = function() {
        throw new Error('shouldn\'t be called');
      };

      await new Promise((resolve) => {
        User.create(function() {
          User.dataSource.connector.create = old;
          resolve();
        });
      });
    });
  });

  describe('save', function() {
    afterEach(removeHooks('Save'));

    it('should be triggered on create', async function() {
      const hookPromise = addHooks('Save');
      await User.create();
      await hookPromise;
    });

    it('should be triggered on new+save', async function() {
      const hookPromise = addHooks('Save');
      await (new User()).save();
      await hookPromise;
    });

    it('should be triggered on updateAttributes', async function() {
      const user = await User.create();
      const hookPromise = addHooks('Save');
      await user.updateAttributes({name: 'Anatoliy'});
      await hookPromise;
    });

    it('should be triggered on save', async function() {
      const user = await User.create();
      const hookPromise = addHooks('Save');
      user.name = 'Hamburger';
      await user.save();
      await hookPromise;
    });

    it('should save full object', async function() {
      const user = await User.create();
      const hookPromise = new Promise((resolve, reject) => {
        User.beforeSave = function(next, data) {
          try {
            assert.deepStrictEqual(
              Object.keys(data).sort(),
              ['email', 'id', 'name', 'password', 'state'],
            );
            resolve();
            next();
          } catch (err) {
            reject(err);
            next(err);
          }
        };
      });

      await user.save();
      await hookPromise;
    });

    it('should save actual modifications to database', async function() {
      User.beforeSave = function(next, data) {
        data.password = 'hash';
        next();
      };

      await User.destroyAll();
      await User.create({
        email: 'james.bond@example.com',
        password: '53cr3t',
      });

      const jb = await User.findOne({
        where: {email: 'james.bond@example.com'},
      });
      assert.strictEqual(jb.password, 'hash');
    });

    it('should save actual modifications on updateAttributes', async function() {
      User.beforeSave = function(next, data) {
        data.password = 'hash';
        next();
      };

      await User.destroyAll();
      const user = await User.create({
        email: 'james.bond@example.com',
      });

      const updated = await user.updateAttribute('password', 'new password');
      assert.ok(updated);
      assert.strictEqual(updated.password, 'hash');

      const jb = await User.findOne({
        where: {email: 'james.bond@example.com'},
      });
      assert.strictEqual(jb.password, 'hash');
    });

    it('beforeSave should be able to skip next', async function() {
      const user = await User.create();
      User.beforeSave = function(next) {
        next(null, 'XYZ');
      };

      const result = await new Promise((resolve, reject) => {
        user.save(function(err, saveResult) {
          if (err) return reject(err);
          resolve(saveResult);
        });
      });

      assert.deepStrictEqual(result, 'XYZ');
    });
  });

  describe('update', function() {
    afterEach(removeHooks('Update'));

    it('should not be triggered on create', function() {
      User.beforeUpdate = function(next) {
        assert.fail('This should not be called');
        next();
      };
      User.create();
    });

    it('should not be triggered on new+save', function() {
      User.beforeUpdate = function(next) {
        assert.fail('This should not be called');
        next();
      };
      (new User()).save();
    });

    it('should be triggered on updateAttributes', async function() {
      const user = await User.create();
      const hookPromise = addHooks('Update');
      await user.updateAttributes({name: 'Anatoliy'});
      await hookPromise;
    });

    it('should be triggered on save', async function() {
      const user = await User.create();
      const hookPromise = addHooks('Update');
      user.name = 'Hamburger';
      await user.save();
      await hookPromise;
    });

    it('should update limited set of fields', async function() {
      const user = await User.create();
      const hookPromise = new Promise((resolve, reject) => {
        User.beforeUpdate = function(next, data) {
          try {
            assert.deepStrictEqual(Object.keys(data).sort(), ['email', 'name']);
            resolve();
            next();
          } catch (err) {
            reject(err);
            next(err);
          }
        };
      });

      await user.updateAttributes({name: 1, email: 2});
      await hookPromise;
    });

    it('should not trigger after-hook on failed save', async function() {
      User.afterUpdate = function() {
        assert.fail('afterUpdate shouldn\'t be called');
      };

      const user = await User.create();
      const save = User.dataSource.connector.save;
      User.dataSource.connector.save = function(modelName, id, cb) {
        User.dataSource.connector.save = save;
        cb(new Error('Error'));
      };

      await new Promise((resolve) => {
        user.save(function() {
          resolve();
        });
      });
    });
  });

  describe('destroy', function() {
    afterEach(removeHooks('Destroy'));

    it('should be triggered on destroy', async function() {
      let hook = 'not called';
      User.beforeDestroy = function(next) {
        hook = 'called';
        next();
      };
      User.afterDestroy = function(next) {
        assert.strictEqual(hook, 'called');
        next();
      };

      const user = await User.create();
      await user.destroy();
    });

    it('should not trigger after-hook on failed destroy', async function() {
      const destroy = User.dataSource.connector.destroy;
      User.dataSource.connector.destroy = function(modelName, id, cb) {
        cb(new Error('error'));
      };
      User.afterDestroy = function() {
        assert.fail('afterDestroy shouldn\'t be called');
      };

      const user = await User.create();
      await new Promise((resolve) => {
        user.destroy(function() {
          User.dataSource.connector.destroy = destroy;
          resolve();
        });
      });
    });
  });

  describe('lifecycle', function() {
    let life = [];
    let user;

    before(async function() {
      User.beforeSave = function(next) {
        life.push('beforeSave');
        next();
      };
      User.beforeCreate = function(next) {
        life.push('beforeCreate');
        next();
      };
      User.beforeUpdate = function(next) {
        life.push('beforeUpdate');
        next();
      };
      User.beforeDestroy = function(next) {
        life.push('beforeDestroy');
        next();
      };
      User.beforeValidate = function(next) {
        life.push('beforeValidate');
        next();
      };
      User.afterInitialize = function() {
        life.push('afterInitialize');
      };
      User.afterSave = function(next) {
        life.push('afterSave');
        next();
      };
      User.afterCreate = function(next) {
        life.push('afterCreate');
        next();
      };
      User.afterUpdate = function(next) {
        life.push('afterUpdate');
        next();
      };
      User.afterDestroy = function(next) {
        life.push('afterDestroy');
        next();
      };
      User.afterValidate = function(next) {
        life.push('afterValidate');
        next();
      };

      user = await User.create();
      life = [];
    });

    beforeEach(function() {
      life = [];
    });

    it('should describe create sequence', async function() {
      await User.create();
      assert.deepStrictEqual(life, [
        'afterInitialize',
        'beforeValidate',
        'afterValidate',
        'beforeCreate',
        'beforeSave',
        'afterSave',
        'afterCreate',
      ]);
    });

    it('should describe new+save sequence', async function() {
      const instance = new User();
      await instance.save();
      assert.deepStrictEqual(life, [
        'afterInitialize',
        'beforeValidate',
        'afterValidate',
        'beforeCreate',
        'beforeSave',
        'afterSave',
        'afterCreate',
      ]);
    });

    it('should describe updateAttributes sequence', async function() {
      await user.updateAttributes({name: 'Antony'});
      assert.deepStrictEqual(life, [
        'beforeValidate',
        'afterValidate',
        'beforeSave',
        'beforeUpdate',
        'afterUpdate',
        'afterSave',
      ]);
    });

    it('should describe isValid sequence', async function() {
      assert.strictEqual(user.constructor._validations, undefined);

      const valid = await new Promise((resolve) => {
        user.isValid(function(isValid) {
          resolve(isValid);
        });
      });

      assert.strictEqual(valid, true);
      assert.deepStrictEqual(life, [
        'beforeValidate',
        'afterValidate',
      ]);
    });

    it('should describe destroy sequence', async function() {
      await user.destroy();
      assert.deepStrictEqual(life, [
        'beforeDestroy',
        'afterDestroy',
      ]);
    });
  });
});

function addHooks(name) {
  const random = String(Math.floor(Math.random() * 1000));
  let called = false;

  let resolveHook;
  let rejectHook;
  const hookPromise = new Promise((resolve, reject) => {
    resolveHook = resolve;
    rejectHook = reject;
  });

  User['before' + name] = function(next, data) {
    called = true;
    data.email = random;
    next();
  };

  User['after' + name] = function(next) {
    try {
      assert.strictEqual(Boolean(called), true);
      assert.strictEqual(this.email, random);
      resolveHook();
      next();
    } catch (err) {
      rejectHook(err);
      next(err);
    }
  };

  return hookPromise;
}

function removeHooks(name) {
  return function() {
    User['after' + name] = null;
    User['before' + name] = null;
  };
}
