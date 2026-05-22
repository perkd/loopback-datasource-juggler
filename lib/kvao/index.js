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
  if (!dataSource) {
    const err = new Error(g.f(
      'Cannot invoke {{%s}} on model {{%s}}: the model is no longer attached to an active datasource',
      'getConnector', this.modelName,
    ));
    err.code = 'CONNECTOR_DETACHED';
    throw err;
  }
  return dataSource.connector;
};

