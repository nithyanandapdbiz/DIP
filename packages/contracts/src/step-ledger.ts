/**
 * The Step Ledger — what the Execution Plane records about its own run.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0022 (R-12.5: stages 10–12 never execute in the Execution Plane)
 *   Audit        : PLANE-SOVEREIGNTY-AUDIT.md V-01 / V-31
 *
 * WHY THIS EXISTS.
 * The Execution Plane ran a three-reviewer governance pipeline over every phase and issued
 * `CERTIFIED` / `NOT_CERTIFIED` verdicts inside the customer's tenancy. Its certification reviewer
 * decided whether a phase's output "may be relied on downstream" — a judgement two competent
 * architects can disagree about, made where the Intelligence Plane could not see it, and then
 * rendered into an audit trail reading "3 reviewers approved" for reviews the Intelligence Plane
 * never saw. A second governance triad existed alongside the platform's own.
 *
 * THE DESIGN PROPERTY THAT MATTERS.
 * There is no verdict field on this type, and there never will be. That is not a convention — it is
 * the mechanism. `EvidenceReference` has no `content` field, so an artefact payload cannot cross the
 * boundary however much anyone wants it to; a Step Ledger has no verdict, so a run cannot certify
 * itself however convenient that would be. The conformance test asserts it structurally.
 *
 * A ledger entry states what happened: a step ran, it finished, it produced these observations and
 * these evidence references. Whether that is GOOD is read from it by the Intelligence Plane's review
 * and certification capabilities, which already exist and already run.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';

export const STEP_LEDGER_VERSION = '1.0.0';

const Identifier = z.string().min(1).max(256);
const Instant = z.iso.datetime({ offset: true });

/**
 * How a step ENDED. Not how it went.
 *
 * The vocabulary is deliberately mechanical and deliberately small:
 *
 *   completed  — the step ran to its end
 *   blocked    — an external dependency prevented it, and the reason says which
 *   failed     — the step itself errored
 *   skipped    — it was not attempted, and the reason says why
 *
 * `completed` says nothing about whether the outcome was acceptable. A step that executed 60
 * operations of which 60 failed is `completed`: it did what it was asked to do, and what the results
 * MEAN is a judgement made elsewhere. Conflating the two is exactly how "all phases certified"
 * became reportable for a run that proved nothing.
 */
export const StepOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('completed') }),
  z.object({ outcome: z.literal('blocked'), reason: z.string().min(1) }),
  z.object({ outcome: z.literal('failed'), reason: z.string().min(1) }),
  z.object({ outcome: z.literal('skipped'), reason: z.string().min(1) }),
]);

/**
 * Something the Execution Plane COUNTED or NOTICED while running a step.
 *
 * `code` is a stable identifier so the Intelligence Plane can reason over observations without
 * parsing prose, and `detail` is for a human reading the ledger. Neither carries a severity: a
 * severity is a judgement about how much something matters, and that is assigned on the other side
 * against policy the Intelligence Plane owns.
 */
export const StepObservationSchema = z.object({
  code: z.string().regex(/^observed\.[a-z0-9-]+$/, 'an observation code must be namespaced `observed.` — it states, it does not conclude'),
  detail: z.string().min(1),
  subject: z.string().nullable(),
});

/** A count produced during a step. Integer by construction: the EP counts, the IP divides. */
export const StepMeasurementSchema = z.object({
  name: z.string().min(1),
  value: z.number().int(),
  unit: z.enum(['count', 'bytes', 'milliseconds']),
});

/** One step of the run, as it actually happened. */
export const StepEntrySchema = z
  .object({
    stepId: Identifier,
    title: z.string().min(1),
    startedAt: Instant,
    finishedAt: Instant,
    observations: z.array(StepObservationSchema),
    measurements: z.array(StepMeasurementSchema),
    /** Evidence REFERENCES only. The artefacts stay in the customer's tenancy (INV-1). */
    evidenceRefs: z.array(Identifier),
  })
  .and(StepOutcomeSchema)
  .and(z.object({}).passthrough());

/**
 * How the RUN ended — mechanically.
 *
 * This is a completion state, not a verdict, and the pair is the correction of a specific violation
 * (audit V-31). The Execution Plane used to emit a single field that mixed both: `CERTIFIED`,
 * `NOT CERTIFIED`, `BLOCKED`, `FATAL` — and then exited with a CI-gating code derived from it. A run
 * in which everything worked and nothing was certified is not the same fact as a run that crashed,
 * and one field cannot say both.
 *
 * Certification arrives separately, from the Intelligence Plane, or not at all.
 */
export const COMPLETION_STATES = ['complete', 'incomplete', 'failed'] as const;
export type CompletionState = (typeof COMPLETION_STATES)[number];

export const StepLedgerSchema = z
  .object({
    contractVersion: z.literal(STEP_LEDGER_VERSION),
    tenantId: Identifier,
    runId: Identifier,
    correlationId: Identifier,
    capabilityId: Identifier,
    startedAt: Instant,
    finishedAt: Instant,
    /** Did the run get through its plan? Nothing about whether the results were acceptable. */
    completionState: z.enum(COMPLETION_STATES),
    steps: z.array(StepEntrySchema),
    /** The plan this run executed, so the Intelligence Plane can tell partial from complete. */
    planId: Identifier.nullable(),
    plannedSteps: z.number().int().min(0),
  })
  .passthrough();

export type StepLedger = z.infer<typeof StepLedgerSchema>;
export type StepEntry = z.infer<typeof StepEntrySchema>;

/**
 * Field names that would make this a verdict rather than a record.
 *
 * Checked at the boundary because the Execution Plane is a separate codebase this repository cannot
 * type-check. `passthrough()` preserves unknown fields for forward compatibility (R-20.4), which is
 * right — and it is also the hole through which a `certified: true` would travel unnoticed.
 */
const VERDICT_FIELDS = [
  'verdict', 'certified', 'certification', 'approved', 'approval',
  'passed', 'certifiedby', 'terminalstate', 'assurancestate', 'quality', 'grade',
] as const;

export interface VerdictViolation { readonly path: string; readonly field: string; }

export function findVerdictFields(value: unknown, path = '$', depth = 0): VerdictViolation[] {
  if (depth > 10 || value === null || typeof value !== 'object') return [];
  const found: VerdictViolation[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 5); i += 1) found.push(...findVerdictFields(value[i], `${path}[${i}]`, depth + 1));
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    if ((VERDICT_FIELDS as readonly string[]).includes(key.toLowerCase().replace(/[^a-z]/g, ''))) {
      found.push({ path: here, field: key });
      continue;
    }
    found.push(...findVerdictFields(child, here, depth + 1));
  }
  return found;
}

export class VerdictInStepLedgerError extends Error {
  constructor(public readonly violations: readonly VerdictViolation[]) {
    super(
      `the Execution Plane recorded a verdict: ${violations.slice(0, 5).map((v) => v.path).join('; ')}. `
      + 'A Step Ledger states what happened; certification is the Intelligence Plane\'s decision (R-12.5).',
    );
    this.name = 'VerdictInStepLedgerError';
  }
}

export function assertNoVerdict(payload: unknown): void {
  const violations = findVerdictFields(payload);
  if (violations.length > 0) throw new VerdictInStepLedgerError(violations);
}

export function parseStepLedger(input: unknown): StepLedger {
  const parsed = StepLedgerSchema.parse(input);
  assertNoVerdict(parsed);
  return parsed;
}
