/**
 * THE WRITER — the component that makes an authored package RETRIEVABLE (ADR-0081 §6 step 3).
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md (R-20.28, R-20.29) · 06-data-sovereignty.md ·
 *                  07-tenant-isolation.md (C-07.11) · 12-capability-orchestration.md (R-12.2)
 *   ADR          : ADR-0081 (P-81.1 ordering, P-81.2 envelope, P-81.5 parse-before-write) ·
 *                  ADR-0079 (the store, P-79.2 the partition is the authorisation) ·
 *                  ADR-0082 (P-82.9's write-surface discipline; the publication gate) ·
 *                  ADR-0070 (P-70.1 "exists AND is retrievable" — two acts)
 *   Debt         : D-122 (nothing had ever written) · D-124 · D-019 (what the triad reviews)
 *
 * ══ THIS IS THE WRITER D-122 RULED ON, AND IT IS DELIBERATELY NOT A UTILITY ════════════════════
 *
 * `SealedPackageStore.onPackageSealed` had **zero non-test callers in the entire tree**: a deployed,
 * authenticated, tenant-partitioned retrieval route over a store that had never held a package this
 * plane produced. **Whatever calls it fixes the shape the Execution Plane parses for as long as the
 * contract lives**, which is why it arrived as a ruling before a build.
 *
 * ══ AUTHORING AND PUBLICATION ARE TWO ACTS, AND THIS IS THE SECOND ═════════════════════════════
 *
 * P-70.1's "a sealed package EXISTS AND IS RETRIEVABLE" is two conjuncts and two MOMENTS. Stage 7
 * authors; this publishes. Conflating them is what put composition at the end of the lifecycle
 * (D-124) — a package cannot be authored after the run it exists to enable.
 *
 * ══ THE WRITE SURFACE ENUMERATES ITS EVENTS (ADR-0082 P-82.9's discipline) ═════════════════════
 *
 * One method, named for its cause. There is deliberately no `write()`, no `save()`, and NO OPTIONS
 * BAG CARRYING A DISCRIMINATOR — a `kind: 'fetch'` parameter is a third event wearing a field's
 * clothes, and it is exactly how a delivery record (P-70.3, forbidden) would enter a store that
 * looks like it only holds packages. **A third cause needs a third method**, which is visible in a
 * diff and is an ADR amendment.
 *
 * ══ WHY THE DECISION ARRIVES AS A PORT RATHER THAN AN IMPORT ═══════════════════════════════════
 *
 * `decidePublication()` lives in `@dbiz/capability-framework`, which this package does not depend
 * on — and adding that dependency would make the tenant/API tier depend on the capability
 * framework, inverting the layering. The dependency is therefore INVERTED exactly as ADR-0079 does
 * for `TenantOwnershipResolver`: **this module declares the shape it needs, and the process that
 * holds the decision supplies it.** The same reasoning that kept `receiveEvidence` out of the
 * evidence route (D-128).
 */
import { parseExecutionPackage } from '@dbiz/contracts';
import { tenantContext, type SealedPackageStore, type RunRecordStore } from '@dbiz/platform-providers';
import type { TenantConfigRepository } from './tenant-repository.js';

/**
 * The publication decision, as this module needs to see it.
 *
 * STRUCTURALLY COMPATIBLE WITH `PublicationDecision` FROM THE CAPABILITY FRAMEWORK, and declared
 * here rather than imported for the layering reason above. It is deliberately NOT narrowed to
 * `admissible: boolean`: the per-leg record is part of the decision (ADR-0082 condition 2), and a
 * writer that accepted only the boolean would let a caller reduce it — discarding exactly the
 * distinction that makes the basis weak.
 */
export interface PublicationVerdict {
  readonly admissible: boolean;
  readonly basis: string;
  readonly legs: readonly { readonly stage: string; readonly disposition: string; readonly reason: string }[];
  readonly judged: number;
  readonly unjudged: number;
  readonly reason: string;
}

/** Raised when publication is refused. A write refusal is LOUD; a read refusal never is (P-79.6). */
export class PackagePublicationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackagePublicationRefused';
  }
}

export interface SealedPackageWriterDeps {
  readonly repo: TenantConfigRepository;
  readonly store: SealedPackageStore;
  /**
   * ADR-0082 §6 step 2 — THE RUN RECORD (P-82.1), recorded at authoring time by this plane about
   * its OWN act, from the package stage 7 just sealed.
   *
   * OPTIONAL, AND ITS ABSENCE IS NOT A SILENT SKIP: without it the plane publishes packages nobody
   * can be told about, which is the state this step exists to end. It is optional only so that the
   * writer's own suite can exercise publication in isolation; the composition root supplies it.
   */
  readonly runs?: RunRecordStore;
}

export interface PackageSealedEvent {
  /**
   * ADR-0082 P-82.1. The run this authoring belongs to — the identity `/work` will answer by, and
   * the one an arriving evidence reference will be attributed to (step 3).
   */
  readonly runId: string;
  /** The authored package, exactly as composed. Parsed here, never re-serialised before hashing. */
  readonly package: unknown;
  /** The detached signature over it (R-20.22). Stored beside the package, never inside it. */
  readonly signature: unknown;
  /** The publication gate's decision. Refused unless admissible. */
  readonly verdict: PublicationVerdict;
}

export interface PackagePublished {
  readonly hash: string;
  readonly tenantSlug: string;
  /** ADR-0082. `false` only when this composition has no run record store (see `SealedPackageWriterDeps.runs`). */
  readonly runRecorded: boolean;
  /** Carried so a caller can record WHAT the publication was admitted on (ADR-0082 condition 2). */
  readonly admittedOn: PublicationVerdict;
}

export function createSealedPackageWriter(deps: SealedPackageWriterDeps): {
  onPackageSealed(event: PackageSealedEvent): Promise<PackagePublished>;
} {
  return {
    async onPackageSealed(event: PackageSealedEvent): Promise<PackagePublished> {
      // ── 1. THE PUBLICATION GATE, FIRST ────────────────────────────────────────────────────
      //
      // Nothing is parsed, resolved or written for a run that may not publish. The gate is the
      // governance triad's verdict (ADR-0082 severance 3): admissible, NOT certified — the triad
      // reviews PRESENCE, not soundness (D-019), so the plane has not found a reason to refuse
      // rather than having established that the package is sound.
      if (!event.verdict.admissible) {
        throw new PackagePublicationRefused(`publication refused: ${event.verdict.reason}`);
      }

      // ── 2. P-81.5 — THE WRITER PARSES BEFORE IT PUTS ──────────────────────────────────────
      //
      // The canonical composer already ends with `parseExecutionPackage`. THIS IS NOT THAT CHECK
      // REPEATED: it closes the PATH rather than one producer, so a future second producer cannot
      // reach the store without satisfying the published contract. D-121 is the record of what a
      // producer that never parses its own output costs — a shape that could not enter this store
      // at all, undetected for as long as nothing called the store.
      //
      // IT RUNS BEFORE OWNERSHIP RESOLUTION deliberately: a malformed package is a defect in this
      // plane, and reporting it as a tenant-resolution problem would send a reader to the registry.
      let parsed;
      try {
        parsed = parseExecutionPackage(event.package);
      } catch (e) {
        throw new PackagePublicationRefused(
          `the authored package does not satisfy the published contract: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // ── 3. THE PARTITION, RESOLVED FROM THE PACKAGE'S OWN PROVENANCE ──────────────────────
      //
      // `provenance.tenantId` travels INSIDE the sealed body and therefore inside the hash it will
      // be requested by (P-78.8). The slug is a routing convenience resolved through the registry —
      // NEVER derived from the tenantId, which is `randomBytes(6)` and is not a function of the
      // slug (P-79.2). The store re-asserts this; resolving here is what lets the write name a
      // partition at all.
      const slug = resolveSlug(deps.repo, parsed.provenance.tenantId);
      if (slug === undefined) {
        throw new PackagePublicationRefused(
          `provenance.tenantId "${parsed.provenance.tenantId}" does not resolve to exactly one tenant`,
        );
      }
      const env = deps.repo.load(slug);
      if (!env) {
        throw new PackagePublicationRefused(`tenant "${slug}" is not loadable`);
      }

      // ── 4. THE WRITE. SIGNATURE FIRST, BODY SECOND — the store enforces the ordering ───────
      //
      // The body is the commit point: its presence implies the signature's, so a crash between the
      // two leaves an inert signature rather than an unverifiable package that would still be
      // FOUND. A partial write fails toward the absence of the thing that is SERVED, never toward
      // the absence of the thing that PROVES it.
      const ctx = tenantContext({ tenantId: env.onboarding.tenantId, tenantSlug: slug });

      // ── 4a. THE RUN RECORD FIRST, AND THE ORDER IS THE DECISION (ADR-0082 P-82.1) ─────────
      //
      // P-81.1's reasoning, applied to a different pair. Ask which partial write is DISCOVERABLE:
      //
      //   run recorded, package missing → `/work` offers the run, the Execution Plane fetches it,
      //                                   and the retrieval REFUSES. Loud, at the far side, on the
      //                                   very next poll.
      //   package written, run missing  → nothing ever offers the run. The package is retrievable
      //                                   and NOBODY IS EVER TOLD IT EXISTS. Silent, and permanent.
      //
      // **A partial write SHALL fail toward the failure that announces itself.** The run record is
      // therefore written first, and a failure to record it stops publication entirely rather than
      // producing a package no `/work` response will ever mention.
      //
      // DO NOT REORDER THESE TWO AWAITS. They differ only on a crash between them, so every test
      // over a successful publication passes either way — the ordering is invisible in a green
      // suite and visible only here.
      if (deps.runs) {
        await deps.runs.onPackageAuthored(ctx, {
          runId: event.runId,
          packageHash: parsed.provenance.contentHash.value,
          contractVersion: parsed.contractVersion,
          authoredAt: parsed.provenance.authoredAt ?? new Date().toISOString(),
        });
      }

      const hash = await deps.store.onPackageSealed(
        ctx,
        JSON.stringify(parsed),
        JSON.stringify(event.signature),
      );

      return { hash, tenantSlug: slug, admittedOn: event.verdict, runRecorded: deps.runs !== undefined };
    },
  };
}

/**
 * THE ONE CANONICAL RESOLVER, REUSED RATHER THAN RE-IMPLEMENTED.
 *
 * `resolveSlugByTenantId` is fail-closed — exactly one match, else `undefined`. A second
 * slug-from-tenantId rule would be the duplicate source of truth ADR-0032 forbids. The WRONG second
 * rule WAS in the tree — `knownTenant` in `ip-execute-gateway.mjs`, returning the first
 * `readdirSync` match — and it went with that gateway on 2026-08-06 (ADR-0049 M5). **This writer is
 * what replaced it**, and the past tense is deliberate: the offender is gone, the requirement is
 * not. Binding a package to whichever tenant happens to sort first is a cross-tenant write
 * (C-07.11), whoever writes it next.
 */
function resolveSlug(repo: TenantConfigRepository, tenantId: string): string | undefined {
  const hits = repo.list().filter((t) => t.tenantId === tenantId);
  return hits.length === 1 ? hits[0]!.slug : undefined;
}
