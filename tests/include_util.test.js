// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('node:assert/strict');
const {describe, it} = require('node:test');

const includeUtils = require('../lib/include_utils');

describe('include_util', function() {
  describe('#buildOneToOneIdentityMapWithOrigKeys', function() {
    it('should return an object with keys', function() {
      const objs = [
        {id: 11, letter: 'A'},
        {id: 22, letter: 'B'},
      ];
      const result = includeUtils.buildOneToOneIdentityMapWithOrigKeys(objs, 'id');
      assert.ok(result.get(11));
      assert.ok(result.get(22));
    });

    it('should report errors if id is missing', function() {
      const objs = [
        {letter: 'A'},
        {id: 22, letter: 'B'},
      ];
      function build() {
        includeUtils.buildOneToOneIdentityMapWithOrigKeys(objs, 'id');
      }
      assert.throws(build, /ID property "id" is missing/);
    });

    it('should overwrite keys in case of collision', function() {
      const objs = [
        {id: 11, letter: 'A'},
        {id: 22, letter: 'B'},
        {id: 33, letter: 'C'},
        {id: 11, letter: 'HA!'},
      ];

      const result = includeUtils.buildOneToOneIdentityMapWithOrigKeys(objs, 'id');
      assert.ok(result.getKeys().includes(11));
      assert.ok(result.getKeys().includes(22));
      assert.ok(result.getKeys().includes(33));
      assert.strictEqual(result.get(11).letter, 'HA!');
      assert.strictEqual(result.get(33).letter, 'C');
    });

    it('should return an object with no additional keys', function() {
      const objs = [
        {id: 11, letter: 'A'},
        {id: 22, letter: 'B'},
      ];
      const result = includeUtils.buildOneToOneIdentityMapWithOrigKeys(objs, 'id');
      assert.deepStrictEqual(result.getKeys(), [11, 22]); // no additional properties
    });
  });

  describe('#buildOneToManyIdentityMap', function() {
    it('should return an object with keys', function() {
      const objs = [
        {id: 11, letter: 'A'},
        {id: 22, letter: 'B'},
      ];
      const result = includeUtils.buildOneToManyIdentityMapWithOrigKeys(objs, 'id');
      assert.strictEqual(result.exist(11), true);
      assert.strictEqual(result.exist(22), true);
    });

    it('should report errors if id is missing', function() {
      const objs = [
        {letter: 'A'},
        {id: 22, letter: 'B'},
      ];
      function build() {
        includeUtils.buildOneToManyIdentityMapWithOrigKeys(objs, 'id');
      }
      assert.throws(build, /ID property "id" is missing/);
    });

    it('should collect keys in case of collision', function() {
      const objs = [
        {'fk_id': 11, letter: 'A'},
        {'fk_id': 22, letter: 'B'},
        {'fk_id': 33, letter: 'C'},
        {'fk_id': 11, letter: 'HA!'},
      ];

      const result = includeUtils.buildOneToManyIdentityMapWithOrigKeys(objs, 'fk_id');
      assert.strictEqual(result.get(11)[0].letter, 'A');
      assert.strictEqual(result.get(11)[1].letter, 'HA!');
      assert.strictEqual(result.get(33)[0].letter, 'C');
    });
  });
});

describe('KVMap', function() {
  it('should allow to set and get value with key string', function() {
    const map = new includeUtils.KVMap();
    map.set('name', 'Alex');
    map.set('gender', true);
    map.set('age', 25);
    assert.strictEqual(map.get('name'), 'Alex');
    assert.strictEqual(map.get('gender'), true);
    assert.strictEqual(map.get('age'), 25);
  });
  it('should allow to set and get value with arbitrary key type', function() {
    const map = new includeUtils.KVMap();
    map.set('name', 'Alex');
    map.set(true, 'male');
    map.set(false, false);
    map.set({isTrue: 'yes'}, 25);
    assert.strictEqual(map.get('name'), 'Alex');
    assert.strictEqual(map.get(true), 'male');
    assert.strictEqual(map.get(false), false);
    assert.strictEqual(map.get({isTrue: 'yes'}), 25);
  });
  it('should not allow to get values with [] operator', function() {
    const map = new includeUtils.KVMap();
    map.set('name', 'Alex');
    assert.strictEqual(map.name, undefined);
  });
  it('should provide .exist() method for checking if key presented', function() {
    const map = new includeUtils.KVMap();
    map.set('one', 1);
    map.set(2, 'two');
    map.set(true, 'true');
    assert.strictEqual(map.exist('one'), true);
    assert.strictEqual(map.exist(2), true);
    assert.strictEqual(map.exist(true), true);
    assert.strictEqual(map.exist('two'), false);
  });
  it('should return array of original keys with .getKeys()', function() {
    const map = new includeUtils.KVMap();
    map.set('one', 1);
    map.set(2, 'two');
    map.set(true, 'true');
    const keys = map.getKeys();
    assert.ok(keys.includes('one'));
    assert.ok(keys.includes(2));
    assert.ok(keys.includes(true));
  });
  it('should allow to store and fetch arrays', function() {
    const map = new includeUtils.KVMap();
    map.set(1, [1, 2, 3]);
    map.set(2, [2, 3, 4]);
    const valueOne = map.get(1);
    assert.deepStrictEqual(valueOne, [1, 2, 3]);
    valueOne.push(99);
    map.set(1, valueOne);
    const valueOneUpdated = map.get(1);
    assert.deepStrictEqual(valueOneUpdated, [1, 2, 3, 99]);
  });
});
