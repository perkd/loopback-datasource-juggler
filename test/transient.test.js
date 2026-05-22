// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
const {before, describe, it} = require('node:test');
const assert = require('node:assert/strict');

const jdb = require('../');
const DataSource = jdb.DataSource;

let db, TransientModel, Person, Widget, Item;

const getTransientDataSource = function(settings) {
  return new DataSource('transient', settings);
};

describe('Transient connector', function() {
  before(function() {
    db = getTransientDataSource();
    TransientModel = db.define('TransientModel', {}, {idInjection: false});

    Person = TransientModel.extend('Person', {name: String});
    Person.attachTo(db);

    Widget = db.define('Widget', {name: String});
    Item = db.define('Item', {
      id: {type: Number, id: true}, name: String,
    });
  });

  it('should respect idInjection being false', async function() {
    assert.strictEqual(Person.definition.properties.id, undefined);
    assert.ok(Person.definition.properties.name != null);

    const inst = await Person.create({name: 'Wilma'});
    assert.deepStrictEqual(inst.toObject(), {name: 'Wilma'});

    const count = await Person.count();
    assert.strictEqual(count, 0);
  });

  it('should generate a random string id', async function() {
    assert.ok(Widget.definition.properties.id != null);
    assert.ok(Widget.definition.properties.name != null);
    assert.strictEqual(Widget.definition.properties.id.type, String);

    const inst = await Widget.create({name: 'Thing'});
    assert.match(inst.id, /^[0-9a-fA-F]{24}$/);
    assert.strictEqual(inst.name, 'Thing');

    const widget = await Widget.findById(inst.id);
    assert.strictEqual(widget, null);
  });

  it('should generate a random number id', async function() {
    assert.ok(Item.definition.properties.id != null);
    assert.ok(Item.definition.properties.name != null);
    assert.strictEqual(Item.definition.properties.id.type, Number);

    const inst = await Item.create({name: 'Example'});
    assert.strictEqual(inst.name, 'Example');

    const count = await Item.count();
    assert.strictEqual(count, 0);
  });
});
