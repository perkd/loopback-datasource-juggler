'use strict';

const should = require('./init.js');
const assert = require('assert');

const jdb = require('../');
const ModelBuilder = jdb.ModelBuilder;
const {ModelRegistry, registryManager} = require('../lib/model-registry');

describe('Tenant-Aware ModelRegistry', function() {
  let modelBuilder;

  // Centralized tenant context mocking system
  const TenantContextMocker = {
    _originalRequire: null,
    _isInitialized: false,

    init() {
      if (!this._isInitialized) {
        const Module = require('module');
        this._originalRequire = Module.prototype.require;
        this._isInitialized = true;
      }
    },

    setupTenantContext(tenantCode) {
      this.init();
      const Module = require('module');
      const originalRequire = this._originalRequire;

      Module.prototype.require = function(id) {
        if (id === '@perkd/multitenant-context') {
          return {
            Context: {
              tenant: tenantCode
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };
    },

    setupNoTenantContext() {
      this.init();
      const Module = require('module');
      const originalRequire = this._originalRequire;

      Module.prototype.require = function(id) {
        if (id === '@perkd/multitenant-context') {
          throw new Error('Module not found');
        }
        return originalRequire.apply(this, arguments);
      };
    },

    setupErrorTenantContext() {
      this.init();
      const Module = require('module');
      const originalRequire = this._originalRequire;

      Module.prototype.require = function(id) {
        if (id === '@perkd/multitenant-context') {
          return {
            Context: {
              get tenant() {
                throw new Error('Context error');
              }
            }
          };
        }
        return originalRequire.apply(this, arguments);
      };
    },

    restore() {
      if (this._isInitialized && this._originalRequire) {
        const Module = require('module');
        Module.prototype.require = this._originalRequire;
      }
    }
  };

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    ModelRegistry.clear();
    registryManager.reset();
    TenantContextMocker.init();
  });

  afterEach(function() {
    // Restore original require function
    TenantContextMocker.restore();

    // Stop any running cleanup timers
    if (registryManager) {
      registryManager.stopPeriodicCleanup();
    }
  });

  describe('Enhanced Model Tracking and Cleanup', function() {

    it('should track models comprehensively during registration', function() {
      TenantContextMocker.setupTenantContext('tracking-test-tenant');

      const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
        name: String,
        value: Number
      }, {anonymous: true});

      ModelRegistry.registerModel(AnonymousModel);

      // Verify comprehensive tracking
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(1);

      // Verify model is findable
      const foundByName = ModelRegistry.findModelByName('AnonymousModel_1');
      foundByName.should.equal(AnonymousModel);

      const foundByStructure = ModelRegistry.findModelByStructure({
        name: String,
        value: Number
      });
      foundByStructure.should.equal(AnonymousModel);
    });

    it('should perform comprehensive cleanup when tenant is removed', function() {
      TenantContextMocker.setupTenantContext('cleanup-comprehensive-tenant');

      // Register multiple models
      const Model1 = modelBuilder.define('ComprehensiveModel_1', {
        name: String
      }, {anonymous: true});

      const Model2 = modelBuilder.define('ComprehensiveModel_2', {
        title: String,
        description: String
      }, {anonymous: true});

      ModelRegistry.registerModel(Model1);
      ModelRegistry.registerModel(Model2);

      // Verify models are registered and findable
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(2);

      ModelRegistry.findModelByName('ComprehensiveModel_1').should.equal(Model1);
      ModelRegistry.findModelByName('ComprehensiveModel_2').should.equal(Model2);

      // Perform comprehensive cleanup
      const cleanupResult = ModelRegistry.cleanupTenant('cleanup-comprehensive-tenant');

      // Verify cleanup results
      cleanupResult.should.have.property('tenant', 'cleanup-comprehensive-tenant');
      cleanupResult.should.have.property('modelsRemoved', 2);
      cleanupResult.should.have.property('mappingsRemoved', 2);
      cleanupResult.should.have.property('cleanedModels', 2);
      cleanupResult.should.have.property('duration');
      cleanupResult.duration.should.be.greaterThan(0);

      // Verify models are NO LONGER findable after cleanup
      should.not.exist(ModelRegistry.findModelByName('ComprehensiveModel_1'));
      should.not.exist(ModelRegistry.findModelByName('ComprehensiveModel_2'));

      // Verify tenant registry is removed
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });

    it('should not find models from cleaned up tenants in structure searches', function() {
      TenantContextMocker.setupTenantContext('structure-cleanup-tenant');

      const properties = {
        uniqueField: String,
        value: Number
      };

      const Model1 = modelBuilder.define('StructureModel_1', properties, {anonymous: true});
      ModelRegistry.registerModel(Model1, properties);

      // Verify model is findable by structure
      const foundBefore = ModelRegistry.findModelByStructure(properties);
      foundBefore.should.equal(Model1);

      // Cleanup tenant
      const cleanupResult = ModelRegistry.cleanupTenant('structure-cleanup-tenant');
      cleanupResult.modelsRemoved.should.equal(1);

      // Verify model is NO LONGER findable by structure
      const foundAfter = ModelRegistry.findModelByStructure(properties);
      should.not.exist(foundAfter);
    });

    it('should handle enhanced cleanup statistics correctly', function() {
      // Test with multiple tenants to verify isolation
      TenantContextMocker.setupTenantContext('stats-tenant-1');
      const Model1 = modelBuilder.define('StatsModel_1', {name: String}, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      TenantContextMocker.setupTenantContext('stats-tenant-2');
      const Model2 = modelBuilder.define('StatsModel_2', {title: String}, {anonymous: true});
      const Model3 = modelBuilder.define('StatsModel_3', {description: String}, {anonymous: true});
      ModelRegistry.registerModel(Model2);
      ModelRegistry.registerModel(Model3);

      // Verify initial state
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(2);
      stats.totalTenantModels.should.equal(3);

      // Cleanup one tenant
      const cleanup1 = ModelRegistry.cleanupTenant('stats-tenant-1');
      cleanup1.modelsRemoved.should.equal(1);
      cleanup1.mappingsRemoved.should.equal(1);

      // Verify remaining tenant is unaffected
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(2);

      // Verify models from remaining tenant are still findable
      ModelRegistry.findModelByName('StatsModel_2').should.equal(Model2);
      ModelRegistry.findModelByName('StatsModel_3').should.equal(Model3);

      // Verify models from cleaned tenant are NOT findable
      should.not.exist(ModelRegistry.findModelByName('StatsModel_1'));

      // Cleanup second tenant
      const cleanup2 = ModelRegistry.cleanupTenant('stats-tenant-2');
      cleanup2.modelsRemoved.should.equal(2);
      cleanup2.mappingsRemoved.should.equal(2);

      // Verify all tenant models are cleaned up
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });

    it('should provide detailed tenant registry information with enhanced tracking', function() {
      TenantContextMocker.setupTenantContext('detailed-info-tenant');

      const Model1 = modelBuilder.define('DetailedModel_1', {name: String}, {anonymous: true});
      const Model2 = modelBuilder.define('DetailedModel_2', {title: String});

      ModelRegistry.registerModel(Model1);
      ModelRegistry.registerModel(Model2);

      const info = ModelRegistry.getTenantRegistryInfo();

      // Verify enhanced tenant information
      info.should.have.property('activeTenants', 1);
      info.should.have.property('tenants');
      info.should.have.property('globalModels', 1); // Named model goes to global

      const tenantInfo = info.tenants['detailed-info-tenant'];
      tenantInfo.should.have.property('tenantCode', 'detailed-info-tenant');
      tenantInfo.should.have.property('modelCount', 1); // Only anonymous model
      tenantInfo.should.have.property('registeredModelCount', 1);
      tenantInfo.should.have.property('models');
      tenantInfo.should.have.property('registeredModels');

      // Verify registered models details
      tenantInfo.registeredModels.should.have.length(1);
      tenantInfo.registeredModels[0].should.have.property('name', 'DetailedModel_1');
      tenantInfo.registeredModels[0].should.have.property('anonymous', true);
      tenantInfo.registeredModels[0].should.have.property('hasDefinition', true);
    });

    it('should handle cleanup errors gracefully', function() {
      // Test cleanup of non-existent tenant
      const result1 = ModelRegistry.cleanupTenant('non-existent-tenant');
      result1.should.have.property('tenant', 'non-existent-tenant');
      result1.should.have.property('modelsRemoved', 0);
      result1.should.have.property('mappingsRemoved', 0);

      // Test cleanup of invalid tenant codes
      const result2 = ModelRegistry.cleanupTenant('trap');
      result2.should.have.property('error');

      const result3 = ModelRegistry.cleanupTenant(null);
      result3.should.have.property('error');

      const result4 = ModelRegistry.cleanupTenant('__global__');
      result4.should.have.property('error');
    });

    it('should maintain backward compatibility while providing enhanced cleanup', function() {
      // Test that existing API methods still work exactly as before
      TenantContextMocker.setupTenantContext('backward-compat-tenant');

      const Model1 = modelBuilder.define('BackwardCompatModel', {name: String});
      
      // Test registerModel - should return the model
      const result = ModelRegistry.registerModel(Model1);
      result.should.equal(Model1);

      // Test findModelByName - should find the model
      const found = ModelRegistry.findModelByName('BackwardCompatModel');
      found.should.equal(Model1);

      // Test getStats - should include new fields but preserve existing ones
      const stats = ModelRegistry.getStats();
      stats.should.have.property('totalModels');
      stats.should.have.property('reuseCount');
      stats.should.have.property('uniqueModels');
      stats.should.have.property('tenantRegistries'); // New field
      stats.should.have.property('tenantStats'); // New field
      stats.should.have.property('totalTenantModels'); // New field

      // Test clear - should still work
      ModelRegistry.clear();
      const statsAfterClear = ModelRegistry.getStats();
      statsAfterClear.totalModels.should.equal(0);
      statsAfterClear.tenantRegistries.should.equal(0);
    });

    it('should prevent memory leaks through comprehensive cleanup validation', function() {
      const tenantCode = 'memory-leak-test-tenant';
      TenantContextMocker.setupTenantContext(tenantCode);

      // Create models that could cause memory leaks
      const models = [];
      for (let i = 0; i < 10; i++) {
        const model = modelBuilder.define(`MemoryLeakModel_${i}`, {
          name: String,
          index: Number,
          data: {
            nested: String,
            array: [String],
            complex: {
              deep: {
                value: Number
              }
            }
          }
        }, {anonymous: true});
        
        ModelRegistry.registerModel(model);
        models.push(model);
      }

      // Verify all models are tracked
      let stats = ModelRegistry.getStats();
      stats.totalTenantModels.should.equal(10);

      // Verify all models are findable
      models.forEach((model, index) => {
        const found = ModelRegistry.findModelByName(`MemoryLeakModel_${index}`);
        found.should.equal(model);
      });

      // Perform comprehensive cleanup
      const cleanupResult = ModelRegistry.cleanupTenant(tenantCode);
      cleanupResult.modelsRemoved.should.equal(10);
      cleanupResult.mappingsRemoved.should.equal(10);
      cleanupResult.cleanedModels.should.equal(10);

      // Verify NO models are findable after cleanup (memory leak prevention)
      models.forEach((model, index) => {
        const found = ModelRegistry.findModelByName(`MemoryLeakModel_${index}`);
        should.not.exist(found);
      });

      // Verify registry is completely clean
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });

  });

  // ... (existing tests continue unchanged)
  describe('Backward Compatibility', function() {
    it('should maintain 100% API compatibility for named models', function() {
      // Create a named model (not anonymous)
      const NamedModel = modelBuilder.define('NamedModel', {
        name: String,
        age: Number
      });

      // Register the model
      const result = ModelRegistry.registerModel(NamedModel);
      result.should.equal(NamedModel);

      // Find by structure
      const foundByStructure = ModelRegistry.findModelByStructure(NamedModel.definition.properties);
      foundByStructure.should.equal(NamedModel);

      // Find by name
      const foundByName = ModelRegistry.findModelByName('NamedModel');
      foundByName.should.equal(NamedModel);

      // Verify stats
      const stats = ModelRegistry.getStats();
      stats.totalModels.should.equal(1);
      stats.reuseCount.should.equal(1);
    });

    it('should work exactly like before when no tenant context', function() {
      // Ensure no tenant context by making the module throw an error
      const Module = require('module');
      const originalRequire = Module.prototype.require;

      Module.prototype.require = function(id) {
        if (id === '@perkd/multitenant-context') {
          throw new Error('Module not found');
        }
        return originalRequire.apply(this, arguments);
      };

      const Model1 = modelBuilder.define('Model1', {name: String});
      const Model2 = modelBuilder.define('Model2', {name: String});

      ModelRegistry.registerModel(Model1);
      ModelRegistry.registerModel(Model2);

      // Should find both models
      ModelRegistry.findModelByName('Model1').should.equal(Model1);
      ModelRegistry.findModelByName('Model2').should.equal(Model2);

      const stats = ModelRegistry.getStats();
      stats.totalModels.should.equal(2);
    });

    it('should preserve all existing API signatures', function() {
      // Verify all existing methods exist and have correct signatures
      ModelRegistry.should.have.property('registerModel');
      ModelRegistry.should.have.property('findModelByStructure');
      ModelRegistry.should.have.property('findModelByName');
      ModelRegistry.should.have.property('generateFingerprint');
      ModelRegistry.should.have.property('getStats');
      ModelRegistry.should.have.property('clear');

      // Test method signatures work as before
      const model = modelBuilder.define('TestModel', {name: String});

      // These should not throw errors
      ModelRegistry.registerModel(model);
      ModelRegistry.findModelByStructure({name: String});
      ModelRegistry.findModelByName('TestModel');
      ModelRegistry.generateFingerprint({name: String});
      ModelRegistry.getStats();
      ModelRegistry.clear();
    });
  });

  // ... (other existing test groups would continue here)
});
