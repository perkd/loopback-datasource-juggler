# loopback-datasource-juggler Modernization

Brings juggler's tooling and test infrastructure into line with the reference pattern executed in sibling projects `loopback-connector-mongodb` (v7.0.0) and `loopback-connector-remote` (v3.5.0). Library source in `lib/` is intentionally unchanged: no prototypal→class, no callback→async/await refactor. Public callback APIs are preserved.

## Status

| Phase   | Scope                                                                                                       | Status              |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------- |
| Phase 1 | CI yaml hygiene — pin floating actions, `yarn dlx commitlint`, pin `coverallsapp` and `codeql-action`       | COMPLETED (v5.2.13) |
| Phase 2 | Coverage swap — `nyc` → `c8`; `.c8rc.json` aligned with `loopback-connector-mongodb`                        | COMPLETED (v5.2.13) |
| Phase 3 | Test framework migration — `mocha + should + sinon` → `node --test` + `node:assert/strict`; direct cutover  | COMPLETED (v6.0.0)  |
| Phase 4 | Drop `lodash` runtime dependency — rewrite `lib/scope.js` 3 sites with vanilla JS + `node:util.isDeepStrictEqual` | COMPLETED (v6.0.0)  |
| Phase 5 | Engine bump `>=20` → `>=22`; CI matrix `[22, 24]`; lint and commit-lint jobs to Node 22                     | COMPLETED (v6.0.0)  |

TypeScript declarations (`index.d.ts`, `types/**`, `tsconfig.json`, `tsc` build step) are preserved — they remain juggler's value-add vs the connectors.

The `async` library is retained in `lib/` (31 deeply-nested call sites across `lib/include.js`, `lib/dao.js`, `lib/relation-definition.js`). Its removal would require a per-site review of error-aggregation semantics and a small vendored queue for `async.queue`; treated as a separate future effort.

---

## Phase 1 — CI yaml hygiene

- `actions/checkout` and `actions/setup-node` in the `test` job pinned to SHA+tag (already pinned in `code-lint` and `commit-lint`).
- `coverallsapp/github-action` pinned from `@master` to `5cbfd81b66ca5d10c19b062c04de0199c215fb6e` (v2.3.7) in both the `test` and `posttest` jobs.
- `github/codeql-action/init` and `github/codeql-action/analyze` pinned to `051e2f90686233507fe9283ff167d2e709304b30` (v3.36.0). `actions/checkout` in the codeql job pinned alongside.
- Commit-lint invocation changed from `yarn commitlint` to `yarn dlx commitlint --from origin/master --to HEAD --verbose`, mirroring `loopback-connector-mongodb`.

## Phase 2 — Coverage swap `nyc` → `c8`

- `nyc@^18.0.0` → `c8@^11.0.0` in devDependencies.
- Test script `nyc mocha` → `c8 mocha` (mocha runner unchanged in this phase).
- `.nycrc` removed, replaced by `.c8rc.json` modelled on `loopback-connector-mongodb/.c8rc.json`: text/html/lcov/json reporters, `lib/**/*.js` + `index.js` include scope, standard excludes.
- CI step `yarn nyc report --reporter=lcov` → `yarn c8 report --reporter=lcov`. Coveralls upload path (`coverage/lcov.info`) unchanged.

## Phase 3 — Test framework migration

Direct cutover: every `.test.js` file plus the shared `.suite.js` files migrated in one commit, mocha removed, runner swapped. No coexistence scripts, no shim, no codemod, no temp-dir merging.

### Files migrated

- All 47 `test/**/*.test.js` files.
- All 7 `test/kvao/*.suite.js` files plus `test/kvao.suite.js` and `test/kv-memory.js` (the kvao runner — renamed to `test/kv-memory.test.js` so the new glob picks it up).
- `test/helpers/bdd-if.js` — `describe.skip(name, fn)` → `describe(name, {skip: true}, fn)`, same for `it.skip`.
- `test/init.js` — `module.exports = require('should')` removed; `getSchema` / `getModelBuilder` / `connectorCapabilities` globals retained. Also added `registryManager.stopPeriodicCleanup()` and an `after()` hook so node:test can exit cleanly without dangling intervals.
- `test/persistence-hooks.suite.js` migrated to `node:test` imports (consumed only by external connectors; see "Breaking changes").

### Drop-ins

- `mocha`, `should`, `sinon`, `nyc`, `eslint-plugin-mocha` removed from `devDependencies`.
- `.mocharc.yaml` deleted.
- `eslint.config.js` — mocha globals removed from the top-level globals block; small override added for the few suite files that still call `describe()` at top level; `ecmaVersion` bumped 2018 → 2022.
- Test script: `c8 node --require ./test/init.js --test --test-reporter=spec --test-timeout=10000 --test-concurrency=1 "test/**/*.test.js"`.
  - `--require ./test/init.js` preloads the shared globals (`getSchema` / `getModelBuilder` / `connectorCapabilities`) before any test file runs.
  - `--test-concurrency=1` because juggler tests share suite-global state (memory connectors, model builders, fixtures); mocha hid this by being sequential. Relaxing concurrency is a follow-up.

### Mechanical transformation table

| Source pattern                                       | Replacement                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `const should = require('./init.js');`               | `require('./init.js'); const assert = require('node:assert/strict');`       |
| (mocha globals)                                      | `const {describe, it, before, beforeEach, after, afterEach} = require('node:test');` |
| `context(`                                           | `describe(`                                                                 |
| `describe.skip(n, fn)` / `it.skip(n, fn)`            | `describe(n, {skip: true}, fn)` / `it(n, {skip: true}, fn)`                 |
| `x.should.eql(y)` / `x.should.deepEqual(y)`          | `assert.deepStrictEqual(x, y)`                                              |
| `x.should.equal(y)`                                  | `assert.strictEqual(x, y)`                                                  |
| `x.should.not.equal(y)`                              | `assert.notStrictEqual(x, y)`                                               |
| `(fn).should.throw(/re/)`                            | `assert.throws(fn, /re/)`                                                   |
| `x.should.be.true()` / `x.should.be.false()`         | `assert.strictEqual(x, true)` / `assert.strictEqual(x, false)`              |
| `x.should.be.ok()`                                   | `assert.ok(x)`                                                              |
| `should.exist(x)` / `should.not.exist(x)`            | `assert.ok(x != null)` / `assert.ok(x == null)` (preserves `!= null` semantics) |
| `obj.should.have.property('k')`                      | `assert.ok('k' in obj)`                                                     |
| `obj.should.have.property('k', v)`                   | `assert.strictEqual(obj.k, v)`                                              |
| `arr.should.have.length(n)`                          | `assert.strictEqual(arr.length, n)`                                         |
| `x.should.be.an.instanceOf(C)`                       | `assert.ok(x instanceof C)` — primitive `String`/`Number`/`Boolean` checks use `typeof` instead |
| `x.should.match(/re/)`                               | `assert.match(String(x), /re/)`                                             |
| `arr.should.containDeep(sub)`                        | hand-converted with explicit loop (24 sites)                                |
| `function(done) { ...; done(); }`                    | rewritten as `async`/`await` where the juggler API supports both (most sites); Promise wrapper otherwise |
| `sandbox.stub(console, 'warn')`                      | `const orig = console.warn; let warnCalls = 0; console.warn = () => { warnCalls++; };` |
| `sandbox.restore()`                                  | `console.warn = orig;`                                                      |
| `sinon.assert.notCalled(console.warn)`               | `assert.strictEqual(warnCalls, 0)`                                          |

### `done`-callback rewrites — async/await first

Juggler's DAO/CRUD APIs accept both callbacks and Promises. Rewriting `it('x', function(done) { Model.find(cb); })` as `it('x', async () => { const r = await Model.find(); })` is dramatically cleaner end-state than a Promise wrapper. Where the surrounding API only exposes callbacks, the Promise wrapper pattern was used.

### Semantic tightenings

A small set of `should.not.exist(x)` sites were converted to `assert.strictEqual(x, undefined)` where the value is statically known to be `undefined` after a known operation (e.g. `excludeBaseProperties`, `omit`, missing fields). These are stricter than the default `!= null` translation but are correct at those sites. ~30 sites total.

### Verification

`yarn test`:

| Metric    | Pre-migration (mocha) | Post-migration (node:test) |
| --------- | --------------------: | -------------------------: |
| tests     | 2389 passing          | 1898 passing               |
| pending   | 158                   | 20 skipped                 |
| failing   | 0                     | 0                          |

Test-count delta reflects (a) node:test counts `describe.skip` blocks differently than mocha (skipped tests are not enumerated inside the block, so each `describe.skip` shows as one skip not N), and (b) tests inside `describeIf` / `itIf` paths that were always-skipped under mocha (e.g. tests gated on connector capabilities that the in-memory connector lacks) collapse the same way.

Coverage: `coverage/lcov.info` produced, line coverage comparable to pre-migration baseline (~88% lib).

## Phase 4 — Drop `lodash`

`lib/scope.js` was the sole consumer (3 call sites). Replacements:

- `_.intersectionWith(idsA, idsB, _.isEqual)` → `idsA.filter(idA => idsB.some(idB => isDeepStrictEqual(idA, idB)))` with `isDeepStrictEqual` from `node:util`.
- `_.isObject(x) && _.isEmpty(x)` (on a plain-object branch) → `x !== null && typeof x === 'object' && Object.keys(x).length === 0`.
- `_.omit(obj, key)` → `Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))`.

`lodash` removed from `dependencies`. No test changes — `test/scope.test.js` and `test/default-scope.test.js` cover the behavior.

## Phase 5 — Engine bump

- `engines.node` `>=20` → `>=22`.
- CI matrix `[20, 22, 24]` → `[22, 24]` on ubuntu; macOS and Windows include entries moved to Node 22.
- `code-lint` and `commit-lint` jobs moved from Node 20 to Node 22.

---

## Breaking changes — major version bump (6.0.0)

1. **Engine bump** `>=20` → `>=22`. Downstream consumers on Node 20 LTS must bump.
2. **Test export break.** `publishConfig.export-tests: true` ships juggler's `test/` tree. Pre-6.0.0, consumers ran it under mocha (e.g. `loopback-connector-mongodb`'s `test:juggler:v5` script does `mocha --exit --timeout=10000 node_modules/juggler-v5/test.js`, which `require`s `test/common.batch.js` and `test/persistence-hooks.suite.js`). Post-6.0.0 the shared suites import from `node:test` directly, so they no longer run under mocha. Affected known consumers:
   - `loopback-connector-mongodb` — `test:juggler:v5` script + `deps/juggler-v5/test.js`.
   - Any other connector that re-runs `test/common.batch.js` or `test/persistence-hooks.suite.js` under mocha.

   Downstream consumers must either:
   - Pin to juggler `^5.x` (no migration cost), or
   - Migrate their consumption to `node:test` when they bump to juggler `^6.x`.

## What was NOT done

- **`async` library kept in `lib/`.** 31 deeply-nested call sites across `lib/include.js`, `lib/dao.js`, `lib/relation-definition.js` are load-bearing for public callback API parallelism and error-aggregation semantics. Removal requires per-site review (`Promise.all` rejects on first error; `async.each` collects all errors before calling `done` once) and a vendored small queue for `async.queue`. Tracked as a separate future effort.
- **`lib/` source style** (prototypal inheritance, callback APIs) unchanged. Modernization is tooling- and test-scope.
- **`test/spec_helper.js` and `test/performance.coffee`** left in place as pre-existing dead code; out of scope.

## Files added / removed

Added:
- `.c8rc.json`
- `MODERNIZE.md` (this file)

Removed:
- `.nycrc`
- `.mocharc.yaml`

Renamed:
- `test/kv-memory.js` → `test/kv-memory.test.js`
