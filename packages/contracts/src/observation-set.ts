/**
 * The Observation Set — what the Execution Plane may send the Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 09-data-flow-model.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0004 (wire format) · ADR-0005 (integrity)
 *   Audit        : PLANE-SOVEREIGNTY-AUDIT.md C-02 / C-03 / V-03 / V-04 / V-12
 *
 * WHY THIS EXISTS.
 * The EP→IP payload was the platform's most important message — it is what the reasoner reasons over
 * — and it had no schema, no version, no conformance test and no guard. That absence is why business
 * rules, roles, domain entities, a knowledge graph, a completeness model and an eighteen-dimension
 * coverage matrix could all be added to it without anything objecting. They were then transported
 * across the boundary and silently discarded, because nothing on the receiving side read them.
 *
 * THE INVARIANT THIS FILE ENFORCES.
 * The Execution Plane sends FACTS. It does not send knowledge.
 *
 *   A fact is what was retrieved, measured or observed, with the provenance to prove it.
 *   Knowledge is what those facts MEAN — and meaning is the Intelligence Plane's alone.
 *
 * The distinction is enforced two ways, and both are needed. The TYPES make a knowledge field a
 * compile error inside this repository. The GUARD (`assertNoKnowledge`) refuses one at the boundary
 * at runtime, because the Execution Plane is a separate codebase in a customer tenancy that this
 * repository cannot type-check.
 *
 * This is the same mechanism that already works for evidence: `EvidenceReference` has no `content`
 * field, so an artefact payload cannot cross, and the gateway refuses one that tries. That guard has
 * held. This is its equivalent for interpretation.
 *
 * WHAT CONFIDENCE MEANS HERE.
 * `confidence` describes HOW A FACT WAS OBTAINED, never whether it is true:
 *
 *   high    — read from a structured field or a parsed formal specification. No interpretation.
 *   medium  — extracted by an unambiguous structural marker (a Gherkin keyword, a list marker).
 *   low     — recognised by a heuristic scan of prose.
 *
 * A `low` confidence fact is a warning sign in this contract, not a licence: if the EP is
 * heuristically scanning prose, the thing it is producing is probably interpretation and probably
 * belongs to the Intelligence Plane. `textSpans` exists so the EP can hand over the prose itself and
 * let the reasoner do the recognising.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';

export const OBSERVATION_SET_VERSION = '1.0.0';

const Identifier = z.string().min(1).max(256);
const Instant = z.iso.datetime({ offset: true });

/** How a fact was obtained — never whether it is true. */
export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/**
 * Where a fact came from, precisely enough to go back and check it.
 *
 * `locator` is deliberately free-form — a field name, a JSON pointer, a revision number — because
 * what identifies a position differs per source kind. What is NOT optional is that something
 * identifies it: a fact with no resolvable origin cannot be audited, and cannot be argued with.
 */
export const ProvenanceSchema = z.object({
  sourceKind: z.enum(['workitem', 'attachment', 'application', 'repository', 'api-specification', 'catalog']),
  sourceRef: z.string().min(1),
  locator: z.string().nullable(),
  retrievedAt: Instant,
  /** How it was fetched. Distinguishes "read from a field" from "scraped from a rendered page". */
  retrievalMethod: z.enum(['api-field', 'api-document', 'file-read', 'dom-inventory', 'parsed-specification']),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** A work item, carried as its own fields. Verbatim: no derived or interpreted field may appear. */
export const WorkItemObservationSchema = z.object({
  id: z.string().min(1),
  type: z.string().nullable(),
  /** The source system's field names and values, exactly as returned. */
  fields: z.record(z.string(), z.unknown()),
  revisions: z.array(z.object({ rev: z.number().int(), at: Instant.nullable(), changedFields: z.array(z.string()) })),
  links: z.array(z.object({ id: z.string(), relation: z.string(), type: z.string().nullable() })),
  provenance: ProvenanceSchema,
});

/**
 * A span of customer prose, handed over WITHOUT classification.
 *
 * This is the field that makes the whole contract work. The Execution Plane used to regex this text
 * into `business-rule`, `validation`, `role`, `domain-entity` and `state-transition` facts — five
 * acts of interpretation performed in the customer's tenancy by patterns like
 * `/\b(must|shall|should|cannot)\b/`, which matches any sentence with a modal verb.
 *
 * A span carries the text and where it came from. What it MEANS is derived on the other side, by
 * capabilities that declare a prompt contract and rejection rules and can be improved for every
 * tenant at once.
 */
export const TextSpanSchema = z.object({
  sourceUri: z.string().min(1),
  field: z.string().min(1),
  offset: z.number().int().min(0),
  length: z.number().int().min(0),
  text: z.string(),
  provenance: ProvenanceSchema,
});

/** An artefact that exists, described by what is observable about it — never by what it is FOR. */
export const ArtefactObservationSchema = z.object({
  name: z.string().min(1),
  extension: z.string().nullable(),
  mediaType: z.string().nullable(),
  bytes: z.number().int().min(0).nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  retrieved: z.boolean(),
  /** Present only when retrieval failed — the reason, so absence is distinguishable from silence. */
  retrievalError: z.string().nullable(),
  provenance: ProvenanceSchema,
});

/** An operation read out of a FORMAL specification. Parsing a schema is reading, not interpreting. */
export const FormalSpecificationSchema = z.object({
  kind: z.enum(['openapi', 'wsdl', 'json-schema', 'raml']),
  operations: z.array(z.object({
    method: z.string(),
    path: z.string(),
    operationId: z.string().nullable(),
    parameters: z.array(z.object({ name: z.string(), in: z.string(), required: z.boolean() })),
    responses: z.array(z.string()),
  })),
  provenance: ProvenanceSchema,
});

/** A control the application actually rendered, with its selectors and their MEASURED uniqueness. */
export const ControlObservationSchema = z.object({
  controlId: z.string().min(1),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  selectors: z.array(z.object({
    strategy: z.enum(['role', 'label', 'testid', 'css', 'xpath']),
    value: z.string(),
    /** Counted in the live page. Not asserted, not assumed. */
    unique: z.boolean(),
    matchCount: z.number().int().min(0),
  })),
});

export const ScreenObservationSchema = z.object({
  url: z.string().min(1),
  title: z.string().nullable(),
  controls: z.array(ControlObservationSchema),
  /** What the page had, against what this run kept. Unequal means the inventory is incomplete. */
  controlsObserved: z.number().int().min(0),
  provenance: ProvenanceSchema,
});

/** What already exists in the customer's test and automation repositories. */
export const RepositoryInventorySchema = z.object({
  existingTests: z.array(z.object({
    id: z.string(), title: z.string().nullable(), state: z.string().nullable(),
    automationStatus: z.string().nullable(), areaPath: z.string().nullable(), changedAt: z.string().nullable(),
  })),
  sharedSteps: z.array(z.object({ id: z.string(), title: z.string().nullable() })),
  sharedParameters: z.array(z.object({ id: z.string(), title: z.string().nullable() })),
  automationAssets: z.array(z.object({ kind: z.string(), path: z.string(), scenarios: z.number().int().nullable() })),
  provenance: ProvenanceSchema,
});

/**
 * A measurement — a COUNT, with the method that produced it.
 *
 * `value` is an integer by construction, and that is the point (audit V-16). A ratio is a claim about
 * what should be divided by what, and choosing the denominator is testing expertise. The Execution
 * Plane counts; the Intelligence Plane divides.
 */
export const MeasurementSchema = z.object({
  name: z.string().min(1),
  value: z.number().int(),
  unit: z.enum(['count', 'bytes', 'milliseconds']),
  method: z.string().min(1),
});

/**
 * Something that could NOT be retrieved.
 *
 * A retrieval gap is a FACT — "the wiki was unreachable" is an observation about a fetch. What it
 * IMPLIES — "there is no API specification, and that is a risk" — is knowledge, and is not here.
 * This distinction was one of the better ideas in the code this contract replaces, and it survives
 * unchanged.
 */
export const RetrievalGapSchema = z.object({
  sourceKind: z.string().min(1),
  sourceRef: z.string().nullable(),
  expected: z.string().nullable(),
  reason: z.string().min(1),
  attemptedAt: Instant,
});

/** The complete payload. Additive fields are preserved (R-20.4), but the guard still sees them. */
export const ObservationSetSchema = z
  .object({
    contractVersion: z.literal(OBSERVATION_SET_VERSION),
    tenantId: Identifier,
    runId: Identifier,
    correlationId: Identifier,
    capturedAt: Instant,
    workItems: z.array(WorkItemObservationSchema),
    textSpans: z.array(TextSpanSchema),
    artefacts: z.array(ArtefactObservationSchema),
    formalSpecifications: z.array(FormalSpecificationSchema),
    screens: z.array(ScreenObservationSchema),
    repository: RepositoryInventorySchema.nullable(),
    measurements: z.array(MeasurementSchema),
    retrievalGaps: z.array(RetrievalGapSchema),
    /** Whether collection was bounded. `false` means the Intelligence Plane is seeing a partial view. */
    complete: z.boolean(),
    truncation: z.array(z.object({ what: z.string(), observed: z.number().int(), retained: z.number().int() })),
  })
  .passthrough();

export type ObservationSet = z.infer<typeof ObservationSetSchema>;

/**
 * Field names that name KNOWLEDGE rather than an observation.
 *
 * Every entry is a capability the Intelligence Plane owns, and every one of them was found on the
 * wire during the sovereignty audit. The list is deliberately about NAMES: a payload field called
 * `businessRules` is a claim to have identified business rules, whatever it happens to contain.
 *
 * This is a blunt instrument and that is intentional. A precise check would need to understand what
 * each field means, which is exactly the judgement that cannot be automated — whereas "the Execution
 * Plane is claiming to have found business rules" is unambiguous and catchable.
 */
const KNOWLEDGE_FIELDS = [
  'businessrules', 'businessrule', 'validations', 'validationrules',
  'roles', 'personas', 'domainentities', 'entities', 'statetransitions',
  'knowledgegraph', 'knowledgepackage', 'requirements', 'acceptancecriteria',
  'coverage', 'coveragematrix', 'discoverymatrix', 'completeness', 'completenessscore',
  'risk', 'riskassessment', 'risklevel', 'priority', 'severity',
  'recommendations', 'recommendation', 'verdict', 'certified', 'certification',
  'gates', 'qualitygates', 'findings', 'ambiguities', 'gaps',
  'authoringfeedback', 'reviewfindings', 'testdesign', 'plan',
] as const;

/** Field names that look like a ratio. The EP reports counts; anything divided is a model. */
const RATIO_PATTERN = /(percent|ratio|score|rate|coverage)$/i;

export interface KnowledgeViolation {
  readonly path: string;
  readonly field: string;
  readonly reason: 'knowledge-field' | 'ratio-field' | 'fractional-measurement';
}

/**
 * Walk a payload and report every field that carries knowledge rather than an observation.
 *
 * Returns violations rather than throwing, so a caller can refuse with a typed reason and log every
 * offending field at once — a boundary check that reports only the first problem turns one fix into
 * several round trips.
 *
 * Depth is bounded. A payload deep enough to exhaust the stack is itself a reason to refuse, and a
 * guard that crashes is a guard that can be bypassed by crashing it.
 */
export function findKnowledgeFields(value: unknown, path = '$', depth = 0): KnowledgeViolation[] {
  if (depth > 12 || value === null || typeof value !== 'object') return [];
  const found: KnowledgeViolation[] = [];

  if (Array.isArray(value)) {
    // Arrays are sampled at their first few entries: a knowledge field is structural, so it appears
    // in every element or none, and walking 10,000 rows to learn that costs a request timeout.
    for (let i = 0; i < Math.min(value.length, 5); i += 1) {
      found.push(...findKnowledgeFields(value[i], `${path}[${i}]`, depth + 1));
    }
    return found;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    const normalised = key.toLowerCase().replace(/[^a-z]/g, '');

    if ((KNOWLEDGE_FIELDS as readonly string[]).includes(normalised)) {
      found.push({ path: here, field: key, reason: 'knowledge-field' });
      continue; // no need to descend — the whole subtree is the violation
    }
    if (RATIO_PATTERN.test(key)) {
      found.push({ path: here, field: key, reason: 'ratio-field' });
      continue;
    }
    // A count that is not a whole number is a ratio wearing a count's name.
    if (typeof child === 'number' && !Number.isInteger(child) && /count|total|observed|retained/i.test(key)) {
      found.push({ path: here, field: key, reason: 'fractional-measurement' });
      continue;
    }
    found.push(...findKnowledgeFields(child, here, depth + 1));
  }
  return found;
}

export class KnowledgeInObservationSetError extends Error {
  constructor(public readonly violations: readonly KnowledgeViolation[]) {
    const shown = violations.slice(0, 5).map((v) => `${v.path} (${v.reason})`).join('; ');
    super(
      `the Execution Plane sent knowledge, not observations: ${shown}`
      + (violations.length > 5 ? ` and ${violations.length - 5} more` : '')
      + '. Interpretation is the Intelligence Plane\'s; the Execution Plane sends facts with provenance.',
    );
    this.name = 'KnowledgeInObservationSetError';
  }
}

/**
 * Refuse a payload that carries interpretation.
 *
 * Called at the boundary, before anything reasons over the payload. It is the direct counterpart of
 * the guard that refuses an evidence reference carrying artefact content — same position, same
 * severity, same reason: a boundary that is only documented is a boundary that drifts.
 */
export function assertNoKnowledge(payload: unknown): void {
  const violations = findKnowledgeFields(payload);
  if (violations.length > 0) throw new KnowledgeInObservationSetError(violations);
}

/** Parse, validate and guard. The only supported way to admit an Observation Set. */
export function parseObservationSet(input: unknown): ObservationSet {
  const parsed = ObservationSetSchema.parse(input);
  // Guard AFTER shape validation: an unparseable payload should report as malformed rather than as a
  // sovereignty breach, because those call for different responses from different people.
  assertNoKnowledge(parsed);
  return parsed;
}
