// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const DataSource = require('../lib/datasource.js').DataSource;

describe('Multitenant DataSource Accessor Fix', function() {
  let dataSource;

  beforeEach(function() {
    dataSource = new DataSource('memory');
  });

  afterEach(function() {
    if (dataSource) {
      dataSource.disconnect();
    }
  });

  describe('Property Accessor Behavior', function() {
    it('should call getDataSource() when accessing model.dataSource property', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      let getDataSourceCalled = false;
      const originalDataSource = TestModel._originalDataSource;

      // Override getDataSource method
      TestModel.getDataSource = function() {
        getDataSourceCalled = true;
        return originalDataSource;
      };

      // Access dataSource property - should trigger getDataSource()
      const ds = TestModel.dataSource;
      assert.equal(getDataSourceCalled, true);
      assert.equal(ds, originalDataSource);
    });

    it('should fallback to original datasource when getDataSource() is not defined', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Ensure no getDataSource method exists
      delete TestModel.getDataSource;

      // Access dataSource property - should return original datasource
      const ds = TestModel.dataSource;
      assert.equal(ds, originalDataSource);
    });

    it('should handle errors in getDataSource() gracefully', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Override getDataSource to throw an error
      TestModel.getDataSource = function() {
        throw new Error('Test error');
      };

      // Access dataSource property - should fallback to original datasource
      const ds = TestModel.dataSource;
      assert.equal(ds, originalDataSource);
    });

    it('should prevent circular reference loops', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Create circular reference scenario
      TestModel.getDataSource = function() {
        return this.dataSource; // Would cause infinite loop without protection
      };

      // Access dataSource property - should not hang and return original datasource
      const ds = TestModel.dataSource;
      assert.equal(ds, originalDataSource);
    });

    it('should allow setting dataSource property during initialization', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Set new datasource
      TestModel.dataSource = newDataSource;

      // Should update the _originalDataSource
      assert.equal(TestModel._originalDataSource, newDataSource);
      newDataSource.disconnect();
    });
  });

  describe('Multitenant Scenarios', function() {
    it('should return tenant-specific datasource when getDataSource() is overridden', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const tenantDataSource = new DataSource('memory');

      // Simulate multitenant override
      TestModel.getDataSource = function() {
        return tenantDataSource;
      };

      // Access dataSource property - should return tenant datasource
      const ds = TestModel.dataSource;
      assert.equal(ds, tenantDataSource);

      tenantDataSource.disconnect();
    });

    it('should work with model attachment scenarios', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Attach model to new datasource
      newDataSource.attach(TestModel);

      // Verify the property accessor is set up correctly
      assert.equal(TestModel._originalDataSource, newDataSource);
      assert.equal(TestModel.dataSource, newDataSource);

      newDataSource.disconnect();
    });

    it('should work with models setter scenarios', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Verify initial state
      assert.equal(TestModel._originalDataSource, dataSource);
      assert.equal(TestModel.dataSource, dataSource);

      // Use models setter (deprecated but should still work)
      newDataSource.models = {TestModel: TestModel};

      // Since models setter is deprecated, it may not update the datasource
      // But the property accessor should still work correctly
      // Verify that the property descriptor is still in place
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      assert.ok(descriptor.get);
      assert.ok(descriptor.set);
      assert.equal(descriptor.configurable, true);
      assert.equal(descriptor.enumerable, true);

      newDataSource.disconnect();
    });
  });

  describe('Backward Compatibility', function() {
    it('should maintain existing behavior for non-multitenant applications', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // Standard access should work exactly as before
      assert.equal(TestModel.dataSource, dataSource);
      assert.ok(TestModel.dataSource instanceof DataSource);
    });

    it('should preserve property enumeration behavior', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // dataSource property should be enumerable
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      assert.equal(descriptor.enumerable, true);
    });

    it('should preserve property configuration behavior', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // dataSource property should be configurable
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      assert.equal(descriptor.configurable, true);
    });

    it('should work with existing model operations', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // Standard model operations should work
      assert.ok(TestModel.create);
      assert.ok(TestModel.find);
      assert.ok(TestModel.findById);

      // DataSource should be accessible for operations
      assert.equal(TestModel.dataSource, dataSource);
    });
  });

  describe('Edge Cases', function() {
    it('should handle multiple getDataSource() calls correctly', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;
      let callCount = 0;

      TestModel.getDataSource = function() {
        callCount++;
        return originalDataSource;
      };

      // Multiple accesses should each call getDataSource()
      const ds1 = TestModel.dataSource;
      const ds2 = TestModel.dataSource;
      const ds3 = TestModel.dataSource;

      assert.equal(callCount, 3);
    });

    it('should handle getDataSource() returning different values', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const tenantDataSource1 = new DataSource('memory');
      const tenantDataSource2 = new DataSource('memory');
      let toggle = false;

      TestModel.getDataSource = function() {
        toggle = !toggle;
        return toggle ? tenantDataSource1 : tenantDataSource2;
      };

      // Should return different datasources based on getDataSource() logic
      const ds1 = TestModel.dataSource;
      const ds2 = TestModel.dataSource;

      assert.equal(ds1, tenantDataSource1);
      assert.equal(ds2, tenantDataSource2);

      tenantDataSource1.disconnect();
      tenantDataSource2.disconnect();
    });

    it('should handle null/undefined returns from getDataSource()', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      TestModel.getDataSource = function() {
        return null;
      };

      // Should return null as returned by getDataSource()
      const ds = TestModel.dataSource;
      assert.equal(ds, null);
    });
  });

  describe('DAO Resolution', function() {
    // Each DAO entry point must resolve through Model.getDataSource() on every
    // call. Asserted per-operation as a delta so a regression in any single
    // path (e.g. create caches but find still resolves) is caught — a global
    // lower bound across all three ops would miss that.

    let Model, calls;

    beforeEach(function() {
      Model = dataSource.define('DaoModel', {name: 'string'});
      calls = 0;
      Model.getDataSource = function() {
        calls++;
        return dataSource;
      };
    });

    // Each op runs twice and the second-call delta is asserted. Second call
    // (not first) is the right signal: any regression that memoizes the
    // DataSource on the Model after warmup would yield zero on the second
    // call while still calling on the first. The threshold is conservative
    // (>= 3) — current second-call deltas are create=9, find=7, count=6, so
    // wholesale memoization of any single op (drops to 0–1) is caught
    // without coupling to the exact internal call count.

    async function deltaAround(op) {
      const start = calls;
      await op();
      return calls - start;
    }

    const MIN_CALLS_PER_OP = 3;

    it('create() consults getDataSource() on every call', async function() {
      await Model.create({name: 'a'});
      const second = await deltaAround(() => Model.create({name: 'b'}));
      assert.ok(second >= MIN_CALLS_PER_OP, `create() second-call delta=${second}, expected >= ${MIN_CALLS_PER_OP} (regression would drop to 0–1)`);
    });

    it('find() consults getDataSource() on every call', async function() {
      await Model.find();
      const second = await deltaAround(() => Model.find());
      assert.ok(second >= MIN_CALLS_PER_OP, `find() second-call delta=${second}, expected >= ${MIN_CALLS_PER_OP}`);
    });

    it('count() consults getDataSource() on every call', async function() {
      await Model.count();
      const second = await deltaAround(() => Model.count());
      assert.ok(second >= MIN_CALLS_PER_OP, `count() second-call delta=${second}, expected >= ${MIN_CALLS_PER_OP}`);
    });
  });

  describe('ReconnectingProxy contract', function() {
    // Pins the contract CRM's Multitenant mixin depends on: stillConnecting()
    // calls ready(obj, args) on whatever getDataSource() returns, and a
    // non-DataSource object that returns true from ready() can queue a DAO
    // invocation and replay it via args.callee when ready.

    function makeReconnectingProxy(realDataSource) {
      // Minimal mirror of CRM/business/server/lib/common/mixins/Multitenant.js:40-119
      const proxy = new EventEmitter();
      proxy.connected = false;
      proxy.connector = realDataSource.connector; // satisfies stillConnecting()'s connector check
      proxy.settings = realDataSource.settings || {};
      proxy.ready = function(obj, args) {
        if (proxy.connected) return false;
        proxy._readyCalls = (proxy._readyCalls || 0) + 1;
        proxy.once('connected', () => {
          const method = args.callee;
          method.apply(obj, [].slice.call(args));
        });
        return true;
      };
      return proxy;
    }

    it('queues a DAO call on a non-DataSource ready() proxy and replays on connected', async function() {
      const Model = dataSource.define('ProxyModel', {name: 'string'});
      const proxy = makeReconnectingProxy(dataSource);
      let firstResolve = true;
      Model.getDataSource = function() {
        // First DAO read returns the proxy (cold-pool simulation);
        // subsequent reads (after 'connected' fires) return the real DataSource.
        if (firstResolve) { firstResolve = false; return proxy; }
        return dataSource;
      };

      const createPromise = Model.create({name: 'queued'});

      // Give stillConnecting() a tick to register the once('connected') listener.
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(proxy._readyCalls, 1, 'ready() must be called on the proxy returned by getDataSource()');

      // Prove the DAO call is actually blocked. Race the create against a
      // sentinel that resolves on the next macrotask. If juggler regressed
      // to "call ready() but continue immediately", create would resolve
      // first and this assertion would fail.
      const sentinel = new Promise(resolve => setTimeout(() => resolve('sentinel'), 10));
      const winner = await Promise.race([
        createPromise.then(() => 'create'),
        sentinel,
      ]);
      assert.equal(winner, 'sentinel', 'create() must be blocked until proxy emits connected');

      proxy.connected = true;
      proxy.emit('connected');

      const created = await createPromise;
      assert.equal(created.name, 'queued', 'queued DAO call must replay after connected');
    });
  });

  describe('Performance', function() {
    it('should have minimal performance impact when getDataSource() is not defined', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      delete TestModel.getDataSource;

      const start = process.hrtime();

      // Access property many times
      for (let i = 0; i < 1000; i++) {
        const ds = TestModel.dataSource;
        assert.ok(ds);
      }

      const [seconds, nanoseconds] = process.hrtime(start);
      const milliseconds = seconds * 1000 + nanoseconds / 1000000;

      // Should complete quickly (less than 100ms for 1000 accesses)
      assert.ok(milliseconds < 100);
    });
  });
});
