// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const nodeTest = require('node:test');
const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} = nodeTest;
const assert = require('node:assert/strict');

/* global getSchema:false, connectorCapabilities:false */
const bdd = require('./helpers/bdd-if');
require('./init.js');

const DataSource = require('../').DataSource;

let db, User, Profile, AccessToken, Post, Passport, City, Street, Building, Assembly, Part;

const knownUsers = ['User A', 'User B', 'User C', 'User D', 'User E'];
const knownPassports = ['1', '2', '3', '4'];
const knownPosts = ['Post A', 'Post B', 'Post C', 'Post D', 'Post E'];
const knownProfiles = ['Profile A', 'Profile B', 'Profile Z'];

describe('include', function() {
  before(setup);

  it('should fetch belongsTo relation', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({include: 'owner'}, function(err, passports) {
        assert.ok(passports.length);
        passports.forEach(function(p) {
          assert.ok(Object.prototype.hasOwnProperty.call(p.__cachedRelations, 'owner'));

          // The relation should be promoted as the 'owner' property
          assert.ok('owner' in p);
          // The __cachedRelations should be removed from json output
          assert.ok(!Object.prototype.hasOwnProperty.call(p.toJSON(), '__cachedRelations'));

          const owner = p.__cachedRelations.owner;
          if (!p.ownerId) {
            assert.ok(owner == null);
          } else {
            assert.ok(owner != null);
            assert.deepStrictEqual(owner.id, p.ownerId);
          }
        });
        done();
      });
    });
  });

  it('does not return included item if FK is excluded', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({include: 'owner', fields: 'number'}, function(err, passports) {
        if (err) return done(err);
        const owner = passports[0].toJSON().owner;
        assert.ok(owner == null);
        done();
      });
    });
  });

  it('should fetch hasMany relation', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      User.find({include: 'posts'}, function(err, users) {
        assert.ok(err == null);
        assert.ok(users != null);
        assert.ok(users.length);
        users.forEach(function(u) {
        // The relation should be promoted as the 'owner' property
          assert.ok('posts' in u);
          // The __cachedRelations should be removed from json output
          assert.ok(!Object.prototype.hasOwnProperty.call(u.toJSON(), '__cachedRelations'));

          assert.ok(Object.prototype.hasOwnProperty.call(u.__cachedRelations, 'posts'));
          u.__cachedRelations.posts.forEach(function(p) {
          // FIXME There are cases that p.userId is string
            assert.deepStrictEqual(p.userId.toString(), u.id.toString());
          });
        });
        done();
      });
    });
  });

  it('should report errors if the PK is excluded', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      User.find({include: 'posts', fields: 'name'}, function(err) {
        assert.ok(err != null);
        assert.match(err.message, /ID property "id" is missing/);
        done();
      });
    });
  });

  it('should not have changed the __strict flag of the model', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      const originalStrict = User.definition.settings.strict;
      User.definition.settings.strict = true; // Change to test regression for issue #1252
      const finish = (err) => {
      // Restore original user strict property
        User.definition.settings.strict = originalStrict;
        done(err);
      };
      User.find({include: 'posts'}, function(err, users) {
        if (err) return finish(err);
        users.forEach(user => {
          assert.strictEqual(user.__strict, true); // we changed it
        });
        finish();
      });
    });
  });

  bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
    'should not save in db included models, in query returned models',
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
        const originalStrict = User.definition.settings.strict;
        User.definition.settings.strict = true; // Change to test regression for issue #1252
        const finish = (err) => {
        // Restore original user strict property
          User.definition.settings.strict = originalStrict;
          done(err);
        };
        User.findOne({where: {name: 'User A'}, include: 'posts'}, function(err, user) {
          if (err) return finish(err);
          if (!user) return finish(new Error('User Not found to check relation not saved'));
          user.save(function(err) { // save the returned user
            if (err) return finish(err);
            // should not store in db the posts
            const dsName = User.dataSource.name;
            if (dsName === 'memory') {
              assert.ok(!Object.prototype.hasOwnProperty.call(JSON.parse(User.dataSource.adapter.cache.User[1]), 'posts'));
              finish();
            } else if (dsName === 'mongodb') { //  Check native mongodb connector
              // get hold of native mongodb collection
              const dbCollection = User.dataSource.connector.collection(User.modelName);
              dbCollection.findOne({_id: user.id})
                .then(function(foundUser) {
                  if (!foundUser) {
                    finish(new Error('User not found to check posts not saved'));
                  }
                  assert.ok(!Object.prototype.hasOwnProperty.call(foundUser, 'posts'));
                  finish();
                })
                .catch(finish);
            } else { // TODO make native checks for other connectors as well
              finish();
            }
          });
        });
      });
    });

  it('should fetch Passport - Owner - Posts', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({include: {owner: 'posts'}}, function(err, passports) {
        assert.ok(err == null);
        assert.ok(passports != null);
        assert.ok(passports.length);
        passports.forEach(function(p) {
          assert.ok(Object.prototype.hasOwnProperty.call(p.__cachedRelations, 'owner'));

          // The relation should be promoted as the 'owner' property
          assert.ok('owner' in p);
          // The __cachedRelations should be removed from json output
          assert.ok(!Object.prototype.hasOwnProperty.call(p.toJSON(), '__cachedRelations'));

          const user = p.__cachedRelations.owner;
          if (!p.ownerId) {
            assert.ok(user == null);
          } else {
            assert.ok(user != null);
            assert.deepStrictEqual(user.id, p.ownerId);
            assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
            assert.ok('posts' in user);
            assert.ok(Array.isArray(user.toJSON().posts));
            user.__cachedRelations.posts.forEach(function(pp) {
            // FIXME There are cases that pp.userId is string
              assert.deepStrictEqual(pp.userId.toString(), user.id.toString());
            });
          }
        });
        done();
      });
    });
  });

  it('should fetch Passport - Owner - empty Posts', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.findOne({where: {number: '4'}, include: {owner: 'posts'}}, function(err, passport) {
        assert.ok(err == null);
        assert.ok(passport != null);
        assert.ok(Object.prototype.hasOwnProperty.call(passport.__cachedRelations, 'owner'));

        // The relation should be promoted as the 'owner' property
        assert.ok('owner' in passport);
        // The __cachedRelations should be removed from json output
        assert.ok(!Object.prototype.hasOwnProperty.call(passport.toJSON(), '__cachedRelations'));

        const user = passport.__cachedRelations.owner;
        assert.ok(user != null);
        assert.deepStrictEqual(user.id, passport.ownerId);
        assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
        assert.ok('posts' in user);
        assert.ok(Array.isArray(user.toJSON().posts));
        assert.strictEqual(user.toJSON().posts.length, 0);
        done();
      });
    });
  });

  it('should fetch Passport - Owner - Posts - alternate syntax', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({include: {owner: {relation: 'posts'}}}, function(err, passports) {
        assert.ok(err == null);
        assert.ok(passports != null);
        assert.ok(passports.length);
        let posts;
        if (connectorCapabilities.adhocSort !== false) {
          posts = passports[0].owner().posts();
          assert.strictEqual(posts.length, 3);
        } else {
          if (passports[0].owner()) {
            posts = passports[0].owner().posts();
            assert.ok(posts.length <= 3);
          }
        }
        done();
      });
    });
  });

  it('should fetch Passports - User - Posts - User', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({
        include: {owner: {posts: 'author'}},
      }, function(err, passports) {
        assert.ok(err == null);
        assert.ok(passports != null);
        assert.ok(passports.length);
        passports.forEach(function(p) {
          assert.ok(Object.prototype.hasOwnProperty.call(p.__cachedRelations, 'owner'));
          const user = p.__cachedRelations.owner;
          if (!p.ownerId) {
            assert.ok(user == null);
          } else {
            assert.ok(user != null);
            assert.deepStrictEqual(user.id, p.ownerId);
            assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
            user.__cachedRelations.posts.forEach(function(pp) {
              assert.ok(pp.id != null);
              // FIXME There are cases that pp.userId is string
              assert.deepStrictEqual(pp.userId.toString(), user.id.toString());
              assert.ok('author' in pp);
              assert.ok(Object.prototype.hasOwnProperty.call(pp.__cachedRelations, 'author'));
              const author = pp.__cachedRelations.author;
              assert.deepStrictEqual(author.id, user.id);
            });
          }
        });
        done();
      });
    });
  });

  it('should fetch Passports with include scope on Posts', async function() {
    await new Promise((resolve, reject) => {
      let settled = false;

      const done = err => {
        if (settled)
          return;

        settled = true;

        if (err)
          reject(err);
        else
          resolve();
      };
      Passport.find({
        include: {owner: {relation: 'posts', scope: {
          fields: ['title'], include: ['author'],
          order: 'title DESC',
        }}},
      }, function(err, passports) {
        assert.ok(err == null);
        assert.ok(passports != null);
        let passport, owner, posts;
        if (connectorCapabilities.adhocSort !== false) {
          assert.strictEqual(passports.length, 4);

          passport = passports[0];
          assert.strictEqual(passport.number, '1');
          assert.strictEqual(passport.owner().name, 'User A');
          owner = passport.owner().toObject();

          posts = passport.owner().posts();
          assert.ok(Array.isArray(posts));
          assert.strictEqual(posts.length, 3);

          assert.strictEqual(posts[0].title, 'Post C');
          assert.strictEqual(posts[0].id, undefined); // omitted
          assert.ok(posts[0].author() instanceof User);
          assert.strictEqual(posts[0].author().name, 'User A');

          assert.strictEqual(posts[1].title, 'Post B');
          assert.strictEqual(posts[1].author().name, 'User A');

          assert.strictEqual(posts[2].title, 'Post A');
          assert.strictEqual(posts[2].author().name, 'User A');
        } else {
          assert.ok(passports.length <= 4);

          passport = passports[0];
          assert.ok((knownPassports).includes(passport.number));
          if (passport.owner()) {
            assert.ok((knownUsers).includes(passport.owner().name));
            owner = passport.owner().toObject();

            posts = passport.owner().posts();
            assert.ok(Array.isArray(posts));
            assert.ok(posts.length <= 3);

            if (posts[0]) {
              assert.ok((knownPosts).includes(posts[0].title));
              assert.ok(posts[0].author() instanceof User);
              assert.ok((knownUsers).includes(posts[0].author().name));
            }
          }
        }

        done();
      });
    });
  });

  bdd.itIf(connectorCapabilities.adhocSort !== false,
    'should support limit', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Passport.find({
          include: {
            owner: {
              relation: 'posts', scope: {
                fields: ['title'], include: ['author'],
                order: 'title DESC',
                limit: 1,
              },
            },
          },
          limit: 2,
        }, function(err, passports) {
          if (err) return done(err);
          assert.strictEqual(passports.length, 2);
          const posts1 = passports[0].toJSON().owner.posts;
          assert.strictEqual(posts1.length, 1);
          assert.strictEqual(posts1[0].title, 'Post C');
          const posts2 = passports[1].toJSON().owner.posts;
          assert.strictEqual(posts2.length, 1);
          assert.strictEqual(posts2[0].title, 'Post D');

          done();
        });
      });
    });

  bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
    'should support limit - no sort', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        Passport.find({
          include: {
            owner: {
              relation: 'posts', scope: {
                fields: ['title'], include: ['author'],
                order: 'title DESC',
                limit: 1,
              },
            },
          },
          limit: 2,
        }, function(err, passports) {
          if (err) return done(err);
          assert.strictEqual(passports.length, 2);
          let owner = passports[0].toJSON().owner;
          if (owner) {
            const posts1 = owner.posts;
            assert.ok(posts1.length <= 1);
            if (posts1.length === 1) {
              assert.ok((knownPosts).includes(posts1[0].title));
            }
          }
          owner = passports[1].toJSON().owner;
          if (owner) {
            const posts2 = owner.posts;
            assert.ok(posts2.length <= 1);
            if (posts2.length === 1) {
              assert.ok((knownPosts).includes(posts2[0].title));
            }
          }
          done();
        });
      });
    });

  bdd.describeIf(connectorCapabilities.adhocSort !== false,
    'inq limit', function() {
      before(function() {
        Passport.dataSource.settings.inqLimit = 2;
      });

      after(function() {
        delete Passport.dataSource.settings.inqLimit;
      });

      it('should support include by pagination', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          // `pagination` in this case is inside the implementation and set by
          // `inqLimit = 2` in the before block. This will need to be reworked once
          // we decouple `findWithForeignKeysByPage`.
          //
          // --superkhau
          Passport.find({
            include: {
              owner: {
                relation: 'posts',
                scope: {
                  fields: ['title'], include: ['author'],
                  order: 'title ASC',
                },
              },
            },
          }, function(err, passports) {
            if (err) return done(err);

            assert.strictEqual(passports.length, 4);
            const posts1 = passports[0].toJSON().owner.posts;
            assert.strictEqual(posts1.length, 3);
            assert.strictEqual(posts1[0].title, 'Post A');
            const posts2 = passports[1].toJSON().owner.posts;
            assert.strictEqual(posts2.length, 1);
            assert.strictEqual(posts2[0].title, 'Post D');

            done();
          });
        });
      });
    });

  bdd.describeIf(connectorCapabilities.adhocSort !== false,
    'findWithForeignKeysByPage', function() {
      describe('filter', function() {
        it('works when using a `where` with a foreign key', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.findOne({
              include: {
                relation: 'passports',
              },
            }, function(err, user) {
              if (err) return done(err);

              const passport = user.passports()[0];
              // eql instead of equal because mongo uses object id type
              assert.deepStrictEqual(passport.id, createdPassports[0].id);
              assert.deepStrictEqual(passport.ownerId, createdPassports[0].ownerId);
              assert.deepStrictEqual(passport.number, createdPassports[0].number);

              done();
            });
          });
        });

        it('works when using a `where` with `and`', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.findOne({
              include: {
                relation: 'posts',
                scope: {
                  where: {
                    and: [
                      {id: createdPosts[0].id},
                      // Remove the duplicate userId to avoid Cassandra failure
                      // {userId: createdPosts[0].userId},
                      {title: 'Post A'},
                    ],
                  },
                },
              },
            }, function(err, user) {
              if (err) return done(err);

              assert.strictEqual(user.name, 'User A');
              assert.strictEqual(user.age, 21);
              assert.deepStrictEqual(user.id, createdUsers[0].id);
              const posts = user.posts();
              assert.strictEqual(posts.length, 1);
              const post = posts[0];
              assert.strictEqual(post.title, 'Post A');
              // eql instead of equal because mongo uses object id type
              assert.deepStrictEqual(post.userId, createdPosts[0].userId);
              assert.deepStrictEqual(post.id, createdPosts[0].id);

              done();
            });
          });
        });

        it('works when using `where` with `limit`', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.findOne({
              include: {
                relation: 'posts',
                scope: {
                  limit: 1,
                },
              },
            }, function(err, user) {
              if (err) return done(err);

              assert.strictEqual(user.posts().length, 1);

              done();
            });
          });
        });

        it('works when using `where` with `skip`', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.findOne({
              include: {
                relation: 'posts',
                scope: {
                  skip: 1,
                },
              },
            }, function(err, user) {
              if (err) return done(err);

              const ids = user.posts().map(function(p) { return p.id; });
              assert.deepStrictEqual(ids, [createdPosts[1].id, createdPosts[2].id]);

              done();
            });
          });
        });

        it('works when using `where` with `offset`', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            User.findOne({
              include: {
                relation: 'posts',
                scope: {
                  offset: 1,
                },
              },
            }, function(err, user) {
              if (err) return done(err);

              const ids = user.posts().map(function(p) { return p.id; });
              assert.deepStrictEqual(ids, [createdPosts[1].id, createdPosts[2].id]);

              done();
            });
          });
        });

        it('works when using `where` without `limit`, `skip` or `offset`',
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
              User.findOne({include: {relation: 'posts'}}, function(err, user) {
                if (err) return done(err);

                const posts = user.posts();
                const ids = posts.map(function(p) { return p.id; });
                assert.deepStrictEqual(ids, [
                  createdPosts[0].id,
                  createdPosts[1].id,
                  createdPosts[2].id,
                ]);

                done();
              });
            });
          });
      });

      describe('pagination', function() {
        it('works with the default page size (0) and `inqlimit` is exceeded',
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
              // inqLimit modifies page size in the impl (there is no way to modify
              // page size directly as it is hardcoded (once we decouple the func,
              // we can use ctor injection to pass in whatever page size we want).
              //
              // --superkhau
              Post.dataSource.settings.inqLimit = 2;

              User.find({include: {relation: 'posts'}}, function(err, users) {
                if (err) return done(err);

                assert.strictEqual(users.length, 5);

                delete Post.dataSource.settings.inqLimit;

                done();
              });
            });
          });

        it('works when page size is set to 0', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            Post.dataSource.settings.inqLimit = 0;

            User.find({include: {relation: 'posts'}}, function(err, users) {
              if (err) return done(err);

              assert.strictEqual(users.length, 5);

              delete Post.dataSource.settings.inqLimit;

              done();
            });
          });
        });

        describe('relations', function() {
          // WARNING
          // The code paths for in this suite of tests were verified manually due to
          // the tight coupling of the `findWithForeignKeys` in `include.js`.
          //
          // TODO
          // Decouple the utility functions into their own modules and export each
          // function individually to allow for unit testing via DI.
          //
          // --superkhau

          it('works when hasOne is called', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.findOne({include: {relation: 'profile'}}, function(err, user) {
                if (err) return done(err);

                assert.strictEqual(user.name, 'User A');
                assert.strictEqual(user.age, 21);
                // eql instead of equal because mongo uses object id type
                assert.deepStrictEqual(user.id, createdUsers[0].id);
                const profile = user.profile();
                assert.strictEqual(profile.profileName, 'Profile A');
                // eql instead of equal because mongo uses object id type
                assert.deepStrictEqual(profile.userId, createdProfiles[0].userId);
                assert.deepStrictEqual(profile.id, createdProfiles[0].id);

                done();
              });
            });
          });

          it('does not return included item if hasOne is missing the id property', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.findOne({include: {relation: 'profile'}, fields: 'name'}, function(err, user) {
                if (err) return done(err);
                assert.ok(user != null);
                // Convert to JSON as the user instance has `profile` as a relational method
                assert.ok(user.toJSON().profile == null);
                done();
              });
            });
          });

          it('works when hasMany is called', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              User.findOne({include: {relation: 'posts'}}, function(err, user) {
                if (err) return done();

                assert.strictEqual(user.name, 'User A');
                assert.strictEqual(user.age, 21);
                // eql instead of equal because mongo uses object id type
                assert.deepStrictEqual(user.id, createdUsers[0].id);
                assert.strictEqual(user.posts().length, 3);

                done();
              });
            });
          });

          it('works when hasManyThrough is called', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              const Physician = db.define('Physician', {name: String});
              const Patient = db.define('Patient', {name: String});
              const Appointment = db.define('Appointment', {
                date: {
                  type: Date,
                  default: function() {
                    return new Date();
                  },
                },
              });
              const Address = db.define('Address', {name: String});

              Physician.hasMany(Patient, {through: Appointment});
              Patient.hasMany(Physician, {through: Appointment});
              Patient.belongsTo(Address);
              Appointment.belongsTo(Patient);
              Appointment.belongsTo(Physician);

              db.automigrate(['Physician', 'Patient', 'Appointment', 'Address'],
                function() {
                  Physician.create(function(err, physician) {
                    physician.patients.create({name: 'a'}, function(err, patient) {
                      Address.create({name: 'z'}, function(err, address) {
                        patient.address(address);
                        patient.save(function() {
                          physician.patients({include: 'address'},
                            function(err, patients) {
                              if (err) return done(err);

                              assert.strictEqual(patients.length, 1);
                              const p = patients[0];
                              assert.strictEqual(p.name, 'a');
                              assert.deepStrictEqual(p.addressId, patient.addressId);
                              assert.deepStrictEqual(p.address().id, address.id);
                              assert.strictEqual(p.address().name, 'z');

                              done();
                            });
                        });
                      });
                    });
                  });
                });
            });
          });

          it('works when belongsTo is called', async function() {
            await new Promise((resolve, reject) => {
              let settled = false;

              const done = err => {
                if (settled)
                  return;

                settled = true;

                if (err)
                  reject(err);
                else
                  resolve();
              };
              Profile.findOne({include: 'user'}, function(err, profile) {
                if (err) return done(err);

                assert.strictEqual(profile.profileName, 'Profile A');
                assert.deepStrictEqual(profile.userId, createdProfiles[0].userId);
                assert.deepStrictEqual(profile.id, createdProfiles[0].id);
                const user = profile.user();
                assert.strictEqual(user.name, 'User A');
                assert.strictEqual(user.age, 21);
                assert.deepStrictEqual(user.id, createdUsers[0].id);

                done();
              });
            });
          });
        });
      });

      bdd.describeIf(connectorCapabilities.adhocSort === false,
        'findWithForeignKeysByPage', function() {
          describe('filter', function() {
            it('works when using a `where` with a foreign key', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({
                  include: {
                    relation: 'passports',
                  },
                }, function(err, user) {
                  if (err) return done(err);

                  const passport = user.passports()[0];
                  if (passport) {
                    const knownPassportIds = [];
                    const knownOwnerIds = [];
                    createdPassports.forEach(function(p) {
                      if (p.id) knownPassportIds.push(p.id);
                      if (p.ownerId) knownOwnerIds.push(p.ownerId.toString());
                    });
                    assert.ok((knownPassportIds).includes(passport.id));
                    // FIXME passport.ownerId may be string
                    assert.ok((knownOwnerIds).includes(passport.ownerId.toString()));
                    assert.ok((knownPassports).includes(passport.number));
                  }
                  done();
                });
              });
            });

            it('works when using a `where` with `and`', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({
                  include: {
                    relation: 'posts',
                    scope: {
                      where: {
                        and: [
                          {id: createdPosts[0].id},
                          // Remove the duplicate userId to avoid Cassandra failure
                          // {userId: createdPosts[0].userId},
                          {title: createdPosts[0].title},
                        ],
                      },
                    },
                  },
                }, function(err, user) {
                  if (err) return done(err);

                  let posts, post;
                  if (connectorCapabilities.adhocSort !== false) {
                    assert.strictEqual(user.name, 'User A');
                    assert.strictEqual(user.age, 21);
                    assert.deepStrictEqual(user.id, createdUsers[0].id);
                    posts = user.posts();
                    assert.strictEqual(posts.length, 1);
                    post = posts[0];
                    assert.strictEqual(post.title, 'Post A');
                    // eql instead of equal because mongo uses object id type
                    assert.deepStrictEqual(post.userId, createdPosts[0].userId);
                    assert.deepStrictEqual(post.id, createdPosts[0].id);
                  } else {
                    assert.ok((knownUsers).includes(user.name));
                    const knownUserIds = [];
                    createdUsers.forEach(function(u) {
                      knownUserIds.push(u.id.toString());
                    });
                    assert.ok((knownUserIds).includes(user.id.toString()));
                    posts = user.posts();
                    if (posts && posts.length > 0) {
                      post = posts[0];
                      assert.ok((knownPosts).includes(post.title));
                      assert.ok((knownUserIds).includes(post.userId.toString()));
                      const knownPostIds = [];
                      createdPosts.forEach(function(p) {
                        knownPostIds.push(p.id);
                      });
                      assert.ok((knownPostIds).includes(post.id));
                    }
                  }
                  done();
                });
              });
            });

            it('works when using `where` with `limit`', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({
                  include: {
                    relation: 'posts',
                    scope: {
                      limit: 1,
                    },
                  },
                }, function(err, user) {
                  if (err) return done(err);

                  assert.ok(user.posts().length <= 1);

                  done();
                });
              });
            });

            it('works when using `where` with `skip`', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({
                  include: {
                    relation: 'posts',
                    scope: {
                      skip: 1, // will be ignored
                    },
                  },
                }, function(err, user) {
                  if (err) return done(err);

                  const ids = user.posts().map(function(p) { return p.id; });
                  if (ids.length > 0) {
                    const knownPosts = [];
                    createdPosts.forEach(function(p) {
                      if (p.id) knownPosts.push(p.id);
                    });
                    ids.forEach(function(id) {
                      if (id) {
                        assert.ok((knownPosts).includes(id));
                      }
                    });
                  }

                  done();
                });
              });
            });

            it('works when using `where` with `offset`', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({
                  include: {
                    relation: 'posts',
                    scope: {
                      offset: 1, // will be ignored
                    },
                  },
                }, function(err, user) {
                  if (err) return done(err);

                  const ids = user.posts().map(function(p) { return p.id; });
                  if (ids.length > 0) {
                    const knownPosts = [];
                    createdPosts.forEach(function(p) {
                      if (p.id) knownPosts.push(p.id);
                    });
                    ids.forEach(function(id) {
                      if (id) {
                        assert.ok((knownPosts).includes(id));
                      }
                    });
                  }

                  done();
                });
              });
            });

            it('works when using `where` without `limit`, `skip` or `offset`',
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
                  User.findOne({include: {relation: 'posts'}}, function(err, user) {
                    if (err) return done(err);

                    const posts = user.posts();
                    const ids = posts.map(function(p) { return p.id; });
                    if (ids.length > 0) {
                      const knownPosts = [];
                      createdPosts.forEach(function(p) {
                        if (p.id) knownPosts.push(p.id);
                      });
                      ids.forEach(function(id) {
                        if (id) {
                          assert.ok((knownPosts).includes(id));
                        }
                      });
                    }

                    done();
                  });
                });
              });
          });

          describe('pagination', function() {
            it('works with the default page size (0) and `inqlimit` is exceeded',
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
                  // inqLimit modifies page size in the impl (there is no way to modify
                  // page size directly as it is hardcoded (once we decouple the func,
                  // we can use ctor injection to pass in whatever page size we want).
                  //
                  // --superkhau
                  Post.dataSource.settings.inqLimit = 2;

                  User.find({include: {relation: 'posts'}}, function(err, users) {
                    if (err) return done(err);

                    assert.strictEqual(users.length, 5);

                    delete Post.dataSource.settings.inqLimit;

                    done();
                  });
                });
              });

            it('works when page size is set to 0', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                Post.dataSource.settings.inqLimit = 0;

                User.find({include: {relation: 'posts'}}, function(err, users) {
                  if (err) return done(err);

                  assert.strictEqual(users.length, 5);

                  delete Post.dataSource.settings.inqLimit;

                  done();
                });
              });
            });
          });

          describe('relations', function() {
            // WARNING
            // The code paths for in this suite of tests were verified manually due to
            // the tight coupling of the `findWithForeignKeys` in `include.js`.
            //
            // TODO
            // Decouple the utility functions into their own modules and export each
            // function individually to allow for unit testing via DI.
            //
            // --superkhau

            it('works when hasOne is called', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({include: {relation: 'profile'}}, function(err, user) {
                  if (err) return done(err);

                  const knownUserIds = [];
                  const knownProfileIds = [];
                  createdUsers.forEach(function(u) {
                    // FIXME user.id below might be string, so knownUserIds should match
                    knownUserIds.push(u.id.toString());
                  });
                  createdProfiles.forEach(function(p) {
                    // knownProfileIds.push(p.id ? p.id.toString() : '');
                    knownProfileIds.push(p.id);
                  });
                  if (user) {
                    assert.ok((knownUsers).includes(user.name));
                    // eql instead of equal because mongo uses object id type
                    assert.ok((knownUserIds).includes(user.id.toString()));
                    const profile = user.profile();
                    if (profile) {
                      assert.ok((knownProfiles).includes(profile.profileName));
                      // eql instead of equal because mongo uses object id type
                      assert.ok(profile.userId == null ||
                  (knownUserIds).includes(profile.userId.toString()));
                      assert.ok((knownProfileIds).includes(profile.id));
                    }
                  }

                  done();
                });
              });
            });

            it('works when hasMany is called', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                User.findOne({include: {relation: 'posts'}}, function(err, user) {
                  if (err) return done();

                  const knownUserIds = [];
                  createdUsers.forEach(function(u) {
                    knownUserIds.push(u.id);
                  });
                  assert.ok((knownUsers).includes(user.name));
                  // eql instead of equal because mongo uses object id type
                  assert.ok((knownUserIds).includes(user.id));
                  assert.ok(user.posts().length <= 3);

                  done();
                });
              });
            });

            it('works when hasManyThrough is called', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                const Physician = db.define('Physician', {name: String});
                const Patient = db.define('Patient', {name: String});
                const Appointment = db.define('Appointment', {
                  date: {
                    type: Date,
                    default: function() {
                      return new Date();
                    },
                  },
                });
                const Address = db.define('Address', {name: String});

                Physician.hasMany(Patient, {through: Appointment});
                Patient.hasMany(Physician, {through: Appointment});
                Patient.belongsTo(Address);
                Appointment.belongsTo(Patient);
                Appointment.belongsTo(Physician);

                db.automigrate(['Physician', 'Patient', 'Appointment', 'Address'],
                  function() {
                    Physician.create(function(err, physician) {
                      physician.patients.create({name: 'a'}, function(err, patient) {
                        Address.create({name: 'z'}, function(err, address) {
                          patient.address(address);
                          patient.save(function() {
                            physician.patients({include: 'address'},
                              function(err, patients) {
                                if (err) return done(err);
                                assert.strictEqual(patients.length, 1);
                                const p = patients[0];
                                assert.strictEqual(p.name, 'a');
                                assert.deepStrictEqual(p.addressId, patient.addressId);
                                assert.deepStrictEqual(p.address().id, address.id);
                                assert.strictEqual(p.address().name, 'z');

                                done();
                              });
                          });
                        });
                      });
                    });
                  });
              });
            });

            it('works when belongsTo is called', async function() {
              await new Promise((resolve, reject) => {
                let settled = false;

                const done = err => {
                  if (settled)
                    return;

                  settled = true;

                  if (err)
                    reject(err);
                  else
                    resolve();
                };
                Profile.findOne({include: 'user'}, function(err, profile) {
                  if (err) return done(err);
                  if (!profile) return done(); // not every user has progile

                  const knownUserIds = [];
                  const knownProfileIds = [];
                  createdUsers.forEach(function(u) {
                    knownUserIds.push(u.id.toString());
                  });
                  createdProfiles.forEach(function(p) {
                    if (p.id) knownProfileIds.push(p.id.toString());
                  });
                  if (profile) {
                    assert.ok((knownProfiles).includes(profile.profileName));
                    assert.ok(profile.userId == null ||
                (knownUserIds).includes(profile.userId.toString()));
                    assert.ok(profile.id == null ||
                (knownProfileIds).includes(profile.id.toString()));
                    const user = profile.user();
                    if (user) {
                      assert.ok((knownUsers).includes(user.name));
                      assert.ok((knownUserIds).includes(user.id.toString()));
                    }
                  }

                  done();
                });
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should fetch Users with include scope on Posts - belongsTo',
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
            Post.find({include: {relation: 'author', scope: {fields: ['name']}}},
              function(err, posts) {
                assert.ok(err == null);
                assert.ok(posts != null);
                assert.strictEqual(posts.length, 5);

                const author = posts[0].author();
                assert.strictEqual(author.name, 'User A');
                assert.ok(author.id != null);
                assert.strictEqual(author.age, undefined);

                done();
              });
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort === false,
        'should fetch Users with include scope on Posts - belongsTo - no sort',
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
            Post.find({include: {relation: 'author', scope: {fields: ['name']}}},
              function(err, posts) {
                assert.ok(err == null);
                assert.ok(posts != null);
                assert.ok(posts.length <= 5);

                const author = posts[0].author();
                if (author) {
                  assert.ok(knownUsers.includes(author.name));
                  assert.ok(author.id != null);
                  assert.strictEqual(author.age, undefined);
                }

                done();
              });
          });
        });

      it('should fetch Users with include scope on Posts - hasMany', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

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
            include: {relation: 'posts', scope: {
              order: 'title DESC',
            }},
          }, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.strictEqual(users.length, 5);

            if (connectorCapabilities.adhocSort !== false) {
              assert.strictEqual(users[0].name, 'User A');
              assert.strictEqual(users[1].name, 'User B');

              let posts = users[0].posts();
              assert.ok(Array.isArray(posts));
              assert.strictEqual(posts.length, 3);

              assert.strictEqual(posts[0].title, 'Post C');
              assert.strictEqual(posts[1].title, 'Post B');
              assert.strictEqual(posts[2].title, 'Post A');

              posts = users[1].posts();
              assert.ok(Array.isArray(posts));
              assert.strictEqual(posts.length, 1);
              assert.strictEqual(posts[0].title, 'Post D');
            } else {
              users.forEach(function(u) {
                assert.ok((knownUsers).includes(u.name));
                const posts = u.posts();
                if (posts) {
                  assert.ok(Array.isArray(posts));
                  assert.ok(posts.length <= 3);
                  posts.forEach(function(p) {
                    assert.ok((knownPosts).includes(p.title));
                  });
                }
              });
            }

            done();
          });
        });
      });

      it('should fetch User - Posts AND Passports', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: ['posts', 'passports']}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(users.length);
            users.forEach(function(user) {
              // The relation should be promoted as the 'owner' property
              assert.ok('posts' in user);
              assert.ok('passports' in user);

              const userObj = user.toJSON();
              assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'posts'));
              assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'passports'));
              assert.ok(userObj.posts instanceof Array);
              assert.ok(userObj.passports instanceof Array);

              // The __cachedRelations should be removed from json output
              assert.ok(!Object.prototype.hasOwnProperty.call(userObj, '__cachedRelations'));

              assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
              assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'passports'));
              user.__cachedRelations.posts.forEach(function(p) {
                // FIXME there are cases that p.userId is string
                assert.deepStrictEqual(p.userId.toString(), user.id.toString());
              });
              user.__cachedRelations.passports.forEach(function(pp) {
                // FIXME there are cases that p.ownerId is string
                assert.deepStrictEqual(pp.ownerId.toString(), user.id.toString());
              });
            });
            done();
          });
        });
      });

      it('should fetch User - Posts AND Passports in relation syntax',
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
            User.find({include: [
              {relation: 'posts', scope: {
                where: {title: 'Post A'},
              }},
              'passports',
            ]}, function(err, users) {
              assert.ok(err == null);
              assert.ok(users != null);
              assert.ok(users.length);
              users.forEach(function(user) {
                // The relation should be promoted as the 'owner' property
                assert.ok('posts' in user);
                assert.ok('passports' in user);

                const userObj = user.toJSON();
                assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'posts'));
                assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'passports'));
                assert.ok(userObj.posts instanceof Array);
                assert.ok(userObj.passports instanceof Array);

                // The __cachedRelations should be removed from json output
                assert.ok(!Object.prototype.hasOwnProperty.call(userObj, '__cachedRelations'));

                assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
                assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'passports'));
                user.__cachedRelations.posts.forEach(function(p) {
                  // FIXME there are cases that p.userId is string
                  assert.deepStrictEqual(p.userId.toString(), user.id.toString());
                  assert.strictEqual(p.title, 'Post A');
                });
                user.__cachedRelations.passports.forEach(function(pp) {
                  // FIXME there are cases that p.ownerId is string
                  assert.deepStrictEqual(pp.ownerId.toString(), user.id.toString());
                });
              });
              done();
            });
          });
        });

      it('should not fetch User - AccessTokens', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: ['accesstokens']}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(users.length);
            users.forEach(function(user) {
              const userObj = user.toJSON();
              assert.ok(!Object.prototype.hasOwnProperty.call(userObj, 'accesstokens'));
            });
            done();
          });
        });
      });

      it('should support hasAndBelongsToMany', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Assembly.create({name: 'car'}, function(err, assembly) {
            Part.create({partNumber: 'engine'}, function(err, part) {
              assembly.parts.add(part, function(err, data) {
                assembly.parts(function(err, parts) {
                  assert.ok(err == null);
                  assert.ok(parts != null);
                  assert.strictEqual(parts.length, 1);
                  assert.strictEqual(parts[0].partNumber, 'engine');

                  // Create a part
                  assembly.parts.create({partNumber: 'door'}, function(err, part4) {
                    Assembly.find({include: 'parts'}, function(err, assemblies) {
                      assert.strictEqual(assemblies.length, 1);
                      assert.strictEqual(assemblies[0].parts().length, 2);
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });

      it('should fetch User - Profile (HasOne)', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: ['profile']}, function(err, users) {
            assert.ok(err == null);
            assert.ok(users != null);
            assert.ok(users.length);
            let usersWithProfile = 0;
            users.forEach(function(user) {
              // The relation should be promoted as the 'owner' property
              assert.ok('profile' in user);
              const userObj = user.toJSON();
              const profile = user.profile();
              if (profile) {
                assert.ok(profile instanceof Profile);
                usersWithProfile++;
              } else {
                assert.strictEqual((profile === null), true);
              }
              // The __cachedRelations should be removed from json output
              assert.ok(!Object.prototype.hasOwnProperty.call(userObj, '__cachedRelations'));
              assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'profile'));
              if (user.__cachedRelations.profile) {
                // FIXME there are cases that profile.userId is string
                assert.deepStrictEqual(user.__cachedRelations.profile.userId.toString(), user.id.toString());
                usersWithProfile++;
              }
            });
            assert.strictEqual(usersWithProfile, 2 * 2);
            done();
          });
        });
      });

      it('should not throw on fetch User if include is boolean equals true', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: true}, function(err, users) {
            if (err) return done(err);
            assert.ok(users != null);
            assert.notStrictEqual(users.length, 0);
            done();
          });
        });
      });

      it('should not throw on fetch User if include is number', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: 1}, function(err, users) {
            if (err) return done(err);
            assert.ok(users != null);
            assert.notStrictEqual(users.length, 0);
            done();
          });
        });
      });

      it('should not throw on fetch User if include is symbol', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          User.find({include: Symbol('include')}, function(err, users) {
            if (err) return done(err);
            assert.ok(users != null);
            assert.notStrictEqual(users.length, 0);
            done();
          });
        });
      });

      it('should not throw on fetch User if include is function', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          const include = () => {};
          User.find({include}, function(err, users) {
            if (err) return done(err);
            assert.ok(users != null);
            assert.notStrictEqual(users.length, 0);
            done();
          });
        });
      });

      // Not implemented correctly, see: loopback-datasource-juggler/issues/166
      // fixed by DB optimization
      it('should support include scope on hasAndBelongsToMany', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

          const done = err => {
            if (settled)
              return;

            settled = true;

            if (err)
              reject(err);
            else
              resolve();
          };
          Assembly.find({include: {relation: 'parts', scope: {
            where: {partNumber: 'engine'},
          }}}, function(err, assemblies) {
            assert.strictEqual(assemblies.length, 1);
            const parts = assemblies[0].parts();
            assert.strictEqual(parts.length, 1);
            assert.strictEqual(parts[0].partNumber, 'engine');
            done();
          });
        });
      });

      it('should save related items separately', async function() {
        await new Promise((resolve, reject) => {
          let settled = false;

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
            include: 'posts',
          })
            .then(function(users) {
              const posts = users[0].posts();
              if (connectorCapabilities.adhocSort !== false) {
                assert.strictEqual(posts.length, 3);
              } else {
                assert.ok(posts == null || posts.length <= 3);
              }
              return users[0].save();
            })
            .then(function(updatedUser) {
              return User.findById(updatedUser.id, {
                include: 'posts',
              });
            })
            .then(function(user) {
              const posts = user.posts();
              if (connectorCapabilities.adhocSort !== false) {
                assert.strictEqual(posts.length, 3);
              } else {
                assert.ok(posts == null || posts.length <= 3);
              }
            })
            .then(done)
            .catch(done);
        });
      });

      describe('performance', function() {
        let all;
        beforeEach(function() {
          this.called = 0;
          const self = this;
          all = db.connector.all;
          db.connector.all = function(model, filter, options, cb) {
            self.called++;
            return all.apply(db.connector, arguments);
          };
        });
        afterEach(function() {
          db.connector.all = all;
        });

        const nDBCalls = connectorCapabilities.supportTwoOrMoreInq !== false ? 2 : 4;
        it('including belongsTo should make only ' + nDBCalls + ' db calls', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            const self = this;
            Passport.find({include: 'owner'}, function(err, passports) {
              assert.ok(passports.length);
              passports.forEach(function(p) {
                assert.ok(Object.prototype.hasOwnProperty.call(p.__cachedRelations, 'owner'));
                // The relation should be promoted as the 'owner' property
                assert.ok('owner' in p);
                // The __cachedRelations should be removed from json output
                assert.ok(!Object.prototype.hasOwnProperty.call(p.toJSON(), '__cachedRelations'));
                const owner = p.__cachedRelations.owner;
                if (!p.ownerId) {
                  assert.ok(owner == null);
                } else {
                  assert.ok(owner != null);
                  assert.deepStrictEqual(owner.id, p.ownerId);
                }
              });
              assert.deepStrictEqual(self.called, nDBCalls);
              done();
            });
          });
        });

        it('including hasManyThrough should make only 3 db calls', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            const self = this;
            Assembly.create([{name: 'sedan'}, {name: 'hatchback'},
              {name: 'SUV'}],
            function(err, assemblies) {
              Part.create([{partNumber: 'engine'}, {partNumber: 'bootspace'},
                {partNumber: 'silencer'}],
              function(err, parts) {
                Promise.all(parts.map(part => Promise.all(assemblies.map(assembly => {
                  if (assembly.name === 'SUV') {
                    return Promise.resolve();
                  }
                  if (assembly.name === 'hatchback' &&
                  part.partNumber === 'bootspace') {
                    return Promise.resolve();
                  }
                  return invoke(assembly.parts.add.bind(assembly.parts), part);
                })))).then(function() {
                  const autos = connectorCapabilities.supportTwoOrMoreInq !== false ?
                    ['sedan', 'hatchback', 'SUV'] : ['sedan'];
                  const resultLength = connectorCapabilities.supportTwoOrMoreInq !== false ? 3 : 1;
                  const dbCalls = connectorCapabilities.supportTwoOrMoreInq !== false ? 3 : 5;
                  self.called = 0;
                  Assembly.find({
                    where: {
                      name: {
                        inq: autos,
                      },
                    },
                    include: 'parts',
                  }, function(err, result) {
                    assert.ok(err == null);
                    assert.ok(result != null);
                    assert.strictEqual(result.length, resultLength);
                    // Please note the order of assemblies is random
                    const assemblies = {};
                    result.forEach(function(r) {
                      assemblies[r.name] = r;
                    });
                    if (autos.indexOf('sedan') >= 0) {
                      assert.strictEqual(assemblies.sedan.parts().length, 3);
                    }
                    if (autos.indexOf('hatchback') >= 0) {
                      assert.strictEqual(assemblies.hatchback.parts().length, 2);
                    }
                    if (autos.indexOf('SUV') >= 0) {
                      assert.strictEqual(assemblies.SUV.parts().length, 0);
                    }
                    assert.deepStrictEqual(self.called, dbCalls);
                    done();
                  });
                });
              });
            });
          });
        });

        const dbCalls = connectorCapabilities.supportTwoOrMoreInq !== false ? 3 : 11;
        it('including hasMany should make only ' + dbCalls + ' db calls', async function() {
          await new Promise((resolve, reject) => {
            let settled = false;

            const done = err => {
              if (settled)
                return;

              settled = true;

              if (err)
                reject(err);
              else
                resolve();
            };
            const self = this;
            User.find({include: ['posts', 'passports']}, function(err, users) {
              assert.ok(err == null);
              assert.ok(users != null);
              assert.ok(users.length);
              users.forEach(function(user) {
                // The relation should be promoted as the 'owner' property
                assert.ok('posts' in user);
                assert.ok('passports' in user);

                const userObj = user.toJSON();
                assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'posts'));
                assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'passports'));
                assert.ok(userObj.posts instanceof Array);
                assert.ok(userObj.passports instanceof Array);

                // The __cachedRelations should be removed from json output
                assert.ok(!Object.prototype.hasOwnProperty.call(userObj, '__cachedRelations'));

                assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
                assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'passports'));
                user.__cachedRelations.posts.forEach(function(p) {
                  // FIXME p.userId is string in some cases.
                  assert.deepStrictEqual(p.userId && p.userId.toString(), user.id.toString());
                });
                user.__cachedRelations.passports.forEach(function(pp) {
                  // FIXME pp.owerId is string in some cases.
                  assert.deepStrictEqual(pp.ownerId && pp.ownerId.toString(), user.id.toString());
                });
              });
              assert.deepStrictEqual(self.called, dbCalls);
              done();
            });
          });
        });

        it('should not make n+1 db calls in relation syntax',
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
              const self = this;
              User.find({include: [{relation: 'posts', scope: {
                where: {title: 'Post A'},
              }}, 'passports']}, function(err, users) {
                assert.ok(err == null);
                assert.ok(users != null);
                assert.ok(users.length);
                users.forEach(function(user) {
                  // The relation should be promoted as the 'owner' property
                  assert.ok('posts' in user);
                  assert.ok('passports' in user);

                  const userObj = user.toJSON();
                  assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'posts'));
                  assert.ok(Object.prototype.hasOwnProperty.call(userObj, 'passports'));
                  assert.ok(userObj.posts instanceof Array);
                  assert.ok(userObj.passports instanceof Array);

                  // The __cachedRelations should be removed from json output
                  assert.ok(!Object.prototype.hasOwnProperty.call(userObj, '__cachedRelations'));

                  assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'posts'));
                  assert.ok(Object.prototype.hasOwnProperty.call(user.__cachedRelations, 'passports'));
                  user.__cachedRelations.posts.forEach(function(p) {
                    // FIXME p.userId is string in some cases.
                    assert.deepStrictEqual(p.userId.toString(), user.id.toString());
                    assert.strictEqual(p.title, 'Post A');
                  });
                  user.__cachedRelations.passports.forEach(function(pp) {
                    // FIXME p.userId is string in some cases.
                    assert.deepStrictEqual(pp.ownerId.toString(), user.id.toString());
                  });
                });
                assert.deepStrictEqual(self.called, dbCalls);
                done();
              });
            });
          });

        it('should support disableInclude for hasAndBelongsToMany', function() {
          const Patient = db.define('Patient', {name: String});
          const Doctor = db.define('Doctor', {name: String});
          const DoctorPatient = db.define('DoctorPatient');
          Doctor.hasAndBelongsToMany('patients', {
            model: 'Patient',
            options: {disableInclude: true},
          });

          let doctor;
          return db.automigrate(['Patient', 'Doctor', 'DoctorPatient']).then(function() {
            return Doctor.create({name: 'Who'});
          }).then(function(inst) {
            doctor = inst;
            return doctor.patients.create({name: 'Lazarus'});
          }).then(function() {
            return Doctor.find({include: ['patients']});
          }).then(function(list) {
            assert.strictEqual(list.length, 1);
            assert.ok(!Object.prototype.hasOwnProperty.call(list[0].toJSON(), 'patients'));
          });
        });
      });
    });

  let createdUsers = [];
  let createdPassports = [];
  let createdProfiles = [];
  let createdPosts = [];
  async function setup() {
    await new Promise((resolve, reject) => {
      let settled = false;

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
      City = db.define('City');
      Street = db.define('Street');
      Building = db.define('Building');
      User = db.define('User', {
        name: String,
        age: Number,
      });
      Profile = db.define('Profile', {
        profileName: String,
      });
      AccessToken = db.define('AccessToken', {
        token: String,
      });
      Passport = db.define('Passport', {
        number: String,
        expirationDate: Date,
      });
      Post = db.define('Post', {
        title: {type: String, index: true},
      });

      Passport.belongsTo('owner', {model: User});
      User.hasMany('passports', {foreignKey: 'ownerId'});
      User.hasMany('posts', {foreignKey: 'userId'});
      User.hasMany('accesstokens', {
        foreignKey: 'userId',
        options: {disableInclude: true},
      });
      Profile.belongsTo('user', {model: User});
      User.hasOne('profile', {foreignKey: 'userId'});
      Post.belongsTo('author', {model: User, foreignKey: 'userId'});

      Assembly = db.define('Assembly', {
        name: String,
      });

      Part = db.define('Part', {
        partNumber: String,
      });

      Assembly.hasAndBelongsToMany(Part);
      Part.hasAndBelongsToMany(Assembly);

      db.automigrate(function() {
        createUsers();
        function createUsers() {
          clearAndCreate(
            User,
            [
              {name: 'User A', age: 21},
              {name: 'User B', age: 22},
              {name: 'User C', age: 23},
              {name: 'User D', age: 24},
              {name: 'User E', age: 25},
            ],

            function(items) {
              createdUsers = items;
              createPassports();
              createAccessTokens();
            },
          );
        }
        function createAccessTokens() {
          clearAndCreate(
            AccessToken,
            [
              {token: '1', userId: createdUsers[0].id},
              {token: '2', userId: createdUsers[1].id},
            ],
            function(items) {},
          );
        }

        function createPassports() {
          clearAndCreate(
            Passport,
            [
              {number: '1', ownerId: createdUsers[0].id},
              {number: '2', ownerId: createdUsers[1].id},
              {number: '3'},
              {number: '4', ownerId: createdUsers[2].id},
            ],
            function(items) {
              createdPassports = items;
              createPosts();
            },
          );
        }

        function createProfiles() {
          clearAndCreate(
            Profile,
            [
              {profileName: 'Profile A', userId: createdUsers[0].id},
              {profileName: 'Profile B', userId: createdUsers[1].id},
              {profileName: 'Profile Z'},
            ],
            function(items) {
              createdProfiles = items;
              done();
            },
          );
        }

        function createPosts() {
          clearAndCreate(
            Post,
            [
              {title: 'Post A', userId: createdUsers[0].id},
              {title: 'Post B', userId: createdUsers[0].id},
              {title: 'Post C', userId: createdUsers[0].id},
              {title: 'Post D', userId: createdUsers[1].id},
              {title: 'Post E'},
            ],
            function(items) {
              createdPosts = items;
              createProfiles();
            },
          );
        }
      });
    });
  }

  function clearAndCreate(model, data, callback) {
    const createdItems = [];
    model.destroyAll(function() {
      nextItem(null, null);
    });

    let itemIndex = 0;

    function nextItem(err, lastItem) {
      if (lastItem !== null) {
        createdItems.push(lastItem);
      }
      if (itemIndex >= data.length) {
        callback(createdItems);
        return;
      }
      model.create(data[itemIndex], nextItem);
      itemIndex++;
    }
  }

  describe('Model instance with included relation .toJSON()', function() {
    let db, ChallengerModel, GameParticipationModel, ResultModel;

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
        db = new DataSource({connector: 'memory'});
        ChallengerModel = db.createModel('Challenger',
          {
            name: String,
          },
          {
            relations: {
              gameParticipations: {
                type: 'hasMany',
                model: 'GameParticipation',
                foreignKey: '',
              },
            },
          });
        GameParticipationModel = db.createModel('GameParticipation',
          {
            date: Date,
          },
          {
            relations: {
              challenger: {
                type: 'belongsTo',
                model: 'Challenger',
                foreignKey: '',
              },
              results: {
                type: 'hasMany',
                model: 'Result',
                foreignKey: '',
              },
            },
          });
        ResultModel = db.createModel('Result', {
          points: Number,
        }, {
          relations: {
            gameParticipation: {
              type: 'belongsTo',
              model: 'GameParticipation',
              foreignKey: '',
            },
          },
        });

        createChallengers(function(err, challengers) {
          if (err) return done(err);
          createGameParticipations(challengers, function(err, gameParticipations) {
            if (err) return done(err);
            createResults(gameParticipations, done);
          });
        });
      });
    });

    function createChallengers(callback) {
      ChallengerModel.create([{name: 'challenger1'}, {name: 'challenger2'}], callback);
    }

    function createGameParticipations(challengers, callback) {
      GameParticipationModel.create([
        {challengerId: challengers[0].id, date: Date.now()},
        {challengerId: challengers[0].id, date: Date.now()},
      ], callback);
    }

    function createResults(gameParticipations, callback) {
      ResultModel.create([
        {gameParticipationId: gameParticipations[0].id, points: 10},
        {gameParticipationId: gameParticipations[0].id, points: 20},
      ], callback);
    }

    it('should recursively serialize objects', async function() {
      await new Promise((resolve, reject) => {
        let settled = false;

        const done = err => {
          if (settled)
            return;

          settled = true;

          if (err)
            reject(err);
          else
            resolve();
        };
        const filter = {include: {gameParticipations: 'results'}};
        ChallengerModel.find(filter, function(err, challengers) {
          const levelOneInclusion = challengers[0].toJSON().gameParticipations[0];
          assert(levelOneInclusion.__data === undefined, '.__data of a level 1 inclusion is undefined.');

          const levelTwoInclusion = challengers[0].toJSON().gameParticipations[0].results[0];
          assert(levelTwoInclusion.__data === undefined, '__data of a level 2 inclusion is undefined.');
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
