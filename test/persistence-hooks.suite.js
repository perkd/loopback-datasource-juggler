// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {after, afterEach, before, beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');

const ValidationError = require('../').ValidationError;

const contextTestHelpers = require('./helpers/context-test-helpers');
const ContextRecorder = contextTestHelpers.ContextRecorder;
const deepCloneToObject = contextTestHelpers.deepCloneToObject;
const aCtxForModel = contextTestHelpers.aCtxForModel;
const GeoPoint = require('../lib/geo.js').GeoPoint;

const uid = require('./helpers/uid-generator');
const getLastGeneratedUid = uid.last;

const HookMonitor = require('./helpers/hook-monitor');
let isNewInstanceFlag;

module.exports = function(dataSource, should, connectorCapabilities) {
  isNewInstanceFlag = connectorCapabilities.replaceOrCreateReportsNewInstance;
  if (!connectorCapabilities) connectorCapabilities = {};
  if (isNewInstanceFlag === undefined) {
    const warn = 'The connector does not support a recently added feature:' +
      ' replaceOrCreateReportsNewInstance';
    console.warn(warn);
  }
  describe('Persistence hooks', function() {
    let ctxRecorder, hookMonitor, expectedError;
    let TestModel, existingInstance, GeoModel;
    let migrated = false;

    let undefinedValue = undefined;

    beforeEach(async function setupDatabase() {
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
        ctxRecorder = new ContextRecorder('hook not called');
        hookMonitor = new HookMonitor({includeModelName: false});
        expectedError = new Error('test error');

        TestModel = dataSource.createModel('TestModel', {
        // Set id.generated to false to honor client side values
          id: {type: String, id: true, generated: false, default: uid.next},
          name: {type: String, required: true},
          extra: {type: String, required: false},
        });

        GeoModel = dataSource.createModel('GeoModel', {
          id: {type: String, id: true, default: uid.next},
          name: {type: String, required: false},
          location: {type: GeoPoint, required: false},
        });

        uid.reset();

        if (migrated) {
          Promise.all([
            TestModel.deleteAll(),
            GeoModel.deleteAll(),
          ]).then(() => done(), done);
        } else {
          dataSource.automigrate([TestModel.modelName, 'GeoModel'], function(err) {
            migrated = true;
            done(err);
          });
        }
      });
    });

    beforeEach(async function createTestData() {
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
        TestModel.create({name: 'first'}, function(err, instance) {
          if (err) return done(err);

          // Look it up from DB so that default values are retrieved
          TestModel.findById(instance.id, function(err, instance) {
            existingInstance = instance;
            undefinedValue = existingInstance.extra;

            TestModel.create({name: 'second'}, function(err) {
              if (err) return done(err);
              const location1 = new GeoPoint({lat: 10.2, lng: 6.7});
              const location2 = new GeoPoint({lat: 10.3, lng: 6.8});
              GeoModel.create([
                {name: 'Rome', location: location1},
                {name: 'Tokyo', location: location2},
              ], function(err) {
                done(err);
              });
            });
          });
        });
      });
    });

    describe('PersistedModel.find', function() {
      it('triggers hooks in the correct order', async function() {
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
          monitorHookExecution();

          TestModel.find(
            {where: {id: '1'}},
            function(err, list) {
              if (err) return done(err);

              assert.deepStrictEqual(hookMonitor.names, [
                'access',
                'loaded',
              ]);
              done();
            },
          );
        });
      });

      it('triggers the loaded hook multiple times when multiple instances exist', async function() {
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
          monitorHookExecution();

          TestModel.find(function(err, list) {
            if (err) return done(err);

            assert.deepStrictEqual(hookMonitor.names, [
              'access',
              'loaded',
              'loaded',
            ]);
            done();
          });
        });
      });

      it('should not trigger hooks, if notify is false', async function() {
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
          monitorHookExecution();
          TestModel.find(
            {where: {id: '1'}},
            {notify: false},
            function(err, list) {
              if (err) return done(err);
              assert.strictEqual(hookMonitor.names.length, 0);
              done();
            },
          );
        });
      });

      it('triggers the loaded hook multiple times when multiple instances exist when near filter is used',
        async function() {
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
            const hookMonitorGeoModel = new HookMonitor({includeModelName: false});

            function monitorHookExecutionGeoModel(hookNames) {
              hookMonitorGeoModel.install(GeoModel, hookNames);
            }

            monitorHookExecutionGeoModel();

            const query = {
              where: {location: {near: '10,5'}},
            };
            GeoModel.find(query, function(err, list) {
              if (err) return done(err);

              assert.deepStrictEqual(hookMonitorGeoModel.names, ['access', 'loaded', 'loaded']);
              done();
            });
          });
        });

      it('applies updates from `loaded` hook when near filter is used', async function() {
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
          GeoModel.observe('loaded', function(ctx, next) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {name: 'Berlin'});
            next();
          });

          const query = {
            where: {location: {near: '10,5'}},
          };

          GeoModel.find(query, function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(list.map(get('name')), ['Berlin', 'Berlin']);
            done();
          });
        });
      });

      it('applies updates to one specific instance from `loaded` hook when near filter is used',
        async function() {
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
            GeoModel.observe('loaded', function(ctx, next) {
              if (ctx.data.name === 'Rome') {
              // It's crucial to change `ctx.data` reference, not only data props
                ctx.data = Object.assign({}, ctx.data, {name: 'Berlin'});
              }
              next();
            });

            const query = {
              where: {location: {near: '10,5'}},
            };

            GeoModel.find(query, function(err, list) {
              if (err) return done(err);
              assert.ok(list.map(get('name')).includes('Berlin', 'Tokyo'));
              done();
            });
          });
        });

      it('applies updates from `loaded` hook when near filter is not used', async function() {
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
          TestModel.observe('loaded', function(ctx, next) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {name: 'Paris'});
            next();
          });

          TestModel.find(function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(list.map(get('name')), ['Paris', 'Paris']);
            done();
          });
        });
      });

      it('applies updates to one specific instance from `loaded` hook when near filter is not used',
        async function() {
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
            TestModel.observe('loaded', function(ctx, next) {
              if (ctx.data.name === 'first') {
              // It's crucial to change `ctx.data` reference, not only data props
                ctx.data = Object.assign({}, ctx.data, {name: 'Paris'});
              }
              next();
            });

            TestModel.find(function(err, list) {
              if (err) return done(err);
              assert.deepStrictEqual(list.map(get('name')), ['Paris', 'second']);
              done();
            });
          });
        });

      it('should not trigger hooks for geo queries, if notify is false',
        async function() {
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
            monitorHookExecution();

            TestModel.find(
              {where: {geo: {near: '10,20'}}},
              {notify: false},
              function(err, list) {
                if (err) return done(err);
                assert.strictEqual(hookMonitor.names.length, 0);
                done();
              },
            );
          });
        });

      it('should apply updates from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {name: 'second'}};
            next();
          });

          TestModel.find({name: 'first'}, function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(list.map(get('name')), ['second']);
            done();
          });
        });
      });

      it('triggers `access` hook', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.find({where: {id: '1'}}, function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              query: {where: {id: '1'}},
            }));
            done();
          });
        });
      });

      it('aborts when `access` hook fails', async function() {
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
          TestModel.observe('access', nextWithError(expectedError));

          TestModel.find(function(err, list) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('applies updates from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: existingInstance.id}};
            next();
          });

          TestModel.find(function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(list.map(get('name')), [existingInstance.name]);
            done();
          });
        });
      });

      it('triggers `access` hook for geo queries', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.find({where: {geo: {near: '10,20'}}}, function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              query: {where: {geo: {near: '10,20'}}},
            }));
            done();
          });
        });
      });

      it('applies updates from `access` hook for geo queries', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: existingInstance.id}};
            next();
          });

          TestModel.find({where: {geo: {near: '10,20'}}}, function(err, list) {
            if (err) return done(err);
            assert.deepStrictEqual(list.map(get('name')), [existingInstance.name]);
            done();
          });
        });
      });

      it('applies updates from `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          TestModel.find(
            {where: {id: 1}},
            function(err, list) {
              if (err) return done(err);

              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                data: {
                  id: '1',
                  name: 'first',
                  extra: 'hook data',
                },
                isNewInstance: false,
                options: {},
              }));

              assert.ok(Object.prototype.hasOwnProperty.call(list[0], 'extra')); assert.strictEqual(list[0].extra, 'hook data');
              done();
            },
          );
        });
      });

      it('emits error when `loaded` hook fails', async function() {
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
          TestModel.observe('loaded', nextWithError(expectedError));
          TestModel.find(
            {where: {id: 1}},
            function(err, list) {
              assert.deepStrictEqual([err], [expectedError]);
              done();
            },
          );
        });
      });
    });

    describe('PersistedModel.create', function() {
      it('triggers hooks in the correct order', async function() {
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
          monitorHookExecution();

          TestModel.create(
            {name: 'created'},
            function(err, record, created) {
              if (err) return done(err);

              assert.deepStrictEqual(hookMonitor.names, [
                'before save',
                'persist',
                'loaded',
                'after save',
              ]);
              done();
            },
          );
        });
      });

      it('aborts when `after save` fires when option to notify is false', async function() {
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
          monitorHookExecution();

          TestModel.create({name: 'created'}, {notify: false}, function(err, record, created) {
            if (err) return done(err);

            assert.ok(!hookMonitor.names.includes('after save'));
            done();
          });
        });
      });

      it('triggers `before save` hook', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.create({name: 'created'}, function(err, instance) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              instance: {
                id: instance.id,
                name: 'created',
                extra: undefined,
              },
              isNewInstance: true,
            }));
            done();
          });
        });
      });

      it('aborts when `before save` hook fails', async function() {
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
          TestModel.observe('before save', nextWithError(expectedError));

          TestModel.create({name: 'created'}, function(err, instance) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('applies updates from `before save` hook', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          TestModel.create({id: uid.next(), name: 'a-name'}, function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });

      it('sends `before save` for each model in an array', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.create(
            [{name: '1'}, {name: '2'}],
            function(err, list) {
              if (err) return done(err);
              // Creation of multiple instances is executed in parallel
              ctxRecorder.records.sort(function(c1, c2) {
                return c1.instance.name - c2.instance.name;
              });
              assert.deepStrictEqual(ctxRecorder.records, [
                aCtxForModel(TestModel, {
                  instance: {id: list[0].id, name: '1', extra: undefined},
                  isNewInstance: true,
                }),
                aCtxForModel(TestModel, {
                  instance: {id: list[1].id, name: '2', extra: undefined},
                  isNewInstance: true,
                }),
              ]);
              done();
            },
          );
        });
      });

      it('validates model after `before save` hook', async function() {
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
          TestModel.observe('before save', invalidateTestModel());

          TestModel.create({name: 'created'}, function(err) {
            assert.ok((err || {}) instanceof ValidationError);
            assert.deepStrictEqual((err.details.codes || {}), {name: ['presence']});
            done();
          });
        });
      });

      it('triggers `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          TestModel.create(
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);

              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                data: {id: 'new-id', name: 'a name'},
                isNewInstance: true,
                currentInstance: {extra: null, id: 'new-id', name: 'a name'},
              }));

              done();
            },
          );
        });
      });

      it('applies updates from `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.create(
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);

              assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');

              // Also query the database here to verify that, on `create`
              // updates from `persist` hook are reflected into database
              TestModel.findById('new-id', function(err, dbInstance) {
                if (err) return done(err);
                assert.ok(dbInstance != null);
                assert.deepStrictEqual(dbInstance.toObject(true), {
                  id: 'new-id',
                  name: 'a name',
                  extra: 'hook data',
                });
                done();
              });
            },
          );
        });
      });

      it('triggers `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.create(
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);

              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                data: {id: 'new-id', name: 'a name'},
                isNewInstance: true,
              }));

              done();
            },
          );
        });
      });

      it('emits error when `loaded` hook fails', async function() {
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
          TestModel.observe('loaded', nextWithError(expectedError));
          TestModel.create(
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              assert.deepStrictEqual([err], [expectedError]);
              done();
            },
          );
        });
      });

      it('applies updates from `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.create(
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);

              assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
              done();
            },
          );
        });
      });

      it('triggers `after save` hook', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.create({name: 'created'}, function(err, instance) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              instance: {
                id: instance.id,
                name: 'created',
                extra: undefined,
              },
              isNewInstance: true,
            }));
            done();
          });
        });
      });

      it('aborts when `after save` hook fails', async function() {
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
          TestModel.observe('after save', nextWithError(expectedError));

          TestModel.create({name: 'created'}, function(err, instance) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('applies updates from `after save` hook', async function() {
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
          TestModel.observe('after save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          TestModel.create({name: 'a-name'}, function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });

      it('sends `after save` for each model in an array', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.create(
            [{name: '1'}, {name: '2'}],
            function(err, list) {
              if (err) return done(err);
              // Creation of multiple instances is executed in parallel
              ctxRecorder.records.sort(function(c1, c2) {
                return c1.instance.name - c2.instance.name;
              });
              assert.deepStrictEqual(ctxRecorder.records, [
                aCtxForModel(TestModel, {
                  instance: {id: list[0].id, name: '1', extra: undefined},
                  isNewInstance: true,
                }),
                aCtxForModel(TestModel, {
                  instance: {id: list[1].id, name: '2', extra: undefined},
                  isNewInstance: true,
                }),
              ]);
              done();
            },
          );
        });
      });

      it('emits `after save` when some models were not saved', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            if (ctx.instance.name === 'fail')
              next(expectedError);
            else
              next();
          });

          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.create(
            [{name: 'ok'}, {name: 'fail'}],
            function(err, list) {
              assert.strictEqual((err || []).length, 2);
              assert.deepStrictEqual(err[1], expectedError);

              // NOTE(bajtos) The current implementation of `Model.create(array)`
              // passes all models in the second callback argument, including
              // the models that were not created due to an error.
              assert.deepStrictEqual(list.map(get('name')), ['ok', 'fail']);

              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                instance: {id: list[0].id, name: 'ok', extra: undefined},
                isNewInstance: true,
              }));
              done();
            },
          );
        });
      });
    });

    describe('PersistedModel.createAll', function() {
      it('triggers hooks in the correct order', async function() {
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
          monitorHookExecution();

          TestModel.createAll(
            [{name: '1'}, {name: '2'}],
            function(err) {
              if (err) return done(err);

              assert.deepStrictEqual(hookMonitor.names, [
                'before save',
                'before save',
                'persist',
                'loaded',
                'after save',
                'after save',
              ]);
              done();
            },
          );
        });
      });

      it('aborts when `after save` fires when option to notify is false', async function() {
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
          monitorHookExecution();

          TestModel.create(
            [{name: '1'}, {name: '2'}],
            {notify: false},
            function(err) {
              if (err) return done(err);

              assert.ok(!hookMonitor.names.includes('after save'));
              done();
            },
          );
        });
      });

      it('triggers `before save` hook for each item in the array', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.createAll([{name: '1'}, {name: '2'}], function(err, list) {
            if (err) return done(err);
            // Creation of multiple instances is executed in parallel
            ctxRecorder.records.sort(function(c1, c2) {
              return c1.instance.name - c2.instance.name;
            });
            assert.deepStrictEqual(ctxRecorder.records, [
              aCtxForModel(TestModel, {
                instance: {id: list[0].id, name: '1', extra: undefined},
                isNewInstance: true,
              }),
              aCtxForModel(TestModel, {
                instance: {id: list[1].id, name: '2', extra: undefined},
                isNewInstance: true,
              }),
            ]);
            done();
          });
        });
      });

      it('aborts when `before save` hook fails', async function() {
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
          TestModel.observe('before save', nextWithError(expectedError));

          TestModel.createAll([{name: '1'}, {name: '2'}], function(err) {
            assert.deepStrictEqual(err, expectedError);
            done();
          });
        });
      });

      it('applies updates from `before save` hook to each item in the array', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          TestModel.createAll(
            [{id: uid.next(), name: 'a-name'}, {id: uid.next(), name: 'b-name'}],
            function(err, instances) {
              if (err) return done(err);
              instances.forEach(instance => {
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
              });
              done();
            },
          );
        });
      });

      it('validates model after `before save` hook', async function() {
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
          TestModel.observe('before save', invalidateTestModel());

          TestModel.createAll([{name: 'created1'}, {name: 'created2'}], function(err) {
            assert.ok((err || {}) instanceof ValidationError);
            assert.deepStrictEqual((err.details.codes || {}), {name: ['presence']});
            done();
          });
        });
      });

      it('triggers `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          TestModel.createAll(
            [{id: 'new-id-1', name: 'a name'}, {id: 'new-id-2', name: 'b name'}],
            function(err, instances) {
              if (err) return done(err);

              assert.deepStrictEqual(ctxRecorder.records, [
                aCtxForModel(TestModel, {
                  data: {id: 'new-id-1', name: 'a name'},
                  isNewInstance: true,
                  currentInstance: {extra: null, id: 'new-id-1', name: 'a name'},
                }),
                aCtxForModel(TestModel, {
                  data: {id: 'new-id-2', name: 'b name'},
                  isNewInstance: true,
                  currentInstance: {extra: null, id: 'new-id-2', name: 'b name'},
                }),
              ]);

              done();
            },
          );
        });
      });

      it('applies updates from `persist` hook', async function() {
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
          TestModel.observe(
            'persist',
            ctxRecorder.recordAndNext(function(ctxArr) {
            // It's crucial to change `ctx.data` reference, not only data props
              ctxArr.forEach(ctx => {
                ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
              });
            }),
          );

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.createAll(
            [{id: 'new-id', name: 'a name'}],
            function(err, instances) {
              if (err) return done(err);

              instances.forEach(instance => {
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
              });

              // Also query the database here to verify that, on `create`
              // updates from `persist` hook are reflected into database
              TestModel.findById('new-id', function(err, dbInstance) {
                if (err) return done(err);
                assert.ok(dbInstance != null);
                assert.deepStrictEqual(dbInstance.toObject(true), {
                  id: 'new-id',
                  name: 'a name',
                  extra: 'hook data',
                });
                done();
              });
            },
          );
        });
      });

      it('triggers `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.createAll(
            [
              {id: 'new-id-1', name: 'a name'},
              {id: 'new-id-2', name: 'b name'},
            ],
            function(err) {
              if (err) return done(err);

              ctxRecorder.records.sort(function(c1, c2) {
                return c1.data.name - c2.data.name;
              });
              assert.deepStrictEqual(ctxRecorder.records, [
                aCtxForModel(TestModel, {
                  data: {id: 'new-id-1', name: 'a name'},
                  isNewInstance: true,
                }),
                aCtxForModel(TestModel, {
                  data: {id: 'new-id-2', name: 'b name'},
                  isNewInstance: true,
                }),
              ]);

              done();
            },
          );
        });
      });

      it('emits error when `loaded` hook fails', async function() {
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
          TestModel.observe('loaded', nextWithError(expectedError));
          TestModel.createAll(
            [{id: 'new-id', name: 'a name'}],
            function(err) {
              assert.deepStrictEqual(err, expectedError);
              done();
            },
          );
        });
      });

      it('applies updates from `loaded` hook', async function() {
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
          TestModel.observe(
            'loaded',
            ctxRecorder.recordAndNext(function(ctx) {
            // It's crucial to change `ctx.data` reference, not only data props
              ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
            }),
          );

          // By default, the instance passed to create callback is NOT updated
          // with the changes made through persist/loaded hooks. To preserve
          // backwards compatibility, we introduced a new setting updateOnLoad,
          // which if set, will apply these changes to the model instance too.
          TestModel.settings.updateOnLoad = true;
          TestModel.create(
            [{id: 'new-id', name: 'a name'}],
            function(err, instances) {
              if (err) return done(err);

              instances.forEach((instance) => {
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
              });
              done();
            },
          );
        });
      });

      it('triggers `after save` hook', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.createAll([{name: '1'}, {name: '2'}], function(err, list) {
            if (err) return done(err);

            ctxRecorder.records.sort(function(c1, c2) {
              return c1.instance.name - c2.instance.name;
            });
            assert.deepStrictEqual(ctxRecorder.records, [
              aCtxForModel(TestModel, {
                instance: {id: list[0].id, name: '1', extra: undefined},
                isNewInstance: true,
              }),
              aCtxForModel(TestModel, {
                instance: {id: list[1].id, name: '2', extra: undefined},
                isNewInstance: true,
              }),
            ]);
            done();
          });
        });
      });

      it('aborts when `after save` hook fails', async function() {
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
          TestModel.observe('after save', nextWithError(expectedError));

          TestModel.createAll([{name: 'created'}], function(err) {
            assert.deepStrictEqual(err, expectedError);
            done();
          });
        });
      });

      it('applies updates from `after save` hook', async function() {
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
          TestModel.observe('after save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          TestModel.createAll([
            {name: 'a-name'},
            {name: 'b-name'},
          ], function(err, instances) {
            if (err) return done(err);
            instances.forEach((instance) => {
              assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            });
            done();
          });
        });
      });

      it('do not emit `after save` when before save fails for even one', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            if (ctx.instance.name === 'fail') next(expectedError);
            else next();
          });

          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.createAll([{name: 'ok'}, {name: 'fail'}], function(err, list) {
            assert.deepStrictEqual(err, expectedError);
            done();
          });
        });
      });
    });

    describe('PersistedModel.findOrCreate', {skip: true}, function() {});
    describe('PersistedModel.count', function() {
      it('triggers `access` hook', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.count({id: existingInstance.id}, function(err, count) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {query: {
              where: {id: existingInstance.id},
            }}));
            done();
          });
        });
      });

      it('applies updates from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query.where = {id: existingInstance.id};
            next();
          });

          TestModel.count(function(err, count) {
            if (err) return done(err);
            assert.strictEqual(count, 1);
            done();
          });
        });
      });
    });

    describe('PersistedModel.prototype.save', function() {
      it('triggers hooks in the correct order', async function() {
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
          monitorHookExecution();

          existingInstance.save(
            function(err, record, created) {
              if (err) return done(err);
              assert.deepStrictEqual(hookMonitor.names, [
                'before save',
                'persist',
                'loaded',
                'after save',
              ]);
              done();
            },
          );
        });
      });

      it('triggers `before save` hook', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          existingInstance.name = 'changed';
          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {instance: {
              id: existingInstance.id,
              name: 'changed',
              extra: undefined,
            }, options: {throws: false, validate: true}}));
            done();
          });
        });
      });

      it('aborts when `before save` hook fails', async function() {
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
          TestModel.observe('before save', nextWithError(expectedError));

          existingInstance.save(function(err, instance) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('applies updates from `before save` hook', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });

      it('validates model after `before save` hook', async function() {
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
          TestModel.observe('before save', invalidateTestModel());

          existingInstance.save(function(err) {
            assert.ok((err || {}) instanceof ValidationError);
            assert.deepStrictEqual((err.details.codes || {}), {name: ['presence']});
            done();
          });
        });
      });

      it('triggers `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          existingInstance.name = 'changed';
          existingInstance.save(function(err, instance) {
            if (err) return done(err);

            // HACK: extra is undefined for NoSQL and null for SQL
            delete ctxRecorder.records.data.extra;
            delete ctxRecorder.records.currentInstance.extra;
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              data: {
                id: existingInstance.id,
                name: 'changed',
              },
              currentInstance: {
                id: existingInstance.id,
                name: 'changed',
              },
              where: {id: existingInstance.id},
              options: {throws: false, validate: true},
            }));

            done();
          });
        });
      });

      it('applies updates from `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });

      it('triggers `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          existingInstance.extra = 'changed';
          existingInstance.save(function(err, instance) {
            if (err) return done(err);

            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              data: {
                id: existingInstance.id,
                name: existingInstance.name,
                extra: 'changed',
              },
              isNewInstance: isNewInstanceFlag ? false : undefined,
              options: {throws: false, validate: true},
            }));

            done();
          });
        });
      });

      it('emits error when `loaded` hook fails', async function() {
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
          TestModel.observe('loaded', nextWithError(expectedError));
          existingInstance.save(
            function(err, instance) {
              assert.deepStrictEqual([err], [expectedError]);
              done();
            },
          );
        });
      });

      it('applies updates from `loaded` hook', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });

      it('triggers `after save` hook on update', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          existingInstance.name = 'changed';
          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              instance: {
                id: existingInstance.id,
                name: 'changed',
                extra: undefined,
              },
              isNewInstance: isNewInstanceFlag ? false : undefined,
              options: {throws: false, validate: true},
            }));
            done();
          });
        });
      });

      it('triggers `after save` hook on create', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          // The rationale behind passing { persisted: true } is to bypass the check
          // made by DAO to determine whether the instance should be saved via
          // PersistedModel.create and force it to call connector.save()
          const instance = new TestModel(
            {id: 'new-id', name: 'created'},
            {persisted: true},
          );

          instance.save(function(err, instance) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              instance: {
                id: instance.id,
                name: 'created',
                extra: undefined,
              },
              isNewInstance: isNewInstanceFlag ? true : undefined,
              options: {throws: false, validate: true},
            }));
            done();
          });
        });
      });

      it('aborts when `after save` hook fails', async function() {
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
          TestModel.observe('after save', nextWithError(expectedError));

          existingInstance.save(function(err, instance) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('applies updates from `after save` hook', async function() {
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
          TestModel.observe('after save', function(ctx, next) {
            assert.ok(ctx.instance instanceof TestModel);
            ctx.instance.extra = 'hook data';
            next();
          });

          existingInstance.save(function(err, instance) {
            if (err) return done(err);
            assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
            done();
          });
        });
      });
    });

    describe('PersistedModel.prototype.updateAttributes', {skip: true}, function() {});
    describe('PersistedModel.updateOrCreate', {skip: true}, function() {});
    describe('PersistedModel.deleteAll', function() {
      it('triggers `access` hook with query', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.deleteAll({name: existingInstance.name}, function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              query: {where: {name: existingInstance.name}},
            }));
            done();
          });
        });
      });

      it('triggers `access` hook without query', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.deleteAll(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {query: {where: {}}}));
            done();
          });
        });
      });

      it('applies updates from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          TestModel.deleteAll(function(err) {
            if (err) return done(err);
            findTestModels(function(err, list) {
              if (err) return done(err);
              assert.deepStrictEqual((list || []).map(get('id')), [existingInstance.id]);
              done();
            });
          });
        });
      });

      it('triggers `before delete` hook with query', async function() {
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
          TestModel.observe('before delete', ctxRecorder.recordAndNext());

          TestModel.deleteAll({name: existingInstance.name}, function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {name: existingInstance.name},
            }));
            done();
          });
        });
      });

      it('triggers `before delete` hook without query', async function() {
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
          TestModel.observe('before delete', ctxRecorder.recordAndNext());

          TestModel.deleteAll(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {where: {}}));
            done();
          });
        });
      });

      it('applies updates from `before delete` hook', async function() {
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
          TestModel.observe('before delete', function(ctx, next) {
            ctx.where = {id: {neq: existingInstance.id}};
            next();
          });

          TestModel.deleteAll(function(err) {
            if (err) return done(err);
            findTestModels(function(err, list) {
              if (err) return done(err);
              assert.deepStrictEqual((list || []).map(get('id')), [existingInstance.id]);
              done();
            });
          });
        });
      });

      it('aborts when `before delete` hook fails', async function() {
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
          TestModel.observe('before delete', nextWithError(expectedError));

          TestModel.deleteAll(function(err, list) {
            assert.deepStrictEqual([err], [expectedError]);
            TestModel.findById(existingInstance.id, function(err, inst) {
              if (err) return done(err);
              assert.deepStrictEqual(
                inst ? inst.toObject() : null,
                existingInstance.toObject(),
              );
              done();
            });
          });
        });
      });

      it('triggers `after delete` hook without query', async function() {
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
          TestModel.observe('after delete', ctxRecorder.recordAndNext());

          TestModel.deleteAll(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {},
              info: {count: 2},
            }));
            done();
          });
        });
      });

      it('triggers `after delete` hook with query', async function() {
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
          TestModel.observe('after delete', ctxRecorder.recordAndNext());

          TestModel.deleteAll({name: existingInstance.name}, function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {name: existingInstance.name},
              info: {count: 1},
            }));
            done();
          });
        });
      });

      it('aborts when `after delete` hook fails', async function() {
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
          TestModel.observe('after delete', nextWithError(expectedError));

          TestModel.deleteAll(function(err) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });
    });

    describe('PersistedModel.prototype.delete', function() {
      it('triggers `access` hook', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          existingInstance.delete(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              query: {where: {id: existingInstance.id}},
            }));
            done();
          });
        });
      });

      it('applies updated from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          existingInstance.delete(function(err) {
            if (err) return done(err);
            findTestModels(function(err, list) {
              if (err) return done(err);
              assert.deepStrictEqual((list || []).map(get('id')), [existingInstance.id]);
              done();
            });
          });
        });
      });

      it('triggers `before delete` hook', async function() {
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
          TestModel.observe('before delete', ctxRecorder.recordAndNext());

          existingInstance.delete(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {id: existingInstance.id},
              instance: existingInstance,
            }));
            done();
          });
        });
      });

      it('applies updated from `before delete` hook', async function() {
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
          TestModel.observe('before delete', function(ctx, next) {
            ctx.where = {id: {neq: existingInstance.id}};
            next();
          });

          existingInstance.delete(function(err) {
            if (err) return done(err);
            findTestModels(function(err, list) {
              if (err) return done(err);
              assert.deepStrictEqual((list || []).map(get('id')), [existingInstance.id]);
              done();
            });
          });
        });
      });

      it('aborts when `before delete` hook fails', async function() {
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
          TestModel.observe('before delete', nextWithError(expectedError));

          existingInstance.delete(function(err, list) {
            assert.deepStrictEqual([err], [expectedError]);
            TestModel.findById(existingInstance.id, function(err, inst) {
              if (err) return done(err);
              assert.deepStrictEqual((inst ? inst.toObject() : 'null'),
                existingInstance.toObject());
              done();
            });
          });
        });
      });

      it('triggers `after delete` hook', async function() {
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
          TestModel.observe('after delete', ctxRecorder.recordAndNext());

          existingInstance.delete(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {id: existingInstance.id},
              instance: existingInstance,
              info: {count: 1},
            }));
            done();
          });
        });
      });

      it('triggers `after delete` hook without query', async function() {
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
          TestModel.observe('after delete', ctxRecorder.recordAndNext());

          TestModel.deleteAll({name: existingInstance.name}, function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
              where: {name: existingInstance.name},
              info: {count: 1},
            }));
            done();
          });
        });
      });

      it('aborts when `after delete` hook fails', async function() {
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
          TestModel.observe('after delete', nextWithError(expectedError));

          TestModel.deleteAll(function(err) {
            assert.deepStrictEqual([err], [expectedError]);
            done();
          });
        });
      });

      it('propagates hookState from `before delete` to `after delete`', async function() {
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
          TestModel.observe('before delete', ctxRecorder.recordAndNext(function(ctx) {
            ctx.hookState.foo = 'bar';
          }));

          TestModel.observe('after delete', ctxRecorder.recordAndNext(function(ctx) {
            ctx.hookState.foo = ctx.hookState.foo.toUpperCase();
          }));

          existingInstance.delete(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(ctxRecorder.records, [
              aCtxForModel(TestModel, {
                hookState: {foo: 'bar'},
                where: {id: '1'},
                instance: existingInstance,
              }),
              aCtxForModel(TestModel, {
                hookState: {foo: 'BAR'},
                info: {count: 1},
                where: {id: '1'},
                instance: existingInstance,
              }),
            ]);
            done();
          });
        });
      });

      it('triggers hooks only once', async function() {
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
          monitorHookExecution();
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          existingInstance.delete(function(err) {
            if (err) return done(err);
            assert.deepStrictEqual(hookMonitor.names, ['access', 'before delete', 'after delete']);
            done();
          });
        });
      });
    });

    describe('PersistedModel.updateAll', function() {
      it('triggers `access` hook', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {name: 'searched'},
            {name: 'updated'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {query: {
                where: {name: 'searched'},
              }}));
              done();
            },
          );
        });
      });

      it('applies updates from `access` hook', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'new name'},
            function(err) {
              if (err) return done(err);
              findTestModels({fields: ['id', 'name']}, function(err, list) {
                if (err) return done(err);
                assert.deepStrictEqual((list || []).map(toObject), [
                  {id: existingInstance.id, name: existingInstance.name, extra: undefined},
                  {id: '2', name: 'new name', extra: undefined},
                ]);
                done();
              });
            },
          );
        });
      });

      it('triggers `before save` hook', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {name: 'searched'},
            {name: 'updated'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                where: {name: 'searched'},
                data: {name: 'updated'},
              }));
              done();
            },
          );
        });
      });

      it('applies updates from `before save` hook', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            ctx.data = {name: 'hooked', extra: 'added'};
            next();
          });

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'updated name'},
            function(err) {
              if (err) return done(err);
              loadTestModel(existingInstance.id, function(err, instance) {
                if (err) return done(err);
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'name')); assert.strictEqual(instance.name, 'hooked');
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'added');
                done();
              });
            },
          );
        });
      });

      it('triggers `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {name: existingInstance.name},
            {name: 'changed'},
            function(err, instance) {
              if (err) return done(err);

              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                data: {name: 'changed'},
                where: {name: existingInstance.name},
              }));

              done();
            },
          );
        });
      });

      it('applies updates from `persist` hook', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext(function(ctx) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {extra: 'hook data'});
          }));

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'changed'},
            function(err) {
              if (err) return done(err);
              loadTestModel(existingInstance.id, function(err, instance) {
                assert.ok(Object.prototype.hasOwnProperty.call(instance, 'extra')); assert.strictEqual(instance.extra, 'hook data');
                done();
              });
            },
          );
        });
      });

      it('does not trigger `loaded`', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'changed'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, 'hook not called');
              done();
            },
          );
        });
      });

      it('triggers `after save` hook', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'updated name'},
            function(err) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                where: {id: existingInstance.id},
                data: {name: 'updated name'},
                info: {count: 1},
              }));
              done();
            },
          );
        });
      });

      it('accepts hookState from options', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.updateAll(
            {id: existingInstance.id},
            {name: 'updated name'},
            {foo: 'bar'},
            function(err) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records.options, {
                foo: 'bar',
              });
              done();
            },
          );
        });
      });
    });

    describe('PersistedModel.upsertWithWhere', function() {
      it('triggers hooks in the correct order on create', async function() {
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
          monitorHookExecution();
          TestModel.upsertWithWhere({extra: 'not-found'},
            {id: 'not-found', name: 'not found', extra: 'not-found'},
            function(err, record, created) {
              if (err) return done(err);
              assert.deepStrictEqual(hookMonitor.names, [
                'access',
                'before save',
                'persist',
                'loaded',
                'after save',
              ]);
              TestModel.findById('not-found', function(err, data) {
                if (err) return done(err);
                assert.strictEqual(data.name, 'not found');
                assert.strictEqual(data.extra, 'not-found');
                done();
              });
            });
        });
      });

      it('triggers hooks in the correct order on update', async function() {
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
          monitorHookExecution();
          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'new name', extra: 'new extra'},
            function(err, record, created) {
              if (err) return done(err);
              assert.deepStrictEqual(hookMonitor.names, [
                'access',
                'before save',
                'persist',
                'loaded',
                'after save',
              ]);
              TestModel.findById(existingInstance.id, function(err, data) {
                if (err) return done(err);
                assert.strictEqual(data.name, 'new name');
                assert.strictEqual(data.extra, 'new extra');
                done();
              });
            });
        });
      });

      it('triggers `access` hook on create', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({extra: 'not-found'},
            {id: 'not-found', name: 'not found'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {query: {
                where: {extra: 'not-found'},
              }}));
              done();
            });
        });
      });

      it('triggers `access` hook on update', async function() {
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
          TestModel.observe('access', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'new name', extra: 'new extra'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {query: {
                where: {id: existingInstance.id},
              }}));
              done();
            });
        });
      });

      it('triggers hooks only once', async function() {
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
          monitorHookExecution(['access', 'before save']);

          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'new name'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(hookMonitor.names, ['access', 'before save']);
              done();
            });
        });
      });

      it('applies updates from `access` hook when found', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: {neq: existingInstance.id}}};
            next();
          });

          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'new name'},
            function(err, instance) {
              if (err) return done(err);
              findTestModels({fields: ['id', 'name']}, function(err, list) {
                if (err) return done(err);
                assert.deepStrictEqual((list || []).map(toObject), [
                  {id: existingInstance.id, name: existingInstance.name, extra: undefined},
                  {id: instance.id, name: 'new name', extra: undefined},
                ]);
                done();
              });
            });
        });
      });

      it('applies updates from `access` hook when not found', async function() {
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
          TestModel.observe('access', function(ctx, next) {
            ctx.query = {where: {id: 'not-found'}};
            next();
          });

          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'new name'},
            function(err, instance) {
              if (err) return done(err);
              findTestModels({fields: ['id', 'name']}, function(err, list) {
                if (err) return done(err);
                assert.deepStrictEqual((list || []).map(toObject), [
                  {id: existingInstance.id, name: existingInstance.name, extra: undefined},
                  {id: list[1].id, name: 'second', extra: undefined},
                  {id: instance.id, name: 'new name', extra: undefined},
                ]);
                done();
              });
            });
        });
      });

      it('triggers `before save` hook on update', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {id: existingInstance.id, name: 'updated name'},
            function(err, instance) {
              if (err) return done(err);
              const expectedContext = aCtxForModel(TestModel, {
                where: {id: existingInstance.id},
                data: {
                  id: existingInstance.id,
                  name: 'updated name',
                },
              });
              if (!dataSource.connector.upsertWithWhere) {
              // the difference between `existingInstance` and the following
              // plain-data object is `currentInstance` the missing fields are
              // null in `currentInstance`, wehere as in `existingInstance` they
              // are undefined; please see other tests for example see:
              // test for "PersistedModel.create triggers `persist` hook"
                expectedContext.currentInstance = {id: existingInstance.id, name: 'first', extra: null};
              }
              assert.deepStrictEqual(ctxRecorder.records, expectedContext);
              done();
            });
        });
      });

      it('triggers `before save` hook on create', async function() {
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
          TestModel.observe('before save', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);
              const expectedContext = aCtxForModel(TestModel, {});

              if (dataSource.connector.upsertWithWhere) {
                expectedContext.data = {id: 'new-id', name: 'a name'};
                expectedContext.where = {id: 'new-id'};
              } else {
                expectedContext.instance = {id: 'new-id', name: 'a name', extra: null};
                expectedContext.isNewInstance = true;
              }
              assert.deepStrictEqual(ctxRecorder.records, expectedContext);
              done();
            });
        });
      });

      it('applies updates from `before save` hook on update', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
          // It's crucial to change `ctx.data` reference, not only data props
            ctx.data = Object.assign({}, ctx.data, {name: 'hooked'});
            next();
          });

          TestModel.upsertWithWhere({id: existingInstance.id},
            {name: 'updated name'},
            function(err, instance) {
              if (err) return done(err);
              assert.strictEqual(instance.name, 'hooked');
              done();
            });
        });
      });

      it('applies updates from `before save` hook on create', async function() {
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
          TestModel.observe('before save', function(ctx, next) {
            if (ctx.instance) {
              ctx.instance.name = 'hooked';
            } else {
            // It's crucial to change `ctx.data` reference, not only data props
              ctx.data = Object.assign({}, ctx.data, {name: 'hooked'});
            }
            next();
          });

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'new name'},
            function(err, instance) {
              if (err) return done(err);
              assert.strictEqual(instance.name, 'hooked');
              done();
            });
        });
      });

      it('validates model after `before save` hook on create', async function() {
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
          TestModel.observe('before save', invalidateTestModel());

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'new name'},
            function(err, instance) {
              assert.ok((err || {}) instanceof ValidationError);
              assert.deepStrictEqual((err.details.codes || {}), {name: ['presence']});
              done();
            });
        });
      });

      it('validates model after `before save` hook on update', async function() {
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
          TestModel.observe('before save', invalidateTestModel());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {id: existingInstance.id, name: 'updated name'},
            function(err, instance) {
              assert.ok((err || {}) instanceof ValidationError);
              assert.deepStrictEqual((err.details.codes || {}), {name: ['presence']});
              done();
            });
        });
      });

      it('triggers `persist` hook on create', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);

              const expectedContext = aCtxForModel(TestModel, {
                data: {id: 'new-id', name: 'a name'},
                currentInstance: {
                  id: 'new-id',
                  name: 'a name',
                  extra: undefined,
                },
              });
              if (dataSource.connector.upsertWithWhere) {
                expectedContext.where = {id: 'new-id'};
              } else {
                expectedContext.isNewInstance = true;
              }

              assert.deepStrictEqual(ctxRecorder.records, expectedContext);
              done();
            });
        });
      });

      it('triggers persist hook on update', async function() {
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
          TestModel.observe('persist', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {id: existingInstance.id, name: 'updated name'},
            function(err, instance) {
              if (err) return done(err);
              const expectedContext = aCtxForModel(TestModel, {
                where: {id: existingInstance.id},
                data: {
                  id: existingInstance.id,
                  name: 'updated name',
                },
                currentInstance: {
                  id: existingInstance.id,
                  name: 'updated name',
                  extra: undefined,
                },
              });
              if (!dataSource.connector.upsertWithWhere) {
                expectedContext.isNewInstance = false;
              }
              assert.deepStrictEqual(ctxRecorder.records, expectedContext);
              done();
            });
        });
      });

      it('triggers `loaded` hook on create', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                data: {id: 'new-id', name: 'a name'},
                isNewInstance: true,
              }));
              done();
            });
        });
      });

      it('triggers `loaded` hook on update', async function() {
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
          TestModel.observe('loaded', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {id: existingInstance.id, name: 'updated name'},
            function(err, instance) {
              if (err) return done(err);
              const expectedContext = aCtxForModel(TestModel, {
                data: {
                  id: existingInstance.id,
                  name: 'updated name',
                },
                isNewInstance: false,
              });
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, expectedContext));
              done();
            });
        });
      });

      it('emits error when `loaded` hook fails', async function() {
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
          TestModel.observe('loaded', nextWithError(expectedError));
          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'a name'},
            function(err, instance) {
              assert.deepStrictEqual([err], [expectedError]);
              done();
            });
        });
      });

      it('triggers `after save` hook on update', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: existingInstance.id},
            {id: existingInstance.id, name: 'updated name'},
            function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                instance: {
                  id: existingInstance.id,
                  name: 'updated name',
                  extra: undefined,
                },
                isNewInstance: false,
              }));
              done();
            });
        });
      });

      it('triggers `after save` hook on create', async function() {
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
          TestModel.observe('after save', ctxRecorder.recordAndNext());

          TestModel.upsertWithWhere({id: 'new-id'},
            {id: 'new-id', name: 'a name'}, function(err, instance) {
              if (err) return done(err);
              assert.deepStrictEqual(ctxRecorder.records, aCtxForModel(TestModel, {
                instance: {
                  id: instance.id,
                  name: 'a name',
                  extra: undefined,
                },
                isNewInstance: true,
              }));
              done();
            });
        });
      });
    });

    function nextWithError(err) {
      return function(context, next) {
        next(err);
      };
    }

    function invalidateTestModel() {
      return function(context, next) {
        if (context.instance) {
          context.instance.name = '';
        } else {
          context.data.name = '';
        }
        next();
      };
    }

    function findTestModels(query, cb) {
      if (cb === undefined && typeof query === 'function') {
        cb = query;
        query = null;
      }

      TestModel.find(query, {notify: false}, cb);
    }

    function loadTestModel(id, cb) {
      TestModel.findOne({where: {id: id}}, {notify: false}, cb);
    }

    function monitorHookExecution(hookNames) {
      hookMonitor.install(TestModel, hookNames);
    }

    require('./operation-hooks.suite')(dataSource, should, connectorCapabilities);
  });

  function get(propertyName) {
    return function(obj) {
      return obj[propertyName];
    };
  }

  function toObject(obj) {
    return obj.toObject ? obj.toObject() : obj;
  }
};
