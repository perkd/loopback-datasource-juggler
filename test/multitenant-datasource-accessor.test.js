// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const should = require('./init.js');
const DataSource = require('../lib/datasource.js').DataSource;

describe('Multitenant DataSource Accessor Fix', function() {
  let dataSource;

  beforeEach(function() {
    dataSource = new DataSource('memory');
  });

  afterEach(function() {
    if (dataSource) {
      dataSource.disconnect();
    }
  });

  describe('Property Accessor Behavior', function() {
    it('should call getDataSource() when accessing model.dataSource property', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      let getDataSourceCalled = false;
      const originalDataSource = TestModel._originalDataSource;

      // Override getDataSource method
      TestModel.getDataSource = function() {
        getDataSourceCalled = true;
        return originalDataSource;
      };

      // Access dataSource property - should trigger getDataSource()
      const ds = TestModel.dataSource;
      getDataSourceCalled.should.be.true();
      ds.should.equal(originalDataSource);
    });

    it('should fallback to original datasource when getDataSource() is not defined', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Ensure no getDataSource method exists
      delete TestModel.getDataSource;

      // Access dataSource property - should return original datasource
      const ds = TestModel.dataSource;
      ds.should.equal(originalDataSource);
    });

    it('should handle errors in getDataSource() gracefully', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Override getDataSource to throw an error
      TestModel.getDataSource = function() {
        throw new Error('Test error');
      };

      // Access dataSource property - should fallback to original datasource
      const ds = TestModel.dataSource;
      ds.should.equal(originalDataSource);
    });

    it('should prevent circular reference loops', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      // Create circular reference scenario
      TestModel.getDataSource = function() {
        return this.dataSource; // Would cause infinite loop without protection
      };

      // Access dataSource property - should not hang and return original datasource
      const ds = TestModel.dataSource;
      ds.should.equal(originalDataSource);
    });

    it('should allow setting dataSource property during initialization', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Set new datasource
      TestModel.dataSource = newDataSource;

      // Should update the _originalDataSource
      TestModel._originalDataSource.should.equal(newDataSource);
      newDataSource.disconnect();
    });
  });

  describe('Multitenant Scenarios', function() {
    it('should return tenant-specific datasource when getDataSource() is overridden', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const tenantDataSource = new DataSource('memory');

      // Simulate multitenant override
      TestModel.getDataSource = function() {
        return tenantDataSource;
      };

      // Access dataSource property - should return tenant datasource
      const ds = TestModel.dataSource;
      ds.should.equal(tenantDataSource);

      tenantDataSource.disconnect();
    });

    it('should work with model attachment scenarios', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Attach model to new datasource
      newDataSource.attach(TestModel);

      // Verify the property accessor is set up correctly
      TestModel._originalDataSource.should.equal(newDataSource);
      TestModel.dataSource.should.equal(newDataSource);

      newDataSource.disconnect();
    });

    it('should work with models setter scenarios', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const newDataSource = new DataSource('memory');

      // Verify initial state
      TestModel._originalDataSource.should.equal(dataSource);
      TestModel.dataSource.should.equal(dataSource);

      // Use models setter (deprecated but should still work)
      newDataSource.models = {TestModel: TestModel};

      // Since models setter is deprecated, it may not update the datasource
      // But the property accessor should still work correctly
      // Verify that the property descriptor is still in place
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      descriptor.should.have.property('get');
      descriptor.should.have.property('set');
      descriptor.configurable.should.equal(true);
      descriptor.enumerable.should.equal(true);

      newDataSource.disconnect();
    });
  });

  describe('Backward Compatibility', function() {
    it('should maintain existing behavior for non-multitenant applications', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // Standard access should work exactly as before
      TestModel.dataSource.should.equal(dataSource);
      TestModel.dataSource.should.be.an.instanceOf(DataSource);
    });

    it('should preserve property enumeration behavior', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // dataSource property should be enumerable
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      descriptor.enumerable.should.be.true();
    });

    it('should preserve property configuration behavior', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // dataSource property should be configurable
      const descriptor = Object.getOwnPropertyDescriptor(TestModel, 'dataSource');
      descriptor.configurable.should.be.true();
    });

    it('should work with existing model operations', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});

      // Standard model operations should work
      TestModel.should.have.property('create');
      TestModel.should.have.property('find');
      TestModel.should.have.property('findById');

      // DataSource should be accessible for operations
      TestModel.dataSource.should.equal(dataSource);
    });
  });

  describe('Edge Cases', function() {
    it('should handle multiple getDataSource() calls correctly', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;
      let callCount = 0;

      TestModel.getDataSource = function() {
        callCount++;
        return originalDataSource;
      };

      // Multiple accesses should each call getDataSource()
      const ds1 = TestModel.dataSource;
      const ds2 = TestModel.dataSource;
      const ds3 = TestModel.dataSource;

      callCount.should.equal(3);
    });

    it('should handle getDataSource() returning different values', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const tenantDataSource1 = new DataSource('memory');
      const tenantDataSource2 = new DataSource('memory');
      let toggle = false;

      TestModel.getDataSource = function() {
        toggle = !toggle;
        return toggle ? tenantDataSource1 : tenantDataSource2;
      };

      // Should return different datasources based on getDataSource() logic
      const ds1 = TestModel.dataSource;
      const ds2 = TestModel.dataSource;

      ds1.should.equal(tenantDataSource1);
      ds2.should.equal(tenantDataSource2);

      tenantDataSource1.disconnect();
      tenantDataSource2.disconnect();
    });

    it('should handle null/undefined returns from getDataSource()', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      const originalDataSource = TestModel._originalDataSource;

      TestModel.getDataSource = function() {
        return null;
      };

      // Should return null as returned by getDataSource()
      const ds = TestModel.dataSource;
      should(ds).be.null();
    });
  });

  describe('Performance', function() {
    it('should have minimal performance impact when getDataSource() is not defined', function() {
      const TestModel = dataSource.define('TestModel', {name: 'string'});
      delete TestModel.getDataSource;

      const start = process.hrtime();

      // Access property many times
      for (let i = 0; i < 1000; i++) {
        const ds = TestModel.dataSource;
        ds.should.be.ok();
      }

      const [seconds, nanoseconds] = process.hrtime(start);
      const milliseconds = seconds * 1000 + nanoseconds / 1000000;

      // Should complete quickly (less than 100ms for 1000 accesses)
      milliseconds.should.be.below(100);
    });
  });
});
