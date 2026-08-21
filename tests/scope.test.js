// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';

const {before, beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');
/* global getSchema:false */
require('./init.js');

let db, Railway, Station;

describe('scope', function() {
  before(function() {
    db = getSchema();
    Railway = db.define('Railway', {
      URID: {type: String, index: true},
    }, {
      scopes: {
        highSpeed: {
          where: {
            highSpeed: true,
          },
        },
      },
    });
    Station = db.define('Station', {
      USID: {type: String, index: true},
      capacity: {type: Number, index: true},
      thoughput: {type: Number, index: true},
      isActive: {type: Boolean, index: true},
      isUndeground: {type: Boolean, index: true},
    });
  });

  beforeEach(function() {
    return new Promise((resolve, reject) => {
      Railway.destroyAll(function(err) {
        if (err) return reject(err);
        Station.destroyAll(function(err) {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });

  it('should define scope using options.scopes', function() {
    assert.ok(Object.prototype.hasOwnProperty.call(Railway.scopes, 'highSpeed'));
    assert.equal(typeof Railway.highSpeed, 'function');
  });

  it('should define scope with query', function() {
    Station.scope('active', {where: {isActive: true}});
    assert.ok(Object.prototype.hasOwnProperty.call(Station.scopes, 'active'));
    return new Promise((resolve, reject) => {
      Station.active.create(function(err, station) {
        if (err) return reject(err);
        assert.ok(station);
        assert.ok(station.isActive);
        assert.equal(station.isActive, true);
        resolve();
      });
    });
  });

  it('should allow scope chaining', function() {
    Station.scope('active', {where: {isActive: true}});
    Station.scope('subway', {where: {isUndeground: true}});
    return new Promise((resolve, reject) => {
      Station.active.subway.create(function(err, station) {
        if (err) return reject(err);
        assert.ok(station);
        assert.equal(station.isActive, true);
        assert.equal(station.isUndeground, true);
        resolve();
      });
    });
  });

  it('should query all', function() {
    Station.scope('active', {where: {isActive: true}});
    Station.scope('inactive', {where: {isActive: false}});
    Station.scope('ground', {where: {isUndeground: true}});
    return new Promise((resolve, reject) => {
      Station.active.ground.create(function(err) {
        if (err) return reject(err);
        Station.inactive.ground.create(function(err) {
          if (err) return reject(err);
          Station.ground.inactive(function(err, ss) {
            if (err) return reject(err);
            assert.equal(ss.length, 1);
            resolve();
          });
        });
      });
    });
  });

  it('should not cache any results', function() {
    Station.scope('active', {where: {isActive: true}});
    return new Promise((resolve, reject) => {
      Station.active.create(function(err, s) {
        if (err) return reject(err);
        assert.equal(s.isActive, true);
        Station.active(function(err, ss) {
          if (err) return reject(err);
          assert.equal(ss.length, 1);
          assert.deepEqual(ss[0].id, s.id);
          s.updateAttribute('isActive', false, function(err, s) {
            if (err) return reject(err);
            assert.equal(s.isActive, false);
            Station.active(function(err, ss) {
              if (err) return reject(err);
              assert.equal(ss.length, 0);
              resolve();
            });
          });
        });
      });
    });
  });
});

describe('scope - order', function() {
  before(function() {
    db = getSchema();
    Station = db.define('Station', {
      name: {type: String, index: true},
      order: {type: Number, index: true},
    });
    Station.scope('reverse', {order: 'order DESC'});
  });

  beforeEach(function() {
    return destroyAll(Station);
  });

  beforeEach(function() {
    return createModel(Station, {name: 'a', order: 1});
  });

  beforeEach(function() {
    return createModel(Station, {name: 'b', order: 2});
  });

  beforeEach(function() {
    return createModel(Station, {name: 'c', order: 3});
  });

  it('should define scope with default order', function() {
    return new Promise((resolve, reject) => {
      Station.reverse(function(err, stations) {
        if (err) return reject(err);
        assert.equal(stations[0].name, 'c');
        assert.equal(stations[0].order, 3);
        assert.equal(stations[1].name, 'b');
        assert.equal(stations[1].order, 2);
        assert.equal(stations[2].name, 'a');
        assert.equal(stations[2].order, 1);
        resolve();
      });
    });
  });

  it('should override default scope order', function() {
    return new Promise((resolve, reject) => {
      Station.reverse({order: 'order ASC'}, function(err, stations) {
        if (err) return reject(err);
        assert.equal(stations[0].name, 'a');
        assert.equal(stations[0].order, 1);
        assert.equal(stations[1].name, 'b');
        assert.equal(stations[1].order, 2);
        assert.equal(stations[2].name, 'c');
        assert.equal(stations[2].order, 3);
        resolve();
      });
    });
  });
});

describe('scope - filtered count, updateAll and destroyAll', function() {
  let stationA;

  before(function() {
    db = getSchema();
    Station = db.define('Station', {
      name: {type: String, index: true},
      order: {type: Number, index: true},
      active: {type: Boolean, index: true, default: true},
      flagged: {type: Boolean, index: true, default: false},
    });
    Station.scope('ordered', {order: 'order'});
    Station.scope('active', {where: {active: true}});
    Station.scope('inactive', {where: {active: false}});
    Station.scope('flagged', {where: {flagged: true}});
  });

  beforeEach(function() {
    return destroyAll(Station);
  });

  beforeEach(function() {
    return createModel(Station, {name: 'b', order: 2, active: false});
  });

  beforeEach(function() {
    return new Promise((resolve, reject) => {
      Station.create({name: 'a', order: 1}, function(err, inst) {
        if (err) return reject(err);
        stationA = inst;
        resolve();
      });
    });
  });

  beforeEach(function() {
    return createModel(Station, {name: 'd', order: 4, active: false});
  });

  beforeEach(function() {
    return createModel(Station, {name: 'c', order: 3});
  });

  it('should find all - verify', function() {
    return new Promise((resolve, reject) => {
      Station.ordered(function(err, stations) {
        if (err) return reject(err);
        assert.equal(stations.length, 4);
        assert.equal(stations[0].name, 'a');
        assert.equal(stations[1].name, 'b');
        assert.equal(stations[2].name, 'c');
        assert.equal(stations[3].name, 'd');
        resolve();
      });
    });
  });

  it('should find one', function() {
    return new Promise((resolve, reject) => {
      Station.active.findOne(function(err, station) {
        if (err) return reject(err);
        assert.equal(station.name, 'a');
        resolve();
      });
    });
  });

  it('should find one - with filter', function() {
    return new Promise((resolve, reject) => {
      Station.active.findOne({where: {name: 'c'}}, function(err, station) {
        if (err) return reject(err);
        assert.equal(station.name, 'c');
        resolve();
      });
    });
  });

  it('should find by id - match', function() {
    return new Promise((resolve, reject) => {
      Station.active.findById(stationA.id, function(err, station) {
        if (err) return reject(err);
        assert.equal(station.name, 'a');
        resolve();
      });
    });
  });

  it('should find by id - no match', function() {
    return new Promise((resolve, reject) => {
      Station.inactive.findById(stationA.id, function(err, station) {
        if (err) return reject(err);
        assert.equal(station, null);
        resolve();
      });
    });
  });

  it('should count all in scope - active', function() {
    return new Promise((resolve, reject) => {
      Station.active.count(function(err, count) {
        if (err) return reject(err);
        assert.equal(count, 2);
        resolve();
      });
    });
  });

  it('should count all in scope - inactive', function() {
    return new Promise((resolve, reject) => {
      Station.inactive.count(function(err, count) {
        if (err) return reject(err);
        assert.equal(count, 2);
        resolve();
      });
    });
  });

  it('should count filtered - active', function() {
    return new Promise((resolve, reject) => {
      Station.active.count({order: {gt: 1}}, function(err, count) {
        if (err) return reject(err);
        assert.equal(count, 1);
        resolve();
      });
    });
  });

  it('should count filtered - inactive', function() {
    return new Promise((resolve, reject) => {
      Station.inactive.count({order: 2}, function(err, count) {
        if (err) return reject(err);
        assert.equal(count, 1);
        resolve();
      });
    });
  });

  it('should allow updateAll', function() {
    return new Promise((resolve, reject) => {
      Station.inactive.updateAll({flagged: true}, function(err, result) {
        if (err) return reject(err);
        assert.equal(result.count, 2);
        Station.flagged.count(function(err, count) {
          if (err) return reject(err);
          assert.equal(count, 2);
          resolve();
        });
      });
    });
  });

  it('should allow filtered updateAll', function() {
    return new Promise((resolve, reject) => {
      Station.ordered.updateAll({active: true}, {flagged: true}, function(err, result) {
        if (err) return reject(err);
        assert.equal(result.count, 2);
        Station.flagged.count(function(err, count) {
          if (err) return reject(err);
          assert.equal(count, 2);
          resolve();
        });
      });
    });
  });

  it('should allow filtered destroyAll', function() {
    return new Promise((resolve, reject) => {
      Station.ordered.destroyAll({active: false}, function(err) {
        if (err) return reject(err);
        Station.ordered.count(function(err, count) {
          if (err) return reject(err);
          assert.equal(count, 2);
          Station.inactive.count(function(err, count) {
            if (err) return reject(err);
            assert.equal(count, 0);
            resolve();
          });
        });
      });
    });
  });
});

describe('scope - dynamic target class', function() {
  let Collection, Image, Video;

  before(function() {
    db = getSchema();
    Image = db.define('Image', {name: String});
    Video = db.define('Video', {name: String});

    Collection = db.define('Collection', {name: String, modelName: String});
    Collection.scope('items', function() {
      return {}; // could return a scope based on `this` (receiver)
    }, null, {}, {isStatic: false, modelTo: function(receiver) {
      return db.models[receiver.modelName];
    }});
  });

  beforeEach(function() {
    return new Promise((resolve, reject) => {
      Collection.destroyAll(function(err) {
        if (err) return reject(err);
        Image.destroyAll(function(err) {
          if (err) return reject(err);
          Video.destroyAll(function(err) {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });

  beforeEach(function() {
    return createModel(Collection, {name: 'Images', modelName: 'Image'});
  });

  beforeEach(function() {
    return createModel(Collection, {name: 'Videos', modelName: 'Video'});
  });

  beforeEach(function() {
    return createModel(Collection, {name: 'Things', modelName: 'Unknown'});
  });

  beforeEach(function() {
    return createModel(Image, {name: 'Image A'});
  });

  beforeEach(function() {
    return createModel(Video, {name: 'Video A'});
  });

  it('should deduce modelTo at runtime - Image', function() {
    return new Promise((resolve, reject) => {
      Collection.findOne({where: {modelName: 'Image'}}, function(err, coll) {
        if (err) return reject(err);
        assert.equal(coll.name, 'Images');
        coll.items(function(err, items) {
          if (err) return reject(err);
          assert.equal(items.length, 1);
          assert.equal(items[0].name, 'Image A');
          assert.ok(items[0] instanceof Image);
          resolve();
        });
      });
    });
  });

  it('should deduce modelTo at runtime - Video', function() {
    return new Promise((resolve, reject) => {
      Collection.findOne({where: {modelName: 'Video'}}, function(err, coll) {
        if (err) return reject(err);
        assert.equal(coll.name, 'Videos');
        coll.items(function(err, items) {
          if (err) return reject(err);
          assert.equal(items.length, 1);
          assert.equal(items[0].name, 'Video A');
          assert.ok(items[0] instanceof Video);
          resolve();
        });
      });
    });
  });

  it('should throw if modelTo is invalid', function() {
    return new Promise((resolve, reject) => {
      Collection.findOne({where: {name: 'Things'}}, function(err, coll) {
        if (err) return reject(err);
        assert.equal(coll.modelName, 'Unknown');
        assert.throws(function() {
          coll.items(function() {});
        });
        resolve();
      });
    });
  });
});

describe('scope - dynamic function', function() {
  let Item, seed = 0;

  before(function() {
    db = getSchema();
    Item = db.define('Item', {title: Number, creator: Number});
    Item.scope('dynamicQuery', function() {
      seed++;
      return {where: {creator: seed}};
    });
  });

  beforeEach(function() {
    return new Promise((resolve, reject) => {
      Item.create({title: 1, creator: 1}, function(err) {
        if (err) return reject(err);
        Item.create({title: 2, creator: 2}, function(err) {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });

  it('should deduce item by runtime creator', function() {
    return new Promise((resolve, reject) => {
      Item.dynamicQuery.findOne(function(err, firstQuery) {
        if (err) return reject(err);
        assert.equal(firstQuery.title, 1);
        Item.dynamicQuery.findOne(function(err, secondQuery) {
          if (err) return reject(err);
          assert.equal(secondQuery.title, 2);
          resolve();
        });
      });
    });
  });
});

function destroyAll(Model) {
  return new Promise((resolve, reject) => {
    Model.destroyAll(function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

function createModel(Model, data) {
  return new Promise((resolve, reject) => {
    Model.create(data, function(err, inst) {
      if (err) return reject(err);
      resolve(inst);
    });
  });
}
