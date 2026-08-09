# ADR-0012 — Cloud Portability

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-014

---

## 1. Problem

Both planes need object storage, queues, key management, secret storage and databases. Are these consumed as cloud-native services, or abstracted — and what does that imply for where each plane can run?

## 2. Context

- The Execution Plane runs **where the customer's data lives** — frequently on-premises, in a regulated private cloud, or air-gapped.
- Tenants may declare residency regions ([06](../architecture/06-data-sovereignty.md) R-06.7).
- Customer-tenancy data is encrypted under customer-held keys ([ADR-0008](ADR-0008-encryption-at-rest.md)), so key management must bind to whatever the customer operates.
- Cloud-agnosticism is a stated platform obligation over a ten-year horizon.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **Cloud-native services used directly** | Fastest to build, best operational integration. **Rejected**: it makes the Execution Plane undeployable in on-premises and air-gapped tenancies — precisely the customers whose sovereignty constraints make the split valuable. |
| **Abstract only in the Execution Plane** | Tempting, since only that plane faces varied environments. **Rejected**: two storage models, two key-management models, and interfaces that diverge because only one side exercises them. |
| **Full abstraction, both planes** | **Selected.** |
| **Abstract via a third-party multi-cloud framework** | Rejected — substitutes a dependency for a boundary, and its abstraction choices would become the platform's whether or not they fit. |

## 4. Decision

- **No layer above the adapter layer references a cloud primitive directly** (R-17.11).
- Cloud services sit behind **platform-owned interfaces** ([14](../architecture/14-tool-operating-model.md)).
- Both planes run on **any major cloud and on customer-managed infrastructure** (R-17.13).
- Deployment artefacts are **container images** with no cloud-specific packaging requirement (R-17.14).
- Cloud selection is **configuration**, never a build-time or code-level decision (R-17.15).

**Abstracting both planes rather than only the Execution Plane** is deliberate. An interface exercised by one implementation is not an abstraction; it is that implementation with extra indirection. Both planes using the same interfaces means the second implementation is proven by construction rather than discovered when first needed.

## 5. Consequences

**Positive.** The Execution Plane is deployable in the environments that matter commercially; DBiz retains freedom to change its own cloud; residency is enforceable per region; no cloud vendor acquires leverage over the platform.

**Negative, accepted.** Cloud-native conveniences are unavailable — managed autoscaling hooks, native queue semantics, provider-specific key management features must be reached through an interface or not at all. This is a real ongoing cost, paid in exchange for deployability into the platform's hardest and most valuable markets.

**Prohibited.** Any cloud primitive referenced above the adapter layer, including in configuration keys (R-7.3, R-14.14).

## 6. Migration strategy

None required — taken before implementation.

**Forward path.** Adding a cloud target is implementing existing interfaces and passing their conformance suites ([14](../architecture/14-tool-operating-model.md) R-14.11) — no changes to capabilities, framework or contracts. Moving a deployment between clouds is a configuration and data-migration exercise with no code change.

**Constraint.** The conformance suite for each interface class SHALL be authored **before its first implementation** (R-14.12); otherwise the first cloud's semantics become the de-facto specification and portability is decorative.

## 7. Version impact

No contract version change — infrastructure choice is invisible across the plane boundary, which is itself evidence the abstraction sits in the right place. Adding an interface class requires an ADR; adding an implementation does not.

## 8. Affected components

[17](../architecture/17-deployment-topology.md) §3 (owning document) · [14](../architecture/14-tool-operating-model.md) (interface classes and conformance suites) · [08](../architecture/08-security-model.md) §7 (key management behind an interface) · [16](../architecture/16-runtime-model.md) (no cloud-specific process assumptions) · every storage, queue, secret and key-management consumer.
