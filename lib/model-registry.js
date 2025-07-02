// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

/*!
 * Module dependencies
 */
const debug = require('debug')('loopback:model-registry');

/**
 * Get the current tenant from context
 * @returns {String|null} The current tenant or null if not available
 */
function getCurrentTenant() { // this function will cause "Domain fallback" warnings when you turn on debug, which is normal
  try {
    // Try to load the multitenant context if available
    const Context = require('@perkd/multitenant-context').Context;
    return Context.tenant;
  } catch (e) {
    // Try alternative context mechanisms if available
    try {
      // Check for global.loopbackContext as a fallback
      if (global.loopbackContext && typeof global.loopbackContext.getCurrentContext === 'function') {
        const ctx = global.loopbackContext.getCurrentContext();
        if (ctx && ctx.get && typeof ctx.get === 'function') {
          const tenant = ctx.get('tenant');
          if (tenant) return tenant;
        }
      }
    } catch (innerErr) {
      debug('Alternative context mechanism not available', innerErr);
    }

    // Return null if context is not available
    debug('Multitenant context module not found or tenant not available');
    return null;
  }
}

/**
 * Tenant-scoped Model Registry
 * Handles model registration and lookup for a specific tenant
 */
class TenantRegistry {
  constructor(tenantCode) {
    this.tenantCode = tenantCode;
    this.modelsByFingerprint = new Map();
    this.modelsByName = new Map();
    this.creationTime = Date.now();
    this.lastAccessed = Date.now();
  }

  /**
   * Register a model in this tenant's registry
   * @param {Object} model - The model to register
   * @param {Object} properties - The model's properties
   * @returns {Object} The registered model
   */
  registerModel(model, properties) {
    this.lastAccessed = Date.now();
    
    if (!model || !model.modelName) return model;

    const fingerprint = ModelRegistry.generateFingerprint(properties || model.definition?.properties);
    
    // Store in tenant-specific registry
    this.modelsByFingerprint.set(fingerprint, model);
    this.modelsByName.set(model.modelName, model);
    
    debug(`Registered model ${model.modelName} in tenant ${this.tenantCode} with fingerprint ${fingerprint}`);
    
    return model;
  }

  /**
   * Find a model by its structure in this tenant's registry
   * @param {Object} properties - The properties to match
   * @returns {Object|null} The matching model or null if not found
   */
  findModelByStructure(properties) {
    this.lastAccessed = Date.now();
    
    if (!properties) return null;

    const fingerprint = ModelRegistry.generateFingerprint(properties);
    const model = this.modelsByFingerprint.get(fingerprint);
    
    if (model) {
      debug(`Found model ${model.modelName} in tenant ${this.tenantCode} for fingerprint ${fingerprint}`);
    }
    
    return model || null;
  }

  /**
   * Find a model by name in this tenant's registry
   * @param {String} name - The model name to look up
   * @returns {Object|undefined} The model or undefined if not found
   */
  findModelByName(name) {
    this.lastAccessed = Date.now();
    return this.modelsByName.get(name);
  }

  /**
   * Clean up all models in this tenant's registry
   */
  cleanup() {
    debug(`Cleaning up tenant registry for ${this.tenantCode} with ${this.modelsByName.size} models`);
    
    // Clear all maps
    this.modelsByFingerprint.clear();
    this.modelsByName.clear();
  }

  /**
   * Get statistics for this tenant's registry
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      tenantCode: this.tenantCode,
      modelCount: this.modelsByFingerprint.size,
      creationTime: this.creationTime,
      lastAccessed: this.lastAccessed,
      idleTime: Date.now() - this.lastAccessed
    };
  }
}

/**
 * Tenant-Aware Model Registry - 100% backward compatible external interface
 *
 * Key design principles:
 * 1. Internally: Everything uses tenant-scoped registries (including special "global" tenant)
 * 2. Externally: Maintains 100% backward compatibility - global lookups work as before
 * 3. Anonymous models are isolated by tenant to prevent memory leaks
 * 4. Named models are stored in "global" tenant for backward compatibility
 * 5. Automatic cleanup of inactive tenant registries
 */
const ModelRegistry = (() => {
  // Internal storage - everything is tenant-scoped
  const tenantRegistries = new Map(); // tenant -> TenantRegistry
  const modelToTenant = new Map(); // model -> tenant (for cleanup tracking)

  // Special tenant for global/non-tenant models (backward compatibility)
  const GLOBAL_TENANT = '__global__';

  // Statistics
  let totalModels = 0;
  let reuseCount = 0;

  /**
   * Get or create a tenant registry
   * @param {String} tenantCode - The tenant code (null/undefined uses global tenant)
   * @returns {TenantRegistry} The tenant registry (always returns a registry)
   */
  function getTenantRegistry(tenantCode) {
    // Use global tenant for invalid/missing tenant codes
    if (!tenantCode || tenantCode === 'trap') {
      tenantCode = GLOBAL_TENANT;
    }

    if (!tenantRegistries.has(tenantCode)) {
      debug(`Creating new tenant registry for ${tenantCode}`);
      tenantRegistries.set(tenantCode, new TenantRegistry(tenantCode));
    }
    return tenantRegistries.get(tenantCode);
  }

  /**
   * Get the effective tenant for a model
   * @param {Object} model - The model to check
   * @param {String} currentTenant - The current tenant context
   * @returns {String} The tenant to use for this model
   */
  function getEffectiveTenant(model, currentTenant) {
    // Anonymous models use current tenant (or global if no tenant)
    if (model && model.settings && model.settings.anonymous) {
      return currentTenant || GLOBAL_TENANT;
    }
    // Named models always use global tenant for backward compatibility
    return GLOBAL_TENANT;
  }

  return {
    /**
     * Register a model in the registry
     * BACKWARD COMPATIBLE: Existing API unchanged
     *
     * @param {Object} model - The model to register
     * @param {Object} properties - The model's properties (optional if model has definition)
     * @returns {Object} The registered model
     */
    registerModel(model, properties) {
      if (!model || !model.modelName) return model;

      const currentTenant = getCurrentTenant();
      const effectiveTenant = getEffectiveTenant(model, currentTenant);

      // Get the appropriate tenant registry (always succeeds)
      const tenantRegistry = getTenantRegistry(effectiveTenant);
      tenantRegistry.registerModel(model, properties);

      // Track which tenant owns this model
      modelToTenant.set(model, effectiveTenant);

      // Track statistics
      totalModels++;

      debug(`Registered model ${model.modelName} (current tenant: ${currentTenant || 'none'}, effective tenant: ${effectiveTenant}, anonymous: ${!!(model.settings && model.settings.anonymous)})`);

      return model;
    },

    /**
     * Find a model by its structure
     * BACKWARD COMPATIBLE: Existing API unchanged
     *
     * @param {Object} properties - The properties to match
     * @param {Object} currentModelBuilder - The current ModelBuilder instance (optional)
     * @returns {Object|null} The matching model or null if not found
     */
    findModelByStructure(properties, currentModelBuilder) {
      if (!properties) return null;

      const currentTenant = getCurrentTenant();

      // For anonymous models: search in current tenant only (tenant isolation)
      // For named models: search in global tenant (backward compatibility)
      const searchTenants = currentTenant ? [currentTenant, GLOBAL_TENANT] : [GLOBAL_TENANT];

      for (const tenantCode of searchTenants) {
        const tenantRegistry = getTenantRegistry(tenantCode);
        const model = tenantRegistry.findModelByStructure(properties);

        if (model) {
          // Perform existing validation logic for embedded models
          if (this.isEmbeddedModelStructure(properties)) {
            const modelProps = model.definition && model.definition.properties;
            const propsKeys = Object.keys(properties).sort();
            const modelPropsKeys = modelProps ? Object.keys(modelProps).sort() : [];

            if (!this.areArraysEqual(propsKeys, modelPropsKeys)) {
              debug(`Skipping model reuse for ${model.modelName} - property keys don't match exactly`);
              debug(`Original: ${JSON.stringify(propsKeys)}, New: ${JSON.stringify(modelPropsKeys)}`);
              continue; // Try next tenant
            }
          }

          // Perform existing settings validation
          try {
            const isTest = process.env.NODE_ENV === 'test';
            const modelSettings = model.settings || {};
            const modelBuilderSettings = model.modelBuilder && model.modelBuilder.settings || {};
            const builder = currentModelBuilder || this.getCurrentModelBuilder();
            const currentModelBuilderSettings = builder && builder.settings || {};
            const hasParentRef = modelBuilderSettings.parentRef;
            const modelHasStrictEmbedded = modelSettings.strict === true || modelBuilderSettings.strictEmbeddedModels === true;
            const currentHasStrictEmbedded = currentModelBuilderSettings.strictEmbeddedModels === true;

            if (modelHasStrictEmbedded !== currentHasStrictEmbedded) {
              debug(`Skipping model reuse for ${model.modelName} - strict settings don't match`);
              continue; // Try next tenant
            }

            if (isTest && hasParentRef) {
              debug(`Skipping model reuse for ${model.modelName} in test environment with parentRef enabled`);
              continue; // Try next tenant
            }
          } catch (e) {
            debug('Error checking model settings:', e);
            continue; // Try next tenant
          }

          // If we're looking for anonymous models and found one in global tenant while in tenant context,
          // skip it to ensure tenant isolation
          if (currentTenant && tenantCode === GLOBAL_TENANT && model.settings && model.settings.anonymous) {
            debug(`Skipping global anonymous model ${model.modelName} for tenant isolation`);
            continue;
          }

          reuseCount++;
          debug(`Found model ${model.modelName} in tenant ${tenantCode} for current tenant ${currentTenant || 'none'}`);
          return model;
        }
      }

      // No model found in any tenant registry
      return null;
    },

    /**
     * Find a model by name
     * BACKWARD COMPATIBLE: Existing API unchanged
     *
     * @param {String} name - The model name to look up
     * @returns {Object|undefined} The model or undefined if not found
     */
    findModelByName(name) {
      const currentTenant = getCurrentTenant();

      // Search order for backward compatibility:
      // 1. Current tenant (if available) - for anonymous models
      // 2. Global tenant - for named models and fallback
      const searchTenants = currentTenant ? [currentTenant, GLOBAL_TENANT] : [GLOBAL_TENANT];

      for (const tenantCode of searchTenants) {
        const tenantRegistry = getTenantRegistry(tenantCode);
        const model = tenantRegistry.findModelByName(name);
        if (model) {
          return model;
        }
      }

      return undefined;
    },

    /**
     * Generate a fingerprint for a property structure
     * UNCHANGED: Existing implementation preserved
     */
    generateFingerprint(properties) {
      if (!properties || typeof properties !== 'object') {
        return 'invalid-properties';
      }

      try {
        const propertyNames = Object.keys(properties).sort().join(',');
        const normalized = this.normalizeProperties(properties);
        normalized.__propertyNames = propertyNames;
        normalized.__structureType = this.determineStructureType(properties);

        if (normalized.__structureType === 'complex') {
          normalized.__depth = this.calculateStructureDepth(properties);
        }

        const jsonStr = JSON.stringify(normalized);
        return this.createHash(jsonStr);
      } catch (err) {
        debug('Error generating fingerprint:', err);
        return `error-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      }
    },

    /**
     * Get the current ModelBuilder from call stack
     * UNCHANGED: Existing implementation preserved
     */
    getCurrentModelBuilder() {
      try {
        const stack = new Error().stack;
        const resolveTypeMatch = stack.match(/at ModelBuilder\.resolveType/);

        if (resolveTypeMatch) {
          const frames = stack.split('\n');
          for (let i = 0; i < frames.length; i++) {
            if (frames[i].includes('at ModelBuilder.resolveType')) {
              for (let j = i - 1; j >= 0; j--) {
                if (frames[j].includes('at ModelBuilder.')) {
                  return {settings: {}};
                }
              }
            }
          }
        }

        return null;
      } catch (e) {
        debug('Error getting current ModelBuilder:', e);
        return null;
      }
    },

    /**
     * Check if two arrays have exactly the same elements
     * UNCHANGED: Existing implementation preserved
     */
    areArraysEqual(arr1, arr2) {
      if (arr1.length !== arr2.length) return false;
      return arr1.every((item, index) => item === arr2[index]);
    },

    /**
     * Check if the properties represent an embedded model structure
     * UNCHANGED: Existing implementation preserved
     */
    isEmbeddedModelStructure(properties) {
      return Object.values(properties).some(prop =>
        prop && typeof prop === 'object' && !Array.isArray(prop) && prop.type);
    },

    /**
     * Determine the type of structure (simple, array, complex)
     * UNCHANGED: Existing implementation preserved
     */
    determineStructureType(properties) {
      if (!properties || typeof properties !== 'object') {
        return 'invalid';
      }

      if (Array.isArray(properties)) {
        return 'array';
      }

      const hasNestedObjects = Object.values(properties).some(
        val => val && typeof val === 'object' && !Array.isArray(val),
      );

      const hasArrays = Object.values(properties).some(
        val => Array.isArray(val),
      );

      if (hasNestedObjects || hasArrays) {
        return 'complex';
      }

      return 'simple';
    },

    /**
     * Calculate the depth of a nested structure
     * UNCHANGED: Existing implementation preserved
     */
    calculateStructureDepth(obj, currentDepth = 0) {
      if (!obj || typeof obj !== 'object') {
        return currentDepth;
      }

      let maxDepth = currentDepth;

      Object.values(obj).forEach(val => {
        if (val && typeof val === 'object') {
          const depth = this.calculateStructureDepth(val, currentDepth + 1);
          maxDepth = Math.max(maxDepth, depth);
        }
      });

      return maxDepth;
    },

    /**
     * Normalize properties for consistent fingerprinting
     * UNCHANGED: Existing implementation preserved
     */
    normalizeProperties(properties) {
      if (!properties || typeof properties !== 'object') {
        return properties;
      }

      if (Array.isArray(properties)) {
        return properties.map(item => this.normalizeProperties(item));
      }

      const result = {};
      const keys = Object.keys(properties).sort();
      const isEmbeddedModel = this.isEmbeddedModelStructure(properties);

      for (const key of keys) {
        const value = properties[key];

        if (key === 'type') {
          result[key] = typeof value === 'function' ? value.name : value;
        } else if (value && typeof value === 'object') {
          result[key] = this.normalizeProperties(value);
        } else {
          result[key] = value;
        }
      }

      if (isEmbeddedModel) {
        result.__structureKeys = keys.join(',');
      }

      return result;
    },

    /**
     * Create a hash string using FNV-1a algorithm
     * UNCHANGED: Existing implementation preserved
     */
    createHash(str) {
      if (!str || typeof str !== 'string') {
        return 'invalid-input';
      }

      let hash = 2166136261;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }

      hash = hash >>> 0;
      return 'h' + hash.toString(16);
    },

    /**
     * Get statistics about the registry
     * ENHANCED: Now includes tenant registry statistics
     */
    getStats() {
      const tenantStats = Array.from(tenantRegistries.values()).map(registry => registry.getStats());
      const globalRegistry = tenantRegistries.get(GLOBAL_TENANT);

      // Calculate tenant-specific stats (excluding global tenant)
      const realTenantStats = tenantStats.filter(stats => stats.tenantCode !== GLOBAL_TENANT);
      const totalTenantModels = realTenantStats.reduce((sum, stats) => sum + stats.modelCount, 0);

      return {
        totalModels,
        reuseCount,
        uniqueModels: tenantStats.reduce((sum, stats) => sum + stats.modelCount, 0),

        // Tenant registry statistics (excluding global tenant)
        tenantRegistries: realTenantStats.length,
        tenantStats: realTenantStats,
        totalTenantModels: totalTenantModels
      };
    },

    /**
     * Clear the registry (mainly for testing)
     * ENHANCED: Now clears all tenant registries
     */
    clear() {
      // Clear all tenant registries (including global tenant)
      for (const registry of tenantRegistries.values()) {
        registry.cleanup();
      }
      tenantRegistries.clear();
      modelToTenant.clear();

      totalModels = 0;
      reuseCount = 0;
      debug('Model registry cleared (all tenant registries)');
    },

    // NEW METHODS: Tenant-specific operations

    /**
     * Clean up models associated with a specific tenant
     * @param {String} tenantCode - The tenant to clean up
     * @returns {Number} Number of models cleaned up
     */
    cleanupTenant(tenantCode) {
      if (!tenantCode || tenantCode === 'trap' || tenantCode === GLOBAL_TENANT) {
        return 0; // Don't allow cleanup of global tenant
      }

      const tenantRegistry = tenantRegistries.get(tenantCode);
      if (!tenantRegistry) {
        return 0;
      }

      const modelCount = tenantRegistry.modelsByName.size;

      // Remove model-to-tenant mappings for this tenant
      for (const [model, tenant] of modelToTenant) {
        if (tenant === tenantCode) {
          modelToTenant.delete(model);
        }
      }

      // Clean up tenant registry
      tenantRegistry.cleanup();
      tenantRegistries.delete(tenantCode);

      debug(`Cleaned up tenant ${tenantCode} registry with ${modelCount} models`);
      return modelCount;
    },

    /**
     * Clean up inactive tenant registries
     * @param {Number} maxIdleTime - Maximum idle time in milliseconds (default: 30 minutes)
     * @returns {Number} Number of tenants cleaned up
     */
    cleanupInactiveTenants(maxIdleTime = 30 * 60 * 1000) {
      const now = Date.now();
      const tenantsToCleanup = [];

      for (const [tenantCode, registry] of tenantRegistries) {
        // Don't cleanup the global tenant
        if (tenantCode !== GLOBAL_TENANT && now - registry.lastAccessed >= maxIdleTime) {
          tenantsToCleanup.push(tenantCode);
        }
      }

      let totalCleaned = 0;
      tenantsToCleanup.forEach(tenantCode => {
        totalCleaned += this.cleanupTenant(tenantCode);
      });

      if (totalCleaned > 0) {
        debug(`Cleaned up ${tenantsToCleanup.length} inactive tenant registries with ${totalCleaned} total models`);
      }

      return tenantsToCleanup.length;
    },

    /**
     * Get detailed tenant registry information
     * @returns {Object} Detailed tenant information
     */
    getTenantRegistryInfo() {
      const tenantInfo = {};
      const globalRegistry = tenantRegistries.get(GLOBAL_TENANT);

      for (const [tenantCode, registry] of tenantRegistries) {
        tenantInfo[tenantCode] = {
          ...registry.getStats(),
          models: Array.from(registry.modelsByName.keys())
        };
      }

      return {
        activeTenants: tenantRegistries.size - (globalRegistry ? 1 : 0), // Exclude global tenant from count
        tenants: tenantInfo,
        globalModels: globalRegistry ? globalRegistry.modelsByName.size : 0
      };
    }
  };
})();

/**
 * Registry Manager for automatic cleanup
 * Handles periodic cleanup of inactive tenant registries
 */
class RegistryManager {
  constructor(options = {}) {
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.maxIdleTime = options.maxIdleTime || 30 * 60 * 1000; // 30 minutes
    this.timer = null;
    
    // Auto-start cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of inactive tenant registries
   */
  startPeriodicCleanup() {
    if (this.timer) {
      return; // Already started
    }

    this.timer = setInterval(() => {
      try {
        const cleaned = ModelRegistry.cleanupInactiveTenants(this.maxIdleTime);
        if (cleaned > 0) {
          debug(`Periodic cleanup: removed ${cleaned} inactive tenant registries`);
        }
      } catch (error) {
        debug('Error during periodic cleanup:', error);
      }
    }, this.cleanupInterval);

    debug(`Started periodic cleanup with ${this.cleanupInterval}ms interval and ${this.maxIdleTime}ms max idle time`);
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      debug('Stopped periodic cleanup');
    }
  }

  /**
   * Force cleanup now
   * @returns {Number} Number of tenants cleaned up
   */
  forceCleanup() {
    return ModelRegistry.cleanupInactiveTenants(0); // Force immediate cleanup
  }

  /**
   * Get cleanup statistics
   * @returns {Object} Cleanup statistics
   */
  getStats() {
    return {
      cleanupInterval: this.cleanupInterval,
      maxIdleTime: this.maxIdleTime,
      isActive: !!this.timer,
      registryStats: ModelRegistry.getStats()
    };
  }

  /**
   * Reset the registry manager state (mainly for testing)
   */
  reset() {
    this.stopPeriodicCleanup();
    // No other state to reset - the manager is stateless except for the timer
  }
}

// Create singleton registry manager
const registryManager = new RegistryManager();

/**
 * Compare two property objects for equivalence
 * UNCHANGED: Existing implementation preserved for backward compatibility
 */
function arePropertiesEquivalent(props1, props2) {
  if (props1 === props2) return true;

  if (!props1 || !props2 || typeof props1 !== 'object' || typeof props2 !== 'object') {
    return false;
  }

  const keys1 = Object.keys(props1).sort();
  const keys2 = Object.keys(props2).sort();

  if (keys1.length !== keys2.length) return false;

  if (!keys1.every((key, i) => key === keys2[i])) return false;

  return keys1.every(key => {
    const val1 = props1[key];
    const val2 = props2[key];

    if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) return false;

        if (val1.length > 0 && typeof val1[0] === 'object') {
          return val1.every((item, i) => arePropertiesEquivalent(item, val2[i]));
        }

        return val1.every((item, i) => item === val2[i]);
      }

      return arePropertiesEquivalent(val1, val2);
    }

    if (key === 'type') {
      const type1 = typeof val1 === 'function' ? val1.name : val1;
      const type2 = typeof val2 === 'function' ? val2.name : val2;
      return type1 === type2;
    }

    return val1 === val2;
  });
}

/**
 * Find an equivalent anonymous model in the ModelBuilder
 * UNCHANGED: Existing implementation preserved for backward compatibility
 */
function findEquivalentAnonymousModel(modelBuilder, sourceModel) {
  if (!sourceModel.settings || !sourceModel.settings.anonymous) {
    return null;
  }

  const sourceProps = sourceModel.definition.properties;

  const anonymousModels = Object.keys(modelBuilder.models)
    .filter(name => name.startsWith('AnonymousModel_'))
    .map(name => modelBuilder.models[name])
    .filter(model => model && model.definition);

  for (const model of anonymousModels) {
    if (arePropertiesEquivalent(model.definition.properties, sourceProps)) {
      return model;
    }
  }

  return null;
}

// Export the registry and helper functions
module.exports = {
  ModelRegistry,
  arePropertiesEquivalent,
  findEquivalentAnonymousModel,
  
  // Export new functionality
  registryManager,
  getCurrentTenant
};
