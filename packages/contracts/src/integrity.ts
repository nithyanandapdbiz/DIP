/**
 * The canonical integrity primitive — the platform's ONLY hashing implementation.
 *
 * TRACEABILITY
 *   Architecture : 10-evidence-flow-model.md §4 · 20-cross-plane-contracts.md §4
 *   ADR          : ADR-0005 (canonical integrity primitive)
 *   Criteria     : C-20.1 (exactly one implementation platform-wide)
 *                  C-20.2 (hashing cannot be invoked without a domain)
 *                  C-20.3 (every hashed record carries an algorithm version)
 *                  C-10.5 (verification selects algorithm by declared version)
 *                  C-10.6 (differing domain -> differing digest)
 *                  C-10.13 (altered payload fails verification)
 *                  C-10.14 (unaltered payload NEVER fails verification)
 *
 * A second implementation of this primitive is a Constitutional violation
 * (R-20.21), not a duplication smell. The predecessor permitted one governed term
 * two implementations; their canonical forms agreed and their digests did not,
 * so untampered evidence reported as tampered. A false tamper verdict is more
 * corrosive than a missed detection: it trains operators to discount the control.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalise } from './canonical.js';

/**
 * Governed hash domains. Domain separation makes *meaning* part of the digest,
 * so a digest over one kind of object is not a valid digest for another with the
 * same bytes (ADR-0005 §4).
 *
 * This is a closed union rather than `string`: an undeclared domain is a compile
 * error, which is structural impossibility rather than a runtime check (C-0.1).
 */
export const HASH_DOMAINS = [
  'dbiz.execution-package@1',
  'dbiz.evidence-record@1',
  'dbiz.evidence-payload@1',
  'dbiz.decision@1',
] as const;

export type HashDomain = (typeof HASH_DOMAINS)[number];

/**
 * Algorithm versions. Every hashed record carries one, so verification selects
 * the correct algorithm and multiple versions coexist during migration.
 *
 * Without this field an algorithm change would be a flag day across hundreds of
 * independently scheduled customer deployments — a migration that cannot in
 * practice be performed (ADR-0005 §4).
 */
export const ALGORITHM_VERSIONS = ['sha256-jcs-v1'] as const;
export type AlgorithmVersion = (typeof ALGORITHM_VERSIONS)[number];

/** The version applied to newly written records. */
export const CURRENT_ALGORITHM: AlgorithmVersion = 'sha256-jcs-v1';

/** A digest together with the algorithm that produced it. Never a bare string. */
export interface Digest {
  readonly algorithm: AlgorithmVersion;
  readonly domain: HashDomain;
  /** Lowercase hex. */
  readonly value: string;
}

/** The single byte separating domain from content; cannot occur in a domain. */
const SEPARATOR = new Uint8Array([0x00]);

function digestV1(domain: HashDomain, canonical: string): string {
  const hash = createHash('sha256');
  hash.update(new TextEncoder().encode(domain));
  hash.update(SEPARATOR);
  hash.update(new TextEncoder().encode(canonical));
  return hash.digest('hex');
}

/**
 * Compute a domain-separated digest over `content`.
 *
 * `domain` is the first parameter and is required — there is no overload that
 * omits it, and no default. The predecessor's tell was a one-argument hash
 * function; an unbound hash is a replayable one.
 */
export function hash(
  domain: HashDomain,
  content: unknown,
  algorithm: AlgorithmVersion = CURRENT_ALGORITHM,
): Digest {
  const canonical = canonicalise(content);
  switch (algorithm) {
    case 'sha256-jcs-v1':
      return { algorithm, domain, value: digestV1(domain, canonical) };
    default: {
      // Exhaustiveness: adding a version without handling it fails to compile.
      const unreachable: never = algorithm;
      throw new Error(`unsupported algorithm version: ${String(unreachable)}`);
    }
  }
}

/** Why a verification failed. `ok` alone cannot distinguish these. */
export type VerificationFailure =
  | { readonly ok: false; readonly reason: 'algorithm-unsupported'; readonly algorithm: string }
  | { readonly ok: false; readonly reason: 'domain-mismatch'; readonly expected: HashDomain; readonly actual: HashDomain }
  | { readonly ok: false; readonly reason: 'digest-mismatch' }
  | { readonly ok: false; readonly reason: 'malformed-digest' };

export type VerificationResult = { readonly ok: true } | VerificationFailure;

/**
 * Verify `content` against `expected`, selecting the algorithm by the digest's
 * own declared version (C-10.5).
 *
 * Failures are *classified*. "Algorithm not supported" and "content was altered"
 * are different facts, and reporting both as a bare false is how the predecessor's
 * false tamper verdicts became indistinguishable from genuine corruption.
 */
export function verify(expected: Digest, content: unknown): VerificationResult {
  if (!ALGORITHM_VERSIONS.includes(expected.algorithm)) {
    return { ok: false, reason: 'algorithm-unsupported', algorithm: expected.algorithm };
  }
  if (!/^[0-9a-f]{64}$/.test(expected.value)) {
    return { ok: false, reason: 'malformed-digest' };
  }

  const actual = hash(expected.domain, content, expected.algorithm);

  if (actual.domain !== expected.domain) {
    return { ok: false, reason: 'domain-mismatch', expected: expected.domain, actual: actual.domain };
  }

  const a = Buffer.from(actual.value, 'hex');
  const b = Buffer.from(expected.value, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'digest-mismatch' };
  }
  return { ok: true };
}
