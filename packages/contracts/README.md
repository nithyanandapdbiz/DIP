# @dbiz/contracts

The cross-plane contract surface. **The most critical artefact in the platform** — it is the single agreed definition of everything that crosses the sovereignty boundary.

**Traceability:** [19 — Repository Ownership](../../docs/architecture/19-repository-ownership.md) · [20 — Cross-Plane Contracts](../../docs/architecture/20-cross-plane-contracts.md) · [ADR-0003](../../docs/adr/ADR-0003-shared-package-vehicle.md) · [ADR-0004](../../docs/adr/ADR-0004-wire-format.md) · [ADR-0005](../../docs/adr/ADR-0005-canonical-integrity-primitive.md)

---

## What this package is

**Shape and validation only.** It contains no business logic: no inference, no credential handling, no decision computation (R-19.7).

Shared *logic* would execute in both a DBiz tenancy and a customer tenancy under different threat models, satisfying neither. Shared *shape* has no such problem — which is why the boundary is drawn exactly here, and why `C-19.4` asserts it on every commit.

| Contains | Does not contain |
|---|---|
| Contract type definitions and schemas | Business logic |
| Runtime validation (Zod) | AI or inference code |
| The canonical integrity primitive | Credential handling |
| Canonical serialisation (RFC 8785) | Anything touching customer systems |
| Version negotiation | Tenant-routing logic |
| Result and error taxonomies | Any decision or verdict computation |

## Contents

| Module | Purpose |
|---|---|
| `canonical` | RFC 8785 (JCS) canonicalisation — determines evidence identity |
| `integrity` | The platform's **only** hashing implementation: SHA-256, domain-separated, versioned |
| `execution-package` | The sealed artefact the IP authors and the EP sequences — seven required elements |
| `evidence` | Evidence references — what crosses; payloads never do |
| `assurance` | Assurance state; the certification admission guard |
| `version` | Contract version and supported-major negotiation |

## Usage

### Hashing — a domain is required, not optional

```ts
import { hash, verify } from '@dbiz/contracts';

const digest = hash('dbiz.evidence-payload@1', evidenceContent);
// -> { algorithm: 'sha256-jcs-v1', domain: 'dbiz.evidence-payload@1', value: '<64 hex>' }

const result = verify(digest, evidenceContent);
if (!result.ok) {
  // Failures are CLASSIFIED. "Algorithm unsupported" and "content altered" are
  // different facts; reporting both as a bare false is how false tamper verdicts
  // become indistinguishable from genuine corruption.
  switch (result.reason) {
    case 'digest-mismatch':        /* the content changed */ break;
    case 'algorithm-unsupported':  /* this build cannot verify it */ break;
    case 'malformed-digest':       /* the digest itself is invalid */ break;
    case 'domain-mismatch':        /* a digest from another context */ break;
  }
}
```

There is **no overload that omits the domain**, and `HashDomain` is a closed union — an undeclared domain is a compile error. Domain separation makes *meaning* part of the digest, so a package hash cannot be presented as an evidence hash.

### Parsing an execution package

```ts
import { parseExecutionPackage, hashableContent, hash, verify } from '@dbiz/contracts';

const pkg = parseExecutionPackage(payload);   // throws on unsupported contract version
if (!pkg.proceed) return halt(pkg.refusalReason);

// The content hash excludes itself, so a package is self-verifiable.
const ok = verify(pkg.provenance.contentHash, hashableContent(pkg)).ok;
```

### Assurance state — degraded results cannot be certified

```ts
import { admitForCertification } from '@dbiz/contracts';

const admission = admitForCertification(result.assuranceState);
if (!admission.admitted) {
  // Returns a typed refusal rather than throwing: a thrown error can be swallowed,
  // a returned refusal must be handled.
}
```

## Versioning

**Semantic versioning** (R-20.23). The Intelligence Plane supports every contract major version still deployed in any customer tenancy; an Execution Plane may run *older* than the IP, never the reverse (R-19.11).

| Change | Version |
|---|---|
| Add optional field | **minor** — unknown fields are preserved (R-20.4) |
| Add required field | **major** |
| Remove field | **major** |
| **Change a field's meaning** | **major** |
| Add enum member | **major** unless consumers tolerate unknown members |
| Tighten a constraint | **major** |

**Changing a field's meaning within a major version is the most dangerous change available**, because nothing fails: both sides validate, and the disagreement surfaces only as wrong behaviour, at a time and place unrelated to the change. It is prohibited by R-20.26.

## Migration guide

**Contract version.** Every instance carries `contractVersion`; a message without one is **rejected, not guessed at** (C-20.6). To adopt a new major: the IP adds support while retaining the previous major for its declared window; Execution Planes upgrade on their own calendars; `isSupported()` reports what this build accepts.

**Algorithm version.** Every digest carries its `algorithm`. Verification selects by the record's own declared version, so multiple versions coexist and **no flag day is required** — the property that makes an algorithm change performable at all across hundreds of independently scheduled deployments.

To introduce an algorithm: add it to `ALGORITHM_VERSIONS`, implement its branch (the `switch` is exhaustive, so omitting it fails to compile), and move `CURRENT_ALGORITHM`. Existing records continue verifying under their own version. Retire the old version only when no record under it remains within retention.

**Canonicalisation is not an algorithm change.** It alters the bytes hashed and therefore invalidates existing digests, so it requires re-hashing under a new algorithm version and is a **major** contract version (ADR-0005 §6).

## Published artefact

`pnpm schema` emits JSON Schema to `schema/`. **The schema is the published artefact, not the TypeScript types** — it is data, so it validates identically in both planes with no code generation, and a future non-TypeScript consumer is not excluded (ADR-0004 §4).

## Verification

```sh
pnpm build && pnpm test          # 58 tests
node ../../governance/verification/run-all.js
```

Test categories: unit · contract · negative · tampering · compatibility · security · regression · fault injection.

**`C-10.14` is the test this package exists to guarantee**: untampered evidence must *never* fail verification, across every supported algorithm version. The predecessor shipped the opposite — two implementations of one governed term whose digests diverged, so untampered records reported as tampered. A false tamper verdict is more corrosive than a missed detection: it trains operators to discount the control.
