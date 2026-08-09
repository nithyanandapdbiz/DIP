# 00 — Executive Summary

**Review:** Multi-Tenancy & Tenant-Isolation Implementation Verification — DBiz Intelligence Plane
**Type:** Implementation verification and architecture-compliance review. **Not** a design task.
**Repository reviewed:** `DBiz_IntelligencePlane` (working tree on disk, 2026-07-23).
**Method:** Authoritative architecture read first (Docs 06, 07, 08, 21, 22; ADR-0009, ADR-0010), then four independent code-discovery passes over `packages/`, then reconciliation against disk (CHARTER §3).
**Standard of evidence:** every conclusion is cited to repository · file · class · method · line. Where a control is documented but not built, it is marked **DOCUMENTED – NOT IMPLEMENTED**; where built but divergent, **IMPLEMENTATION DEVIATION**; where unverifiable, **NOT VERIFIED**.

---

## Verdict

> **PARTIALLY COMPLIANT — and not compliant on the core requirement of the approved architecture.**

The approved tenancy architecture ([07 §2–§3](../../docs/architecture/07-tenant-isolation.md)) is unambiguous about where isolation lives: it is **physical**, obtained from **exactly one validated path constructor** that **every store obtains its location from** (R-07.3), and that constructor is **unbypassable** (R-07.5). Isolation must hold across **ten dimensions** (R-07.7), each with a passing test (C-07.6).

What is on disk:

- **The perimeter is genuinely strong and tested.** Tenant identity is established from the **authenticated mTLS client certificate** (CN + SAN), never a caller-supplied field, behind an 8-check fail-closed gateway, with real cross-tenant spoofing negative tests. **R-07.8 and C-07.11 are SATISFIED.**
- **The isolation primitive is well-built — and structurally disconnected.** The canonical constructor `TenantPaths.path()` correctly rejects absent / absolute / traversal / malformed / unregistered ids and implements the ADR-0010 `tenant/capability/run/artefact` layout. **But it is constructed only in a test.** No capability engine, orchestrator, gateway path, or the onboarding orchestrator ever instantiates it or routes a storage operation through it. **R-07.3 / R-07.5 are NOT met in the running system.**
- **The only durable Intelligence-Plane state that actually runs is not tenant-scoped**, producing two concrete cross-tenant leakage paths (below).
- **There is no governance gate for Doc 07.** The 26-gate verification suite contains a tenant-*lifecycle* gate (Doc 21) but **no tenant-isolation gate** (Doc 07). Under the platform's own constitution (`NOT RUN ≡ FAIL`, Evidence-over-Assertion R-13.1), C-07.1…C-07.12 are therefore **unverified**, which the platform's own rules classify as failing.

The building blocks are individually correct and correctly reasoned. **The load-bearing wiring that the architecture requires is absent.** Isolation today is enforced at the transport boundary and nowhere else.

---

## The two active leakage paths (both CONFIRMED against code)

**L1 — Cross-tenant knowledge-graph recall (Dimensions 6, 8, 9).**
`VectorMemory` ([capability-framework/src/vector.ts:184](../../packages/capability-framework/src/vector.ts#L184)) has **no tenant dimension** in its type, key, or query, yet it is held as a **long-lived instance field on an orchestrator whose `execute(request)` takes a per-call `tenantId`** — i.e. one instance serves many tenants (five of six engines: discovery, performance, penetration, functional, dev-change). One tenant's `remember()` of finding ids, fingerprints, and provenance labels is `recall()`-able, unfiltered, by another tenant's run — e.g. [penetration-testing-engine/src/agents/intelligence.ts:377](../../packages/penetration-testing-engine/src/agents/intelligence.ts#L377) matches tenant B's finding path against **every** tenant's remembered vectors. Mitigated only by the fact that raw source text is not stored (hashed vectors only); identifiers, fingerprints, and cross-tenant similarity signal do leak.

**L2 — Run-state / audit keyed by `runId` only (reproduces R-07.6).**
Every stateful engine holds `state = new Map<string, RunOutcome>()` keyed by `request.runId` alone, with no tenant scoping ([functional-testing-engine/src/orchestrators.ts:644](../../packages/functional-testing-engine/src/orchestrators.ts#L644); identical in discovery, performance, penetration, dev-change). `resume`, `retry`, and `auditTrailFor(runId)` read it by run id. If two tenants present the same `runId`, tenant A's sealed results and audit trail are returned into tenant B's run. **This is precisely the failure R-07.6 was written to prevent** ("a run identifier is not a tenant identifier; uniqueness carries no isolation semantics") — the predecessor's documented defect, reproduced.

---

## Compliance at a glance (ten dimensions, R-07.7)

| # | Dimension | Status | Basis |
|---|---|---|---|
| 1 | Configuration | **IMPLEMENTATION DEVIATION** | Per-tenant map with no global fallback is correct, but the ADR-0009 narrowing scope chain is not implemented, and the store is never wired in |
| 2 | Secrets | **IMPLEMENTATION DEVIATION** | Architecture says "not held in this plane — isolation by absence"; `TenantVault` holds & mints secret values in the IP |
| 3 | Evidence hashes & decisions | **PARTIALLY COMPLIANT** | Evidence crosses by reference (correct); IP-side persistence via `state` map is run-keyed (L2) |
| 4 | Execution records | **NOT IMPLEMENTED (as physical partition)** | Run records live in an in-memory run-keyed map, not the path constructor |
| 5 | Storage | **NOT IMPLEMENTED (in running system)** | Constructor exists; no running store uses it |
| 6 | Caching | **IMPLEMENTATION DEVIATION** | No `TenantCache`; `VectorMemory` is the de-facto cache and is cross-tenant (L1) |
| 7 | Logging | **PARTIALLY COMPLIANT** | Real call-site content refusal; shared sink with a tenant discriminator rather than tenant-scoped sinks; nullable tenant |
| 8 | AI context | **PARTIALLY COMPLIANT** | Prompt assembly is per-request and sovereignty-gated (clean); cross-tenant leakage enters via knowledge recall (L1), not the prompt |
| 9 | Knowledge graph | **IMPLEMENTATION DEVIATION** | `VectorMemory` shared across tenants (L1); security-engine is the safe counter-example |
| 10 | Rate limits & quotas | **PARTIALLY COMPLIANT** | Per-tenant isolation holds, but `TenantQuotas` bypasses the constructor and never validates the id |

Metrics (tenant-keyed) — **COMPLIANT**. Audit records carry tenant but retrieval is run-keyed — **DEVIATION** (L2).

---

## The single structural root cause

Every finding reduces to one fact: **the Intelligence Plane has no composition root and no Policy Decision Point.** [`IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) lists both as `NOT STARTED`, and disk confirms it — there is no `PolicyDecisionPoint`, no wiring that binds the gateway-authenticated tenant to the storage layer, and no place where `TenantLifecycle.canExecute` (which has zero callers) or `TenantPaths` (constructed only in tests) is assembled into the request path. The isolation controls exist as an unassembled kit. Until they are assembled at a PDP that every capability execution passes through, the architecture's isolation guarantees are not in force.

---

## Drift found (CHARTER §3 — disk is the source of truth)

[`IMPLEMENTATION_STATUS.md:48`](../IMPLEMENTATION_STATUS.md) records the tenant runtime as **VERIFIED — "physical isolation proven."** That is true of the *primitive in isolation* and its unit tests; it is **not** true of the running platform, where no capability path routes through the primitive. This review recommends the claim be qualified in `PROJECT_STATE.md` and a risk raised in `RISKS.md` (see [09_REMEDIATION_PLAN.md](09_REMEDIATION_PLAN.md)). No frozen document is contradicted — Doc 07 is correct; the implementation has not yet met it.

---

## What must change (minimum, no redesign)

The architecture is sound and needs no change. The gaps are all *wiring and coverage*:

1. **Assemble a Policy Decision Point / composition root** that every capability execution enters, carrying the gateway-authenticated tenant into a request-scoped context. (Closes R-07.9, R-08.11, R-21.6/7.)
2. **Route all IP-side durable state through `TenantPaths`** — replace the untenanted `VectorMemory` and run-keyed `state` maps with tenant-partitioned stores; adopt the security-engine's per-run pattern. (Closes L1, L2.)
3. **Give `VectorMemory`/`VectorIndex` a mandatory tenant dimension** and key run-state as `${tenantId}:${runId}`. (Closes L1, L2.)
4. **Populate the registry from onboarding** and share one authoritative registry between `RegistrationService` and `TenantPaths`. (Closes the R-07.4 wiring gap.)
5. **Wire `purge()` to `OFFBOARDING→CLOSED`.** (Closes R-21.24/25.)
6. **Add `verify-tenant-isolation.js`** — the ten-dimension gate (C-07.6) with a recorded fault proof, as D-012 requires (declaration and enforcement in one change).

Detailed, sequenced remediation is in [09_REMEDIATION_PLAN.md](09_REMEDIATION_PLAN.md) and [10_IMPLEMENTATION_ROADMAP.md](10_IMPLEMENTATION_ROADMAP.md). Full evidence per subsystem is in [04](04_ISOLATION_ANALYSIS.md)–[07](07_SECURITY_FINDINGS.md); the requirement-by-requirement matrix is [08_COMPLIANCE_MATRIX.md](08_COMPLIANCE_MATRIX.md).

---

## Bottom line

The DBiz Intelligence Plane has **designed** multi-tenancy correctly and **built the right primitives**, but has **not yet connected them to the paths that process tenant data**. It is safe at the front door and unguarded in the rooms behind it. This is the programme's own named failure class — *declared-but-unbuilt* / *architecturally sound, implementationally non-conformant* — appearing in the isolation layer. It is fixable without redesign, and the fixes are small relative to the platform, but until they land **the platform must not be certified for multi-tenant production operation.**
