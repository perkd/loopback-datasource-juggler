// Copyright IBM Corp. 2018,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, before, beforeEach, after, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const juggler = require('../');
const ModelBuilder = juggler.ModelBuilder;
const {StrongGlobalize} = require('strong-globalize');
const parentRefHelper = require('./helpers/setup-parent-ref');

global.beforeEach = function beforeEachCompat(nameOrFn, maybeFn) {
  return beforeEach(typeof nameOrFn === 'function' ? nameOrFn : maybeFn);
};

global.afterEach = function afterEachCompat(nameOrFn, maybeFn) {
  return afterEach(typeof nameOrFn === 'function' ? nameOrFn : maybeFn);
};

describe('ModelBuilder', () => {
  describe('define()', () => {
    let builder;

    beforeEach(givenModelBuilderInstance);

    it('sets correct "modelName" property', () => {
      const MyModel = builder.define('MyModel');
      assert.equal(MyModel.modelName, 'MyModel');
    });

    it('sets correct "name" property on model constructor', () => {
      const MyModel = builder.define('MyModel');
      assert.equal(MyModel.name, 'MyModel');
    });

    describe('model class name sanitization', () => {
      it('converts "-" to "_"', () => {
        const MyModel = builder.define('Grand-child');
        assert.equal(MyModel.name, 'Grand_child');
      });

      it('converts "." to "_"', () => {
        const MyModel = builder.define('Grand.child');
        assert.equal(MyModel.name, 'Grand_child');
      });

      it('converts ":" to "_"', () => {
        const MyModel = builder.define('local:User');
        assert.equal(MyModel.name, 'local_User');
      });

      it('falls back to legacy "ModelConstructor" in other cases', () => {
        const MyModel = builder.define('Grand\tchild');
        assert.equal(MyModel.name, 'ModelConstructor');
      });
    });

    describe('model with nested properties as function', () => {
      const Role = function(roleName) {};
      it('sets correct nested properties', () => {
        const User = builder.define('User', {
          role: {
            type: typeof Role,
            default: null,
          },
        });
        assert.equal(User.getPropertyType('role'), 'ModelConstructor');
      });
    });

    describe('model with nested properties as class', () => {
      class Role {
        constructor(roleName) {}
      }
      it('sets correct nested properties', () => {
        const User = builder.define('UserWithClass', {
          role: {
            type: Role,
            default: null,
          },
        });
        User.registerProperty('role');
        assert.equal(User.getPropertyType('role'), 'Role');
      });
    });

    describe('model with nested properties as embedded model', () => {
      let Address, Person;
      const originalWarn = StrongGlobalize.prototype.warn;
      parentRefHelper(() => builder);
      before(() => {
        StrongGlobalize.prototype.warn = function gWarnWrapper(...args) {
          StrongGlobalize.prototype.warn.called++;
          return originalWarn.apply(this, args);
        };
        StrongGlobalize.prototype.warn.called = 0;
      });
      beforeEach(() => {
        Address = builder.define('Address', {
          street: {type: 'string'},
          number: {type: 'number'},
        });
        Person = builder.define('Person', {
          name: {type: 'string'},
          address: {type: 'Address'},
          other: {type: 'object'},
        });
      });
      after(() => {
        StrongGlobalize.prototype.warn = originalWarn;
      });
      it('should properly add the __parent relationship when instantiating parent model', () => {
        const person = new Person({
          name: 'Mitsos',
          address: {street: 'kopria', number: 11},
        });
        assert.equal(person.address.__parent, person);
      });
      it('should add _parent property when setting embedded model after instantiation', () => {
        const person = new Person({
          name: 'Mitsos',
        });
        person.address = {street: 'kopria', number: 11};
        assert.equal(person.address.__parent, person);
      });
      it('should handle nullish embedded property values', () => {
        const person = new Person({
          name: 'Mitsos',
          address: null,
        });
        assert.equal(person.address, null);
      });
      it('should change __parent reference and WARN when moving a child instance to an other parent', () => {
        const person1 = new Person({
          name: 'Mitsos',
          address: {street: 'kopria', number: 11},
        });
        const {address} = person1;
        assert.ok(address instanceof Address);
        assert.equal(address.__parent, person1);
        assert.equal(StrongGlobalize.prototype.warn.called, 0); // check that no warn yet
        const person2 = new Person({
          name: 'Allos',
          address,
        });
        assert.equal(address.__parent, person2);
        assert.equal(StrongGlobalize.prototype.warn.called, 1); // check we had a warning
      });
      it('should NOT provide the __parent property to any serialization of the instance', () => {
        const person = new Person({
          name: 'Mitsos',
          address: {street: 'kopria', number: 11},
        });
        assert.equal(person.toJSON().address.__parent, undefined);
        assert.equal(person.toObject().address.__parent, undefined);
      });
      it('should NOT provide __parent property in plain object properties', () => {
        const person = new Person({
          name: 'Mitsos',
          address: {street: 'kopria', number: 11},
          other: {some: 'object'},
        });
        assert.deepEqual(person.other, {some: 'object'});
        assert.equal(person.other.__parent, undefined);
      });
    });

    describe('Model with properties as list of embedded models', () => {
      let Person, Address;
      beforeEach(() => {
        Address = builder.define('Address', {
          street: {type: 'string'},
          number: {type: 'number'},
        });
        Person = builder.define('Person', {
          name: {type: 'string'},
          addresses: {type: ['Address']}, // array of addresses
        });
      });
      it('should pass the container model instance as parent to the list item', () => {
        const person = new Person({
          name: 'mitsos',
          addresses: [{
            street: 'kapou oraia',
            number: 100,
          }],
        });
        assert.ok(person.addresses);
        assert.ok(person.addresses.parent instanceof Person);
        assert.equal(person.addresses.parent, person);
      });
      it('should pass the container model instance as parent to the list, when assigning to ' +
        'the list property', () => {
        const person = new Person({
          name: 'mitsos',
        });
        person.addresses = [{
          street: 'kapou oraia',
          number: 100,
        }];
        assert.ok(person.addresses);
        assert.ok(person.addresses.parent instanceof Person);
        assert.equal(person.addresses.parent, person);
      });
    });

    function givenModelBuilderInstance() {
      builder = new ModelBuilder();
    }
  });
});
