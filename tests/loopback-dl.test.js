// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test was migrated to node:test.
'use strict';

const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} = require('node:test');
const assert = require('node:assert/strict');

require('./init.js');

const jdb = require('../');
const ModelBuilder = jdb.ModelBuilder;
const DataSource = jdb.DataSource;

describe('ModelBuilder', function() {
  it('supports plain models', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {
        name: String,
        bio: ModelBuilder.Text,
        approved: Boolean,
        joinedAt: Date,
        age: Number,
      });

      // define any custom method
      User.prototype.getNameAndAge = function() {
        return this.name + ', ' + this.age;
      };

      assert.strictEqual(typeof modelBuilder.models, 'object');
      assert.strictEqual(modelBuilder.models.User, User);
      assert.strictEqual(typeof modelBuilder.definitions, 'object');
      assert.ok(Object.prototype.hasOwnProperty.call(modelBuilder.definitions, 'User'));

      const user = new User({name: 'Joe', age: 20, xyz: false});

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert.strictEqual(user.name, 'Joe');
      assert.strictEqual(user.age, 20);
      assert.strictEqual(user.xyz, false);
      assert.strictEqual(user.bio, undefined);
      resolve();
    });
  });

  it('ignores unknown properties in strict mode', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, bio: String}, {strict: true});

      const user = new User({name: 'Joe', age: 20});

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert.strictEqual(user.name, 'Joe');
      assert.ok(!Object.prototype.hasOwnProperty.call(user, 'age'));
      assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(), 'age'));
      assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(true), 'age'));
      assert.strictEqual(user.bio, undefined);
      resolve();
    });
  });

  it('ignores non-predefined properties in strict mode', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, bio: String}, {strict: true});

      const user = new User({name: 'Joe'});
      user.age = 10;
      user.bio = 'me';

      assert.strictEqual(user.name, 'Joe');
      assert.strictEqual(user.bio, 'me');

      // Non predefined property age should be ignored in strict mode if schemaOnly parameter is not false
      assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(), 'age'));
      assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(true), 'age'));
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(false), 'age')); assert.strictEqual(user.toObject(false).age, 10);

      // Predefined property bio should be kept in strict mode
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(), 'bio')); assert.strictEqual(user.toObject().bio, 'me');
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(true), 'bio')); assert.strictEqual(user.toObject(true).bio, 'me');
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(false), 'bio')); assert.strictEqual(user.toObject(false).bio, 'me');
      resolve();
    });
  });

  it('throws an error when unknown properties are used if strict=throw', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, bio: String}, {strict: 'throw'});

      try {
        const user = new User({name: 'Joe', age: 20});
        assert(false, 'The code should have thrown an error');
      } catch (e) {
        assert(true, 'The code is expected to throw an error');
      }
      resolve();
    });
  });

  it('supports open models', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {}, {strict: false});

      const user = new User({name: 'Joe', age: 20});

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert.strictEqual(user.name, 'Joe');
      assert.strictEqual(user.age, 20);
      assert.ok(!Object.prototype.hasOwnProperty.call(user, 'bio'));
      resolve();
    });
  });

  it('accepts non-predefined properties in non-strict mode', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, bio: String}, {strict: false});

      const user = new User({name: 'Joe'});
      user.age = 10;
      user.bio = 'me';

      assert.strictEqual(user.name, 'Joe');
      assert.strictEqual(user.bio, 'me');

      // Non predefined property age should be kept in non-strict mode
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(), 'age')); assert.strictEqual(user.toObject().age, 10);
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(true), 'age')); assert.strictEqual(user.toObject(true).age, 10);
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(false), 'age')); assert.strictEqual(user.toObject(false).age, 10);

      // Predefined property bio should be kept
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(), 'bio')); assert.strictEqual(user.toObject().bio, 'me');
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject({onlySchema: true}), 'bio')); assert.strictEqual(user.toObject({onlySchema: true}).bio, 'me');
      assert.ok(Object.prototype.hasOwnProperty.call(user.toObject({onlySchema: false}), 'bio')); assert.strictEqual(user.toObject({onlySchema: false}).bio, 'me');

      resolve();
    });
  });

  it('uses non-strict mode by default', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {});

      const user = new User({name: 'Joe', age: 20});

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert.ok(Object.prototype.hasOwnProperty.call(user, 'name'));
      assert.strictEqual(user.name, 'Joe');
      assert.ok(Object.prototype.hasOwnProperty.call(user, 'name')); assert.strictEqual(user.name, 'Joe');
      assert.ok(Object.prototype.hasOwnProperty.call(user, 'age')); assert.strictEqual(user.age, 20);
      assert.ok(!Object.prototype.hasOwnProperty.call(user, 'bio'));
      resolve();
    });
  });

  it('supports nested model definitions', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      // simplier way to describe model
      const User = modelBuilder.define('User', {
        name: String,
        bio: ModelBuilder.Text,
        approved: Boolean,
        joinedAt: Date,
        age: Number,
        address: {
          street: String,
          city: String,
          state: String,
          zipCode: String,
          country: String,
        },
        emails: [
          {
            label: String,
            email: String,
          },
        ],
        friends: [String],
      });

      // define any custom method
      User.prototype.getNameAndAge = function() {
        return this.name + ', ' + this.age;
      };

      assert.strictEqual(typeof modelBuilder.models, 'object');
      assert.strictEqual(modelBuilder.models.User, User);
      assert.strictEqual(typeof modelBuilder.definitions, 'object');
      assert.ok(Object.prototype.hasOwnProperty.call(modelBuilder.definitions, 'User'));

      let user = new User({
        name: 'Joe', age: 20,
        address: {street: '123 Main St', 'city': 'San Jose', state: 'CA'},
        emails: [
          {label: 'work', email: 'xyz@sample.com'},
        ],
        friends: ['Mary', 'John'],
      });

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert.strictEqual(user.name, 'Joe');
      assert.strictEqual(user.age, 20);
      assert.strictEqual(user.bio, undefined);
      assert.ok(user.address);
      assert.strictEqual(user.address.city, 'San Jose');
      assert.strictEqual(user.address.state, 'CA');

      user = user.toObject();
      assert.strictEqual(user.emails.length, 1);
      assert.strictEqual(user.emails[0].label, 'work');
      assert.strictEqual(user.emails[0].email, 'xyz@sample.com');
      assert.strictEqual(user.friends.length, 2);
      assert.equal(user.friends[0], 'Mary');
      assert.equal(user.friends[1], 'John');
      resolve();
    });
  });

  it('allows models to be referenced by name before they are defined', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, address: 'Address'});

      let user;
      try {
        user = new User({name: 'Joe', address: {street: '123 Main St', 'city': 'San Jose', state: 'CA'}});
        assert(false, 'An exception should have been thrown');
      } catch (e) {
      // Ignore
      }

      const Address = modelBuilder.define('Address', {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      });

      user = new User({name: 'Joe', address: {street: '123 Main St', 'city': 'San Jose', state: 'CA'}});

      assert.strictEqual(User.modelName, 'User');
      assert.ok(Object.prototype.hasOwnProperty.call(User.definition.properties.address, 'type')); assert.strictEqual(User.definition.properties.address.type, Address);
      assert.strictEqual(typeof user, 'object');
      assert(user.name === 'Joe');
      assert.strictEqual(user.address.city, 'San Jose');
      assert.strictEqual(user.address.state, 'CA');
      resolve();
    });
  });

  it('defines an id property for composite ids', function() {
    const modelBuilder = new ModelBuilder();
    const Follow = modelBuilder.define('Follow', {
      followerId: {type: String, id: 1},
      followeeId: {type: String, id: 2},
      followAt: Date,
    });
    const follow = new Follow({followerId: 1, followeeId: 2});

    assert.deepEqual(follow.id, {followerId: '1', followeeId: '2'});
  });

  it('instantiates model from data with no constructor', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, age: Number});

      try {
        const data = Object.create(null);
        data.name = 'Joe';
        data.age = 20;
        const user = new User(data);
        assert(true, 'The code is expected to pass');
      } catch (e) {
        assert(false, 'The code should have not thrown an error');
      }
      resolve();
    });
  });

  it('instantiates model from data with non function constructor', async function() {
    await new Promise((resolve, reject) => {
      const modelBuilder = new ModelBuilder();

      const User = modelBuilder.define('User', {name: String, age: Number});

      try {
        const Person = function(name, age) {
          this.name = name;
          this.age = age;
        };

        Person.prototype.constructor = 'constructor';

        const data = new Person('Joe', 20);

        const user = new User(data);
        assert(false, 'The code should have thrown an error');
      } catch (e) {
        assert.strictEqual(e.message, 'Property name "constructor" is not allowed in User data');
        assert(true, 'The code is expected to throw an error');
      }
      resolve();
    });
  });
});

describe('DataSource ping', function() {
  const ds = new DataSource('memory');
  ds.settings.connectionTimeout = 50; // ms
  ds.connector.connect = function(cb) {
    // Mock up the long delay
    setTimeout(cb, 100);
  };
  ds.connector.ping = function(cb) {
    cb(new Error('bad connection 2'));
  };

  it('reports connection errors during ping', async function() {
    await new Promise((resolve, reject) => {
      ds.ping(function(err) {
        assert.strictEqual((!!err), true);
        assert.deepStrictEqual(err.message, 'bad connection 2');
        resolve();
      });
    });
  });

  it('cancels invocation after timeout', async function() {
    await new Promise((resolve, reject) => {
      ds.connected = false; // Force connect
      const Post = ds.define('Post', {
        title: {type: String, length: 255},
      });
      Post.create(function(err) {
        assert.strictEqual((!!err), true);
        assert.deepStrictEqual(err.message, 'Timeout in connecting after 50 ms');
        resolve();
      });
    });
  });
});

describe('DataSource define model', function() {
  it('supports plain model definitions', function() {
    const ds = new DataSource('memory');

    // define models
    const Post = ds.define('Post', {
      title: {type: String, length: 255},
      content: {type: ModelBuilder.Text},
      date: {type: Date, default: function() {
        return new Date();
      }},
      timestamp: {type: Number, default: Date.now},
      published: {type: Boolean, default: false, index: true},
    });

    // simpler way to describe model
    const User = ds.define('User', {
      name: String,
      bio: ModelBuilder.Text,
      approved: Boolean,
      joinedAt: {type: Date, default: Date},
      age: Number,
    });

    const Group = ds.define('Group', {group: String});
    User.mixin(Group);

    // define any custom method
    User.prototype.getNameAndAge = function() {
      return this.name + ', ' + this.age;
    };

    const user = new User({name: 'Joe', group: 'G1'});
    assert.equal(user.name, 'Joe');
    assert.equal(user.group, 'G1');

    assert(user.joinedAt instanceof Date);

    // setup relationships
    User.hasMany(Post, {as: 'posts', foreignKey: 'userId'});

    Post.belongsTo(User, {as: 'author', foreignKey: 'userId'});

    User.hasAndBelongsToMany('groups');

    const user2 = new User({name: 'Smith'});
    user2.save(function(err) {
      const post = user2.posts.build({title: 'Hello world'});
      post.save(function(err, data) {
        // console.log(err ? err : data);
      });
    });

    Post.findOne({where: {published: false}, order: 'date DESC'}, function(err, data) {
      // console.log(data);
    });

    User.create({name: 'Jeff'}, function(err, data) {
      if (err) {
        return;
      }
      const post = data.posts.build({title: 'My Post'});
    });

    User.create({name: 'Ray'}, function(err, data) {
      // console.log(data);
    });

    const Article = ds.define('Article', {title: String});
    const Tag = ds.define('Tag', {name: String});
    Article.hasAndBelongsToMany('tags');

    Article.create(function(e, article) {
      article.tags.create({name: 'popular'}, function(err, data) {
        Article.findOne(function(e, article) {
          article.tags(function(e, tags) {
            // console.log(tags);
          });
        });
      });
    });

    // should be able to attach a data source to an existing model
    const modelBuilder = new ModelBuilder();

    const Color = modelBuilder.define('Color', {
      name: String,
    });

    assert.ok(!Object.prototype.hasOwnProperty.call(Color, 'create'));

    // attach
    ds.attach(Color);
    assert.ok(Object.prototype.hasOwnProperty.call(Color, 'create'));

    Color.create({name: 'red'});
    Color.create({name: 'green'});
    Color.create({name: 'blue'});

    Color.all(function(err, colors) {
      assert.strictEqual(colors.length, 3);
    });
  });

  it('emits events during attach', function() {
    const ds = new DataSource('memory');
    const modelBuilder = new ModelBuilder();

    const User = modelBuilder.define('User', {
      name: String,
    });

    let seq = 0;
    let dataAccessConfigured = -1;
    let dataSourceAttached = -1;

    User.on('dataAccessConfigured', function(model) {
      dataAccessConfigured = seq++;
      assert(User.create);
      assert(User.hasMany);
    });

    User.on('dataSourceAttached', function(model) {
      assert(User.dataSource instanceof DataSource);
      dataSourceAttached = seq++;
    });

    ds.attach(User);
    assert.equal(dataAccessConfigured, 0);
    assert.equal(dataSourceAttached, 1);
  });

  it('ignores unknown properties in strict mode', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {name: String, bio: String}, {strict: true});

      User.create({name: 'Joe', age: 20}, function(err, user) {
        assert.strictEqual(User.modelName, 'User');
        assert.strictEqual(typeof user, 'object');
        assert(user.name === 'Joe');
        assert(user.age === undefined);
        assert(user.toObject().age === undefined);
        assert(user.toObject(true).age === undefined);
        assert(user.bio === undefined);
        resolve();
      });
    });
  });

  it('throws an error when unknown properties are used if strict=throw', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {name: String, bio: String}, {strict: 'throw'});

      try {
        const user = new User({name: 'Joe', age: 20});
        assert(false, 'The code should have thrown an error');
      } catch (e) {
        assert(true, 'The code is expected to throw an error');
      }
      resolve();
    });
  });

  describe('strict mode "validate"', function() {
    it('reports validation errors for unknown properties', function() {
      const ds = new DataSource('memory');
      const User = ds.define('User', {name: String}, {strict: 'validate'});
      const user = new User({name: 'Joe', age: 20});
      assert.strictEqual(user.isValid(), false);
      const codes = user.errors && user.errors.codes || {};
      assert.deepStrictEqual(codes.age, ['unknown-property']);
    });
  });

  it('supports open model definitions', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {}, {strict: false});
      assert.strictEqual(User.modelName, 'User');

      User.create({name: 'Joe', age: 20}, function(err, user) {
        assert.strictEqual(typeof user, 'object');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'name'));
        assert.strictEqual(user.name, 'Joe');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'name')); assert.strictEqual(user.name, 'Joe');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'age')); assert.strictEqual(user.age, 20);
        assert.ok(!Object.prototype.hasOwnProperty.call(user, 'bio'));

        User.findById(user.id, function(err, user) {
          assert.strictEqual(typeof user, 'object');
          assert.ok(Object.prototype.hasOwnProperty.call(user, 'name'));
          assert.strictEqual(user.name, 'Joe');
          assert.ok(Object.prototype.hasOwnProperty.call(user, 'name')); assert.strictEqual(user.name, 'Joe');
          assert.ok(Object.prototype.hasOwnProperty.call(user, 'age')); assert.strictEqual(user.age, 20);
          assert.ok(!Object.prototype.hasOwnProperty.call(user, 'bio'));
          resolve();
        });
      });
    });
  });

  it('uses non-strict mode by default', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {});

      User.create({name: 'Joe', age: 20}, function(err, user) {
        assert.strictEqual(User.modelName, 'User');
        assert.strictEqual(typeof user, 'object');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'name'));
        assert.strictEqual(user.name, 'Joe');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'name')); assert.strictEqual(user.name, 'Joe');
        assert.ok(Object.prototype.hasOwnProperty.call(user, 'age')); assert.strictEqual(user.age, 20);
        assert.ok(!Object.prototype.hasOwnProperty.call(user, 'bio'));
        resolve();
      });
    });
  });

  it('uses strict mode by default for relational DBs', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      ds.connector.relational = true; // HACK

      const User = ds.define('User', {name: String, bio: String}, {strict: true});

      const user = new User({name: 'Joe', age: 20});

      assert.strictEqual(User.modelName, 'User');
      assert.strictEqual(typeof user, 'object');
      assert(user.name === 'Joe');
      assert(user.age === undefined);
      assert(user.toObject().age === undefined);
      assert(user.toObject(true).age === undefined);
      assert(user.bio === undefined);
      resolve();
    });
  });

  it('throws an error with unknown properties in non-strict mode for relational DBs', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      ds.connector.relational = true; // HACK

      const User = ds.define('User', {name: String, bio: String}, {strict: 'throw'});

      try {
        const user = new User({name: 'Joe', age: 20});
        assert(false, 'The code should have thrown an error');
      } catch (e) {
        assert(true, 'The code is expected to throw an error');
      }
      resolve();
    });
  });

  it('changes the property value for save in non-strict mode', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');// define models
      const Post = ds.define('Post');

      Post.create({price: 900}, function(err, post) {
        assert.equal(post.price, 900);
        post.price = 1000;
        post.save(function(err, result) {
          assert.equal(1000, result.price);
          if (err)

            reject(err);

          else

            resolve();
        });
      });
    });
  });

  it('supports instance level strict mode', function() {
    const ds = new DataSource('memory');

    const User = ds.define('User', {name: String, bio: String}, {strict: true});

    const user = new User({name: 'Joe', age: 20}, {strict: false});

    assert.strictEqual(user.__strict, false);
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(user.name, 'Joe');
    assert.strictEqual(user.age, 20);
    assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(), 'age')); assert.strictEqual(user.toObject().age, 20);
    assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(true), 'age')); assert.strictEqual(user.toObject(true).age, 20);

    user.setStrict(true);
    assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(), 'age'));
    assert.ok(!Object.prototype.hasOwnProperty.call(user.toObject(true), 'age'));
    assert.ok(Object.prototype.hasOwnProperty.call(user.toObject(false), 'age')); assert.strictEqual(user.toObject(false).age, 20);
  });

  it('updates instances with unknown properties in non-strict mode', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');// define models
      const Post = ds.define('Post', {
        title: {type: String, length: 255, index: true},
        content: {type: String},
      });

      Post.create({title: 'a', content: 'AAA'}, function(err, post) {
        post.updateAttributes({title: 'b', xyz: 'xyz'}, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.id, post.id);
          assert.strictEqual(p.content, post.content);
          assert.strictEqual(p.xyz, 'xyz');

          Post.findById(post.id, function(err, p) {
            assert.strictEqual(p.id, post.id);
            assert.strictEqual(p.content, post.content);
            assert.strictEqual(p.xyz, 'xyz');
            assert.strictEqual(p.title, 'b');
            resolve();
          });
        });
      });
    });
  });

  it('injects id by default', async function() {
    await new Promise((resolve, reject) => {
      const ds = new ModelBuilder();

      const User = ds.define('User', {});
      assert.deepEqual(User.definition.properties.id,
        {type: Number, id: 1, generated: true, updateOnly: true});

      resolve();
    });
  });

  it('injects id with useDefaultIdType to false', async function() {
    await new Promise((resolve, reject) => {
      const ds = new ModelBuilder();

      const User = ds.define('User', {id: {type: String, generated: true, id: true, useDefaultIdType: false}});
      assert.deepEqual(User.definition.properties.id,
        {type: String, id: true, generated: true, updateOnly: true, useDefaultIdType: false});

      resolve();
    });
  });

  it('disables idInjection if the value is false', async function() {
    await new Promise((resolve, reject) => {
      const ds = new ModelBuilder();

      const User1 = ds.define('User', {}, {idInjection: false});
      assert(!User1.definition.properties.id);
      resolve();
    });
  });

  it('updates generated id type by the connector', async function() {
    await new Promise((resolve, reject) => {
      const builder = new ModelBuilder();

      const User = builder.define('User', {id: {type: String, generated: true, id: true}});
      assert.deepEqual(User.definition.properties.id,
        {type: String, id: true, generated: true, updateOnly: true});

      const ds = new DataSource('memory');// define models
      User.attachTo(ds);

      assert.deepEqual(User.definition.properties.id,
        {type: Number, id: true, generated: true, updateOnly: true});

      resolve();
    });
  });

  it('allows an explicit remoting path', function() {
    const ds = new DataSource('memory');

    const User = ds.define('User', {name: String, bio: String}, {
      http: {path: 'accounts'},
    });
    assert.strictEqual(User.http.path, '/accounts');
  });

  it('allows an explicit remoting path with leading /', function() {
    const ds = new DataSource('memory');

    const User = ds.define('User', {name: String, bio: String}, {
      http: {path: '/accounts'},
    });
    assert.strictEqual(User.http.path, '/accounts');
  });
});

describe('Model loaded with a base', function() {
  it('has a base class according to the base option', function() {
    const ds = new ModelBuilder();

    const User = ds.define('User', {name: String});

    User.staticMethod = function staticMethod() {
    };
    User.prototype.instanceMethod = function instanceMethod() {
    };

    const Customer = ds.define('Customer', {vip: Boolean}, {base: 'User'});

    assert(Customer.prototype instanceof User);
    assert(Customer.staticMethod === User.staticMethod);
    assert(Customer.prototype.instanceMethod === User.prototype.instanceMethod);
    assert.equal(Customer.base, User);
    assert.equal(Customer.base, Customer.super_);

    try {
      const Customer1 = ds.define('Customer1', {vip: Boolean}, {base: 'User1'});
    } catch (e) {
      assert(e);
    }
  });

  it('inherits properties from base model', function() {
    const ds = new ModelBuilder();

    const User = ds.define('User', {name: String});

    const Customer = ds.define('Customer', {vip: Boolean}, {base: 'User'});

    assert.ok(Object.prototype.hasOwnProperty.call(Customer.definition.properties, 'name'));
    assert.ok(Object.prototype.hasOwnProperty.call(Customer.definition.properties.name, 'type')); assert.strictEqual(Customer.definition.properties.name.type, String);
  });

  it('inherits properties by clone from base model', function() {
    const ds = new ModelBuilder();

    const User = ds.define('User', {name: String});

    const Customer1 = ds.define('Customer1', {vip: Boolean}, {base: 'User'});
    const Customer2 = ds.define('Customer2', {vip: Boolean}, {base: 'User'});

    assert.ok(Object.prototype.hasOwnProperty.call(Customer1.definition.properties, 'name'));
    assert.ok(Object.prototype.hasOwnProperty.call(Customer2.definition.properties, 'name'));
    assert.notStrictEqual(Customer1.definition.properties.name,
      Customer2.definition.properties.name);
    assert.deepStrictEqual(Customer1.definition.properties.name,
      Customer2.definition.properties.name);
  });

  it('can remove properties from base model', function() {
    const ds = new ModelBuilder();

    const User = ds.define('User', {username: String, email: String});

    const Customer = ds.define('Customer',
      {name: String, username: null, email: false},
      {base: 'User'});

    assert.ok(Object.prototype.hasOwnProperty.call(Customer.definition.properties, 'name'));
    // username/email are now shielded
    assert.ok(!Object.prototype.hasOwnProperty.call(Customer.definition.properties, 'username'));
    assert.ok(!Object.prototype.hasOwnProperty.call(Customer.definition.properties, 'email'));
    const c = new Customer({name: 'John'});
    assert.strictEqual(c.username, undefined);
    assert.strictEqual(c.email, undefined);
    assert.strictEqual(c.name, 'John');
    const u = new User({username: 'X', email: 'x@y.com'});
    assert.ok(!Object.prototype.hasOwnProperty.call(u, 'name'));
    assert.strictEqual(u.username, 'X');
    assert.strictEqual(u.email, 'x@y.com');
  });

  it('can configure base class via parent argument', function() {
    const ds = new ModelBuilder();

    const User = ds.define('User', {name: String});

    User.staticMethod = function staticMethod() {
    };
    User.prototype.instanceMethod = function instanceMethod() {
    };

    const Customer = ds.define('Customer', {vip: Boolean}, {}, User);

    assert.ok(Object.prototype.hasOwnProperty.call(Customer.definition.properties, 'name'));
    assert.ok(Object.prototype.hasOwnProperty.call(Customer.definition.properties.name, 'type')); assert.strictEqual(Customer.definition.properties.name.type, String);

    assert(Customer.prototype instanceof User);
    assert(Customer.staticMethod === User.staticMethod);
    assert(Customer.prototype.instanceMethod === User.prototype.instanceMethod);
    assert.equal(Customer.base, User);
    assert.equal(Customer.base, Customer.super_);
  });
});

describe('Models attached to a dataSource', function() {
  let Post;
  before(function() {
    const ds = new DataSource('memory');// define models
    Post = ds.define('Post', {
      title: {type: String, length: 255, index: true},
      content: {type: String},
      comments: [String],
    }, {forceId: false});
  });

  beforeEach(async function() {
    await new Promise((resolve, reject) => {
      Post.destroyAll(err => {
        if (err)
          reject(err);
        else
          resolve();
      });
    });
  });

  describe('updateOrCreate', function() {
    it('updates instances', async function() {
      await new Promise((resolve, reject) => {
        Post.create({title: 'a', content: 'AAA'}, function(err, post) {
          post.title = 'b';
          Post.updateOrCreate(post, function(err, p) {
            assert.ok(err == null);
            assert.strictEqual(p.id, post.id);
            assert.strictEqual(p.content, post.content);
            assert.ok(p._id == null);

            Post.findById(post.id, function(err, p) {
              assert.strictEqual(p.id, post.id);
              assert.ok(p._id == null);
              assert.strictEqual(p.content, post.content);
              assert.strictEqual(p.title, 'b');
              resolve();
            });
          });
        });
      });
    });

    it('updates instances without removing existing properties', async function() {
      await new Promise((resolve, reject) => {
        Post.create({title: 'a', content: 'AAA', comments: ['Comment1']}, function(err, post) {
          post = post.toObject();
          delete post.title;
          delete post.comments;
          Post.updateOrCreate(post, function(err, p) {
            assert.ok(err == null);
            assert.strictEqual(p.id, post.id);
            assert.strictEqual(p.content, post.content);
            assert.ok(p._id == null);

            Post.findById(post.id, function(err, p) {
              assert.strictEqual(p.id, post.id);
              assert.ok(p._id == null);
              assert.strictEqual(p.content, post.content);
              assert.strictEqual(p.title, 'a');
              assert.strictEqual(p.comments.length, 1);
              assert.strictEqual(p.comments[0], 'Comment1');
              resolve();
            });
          });
        });
      });
    });

    it('creates a new instance if it does not exist', async function() {
      await new Promise((resolve, reject) => {
        const post = {id: 123, title: 'a', content: 'AAA'};
        Post.updateOrCreate(post, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.title, post.title);
          assert.strictEqual(p.content, post.content);
          assert.strictEqual(p.id, post.id);

          Post.findById(p.id, function(err, p) {
            assert.strictEqual(p.id, post.id);
            assert.ok(p._id == null);
            assert.strictEqual(p.content, post.content);
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.id, post.id);
            resolve();
          });
        });
      });
    });
  });

  describe('save', function() {
    it('updates instance with the same id', async function() {
      await new Promise((resolve, reject) => {
        Post.create({title: 'a', content: 'AAA'}, function(err, post) {
          post.title = 'b';
          post.save(function(err, p) {
            assert.ok(err == null);
            assert.strictEqual(p.id, post.id);
            assert.strictEqual(p.content, post.content);
            assert.ok(p._id == null);

            Post.findById(post.id, function(err, p) {
              assert.strictEqual(p.id, post.id);
              assert.ok(p._id == null);
              assert.strictEqual(p.content, post.content);
              assert.strictEqual(p.title, 'b');
              resolve();
            });
          });
        });
      });
    });

    it('updates the instance without removing existing properties', async function() {
      await new Promise((resolve, reject) => {
        Post.create({title: 'a', content: 'AAA'}, function(err, post) {
          delete post.title;
          post.save(function(err, p) {
            assert.ok(err == null);
            assert.strictEqual(p.id, post.id);
            assert.strictEqual(p.content, post.content);
            assert.ok(p._id == null);

            Post.findById(post.id, function(err, p) {
              assert.strictEqual(p.id, post.id);
              assert.ok(p._id == null);
              assert.strictEqual(p.content, post.content);
              assert.strictEqual(p.title, 'a');
              resolve();
            });
          });
        });
      });
    });

    it('creates a new instance if it does not exist', async function() {
      await new Promise((resolve, reject) => {
        const post = new Post({id: '123', title: 'a', content: 'AAA'});
        post.save(post, function(err, p) {
          assert.ok(err == null);
          assert.strictEqual(p.title, post.title);
          assert.strictEqual(p.content, post.content);
          assert.strictEqual(p.id, post.id);

          Post.findById(p.id, function(err, p) {
            assert.strictEqual(p.id, post.id);
            assert.ok(p._id == null);
            assert.strictEqual(p.content, post.content);
            assert.strictEqual(p.title, post.title);
            assert.strictEqual(p.id, post.id);
            resolve();
          });
        });
      });
    });
  });
});

describe('DataSource connector types', function() {
  it('returns an array of types using getTypes', function() {
    const ds = new DataSource('memory');
    const types = ds.getTypes();
    assert.deepEqual(types, ['db', 'nosql', 'memory']);
  });

  describe('supportTypes', function() {
    it('tests supported types by string', function() {
      const ds = new DataSource('memory');
      const result = ds.supportTypes('db');
      assert(result);
    });

    it('tests supported types by array', function() {
      const ds = new DataSource('memory');
      const result = ds.supportTypes(['db', 'memory']);
      assert(result);
    });

    it('tests unsupported types by string', function() {
      const ds = new DataSource('memory');
      const result = ds.supportTypes('rdbms');
      assert(!result);
    });

    it('tests unsupported types by array', function() {
      const ds = new DataSource('memory');
      let result = ds.supportTypes(['rdbms', 'memory']);
      assert(!result);

      result = ds.supportTypes(['rdbms']);
      assert(!result);
    });
  });
});

describe('DataSource._resolveConnector', function() {
  // Mocked require
  const loader = function(name) {
    if (name.indexOf('./connectors/') !== -1) {
      // ./connectors/<name> doesn't exist
      return null;
    }
    if (name === 'loopback-connector-abc') {
      // Assume loopback-connector-abc doesn't exist
      return null;
    }
    return {
      name: name,
    };
  };

  it('resolves connector by path', function() {
    const connector = DataSource._resolveConnector(__dirname + '/../lib/connectors/memory');
    assert(connector.connector);
  });
  it('resolves connector by internal name', function() {
    const connector = DataSource._resolveConnector('memory');
    assert(connector.connector);
  });
  it('resolves connector by module name starting with loopback-connector-', function() {
    const connector = DataSource._resolveConnector('loopback-connector-xyz', loader);
    assert(connector.connector);
  });
  it('resolves connector by short module name with full name first', function() {
    const connector = DataSource._resolveConnector('xyz', loader);
    assert(connector.connector);
    assert.equal(connector.connector.name, 'loopback-connector-xyz');
  });
  it('resolves connector by short module name', function() {
    const connector = DataSource._resolveConnector('abc', loader);
    assert(connector.connector);
    assert.equal(connector.connector.name, 'abc');
  });
  it('resolves connector by short module name for known connectors', function() {
    const connector = DataSource._resolveConnector('oracle', loader);
    assert(connector.connector);
    assert.equal(connector.connector.name, 'loopback-connector-oracle');
  });
  it('resolves connector by full module name', function() {
    const connector = DataSource._resolveConnector('loopback-xyz', loader);
    assert(connector.connector);
  });
  it('fails to resolve connector by module name starting with loopback-connector-', function() {
    const connector = DataSource._resolveConnector('loopback-connector-xyz');
    assert(!connector.connector);
    assert(connector.error.indexOf('loopback-connector-xyz') !== -1);
  });
  it('fails resolve invalid connector by short module name', function() {
    const connector = DataSource._resolveConnector('xyz');
    assert(!connector.connector);
    assert(connector.error.indexOf('loopback-connector-xyz') !== -1);
  });
  it('fails to resolve invalid connector by full module name', function() {
    const connector = DataSource._resolveConnector('loopback-xyz');
    assert(!connector.connector);
    assert(connector.error.indexOf('loopback-connector-loopback-xyz') !== -1);
  });
});

describe('Model define with relations configuration', function() {
  it('sets up hasMany relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Post = ds.define('Post', {userId: Number, content: String});
      const User = ds.define('User', {name: String}, {
        relations: {posts: {type: 'hasMany', model: 'Post'}},
      });

      assert(User.relations['posts']);
      resolve();
    });
  });

  it('sets up belongsTo relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {name: String});
      const Post = ds.define('Post', {userId: Number, content: String}, {
        relations: {user: {type: 'belongsTo', model: 'User'}},
      });

      assert(Post.relations['user']);
      resolve();
    });
  });

  it('sets up referencesMany relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Post = ds.define('Post', {userId: Number, content: String});
      const User = ds.define('User', {name: String}, {
        relations: {posts: {type: 'referencesMany', model: 'Post'}},
      });

      assert(User.relations['posts']);
      resolve();
    });
  });

  it('sets up embedsMany relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Post = ds.define('Post', {userId: Number, content: String});
      const User = ds.define('User', {name: String}, {
        relations: {posts: {type: 'embedsMany', model: 'Post'}},
      });

      assert(User.relations['posts']);
      resolve();
    });
  });

  it('sets up belongsTo polymorphic relation with `{polymorphic: true}`', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Product = ds.define('Product', {name: String}, {relations: {
        pictures: {type: 'hasMany', model: 'Picture', polymorphic: 'imageable'},
      }});
      const Picture = ds.define('Picture', {name: String}, {relations: {
        imageable: {type: 'belongsTo', polymorphic: true},
      }});

      assert(Picture.relations['imageable']);
      assert.deepEqual(Picture.relations['imageable'].toJSON(), {
        name: 'imageable',
        type: 'belongsTo',
        modelFrom: 'Picture',
        keyFrom: 'imageableId',
        modelTo: '<polymorphic>',
        keyTo: 'id',
        multiple: false,
        polymorphic: {
          selector: 'imageable',
          foreignKey: 'imageableId',
          discriminator: 'imageableType',
        },
      });
      resolve();
    });
  });

  it('sets up hasMany polymorphic relation with `{polymorphic: belongsToRelationName}`', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Picture = ds.define('Picture', {name: String}, {relations: {
        imageable: {type: 'belongsTo', polymorphic: true},
      }});
      const Product = ds.define('Product', {name: String}, {relations: {
        pictures: {type: 'hasMany', model: 'Picture', polymorphic: 'imageable'},
      }});

      assert(Product.relations['pictures']);
      assert.deepEqual(Product.relations['pictures'].toJSON(), {
        name: 'pictures',
        type: 'hasMany',
        modelFrom: 'Product',
        keyFrom: 'id',
        modelTo: 'Picture',
        keyTo: 'imageableId',
        multiple: true,
        polymorphic: {
          selector: 'imageable',
          foreignKey: 'imageableId',
          discriminator: 'imageableType',
        },
      });
      resolve();
    });
  });

  it('creates a foreign key with the correct type', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {name: String, id: {type: String, id: true}});
      const Post = ds.define('Post', {content: String}, {relations: {
        user: {type: 'belongsTo', model: 'User'}},
      });

      const fk = Post.definition.properties['userId'];
      assert(fk, 'The foreign key should be added');
      assert(fk.type === String, 'The foreign key should be the same type as primary key');
      assert(Post.relations['user'], 'User relation should be set');
      resolve();
    });
  });

  it('sets up related hasMany and belongsTo relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const User = ds.define('User', {name: String}, {
        relations: {
          posts: {type: 'hasMany', model: 'Post'},
          accounts: {type: 'hasMany', model: 'Account'},
        },
      });

      assert(!User.relations['posts']);
      assert(!User.relations['accounts']);

      const Post = ds.define('Post', {userId: Number, content: String}, {
        relations: {user: {type: 'belongsTo', model: 'User'}},
      });

      const Account = ds.define('Account', {userId: Number, type: String}, {
        relations: {user: {type: 'belongsTo', model: 'User'}},
      });

      assert(Post.relations['user']);
      assert.deepEqual(Post.relations['user'].toJSON(), {
        name: 'user',
        type: 'belongsTo',
        modelFrom: 'Post',
        keyFrom: 'userId',
        modelTo: 'User',
        keyTo: 'id',
        multiple: false,
      });
      assert(User.relations['posts']);
      assert.deepEqual(User.relations['posts'].toJSON(), {
        name: 'posts',
        type: 'hasMany',
        modelFrom: 'User',
        keyFrom: 'id',
        modelTo: 'Post',
        keyTo: 'userId',
        multiple: true,
      });
      assert(User.relations['accounts']);
      assert.deepEqual(User.relations['accounts'].toJSON(), {
        name: 'accounts',
        type: 'hasMany',
        modelFrom: 'User',
        keyFrom: 'id',
        modelTo: 'Account',
        keyTo: 'userId',
        multiple: true,
      });

      resolve();
    });
  });

  it('throws an error if a relation is missing type', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Post = ds.define('Post', {userId: Number, content: String});

      try {
        const User = ds.define('User', {name: String}, {
          relations: {posts: {model: 'Post'}},
        });
      } catch (e) {
        resolve();
      }
    });
  });

  it('throws an error if a relation type is invalid', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');

      const Post = ds.define('Post', {userId: Number, content: String});

      try {
        const User = ds.define('User', {name: String}, {
          relations: {posts: {type: 'hasXYZ', model: 'Post'}},
        });
      } catch (e) {
        resolve();
      }
    });
  });

  it('sets up hasMany through relations', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Physician = ds.createModel('Physician', {
        name: String,
      }, {
        relations: {
          patients: {model: 'Patient', type: 'hasMany', through: 'Appointment'},
        },
      });

      const Patient = ds.createModel('Patient', {
        name: String,
      }, {
        relations: {
          physicians: {model: 'Physician', type: 'hasMany', through: 'Appointment'},
        },
      });

      assert(!Physician.relations['patients']); // Appointment hasn't been resolved yet
      assert(!Patient.relations['physicians']); // Appointment hasn't been resolved yet

      const Appointment = ds.createModel('Appointment', {
        physicianId: Number,
        patientId: Number,
        appointmentDate: Date,
      }, {
        relations: {
          patient: {type: 'belongsTo', model: 'Patient'},
          physician: {type: 'belongsTo', model: 'Physician'},
        },
      });

      assert(Physician.relations['patients']);
      assert(Patient.relations['physicians']);
      resolve();
    });
  });

  it('sets up hasMany through relations with options', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Physician = ds.createModel('Physician', {
        name: String,
      }, {
        relations: {
          patients: {model: 'Patient', type: 'hasMany', foreignKey: 'leftId', through: 'Appointment'},
        },
      });

      const Patient = ds.createModel('Patient', {
        name: String,
      }, {
        relations: {
          physicians: {model: 'Physician', type: 'hasMany', foreignKey: 'rightId', through: 'Appointment'},
        },
      });

      const Appointment = ds.createModel('Appointment', {
        physicianId: Number,
        patientId: Number,
        appointmentDate: Date,
      }, {
        relations: {
          patient: {type: 'belongsTo', model: 'Patient'},
          physician: {type: 'belongsTo', model: 'Physician'},
        },
      });

      assert(Physician.relations['patients'].keyTo === 'leftId');
      assert(Patient.relations['physicians'].keyTo === 'rightId');
      resolve();
    });
  });

  it('sets up relations after attach', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const modelBuilder = new ModelBuilder();

      const Post = modelBuilder.define('Post', {userId: Number, content: String});
      const User = modelBuilder.define('User', {name: String}, {
        relations: {posts: {type: 'hasMany', model: 'Post'},
        }});

      assert(!User.relations['posts']);
      Post.attachTo(ds);
      User.attachTo(ds);
      assert(User.relations['posts']);
      resolve();
    });
  });
});

describe('Model define with scopes configuration', function() {
  it('creates scopes', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const User = ds.define('User', {name: String, vip: Boolean, age: Number},
        {scopes: {vips: {where: {vip: true}}, top5: {limit: 5, order: 'age'}}});

      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push({name: 'User' + i, vip: i % 3 === 0, age: 20 + i * 2});
      }
      Promise.all(users.map(user => User.create(user)))
        .then(function() {
          User.vips(function(err, vips) {
            if (err) {
              if (err)

                return reject(err);

              resolve();
            }
            assert.equal(vips.length, 4);
            User.top5(function(err, top5) {
              assert.equal(top5.length, 5);
              if (err)

                reject(err);

              else

                resolve();
            });
          });
        })
        .catch(reject);
    });
  });
});

describe('DataAccessObject._forDB', function() {
  const ds = new DataSource('memory');
  const dao = ds.DataAccessObject;

  it('should return input data if dataSource is not relational', function() {
    const inputData = {testKey: 'testValue'};
    dao.getDataSource = () => ({isRelational: () => false});

    const outputData = dao._forDB(inputData);

    assert.deepEqual(outputData, inputData);
  });

  it('should return JSON stringified values for appropriate types', function() {
    const inputData = {
      key1: [1, 2, 3],
      key2: {subKey: 'value'},
      key3: 'nonJSONvalue',
    };
    dao.getDataSource = () => ({isRelational: () => true});
    dao.getPropertyType = (propName) => (propName !== 'key3' ? 'JSON' : 'String');

    const outputData = dao._forDB(inputData);

    assert.deepEqual(outputData, {
      key1: JSON.stringify([1, 2, 3]),
      key2: JSON.stringify({subKey: 'value'}),
      key3: 'nonJSONvalue',
    });
  });

  it('should return original value for non JSON, non Array types', function() {
    const inputData = {key1: 'string', key2: 123, key3: true};
    dao.getDataSource = () => ({isRelational: () => true});
    dao.getPropertyType = () => 'String';

    const outputData = dao._forDB(inputData);

    assert.deepEqual(outputData, inputData);
  });

  it('should not process null values', function() {
    const inputData = {key1: 'value', key2: null};
    dao.getDataSource = () => ({isRelational: () => true});
    dao.getPropertyType = (propName) => 'JSON';

    const outputData = dao._forDB(inputData);

    assert.deepEqual(outputData, {key1: JSON.stringify('value'), key2: null});
  });
});

describe('DataAccessObject', function() {
  let ds, model, where, error, filter;

  before(function() {
    ds = new DataSource('memory');
    model = ds.createModel('M1', {
      id: {type: String, id: true},
      age: Number,
      string: 'string',
      vip: Boolean,
      date: Date,
      location: 'GeoPoint',
      scores: [Number],
      array: 'array',
      object: 'object',
    });
  });

  beforeEach(function() {
    error = null;
  });

  it('coerces where clause for string types', function() {
    where = model._coerce({id: 1});
    assert.deepEqual(where, {id: '1'});
    where = model._coerce({id: '1'});
    assert.deepEqual(where, {id: '1'});

    // Mockup MongoDB ObjectID
    function ObjectID(id) {
      this.id = id;
    }

    ObjectID.prototype.toString = function() {
      return this.id;
    };

    where = model._coerce({id: new ObjectID('1')});
    assert.deepEqual(where, {id: '1'});
  });

  it('coerces where clause for number types', function() {
    where = model._coerce({age: '10'});
    assert.deepEqual(where, {age: 10});

    where = model._coerce({age: 10});
    assert.deepEqual(where, {age: 10});

    where = model._coerce({age: {gt: 10}});
    assert.deepEqual(where, {age: {gt: 10}});

    where = model._coerce({age: {gt: '10'}});
    assert.deepEqual(where, {age: {gt: 10}});

    where = model._coerce({age: {between: ['10', '20']}});
    assert.deepEqual(where, {age: {between: [10, 20]}});
  });

  it('coerces where clause for array types', function() {
    where = model._coerce({scores: ['10', '20']});
    assert.deepEqual(where, {scores: [10, 20]});
  });

  it('coerces where clause for date types', function() {
    const d = new Date();
    where = model._coerce({date: d});
    assert.deepEqual(where, {date: d});

    where = model._coerce({date: d.toISOString()});
    assert.deepEqual(where, {date: d});
  });

  it('coerces where clause for boolean types', function() {
    where = model._coerce({vip: 'true'});
    assert.deepEqual(where, {vip: true});

    where = model._coerce({vip: true});
    assert.deepEqual(where, {vip: true});

    where = model._coerce({vip: 'false'});
    assert.deepEqual(where, {vip: false});

    where = model._coerce({vip: false});
    assert.deepEqual(where, {vip: false});

    where = model._coerce({vip: '1'});
    assert.deepEqual(where, {vip: true});

    where = model._coerce({vip: 0});
    assert.deepEqual(where, {vip: false});

    where = model._coerce({vip: ''});
    assert.deepEqual(where, {vip: false});
  });

  it('coerces where clause with and operators', function() {
    where = model._coerce({and: [{age: '10'}, {vip: 'true'}]});
    assert.deepEqual(where, {and: [{age: 10}, {vip: true}]});
  });

  it('coerces where clause with or operators', function() {
    where = model._coerce({or: [{age: '10'}, {vip: 'true'}]});
    assert.deepEqual(where, {or: [{age: 10}, {vip: true}]});
  });

  it('continues to coerce properties after a logical operator', function() {
    const clause = {and: [{age: '10'}], vip: 'true'};

    // Key order is predictable but not guaranteed. We prefer false negatives (failure) to false positives.
    assert(Object.keys(clause)[0] === 'and', 'Unexpected key order.');

    where = model._coerce(clause);
    assert.deepEqual(where, {and: [{age: 10}], vip: true});
  });

  const COERCIONS = [
    {
      in: {scores: {0: '10', 1: '20'}},
      out: {scores: [10, 20]},
    },
    {
      in: {and: {0: {age: '10'}, 1: {vip: 'true'}}},
      out: {and: [{age: 10}, {vip: true}]},
    },
    {
      in: {or: {0: {age: '10'}, 1: {vip: 'true'}}},
      out: {or: [{age: 10}, {vip: true}]},
    },
    {
      in: {id: {inq: {0: 'aaa', 1: 'bbb'}}},
      out: {id: {inq: ['aaa', 'bbb']}},
    },
    {
      in: {id: {nin: {0: 'aaa', 1: 'bbb'}}},
      out: {id: {nin: ['aaa', 'bbb']}},
    },
    {
      in: {scores: {between: {0: '0', 1: '42'}}},
      out: {scores: {between: [0, 42]}},
    },
  ];

  COERCIONS.forEach(coercion => {
    const inStr = JSON.stringify(coercion.in);
    it('coerces where clause with array-like objects ' + inStr, () => {
      assert.deepEqual(model._coerce(coercion.in), coercion.out);
    });
  });

  const INVALID_CLAUSES = [
    {scores: {inq: {0: '10', 1: '20', 4: '30'}}},
    {scores: {inq: {0: '10', 1: '20', bogus: 'true'}}},
    {scores: {between: {0: '10', 1: '20', 2: '30'}}},
  ];

  INVALID_CLAUSES.forEach((where) => {
    const whereStr = JSON.stringify(where);
    it('throws an error on malformed array-like object ' + whereStr, () => {
      assert.throws(() => model._coerce(where), /property has invalid clause/);
    });
  });

  it('throws an error if the where property is not an object', function() {
    try {
      // The where clause has to be an object
      model._coerce('abc');
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the where property is an array', function() {
    try {
      // The where clause cannot be an array
      model._coerce([
        {vip: true},
      ]);
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the and operator is not configured with an array', function() {
    try {
      // The and operator only takes an array of objects
      model._coerce({and: {x: 1}});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the or operator does not take an array', function() {
    try {
      // The or operator only takes an array of objects
      model._coerce({or: {x: 1}});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the or operator not configured with an array of objects', function() {
    try {
      // The or operator only takes an array of objects
      model._coerce({or: ['x']});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error when malformed logical operators follow valid logical clauses', function() {
    const invalid = {and: [{x: 1}], or: 'bogus'};

    // Key order is predictable but not guaranteed. We prefer false negatives (failure) to false positives.
    assert(Object.keys(invalid)[0] !== 'or', 'Unexpected key order.');

    try {
      model._coerce(invalid);
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the filter property is not an object', function() {
    let filter = null;
    try {
      // The filter clause has to be an object
      filter = model._normalize('abc');
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the filter.limit property is not a number', function() {
    try {
      // The limit param must be a valid number
      filter = model._normalize({limit: 'x'});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the filter.limit property is negative', function() {
    try {
      // The limit param must be a valid number
      filter = model._normalize({limit: -1});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the filter.limit property is not an integer', function() {
    try {
      // The limit param must be a valid number
      filter = model._normalize({limit: 5.8});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if filter.offset property is not a number', function() {
    try {
      // The limit param must be a valid number
      filter = model._normalize({offset: 'x'});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('throws an error if the filter.skip property is not a number', function() {
    try {
      // The limit param must be a valid number
      filter = model._normalize({skip: '_'});
    } catch (err) {
      error = err;
    }
    assert(error, 'An error should have been thrown');
  });

  it('normalizes limit/offset/skip', function() {
    filter = model._normalize({limit: '10', skip: 5});
    assert.deepEqual(filter, {limit: 10, offset: 5, skip: 5});
  });

  it('uses a default value for limit', function() {
    filter = model._normalize({skip: 5});
    assert.deepEqual(filter, {limit: 100, offset: 5, skip: 5});
  });

  it('applies settings for handling undefined', function() {
    filter = model._normalize({filter: {x: undefined}});
    assert.deepEqual(filter, {filter: {}});

    ds.settings.normalizeUndefinedInQuery = 'ignore';
    filter = model._normalize({filter: {x: undefined}});
    assert.deepEqual(filter, {filter: {}}, 'Should ignore undefined');

    ds.settings.normalizeUndefinedInQuery = 'nullify';
    filter = model._normalize({filter: {x: undefined}});
    assert.deepEqual(filter, {filter: {x: null}}, 'Should nullify undefined');

    ds.settings.normalizeUndefinedInQuery = 'throw';
    assert.throws((function() { model._normalize({filter: {x: undefined}}); }), /`undefined` in query/);
  });

  it('does not coerce GeoPoint', function() {
    where = model._coerce({location: {near: {lng: 10, lat: 20}, maxDistance: 20}});
    assert.deepEqual(where, {location: {near: {lng: 10, lat: 20}, maxDistance: 20}});
  });

  it('does not coerce null values', function() {
    where = model._coerce({date: null});
    assert.deepEqual(where, {date: null});
  });

  it('does not coerce undefined values', function() {
    where = model._coerce({date: undefined});
    assert.deepEqual(where, {date: undefined});
  });

  it('does not coerce empty objects to arrays', function() {
    where = model._coerce({object: {}});
    assert.ok(!Array.isArray(where.object));
    assert.ok(where.object != null && typeof where.object === 'object' && !Array.isArray(where.object));
  });

  it('does not coerce an empty array', function() {
    where = model._coerce({array: []});
    assert.ok(Array.isArray(where.array));
    assert.strictEqual(where.array.length, 0);
  });

  it('does not coerce to a number for a simple value that produces NaN',
    function() {
      where = model._coerce({age: 'xyz'});
      assert.deepEqual(where, {age: 'xyz'});
    });

  it('does not coerce to a number for a simple value in an array that produces NaN',
    function() {
      where = model._coerce({age: {inq: ['xyz', '12']}});
      assert.deepEqual(where, {age: {inq: ['xyz', 12]}});
    });

  it('does not coerce to a string for a regexp value in an array ',
    function() {
      where = model._coerce({string: {inq: [/xyz/i, new RegExp(/xyz/i)]}});
      assert.deepEqual(where, {string: {inq: [/xyz/i, /xyz/i]}});
    });

  // settings
  it('gets settings in priority',
    function() {
      ds.settings.test = 'test';
      assert.equal(model._getSetting('test'), ds.settings.test, 'Should get datasource setting');
      ds.settings.test = undefined;

      model.settings.test = 'test';
      assert.equal(model._getSetting('test'), model.settings.test, 'Should get model settings');

      ds.settings.test = 'willNotGet';
      assert.notEqual(model._getSetting('test'), ds.settings.test, 'Should not get datasource setting');
    });
});

describe('ModelBuilder processing json files', function() {
  const path = require('path'),
    fs = require('fs');

  /**
   * Load LDL schemas from a json doc
   * @param schemaFile The dataSource json file
   * @returns A map of schemas keyed by name
   */
  function loadSchemasSync(schemaFile, dataSource) {
    let modelBuilder, createModel;
    // Set up the data source
    if (!dataSource) {
      modelBuilder = new ModelBuilder();
    } else {
      modelBuilder = dataSource.modelBuilder;
      createModel = dataSource.createModel.bind(dataSource);
    }

    // Read the dataSource JSON file
    const schemas = JSON.parse(fs.readFileSync(schemaFile));
    return modelBuilder.buildModels(schemas, createModel);
  }

  it('defines models', function() {
    let models = loadSchemasSync(path.join(__dirname, 'test1-schemas.json'));

    assert.ok(Object.prototype.hasOwnProperty.call(models, 'AnonymousModel_0'));
    assert.ok(Object.prototype.hasOwnProperty.call(models.AnonymousModel_0, 'modelName')); assert.strictEqual(models.AnonymousModel_0.modelName, 'AnonymousModel_0');

    const m1 = new models.AnonymousModel_0({title: 'Test'});
    assert.strictEqual(m1.title, 'Test');
    assert.strictEqual(m1.author, 'Raymond');

    models = loadSchemasSync(path.join(__dirname, 'test2-schemas.json'));
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Address'));
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Account'));
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Customer'));
    for (const s in models) {
      const m = models[s];
      assert(new m());
    }
  });

  it('attaches models to a specified dataSource', function() {
    const ds = new DataSource('memory');

    const models = loadSchemasSync(path.join(__dirname, 'test2-schemas.json'), ds);
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Address'));
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Account'));
    assert.ok(Object.prototype.hasOwnProperty.call(models, 'Customer'));
    assert.equal(models.Address.dataSource, ds);
  });

  it('allows customization of default model base class', function() {
    const modelBuilder = new ModelBuilder();

    const User = modelBuilder.define('User', {
      name: String,
      bio: ModelBuilder.Text,
      approved: Boolean,
      joinedAt: Date,
      age: Number,
    });

    modelBuilder.defaultModelBaseClass = User;

    const Customer = modelBuilder.define('Customer', {customerId: {type: String, id: true}});
    assert(Customer.prototype instanceof User);
  });

  it('accepts a model base class', function() {
    const modelBuilder = new ModelBuilder();

    const User = modelBuilder.define('User', {
      name: String,
      bio: ModelBuilder.Text,
      approved: Boolean,
      joinedAt: Date,
      age: Number,
    });

    const Customer = modelBuilder.define('Customer',
      {customerId: {type: String, id: true}}, {}, User);
    assert(Customer.prototype instanceof User);
  });
});

describe('DataSource constructor', function() {
  it('takes url as the settings', function() {
    const ds = new DataSource('memory://localhost/mydb?x=1');
    assert.equal(ds.connector.name, 'memory');
  });

  it('takes connector name', function() {
    const ds = new DataSource('memory');
    assert.equal(ds.connector.name, 'memory');
  });

  it('takes settings object', function() {
    const ds = new DataSource({connector: 'memory'});
    assert.equal(ds.connector.name, 'memory');
  });

  it('takes settings object and name', function() {
    const ds = new DataSource('x', {connector: 'memory'});
    assert.equal(ds.connector.name, 'memory');
  });
});

describe('ModelBuilder options.models', function() {
  it('injects model classes from models', function() {
    const builder = new ModelBuilder();
    const M1 = builder.define('M1');
    const M2 = builder.define('M2', {}, {models: {
      'M1': M1,
    }});

    assert.equal(M2.M1, M1, 'M1 should be injected to M2');
  });

  it('injects model classes by name in the models', function() {
    const builder = new ModelBuilder();
    const M1 = builder.define('M1');
    const M2 = builder.define('M2', {}, {models: {
      'M1': 'M1',
    }});

    assert.equal(M2.M1, M1, 'M1 should be injected to M2');
  });

  it('injects model classes by name in the models before the class is defined',
    function() {
      const builder = new ModelBuilder();
      const M2 = builder.define('M2', {}, {models: {
        'M1': 'M1',
      }});
      assert(M2.M1, 'M1 should be injected to M2');
      assert(M2.M1.settings.unresolved, 'M1 is still a proxy');
      const M1 = builder.define('M1');
      assert.equal(M2.M1, M1, 'M1 should be injected to M2');
    });

  it('uses non-strict mode for embedded models by default', function() {
    const builder = new ModelBuilder();
    const M1 = builder.define('testEmbedded', {
      name: 'string',
      address: {
        street: 'string',
      },
    });
    const m1 = new M1({
      name: 'Jim',
      address: {
        street: 'washington st',
        number: 5512,
      },
    });
    assert.equal(m1.address.number, 5512, 'm1 should contain number property in address');
  });

  it('uses the strictEmbeddedModels setting (true) when applied on modelBuilder', function() {
    const builder = new ModelBuilder();
    builder.settings.strictEmbeddedModels = true;
    const M1 = builder.define('testEmbedded', {
      name: 'string',
      address: {
        street: 'string',
      },
    });
    const m1 = new M1({
      name: 'Jim',
      address: {
        street: 'washington st',
        number: 5512,
      },
    });
    assert.equal(m1.address.number, undefined, 'm1 should not contain number property in address');
    assert.equal(m1.address.isValid(), false, 'm1 address should not validate with extra property');
    const codes = m1.address.errors && m1.address.errors.codes || {};
    assert.deepEqual(codes.number, ['unknown-property']);
  });
});

describe('updateOnly', function() {
  it('sets forceId to true when model id is generated', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Post = ds.define('Post', {
        title: {type: String, length: 255},
        date: {type: Date, default: function() {
          return new Date();
        }},
      });
      // check if forceId is added as true in ModelClass's settings[] explicitly,
      // if id a generated (default) and forceId in from the model is
      // true(unspecified is 'true' which is the default).
      assert.deepStrictEqual(Post.settings.forceId, 'auto');
      resolve();
    });
  });

  it('flags id as updateOnly when forceId is undefined', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Post = ds.define('Post', {
        title: {type: String, length: 255},
        date: {type: Date, default: function() {
          return new Date();
        }},
      });
      // check if method getUpdateOnlyProperties exist in ModelClass and check if
      // the Post has 'id' in updateOnlyProperties list
      assert.ok(Object.prototype.hasOwnProperty.call(Post, 'getUpdateOnlyProperties'));
      assert.deepStrictEqual(Post.getUpdateOnlyProperties(), ['id']);
      resolve();
    });
  });

  it('does not flag id as updateOnly when forceId is false', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Person = ds.define('Person', {
        name: String,
        gender: String,
      }, {forceId: false});
      // id should not be there in updateOnly properties list if forceId is set
      // to false
      assert.ok(Object.prototype.hasOwnProperty.call(Person, 'getUpdateOnlyProperties'));
      assert.deepStrictEqual(Person.getUpdateOnlyProperties(), []);
      resolve();
    });
  });

  it('flags id as updateOnly when forceId is true', async function() {
    await new Promise((resolve, reject) => {
      const ds = new DataSource('memory');
      const Person = ds.define('Person', {
        name: String,
        gender: String,
      }, {forceId: true});
      // id should be there in updateOnly properties list if forceId is set
      // to true
      assert.ok(Object.prototype.hasOwnProperty.call(Person, 'getUpdateOnlyProperties'));
      assert.deepStrictEqual(Person.getUpdateOnlyProperties(), ['id']);
      resolve();
    });
  });
});
