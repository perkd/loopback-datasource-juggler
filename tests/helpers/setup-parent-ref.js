'use strict';

const assert = require('node:assert/strict');
const {beforeEach, afterEach} = require('node:test');

/**
 * Helper function that when called should return the current instance of the modelBuilder
 * @param {function: ModelBuilder} getBuilder
 */
const createTestSetupForParentRef = (getBuilder) => {
  assert.strictEqual(typeof getBuilder, 'function', 'Missing getter function for model builder');
  const settingProperty = 'parentRef';
  beforeEach(() => {
    const modelBuilder = getBuilder();
    assert.ok(modelBuilder && typeof modelBuilder === 'object', 'Invalid modelBuilder instance');
    modelBuilder.settings[settingProperty] = true;
  });
  afterEach(() => {
    const modelBuilder = getBuilder();
    assert.ok(modelBuilder && typeof modelBuilder === 'object', 'Invalid modelBuilder instance');
    modelBuilder.settings[settingProperty] = false;
  });
};

module.exports = createTestSetupForParentRef;
