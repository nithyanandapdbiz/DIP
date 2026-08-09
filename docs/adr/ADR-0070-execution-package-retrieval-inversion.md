# ADR-0070 — Execution Package Delivery: the Execution Plane Pulls

**Status:** Accepted
**Date:** 2026-08-04 · **Accepted:** 2026-08-04
**Governed by:** [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md); [01 — Platform Constitution](../architecture/01-platform-constitution.md) Rule 5
**Relates to:** [ADR-0037](ADR-0037-execution-target-simplification.md) (**enforced, not amended**) · [ADR-0036](ADR-0036-execution-plane-registration-and-trust-establishment.md) (registration identity) · [ADR-0050](ADR-0050-runtime-enablement-m4.md) (the transport ports this retires) · [ADR-0069](ADR-0069-capability-one-connector-realisation.md) §2.2

> **This ADR enforces an existing decision; it amends nothing.** ADR-0037 §116 already records that
> the Execution Plane *"pull[s] its signed package from the IP (the 'only egress', R-05.1)"*, and
> R-5.1 already mandates that every cross-plane exchange is EP-initiated. The implementation
> contradicts both. The alternative to this ADR is amending Rule 5, and Rule 5 is the sovereign
> split. **No code is changed here.** The `ExecutionPackage` contract is untouched.

---

## 1. Problem

`launcher/generator/generateBindings.mjs:37` emits an Intelligence Plane that **pushes** the sealed
package to an address it holds:

```js
send: (pkg, signature, attempt) => epSend(executionPlaneEndpoint, pkg, signature, attempt)
```

That inverts R-5.1, and it is the reason the Intelligence Plane knows the Execution Plane's address
at all. Eight further IP references exist only to hold, validate and thread that address
(`bootstrapContext.mjs:8`, `configurationService.mjs:5`, `configurationValidator.mjs:8`,
`executionPlaneValidator.mjs:7,13`, `bindingsService.mjs:26`, `devBootstrap.mjs:19,21,40`,
`docker-compose.dev.yml:30`). Each has a plausible local justification; the whole contradicts the
constitution. Recorded as `TECHNICAL_DEBT.md` **D-007 instance (v)** — the load-bearing one.

The contradiction survived ADR-0037's acceptance, the CROSSPLANE-001 certification and the CLAES
wiring audit, all of which describe pull in prose while the emitted bindings push. No gate compared
the declaration to the implementation.

## 2. Context

**Content-addressing already makes pull work.** R-4.2 fixes the package as immutable and
content-addressed; R-4.4 requires every execution to be attributable to exactly one package hash.
Fetch-by-hash therefore makes attribution mechanical rather than conventional: the hash the Execution
Plane fetched is the hash it must attribute.

**The Execution Plane already initiates.** It is the sole public entry and already runs the single
cross-plane client. Under push, the cross-sovereignty surface spans two modules in two repositories;
under pull it collapses to one, on the side that owns egress — so R-5.3 is *better* satisfied, not
merely preserved.

**The Execution Plane does not exist yet.** This is the last moment the contract is free to settle
without a migration.

## 3. Alternatives

**A. Amend Rule 5 to permit IP-initiated delivery.** Rejected. Rule 5 is the sovereign split;
amending the constitution to match an implementation inverts the precedence CHARTER §3 establishes.

**B. Keep push, allowlist the egress.** Rejected. It legitimises IP→EP dialling, which is exactly
what R-5.1 forbids, and it leaves the address-holding cluster permanently justified.

**C. Invert delivery: the EP pulls the sealed package by hash.** Chosen. It enforces ADR-0037 and
R-5.1, collapses the address cluster, and needs no contract change.

## 4. Decision

**P-70.1 — The Execution Plane retrieves; the Intelligence Plane never delivers.** The IP's
obligation ends when a sealed package exists and is retrievable. It opens no connection to the
Execution Plane, for delivery or for any other purpose (R-3.2, R-5.1, R-5.2).

**P-70.2 — The package hash is returned on the request the Execution Plane already makes.** No new
notification channel and no polling: the EP is already the initiator, so the hash rides the exchange
it already performs. The subsequent fetch is a separate, idempotent operation.

**P-70.3 — Retrieval is by content hash, and that is what makes it recoverable.** `GET
/api/packages/{hash}`. An Execution Plane that crashes mid-execution re-fetches by the hash it
already holds, without re-requesting work and without the IP tracking delivery state. R-4.4's
attribution requirement is satisfied mechanically.

**P-70.4 — Retrieval is authorised by OWNERSHIP, not merely by identity.** *This is the property
this ADR exists to fix, and it must not be read as implied by P-70.3.*

A content hash is a **guessable-if-leaked bearer handle**. Authenticating the caller as *a*
registered Execution Plane is **not sufficient**: it would let a registered EP for tenant A retrieve
tenant B's package. That is the **F-04 class** exactly — a resource keyed by a caller-supplied value,
authorised at identity level but never at ownership level — and it is the defect that took a full
remediation cycle to close on the tenant routes. It SHALL NOT be rebuilt on the package route.

Therefore:

1. The authenticated Execution Plane identity (ADR-0036: mTLS + token) SHALL be resolved to a
   principal, and that principal SHALL be shown to own the tenant the package was **sealed for** —
   the `mayAccessTenant()` pattern already applied at `api.ts:115`, applied to retrieval.
2. Tenant scope comes from the authenticated principal, never from a caller-supplied field (C-07.11).
   The hash identifies *which* package; it never establishes *entitlement to* one.
3. A refusal SHALL be indistinguishable between "no such hash" and "not yours", so retrieval cannot
   be used to probe for the existence of another tenant's packages.
4. **A negative test proving a cross-tenant fetch is REFUSED is part of the definition of done**, not
   a follow-up. A positive-only test would pass against an endpoint carrying this defect.

**P-70.5 — The retrieval endpoint is an Intelligence-Plane HTTP surface and inherits its governance.**
It is therefore governed automatically by `verify-http-surface-parity.js`: the route must be served by
`route()` and mapped by a mounted controller under the same verb, or the gate fails. It is also in
scope for `verify-http-surface.js`, which drives the assembled application over a real socket — the
gate that exists because the F-04 class was found there.

**P-70.6 — The Intelligence-Plane transport is retired, and retired deliberately.** Under pull the IP
performs no send, awaits no response and classifies no transient failure, so
`src/runtime/execution-plane-transport.ts` (`createExecutionPlaneTransport`, ADR-0050) becomes
obsolete **in this plane**. It is not a footnote: it carries four conformance tests
(`runtime-enablement-conformance.test.ts:88,103,109,115`) and a registered fault proof
(`record-fault-proofs.js:1455`). Its retirement is a scoped step with its own evidence, sequenced
after the retrieval endpoint exists — never a side effect of deleting a binding.

## 5. Consequences

**What improves.** The cross-sovereignty surface collapses to one module on the plane that owns
egress. The IP stops holding an address it has no constitutional business knowing, and eight
references collapse with the ninth. Recovery becomes a re-fetch rather than a re-request. Attribution
(R-4.4) becomes mechanical.

**What it costs.** A new authenticated, tenant-scoped IP endpoint and its negative-path tests. The
retirement of `createExecutionPlaneTransport` and the migration of its four tests. The launcher's
"Execution Plane" stage loses its remaining member, so the pipeline reduces from seven stages to six.

**What does not change.** The `ExecutionPackage` contract, its seal, its content addressing, plane
ownership, evidence-by-reference, and the twelve-stage lifecycle. **No contract version moves and no
compatibility window opens** — verified: `verify-contract-compatibility` is green now and is
unaffected, because delivery is not described by the contract.

**Risk.** P-70.4 is the whole security surface of this change. An implementation that authenticates
but does not authorise would pass every structural gate and reproduce F-04 against customer execution
packages — which carry the tenant's authored tests. The negative test is the control, and it is why
it is named in the decision rather than left to implementation.

## 6. Migration strategy

Post-acceptance, each step separately authorised; **none performed here.** The Execution Plane
repository does not exist (`PROJECT_STATE.md` §9.1), so steps 2–5 are sequenced behind it.

1. Amend [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) to record
   retrieval as the delivery mechanism and the hash as returned on the existing request.
2. Implement `GET /api/packages/{hash}` with ownership authorisation (P-70.4) and its negative test.
3. Return the package hash on the existing Execution-Plane request (P-70.2).
4. Remove the emitted `send` binding and the `executionPlaneEndpoint` argument from
   `generateBindings.mjs`; collapse the eight address-holding references.
5. Retire `createExecutionPlaneTransport` and migrate its four tests and its fault proof (P-70.6).

**Confirmed before sequencing:** the launcher survives the ADR-0061 retirement. `generateBindings.mjs`
composes `createCanonicalRunnerCapability` — the canonical runner, which ADR-0061 preserves — and the
`launcher/` tree contains **zero** references to `createFunctionalTestingEngine` or
`FunctionalTestingOrchestrator`, its retirement targets. Restructuring the pipeline is therefore safe
from that direction.

## 7. Version impact

- **No contract change.** `CONTRACT_SCHEMA_VERSION`, `EXECUTION_CONTEXT_VERSION` and
  `PACKAGE_GOVERNANCE_VERSION` unchanged; no compatibility window.
- [20 — Cross-Plane Contracts](../architecture/20-cross-plane-contracts.md) takes a **version
  increment**: the exchange gains a retrieval operation and the delivery direction is fixed.
- ADR-0037 is **enforced, not superseded**. ADR-0050's transport ports become obsolete in the
  Intelligence Plane (P-70.6).
- Gate count unchanged: the new endpoint is governed by gates that already exist.

## 8. Affected components

- `docs/adr/ADR-0070-execution-package-retrieval-inversion.md` — **New** (this ADR).
- `docs/architecture/20-cross-plane-contracts.md` — **Amended** (§6 step 1: retrieval recorded as the delivery mechanism).
- `program/DECISIONS.md` — **Amended** (ADR-0070 index row).
- `program/TECHNICAL_DEBT.md` — **Amended** (D-007 instance (v) carries this ADR as its resolution path).
- `packages/tenant-onboarding-engine/src/engine/api.ts` — **Amended** (§6 step 2: the retrieval route, authorised by `mayAccessTenant`).
- `packages/tenant-onboarding-engine/src/server/tenant.controller.ts` — **Amended** (§6 step 2: the mounted mapping `verify-http-surface-parity` requires).
- `packages/functional-testing-engine/launcher/generator/generateBindings.mjs` — **Amended** (§6 step 4: the `send` binding and endpoint argument removed).
- `packages/functional-testing-engine/src/runtime/execution-plane-transport.ts` — **Amended** (§6 step 5: retired in this plane, with its tests and fault proof migrated).

**No frozen architecture document, no contract, and no existing governance gate is modified by this ADR.**
