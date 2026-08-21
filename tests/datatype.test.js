// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test written in mocha+should.js
'use strict';
const {describe, it, before, beforeEach, after, afterEach} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false */
require('./init.js');

let db, Model, modelWithDecimalArray, dateArrayModel, numArrayModel;

class NestedClass {
  constructor(roleName) {
    this.roleName = roleName;
  }
}

describe('datatypes', function() {
  before(async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);

        return resolve();
      };

      db = getSchema();
      const Nested = db.define('Nested', {});
      const modelTableSchema = {
        str: String,
        date: Date,
        num: Number,
        bool: Boolean,
        list: {type: [String]},
        arr: Array,
        nested: Nested,
        nestedClass: NestedClass,
      };
      Model = db.define('Model', modelTableSchema);
      // 'modelWithDecimalArray' is too long an identifier name for Oracle DB
      modelWithDecimalArray = db.define('modelWithDecArr', {
        randomReview: {
          type: [String],
          mongodb: {
            dataType: 'Decimal128',
          },
        },
      });
      dateArrayModel = db.define('dateArrayModel', {
        bunchOfDates: [Date],
        bunchOfOtherDates: {
          type: [Date],
        },
      });
      numArrayModel = db.define('numArrayModel', {
        bunchOfNums: [Number],
      });
      db.automigrate(['Model', 'modelWithDecArr', 'dateArrayModel', 'numArrayModel'], done);
    });
  });

  it('should resolve top-level "type" property correctly', function() {
    const Account = db.define('Account', {
      type: String,
      id: String,
    });
    assert.strictEqual(Account.definition.properties.type.type, String);
  });

  it('should resolve "type" sub-property correctly', function() {
    const Account = db.define('Account', {
      item: {type: {
        itemname: {type: String},
        type: {type: String},
      }},
    });
    assert.notStrictEqual(Account.definition.properties.item.type, String);
  });
  it('should resolve array prop with connector specific metadata', function() {
    const props = modelWithDecimalArray.definition.properties;
    assert.deepStrictEqual(props.randomReview.type, Array(String));
    assert.deepStrictEqual(props.randomReview.mongodb, {dataType: 'Decimal128'});
  });

  it('should coerce array of dates from string', async () => {
    const dateVal = new Date('2019-02-21T12:00:00').toISOString();
    const created = await dateArrayModel.create({
      bunchOfDates: [dateVal,
        dateVal,
        dateVal],
      bunchOfOtherDates: [dateVal,
        dateVal,
        dateVal],
    });
    assert.ok(created.bunchOfDates[0] instanceof Date);
    assert.deepStrictEqual(created.bunchOfDates[0], new Date(dateVal));
    assert.ok(created.bunchOfOtherDates[0] instanceof Date);
    assert.deepStrictEqual(created.bunchOfOtherDates[0], new Date(dateVal));
  });

  it('should coerce array of numbers from string', async () => {
    const created = await numArrayModel.create({
      bunchOfNums: ['1',
        '2',
        '3'],
    });
    assert.strictEqual(typeof created.bunchOfNums[0], 'number');
    assert.strictEqual(created.bunchOfNums[0], 1);
  });

  it('should return 400 when property of type array is set to string value',
    async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        const myModel = db.define('myModel', {
          list: {type: ['object']},
        });

        myModel.create({list: 'This string will crash the server'}, function(err) {
          assert.strictEqual((err.statusCode), 400);
          done();
        });
      });
    });

  it('should return 400 when property of type array is set to object value',
    async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        const myModel = db.define('myModel', {
          list: {type: ['object']},
        });

        myModel.create({list: {key: 'This string will crash the server'}}, function(err) {
          assert.strictEqual((err.statusCode), 400);
          done();
        });
      });
    });

  it('should keep types when get read data from db', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);

        return resolve();
      };

      const d = new Date('2015-01-01T12:00:00');
      let id;

      Model.create({
        str: 'hello', date: d, num: '3', bool: 1, list: ['test'], arr: [1, 'str'],
      }, function(err, m) {
        assert.ok(err == null);
        assert.ok((m && m.id) != null);
        assert.strictEqual(typeof m.str, 'string');
        assert.strictEqual(typeof m.num, 'number');
        assert.strictEqual(typeof m.bool, 'boolean');
        assert.strictEqual(m.list[0], 'test');
        assert.strictEqual(m.arr[0], 1);
        assert.strictEqual(m.arr[1], 'str');
        id = m.id;
        testFind(testAll);
      });

      function testFind(next) {
        Model.findById(id, function(err, m) {
          assert.ok(err == null);
          assert.ok(m != null);
          assert.strictEqual(typeof m.str, 'string');
          assert.strictEqual(typeof m.num, 'number');
          assert.strictEqual(typeof m.bool, 'boolean');
          assert.strictEqual(m.list[0], 'test');
          assert.strictEqual(m.arr[0], 1);
          assert.strictEqual(m.arr[1], 'str');
          assert.ok(m.date instanceof Date);
          assert.strictEqual(m.date.toString(), d.toString(), 'Time must match');
          next();
        });
      }

      function testAll() {
        Model.findOne(function(err, m) {
          assert.ok(err == null);
          assert.ok(m != null);
          assert.strictEqual(typeof m.str, 'string');
          assert.strictEqual(typeof m.num, 'number');
          assert.strictEqual(typeof m.bool, 'boolean');
          assert.ok(m.date instanceof Date);
          assert.strictEqual(m.date.toString(), d.toString(), 'Time must match');
          done();
        });
      }
    });
  });

  it('should create nested object defined by a class when reading data from db', async () => {
    const d = new Date('2015-01-01T12:00:00');
    let id;
    const created = await Model.create({
      date: d,
      list: ['test'],
      arr: [1, 'str'],
      nestedClass: new NestedClass('admin'),
    });
    assert.deepStrictEqual(created.list.toJSON(), ['test']);
    assert.deepStrictEqual(created.arr.toJSON(), [1, 'str']);
    assert.ok(created.date instanceof Date);
    assert.strictEqual(created.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created.nestedClass, 'roleName')); assert.strictEqual(created.nestedClass.roleName, 'admin');

    const found = await Model.findById(created.id);
    assert.ok(found != null);
    assert.deepStrictEqual(found.list.toJSON(), ['test']);
    assert.deepStrictEqual(found.arr.toJSON(), [1, 'str']);
    assert.ok(found.date instanceof Date);
    assert.strictEqual(found.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found.nestedClass, 'roleName')); assert.strictEqual(found.nestedClass.roleName, 'admin');
  });

  it('should create nested object defined by a class using createAll', async () => {
    const d = new Date('2015-01-01T12:00:00');
    let id;
    const [created] = await Model.createAll([
      {
        date: d,
        list: ['test'],
        arr: [1, 'str'],
        nestedClass: new NestedClass('admin'),
      },
    ]);
    assert.deepStrictEqual(created.list.toJSON(), ['test']);
    assert.deepStrictEqual(created.arr.toJSON(), [1, 'str']);
    assert.ok(created.date instanceof Date);
    assert.strictEqual(created.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created.nestedClass, 'roleName')); assert.strictEqual(created.nestedClass.roleName, 'admin');

    const found = await Model.findById(created.id);
    assert.ok(found != null);
    assert.deepStrictEqual(found.list.toJSON(), ['test']);
    assert.deepStrictEqual(found.arr.toJSON(), [1, 'str']);
    assert.ok(found.date instanceof Date);
    assert.strictEqual(found.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found.nestedClass, 'roleName')); assert.strictEqual(found.nestedClass.roleName, 'admin');
  });

  it('should create nested objects defined by a class using multiple createAll calls', async () => {
    const d = new Date('2015-01-01T12:00:00');
    const result = await Promise.all([
      Model.createAll([
        {
          date: d,
          list: ['test 1'],
          arr: [1, 'str 1'],
          nestedClass: new NestedClass('admin 1'),
        },
      ]),
      Model.createAll([
        {
          date: d,
          list: ['test 2'],
          arr: [2, 'str 2'],
          nestedClass: new NestedClass('admin 2'),
        },
        {
          date: d,
          list: ['test 3'],
          arr: [3, 'str 3'],
          nestedClass: new NestedClass('admin 3'),
        },
      ]),
      Model.createAll([
        {
          date: d,
          list: ['test 4'],
          arr: [4, 'str 4'],
          nestedClass: new NestedClass('admin 4'),
        },
      ]),
      Model.createAll([
        {
          date: d,
          list: ['test 6'],
          arr: [6, 'str 6'],
          nestedClass: new NestedClass('admin 6'),
        },
      ]),
      Model.createAll([
        {
          date: d,
          list: ['test 5'],
          arr: [5, 'str 5'],
          nestedClass: new NestedClass('admin 5'),
        },
      ]),
    ]);
    const [created1] = result[0];
    const [created2, created3] = result[1];
    const [created4] = result[2];
    const [created6] = result[3];
    const [created5] = result[4];
    assert.deepStrictEqual(await created1.list.toJSON(), ['test 1']);
    assert.deepStrictEqual(created1.arr.toJSON(), [1, 'str 1']);
    assert.ok(created1.date instanceof Date);
    assert.strictEqual(created1.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created1.nestedClass, 'roleName')); assert.strictEqual(created1.nestedClass.roleName, 'admin 1');
    assert.deepStrictEqual(await created2.list.toJSON(), ['test 2']);
    assert.deepStrictEqual(created2.arr.toJSON(), [2, 'str 2']);
    assert.ok(created2.date instanceof Date);
    assert.strictEqual(created2.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created2.nestedClass, 'roleName')); assert.strictEqual(created2.nestedClass.roleName, 'admin 2');
    assert.deepStrictEqual(await created3.list.toJSON(), ['test 3']);
    assert.deepStrictEqual(created3.arr.toJSON(), [3, 'str 3']);
    assert.ok(created3.date instanceof Date);
    assert.strictEqual(created3.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created3.nestedClass, 'roleName')); assert.strictEqual(created3.nestedClass.roleName, 'admin 3');
    assert.deepStrictEqual(await created4.list.toJSON(), ['test 4']);
    assert.deepStrictEqual(created4.arr.toJSON(), [4, 'str 4']);
    assert.ok(created4.date instanceof Date);
    assert.strictEqual(created4.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created4.nestedClass, 'roleName')); assert.strictEqual(created4.nestedClass.roleName, 'admin 4');
    assert.deepStrictEqual(await created5.list.toJSON(), ['test 5']);
    assert.deepStrictEqual(created5.arr.toJSON(), [5, 'str 5']);
    assert.ok(created5.date instanceof Date);
    assert.strictEqual(created5.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created5.nestedClass, 'roleName')); assert.strictEqual(created5.nestedClass.roleName, 'admin 5');
    assert.deepStrictEqual(await created6.list.toJSON(), ['test 6']);
    assert.deepStrictEqual(created6.arr.toJSON(), [6, 'str 6']);
    assert.ok(created6.date instanceof Date);
    assert.strictEqual(created6.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(created6.nestedClass, 'roleName')); assert.strictEqual(created6.nestedClass.roleName, 'admin 6');

    const found1 = await Model.findById(created1.id);
    assert.ok(found1 != null);
    assert.deepStrictEqual(found1.list.toJSON(), ['test 1']);
    assert.deepStrictEqual(found1.arr.toJSON(), [1, 'str 1']);
    assert.ok(found1.date instanceof Date);
    assert.strictEqual(found1.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found1.nestedClass, 'roleName')); assert.strictEqual(found1.nestedClass.roleName, 'admin 1');

    const found2 = await Model.findById(created2.id);
    assert.ok(found2 != null);
    assert.deepStrictEqual(found2.list.toJSON(), ['test 2']);
    assert.deepStrictEqual(found2.arr.toJSON(), [2, 'str 2']);
    assert.ok(found2.date instanceof Date);
    assert.strictEqual(found2.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found2.nestedClass, 'roleName')); assert.strictEqual(found2.nestedClass.roleName, 'admin 2');

    const found3 = await Model.findById(created3.id);
    assert.ok(found3 != null);
    assert.deepStrictEqual(found3.list.toJSON(), ['test 3']);
    assert.deepStrictEqual(found3.arr.toJSON(), [3, 'str 3']);
    assert.ok(found3.date instanceof Date);
    assert.strictEqual(found3.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found3.nestedClass, 'roleName')); assert.strictEqual(found3.nestedClass.roleName, 'admin 3');

    const found4 = await Model.findById(created4.id);
    assert.ok(found4 != null);
    assert.deepStrictEqual(found4.list.toJSON(), ['test 4']);
    assert.deepStrictEqual(found4.arr.toJSON(), [4, 'str 4']);
    assert.ok(found4.date instanceof Date);
    assert.strictEqual(found4.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found4.nestedClass, 'roleName')); assert.strictEqual(found4.nestedClass.roleName, 'admin 4');

    const found5 = await Model.findById(created5.id);
    assert.ok(found5 != null);
    assert.deepStrictEqual(found5.list.toJSON(), ['test 5']);
    assert.deepStrictEqual(found5.arr.toJSON(), [5, 'str 5']);
    assert.ok(found5.date instanceof Date);
    assert.strictEqual(found5.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found5.nestedClass, 'roleName')); assert.strictEqual(found5.nestedClass.roleName, 'admin 5');

    const found6 = await Model.findById(created6.id);
    assert.ok(found6 != null);
    assert.deepStrictEqual(found6.list.toJSON(), ['test 6']);
    assert.deepStrictEqual(found6.arr.toJSON(), [6, 'str 6']);
    assert.ok(found6.date instanceof Date);
    assert.strictEqual(found6.date.toString(), d.toString(), 'Time must match');
    assert.ok(Object.prototype.hasOwnProperty.call(found6.nestedClass, 'roleName')); assert.strictEqual(found6.nestedClass.roleName, 'admin 6');
  });

  it('should respect data types when updating attributes', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);

        return resolve();
      };

      const d = new Date;
      let id;

      Model.create({
        str: 'hello', date: d, num: '3', bool: 1}, function(err, m) {
        assert.ok(err == null);
        assert.ok((m && m.id) != null);

        // sanity check initial types
        assert.strictEqual(typeof m.str, 'string');
        assert.strictEqual(typeof m.num, 'number');
        assert.strictEqual(typeof m.bool, 'boolean');
        id = m.id;
        (async function() {
          await testDataInDB();
          await testUpdate();
          await testDataInDB();
          done();
        })().catch(done);
      });

      async function testUpdate() {
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
          Model.findById(id, function(err, m) {
            assert.ok(err == null);
            // update using updateAttributes
            m.updateAttributes({
              id: m.id, num: 10,
            }, function(err, m) {
              assert.ok(err == null);
              assert.strictEqual(typeof m.num, 'number');
              done();
            });
          });
        });
      }

      async function testDataInDB() {
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
          // verify that the value stored in the db is still an object
          function cb(err, data) {
            assert.ok(data != null);
            assert.strictEqual(typeof data.num, 'number');
            done();
          }

          if (db.connector.find.length === 4) {
            db.connector.find(Model.modelName, id, {}, cb);
          } else {
            db.connector.find(Model.modelName, id, cb);
          }
        });
      }
    });
  });

  it('should not coerce nested objects into ModelConstructor types', function() {
    const coerced = Model._coerce({nested: {foo: 'bar'}});
    assert.strictEqual(coerced.nested.constructor.name, 'Object');
  });

  it('rejects array value converted to NaN for a required property',
    async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        db = getSchema();
        Model = db.define('RequiredNumber', {
          num: {type: Number, required: true},
        });
        db.automigrate(['Model'], function() {
          Model.create({num: [1, 2, 3]}, function(err, inst) {
            assert.ok(err != null);
            assert.ok(Object.prototype.hasOwnProperty.call(err, 'name'));
            assert.equal(err['name'], 'ValidationError');
            done();
          });
        });
      });
    });

  it('handles null data', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);

        return resolve();
      };

      db = getSchema();
      Model = db.define('HandleNullModel', {
        data: {type: 'string'},
      });
      db.automigrate(['HandleNullModel'], function() {
        const a = new Model(null);
        done();
      });
    });
  });

  describe('model option persistUndefinedAsNull', function() {
    let TestModel, isStrict;
    before(async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        db = getSchema();
        TestModel = db.define(
          'TestModel',
          {
            name: {type: String, required: false},
            desc: {type: String, required: false},
            stars: {type: Number, required: false},
          },
          {
            persistUndefinedAsNull: true,
          },
        );

        isStrict = TestModel.definition.settings.strict;

        db.automigrate(['TestModel'], done);
      });
    });

    it('should set missing optional properties to null', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        const EXPECTED = {desc: null, stars: null};
        TestModel.create({name: 'a-test-name'}, function(err, created) {
          if (err) return done(err);
          assert.partialDeepStrictEqual(created.toObject(), EXPECTED);

          TestModel.findById(created.id, function(err, found) {
            if (err) return done(err);
            assert.partialDeepStrictEqual(found.toObject(), EXPECTED);
            done();
          });
        });
      });
    });

    it('should convert property value undefined to null', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        const EXPECTED = {desc: null, extra: null};
        const data = {desc: undefined, extra: undefined};
        if (isStrict) {
          // SQL-based connectors don't support dynamic properties
          delete EXPECTED.extra;
          delete data.extra;
        }
        TestModel.create(data, function(err, created) {
          if (err) return done(err);

          assert.partialDeepStrictEqual(created.toObject(), EXPECTED);

          TestModel.findById(created.id, function(err, found) {
            if (err) return done(err);
            assert.partialDeepStrictEqual(found.toObject(), EXPECTED);
            done();
          });
        });
      });
    });

    it('should convert undefined to null in the setter', function() {
      const inst = new TestModel();
      inst.desc = undefined;
      assert.strictEqual(inst.desc, null);
      assert.strictEqual(inst.toObject().desc, null);
    });

    it('should use null in unsetAttribute()', function() {
      const inst = new TestModel();
      inst.unsetAttribute('stars');
      assert.strictEqual(inst.stars, null);
      assert.strictEqual(inst.toObject().stars, null);
    });

    it('should convert undefined to null on save', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);

          return resolve();
        };

        const EXPECTED = {desc: null, stars: null, extra: null, dx: null};
        if (isStrict) {
          // SQL-based connectors don't support dynamic properties
          delete EXPECTED.extra;
          delete EXPECTED.dx;
        }

        TestModel.create({}, function(err, created) {
          if (err) return done(err);
          created.desc = undefined; // Note: this is may be a no-op
          created.unsetAttribute('stars');
          created.extra = undefined;
          created.__data.dx = undefined;

          created.save(function(err, saved) {
            if (err) return done(err);

            assert.partialDeepStrictEqual(created.toObject(), EXPECTED);
            assert.partialDeepStrictEqual(saved.toObject(), EXPECTED);

            function cb(err, found) {
              if (err) return done(err);
              assert.ok(found[0] != null);
              assert.partialDeepStrictEqual(found[0], EXPECTED);
              done();
            }

            if (TestModel.dataSource.connector.all.length === 4) {
              TestModel.dataSource.connector.all(
                TestModel.modelName,
                {where: {id: created.id}},
                {},
                cb,
              );
            } else {
              TestModel.dataSource.connector.all(
                TestModel.modelName,
                {where: {id: created.id}},
                cb,
              );
            }
          });
        });
      });
    });

    it('should convert undefined to null in toObject()', function() {
      const inst = new TestModel();
      inst.desc = undefined; // Note: this may be a no-op
      inst.unsetAttribute('stars');
      inst.extra = undefined;
      inst.__data.dx = undefined;

      assert.deepStrictEqual(inst.toObject(false), {
        name: null, desc: null, stars: null, id: null, extra: null, dx: null,
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
