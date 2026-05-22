// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {before, describe, it} = require('node:test');
const assert = require('node:assert/strict');

const jdb = require('../');
const DataSource = jdb.DataSource;
require('./init.js');

describe('Memory connector with mocked discovery', function() {
  let ds;

  before(function() {
    ds = new DataSource({connector: 'memory'});

    const models = [{type: 'table', name: 'CUSTOMER', owner: 'STRONGLOOP'},
      {type: 'table', name: 'INVENTORY', owner: 'STRONGLOOP'},
      {type: 'table', name: 'LOCATION', owner: 'STRONGLOOP'}];

    ds.discoverModelDefinitions = function(options, cb) {
      process.nextTick(function() {
        cb(null, models);
      });
    };

    const modelProperties = [{
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'PRODUCT_ID',
      dataType: 'varchar',
      dataLength: 20,
      dataPrecision: null,
      dataScale: null,
      nullable: 0,
      generated: true,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'LOCATION_ID',
      dataType: 'varchar',
      dataLength: 20,
      dataPrecision: null,
      dataScale: null,
      nullable: 0,
      generated: false,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'AVAILABLE',
      dataType: 'int',
      dataLength: null,
      dataPrecision: 10,
      dataScale: 0,
      nullable: 1,
      generated: false,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'TOTAL',
      dataType: 'int',
      dataLength: null,
      dataPrecision: 10,
      dataScale: 0,
      nullable: 1,
      generated: false,
    }];

    ds.discoverModelProperties = function(modelName, options, cb) {
      process.nextTick(function() {
        cb(null, modelProperties);
      });
    };
  });

  it('should convert table names to pascal cases and column names to camel case', async function() {
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
      ds.discoverSchemas('INVENTORY', {}, function(err, schemas) {
        if (err) return done(err);
        assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));
        const s = schemas['STRONGLOOP.INVENTORY'];
        assert.deepStrictEqual(s.name, 'Inventory');
        assert.deepStrictEqual(Object.keys(s.properties),
          ['productId', 'locationId', 'available', 'total']);
        done();
      });
    });
  });

  it('should have jsonSchema: {nullable: true} in property for `available`', async function() {
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
      ds.discoverSchemas('INVENTORY', {}, function(err, schemas) {
        if (err) return done(err);
        assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));
        const s = schemas['STRONGLOOP.INVENTORY'];
        assert.deepStrictEqual(s.name, 'Inventory');
        assert.ok(Object.prototype.hasOwnProperty.call(s.properties.available, 'jsonSchema'));
        assert.ok(Object.prototype.hasOwnProperty.call(s.properties.available.jsonSchema, 'nullable'));
        assert.deepStrictEqual(s.properties.available.jsonSchema.nullable, true);
        done();
      });
    });
  });

  it('should keep the column names the same as database', async function() {
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
      ds.discoverSchemas('INVENTORY', {disableCamelCase: true}, function(err, schemas) {
        if (err) return done(err);
        assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));
        const s = schemas['STRONGLOOP.INVENTORY'];
        assert.deepStrictEqual(s.name, 'Inventory');
        assert.deepStrictEqual(Object.keys(s.properties),
          ['PRODUCT_ID', 'LOCATION_ID', 'AVAILABLE', 'TOTAL']);
        done();
      });
    });
  });

  it('should convert table/column names with custom mapper', async function() {
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
      ds.discoverSchemas('INVENTORY', {
        nameMapper: function(type, name) {
        // Convert all names to lower case
          return name.toLowerCase();
        },
      }, function(err, schemas) {
        if (err) return done(err);
        assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));
        const s = schemas['STRONGLOOP.INVENTORY'];
        assert.deepStrictEqual(s.name, 'inventory');
        assert.deepStrictEqual(Object.keys(s.properties),
          ['product_id', 'location_id', 'available', 'total']);
        done();
      });
    });
  });

  it('should not convert table/column names with null custom mapper',
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
        ds.discoverSchemas('INVENTORY', {nameMapper: null}, function(err, schemas) {
          if (err) return done(err);
          assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));
          const s = schemas['STRONGLOOP.INVENTORY'];
          assert.deepStrictEqual(s.name, 'INVENTORY');
          assert.deepStrictEqual(Object.keys(s.properties),
            ['PRODUCT_ID', 'LOCATION_ID', 'AVAILABLE', 'TOTAL']);
          done();
        });
      });
    });

  it('should honor connector\'s discoverSchemas implementation',
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
        const models = {
          inventory: {
            product: {type: 'string'},
            location: {type: 'string'},
          },
        };
        ds.connector.discoverSchemas = function(modelName, options, cb) {
          process.nextTick(function() {
            cb(null, models);
          });
        };
        ds.discoverSchemas('INVENTORY', {nameMapper: null}, function(err, schemas) {
          if (err) return done(err);
          assert.deepStrictEqual(schemas, models);
          done();
        });
      });
    });

  it('should callback function, passed as options parameter',
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
        const models = {
          inventory: {
            product: {type: 'string'},
            location: {type: 'string'},
          },
        };
        ds.connector.discoverSchemas = function(modelName, options, cb) {
          process.nextTick(function() {
            cb(null, models);
          });
        };

        const options = function(err, schemas) {
          if (err) return done(err);
          assert.deepStrictEqual(schemas, models);
          done();
        };

        ds.discoverSchemas('INVENTORY', options);
      });
    });

  it('should discover schemas using `discoverSchemas` - promise variant',
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
        ds.connector.discoverSchemas = null;
        ds.discoverSchemas('INVENTORY', {})
          .then(function(schemas) {
            assert.ok(Object.prototype.hasOwnProperty.call(schemas, 'STRONGLOOP.INVENTORY'));

            const s = schemas['STRONGLOOP.INVENTORY'];
            assert.deepStrictEqual(s.name, 'Inventory');

            assert.deepStrictEqual(Object.keys(s.properties),
              ['productId', 'locationId', 'available', 'total']);
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

  describe('discoverSchema', function() {
    let models;
    let schema;
    before(function() {
      schema = {
        name: 'Inventory',
        options: {
          idInjection: false,
          memory: {schema: 'STRONGLOOP', table: 'INVENTORY'},
        },
        properties: {
          available: {
            length: null,
            jsonSchema: {
              nullable: true,
            },
            memory: {
              columnName: 'AVAILABLE',
              dataLength: null,
              dataPrecision: 10,
              dataScale: 0,
              dataType: 'int',
              nullable: 1,
              generated: false,
            },
            precision: 10,
            required: false,
            scale: 0,
            type: undefined,
            generated: false,
          },
          locationId: {
            length: 20,
            jsonSchema: {
              nullable: false,
            },
            memory: {
              columnName: 'LOCATION_ID',
              dataLength: 20,
              dataPrecision: null,
              dataScale: null,
              dataType: 'varchar',
              nullable: 0,
              generated: false,
            },
            precision: null,
            required: true,
            scale: null,
            type: undefined,
            generated: false,
          },
          productId: {
            length: 20,
            jsonSchema: {
              nullable: false,
            },
            memory: {
              columnName: 'PRODUCT_ID',
              dataLength: 20,
              dataPrecision: null,
              dataScale: null,
              dataType: 'varchar',
              nullable: 0,
              generated: true,
            },
            precision: null,
            required: false,
            scale: null,
            type: undefined,
            generated: true,
          },
          total: {
            length: null,
            jsonSchema: {
              nullable: true,
            },
            memory: {
              columnName: 'TOTAL',
              dataLength: null,
              dataPrecision: 10,
              dataScale: 0,
              dataType: 'int',
              nullable: 1,
              generated: false,
            },
            precision: 10,
            required: false,
            scale: 0,
            type: undefined,
            generated: false,
          },
        },
      };
    });

    it('should discover schema using `discoverSchema`', async function() {
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
        ds.discoverSchema('INVENTORY', {}, function(err, schemas) {
          if (err) return done(err);
          assert.deepStrictEqual(schemas, schema);
          done();
        });
      });
    });

    it('should callback function, passed as options parameter', async function() {
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
        const options = function(err, schemas) {
          if (err) return done(err);
          assert.deepStrictEqual(schemas, schema);
          done();
        };

        ds.discoverSchema('INVENTORY', options);
      });
    });

    it('should discover schema using `discoverSchema` - promise variant', async function() {
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
        ds.discoverSchema('INVENTORY', {})
          .then(function(schemas) {
            assert.deepStrictEqual(schemas, schema);
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });
  });
});

describe('discoverModelDefinitions', function() {
  let ds;
  before(function() {
    ds = new DataSource({connector: 'memory'});

    const models = [{type: 'table', name: 'CUSTOMER', owner: 'STRONGLOOP'},
      {type: 'table', name: 'INVENTORY', owner: 'STRONGLOOP'},
      {type: 'table', name: 'LOCATION', owner: 'STRONGLOOP'}];

    ds.connector.discoverModelDefinitions = function(options, cb) {
      process.nextTick(function() {
        cb(null, models);
      });
    };
  });

  it('should discover model using `discoverModelDefinitions`', async function() {
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
      ds.discoverModelDefinitions({}, function(err, schemas) {
        if (err) return done(err);

        const tableNames = schemas.map(function(s) {
          return s.name;
        });

        assert.deepStrictEqual(tableNames,
          ['CUSTOMER', 'INVENTORY', 'LOCATION']);
        done();
      });
    });
  });

  it('should callback function, passed as options parameter', async function() {
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
      const options = function(err, schemas) {
        if (err) return done(err);

        const tableNames = schemas.map(function(s) {
          return s.name;
        });

        assert.deepStrictEqual(tableNames,
          ['CUSTOMER', 'INVENTORY', 'LOCATION']);
        done();
      };

      ds.discoverModelDefinitions(options);
    });
  });

  it('should discover model using `discoverModelDefinitions` - promise variant', async function() {
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
      ds.discoverModelDefinitions({})
        .then(function(schemas) {
          const tableNames = schemas.map(function(s) {
            return s.name;
          });

          assert.deepStrictEqual(tableNames,
            ['CUSTOMER', 'INVENTORY', 'LOCATION']);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });
  });
});

describe('discoverModelProperties', function() {
  let ds;
  let modelProperties;
  before(function() {
    ds = new DataSource({connector: 'memory'});

    modelProperties = [{
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'PRODUCT_ID',
      dataType: 'varchar',
      dataLength: 20,
      dataPrecision: null,
      dataScale: null,
      nullable: 0,
      generated: false,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'LOCATION_ID',
      dataType: 'varchar',
      dataLength: 20,
      dataPrecision: null,
      dataScale: null,
      nullable: 0,
      generated: false,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'AVAILABLE',
      dataType: 'int',
      dataLength: null,
      dataPrecision: 10,
      dataScale: 0,
      nullable: 1,
    },
    {
      owner: 'STRONGLOOP',
      tableName: 'INVENTORY',
      columnName: 'TOTAL',
      dataType: 'int',
      dataLength: null,
      dataPrecision: 10,
      dataScale: 0,
      nullable: 1,
    }];

    ds.connector.discoverModelProperties = function(modelName, options, cb) {
      process.nextTick(function() {
        cb(null, modelProperties);
      });
    };
  });

  it('should callback function, passed as options parameter', async function() {
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
      const options = function(err, schemas) {
        if (err) return done(err);

        assert.deepStrictEqual(schemas, modelProperties);
        done();
      };

      ds.discoverModelProperties('INVENTORY', options);
    });
  });

  it('should discover model metadata using `discoverModelProperties`', async function() {
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
      ds.discoverModelProperties('INVENTORY', {}, function(err, schemas) {
        if (err) return done(err);

        assert.deepStrictEqual(schemas, modelProperties);
        done();
      });
    });
  });

  it('should discover model metadata using `discoverModelProperties` - promise variant', async function() {
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
      ds.discoverModelProperties('INVENTORY', {})
        .then(function(schemas) {
          assert.deepStrictEqual(schemas, modelProperties);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });
  });
});

describe('discoverPrimaryKeys', function() {
  let ds;
  let modelProperties, primaryKeys;
  before(function() {
    ds = new DataSource({connector: 'memory'});

    primaryKeys = [
      {
        owner: 'STRONGLOOP',
        tableName: 'INVENTORY',
        columnName: 'PRODUCT_ID',
        keySeq: 1,
        pkName: 'ID_PK',
      },
      {
        owner: 'STRONGLOOP',
        tableName: 'INVENTORY',
        columnName: 'LOCATION_ID',
        keySeq: 2,
        pkName: 'ID_PK',
      }];

    ds.connector.discoverPrimaryKeys = function(modelName, options, cb) {
      process.nextTick(function() {
        cb(null, primaryKeys);
      });
    };
  });

  it('should discover primary key definitions using `discoverPrimaryKeys`', async function() {
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
      ds.discoverPrimaryKeys('INVENTORY', {}, function(err, modelPrimaryKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelPrimaryKeys, primaryKeys);
        done();
      });
    });
  });

  it('should callback function, passed as options parameter', async function() {
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
      const options = function(err, modelPrimaryKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelPrimaryKeys, primaryKeys);
        done();
      };
      ds.discoverPrimaryKeys('INVENTORY', options);
    });
  });

  it('should discover primary key definitions using `discoverPrimaryKeys` - promise variant', async function() {
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
      ds.discoverPrimaryKeys('INVENTORY', {})
        .then(function(modelPrimaryKeys) {
          assert.deepStrictEqual(modelPrimaryKeys, primaryKeys);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });
  });
});

describe('discoverForeignKeys', function() {
  let ds;
  let modelProperties, foreignKeys;
  before(function() {
    ds = new DataSource({connector: 'memory'});

    foreignKeys = [{
      fkOwner: 'STRONGLOOP',
      fkName: 'PRODUCT_FK',
      fkTableName: 'INVENTORY',
      fkColumnName: 'PRODUCT_ID',
      keySeq: 1,
      pkOwner: 'STRONGLOOP',
      pkName: 'PRODUCT_PK',
      pkTableName: 'PRODUCT',
      pkColumnName: 'ID',
    }];

    ds.connector.discoverForeignKeys = function(modelName, options, cb) {
      process.nextTick(function() {
        cb(null, foreignKeys);
      });
    };
  });

  it('should discover foreign key definitions using `discoverForeignKeys`', async function() {
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
      ds.discoverForeignKeys('INVENTORY', {}, function(err, modelForeignKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelForeignKeys, foreignKeys);
        done();
      });
    });
  });

  it('should callback function, passed as options parameter', async function() {
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
      const options = function(err, modelForeignKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelForeignKeys, foreignKeys);
        done();
      };

      ds.discoverForeignKeys('INVENTORY', options);
    });
  });

  it('should discover foreign key definitions using `discoverForeignKeys` - promise variant', async function() {
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
      ds.discoverForeignKeys('INVENTORY', {})
        .then(function(modelForeignKeys) {
          assert.deepStrictEqual(modelForeignKeys, foreignKeys);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });
  });
});

describe('discoverExportedForeignKeys', function() {
  let ds;
  let modelProperties, exportedForeignKeys;
  before(function() {
    ds = new DataSource({connector: 'memory'});

    exportedForeignKeys = [{
      fkName: 'PRODUCT_FK',
      fkOwner: 'STRONGLOOP',
      fkTableName: 'INVENTORY',
      fkColumnName: 'PRODUCT_ID',
      keySeq: 1,
      pkName: 'PRODUCT_PK',
      pkOwner: 'STRONGLOOP',
      pkTableName: 'PRODUCT',
      pkColumnName: 'ID',
    }];

    ds.connector.discoverExportedForeignKeys = function(modelName, options, cb) {
      process.nextTick(function() {
        cb(null, exportedForeignKeys);
      });
    };
  });

  it('should discover foreign key definitions using `discoverExportedForeignKeys`', async function() {
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
      ds.discoverExportedForeignKeys('INVENTORY', {}, function(err, modelForeignKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelForeignKeys, exportedForeignKeys);
        done();
      });
    });
  });

  it('should callback function, passed as options parameter', async function() {
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
      const options = function(err, modelForeignKeys) {
        if (err) return done(err);

        assert.deepStrictEqual(modelForeignKeys, exportedForeignKeys);
        done();
      };

      ds.discoverExportedForeignKeys('INVENTORY', options);
    });
  });

  it('should discover foreign key definitions using `discoverExportedForeignKeys` - promise variant',
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
        ds.discoverExportedForeignKeys('INVENTORY', {})
          .then(function(modelForeignKeys) {
            assert.deepStrictEqual(modelForeignKeys, exportedForeignKeys);
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });
});

describe('Mock connector', function() {
  const mockConnectors = require('./mock-connectors');
  describe('customFieldSettings', function() {
    const ds = new DataSource(mockConnectors.customFieldSettings);

    it('should be present in discoverSchemas', async function() {
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
        ds.discoverSchemas('person', function(err, schemas) {
          assert.ok(err == null);
          assert.ok(schemas != null);
          assert.strictEqual(typeof schemas, 'object');
          assert.strictEqual(
            schemas['public.person'].properties.name.custom.storage,
            'quantum',
          );
          done();
        });
      });
    });
  });
});

describe('Default memory connector', function() {
  const nonExistantError = 'Table \'NONEXISTENT\' does not exist.';
  let ds;

  before(function() {
    ds = new DataSource({connector: 'memory'});
  });

  it('discoverSchema should return an error when table does not exist', async function() {
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
      ds.discoverSchema('NONEXISTENT', {}, function(err, schemas) {
        assert.ok(err != null);
        assert.deepStrictEqual(err.message, nonExistantError);
        done();
      });
    });
  });

  it('discoverSchemas should return an error when table does not exist', async function() {
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
      ds.discoverSchemas('NONEXISTENT', {}, function(err, schemas) {
        assert.ok(err != null);
        assert.deepStrictEqual(err.message, nonExistantError);
        done();
      });
    });
  });
});
