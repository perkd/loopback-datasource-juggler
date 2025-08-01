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
 * Enhanced with reference counting for proper cleanup
 */
class TenantRegistry {
  constructor(tenantCode) {
    this.tenantCode = tenantCode;
    this.modelsByFingerprint = new Map();
    this.modelsByName = new Map();
    this.creationTime = Date.now();
    this.lastAccessed = Date.now();
    this.referenceCount = 0; // Track DataSource usage
    this.dataSourceRefs = new WeakSet(); // Track DataSource instances
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

    const modelProperties = properties || (model.definition && model.definition.properties);
    const fingerprint = ModelRegistry.generateFingerprint(modelProperties);

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
   * Add a DataSource reference to this tenant registry
   * @param {Object} dataSource - The DataSource instance
   */
  addDataSourceReference(dataSource) {
    if (dataSource && !this.dataSourceRefs.has(dataSource)) {
      this.dataSourceRefs.add(dataSource);
      this.referenceCount++;
      this.lastAccessed = Date.now();
      debug(`Added DataSource reference to tenant ${this.tenantCode}, count: ${this.referenceCount}`);
    }
  }

  /**
   * Remove a DataSource reference from this tenant registry
   * @param {Object} dataSource - The DataSource instance
   * @returns {Boolean} True if registry should be cleaned up (no more references)
   */
  removeDataSourceReference(dataSource) {
    if (dataSource && this.dataSourceRefs.has(dataSource)) {
      this.dataSourceRefs.delete(dataSource);
      this.referenceCount--;
      debug(`Removed DataSource reference from tenant ${this.tenantCode}, count: ${this.referenceCount}`);
    } else {
      debug(`DataSource not found in references for tenant ${this.tenantCode}, ` +
        `count: ${this.referenceCount}`);
    }
    return this.referenceCount <= 0;
  }

  /**
   * Clean up all models in this tenant's registry
   * Enhanced with proper reference handling
   */
  cleanup() {
    debug(`Cleaning up tenant registry for ${this.tenantCode} with ${this.modelsByName.size} models`);

    // Enhanced cleanup with proper model disposal
    for (const model of this.modelsByName.values()) {
      if (model && typeof model.cleanup === 'function') {
        try {
          model.cleanup();
        } catch (err) {
          debug(`Error cleaning up model ${model.modelName}:`, err);
        }
      }
    }

    // Clear all maps
    this.modelsByFingerprint.clear();
    this.modelsByName.clear();
    this.dataSourceRefs = null;
    this.referenceCount = 0;
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
      idleTime: Date.now() - this.lastAccessed,
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

  // Note: GLOBAL_TENANT removed - all models now use DataSource-based tenant isolation

  // Performance cache for frequent queries (as specified in proposal)
  const performanceCache = new Map();
  const instanceCache = new WeakMap(); // DataSource instance -> cached models (for proper isolation)
  const cacheGeneration = new WeakMap(); // DataSource instance -> cache generation number
  let currentGeneration = 0; // Global cache generation counter

  // Statistics
  let totalModels = 0;
  let reuseCount = 0;

  /**
   * Global registry for models without tenant context (backward compatibility)
   */
  let globalRegistry = null;

  /**
   * Get or create a tenant registry
   * @param {String} tenantCode - The tenant code (null/undefined uses global tenant)
   * @param {Object} dataSource - Optional DataSource to track reference
   * @returns {TenantRegistry} The tenant registry (always returns a registry)
   */
  function getTenantRegistry(tenantCode, dataSource = null) {
    // Handle global registry for backward compatibility
    if (!tenantCode || tenantCode === 'global') {
      if (!globalRegistry) {
        globalRegistry = new TenantRegistry('global');
      }
      if (dataSource) {
        globalRegistry.addDataSourceReference(dataSource);
      }
      return globalRegistry;
    }

    // Handle invalid tenant codes by falling back to global registry
    const invalidTenantCodes = ['trap', '', 0, false];
    if (!tenantCode || invalidTenantCodes.includes(tenantCode)) {
      if (!globalRegistry) {
        globalRegistry = new TenantRegistry('global');
      }
      if (dataSource) {
        globalRegistry.addDataSourceReference(dataSource);
      }
      return globalRegistry;
    }

    if (!tenantRegistries.has(tenantCode)) {
      debug(`Creating new tenant registry for ${tenantCode}`);
      tenantRegistries.set(tenantCode, new TenantRegistry(tenantCode));
    }

    const registry = tenantRegistries.get(tenantCode);
    if (dataSource) {
      registry.addDataSourceReference(dataSource);
    }
    return registry;
  }

  /**
   * Get the effective tenant for a model
   * Models can be registered through DataSource or App, so we use owner instance identity for perfect tenant isolation.
   * @param {Object} model - The model to check
   * @param {String} currentTenant - The current tenant context
   * @returns {String} The tenant to use for this model
   */
  function getEffectiveTenant(model, currentTenant) {
    // Models registered through DataSource.define() or DataSource.attach()
    // have model.dataSource set, so use DataSource instance for tenant isolation
    if (model && model.dataSource) {
      const dsId = model.dataSource._dsId ||
        (model.dataSource._dsId = generateDataSourceId(model.dataSource));
      return `ds_${dsId}`;
    }

    // Models registered through app.model() or ModelRegistry.registerModelForApp()
    // have model.app set, so use App instance for tenant isolation
    if (model && model.app) {
      const appId = model.app._appId || (model.app._appId = generateAppId(model.app));
      return `app_${appId}`;
    }

    // For models without DataSource or App (e.g., created with ModelBuilder),
    // use the current tenant context if available, otherwise use global registry
    if (currentTenant) {
      return currentTenant;
    }

    // Handle models without tenant context - use global registry for backward compatibility
    const modelName = (model && model.modelName) || 'unknown';
    debug(`Model ${modelName} has no DataSource, App, or tenant context, using global registry`);
    return 'global';
  }

  /**
   * Generate a stable identifier for a DataSource instance based on configuration
   * This prevents memory leaks by reusing tenant registries for identical configurations
   * @param {Object} dataSource - The DataSource instance
   * @returns {String} Stable identifier based on configuration
   */
  function generateDataSourceId(dataSource) {
    const connectorName = dataSource.connector ? dataSource.connector.name || 'unknown' : 'none';
    const settings = dataSource.settings || {};

    // Create stable ID based on connection configuration
    const host = settings.host || 'localhost';
    const port = settings.port || '';
    const database = settings.database ||
      (settings.url ? (settings.url.split('/').pop() || '').split('?')[0] : '') || 'default';

    // Use configuration hash for stability and reusability
    const configString = `${connectorName}:${host}:${port}:${database}`;
    const configHash = require('crypto').createHash('md5').update(configString).digest('hex').substr(0, 8);

    return `${connectorName}_${configHash}`;
  }

  /**
   * Generate a unique identifier for an App instance
   * @param {Object|Function} app - The App instance
   * @returns {String} Unique identifier
   */
  function generateAppId(app) {
    if (!app) return 'unknown';

    // Use a combination of constructor name and timestamp
    const appName = (app.constructor && app.constructor.name) || app.name || 'App';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);

    return `${appName}_${timestamp}_${random}`;
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

      // Get the appropriate tenant registry and track DataSource reference
      const tenantRegistry = getTenantRegistry(effectiveTenant, model.dataSource);
      tenantRegistry.registerModel(model, properties);

      // Track which tenant owns this model
      modelToTenant.set(model, effectiveTenant);

      // Track statistics
      totalModels++;

      // Clear performance cache when new models are registered (as specified in proposal)
      performanceCache.clear();

      // Invalidate instance cache for the DataSource that owns this model
      if (model.dataSource && instanceCache.has(model.dataSource)) {
        instanceCache.delete(model.dataSource);
      }

      const isAnonymous = !!(model.settings && model.settings.anonymous);
      debug(`Registered model ${model.modelName} (current tenant: ${currentTenant || 'none'}, ` +
        `effective tenant: ${effectiveTenant}, anonymous: ${isAnonymous})`);

      return model;
    },

    /**
     * Register a model for a specific App instance
     * This method should be called by LoopBack framework when app.model() is used
     *
     * @param {Object} app - The LoopBack App instance
     * @param {Object} model - The model to register
     * @param {Object} properties - The model's properties (optional)
     * @returns {Object} The registered model
     */
    registerModelForApp(app, model, properties) {
      if (!app || !model || !model.modelName) return model;

      // Set up the app relationship
      model.app = app;

      // Register the model in the centralized registry
      this.registerModel(model, properties);

      const appName = (app.constructor && app.constructor.name) || 'App';
      debug(`Registered model ${model.modelName} for app ${appName}`);

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

      // BACKWARD COMPATIBILITY: Search in all tenant registries if no current tenant
      // This ensures existing code continues to work as expected
      const searchTenants = currentTenant ? [currentTenant] : Array.from(tenantRegistries.keys());

      // Always search global registry first for backward compatibility
      if (globalRegistry) {
        const model = globalRegistry.findModelByStructure(properties);
        if (model) {
          // Apply the same validation logic as for tenant registries
          try {
            const isTest = process.env.NODE_ENV === 'test';
            const modelSettings = model.settings || {};
            const modelBuilderSettings = model.modelBuilder && model.modelBuilder.settings || {};
            const builder = currentModelBuilder || this.getCurrentModelBuilder();
            const currentModelBuilderSettings = builder && builder.settings || {};
            const hasParentRef = modelBuilderSettings.parentRef;
            const modelHasStrictEmbedded = modelSettings.strict === true ||
              modelBuilderSettings.strictEmbeddedModels === true;
            const currentHasStrictEmbedded = currentModelBuilderSettings.strictEmbeddedModels === true;

            if (modelHasStrictEmbedded !== currentHasStrictEmbedded) {
              debug(`Skipping global model reuse for ${model.modelName} - strict settings ` +
                `don't match (model: ${modelHasStrictEmbedded}, current: ${currentHasStrictEmbedded})`);
              // Don't return the model, continue searching
            } else if (isTest && hasParentRef) {
              debug(`Skipping global model reuse for ${model.modelName} in test ` +
                'environment with parentRef enabled');
              // Don't return the model, continue searching
            } else {
              reuseCount++;
              return model;
            }
          } catch (e) {
            debug('Error checking global model settings:', e);
            // Don't return the model, continue searching
          }
        }
      }

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
            const modelHasStrictEmbedded = modelSettings.strict === true ||
              modelBuilderSettings.strictEmbeddedModels === true;
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

          // All models are now properly isolated by DataSource, no need for special handling

          reuseCount++;
          debug(`Found model ${model.modelName} in tenant ${tenantCode} for ` +
            `current tenant ${currentTenant || 'none'}`);
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
      // Search global registry first for backward compatibility
      if (globalRegistry) {
        const model = globalRegistry.findModelByName(name);
        if (model) {
          return model;
        }
      }

      // Search across all tenant registries since models can be in DataSource or App tenants
      for (const [tenantCode, tenantRegistry] of tenantRegistries) {
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

      // Include global registry models in total but not in tenant statistics
      const globalModels = globalRegistry ? globalRegistry.getStats().modelCount : 0;
      const totalTenantModels = tenantStats.reduce((sum, stats) => sum + stats.modelCount, 0);

      return {
        totalModels,
        reuseCount,
        uniqueModels: tenantStats.reduce((sum, stats) => sum + stats.modelCount, 0) + globalModels,

        // Tenant registry statistics (excludes global registry)
        tenantRegistries: tenantStats.length,
        tenantStats: tenantStats,
        totalTenantModels: totalTenantModels,
      };
    },

    /**
     * Clear the registry (mainly for testing)
     * ENHANCED: Now clears all tenant registries
     */
    clear() {
      // Clear all tenant registries
      for (const registry of tenantRegistries.values()) {
        registry.cleanup();
      }
      tenantRegistries.clear();

      // Clear global registry
      if (globalRegistry) {
        globalRegistry.cleanup();
        globalRegistry = null;
      }

      modelToTenant.clear();
      performanceCache.clear();

      // Invalidate instance cache by incrementing generation
      currentGeneration++;

      totalModels = 0;
      reuseCount = 0;
      debug('Model registry cleared (all tenant registries)');
    },

    // NEW METHODS: Tenant-specific operations

    /**
     * Clean up models associated with a specific tenant
     * Enhanced with DataSource reference tracking
     * @param {String} tenantCode - The tenant to clean up
     * @param {Object} dataSource - Optional DataSource to remove reference for
     * @returns {Number} Number of models cleaned up
     */
    cleanupTenant(tenantCode, dataSource = null) {
      if (!tenantCode || tenantCode === 'trap') {
        return 0; // Invalid tenant code
      }

      // Handle global registry separately
      if (tenantCode === 'global') {
        if (!globalRegistry) {
          return 0;
        }

        // If DataSource is provided, only remove its reference
        if (dataSource) {
          const shouldCleanup = globalRegistry.removeDataSourceReference(dataSource);
          if (!shouldCleanup) {
            debug('Removed DataSource reference from global registry, but registry still has references');
            return 0; // Don't cleanup if other DataSources are still using this registry
          }
        }

        const modelCount = globalRegistry.modelsByName.size;

        // Remove model-to-tenant mappings for global registry
        for (const [model, tenant] of modelToTenant) {
          if (tenant === 'global') {
            modelToTenant.delete(model);
          }
        }

        // Clean up global registry
        globalRegistry.cleanup();
        globalRegistry = null;

        debug(`Cleaned up global registry with ${modelCount} models`);
        return modelCount;
      }

      const tenantRegistry = tenantRegistries.get(tenantCode);
      if (!tenantRegistry) {
        return 0;
      }

      // If DataSource is provided, only remove its reference
      if (dataSource) {
        const shouldCleanup = tenantRegistry.removeDataSourceReference(dataSource);
        if (!shouldCleanup) {
          debug(`Removed DataSource reference from tenant ${tenantCode}, but registry still has references`);
          return 0; // Don't cleanup if other DataSources are still using this registry
        }
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
        // All tenants are DataSource-based and can be cleaned up when idle
        if (now - registry.lastAccessed >= maxIdleTime) {
          tenantsToCleanup.push(tenantCode);
        }
      }

      let totalCleaned = 0;
      tenantsToCleanup.forEach(tenantCode => {
        totalCleaned += this.cleanupTenant(tenantCode);
      });

      if (totalCleaned > 0) {
        debug(`Cleaned up ${tenantsToCleanup.length} inactive tenant registries ` +
          `with ${totalCleaned} total models`);
      }

      return tenantsToCleanup.length;
    },

    /**
     * Get detailed tenant registry information
     * @returns {Object} Detailed tenant information
     */
    getTenantRegistryInfo() {
      const tenantInfo = {};

      for (const [tenantCode, registry] of tenantRegistries) {
        tenantInfo[tenantCode] = {
          ...registry.getStats(),
          models: Array.from(registry.modelsByName.keys()),
          isDataSourceBased: tenantCode.startsWith('ds_'),
        };
      }

      return {
        activeDataSources: tenantRegistries.size, // All tenants are DataSource-based
        activeTenants: tenantRegistries.size,
        tenants: tenantInfo,
        globalModels: globalRegistry ? Array.from(globalRegistry.modelsByName.keys()) : [],
      };
    },

    // NEW METHODS: Owner-aware queries for centralized model management

    /**
     * Get all models for a specific owner (with explicit owner type)
     * @param {Object} owner - The owner object (DataSource or App instance)
     * @param {String} ownerType - The type of owner ('dataSource' or 'app')
     * @returns {Array} Array of models owned by the specified owner
     */
    getModelsForOwnerWithType(owner, ownerType) {
      if (!owner || !ownerType) {
        return [];
      }

      // For DataSource owners, we can directly determine the tenant from the DataSource
      if (ownerType === 'dataSource') {
        const dsId = owner._dsId || (owner._dsId = generateDataSourceId(owner));
        const tenantCode = `ds_${dsId}`;

        if (tenantRegistries.has(tenantCode)) {
          const tenantRegistry = tenantRegistries.get(tenantCode);
          const models = [];

          for (const model of tenantRegistry.modelsByName.values()) {
            // Only include models that belong to this DataSource and are NOT registered with an App
            if (model.dataSource === owner && !model.app) {
              models.push(model);
            }
          }
          return models;
        }
        return [];
      }

      // For App owners, search across all registries
      if (ownerType === 'app') {
        const models = [];
        for (const tenantRegistry of tenantRegistries.values()) {
          for (const model of tenantRegistry.modelsByName.values()) {
            if (model.app === owner) {
              models.push(model);
            }
          }
        }
        return models;
      }

      return [];
    },

    /**
     * Get model names for a specific owner (with explicit owner type)
     * @param {Object} owner - The owner object (DataSource or App instance)
     * @param {String} ownerType - The type of owner ('dataSource' or 'app')
     * @returns {Array} Array of model names owned by the specified owner
     */
    getModelNamesForOwnerWithType(owner, ownerType) {
      return this.getModelsForOwnerWithType(owner, ownerType).map(model => model.modelName);
    },

    /**
     * Check if a model exists for a specific owner (with explicit owner type)
     * @param {Object} owner - The owner object (DataSource or App instance)
     * @param {String} modelName - The name of the model to check
     * @param {String} ownerType - The type of owner ('dataSource' or 'app')
     * @returns {Boolean} True if the model exists and belongs to the owner
     */
    hasModelForOwnerWithType(owner, modelName, ownerType) {
      if (!modelName || !owner || !ownerType) {
        return false;
      }

      const model = this.findModelByName(modelName);
      if (!model) {
        return false;
      }

      if (ownerType === 'dataSource') {
        return model.dataSource === owner;
      } else if (ownerType === 'app') {
        return model.app === owner;
      }

      return false;
    },

    /**
     * Get a specific model for a specific owner (with explicit owner type)
     * @param {Object} owner - The owner object (DataSource or App instance)
     * @param {String} modelName - The name of the model to retrieve
     * @param {String} ownerType - The type of owner ('dataSource' or 'app')
     * @returns {Object|undefined} The model if it exists and belongs to the owner, undefined otherwise
     */
    getModelForOwnerWithType(owner, modelName, ownerType) {
      if (!modelName || !owner || !ownerType) {
        return undefined;
      }

      const model = this.findModelByName(modelName);
      if (!model) {
        return undefined;
      }

      if (ownerType === 'dataSource' && model.dataSource === owner) {
        return model;
      } else if (ownerType === 'app' && model.app === owner) {
        return model;
      }

      return undefined;
    },

    // ========================================================================
    // PROPOSAL API: Simplified owner-aware methods (auto-detect owner type)
    // These methods provide the exact API specified in the proposal document
    // ========================================================================

    /**
     * Auto-detect owner type based on object properties
     * @param {Object|Function} owner - The owner object to analyze (can be function for LoopBack Apps)
     * @returns {String|null} 'dataSource', 'app', or null if unrecognized
     */
    _detectOwnerType(owner) {
      if (!owner) {
        return null;
      }

      // LoopBack Apps are functions, not objects
      const isObject = typeof owner === 'object';
      const isFunction = typeof owner === 'function';

      if (!isObject && !isFunction) {
        return null;
      }

      // Check for DataSource characteristics (must be object)
      if (isObject && (owner.connector !== undefined || owner.modelBuilder !== undefined ||
          (owner.constructor && owner.constructor.name === 'DataSource'))) {
        return 'dataSource';
      }

      // Check for App characteristics (can be function or object)
      if ((isFunction || isObject) && (
        owner.models !== undefined ||
          owner.registry !== undefined ||
          owner.dataSources !== undefined ||
          owner.middleware !== undefined ||
          (owner.constructor && (
            owner.constructor.name === 'LoopBackApplication' ||
            owner.constructor.name === 'Application' ||
            owner.constructor.name === 'App'
          )) ||
          // Check for common LoopBack app methods
          (typeof owner.model === 'function') ||
          (typeof owner.use === 'function' && typeof owner.listen === 'function')
      )) {
        return 'app';
      }

      return null;
    },

    /**
     * Get all models owned by the specified owner (PROPOSAL API)
     * Auto-detects owner type for simplified usage with performance caching
     * @param {Object} owner - Owner object to query (DataSource or App)
     * @returns {Array} Array of model instances
     */
    getModelsForOwner(owner) {
      if (!owner) {
        return [];
      }

      // For DataSource instances, use WeakMap cache for proper isolation without memory leaks
      if (owner.constructor.name === 'DataSource') {
        // Check instance cache first, but also verify cache generation
        if (instanceCache.has(owner) && cacheGeneration.has(owner) &&
            cacheGeneration.get(owner) === currentGeneration) {
          return instanceCache.get(owner);
        }

        const ownerType = this._detectOwnerType(owner);
        if (!ownerType) {
          const ownerName = (owner.constructor && owner.constructor.name) || 'unknown';
          debug(`Unable to detect owner type for ${ownerName}`);
          return [];
        }

        const models = this.getModelsForOwnerWithType(owner, ownerType);

        // Cache the result using WeakMap (automatically cleaned up when DataSource is GC'd)
        instanceCache.set(owner, models);
        cacheGeneration.set(owner, currentGeneration);

        return models;
      } else {
        // For non-DataSource owners, use the original caching logic
        const ownerType = this._detectOwnerType(owner);
        if (ownerType === 'app') {
          const appId = owner._appId || (owner._appId = generateAppId(owner));
          const cacheKey = `models_App_${appId}`;

          // Check performance cache first
          if (performanceCache.has(cacheKey)) {
            return performanceCache.get(cacheKey);
          }

          const models = this.getModelsForOwnerWithType(owner, ownerType);

          // Cache the result for future queries
          performanceCache.set(cacheKey, models);

          return models;
        } else {
          // For other owners, no caching
          const models = this.getModelsForOwnerWithType(owner, ownerType);
          return models;
        }
      }
    },

    /**
     * Get model names owned by the specified owner (PROPOSAL API)
     * @param {Object} owner - Owner object to query
     * @returns {Array} Array of model names
     */
    getModelNamesForOwner(owner) {
      const models = this.getModelsForOwner(owner);
      return models.map(model => model.modelName);
    },

    /**
     * Check if a specific model exists for an owner (PROPOSAL API)
     * @param {Object} owner - Owner object
     * @param {String} modelName - Name of the model
     * @returns {Boolean} True if model exists for owner
     */
    hasModelForOwner(owner, modelName) {
      const models = this.getModelsForOwner(owner);
      return models.some(model => model.modelName === modelName);
    },

    /**
     * Get a specific model for an owner (PROPOSAL API)
     * @param {Object} owner - Owner object
     * @param {String} modelName - Name of the model
     * @returns {Object|undefined} Model instance or undefined
     */
    getModelForOwner(owner, modelName) {
      const models = this.getModelsForOwner(owner);
      return models.find(model => model.modelName === modelName);
    },

    /**
     * Get all registered models (PROPOSAL API)
     * @returns {Map} Map of all registered models
     */
    getAllModels() {
      const allModels = new Map();

      // Collect models from all tenant registries
      for (const tenantRegistry of tenantRegistries.values()) {
        for (const [modelName, model] of tenantRegistry.modelsByName) {
          allModels.set(modelName, {
            model,
            properties: model.definition && model.definition.properties,
            registeredAt: new Date(),
            tenant: tenantRegistry.tenantCode,
          });
        }
      }

      return allModels;
    },

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

    debug(`Started periodic cleanup with ${this.cleanupInterval}ms interval and ` +
      `${this.maxIdleTime}ms max idle time`);
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
      registryStats: ModelRegistry.getStats(),
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
  getCurrentTenant,
};
