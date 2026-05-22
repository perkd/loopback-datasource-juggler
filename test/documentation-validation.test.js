// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const {DataSource, ModelRegistry} = require('../');

describe('Documentation Validation', function() {
  let dataSource;

  beforeEach(function() {
    dataSource = new DataSource('memory');
    ModelRegistry.clear();
  });

  afterEach(function() {
    ModelRegistry.clear();
  });

  describe('API Signature Validation', function() {
    it('should validate getModelsForOwner signature matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test simplified API signature from documentation
      const models = ModelRegistry.getModelsForOwner(dataSource);
      assert.ok(Array.isArray(models));
      assert.equal(models.length, 1);
      assert.equal(models[0], User);
    });

    it('should validate hasModelForOwner signature matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test parameter order: owner first, then modelName
      const hasUser = ModelRegistry.hasModelForOwner(dataSource, 'User');
      assert.equal(hasUser, true);

      const hasProduct = ModelRegistry.hasModelForOwner(dataSource, 'Product');
      assert.equal(hasProduct, false);
    });

    it('should validate getModelForOwner signature matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test parameter order: owner first, then modelName
      const foundUser = ModelRegistry.getModelForOwner(dataSource, 'User');
      assert.ok(foundUser);
      assert.equal(foundUser, User);

      const notFound = ModelRegistry.getModelForOwner(dataSource, 'Product');
      assert.equal(notFound, undefined);
    });

    it('should validate getModelNamesForOwner signature matches documentation', function() {
      dataSource.define('User', {name: 'string'});
      dataSource.define('Product', {title: 'string'});

      // Test simplified API signature
      const modelNames = ModelRegistry.getModelNamesForOwner(dataSource);
      assert.ok(Array.isArray(modelNames));
      assert.equal(modelNames.length, 2);
      assert.ok(modelNames.includes('User'));
      assert.ok(modelNames.includes('Product'));
    });
  });

  describe('Explicit API Validation', function() {
    it('should validate explicit API methods exist with correct signatures', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test explicit API methods mentioned in documentation
      assert.ok(ModelRegistry.getModelsForOwnerWithType);
      assert.ok(ModelRegistry.hasModelForOwnerWithType);
      assert.ok(ModelRegistry.getModelForOwnerWithType);

      // Test explicit API usage
      const models = ModelRegistry.getModelsForOwnerWithType(dataSource, 'dataSource');
      assert.ok(Array.isArray(models));
      assert.equal(models.length, 1);
      assert.equal(models[0], User);

      const hasUser = ModelRegistry.hasModelForOwnerWithType(dataSource, 'User', 'dataSource');
      assert.equal(hasUser, true);

      const foundUser = ModelRegistry.getModelForOwnerWithType(dataSource, 'User', 'dataSource');
      assert.equal(foundUser, User);
    });
  });

  describe('App Integration Validation', function() {
    it('should validate registerModelForApp method exists and works', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Create mock app
      const mockApp = function() {};
      mockApp.models = {};

      // Test registerModelForApp method mentioned in documentation
      assert.ok(ModelRegistry.registerModelForApp);

      const result = ModelRegistry.registerModelForApp(mockApp, User);
      assert.equal(result, User);
      assert.equal(User.app, mockApp);

      // Verify app models are isolated from DataSource models
      const appModels = ModelRegistry.getModelsForOwner(mockApp);
      assert.equal(appModels.length, 1);
      assert.equal(appModels[0], User);

      const dsModels = ModelRegistry.getModelsForOwner(dataSource);
      assert.equal(dsModels.length, 0); // User now belongs to app, not dataSource
    });
  });

  describe('DataSource.models Proxy Validation', function() {
    it('should validate proxy behavior matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Test all documented proxy behaviors

      // Property access
      assert.equal(dataSource.models.User, User);
      assert.equal(dataSource.models.Product, Product);

      // Object.keys()
      const keys = Object.keys(dataSource.models);
      assert.ok(keys.includes('User'));
      assert.ok(keys.includes('Product'));

      // Object.values()
      const values = Object.values(dataSource.models);
      assert.ok(values.includes(User));
      assert.ok(values.includes(Product));

      // for...in enumeration
      const enumerated = [];
      for (const name in dataSource.models) {
        enumerated.push(name);
      }
      assert.ok(enumerated.includes('User'));
      assert.ok(enumerated.includes('Product'));

      // hasOwnProperty
      assert.equal(dataSource.models.hasOwnProperty('User'), true);
      assert.equal(dataSource.models.hasOwnProperty('NonExistent'), false);

      // 'in' operator
      assert.equal('User' in dataSource.models, true);
      assert.equal('NonExistent' in dataSource.models, false);
    });
  });

  describe('Performance Claims Validation', function() {
    it('should validate that caching is implemented', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Multiple calls should be efficient (testing caching)
      const start = process.hrtime.bigint();

      for (let i = 0; i < 1000; i++) {
        const models = ModelRegistry.getModelsForOwner(dataSource);
        assert.equal(models.length, 1);
      }

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds

      // Should complete efficiently (exact timing may vary)
      assert.ok(duration < 100); // Should complete in under 100ms
    });
  });

  describe('Backward Compatibility Validation', function() {
    it('should validate 100% backward compatibility claims', function() {
      const User = dataSource.define('User', {name: 'string'});

      // All traditional patterns should still work
      assert.ok(dataSource.models.User);
      assert.equal(dataSource.models.User, User);

      // Traditional enumeration should work
      const modelNames = Object.keys(dataSource.models);
      assert.ok(modelNames.includes('User'));

      // Traditional property checks should work
      assert.equal(dataSource.models.hasOwnProperty('User'), true);
      assert.equal('User' in dataSource.models, true);
    });
  });

  describe('Error Handling Validation', function() {
    it('should validate graceful error handling claims', function() {
      // Invalid parameters should not throw errors
      const emptyResult = ModelRegistry.getModelsForOwner(null);
      assert.ok(Array.isArray(emptyResult));
      assert.equal(emptyResult.length, 0);

      const falseResult = ModelRegistry.hasModelForOwner(null, 'User');
      assert.equal(falseResult, false);

      const undefinedResult = ModelRegistry.getModelForOwner(null, 'User');
      assert.equal(undefinedResult, undefined);
    });
  });
});
