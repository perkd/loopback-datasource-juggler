// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');
const bdd = require('../helpers/bdd-if');
const helpers = require('./_helpers');

module.exports = function(dataSourceFactory, connectorCapabilities) {
  // While we support millisecond precision, for the purpose of tests
  // it's better to use intervals at least 10ms long.
  const ttlPrecision = connectorCapabilities.ttlPrecision || 10;

  const canExpire = connectorCapabilities.canExpire !== false;

  bdd.describeIf(canExpire, 'expire', function() {
    let CacheItem;
    beforeEach(setupCacheItem);

    it('sets key ttl - Callback API', function() {
      return new Promise((resolve, reject) => {
        CacheItem.set('a-key', 'a-value', function(err) {
          if (err) return reject(err);
          CacheItem.expire('a-key', ttlPrecision, function(err) {
            if (err) return reject(err);
            setTimeout(function() {
              CacheItem.get('a-key', function(err, value) {
                if (err) return reject(err);
                assert.equal(value, null);
                resolve();
              });
            }, 2 * ttlPrecision);
          });
        });
      });
    });

    it('sets key ttl - Promise API', function() {
      return CacheItem.set('a-key', 'a-value')
        .then(function() { return CacheItem.expire('a-key', ttlPrecision); })
        .then(() => helpers.delay(2 * ttlPrecision))
        .then(function() { return CacheItem.get('a-key'); })
        .then(function(value) { assert.equal(value, null); });
    });

    it('returns error when expiring a key that has expired', function() {
      return Promise.resolve(CacheItem.set('expired-key', 'a-value', ttlPrecision))
        .then(() => helpers.delay(2 * ttlPrecision))
        .then(function() { return CacheItem.expire('expired-key', 1000); })
        .then(
          function() { throw new Error('expire() should have failed'); },
          function(err) {
            assert.match(err.message, /expired-key/);
            assert.equal(err.statusCode, 404);
          },
        );
    });

    it('returns error when key does not exist', function() {
      return CacheItem.expire('key-does-not-exist', ttlPrecision).then(
        function() { throw new Error('expire() should have failed'); },
        function(err) {
          assert.match(err.message, /key-does-not-exist/);
          assert.equal(err.statusCode, 404);
        },
      );
    });

    function setupCacheItem() {
      return helpers.givenCacheItem(dataSourceFactory)
        .then(ModelCtor => CacheItem = ModelCtor);
    }
  });
};
