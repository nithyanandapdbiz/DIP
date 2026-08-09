/**
 * The Sealed Package Store (ADR-0079) — the Intelligence Plane's first customer-derived persistence.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.4 four conditions, R-06.5, R-06.9, R-06.12,
 *                  R-06.13, R-06.14, R-06.15) · 07-tenant-isolation.md (R-07.1-3) ·
 *                  17-deployment-topology.md (R-17.16-19)
 *   ADR          : ADR-0079 (this store) · ADR-0060 (the provider it is built on) ·
 *                  ADR-0070 (P-70.3 no delivery state, P-70.4 one refusal signal) ·
 *                  ADR-0078 (P-78.6, which named this store and did not build it) ·
 *                  ADR-0010 (the layout) · ADR-0032 (the registry ownership is asserted through)
 *   Criteria     : C-06.3 (authorising ADR in the storing module's source) · C-06.6 (retention
 *                  declared) · C-06.7 (retention read by code) · C-06.8 (purge test) ·
 *                  C-06.11 (no C1 persists) · C-07.11 (cross-tenant refusal) · C-01.11
 *
 * THE AUTHORISING ADR IS RECORDED HERE, IN SOURCE, DELIBERATELY (R-06.5, C-06.3).
 * An authorisation recorded only in a separate document is not verifiable at the point it
 * matters. `AUTHORISING_ADR` below is read by the gate, not just written for a human.
 *
 * ── THE PARTITION IS THE AUTHORISATION (P-79.2) ──────────────────────────────────────────────
 *
 * The caller supplies a HASH. The caller never supplies, and cannot influence, the partition
 * segment: it is resolved from the authenticated principal before the key is constructed. A
 * caller cannot express a request for another tenant's partition, so there is no caller-supplied
 * value for a check to fail to constrain.
 *
 * This is enforcement by ADDRESSING, not by a PREDICATE. A hash belonging to another tenant is
 * not refused after being found — it is NEVER FOUND, because the address it would have to be
 * found at is not constructible from this caller's context.
 *
 * DO NOT "IMPROVE" THIS INTO A CHECK. Replacing the addressing with a predicate over a flat
 * store is a regression that EVERY TEST WOULD STILL PASS: addressing and a predicate agree on
 * every well-formed input and differ only on the attack. This paragraph is the control.
 *
 * ── THE OWNERSHIP ASSERTION NEEDS A REGISTRY, NEVER A DERIVATION (P-79.2) ────────────────────
 *
 * The store partitions by SLUG; the package carries `provenance.tenantId`. These DO NOT
 * RECONCILE LOCALLY. `tenantId` is `randomBytes(6)` (R-21.3, "opaque and meaningless"); `slug`
 * is `slugify(organisationName)`. Neither is a function of the other, and no code in either
 * plane computes one from the other.
 *
 * A FUTURE READER WILL REACH FOR A DERIVATION — the two values look like they should be
 * related, and the cheapest-looking implementation is a string transform that would be wrong in
 * a way no test written against a well-formed tenant would catch. There is no derivation. Every
 * resolution is a registry lookup, and it arrives here as an injected port.
 *
 * THE RESOLVER IS FAIL-CLOSED BY CONTRACT. `TenantOwnershipResolver` returns `undefined` unless
 * exactly ONE tenant matches. Resolving ambiguously is a WRITE REFUSAL, not a first-match. The
 * plane holds two resolvers with different safety and only one of them is admissible here; see
 * the port's own documentation below.
 *
 * ── WHY THE PORT, AND NOT AN IMPORT ─────────────────────────────────────────────────────────
 *
 * The registry lives in `@dbiz/tenant-onboarding-engine`, which this package is forbidden to
 * import (ADR-0060's additive-only posture, enforced by verify-provider-platform.js PP-6). The
 * dependency is therefore inverted: the store declares the port, and the process that already
 * holds `TenantConfigRepository` supplies it. Per ADR-0079 §2.2 this needs no new mechanism —
 * the write-time lookup is already performed at seal time — only the CORRECT one of the two
 * that exist.
 */
import type { TenantContext } from '../tenant/tenant-context.js';
import type { StorageProvider, ArtefactKey } from './storage-provider.js';
import type { Clock } from '../distributed/distributed-state-provider.js';

/**
 * The ADR that authorises this store to hold customer-derived data (R-06.4 condition 1, R-06.5).
 * Read by the document-06 gate from this source file. Removing it is a governance failure, not
 * a tidy-up.
 */
export const AUTHORISING_ADR = 'ADR-0079';

/**
 * The two constant layout segments, and the abuse is admitted rather than glossed (P-79.2).
 *
 * The canonical layout is `tenant/capability/run/artefact` (R-17.17). Here `capability` and
 * `run` are constants: neither is a capability nor a run. That is a mild abuse of the layout's
 * semantics. It is accepted because the alternative — a fifth segment form, or a second path
 * constructor — costs the R-07.3 single-constructor property, which is worth more than
 * segment-name fidelity.
 *
 * ADR-0010 §6's binding constraint is PRESERVED: the tenant-leading prefix is unchanged, so
 * every isolation and purge property that depends on it holds and `purgeTenant` remains a
 * prefix operation.
 */
export const SEALED_PACKAGE_CAPABILITY = 'packages';
export const SEALED_PACKAGE_RUN = 'sealed';

/**
 * THE DETACHED SIGNATURE'S SEGMENT (ADR-0081 P-81.1) — A PARALLEL `run`, NOT A `<hash>.sig` SUFFIX.
 *
 * This looks like a naming preference and is not. `purgeExpired` skips every artefact name failing
 * `HASH_RE`, so a `<hash>.sig` sibling would NEVER BE PURGED — signatures outliving the packages
 * they sign, an R-06.13 / C-06.8 breach created by the fix. The obvious repair is to loosen
 * `HASH_RE` in the purge loop.
 *
 * **THAT REPAIR WEAKENS A SECURITY CONTROL TO CLOSE A RETENTION HOLE.** The same pattern guards
 * `keyFor`, where it stops a non-hash segment reaching the storage layer, and a reviewer who
 * relaxes it in one loop invites the next reader to relax it in the constructor — and
 * addressing-by-validated-hash is what P-79.2 rests on.
 *
 * A parallel run segment keeps BOTH artefact segments a bare hash, so no pattern is relaxed
 * anywhere, and the purge hole becomes an EXPLICIT ENUMERATION CHANGE rather than a loosened
 * regex. ADR-0010 §6's binding constraint is preserved: the tenant-leading prefix is untouched, so
 * `purgeTenant` remains a prefix operation.
 */
export const SEALED_PACKAGE_SIGNATURE_RUN = 'signatures';

/** A sealed package's content hash — the key, and the only thing a caller supplies. */
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * THE DECLARED RETENTION (R-06.9, C-06.6). A store without one SHALL NOT be registered.
 *
 * This constant is READ BY `retentionExpiryFor` below, not merely declared (R-06.12, C-06.7).
 * A retention field with no reader is what document 06 calls CONFIGURATION THEATRE, and R-06.12
 * exists because the predecessor shipped exactly that: a 90-day limit that was customer-visible,
 * schema-validated, API-served, console-rendered, and read by no code.
 */
export const SEALED_PACKAGE_RETENTION = Object.freeze({
  /** The store's highest classification (P-79.3). C1 is absent BY CONSTRUCTION, never stored. */
  classification: 'C3' as const,
  /** The tenant C3 ceiling in the Intelligence Plane (06:62). Not tenant-configurable upward. */
  maxRetentionDays: 90,
  authorisingAdr: AUTHORISING_ADR,
});

const DAY_MS = 86_400_000;

/**
 * Resolve a tenant's partition slug from the opaque `tenantId` a sealed package carries.
 *
 * FAIL-CLOSED IS PART OF THE CONTRACT, not an implementation detail of whoever supplies it.
 * An implementation SHALL return `undefined` unless EXACTLY ONE tenant matches — the semantics
 * of `resolveSlugByTenantId` (registration.ts:430), which returns `hits.length === 1 ? … :
 * undefined`.
 *
 * IT SHALL NOT be first-match-wins. The rule is stated positively because the counter-example it
 * was written against — `knownTenant` in `ip-execute-gateway.mjs`, which returned the FIRST
 * `readdirSync` hit and was what the seal-time path then held — was removed with that gateway on
 * 2026-08-06 (ADR-0049 M5). **The requirement outlived the offender and is not weakened by its
 * removal:** binding a package to whichever tenant happens to sort first is a cross-tenant write
 * (C-07.11), whoever writes it next.
 */
export interface TenantOwnershipResolver {
  resolveSlugByTenantId(tenantId: string): string | undefined;
}

/** The fields the store reads from the sealed body. It parses; it never re-derives. */
interface SealedBodyView {
  readonly provenance: { readonly tenantId: string; readonly contentHash: { readonly value: string } };
  readonly validity: { readonly notAfter: string };
}

/**
 * Retrieval outcome. ONE refusal expression across every refused state (P-79.6).
 *
 * There is deliberately no reason code, no discriminated refusal subtype, and no field a caller
 * could branch on. Adding one would recreate the oracle P-70.4 exists to deny.
 */
export type SealedPackageRetrieval =
  | {
      readonly outcome: 'found';
      /** The sealed package body, byte-for-byte as written. */
      readonly body: string;
      /**
       * The DETACHED signature over it (ADR-0081 P-81.2). Always present on a `found`:
       * a package whose signature is absent is REFUSED, not served unsigned.
       */
      readonly signature: string;
    }
  | { readonly outcome: 'refused'; readonly refusal: string };

/**
 * THE SINGLE REFUSAL EXPRESSION (P-79.6, ADR-0078 P-78.2).
 *
 * Names the hash it declined and NOTHING ELSE. Every refused state produces this byte-for-byte:
 *
 *   - no such hash in this partition
 *   - the hash exists in another tenant's partition (under P-79.2, not even looked for)
 *   - the hash exists here and `validity.notAfter` has passed
 *   - the hash exists here and its owning tenant has since been OFFBOARDED (§5.2)
 *
 * The fourth is the one that would have leaked. `repo.delete(slug)` removes the directory
 * outright, so a legitimately-stored package's owner can become unresolvable AT RETRIEVAL TIME —
 * a real retrieval-time occurrence of the fifth condition, arriving through the one path nobody
 * would think to test for it. It stays four result classes ONLY because this function exists:
 * had P-79.6 said "three states" without saying "one expression", deleting a tenant would have
 * made its former packages distinguishable from never-existing ones.
 */
export function sealedPackageRefusal(hash: string): string {
  return `no retrievable package for hash "${hash}"`;
}

/** Raised when a write is refused. A write refusal is loud; a read refusal never is. */
export class SealedPackageWriteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealedPackageWriteRefused';
  }
}

export class SealedPackageStore {
  constructor(
    private readonly storage: StorageProvider,
    private readonly owners: TenantOwnershipResolver,
    private readonly now: Clock = () => Date.now(),
  ) {}

  /**
   * The key. The partition comes from `ctx` — the authenticated principal — and the artefact
   * segment is the hash. The caller contributes the hash and nothing else (P-79.2).
   */
  private keyFor(hash: string, run: string = SEALED_PACKAGE_RUN): ArtefactKey {
    if (!HASH_RE.test(hash)) {
      // Shape-refused before it can reach the storage layer. `artefactPath` would also reject
      // a traversal-shaped segment; this is the earlier, narrower gate for a value we know the
      // exact shape of.
      //
      // BOTH SEGMENTS COME THROUGH HERE, WHICH IS THE POINT OF THE PARALLEL-RUN DESIGN: the
      // signature's artefact segment is the SAME bare hash, so this check is not relaxed for it.
      throw new SealedPackageWriteRefused(`"${hash}" is not a content hash`);
    }
    return { capability: SEALED_PACKAGE_CAPABILITY, run, artefact: hash };
  }

  /**
   * The retention expiry for a package: `min(validity.notAfter, authoredAt + C3 ceiling)`
   * (P-79.4). THIS IS THE CODE READER R-06.12 REQUIRES — `SEALED_PACKAGE_RETENTION` is
   * consumed here and drives the purge, not a comment.
   *
   * `validity.notAfter` bounds the artefact on its own contractual terms (R-22.5); the tenant's
   * C3 ceiling bounds it on sovereignty terms; the store takes the EARLIER.
   *
   * RETENTION IS NEVER A FUNCTION OF WHETHER THE PACKAGE WAS FETCHED. That is what preserves
   * P-70.3, and it is why ADR-0079 alternative E is rejected.
   */
  retentionExpiryFor(body: SealedBodyView, storedAtMs: number): number {
    const contractual = Date.parse(body.validity.notAfter);
    const sovereign = storedAtMs + SEALED_PACKAGE_RETENTION.maxRetentionDays * DAY_MS;
    return Number.isFinite(contractual) ? Math.min(contractual, sovereign) : sovereign;
  }

  /**
   * Store a sealed package and its detached signature into the caller's own partition.
   *
   * ── THE METHOD IS NAMED FOR ITS EVENT, NOT FOR ITS MECHANISM (ADR-0082 P-82.9's discipline) ──
   *
   * This was `put`. **A store whose write surface enumerates its EVENTS cannot acquire a third
   * cause without acquiring a third method**, which is visible in a diff and is an ADR amendment;
   * a store with a general `put` acquires new causes silently. There is deliberately no options
   * bag and no discriminator parameter — `kind: 'fetch'` is a third event wearing a field's
   * clothes.
   *
   * ── THE OWNERSHIP ASSERTION FAILS THE WRITE (P-79.2) ─────────────────────────────────────────
   *
   * It is not a warning, not a quarantine, and not a stored-with-flag. A package whose
   * `provenance.tenantId` resolves to a different partition — or resolves ambiguously, or not at
   * all — never enters the store, which is why ADR-0078's result taxonomy stays at four.
   *
   * ── THE SIGNATURE IS WRITTEN FIRST, AND THE ORDER IS PART OF THE DECISION (P-81.1) ──────────
   *
   * **THE BODY IS THE COMMIT POINT.** Its presence IMPLIES the signature's. A crash between the
   * two leaves a signature with no package — inert, never served, and purged unconditionally by
   * `purgeExpired`. **The reverse order leaves a package that cannot be verified and would still
   * be FOUND**, which is the one state this design exists to prevent.
   *
   *   **A partial write SHALL fail toward the absence of the thing that is SERVED, never toward
   *   the absence of the thing that PROVES it.**
   *
   * DO NOT REORDER THESE TWO AWAITS. They differ only on a crash between them, so every test over
   * a successful write passes either way — the ordering is invisible in a green suite and visible
   * only here and in the fault proof.
   */
  async onPackageSealed(ctx: TenantContext, sealedBody: string, signature: string): Promise<string> {
    let body: SealedBodyView;
    try {
      body = JSON.parse(sealedBody) as SealedBodyView;
    } catch {
      throw new SealedPackageWriteRefused('sealed body is not parseable JSON');
    }

    const claimedTenantId = body?.provenance?.tenantId;
    const hash = body?.provenance?.contentHash?.value;
    if (typeof claimedTenantId !== 'string' || !claimedTenantId) {
      throw new SealedPackageWriteRefused('sealed body carries no provenance.tenantId');
    }
    if (typeof hash !== 'string' || !HASH_RE.test(hash)) {
      throw new SealedPackageWriteRefused('sealed body carries no usable provenance.contentHash.value');
    }
    if (typeof body?.validity?.notAfter !== 'string') {
      // R-06.9: a package with no expiry cannot be given a retention, and a store without a
      // retention SHALL NOT hold it.
      throw new SealedPackageWriteRefused('sealed body carries no validity.notAfter');
    }

    // THROUGH THE REGISTRY, NEVER A DERIVATION. Fail-closed on ambiguity by the port's contract.
    const ownerSlug = this.owners.resolveSlugByTenantId(claimedTenantId);
    if (ownerSlug === undefined) {
      throw new SealedPackageWriteRefused(
        `provenance.tenantId "${claimedTenantId}" does not resolve to exactly one tenant`,
      );
    }
    if (ownerSlug !== ctx.tenantSlug) {
      throw new SealedPackageWriteRefused(
        `provenance.tenantId "${claimedTenantId}" belongs to a different partition than "${ctx.tenantSlug}"`,
      );
    }

    // THE SIGNATURE IS VALIDATED AT THE WRITE, NOT DISCOVERED AT THE READ.
    //
    // Retrieval serves an ENVELOPE and must render the signature structurally; a signature that is
    // not parseable would therefore make `get` refuse — SILENTLY, into the single expression, for a
    // stored and otherwise valid package. That is a write defect surfacing as a read refusal, and
    // this store's stated posture is the opposite: **a write refusal is loud; a read refusal never
    // is.** So the shape is enforced here, where the caller can be told.
    //
    // The store does not interpret the signature beyond this — it is not this module's business
    // what algorithm or key the artefact names (ADR-0007 owns that). It requires only that the
    // thing it is asked to hold can be served back in the shape retrieval must serve it in.
    if (typeof signature !== 'string' || signature.length === 0) {
      // R-20.29 obliges the Execution Plane to verify a detached signature before executing. A
      // package stored without one can be retrieved, hash-matched, and then MUST be refused —
      // so storing it would manufacture an artefact whose only possible outcome is refusal.
      throw new SealedPackageWriteRefused('a sealed package SHALL NOT be stored without its detached signature');
    }
    try {
      JSON.parse(signature);
    } catch {
      throw new SealedPackageWriteRefused('the detached signature is not parseable JSON');
    }

    // SIGNATURE FIRST. See the ordering note above; this is the load-bearing line pair.
    await this.storage.put(ctx, this.keyFor(hash, SEALED_PACKAGE_SIGNATURE_RUN), signature);
    await this.storage.put(ctx, this.keyFor(hash), sealedBody);
    return hash;
  }

  /**
   * Retrieve a sealed package from the caller's own partition, or refuse indistinguishably.
   *
   * EVERY failure path collapses into `sealedPackageRefusal(hash)` — absent, malformed hash,
   * unparseable body, expired, or owner-offboarded. There is no branch a caller can observe.
   *
   * THE TIMING RESIDUAL, STATED AND SCOPED (P-79.6). An expired package in the caller's own
   * partition may take a filesystem read to refuse where an absent one may not. That is scoped
   * to INTRA-TENANT only: it can distinguish "my expired package" from "my absent package", and
   * the caller is entitled to know both. It cannot distinguish anything about another tenant,
   * because another tenant's partition is not addressed. That is the whole claim. This is NOT
   * asserted to be constant-time.
   *
   * NOTHING IS RECORDED BY THIS READ (P-79.7). No fetch count, no last-accessed timestamp, no
   * acknowledgement (R-20.31), no state transition. Retrieval is idempotent and leaves the store
   * byte-identical (R-05.21). R-12.5 is the binding constraint: a fetch record would be an
   * Execution-Plane execution signal crossing back into the Intelligence Plane — exactly the
   * delivery state P-70.3 removed, re-entered through the audit trail.
   */
  async get(ctx: TenantContext, hash: string): Promise<SealedPackageRetrieval> {
    const refused = { outcome: 'refused', refusal: sealedPackageRefusal(hash) } as const;

    if (!HASH_RE.test(hash)) return refused;

    let stored: string | undefined;
    try {
      stored = await this.storage.getText(ctx, this.keyFor(hash));
    } catch {
      return refused;
    }
    if (stored === undefined) return refused;

    let body: SealedBodyView;
    try {
      body = JSON.parse(stored) as SealedBodyView;
    } catch {
      return refused;
    }

    // THE OFFBOARDING CASE (§5.2). The owner is re-resolved at READ time, not trusted from
    // write time, because `repo.delete(slug)` can have removed the tenant since. An
    // unresolvable owner collapses into the same refusal as a never-existing hash.
    const ownerSlug = this.owners.resolveSlugByTenantId(body?.provenance?.tenantId ?? '');
    if (ownerSlug === undefined || ownerSlug !== ctx.tenantSlug) return refused;

    const notAfter = Date.parse(body?.validity?.notAfter ?? '');
    if (!Number.isFinite(notAfter) || notAfter <= this.now()) return refused;

    // ── THE SIGNATURE, AND ITS ABSENCE IS A REFUSAL RATHER THAN AN UNSIGNED SERVE (P-81.2) ─────
    //
    // Under the write ordering this state is unreachable by a partial write — the body is the
    // commit point — so reaching it means the signature was removed after the fact, which is
    // exactly the case that must not be served.
    //
    // IT COLLAPSES INTO THE SINGLE REFUSAL EXPRESSION (P-79.6, ADR-0078 P-78.2). NO FIFTH RESULT
    // CLASS AND NO ORACLE: a caller cannot distinguish "signature missing" from "no such hash",
    // "not yours", "expired" or "owner offboarded", so nothing here can be differenced against
    // anything. Adding a distinct refusal would tell a caller that a package EXISTS at this hash,
    // which is the one fact the single expression exists to withhold.
    let signature: string | undefined;
    try {
      signature = await this.storage.getText(ctx, this.keyFor(hash, SEALED_PACKAGE_SIGNATURE_RUN));
    } catch {
      return refused;
    }
    if (signature === undefined || signature.length === 0) return refused;

    return { outcome: 'found', body: stored, signature };
  }

  /**
   * Scheduled purge (R-06.13, C-06.8). ENFORCED BY CODE ON A SCHEDULE, never operator-initiated.
   *
   * Returns the hashes purged so a caller can alert on the outcome. PURGE FAILURE IS A LOUD,
   * ALERTING CONDITION (R-06.15) — this method throws rather than swallowing, and the scheduler
   * that drives it is responsible for raising. A silent skip is the failure R-06.15 names.
   *
   * The unreadability test R-06.14 demands lives beside this in the store's own suite: after
   * `purgeExpired`, `get` returns the single refusal and the bytes are gone from the provider.
   */
  async purgeExpired(ctx: TenantContext, storedAtMs: number): Promise<readonly string[]> {
    const names = await this.storage.list(ctx, {
      capability: SEALED_PACKAGE_CAPABILITY,
      run: SEALED_PACKAGE_RUN,
    });
    const purged: string[] = [];
    for (const name of names) {
      if (!HASH_RE.test(name)) continue;
      const key: ArtefactKey = {
        capability: SEALED_PACKAGE_CAPABILITY,
        run: SEALED_PACKAGE_RUN,
        artefact: name,
      };
      const text = await this.storage.getText(ctx, key);
      if (text === undefined) continue;
      let body: SealedBodyView | undefined;
      try {
        body = JSON.parse(text) as SealedBodyView;
      } catch {
        body = undefined;
      }
      // An unparseable body has no declarable retention, so it cannot be retained (R-06.9).
      const expiry = body ? this.retentionExpiryFor(body, storedAtMs) : -Infinity;
      if (expiry <= this.now()) {
        await this.storage.delete(ctx, key);
        // THE PAIR IS PURGED TOGETHER. A signature has no `validity.notAfter` of its own and
        // therefore NO DECLARABLE RETENTION — R-06.9 would forbid holding it independently — so it
        // is retained exactly as long as the package it signs and deleted in the same sweep.
        await this.storage.delete(ctx, { ...key, run: SEALED_PACKAGE_SIGNATURE_RUN });
        purged.push(name);
      }
    }

    // ── ORPHANED SIGNATURES (P-81.3) ────────────────────────────────────────────────────────
    //
    // THE HOLE THE SIBLING SCHEME WOULD OTHERWISE CREATE, CLOSED IN THE SCHEME RATHER THAN AFTER
    // IT. The signature segment is enumerated EXPLICITLY — not by relaxing `HASH_RE`, which guards
    // `keyFor` and which P-79.2's addressing rests on.
    //
    // A signature whose package is absent is purged UNCONDITIONALLY and needs no retention
    // calculation: it can never be served (a `get` that finds no body refuses before reaching it),
    // and under the write ordering it is precisely the residue of a crash between the two writes.
    const signatureNames = await this.storage.list(ctx, {
      capability: SEALED_PACKAGE_CAPABILITY,
      run: SEALED_PACKAGE_SIGNATURE_RUN,
    });
    for (const name of signatureNames) {
      if (!HASH_RE.test(name)) continue;
      const bodyKey: ArtefactKey = {
        capability: SEALED_PACKAGE_CAPABILITY,
        run: SEALED_PACKAGE_RUN,
        artefact: name,
      };
      if ((await this.storage.getText(ctx, bodyKey)) !== undefined) continue;
      await this.storage.delete(ctx, {
        capability: SEALED_PACKAGE_CAPABILITY,
        run: SEALED_PACKAGE_SIGNATURE_RUN,
        artefact: name,
      });
    }
    return purged;
  }
}
