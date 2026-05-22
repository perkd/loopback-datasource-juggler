// Copyright IBM Corp. 2016,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const DataSource = require('../lib/datasource.js').DataSource;

describe('DataSource', function() {
  it('clones settings to prevent surprising changes in passed args', () => {
    const config = {connector: 'memory'};

    const ds = new DataSource(config);
    ds.settings.extra = true;

    assert.deepEqual(config, {connector: 'memory'});
  });

  it('reports helpful error when connector init throws', function() {
    const throwingConnector = {
      name: 'loopback-connector-throwing',
      initialize: function(ds, cb) {
        throw new Error('expected test error');
      },
    };

    assert.throws(() => {
      // this is what LoopBack does
      return new DataSource({
        name: 'dsname',
        connector: throwingConnector,
      });
    }, /loopback-connector-throwing/);
  });

  it('reports helpful error when connector init via short name throws', function() {
    assert.throws(() => {
      // this is what LoopBack does
      return new DataSource({
        name: 'dsname',
        connector: 'throwing',
      });
    }, /expected test error/);
  });

  it('reports helpful error when connector init via long name throws', function() {
    assert.throws(() => {
      // this is what LoopBack does
      return new DataSource({
        name: 'dsname',
        connector: 'loopback-connector-throwing',
      });
    }, /expected test error/);
  });

  /**
   * new DataSource(dsName, settings) without settings.name
   */
  it('should retain the name assigned to it', function() {
    const dataSource = new DataSource('myDataSource', {
      connector: 'memory',
    });

    assert.equal(dataSource.name, 'myDataSource');
  });

  /**
   * new DataSource(dsName, settings)
   */
  it('should allow the name assigned to it to take precedence over the settings name', function() {
    const dataSource = new DataSource('myDataSource', {
      name: 'defaultDataSource',
      connector: 'memory',
    });

    assert.equal(dataSource.name, 'myDataSource');
  });

  /**
   * new DataSource(settings) with settings.name
   */
  it('should retain the name from the settings if no name is assigned', function() {
    const dataSource = new DataSource({
      name: 'defaultDataSource',
      connector: 'memory',
    });

    assert.equal(dataSource.name, 'defaultDataSource');
  });

  /**
   * new DataSource(undefined, settings)
   */
  it('should retain the name from the settings if name is undefined', function() {
    const dataSource = new DataSource(undefined, {
      name: 'defaultDataSource',
      connector: 'memory',
    });

    assert.equal(dataSource.name, 'defaultDataSource');
  });

  /**
   * new DataSource(settings) without settings.name
   */
  it('should use the connector name if no name is provided', function() {
    const dataSource = new DataSource({
      connector: 'memory',
    });

    assert.equal(dataSource.name, 'memory');
  });

  /**
   * new DataSource(connectorInstance)
   */
  it('should accept resolved connector', function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        return cb(null);
      },
    };
    const dataSource = new DataSource(mockConnector);

    assert.equal(dataSource.name, 'loopback-connector-mock');
    assert.equal(dataSource.connector, mockConnector);
  });

  /**
   * new DataSource(dsName, connectorInstance)
   */
  it('should accept dsName and resolved connector', function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        return cb(null);
      },
    };
    const dataSource = new DataSource('myDataSource', mockConnector);

    assert.equal(dataSource.name, 'myDataSource');
    assert.equal(dataSource.connector, mockConnector);
  });

  /**
   * new DataSource(connectorInstance, settings)
   */
  it('should accept resolved connector and settings', function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        return cb(null);
      },
    };
    const dataSource = new DataSource(mockConnector, {name: 'myDataSource'});

    assert.equal(dataSource.name, 'myDataSource');
    assert.equal(dataSource.connector, mockConnector);
  });

  it('should set states correctly with eager connect', async function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        this.connect(cb);
      },

      connect: function(cb) {
        process.nextTick(function() {
          cb(null);
        });
      },
    };
    const dataSource = new DataSource(mockConnector);
    // DataSource is instantiated
    // connected: false, connecting: false, initialized: false
    assert.equal(dataSource.connected, false);
    assert.equal(dataSource.connecting, false);
    assert.equal(dataSource.initialized, false);

    let initializedState;
    let connectedState;
    const initialized = onceEvent(dataSource, 'initialized', () => {
      initializedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
        initialized: dataSource.initialized,
      };
    });

    const connected = onceEvent(dataSource, 'connected', () => {
      connectedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
      };
    });

    // Call connect() in next tick so that we'll receive initialized event
    // first
    await nextTick();
    // At this point, the datasource is already connected by
    // connector's (mockConnector) initialize function
    const connectPromise = connectDataSource(dataSource);
    // As the datasource is already connected, no connecting will happen
    // connected: true, connecting: false
    assert.equal(dataSource.connected, true);
    assert.equal(dataSource.connecting, false);
    await connectPromise;
    // DataSource is now connected
    // connected: true, connecting: false
    assert.equal(dataSource.connected, true);
    assert.equal(dataSource.connecting, false);
    await Promise.all([initialized, connected]);
    assert.deepEqual(initializedState, {
      connected: false,
      connecting: false,
      initialized: true,
    });
    assert.deepEqual(connectedState, {
      connected: true,
      connecting: false,
    });
  });

  it('should set states correctly with deferred connect', async function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        // Explicitly call back with false to denote connection is not ready
        process.nextTick(function() {
          cb(null, false);
        });
      },

      connect: function(cb) {
        process.nextTick(function() {
          cb(null);
        });
      },
    };
    const dataSource = new DataSource(mockConnector);
    // DataSource is instantiated
    // connected: false, connecting: false, initialized: false
    assert.equal(dataSource.connected, false);
    assert.equal(dataSource.connecting, false);
    assert.equal(dataSource.initialized, false);

    let initializedState;
    let connectedState;
    const initialized = onceEvent(dataSource, 'initialized', () => {
      initializedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
        initialized: dataSource.initialized,
      };
    });

    const connected = onceEvent(dataSource, 'connected', () => {
      connectedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
      };
    });

    // Call connect() in next tick so that we'll receive initialized event
    // first
    await nextTick();
    const connectPromise = connectDataSource(dataSource);
    // As the datasource is not connected, connecting will happen
    // connected: false, connecting: true
    assert.equal(dataSource.connected, false);
    assert.equal(dataSource.connecting, true);
    await connectPromise;
    // DataSource is now connected
    // connected: true, connecting: false
    assert.equal(dataSource.connected, true);
    assert.equal(dataSource.connecting, false);
    await Promise.all([initialized, connected]);
    assert.deepEqual(initializedState, {
      connected: false,
      connecting: false,
      initialized: true,
    });
    assert.deepEqual(connectedState, {
      connected: true,
      connecting: false,
    });
  });

  it('should set states correctly with lazyConnect = true', async function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        process.nextTick(function() {
          cb(null);
        });
      },

      connect: function(cb) {
        process.nextTick(function() {
          cb(null);
        });
      },
    };
    const dataSource = new DataSource(mockConnector, {lazyConnect: true});
    // DataSource is instantiated
    // connected: false, connecting: false, initialized: false
    assert.equal(dataSource.connected, false);
    assert.equal(dataSource.connecting, false);
    assert.equal(dataSource.initialized, false);

    let initializedState;
    let connectedState;
    const initialized = onceEvent(dataSource, 'initialized', () => {
      initializedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
        initialized: dataSource.initialized,
      };
    });

    const connected = onceEvent(dataSource, 'connected', () => {
      connectedState = {
        connected: dataSource.connected,
        connecting: dataSource.connecting,
      };
    });

    // Call connect() in next tick so that we'll receive initialized event
    // first
    await nextTick();
    const connectPromise = connectDataSource(dataSource);
    // DataSource is now connecting
    // connected: false, connecting: true
    assert.equal(dataSource.connected, false);
    assert.equal(dataSource.connecting, true);
    await connectPromise;
    // DataSource is now connected
    // connected: true, connecting: false
    assert.equal(dataSource.connected, true);
    assert.equal(dataSource.connecting, false);
    await Promise.all([initialized, connected]);
    assert.deepEqual(initializedState, {
      connected: false,
      connecting: false,
      initialized: true,
    });
    assert.deepEqual(connectedState, {
      connected: true,
      connecting: false,
    });
  });

  it('provides stop() API calling disconnect', async function() {
    const mockConnector = {
      name: 'loopback-connector-mock',
      initialize: function(ds, cb) {
        ds.connector = mockConnector;
        process.nextTick(function() {
          cb(null);
        });
      },
    };

    const dataSource = new DataSource(mockConnector);
    await onceEvent(dataSource, 'connected');
    // DataSource is now connected
    // connected: true, connecting: false
    assert.equal(dataSource.connected, true);
    assert.equal(dataSource.connecting, false);

    await stopDataSource(dataSource);
    assert.equal(dataSource.connected, false);
  });

  describe('deleteModelByName()', () => {
    it('removes the model from ModelBuilder registry', () => {
      const ds = new DataSource('ds', {connector: 'memory'});

      ds.createModel('TestModel');
      assert.ok(Object.keys(ds.modelBuilder.models).includes('TestModel'));
      assert.ok(Object.keys(ds.modelBuilder.definitions).includes('TestModel'));

      ds.deleteModelByName('TestModel');

      assert.equal(Object.keys(ds.modelBuilder.models).includes('TestModel'), false);
      assert.equal(Object.keys(ds.modelBuilder.definitions).includes('TestModel'), false);
    });

    it('removes the model from connector registry', () => {
      const ds = new DataSource('ds', {connector: 'memory'});

      ds.createModel('TestModel');
      assert.ok(Object.keys(ds.connector._models).includes('TestModel'));

      ds.deleteModelByName('TestModel');

      assert.equal(Object.keys(ds.connector._models).includes('TestModel'), false);
    });
  });

  describe('execute', () => {
    let ds;
    beforeEach(() => ds = new DataSource('ds', {connector: 'memory'}));

    it('calls connnector to execute the command', async () => {
      let called = 'not called';
      ds.connector.execute = function(command, args, options, callback) {
        called = {command, args, options};
        callback(null, 'a-result');
      };

      const result = await ds.execute(
        'command',
        ['arg1', 'arg2'],
        {'a-flag': 'a-value'},
      );

      assert.equal(result, 'a-result');
      assert.deepEqual(called, {
        command: 'command',
        args: ['arg1', 'arg2'],
        options: {'a-flag': 'a-value'},
      });
    });

    it('supports shorthand version (cmd)', async () => {
      let called = 'not called';
      ds.connector.execute = function(command, args, options, callback) {
        // copied from loopback-connector/lib/sql.js
        if (typeof args === 'function' && options === undefined && callback === undefined) {
          // execute(sql, callback)
          options = {};
          callback = args;
          args = [];
        }

        called = {command, args, options};
        callback(null, 'a-result');
      };

      const result = await ds.execute('command');
      assert.equal(result, 'a-result');
      assert.deepEqual(called, {
        command: 'command',
        args: [],
        options: {},
      });
    });

    it('supports shorthand version (cmd, args)', async () => {
      let called = 'not called';
      ds.connector.execute = function(command, args, options, callback) {
        // copied from loopback-connector/lib/sql.js
        if (typeof options === 'function' && callback === undefined) {
          // execute(sql, params, callback)
          callback = options;
          options = {};
        }

        called = {command, args, options};
        callback(null, 'a-result');
      };

      await ds.execute('command', ['arg1', 'arg2']);
      assert.deepEqual(called, {
        command: 'command',
        args: ['arg1', 'arg2'],
        options: {},
      });
    });

    it('converts multiple callbacks arguments into a promise resolved with an array', async () => {
      ds.connector.execute = function() {
        const callback = arguments[arguments.length - 1];
        callback(null, 'result1', 'result2');
      };
      const result = await ds.execute('command');
      assert.deepEqual(result, ['result1', 'result2']);
    });

    it('allows args as object', async () => {
      let called = 'not called';
      ds.connector.execute = function(command, args, options, callback) {
        called = {command, args, options};
        callback();
      };

      // See https://www.npmjs.com/package/loopback-connector-neo4j-graph
      const command = 'MATCH (u:User {email: {email}}) RETURN u';
      await ds.execute(command, {email: 'alice@example.com'}, {options: true});
      assert.deepEqual(called, {
        command,
        args: {email: 'alice@example.com'},
        options: {options: true},
      });
    });

    it('supports MongoDB version (collection, cmd, args, options)', async () => {
      let called = 'not called';
      ds.connector.execute = function(...params) {
        const callback = params.pop();
        called = params;
        callback(null, 'a-result');
      };

      const result = await ds.execute(
        'collection',
        'command',
        ['arg1', 'arg2'],
        {options: true},
      );

      assert.equal(result, 'a-result');
      assert.deepEqual(called, [
        'collection',
        'command',
        ['arg1', 'arg2'],
        {options: true},
      ]);
    });

    it('supports free-form version (...params)', async () => {
      let called = 'not called';
      ds.connector.execute = function(...params) {
        const callback = params.pop();
        called = params;
        callback(null, 'a-result');
      };

      const result = await ds.execute(
        'arg1',
        'arg2',
        'arg3',
        'arg4',
        {options: true},
      );

      assert.equal(result, 'a-result');
      assert.deepEqual(called, [
        'arg1',
        'arg2',
        'arg3',
        'arg4',
        {options: true},
      ]);
    });

    it('throws NOT_IMPLEMENTED when no connector is provided', () => {
      ds.connector = undefined;
      return assert.rejects(ds.execute('command'), {
        code: 'NOT_IMPLEMENTED',
      });
    });

    it('throws NOT_IMPLEMENTED for connectors not implementing execute', () => {
      ds.connector.execute = undefined;
      return assert.rejects(ds.execute('command'), {
        code: 'NOT_IMPLEMENTED',
      });
    });
  });

  describe('automigrate', () => {
    it('reports connection errors (immediate connect)', async () => {
      const dataSource = new DataSource({
        connector: givenConnectorFailingOnConnect(),
      });
      dataSource.define('MyModel');
      await assert.rejects(dataSource.automigrate(), /test failure/);
    });

    it('reports connection errors (lazy connect)', () => {
      const dataSource = new DataSource({
        connector: givenConnectorFailingOnConnect(),
        lazyConnect: true,
      });
      dataSource.define('MyModel');
      return assert.rejects(dataSource.automigrate(), /test failure/);
    });

    function givenConnectorFailingOnConnect() {
      return givenMockConnector({
        connect: function(cb) {
          process.nextTick(() => cb(new Error('test failure')));
        },
        automigrate: function(models, cb) {
          cb(new Error('automigrate should not have been called'));
        },
      });
    }
  });

  describe('autoupdate', () => {
    it('reports connection errors (immediate connect)', async () => {
      const dataSource = new DataSource({
        connector: givenConnectorFailingOnConnect(),
      });
      dataSource.define('MyModel');
      await assert.rejects(dataSource.autoupdate(), /test failure/);
    });

    it('reports connection errors (lazy connect)', () => {
      const dataSource = new DataSource({
        connector: givenConnectorFailingOnConnect(),
        lazyConnect: true,
      });
      dataSource.define('MyModel');
      return assert.rejects(dataSource.autoupdate(), /test failure/);
    });

    function givenConnectorFailingOnConnect() {
      return givenMockConnector({
        connect: function(cb) {
          process.nextTick(() => cb(new Error('test failure')));
        },
        autoupdate: function(models, cb) {
          cb(new Error('autoupdate should not have been called'));
        },
      });
    }
  });

  describe('deleteAllModels', () => {
    it('removes all model definitions', () => {
      const ds = new DataSource({connector: 'memory'});
      ds.define('Category');
      ds.define('Product');

      assert.deepEqual(Object.keys(ds.modelBuilder.definitions), ['Category', 'Product']);
      assert.deepEqual(Object.keys(ds.modelBuilder.models), ['Category', 'Product']);
      assert.deepEqual(Object.keys(ds.connector._models), ['Category', 'Product']);

      ds.deleteAllModels();

      assert.deepEqual(Object.keys(ds.modelBuilder.definitions), []);
      assert.deepEqual(Object.keys(ds.modelBuilder.models), []);
      assert.deepEqual(Object.keys(ds.connector._models), []);
    });

    it('preserves the connector instance', () => {
      const ds = new DataSource({connector: 'memory'});
      const connector = ds.connector;
      ds.deleteAllModels();
      assert.equal(ds.connector, connector);
    });
  });

  describe('connector detachment safeguards', () => {
    it('fails fast when the connector back-reference is cleared', async () => {
      const {ds, Model} = givenQueryableModel();
      await ds.connect();

      ds.connector.dataSource = null;

      await assert.rejects(Model.find(), {
        code: 'CONNECTOR_DETACHED',
      });
    });

    it('fails fast when the connector back-reference is undefined', async () => {
      const {ds, Model} = givenQueryableModel();
      await ds.connect();

      ds.connector.dataSource = undefined;

      await assert.rejects(Model.find(), {
        code: 'CONNECTOR_DETACHED',
      });
    });

    it('fails fast when the model datasource is cleared', async function() {
      const {Model} = givenQueryableModel();
      Model.dataSource = null;

      await assert.rejects(Model.find(), {
        code: 'CONNECTOR_DETACHED',
      });
    });

    it('reports a descriptive error from getConnector when detached', function() {
      const {Model} = givenQueryableModel();
      Model.dataSource = null;

      assert.throws(() => {
        return Model.getConnector();
      }, {
        code: 'CONNECTOR_DETACHED',
      });
    });

    it('rejects stale model reuse after datasource teardown', async () => {
      const state = {allCalls: 0, disconnectCalls: 0};
      const {ds, Model} = givenQueryableModel({
        disconnect: function(cb) {
          state.disconnectCalls++;
          process.nextTick(() => cb(null));
        },
        all: function(model, filter, options, cb) {
          state.allCalls++;
          process.nextTick(() => cb(null, []));
        },
      });
      const staleModel = Model;

      await ds.connect();
      await ds.disconnect();
      assert.equal(ds.connected, false);

      // Simulate tenant teardown severing the connector back-reference while
      // shared model code still holds on to the old model class.
      ds.connector.dataSource = null;

      await assert.rejects(staleModel.find(), {
        code: 'CONNECTOR_DETACHED',
      });
      assert.equal(state.disconnectCalls, 1);
      assert.equal(state.allCalls, 0);
    });

    it('keeps healthy connector wiring working for find', async () => {
      const {Model} = givenQueryableModel();

      assert.deepEqual(await Model.find(), []);
    });
  });

  describe('getMaxOfflineRequests', () => {
    let ds;
    beforeEach(() => ds = new DataSource('ds', {connector: 'memory'}));

    it('sets the default maximum number of event listeners to 16', () => {
      assert.equal(ds.getMaxOfflineRequests(), 16);
    });

    it('uses provided number of listeners', () => {
      ds.settings.maxOfflineRequests = 17;
      assert.equal(ds.getMaxOfflineRequests(), 17);
    });

    it('throws an error if a non-number is provided for the max number of listeners', () => {
      ds.settings.maxOfflineRequests = '17';

      assert.throws(() => {
        return ds.getMaxOfflineRequests();
      }, /maxOfflineRequests must be a number/);
    });
  });
});

function onceEvent(emitter, eventName, onEvent) {
  return new Promise(resolve => emitter.once(eventName, (...args) => {
    if (onEvent) onEvent(...args);
    resolve(args);
  }));
}

function nextTick() {
  return new Promise(resolve => process.nextTick(resolve));
}

function connectDataSource(dataSource) {
  return new Promise((resolve, reject) => {
    dataSource.connect(err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function stopDataSource(dataSource) {
  return new Promise((resolve, reject) => {
    dataSource.stop(err => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function givenMockConnector(props) {
  const connector = {
    name: 'loopback-connector-mock',
    initialize: function(ds, cb) {
      ds.connector = connector;
      if (ds.settings.lazyConnect) {
        cb(null, false);
      } else {
        connector.connect(cb);
      }
    },
    ...props,
  };
  return connector;
}

function givenQueryableModel(connectorProps) {
  const ds = new DataSource({
    connector: givenMockConnector({
      connect: function(cb) {
        process.nextTick(() => cb(null));
      },
      all: function(model, filter, options, cb) {
        process.nextTick(() => cb(null, []));
      },
      ...connectorProps,
    }),
  });

  return {
    ds: ds,
    Model: ds.define('AttachedModel', {name: String}),
  };
}
