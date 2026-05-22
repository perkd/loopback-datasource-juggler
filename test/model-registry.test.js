// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const jdb = require('../');
const ModelBuilder = jdb.ModelBuilder;
const DataSource = jdb.DataSource;
const Memory = require('../lib/connectors/memory');

const {ModelRegistry, arePropertiesEquivalent, findEquivalentAnonymousModel} = require('../lib/model-registry');

describe('ModelRegistry', function() {
  let modelBuilder;
  let TestModel;
  let AnotherModel;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    // Clear the registry before each test
    ModelRegistry.clear();

    // Create test models
    TestModel = modelBuilder.define('TestModel', {
      name: String,
      age: Number,
      active: Boolean,
    });

    AnotherModel = modelBuilder.define('AnotherModel', {
      title: String,
      description: String,
    });
  });

  describe('registerModel', function() {
    it('should register a model in the registry', function() {
      const result = ModelRegistry.registerModel(TestModel);
      assert.equal(result, TestModel);

      // Verify it's registered by checking stats
      const stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 1);
      assert.equal(stats.uniqueModels, 1);
    });

    it('should return the model if it has no modelName', function() {
      const invalidModel = {};
      const result = ModelRegistry.registerModel(invalidModel);
      assert.equal(result, invalidModel);

      // Verify nothing was registered
      const stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 0);
    });

    it('should register multiple models', function() {
      ModelRegistry.registerModel(TestModel);
      ModelRegistry.registerModel(AnotherModel);

      const stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 2);
      assert.equal(stats.uniqueModels, 2);
    });
  });

  describe('findModelByStructure', function() {
    it('should find a model by its structure', function() {
      // Register a model with its properties
      const properties = {
        name: String,
        age: Number,
        active: Boolean,
      };

      ModelRegistry.registerModel(TestModel, properties);

      // Find it by its properties
      const found = ModelRegistry.findModelByStructure(properties);
      assert.ok(found);
      assert.equal(found, TestModel);

      // Verify reuse count
      const stats = ModelRegistry.getStats();
      assert.equal(stats.reuseCount, 1);
    });

    it('should return null if no matching model is found', function() {
      // Register a model
      ModelRegistry.registerModel(TestModel);

      // Try to find with different properties
      const properties = {
        title: String,
        description: String,
      };

      const found = ModelRegistry.findModelByStructure(properties);
      assert.equal(found, null);
    });

    it('should return null if properties are not provided', function() {
      const found = ModelRegistry.findModelByStructure(null);
      assert.equal(found, null);
    });
  });

  describe('findModelByName', function() {
    it('should find a model by its name', function() {
      // Register a model
      ModelRegistry.registerModel(TestModel);

      // Find it by name
      const found = ModelRegistry.findModelByName('TestModel');
      assert.equal(found, TestModel);
    });

    it('should return undefined if no matching model is found', function() {
      // Register a model
      ModelRegistry.registerModel(TestModel);

      // Try to find with a non-existent name
      const found = ModelRegistry.findModelByName('NonExistentModel');
      assert.equal(found, undefined);
    });
  });

  describe('generateFingerprint', function() {
    it('should generate a consistent fingerprint for the same properties', function() {
      const properties1 = {
        name: String,
        age: Number,
      };

      const properties2 = {
        name: String,
        age: Number,
      };

      const fingerprint1 = ModelRegistry.generateFingerprint(properties1);
      const fingerprint2 = ModelRegistry.generateFingerprint(properties2);

      assert.equal(fingerprint1, fingerprint2);
    });

    it('should generate different fingerprints for different properties', function() {
      const properties1 = {
        name: String,
        age: Number,
        active: Boolean,
        created: Date,
      };

      const properties2 = {
        title: String,
        description: String,
        published: Boolean,
        tags: [String],
      };

      const fingerprint1 = ModelRegistry.generateFingerprint(properties1);
      const fingerprint2 = ModelRegistry.generateFingerprint(properties2);

      // Make sure the fingerprints are different
      assert.notEqual(fingerprint1, fingerprint2);
    });
  });

  describe('normalizeProperties', function() {
    it('should normalize properties with sorted keys', function() {
      const properties = {
        b: 'value',
        a: 'value',
      };

      const normalized = ModelRegistry.normalizeProperties(properties);
      assert.deepEqual(Object.keys(normalized), ['a', 'b']);
    });

    it('should handle type property specially', function() {
      const properties = {
        name: {
          type: String,
        },
      };

      const normalized = ModelRegistry.normalizeProperties(properties);
      assert.equal(normalized.name.type, 'String');
    });

    it('should handle nested objects', function() {
      const properties = {
        address: {
          street: {type: String},
          city: {type: String},
        },
      };

      const normalized = ModelRegistry.normalizeProperties(properties);
      assert.equal(normalized.address.street.type, 'String');
      assert.equal(normalized.address.city.type, 'String');
    });

    it('should handle arrays', function() {
      const properties = {
        tags: [{type: String}],
      };

      const normalized = ModelRegistry.normalizeProperties(properties);
      assert.equal(normalized.tags[0].type, 'String');
    });
  });

  describe('getStats', function() {
    it('should return statistics about the registry', function() {
      // Register models
      ModelRegistry.registerModel(TestModel);
      ModelRegistry.findModelByStructure(TestModel.definition.properties);

      const stats = ModelRegistry.getStats();
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'totalModels'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'reuseCount'));
      assert.ok(Object.prototype.hasOwnProperty.call(stats, 'uniqueModels'));
      assert.equal(stats.totalModels, 1);
      assert.equal(stats.reuseCount, 1);
      assert.equal(stats.uniqueModels, 1);
    });
  });

  describe('clear', function() {
    it('should clear the registry', function() {
      // Register models
      ModelRegistry.registerModel(TestModel);
      ModelRegistry.registerModel(AnotherModel);

      // Verify they're registered
      let stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 2);

      // Clear the registry
      ModelRegistry.clear();

      // Verify it's cleared
      stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 0);
      assert.equal(stats.uniqueModels, 0);
      assert.equal(stats.reuseCount, 0);
    });
  });
});

describe('Enhanced Fingerprinting', function() {
  let modelBuilder;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    // Clear the registry before each test
    ModelRegistry.clear();
  });

  describe('Basic fingerprinting', function() {
    it('should generate consistent fingerprints for identical structures', function() {
      const props1 = {
        name: String,
        age: Number,
      };

      const props2 = {
        name: String,
        age: Number,
      };

      const fingerprint1 = ModelRegistry.generateFingerprint(props1);
      const fingerprint2 = ModelRegistry.generateFingerprint(props2);

      assert.equal(fingerprint1, fingerprint2);
    });

    it('should generate different fingerprints for different property names', function() {
      const props1 = {
        name: String,
        age: Number,
      };

      const props2 = {
        firstName: String,
        years: Number,
      };

      const fingerprint1 = ModelRegistry.generateFingerprint(props1);
      const fingerprint2 = ModelRegistry.generateFingerprint(props2);

      assert.notEqual(fingerprint1, fingerprint2);
    });

    it('should handle property types correctly', function() {
      // Create models with different property types
      const model1 = modelBuilder.define('TypeTest1', {
        name: String,
        age: Number,
      });

      const model2 = modelBuilder.define('TypeTest2', {
        name: String,
        age: String, // Different type
      });

      // Register the models
      ModelRegistry.registerModel(model1);
      ModelRegistry.registerModel(model2);

      // Both models should be in the registry
      const stats = ModelRegistry.getStats();
      assert.equal(stats.totalModels, 2);
    });
  });

  describe('Structure type detection', function() {
    it('should detect simple structures', function() {
      const simpleProps = {name: String, age: Number};
      assert.equal(ModelRegistry.determineStructureType(simpleProps), 'simple');
    });

    it('should detect array structures', function() {
      const arrayProps = {tags: [String]};
      assert.equal(ModelRegistry.determineStructureType(arrayProps), 'complex');
    });

    it('should detect complex structures', function() {
      const complexProps = {address: {street: String}};
      assert.equal(ModelRegistry.determineStructureType(complexProps), 'complex');
    });

    it('should handle invalid inputs', function() {
      assert.equal(ModelRegistry.determineStructureType(null), 'invalid');
      assert.equal(ModelRegistry.determineStructureType(undefined), 'invalid');
      assert.equal(ModelRegistry.determineStructureType('not-an-object'), 'invalid');
      assert.equal(ModelRegistry.determineStructureType(123), 'invalid');
    });
  });

  describe('Structure depth calculation', function() {
    it('should calculate depth correctly for simple structures', function() {
      const depth0 = {name: String};
      assert.equal(ModelRegistry.calculateStructureDepth(depth0), 0);
    });

    it('should calculate depth correctly for nested structures', function() {
      const depth1 = {address: {street: String}};
      assert.equal(ModelRegistry.calculateStructureDepth(depth1), 1);
    });

    it('should calculate depth correctly for deeply nested structures', function() {
      const depth2 = {user: {address: {street: String}}};
      assert.equal(ModelRegistry.calculateStructureDepth(depth2), 2);
    });

    it('should handle invalid inputs', function() {
      assert.equal(ModelRegistry.calculateStructureDepth(null), 0);
      assert.equal(ModelRegistry.calculateStructureDepth(undefined), 0);
      assert.equal(ModelRegistry.calculateStructureDepth('not-an-object'), 0);
      assert.equal(ModelRegistry.calculateStructureDepth(123), 0);
    });
  });

  describe('Hash function', function() {
    it('should generate consistent hashes for the same input', function() {
      const input = 'test-string';
      const hash1 = ModelRegistry.createHash(input);
      const hash2 = ModelRegistry.createHash(input);

      assert.equal(hash1, hash2);
    });

    it('should generate different hashes for different inputs', function() {
      const hash1 = ModelRegistry.createHash('input1');
      const hash2 = ModelRegistry.createHash('input2');

      assert.notEqual(hash1, hash2);
    });

    it('should handle invalid inputs', function() {
      assert.equal(ModelRegistry.createHash(null), 'invalid-input');
      assert.equal(ModelRegistry.createHash(undefined), 'invalid-input');
      assert.equal(ModelRegistry.createHash(123), 'invalid-input');
    });
  });

  describe('Error handling', function() {
    it('should handle circular references gracefully', function() {
      // Create a circular reference
      const circular = {};
      circular.self = circular;

      // This should not throw an error
      const fingerprint = ModelRegistry.generateFingerprint(circular);

      // Should return a fallback fingerprint
      assert.match(fingerprint, /^error-/);
    });

    it('should handle invalid inputs to generateFingerprint', function() {
      assert.equal(ModelRegistry.generateFingerprint(null), 'invalid-properties');
      assert.equal(ModelRegistry.generateFingerprint(undefined), 'invalid-properties');
      assert.equal(ModelRegistry.generateFingerprint('not-an-object'), 'invalid-properties');
      assert.equal(ModelRegistry.generateFingerprint(123), 'invalid-properties');
    });
  });
});

describe('arePropertiesEquivalent', function() {
  it('should return true for identical property objects', function() {
    const props1 = {
      name: String,
      age: Number,
      active: Boolean,
    };

    const props2 = {
      name: String,
      age: Number,
      active: Boolean,
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, true);
  });

  it('should return true for same object reference', function() {
    const props = {
      name: String,
      age: Number,
    };

    const result = arePropertiesEquivalent(props, props);
    assert.equal(result, true);
  });

  it('should return false for objects with different property counts', function() {
    const props1 = {
      name: String,
      age: Number,
    };

    const props2 = {
      name: String,
      age: Number,
      active: Boolean,
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, false);
  });

  it('should return false for objects with different property names', function() {
    const props1 = {
      name: String,
      age: Number,
    };

    const props2 = {
      name: String,
      years: Number,
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, false);
  });

  it('should return false for objects with different property values', function() {
    const props1 = {
      name: String,
      age: Number,
    };

    const props2 = {
      name: String,
      age: String,
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, false);
  });

  it('should handle nested objects', function() {
    const props1 = {
      name: String,
      address: {
        street: String,
        city: String,
      },
    };

    const props2 = {
      name: String,
      address: {
        street: String,
        city: String,
      },
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, true);
  });

  it('should handle arrays', function() {
    const props1 = {
      name: String,
      tags: [String],
    };

    const props2 = {
      name: String,
      tags: [String],
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, true);
  });

  it('should handle arrays with different lengths', function() {
    const props1 = {
      name: String,
      tags: [String, Number],
    };

    const props2 = {
      name: String,
      tags: [String],
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, false);
  });

  it('should handle type property specially', function() {
    const props1 = {
      name: {
        type: String,
      },
    };

    const props2 = {
      name: {
        type: 'String',
      },
    };

    const result = arePropertiesEquivalent(props1, props2);
    assert.equal(result, true);
  });
});

describe('findEquivalentAnonymousModel', function() {
  let modelBuilder;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    // Clear the registry before each test
    ModelRegistry.clear();
  });

  it('should return null for non-anonymous models', function() {
    const TestModel = modelBuilder.define('TestModel', {
      name: String,
      age: Number,
    });

    const result = findEquivalentAnonymousModel(modelBuilder, TestModel);
    assert.equal(result, null);
  });

  it('should find an equivalent anonymous model', function() {
    // Create an anonymous model
    const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
      name: String,
      age: Number,
    }, {anonymous: true});

    // Create a source model with the same properties
    const sourceModel = modelBuilder.define('AnonymousModel_2', {
      name: String,
      age: Number,
    }, {anonymous: true});

    // Store the anonymous model in the modelBuilder
    modelBuilder.models['AnonymousModel_1'] = AnonymousModel;

    const result = findEquivalentAnonymousModel(modelBuilder, sourceModel);
    assert.equal(result, AnonymousModel);
  });

  it('should return null if no equivalent anonymous model is found', function() {
    // Create an anonymous model
    const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
      name: String,
      age: Number,
    }, {anonymous: true});

    // Create a source model with different properties
    const sourceModel = {
      modelName: 'AnonymousModel_2',
      settings: {anonymous: true},
      definition: {
        properties: {
          title: String,
          description: String,
        },
      },
    };

    // Store the anonymous model in the modelBuilder
    modelBuilder.models['AnonymousModel_1'] = AnonymousModel;

    const result = findEquivalentAnonymousModel(modelBuilder, sourceModel);
    assert.equal(result, null);
  });
});

describe('Tenant Isolation', function() {
  let modelBuilder;
  let originalRequireCache;
  let mockContextModulePath;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    // Clear the registry before each test
    ModelRegistry.clear();

    // Save original require cache
    originalRequireCache = Object.assign({}, require.cache);

    // Create a mock path for the multitenant context module
    mockContextModulePath = path.resolve(__dirname, '../node_modules/@perkd/multitenant-context.js');
  });

  afterEach(function() {
    // Restore original require cache
    require.cache = originalRequireCache;
  });

  describe('Tenant context handling', function() {
    it('should handle missing tenant context gracefully', function() {
      // No mock context module - should fall back to null tenant

      // Register a model
      const model = modelBuilder.define('NoTenantModel', {
        name: String,
      });

      // This should not throw an error
      ModelRegistry.registerModel(model);

      // Find the model
      const found = ModelRegistry.findModelByStructure(model.definition.properties);

      // Should still find the model
      assert.equal(found, model);
    });

    it('should handle errors in context detection gracefully', function() {
      // Mock a context module that throws an error
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            get tenant() {
              throw new Error('Simulated context error');
            },
          },
        },
      };

      // Register a model
      const model = modelBuilder.define('ErrorTenantModel', {
        name: String,
      });

      // This should not throw an error
      ModelRegistry.registerModel(model);

      // Find the model
      const found = ModelRegistry.findModelByStructure(model.definition.properties);

      // Should still find the model
      assert.equal(found, model);
    });
  });

  describe('Model reuse across tenants', function() {
    it('should reuse models with the same structure', function() {
      // Create a model with an embedded structure
      const Customer = modelBuilder.define('Customer', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      });

      // Create another model with the same embedded structure
      const Employee = modelBuilder.define('Employee', {
        name: String,
        homeAddress: {
          street: String,
          city: String,
        },
      });

      // Get the anonymous models
      const addressModel1 = Customer.definition.properties.address.type;
      const addressModel2 = Employee.definition.properties.homeAddress.type;

      // They should be the same model instance
      assert.equal(addressModel1, addressModel2);

      // Check registry stats
      const stats = ModelRegistry.getStats();
      assert.ok(stats.reuseCount > 0);
    });

    it('should handle different tenant contexts when reusing models', function() {
      // Set up first tenant context
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: 'tenant-1',
          },
        },
      };

      // Create a model with an embedded structure for first tenant
      const Order = modelBuilder.define('Order', {
        id: Number,
        items: [{
          name: String,
          price: Number,
        }],
      });

      // Change to second tenant context
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: 'tenant-2',
          },
        },
      };

      // Create a model with the same embedded structure for second tenant
      const Invoice = modelBuilder.define('Invoice', {
        id: Number,
        products: [{
          name: String,
          price: Number,
        }],
      });

      // Get the anonymous models
      const itemModel = Order.definition.properties.items.type;
      const productModel = Invoice.definition.properties.products.type;

      // The array item types should be the same model instance
      assert.equal(itemModel[0], productModel[0]);

      // Check registry stats
      const stats = ModelRegistry.getStats();
      assert.ok(stats.reuseCount > 0);
    });
  });
});
