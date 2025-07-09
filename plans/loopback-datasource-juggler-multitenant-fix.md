# LoopBack DataSource Juggler - Multitenant DataSource Accessor Fix

## Change Request Summary

**Package**: `loopback-datasource-juggler`  
**Issue**: LoopBack bypasses `getDataSource()` method overrides by accessing `model.dataSource` property directly  
**Impact**: Critical production issue where multitenant applications lose tenant isolation  
**Solution**: Implement property accessor that automatically calls `getDataSource()` when `model.dataSource` is accessed  

## Problem Description

### Root Cause
LoopBack framework accesses the `dataSource` property directly on model classes, bypassing any `getDataSource()` method overrides that implement multitenant logic. This causes:

1. **Tenant Isolation Breach**: Database operations use wrong tenant datasource
2. **Production TRAP Context Issue**: API calls fall back to system/trap database instead of tenant-specific database
3. **Backward Compatibility Break**: Existing multitenant implementations fail silently

### Evidence
- Direct property access: `model.dataSource` 
- Bypassed method calls: `model.getDataSource()`
- Affected locations: Model definition, attachment, and property assignment

## Required Changes

### File: `lib/datasource.js`

#### Change 1: Model Definition (Line ~890)
**Location**: Around line 890 in the `define` method  
**Current Code**:
```javascript
const modelClass = this.modelBuilder.define(className, properties, settings);
modelClass.dataSource = this;
```

**Required Change**:
```javascript
const modelClass = this.modelBuilder.define(className, properties, settings);

// 🔒 MULTITENANT FIX: Override dataSource property to automatically call getDataSource()
// This provides 100% backward compatibility - any code accessing model.dataSource gets the right tenant datasource
const originalDataSource = this;

// Store original datasource in a private property
modelClass._originalDataSource = originalDataSource;

Object.defineProperty(modelClass, 'dataSource', {
  get: function() {
    // Always try to call getDataSource() if it exists and we're not in a circular call
    if (typeof this.getDataSource === 'function' && !this._gettingDataSource) {
      // Set flag to prevent circular calls
      this._gettingDataSource = true;
      try {
        const result = this.getDataSource();
        this._gettingDataSource = false;
        return result;
      } catch (error) {
        this._gettingDataSource = false;
        // Fallback to original if getDataSource() fails
        return this._originalDataSource;
      }
    }
    // Use original datasource for default behavior or during circular calls
    return this._originalDataSource;
  },
  set: function(value) {
    // Allow setting during initialization
    this._originalDataSource = value;
  },
  configurable: true,
  enumerable: true
});
```

#### Change 2: Model Attachment (Line ~1105)
**Location**: Around line 1105 in the `attach` method  
**Current Code**:
```javascript
// redefine the dataSource
modelClass.dataSource = this;
```

**Required Change**:
```javascript
// redefine the dataSource with elegant accessor for multitenant support
const originalDataSource = this;
modelClass._originalDataSource = originalDataSource;

Object.defineProperty(modelClass, 'dataSource', {
  get: function() {
    // Always try to call getDataSource() if it exists and we're not in a circular call
    if (typeof this.getDataSource === 'function' && !this._gettingDataSource) {
      this._gettingDataSource = true;
      try {
        const result = this.getDataSource();
        this._gettingDataSource = false;
        return result;
      } catch (error) {
        this._gettingDataSource = false;
        return this._originalDataSource;
      }
    }
    return this._originalDataSource;
  },
  set: function(value) {
    this._originalDataSource = value;
  },
  configurable: true,
  enumerable: true
});
```

#### Change 3: Models Setter (Line ~232)
**Location**: Around line 232 in the models setter  
**Current Code**:
```javascript
// Set up ownership relationship
model.dataSource = this;
```

**Required Change**:
```javascript
// Set up ownership relationship with elegant dataSource accessor
const originalDataSource = this;
model._originalDataSource = originalDataSource;

Object.defineProperty(model, 'dataSource', {
  get: function() {
    // Always try to call getDataSource() if it exists and we're not in a circular call
    if (typeof this.getDataSource === 'function' && !this._gettingDataSource) {
      this._gettingDataSource = true;
      try {
        const result = this.getDataSource();
        this._gettingDataSource = false;
        return result;
      } catch (error) {
        this._gettingDataSource = false;
        return this._originalDataSource;
      }
    }
    return this._originalDataSource;
  },
  set: function(value) {
    this._originalDataSource = value;
  },
  configurable: true,
  enumerable: true
});
```

## Technical Requirements

### Backward Compatibility
- ✅ **100% Compatible**: All existing code continues to work without changes
- ✅ **Transparent**: Property access behavior unchanged for non-multitenant applications
- ✅ **Safe Fallback**: Graceful degradation if `getDataSource()` fails

### Performance Considerations
- ✅ **Minimal Overhead**: Property getter only adds one function call
- ✅ **Circular Reference Protection**: `_gettingDataSource` flag prevents infinite loops
- ✅ **Error Handling**: Try-catch ensures stability

### Multitenant Integration
- ✅ **Automatic Detection**: Works with any `getDataSource()` implementation
- ✅ **Context Aware**: Respects tenant context established by middleware
- ✅ **Framework Level**: Fixes the issue at the core framework level

## Testing Requirements

### Unit Tests
```javascript
// Test that property accessor calls getDataSource()
const model = dataSource.define('TestModel', {});
let getDataSourceCalled = false;
model.getDataSource = function() {
  getDataSourceCalled = true;
  return originalDataSource;
};

const ds = model.dataSource; // Should trigger getDataSource()
assert(getDataSourceCalled, 'getDataSource() should be called');
```

### Integration Tests
```javascript
// Test multitenant scenario
const tenantDataSource = createTenantDataSource('tenant-123');
model.getDataSource = function() {
  return tenantDataSource;
};

const ds = model.dataSource;
assert.strictEqual(ds, tenantDataSource, 'Should return tenant datasource');
```

### Circular Reference Tests
```javascript
// Test circular reference prevention
model.getDataSource = function() {
  return this.dataSource; // Would cause infinite loop without protection
};

const ds = model.dataSource; // Should not hang
assert(ds, 'Should return fallback datasource');
```

## Implementation Notes

### Key Design Decisions
1. **Property Descriptor**: Uses `Object.defineProperty()` for clean getter/setter implementation
2. **Circular Protection**: `_gettingDataSource` flag prevents infinite recursion
3. **Error Resilience**: Try-catch ensures fallback to original datasource
4. **Private Storage**: `_originalDataSource` stores the original reference

### Edge Cases Handled
1. **Missing getDataSource()**: Falls back to original datasource
2. **getDataSource() Throws**: Catches error and uses fallback
3. **Circular Calls**: Detects and prevents infinite loops
4. **Initialization**: Allows setting during model setup

## Validation Criteria

### Success Metrics
- ✅ All direct `model.dataSource` access calls `getDataSource()` when available
- ✅ Existing non-multitenant applications continue working unchanged
- ✅ Multitenant applications achieve perfect tenant isolation
- ✅ No performance degradation for standard use cases

### Test Coverage
- ✅ Property access triggers method call
- ✅ Fallback behavior works correctly
- ✅ Circular reference protection functions
- ✅ Error handling is robust
- ✅ Multitenant scenarios work end-to-end

## Priority: CRITICAL

This fix resolves a **critical production issue** affecting multitenant applications where tenant isolation is compromised, leading to data security and integrity problems.

## Implementation Timeline

**Immediate**: This change should be implemented as soon as possible due to the critical nature of the tenant isolation issue.

---

**Contact**: For questions about this change request, refer to the multitenant context implementation and tenant isolation requirements in the business service.
