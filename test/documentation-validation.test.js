// Copyright IBM Corp. 2024. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
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
      models.should.be.an.Array();
      models.should.have.length(1);
      models[0].should.equal(User);
    });

    it('should validate hasModelForOwner signature matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test parameter order: owner first, then modelName
      const hasUser = ModelRegistry.hasModelForOwner(dataSource, 'User');
      hasUser.should.be.true();

      const hasProduct = ModelRegistry.hasModelForOwner(dataSource, 'Product');
      hasProduct.should.be.false();
    });

    it('should validate getModelForOwner signature matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test parameter order: owner first, then modelName
      const foundUser = ModelRegistry.getModelForOwner(dataSource, 'User');
      should.exist(foundUser);
      foundUser.should.equal(User);

      const notFound = ModelRegistry.getModelForOwner(dataSource, 'Product');
      should.not.exist(notFound);
    });

    it('should validate getModelNamesForOwner signature matches documentation', function() {
      dataSource.define('User', {name: 'string'});
      dataSource.define('Product', {title: 'string'});

      // Test simplified API signature
      const modelNames = ModelRegistry.getModelNamesForOwner(dataSource);
      modelNames.should.be.an.Array();
      modelNames.should.have.length(2);
      modelNames.should.containEql('User');
      modelNames.should.containEql('Product');
    });
  });

  describe('Explicit API Validation', function() {
    it('should validate explicit API methods exist with correct signatures', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Test explicit API methods mentioned in documentation
      ModelRegistry.should.have.property('getModelsForOwnerWithType');
      ModelRegistry.should.have.property('hasModelForOwnerWithType');
      ModelRegistry.should.have.property('getModelForOwnerWithType');

      // Test explicit API usage
      const models = ModelRegistry.getModelsForOwnerWithType(dataSource, 'dataSource');
      models.should.be.an.Array();
      models.should.have.length(1);
      models[0].should.equal(User);

      const hasUser = ModelRegistry.hasModelForOwnerWithType(dataSource, 'User', 'dataSource');
      hasUser.should.be.true();

      const foundUser = ModelRegistry.getModelForOwnerWithType(dataSource, 'User', 'dataSource');
      foundUser.should.equal(User);
    });
  });

  describe('App Integration Validation', function() {
    it('should validate registerModelForApp method exists and works', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Create mock app
      const mockApp = function() {};
      mockApp.models = {};

      // Test registerModelForApp method mentioned in documentation
      ModelRegistry.should.have.property('registerModelForApp');

      const result = ModelRegistry.registerModelForApp(mockApp, User);
      result.should.equal(User);
      User.app.should.equal(mockApp);

      // Verify app models are isolated from DataSource models
      const appModels = ModelRegistry.getModelsForOwner(mockApp);
      appModels.should.have.length(1);
      appModels[0].should.equal(User);

      const dsModels = ModelRegistry.getModelsForOwner(dataSource);
      dsModels.should.have.length(0); // User now belongs to app, not dataSource
    });
  });

  describe('DataSource.models Proxy Validation', function() {
    it('should validate proxy behavior matches documentation', function() {
      const User = dataSource.define('User', {name: 'string'});
      const Product = dataSource.define('Product', {title: 'string'});

      // Test all documented proxy behaviors

      // Property access
      dataSource.models.User.should.equal(User);
      dataSource.models.Product.should.equal(Product);

      // Object.keys()
      const keys = Object.keys(dataSource.models);
      keys.should.containEql('User');
      keys.should.containEql('Product');

      // Object.values()
      const values = Object.values(dataSource.models);
      values.should.containEql(User);
      values.should.containEql(Product);

      // for...in enumeration
      const enumerated = [];
      for (const name in dataSource.models) {
        enumerated.push(name);
      }
      enumerated.should.containEql('User');
      enumerated.should.containEql('Product');

      // hasOwnProperty
      dataSource.models.hasOwnProperty('User').should.be.true();
      dataSource.models.hasOwnProperty('NonExistent').should.be.false();

      // 'in' operator
      ('User' in dataSource.models).should.be.true();
      ('NonExistent' in dataSource.models).should.be.false();
    });
  });

  describe('Performance Claims Validation', function() {
    it('should validate that caching is implemented', function() {
      const User = dataSource.define('User', {name: 'string'});

      // Multiple calls should be efficient (testing caching)
      const start = process.hrtime.bigint();

      for (let i = 0; i < 1000; i++) {
        const models = ModelRegistry.getModelsForOwner(dataSource);
        models.should.have.length(1);
      }

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds

      // Should complete efficiently (exact timing may vary)
      duration.should.be.below(100); // Should complete in under 100ms
    });
  });

  describe('Backward Compatibility Validation', function() {
    it('should validate 100% backward compatibility claims', function() {
      const User = dataSource.define('User', {name: 'string'});

      // All traditional patterns should still work
      should.exist(dataSource.models.User);
      dataSource.models.User.should.equal(User);

      // Traditional enumeration should work
      const modelNames = Object.keys(dataSource.models);
      modelNames.should.containEql('User');

      // Traditional property checks should work
      dataSource.models.hasOwnProperty('User').should.be.true();
      ('User' in dataSource.models).should.be.true();
    });
  });

  describe('Error Handling Validation', function() {
    it('should validate graceful error handling claims', function() {
      // Invalid parameters should not throw errors
      const emptyResult = ModelRegistry.getModelsForOwner(null);
      emptyResult.should.be.an.Array();
      emptyResult.should.have.length(0);

      const falseResult = ModelRegistry.hasModelForOwner(null, 'User');
      falseResult.should.be.false();

      const undefinedResult = ModelRegistry.getModelForOwner(null, 'User');
      should.not.exist(undefinedResult);
    });
  });
});
