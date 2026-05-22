// Copyright IBM Corp. 2014,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {before, beforeEach, describe, it} = require('node:test');
const assert = require('node:assert/strict');

const jdb = require('../');
const DataSource = jdb.DataSource;
const path = require('path');
const fs = require('fs');
require('./init.js');
const Memory = require('../lib/connectors/memory').Memory;

describe('Memory connector', function() {
  const file = path.join(__dirname, 'memory.json');

  function readModels(done) {
    fs.readFile(file, function(err, data) {
      const json = JSON.parse(data.toString());
      assert(json.models);
      assert(json.ids.User);
      done(err, json);
    });
  }

  before(async function() {
    try {
      await fs.promises.unlink(file);
    } catch (err) {
      if (err.code !== 'ENOENT')
        throw err;
    }
  });

  describe('with file', function() {
    let ds;

    function createUserModel() {
      const ds = new DataSource({
        connector: 'memory',
        file: file,
      });

      const User = ds.createModel('User', {
        id: {
          type: Number,
          id: true,
          generated: true,
        },
        name: String,
        bio: String,
        approved: Boolean,
        joinedAt: Date,
        age: Number,
      });
      return User;
    }

    let User;
    const ids = [];

    before(function() {
      User = createUserModel();
      ds = User.dataSource;
    });

    it('should allow multiple connects', async function() {
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
        ds.connected = false; // Change the state to force reconnect
        Promise.all(Array.from({length: 10}, () => invoke(ds.connect.bind(ds)))).then(() => done(), done);
      });
    });

    it('should persist create', async function() {
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
        let count = 0;
        (async function() {
          for (const item of ['John1', 'John2', 'John3']) {
            const result = await invoke(User.create.bind(User), {name: item});
            ids.push(result.id);
            count++;
            const json = await invoke(readModels);
            assert.equal(Object.keys(json.models.User).length, count);
          }
        })().then(() => done(), done);
      });
    });

    /**
     * This test depends on the `should persist create`, which creates 3
     * records and saves into the `memory.json`. The following test makes
     * sure existing records won't be loaded out of sequence to override
     * newly created ones.
     */
    it('should not have out of sequence read/write', async function() {
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
        // Create the new data source with the same file to simulate
        // existing records
        const User = createUserModel();
        const ds = User.dataSource;

        Promise.all(Array.from({length: 10}, () => {
          ds.connect();
          return Promise.resolve();
        })).then(function() {
          return invoke(ds.connect.bind(ds));
        }).then(function() {
          return (async function() {
            for (const item of ['John4', 'John5']) {
              const result = await invoke(User.create.bind(User), {name: item});
              ids.push(result.id);
            }
          })();
        }).then(function() {
          return invoke(readModels);
        }).then(function(json) {
          assert.equal(Object.keys(json.models.User).length, 5);
          done();
        }).catch(done);
      });
    });

    it('should persist delete', async function() {
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
        // Force the data source to reconnect so that the updated records
        // are reloaded
        ds.disconnect(function() {
        // Now try to delete one
          User.deleteById(ids[0], function(err) {
            if (err) {
              return done(err);
            }
            readModels(function(err, json) {
              if (err) {
                return done(err);
              }
              assert.equal(Object.keys(json.models.User).length, 4);
              done();
            });
          });
        });
      });
    });

    it('should persist upsert', async function() {
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
        User.upsert({id: ids[1], name: 'John'}, function(err, result) {
          if (err) {
            return done(err);
          }
          readModels(function(err, json) {
            if (err) {
              return done(err);
            }
            assert.equal(Object.keys(json.models.User).length, 4);
            const user = JSON.parse(json.models.User[ids[1]]);
            assert.equal(user.name, 'John');
            assert(user.id === ids[1]);
            done();
          });
        });
      });
    });

    it('should persist update', async function() {
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
        User.update({id: ids[1]}, {name: 'John1'},
          function(err, result) {
            if (err) {
              return done(err);
            }
            readModels(function(err, json) {
              if (err) {
                return done(err);
              }
              assert.equal(Object.keys(json.models.User).length, 4);
              const user = JSON.parse(json.models.User[ids[1]]);
              assert.equal(user.name, 'John1');
              assert(user.id === ids[1]);
              done();
            });
          });
      });
    });

    // The saved memory.json from previous test should be loaded
    it('should load from the json file', async function() {
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
        User.find(function(err, users) {
        // There should be 2 records
          assert.equal(users.length, 4);
          done(err);
        });
      });
    });
  });

  describe('Query for memory connector', function() {
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
      tag: {type: String, index: true},
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

    before(seed);
    it('should allow to find using like', async function() {
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
        User.find({where: {name: {like: '%St%'}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 2);
          done();
        });
      });
    });

    it('should properly sanitize like  invalid query', async () => {
      const users = await User.find({where: {tag: {like: '['}}});
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].name, 'John Lennon');
    });

    it('should allow to find using like with regexp', async function() {
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
        User.find({where: {name: {like: /.*St.*/}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 2);
          done();
        });
      });
    });

    it('should support like for no match', async function() {
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
        User.find({where: {name: {like: 'M%XY'}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 0);
          done();
        });
      });
    });

    it('should allow to find using nlike', async function() {
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
        User.find({where: {name: {nlike: '%St%'}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 4);
          done();
        });
      });
    });

    it('should sanitize nlike invalid query', async () => {
      const users = await User.find({where: {name: {nlike: '['}}});
      assert.strictEqual(users.length, 6);
    });

    it('should allow to find using nlike with regexp', async function() {
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
        User.find({where: {name: {nlike: /.*St.*/}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 4);
          done();
        });
      });
    });

    it('should support nlike for no match', async function() {
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
        User.find({where: {name: {nlike: 'M%XY'}}}, function(err, posts) {
          assert.ok(err == null);
          assert.ok(Object.prototype.hasOwnProperty.call(posts, 'length')); assert.strictEqual(posts.length, 6);
          done();
        });
      });
    });

    it('should throw if the like value is not string or regexp', async function() {
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
        User.find({where: {name: {like: 123}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should throw if the nlike value is not string or regexp', async function() {
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
        User.find({where: {name: {nlike: 123}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should throw if the inq value is not an array', async function() {
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
        User.find({where: {name: {inq: '12'}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should throw if the nin value is not an array', async function() {
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
        User.find({where: {name: {nin: '12'}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should throw if the between value is not an array', async function() {
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
        User.find({where: {name: {between: '12'}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should throw if the between value is not an array of length 2', async function() {
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
        User.find({where: {name: {between: ['12']}}}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should successfully extract 5 users from the db', async function() {
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
        User.find({where: {seq: {between: [1, 5]}}}, function(err, users) {
          assert.strictEqual(users.length, 5);
          done();
        });
      });
    });

    it('should successfully extract 1 user (Lennon) from the db', async function() {
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
        User.find({where: {birthday: {between: [new Date(1970, 0), new Date(1990, 0)]}}},
          function(err, users) {
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          });
      });
    });

    it('should successfully extract 1 user (Lennon) from the db by date', async function() {
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
        User.find({where: {birthday: new Date('1980-12-08')}},
          function(err, users) {
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          });
      });
    });

    it('should successfully extract 2 users from the db', async function() {
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
        User.find({where: {birthday: {between: [new Date(1940, 0), new Date(1990, 0)]}}},
          function(err, users) {
            assert.strictEqual(users.length, 2);
            done();
          });
      });
    });

    it('should successfully extract 2 users using implied and', async function() {
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
        User.find({where: {role: 'lead', vip: true}}, function(err, users) {
          assert.strictEqual(users.length, 2);
          assert.strictEqual(users[0].name, 'John Lennon');
          assert.strictEqual(users[1].name, 'Paul McCartney');
          done();
        });
      });
    });

    it('should successfully extract 2 users using implied and & and', async function() {
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
        User.find({where: {
          name: 'John Lennon',
          and: [{role: 'lead'}, {vip: true}],
        }}, function(err, users) {
          assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    it('should successfully extract 2 users using date range', async function() {
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
        User.find({where: {birthday: {between:
          [new Date(1940, 0).toISOString(), new Date(1990, 0).toISOString()]}}},
        function(err, users) {
          assert.strictEqual(users.length, 2);
          done();
        });
      });
    });

    it('should successfully extract 0 user from the db', async function() {
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
        User.find({where: {birthday: {between: [new Date(1990, 0), Date.now()]}}},
          function(err, users) {
            assert.strictEqual(users.length, 0);
            done();
          });
      });
    });

    it('should successfully extract 2 users matching over array values', async function() {
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
        User.find({
          where: {
            children: {
              regexp: /an/,
            },
          },
        }, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 2);
          assert.strictEqual(users[0].name, 'John Lennon');
          assert.strictEqual(users[1].name, 'George Harrison');
          done();
        });
      });
    });

    it('should successfully extract 1 users matching over array values', async function() {
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
        User.find({
          where: {
            children: 'Dhani',
          },
        }, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'George Harrison');
          done();
        });
      });
    });

    it('should successfully extract 5 users matching a neq filter over array values', async function() {
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
        User.find({
          where: {
            children: {neq: 'Dhani'},
          },
        }, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 5);
          done();
        });
      });
    });

    it('should successfully extract 3 users with inq', async function() {
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
        User.find({
          where: {seq: {inq: [0, 1, 5]}},
        }, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 3);
          done();
        });
      });
    });

    it('should successfully extract 4 users with nin', async function() {
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
        User.find({
          where: {seq: {nin: [2, 3]}},
        }, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 4);
          done();
        });
      });
    });

    it('should count using date string', async function() {
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
        User.count({birthday: {lt: new Date(1990, 0).toISOString()}},
          function(err, count) {
            assert.strictEqual(count, 2);
            done();
          });
      });
    });

    it('should support order with multiple fields', async function() {
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
        User.find({order: 'vip ASC, seq DESC'}, function(err, posts) {
          assert.ok(err == null);
          assert.deepStrictEqual(posts[0].seq, 4);
          assert.deepStrictEqual(posts[1].seq, 3);
          done();
        });
      });
    });

    it('should sort undefined values to the end when ordered DESC', async function() {
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
        User.find({order: 'vip ASC, order DESC'}, function(err, posts) {
          assert.ok(err == null);

          assert.deepStrictEqual(posts[4].seq, 1);
          assert.deepStrictEqual(posts[5].seq, 0);
          done();
        });
      });
    });

    it('should throw if order has wrong direction', async function() {
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
        User.find({order: 'seq ABC'}, function(err, posts) {
          assert.ok(err != null);
          done();
        });
      });
    });

    it('should support neq operator for number', async function() {
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
        User.find({where: {seq: {neq: 4}}}, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 5);
          for (let i = 0; i < users.length; i++) {
            assert.notStrictEqual(users[i].seq, 4);
          }
          done();
        });
      });
    });

    it('should support neq operator for string', async function() {
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
        User.find({where: {role: {neq: 'lead'}}}, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 4);
          for (let i = 0; i < users.length; i++) {
            if (users[i].role) {
              assert.notStrictEqual(users[i].role, 'lead');
            }
          }
          done();
        });
      });
    });

    it('should support neq operator for null', async function() {
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
        User.find({where: {role: {neq: null}}}, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 2);
          for (let i = 0; i < users.length; i++) {
            assert.ok(users[i].role != null);
          }
          done();
        });
      });
    });

    it('should work when a regex is provided without the regexp operator',
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
          User.find({where: {name: /John.*/i}}, function(err, users) {
            assert.ok(err == null);
            assert.strictEqual(users.length, 1);
            assert.strictEqual(users[0].name, 'John Lennon');
            done();
          });
        });
      });

    it('should support the regexp operator with regex strings', async function() {
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
        User.find({where: {name: {regexp: 'non$'}}}, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    it('should support the regexp operator with regex literals', async function() {
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
        User.find({where: {name: {regexp: /^J/}}}, function(err, users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    it('should support the regexp operator with regex objects', async function() {
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
        User.find({where: {name: {regexp: new RegExp(/^J/)}}}, function(err,
          users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 1);
          assert.strictEqual(users[0].name, 'John Lennon');
          done();
        });
      });
    });

    it('should deserialize values after saving in upsert', async function() {
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
        User.findOne({where: {seq: 1}}, function(err, paul) {
          User.updateOrCreate({id: paul.id, name: 'Sir Paul McCartney'},
            function(err, sirpaul) {
              assert.ok(err == null);
              assert.ok(sirpaul.birthday instanceof Date);
              assert.strictEqual(typeof sirpaul.order, 'number');
              assert.strictEqual(typeof sirpaul.vip, 'boolean');
              done();
            });
        });
      });
    });

    it('should handle constructor.prototype', async function() {
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
        User.find({where: {'constructor.prototype': {toString: 'Not a function'}}}, function(err,
          users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should handle constructor/prototype', async function() {
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
        User.find({where: {constructor: {prototype: {toString: 'Not a function'}}}}, function(err,
          users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    it('should handle toString', async function() {
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
        User.find({where: {toString: 'Not a function'}}, function(err,
          users) {
          assert.ok(err == null);
          assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

    async function seed() {
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
        const beatles = [
          {
            seq: 0,
            name: 'John Lennon',
            email: 'john@b3atl3s.co.uk',
            role: 'lead',
            birthday: new Date('1980-12-08'),
            vip: true,
            tag: '[singer]',
            address: {
              street: '123 A St',
              city: 'San Jose',
              state: 'CA',
              zipCode: '95131',
              tags: [
                {tag: 'business'},
                {tag: 'rent'},
              ],
            },
            friends: [
              {name: 'Paul McCartney'},
              {name: 'George Harrison'},
              {name: 'Ringo Starr'},
            ],
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
            friends: [
              {name: 'John Lennon'},
              {name: 'George Harrison'},
              {name: 'Ringo Starr'},
            ],
            children: ['Stella', 'Mary', 'Heather', 'Beatrice', 'James'],
          },
          {seq: 2, name: 'George Harrison', order: 5, vip: false, children: ['Dhani']},
          {seq: 3, name: 'Ringo Starr', order: 6, vip: false},
          {seq: 4, name: 'Pete Best', order: 4, children: []},
          {seq: 5, name: 'Stuart Sutcliffe', order: 3, vip: true},
        ];

        User.destroyAll(function(err) {
          if (err) return done(err);
          Promise.all(beatles.map(user => User.create(user))).then(() => done(), done);
        });
      });
    }
  });

  it('should use collection setting', async function() {
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
      const ds = new DataSource({
        connector: 'memory',
      });

      const Product = ds.createModel('Product', {
        name: String,
      });

      const Tool = ds.createModel('Tool', {
        name: String,
      }, {memory: {collection: 'Product'}});

      const Widget = ds.createModel('Widget', {
        name: String,
      }, {memory: {collection: 'Product'}});

      assert.strictEqual(ds.connector.getCollection('Tool'), 'Product');
      assert.strictEqual(ds.connector.getCollection('Widget'), 'Product');

      Promise.all([
        invoke(Tool.create.bind(Tool), {name: 'Tool A'}),
        invoke(Tool.create.bind(Tool), {name: 'Tool B'}),
        invoke(Widget.create.bind(Widget), {name: 'Widget A'}),
      ]).then(function() {
        Product.find(function(err, products) {
          assert.ok(err == null);
          assert.strictEqual(products.length, 3);
          assert.deepStrictEqual(products[0].toObject(), {name: 'Tool A', id: 1});
          assert.deepStrictEqual(products[1].toObject(), {name: 'Tool B', id: 2});
          assert.deepStrictEqual(products[2].toObject(), {name: 'Widget A', id: 3});
          done();
        });
      });
    });
  });

  it('should refuse to create object with duplicate id', async function() {
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
      const ds = new DataSource({connector: 'memory'});
      const Product = ds.define('ProductTest', {name: String}, {forceId: false});
      ds.automigrate('ProductTest', function(err) {
        if (err) return done(err);

        Product.create({name: 'a-name'}, function(err, p) {
          if (err) return done(err);
          Product.create({id: p.id, name: 'duplicate'}, function(err) {
            if (!err) {
              return done(new Error('Create should have rejected duplicate id.'));
            }
            assert.match(err.message, /duplicate/i);
            assert.strictEqual(err.statusCode, 409);
            done();
          });
        });
      });
    });
  });

  describe('automigrate', function() {
    let ds;
    beforeEach(function() {
      ds = new DataSource({
        connector: 'memory',
      });

      ds.createModel('m1', {
        name: String,
      });
    });

    it('automigrate all models', async function() {
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
        ds.automigrate(function(err) {
          done(err);
        });
      });
    });

    it('automigrate all models - promise variant', async function() {
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
        ds.automigrate()
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('automigrate one model', async function() {
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
        ds.automigrate('m1', function(err) {
          done(err);
        });
      });
    });

    it('automigrate one model - promise variant', async function() {
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
        ds.automigrate('m1')
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('automigrate one or more models in an array', async function() {
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
        ds.automigrate(['m1'], function(err) {
          done(err);
        });
      });
    });

    it('automigrate one or more models in an array - promise variant', async function() {
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
        ds.automigrate(['m1'])
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('automigrate reports errors for models not attached', async function() {
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
        ds.automigrate(['m1', 'm2'], function(err) {
          assert.ok(err instanceof Error);
          done();
        });
      });
    });

    it('automigrate reports errors for models not attached - promise variant', async function() {
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
        ds.automigrate(['m1', 'm2'])
          .then(function() {
            done(new Error('automigrate() should have failed'));
          })
          .catch(function(err) {
            assert.ok(err instanceof Error);
            done();
          });
      });
    });
  });

  describe('findOrCreate', function() {
    let ds, Cars;
    before(function() {
      ds = new DataSource({connector: 'memory'});
      Cars = ds.define('Cars', {
        color: String,
      });
    });

    it('should create a specific object once and in the subsequent calls it should find it', async function() {
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
        let creationNum = 0;
        Promise.all(Array.from({length: 100}, function() {
          const initialData = {color: 'white'};
          const query = {'where': initialData};
          return new Promise((resolve, reject) => {
            Cars.findOrCreate(query, initialData, function(err, car, created) {
              if (err) return reject(err);
              if (created) creationNum++;
              resolve(car);
            });
          });
        })).then(function() {
          Cars.find(function(err, data) {
            if (err) done(err);
            assert.strictEqual(data.length, 1);
            assert.strictEqual(data[0].color, 'white');
            assert.strictEqual(creationNum, 1);
            done();
          });
        }).catch(done);
      });
    });
  });

  describe('automigrate when NO models are attached', function() {
    let ds;
    beforeEach(function() {
      ds = new DataSource({
        connector: 'memory',
      });
    });

    it('automigrate does NOT report error when NO models are attached', async function() {
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
        ds.automigrate(function(err) {
          done();
        });
      });
    });

    it('automigrate does NOT report error when NO models are attached - promise variant', async function() {
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
        ds.automigrate()
          .then(done)
          .catch(function(err) {
            done(err);
          });
      });
    });
  });

  describe('With mocked autoupdate', function() {
    let ds, model;
    beforeEach(function() {
      ds = new DataSource({
        connector: 'memory',
      });

      ds.connector.autoupdate = function(models, cb) {
        process.nextTick(cb);
      };

      model = ds.createModel('m1', {
        name: String,
      });

      ds.automigrate();

      ds.createModel('m1', {
        name: String,
        address: String,
      });
    });

    it('autoupdates all models', async function() {
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
        ds.autoupdate(function(err, result) {
          done(err);
        });
      });
    });

    it('autoupdates all models - promise variant', async function() {
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
        ds.autoupdate()
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('autoupdates one model', async function() {
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
        ds.autoupdate('m1', function(err) {
          done(err);
        });
      });
    });

    it('autoupdates one model - promise variant', async function() {
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
        ds.autoupdate('m1')
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('autoupdates one or more models in an array', async function() {
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
        ds.autoupdate(['m1'], function(err) {
          done(err);
        });
      });
    });

    it('autoupdates one or more models in an array - promise variant', async function() {
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
        ds.autoupdate(['m1'])
          .then(function(result) {
            done();
          })
          .catch(function(err) {
            done(err);
          });
      });
    });

    it('autoupdate reports errors for models not attached', async function() {
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
        ds.autoupdate(['m1', 'm2'], function(err) {
          assert.ok(err instanceof Error);
          done();
        });
      });
    });

    it('autoupdate reports errors for models not attached - promise variant', async function() {
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
        ds.autoupdate(['m1', 'm2'])
          .then(function() {
            done(new Error('automigrate() should have failed'));
          })
          .catch(function(err) {
            assert.ok(err instanceof Error);
            done();
          });
      });
    });
  });
});

describe('Optimized connector', function() {
});

describe('Unoptimized connector', function() {
});

describe('Memory connector with options', function() {
  const savedOptions = {};
  let ds, Post;

  before(function() {
    ds = new DataSource({connector: 'memory'});
    ds.connector.create = function(model, data, options, cb) {
      savedOptions.create = options;
      process.nextTick(function() {
        cb(null, 1);
      });
    };

    ds.connector.update = function(model, where, data, options, cb) {
      savedOptions.update = options;
      process.nextTick(function() {
        cb(null, {count: 1});
      });
    };

    ds.connector.all = function(model, filter, options, cb) {
      savedOptions.find = options;
      process.nextTick(function() {
        cb(null, [{title: 't1', content: 'c1'}]);
      });
    };

    Post = ds.define('Post', {
      title: String,
      content: String,
    });
  });

  it('should receive options from the find method', async function() {
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
      const opts = {transaction: 'tx1'};
      Post.find({where: {title: 't1'}}, opts, function(err, p) {
        assert.deepStrictEqual(savedOptions.find, opts);
        done(err);
      });
    });
  });

  it('should treat first object arg as filter for find', async function() {
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
      const filter = {title: 't1'};
      Post.find(filter, function(err, p) {
        assert.deepStrictEqual(savedOptions.find, {});
        done(err);
      });
    });
  });

  it('should receive options from the create method', async function() {
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
      const opts = {transaction: 'tx3'};
      Post.create({title: 't1', content: 'c1'}, opts, function(err, p) {
        assert.deepStrictEqual(savedOptions.create, opts);
        done(err);
      });
    });
  });

  it('should receive options from the update method', async function() {
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
      const opts = {transaction: 'tx4'};
      Post.update({title: 't1'}, {content: 'c1 --> c2'},
        opts, function(err, p) {
          assert.deepStrictEqual(savedOptions.update, opts);
          done(err);
        });
    });
  });
});

describe('Memory connector with observers', function() {
  const ds = new DataSource({
    connector: 'memory',
  });

  it('should have observer mixed into the connector', function() {
    assert.strictEqual(typeof ds.connector.observe, 'function');
    assert.strictEqual(typeof ds.connector.notifyObserversOf, 'function');
  });

  it('should notify observers', async function() {
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
      const events = [];
      ds.connector.execute = function(command, params, options, cb) {
        const self = this;
        const context = {command: command, params: params, options: options};
        self.notifyObserversOf('before execute', context, function(err) {
          process.nextTick(function() {
            if (err) return cb(err);
            events.push('execute');
            self.notifyObserversOf('after execute', context, function(err) {
              cb(err);
            });
          });
        });
      };

      ds.connector.observe('before execute', function(context, next) {
        events.push('before execute');
        next();
      });

      ds.connector.observe('after execute', function(context, next) {
        events.push('after execute');
        next();
      });

      ds.connector.execute('test', [1, 2], {x: 2}, function(err) {
        if (err) return done(err);
        assert.deepStrictEqual(events, ['before execute', 'execute', 'after execute']);
        done();
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
