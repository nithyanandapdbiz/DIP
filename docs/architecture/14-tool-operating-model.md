# 14 — Tool Operating Model & Integration Strategy

**Status:** **FROZEN** · **Version:** 1.0 · **Date:** 2026-07-22 · **Milestone:** P1 / M1.5
**Governed by:** [01 — Platform Constitution](01-platform-constitution.md), Rule 7

**This document owns:** tool abstraction, the adapter interfaces, tool integration strategy, and vendor containment.
**It does not own:** AI providers ([13](13-ai-operating-model.md)), configuration schema ([15](15-configuration-model.md)), capability definitions ([11](11-capability-model.md)), or credential custody ([08](08-security-model.md)).

---

## 1. The rule

**R-14.1** Every external system sits behind a **platform-owned interface** (INV-5, R-7.1).

**R-14.2** A vendor name SHALL NOT appear outside its adapter — not in identity, orchestration, capabilities, configuration keys, logs, or error messages (R-7.2).

**R-14.3** Interfaces are expressed in the **platform's vocabulary**, never the vendor's.

**R-14.4** Adapter selection is driven by **tenant configuration** (R-7.4).

### Why the interface must exist before the first integration

In the predecessor, no interface existed at the moment of first integration, so a single test-management vendor propagated along the path of least resistance until it reached the **identity layer** — the hardest layer in any system to change safely. Each additional coupling site raised the cost of the eventual abstraction, and the abstraction was never built.

**This is a compound-interest failure.** The cost of adding the interface is lowest before the first integration and rises monotonically thereafter. **Order matters more than effort:** an interface written in an afternoon before the first adapter is worth more than a refactor costing months afterwards.

## 2. The interface classes

**R-14.5** The platform declares these interface classes. An external system SHALL be reachable only through one of them.

| # | Class | Examples of what sits behind it |
|---|---|---|
| **I1** | Test management | Work-item tracking, test case repositories |
| **I2** | Browser execution | Browser automation drivers |
| **I3** | API execution | HTTP and service invocation |
| **I4** | Load generation | Performance and load tools |
| **I5** | Security scanning | SAST, DAST, dependency scanners |
| **I6** | Penetration tooling | Exploitation and fuzzing tools |
| **I7** | Source control | Repository and change access |
| **I8** | Business systems | CRM, ERP, and other systems under test |
| **I9** | Notification | Delivery of outcomes to humans |

**R-14.6** Adding an interface class requires an approved ADR. Adding an **implementation** requires only the implementation and a passing conformance suite.

## 3. The adapter contract

**R-14.7** Every adapter SHALL: implement exactly one interface class; expose no vendor-specific method; declare its capabilities explicitly; and pass the class conformance suite before registration.

**R-14.8** An adapter SHALL declare what it **cannot** do. A capability requesting an unsupported operation receives an explicit, typed refusal — never a silent no-op.

**R-14.9** Adapters SHALL be **stateless with respect to a run**, or declare their state explicitly.

**R-14.10** Dry-run and live modes SHALL differ **only inside the adapter** (R-04.6). There is one code path through capability and framework.

**R-14.8 is the rule that prevents the predecessor's worst capability failure.** A missing tool operation that returns an empty success is indistinguishable, to its consumer, from a genuine clean result. An adapter must be able to say *"I do not support this"* in a way the framework can act on — which requires the refusal to be typed, not logged.

## 4. The conformance suite

**R-14.11** Every interface class SHALL have an **executable conformance suite**, and every implementation SHALL pass it before registration.

**R-14.12** The suite SHALL be authored **before the first implementation** of its class.

**R-14.13** The suite SHALL assert behaviour, not merely shape: error semantics, idempotency, timeout behaviour, and partial-failure handling.

**R-14.12 is deliberately awkward and deliberately non-negotiable.** Written after the first adapter, a conformance suite encodes that adapter's behaviour and every subsequent implementation is judged against one vendor's quirks. Written first, it defines the platform's requirements and the first vendor must meet them like any other. **The order determines whether the abstraction is real.**

## 5. Configuration key naming

**R-14.14** Configuration keys SHALL be **capability-named**: `execution.timeout`, never `<vendor>.timeout`.

**R-14.15** A tool-named key is a violation even where only one implementation exists.

**Rationale.** A tool-named key propagates the vendor into every consumer's mental model **and into customer-facing configuration**. Once a customer has written `<vendor>.timeout` into their configuration, replacing that vendor is a **breaking change to the customer**, not an internal refactor. The naming choice silently converts a reversible decision into an irreversible one.

## 6. Credentials and sovereignty

**R-14.16** Tool credentials are created, held, and rotated **by the customer**, in the Execution Plane (INV-2).

**R-14.17** Only credential **references** cross the plane boundary.

**R-14.18** Credentials SHALL be resolved at point of use, not gathered into a process-wide store.

**R-14.19** Adapters SHALL operate under **least privilege** — the minimum access the interface requires, per target.

## 7. Tool failure

**R-14.20** Tool unavailability is **unavailability**: the capability degrades where it can and reports honestly where it cannot. It SHALL NOT be reported as a clean result.

**R-14.21** A missing tool binary, script, or endpoint SHALL fail **loudly**. Soft failure is an explicit per-call-site opt-in and, in a security capability, requires an ADR.

**R-14.22** Every adapter SHALL declare a timeout. There is no unbounded tool invocation.

**R-14.21 encodes the predecessor's most dangerous defect.** Its dispatch wrapper logged a missing script and returned a soft failure, so an enterprise-tier penetration capability ran nothing and reported nothing wrong. **Soft failure must be opt-in, per call site, and visible** — because the default determines what happens in the cases nobody thought about, and those are the cases that matter.

## 8. Extension

**R-14.23** Adding a tool SHALL require **only**: an adapter implementation, a passing conformance suite, a registry entry, and tenant configuration to select it.

**R-14.24** Adding a tool SHALL NOT require changes to any capability, the framework, the contracts, or another adapter.

**R-14.25** No framework or capability code SHALL branch on adapter identity.

## 9. Conformance criteria

| # | Criterion | Verified by |
|---|---|---|
| **C-14.1** | No vendor identifier appears outside an adapter directory | Vendor-name scan across all source, config, and logs |
| **C-14.2** | Every external call passes through a declared interface | Egress-site gate |
| **C-14.3** | No configuration key is tool-named | Key-naming gate |
| **C-14.4** | Every interface class has a conformance suite authored before its first implementation | Repository history assertion |
| **C-14.5** | Every registered adapter passes its class conformance suite | Per-adapter suite run in CI |
| **C-14.6** | The suite asserts error semantics, idempotency, timeouts and partial failure | Suite content audit |
| **C-14.7** | An unsupported operation returns a typed refusal, never a silent success | Unsupported-operation test per adapter |
| **C-14.8** | A missing tool binary or endpoint fails loudly | Missing-target fault injection per adapter |
| **C-14.9** | Soft failure is opt-in per call site and never a default | Dispatch-wrapper audit |
| **C-14.10** | Every adapter declares a timeout | Registry inspection |
| **C-14.11** | Dry-run and live differ only within adapters | Path-equivalence test |
| **C-14.12** | No framework or capability code branches on adapter identity | Source scan |
| **C-14.13** | Adapter selection is tenant-configured, not environment-driven | Selection-source test |
| **C-14.14** | No credential material leaves the Execution Plane | Outbound guard |

**C-14.4 asserts against repository history**, which is unusual and intended. It is the only way to verify a *sequencing* requirement after the fact — and the sequencing is the entire substance of R-14.12.

## 10. Open items

| # | Item | Target |
|---|---|---|
| **AD-007** | Whether mobile execution is a seventh capability or an execution mode behind I2 | P2 |
| **AD-030** | Whether adapters may be supplied by customers, and the trust model if so | P2 |

**AD-030 has a sharp security dimension.** A customer-supplied adapter runs inside the customer's own tenancy with their credentials, so it is arguably entirely their risk — but it also executes inside a platform process that carries platform obligations for evidence integrity and governance. If a customer adapter can fabricate evidence, certification is compromised for a run DBiz nonetheless certified. Recorded rather than presumed.
