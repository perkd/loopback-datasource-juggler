// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const DataSource = require('../lib/datasource').DataSource;
const {ModelRegistry} = require('../lib/model-registry');

describe('Cache Invalidation Fix', function() {
  beforeEach(function() {
    // Clear registry before each test
    ModelRegistry.clear();
  });

  describe('ModelRegistry.clear() cache invalidation', function() {
    it('should properly invalidate instanceCache on clear()', function() {
      // Create DataSource and model
      const dataSource = new DataSource('memory');
      const User = dataSource.define('User', {name: 'string'});

      // Get models to populate cache
      const modelsBefore = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(modelsBefore.length, 1);
      assert.equal(modelsBefore[0].modelName, 'User');

      // Verify registry has models
      assert.ok(ModelRegistry.getAllModels().size > 0);

      // Clear registry
      ModelRegistry.clear();

      // Verify registry is cleared
      assert.equal(ModelRegistry.getAllModels().size, 0);

      // Get models after clear - should return empty array, not cached result
      const modelsAfter = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(modelsAfter.length, 0);

      // Verify cache was invalidated (different array reference)
      assert.equal(modelsBefore === modelsAfter, false);
    });

    it('should properly release all model references on clear()', function() {
      // Create DataSource and App models
      const dataSource = new DataSource('memory');
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Get models to populate cache
      const dsModels = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(dsModels.length, 2);

      // Verify models are registered
      assert.ok(ModelRegistry.getAllModels().size > 0);

      // Clear registry
      ModelRegistry.clear();

      // Verify complete cleanup
      assert.equal(ModelRegistry.getAllModels().size, 0);
      assert.equal(ModelRegistry.getModelsForOwner(dataSource).length, 0);
    });

    it('should handle multiple DataSources with cache invalidation', function() {
      // Create multiple DataSources with different configurations to ensure separate registries
      const dataSource1 = new DataSource('memory', {host: 'localhost', port: 3001, database: 'db1'});
      const dataSource2 = new DataSource('memory', {host: 'localhost', port: 3002, database: 'db2'});

      // Create models in each DataSource
      const User1 = dataSource1.define('User', {name: 'string'});
      const User2 = dataSource2.define('User', {name: 'string'});

      // Get models to populate caches
      const models1Before = ModelRegistry.getModelsForOwner(dataSource1);
      const models2Before = ModelRegistry.getModelsForOwner(dataSource2);

      assert.equal(models1Before.length, 1);
      assert.equal(models2Before.length, 1);

      // Clear registry
      ModelRegistry.clear();

      // Both caches should be invalidated
      const models1After = ModelRegistry.getModelsForOwner(dataSource1);
      const models2After = ModelRegistry.getModelsForOwner(dataSource2);

      assert.equal(models1After.length, 0);
      assert.equal(models2After.length, 0);

      // Verify different array references (cache invalidated)
      assert.equal(models1Before === models1After, false);
      assert.equal(models2Before === models2After, false);
    });

    it('should maintain cache functionality after clear()', function() {
      // Create DataSource and model
      const dataSource = new DataSource('memory');
      const User = dataSource.define('User', {name: 'string'});

      // Get models to populate cache
      const modelsBefore = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(modelsBefore.length, 1);

      // Clear registry
      ModelRegistry.clear();

      // Create new model after clear
      const Product = dataSource.define('Product', {title: 'string'});

      // Get models - should return new model and cache it
      const modelsAfter1 = ModelRegistry.getModelsForOwner(dataSource);
      const modelsAfter2 = ModelRegistry.getModelsForOwner(dataSource);

      assert.equal(modelsAfter1.length, 1);
      assert.equal(modelsAfter1[0].modelName, 'Product');

      // Second call should return cached result (same array reference)
      assert.equal(modelsAfter1 === modelsAfter2, true);
    });

    it('should handle cache invalidation with DataSource models', function() {
      const dataSource1 = new DataSource('memory', {host: 'localhost', port: 4001, database: 'test1'});
      const dataSource2 = new DataSource('memory', {host: 'localhost', port: 4002, database: 'test2'});

      // Create DataSource-owned models
      const User1 = dataSource1.define('User1', {name: 'string'});
      const User2 = dataSource2.define('User2', {name: 'string'});

      // Get models to populate caches
      const ds1Models = ModelRegistry.getModelsForOwner(dataSource1);
      const ds2Models = ModelRegistry.getModelsForOwner(dataSource2);

      assert.equal(ds1Models.length, 1);
      assert.equal(ds1Models[0].modelName, 'User1');
      assert.equal(ds2Models.length, 1);
      assert.equal(ds2Models[0].modelName, 'User2');

      // Clear registry
      ModelRegistry.clear();

      // Both should return empty arrays
      assert.equal(ModelRegistry.getModelsForOwner(dataSource1).length, 0);
      assert.equal(ModelRegistry.getModelsForOwner(dataSource2).length, 0);
    });
  });

  describe('Cache generation mechanism', function() {
    it('should increment generation counter on clear()', function() {
      // This test verifies the internal mechanism works
      const dataSource = new DataSource('memory');
      const User = dataSource.define('User', {name: 'string'});

      // Populate cache
      ModelRegistry.getModelsForOwner(dataSource);

      // Clear should increment generation
      ModelRegistry.clear();

      // Create new model and verify cache works
      const Product = dataSource.define('Product', {title: 'string'});
      const models1 = ModelRegistry.getModelsForOwner(dataSource);
      const models2 = ModelRegistry.getModelsForOwner(dataSource);

      assert.equal(models1.length, 1);
      assert.equal(models1 === models2, true); // Cache should work
    });

    it('should handle multiple clear() calls safely', function() {
      const dataSource = new DataSource('memory');
      const User = dataSource.define('User', {name: 'string'});

      // Populate cache
      ModelRegistry.getModelsForOwner(dataSource);

      // Multiple clear calls should not cause errors
      ModelRegistry.clear();
      ModelRegistry.clear();
      ModelRegistry.clear();

      // Should still work correctly
      assert.equal(ModelRegistry.getModelsForOwner(dataSource).length, 0);
    });
  });
});
