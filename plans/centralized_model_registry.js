// Centralized Model Registry Architecture
// This eliminates the need for separate DataSource.models and App.models registries

// CURRENT PROBLEM:
// DataSource.models = { Model1: model1, Model2: model2 }  // Duplicate registry
// App.models = { Model1: model1, Model2: model2 }         // Duplicate registry
// ModelRegistry = { tenant1: { Model1: model1 }, ... }   // Master registry

// PROPOSED SOLUTION:
// ModelRegistry = { tenant1: { Model1: model1 }, ... }   // Single source of truth
// DataSource.models -> Property getter that queries ModelRegistry
// App.models -> Property getter that queries ModelRegistry

const ModelRegistry = require('./model-registry');

// Enhanced DataSource with ModelRegistry integration
class EnhancedDataSource {
  constructor(name, settings) {
    this.name = name;
    this.settings = settings;
    this.connector = null;
    this.connected = false;

    // REMOVED: this.models = {};  // No longer needed!
    // Models are now managed by ModelRegistry
  }

  // Property getter that queries ModelRegistry
  get models() {
    return new ModelRegistryProxy(this, 'dataSource');
  }

  // For backward compatibility with code that sets models directly
  set models(value) {
    // Log warning but don't break existing code
    console.warn('DataSource.models setter is deprecated, models are now managed by ModelRegistry');
    // Optionally handle migration of existing models
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(modelName => {
        if (value[modelName] && typeof value[modelName] === 'object') {
          // Register the model in ModelRegistry instead
          ModelRegistry.registerModel(value[modelName]);
        }
      });
    }
  }

  define(modelName, properties, settings) {
    // Create model
    const model = this.buildModel(modelName, properties, settings);

    // Set up bidirectional relationship
    model.dataSource = this;

    // Register in ModelRegistry (handles tenant isolation automatically)
    ModelRegistry.registerModel(model, properties);

    return model;
  }

  buildModel(modelName, properties, settings) {
    // Model creation logic (simplified for example)
    const model = {
      modelName,
      properties,
      settings,
      dataSource: null,
      definition: {properties},
    };

    return model;
  }
}

// Enhanced App with ModelRegistry integration
class EnhancedApp {
  constructor() {
    this.dataSources = {};
    this.middleware = [];

    // REMOVED: this.models = {};  // No longer needed!
    // Models are now managed by ModelRegistry
  }

  // Property getter that queries ModelRegistry
  get models() {
    return new ModelRegistryProxy(this, 'app');
  }

  // For backward compatibility
  set models(value) {
    console.warn('App.models setter is deprecated, models are now managed by ModelRegistry');
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(modelName => {
        if (value[modelName] && typeof value[modelName] === 'object') {
          ModelRegistry.registerModel(value[modelName]);
        }
      });
    }
  }

  model(modelName, config) {
    // Get or create model
    let model = ModelRegistry.findModelByName(modelName);

    if (!model) {
      // Create new model
      const dataSource = this.dataSources[config.dataSource || 'default'];
      model = dataSource.define(modelName, config.properties, config.settings);

      // Set up app relationship
      model.app = this;
    }

    return model;
  }
}

// Proxy class that makes ModelRegistry look like a regular object
class ModelRegistryProxy {
  constructor(owner, ownerType) {
    this.owner = owner;
    this.ownerType = ownerType; // 'dataSource' or 'app'

    // Return a Proxy that intercepts property access
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === 'string' && prop !== 'constructor') {
          return target.getModel(prop);
        }
        return target[prop];
      },

      set(target, prop, value) {
        if (typeof prop === 'string' && prop !== 'constructor') {
          target.setModel(prop, value);
          return true;
        }
        target[prop] = value;
        return true;
      },

      has(target, prop) {
        if (typeof prop === 'string' && prop !== 'constructor') {
          return target.hasModel(prop);
        }
        return prop in target;
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
          };
        }
        return Object.getOwnPropertyDescriptor(target, prop);
      },
    });
  }

  getModel(modelName) {
    // Get model from ModelRegistry
    const model = ModelRegistry.findModelByName(modelName);

    if (!model) {
      return undefined;
    }

    // Verify model belongs to this owner
    if (this.ownerType === 'dataSource' && model.dataSource !== this.owner) {
      return undefined;
    }

    if (this.ownerType === 'app' && model.app !== this.owner) {
      return undefined;
    }

    return model;
  }

  setModel(modelName, model) {
    if (model && typeof model === 'object') {
      // Set up relationship
      if (this.ownerType === 'dataSource') {
        model.dataSource = this.owner;
      } else if (this.ownerType === 'app') {
        model.app = this.owner;
      }

      // Register in ModelRegistry
      ModelRegistry.registerModel(model);
    }
  }

  hasModel(modelName) {
    const model = ModelRegistry.findModelByName(modelName);

    if (!model) {
      return false;
    }

    // Check if model belongs to this owner
    if (this.ownerType === 'dataSource') {
      return model.dataSource === this.owner;
    }

    if (this.ownerType === 'app') {
      return model.app === this.owner;
    }

    return false;
  }

  getModelNames() {
    const stats = ModelRegistry.getStats();
    const modelNames = [];

    // Get models from current tenant
    const currentTenant = ModelRegistry.getCurrentTenant();
    if (currentTenant) {
      const tenantStats = stats.tenantStats.find(t => t.tenantCode === currentTenant);
      if (tenantStats) {
        // This would need to be implemented in ModelRegistry
        const tenantModels = ModelRegistry.getTenantModels(currentTenant);

        tenantModels.forEach(model => {
          // Check if model belongs to this owner
          if (this.ownerType === 'dataSource' && model.dataSource === this.owner) {
            modelNames.push(model.modelName);
          } else if (this.ownerType === 'app' && model.app === this.owner) {
            modelNames.push(model.modelName);
          }
        });
      }
    }

    return modelNames;
  }
}

// Enhanced ModelRegistry with owner-aware queries
const EnhancedModelRegistry = (() => {
  const originalRegistry = ModelRegistry;

  return {
    ...originalRegistry,

    // New method to get models for a specific tenant
    getTenantModels(tenantCode) {
      const tenantRegistry = this.getTenantRegistry(tenantCode);
      if (!tenantRegistry) {
        return [];
      }

      return Array.from(tenantRegistry.modelsByName.values());
    },

    // New method to get models for a specific owner
    getModelsForOwner(owner, ownerType) {
      const currentTenant = this.getCurrentTenant();
      const tenantModels = this.getTenantModels(currentTenant);

      return tenantModels.filter(model => {
        if (ownerType === 'dataSource') {
          return model.dataSource === owner;
        } else if (ownerType === 'app') {
          return model.app === owner;
        }
        return false;
      });
    },

    // Enhanced cleanup - now much simpler!
    cleanupTenant(tenantCode) {
      console.log(`🧹 Simplified cleanup for tenant: ${tenantCode}`);

      // Since DataSource.models and App.models are now just views,
      // we only need to clean the ModelRegistry
      const result = originalRegistry.cleanupTenant(tenantCode);

      // Models are automatically "removed" from DataSource.models and App.models
      // because they're just proxy views of the ModelRegistry

      console.log(`✅ Simplified cleanup completed for tenant: ${tenantCode}`);
      return result;
    },
  };
})();

// Integration example
function integrateWithLoopBack() {
  // Replace DataSource in loopback-datasource-juggler
  const OriginalDataSource = require('loopback-datasource-juggler').DataSource;

  // Monkey patch for backward compatibility
  const originalDefine = OriginalDataSource.prototype.define;
  OriginalDataSource.prototype.define = function(modelName, properties, settings) {
    // Call original define
    const model = originalDefine.call(this, modelName, properties, settings);

    // Remove from local registry and register in ModelRegistry
    if (this.models && this.models[modelName]) {
      delete this.models[modelName];
    }

    ModelRegistry.registerModel(model, properties);
    return model;
  };

  // Replace models property with proxy
  Object.defineProperty(OriginalDataSource.prototype, 'models', {
    get: function() {
      if (!this._modelProxy) {
        this._modelProxy = new ModelRegistryProxy(this, 'dataSource');
      }
      return this._modelProxy;
    },
    set: function(value) {
      console.warn('DataSource.models setter is deprecated');
      if (value && typeof value === 'object') {
        Object.keys(value).forEach(modelName => {
          if (value[modelName]) {
            ModelRegistry.registerModel(value[modelName]);
          }
        });
      }
    },
  });
}

// Usage example
function demonstrateUsage() {
  console.log('=== Centralized Model Registry Demo ===');

  // Create enhanced DataSource
  const dataSource = new EnhancedDataSource('testDS', {});

  // Create enhanced App
  const app = new EnhancedApp();

  // Create model through DataSource
  const User = dataSource.define('User', {
    name: {type: 'string'},
    email: {type: 'string'},
  });

  // Set up app relationship
  User.app = app;

  // Access models through proxy - looks like normal object access
  console.log('DataSource models:', Object.keys(dataSource.models));
  console.log('App models:', Object.keys(app.models));

  // Direct property access works
  console.log('User from DataSource:', dataSource.models.User);
  console.log('User from App:', app.models.User);

  // Cleanup is now simple - just clean ModelRegistry
  ModelRegistry.cleanupTenant('current-tenant');

  // Models are automatically "removed" from DataSource and App
  console.log('After cleanup - DataSource models:', Object.keys(dataSource.models));
  console.log('After cleanup - App models:', Object.keys(app.models));
}

module.exports = {
  EnhancedDataSource,
  EnhancedApp,
  ModelRegistryProxy,
  EnhancedModelRegistry,
  integrateWithLoopBack,
  demonstrateUsage,
};
