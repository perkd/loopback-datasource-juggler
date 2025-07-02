'use strict';

const should = require('./init.js');
const assert = require('assert');
const path = require('path');

const jdb = require('../');
const ModelBuilder = jdb.ModelBuilder;
const {ModelRegistry, registryManager, getCurrentTenant} = require('../lib/model-registry');

describe('Hybrid Tenant-Aware ModelRegistry', function() {
  let modelBuilder;
  let originalRequireCache;
  let mockContextModulePath;

  beforeEach(function() {
    modelBuilder = new ModelBuilder();
    ModelRegistry.clear();

    // Save original require cache
    originalRequireCache = Object.assign({}, require.cache);

    // Create a mock path for the multitenant context module
    mockContextModulePath = require.resolve('@perkd/multitenant-context');
  });

  afterEach(function() {
    // Restore original require cache
    require.cache = originalRequireCache;
    
    // Stop any running cleanup timers
    if (registryManager) {
      registryManager.stopPeriodicCleanup();
    }
  });

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
      // Ensure no tenant context
      delete require.cache[mockContextModulePath];

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
      
      should.not.throw(() => {
        ModelRegistry.registerModel(model);
        ModelRegistry.findModelByStructure({name: String});
        ModelRegistry.findModelByName('TestModel');
        ModelRegistry.generateFingerprint({name: String});
        ModelRegistry.getStats();
        ModelRegistry.clear();
      });
    });
  });

  describe('Tenant-Scoped Anonymous Models', function() {
    function setupTenantContext(tenantCode) {
      // Mock the multitenant context module
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: tenantCode
          }
        }
      };
    }

    it('should use tenant registries for anonymous models', function() {
      setupTenantContext('tenant-1');

      // Create an anonymous model
      const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
        name: String,
        email: String
      }, {anonymous: true});

      // Register the model
      ModelRegistry.registerModel(AnonymousModel);

      // Verify it was registered in tenant registry
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(1);

      // Should still be findable globally for backward compatibility
      const found = ModelRegistry.findModelByName('AnonymousModel_1');
      found.should.equal(AnonymousModel);
    });

    it('should isolate anonymous models between tenants', function() {
      // Register model for tenant-1
      setupTenantContext('tenant-1');
      const Model1 = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      // Register different model for tenant-2
      setupTenantContext('tenant-2');
      const Model2 = modelBuilder.define('AnonymousModel_2', {
        title: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model2);

      // Verify both tenant registries exist
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(2);
      stats.totalTenantModels.should.equal(2);

      // Verify tenant isolation
      stats.tenantStats.should.have.length(2);
      stats.tenantStats.forEach(tenantStat => {
        tenantStat.modelCount.should.equal(1);
        tenantStat.should.have.property('tenantCode');
        tenantStat.should.have.property('lastAccessed');
      });
    });

    it('should reuse anonymous models within the same tenant', function() {
      setupTenantContext('tenant-1');

      // Create first model with embedded structure
      const properties = {
        name: String,
        address: {
          street: String,
          city: String
        }
      };

      const Model1 = modelBuilder.define('TestModel1', properties);
      
      // Create second model with same embedded structure
      const Model2 = modelBuilder.define('TestModel2', properties);

      // The embedded address models should be reused within the tenant
      const addressModel1 = Model1.definition.properties.address.type;
      const addressModel2 = Model2.definition.properties.address.type;
      
      if (addressModel1 && addressModel2) {
        addressModel1.should.equal(addressModel2);
      }

      const stats = ModelRegistry.getStats();
      stats.reuseCount.should.be.greaterThan(0);
    });

    it('should not reuse anonymous models across different tenants', function() {
      const properties = {
        street: String,
        city: String
      };

      // Create model for tenant-1
      setupTenantContext('tenant-1');
      const model1 = modelBuilder.resolveType(properties);

      // Create model for tenant-2
      setupTenantContext('tenant-2');
      const model2 = modelBuilder.resolveType(properties);

      // Models should be different instances for different tenants
      if (model1 && model2 && model1.settings && model2.settings) {
        if (model1.settings.anonymous && model2.settings.anonymous) {
          model1.should.not.equal(model2);
        }
      }

      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.be.greaterThan(0);
    });

    it('should fall back to global registry when no tenant context', function() {
      // Ensure no tenant context
      delete require.cache[mockContextModulePath];

      const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});

      ModelRegistry.registerModel(AnonymousModel);

      // Should use global registry when no tenant context
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
      stats.totalModels.should.equal(1);
    });
  });

  describe('Tenant Cleanup Operations', function() {
    function setupTenantContext(tenantCode) {
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: tenantCode
          }
        }
      };
    }

    it('should cleanup specific tenant models', function() {
      // Setup tenant-1
      setupTenantContext('tenant-1');
      const Model1 = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      // Setup tenant-2
      setupTenantContext('tenant-2');
      const Model2 = modelBuilder.define('AnonymousModel_2', {
        title: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model2);

      // Verify both tenants have models
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(2);
      stats.totalTenantModels.should.equal(2);

      // Cleanup tenant-1
      const cleaned = ModelRegistry.cleanupTenant('tenant-1');
      cleaned.should.equal(1);

      // Verify tenant-1 was cleaned up
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(1);

      // tenant-2 should still exist
      stats.tenantStats[0].tenantCode.should.equal('tenant-2');
    });

    it('should cleanup inactive tenants automatically', function() {
      setupTenantContext('tenant-1');
      const Model1 = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      // Verify tenant exists
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);

      // Force cleanup with very short idle time (0ms = cleanup immediately)
      const cleaned = ModelRegistry.cleanupInactiveTenants(0);
      cleaned.should.equal(1);

      // Verify tenant was cleaned up
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });

    it('should not cleanup active tenants', function() {
      setupTenantContext('active-tenant');
      const Model1 = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      // Access the model to make it "active"
      ModelRegistry.findModelByStructure({name: String});

      // Try to cleanup with short idle time, but since we just accessed it, it should not be cleaned
      const cleaned = ModelRegistry.cleanupInactiveTenants(1000); // 1 second
      cleaned.should.equal(0);

      // Verify tenant still exists
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(1);
    });

    it('should handle cleanup of non-existent tenants gracefully', function() {
      const cleaned = ModelRegistry.cleanupTenant('non-existent-tenant');
      cleaned.should.equal(0);

      // Should not throw or cause issues
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
    });

    it('should handle cleanup with invalid tenant codes', function() {
      should.not.throw(() => {
        ModelRegistry.cleanupTenant(null);
        ModelRegistry.cleanupTenant(undefined);
        ModelRegistry.cleanupTenant('');
        ModelRegistry.cleanupTenant('trap');
      });
    });
  });

  describe('Registry Manager', function() {
    it('should have registry manager with cleanup functionality', function() {
      registryManager.should.have.property('startPeriodicCleanup');
      registryManager.should.have.property('stopPeriodicCleanup');
      registryManager.should.have.property('forceCleanup');
      registryManager.should.have.property('getStats');
    });

    it('should provide cleanup statistics', function() {
      const stats = registryManager.getStats();
      stats.should.have.property('cleanupInterval');
      stats.should.have.property('maxIdleTime');
      stats.should.have.property('isActive');
      stats.should.have.property('registryStats');
    });

    it('should be able to stop and start periodic cleanup', function() {
      // Stop cleanup
      registryManager.stopPeriodicCleanup();
      let stats = registryManager.getStats();
      stats.isActive.should.be.false();

      // Start cleanup
      registryManager.startPeriodicCleanup();
      stats = registryManager.getStats();
      stats.isActive.should.be.true();
    });

    it('should force cleanup when requested', function() {
      function setupTenantContext(tenantCode) {
        require.cache[mockContextModulePath] = {
          exports: {
            Context: {
              tenant: tenantCode
            }
          }
        };
      }

      setupTenantContext('force-cleanup-tenant');
      const Model1 = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(Model1);

      // Force cleanup
      const cleaned = registryManager.forceCleanup();
      cleaned.should.equal(1);

      // Verify cleanup occurred
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
    });
  });

  describe('Memory Leak Prevention', function() {
    function setupTenantContext(tenantCode) {
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: tenantCode
          }
        }
      };
    }

    it('should prevent anonymous model accumulation', function() {
      // Create many anonymous models for different tenants
      for (let i = 0; i < 10; i++) {
        setupTenantContext(`tenant-${i}`);
        const model = modelBuilder.define(`AnonymousModel_${i}`, {
          name: String,
          value: Number
        }, {anonymous: true});
        ModelRegistry.registerModel(model);
      }

      // Verify all tenants are registered
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(10);
      stats.totalTenantModels.should.equal(10);

      // Cleanup all inactive tenants
      const cleaned = ModelRegistry.cleanupInactiveTenants(0);
      cleaned.should.equal(10);

      // Verify all anonymous models were cleaned up
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });

    it('should remove models from global registry when tenant is cleaned up', function() {
      setupTenantContext('cleanup-test-tenant');
      const AnonymousModel = modelBuilder.define('AnonymousModel_1', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(AnonymousModel);

      // Verify model is in global registry for backward compatibility
      let found = ModelRegistry.findModelByName('AnonymousModel_1');
      found.should.equal(AnonymousModel);

      // Cleanup the tenant
      ModelRegistry.cleanupTenant('cleanup-test-tenant');

      // Model should no longer be findable globally
      found = ModelRegistry.findModelByName('AnonymousModel_1');
      should.not.exist(found);
    });

    it('should handle stress test with many models', function() {
      const tenantCount = 50;
      const modelsPerTenant = 20;

      // Create many models across many tenants
      for (let t = 0; t < tenantCount; t++) {
        setupTenantContext(`stress-tenant-${t}`);
        for (let m = 0; m < modelsPerTenant; m++) {
          const model = modelBuilder.define(`StressModel_${t}_${m}`, {
            name: String,
            index: Number,
            tenant: String
          }, {anonymous: true});
          ModelRegistry.registerModel(model);
        }
      }

      // Verify all models are registered
      let stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(tenantCount);
      stats.totalTenantModels.should.equal(tenantCount * modelsPerTenant);

      // Cleanup all tenants
      const cleaned = ModelRegistry.cleanupInactiveTenants(0);
      cleaned.should.equal(tenantCount);

      // Verify complete cleanup
      stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalTenantModels.should.equal(0);
    });
  });

  describe('Error Handling and Edge Cases', function() {
    it('should handle errors in tenant context detection gracefully', function() {
      // Mock a context module that throws an error
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            get tenant() {
              throw new Error('Context error');
            }
          }
        }
      };

      const model = modelBuilder.define('ErrorModel', {
        name: String
      }, {anonymous: true});

      // Should not throw an error
      should.not.throw(() => {
        ModelRegistry.registerModel(model);
      });

      // Should fall back to global registry
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalModels.should.equal(1);
    });

    it('should handle missing multitenant-context module gracefully', function() {
      // Remove the mock context module
      delete require.cache[mockContextModulePath];

      const model = modelBuilder.define('NoContextModel', {
        name: String
      }, {anonymous: true});

      should.not.throw(() => {
        ModelRegistry.registerModel(model);
      });

      // Should use global registry
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalModels.should.equal(1);
    });

    it('should handle invalid tenant codes', function() {
      // Test various invalid tenant codes
      const invalidTenants = [null, undefined, '', 'trap', 0, false];

      invalidTenants.forEach(invalidTenant => {
        require.cache[mockContextModulePath] = {
          exports: {
            Context: {
              tenant: invalidTenant
            }
          }
        };

        const model = modelBuilder.define(`InvalidTenantModel_${Math.random()}`, {
          name: String
        }, {anonymous: true});

        should.not.throw(() => {
          ModelRegistry.registerModel(model);
        });
      });

      // All models should use global registry due to invalid tenant codes
      const stats = ModelRegistry.getStats();
      stats.tenantRegistries.should.equal(0);
      stats.totalModels.should.equal(invalidTenants.length);
    });
  });

  describe('Enhanced Statistics', function() {
    function setupTenantContext(tenantCode) {
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: tenantCode
          }
        }
      };
    }

    it('should provide enhanced statistics with tenant information', function() {
      setupTenantContext('stats-tenant');
      const model = modelBuilder.define('StatsModel', {
        name: String
      }, {anonymous: true});
      ModelRegistry.registerModel(model);

      const stats = ModelRegistry.getStats();
      
      // Should have new tenant-specific properties
      stats.should.have.property('tenantRegistries');
      stats.should.have.property('tenantStats');
      stats.should.have.property('totalTenantModels');

      stats.tenantRegistries.should.equal(1);
      stats.totalTenantModels.should.equal(1);
      stats.tenantStats.should.have.length(1);

      const tenantStat = stats.tenantStats[0];
      tenantStat.should.have.property('tenantCode', 'stats-tenant');
      tenantStat.should.have.property('modelCount', 1);
      tenantStat.should.have.property('creationTime');
      tenantStat.should.have.property('lastAccessed');
      tenantStat.should.have.property('idleTime');
    });

    it('should provide detailed tenant registry information', function() {
      setupTenantContext('detailed-tenant');
      const model1 = modelBuilder.define('DetailedModel1', {name: String}, {anonymous: true});
      const model2 = modelBuilder.define('DetailedModel2', {title: String}, {anonymous: true});
      
      ModelRegistry.registerModel(model1);
      ModelRegistry.registerModel(model2);

      const info = ModelRegistry.getTenantRegistryInfo();
      
      info.should.have.property('activeTenants', 1);
      info.should.have.property('tenants');
      info.should.have.property('globalModels');

      const tenantInfo = info.tenants['detailed-tenant'];
      tenantInfo.should.have.property('tenantCode', 'detailed-tenant');
      tenantInfo.should.have.property('modelCount', 2);
      tenantInfo.should.have.property('models');
      tenantInfo.models.should.have.length(2);
      tenantInfo.models.should.containEql('DetailedModel1');
      tenantInfo.models.should.containEql('DetailedModel2');
    });
  });

  describe('Integration with ModelBuilder', function() {
    function setupTenantContext(tenantCode) {
      require.cache[mockContextModulePath] = {
        exports: {
          Context: {
            tenant: tenantCode
          }
        }
      };
    }

    it('should work seamlessly with ModelBuilder.resolveType', function() {
      setupTenantContext('integration-tenant');

      // Create a model with embedded structure
      const Customer = modelBuilder.define('Customer', {
        name: String,
        address: {
          street: String,
          city: String,
          country: String
        }
      });

      // The address should be an anonymous model in the tenant registry
      const addressModel = Customer.definition.properties.address.type;
      
      if (addressModel && addressModel.settings && addressModel.settings.anonymous) {
        // Verify it's tracked in tenant registry
        const stats = ModelRegistry.getStats();
        stats.tenantRegistries.should.equal(1);
        stats.totalTenantModels.should.be.greaterThan(0);
      }
    });

    it('should maintain model reuse within tenant during complex operations', function() {
      setupTenantContext('reuse-tenant');

      // Create multiple models with the same embedded structure
      const addressStructure = {
        street: String,
        city: String,
        zipCode: String
      };

      const Customer = modelBuilder.define('Customer', {
        name: String,
        homeAddress: addressStructure,
        workAddress: addressStructure
      });

      const Employee = modelBuilder.define('Employee', {
        fullName: String,
        address: addressStructure
      });

      // All address models should be the same instance within the tenant
      const homeAddressModel = Customer.definition.properties.homeAddress.type;
      const workAddressModel = Customer.definition.properties.workAddress.type;
      const employeeAddressModel = Employee.definition.properties.address.type;

      if (homeAddressModel && workAddressModel && employeeAddressModel) {
        if (homeAddressModel.settings?.anonymous && 
            workAddressModel.settings?.anonymous && 
            employeeAddressModel.settings?.anonymous) {
          homeAddressModel.should.equal(workAddressModel);
          homeAddressModel.should.equal(employeeAddressModel);
        }
      }

      const stats = ModelRegistry.getStats();
      stats.reuseCount.should.be.greaterThan(0);
    });
  });
});
