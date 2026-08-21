// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

const {after, afterEach, before, beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false */
require('./init.js');

let db, Category, Product, Tool, Widget, Thing, Person;

// This test requires a connector that can
// handle a custom collection or table name

// TODO [fabien] add table for pgsql/mysql
// TODO [fabien] change model definition - see #293

const setupProducts = async function(ids) {
  await new Promise((resolve, reject) => {
    let settled = false;

    const done = err => {
      if (settled)
        return;

      settled = true;

      if (err)
        reject(err);
      else
        resolve();
    };
    (async function() {
      ids.toolZ = (await invoke(Tool.create.bind(Tool), {name: 'Tool Z'})).id;
      ids.widgetZ = (await invoke(Widget.create.bind(Widget), {name: 'Widget Z'})).id;
      ids.toolA = (await invoke(Tool.create.bind(Tool), {name: 'Tool A', active: false})).id;
      ids.widgetA = (await invoke(Widget.create.bind(Widget), {name: 'Widget A'})).id;
      ids.widgetB = (await invoke(Widget.create.bind(Widget), {name: 'Widget B', active: false})).id;
    })().then(() => done(), done);
  });
}
;

async function automigrateAndSetupProducts(ids) {
  await invoke(db.automigrate.bind(db));
  await setupProducts(ids);
}

describe('default scope', function() {
  before(async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      db = getSchema();

      Category = db.define('Category', {
        name: String,
      });

      Product = db.define('Product', {
        name: String,
        kind: String,
        description: String,
        active: {type: Boolean, default: true},
      }, {
        scope: {order: 'name'},
        scopes: {active: {where: {active: true}}},
      });

      Product.lookupModel = function(data) {
        const m = this.dataSource.models[data.kind];
        if (m.base === this) return m;
        return this;
      };

      Tool = db.define('Tool', Product.definition.properties, {
        base: 'Product',
        scope: {where: {kind: 'Tool'}, order: 'name'},
        scopes: {active: {where: {active: true}}},
        arangodb: {collection: 'Product'},
        mongodb: {collection: 'Product'},
        memory: {collection: 'Product'},
      });

      Widget = db.define('Widget', Product.definition.properties, {
        base: 'Product',
        properties: {kind: 'Widget'},
        scope: {where: {kind: 'Widget'}, order: 'name'},
        scopes: {active: {where: {active: true}}},
        arangodb: {collection: 'Product'},
        mongodb: {collection: 'Product'},
        memory: {collection: 'Product'},
      });

      Person = db.define('Person', {name: String}, {
        scope: {include: 'things'},
        forceId: false,
      });

      // inst is only valid for instance methods
      // like save, updateAttributes

      const scopeFn = function(target, inst) {
        return {where: {kind: this.modelName}};
      };

      const propertiesFn = function(target, inst) {
        return {kind: this.modelName};
      };

      Thing = db.define('Thing', Product.definition.properties, {
        base: 'Product',
        attributes: propertiesFn,
        scope: scopeFn,
        arangodb: {collection: 'Product'},
        mongodb: {collection: 'Product'},
        memory: {collection: 'Product'},
      });

      Category.hasMany(Product);
      Category.hasMany(Tool, {scope: {order: 'name DESC'}});
      Category.hasMany(Widget);
      Category.hasMany(Thing);

      Product.belongsTo(Category);
      Tool.belongsTo(Category);
      Widget.belongsTo(Category);
      Thing.belongsTo(Category);

      Person.hasMany(Thing);
      Thing.belongsTo(Person);

      db.automigrate(done);
    });
  });

  describe('manipulation', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db.automigrate(done);
      });
    });

    it('should return a scoped instance', function() {
      const p = new Tool({name: 'Product A', kind: 'ignored'});
      assert.strictEqual(p.name, 'Product A');
      assert.strictEqual(p.kind, 'Tool');
      p.setAttributes({kind: 'ignored'});
      assert.strictEqual(p.kind, 'Tool');

      p.setAttribute('kind', 'other'); // currently not enforced
      assert.strictEqual(p.kind, 'other');
    });

    it('should create a scoped instance - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.create({name: 'Product A', kind: 'ignored'}, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.name, 'Product A');
          assert.strictEqual(p.kind, 'Tool');
          ids.productA = p.id;
          done();
        });
      });
    });

    it('should create a scoped instance - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.create({name: 'Product B', kind: 'ignored'}, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.name, 'Product B');
          assert.strictEqual(p.kind, 'Widget');
          ids.productB = p.id;
          done();
        });
      });
    });

    it('should update a scoped instance - updateAttributes', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.findById(ids.productA, function(err, p) {
          p.updateAttributes({description: 'A thing...', kind: 'ingored'}, function(err, inst) {
            assert.ok(err == null);
            assert.strictEqual(p.name, 'Product A');
            assert.strictEqual(p.kind, 'Tool');
            assert.strictEqual(p.description, 'A thing...');
            done();
          });
        });
      });
    });

    it('should update a scoped instance - save', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.findById(ids.productA, function(err, p) {
          p.description = 'Something...';
          p.kind = 'ignored';
          p.save(function(err, inst) {
            assert.ok(err == null);
            assert.strictEqual(p.name, 'Product A');
            assert.strictEqual(p.kind, 'Tool');
            assert.strictEqual(p.description, 'Something...');
            Tool.findById(ids.productA, function(err, p) {
              assert.strictEqual(p.kind, 'Tool');
              done();
            });
          });
        });
      });
    });

    it('should update a scoped instance - updateOrCreate', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        const data = {id: ids.productA, description: 'Anything...', kind: 'ingored'};
        Tool.updateOrCreate(data, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.name, 'Product A');
          assert.strictEqual(p.kind, 'Tool');
          assert.strictEqual(p.description, 'Anything...');
          done();
        });
      });
    });
  });

  describe('findById', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.findById(ids.toolA, function(err, inst) {
          assert.ok(err == null);
          assert.strictEqual(inst.name, 'Tool A');
          assert.ok(inst instanceof Tool);
          done();
        });
      });
    });

    it('should apply default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.findById(ids.toolA, function(err, inst) {
          assert.ok(err == null);
          assert.strictEqual(inst.name, 'Tool A');
          done();
        });
      });
    });

    it('should apply default scope (no match)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.findById(ids.toolA, function(err, inst) {
          assert.ok(err == null);
          assert.ok(inst == null);
          done();
        });
      });
    });
  });

  describe('find', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope - order', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.find(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 5);
          assert.strictEqual(products[0].name, 'Tool A');
          assert.strictEqual(products[1].name, 'Tool Z');
          assert.strictEqual(products[2].name, 'Widget A');
          assert.strictEqual(products[3].name, 'Widget B');
          assert.strictEqual(products[4].name, 'Widget Z');

          assert.ok(products[0] instanceof Product);
          assert.ok(products[0] instanceof Tool);

          assert.ok(products[2] instanceof Product);
          assert.ok(products[2] instanceof Widget);

          done();
        });
      });
    });

    it('should apply default scope - order override', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.find({order: 'name DESC'}, function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 5);
          assert.strictEqual(products[0].name, 'Widget Z');
          assert.strictEqual(products[1].name, 'Widget B');
          assert.strictEqual(products[2].name, 'Widget A');
          assert.strictEqual(products[3].name, 'Tool Z');
          assert.strictEqual(products[4].name, 'Tool A');
          done();
        });
      });
    });

    it('should apply default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.find(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 2);
          assert.strictEqual(products[0].name, 'Tool A');
          assert.strictEqual(products[1].name, 'Tool Z');
          done();
        });
      });
    });

    it('should apply default scope - where (widget)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.find({where: {active: true}}, function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 2);
          assert.strictEqual(products[0].name, 'Widget A');
          assert.strictEqual(products[1].name, 'Widget Z');
          done();
        });
      });
    });

    it('should apply default scope - order (widget)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.find({order: 'name DESC'}, function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 3);
          assert.strictEqual(products[0].name, 'Widget Z');
          assert.strictEqual(products[1].name, 'Widget B');
          assert.strictEqual(products[2].name, 'Widget A');
          done();
        });
      });
    });
  });

  describe('exists', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.exists(ids.widgetA, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, true);
          done();
        });
      });
    });

    it('should apply default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.exists(ids.toolZ, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, true);
          done();
        });
      });
    });

    it('should apply default scope - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.exists(ids.widgetA, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, true);
          done();
        });
      });
    });

    it('should apply default scope - tool (no match)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.exists(ids.widgetA, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, false);
          done();
        });
      });
    });

    it('should apply default scope - widget (no match)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.exists(ids.toolZ, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, false);
          done();
        });
      });
    });
  });

  describe('count', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope - order', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.count(function(err, count) {
          assert.ok(err == null);
          assert.strictEqual(count, 5);
          done();
        });
      });
    });

    it('should apply default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.count(function(err, count) {
          assert.ok(err == null);
          assert.strictEqual(count, 2);
          done();
        });
      });
    });

    it('should apply default scope - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.count(function(err, count) {
          assert.ok(err == null);
          assert.strictEqual(count, 3);
          done();
        });
      });
    });

    it('should apply default scope - where', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.count({name: 'Widget Z'}, function(err, count) {
          assert.ok(err == null);
          assert.strictEqual(count, 1);
          done();
        });
      });
    });

    it('should apply default scope - no match', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.count({name: 'Widget Z'}, function(err, count) {
          assert.ok(err == null);
          assert.strictEqual(count, 0);
          done();
        });
      });
    });
  });

  describe('removeById', function() {
    const ids = {};

    async function isDeleted(id) {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.exists(id, function(err, exists) {
          assert.ok(err == null);
          assert.strictEqual(exists, false);
          done();
        });
      });
    }

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.removeById(ids.widgetZ, function(err) {
          assert.ok(err == null);
          isDeleted(ids.widgetZ).then(() => done(), done);
        });
      });
    });

    it('should apply default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.removeById(ids.toolA, function(err) {
          assert.ok(err == null);
          isDeleted(ids.toolA).then(() => done(), done);
        });
      });
    });

    it('should apply default scope - no match', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.removeById(ids.widgetA, function(err) {
          assert.ok(err == null);
          Product.exists(ids.widgetA, function(err, exists) {
            assert.ok(err == null);
            assert.strictEqual(exists, true);
            done();
          });
        });
      });
    });

    it('should apply default scope - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.removeById(ids.widgetA, function(err) {
          assert.ok(err == null);
          isDeleted(ids.widgetA).then(() => done(), done);
        });
      });
    });

    it('should apply default scope - verify', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.find(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 2);
          assert.strictEqual(products[0].name, 'Tool Z');
          assert.strictEqual(products[1].name, 'Widget B');
          done();
        });
      });
    });
  });

  describe('update', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.update({active: false}, {active: true, kind: 'ignored'}, function(err) {
          assert.ok(err == null);
          Widget.find({where: {active: true}}, function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 3);
            assert.strictEqual(products[0].name, 'Widget A');
            assert.strictEqual(products[1].name, 'Widget B');
            assert.strictEqual(products[2].name, 'Widget Z');
            done();
          });
        });
      });
    });

    it('should apply default scope - no match', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.update({name: 'Widget A'}, {name: 'Ignored'}, function(err) {
          assert.ok(err == null);
          Product.findById(ids.widgetA, function(err, product) {
            assert.ok(err == null);
            assert.strictEqual(product.name, 'Widget A');
            done();
          });
        });
      });
    });

    it('should have updated within scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.find({where: {active: true}}, function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 4);
          assert.strictEqual(products[0].name, 'Tool Z');
          assert.strictEqual(products[1].name, 'Widget A');
          assert.strictEqual(products[2].name, 'Widget B');
          assert.strictEqual(products[3].name, 'Widget Z');
          done();
        });
      });
    });
  });

  describe('remove', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should apply default scope - custom where', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.remove({name: 'Widget A'}, function(err) {
          assert.ok(err == null);
          Product.find(function(err, products) {
            assert.strictEqual(products.length, 4);
            assert.strictEqual(products[0].name, 'Tool A');
            assert.strictEqual(products[1].name, 'Tool Z');
            assert.strictEqual(products[2].name, 'Widget B');
            assert.strictEqual(products[3].name, 'Widget Z');
            done();
          });
        });
      });
    });

    it('should apply default scope - custom where (no match)', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.remove({name: 'Widget Z'}, function(err) {
          assert.ok(err == null);
          Product.find(function(err, products) {
            assert.strictEqual(products.length, 4);
            assert.strictEqual(products[0].name, 'Tool A');
            assert.strictEqual(products[1].name, 'Tool Z');
            assert.strictEqual(products[2].name, 'Widget B');
            assert.strictEqual(products[3].name, 'Widget Z');
            done();
          });
        });
      });
    });

    it('should apply default scope - deleteAll', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.deleteAll(function(err) {
          assert.ok(err == null);
          Product.find(function(err, products) {
            assert.strictEqual(products.length, 2);
            assert.strictEqual(products[0].name, 'Widget B');
            assert.strictEqual(products[1].name, 'Widget Z');
            done();
          });
        });
      });
    });

    it('should create a scoped instance - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.create({name: 'Tool B'}, function(err, p) {
          assert.ok(err == null);
          Product.find(function(err, products) {
            assert.strictEqual(products.length, 3);
            assert.strictEqual(products[0].name, 'Tool B');
            assert.strictEqual(products[1].name, 'Widget B');
            assert.strictEqual(products[2].name, 'Widget Z');
            done();
          });
        });
      });
    });

    it('should apply default scope - destroyAll', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.destroyAll(function(err) {
          assert.ok(err == null);
          Product.find(function(err, products) {
            assert.strictEqual(products.length, 1);
            assert.strictEqual(products[0].name, 'Tool B');
            done();
          });
        });
      });
    });
  });

  describe('scopes', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        automigrateAndSetupProducts(ids).then(() => done(), done);
      });
    });

    it('should merge with default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.active(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 3);
          assert.strictEqual(products[0].name, 'Tool Z');
          assert.strictEqual(products[1].name, 'Widget A');
          assert.strictEqual(products[2].name, 'Widget Z');
          done();
        });
      });
    });

    it('should merge with default scope - tool', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Tool.active(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 1);
          assert.strictEqual(products[0].name, 'Tool Z');
          done();
        });
      });
    });

    it('should merge with default scope - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.active(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 2);
          assert.strictEqual(products[0].name, 'Widget A');
          assert.strictEqual(products[1].name, 'Widget Z');
          done();
        });
      });
    });
  });

  describe('scope function', function() {
    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db.automigrate(done);
      });
    });

    it('should create a scoped instance - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.create({name: 'Product', kind: 'ignored'}, function(err, p) {
          assert.strictEqual(p.name, 'Product');
          assert.strictEqual(p.kind, 'Widget');
          done();
        });
      });
    });

    it('should create a scoped instance - thing', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Thing.create({name: 'Product', kind: 'ignored'}, function(err, p) {
          assert.strictEqual(p.name, 'Product');
          assert.strictEqual(p.kind, 'Thing');
          done();
        });
      });
    });

    it('should find a scoped instance - widget', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Widget.findOne({where: {name: 'Product'}}, function(err, p) {
          assert.strictEqual(p.name, 'Product');
          assert.strictEqual(p.kind, 'Widget');
          done();
        });
      });
    });

    it('should find a scoped instance - thing', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Thing.findOne({where: {name: 'Product'}}, function(err, p) {
          assert.strictEqual(p.name, 'Product');
          assert.strictEqual(p.kind, 'Thing');
          done();
        });
      });
    });

    it('should find a scoped instance - thing', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Product.find({where: {name: 'Product'}}, function(err, products) {
          assert.strictEqual(products.length, 2);
          assert.strictEqual(products[0].name, 'Product');
          assert.strictEqual(products[1].name, 'Product');
          const kinds = products.map(function(p) { return p.kind; });
          kinds.sort();
          assert.deepStrictEqual(kinds, ['Thing', 'Widget']);
          done();
        });
      });
    });
  });

  describe('relations', function() {
    const ids = {};

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db.automigrate(done);
      });
    });

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.create({name: 'Category A'}, function(err, cat) {
          if (err) return done(err);
          ids.categoryA = cat.id;
          (async function() {
            await invoke(cat.widgets.create.bind(cat.widgets), {name: 'Widget B', kind: 'ignored'});
            await invoke(cat.widgets.create.bind(cat.widgets), {name: 'Widget A'});
            await invoke(cat.tools.create.bind(cat.tools), {name: 'Tool A'});
            await invoke(cat.things.create.bind(cat.things), {name: 'Thing A'});
          })().then(() => done(), done);
        });
      });
    });

    it('should apply default scope - products', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          assert.ok(err == null);
          cat.products(function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 4);
            assert.strictEqual(products[0].name, 'Thing A');
            assert.strictEqual(products[1].name, 'Tool A');
            assert.strictEqual(products[2].name, 'Widget A');
            assert.strictEqual(products[3].name, 'Widget B');

            assert.ok(products[0] instanceof Product);
            assert.ok(products[0] instanceof Thing);

            assert.ok(products[1] instanceof Product);
            assert.ok(products[1] instanceof Tool);

            assert.ok(products[2] instanceof Product);
            assert.ok(products[2] instanceof Widget);

            done();
          });
        });
      });
    });

    it('should apply default scope - widgets', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          assert.ok(err == null);
          cat.widgets(function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 2);
            assert.ok(products[0] instanceof Widget);
            assert.strictEqual(products[0].name, 'Widget A');
            assert.strictEqual(products[1].name, 'Widget B');
            products[0].category(function(err, inst) {
              assert.strictEqual(inst.name, 'Category A');
              done();
            });
          });
        });
      });
    });

    it('should apply default scope - tools', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          assert.ok(err == null);
          cat.tools(function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 1);
            assert.ok(products[0] instanceof Tool);
            assert.strictEqual(products[0].name, 'Tool A');
            products[0].category(function(err, inst) {
              assert.strictEqual(inst.name, 'Category A');
              done();
            });
          });
        });
      });
    });

    it('should apply default scope - things', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          assert.ok(err == null);
          cat.things(function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 1);
            assert.ok(products[0] instanceof Thing);
            assert.strictEqual(products[0].name, 'Thing A');
            products[0].category(function(err, inst) {
              assert.strictEqual(inst.name, 'Category A');
              done();
            });
          });
        });
      });
    });

    it('should create related item with default scope', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          cat.tools.create({name: 'Tool B'}, done);
        });
      });
    });

    it('should use relation scope order', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Category.findById(ids.categoryA, function(err, cat) {
          assert.ok(err == null);
          cat.tools(function(err, products) {
            assert.ok(err == null);
            assert.strictEqual(products.length, 2);
            assert.strictEqual(products[0].name, 'Tool B');
            assert.strictEqual(products[1].name, 'Tool A');
            done();
          });
        });
      });
    });
  });

  describe('with include option', function() {
    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        db.automigrate(done);
      });
    });

    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Person.create({id: 1, name: 'Person A'}, function(err, person) {
          person.things.create({name: 'Thing A'}, done);
        });
      });
    });

    it('should find a scoped instance with included relation - things', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Person.findById(1, function(err, person) {
          assert.ok(err == null);
          assert.ok(person != null);
          const things = person.things();
          assert.ok(things != null);
          assert.ok(things instanceof Array);
          assert.strictEqual(things.length, 1);
          done();
        });
      });
    });
  });
});

function invoke(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, ...results) => {
      if (err) return reject(err);
      resolve(results.length <= 1 ? results[0] : results);
    });
  });
}
