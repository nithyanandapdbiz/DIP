/**
 * The Run Record Store (ADR-0082) — what the Intelligence Plane keeps about its OWN act, so that
 * stages 10–12 have an input.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md (R-06.4 four conditions, R-06.5, R-06.9, R-06.12,
 *                  R-06.13, R-06.14, R-06.15) · 07-tenant-isolation.md (R-07.1-3) ·
 *                  05-cross-plane-communication.md (R-05.26-28) · 12-capability-orchestration.md
 *   ADR          : ADR-0082 (this store: P-82.1, P-82.4, P-82.6, P-82.7, P-82.9) ·
 *                  ADR-0079 (the store shape this reuses deliberately rather than re-derives) ·
 *                  ADR-0070 (P-70.3 NO DELIVERY STATE) · ADR-0060 (the provider it is built on) ·
 *                  ADR-0080 (the `/work` route this exists to give an input)
 *   Criteria     : C-06.3 (authorising ADR in the storing module's source) · C-06.6 (retention
 *                  declared) · C-06.7 (retention read by code) · C-06.8 (purge test) ·
 *                  C-06.11 (no C1 persists) · C-07.11 (cross-tenant refusal)
 *   Debt         : D-115 (ruled by this ADR) · D-128 (the evidence route's resolution gap)
 *
 * THE AUTHORISING ADR IS RECORDED HERE, IN SOURCE (R-06.5, C-06.3). `AUTHORISING_ADR` below is
 * read by the document-06 gate, not merely written for a human.
 *
 * ══ WHY THIS STORE EXISTS, AND WHY IT COULD NOT BE INFERRED ════════════════════════════════════
 *
 * P-82.1: **a run is recorded at AUTHORING TIME, by this plane, about its OWN act**, from the
 * package stage 7 just sealed. Inferring it from the package store is **not available** — that store
 * holds no run and, deliberately, no delivery state (P-70.3). Inference would mean either *every
 * package ever authored is outstanding forever*, or **adding delivery state, which is the P-70.3
 * violation directly.**
 *
 * ══ THE DISCRIMINATOR, CARRIED AS THE RULE RATHER THAN THE ARGUMENT (P-82.3) ═══════════════════
 *
 *   **Ask what changes when an Execution Plane RE-FETCHES a package it already holds.**
 *   Under a DELIVERY record something changes — and that is the defect.
 *   Under an EVIDENCE record NOTHING changes, because pending-ness never depended on fetching.
 *
 * **R-05.28 forbids the collection record in the SAME SENTENCE that requires the evidence record**,
 * so the evidence record is presupposed rather than tolerated, and P-70.3 and R-05.28 are one rule
 * seen from two sides.
 *
 * > **THE RISK IS ONE RISK, AND IT IS NOT HYPOTHETICAL.** A field added *"for diagnostics"* that
 * > records when a package was FETCHED converts this into the store P-70.3 removed — **without
 * > failing any test**, because the two have the same shape and differ only in WHAT CAUSES A WRITE.
 * > That is why the write surface below enumerates its EVENTS and has no general `record()`.
 *
 * ══ REFERENCES AND HASHES, NEVER PAYLOADS — A CONSTRAINT, NOT A NOTE (P-82.4) ══════════════════
 *
 * A record that accreted payloads would be an **unauthorised C1 store**, converting a required
 * signal into a **sovereignty breach**. C1 in this plane is *"ephemeral, never persisted"*, so this
 * is a **condition on the store's existence** rather than a style preference. The allow-list below
 * is applied **on the write path**: scrubbing on egress protects the API; scrubbing on write
 * protects the disk.
 *
 * ══ THE PARTITION IS THE AUTHORISATION (ADR-0079 P-79.2, reused not re-derived) ════════════════
 *
 * The caller supplies a run id. The caller never supplies, and cannot influence, the partition
 * segment: it comes from the authenticated principal in `ctx`. Enforcement is by ADDRESSING, not by
 * a predicate — another tenant's run is not refused after being found, it is NEVER FOUND.
 * **Do not "improve" this into a check over a flat store:** addressing and a predicate agree on
 * every well-formed input and differ only on the attack, so every test would still pass.
 */
import type { TenantContext } from '../tenant/tenant-context.js';
import type { ArtefactKey, StorageProvider } from './storage-provider.js';

export const AUTHORISING_ADR = 'ADR-0082';

export const RUN_RECORD_CAPABILITY = 'runs';
export const RUN_RECORD_RUN = 'authored';

/**
 * THE EVIDENCE SEGMENT (ADR-0082 §6 step 3, P-82.2). **A SECOND SEGMENT, NOT A SECOND STORE.**
 *
 * P-82.9 rules ONE store with two event-named write methods, so evidence lives beside runs under the
 * same capability and the same partition — a sibling `run` segment, addressed by the SAME `runId`.
 *
 * **THE ADDRESSING IS THE JOIN.** Because the evidence artefact's name IS the run id, asking *"does
 * this run have evidence?"* is an `exists` on a key this store can construct, not a scan or a
 * foreign key someone must maintain. **The subtraction R-05.28 derives on is therefore a property of
 * the layout rather than of a query**, and a run cannot acquire evidence belonging to another run
 * without acquiring its id.
 *
 * WHY NOT A FIELD ON THE RUN RECORD. `onPackageAuthored` refuses a second write to a run id — the
 * record is write-once, and that is what makes a duplicate authoring a loud caller defect rather
 * than a silent overwrite. Adding evidence by REWRITING that artefact would require relaxing exactly
 * that refusal, and a store whose run record can be rewritten cannot tell a corrected record from a
 * replaced one.
 */
export const RUN_RECORD_EVIDENCE_RUN = 'evidence';

/** A run id is opaque to this store but must be a safe, bounded artefact segment. */
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * THE DECLARED RETENTION (R-06.9, C-06.6). A store without one SHALL NOT be registered.
 *
 * READ BY `retentionExpiryFor` BELOW, not merely declared (R-06.12, C-06.7). A retention field with
 * no reader is what document 06 calls CONFIGURATION THEATRE, and R-06.12 exists because the
 * predecessor shipped exactly that.
 */
export const RUN_RECORD_RETENTION = Object.freeze({
  /** The store's highest classification. C1 is absent BY CONSTRUCTION (P-82.4), never stored. */
  classification: 'C3' as const,
  /** The tenant C3 ceiling in the Intelligence Plane (06:62). Not tenant-configurable upward. */
  maxRetentionDays: 90,
  authorisingAdr: AUTHORISING_ADR,
});

const DAY_MS = 86_400_000;

export type Clock = () => number;

/** Raised when a write is refused. A write refusal is LOUD; a read refusal never is (P-79.6). */
export class RunRecordWriteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunRecordWriteRefused';
  }
}

/**
 * WHAT THE AUTHORING EVENT CARRIES. Deliberately NOT the package.
 *
 * The caller passes identity and hashes. There is no `package` field and there will not be one:
 * the package is already in the sealed package store, addressed by this same hash, and a second
 * copy here would be a second source of truth AND a payload (P-82.4).
 */
export interface PackageAuthoredEvent {
  readonly runId: string;
  /** The content hash of the package stage 7 sealed. The join to the sealed package store. */
  readonly packageHash: string;
  /** The contract version the package was authored against. */
  readonly contractVersion: string;
  /** ISO-8601. Supplied by the caller because the authoring moment is the caller's, not the store's. */
  readonly authoredAt: string;
}

/**
 * THE RECORD AS STORED — and this shape IS the allow-list (P-82.6).
 *
 * An **ALLOW**-list, never a deny-list. A deny-list admits every field nobody thought to forbid,
 * which is the wrong default for a store whose failure mode is holding customer content.
 *
 * `evidence` IS DELIBERATELY ABSENT AT THIS STEP. The evidence record is ADR-0082 §6 step 3 and
 * arrives through its own event-named method. It is named here so that its absence reads as
 * SEQUENCED rather than as forgotten.
 */
export interface RunRecord {
  readonly runId: string;
  readonly packageHash: string;
  readonly contractVersion: string;
  readonly authoredAt: string;
  /** Milliseconds, for retention. The store's own clock — never the caller's. */
  readonly recordedAtMs: number;
}

/**
 * THE EVIDENCE REFERENCE, AS RECORDED — references and hashes, never payloads (P-82.4).
 *
 * These five fields are the whole of `EvidenceReferenceHandle`, and every one of them is an
 * identifier, a locator or a hash. **There is no `content`, no `artefact`, and no `body`, and the
 * projection below cannot grow one**: a producer that adds a payload field to the handle upstream
 * finds it dropped here, because the record is CONSTRUCTED from named fields rather than spread.
 *
 * ══ SHAPED TO WHAT ARRIVES ON THE WIRE, NOT TO THE ENGINE'S INTERNAL HANDLE ═══════════════════
 *
 * ADR-0082 P-82.6 says *"the evidence reference handle"*, and when this store was written TWO
 * types could answer to that name: `EvidenceReferenceHandle` in the Functional Testing Engine (an
 * internal outcome type with `kind`, `locatorRef` and `custody`) and `EvidenceReferenceSchema` in
 * `@dbiz/contracts` (the published wire artefact). **The wire artefact is what this store actually
 * receives** — its one caller is `POST /v1/evidence` — so these fields are the wire's, and a record
 * shaped to the internal handle would have had three fields nothing could ever populate.
 *
 * THE AMBIGUITY IS GONE, THE CHOICE IS NOT. The Functional Testing Engine was removed (ADR-0087),
 * so only the wire artefact now answers to the name. This paragraph is kept in the PAST TENSE
 * rather than deleted because it records WHY these five fields are the wire's — a reason that
 * still governs the next producer to arrive, and that a reader would otherwise have to re-derive.
 * Read as a live claim it would now be false: there is no second type to choose against.
 */
export interface EvidenceReferenceRecord {
  readonly evidenceId: string;
  /** `contentHash.value` — the HASH of the evidence, never the evidence. */
  readonly contentHashRef: string;
  /** The referenced artefact's sovereignty class, so a reader need not re-derive it. */
  readonly classification: string;
  /** When the Execution Plane captured it. The reference's own field, not a timing added here. */
  readonly capturedAt: string;
  readonly assuranceState: string;
  readonly outcome: string;
}

/** WHAT THE ARRIVAL EVENT CARRIES. The tenant slug is NOT here — it comes from `ctx`. */
export interface EvidenceArrivedEvent {
  readonly runId: string;
  /** Must equal the run's own `packageHash`. Checked, not trusted — see `onEvidenceArrived`. */
  readonly packageHash: string;
  readonly contractVersion: string;
  readonly reference: EvidenceReferenceRecord;
}

/**
 * THE EVIDENCE RECORD AS STORED — P-82.6's allow-list, verbatim.
 *
 * The ADR enumerates it and the enumeration IS the ruling: **tenant slug · run id · `packageHash` ·
 * contract version · arrival timestamp · the evidence reference handle.** Nothing else is here and
 * nothing else may be added without amending P-82.6.
 *
 * NO COUNTS AND NO TIMINGS. P-82.6 permits them *"only where a stage-10 input genuinely requires
 * them, each named"* — **no stage-10 input requires one today**, so none is recorded. Adding one
 * later means naming it and saying which input needs it, which is a visible change.
 */
export interface EvidenceRecord {
  /** From `ctx`, never from the caller. The partition that owns this evidence. */
  readonly tenantSlug: string;
  readonly runId: string;
  readonly packageHash: string;
  readonly contractVersion: string;
  /**
   * THE ARRIVAL TIMESTAMP, AND IT IS THE STORE'S CLOCK (P-82.6). Milliseconds, and the same field
   * retention reads — arrival and recording are one instant here, so there is one field for it. A
   * caller-supplied arrival time is not accepted at all: it would let a caller set its own retention.
   */
  readonly recordedAtMs: number;
  readonly reference: EvidenceReferenceRecord;
}

/** The outcome of an arrival. `alreadyRecorded` distinguishes a retry from a first write. */
export interface EvidenceArrivalOutcome {
  readonly record: EvidenceRecord;
  readonly alreadyRecorded: boolean;
}

/**
 * THE ALLOW-LIST, APPLIED ON THE WRITE PATH (P-82.6).
 *
 * It is a CONSTRUCTION, not a filter: the record is built field by field from named inputs, so a
 * field the caller invents cannot survive by being un-forbidden. A `{...event}` spread here would
 * turn this allow-list into a deny-list without changing a single test.
 */
function project(event: PackageAuthoredEvent, recordedAtMs: number): RunRecord {
  return {
    runId: event.runId,
    packageHash: event.packageHash,
    contractVersion: event.contractVersion,
    authoredAt: event.authoredAt,
    recordedAtMs,
  };
}

/**
 * THE EVIDENCE ALLOW-LIST, ALSO BY CONSTRUCTION (P-82.6, R-06.4 condition 3).
 *
 * Two levels, and the inner one matters more: the reference handle is rebuilt field by field too, so
 * a payload attached to the handle by an upstream producer **never reaches the disk**. A
 * `reference: event.reference` assignment here would carry whatever the caller sent — which is the
 * unauthorised C1 store P-82.4 makes a condition on this store's existence.
 */
function projectEvidence(
  ctx: TenantContext,
  event: EvidenceArrivedEvent,
  recordedAtMs: number,
): EvidenceRecord {
  return {
    tenantSlug: ctx.tenantSlug,
    runId: event.runId,
    packageHash: event.packageHash,
    contractVersion: event.contractVersion,
    recordedAtMs,
    reference: {
      evidenceId: event.reference.evidenceId,
      contentHashRef: event.reference.contentHashRef,
      classification: event.reference.classification,
      capturedAt: event.reference.capturedAt,
      assuranceState: event.reference.assuranceState,
      outcome: event.reference.outcome,
    },
  };
}

export class RunRecordStore {
  constructor(
    private readonly storage: StorageProvider,
    private readonly now: Clock = () => Date.now(),
  ) {}

  /** The partition comes from `ctx`; the caller contributes the run id and nothing else. */
  private keyFor(runId: string): ArtefactKey {
    if (!RUN_ID_RE.test(runId)) {
      throw new RunRecordWriteRefused(`"${runId}" is not a usable run id`);
    }
    return { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: runId };
  }

  /**
   * The retention expiry for a run record (R-06.12, C-06.7). `RUN_RECORD_RETENTION` is CONSUMED
   * here and drives the purge — it is not a comment.
   *
   * A run record has no contractual `notAfter` of its own — unlike a sealed package, which carries
   * `validity.notAfter` — so the sovereign ceiling is the ONLY bound, and it is applied from the
   * moment the store recorded it rather than from the authoring timestamp the caller supplied.
   * **A caller-supplied time must never be able to extend retention.**
   */
  retentionExpiryFor(record: RunRecord): number {
    return record.recordedAtMs + RUN_RECORD_RETENTION.maxRetentionDays * DAY_MS;
  }

  /**
   * ── EVENT ONE: A PACKAGE WAS AUTHORED (P-82.1, P-82.9) ────────────────────────────────────────
   *
   * NAMED FOR ITS CAUSE, NOT FOR ITS MECHANISM. There is deliberately **no `record()`, no `save()`,
   * and no options bag carrying an event discriminator** — `kind: 'fetch'` is a third event wearing
   * a field's clothes, and it is exactly how a delivery record (P-70.3, forbidden) would enter a
   * store that looks like it only holds runs. **A third cause needs a third method**, which is
   * visible in a diff and is an ADR amendment.
   *
   * IDEMPOTENT BY RUN ID. Authoring the same run twice records it once; the second write is refused
   * rather than silently overwriting, because two authorings of one run id are a caller defect and
   * an overwrite would hide it.
   */
  async onPackageAuthored(ctx: TenantContext, event: PackageAuthoredEvent): Promise<RunRecord> {
    if (typeof event?.runId !== 'string' || !RUN_ID_RE.test(event.runId)) {
      throw new RunRecordWriteRefused('the authoring event carries no usable runId');
    }
    if (typeof event?.packageHash !== 'string' || !HASH_RE.test(event.packageHash)) {
      // Unbound records are unattributable, and an unattributable run can never leave the
      // collection — `/work` would return the same work forever (P-82.5's shape, one layer up).
      throw new RunRecordWriteRefused(`run "${event.runId}" carries no usable packageHash`);
    }
    if (typeof event?.contractVersion !== 'string' || event.contractVersion.length === 0) {
      throw new RunRecordWriteRefused(`run "${event.runId}" carries no contractVersion`);
    }
    if (typeof event?.authoredAt !== 'string' || !Number.isFinite(Date.parse(event.authoredAt))) {
      throw new RunRecordWriteRefused(`run "${event.runId}" carries no parseable authoredAt`);
    }

    const key = this.keyFor(event.runId);
    if (await this.storage.exists(ctx, key)) {
      throw new RunRecordWriteRefused(`run "${event.runId}" is already recorded`);
    }

    const record = project(event, this.now());
    await this.storage.put(ctx, key, JSON.stringify(record));
    return record;
  }

  /**
   * ── EVENT TWO: EVIDENCE ARRIVED (P-82.2, P-82.9) — AND THIS IS THE SUBTRACTION ────────────────
   *
   * **THE SECOND AND LAST WRITE METHOD.** P-82.9 rules the surface at exactly two, each named for its
   * cause. A third cause has no method to call, and adding one is an API change visible in a diff and
   * an amendment to ADR-0082.
   *
   * ══ THIS IS WHAT REMOVES A RUN FROM THE OUTSTANDING SET, AND THE ONLY THING THAT DOES ══════════
   *
   * `/work` answers *"runs without evidence"* (R-05.28). Before this method existed the collection
   * could only grow, and mounting the route would have told every Execution Plane it had **everything
   * to do, forever** — a Success under R-05.5 that reddens no gate. **Nothing else subtracts, and in
   * particular a FETCH does not:** P-82.3's discriminator is that re-fetching a package changes
   * nothing, and it still changes nothing, because there is no method here that a fetch could call.
   *
   * ══ TWO CHECKS BEFORE THE WRITE, AND NEITHER IS OPTIONAL ═══════════════════════════════════════
   *
   * **(1) THE RUN MUST EXIST IN THIS PARTITION.** Evidence for a run this tenant does not have is
   * unattributable, and an unattributable evidence record subtracts nothing while occupying the
   * store — the same permanent non-emptiness one layer down from the ingress route's refusal.
   *
   * **(2) THE HASH MUST AGREE WITH THE RUN'S OWN.** The caller supplies both `runId` and
   * `packageHash`; without this check they are independent, and evidence for run A could be recorded
   * citing run B's package. **The run record is the authority and the event is checked against it**,
   * never the reverse. This is cheap here and impossible later: once written, the disagreement is
   * indistinguishable from a correct record.
   *
   * ══ IDEMPOTENT ON `runId`, AND FIRST WRITE WINS ════════════════════════════════════════════════
   *
   * A repeated arrival is **not** an error: an Execution Plane whose `202` was lost to a dropped
   * connection will retry, and refusing that would make a successful submission look like a failure
   * and invite the EP to treat its own evidence as unsent. **So the second arrival returns the stored
   * record UNCHANGED** — the arrival timestamp does not move, which is what keeps retention keyed to
   * when evidence actually arrived rather than to how many times it was announced.
   *
   * > **ONE EVIDENCE RECORD PER RUN — A REAL LIMITATION, RECORDED AS [`D-142`], NOT A CHOICE MADE HERE.**
   * > P-82.6 enumerates *"the evidence reference handle"* — **singular** — and the subtraction needs
   * > only *has any evidence*. **A run producing SEVERAL DISTINCT references has all but the first
   * > DROPPED BY THIS METHOD, SILENTLY:** the caller is told `202 accepted` either way, and nothing
   * > downstream can tell a one-reference run from a truncated one.
   * >
   * > **THIS IS THE NORMAL SHAPE OF A REAL RUN, NOT AN EDGE CASE.** A functional-testing run produces
   * > a screenshot AND a trace AND a video — which is what the Execution Plane already emits. **And
   * > it reddens nothing**, because the property the platform measures is *has any evidence*, which
   * > the first reference satisfies. Stages 10-12 are the consumer that will find it, holding one
   * > artefact where three were captured.
   * >
   * > **NOT SETTLED HERE, DELIBERATELY.** Whether a second distinct reference REFUSES (a caller
   * > defect) or ACCUMULATES (a normal run) are opposite answers, and an accreting record is P-82.4's
   * > unauthorised C1 store one shape along. It is an ADR-0082 amendment; deciding it inside an
   * > implementation step would settle an open question in a diff reviewed as plumbing.
   */
  async onEvidenceArrived(
    ctx: TenantContext,
    event: EvidenceArrivedEvent,
  ): Promise<EvidenceArrivalOutcome> {
    if (typeof event?.runId !== 'string' || !RUN_ID_RE.test(event.runId)) {
      throw new RunRecordWriteRefused('the evidence event carries no usable runId');
    }
    if (typeof event?.packageHash !== 'string' || !HASH_RE.test(event.packageHash)) {
      throw new RunRecordWriteRefused(`evidence for run "${event.runId}" carries no usable packageHash`);
    }
    if (typeof event?.contractVersion !== 'string' || event.contractVersion.length === 0) {
      throw new RunRecordWriteRefused(`evidence for run "${event.runId}" carries no contractVersion`);
    }
    const ref = event?.reference;
    if (!ref || typeof ref !== 'object'
      || typeof ref.evidenceId !== 'string' || ref.evidenceId.length === 0
      || typeof ref.contentHashRef !== 'string' || ref.contentHashRef.length === 0) {
      throw new RunRecordWriteRefused(`evidence for run "${event.runId}" carries no usable reference`);
    }

    // (1) THE RUN, FROM THIS CALLER'S PARTITION. Another tenant's run is not found, so evidence
    // cannot be attached across a partition boundary — by addressing, not by a predicate.
    const run = await this.read(ctx, event.runId);
    if (!run) {
      throw new RunRecordWriteRefused(`no run "${event.runId}" to attach evidence to`);
    }
    // (2) AND THE HASH MUST BE THAT RUN'S.
    if (run.packageHash !== event.packageHash) {
      throw new RunRecordWriteRefused(
        `evidence for run "${event.runId}" cites a packageHash that is not that run's`,
      );
    }

    const key: ArtefactKey = {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: event.runId,
    };
    const existing = await this.evidenceFor(ctx, event.runId);
    if (existing) return { record: existing, alreadyRecorded: true };

    const record = projectEvidence(ctx, event, this.now());
    await this.storage.put(ctx, key, JSON.stringify(record));
    return { record, alreadyRecorded: false };
  }

  /** The evidence recorded for one run in the caller's own partition, or `undefined`. */
  async evidenceFor(ctx: TenantContext, runId: string): Promise<EvidenceRecord | undefined> {
    if (!RUN_ID_RE.test(runId)) return undefined;
    const text = await this.storage.getText(ctx, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: runId,
    });
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as EvidenceRecord;
    } catch {
      return undefined;
    }
  }

  /**
   * ── THE DERIVATION `/work` ANSWERS FROM (R-05.28, ADR-0080) ───────────────────────────────────
   *
   * Runs this plane authored for the caller's tenant that have **no evidence record** — *"runs
   * without evidence"*, stated once, here, so the route cannot state it differently.
   *
   * **AN EMPTY RESULT IS A POSITIVE ASSERTION THAT NOTHING IS PENDING**, and it is reachable: every
   * run leaves this collection when its evidence arrives. That reachability is the whole difference
   * between this and the collection that existed before `onEvidenceArrived` — which was also a
   * derivation, and could only ever grow.
   *
   * **NOT FILTERED BY DELIVERY, BECAUSE THERE IS NO DELIVERY STATE** (P-70.3). Fetching a package
   * does not remove its run from this list, and there is nothing in the store that could make it.
   */
  async outstandingRuns(ctx: TenantContext): Promise<readonly RunRecord[]> {
    const outstanding: RunRecord[] = [];
    for (const run of await this.list(ctx)) {
      if (!(await this.evidenceFor(ctx, run.runId))) outstanding.push(run);
    }
    return outstanding;
  }

  /** Read one run record from the caller's own partition. `undefined` when absent. */
  async read(ctx: TenantContext, runId: string): Promise<RunRecord | undefined> {
    if (!RUN_ID_RE.test(runId)) return undefined;
    const text = await this.storage.getText(ctx, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: runId });
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as RunRecord;
    } catch {
      return undefined;
    }
  }

  /**
   * ── THE JOIN R-05.28's DERIVATION IS BUILT ON (ADR-0082 P-82.5) ───────────────────────────────
   *
   * The run this plane authored for a given package hash, **within the caller's OWN partition**, or
   * `undefined`. This is what makes an arriving evidence reference BINDABLE: P-82.5's derivation
   * *"runs without evidence"* is **a join on `packageHash`**, so this is the join's one implementation
   * and evidence ingress resolves through it rather than re-deriving the lookup.
   *
   * SCOPED BY ADDRESSING, NOT BY A PREDICATE, AND THE CONSEQUENCE IS P-70.4 AT THE INGRESS ROUTE.
   * `list` reads the caller's partition and nothing else, so a hash naming **another tenant's** run
   * is not rejected after being found — **it is NEVER FOUND**, and is therefore indistinguishable
   * from a hash naming nothing at all. **That indistinguishability is the property, not a
   * side-effect:** were this a scan over a flat store with an ownership check, the two cases would
   * become separable and the refusal would answer *"does this hash exist somewhere?"* — an oracle
   * over other tenants' package hashes, reachable by anything holding one valid EP credential.
   *
   * A SCAN, DELIBERATELY, AND NOT A SECOND INDEX. A `packageHash → runId` index would be a second
   * source of truth about which runs exist, maintained by a second write on the authoring path —
   * and a run whose index entry failed to write would be invisible to `/work` while present in the
   * store. **One source, read linearly**, bounded by the 90-day retention ceiling this store already
   * enforces. If the linear read ever becomes the constraint, that is a measured decision with its
   * own ADR, not a shape to adopt in advance.
   */
  async runForPackageHash(ctx: TenantContext, packageHash: string): Promise<RunRecord | undefined> {
    if (typeof packageHash !== 'string' || !HASH_RE.test(packageHash)) return undefined;
    for (const record of await this.list(ctx)) {
      if (record.packageHash === packageHash) return record;
    }
    return undefined;
  }

  /**
   * Every run this plane authored for the caller's tenant, ordered by authoring time.
   *
   * THIS IS WHAT `/work` WILL ANSWER FROM (ADR-0080). It is **not** filtered by delivery, because
   * there is no delivery state to filter by and there must not be (P-70.3). What removes a run from
   * the outstanding set is EVIDENCE ARRIVING — step 3's event — never a fetch.
   */
  async list(ctx: TenantContext): Promise<readonly RunRecord[]> {
    const names = await this.storage.list(ctx, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN });
    const records: RunRecord[] = [];
    for (const name of names) {
      const record = await this.read(ctx, name);
      if (record) records.push(record);
    }
    return records.sort((a, b) => (a.authoredAt < b.authoredAt ? -1 : a.authoredAt > b.authoredAt ? 1 : 0));
  }

  /**
   * Scheduled purge (R-06.13, C-06.8). ENFORCED BY CODE ON A SCHEDULE, never operator-initiated.
   *
   * PURGE FAILURE IS A LOUD, ALERTING CONDITION (R-06.15) — this throws rather than swallowing, and
   * the driver that calls it raises. A silent skip is the failure R-06.15 names.
   *
   * The unreadability test R-06.14 demands lives in this store's own suite: after `purgeExpired`,
   * `read` returns `undefined` and the bytes are gone from the provider.
   */
  async purgeExpired(ctx: TenantContext): Promise<readonly string[]> {
    const purged: string[] = [];

    // ── RUNS, AND THEIR EVIDENCE WITH THEM ──────────────────────────────────────────────────
    //
    // EVIDENCE IS DELETED WITH ITS RUN REGARDLESS OF ITS OWN EXPIRY, and that is not an optimisation.
    // An evidence record names the run it belongs to; once the run is gone the record is
    // **unattributable C3 data held past the retention of the thing that gave it meaning**, and it
    // would still be occupying a store whose authorisation is conditional on retention being
    // enforced. A record that cannot be joined to anything cannot be justified by anything either.
    const names = await this.storage.list(ctx, { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN });
    for (const name of names) {
      if (!RUN_ID_RE.test(name)) continue;
      const key: ArtefactKey = { capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_RUN, artefact: name };
      const record = await this.read(ctx, name);
      // An unparseable record has no declarable retention, so it cannot be retained (R-06.9).
      const expiry = record ? this.retentionExpiryFor(record) : -Infinity;
      if (expiry <= this.now()) {
        await this.storage.delete(ctx, key);
        await this.storage.delete(ctx, {
          capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: name,
        });
        purged.push(name);
      }
    }

    // ── THEN EVIDENCE ON ITS OWN TERMS, INCLUDING ORPHANS ───────────────────────────────────
    //
    // SWEPT SEPARATELY BECAUSE THE FIRST LOOP CANNOT SEE WHAT IT DOES NOT LIST. An evidence artefact
    // whose run record is already absent — purged by an earlier sweep, or lost — is never reached by
    // a loop that iterates over RUNS. **Retention that only visits records reachable from another
    // record is retention with a blind spot**, and the blind spot is exactly the orphaned data
    // nobody is looking for.
    const evidenceNames = await this.storage.list(ctx, {
      capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN,
    });
    for (const name of evidenceNames) {
      if (!RUN_ID_RE.test(name)) continue;
      const evidence = await this.evidenceFor(ctx, name);
      const expiry = evidence ? evidence.recordedAtMs + RUN_RECORD_RETENTION.maxRetentionDays * DAY_MS : -Infinity;
      const orphaned = (await this.read(ctx, name)) === undefined;
      if (orphaned || expiry <= this.now()) {
        await this.storage.delete(ctx, {
          capability: RUN_RECORD_CAPABILITY, run: RUN_RECORD_EVIDENCE_RUN, artefact: name,
        });
        if (!purged.includes(name)) purged.push(name);
      }
    }
    return purged;
  }
}
