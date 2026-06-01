'use strict';

/**
 * Register isValid() rules for properties marked as MongoDB ObjectId.
 * Runs once per model at DataSource.setupDataAccess for mongodb connectors.
 */

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
const OBJECT_ID_TYPE = /^objectid$/i;

function hasObjectIdStorage(propDef) {
  if (!propDef) return false;
  if (propDef.mongodb && OBJECT_ID_TYPE.test(String(propDef.mongodb.dataType || ''))) {
    return true;
  }
  const type = propDef.type;
  if (typeof type === 'string' && OBJECT_ID_TYPE.test(type)) {
    return true;
  }
  if (typeof type === 'function' && OBJECT_ID_TYPE.test(String(type.name || ''))) {
    return true;
  }
  if (Array.isArray(type) && type[0] && OBJECT_ID_TYPE.test(String(type[0].name || type[0]))) {
    return true;
  }
  return false;
}

function resolvePropertyType(propDef) {
  if (!propDef) return null;
  let type = propDef.type;
  if (Array.isArray(type)) type = type[0];
  return type || null;
}

function isNestedModelType(propType) {
  if (!propType) return false;
  if (Array.isArray(propType)) return isNestedModelType(propType[0]);
  return !!(propType.definition && propType.definition.properties);
}

function collectObjectIdPaths(properties, paths, prefix) {
  if (!properties) return paths;

  for (const name of Object.keys(properties)) {
    const propDef = properties[name];
    const fullPath = prefix ? `${prefix}.${name}` : name;
    const rootAttr = prefix ? prefix.split('.')[0] : name;

    if (hasObjectIdStorage(propDef)) {
      paths.push({
        rootAttr,
        fullPath,
        segments: fullPath.split('.'),
      });
    }

    const nestedType = resolvePropertyType(propDef);
    if (isNestedModelType(nestedType)) {
      collectObjectIdPaths(nestedType.definition.properties, paths, fullPath);
    }
  }

  return paths;
}

function getByPath(data, segments) {
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function isValidObjectIdValue(value) {
  if (value == null || value === '') return true;

  if (Array.isArray(value)) {
    return value.every(isValidObjectIdValue);
  }

  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return true;
    if (value._bsontype === 'ObjectID' || value._bsontype === 'ObjectId') return true;
    const ctorName = value.constructor && value.constructor.name;
    if (ctorName === 'ObjectId' || ctorName === 'ObjectID') return true;
  }

  return typeof value === 'string' && OBJECT_ID_HEX.test(value);
}

function groupPathsByRoot(paths) {
  const byRoot = new Map();
  for (const path of paths) {
    if (!byRoot.has(path.rootAttr)) byRoot.set(path.rootAttr, []);
    byRoot.get(path.rootAttr).push(path);
  }
  return byRoot;
}

function resolveConnectorName(dataSourceOptions) {
  if (!dataSourceOptions) return null;

  const connector = dataSourceOptions.connector;
  if (connector && connector.name) return connector.name;

  const settings = dataSourceOptions.settings;
  if (settings && typeof settings.connector === 'string') {
    return settings.connector;
  }
  if (settings && settings.connector && settings.connector.name) {
    return settings.connector.name;
  }

  return null;
}

function shouldRegister(modelClass, modelSettings, dataSourceOptions) {
  if (modelSettings && modelSettings.validateObjectIds === false) return false;
  if (dataSourceOptions && dataSourceOptions.settings &&
    dataSourceOptions.settings.validateObjectIds === false) {
    return false;
  }

  if (resolveConnectorName(dataSourceOptions) !== 'mongodb') return false;

  return !modelClass.__objectIdValidationsRegistered;
}

/**
 * @param {Function} modelClass LoopBack model constructor
 * @param {Object} modelSettings model.settings
 * @param {Object} dataSourceOptions { connector, settings }
 */
function registerMongoObjectIdValidations(modelClass, modelSettings, dataSourceOptions) {
  if (!shouldRegister(modelClass, modelSettings, dataSourceOptions)) return;

  modelClass.definition.build();
  const paths = collectObjectIdPaths(modelClass.definition.properties, [], '');
  if (!paths.length) return;

  modelClass.__objectIdValidationsRegistered = true;
  modelClass.__objectIdPaths = paths;

  const byRoot = groupPathsByRoot(paths);

  for (const [rootAttr, attrPaths] of byRoot) {
    modelClass.validate(rootAttr, function(err) {
      const data = this.__data || this;
      let failed = false;

      for (const {segments, fullPath} of attrPaths) {
        const value = getByPath(data, segments);
        if (!isValidObjectIdValue(value)) {
          this.errors.add(fullPath, 'is not a valid ObjectId', 'objectid');
          failed = true;
        }
      }

      if (failed) err(false);
    }, {
      message: 'is not a valid ObjectId',
      code: 'objectid',
    });
  }
}

module.exports = {
  OBJECT_ID_HEX,
  hasObjectIdStorage,
  collectObjectIdPaths,
  isValidObjectIdValue,
  resolveConnectorName,
  registerMongoObjectIdValidations,
};
