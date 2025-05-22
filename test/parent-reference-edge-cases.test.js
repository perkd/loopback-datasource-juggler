// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
const List = require('../lib/list');
const utils = require('../lib/utils');
const ModelBuilder = require('../lib/model-builder').ModelBuilder;
const {ModelRegistry} = require('../lib/model-registry');
const DataSource = require('../lib/datasource').DataSource;
const sinon = require('sinon');

describe('Parent Reference Edge Cases', function() {
  let modelBuilder;
  let memory;
  let sandbox;

  // Save original NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(function() {
    // Set NODE_ENV to test to enable parent references in tests
    process.env.NODE_ENV = 'test';

    memory = {};
    modelBuilder = new ModelBuilder();

    // Enable parentRef in the model builder for testing
    modelBuilder.settings = modelBuilder.settings || {};
    modelBuilder.settings.parentRef = true;

    // Create a sandbox to capture console warnings
    sandbox = sinon.createSandbox();
    sandbox.stub(console, 'warn');
  });

  afterEach(function() {
    sandbox.restore();
  });

  // Restore NODE_ENV after all tests
  after(function() {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Edge Case: Null and Undefined Values', function() {
    it('should handle null element gracefully', function() {
      const parent = {};
      // This should not throw an error
      utils.applyParentProperty(null, parent);
      // No assertions needed - just checking it doesn't throw
    });

    it('should handle undefined element gracefully', function() {
      const parent = {};
      // This should not throw an error
      utils.applyParentProperty(undefined, parent);
      // No assertions needed - just checking it doesn't throw
    });

    it('should handle null parent gracefully', function() {
      const element = {};
      // This should not throw an error
      utils.applyParentProperty(element, null);
      // No assertions needed - just checking it doesn't throw
    });

    it('should handle undefined parent gracefully', function() {
      const element = {};
      // This should not throw an error
      utils.applyParentProperty(element, undefined);
      // No assertions needed - just checking it doesn't throw
    });
  });

  describe('Edge Case: Non-Object Values', function() {
    it('should handle primitive element values gracefully', function() {
      const parent = {};
      // These should not throw errors
      utils.applyParentProperty('string', parent);
      utils.applyParentProperty(123, parent);
      utils.applyParentProperty(true, parent);
      // No assertions needed - just checking they don't throw
    });

    it('should handle primitive parent values gracefully', function() {
      const element = {};
      // These should not throw errors
      utils.applyParentProperty(element, 'string');
      utils.applyParentProperty(element, 123);
      utils.applyParentProperty(element, true);
      // No assertions needed - just checking they don't throw
    });
  });

  describe('Edge Case: Missing Constructor', function() {
    it('should handle element without constructor gracefully', function() {
      const parent = {};
      // Use a regular object but delete its constructor
      const element = {};
      delete element.constructor;

      // This should not throw an error
      utils.applyParentProperty(element, parent);
      // No assertions needed - just checking it doesn't throw
    });

    it('should handle parent without constructor gracefully', function() {
      const element = {};
      // Use a regular object but delete its constructor
      const parent = {};
      delete parent.constructor;

      // This should not throw an error
      utils.applyParentProperty(element, parent);
      // No assertions needed - just checking it doesn't throw
    });
  });

  describe('Edge Case: Environment Switching', function() {
    it('should respect parentRef=false in production environment', function() {
      // Save current NODE_ENV
      const testEnv = process.env.NODE_ENV;

      try {
        // Set to production
        process.env.NODE_ENV = 'production';

        // Create a new ModelBuilder for this test to avoid interference
        const prodModelBuilder = new ModelBuilder();

        // Define a model with parentRef explicitly disabled
        const NoParentRefModel = prodModelBuilder.define('NoParentRefModel', {
          name: String,
        }, {
          parentRef: false,
        });

        const master = prodModelBuilder.define('Master', {
          name: String,
        }, {
          parentRef: false,
        });

        const masterInstance = new master({name: 'Master'});
        const noRefModel = new NoParentRefModel({name: 'NoRefModel'});

        // Apply parent property
        utils.applyParentProperty(noRefModel, masterInstance);

        // In production with parentRef=false, no parent should be set
        // Use a different assertion to avoid issues with the object structure
        (noRefModel.__parent === undefined).should.be.true();
      } finally {
        // Restore the test environment
        process.env.NODE_ENV = testEnv;
      }
    });

    it('should respect parentRef=true even in production environment', function() {
      // Save current NODE_ENV
      const testEnv = process.env.NODE_ENV;

      try {
        // Set to production
        process.env.NODE_ENV = 'production';

        // Define a model with parentRef explicitly enabled
        const ParentRefModel = modelBuilder.define('ParentRefModel', {
          name: String,
        }, {
          parentRef: true,
        });

        const master = modelBuilder.define('Master', {
          name: String,
        }, {
          parentRef: true,
        });

        const masterInstance = new master({name: 'Master'});
        const refModel = new ParentRefModel({name: 'RefModel'});

        // Apply parent property
        utils.applyParentProperty(refModel, masterInstance);

        // In production with parentRef=true, parent should be set
        should.exist(refModel.__parent);
        refModel.__parent.should.equal(masterInstance);
      } finally {
        // Restore the test environment
        process.env.NODE_ENV = testEnv;
      }
    });
  });

  describe('Edge Case: Circular References', function() {
    it('should handle circular parent-child references gracefully', function() {
      // Define models
      const Parent = modelBuilder.define('Parent', {
        name: String,
      }, {
        parentRef: true,
      });

      const Child = modelBuilder.define('Child', {
        name: String,
      }, {
        parentRef: true,
      });

      // Create instances
      const parent = new Parent({name: 'Parent'});
      const child = new Child({name: 'Child'});

      // Create circular reference
      parent.child = child;
      child.parent = parent;

      // Apply parent properties
      utils.applyParentProperty(child, parent);
      utils.applyParentProperty(parent, child);

      // Both should have parent references
      should.exist(child.__parent);
      should.exist(parent.__parent);

      // References should point to the correct objects
      child.__parent.should.equal(parent);
      parent.__parent.should.equal(child);
    });
  });

  describe('Edge Case: Model Registry Interaction', function() {
    it('should not reuse models with different parentRef settings', function() {
      // Clear the registry
      ModelRegistry.clear();

      // Define a model with parentRef=true
      const ModelWithParentRef = modelBuilder.define('ModelWithParentRef', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      }, {
        parentRef: true,
      });

      // Register the model
      ModelRegistry.registerModel(ModelWithParentRef);

      // Create a new ModelBuilder with parentRef=false
      const anotherBuilder = new ModelBuilder();
      anotherBuilder.settings = anotherBuilder.settings || {};
      anotherBuilder.settings.parentRef = false;

      // Define a similar model with parentRef=false
      const ModelWithoutParentRef = anotherBuilder.define('ModelWithoutParentRef', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      }, {
        parentRef: false,
      });

      // The embedded address models should be different instances
      const addressModel1 = ModelWithParentRef.definition.properties.address.type;
      const addressModel2 = ModelWithoutParentRef.definition.properties.address.type;

      // They should be different model instances due to different parentRef settings
      addressModel1.should.not.equal(addressModel2);
    });

    it('should handle anonymous models with parent references correctly', function() {
      // Clear the registry
      ModelRegistry.clear();

      // Create a model with an anonymous embedded model
      const Customer = modelBuilder.define('Customer', {
        name: String,
        address: {
          street: String,
          city: String,
        },
      });

      // Get the anonymous model
      const AddressModel = Customer.definition.properties.address.type;

      // Verify it's anonymous
      AddressModel.settings.anonymous.should.be.true();

      // Create instances
      const customer = new Customer({
        name: 'Test Customer',
        address: {
          street: '123 Main St',
          city: 'Anytown',
        },
      });

      // The address should have a parent reference
      should.exist(customer.address.__parent);
      customer.address.__parent.should.equal(customer);
    });
  });

  describe('Edge Case: Complex Object Graphs', function() {
    it('should handle deep nesting of models with parent references', function() {
      // Define models for a deep object graph
      const Company = modelBuilder.define('Company', {
        name: String,
      }, {
        parentRef: true,
      });

      const Department = modelBuilder.define('Department', {
        name: String,
      }, {
        parentRef: true,
      });

      const Team = modelBuilder.define('Team', {
        name: String,
      }, {
        parentRef: true,
      });

      const Employee = modelBuilder.define('Employee', {
        name: String,
      }, {
        parentRef: true,
      });

      // Create instances
      const company = new Company({name: 'Acme Corp'});
      const department = new Department({name: 'Engineering'});
      const team = new Team({name: 'Backend'});
      const employee = new Employee({name: 'John Doe'});

      // Build the object graph
      company.department = department;
      department.team = team;
      team.employee = employee;

      // Apply parent properties
      utils.applyParentProperty(department, company);
      utils.applyParentProperty(team, department);
      utils.applyParentProperty(employee, team);

      // Verify parent references
      department.__parent.should.equal(company);
      team.__parent.should.equal(department);
      employee.__parent.should.equal(team);
    });

    it('should handle arrays of models with parent references', function() {
      // Define models
      const Department = modelBuilder.define('Department', {
        name: String,
      }, {
        parentRef: true,
      });

      const Employee = modelBuilder.define('Employee', {
        name: String,
      }, {
        parentRef: true,
      });

      // Create instances
      const department = new Department({name: 'Engineering'});
      const employees = [
        new Employee({name: 'Alice'}),
        new Employee({name: 'Bob'}),
        new Employee({name: 'Charlie'}),
      ];

      // Assign employees to department
      department.employees = employees;

      // Apply parent properties to array elements
      utils.applyParentProperty(employees, department);

      // Verify parent references for each employee
      employees.forEach(employee => {
        should.exist(employee.__parent);
        employee.__parent.should.equal(department);
      });
    });
  });

  describe('Edge Case: DataSource Interaction', function() {
    let ds;

    beforeEach(function() {
      // Create a memory datasource
      ds = new DataSource({
        connector: 'memory',
      });
    });

    it('should maintain parent references when attaching models to datasource', function() {
      // Define models with parent references
      const Order = modelBuilder.define('Order', {
        id: Number,
        items: [{
          product: String,
          quantity: Number,
        }],
      }, {
        parentRef: true,
      });

      // Attach to datasource
      ds.attach(Order);

      // Create an order with items
      const order = new Order({
        id: 1,
        items: [{
          product: 'Widget',
          quantity: 5,
        }],
      });

      // Verify parent references are maintained
      should.exist(order.items[0].__parent);
      order.items[0].__parent.should.equal(order);
    });

    it('should handle model reuse between datasources correctly', function() {
      // Define a model with parent references
      const Product = modelBuilder.define('Product', {
        name: String,
        category: {
          name: String,
          code: String,
        },
      }, {
        parentRef: true,
      });

      // Create two datasources
      const ds1 = new DataSource({
        connector: 'memory',
        name: 'ds1',
      });

      const ds2 = new DataSource({
        connector: 'memory',
        name: 'ds2',
      });

      // Attach the model to both datasources
      ds1.attach(Product);
      ds2.attach(Product);

      // Create instances in each datasource
      const product1 = new Product({
        name: 'Product in DS1',
        category: {
          name: 'Category 1',
          code: 'CAT1',
        },
      });

      const product2 = new Product({
        name: 'Product in DS2',
        category: {
          name: 'Category 2',
          code: 'CAT2',
        },
      });

      // Verify parent references
      should.exist(product1.category.__parent);
      should.exist(product2.category.__parent);
      product1.category.__parent.should.equal(product1);
      product2.category.__parent.should.equal(product2);

      // Verify the category models are the same (reused)
      product1.category.constructor.should.equal(product2.category.constructor);
    });
  });

  describe('Edge Case: Real-world Scenarios', function() {
    it('should handle model copying correctly', function() {
      // Define models
      const SourceModel = modelBuilder.define('SourceModel', {
        name: String,
        details: {
          description: String,
          tags: [String],
        },
      }, {
        parentRef: true,
      });

      const TargetModel = modelBuilder.define('TargetModel', {
        name: String,
        details: {
          description: String,
          tags: [String],
        },
      }, {
        parentRef: true,
      });

      // Create source instance
      const source = new SourceModel({
        name: 'Source',
        details: {
          description: 'Source description',
          tags: ['tag1', 'tag2'],
        },
      });

      // Get the constructor of the details model
      const DetailsModel = source.details.constructor;

      // Create a plain object copy of the details
      const detailsCopy = {};
      detailsCopy.description = source.details.description;
      detailsCopy.tags = source.details.tags.slice(); // Create a copy of the array

      // Create target using the copy
      const target = new TargetModel({
        name: 'Target',
        details: detailsCopy,
      });

      // Verify parent references
      should.exist(source.details.__parent);
      should.exist(target.details.__parent);
      source.details.__parent.should.equal(source);
      target.details.__parent.should.equal(target);

      // Verify they are separate instances
      source.details.should.not.equal(target.details);

      // Verify data was copied correctly
      target.details.description.should.equal('Source description');

      // Verify the tags array contains the same values
      target.details.tags.length.should.equal(2);
      target.details.tags[0].should.equal('tag1');
      target.details.tags[1].should.equal('tag2');

      // Verify changes to one don't affect the other
      source.details.description = 'Updated source';
      target.details.description.should.equal('Source description');
    });

    it('should handle array property copying correctly', function() {
      // Define a simpler model with array properties
      const Person = modelBuilder.define('Person', {
        name: String,
        hobbies: [String],
      }, {
        parentRef: true,
      });

      // Create an instance
      const person1 = new Person({
        name: 'John',
        hobbies: ['reading', 'swimming'],
      });

      // Create a copy
      const person2 = new Person({
        name: 'Jane',
        hobbies: person1.hobbies.slice(), // Create a copy of the array
      });

      // Verify they are separate instances
      person1.should.not.equal(person2);
      person1.hobbies.should.not.equal(person2.hobbies);

      // Verify data was copied correctly
      person2.name.should.equal('Jane');
      person2.hobbies.length.should.equal(2);
      person2.hobbies[0].should.equal('reading');
      person2.hobbies[1].should.equal('swimming');

      // Verify changes to one don't affect the other
      person1.hobbies.push('coding');
      person1.hobbies.length.should.equal(3);
      person2.hobbies.length.should.equal(2);
    });

    it('should handle embedded model copying correctly', function() {
      // Define a model with an embedded object
      const Product = modelBuilder.define('Product', {
        name: String,
        category: {
          name: String,
          code: String,
        },
      }, {
        parentRef: true,
      });

      // Create an instance
      const product1 = new Product({
        name: 'Widget',
        category: {
          name: 'Gadgets',
          code: 'GAD-001',
        },
      });

      // Create a copy with a new embedded object
      const product2 = new Product({
        name: 'Gizmo',
        category: {
          name: product1.category.name,
          code: product1.category.code,
        },
      });

      // Verify parent references
      should.exist(product1.category.__parent);
      should.exist(product2.category.__parent);
      product1.category.__parent.should.equal(product1);
      product2.category.__parent.should.equal(product2);

      // Verify they are separate instances
      product1.should.not.equal(product2);
      product1.category.should.not.equal(product2.category);

      // Verify data was copied correctly
      product2.name.should.equal('Gizmo');
      product2.category.name.should.equal('Gadgets');
      product2.category.code.should.equal('GAD-001');

      // Verify changes to one don't affect the other
      product1.category.name = 'Updated Gadgets';
      product2.category.name.should.equal('Gadgets');
    });
  });
});
