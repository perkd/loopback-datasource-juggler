# Remove `ModelRegistry` Context-Driven Tenant Routing — Analysis & Workplan

## Executive Summary

The juggler currently contains **two different tenant-aware mechanisms**:

1. **CRM/product request-time dispatch for trap-backed models using the `Multitenant` mixin**:
   request middleware -> `Context.tenant` -> `Model.getDataSource()` override -> `ConnectionManager` -> tenant `DataSource` or reconnecting proxy
2. **The juggler-internal `ModelRegistry` context path**:
   `getCurrentTenant()` -> `getEffectiveTenant()` -> tenant-scoped registry bucketing / lookup

After auditing the actual CRM/product codebase, the first path is confirmed as the real request-time routing path for the service's main trap-backed API models. The second path is **not** part of CRM/product request-time datasource selection.

However, the second path is not simply dead code:

- it is still implemented in `lib/model-registry.js`
- it is documented and tested in this repo
- CRM/product still uses **owner-based** `ModelRegistry` APIs such as `cleanupTenant()` and `getStats()` for shutdown / tenant cleanup

That means the right question is **not** "should `ModelRegistry` exist?" The right question is:

> Should juggler keep the **context-driven tenant-routing behavior** in `ModelRegistry`, or should it keep only owner-based registry behavior plus cleanup/stats?

For CRM/product specifically, the evidence supports removing the **context-driven routing behavior** while preserving owner-based registry semantics and cleanup APIs.

---

## Scope And Confidence

This document is now grounded in:

- the juggler implementation and tests in this repo
- the actual CRM/product service codebase audited separately

What is **proven**:

- CRM/product request-time datasource routing for key trap-backed models goes through `Context.tenant` + `Model.getDataSource()` + `ConnectionManager`
- CRM/product does **not** use `ModelRegistry` context routing for DAO dispatch
- CRM/product **does** use `ModelRegistry.cleanupTenant()` and `ModelRegistry.getStats()` operationally

What is **not yet proven**:

- that no other service depends on `ModelRegistry` context routing
- that no juggler-internal owner-less / anonymous-model path still benefits from `getCurrentTenant()`

So the recommendation below is strong for CRM/product, but still requires cross-service validation before removal.

---

## What Exists Today

### CRM/product request-time path

In CRM/product, multitenancy for trap-backed models using the `Multitenant` mixin is implemented by:

1. request middleware creating / populating `@perkd/multitenant-context`
2. a second middleware eagerly ensuring the tenant connection
3. `Multitenant` overriding `Model.getDataSource()`
4. juggler DAO methods consulting `getDataSource()` per operation

```js
HTTP request
  -> multitenant middleware sets Context.tenant
  -> multitenant-ds middleware ensures connection
  -> Multitenant mixin overrides Model.getDataSource()
  -> DAO method calls Model.getDataSource()
  -> ConnectionManager returns tenant pool or reconnecting proxy
```

Important scope caveats:

- this is true for models that actually use the `Multitenant` mixin
- it is not the entire CRM/product story for all models, because many models use `MultitenantRemote` or other non-local patterns
- `trap`, `service`, and missing-tenant fallbacks return the original datasource directly rather than a tenant pool

For the service's main trap-backed product API models, this is the path CRM/product depends on.

### Juggler-internal registry path

`loopback-datasource-juggler/lib/model-registry.js` also contains context-driven logic:

- `getCurrentTenant()` attempts to read tenant identity from `@perkd/multitenant-context`
- falls back to `global.loopbackContext`
- returns `null` if neither is available
- `registerModel()` calls `getCurrentTenant()`
- `getEffectiveTenant()` mixes owner identity (`model.dataSource`, `model.app`) with current-context fallback for models without owners

Relevant code:

```js
function getCurrentTenant() {
  try {
    const Context = require('@perkd/multitenant-context').Context;
    return Context.tenant;
  } catch (e) {
    try {
      if (global.loopbackContext && typeof global.loopbackContext.getCurrentContext === 'function') {
        const ctx = global.loopbackContext.getCurrentContext();
        if (ctx && ctx.get && typeof ctx.get === 'function') {
          const tenant = ctx.get('tenant');
          if (tenant) return tenant;
        }
      }
    } catch (innerErr) {
      debug('Alternative context mechanism not available', innerErr);
    }
    return null;
  }
}
```

```js
function getEffectiveTenant(model, currentTenant) {
  if (model && model.dataSource) {
    const dsId = model.dataSource._dsId ||
      (model.dataSource._dsId = generateDataSourceId(model.dataSource));
    return `ds_${dsId}`;
  }

  if (model && model.app) {
    const appId = model.app._appId || (model.app._appId = generateAppId(model.app));
    return `app_${appId}`;
  }

  if (currentTenant) {
    return currentTenant;
  }

  return 'global';
}
```

The key observation is that this registry path is **not the CRM dispatch path**. It is separate infrastructure inside the juggler.

### CRM/product operational `ModelRegistry` usage

CRM/product does not use `ModelRegistry` context routing for request dispatch, but it **does** use `ModelRegistry` for cleanup and introspection:

- `ModelRegistry.cleanupTenant(...)`
- `ModelRegistry.getStats()`

That usage is owner-oriented in practice, typically via `ds_<id>` keys derived from datasource identity during tenant teardown and shutdown.

So:

- **removing context-driven registry routing** is plausible
- **removing `ModelRegistry` entirely** is not supported by the CRM/product audit

---

## Why This Is Strategically Bad

### 1. It creates a false story about how multitenancy works

When two different mechanisms both look like "tenant routing," engineers naturally conflate them. That has already happened in analysis and review: it is easy to assume `ModelRegistry` participates in request-time datasource selection when CRM/product actually routes via `Model.getDataSource()`.

That confusion costs:

- slower code reviews
- slower incident response
- worse onboarding
- incorrect tests targeting the wrong seam

### 2. It increases maintenance surface without helping the real path

Unused routing logic is not free. It needs:

- tests
- compatibility decisions
- dependency decisions
- documentation
- reasoning during refactors

If the only audited production consumer does not use it for request-time routing, then this is maintenance spent on a path with no demonstrated value for that routing boundary.

### 3. It weakens architectural clarity in a security-sensitive area

Multitenant routing is a security boundary. Those areas should be boring, explicit, and easy to explain. Extra hidden routing mechanisms make the system feel more capable than it is and can lead to dangerous assumptions like:

- "the juggler handles tenant routing for us"
- "adding `@perkd/multitenant-context` to juggler is necessary for CRM"
- "registry tests prove end-to-end tenant isolation"

All three are misleading in the CRM architecture.

### 4. It preserves legacy fallback behavior with unclear ownership

`getCurrentTenant()` currently supports:

- `@perkd/multitenant-context`
- `global.loopbackContext`
- null/global fallback

That is a compatibility matrix. If nobody owns it as a supported feature, it should not remain as silent background behavior.

---

## Why Removal Is Not Automatic

There are still plausible reasons not to remove it immediately.

### 1. It may have a real non-CRM/product consumer

`ModelRegistry` could be used by:

- another internal service not yet examined
- a historical LB3 integration using `ModelBuilder` directly
- tests or tooling that rely on context-driven anonymous-model separation

If such a consumer exists and is supported, removal becomes a product change, not just cleanup.

### 2. Parts of the code are still useful even if routing behavior is removed

The following are independently valuable:

- model fingerprint reuse
- anonymous-model leak prevention
- owner-identity isolation by `DataSource` / `app`
- cleanup and ref-counting
- registry stats / cleanup APIs used by CRM/product operational code

Those should not be thrown away just because the context-driven part is unused.

### 3. Removing it changes behavior for owner-less models

Today, models without `dataSource` or `app` can still be partitioned by `currentTenant`:

```js
if (currentTenant) {
  return currentTenant;
}
```

If that branch is removed, those models collapse into the global bucket unless another ownership mechanism replaces it. That may be fine, but it is a behavior change and should be treated as one.

### 4. Existing CRM/product cleanup code is slightly ambiguous

CRM/product cleanup code first tries `cleanupTenant(tenantCode)` and only then falls back to datasource-key cleanup such as `ds_<id>`.

That matters because it suggests one of two things:

- the raw tenant-code cleanup path may still have had value historically, or
- the application code is conservatively trying both shapes and only the datasource-key path is really needed

Either way, this is a migration detail to verify before removal.

---

## Recommendation

**Yes: put removal in the plan, but narrow the scope and state the evidence honestly.**

The default stance should be:

> If no supported consumer of `ModelRegistry`-driven context routing can be identified, remove the context-driven routing behavior from `model-registry.js` and keep owner-based registry behavior, cleanup, and stats.

That is the strategically cleanest outcome.

For CRM/product specifically, the current evidence supports that outcome.

---

## Decision Criteria

Proceed with removal if all of the following are true:

1. No production service can be shown to rely on `getCurrentTenant()` for request-time datasource routing.
2. No supported consumer can be shown to rely on owner-less model partitioning by tenant context.
3. The remaining `ModelRegistry` responsibilities still make sense when reduced to owner-based bookkeeping, cleanup, and stats.
4. Tests covering the actual supported CRM/product dispatch seam remain in place.

Do **not** remove yet if any of the following are true:

1. A supported consumer exists and depends on `currentTenant -> registry` behavior.
2. Existing tests reveal owner-less models that must remain tenant-separated.
3. CRM/product cleanup semantics depend on raw tenant-code registry keys in a way that datasource-key cleanup cannot replace.
4. The code is too entangled to simplify safely in the same change window as other multitenancy fixes.

---

## Proposed Workplan

### Phase 1 — Lock the decision scope

Goal: turn "CRM/product appears not to use this" into a package-level decision.

Tasks:

1. Record the CRM/product audit result explicitly:
   - request-time routing uses `Context` + `Model.getDataSource()` + `ConnectionManager`
   - CRM/product does not use `ModelRegistry` context routing for DAO dispatch
   - CRM/product still uses owner-based `ModelRegistry` cleanup / stats
2. Search other internal repos for actual behavioral dependency on:
   - `getCurrentTenant()`
   - `global.loopbackContext`
   - owner-less models being partitioned by tenant context
3. Search for docs or tests that describe `ModelRegistry` as supported tenant routing.
4. Ask service owners directly whether any service depends on juggler-driven tenant registry behavior.
5. Record results in a short decision note: `keep` or `remove`.

Deliverable:

- a one-page decision record naming real consumers, or explicitly stating none were found

### Phase 2 — Freeze the supported architecture in docs

Goal: remove ambiguity before code changes.

Tasks:

1. Document the supported CRM multitenant path as:
   - request middleware -> `Context`
   - connection warmup middleware
   - `Model.getDataSource()`
   - `ConnectionManager`
   - tenant `DataSource`
2. Explicitly state that this is true for trap-backed models using the `Multitenant` mixin on middleware-covered routes.
3. Explicitly state that `ModelRegistry` is not part of CRM/product request-time routing.
4. Mark context-driven `ModelRegistry` behavior as legacy / pending removal if Phase 1 finds no consumer.
5. Explicitly retain owner-based cleanup/stats behavior as still supported until proven otherwise.

Deliverable:

- updated architecture docs that eliminate the "two routing stories" problem

### Phase 3 — Strengthen tests for the real path first

Goal: reduce risk before deleting anything.

Tasks:

1. Add a juggler test pinning DAO-level repeated `getDataSource()` resolution.
2. Keep the existing juggler contract test for `stillConnecting()` with a non-`DataSource` object implementing `ready(obj, args)`; this is already covered and should remain as a guardrail.
3. Add one small canonical CRM/product end-to-end dispatch test using the real `Multitenant` mixin and real pool resolution if one does not already exist in the product service.
4. Add focused tests around owner-less / anonymous-model behavior before changing `ModelRegistry` context routing.

Why first:

- removal is safer when the actual supported contract is well pinned
- reviewers can see that the cleanup is not reducing real coverage

Deliverable:

- test coverage around the supported architecture, not the legacy-looking one

### Phase 4 — Remove context-driven routing from `ModelRegistry`

Goal: simplify `model-registry.js` to owner-based behavior only.

Proposed code changes:

1. Remove `getCurrentTenant()`.
2. Remove `global.loopbackContext` fallback logic.
3. Simplify `getEffectiveTenant()`:
   - keep `model.dataSource -> ds_<id>`
   - keep `model.app -> app_<id>`
   - replace owner-less models with a single explicit fallback bucket, likely `global`
4. Remove `getCurrentTenant()` influence from lookup paths such as `findModelByStructure()`, not just registration.
5. Update comments and docs to stop describing this as tenant routing.

Likely resulting shape:

```js
function getEffectiveTenant(model) {
  if (model && model.dataSource) return `ds_${...}`;
  if (model && model.app) return `app_${...}`;
  return 'global';
}
```

Deliverable:

- a simplified `ModelRegistry` that no longer implies request-time context routing

### Phase 5 — Cleanup and deprecation follow-through

Goal: make the simplification stick.

Tasks:

1. Remove obsolete tests for legacy fallback paths if the feature is intentionally removed.
2. Add a changelog note if downstream users could observe changed behavior.
3. Update CRM/product cleanup code if necessary so it no longer assumes raw tenant-code registry cleanup is meaningful.
4. Remove stale comments, docs, or proposals that mention registry-driven tenant routing as a supported path.
5. Add a short architecture note explaining why the removal happened.

Deliverable:

- one coherent story across code, tests, and docs

---

## Risks

### Risk 1 — Hidden consumer exists

Impact:

- behavior regression in a non-CRM service or obscure integration

Mitigation:

- do not skip Phase 1
- land removal only after explicit consumer check
- make removal a dedicated PR, not part of a broad refactor

### Risk 2 — Owner-less model behavior changes unexpectedly

Impact:

- anonymous/dynamic models that were previously tenant-separated may now share a global bucket

Mitigation:

- search for `ModelBuilder` / anonymous model patterns
- add focused tests around owner-less model behavior before and after change

### Risk 3 — CRM/product cleanup still expects tenant-code buckets

Impact:

- tenant cleanup removes fewer registries than expected
- shutdown cleanup becomes noisy or incomplete

Mitigation:

- verify whether raw `cleanupTenant(tenantCode)` ever removes anything meaningful
- normalize app cleanup logic toward datasource-key cleanup if needed

### Risk 4 — Reviewers assume this is a no-op cleanup

Impact:

- under-reviewed behavior change

Mitigation:

- frame the PR as a behavior simplification with explicit before/after semantics
- include a decision record in the PR description

---

## Rollback Strategy

If removal causes unexpected behavior:

1. Revert the focused removal PR.
2. Restore the previous `getCurrentTenant()` path.
3. Keep the new documentation clarifying that CRM does not use it.
4. Re-open the decision as "supported but under-documented" rather than "dead code."

This is another reason the removal should be isolated from unrelated multitenancy changes.

---

## Proposed PR Strategy

Do **not** combine everything into one PR.

Recommended order:

1. **PR 1:** tighten docs and tests around the real supported path
2. **PR 2:** document the decision that owner-based cleanup stays while context routing is pending removal
3. **PR 3:** remove context-driven `ModelRegistry` routing if no consumer is found
4. **PR 4:** clean up downstream tenant-cleanup call sites if the registry key story changes

This sequence makes review easier and reduces the chance of accidental regressions.

---

## Bottom Line

`ModelRegistry`-driven context routing should not stay in the system just because it already exists. The CRM/product audit now supports a narrower, more defensible conclusion:

- CRM/product request-time tenant routing does **not** use `ModelRegistry`
- CRM/product does still use owner-based `ModelRegistry` cleanup / stats
- therefore the candidate for removal is the **context-driven routing behavior**, not `ModelRegistry` itself

If no other supported consumer can be named, then leaving context-driven routing in place is strategically worse than removing it:

- it confuses the architecture
- it adds maintenance
- it muddies a security-sensitive boundary

The right plan is:

1. confirm whether any real non-CRM/product consumer exists,
2. pin tests for the actual supported path and owner-less edge cases,
3. remove the unused context-driven registry behavior if no consumer is found,
4. keep owner-based registry cleanup and stats unless a separate change replaces them.

That gives the system one clear multitenant story instead of two competing ones.
