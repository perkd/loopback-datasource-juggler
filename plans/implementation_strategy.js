// Implementation Strategy for Centralized Model Registry
// Phased approach to minimize risk and maintain backward compatibility

// PHASE 1: Enhance ModelRegistry with owner-aware queries
// File: loopback-datasource-juggler/lib/model-registry.js

const ModelRegistry = (() => {
  // ... existing implementation ...
  
  return {
    // ... existing methods ...
    
    // NEW: Get models for specific owner
    getModelsForOwner(owner, ownerType) {
      const currentTenant = this.getCurrentTenant();
      if (!currentTenant) return [];
      
      const tenantRegistry = this.getTenantRegistry(currentTenant);
      if (!tenantRegistry) return [];
      
      const models = [];
      for (const model of tenantRegistry.modelsByName.values()) {
        if (ownerType === 'dataSource' && model.dataSource === owner) {
          models.push(model);
        } else if (ownerType === 'app' && model.app === owner) {
          models.push(model);
        }
      }
      return models;
    },
    
    // NEW: Get model names for specific owner
    getModelNamesForOwner(owner, ownerType) {
      return this.getModelsForOwner(owner, ownerType).map(m => m.modelName);
    },
    
    // NEW: Check if model exists for owner
    hasModelForOwner(modelName, owner, ownerType) {
      const model = this.findModelByName(modelName);
      if (!model) return false;
      
      if (ownerType === 'dataSource') {
        return model.dataSource === owner;
      } else if (ownerType === 'app') {
        return model.app === owner;
      }
      return false;
    },
    
    // NEW: Get specific model for owner
    getModelForOwner(modelName, owner, ownerType) {
      const model = this.findModelByName(modelName);
      if (!model) return undefined;
      
      if (ownerType === 'dataSource' && model.dataSource === owner) {
        return model;
      } else if (ownerType === 'app' && model.app === owner) {
        return model;
      }
      return undefined;
    }
  };
})();

// PHASE 2: Create ModelRegistryProxy
// File: loopback-datasource-juggler/lib/model-registry-proxy.js

class ModelRegistryProxy {
  constructor(owner, ownerType) {
    this.owner = owner;
    this.ownerType = ownerType;
    
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol' || prop === 'constructor') {
          return Reflect.get(target, prop, receiver);
        }
        
        if (typeof prop === 'string') {
          // Handle special properties
          if (prop === 'length') {
            return target.getModelNames().length;
          }
          
          if (prop === 'toString') {
            return () => `[ModelRegistryProxy:${target.ownerType}]`;
          }
          
          if (prop === 'valueOf') {
            return () => target.getModelNames();
          }
          
          // Handle array methods
          if (prop === 'forEach') {
            return (callback, thisArg) => {
              target.getModelNames().forEach((modelName, index) => {
                const model = target.getModel(modelName);
                callback.call(thisArg, model, modelName, target);
              });
            };
          }
          
          if (prop === 'map') {
            return (callback, thisArg) => {
              return target.getModelNames().map((modelName, index) => {
                const model = target.getModel(modelName);
                return callback.call(thisArg, model, modelName, target);
              });
            };
          }
          
          if (prop === 'filter') {
            return (callback, thisArg) => {
              const results = [];
              target.getModelNames().forEach((modelName, index) => {
                const model = target.getModel(modelName);
                if (callback.call(thisArg, model, modelName, target)) {
                  results.push(model);
                }
              });
              return results;
            };
          }
          
          // Handle Object methods
          if (prop === 'keys') {
            return () => target.getModelNames();
          }
          
          if (prop === 'values') {
            return () => target.getModelNames().map(name => target.getModel(name));
          }
          
          if (prop === 'entries') {
            return () => target.getModelNames().map(name => [name, target.getModel(name)]);
          }
          
          // Default: try to get model by name
          return target.getModel(prop);
        }
        
        return Reflect.get(target, prop, receiver);
      },
      
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && prop !== 'constructor') {
          return target.setModel(prop, value);
        }
        return Reflect.set(target, prop, value, receiver);
      },
      
      has(target, prop) {
        if (typeof prop === 'string' && prop !== 'constructor') {
          return target.hasModel(prop);
        }
        return Reflect.has(target, prop);
      },
      
      ownKeys(target) {
        const modelNames = target.getModelNames();
        const prototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(target));
        return [...modelNames, ...prototypeKeys];
      },
      
      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && target.hasModel(prop)) {
          return {
            enumerable: true,
            configurable: true,
            get: () => target.getModel(prop),
            set: (value) => target.setModel(prop, value)
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
  }
  
  getModel(modelName) {
    const ModelRegistry = require('./model-registry');
    return ModelRegistry.getModelForOwner(modelName, this.owner, this.ownerType);
  }
  
  setModel(modelName, model) {
    if (!model || typeof model !== 'object') {
      return false;
    }
    
    // Set up relationship
    if (this.ownerType === 'dataSource') {
      model.dataSource = this.owner;
    } else if (this.ownerType === 'app') {
      model.app = this.owner;
    }
    
    // Register in ModelRegistry
    const ModelRegistry = require('./model-registry');
    ModelRegistry.registerModel(model);
    
    return true;
  }
  
  hasModel(modelName) {
    const ModelRegistry = require('./model-registry');
    return ModelRegistry.hasModelForOwner(modelName, this.owner, this.ownerType);
  }
  
  getModelNames() {
    const ModelRegistry = require('./model-registry');
    return ModelRegistry.getModelNamesForOwner(this.owner, this.ownerType);
  }
}

module.exports = ModelRegistryProxy;

// PHASE 3: Integrate with DataSource
// File: loopback-datasource-juggler/lib/datasource.js

const ModelRegistryProxy = require('./model-registry-proxy');

// Add to DataSource prototype
Object.defineProperty(DataSource.prototype, 'models', {
  get: function() {
    if (!this._modelRegistryProxy) {
      this._modelRegistryProxy = new ModelRegistryProxy(this, 'dataSource');
    }
    return this._modelRegistryProxy;
  },
  
  set: function(value) {
    console.warn('DataSource.models setter is deprecated. Models are now managed by ModelRegistry.');
    
    // Handle backward compatibility
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(modelName => {
        if (value[modelName] && typeof value[modelName] === 'object') {
          const model = value[modelName];
          model.dataSource = this;
          
          const ModelRegistry = require('./model-registry');
          ModelRegistry.registerModel(model);
        }
      });
    }
  }
});

// PHASE 4: Integrate with App (LoopBack)
// File: loopback/lib/application.js

const ModelRegistryProxy = require('loopback-datasource-juggler').ModelRegistryProxy;

// Add to app prototype
Object.defineProperty(app, 'models', {
  get: function() {
    if (!this._modelRegistryProxy) {
      this._modelRegistryProxy = new ModelRegistryProxy(this, 'app');
    }
    return this._modelRegistryProxy;
  },
  
  set: function(value) {
    console.warn('App.models setter is deprecated. Models are now managed by ModelRegistry.');
    
    // Handle backward compatibility
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(modelName => {
        if (value[modelName] && typeof value[modelName] === 'object') {
          const model = value[modelName];
          model.app = this;
          
          const ModelRegistry = require('loopback-datasource-juggler').ModelRegistry;
          ModelRegistry.registerModel(model);
        }
      });
    }
  }
});

// PHASE 5: Testing and Validation
// File: test/centralized-model-registry.test.js

const { expect } = require('chai');
const { DataSource } = require('loopback-datasource-juggler');
const ModelRegistry = require('../lib/model-registry');

describe('Centralized Model Registry', () => {
  let dataSource;
  let app;
  let testTenant;
  
  beforeEach(() => {
    testTenant = `test-${Date.now()}`;
    dataSource = new DataSource('memory');
    app = { name: 'test-app' };
    
    // Apply model registry proxy to app
    Object.defineProperty(app, 'models', {
      get: function() {
        if (!this._modelRegistryProxy) {
          const ModelRegistryProxy = require('../lib/model-registry-proxy');
          this._modelRegistryProxy = new ModelRegistryProxy(this, 'app');
        }
        return this._modelRegistryProxy;
      }
    });
  });
  
  afterEach(() => {
    ModelRegistry.cleanupTenant(testTenant);
  });
  
  it('should provide unified model access through DataSource.models', async () => {
    const Context = require('@perkd/multitenant-context');
    
    await Context.runAsTenant(testTenant, async () => {
      // Create model
      const User = dataSource.define('User', {
        name: { type: 'string' },
        email: { type: 'string' }
      });
      
      // Access through DataSource.models
      expect(dataSource.models.User).to.equal(User);
      expect(Object.keys(dataSource.models)).to.include('User');
      
      // Verify it's the same model instance
      expect(dataSource.models.User.modelName).to.equal('User');
    });
  });
  
  it('should provide unified model access through App.models', async () => {
    const Context = require('@perkd/multitenant-context');
    
    await Context.runAsTenant(testTenant, async () => {
      // Create model
      const Product = dataSource.define('Product', {
        name: { type: 'string' },
        price: { type: 'number' }
      });
      
      // Set up app relationship
      Product.app = app;
      
      // Access through App.models
      expect(app.models.Product).to.equal(Product);
      expect(Object.keys(app.models)).to.include('Product');
    });
  });
  
  it('should maintain tenant isolation', async () => {
    const Context = require('@perkd/multitenant-context');
    const tenant1 = `tenant1-${Date.now()}`;
    const tenant2 = `tenant2-${Date.now()}`;
    
    // Create models in different tenants
    const user1 = await Context.runAsTenant(tenant1, async () => {
      return dataSource.define('User', { name: 'string' });
    });
    
    const user2 = await Context.runAsTenant(tenant2, async () => {
      return dataSource.define('User', { name: 'string' });
    });
    
    // Verify isolation
    await Context.runAsTenant(tenant1, async () => {
      expect(dataSource.models.User).to.equal(user1);
    });
    
    await Context.runAsTenant(tenant2, async () => {
      expect(dataSource.models.User).to.equal(user2);
    });
    
    // Cleanup
    ModelRegistry.cleanupTenant(tenant1);
    ModelRegistry.cleanupTenant(tenant2);
  });
  
  it('should handle cleanup automatically', async () => {
    const Context = require('@perkd/multitenant-context');
    
    await Context.runAsTenant(testTenant, async () => {
      // Create models
      const User = dataSource.define('User', { name: 'string' });
      const Product = dataSource.define('Product', { name: 'string' });
      
      // Verify models exist
      expect(dataSource.models.User).to.exist;
      expect(dataSource.models.Product).to.exist;
      expect(Object.keys(dataSource.models)).to.have.lengthOf(2);
    });
    
    // Cleanup tenant
    ModelRegistry.cleanupTenant(testTenant);
    
    // Verify models are gone
    await Context.runAsTenant(testTenant, async () => {
      expect(dataSource.models.User).to.be.undefined;
      expect(dataSource.models.Product).to.be.undefined;
      expect(Object.keys(dataSource.models)).to.have.lengthOf(0);
    });
  });
});

// PHASE 6: Migration Helper
// File: scripts/migrate-to-centralized-registry.js

const ModelRegistry = require('loopback-datasource-juggler').ModelRegistry;

class MigrationHelper {
  static async migrateExistingModels(dataSource) {
    console.log(`🔄 Migrating models from DataSource: ${dataSource.name}`);
    
    const stats = { migrated: 0, skipped: 0, errors: [] };
    
    // Get existing models from dataSource.models
    const existingModels = dataSource.models || {};
    
    Object.keys(existingModels).forEach(modelName => {
      try {
        const model = existingModels[modelName];
        
        // Check if already in ModelRegistry
        const existingInRegistry = ModelRegistry.findModelByName(modelName);
        if (existingInRegistry) {
          stats.skipped++;
          return;
        }
        
        // Register in ModelRegistry
        ModelRegistry.registerModel(model);
        stats.migrated++;
        
        console.log(`✅ Migrated model: ${modelName}`);
        
      } catch (error) {
        stats.errors.push({ modelName, error: error.message });
        console.error(`❌ Failed to migrate model ${modelName}:`, error);
      }
    });
    
    console.log(`🎉 Migration completed: ${stats.migrated} migrated, ${stats.skipped} skipped, ${stats.errors.length} errors`);
    return stats;
  }
  
  static validateMigration(dataSource) {
    console.log(`🔍 Validating migration for DataSource: ${dataSource.name}`);
    
    const issues = [];
    
    // Check if models are accessible through proxy
    const proxyModels = dataSource.models;
    const modelNames = Object.keys(proxyModels);
    
    modelNames.forEach(modelName => {
      const model = proxyModels[modelName];
      if (!model) {
        issues.push(`Model ${modelName} not accessible through proxy`);
      } else if (model.dataSource !== dataSource) {
        issues.push(`Model ${modelName} has incorrect dataSource reference`);
      }
    });
    
    if (issues.length === 0) {
      console.log('✅ Migration validation passed');
    } else {
      console.log('❌ Migration validation failed:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    return issues;
  }
}

module.exports = MigrationHelper;

// PHASE 7: Rollback Strategy
// File: scripts/rollback-centralized-registry.js

class RollbackHelper {
  static async rollbackToTraditionalRegistries(dataSource) {
    console.log(`🔄 Rolling back DataSource: ${dataSource.name}`);
    
    const stats = { restored: 0, errors: [] };
    
    try {
      // Get models from ModelRegistry
      const ModelRegistry = require('loopback-datasource-juggler').ModelRegistry;
      const models = ModelRegistry.getModelsForOwner(dataSource, 'dataSource');
      
      // Create traditional models object
      const traditionalModels = {};
      
      models.forEach(model => {
        try {
          traditionalModels[model.modelName] = model;
          stats.restored++;
          console.log(`✅ Restored model: ${model.modelName}`);
        } catch (error) {
          stats.errors.push({ modelName: model.modelName, error: error.message });
          console.error(`❌ Failed to restore model ${model.modelName}:`, error);
        }
      });
      
      // Replace proxy with traditional object
      delete dataSource._modelRegistryProxy;
      dataSource.models = traditionalModels;
      
      console.log(`🎉 Rollback completed: ${stats.restored} restored, ${stats.errors.length} errors`);
      
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      stats.errors.push({ phase: 'rollback', error: error.message });
    }
    
    return stats;
  }
}

module.exports = { MigrationHelper, RollbackHelper };

// PHASE 8: Performance Comparison
// File: test/performance-comparison.test.js

const { expect } = require('chai');
const { DataSource } = require('loopback-datasource-juggler');
const ModelRegistry = require('../lib/model-registry');

describe('Performance Comparison: Traditional vs Centralized', () => {
  let dataSource;
  let testTenant;
  
  beforeEach(() => {
    testTenant = `perf-test-${Date.now()}`;
    dataSource = new DataSource('memory');
  });
  
  afterEach(() => {
    ModelRegistry.cleanupTenant(testTenant);
  });
  
  it('should demonstrate memory usage improvement', async () => {
    const Context = require('@perkd/multitenant-context');
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    await Context.runAsTenant(testTenant, async () => {
      // Create many models
      const models = [];
      for (let i = 0; i < 100; i++) {
        const model = dataSource.define(`Model${i}`, {
          id: { type: 'string', id: true },
          name: { type: 'string' },
          value: { type: 'number' }
        });
        models.push(model);
      }
      
      // Verify all models are accessible
      expect(Object.keys(dataSource.models)).to.have.lengthOf(100);
      
      // Check memory usage
      const memoryAfterCreation = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfterCreation - initialMemory;
      
      console.log(`Memory increase after creating 100 models: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      // With centralized registry, memory usage should be lower
      // because models are not duplicated in multiple registries
      expect(memoryIncrease).to.be.lessThan(50 * 1024 * 1024); // Less than 50MB
    });
    
    // Cleanup
    ModelRegistry.cleanupTenant(testTenant);
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const netMemoryIncrease = finalMemory - initialMemory;
    
    console.log(`Net memory increase after cleanup: ${Math.round(netMemoryIncrease / 1024 / 1024)}MB`);
    
    // Memory should return close to baseline
    expect(netMemoryIncrease).to.be.lessThan(10 * 1024 * 1024); // Less than 10MB
  });
  
  it('should demonstrate cleanup performance improvement', async () => {
    const Context = require('@perkd/multitenant-context');
    
    await Context.runAsTenant(testTenant, async () => {
      // Create models
      for (let i = 0; i < 50; i++) {
        dataSource.define(`Model${i}`, {
          id: { type: 'string', id: true },
          name: { type: 'string' }
        });
      }
    });
    
    // Measure cleanup time
    const cleanupStart = Date.now();
    const cleanupResult = ModelRegistry.cleanupTenant(testTenant);
    const cleanupTime = Date.now() - cleanupStart;
    
    console.log(`Cleanup time for 50 models: ${cleanupTime}ms`);
    
    // With centralized registry, cleanup should be very fast
    expect(cleanupTime).to.be.lessThan(100); // Less than 100ms
    expect(cleanupResult.cleaned).to.be.true;
    
    // Verify all models are gone
    await Context.runAsTenant(testTenant, async () => {
      expect(Object.keys(dataSource.models)).to.have.lengthOf(0);
    });
  });
});

// PHASE 9: Production Deployment Guide
// File: docs/centralized-registry-deployment.md

/*
# Centralized Model Registry Deployment Guide

## Overview
This guide covers the deployment of the centralized model registry system that eliminates duplicate model storage and simplifies cleanup.

## Pre-Deployment Checklist

### 1. Backup Current State
```bash
# Create backup of current model registries
npm run backup-model-state
```

### 2. Test in Staging
```bash
# Deploy to staging environment
npm run deploy:staging

# Run comprehensive tests
npm run test:centralized-registry
npm run test:performance
npm run test:backward-compatibility
```

### 3. Validate Performance
```bash
# Run performance comparison
npm run test:performance-comparison

# Expected results:
# - Memory usage: 30-50% reduction
# - Cleanup time: 80-90% reduction
# - Model access: <5% performance impact
```

## Deployment Steps

### Phase 1: Deploy Enhanced ModelRegistry
```bash
# Deploy loopback-datasource-juggler updates
git checkout -b feature/centralized-model-registry
git apply patches/enhanced-model-registry.patch
npm test
git commit -m "feat: enhanced ModelRegistry with owner-aware queries"
```

### Phase 2: Deploy ModelRegistryProxy
```bash
# Add proxy implementation
cp lib/model-registry-proxy.js loopback-datasource-juggler/lib/
npm test
git commit -m "feat: add ModelRegistryProxy for unified model access"
```

### Phase 3: Update DataSource
```bash
# Apply DataSource changes
git apply patches/datasource-centralized-models.patch
npm test
git commit -m "feat: integrate DataSource with centralized model registry"
```

### Phase 4: Update App
```bash
# Apply App changes (loopback repository)
git apply patches/app-centralized-models.patch
npm test
git commit -m "feat: integrate App with centralized model registry"
```

### Phase 5: Deploy to Production
```bash
# Deploy with feature flag
CENTRALIZED_REGISTRY_ENABLED=true npm run deploy:production

# Monitor for 24 hours
npm run monitor:model-registry
```

## Rollback Procedure

If issues are encountered:

```bash
# Immediate rollback
CENTRALIZED_REGISTRY_ENABLED=false npm run deploy:production

# OR use rollback helper
node scripts/rollback-centralized-registry.js
```

## Monitoring

### Key Metrics to Monitor
1. **Memory Usage**: Should decrease by 30-50%
2. **Cleanup Time**: Should decrease by 80-90%
3. **Model Access Performance**: Should remain within 5% of baseline
4. **Error Rate**: Should remain at or below current levels

### Dashboard Queries
```javascript
// Memory usage trend
SELECT memory_usage_mb FROM model_registry_metrics WHERE timestamp > NOW() - INTERVAL '1 hour'

// Cleanup performance
SELECT cleanup_time_ms FROM tenant_cleanup_metrics WHERE timestamp > NOW() - INTERVAL '1 hour'

// Model access performance
SELECT avg(access_time_ms) FROM model_access_metrics WHERE timestamp > NOW() - INTERVAL '1 hour'
```

## Troubleshooting

### Common Issues

1. **Models not accessible through proxy**
   - Check tenant context is properly set
   - Verify model is registered in ModelRegistry
   - Ensure owner relationships are correct

2. **Performance degradation**
   - Check if proxy is being recreated frequently
   - Verify caching is working properly
   - Monitor ModelRegistry query performance

3. **Cleanup not working**
   - Verify tenant isolation is working
   - Check for remaining circular references
   - Ensure all owner relationships are tracked

### Debug Commands
```bash
# Check model registry state
node -e "console.log(require('loopback-datasource-juggler').ModelRegistry.getStats())"

# Test cleanup
node scripts/test-cleanup.js --tenant=problem-tenant

# Analyze model references
node scripts/analyze-model-references.js --model=ModelName
```

## Benefits Achieved

After successful deployment:

1. **Memory Efficiency**: 30-50% reduction in model-related memory usage
2. **Simplified Cleanup**: Single-point cleanup for all model references
3. **Better Tenant Isolation**: Natural isolation through ModelRegistry
4. **Reduced Complexity**: Eliminated duplicate model storage
5. **Improved Performance**: Faster cleanup and reduced memory pressure

## Success Criteria

- [ ] Memory usage reduced by at least 30%
- [ ] Cleanup time reduced by at least 80%
- [ ] Zero breaking changes to existing API
- [ ] No increase in error rates
- [ ] Successful 48-hour production run

*/

// PHASE 10: Comprehensive Test Suite
// File: test/centralized-registry-integration.test.js

const { expect } = require('chai');
const { DataSource } = require('loopback-datasource-juggler');
const ModelRegistry = require('../lib/model-registry');
const ModelRegistryProxy = require('../lib/model-registry-proxy');

describe('Centralized Registry Integration Tests', () => {
  let dataSource1, dataSource2;
  let app1, app2;
  let testTenant;
  
  beforeEach(() => {
    testTenant = `integration-test-${Date.now()}`;
    
    // Create DataSources
    dataSource1 = new DataSource('memory', { name: 'ds1' });
    dataSource2 = new DataSource('memory', { name: 'ds2' });
    
    // Create Apps with centralized models
    app1 = { 
      name: 'app1',
      get models() {
        if (!this._modelRegistryProxy) {
          this._modelRegistryProxy = new ModelRegistryProxy(this, 'app');
        }
        return this._modelRegistryProxy;
      }
    };
    
    app2 = { 
      name: 'app2',
      get models() {
        if (!this._modelRegistryProxy) {
          this._modelRegistryProxy = new ModelRegistryProxy(this, 'app');
        }
        return this._modelRegistryProxy;
      }
    };
  });
  
  afterEach(() => {
    ModelRegistry.cleanupTenant(testTenant);
  });
  
  describe('Multi-DataSource Scenarios', () => {
    it('should isolate models between different DataSources', async () => {
      const Context = require('@perkd/multitenant-context');
      
      await Context.runAsTenant(testTenant, async () => {
        // Create models in different DataSources
        const User1 = dataSource1.define('User', { name: 'string' });
        const User2 = dataSource2.define('User', { name: 'string' });
        
        // Verify isolation
        expect(dataSource1.models.User).to.equal(User1);
        expect(dataSource2.models.User).to.equal(User2);
        expect(dataSource1.models.User).to.not.equal(dataSource2.models.User);
        
        // Verify each DataSource only sees its own models
        expect(Object.keys(dataSource1.models)).to.deep.equal(['User']);
        expect(Object.keys(dataSource2.models)).to.deep.equal(['User']);
      });
    });
    
    it('should handle shared models between DataSources', async () => {
      const Context = require('@perkd/multitenant-context');
      
      await Context.runAsTenant(testTenant, async () => {
        // Create model in first DataSource
        const SharedModel = dataSource1.define('SharedModel', { value: 'number' });
        
        // Attach to second DataSource
        SharedModel.dataSource = dataSource2;
        ModelRegistry.registerModel(SharedModel);
        
        // Both DataSources should see the model
        expect(dataSource1.models.SharedModel).to.equal(SharedModel);
        expect(dataSource2.models.SharedModel).to.equal(SharedModel);
      });
    });
  });
  
  describe('Multi-App Scenarios', () => {
    it('should isolate models between different Apps', async () => {
      const Context = require('@perkd/multitenant-context');
      
      await Context.runAsTenant(testTenant, async () => {
        // Create models for different apps
        const Product1 = dataSource1.define('Product', { name: 'string' });
        const Product2 = dataSource2.define('Product', { name: 'string' });
        
        // Assign to different apps
        Product1.app = app1;
        Product2.app = app2;
        
        // Verify isolation
        expect(app1.models.Product).to.equal(Product1);
        expect(app2.models.Product).to.equal(Product2);
        expect(app1.models.Product).to.not.equal(app2.models.Product);
      });
    });
  });
  
  describe('Complex Scenarios', () => {
    it('should handle models with multiple relationships', async () => {
      const Context = require('@perkd/multitenant-context');
      
      await Context.runAsTenant(testTenant, async () => {
        // Create models with relationships
        const User = dataSource1.define('User', { name: 'string' });
        const Post = dataSource1.define('Post', { title: 'string' });
        const Comment = dataSource1.define('Comment', { text: 'string' });
        
        // Set up relationships
        User.hasMany(Post);
        Post.belongsTo(User);
        Post.hasMany(Comment);
        Comment.belongsTo(Post);
        
        // Assign to app
        User.app = app1;
        Post.app = app1;
        Comment.app = app1;
        
        // Verify all models are accessible
        expect(app1.models.User).to.equal(User);
        expect(app1.models.Post).to.equal(Post);
        expect(app1.models.Comment).to.equal(Comment);
        
        // Verify relationships are intact
        expect(User.relations.posts).to.exist;
        expect(Post.relations.user).to.exist;
        expect(Post.relations.comments).to.exist;
        expect(Comment.relations.post).to.exist;
      });
    });
    
    it('should handle concurrent access from multiple tenants', async () => {
      const Context = require('@perkd/multitenant-context');
      const tenant1 = `tenant1-${Date.now()}`;
      const tenant2 = `tenant2-${Date.now()}`;
      
      // Create models concurrently
      const [models1, models2] = await Promise.all([
        Context.runAsTenant(tenant1, async () => {
          const User = dataSource1.define('User', { name: 'string' });
          const Product = dataSource1.define('Product', { name: 'string' });
          return { User, Product };
        }),
        Context.runAsTenant(tenant2, async () => {
          const User = dataSource2.define('User', { name: 'string' });
          const Product = dataSource2.define('Product', { name: 'string' });
          return { User, Product };
        })
      ]);
      
      // Verify isolation
      expect(models1.User).to.not.equal(models2.User);
      expect(models1.Product).to.not.equal(models2.Product);
      
      // Verify each tenant sees only their models
      await Context.runAsTenant(tenant1, async () => {
        expect(dataSource1.models.User).to.equal(models1.User);
        expect(dataSource1.models.Product).to.equal(models1.Product);
      });
      
      await Context.runAsTenant(tenant2, async () => {
        expect(dataSource2.models.User).to.equal(models2.User);
        expect(dataSource2.models.Product).to.equal(models2.Product);
      });
      
      // Cleanup
      ModelRegistry.cleanupTenant(tenant1);
      ModelRegistry.cleanupTenant(tenant2);
    });
  });
  
  describe('Backward Compatibility', () => {
    it('should support all existing model access patterns', async () => {
      const Context = require('@perkd/multitenant-context');
      
      await Context.runAsTenant(testTenant, async () => {
        // Create model
        const User = dataSource1.define('User', { name: 'string' });
        User.app = app1;
        
        // Test various access patterns
        
        // Direct property access
        expect(dataSource1.models.User).to.equal(User);
        expect(app1.models.User).to.equal(User);
        
        // Object.keys()
        expect(Object.keys(dataSource1.models)).to.include('User');
        expect(Object.keys(app1.models)).to.include('User');
        
        // for...in loop
        const dsModels = [];
        for (const modelName in dataSource1.models) {
          dsModels.push(modelName);
        }
        expect(dsModels).to.include('User');
        
        // Object.values()
        expect(Object.values(dataSource1.models)).to.include(User);
        expect(Object.values(app1.models)).to.include(User);
        
        // hasOwnProperty
        expect(dataSource1.models.hasOwnProperty('User')).to.be.true;
        expect(app1.models.hasOwnProperty('User')).to.be.true;
        
        // Array methods (if supported)
        if (typeof dataSource1.models.forEach === 'function') {
          let foundUser = false;
          dataSource1.models.forEach((model, name) => {
            if (name === 'User') foundUser = true;
          });
          expect(foundUser).to.be.true;
        }
      });
    });
  });
});
    