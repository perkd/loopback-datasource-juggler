// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const DataSource = require('../lib/datasource').DataSource;
const {ModelRegistry} = require('../lib/model-registry');

describe('Memory Leak Fixes - v5.2.5', function() {
  beforeEach(function() {
    // Clear registry before each test
    ModelRegistry.clear();
  });

  describe('Stable DataSource ID Generation', function() {
    it('should reuse tenant registries for identical configurations', function() {
      const initialStats = ModelRegistry.getStats();

      // Create multiple DataSources with identical configurations
      const dataSources = [];
      for (let i = 0; i < 10; i++) {
        const ds = new DataSource('memory', {
          name: 'testdb',
          host: 'localhost',
          port: 3306,
        });
        const User = ds.define('User', {name: 'string'});
        dataSources.push(ds);

        // Access models to trigger proxy creation
        assert.ok(Object.keys(ds.models).includes('User'));
      }

      const afterCreationStats = ModelRegistry.getStats();

      // Should only have 1 tenant registry (reused for identical configs)
      assert.equal(afterCreationStats.tenantRegistries, 1);

      // Cleanup
      dataSources.forEach(ds => ds.disconnect());
    });

    it('should create separate registries for different configurations', function() {
      const dataSources = [];

      // Create DataSources with different configurations
      for (let i = 0; i < 3; i++) {
        const ds = new DataSource('memory', {
          name: `testdb${i}`,
          host: 'localhost',
          port: 3306 + i,
        });
        const User = ds.define('User', {name: 'string'});
        dataSources.push(ds);
      }

      const stats = ModelRegistry.getStats();

      // Should have 3 tenant registries (different configs)
      assert.equal(stats.tenantRegistries, 3);

      // Cleanup
      dataSources.forEach(ds => ds.disconnect());
    });
  });

  describe('DataSource Disconnect Cleanup', function() {
    it('should clean up ModelRegistryProxy on disconnect', async function() {
      const ds = new DataSource('memory', {name: 'testdb'});
      const User = ds.define('User', {name: 'string'});

      // Access models to create proxy
      const models = ds.models;
      assert.ok(Object.keys(models).includes('User'));

      // Verify proxy exists
      assert.ok('_modelRegistryProxy' in ds);

      // Disconnect should clean up proxy
      ds.disconnect();

      // Wait for async cleanup
      await delay(10);
      // Proxy should be cleaned up
      assert.equal('_modelRegistryProxy' in ds, false);
    });

    it('should clean up tenant registry with reference counting', async function() {
      const ds1 = new DataSource('memory', {name: 'shared'});
      const ds2 = new DataSource('memory', {name: 'shared'});

      const User1 = ds1.define('User', {name: 'string'});
      const User2 = ds2.define('User', {name: 'string'});

      // Both should use same tenant registry
      const stats1 = ModelRegistry.getStats();
      assert.equal(stats1.tenantRegistries, 1);

      // Disconnect first DataSource
      ds1.disconnect();

      await delay(10);
      // Registry should still exist (ds2 still using it)
      const stats2 = ModelRegistry.getStats();
      assert.equal(stats2.tenantRegistries, 1);

      // Disconnect second DataSource
      ds2.disconnect();

      await delay(10);
      // Registry should be cleaned up now
      const stats3 = ModelRegistry.getStats();
      assert.equal(stats3.tenantRegistries, 0);
    });
  });

  describe('Memory Leak Prevention', function() {
    it('should not accumulate tenant registries during rapid switching', async function() {
      const initialStats = ModelRegistry.getStats();

      // Simulate high-frequency tenant switching with same config
      for (let i = 0; i < 50; i++) {
        const ds = new DataSource('memory', {
          name: 'rapidtest',
          host: 'localhost',
        });
        const User = ds.define('User', {name: 'string'});

        // Access models to trigger proxy creation
        assert.ok(Object.keys(ds.models).includes('User'));

        // Disconnect immediately
        ds.disconnect();
      }

      // Wait for all async cleanups to complete
      await delay(100);
      const finalStats = ModelRegistry.getStats();

      // Should not accumulate registries (all cleaned up)
      assert.equal(finalStats.tenantRegistries, 0);
    });

    it('should handle mixed configuration scenarios', async function() {
      const dataSources = [];

      // Create mix of shared and unique configurations
      for (let i = 0; i < 20; i++) {
        const config = i % 5 === 0 ?
          {name: 'shared', host: 'localhost'} : // Every 5th is shared
          {name: `unique${i}`, host: 'localhost'}; // Others are unique

        const ds = new DataSource('memory', config);
        const User = ds.define('User', {name: 'string'});
        dataSources.push(ds);
      }

      const stats = ModelRegistry.getStats();

      // Should have reasonable number of registries (not 20)
      assert.ok(stats.tenantRegistries < 20);
      assert.ok(stats.tenantRegistries > 0);

      // Cleanup all
      dataSources.forEach(ds => ds.disconnect());

      // Wait for all async cleanups
      await delay(100);
      // All should be cleaned up
      const finalStats = ModelRegistry.getStats();
      assert.equal(finalStats.tenantRegistries, 0);
    });
  });

  describe('Reference Counting', function() {
    it('should track DataSource references correctly', async function() {
      const config = {name: 'reftest', host: 'localhost'};

      // Create first DataSource
      const ds1 = new DataSource('memory', config);
      const User1 = ds1.define('User', {name: 'string'});

      let stats = ModelRegistry.getStats();
      assert.equal(stats.tenantRegistries, 1);

      // Create second DataSource with same config
      const ds2 = new DataSource('memory', config);
      const User2 = ds2.define('User', {name: 'string'});

      // Should still be 1 registry (shared)
      stats = ModelRegistry.getStats();
      assert.equal(stats.tenantRegistries, 1);

      // Disconnect first - registry should remain
      ds1.disconnect();

      await delay(10);
      stats = ModelRegistry.getStats();
      assert.equal(stats.tenantRegistries, 1);

      // Disconnect second - registry should be cleaned up
      ds2.disconnect();

      await delay(10);
      stats = ModelRegistry.getStats();
      assert.equal(stats.tenantRegistries, 0);
    });
  });

  describe('Error Handling', function() {
    it('should handle cleanup errors gracefully', function() {
      const ds = new DataSource('memory', {name: 'errortest'});
      const User = ds.define('User', {name: 'string'});

      // Mock ModelRegistry to throw error
      const originalCleanup = ModelRegistry.cleanupTenant;
      ModelRegistry.cleanupTenant = function() {
        throw new Error('Cleanup error');
      };

      // Disconnect should not throw
      assert.doesNotThrow(() => ds.disconnect());

      // Restore original method
      ModelRegistry.cleanupTenant = originalCleanup;
    });
  });

  describe('Performance', function() {
    it('should maintain reasonable performance with many DataSources', async function() {
      const startTime = Date.now();
      const dataSources = [];

      // Create many DataSources
      for (let i = 0; i < 100; i++) {
        const ds = new DataSource('memory', {
          name: i % 10 === 0 ? 'shared' : `unique${i}`,
        });
        const User = ds.define('User', {name: 'string'});
        dataSources.push(ds);
      }

      const creationTime = Date.now() - startTime;

      // Should complete in reasonable time (less than 1 second)
      assert.ok(creationTime < 1000);

      // Cleanup
      const cleanupStart = Date.now();
      dataSources.forEach(ds => ds.disconnect());
      const cleanupTime = Date.now() - cleanupStart;

      // Cleanup should also be fast
      assert.ok(cleanupTime < 500);

      // Wait for all async cleanups
      await delay(200);
      // All should be cleaned up
      const finalStats = ModelRegistry.getStats();
      assert.equal(finalStats.tenantRegistries, 0);
    });
  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
