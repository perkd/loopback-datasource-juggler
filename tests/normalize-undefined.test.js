// Copyright IBM Corp. 2017,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
const {before, describe, it} = require('node:test');
const assert = require('node:assert/strict');

const jdb = require('../');
const DataSource = jdb.DataSource;

describe('normalizeUndefinedInQuery', function() {
  describe('with setting "throw"', function() {
    const ds = new DataSource({
      connector: 'memory',
      normalizeUndefinedInQuery: 'throw',
    });

    const User = ds.define('User', {
      seq: {type: Number, index: true},
      name: {type: String, index: true, sort: true},
      email: {type: String, index: true},
      birthday: {type: Date, index: true},
      role: {type: String, index: true},
      order: {type: Number, index: true, sort: true},
      vip: {type: Boolean},
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        tags: [
          {
            tag: String,
          },
        ],
      },
      friends: [
        {
          name: String,
        },
      ],
    });

    before(async function() {
      await seed(User);
    });

    it('should throw if find where contains undefined', async function() {
      await assert.rejects(
        User.find({where: {name: undefined}}),
      );
    });

    it('should throw if destroyAll where contains undefined', async function() {
      await assert.rejects(
        User.destroyAll({name: undefined}),
      );
    });

    it('should throw if updateAll where contains undefined', async function() {
      await assert.rejects(
        User.updateAll({name: undefined}, {vip: false}),
      );
    });

    it('should throw if upsertWithWhere where contains undefined', async function() {
      await assert.rejects(
        User.upsertWithWhere({name: undefined}, {vip: false}),
      );
    });

    it('should throw if count where contains undefined', async function() {
      await assert.rejects(
        User.count({name: undefined}),
      );
    });
  });

  describe('with setting "nullify"', function() {
    const ds = new DataSource({
      connector: 'memory',
    });

    const User = ds.define('User', {
      seq: {type: Number, index: true},
      name: {type: String, index: true, sort: true},
      email: {type: String, index: true},
      birthday: {type: Date, index: true},
      role: {type: String, index: true},
      order: {type: Number, index: true, sort: true},
      vip: {type: Boolean},
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        tags: [
          {
            tag: String,
          },
        ],
      },
      friends: [
        {
          name: String,
        },
      ],
    }, {
      normalizeUndefinedInQuery: 'nullify',
    });

    before(async function() {
      await seed(User);
    });

    it('should nullify if find where contains undefined', async function() {
      const users = await User.find({where: {role: undefined}});
      assert.strictEqual(users.length, 4);
    });

    it('should nullify if updateAll where contains undefined', async function() {
      const count = await User.updateAll({role: undefined}, {vip: false});
      assert.strictEqual(count.count, 4);
    });

    it('should nullify if upsertWithWhere where contains undefined', async function() {
      const user = await User.upsertWithWhere(
        {role: undefined, order: 6},
        {vip: false},
      );
      assert.strictEqual(user.order, 6);
    });

    it('should nullify if count where contains undefined', async function() {
      const count = await User.count({role: undefined});
      assert.strictEqual(count, 4);
    });

    it('should nullify if destroyAll where contains undefined', async function() {
      const count = await User.destroyAll({role: undefined});
      assert.strictEqual(count.count, 4);
    });
  });

  describe('with setting "ignore"', function() {
    const ds = new DataSource({
      connector: 'memory',
    });

    const User = ds.define('User', {
      seq: {type: Number, index: true},
      name: {type: String, index: true, sort: true},
      email: {type: String, index: true},
      birthday: {type: Date, index: true},
      role: {type: String, index: true},
      order: {type: Number, index: true, sort: true},
      vip: {type: Boolean},
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        tags: [
          {
            tag: String,
          },
        ],
      },
      friends: [
        {
          name: String,
        },
      ],
    }, {
      normalizeUndefinedInQuery: 'ignore',
    });

    before(async function() {
      await seed(User);
    });

    it('should ignore if find where contains undefined', async function() {
      const users = await User.find({where: {role: undefined}});
      assert.strictEqual(users.length, 6);
    });

    it('should ignore if updateAll where contains undefined', async function() {
      const count = await User.updateAll({role: undefined}, {vip: false});
      assert.strictEqual(count.count, 6);
    });

    it('should ignore if upsertWithWhere where contains undefined', async function() {
      const user = await User.upsertWithWhere(
        {role: undefined, order: 6},
        {vip: false},
      );
      assert.strictEqual(user.order, 6);
    });

    it('should ignore if count where contains undefined', async function() {
      const count = await User.count({role: undefined});
      assert.strictEqual(count, 6);
    });

    it('should ignore if destroyAll where contains undefined', async function() {
      const count = await User.destroyAll({role: undefined});
      assert.strictEqual(count.count, 6);
    });
  });
});

async function seed(User) {
  const beatles = [
    {
      seq: 0,
      name: 'John Lennon',
      email: 'john@b3atl3s.co.uk',
      role: 'lead',
      birthday: new Date('1980-12-08'),
      vip: true,
      address: {
        street: '123 A St',
        city: 'San Jose',
        state: 'CA',
        zipCode: '95131',
        tags: [{tag: 'business'}, {tag: 'rent'}],
      },
      friends: [{name: 'Paul McCartney'}, {name: 'George Harrison'}, {name: 'Ringo Starr'}],
      children: ['Sean', 'Julian'],
    },
    {
      seq: 1,
      name: 'Paul McCartney',
      email: 'paul@b3atl3s.co.uk',
      role: 'lead',
      birthday: new Date('1942-06-18'),
      order: 1,
      vip: true,
      address: {
        street: '456 B St',
        city: 'San Mateo',
        state: 'CA',
        zipCode: '94065',
      },
      friends: [{name: 'John Lennon'}, {name: 'George Harrison'}, {name: 'Ringo Starr'}],
      children: ['Stella', 'Mary', 'Heather', 'Beatrice', 'James'],
    },
    {seq: 2, name: 'George Harrison', role: null, order: 5, vip: false, children: ['Dhani']},
    {seq: 3, name: 'Ringo Starr', role: null, order: 6, vip: false},
    {seq: 4, name: 'Pete Best', role: null, order: 4, children: []},
    {seq: 5, name: 'Stuart Sutcliffe', role: null, order: 3, vip: true},
  ];

  await User.destroyAll();
  await Promise.all(beatles.map((beatle) => User.create(beatle)));
}
