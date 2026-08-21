// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';
const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const loopbackData = require('../');

describe('loopback-datasource-juggler', function() {
  it('should expose version', function() {
    assert.equal(loopbackData.version, require('../package.json').version);
  });
});
