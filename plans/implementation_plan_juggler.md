# Implementation Plan: loopback-datasource-juggler

## Overview
Enhance ModelRegistry with owner-aware queries and create ModelRegistryProxy for centralized model management.

## Repository
- **Name**: loopback-datasource-juggler
- **Path**: `git@github.com:perkd/loopback-datasource-juggler.git`
- **Branch**: `feature/centralized-model-registry`

## Changes Required

### 1. Enhance ModelRegistry (lib/model-registry.js)
**Priority**: P0 - Critical
**Estimated Time**: 3-4 hours

#### Add owner-aware query methods to existing ModelRegistry:

```javascript
// Add these methods to the ModelRegistry return object
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

getModelNamesForOwner(owner, ownerType) {
  return this.getModelsForOwner(owner, ownerType).map(m => m.modelName);
},

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
```

### 2. Create ModelRegistryProxy (lib/model-registry-proxy.js)
**Priority**: P0 - Critical
**Estimated Time**: 4-5 hours

#### Create new file with complete Proxy implementation:

```javascript
const ModelRegistry = require('./model-registry');

class ModelRegistryProxy {
  constructor(owner, ownerType) {
    this.owner = owner;
    this.ownerType = ownerType;
    
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Handle special properties
        if (typeof prop === 'symbol' || prop === 'constructor') {
          return Reflect.get(target, prop, receiver);
        }
        
        if (typeof prop === 'string') {
          // Array/Object method handling
          if (prop === 'length') return target.getModelNames().length;
          if (prop === 'keys') return () => target.getModelNames();
          if (prop === 'values') return () => target.getModelNames().map(name => target.getModel(name));
          if (prop === 'forEach') {
            return (callback, thisArg) => {
              target.getModelNames().forEach((modelName, index) => {
                const model = target.getModel(modelName);
                callback.call(thisArg, model, modelName, target);
              });
            };
          }
          
          // Default: get model by name
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
        return target.getModelNames();
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
    return ModelRegistry.getModelForOwner(modelName, this.owner, this.ownerType);
  }
  
  setModel(modelName, model) {
    if (!model || typeof model !== 'object') return false;
    
    // Set up relationship
    if (this.ownerType === 'dataSource') {
      model.dataSource = this.owner;
    } else if (this.ownerType === 'app') {
      model.app = this.owner;
    }
    
    ModelRegistry.registerModel(model);
    return true;
  }
  
  hasModel(modelName) {
    return ModelRegistry.hasModelForOwner(modelName, this.owner, this.ownerType);
  }
  
  getModelNames() {
    return ModelRegistry.getModelNamesForOwner(this.owner, this.ownerType);
  }
}

module.exports = ModelRegistryProxy;
```

### 3. Update DataSource Integration (lib/datasource.js)
**Priority**: P1 - High
**Estimated Time**: 1-2 hours

#### Replace DataSource.prototype.models property:

```javascript
const ModelRegistryProxy = require('./model-registry-proxy');

// Add this to DataSource.prototype definition
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
      const ModelRegistry = require('./model-registry');
      Object.keys(value).forEach(modelName => {
        if (value[modelName] && typeof value[modelName] === 'object') {
          const model = value[modelName];
          model.dataSource = this;
          ModelRegistry.registerModel(model);
        }
      });
    }
  }
});
```

### 4. Update Package Exports (index.js)
**Priority**: P1 - High
**Estimated Time**: 30 minutes

#### Export ModelRegistryProxy:

```javascript
// Add to existing exports
exports.ModelRegistryProxy = require('./lib/model-registry-proxy');
```

## Testing Requirements

### 1. Create test file: test/centralized-model-registry.test.js
**Priority**: P1 - High
**Estimated Time**: 3-4 hours

```javascript
const { expect } = require('chai');
const { DataSource, ModelRegistry } = require('../');

describe('Centralized Model Registry', () => {
  // Test DataSource.models proxy
  // Test owner-aware queries
  // Test backward compatibility
  // Test tenant isolation
  // Test cleanup functionality
});
```

### 2. Update existing tests
**Priority**: P2 - Medium
**Estimated Time**: 2-3 hours

- Update tests that directly access DataSource.models
- Ensure all existing functionality works with proxy

## Validation Checklist

- [ ] All existing tests pass
- [ ] DataSource.models behaves identically to before
- [ ] Object.keys(dataSource.models) works
- [ ] for...in loops work on dataSource.models
- [ ] Tenant isolation is maintained
- [ ] Memory usage is reduced
- [ ] Cleanup time is improved

## Deployment Strategy

1. **Feature Flag**: Implement behind `CENTRALIZED_REGISTRY_ENABLED` flag
2. **Gradual Rollout**: Test in staging first
3. **Monitoring**: Track memory usage and access patterns
4. **Rollback Plan**: Easy to disable via feature flag

## Security Considerations

- Ensure proxy cannot be bypassed
- Validate tenant context on all access
- Log security violations
- Implement rate limiting if needed

## Performance Impact

- **Expected**: Minimal overhead for property access
- **Monitor**: Model access time, memory usage
- **Optimize**: Cache proxy instances per owner

## Dependencies

- **Requires**: Enhanced multitenant-context for getCurrentTenant()
- **Compatible**: All existing loopback-datasource-juggler features
- **Breaking**: None (100% backward compatible)