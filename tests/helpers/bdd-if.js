// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const fmt = require('util').format;
const {describe, it} = require('node:test');

exports.describeIf = function describeIf(cond, name, fn) {
  if (cond)
    describe(name, fn);
  else {
    describe(fmt('[UNSUPPORTED] - %s', name), {skip: true}, fn);
  }
};

exports.itIf = function itIf(cond, name, fn) {
  if (cond)
    it(name, fn);
  else {
    it(fmt('[UNSUPPORTED] - %s', name), {skip: true}, fn);
  }
};
