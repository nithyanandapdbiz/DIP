/**
 * The execution package contract — the sealed artefact the Intelligence Plane
 * authors and the Execution Plane sequences.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §2 · 12-capability-orchestration.md
 *   ADR          : ADR-0004 (wire format) · ADR-0007 (signing) · ADR-0015 (caching)
 *   Criteria     : C-20.6 (a message without a contract version is rejected)
 *                  C-20.7 (unknown fields survive pass-through)
 *                  C-20.8 (a package is immutable after authoring)
 *                  C-01.11 (exactly one package per run, sealed, content-addressed)
 *                  C-22.1 (an expired package is refused)
 *
 * The package converts orchestration from a *conversation* into an *artefact*.
 * A conversation requires both parties live; an artefact can be cached, replayed,
 * audited and executed while its author is offline — which is the mechanism by
 * which INV-7 is achievable at all.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';
import { CONTRACT_VERSION, SUPPORTED_MAJORS, isSupported } from './version.js';
import { ALGORITHM_VERSIONS, HASH_DOMAINS } from './integrity.js';

/** ISO-8601 instant. Dates are strings on the wire so canonical form is explicit. */
const Instant = z.iso.datetime({ offset: true });

const Identifier = z.string().min(1).max(256);

/**
 * Unknown fields are PRESERVED, not stripped (R-20.4, C-20.7).
 *
 * A newer producer must not break an older consumer on additive change, and a
 * consumer that silently discarded unknown fields would corrupt any package it
 * passed through — including its content hash.
 */
const passthrough = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

/** Element 1 of 7 — whether execution is permitted at all. */
export const ProceedSchema = z.discriminatedUnion('proceed', [
  z.object({ proceed: z.literal(true) }),
  z.object({ proceed: z.literal(false), refusalReason: z.string().min(1) }),
]);

/** Element 2 of 7 — the ordered sequence to execute. */
export const OperationSchema = passthrough({
  operationId: Identifier,
  /** Capability-named, never tool-named (R-7.3, R-14.14). */
  kind: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

/** Element 3 of 7 — execution parameters. */
export const DirectivesSchema = passthrough({
  timeoutMs: z.number().int().positive(),
  maxAttempts: z.number().int().min(1),
  maxConcurrency: z.number().int().min(1),
  /** Dry-run differs only inside the adapter (R-04.6, R-14.10). */
  mode: z.enum(['live', 'dry-run']),
});

/** Element 4 of 7 — carried by the EP, evaluated only by the IP (R-20.7). */
export const GateDefinitionSchema = passthrough({
  gateId: Identifier,
  expression: z.string().min(1),
});

/** Element 5 of 7 — what SHALL be captured, and to what fidelity. */
export const EvidenceRequirementSchema = passthrough({
  requirementId: Identifier,
  classification: z.enum(['C1', 'C2', 'C3', 'C4', 'C5']),
  required: z.boolean(),
});

/** Element 6 of 7 — authoring identity, tenant, time, version, key. */
export const ProvenanceSchema = passthrough({
  authoredBy: Identifier,
  tenantId: Identifier,
  authoredAt: Instant,
  contractVersion: z.string().min(1),
  /** Implies the signature algorithm, so rotation needs no contract change (ADR-0007 §6). */
  signingKeyId: Identifier,
  contentHash: z.object({
    algorithm: z.enum(ALGORITHM_VERSIONS),
    domain: z.enum(HASH_DOMAINS),
    value: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});

/** Element 7 of 7 — expiry, and reuse while the IP is unavailable. */
export const ValiditySchema = passthrough({
  notBefore: Instant,
  notAfter: Instant,
  /** Bounded by notAfter — a cached package is not exempt from expiry (R-22.5). */
  reusableWhileUnavailable: z.boolean(),
});

/** All seven elements. None is optional (R-20.6). */
export const ExecutionPackageSchema = z
  .object({
    contractVersion: z.string().min(1),
    runId: Identifier,
    /** Idempotency identity — resubmission produces no second execution (R-20.11). */
    correlationId: Identifier,
    capabilityId: Identifier,
    operations: z.array(OperationSchema),
    directives: DirectivesSchema,
    gates: z.array(GateDefinitionSchema),
    evidenceRequirements: z.array(EvidenceRequirementSchema),
    provenance: ProvenanceSchema,
    validity: ValiditySchema,
  })
  .and(ProceedSchema)
  .and(z.object({}).passthrough());

export type ExecutionPackage = z.infer<typeof ExecutionPackageSchema>;

/** The subset that is content-addressed: everything except the hash of itself. */
export function hashableContent(pkg: ExecutionPackage): Record<string, unknown> {
  const { provenance, ...rest } = pkg as ExecutionPackage & { provenance: Record<string, unknown> };
  const { contentHash: _omitted, ...provenanceWithoutHash } = provenance;
  return { ...rest, provenance: provenanceWithoutHash };
}

/**
 * Parse and validate. A message without a contract version is REJECTED, not
 * guessed at (R-20.5, C-20.6).
 *
 * ── VERSION TOLERANCE IS BY MAJOR, NOT BY EXACT MATCH (R-20.24, R-19.11) ────────────────────
 *
 * This function compared `contractVersion !== CONTRACT_VERSION` and threw — **exact match or
 * refuse** — while `version.ts` already declared `SUPPORTED_MAJORS`, `majorOf()` and
 * `isSupported()` for precisely this rule, and this function called none of them.
 *
 * **A TEST AND ITS SUBJECT DISAGREED INSIDE ONE PACKAGE.** `contracts.test.ts` asserts
 * `isSupported('1.4.2') === true` — *"a later minor within a supported major must parse"* — and the
 * parser threw on that exact input. The test exercised the PREDICATE; nothing exercised the
 * predicate's effect on the only function that parses a package, so the two could disagree
 * indefinitely and the suite stayed green.
 *
 * **AND THE HALF THAT MATTERS MORE.** R-19.11 promises a customer that an Execution Plane may run
 * OLDER than the Intelligence Plane. That promise **had never been measured across a version
 * boundary, because no boundary had ever existed** — the compatibility corpus held exactly one
 * fixture directory, equal to the current version, so *"every retained fixture still parses"*
 * asserted only that current-version documents parse at the current version. **The gate was green
 * because the condition it guards had never occurred.** Same shape as the contract's own
 * unconsumed parse path, one level out (debt D-117, D-118).
 *
 * So the rule is now the one the architecture states: **a package whose MAJOR is supported
 * parses; only an unsupported major is refused.** Refusal stays explicit — silent
 * reinterpretation is the most dangerous available failure (R-20.1), and a MAJOR bump is
 * precisely where meaning is permitted to change.
 */
export function parseExecutionPackage(input: unknown): ExecutionPackage {
  const parsed = ExecutionPackageSchema.parse(input);
  if (!isSupported(parsed.contractVersion)) {
    throw new Error(
      `unsupported contract version "${parsed.contractVersion}"; this build supports major(s) `
      + `${SUPPORTED_MAJORS.join(', ')} (current ${CONTRACT_VERSION})`,
    );
  }
  return parsed;
}
