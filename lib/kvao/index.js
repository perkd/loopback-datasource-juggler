// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const g = require('strong-globalize')();

function KeyValueAccessObject() {
}

module.exports = KeyValueAccessObject;

KeyValueAccessObject.delete = require('./delete');
KeyValueAccessObject.deleteAll = require('./delete-all');
KeyValueAccessObject.get = require('./get');
KeyValueAccessObject.set = require('./set');
KeyValueAccessObject.expire = require('./expire');
KeyValueAccessObject.ttl = require('./ttl');
KeyValueAccessObject.iterateKeys = require('./iterate-keys');
KeyValueAccessObject.keys = require('./keys');

KeyValueAccessObject.getConnector = function() {
  const dataSource = this.getDataSource();
  const connector = dataSource && dataSource.connector;
  if (!dataSource || !connector || (connector.dataSource == null &&
    Object.prototype.hasOwnProperty.call(connector, 'dataSource'))) {
    const err = new Error(g.f(
      'Cannot invoke {{%s}} on model {{%s}}: the model is no longer attached to an active datasource',
      'getConnector', this.modelName,
    ));
    err.code = 'CONNECTOR_DETACHED';
    throw err;
  }
  return connector;
};

// Returns the connector, or schedules cb(err) and returns null when detached.
// KVAO methods use this after setting up their callback to avoid a sync throw.
KeyValueAccessObject._getConnector = function(cb) {
  try {
    return this.getConnector();
  } catch (err) {
    process.nextTick(cb, err);
    return null;
  }
};

