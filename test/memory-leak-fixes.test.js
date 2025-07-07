// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
const DataSource = require('../lib/datasource').DataSource;
const { ModelRegistry } = require('../lib/model-registry');

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
          port: 3306
        });
        const User = ds.define('User', { name: 'string' });
        dataSources.push(ds);
        
        // Access models to trigger proxy creation
        Object.keys(ds.models).should.containEql('User');
      }
      
      const afterCreationStats = ModelRegistry.getStats();
      
      // Should only have 1 tenant registry (reused for identical configs)
      afterCreationStats.tenantRegistries.should.equal(1);
      
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
          port: 3306 + i
        });
        const User = ds.define('User', { name: 'string' });
        dataSources.push(ds);
      }
      
      const stats = ModelRegistry.getStats();
      
      // Should have 3 tenant registries (different configs)
      stats.tenantRegistries.should.equal(3);
      
      // Cleanup
      dataSources.forEach(ds => ds.disconnect());
    });
  });

  describe('DataSource Disconnect Cleanup', function() {
    it('should clean up ModelRegistryProxy on disconnect', function(done) {
      const ds = new DataSource('memory', { name: 'testdb' });
      const User = ds.define('User', { name: 'string' });

      // Access models to create proxy
      const models = ds.models;
      Object.keys(models).should.containEql('User');

      // Verify proxy exists
      ds.should.have.property('_modelRegistryProxy');

      // Disconnect should clean up proxy
      ds.disconnect();

      // Wait for async cleanup
      setTimeout(() => {
        // Proxy should be cleaned up
        ('_modelRegistryProxy' in ds).should.be.false();
        done();
      }, 10);
    });

    it('should clean up tenant registry with reference counting', function(done) {
      const ds1 = new DataSource('memory', { name: 'shared' });
      const ds2 = new DataSource('memory', { name: 'shared' });

      const User1 = ds1.define('User', { name: 'string' });
      const User2 = ds2.define('User', { name: 'string' });

      // Both should use same tenant registry
      const stats1 = ModelRegistry.getStats();
      stats1.tenantRegistries.should.equal(1);

      // Disconnect first DataSource
      ds1.disconnect();

      setTimeout(() => {
        // Registry should still exist (ds2 still using it)
        const stats2 = ModelRegistry.getStats();
        stats2.tenantRegistries.should.equal(1);

        // Disconnect second DataSource
        ds2.disconnect();

        setTimeout(() => {
          // Registry should be cleaned up now
          const stats3 = ModelRegistry.getStats();
          stats3.tenantRegistries.should.equal(0);
          done();
        }, 10);
      }, 10);
    });
  });

  describe('Memory Leak Prevention', function() {
    it('should not accumulate tenant registries during rapid switching', function(done) {
      const initialStats = ModelRegistry.getStats();

      // Simulate high-frequency tenant switching with same config
      for (let i = 0; i < 50; i++) {
        const ds = new DataSource('memory', {
          name: 'rapidtest',
          host: 'localhost'
        });
        const User = ds.define('User', { name: 'string' });

        // Access models to trigger proxy creation
        Object.keys(ds.models).should.containEql('User');

        // Disconnect immediately
        ds.disconnect();
      }

      // Wait for all async cleanups to complete
      setTimeout(() => {
        const finalStats = ModelRegistry.getStats();

        // Should not accumulate registries (all cleaned up)
        finalStats.tenantRegistries.should.equal(0);
        done();
      }, 100);
    });

    it('should handle mixed configuration scenarios', function(done) {
      const dataSources = [];

      // Create mix of shared and unique configurations
      for (let i = 0; i < 20; i++) {
        const config = i % 5 === 0 ?
          { name: 'shared', host: 'localhost' } :  // Every 5th is shared
          { name: `unique${i}`, host: 'localhost' }; // Others are unique

        const ds = new DataSource('memory', config);
        const User = ds.define('User', { name: 'string' });
        dataSources.push(ds);
      }

      const stats = ModelRegistry.getStats();

      // Should have reasonable number of registries (not 20)
      stats.tenantRegistries.should.be.lessThan(20);
      stats.tenantRegistries.should.be.greaterThan(0);

      // Cleanup all
      dataSources.forEach(ds => ds.disconnect());

      // Wait for all async cleanups
      setTimeout(() => {
        // All should be cleaned up
        const finalStats = ModelRegistry.getStats();
        finalStats.tenantRegistries.should.equal(0);
        done();
      }, 100);
    });
  });

  describe('Reference Counting', function() {
    it('should track DataSource references correctly', function(done) {
      const config = { name: 'reftest', host: 'localhost' };

      // Create first DataSource
      const ds1 = new DataSource('memory', config);
      const User1 = ds1.define('User', { name: 'string' });

      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);

      // Create second DataSource with same config
      const ds2 = new DataSource('memory', config);
      const User2 = ds2.define('User', { name: 'string' });

      // Should still be 1 registry (shared)
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);

      // Disconnect first - registry should remain
      ds1.disconnect();

      setTimeout(() => {
        stats = ModelRegistry.getStats();
        stats.tenantRegistries.should.equal(1);

        // Disconnect second - registry should be cleaned up
        ds2.disconnect();

        setTimeout(() => {
          stats = ModelRegistry.getStats();
          stats.tenantRegistries.should.equal(0);
          done();
        }, 10);
      }, 10);
    });
  });

  describe('Error Handling', function() {
    it('should handle cleanup errors gracefully', function() {
      const ds = new DataSource('memory', { name: 'errortest' });
      const User = ds.define('User', { name: 'string' });
      
      // Mock ModelRegistry to throw error
      const originalCleanup = ModelRegistry.cleanupTenant;
      ModelRegistry.cleanupTenant = function() {
        throw new Error('Cleanup error');
      };
      
      // Disconnect should not throw
      (() => ds.disconnect()).should.not.throw();
      
      // Restore original method
      ModelRegistry.cleanupTenant = originalCleanup;
    });
  });

  describe('Performance', function() {
    it('should maintain reasonable performance with many DataSources', function(done) {
      const startTime = Date.now();
      const dataSources = [];

      // Create many DataSources
      for (let i = 0; i < 100; i++) {
        const ds = new DataSource('memory', {
          name: i % 10 === 0 ? 'shared' : `unique${i}`
        });
        const User = ds.define('User', { name: 'string' });
        dataSources.push(ds);
      }

      const creationTime = Date.now() - startTime;

      // Should complete in reasonable time (less than 1 second)
      creationTime.should.be.lessThan(1000);

      // Cleanup
      const cleanupStart = Date.now();
      dataSources.forEach(ds => ds.disconnect());
      const cleanupTime = Date.now() - cleanupStart;

      // Cleanup should also be fast
      cleanupTime.should.be.lessThan(500);

      // Wait for all async cleanups
      setTimeout(() => {
        // All should be cleaned up
        const finalStats = ModelRegistry.getStats();
        finalStats.tenantRegistries.should.equal(0);
        done();
      }, 200);
    });
  });
});
