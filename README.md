# 🚀 LoopBack DataSource Juggler

## v6.0.0 — Modernization (2026-05-23)

Tooling and test infrastructure brought in line with the sibling `loopback-connector-mongodb` and `loopback-connector-remote` reference pattern. Library source (`lib/`) is intentionally unchanged: no prototypal→class, no callback→async/await refactor, public callback APIs preserved.

**Breaking changes:**

- **Node.js**: minimum engine bumped from `>=20` to `>=22`.
- **Published `test/` tree** (via `publishConfig.export-tests: true`) now uses `node:test` instead of mocha. Connector packages that run juggler's test tree under mocha must pin to juggler `^5.x` or migrate their consumption to `node:test`.

**Non-breaking modernization:**

- Test framework: `mocha + should + sinon + nyc` → `node:test` + `node:assert/strict` + `c8`. Direct cutover, no compat layer. All 47 `.test.js` files + shared `.suite.js` files migrated. `done`-callback tests rewritten as `async`/`await` where the juggler API supports both.
- Runtime dependency: `lodash` removed (sole consumer was `lib/scope.js`, 3 sites, replaced with vanilla JS + `node:util.isDeepStrictEqual`).
- CI: floating actions pinned to SHA+tag; `coverallsapp` and `codeql-action` no longer track `@master`/`@v3`.
- Coverage: `nyc` → `c8` with `.c8rc.json`.

See [MODERNIZE.md](MODERNIZE.md) for the phase-by-phase breakdown and [CHANGES.md](CHANGES.md) for the full entry.

The `async` runtime dependency is retained in `lib/` (31 deeply-nested call sites are load-bearing for public callback API parallelism and error-aggregation semantics); its removal is tracked as a separate future effort.

---

## Multitenant DataSource Accessor Enhancement

This release introduces a revolutionary enhancement that enables seamless multitenant datasource switching while maintaining 100% backward compatibility with existing LoopBack applications.

### ✅ **Major Features**

- **🎯 Elegant DataSource Accessor**: Property descriptor pattern for intelligent `model.dataSource` access
- **🔄 Tenant-Aware Integration**: Automatic calls to `model.getDataSource()` when available
- **🛡️ Graceful Fallback**: Falls back to `_originalDataSource` when tenant method not defined
- **⚡ Zero Breaking Changes**: 100% backward compatibility with existing applications
- **🔒 Robust Error Handling**: Comprehensive error handling with graceful degradation
- **🚫 Circular Reference Prevention**: Built-in protection against infinite loops

### 🔧 **Technical Implementation**

```javascript
// Before: Direct datasource access
model.dataSource // Always returns original datasource

// After: Intelligent tenant-aware access
model.dataSource // Calls model.getDataSource() if available, falls back to original
```

### 🎯 **Multitenant Usage Pattern**

```javascript
// Enable tenant-aware datasource switching
MyModel.getDataSource = function() {
  const tenantId = getCurrentTenantId();
  return getTenantDataSource(tenantId);
};

// Now all model operations use tenant-specific datasource
const records = await MyModel.find(); // Uses tenant datasource automatically
```

### ✅ **Benefits Delivered**

- 🎯 **Seamless Tenant Switching**: Models automatically use tenant-specific datasources
- 🔒 **Enhanced Security**: Prevents cross-tenant data access through proper isolation
- ⚡ **Zero Performance Impact**: Minimal overhead when multitenant features not used
- 🔄 **100% Backward Compatible**: Existing applications work unchanged
- 🛡️ **Robust Error Handling**: Graceful fallback prevents application crashes
- 📈 **Developer Experience**: Simple override pattern for multitenant implementations

### 🧪 **Comprehensive Testing**

- **✅ 16/16 DataSource Accessor tests passing** (100% success rate)
  - Property accessor behavior (5 tests)
  - Multitenant scenarios (3 tests)
  - Backward compatibility (4 tests)
  - Edge cases (3 tests)
  - Performance validation (1 test)
- **✅ 75 total multitenant tests passing** (16 accessor + 32 centralized + 27 tenant-aware)
- **✅ All existing tests continue to pass** (2360+ tests, no regressions)
- **✅ ESLint compliance** achieved with clean code standards

### 📚 **Documentation**

- **✅ Updated MULTITENANT.md** with comprehensive feature overview
- **✅ Architecture documentation** updated to reflect new capabilities
- **✅ Usage examples** and integration guidelines provided

### 🏗️ **Architecture Enhancement**

This enhancement completes the comprehensive multitenant architecture for LoopBack DataSource Juggler:

1. **🎯 DataSource Level**: Tenant-aware datasource switching per model operation
2. **🏢 Registry Level**: Centralized model storage with owner-aware queries
3. **🔒 Tenant Level**: Anonymous models isolated by tenant context
4. **🌐 Global Level**: Named models accessible across tenants

### 🚀 **Production Ready**

- **✅ Zero-effort migration** for existing applications
- **✅ Simple integration** for multitenant applications (single method override)
- **✅ Robust architecture** with comprehensive error handling
- **✅ Performance optimized** with minimal overhead
- **✅ Ready for deployment** in production environments

---

## Installation

This is a private fork. Clone the repository and use the specific tag:

```bash
git clone git@github.com:perkd/loopback-datasource-juggler.git
cd loopback-datasource-juggler
git checkout v6.0.0
corepack enable
yarn install --immutable
```

## Compatibility

- **Node.js**: >=22 (since v6.0.0; v5.x supports >=20)
- **LoopBack**: 3.x, 4.x
- **Public API backward compatibility**: 100% maintained (callback signatures and behavior unchanged). The v6.0.0 break is in the published `test/` tree only — see modernization section above.
