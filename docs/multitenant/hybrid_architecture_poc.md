# Proof of Concept: Hybrid Tenant Registry with Backward Compatibility

## Core Design Philosophy

**Remove global registry accumulation while maintaining 100% API compatibility**

The key insight: We don't need to remove the global registry interface - we need to prevent it from accumulating anonymous models indefinitely.

## Architecture Overview

### 1. **Tenant-Aware Global Registry (Hybrid)**

Instead of replacing the global registry, make it tenant-aware internally:

```javascript
// lib/model-registry.js - Enhanced version
const ModelRegistry = (() => {
  // Keep existing global interface for backward compatibility
  const globalModelsByFingerprint = new Map();
  const globalModelsByName = new Map();
  
  // Add tenant-scoped storage
  const tenantRegistries = new Map(); // tenant -> TenantRegistry
  const modelToTenant = new Map(); // model -> tenant
  
  // Statistics
  let totalModels = 0;
  let reuseCount = 0;

  class TenantRegistry {
    constructor(tenantCode) {
      this.tenantCode = tenantCode;
      this.modelsByFingerprint = new Map();
      this.modelsByName = new Map();
      this.creationTime = Date.now();
      this.lastAccessed = Date.now();
    }

    registerModel(model, properties) {
      this.lastAccessed = Date.now();
      const fingerprint = ModelRegistry.generateFingerprint(properties || model.definition?.properties);
      this.modelsByFingerprint.set(fingerprint, model);
      this.modelsByName.set(model.modelName, model);
      
      // Track which tenant owns this model
      modelToTenant.set(model, this.tenantCode);
      
      return model;
    }

    findModelByStructure(properties) {
      this.lastAccessed = Date.now();
      const fingerprint = ModelRegistry.generateFingerprint(properties);
      return this.modelsByFingerprint.get(fingerprint) || null;
    }

    cleanup() {
      // Remove models from global maps
      for (const model of this.modelsByName.values()) {
        globalModelsByName.delete(model.modelName);
        modelToTenant.delete(model);
        
        // Remove from global fingerprint map
        for (const [fingerprint, globalModel] of globalModelsByFingerprint) {
          if (globalModel === model) {
            globalModelsByFingerprint.delete(fingerprint);
            break;
          }
        }
      }
      
      // Clear tenant registry
      this.modelsByFingerprint.clear();
      this.modelsByName.clear();
    }

    getStats() {
      return {
        tenantCode: this.tenantCode,
        modelCount: this.modelsByFingerprint.size,
        creationTime: this.creationTime,
        lastAccessed: this.lastAccessed
      };
    }
  }

  function getTenantRegistry(tenantCode) {
    if (!tenantCode || tenantCode === 'trap') {
      return null; // Fall back to global registry
    }

    if (!tenantRegistries.has(tenantCode)) {
      tenantRegistries.set(tenantCode, new TenantRegistry(tenantCode));
    }
    return tenantRegistries.get(tenantCode);
  }

  return {
    // Existing API - UNCHANGED for backward compatibility
    registerModel(model, properties) {
      const tenantCode = getCurrentTenant();
      const tenantRegistry = getTenantRegistry(tenantCode);
      
      if (tenantRegistry && model.settings?.anonymous) {
        // Use tenant registry for anonymous models
        tenantRegistry.registerModel(model, properties);
        
        // Also add to global maps for backward compatibility
        const fingerprint = this.generateFingerprint(properties || model.definition?.properties);
        globalModelsByFingerprint.set(fingerprint, model);
        globalModelsByName.set(model.modelName, model);
      } else {
        // Use global registry for named models or when no tenant context
        const fingerprint = this.generateFingerprint(properties || model.definition?.properties);
        globalModelsByFingerprint.set(fingerprint, model);
        globalModelsByName.set(model.modelName, model);
      }

      totalModels++;
      return model;
    },

    // Existing API - UNCHANGED for backward compatibility  
    findModelByStructure(properties, currentModelBuilder) {
      const tenantCode = getCurrentTenant();
      const tenantRegistry = getTenantRegistry(tenantCode);
      
      // Try tenant registry first for anonymous models
      if (tenantRegistry) {
        const model = tenantRegistry.findModelByStructure(properties);
        if (model) {
          reuseCount++;
          return model;
        }
      }
      
      // Fall back to global registry
      const fingerprint = this.generateFingerprint(properties);
      const model = globalModelsByFingerprint.get(fingerprint);
      
      if (model) {
        reuseCount++;
        return model;
      }
      
      return null;
    },

    // Existing API - UNCHANGED
    findModelByName(name) {
      return globalModelsByName.get(name);
    },

    // Existing API - UNCHANGED
    generateFingerprint(properties) {
      // ... existing implementation
    },

    // NEW API - For tenant cleanup
    cleanupTenant(tenantCode) {
      const tenantRegistry = tenantRegistries.get(tenantCode);
      if (tenantRegistry) {
        tenantRegistry.cleanup();
        tenantRegistries.delete(tenantCode);
      }
    },

    // NEW API - For monitoring
    getStats() {
      return {
        totalModels,
        reuseCount,
        uniqueModels: globalModelsByFingerprint.size,
        tenantRegistries: tenantRegistries.size,
        tenantStats: Array.from(tenantRegistries.values()).map(r => r.getStats())
      };
    },

    // NEW API - For testing
    clear() {
      globalModelsByFingerprint.clear();
      globalModelsByName.clear();
      tenantRegistries.clear();
      modelToTenant.clear();
      totalModels = 0;
      reuseCount = 0;
    },

    // NEW API - Cleanup inactive tenants
    cleanupInactiveTenants(maxIdleTime = 30 * 60 * 1000) {
      const now = Date.now();
      const toCleanup = [];
      
      for (const [tenantCode, registry] of tenantRegistries) {
        if (now - registry.lastAccessed > maxIdleTime) {
          toCleanup.push(tenantCode);
        }
      }
      
      toCleanup.forEach(tenant => this.cleanupTenant(tenant));
      return toCleanup.length;
    }
  };
})();
```

### 2. **Enhanced ModelBuilder with Smart Routing**

```javascript
// lib/model-builder.js - Minimal changes to resolveType
ModelBuilder.prototype.resolveType = function(prop, isSubProperty) {
  if (!prop) return prop;
  
  if (Array.isArray(prop) && prop.length > 0) {
    const itemType = this.resolveType(prop[0]);
    if (typeof itemType === 'function') {
      return [itemType];
    } else {
      return itemType;
    }
  }
  
  if (typeof prop === 'string') {
    const schemaType = ModelBuilder.schemaTypes[prop.toLowerCase()] || this.models[prop];
    if (schemaType) {
      return schemaType;
    } else {
      prop = this.define(prop, {}, {unresolved: true});
      return prop;
    }
  } else if (prop.constructor.name === 'Object') {
    if (!isSubProperty && prop.type) {
      return this.resolveType(prop.type, true);
    } else {
      // Check ModelRegistry for existing model (unchanged API)
      const existingModel = ModelRegistry.findModelByStructure(prop, this);
      if (existingModel) {
        return existingModel;
      }

      // Create new anonymous model (unchanged logic)
      const modelName = this.getSchemaName(null);
      const parentRef = true;

      const model = this.define(modelName, prop, {
        anonymous: true, // This flag enables tenant-scoped storage
        idInjection: false,
        strict: this.settings.strictEmbeddedModels || false,
        parentRef: parentRef,
      });

      // Register model (unchanged API)
      ModelRegistry.registerModel(model, prop);
      return model;
    }
  } else if ('function' === typeof prop) {
    return prop;
  }
  
  return prop;
};
```

### 3. **Periodic Cleanup Integration**

```javascript
// Add to lib/model-builder.js or new lib/registry-manager.js
class RegistryManager {
  constructor() {
    this.cleanupInterval = null;
    this.startPeriodicCleanup();
  }

  startPeriodicCleanup() {
    // Clean up inactive tenants every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = ModelRegistry.cleanupInactiveTenants();
      if (cleaned > 0) {
        debug(`Cleaned up ${cleaned} inactive tenant registries`);
      }
    }, 5 * 60 * 1000);
  }

  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Auto-start cleanup when module is loaded
const registryManager = new RegistryManager();

// Export for testing
module.exports.registryManager = registryManager;
```

## Key Benefits of This Approach

### 1. **100% Backward Compatibility**
- All existing APIs unchanged
- Existing behavior preserved for named models
- No breaking changes for consumers

### 2. **Memory Leak Prevention**
- Anonymous models automatically cleaned up by tenant
- Global registry no longer accumulates indefinitely
- Automatic cleanup of inactive tenants

### 3. **Upstream Alignment**
- Changes are additive, not destructive
- Easy to merge future upstream changes
- Could potentially contribute back to upstream

### 4. **Gradual Migration Path**
- Can enable tenant-scoped behavior selectively
- Easy to test and validate
- Low risk deployment

## Implementation Plan

### Phase 1: Core Implementation (Week 1)
- [ ] Implement TenantRegistry class within ModelRegistry
- [ ] Add tenant-aware logic to registerModel/findModelByStructure
- [ ] Add getCurrentTenant() helper
- [ ] Maintain 100% API compatibility

### Phase 2: Cleanup Integration (Week 2)  
- [ ] Add tenant cleanup methods
- [ ] Implement periodic cleanup
- [ ] Add monitoring and stats
- [ ] Comprehensive unit tests

### Phase 3: Integration Testing (Week 3)
- [ ] Test with multitenant-context integration
- [ ] Memory leak regression tests
- [ ] Performance validation
- [ ] Backward compatibility validation

### Phase 4: Production Validation (Week 4)
- [ ] Deploy to staging
- [ ] Monitor memory usage patterns
- [ ] Validate cleanup behavior
- [ ] Production deployment

## Testing Strategy

### Backward Compatibility Tests
```javascript
describe('Backward Compatibility', () => {
  it('should work exactly like before when no tenant context', () => {
    // Test all existing APIs work unchanged
  });
  
  it('should maintain same behavior for named models', () => {
    // Named models should still use global registry
  });
  
  it('should preserve all existing API signatures', () => {
    // Ensure no breaking changes
  });
});
```

### Memory Leak Tests
```javascript
describe('Memory Leak Prevention', () => {
  it('should cleanup anonymous models when tenant inactive', async () => {
    // Create anonymous models with tenant context
    // Simulate tenant becoming inactive
    // Verify models are cleaned up
  });
  
  it('should not accumulate models indefinitely', () => {
    // Create many anonymous models
    // Verify memory usage remains bounded
  });
});
```

## Migration from Upstream

When upstream `loopback-datasource-juggler` is updated:

1. **Our changes are additive** - easy to reapply
2. **Core logic unchanged** - low risk of conflicts  
3. **Clear separation** - our enhancements are well-isolated
4. **Test coverage** - ensures compatibility is maintained

This approach gives us the memory leak fix while maintaining maximum compatibility and minimizing technical debt.
