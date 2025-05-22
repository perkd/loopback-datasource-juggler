// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
const assert = require('assert');
const path = require('path');

const jdb = require('../');
const ModelBuilder = jdb.ModelBuilder;
const DataSource = jdb.DataSource;
const Memory = require('../lib/connectors/memory');

const {ModelRegistry, arePropertiesEquivalent, findEquivalentAnonymousModel} = require('../lib/model-registry');

describe('ModelRegistry Edge Cases', function() {
  let modelBuilder;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    // Clear the registry before each test
    ModelRegistry.clear();
  });

  describe('Error Handling', function() {
    it('should handle invalid inputs to registerModel gracefully', function() {
      // Test with null
      const result1 = ModelRegistry.registerModel(null);
      should.equal(result1, null);

      // Test with undefined
      const result2 = ModelRegistry.registerModel(undefined);
      should.equal(result2, undefined);

      // Test with object without modelName
      const invalidModel = {settings: {}};
      const result3 = ModelRegistry.registerModel(invalidModel);
      result3.should.equal(invalidModel);

      // Verify nothing was registered
      const stats = ModelRegistry.getStats();
      stats.totalModels.should.equal(0);
    });

    it('should handle errors in getCurrentTenant gracefully', function() {
      // Create a mock path for the multitenant context module
      const mockContextModulePath = path.resolve(__dirname, '../node_modules/@perkd/multitenant-context.js');
      const originalRequireCache = Object.assign({}, require.cache);

      try {
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

        // This should not throw an error
        const model = modelBuilder.define('ErrorModel', {
          name: String,
        });

        ModelRegistry.registerModel(model);

        // Verify it was registered
        const stats = ModelRegistry.getStats();
        stats.totalModels.should.equal(1);
      } finally {
        // Restore original require cache
        require.cache = originalRequireCache;
      }
    });

    it('should handle circular references in properties gracefully', function() {
      // Create a circular reference
      const circular = {};
      circular.self = circular;

      // This should not throw an error
      const fingerprint = ModelRegistry.generateFingerprint(circular);

      // Should return a fallback fingerprint
      fingerprint.should.match(/^error-/);
    });
  });

  describe('getCurrentModelBuilder', function() {
    it('should handle missing ModelBuilder in call stack gracefully', function() {
      // Call directly without being in a ModelBuilder method
      const result = ModelRegistry.getCurrentModelBuilder();
      should.equal(result, null);
    });
  });

  describe('Complex Property Structures', function() {
    it('should handle deeply nested property structures', function() {
      // Define a model with deeply nested properties
      const DeepModel = modelBuilder.define('DeepModel', {
        level1: {
          level2: {
            level3: {
              level4: {
                property: String,
              },
            },
          },
        },
      });

      // Register the model
      ModelRegistry.registerModel(DeepModel);

      // Try to find it
      const found = ModelRegistry.findModelByStructure(DeepModel.definition.properties);
      should.exist(found);
      found.should.equal(DeepModel);
    });

    it('should handle complex array structures', function() {
      // Define a model with complex array properties
      const ArrayModel = modelBuilder.define('ArrayModel', {
        simpleArray: [String],
        objectArray: [{
          name: String,
          value: Number,
        }],
        nestedArrays: [[{
          tag: String,
        }]],
      });

      // Register the model
      ModelRegistry.registerModel(ArrayModel);

      // Try to find it
      const found = ModelRegistry.findModelByStructure(ArrayModel.definition.properties);
      should.exist(found);
      found.should.equal(ArrayModel);
    });

    it('should handle mixed property types correctly', function() {
      // Define a model with mixed property types
      const MixedModel = modelBuilder.define('MixedModel', {
        string: String,
        number: Number,
        boolean: Boolean,
        date: Date,
        object: Object,
        array: Array,
        buffer: Buffer,
        any: '*',
      });

      // Register the model
      ModelRegistry.registerModel(MixedModel);

      // Try to find it
      const found = ModelRegistry.findModelByStructure(MixedModel.definition.properties);
      should.exist(found);
      found.should.equal(MixedModel);
    });
  });

  describe('Model Settings Interaction', function() {
    it('should not reuse models with different strict settings', function() {
      // Create a ModelBuilder with strictEmbeddedModels=true
      const strictBuilder = new ModelBuilder();
      strictBuilder.settings = {strictEmbeddedModels: true};

      // Create a ModelBuilder with strictEmbeddedModels=false
      const nonStrictBuilder = new ModelBuilder();
      nonStrictBuilder.settings = {strictEmbeddedModels: false};

      // Define models with the same properties but different strict settings
      const StrictModel = strictBuilder.define('StrictModel', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      });

      const NonStrictModel = nonStrictBuilder.define('NonStrictModel', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      });

      // Register the strict model
      ModelRegistry.registerModel(StrictModel);

      // Try to find it with the non-strict properties
      const found = ModelRegistry.findModelByStructure(
        NonStrictModel.definition.properties,
        nonStrictBuilder,
      );

      // Should not find it due to different strict settings
      should.not.exist(found);
    });
  });

  describe('Fingerprinting Edge Cases', function() {
    it('should handle properties with special characters in keys', function() {
      // Define a model with special characters in property names
      // Note: Loopback doesn't support dots in property names, so we'll use other special chars
      const SpecialCharsModel = modelBuilder.define('SpecialCharsModel', {
        'property-with-dashes': String,
        'property_with_underscores': Date,
        'property with spaces': Boolean,
        '$property': String,
      });

      // Register the model
      ModelRegistry.registerModel(SpecialCharsModel);

      // Try to find it
      const found = ModelRegistry.findModelByStructure(SpecialCharsModel.definition.properties);
      should.exist(found);
      found.should.equal(SpecialCharsModel);
    });

    it('should handle properties with different type representations', function() {
      // Define models with different ways of specifying types
      const TypesModel1 = modelBuilder.define('TypesModel1', {
        name: String,
        age: Number,
      });

      const TypesModel2 = modelBuilder.define('TypesModel2', {
        name: {type: String},
        age: {type: Number},
      });

      // Register the first model
      ModelRegistry.registerModel(TypesModel1);

      // Get the properties from the second model
      const props2 = TypesModel2.definition.properties;

      // Create a new object with the same structure but without the model references
      const props2Copy = {
        name: {type: String},
        age: {type: Number},
      };

      // Try to find it with the copied properties
      const found = ModelRegistry.findModelByStructure(props2Copy);

      // The fingerprints should be different because the structure is different
      should.not.exist(found);
    });

    it('should handle empty objects and arrays', function() {
      // Define a model with empty objects and arrays
      const EmptyStructuresModel = modelBuilder.define('EmptyStructuresModel', {
        emptyObject: {},
        emptyArray: [],
        objectWithEmptyArray: {arr: []},
        arrayWithEmptyObject: [{}],
      });

      // Register the model
      ModelRegistry.registerModel(EmptyStructuresModel);

      // Try to find it
      const found = ModelRegistry.findModelByStructure(EmptyStructuresModel.definition.properties);
      should.exist(found);
      found.should.equal(EmptyStructuresModel);
    });
  });

  describe('Model Reuse Across DataSources', function() {
    it('should reuse models across different datasources', function() {
      // Create two datasources
      const ds1 = new DataSource('memory');
      const ds2 = new DataSource('memory');

      // Define a model with embedded structure
      const Customer = modelBuilder.define('Customer', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      });

      // Attach to both datasources
      ds1.attach(Customer);
      ds2.attach(Customer);

      // Get the anonymous model for address
      const addressModel = Customer.definition.properties.address.type;

      // Create instances in each datasource
      const customer1 = new Customer({
        name: 'Customer 1',
        address: {
          street: '123 Main St',
          city: 'Anytown',
        },
      });

      const customer2 = new Customer({
        name: 'Customer 2',
        address: {
          street: '456 Oak Ave',
          city: 'Othertown',
        },
      });

      // Verify the address models are the same (reused)
      customer1.address.constructor.should.equal(customer2.address.constructor);
      customer1.address.constructor.should.equal(addressModel);
    });
  });

  describe('arePropertiesEquivalent Edge Cases', function() {
    it('should handle null and undefined values', function() {
      // Test with null values
      arePropertiesEquivalent(null, null).should.be.true();
      arePropertiesEquivalent(null, {}).should.be.false();
      arePropertiesEquivalent({}, null).should.be.false();

      // Test with undefined values
      arePropertiesEquivalent(undefined, undefined).should.be.true();
      arePropertiesEquivalent(undefined, {}).should.be.false();
      arePropertiesEquivalent({}, undefined).should.be.false();
    });

    it('should handle properties with different orders', function() {
      const props1 = {
        a: 1,
        b: 2,
        c: 3,
      };

      const props2 = {
        c: 3,
        a: 1,
        b: 2,
      };

      arePropertiesEquivalent(props1, props2).should.be.true();
    });

    it('should handle nested arrays with different orders', function() {
      const props1 = {
        tags: ['a', 'b', 'c'],
      };

      const props2 = {
        tags: ['a', 'b', 'c'],
      };

      const props3 = {
        tags: ['c', 'b', 'a'],
      };

      arePropertiesEquivalent(props1, props2).should.be.true();
      arePropertiesEquivalent(props1, props3).should.be.false();
    });
  });

  describe('findEquivalentAnonymousModel Edge Cases', function() {
    it('should return null for non-anonymous models', function() {
      // Define a regular named model
      const NamedModel = modelBuilder.define('NamedModel', {
        name: String,
        age: Number,
      });

      // This should return null since it's not anonymous
      const result = findEquivalentAnonymousModel(modelBuilder, NamedModel);
      should.not.exist(result);
    });

    it('should handle models without definitions', function() {
      // Create a mock anonymous model with a minimal definition
      const invalidModel = {
        modelName: 'AnonymousModel_1',
        settings: {anonymous: true},
        definition: {}, // Empty definition
      };

      // This should not throw an error
      const result = findEquivalentAnonymousModel(modelBuilder, invalidModel);
      should.not.exist(result);
    });
  });
});
