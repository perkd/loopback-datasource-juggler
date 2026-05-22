// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

/* global getSchema:false */
const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
require('./init.js');
const Schema = require('../').Schema;
const ModelBuilder = require('../').ModelBuilder;

describe('JSON property', function() {
  let dataSource, Model;

  it('should be defined', function() {
    dataSource = getSchema();
    Model = dataSource.define('Model', {propertyName: ModelBuilder.JSON});
    const m = new Model;
    assert.equal(Boolean('propertyName' in m), true);
    assert.equal(m.propertyName, undefined);
  });

  it('should accept JSON in constructor and return object', function() {
    const m = new Model({
      propertyName: '{"foo": "bar"}',
    });
    assert.equal(typeof m.propertyName, 'object');
    assert.equal(m.propertyName.foo, 'bar');
  });

  it('should accept object in setter and return object', function() {
    const m = new Model;
    m.propertyName = {'foo': 'bar'};
    assert.equal(typeof m.propertyName, 'object');
    assert.equal(m.propertyName.foo, 'bar');
  });

  it('should accept string in setter and return string', function() {
    const m = new Model;
    m.propertyName = '{"foo": "bar"}';
    assert.equal(typeof m.propertyName, 'string');
    assert.equal(m.propertyName, '{"foo": "bar"}');
  });
});
