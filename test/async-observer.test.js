// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('node:assert/strict');
const {beforeEach, describe, it} = require('node:test');

const ModelBuilder = require('../').ModelBuilder;
require('./init');

describe('async observer', function() {
  let TestModel;
  beforeEach(function defineTestModel() {
    const modelBuilder = new ModelBuilder();
    TestModel = modelBuilder.define('TestModel', {name: String});
  });

  it('calls registered async observers', async function() {
    const notifications = [];
    TestModel.observe('before', pushAndNext(notifications, 'before'));
    TestModel.observe('after', pushAndNext(notifications, 'after'));

    await notifyObserversOf(TestModel, 'before', {});
    notifications.push('call');
    await notifyObserversOf(TestModel, 'after', {});

    assert.deepStrictEqual(notifications, ['before', 'call', 'after']);
  });

  it('allows multiple observers for the same operation', async function() {
    const notifications = [];
    TestModel.observe('event', pushAndNext(notifications, 'one'));
    TestModel.observe('event', pushAndNext(notifications, 'two'));

    await notifyObserversOf(TestModel, 'event', {});
    assert.deepStrictEqual(notifications, ['one', 'two']);
  });

  it('allows multiple operations to be notified in one call', async function() {
    const notifications = [];
    TestModel.observe('event1', pushAndNext(notifications, 'one'));
    TestModel.observe('event2', pushAndNext(notifications, 'two'));

    await notifyObserversOf(TestModel, ['event1', 'event2'], {});
    assert.deepStrictEqual(notifications, ['one', 'two']);
  });

  it('inherits observers from base model', async function() {
    const notifications = [];
    TestModel.observe('event', pushAndNext(notifications, 'base'));

    const Child = TestModel.extend('Child');
    Child.observe('event', pushAndNext(notifications, 'child'));

    await notifyObserversOf(Child, 'event', {});
    assert.deepStrictEqual(notifications, ['base', 'child']);
  });

  it('allow multiple operations to be notified with base models', async function() {
    const notifications = [];
    TestModel.observe('event1', pushAndNext(notifications, 'base1'));
    TestModel.observe('event2', pushAndNext(notifications, 'base2'));

    const Child = TestModel.extend('Child');
    Child.observe('event1', pushAndNext(notifications, 'child1'));
    Child.observe('event2', pushAndNext(notifications, 'child2'));

    await notifyObserversOf(Child, ['event1', 'event2'], {});
    assert.deepStrictEqual(notifications, ['base1', 'child1', 'base2', 'child2']);
  });

  it('does not modify observers in the base model', async function() {
    const notifications = [];
    TestModel.observe('event', pushAndNext(notifications, 'base'));

    const Child = TestModel.extend('Child');
    Child.observe('event', pushAndNext(notifications, 'child'));

    await notifyObserversOf(TestModel, 'event', {});
    assert.deepStrictEqual(notifications, ['base']);
  });

  it('always calls inherited observers', async function() {
    const notifications = [];
    TestModel.observe('event', pushAndNext(notifications, 'base'));

    const Child = TestModel.extend('Child');
    // Important: there are no observers on the Child model

    await notifyObserversOf(Child, 'event', {});
    assert.deepStrictEqual(notifications, ['base']);
  });

  it('can remove observers', async function() {
    const notifications = [];

    function call(ctx, next) {
      notifications.push('call');
      process.nextTick(next);
    }

    TestModel.observe('event', call);
    TestModel.removeObserver('event', call);

    await notifyObserversOf(TestModel, 'event', {});
    assert.deepStrictEqual(notifications, []);
  });

  it('can clear all observers', async function() {
    const notifications = [];

    function call(ctx, next) {
      notifications.push('call');
      process.nextTick(next);
    }

    TestModel.observe('event', call);
    TestModel.observe('event', call);
    TestModel.observe('event', call);
    TestModel.clearObservers('event');

    await notifyObserversOf(TestModel, 'event', {});
    assert.deepStrictEqual(notifications, []);
  });

  it('handles no observers', async function() {
    await notifyObserversOf(TestModel, 'no-observers', {});
  });

  it('passes context to final callback', async function() {
    const context = {};
    const ctx = await notifyObserversOf(TestModel, 'event', context);
    assert.strictEqual(ctx || 'null', context);
  });

  describe('notifyObserversAround', function() {
    let notifications;
    beforeEach(function() {
      notifications = [];
      TestModel.observe('before execute',
        pushAndNext(notifications, 'before execute'));
      TestModel.observe('after execute',
        pushAndNext(notifications, 'after execute'));
    });

    it('should notify before/after observers', async function() {
      const context = {};

      function work(done) {
        process.nextTick(function() {
          done(null, 1);
        });
      }

      const [result] = await notifyObserversAround(TestModel, 'execute', context, work);
      assert.deepStrictEqual(notifications, ['before execute', 'after execute']);
      assert.strictEqual(result, 1);
    });

    it('should allow work with context', async function() {
      const context = {};

      function work(context, done) {
        process.nextTick(function() {
          done(null, 1);
        });
      }

      const [result] = await notifyObserversAround(TestModel, 'execute', context, work);
      assert.deepStrictEqual(notifications, ['before execute', 'after execute']);
      assert.strictEqual(result, 1);
    });

    it('should notify before/after observers with multiple results',
      async function() {
        const context = {};

        function work(done) {
          process.nextTick(function() {
            done(null, 1, 2);
          });
        }

        const [r1, r2] = await notifyObserversAround(TestModel, 'execute', context, work);
        assert.strictEqual(r1, 1);
        assert.strictEqual(r2, 2);
        assert.deepStrictEqual(notifications, ['before execute', 'after execute']);
      });

    it('should allow observers to skip other ones',
      async function() {
        TestModel.observe('before invoke',
          function(context, next) {
            notifications.push('before invoke');
            context.end(null, 0);
          });
        TestModel.observe('after invoke',
          pushAndNext(notifications, 'after invoke'));

        const context = {};

        function work(done) {
          process.nextTick(function() {
            done(null, 1, 2);
          });
        }

        const [r1] = await notifyObserversAround(TestModel, 'invoke', context, work);
        assert.strictEqual(r1, 0);
        assert.deepStrictEqual(notifications, ['before invoke']);
      });

    it('should allow observers to tweak results',
      async function() {
        TestModel.observe('after invoke',
          function(context, next) {
            notifications.push('after invoke');
            context.results = [3];
            next();
          });

        const context = {};

        function work(done) {
          process.nextTick(function() {
            done(null, 1, 2);
          });
        }

        const [r1] = await notifyObserversAround(TestModel, 'invoke', context, work);
        assert.strictEqual(r1, 3);
        assert.deepStrictEqual(notifications, ['after invoke']);
      });
  });

  it('resolves promises returned by observers', async function() {
    TestModel.observe('event', function(ctx) {
      return Promise.resolve('value-to-ignore');
    });
    await notifyObserversOf(TestModel, 'event', {});
  });

  it('handles rejected promise returned by an observer', async function() {
    const testError = new Error('expected test error');
    TestModel.observe('event', function(ctx) {
      return Promise.reject(testError);
    });
    await assert.rejects(
      notifyObserversOf(TestModel, 'event', {}),
      function(err) {
        assert.strictEqual(err, testError);
        return true;
      },
    );
  });

  it('returns a promise when no callback is provided', function() {
    const context = {value: 'a-test-context'};
    const p = TestModel.notifyObserversOf('event', context);
    assert.notStrictEqual(p, undefined);
    return p.then(function(result) {
      assert.strictEqual(result, context);
    });
  });

  it('returns a rejected promise when no callback is provided', function() {
    const testError = new Error('expected test error');
    const context = {value: 'a-test-context'};
    TestModel.observe('event', function(ctx, next) { next(testError); });
    const p = TestModel.notifyObserversOf('event', context);
    return assert.rejects(p, function(err) {
      assert.strictEqual(err, testError);
      return true;
    });
  });

  it('should call after operation hook on error', async function() {
    const context = {
      req: {},
    };
    const operationError = new Error('The operation failed without result');
    let callCount = 0;

    function fail(context, done) {
      process.nextTick(() => {
        done(operationError);
      });
    }

    TestModel.observe('after execute error', function(ctx, next) {
      callCount++;
      next();
    });

    await assert.rejects(
      notifyObserversAround(TestModel, 'execute', context, fail),
      function(err) {
        assert.strictEqual(callCount, 1);
        assert.strictEqual(err.message, operationError.message);
        assert.strictEqual(err.ctx.error.message, operationError.message);
        return true;
      },
    );
  });

  it('should call after operation hook on error while overwriting error', async function() {
    const context = {
      req: {},
    };
    const operationError = new Error('The operation failed without result');
    const overwriteError = new Error('Overwriting the original error');
    let callCount = 0;

    function fail(context, done) {
      process.nextTick(() => {
        done(operationError);
      });
    }

    TestModel.observe('after execute error', function(ctx, next) {
      callCount++;
      next(overwriteError);
    });

    await assert.rejects(
      notifyObserversAround(TestModel, 'execute', context, fail),
      function(err) {
        assert.strictEqual(callCount, 1);
        assert.strictEqual(err.message, overwriteError.message);
        assert.strictEqual(err.ctx.error.message, operationError.message);
        return true;
      },
    );
  });

  it('should call after operation hook on error while allowing to change err', async function() {
    const context = {
      req: {},
    };
    const operationError = new Error('The operation failed without result');
    let callCount = 0;

    function fail(context, done) {
      process.nextTick(() => {
        done(operationError);
      });
    }

    TestModel.observe('after execute error', function(ctx, next) {
      callCount++;
      const err = ctx.error;
      next(err, ctx);
    });

    await assert.rejects(
      notifyObserversAround(TestModel, 'execute', context, fail),
      function(err) {
        assert.strictEqual(callCount, 1);
        assert.strictEqual(err.message, operationError.message);
        assert.strictEqual(err.ctx.error.message, operationError.message);
        return true;
      },
    );
  });
});

function pushAndNext(array, value) {
  return function(ctx, next) {
    array.push(value);
    process.nextTick(next);
  };
}

function notifyObserversOf(model, operation, context) {
  return new Promise((resolve, reject) => {
    model.notifyObserversOf(operation, context, function(err, ctx) {
      if (err) return reject(err);
      resolve(ctx);
    });
  });
}

function notifyObserversAround(model, operation, context, work) {
  return new Promise((resolve, reject) => {
    model.notifyObserversAround(operation, context, work, function(err, ...args) {
      if (err) {
        err.ctx = args[0];
        return reject(err);
      }
      resolve(args);
    });
  });
}
