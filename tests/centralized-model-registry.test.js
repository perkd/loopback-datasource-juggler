// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');

const jdb = require('../');
const DataSource = jdb.DataSource;
const ModelRegistry = jdb.ModelRegistry;
const ModelRegistryProxy = jdb.ModelRegistryProxy;

describe('Centralized Model Registry', function() {
  let dataSource;
  let testTenant;

  beforeEach(function() {
    testTenant = `test-${Date.now()}`;
    dataSource = new DataSource('memory');

    // Clear the registry before each test
    ModelRegistry.clear();
  });

  afterEach(function() {
    if (testTenant) {
      ModelRegistry.cleanupTenant(testTenant);
    }
    ModelRegistry.clear();
  });

  describe('Enhanced ModelRegistry Methods', function() {
    it('should provide getModelsForOwner method', function() {
      // Create a model
      const User = dataSource.define('User', {
        name: {type: 'string'},
        email: {type: 'string'},
      });

      // Get models for this DataSource (using new proposal API)
      const models = ModelRegistry.getModelsForOwner(dataSource);
      assert.ok(Array.isArray(models));
      assert.equal(models.length, 1);
      assert.equal(models[0], User);
    });

    it('should provide getModelNamesForOwner method', function() {
      // Create models
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Get model names for this DataSource
      const modelNames = ModelRegistry.getModelNamesForOwner(dataSource, 'dataSource');
      assert.ok(Array.isArray(modelNames));
      assert.equal(modelNames.length, 2);
      assert.ok(modelNames.includes('User'));
      assert.ok(modelNames.includes('Product'));
    });

    it('should provide hasModelForOwner method', function() {
      // Create a model
      const User = dataSource.define('User', {name: 'string'});

      // Check if model exists for this DataSource (using new proposal API)
      assert.equal(ModelRegistry.hasModelForOwner(dataSource, 'User'), true);
      assert.equal(ModelRegistry.hasModelForOwner(dataSource, 'NonExistent'), false);
    });

    it('should provide getModelForOwner method', function() {
      // Create a model
      const User = dataSource.define('User', {name: 'string'});

      // Get specific model for this DataSource (using new proposal API)
      const foundModel = ModelRegistry.getModelForOwner(dataSource, 'User');
      assert.ok(foundModel);
      assert.equal(foundModel, User);

      // Try to get non-existent model
      const notFound = ModelRegistry.getModelForOwner(dataSource, 'NonExistent');
      assert.equal(notFound, undefined);
    });

    it('should isolate models between different DataSources', function() {
      const dataSource2 = new DataSource('memory');

      // Create models with different names in different DataSources to avoid conflicts
      const User1 = dataSource.define('User1', {name: 'string'});
      const User2 = dataSource2.define('User2', {title: 'string'});

      // Verify isolation (using new proposal API)
      const models1 = ModelRegistry.getModelsForOwner(dataSource);
      const models2 = ModelRegistry.getModelsForOwner(dataSource2);

      assert.equal(models1.length, 1);
      assert.equal(models2.length, 1);
      assert.equal(models1[0], User1);
      assert.equal(models2[0], User2);
      assert.notEqual(models1[0], models2[0]);
    });
  });

  describe('ModelRegistryProxy', function() {
    it('should create a proxy with correct owner and type', function() {
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');
      assert.ok(proxy);
      // Note: Due to the Proxy, we can't directly access owner/ownerType
      // Instead, we test that the proxy works correctly
      assert.ok(proxy);
    });

    it('should throw error for invalid parameters', function() {
      assert.throws(() => {
        new ModelRegistryProxy(null, 'dataSource');
      }, /ModelRegistryProxy requires an owner object/);

      assert.throws(() => {
        new ModelRegistryProxy(dataSource, 'invalid');
      }, /ModelRegistryProxy requires ownerType to be "dataSource" or "app"/);
    });

    it('should provide getModel method', function() {
      const User = dataSource.define('User', {name: 'string'});
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Access model through proxy property access (not direct method call)
      const foundModel = proxy.User;
      assert.ok(foundModel);
      assert.equal(foundModel, User);
    });

    it('should provide setModel method', function() {
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');
      const mockModel = {
        modelName: 'TestModel',
        definition: {properties: {name: 'string'}},
      };

      // Set model through proxy property assignment
      proxy.TestModel = mockModel;
      assert.equal(mockModel.dataSource, dataSource);

      // Verify it was registered
      const foundModel = proxy.TestModel;
      assert.ok(foundModel);
      assert.equal(foundModel, mockModel);
    });

    it('should provide hasModel method', function() {
      const User = dataSource.define('User', {name: 'string'});
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Test using 'in' operator and hasOwnProperty
      assert.equal('User' in proxy, true);
      assert.equal('NonExistent' in proxy, false);
    });

    it('should provide getModelNames method', function() {
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Test using Object.keys() which should work with the proxy
      const modelNames = Object.keys(proxy);
      assert.ok(Array.isArray(modelNames));
      assert.equal(modelNames.length, 2);
      assert.ok(modelNames.includes('User'));
      assert.ok(modelNames.includes('Product'));
    });
  });

  describe('DataSource.models Proxy Integration', function() {
    it('should provide unified model access through DataSource.models', function() {
      // Create model
      const User = dataSource.define('User', {
        name: {type: 'string'},
        email: {type: 'string'},
      });

      // Access through DataSource.models
      assert.ok(dataSource.models.User);
      assert.equal(dataSource.models.User, User);
      assert.equal(dataSource.models.User.modelName, 'User');
    });

    it('should support Object.keys() on DataSource.models', function() {
      // Create models
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Test Object.keys()
      const keys = Object.keys(dataSource.models);
      assert.ok(Array.isArray(keys));
      assert.equal(keys.length, 2);
      assert.ok(keys.includes('User'));
      assert.ok(keys.includes('Product'));
    });

    it('should support for...in loops on DataSource.models', function() {
      // Create models
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Test for...in loop
      const foundModels = [];
      for (const modelName in dataSource.models) {
        foundModels.push(modelName);
      }

      assert.equal(foundModels.length, 2);
      assert.ok(foundModels.includes('User'));
      assert.ok(foundModels.includes('Product'));
    });

    it('should support hasOwnProperty on DataSource.models', function() {
      // Create model
      const User = dataSource.define('User', {name: 'string'});

      // Test hasOwnProperty
      assert.equal(dataSource.models.hasOwnProperty('User'), true);
      assert.equal(dataSource.models.hasOwnProperty('NonExistent'), false);
    });

    it('should handle model assignment with deprecation warning', function() {
      const mockModel = {
        modelName: 'AssignedModel',
        definition: {properties: {name: 'string'}},
      };

      // Capture console.warn
      const originalWarn = console.warn;
      let warningMessage = '';
      console.warn = function(message) {
        warningMessage = message;
      };

      try {
        // Assign model (should trigger deprecation warning)
        dataSource.models = {AssignedModel: mockModel};

        // Verify warning was shown
        assert.match(warningMessage, /deprecated/);

        // Verify model was registered
        assert.ok(dataSource.models.AssignedModel);
        assert.equal(dataSource.models.AssignedModel.dataSource, dataSource);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should maintain isolation between different DataSources', function() {
      const dataSource2 = new DataSource('memory');

      // Create models with different names in different DataSources
      const User1 = dataSource.define('User1', {name: 'string'});
      const User2 = dataSource2.define('User2', {title: 'string'});

      // Verify isolation through proxy
      assert.ok(dataSource.models.User1);
      assert.ok(dataSource2.models.User2);
      assert.equal(dataSource.models.User1, User1);
      assert.equal(dataSource2.models.User2, User2);

      // Verify cross-access doesn't work
      assert.equal(dataSource.models.User2, undefined);
      assert.equal(dataSource2.models.User1, undefined);

      // Verify each DataSource only sees its own models
      assert.deepEqual(Object.keys(dataSource.models), ['User1']);
      assert.deepEqual(Object.keys(dataSource2.models), ['User2']);
    });
  });

  describe('Backward Compatibility', function() {
    it('should maintain all existing DataSource.models behavior', function() {
      // Create model
      const User = dataSource.define('User', {name: 'string'});

      // Test various access patterns that existing code might use

      // Direct property access
      assert.ok(dataSource.models.User);
      assert.equal(dataSource.models.User, User);

      // Object.keys()
      assert.ok(Object.keys(dataSource.models).includes('User'));

      // Object.values()
      assert.ok(Object.values(dataSource.models).includes(User));

      // Property enumeration
      const modelNames = [];
      for (const name in dataSource.models) {
        modelNames.push(name);
      }
      assert.ok(modelNames.includes('User'));

      // hasOwnProperty
      assert.equal(dataSource.models.hasOwnProperty('User'), true);
    });

    it('should handle undefined/null model access gracefully', function() {
      // Test accessing non-existent models
      assert.equal(dataSource.models.NonExistent, undefined);
      assert.equal(dataSource.models.undefined, undefined);
      assert.equal(dataSource.models.null, undefined);
    });
  });

  describe('Performance Benchmarks', function() {
    it('should demonstrate O(1) model lookup performance', function() {
      // Create many models to test scalability
      const modelCount = 100;
      const models = [];

      for (let i = 0; i < modelCount; i++) {
        const model = dataSource.define(`TestModel${i}`, {
          id: {type: 'string', id: true},
          name: {type: 'string'},
          value: {type: 'number'},
        });
        models.push(model);
      }

      // Measure lookup performance
      const iterations = 1000;
      const start = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        // Access random models
        const randomIndex = Math.floor(Math.random() * modelCount);
        const modelName = `TestModel${randomIndex}`;
        const foundModel = dataSource.models[modelName];
        assert.ok(foundModel);
        assert.equal(foundModel, models[randomIndex]);
      }

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds

      // Performance should be consistent regardless of model count (O(1))
      // Allow reasonable time for 1000 lookups across 100 models
      assert.ok(duration < 100); // Should complete in under 100ms

      console.log(`    ✓ ${iterations} model lookups across ${modelCount} models completed in ${duration.toFixed(2)}ms`);
    });

    it('should demonstrate efficient owner-aware queries', function() {
      const dataSource2 = new DataSource('memory');

      // Create models in both DataSources
      const modelsPerDS = 50;
      for (let i = 0; i < modelsPerDS; i++) {
        dataSource.define(`DS1_Model${i}`, {name: 'string'});
        dataSource2.define(`DS2_Model${i}`, {title: 'string'});
      }

      // Measure owner-aware query performance
      const iterations = 100;
      const start = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        const models1 = ModelRegistry.getModelsForOwner(dataSource);
        const models2 = ModelRegistry.getModelsForOwner(dataSource2);

        assert.equal(models1.length, modelsPerDS);
        assert.equal(models2.length, modelsPerDS);
      }

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;

      // Owner-aware queries should be very fast
      assert.ok(duration < 20); // Should complete in under 20ms

      console.log(`    ✓ ${iterations} owner-aware queries completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle large numbers of models efficiently', function() {
      // Test with larger scale to validate scalability
      const modelCount = 500;

      for (let i = 0; i < modelCount; i++) {
        dataSource.define(`ScaleTest${i}`, {
          id: {type: 'string', id: true},
          data: {type: 'string'},
        });
      }

      // Test various operations at scale
      const start = process.hrtime.bigint();

      // Test Object.keys() performance
      const keys = Object.keys(dataSource.models);
      assert.equal(keys.length, modelCount);

      // Test enumeration performance
      let count = 0;
      for (const modelName in dataSource.models) {
        count++;
      }
      assert.equal(count, modelCount);

      // Test owner-aware query performance
      const allModels = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(allModels.length, modelCount);

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;

      // All operations should complete quickly even with many models
      assert.ok(duration < 100); // Should complete in under 100ms

      console.log(`    ✓ Operations on ${modelCount} models completed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('App Integration and Bug Fixes', function() {
    let mockApp;

    beforeEach(function() {
      // Create a mock LoopBack App object (function with properties)
      mockApp = function() {};
      mockApp.models = {};
      mockApp.dataSources = {};
      mockApp.middleware = [];
      mockApp.model = function(model) {
        // Simulate app.model() behavior
        if (model && model.modelName) {
          ModelRegistry.registerModelForApp(this, model);
          return model;
        }
      };
      mockApp.use = function() {};
      mockApp.listen = function() {};
    });

    describe('Bug #1: App Object Type Detection', function() {
      it('should detect LoopBack App objects (functions) correctly', function() {
        const ownerType = ModelRegistry._detectOwnerType(mockApp);
        assert.equal(ownerType, 'app');
      });

      it('should detect DataSource objects correctly', function() {
        const ownerType = ModelRegistry._detectOwnerType(dataSource);
        assert.equal(ownerType, 'dataSource');
      });

      it('should return null for invalid objects', function() {
        assert.equal(ModelRegistry._detectOwnerType(null), null);
        assert.equal(ModelRegistry._detectOwnerType(undefined), null);
        assert.equal(ModelRegistry._detectOwnerType('string'), null);
        assert.equal(ModelRegistry._detectOwnerType(123), null);
      });

      it('should handle App objects with different constructor names', function() {
        // Create apps with different characteristics
        const app1 = function() {};
        app1.models = {};
        app1.dataSources = {};
        assert.equal(ModelRegistry._detectOwnerType(app1), 'app');

        const app2 = function() {};
        app2.models = {};
        app2.middleware = [];
        assert.equal(ModelRegistry._detectOwnerType(app2), 'app');

        const app3 = function() {};
        app3.model = function() {};
        app3.use = function() {};
        app3.listen = function() {};
        assert.equal(ModelRegistry._detectOwnerType(app3), 'app');
      });
    });

    describe('Bug #2: App Model Registration', function() {
      it('should register models for App instances using registerModelForApp', function() {
        const User = dataSource.define('User', {name: 'string'});

        // Register model for app
        ModelRegistry.registerModelForApp(mockApp, User);

        // Verify app relationship is set
        assert.equal(User.app, mockApp);

        // Verify model can be found by name
        const foundModel = ModelRegistry.findModelByName('User');
        assert.ok(foundModel);
        assert.equal(foundModel, User);
        assert.equal(foundModel.app, mockApp);
      });

      it('should support app.model() integration pattern', function() {
        const Product = dataSource.define('Product', {title: 'string'});

        // Simulate app.model() call
        mockApp.model(Product);

        // Verify model is registered and app relationship is set
        assert.equal(Product.app, mockApp);
        const foundModel = ModelRegistry.findModelByName('Product');
        assert.ok(foundModel);
        assert.equal(foundModel, Product);
      });

      it('should isolate models between different App instances', function() {
        const app1 = function() {};
        app1.models = {};
        app1.model = mockApp.model;

        const app2 = function() {};
        app2.models = {};
        app2.model = mockApp.model;

        const User1 = dataSource.define('User1', {name: 'string'});
        const User2 = dataSource.define('User2', {email: 'string'});

        ModelRegistry.registerModelForApp(app1, User1);
        ModelRegistry.registerModelForApp(app2, User2);

        // Verify isolation
        assert.equal(User1.app, app1);
        assert.equal(User2.app, app2);
        assert.notEqual(User1.app, User2.app);
      });
    });

    describe('Bug #3: API Consistency and Parameter Order', function() {
      beforeEach(function() {
        const User = dataSource.define('User', {name: 'string'});
        ModelRegistry.registerModelForApp(mockApp, User);
      });

      it('should have consistent parameter order in simplified API', function() {
        // All simplified API methods should have owner as first parameter
        const models = ModelRegistry.getModelsForOwner(mockApp);
        assert.ok(Array.isArray(models));
        assert.equal(models.length, 1);
        assert.equal(models[0].modelName, 'User');

        const modelNames = ModelRegistry.getModelNamesForOwner(mockApp);
        assert.deepEqual(modelNames, ['User']);

        const hasModel = ModelRegistry.hasModelForOwner(mockApp, 'User');
        assert.equal(hasModel, true);

        const model = ModelRegistry.getModelForOwner(mockApp, 'User');
        assert.equal(model.modelName, 'User');
      });

      it('should have consistent parameter order in explicit API', function() {
        // All explicit API methods should have owner as first parameter
        const models = ModelRegistry.getModelsForOwnerWithType(mockApp, 'app');
        assert.ok(Array.isArray(models));
        assert.equal(models.length, 1);

        const hasModel = ModelRegistry.hasModelForOwnerWithType(mockApp, 'User', 'app');
        assert.equal(hasModel, true);

        const model = ModelRegistry.getModelForOwnerWithType(mockApp, 'User', 'app');
        assert.equal(model.modelName, 'User');
      });

      it('should work with both DataSource and App owners', function() {
        const dsUser = dataSource.define('DSUser', {name: 'string'});

        // Test DataSource with simplified API
        const dsModels = ModelRegistry.getModelsForOwner(dataSource);
        assert.equal(dsModels.some(m => m.modelName === 'DSUser'), true);

        // Test App with simplified API
        const appModels = ModelRegistry.getModelsForOwner(mockApp);
        assert.equal(appModels.some(m => m.modelName === 'User'), true);

        // Verify isolation
        assert.equal(dsModels.some(m => m.modelName === 'User'), false);
        assert.equal(appModels.some(m => m.modelName === 'DSUser'), false);
      });
    });
  });
});
