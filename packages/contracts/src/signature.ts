/**
 * THE DETACHED SIGNATURE — one shape, and this is the only place it is declared.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §5 (R-20.22 detached over the canonical form,
 *                  R-20.29 verification on retrieval is two checks) · 08-security-model.md
 *                  (R-08.13-17) · 01-platform-constitution.md (Rule 6)
 *   ADR          : ADR-0007 (signing, and the key identifier implying the algorithm) ·
 *                  ADR-0081 (P-81.2 the signature travels beside the package, not inside it)
 *   Debt         : D-123 link 1
 *
 * ══ WHY THIS FILE EXISTS, AND IT IS URGENT RATHER THAN TIDY ════════════════════════════════════
 *
 * There were TWO types for this one concept, and they shared **no field name** on the two fields
 * that matter:
 *
 *     SignatureEnvelope { signature, signingKeyId, algorithm }   functional-testing-engine
 *     DetachedSignature { value,     keyId,        algorithm }   tenant-onboarding-engine
 *
 * Only `algorithm` agreed. **That is debt D-117's sentence at a different artefact** — *the shapes
 * share no required field name* — and it survived for D-117's reason: **nothing has ever carried a
 * signature across the plane boundary, so nothing could disagree.**
 *
 * **IT WAS LIVE RATHER THAN HISTORICAL.** The sealed-package writer takes its signature as an
 * opaque value and serialises whatever it is given, so **the first component to sign a real package
 * would have fixed the shape the Execution Plane must parse for as long as the contract lives** —
 * arriving in a diff reviewable as plumbing. That is exactly the decision D-122 refused to let a
 * plumbing change make about the package; this is the same refusal one artefact down.
 *
 * ══ WHY THESE FIELD NAMES AND NOT THE OTHERS ═══════════════════════════════════════════════════
 *
 * `{ algorithm, keyId, value }` wins because it is the shape that is actually PRODUCED — the wired
 * signer emits it — and convergence toward the artefact that exists costs nothing, while converging
 * toward the one that does not would rewrite a working signer to match an unwired port.
 *
 * **THE ONE ARGUMENT AGAINST IT IS WORTH ANSWERING RATHER THAN OMITTING.** `SignatureEnvelope`
 * called it `signingKeyId`, which matches `provenance.signingKeyId` on the package. That symmetry
 * is real and is preserved as an INVARIANT rather than as a shared spelling — see
 * `signatureMatchesProvenance` below. A field name is not the place to encode an agreement that can
 * be checked.
 */
import { z } from 'zod';

/**
 * The signature algorithms this platform produces.
 *
 * ADR-0007 §6: **the key identifier implies the algorithm**, so a new algorithm is a new key
 * identifier and needs no contract change. This enum exists to refuse an UNKNOWN algorithm at the
 * boundary, not to be the source of truth for which key uses which — that is custody's.
 */
export const SIGNATURE_ALGORITHMS = ['ed25519'] as const;
export type SignatureAlgorithm = (typeof SIGNATURE_ALGORITHMS)[number];

/**
 * A detached signature over a package's canonical content hash (R-20.22).
 *
 * PASSTHROUGH, for the reason every other contract shape here is: a newer producer must not break
 * an older consumer on additive change (R-20.4, C-20.7).
 */
export const DetachedSignatureSchema = z
  .object({
    algorithm: z.enum(SIGNATURE_ALGORITHMS),
    /** The key this signature was produced with. Matches the package's `provenance.signingKeyId`. */
    keyId: z.string().min(1).max(256),
    /** The signature itself, base64. Detached — it is never a field of the thing it signs. */
    value: z.string().min(1),
  })
  .passthrough();

export type DetachedSignature = z.infer<typeof DetachedSignatureSchema>;

/** Parse and validate. An unknown algorithm is REFUSED, never carried through as opaque. */
export function parseDetachedSignature(input: unknown): DetachedSignature {
  return DetachedSignatureSchema.parse(input);
}

/**
 * Does this signature name the key the package says it was signed under?
 *
 * ── WHY THIS IS A FUNCTION AND NOT A SHARED FIELD NAME ──────────────────────────────────────────
 *
 * The package carries `provenance.signingKeyId`; the signature carries `keyId`. They must agree,
 * and the previous design encoded that agreement by SPELLING THE FIELD THE SAME WAY in one of the
 * two types — which is not a check. Two fields with one name still hold two values, and nothing
 * compared them.
 *
 * **THIS IS THE AGREEMENT AS A PREDICATE.** It is not verification: it proves nothing about the
 * signature's validity, and a caller that treats a `true` here as having verified anything has made
 * the D-012 error. It answers one question — *is this signature even claiming to be about this
 * package's key?* — which is worth answering before spending a verification.
 */
export function signatureMatchesProvenance(
  signature: DetachedSignature,
  provenance: { readonly signingKeyId: string },
): boolean {
  return signature.keyId === provenance.signingKeyId;
}
