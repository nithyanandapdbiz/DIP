/**
 * The evidence contract.
 *
 * TRACEABILITY
 *   Architecture : 10-evidence-flow-model.md · 20-cross-plane-contracts.md §3
 *   ADR          : ADR-0005 (integrity) · ADR-0006 (retention)
 *   Criteria     : C-20.10 / C-10.7 (every record carries its producing package hash)
 *                  C-10.10 (capture failure recorded as failure, distinguishable from empty)
 *                  C-10.12 (an expired reference reports as expired)
 *                  C-20.11 (no result constructible without an assurance state)
 *
 * Evidence PAYLOADS never cross the plane boundary. What crosses is a reference
 * plus a hash (INV-1). A decision cites the hash, so it stays auditable after the
 * payload it cites has been purged.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';
import { ALGORITHM_VERSIONS, HASH_DOMAINS } from './integrity.js';
import { ASSURANCE_STATES } from './assurance.js';

const Identifier = z.string().min(1).max(256);
const Instant = z.iso.datetime({ offset: true });

const DigestSchema = z.object({
  algorithm: z.enum(ALGORITHM_VERSIONS),
  domain: z.enum(HASH_DOMAINS),
  value: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Capture outcome. "Found nothing", "does not apply", and "we do not know" are
 * three different facts and are represented as three different states — they are
 * identical to a consumer unless the type makes them distinct (C-10.10).
 */
export const CaptureOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('captured') }),
  z.object({ outcome: z.literal('empty') }),
  z.object({ outcome: z.literal('not-applicable'), reason: z.string().min(1) }),
  z.object({ outcome: z.literal('failed'), reason: z.string().min(1) }),
]);

/** What crosses the boundary: a reference, never a payload. */
export const EvidenceReferenceSchema = z
  .object({
    contractVersion: z.string().min(1),
    evidenceId: Identifier,
    /** Binds evidence to the package that produced it (R-10.4). */
    packageHash: DigestSchema,
    contentHash: DigestSchema,
    classification: z.enum(['C1', 'C2', 'C3', 'C4', 'C5']),
    capturedAt: Instant,
    /** Retention is declared per record so expiry is a fact, not an inference. */
    expiresAt: Instant,
    assuranceState: z.enum(ASSURANCE_STATES),
  })
  .and(CaptureOutcomeSchema)
  .and(z.object({}).passthrough());

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export function parseEvidenceReference(input: unknown): EvidenceReference {
  return EvidenceReferenceSchema.parse(input);
}

/**
 * The field names that would carry an evidence PAYLOAD across the boundary (INV-1, R-20.14).
 *
 * ── WHY THIS LIVES IN THE CONTRACT AND NOT IN A CONSUMER ────────────────────────────────────
 *
 * "A reference carries no payload" is a rule about the WIRE ARTEFACT, so its one canonical home
 * is beside the schema that defines the artefact (CHARTER §4). It was implemented THREE times
 * before it was implemented here: `evidence-return-channel.ts` in the functional-testing engine,
 * an inline check in `ip-execute-gateway.mjs`, and nowhere on the authenticated tier at all — so
 * the rule's coverage depended on which door evidence arrived through.
 *
 * THE SCHEMA CANNOT ENFORCE IT, WHICH IS WHY A FUNCTION IS NEEDED. `EvidenceReferenceSchema` is
 * `.passthrough()` by design (R-20.4, C-20.7: unknown fields survive so a newer producer does not
 * break an older consumer). Passthrough is correct AND it is exactly what lets a `content` field
 * ride through a successful parse. **A parse that succeeds is not evidence that no payload
 * crossed**, and this function is the difference.
 *
 * THE LIST IS DENY-SHAPED, DELIBERATELY, AND THAT IS A BOUNDED EXCEPTION TO THE ALLOW-LIST RULE.
 * An allow-list is impossible here precisely BECAUSE of passthrough: the contract's whole purpose
 * is to admit fields it has not seen. So this names the shapes a payload is known to arrive in,
 * and it is a floor rather than a proof. A store that must not accrete payloads uses an
 * ALLOW-list on its own write path (ADR-0082 P-82.4, P-82.6); this guards the boundary, which is
 * a different obligation with a different mechanism.
 */
export const EVIDENCE_PAYLOAD_FIELDS = Object.freeze(['payload', 'content', 'buffer', 'data', 'body', 'bytes'] as const);

/** True if this reference declares an embedded payload, at the top level or in a nested artefact. */
export function carriesEvidencePayload(reference: unknown): boolean {
  const named = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (EVIDENCE_PAYLOAD_FIELDS.some((field) => field in record)) return true;
    // Nested artefacts are checked one level down: the gateway's own guard found payloads there,
    // and a reference that hides a payload inside `artefacts[]` has crossed the boundary just as
    // surely as one that declares it at the top.
    const artefacts = record['artefacts'];
    return Array.isArray(artefacts) && artefacts.some((entry) => named(entry));
  };
  return named(reference);
}

/**
 * Reference status at read time.
 *
 * "Purged on schedule" and "cannot be found" mean very different things, and only
 * one is a problem (C-10.12).
 */
export type ReferenceStatus = 'available' | 'expired';

export function statusAt(ref: EvidenceReference, now: Date): ReferenceStatus {
  return now.getTime() > Date.parse(ref.expiresAt) ? 'expired' : 'available';
}
