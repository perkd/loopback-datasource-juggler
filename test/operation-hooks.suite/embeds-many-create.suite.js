// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const assert = require('node:assert/strict');
const {beforeEach, describe, it} = require('node:test');

const ValidationError = require('../..').ValidationError;

const contextTestHelpers = require('../helpers/context-test-helpers');
const ContextRecorder = contextTestHelpers.ContextRecorder;
const aCtxForModel = contextTestHelpers.aCtxForModel;

const uid = require('../helpers/uid-generator');
const HookMonitor = require('../helpers/hook-monitor');

module.exports = function(dataSource, should, connectorCapabilities) {
  void should;
  describe('EmbedsMany - create', function() {
    let ctxRecorder, hookMonitor, expectedError;

    beforeEach(function setupHelpers() {
      ctxRecorder = new ContextRecorder('hook not called');
      hookMonitor = new HookMonitor({includeModelName: true});
      expectedError = new Error('test error');
    });

    let Owner, Embedded, ownerInstance;
    let migrated = false;

    beforeEach(function setupDatabase() {
      Embedded = dataSource.createModel('Embedded', {
        // Set id.generated to false to honor client side values
        id: {type: String, id: true, generated: false, default: uid.next},
        name: {type: String, required: true},
        extra: {type: String, required: false},
      });

      Owner = dataSource.createModel('Owner', {});
      Owner.embedsMany(Embedded);

      hookMonitor.install(Embedded);
      hookMonitor.install(Owner);

      if (migrated) {
        return Owner.deleteAll();
      } else {
        return dataSource.automigrate(Owner.modelName)
          .then(function() { migrated = true; });
      }
    });

    beforeEach(function setupData() {
      return Owner.create({}).then(function(inst) {
        ownerInstance = inst;
        hookMonitor.resetNames();
      });
    });

    function callCreate() {
      const item = new Embedded({name: 'created'});
      return ownerInstance.embeddedList.create(item);
    }

    it('triggers hooks in the correct order', function() {
      return callCreate().then(function(result) {
        assert.deepStrictEqual(hookMonitor.names, [
          'Embedded:before save',
          // TODO 'Embedded:persist',
          'Owner:before save',
          'Owner:persist',
          'Owner:loaded',
          'Owner:after save',
          // TODO 'Embedded:loaded',
          'Embedded:after save',
        ]);
      });
    });

    it('trigers `before save` hook on embedded model', function() {
      Embedded.observe('before save', ctxRecorder.recordAndNext());
      return callCreate().then(function(instance) {
        assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(Embedded, {
          instance: {
            id: instance.id,
            name: 'created',
            extra: undefined,
          },
          // TODO isNewInstance: true,
        }));
      });
    });

    // TODO
    it('trigers `before save` hook on owner model', {skip: 'TODO'}, function() {});

    it('applies updates from `before save` hook', function() {
      Embedded.observe('before save', function(ctx, next) {
        assert.ok(ctx.instance instanceof Embedded);
        ctx.instance.extra = 'hook data';
        next();
      });
      return callCreate().then(function(instance) {
        assert.strictEqual(instance.extra, 'hook data');
      });
    });

    it('validates model after `before save` hook', function() {
      Embedded.observe('before save', invalidateEmbeddedModel);
      return callCreate().then(throwShouldHaveFailed, function(err) {
        assert.ok(err instanceof ValidationError);
        // NOTE Apparently `create` is deferring validation to the owner
        // model, which in turn validates all embedded instances
        // and produces a single "invalid" error only
        // Compare this to `embedsOne.create`, which correctly reports
        // codes: { name: ['presence'] }
        assert.deepStrictEqual(err.details.codes || {}, {embeddeds: ['invalid']});
      });
    });

    it('aborts when `before save` hook fails', function() {
      Embedded.observe('before save', nextWithError(expectedError));
      return callCreate().then(throwShouldHaveFailed, function(err) {
        assert.strictEqual(err, expectedError);
      });
    });

    // TODO
    it('triggers `persist` hook on embedded model', {skip: 'TODO'}, function() {});
    it('triggers `persist` hook on owner model', {skip: 'TODO'}, function() {});
    it('applies updates from `persist` hook', {skip: 'TODO'}, function() {});
    it('aborts when `persist` hook fails', {skip: 'TODO'}, function() {});

    // TODO
    it('triggers `loaded` hook on embedded model', {skip: 'TODO'}, function() {});
    it('triggers `loaded` hook on owner model', {skip: 'TODO'}, function() {});
    it('applies updates from `loaded` hook', {skip: 'TODO'}, function() {});
    it('aborts when `loaded` hook fails', {skip: 'TODO'}, function() {});

    it('triggers `after save` hook on embedded model', function() {
      Embedded.observe('after save', ctxRecorder.recordAndNext());
      return callCreate().then(function(instance) {
        assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(Embedded, {
          instance: {
            id: instance.id,
            name: 'created',
            extra: undefined,
          },
          // TODO isNewInstance: true,
        }));
      });
    });

    // TODO
    it('triggers `after save` hook on owner model', {skip: 'TODO'}, function() {});

    it('applies updates from `after save` hook', function() {
      Embedded.observe('after save', function(ctx, next) {
        assert.ok(ctx.instance instanceof Embedded);
        ctx.instance.extra = 'hook data';
        next();
      });
      return callCreate().then(function(instance) {
        assert.strictEqual(instance.extra, 'hook data');
      });
    });

    it('aborts when `after save` hook fails', function() {
      Embedded.observe('after save', nextWithError(expectedError));
      return callCreate().then(throwShouldHaveFailed, function(err) {
        assert.strictEqual(err, expectedError);
      });
    });

    function invalidateEmbeddedModel(context, next) {
      if (context.instance) {
        context.instance.name = '';
      } else {
        context.data.name = '';
      }
      next();
    }

    function nextWithError(err) {
      return function(context, next) {
        next(err);
      };
    }

    function throwShouldHaveFailed() {
      throw new Error('operation should have failed');
    }
  });
};
