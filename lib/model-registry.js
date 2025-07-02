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
