# Governance baseline — frozen at closure

**Commit:** `a7821fd63f6fedc2c7888478d33fcd33e300b765` · **Proofs recorded:** 2026-08-07T06:35:51.260Z

## Gating checks

**46 gates, all gating.** `NOT RUN` counts as `FAIL` (C-0.4) — the state the
predecessor's tooling lacked, which is why its dashboard stayed green while a fitness
test failed on branches nobody used.

1. `verify-architecture-integrity.js`
2. `verify-adr-completeness.js`
3. `verify-ai-vendor-neutrality.js`
4. `verify-implementation-traceability.js`
5. `verify-change-control-completeness.js`
6. `verify-decision-index.js`
7. `verify-governance-self-validation.js`
8. `verify-suite-integrity.js`
9. `verify-tool-contracts.js`
10. `verify-architecture-fitness.js`
11. `verify-contract-compatibility.js`
12. `verify-supply-chain.js`
13. `verify-traceability.js`
14. `verify-operational-readiness.js`
15. `verify-customer-readiness.js`
16. `verify-production-readiness.js`
17. `verify-general-availability.js`
18. `verify-repository-hygiene.js`
19. `verify-ep-certification.js`
20. `verify-discovery-conformance.js`
21. `verify-devchange-conformance.js`
22. `verify-devchange-certification.js`
23. `verify-performance-conformance.js`
24. `verify-sectest-conformance.js`
25. `verify-pentest-conformance.js`
26. `verify-pentest-completeness.js`
27. `verify-platform-certification.js`
28. `verify-tenant-lifecycle-conformance.js`
29. `verify-registration-conformance.js`
30. `verify-http-surface.js`
31. `verify-http-surface-parity.js`
32. `verify-platform-contract-framework.js`
33. `verify-execution-contracts.js`
34. `verify-connector-spi.js`
35. `verify-decision-engine.js`
36. `verify-intelligence-models.js`
37. `verify-reporting-model.js`
38. `verify-platform-events.js`
39. `verify-provider-platform.js`
40. `verify-composition-root.js`
41. `verify-data-sovereignty-store.js`
42. `verify-run-record-write-surface.js`
43. `verify-operator-writer-census.js`
44. `verify-programme-closure.js`
45. `verify-intelligence-plane-egress.js`
46. `verify-execution-plane-boundary.js`

## Fault proofs

**63 proofs, 49 proved**, each re-recorded and replayed rather than transcribed.

| Gate | Planted violation | Clean | Faulted | Cause named |
|---|---|---|---|---|
| `verify-architecture-integrity.js` | document without ownership boundary, without conformance criteria, with a dangling reference | 0 | 1 | yes |
| `verify-adr-completeness.js` | ADR missing required sections | 0 | 1 | yes |
| `verify-ai-vendor-neutrality.js` | AI vendor and model named as a platform requirement | 1 | 1 | yes |
| `verify-implementation-traceability.js` | source file with no TRACEABILITY block | 1 | 1 | yes |
| `verify-tool-contracts.js` | a tool contract naming an SPI that exists nowhere in the repository | 1 | 1 | yes |
| `verify-suite-integrity.js` | a source test file with no compiled counterpart — it would silently never run | 0 | 1 | yes |
| `verify-change-control-completeness.js` | ADR declaring an affected component that was never created | 1 | 1 | yes |
| `verify-governance-self-validation.js` | gate present on disk but not registered in the runner (NOT RUN, therefore FAIL) | 1 | 1 | yes |
| `verify-architecture-fitness.js` | a canonical document that is not frozen | 0 | 1 | yes |
| `verify-contract-compatibility.js` | a retained fixture that no longer parses under the current build | 0 | 1 | yes |
| `verify-supply-chain.js` | build output containing an artefact no build produced | 1 | 1 | yes |
| `verify-traceability.js` | an architecture document with no implementation milestone — an orphan | 0 | 1 | yes |
| `verify-operational-readiness.js` | a customer screenshot retained in Intelligence Plane storage | 1 | 1 | yes |
| `verify-operational-readiness.js` | an API gateway that serves unauthenticated and cross-tenant callers | 1 | 1 | yes |
| `verify-customer-readiness.js` | a generator emitting TypeScript for every declared supported language | 1 | 1 | yes |
| `verify-production-readiness.js` | a health endpoint that reports healthy while nothing is reporting | 1 | 1 | yes |
| `verify-general-availability.js` | a document claiming General Availability while E-2 is unmeasured | 0 | 1 | yes |
| `verify-programme-closure.js` | an architecture document added after the closure baseline was frozen | 1 | 1 | yes |
| `verify-platform-contract-framework.js` | a platform contract declared implemented while its canonical type is not on disk (over-claim) | 0 | 1 | yes |
| `verify-http-surface.js` | a transport that answers requests without any security headers | 0 | 1 | yes |
| `verify-execution-contracts.js` | a sealed execution context that is not deep-frozen (immutability broken) | 0 | 1 | yes |
| `verify-connector-spi.js` | a provider brand named inside a capability-neutral connector SPI descriptor | 0 | 1 | yes |
| `verify-decision-engine.js` | a Decision Engine that produces different decisions for identical inputs (nondeterminism) | 0 | 1 | yes |
| `verify-decision-engine.js` | a Decision Engine in which an AI recommendation overrides a higher-precedence governance rule | 0 | 1 | yes |
| `verify-decision-engine.js` | a Decision Engine that returns a mutable (non-frozen) Decision Object | 0 | 1 | yes |
| `verify-intelligence-models.js` | a Repository Intelligence model that is not deep-frozen (mutable model) | 0 | 1 | yes |
| `verify-intelligence-models.js` | a capability-specific (provider-named) field inside a capability-neutral platform model | 0 | 1 | yes |
| `verify-intelligence-models.js` | a second canonical definition of RepositoryIntelligenceModel (duplicate definition) | 0 | 1 | yes |
| `verify-reporting-model.js` | a Reporting model that is not deep-frozen (mutable model) | 0 | 1 | yes |
| `verify-reporting-model.js` | a capability-specific (provider-named) reporting field in a capability-neutral model | 0 | 1 | yes |
| `verify-reporting-model.js` | an embedded execution payload instead of an evidence reference | 0 | 1 | yes |
| `verify-reporting-model.js` | a second canonical definition of ReportingModel (duplicate definition) | 0 | 1 | yes |
| `verify-platform-events.js` | a PlatformEvent/Observability object that is not deep-frozen (mutable event) | 0 | 1 | yes |
| `verify-platform-events.js` | a business payload embedded in a PlatformEvent instead of a reference | 0 | 1 | yes |
| `verify-platform-events.js` | an execution-control field on a PlatformEvent (events must be observational only) | 0 | 1 | yes |
| `verify-platform-events.js` | a second canonical definition of PlatformEvent (duplicate definition) | 0 | 1 | yes |
| `verify-provider-platform.js` | a second reader of process.env outside the Configuration Provider | 0 | 1 | yes |
| `verify-provider-platform.js` | an @azure/* import introducing cloud lock-in into the provider platform | 0 | 1 | yes |
| `verify-provider-platform.js` | the additive provider platform importing a deferred runtime/legacy component | 0 | 1 | yes |
| `verify-provider-platform.js` | node:fs used outside the Storage/Secret providers | 0 | 1 | yes |
| `verify-discovery-conformance.js` | adapters that are configured and typed but whose invocation is never recorded | 1 | 1 | yes |
| `verify-platform-certification.js` | a document asserting the platform is CERTIFIED while the evidence says NOT CERTIFIED | 0 | 1 | yes |
| `verify-platform-certification.js` | the measuring harness emitting six CERTIFIED capabilities and a CERTIFIED platform with no passing gate behind any of it | 0 | 1 | yes |
| `verify-devchange-conformance.js` | a catalogue that registers every domain agent but none of the governance agents, so no stage can be certified | 1 | 1 | yes |
| `verify-performance-conformance.js` | an architecture document added for the Performance Engine (forbidden by ADR-0026; capability 4 needs none) | 0 | 1 | yes |
| `verify-sectest-conformance.js` | an architecture document added for the Security Testing Engine (forbidden by ADR-0028; capability 5 needs none) | 0 | 1 | yes |
| `verify-pentest-conformance.js` | an architecture document added for the Penetration Testing Engine (forbidden by ADR-0027; capability 6 needs none) | 0 | 1 | yes |
| `verify-devchange-certification.js` | a domain orchestrator (learning) that enumerates its agents instead of invoking them, leaving learning.capture dormant and runtime completeness below 100% | 0 | 1 | yes |
| `verify-pentest-completeness.js` | a registered agent (threat.zero-day-awareness) that is never invoked, leaving it dormant and runtime completeness below 100% | 0 | 1 | yes |
| `verify-tenant-lifecycle-conformance.js` | an onboarding orchestrator reporting the deferred stages 8-14 as done rather than pending, provisioning a tenant on assumption | 0 | 1 | yes |
| `verify-registration-conformance.js` | an OTC store that accepts a consumed credential a second time — single-use broken, replay permitted (R-36.2) | 0 | 1 | yes |
| `verify-repository-hygiene.js` | a stub carrying a TODO and a not-implemented throw, shipped in the source tree | 0 | 1 | yes |
| `verify-ep-certification.js` | a tampered EP certification (content hash mismatch / forged signature) presented to the IP | 0 | 1 | yes |
| `verify-execution-plane-boundary.js` | an Intelligence-Plane source file that live-imports playwright and launches a browser | 0 | 1 | yes |
| `verify-http-surface-parity.js` | a route() action with no controller mapping — the live server 404s while every route()-level test passes | 0 | 1 | yes |
| `verify-http-surface-parity.js` | a route() action accepted under a verb no controller maps — the action exists on both sides, so only the method comparison can see it | 0 | 1 | yes |
| `verify-intelligence-plane-egress.js` | an Intelligence-Plane source file opening an outbound connection to a customer system (R-3.2), carrying a customer credential (R-3.3) | 0 | 1 | yes |
| `verify-intelligence-plane-egress.js` | an Intelligence-Plane source file importing an HTTP client library | 0 | 1 | yes |
| `verify-intelligence-plane-egress.js` | an Intelligence-Plane source file capturing fetch as a VALUE — const capture, globalThis reference and argument passing — without ever calling it directly | 0 | 1 | yes |
| `verify-run-record-write-surface.js` | a third module driving the run record write surface, so a cause ADR-0082 never authorised enters through an existing event-named method | 0 | 1 | yes |
| `verify-data-sovereignty-store.js` | a second persisting module in the storage layer with no authorising ADR, no declared retention, and a C1 credential on its write path | 0 | 1 | yes |
| `verify-data-sovereignty-store.js` | a purge driver that is operator-initiated rather than scheduled, and that swallows a purge failure instead of alerting | 0 | 0 | yes |
| `verify-composition-root.js` | a controller mounted behind an optional ApiDeps field that the composition root never sets — a surface declared, gated, and unreachable in every deployment | 0 | 1 | yes |

**The sharpest three, kept together because they are what the registry is for:**

- a **gateway that stops refusing** unauthenticated and cross-tenant callers
- a **health endpoint that reports green while nothing is reporting**
- a **document falsely claiming General Availability**

If any of those failed to turn a gate red, the corresponding certification would be
decorative.

## Governance metrics at closure

| Index | Value |
|---|---|
| Enterprise Readiness Index | NOT MEASURED |
| Governance Confidence Index | NOT MEASURED |
| Release Confidence Index | NOT MEASURED |
| Security Compliance | **NOT MEASURED** |
| Operational Readiness | `4/6 proven, 1 NOT MEASURED` |
| Customer Readiness | `1/3 proven, 5 NOT MEASURED` |
| Observability | **NOT MEASURED** |
| Production Readiness | `2/5 measured, 6 NOT MEASURED` |
| General Availability | **NOT MEASURED** |

**Every index publishes score, coverage and freshness** (C-24.5). A score without
coverage is the most dangerous number a governance system can publish, because it is
most reassuring exactly when it is least true.

## Evidence registry

| Set | Generator | Regenerated by |
|---|---|---|
| M2.6 Operational Readiness | `governance/operational/run-operational-evidence.js` | its gate, on every run |
| M2.7 Customer Success | `governance/customer-success/run-customer-evidence.js` | its gate, on every run |
| M2.8 Production Readiness | `governance/production/run-production-evidence.js` | its gate, on every run |
| General Availability | `governance/deployment/run-deployment-evidence.js` | its gate, on every run |
| M2.4 Trusted Supply Chain | `governance/verification/verify-supply-chain.js` | its gate, on every run |
| M2.5a Coverage & Traceability | `governance/traceability/generate-matrices.js` | its gate, on every run |
| M2.2 Consumer Compatibility | `packages/contracts/compat/harness.mjs` | its gate, on every run |

**Evidence is regenerated, never read.** Committed evidence would keep asserting a
property long after it stopped holding — which is the failure the evidence exists to
catch, one level up.

## Rules that shaped this baseline

| Rule | Effect |
|---|---|
| R-13.1 | A hand-authored status value is prohibited. Every measurement derives from evidence. |
| R-13.3 | `NOT MEASURED` is never reported, aggregated or omitted as a pass. |
| R-13.4 | Every gate carries a machine-readable fault-injection proof. |
| R-14.2 | Proofs are replayed. A proof that cannot be reproduced is not a proof. |
| R-14.5 | Evidence expires. Trust does not accumulate. |
| C-0.4 | `NOT RUN` ≡ `FAIL`. |

---

*Generated from the runner, the proof registry and 7 evidence sets.*
