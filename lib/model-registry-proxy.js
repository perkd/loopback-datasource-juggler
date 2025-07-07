// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const debug = require('debug')('loopback:juggler:model-registry-proxy');

/**
 * ModelRegistryProxy - Intelligent proxy for centralized model management
 * 
 * This proxy makes the ModelRegistry appear as a regular object while providing
 * owner-aware filtering. It supports all standard object operations including:
 * - Property access (get/set)
 * - Object.keys(), Object.values(), Object.entries()
 * - for...in loops
 * - hasOwnProperty checks
 * - Array-like methods (forEach, map, filter)
 * 
 * The proxy maintains 100% backward compatibility with existing code that
 * expects DataSource.models to behave like a regular object.
 */
class ModelRegistryProxy {
  constructor(owner, ownerType) {
    if (!owner) {
      throw new Error('ModelRegistryProxy requires an owner object');
    }
    if (!ownerType || (ownerType !== 'dataSource' && ownerType !== 'app')) {
      throw new Error('ModelRegistryProxy requires ownerType to be "dataSource" or "app"');
    }

    this.owner = owner;
    this.ownerType = ownerType;
    
    debug(`Creating ModelRegistryProxy for ${ownerType}: ${owner.name || owner.constructor.name}`);
    
    // Return a Proxy that intercepts all property access
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Handle special properties and symbols
        if (typeof prop === 'symbol' || prop === 'constructor') {
          return Reflect.get(target, prop, receiver);
        }
        
        if (typeof prop === 'string') {
          // Handle special object properties
          if (prop === 'length') {
            return target.getModelNames().length;
          }
          
          if (prop === 'toString') {
            return () => `[ModelRegistryProxy:${target.ownerType}]`;
          }
          
          if (prop === 'valueOf') {
            return () => target.getModelNames();
          }
          
          // Handle array methods for compatibility
          if (prop === 'forEach') {
            return (callback, thisArg) => {
              const modelNames = target.getModelNames();
              modelNames.forEach((modelName, index) => {
                const model = target.getModel(modelName);
                callback.call(thisArg, model, modelName, target);
              });
            };
          }
          
          if (prop === 'map') {
            return (callback, thisArg) => {
              const modelNames = target.getModelNames();
              return modelNames.map((modelName, index) => {
                const model = target.getModel(modelName);
                return callback.call(thisArg, model, modelName, target);
              });
            };
          }
          
          if (prop === 'filter') {
            return (callback, thisArg) => {
              const results = [];
              const modelNames = target.getModelNames();
              modelNames.forEach((modelName, index) => {
                const model = target.getModel(modelName);
                if (callback.call(thisArg, model, modelName, target)) {
                  results.push(model);
                }
              });
              return results;
            };
          }
          
          // Handle Object static methods
          if (prop === 'keys') {
            return () => target.getModelNames();
          }
          
          if (prop === 'values') {
            return () => target.getModelNames().map(name => target.getModel(name));
          }
          
          if (prop === 'entries') {
            return () => target.getModelNames().map(name => [name, target.getModel(name)]);
          }

          // Handle hasOwnProperty method
          if (prop === 'hasOwnProperty') {
            return (propName) => target.hasModel(propName);
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
        // Only return model names for enumeration (Object.keys, for...in)
        // This ensures clean enumeration without internal methods
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
  
  /**
   * Get a model by name for this owner
   * @param {String} modelName - The name of the model to retrieve
   * @returns {Object|undefined} The model if it exists and belongs to this owner
   */
  getModel(modelName) {
    const { ModelRegistry } = require('./model-registry');
    return ModelRegistry.getModelForOwner(this.owner, modelName);
  }
  
  /**
   * Set/register a model for this owner
   * @param {String} modelName - The name of the model
   * @param {Object} model - The model object to register
   * @returns {Boolean} True if successful, false otherwise
   */
  setModel(modelName, model) {
    if (!model || typeof model !== 'object') {
      debug(`Invalid model provided for ${modelName}: ${typeof model}`);
      return false;
    }
    
    // Set up ownership relationship
    if (this.ownerType === 'dataSource') {
      model.dataSource = this.owner;
    } else if (this.ownerType === 'app') {
      model.app = this.owner;
    }
    
    // Ensure model has the correct name
    if (!model.modelName) {
      model.modelName = modelName;
    }
    
    // Register in ModelRegistry
    const { ModelRegistry } = require('./model-registry');
    ModelRegistry.registerModel(model);
    
    debug(`Registered model ${modelName} for ${this.ownerType}: ${this.owner.name || this.owner.constructor.name}`);
    return true;
  }
  
  /**
   * Check if a model exists for this owner
   * @param {String} modelName - The name of the model to check
   * @returns {Boolean} True if the model exists and belongs to this owner
   */
  hasModel(modelName) {
    const { ModelRegistry } = require('./model-registry');
    return ModelRegistry.hasModelForOwner(this.owner, modelName);
  }
  
  /**
   * Get all model names for this owner
   * @returns {Array} Array of model names owned by this owner
   */
  getModelNames() {
    const { ModelRegistry } = require('./model-registry');
    return ModelRegistry.getModelNamesForOwner(this.owner);
  }
}

module.exports = ModelRegistryProxy;
