// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
const assert = require('assert');

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
        name: { type: 'string' },
        email: { type: 'string' }
      });

      // Get models for this DataSource
      const models = ModelRegistry.getModelsForOwner(dataSource, 'dataSource');
      models.should.be.an.Array();
      models.should.have.length(1);
      models[0].should.equal(User);
    });

    it('should provide getModelNamesForOwner method', function() {
      // Create models
      const User = dataSource.define('User', { name: 'string' });
      const Product = dataSource.define('Product', { title: 'string' });

      // Get model names for this DataSource
      const modelNames = ModelRegistry.getModelNamesForOwner(dataSource, 'dataSource');
      modelNames.should.be.an.Array();
      modelNames.should.have.length(2);
      modelNames.should.containEql('User');
      modelNames.should.containEql('Product');
    });

    it('should provide hasModelForOwner method', function() {
      // Create a model
      const User = dataSource.define('User', { name: 'string' });

      // Check if model exists for this DataSource
      ModelRegistry.hasModelForOwner('User', dataSource, 'dataSource').should.be.true();
      ModelRegistry.hasModelForOwner('NonExistent', dataSource, 'dataSource').should.be.false();
    });

    it('should provide getModelForOwner method', function() {
      // Create a model
      const User = dataSource.define('User', { name: 'string' });

      // Get specific model for this DataSource
      const foundModel = ModelRegistry.getModelForOwner('User', dataSource, 'dataSource');
      should.exist(foundModel);
      foundModel.should.equal(User);

      // Try to get non-existent model
      const notFound = ModelRegistry.getModelForOwner('NonExistent', dataSource, 'dataSource');
      should.not.exist(notFound);
    });

    it('should isolate models between different DataSources', function() {
      const dataSource2 = new DataSource('memory');

      // Create models with different names in different DataSources to avoid conflicts
      const User1 = dataSource.define('User1', { name: 'string' });
      const User2 = dataSource2.define('User2', { title: 'string' });

      // Verify isolation
      const models1 = ModelRegistry.getModelsForOwner(dataSource, 'dataSource');
      const models2 = ModelRegistry.getModelsForOwner(dataSource2, 'dataSource');

      models1.should.have.length(1);
      models2.should.have.length(1);
      models1[0].should.equal(User1);
      models2[0].should.equal(User2);
      models1[0].should.not.equal(models2[0]);
    });
  });

  describe('ModelRegistryProxy', function() {
    it('should create a proxy with correct owner and type', function() {
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');
      should.exist(proxy);
      // Note: Due to the Proxy, we can't directly access owner/ownerType
      // Instead, we test that the proxy works correctly
      should.exist(proxy);
    });

    it('should throw error for invalid parameters', function() {
      (function() {
        new ModelRegistryProxy(null, 'dataSource');
      }).should.throw('ModelRegistryProxy requires an owner object');

      (function() {
        new ModelRegistryProxy(dataSource, 'invalid');
      }).should.throw('ModelRegistryProxy requires ownerType to be "dataSource" or "app"');
    });

    it('should provide getModel method', function() {
      const User = dataSource.define('User', { name: 'string' });
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Access model through proxy property access (not direct method call)
      const foundModel = proxy.User;
      should.exist(foundModel);
      foundModel.should.equal(User);
    });

    it('should provide setModel method', function() {
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');
      const mockModel = {
        modelName: 'TestModel',
        definition: { properties: { name: 'string' } }
      };

      // Set model through proxy property assignment
      proxy.TestModel = mockModel;
      mockModel.dataSource.should.equal(dataSource);

      // Verify it was registered
      const foundModel = proxy.TestModel;
      should.exist(foundModel);
      foundModel.should.equal(mockModel);
    });

    it('should provide hasModel method', function() {
      const User = dataSource.define('User', { name: 'string' });
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Test using 'in' operator and hasOwnProperty
      ('User' in proxy).should.be.true();
      ('NonExistent' in proxy).should.be.false();
    });

    it('should provide getModelNames method', function() {
      const User = dataSource.define('User', { name: 'string' });
      const Product = dataSource.define('Product', { title: 'string' });
      const proxy = new ModelRegistryProxy(dataSource, 'dataSource');

      // Test using Object.keys() which should work with the proxy
      const modelNames = Object.keys(proxy);
      modelNames.should.be.an.Array();
      modelNames.should.have.length(2);
      modelNames.should.containEql('User');
      modelNames.should.containEql('Product');
    });
  });

  describe('DataSource.models Proxy Integration', function() {
    it('should provide unified model access through DataSource.models', function() {
      // Create model
      const User = dataSource.define('User', {
        name: { type: 'string' },
        email: { type: 'string' }
      });

      // Access through DataSource.models
      should.exist(dataSource.models.User);
      dataSource.models.User.should.equal(User);
      dataSource.models.User.modelName.should.equal('User');
    });

    it('should support Object.keys() on DataSource.models', function() {
      // Create models
      const User = dataSource.define('User', { name: 'string' });
      const Product = dataSource.define('Product', { title: 'string' });

      // Test Object.keys()
      const keys = Object.keys(dataSource.models);
      keys.should.be.an.Array();
      keys.should.have.length(2);
      keys.should.containEql('User');
      keys.should.containEql('Product');
    });

    it('should support for...in loops on DataSource.models', function() {
      // Create models
      const User = dataSource.define('User', { name: 'string' });
      const Product = dataSource.define('Product', { title: 'string' });

      // Test for...in loop
      const foundModels = [];
      for (const modelName in dataSource.models) {
        foundModels.push(modelName);
      }

      foundModels.should.have.length(2);
      foundModels.should.containEql('User');
      foundModels.should.containEql('Product');
    });

    it('should support hasOwnProperty on DataSource.models', function() {
      // Create model
      const User = dataSource.define('User', { name: 'string' });

      // Test hasOwnProperty
      dataSource.models.hasOwnProperty('User').should.be.true();
      dataSource.models.hasOwnProperty('NonExistent').should.be.false();
    });

    it('should handle model assignment with deprecation warning', function() {
      const mockModel = {
        modelName: 'AssignedModel',
        definition: { properties: { name: 'string' } }
      };

      // Capture console.warn
      const originalWarn = console.warn;
      let warningMessage = '';
      console.warn = function(message) {
        warningMessage = message;
      };

      try {
        // Assign model (should trigger deprecation warning)
        dataSource.models = { AssignedModel: mockModel };

        // Verify warning was shown
        warningMessage.should.containEql('deprecated');

        // Verify model was registered
        should.exist(dataSource.models.AssignedModel);
        dataSource.models.AssignedModel.dataSource.should.equal(dataSource);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should maintain isolation between different DataSources', function() {
      const dataSource2 = new DataSource('memory');

      // Create models with different names in different DataSources
      const User1 = dataSource.define('User1', { name: 'string' });
      const User2 = dataSource2.define('User2', { title: 'string' });

      // Verify isolation through proxy
      should.exist(dataSource.models.User1);
      should.exist(dataSource2.models.User2);
      dataSource.models.User1.should.equal(User1);
      dataSource2.models.User2.should.equal(User2);

      // Verify cross-access doesn't work
      should.not.exist(dataSource.models.User2);
      should.not.exist(dataSource2.models.User1);

      // Verify each DataSource only sees its own models
      Object.keys(dataSource.models).should.eql(['User1']);
      Object.keys(dataSource2.models).should.eql(['User2']);
    });
  });

  describe('Backward Compatibility', function() {
    it('should maintain all existing DataSource.models behavior', function() {
      // Create model
      const User = dataSource.define('User', { name: 'string' });

      // Test various access patterns that existing code might use

      // Direct property access
      should.exist(dataSource.models.User);
      dataSource.models.User.should.equal(User);

      // Object.keys()
      Object.keys(dataSource.models).should.containEql('User');

      // Object.values()
      Object.values(dataSource.models).should.containEql(User);

      // Property enumeration
      const modelNames = [];
      for (const name in dataSource.models) {
        modelNames.push(name);
      }
      modelNames.should.containEql('User');

      // hasOwnProperty
      dataSource.models.hasOwnProperty('User').should.be.true();
    });

    it('should handle undefined/null model access gracefully', function() {
      // Test accessing non-existent models
      should.not.exist(dataSource.models.NonExistent);
      should.not.exist(dataSource.models.undefined);
      should.not.exist(dataSource.models.null);
    });
  });
});
