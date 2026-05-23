# `ModelRegistry` as the Multitenant Routing Fabric

## Overview

This document proposes promoting `ModelRegistry` from an internal bookkeeping component to the **canonical routing fabric** for multitenant `DataSource` resolution. The registry already maps `(tenant, model) → instance`; the proposal extends that to `(tenant, model) → DataSource`, so that `Model.getDataSource()` becomes a framework-level registry lookup rather than a per-model override compensating for the framework's lack of tenancy awareness.

The thesis is that the framework should understand tenancy as a first-class concept, and that doing so could collapse a surprising amount of consumer-side complexity — most visibly, the large `Multitenant` mixin in CRM and the `ReconnectingProxy` workaround it depends on.

---

## Current Architecture

### Request flow

```
HTTP request
  → middleware sets Context.tenant via @perkd/multitenant-context
  → DAO operation (e.g. Model.find())
  → juggler reads model.dataSource via property descriptor
  → descriptor delegates to Model.getDataSource() if overridden
  → Multitenant mixin's override reads Context.tenant
  → calls ConnectionManager.getExistingConnection(tenant)
  → returns pool, OR allocates a ReconnectingProxy
  → juggler's stillConnecting() invokes proxy.ready()
  → proxy queues the DAO call until pool is warm, then replays it
```

### Component inventory

The current design distributes the routing responsibility across **eight cooperating pieces**:

| Component | Location | Role |
|---|---|---|
| Context library | `@perkd/multitenant-context` | Holds `Context.tenant` per request (ALS-backed) |
| Tenant middleware | [`../CRM/business/server/lib/common/middleware/multitenant.js`](../../CRM/business/server/lib/common/middleware/multitenant.js) | Calls `Context.setValues(...)` at lines 189, 229, 280 |
| `Multitenant` mixin | [`../CRM/business/server/lib/common/mixins/Multitenant.js`](../../CRM/business/server/lib/common/mixins/Multitenant.js) (~1000 LOC) | Overrides `Model.getDataSource()` per model, owns connector proxy, owns pool lifecycle, owns save-hook session routing |
| `Model.getDataSource` override | Multitenant.js:595-599, 749-785 | Synchronous routing decision per DAO call |
| `ReconnectingProxy` | Multitenant.js:40-119 | Reimplements juggler's `ready()` / `stillConnecting()` queue protocol so a sync override can return before a pool exists |
| `connectorProxy` | Multitenant.js:632 | Wraps every connector method so a tenant pool can delegate to the bootstrap connector |
| Property descriptor | [`lib/datasource.js:61-88`](../lib/datasource.js#L61-L88) | Makes `model.dataSource` read calls `getDataSource()` (with a `_gettingDataSource` re-entrancy flag) |
| `ConnectionManager` | `@crm/loopback/dist/ConnectionManager.js` | Owns the actual tenant pool map, idle eviction, cleanup |

The juggler also contains a parallel, unused-by-CRM context lookup in `ModelRegistry.getCurrentTenant()` ([`lib/model-registry.js:17-41`](../lib/model-registry.js#L17-L41)) and a tenant-effective key in `getEffectiveTenant()` ([`lib/model-registry.js:263-289`](../lib/model-registry.js#L263-L289)). Today these only affect anonymous-model isolation inside the registry; they are not on the request-time routing path.

### Why this shape exists

The mixin pattern was the path of least resistance because:

1. Juggler's `Model.getDataSource()` is a **synchronous** API.
2. Real tenant routing is **asynchronous** (pool may need to be created).
3. The override-and-proxy pattern bridges (1) and (2) without modifying juggler's contract.

Every other piece in the inventory exists to support that bridge — the connector proxy maintains connector identity across pools, the property descriptor makes the override reachable from juggler internals, the `Model.on('attached')` lifecycle bootstraps `ConnectionManager` lazily because the mixin can't run at import time, and `ReconnectingProxy` exists because the override sometimes must return *something* synchronously before a pool exists.

### Concrete pain points

- **`ReconnectingProxy` mirrors framework internals.** Multitenant.js:65-69 documents that `ready()` is a "minimal mirror of `DataSource#ready()` from loopback-datasource-juggler." Any future change to juggler's connection-queue contract silently breaks CRM.
- **ALS coupling is load-bearing but hidden.** The comment at Multitenant.js:33-34 explains that `tenant` is captured by value in the proxy constructor "so the proxy works correctly even when `DISABLE_ASYNC_CONTEXT=true` (no ALS propagation)." This is critical knowledge encoded only in a comment.
- **Per-call resolution overhead.** Every property access on `model.dataSource` runs the descriptor, sets a re-entrancy flag, calls `getDataSource()`, unsets the flag, and returns. Multiplied across DAO operations in a hot request, this is non-trivial.
- **Mixin must be applied per model.** Every model JSON in CRM (`role.json`, `visit.json`, …) carries `"mixins": { "Multitenant": {} }`. Tenancy is opt-in per model when it should be a framework property.
- **Two routing-shaped mechanisms exist in juggler.** The mixin path is what CRM uses; the registry's `getCurrentTenant`/`getEffectiveTenant` is what looks like routing but isn't. New readers conflate them.

---

## Proposed Architecture

### Core idea

`ModelRegistry` already owns the canonical `(tenant, model) → instance` map. Promote it to also own `(tenant, model) → DataSource`. Make `Model.getDataSource()` resolve through the registry by default. Move tenant-pool creation behind a registered **`TenantResolver`** interface that the registry consumes.

The framework gains one concept (tenancy) and one extension point (`TenantResolver`). The consumer (CRM) could lose most of the routing-specific mixin, proxy, connector wrapper, and per-model JSON config.

### Request flow

```
HTTP request
  → middleware sets Context.tenant
  → DAO operation (Model.find())
  → Model.getDataSource() → ModelRegistry.resolve(Model, Context.tenant)
  → registry returns the cached tenant DataSource
     OR returns a stable tenant DataSource object whose own `ready()` / connect lifecycle handles the queue
  → DAO proceeds; juggler's existing stillConnecting() path handles the wait
```

The crucial difference is the target architecture: the routing decision **owns the DataSource lifecycle**. The registry should not return a workaround object; it should return a real tenant `DataSource` object. If that object is mid-connect, juggler's *own* `ready()` / `stillConnecting()` machinery should handle it.

If this contract is achieved, the architectural payoff is simple to state: **no CRM-local mirror of juggler's queue protocol, and no CRM-local reconnect proxy.**

Important realism check: CRM's current `ConnectionManager` does **not** expose this shape today. It can return an already-existing connection synchronously, or fully await connection creation asynchronously. So this proposal is not just a lookup refactor; it requires a resolver / pool-lifecycle contract that can hand juggler a stable `DataSource` object before connection completion.

### Component inventory (proposed)

| Component | Location | Role |
|---|---|---|
| Context library | `@perkd/multitenant-context` | Unchanged |
| Tenant middleware | CRM, unchanged | Calls `Context.setValues(...)` |
| `ModelRegistry` | juggler, expanded | Routes `(tenant, model) → DataSource`, owns lifecycle, dispatches to `TenantResolver` |
| `TenantResolver` interface | juggler, new | Pluggable tenant-datasource provider with cached sync reads and explicit cold-path lifecycle semantics |
| `ConnectionManager` | `@crm/loopback`, unchanged internally | Provided as the `TenantResolver` implementation at app boot |

The mixin, the proxy, the connector wrapper, and the per-model JSON config could mostly go away. The property-descriptor / `getDataSource()` path should be treated as a later cleanup step after the registry-based path is proven.

### API surface (sketch)

**Juggler side:**

```js
// In ModelRegistry
ModelRegistry.setTenantResolver(resolver)   // app boot: pass in CRM's ConnectionManager wrapper
ModelRegistry.resolve(model, tenant)        // sync: cached pool, or DataSource in connecting state

// In Model
Model.getDataSource = function() {
  const tenant = Context.tenant ?? this._defaultTenant
  return ModelRegistry.resolve(this, tenant)
}
```

**TenantResolver contract:**

```js
interface TenantResolver {
  // Called once per (tenant) lazily. Returns a real DataSource.
  // The DataSource may emit 'connected' later; the registry caches the
  // instance immediately so subsequent lookups are sync.
  createDataSource(tenant: string, baseModel: Model): DataSource

  // Optional: tenant eviction hooks for idle cleanup, shutdown, etc.
  onEvict?(tenant: string): Promise<void>
}
```

**CRM side:**

```js
// At app boot — once, not per model
app.registry.ModelRegistry.setTenantResolver({
  createDataSource(tenant) {
    return app.connectionManager.getOrCreateDataSource(tenant)
  },
  onEvict(tenant) {
    return app.connectionManager.evict(tenant)
  },
})
```

That is the entire CRM-side integration. No mixin, no JSON entries, no proxy.

---

## Side-by-Side Comparison

### Elegance

**Current**: routing logic is scattered across a mixin, a proxy, a connector wrapper, a property descriptor, and a connection manager. The mixin is per-model. The proxy reimplements framework internals. The shape of "how does a DAO call reach the right pool" requires reading five files in two repos.

**Proposed**: one component owns routing. `ModelRegistry.resolve(model, tenant)` is the answer to the question. The shape is readable in one place instead of being spread across mixin, middleware, proxy, and connection-manager integration.

### Simplicity

**Current LOC budget for routing:**
- Multitenant mixin: ~1000 LOC
- ReconnectingProxy: ~80 LOC
- connectorProxy: ~40 LOC
- property descriptor in juggler: ~30 LOC
- per-model JSON config: dozens of files

**Proposed LOC budget (directional, not guaranteed):**
- juggler: `ModelRegistry.resolve()` + resolver interface + tests + lifecycle coordination
- CRM: a small resolver adapter plus reduced model-level wiring
- later cleanup: mixin / proxy / connector-wrapper deletions after parity is proven

Net deletion in CRM could still be large, but it depends on how much of the current file is routing-only versus transaction / session / cleanup logic that remains necessary.

### Robustness

Three likely structural wins:

1. **The sync/async impedance mismatch can be absorbed into one framework contract instead of one CRM-local workaround.** `ReconnectingProxy` exists *only* because the override must return synchronously before a pool exists. If the resolver can return a stable tenant `DataSource` object immediately while connection completes in the background, the first-time creation path can go through juggler's normal `ready()` queue instead of a CRM-specific proxy mirror. This is a meaningful win, but it requires a real pool-lifecycle redesign to make true.

2. **ALS dependence becomes narrower and more explicit.** The current proxy must capture `tenant` by value at constructor time because ALS may be disabled. In the proposed design, `tenant` is passed explicitly into `resolve()` at the call site, where `Context` is still available. ALS continues to provide `tenant`, but the routing layer no longer needs a CRM-local reconnect object to smuggle that decision across an async boundary.

3. **One routing boundary instead of two routing-shaped mechanisms.** Today CRM enforces tenant isolation in the mixin (via `Context.tenant`) and the registry has its own `getEffectiveTenant` keying (`ds_<id>`, `app_<id>`, `tenant`, `global`). Those do not serve the same runtime purpose, but they look similar enough to confuse readers and reviewers. The proposed design replaces that ambiguity with one explicit routing API: `ModelRegistry.resolve(model, tenant)`.

### Performance

- **Less per-call routing indirection on steady-state reads.** Today every `model.dataSource` read runs the descriptor at [`lib/datasource.js:61-88`](../lib/datasource.js#L61-L88), including the `_gettingDataSource` re-entrancy guard and a try/catch fallback. A registry hit should be cheaper.
- **Potentially no `ReconnectingProxy` allocation on cold paths.** That benefit depends on the resolver being able to hand back a stable tenant `DataSource` object before connection completion.
- **Potentially no connector proxy overhead.** That benefit depends on each tenant pool owning the right connector identity directly instead of delegating through the bootstrap connector.

None of these are likely to dominate request cost individually. Performance should be treated as a supporting benefit, not the primary reason to adopt this design.

---

## CRM-Side Simplification

This is where the proposal most plausibly pays off.

**Deletions:**

| Item | Today |
|---|---|
| `Multitenant` mixin routing responsibilities | large file in `common/mixins/Multitenant.js`, replicated across product/business/sales/offer/person/payment/reward/place/billing/membership |
| `ReconnectingProxy` class | Multitenant.js:40-119 |
| `createConnectorProxy` | Multitenant.js area |
| `Model.on('attached')` routing/bootstrap path | Multitenant.js:602 onward |
| Per-model `"mixins": { "Multitenant": {} }` | Every model JSON in `common/models/*.json` |
| Dual `Model.prototype.getDataSource` + `Model.getDataSource` override | Multitenant.js:595-599 + 749-785 |

**Retentions (still needed, but decoupled from routing):**

| Item | Why kept |
|---|---|
| `ConnectionManager` | Still owns pool lifecycle, idle eviction, validation. Now consumed via the `TenantResolver` adapter instead of being called from per-model routing code. |
| Tenant middleware | Still the boundary where `Context.tenant` is set. |
| `before save` / `after save` transaction hooks | Still needed for session/transaction concerns. They may become less routing-heavy, but they do not disappear. |
| "trap" / "service" tenant special cases | Become two lines of config in the resolver adapter, not branches in a mixin. |

**Additions:**

| Item | Size |
|---|---|
| `TenantResolver` adapter wrapping `ConnectionManager` | small |
| Resolver registration at app boot | very small |

The biggest likely gain is that CRM multitenant routing stops being a per-model concern. The stronger claim that the mixin file shrinks to nothing should be treated as aspirational until transaction, cleanup, and service-lifecycle concerns are split out and reassessed.

---

## Trade-offs and Caveats

These costs are real and should not be glossed over.

### 1. Juggler becomes tenancy-aware

Today juggler is only lightly tenancy-aware; `@perkd/multitenant-context` is an *optional* require swallowed by try/catch inside `ModelRegistry`. The proposed design makes tenant routing a first-class juggler concept. Single-tenant users can still see no behavior change if no resolver is registered, but the conceptual surface area still grows.

**Mitigation:** keep tenant a string opaque to juggler. The framework knows tenants exist as keys; it does not know what they mean. Routing strategy stays in the resolver.

### 2. `ConnectionManager` placement decision

`ConnectionManager` currently lives in `@crm/loopback`. Options:

- **Stay in `@crm/loopback`**, juggler defines only the `TenantResolver` interface, CRM provides the implementation. (Recommended — minimal coupling.)
- **Move into juggler.** Maximum simplification but pulls CRM-specific pool semantics into a generic framework. Not recommended.
- **Extract to a new package.** Useful only if a second consumer emerges.

### 3. Owner-based registry behavior is still needed

The existing `getEffectiveTenant` branches for `model.dataSource → ds_<id>` and `model.app → app_<id>` ([`lib/model-registry.js:263-289`](../lib/model-registry.js#L263-L289)) serve non-multitenant juggler users who rely on owner-based fingerprint isolation. Those branches stay. The registry grows a routing capability; it does not stop doing what it does today. This proposal is therefore additive first, simplifying only after parity is demonstrated.

### 4. Behavior change for owner-less models with active tenant context

Today, an anonymous model with no `dataSource` and no `app` falls back to `currentTenant` partitioning. In the proposed design that becomes either explicit (caller provides a tenant) or `global`. CRM does not depend on this today (anonymous models in CRM always get an explicit datasource via `app.model(model, { dataSource: ds })`), but it is a behavior change for hypothetical external consumers.

### 5. Migration is a coordinated change

This is not a unilateral juggler cleanup. It requires:
- juggler: add `TenantResolver` interface and registry routing
- juggler: add a release with backward-compatible default behavior
- CRM: register a resolver at app boot
- CRM: redesign `ConnectionManager` / pool lifecycle as needed so the resolver can serve juggler's synchronous lookup contract
- CRM: remove mixin, proxy, connector wrapper, JSON config in phases

The phasing below addresses this.

### 6. The `ReconnectingProxy` insight does not disappear for free

The proposed design avoids the specific CRM-local proxy workaround by moving the bridge into a framework contract. But CRM code outside the routing path (e.g. `before save` hooks) still reads `Context.tenant` and still benefits from ALS. Those call sites are unchanged.

### 7. Resolver cold-path semantics are a hard requirement, not an open question

The proposed steady-state fast path is straightforward: cached tenant `DataSource` lookup can remain synchronous.

The hard part is the cold path. The resolver must be able to hand back a stable tenant `DataSource` object early enough that juggler can keep using its synchronous `getDataSource()` contract while the object's own connect / `ready()` lifecycle handles waiting.

CRM's current `ConnectionManager` does not expose that shape today:

- `getExistingConnection(tenant)` is synchronous but only returns an already-created connection
- `ensureConnection(tenant)` is asynchronous and returns only after pool creation and validation complete

So this proposal requires a real `@crm/loopback` pool-lifecycle API extension or redesign. That is not a side note; it is the main implementation precondition.

---

## Migration Path

A phased rollout keeps both architectures working until the new one is proven.

### Phase 1 — Define and ship the resolver interface in juggler

- Add `ModelRegistry.setTenantResolver(resolver)` (no-op default).
- Add `ModelRegistry.resolve(model, tenant)` returning either a cached tenant `DataSource` or invoking the resolver cold-path lifecycle.
- Keep all existing behavior intact. No CRM change required to consume this release.

### Phase 2 — Build the CRM-side resolver adapter

- New file in CRM: `common/multitenant/resolver.js` — adapter over `ConnectionManager`, possibly after a small `ConnectionManager` / `PoolManager` API extension.
- Register at app boot in parallel with the existing mixin (both active).
- Add tests that prove `ModelRegistry.resolve(...)` returns the same DataSource as the mixin override does.

### Phase 3 — Switch one low-risk model to registry-based routing

- Pick a non-critical model. Remove its `Multitenant` mixin. Verify in staging.
- Confirm DAO behavior, connection pooling, idle eviction, and transaction hooks all still work.
- This is the load-bearing validation step.

### Phase 4 — Roll out across CRM models

- Remove the mixin from all model JSON entries in tranches.
- Delete `ReconnectingProxy`, `createConnectorProxy`, `Model.on('attached')` bootstrap once no model uses them.

### Phase 5 — Remove the property-descriptor override path in juggler

- After CRM no longer overrides `Model.getDataSource`, the descriptor at [`lib/datasource.js:61-88`](../lib/datasource.js#L61-L88) should be simplified, subject only to confirming no remaining external consumers depend on the old override path.
- Final juggler cleanup PR.

### Rollback strategy

Each phase is independently revertable. Phase 1 ships with no behavior change. Phase 2 is additive. Phase 3 is per-model. Phase 4 is tranche-based. Phase 5 is the only juggler-side removal and gates on Phase 4 completion.

---

## Open Questions

1. **Where does `ConnectionManager` live long-term?** Recommendation is to keep it in `@crm/loopback` and have juggler depend only on the `TenantResolver` interface. Confirm before Phase 1.

2. **How are "trap" / "service" / "default" tenants modeled?** Recommendation: special-case them in the CRM resolver adapter (return the bootstrap DataSource directly). Juggler should not know these names.

3. **Idle eviction triggering.** Today `ConnectionManager` runs a periodic cleanup. With the registry caching `DataSource` instances, eviction must coordinate: registry needs an `onEvict(tenant)` callback to drop its cached pool reference so subsequent lookups re-resolve. Confirm the contract.

4. **What about non-`@perkd/multitenant-context` consumers?** The proposed design is context-library-agnostic: the caller passes `tenant` into `resolve()`. The default `Model.getDataSource` implementation needs an opinion on where to read tenant from. Option A: keep the optional `@perkd/multitenant-context` require in juggler. Option B: require consumers to override `Model.getDataSource` to read tenant from wherever they want. Option B is cleaner but pushes more onto consumers.

5. **Test strategy for the dual-running phase (Phase 2-3).** A property test comparing mixin output to resolver output for every `(tenant, model)` pair gives the highest confidence. Worth doing.

---

## Summary

The current architecture treats tenancy as a consumer concern and pays for that with a large mixin, a proxy that mirrors framework internals, and per-call indirection on every DAO operation. Promoting `ModelRegistry` to own `(tenant, model) → DataSource` routing — with `ConnectionManager` plugged in behind a `TenantResolver` interface — is a credible direction for making the framework understand tenancy as a first-class concept and deleting most of the CRM-specific routing machinery.

The trade-off is that juggler grows a stronger tenancy concept than it has today, and CRM / `@crm/loopback` need a real resolver-compatible pool lifecycle contract. If that contract is designed well, the trade appears favorable for a codebase whose most complex consumer is a multitenant CRM.
