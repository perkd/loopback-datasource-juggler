// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

/*
 if (!process.env.TRAVIS) {
 if (typeof __cov === 'undefined') {
 process.on('exit', function () {
 require('semicov').report();
 });
 }

 require('semicov').init('lib');
 }
 */

const {after} = require('node:test');
const ModelBuilder = require('../').ModelBuilder;
const Schema = require('../').Schema;
const registryManager = require('../lib/model-registry').registryManager;

// Stop the registry cleanup interval during tests so node:test can exit cleanly.
registryManager.stopPeriodicCleanup();

after(function() {
  registryManager.stopPeriodicCleanup();
});

if (!('getSchema' in global)) {
  global.getSchema = function(connector, settings) {
    return new Schema(connector || 'memory', settings);
  };
}

if (!('getModelBuilder' in global)) {
  global.getModelBuilder = function() {
    return new ModelBuilder();
  };
}

if (!('connectorCapabilities' in global)) {
  global.connectorCapabilities = {
  	nestedProperty: true,
  };
}
