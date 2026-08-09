# Certification Evidence — Software Update Management (Enterprise Release Candidate)

**Release candidate:** branch `feature/software-update-management`, commit `fc2ea6c` (cut from `main` @ `1fb3812`, Wave 0 baseline `da798308`).
**Certified by execution on:** 2026-07-27. Every claim below is a *run* result, not an assertion. The certification ran against the **isolated branch** (unrelated working-tree drift stashed away), so the evidence reflects the RC alone.
**Verdict:** **CONDITIONALLY CERTIFIED FOR ENTERPRISE PRODUCTION** — see §10. The capability passes every executed governance, security, regression, architecture, sovereignty, isolation, backward-compatibility and performance gate; the conditions are integration/runtime completions, not implementation defects.

---

## 1. Implementation Summary

Self-contained commit `fc2ea6c` — **12 files, +436 / −3**. Builds on the already-committed isolated modules (`package-signing.ts`, `update-management.ts`; `53dc245`).

| Category | Items |
|---|---|
| **New modules** (pre-committed, `53dc245`) | `package-signing.ts` (ed25519), `update-management.ts` (version band, compatibility, history) |
| **Modified (additive)** | `tenant-repository.ts` (+81: six methods), `api.ts` (+20: six routes + `signPackage`), `authz.ts` (+6: five mappings), `solution-export.ts` (+17: EP-agent branch), `web-client.ts` (+23), `index.ts` barrel (+12), `run-server.mjs` (+9), `api.tsx` (+8), `TenantDetails.tsx` (+74) |
| **New (this commit)** | `test/update-management-api.test.ts`, `docs/product/SOFTWARE-UPDATE-MANAGEMENT.md` |
| **Removed** | none |
| **Excluded by design** | production entrypoint `src/server/index.ts` + `src/server/main.ts` (deployment-stream files) — see condition C1 |

## 2. Architecture Impact

- **Business capability model** — unchanged. Not a seventh capability (R-11.4); an operational surface of the ADR-0035 portal.
- **API** — six additive routes under the existing `/api/tenants/<slug>/…`, each mapped to a least-privilege permission. No route removed or changed.
- **Tenant model** — one additive optional band on `tenant.json`, `epSolution`. SSOT preserved (ADR-0032); no second store.
- **Update workflow** — reuses the existing pull-event mechanism (`emitUpdate`/`listUpdates`/`acknowledgeUpdate`); no new channel.
- **Gates:** `verify-architecture-integrity`, `verify-architecture-fitness`, `verify-contract-compatibility` — **PASS**.

## 3. Security Assessment (all fail-closed)

Executed probes A1–A10 (48-check harness) — **10/10 PASS**:

| # | Property | Result |
|---|---|---|
| A1 | valid ed25519 detached signature verifies | PASS |
| A2 | tampered content hash rejected | PASS |
| A3 | wrong signing key rejected | PASS |
| A4 | malformed signature → `false`, no throw | PASS |
| A5 | empty signature value rejected | PASS |
| A6 | publish without a signer → **501** (never emits unsigned) | PASS |
| A7 | unauthorized publish (viewer) → **403** | PASS |
| A8 | unauthenticated publish → **401** | PASS |
| A9 | EP agent refuses events lacking signature/contentHash | PASS |
| A10 | audit records publish + install + rollback | PASS |

Integrity primitive: ADR-0005 SHA-256 content hash; signature: ADR-0007 ed25519 detached. Secrets never cross the boundary (INV-2); the signing private key is gitignored in dev and persisted on the state mount / secret manager in production, with a stable `keyId`.

## 4. Governance Assessment

`node governance/verification/run-all.js` → **RESULT: PASS — 27/27 gating checks green** on the isolated branch. Notably green: `verify-implementation-traceability`, `verify-change-control-completeness`, `verify-adr-completeness`, `verify-ai-vendor-neutrality`, `verify-architecture-integrity`, `verify-supply-chain`, `verify-programme-closure`. `verify-general-availability` is green because it **honestly reports GA as NOT CERTIFIED** — that status is unchanged by this feature.

## 5. Testing Summary

| Suite | Result |
|---|---|
| Engine unit + integration (`node --test`) | **126 / 126 pass** (incl. `update-management.test.ts` 8, `update-management-api.test.ts` 3) |
| Web SPA build (`tsc` + vite) | **clean · ✓ built** |
| Engine build (`tsc`, strict) | **clean** |
| Certification probes A–F | **48 / 48 pass** |
| Real-signer file-backed smoke | **16 / 16 pass** (signature verifies vs published hash; tamper fails closed; `epSolution` persists on disk) |
| Governance suite | **27 / 27 pass** |

No regressions in onboarding, registration, tenant-lifecycle, or compatibility suites (all part of the 126).

## 6. Backward Compatibility

Probes D1–D3 — **PASS**. A tenant with **no** `epSolution` band (pre-feature state) loads and lists updates without error; `isUpdateAvailable(undefined) === false` (no crash). Publishing an update to such a tenant **preserves** its entitled capabilities, customer-owned integrations, and technology profile byte-for-byte; the tenant id and lifecycle state are unchanged; **no tenant recreation, no migration**. The only new state is the additive `epSolution` band.

## 7. Performance (20 iterations, warm; measured impact)

| Operation | avg | p50 | max |
|---|---|---|---|
| solution generation | 0.15 ms | 0 ms | 1 ms |
| signing (ed25519) | 0.10 ms | 0 ms | 1 ms |
| sign+verify roundtrip | 0.15 ms | 0 ms | 1 ms |
| publish-update (gen+sign) | 0.55 ms | 1 ms | 1 ms |
| compatibility check | 0.05 ms | 0 ms | 1 ms |
| poll /updates | 0.10 ms | 0 ms | 1 ms |

**Impact: negligible.** Signing adds sub-millisecond cost; the publish path is dominated by (already-existing) deterministic generation. (In-memory measurements; disk I/O for the file-backed store is bounded by a single `tenant.json` read/write, unchanged from existing routes.)

## 8. End-to-End (per named production step)

Probe F — **15/15 steps evidenced**: existing tenant → publish → solution + content hash → ed25519 signature → update event created → EP polls (pending, pull-only) → version comparison → compatibility check → hash verification (event hash == published) → signature verification → operator approval (mandatory flag) → install + health (status up-to-date) → acknowledgement → tenant manifest updated (installed hash recorded) → audit recorded.

## 9. Risk Assessment (remaining risks)

| Risk | Severity | Mitigation / status |
|---|---|---|
| Production server cannot sign until its entrypoint wires the signer | Medium | The 3-line wiring exists (working tree) but is in the deployment-stream `server/index.ts`, excluded from this branch. Publish → 501 (fail-closed) until committed. **Condition C1.** |
| Live EP binary self-install (download→backup→install→health→rollback) is runtime-gated | Medium | The RC certifies the IP orchestration, the integrity/signature guarantees, the EP-agent refusal gate, and the state machine. The live install loop needs the package-fetch endpoint + trust-key distribution + a running EP — runtime-gated, like GA. **Condition C2.** |
| Unrelated working-tree drift in the repo | Low | Not part of this branch; certification ran isolated. Owners must reconcile before any merge to main. **Condition C3.** |
| Platform GA blocker (container runtime) | Pre-existing | Unchanged by this feature; external. **Condition C4.** |

## 10. Final Verdict — CONDITIONALLY CERTIFIED FOR ENTERPRISE PRODUCTION

Confirmed by execution:

- governance **PASS** (27/27) · security **PASS** (fail-closed, 10/10) · regression **PASS** (126/126) · architecture **PASS**
- sovereignty model **preserved** (INV-3 pull-only; C1–C5) · tenant isolation **preserved** (cross-tenant → 403; B1–B5)
- backward compatibility **preserved** (D1–D3) · pull-only communication **preserved** · update workflow **verified** (15/15)

**Blocking conditions before this branch is production-complete and mergeable:**

- **C1 — Production signer wiring.** Commit the production entrypoint's `signPackage` wiring (`server/index.ts`, ~3 lines) so a deployed IP can sign. Until then production publish returns 501 (safe, but non-functional).
- **C2 — EP install loop completion.** Provision the package-download endpoint + trust-key distribution to complete the live download→verify→backup→install→health-check→rollback path on a running EP.
- **C3 — Repository reconciliation.** The unrelated deployment/governance working-tree drift must be reconciled by its owners so the eventual merge to main is clean.
- **C4 — Platform GA (pre-existing).** A supported container runtime remains the platform-level GA dependency; independent of this feature.

**Merge recommendation:** hold. The RC is architecturally and behaviourally sound and breaks nothing. It should proceed to final architectural/governance review; merge only after C1 (at minimum) is satisfied and C3 is reconciled. **Do not auto-merge.**

---

*Evidence produced by executed verification on branch `feature/software-update-management` @ `fc2ea6c`. Traceability: ADR-0035 · ADR-0032 · ADR-0007 · ADR-0005 · INV-2/INV-3 · CHARTER §3/§13.*
