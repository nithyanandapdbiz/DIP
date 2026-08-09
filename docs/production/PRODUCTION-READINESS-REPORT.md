# Production readiness report

**35/35 measured properties hold** across the operational run, the benchmarks and the resilience suite. **5 are NOT MEASURED.**

*(`governance/production/evidence.json` is authoritative and carries one further*
*property — the generation of these reports — which is recorded after they are written.)*

## The headline

**This platform is not certified for General Availability, and this report does not
claim it is.** GA means deployed and operated in production. Nothing here has ever
been deployed: Docker is unavailable, so E-2 has been `NOT MEASURED` since M2.5 and
still is. Everything below was measured in-process, and no in-process measurement is
evidence about a deployed system.

What M2.8 establishes is narrower and still worth having: **when this platform runs,
its health is observable, its failures are diagnosable, and its releases are
verifiable.**

## Measured

| # | Property | Result |
|---|---|---|
| P-1 | the full tenant lifecycle executes and every stage emits telemetry | **PASS** |
| P-2 | every operation is traceable by correlation id, and no span is left unfinished | **PASS** |
| P-3 | telemetry refuses customer content at the call site (C-23.11) | **PASS** |
| P-4 | liveness, readiness and health answer different questions, and silence is not health | **PASS** |
| P-5 | SLIs compute from emitted telemetry, and report NOT MEASURED without it | **PASS** |
| P-6 | security events are recorded, classified and attributable to a tenant | **PASS** |
| P-6.p | a working control is not counted as an availability failure | **PASS** |
| P-6.f | failure counters are proven by causing the failures they count | **PASS** |
| P-7 | the audit chain is complete across the lifecycle and survives decommissioning | **PASS** |
| P-8 | every dashboard panel names a declared metric, and unemitted metrics are reported | **PASS** |
| P-9 | release governance verifies artefact integrity, pinning and compatibility | **PASS** |
| P-10 | every tenant is independently observable, and an unreported tenant is unknown rather than healthy | **PASS** |
| B-1 | certificate issuance (real X.509 via OpenSSL) | **PASS** |
| B-2 | Execution Plane registration (issue certificate, client, tokens) | **PASS** |
| B-3 | authenticated gateway call (certificate + token + nonce + rate limit) | **PASS** |
| B-4 | Execution Plane solution generation (14 files, content-hashed) | **PASS** |
| B-5 | certificate rotation with overlap | **PASS** |
| B-6 | secret rotation (new version, previous readable) | **PASS** |
| B-7 | per-tenant queue enqueue | **PASS** |
| B-8 | access token verification (certificate-bound, replay-checked) | **PASS** |
| B-9 | interleaved per-tenant write and read-back across 40 tenants | **PASS** |
| R-1 | a restarted process still trusts certificates issued before the restart | **PASS** |
| R-2 | a restarted gateway serves credentials issued before the restart | **PASS** |
| R-3 | a connection interrupted mid-request does not destabilise the gateway | **PASS** |
| R-4 | an expired certificate is refused, and the refusal is classified | **PASS** |
| R-5 | a revoked secret version dies while the current version keeps working | **PASS** |
| R-6 | one tenant's total failure does not affect another | **PASS** |
| R-7 | a rate-limited caller is refused and succeeds after the window | **PASS** |
| R-8 | repeating an operation does not duplicate its effect | **PASS** |
| R-9 | a decommissioned tenant can be re-provisioned and works again | **PASS** |
| R-10 | replay protection holds within a process, and the refusal names replay as the reason | **PASS** |
| R-11 | replay protection holds ACROSS INSTANCES when a shared nonce store is supplied | **PASS** |
| R-11.d | the platform reports when it is running single-process replay protection | **PASS** |
| P-replay | the operational run replays to an identical outcome | **PASS** |
| R-replay | resilience scenarios replay to an identical outcome | **PASS** |

## Not measured

| # | Property | Blocker |
|---|---|---|
| G-1 | the platform runs in a deployed production environment | Docker unavailable — nothing has ever been deployed. Every measurement here is in-process, and no in-process measurement is evidence about a deployed system. Unchanged since M2.5 (E-2) |
| G-2 | performance under production load and concurrency | benchmarks measure a single process on one developer machine. They bound what the code can do; they say nothing about a horizontally scaled deployment behind a load balancer, and must not be used as a capacity model |
| G-3 | SLO attainment over a real measurement window | SLIs are computed correctly from emitted telemetry, and were exercised over a synthetic run. A 30-day window against production traffic has not occurred, so no SLO has been ATTAINED — only computed |
| G-4 | incident detection in production, and detection source | R-23.20 requires recording whether an incident was found by the platform or by a customer. No production incident has occurred, so the detection-source measurement has no data |
| G-5 | shared nonce store in a horizontally scaled deployment | the requirement is proven and the store is injectable (R-11), but no shared implementation is deployed. Document 17 declares this plane horizontally scaled, so a production deployment MUST supply one — recorded in the debt register |

## Fitness functions

| Question | Answer |
|---|---|
| Is production health observable? | **Yes, when running.** Health, readiness and liveness answer different questions, and silence reports `unknown` rather than healthy. |
| Is every failure diagnosable? | **Yes.** Every refusal is classified, attributed to a tenant and traceable by correlation id. Unrecognised signals are returned as `unclassified` rather than guessed. |
| Is every release reproducible? | **Yes.** Artefact integrity is verified by recomputation, and a single tampered byte fails. |
| Is every deployment traceable? | **Partially.** Manifests carry commit and provenance; no deployment has occurred to trace (G-1). |
| Is every tenant independently observable? | **Yes.** SLIs and health are per tenant, and an unreported tenant reads `unknown`. |
| Is operational evidence reproducible? | **Yes.** The operational run and the resilience suite each replay to an identical outcome. |

---

*Generated by governance/production/run-production-evidence.js*
