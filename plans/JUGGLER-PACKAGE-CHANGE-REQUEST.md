# LOOPBACK-DATASOURCE-JUGGLER CHANGE REQUEST

## 🎯 **OBJECTIVE**
Fix tenant isolation issue by replacing direct `.dataSource` access with `getDataSource()` method calls in 5 specific locations.

## 📋 **REPOSITORY INFORMATION**
- **Repository**: `github:perkd/loopback-datasource-juggler`
- **Current Version**: `5.2.7`
- **Target Version**: `5.2.8`
- **Branch**: Create new branch from current HEAD

## 🔧 **EXACT CHANGES REQUIRED**

### **Change 1: dao.js Lines 1854-1855 (CRITICAL)**
**File**: `lib/dao.js`
**Function**: `geoCallback()` in `DataAccessObject.find()`
**Lines**: 1854-1855

**BEFORE:**
```javascript
      memory.define({
        properties: self.dataSource.definitions[modelName].properties,
        settings: self.dataSource.definitions[modelName].settings,
        model: self,
      });
```

**AFTER:**
```javascript
      memory.define({
        properties: self.getDataSource().definitions[modelName].properties,
        settings: self.getDataSource().definitions[modelName].settings,
        model: self,
      });
```

### **Change 2: model.js Line 393 (MEDIUM)**
**File**: `lib/model.js`
**Function**: `ModelBaseClass.defineProperty()`
**Line**: 393

**BEFORE:**
```javascript
  if (this.dataSource) {
    this.dataSource.defineProperty(this.modelName, prop, params);
  } else {
    this.modelBuilder.defineProperty(this.modelName, prop, params);
  }
```

**AFTER:**
```javascript
  if (this.dataSource) {
    this.getDataSource().defineProperty(this.modelName, prop, params);
  } else {
    this.modelBuilder.defineProperty(this.modelName, prop, params);
  }
```

### **Change 3: model.js Line 630 (LOW)**
**File**: `lib/model.js`
**Function**: `ModelBaseClass.prototype.reset()`
**Line**: 630

**BEFORE:**
```javascript
    if (k !== 'id' && !obj.constructor.dataSource.definitions[obj.constructor.modelName].properties[k]) {
```

**AFTER:**
```javascript
    if (k !== 'id' && !obj.constructor.getDataSource().definitions[obj.constructor.modelName].properties[k]) {
```

### **Change 4: include.js Lines 185-188 (LOW)**
**File**: `lib/include.js`
**Function**: `DataAccessObject.include()`
**Lines**: 185-188

**BEFORE:**
```javascript
  if (self.dataSource && self.dataSource.settings &&
    self.dataSource.settings.inqLimit) {
    inqLimit = self.dataSource.settings.inqLimit;
  }
```

**AFTER:**
```javascript
  const dataSource = self.getDataSource();
  if (dataSource && dataSource.settings &&
    dataSource.settings.inqLimit) {
    inqLimit = dataSource.settings.inqLimit;
  }
```

### **Change 5: include.js Lines 775-776 (LOW)**
**File**: `lib/include.js`
**Function**: Polymorphic relation handling
**Lines**: 775-776

**BEFORE:**
```javascript
        const Model = lookupModel(relation.modelFrom.dataSource.modelBuilder.
          models, modelType);
```

**AFTER:**
```javascript
        const Model = lookupModel(relation.modelFrom.getDataSource().modelBuilder.
          models, modelType);
```

## 📦 **VERSION UPDATE**

### **Update package.json**
**File**: `package.json`
**Change version from**: `"version": "5.2.7"`
**Change version to**: `"version": "5.2.8"`

### **Update CHANGES.md**
**File**: `CHANGES.md`
**Add entry at the top**:
```markdown
2024-XX-XX, Version 5.2.8
=========================

 * Fix tenant isolation: Replace direct dataSource access with getDataSource() calls (perkd)
   - dao.js: Fix geospatial query memory datasource configuration
   - model.js: Fix property definition and instance reset methods  
   - include.js: Fix query limits and polymorphic relation handling
   - Ensures proper tenant datasource resolution in multitenant environments
```

## ✅ **VALIDATION REQUIREMENTS**

### **Pre-commit Validation**
1. **Syntax Check**: Ensure all JavaScript files have valid syntax
2. **Test Execution**: Run existing test suite to ensure no regressions
3. **Lint Check**: Ensure code follows existing style guidelines

### **Expected Test Results**
- ✅ All existing tests should pass
- ✅ No new lint errors
- ✅ No syntax errors
- ✅ Package builds successfully

## 🎯 **IMPLEMENTATION NOTES**

### **Critical Points**
1. **Change 1 (dao.js)** is the most critical - fixes geospatial query tenant isolation
2. **All changes are backward compatible** - `getDataSource()` method already exists
3. **No new dependencies** required
4. **No breaking changes** to public API

### **Testing Priority**
1. **High**: Geospatial queries with tenant context
2. **Medium**: Dynamic property definition
3. **Low**: Include queries and polymorphic relations

## 🚨 **IMPORTANT NOTES**

### **DO NOT CHANGE**
- Any other files not listed above
- Any existing `getDataSource()` method implementations
- Any test files (unless they fail due to the changes)
- Any configuration or build files

### **VERIFY AFTER CHANGES**
- All 5 locations use `getDataSource()` instead of direct `.dataSource` access
- Version number updated to `5.2.8`
- CHANGES.md updated with appropriate entry
- No unintended changes to other files

## 📋 **COMMIT MESSAGE**
```
Fix tenant isolation: Replace direct dataSource access with getDataSource() calls

- dao.js: Fix geospatial query memory datasource configuration (lines 1854-1855)
- model.js: Fix property definition and instance reset methods (lines 393, 630)  
- include.js: Fix query limits and polymorphic relations (lines 185-188, 775-776)

Ensures proper tenant datasource resolution in multitenant environments.
Fixes issue where operations would access wrong tenant database.

Version: 5.2.7 → 5.2.8
```

## 🎯 **SUCCESS CRITERIA**
- ✅ All 5 changes applied exactly as specified
- ✅ Version bumped to 5.2.8
- ✅ CHANGES.md updated
- ✅ All existing tests pass
- ✅ No syntax or lint errors
- ✅ Package builds successfully

This change request provides the exact modifications needed to fix the tenant isolation issue in the loopback-datasource-juggler package.
