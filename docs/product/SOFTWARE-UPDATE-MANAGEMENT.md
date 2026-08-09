# Product surface — Software Update Management (for onboarded tenants)

**Status:** authorised by [ADR-0035](../adr/ADR-0035-execution-plane-operational-portal.md) (ACCEPTED 2026-07-24) as an extension of the Execution-Plane Operational Portal. Additive; no new invariant, no new capability.
**Owner:** DBiz Intelligence Plane *publishes*; the customer's Execution Plane *pulls and installs*. The IP never enters the tenancy.
**Classification:** an **operational surface**, not a seventh capability (R-11.4) and not a fourth Platform Service. It ships **software and configuration updates** to a tenant that is already onboarded — it performs no quality engineering and yields no certified verdict.

---

## 1. Problem

Onboarding produces a tenant's Execution-Plane solution once. Afterwards the platform improves — new generator/template versions, capability changes, configuration edits. An enterprise needs a governed way to get those improvements to an **already-deployed** tenant **without** DBiz reaching into the customer's environment.

The constraint that shapes everything here: **INV-3 — the Execution Plane always initiates; the Intelligence Plane never dials in and never pushes.** An update is therefore not something the IP *sends*. It is something the IP *makes available*, signs, and records — and the EP *pulls* on its own poll loop, exactly as it already pulls capability and integration updates.

## 2. The six operations

All six are IP-side API actions on `/api/tenants/<slug>/…`, each mapped to a least-privilege permission ([authz](../../packages/tenant-onboarding-engine/src/engine/authz.ts)):

| Operation | Route | Permission | What it does |
|---|---|---|---|
| **Publish platform update** | `POST …/publish-update` | `tenant:activate` | Regenerates the EP solution from `tenant.json`, **signs** its content hash (ed25519), stamps the `epSolution` version band, and emits a `solution-update` pull event. |
| **Sync configuration** | `POST …/sync-config` | `tenant:configure` | Re-emits the tenant's current configuration as a pull event (no regeneration) so the EP re-reads its config. |
| **Check compatibility** | `POST …/check-compatibility` | `tenant:configure` | Compares a candidate EP runtime (contract/schema major, runtime floor, removed capabilities) against the published solution. Returns block/warn reasons. |
| **Pending updates** | `GET …/updates` | `tenant:read` | The existing pull surface. The EP polls it; a published update appears here as a `solution-update` event carrying the signature. |
| **Update history** | `GET …/update-history` | `tenant:read` | The chronological publish/install/rollback record, derived from the tenant's immutable audit trail. |
| **Rollback** | `POST …/rollback` | `tenant:lifecycle` | Restores the recorded prior installed version and marks the band `rolled-back`. |

The EP additionally reports its installed version with `POST …/installed` (`tenant:update`) — the EP's own credential can call it, nothing more.

## 3. The pull-only, signed flow

```
IP (publish)                          EP (its own poll loop, INV-3)
────────────                          ─────────────────────────────
publish-update
  ├─ regenerate solution (tenant.json → deterministic manifest, ADR-0005 content hash)
  ├─ sign(contentHash) → ed25519 detached signature (ADR-0007)
  ├─ stamp epSolution: publishedVersion/Hash/KeyId, status=update-available
  └─ emit solution-update event (carries the signature)   ──pull──▶  GET /updates
                                                                       ├─ receive solution-update event
                                                                       ├─ REFUSE if no signature/hash
                                                                       ├─ verify signature vs content hash
                                                                       │    (fail → never install; tampered/unsigned rejected)
                                                                       ├─ operator-approved install:
                                                                       │    backup → install → health-check → rollback on failure
                                                                       └─ POST /installed  ──▶  stamp epSolution status=up-to-date
```

Nothing crosses the boundary except a **credential-scoped pull** and a **signature over a hash**. No package bytes are pushed; no plaintext secret moves (INV-2); the IP opens no connection into the tenancy (INV-3).

## 4. State — the `epSolution` band on `tenant.json`

`tenant.json` remains the single source of truth (ADR-0032). Update state is one additive band, `epSolution`:

```
publishedVersion / publishedHash / publishedKeyId / publishedAt   — what the IP has signed and offered
installedVersion / installedHash / installedAt                    — what the EP reported installing
status: up-to-date | update-available | installing | failed | rolled-back
rollbackPoint                                                     — the prior installed version, for rollback
```

`isUpdateAvailable(epSolution)` is simply "published ≠ installed". No second store, no push queue.

## 5. Integrity

- **Signing** — [`package-signing.ts`](../../packages/tenant-onboarding-engine/src/engine/package-signing.ts): `node:crypto` ed25519, detached signature over the ADR-0005 content hash. `verifyContentHash` **fails closed** — a wrong key, a tampered hash, or a malformed signature returns `false`, never throws.
- **Key handling** — the private signing key is created once and persisted (gitignored in dev; on the durable state mount / a secret manager in production). A stable `keyId` means signatures on already-published packages stay verifiable across restarts. Publishing without a configured signer returns **501**, never an unsigned package.
- **Refusal at the EP** — the generated update agent rejects any `solution-update` event lacking a signature and content hash before it records anything.

## 6. Operator experience

The IP tenant dashboard ([`TenantDetails`](../../packages/tenant-onboarding-web/src/pages/TenantDetails.tsx)) gains a **Software Update** card: current `epSolution` status and published/installed versions, and buttons for Publish (with a *mandatory* toggle), Sync configuration, Check compatibility, Update history, and Rollback. It is the same one execution/governance path the terminal uses — the UI adds no logic of its own (R-33.2).

## 7. Reuse (why this was additive, not new machinery)

The capability is ~85–90% existing surface: the deterministic generator and content hash (ADR-0005), the pull-event mechanism (`emitUpdate`/`listUpdates`/`acknowledgeUpdate`), the EP poll agent, the audit trail, the RBAC model, and the SPA client were all already present. Genuinely new: the ed25519 signer, the version/compatibility/history helpers, the `epSolution` band, and the six thin routes that compose them.

## 8. Upgrade & rollback in operation

This surface realises exactly what the customer runbooks already describe — it does not replace them:

- **[RUNBOOK-platform-upgrade](../customer-success-package/runbooks/RUNBOOK-platform-upgrade.md)** — the customer-visible expectation when DBiz publishes an update (no downtime, reversible).
- **[RUNBOOK-execution-plane-upgrade](../customer-success-package/runbooks/RUNBOOK-execution-plane-upgrade.md)** — regenerate → review the deterministic diff → deploy → run diagnostics: the same steps `publish-update` + the EP install perform.
- **[RUNBOOK-rollback](../customer-success-package/runbooks/RUNBOOK-rollback.md)** — redeploy the previous version; credentials are independent of deployment version, so a rollback never loses identity. The `rollback` operation records the platform-side equivalent.

## 9. What this explicitly does NOT do

- **No push.** There is no IP→EP connection, no webhook into the tenancy, no server-initiated install. INV-3 is preserved verbatim.
- **No secret movement.** Only a signature over a hash and a credential-scoped pull cross the boundary (INV-2).
- **No certification.** Publishing an update is not a certified verdict; stages 10–12 remain IP-only (R-12.5 / C-12.10) and are untouched.
- **No new SSOT.** All state is the additive `epSolution` band on `tenant.json` (ADR-0032).

---

*Hand-authored product-surface note. Traceability: ADR-0035 · ADR-0032 (SSOT) · ADR-0007 (signed package) · ADR-0005 (content hash) · INV-2 / INV-3.*
