/**
 * The sovereignty contracts refuse what the audit found on the wire.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 09-data-flow-model.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0004 (wire format) · ADR-0005 (integrity) · ADR-0022
 *   Audit        : PLANE-SOVEREIGNTY-AUDIT.md C-02 / C-03 / V-01 / V-03 / V-04 / V-12 / V-31
 *   Categories   : contract, negative, cross-plane, security
 *
 * Each test here corresponds to a payload that WAS crossing the boundary, named by its violation.
 * They exist because a boundary that is only documented drifts: `EvidenceReference` has held for
 * exactly one reason — there is no `content` field and the gateway refuses one that tries — and
 * these are its equivalents for interpretation and for verdicts.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseObservationSet, assertNoKnowledge, findKnowledgeFields, KnowledgeInObservationSetError,
  OBSERVATION_SET_VERSION,
} from '../src/observation-set.js';
import {
  parseStepLedger, findVerdictFields, VerdictInStepLedgerError, STEP_LEDGER_VERSION,
} from '../src/step-ledger.js';
import {
  validateRegister, parseCapabilityRegister, CapabilityRegisterError, CAPABILITY_REGISTER_VERSION,
  type CapabilityDeclaration, type CapabilityRegister,
} from '../src/capability-register.js';

const AT = '2026-08-01T09:00:00.000Z';

const provenance = {
  sourceKind: 'workitem' as const, sourceRef: '52121', locator: 'System.Title',
  retrievedAt: AT, retrievalMethod: 'api-field' as const,
};

const observationSet = (over: Record<string, unknown> = {}) => ({
  contractVersion: OBSERVATION_SET_VERSION,
  tenantId: 'tnt-1', runId: 'run-1', correlationId: 'corr-1', capturedAt: AT,
  workItems: [], textSpans: [], artefacts: [], formalSpecifications: [], screens: [],
  repository: null, measurements: [], retrievalGaps: [],
  complete: true, truncation: [],
  ...over,
});

// ── the Observation Set refuses interpretation ──────────────────────────────

describe('ObservationSet — the Execution Plane sends facts, not knowledge', () => {
  test('a payload of pure observations is admitted', () => {
    const set = parseObservationSet(observationSet({
      textSpans: [{ sourceUri: 'workitem://52121', field: 'System.Description', offset: 0, length: 42, text: 'A customer must supply a delivery address.', provenance }],
      measurements: [{ name: 'attachments-retrieved', value: 3, unit: 'count', method: 'ado-attachment-download' }],
    }));
    assert.equal(set.tenantId, 'tnt-1');
  });

  test('V-03: a `businessRules` field is REFUSED', () => {
    assert.throws(
      () => parseObservationSet(observationSet({ businessRules: [{ statement: 'an order needs an address' }] })),
      KnowledgeInObservationSetError,
    );
  });

  test('V-04: `roles`, `domainEntities` and `stateTransitions` are all refused', () => {
    for (const field of ['roles', 'domainEntities', 'stateTransitions', 'personas']) {
      assert.throws(() => parseObservationSet(observationSet({ [field]: ['anything'] })),
        KnowledgeInObservationSetError, `${field} must be refused`);
    }
  });

  test('V-12: a knowledge graph cannot cross under any of its names', () => {
    for (const field of ['knowledgeGraph', 'knowledgePackage', 'knowledge_graph']) {
      assert.throws(() => parseObservationSet(observationSet({ [field]: { story: {} } })), KnowledgeInObservationSetError);
    }
  });

  test('V-18: the discovery matrix is refused', () => {
    assert.throws(() => parseObservationSet(observationSet({ discoveryMatrix: [] })), KnowledgeInObservationSetError);
  });

  test('V-10/V-16: any ratio-shaped field is refused, whatever it is called', () => {
    for (const field of ['completenessScore', 'coveragePercent', 'passRate', 'signalRatio', 'requirementCoverage']) {
      assert.throws(() => parseObservationSet(observationSet({ [field]: 0.46 })),
        KnowledgeInObservationSetError, `${field} must be refused`);
    }
  });

  test('a count that is not a whole number is caught — a ratio wearing a count\'s name', () => {
    const v = findKnowledgeFields({ criteriaCount: 2.5 });
    assert.equal(v.length, 1);
    assert.equal(v[0]!.reason, 'fractional-measurement');
  });

  test('V-20: authoring feedback phrased as corrections is refused', () => {
    assert.throws(() => parseObservationSet(observationSet({ authoringFeedback: [{ code: 'x', detail: 'y' }] })),
      KnowledgeInObservationSetError);
  });

  test('knowledge nested deep inside an accepted field is still found', () => {
    const violations = findKnowledgeFields({ workItems: [{ id: '1', extracted: { businessRules: ['x'] } }] });
    assert.equal(violations.length, 1);
    assert.match(violations[0]!.path, /businessRules/);
  });

  test('the refusal names every offending field, not just the first', () => {
    try {
      assertNoKnowledge({ businessRules: [], roles: [], coveragePercent: 1 });
      assert.fail('should have refused');
    } catch (e) {
      assert.ok(e instanceof KnowledgeInObservationSetError);
      assert.equal(e.violations.length, 3, 'a check that reports one problem turns one fix into three round trips');
    }
  });

  test('the guard terminates on a deeply nested payload rather than exhausting the stack', () => {
    let deep: Record<string, unknown> = { businessRules: ['too deep to matter'] };
    for (let i = 0; i < 200; i += 1) deep = { nested: deep };
    assert.doesNotThrow(() => findKnowledgeFields(deep), 'a guard that crashes can be bypassed by crashing it');
  });

  test('a malformed payload reports as malformed, not as a sovereignty breach', () => {
    // Different problems call for responses from different people.
    assert.throws(() => parseObservationSet({ contractVersion: OBSERVATION_SET_VERSION }), (e: Error) => e.name === 'ZodError');
  });

  test('provenance is required on every observed work item', () => {
    assert.throws(() => parseObservationSet(observationSet({
      workItems: [{ id: '1', type: 'User Story', fields: {}, revisions: [], links: [] }],
    })), (e: Error) => e.name === 'ZodError');
  });
});

// ── the Step Ledger refuses a verdict ───────────────────────────────────────

const ledger = (over: Record<string, unknown> = {}) => ({
  contractVersion: STEP_LEDGER_VERSION,
  tenantId: 'tnt-1', runId: 'run-1', correlationId: 'corr-1', capabilityId: 'functional-testing',
  startedAt: AT, finishedAt: AT, completionState: 'complete' as const,
  steps: [], planId: null, plannedSteps: 0,
  ...over,
});

const step = (over: Record<string, unknown> = {}) => ({
  stepId: 'execution', title: 'Execution', startedAt: AT, finishedAt: AT,
  outcome: 'completed' as const, observations: [], measurements: [], evidenceRefs: [],
  ...over,
});

describe('StepLedger — the Execution Plane records what happened, never a verdict', () => {
  test('a ledger of mechanical outcomes is admitted', () => {
    const l = parseStepLedger(ledger({ steps: [step({ measurements: [{ name: 'operations-executed', value: 60, unit: 'count' }] })] }));
    assert.equal(l.steps.length, 1);
  });

  test('V-01: a `certified` field anywhere is REFUSED', () => {
    assert.throws(() => parseStepLedger(ledger({ steps: [step({ certified: true })] })), VerdictInStepLedgerError);
  });

  test('V-01: `verdict`, `approved` and `assuranceState` are refused', () => {
    for (const field of ['verdict', 'approved', 'assuranceState', 'certification']) {
      assert.throws(() => parseStepLedger(ledger({ [field]: 'CERTIFIED' })), VerdictInStepLedgerError, `${field} must be refused`);
    }
  });

  test('V-31: a terminal state that mixes completion with certification is refused', () => {
    assert.throws(() => parseStepLedger(ledger({ terminalState: 'CERTIFIED' })), VerdictInStepLedgerError);
  });

  test('a completed step says nothing about whether the outcome was acceptable', () => {
    // 60 operations, 60 failures — the step still COMPLETED. Conflating the two is how "all phases
    // certified" became reportable for a run that proved nothing.
    const l = parseStepLedger(ledger({
      steps: [step({ measurements: [{ name: 'failed', value: 60, unit: 'count' }] })],
    }));
    assert.equal((l.steps[0] as { outcome: string }).outcome, 'completed');
  });

  test('a blocked or skipped step must state its reason', () => {
    assert.throws(() => parseStepLedger(ledger({ steps: [step({ outcome: 'blocked' })] })), (e: Error) => e.name === 'ZodError');
    assert.doesNotThrow(() => parseStepLedger(ledger({ steps: [step({ outcome: 'blocked', reason: 'the Intelligence Plane was unreachable' })] })));
  });

  test('an observation code must be namespaced `observed.` — it states, it does not conclude', () => {
    assert.throws(() => parseStepLedger(ledger({
      steps: [step({ observations: [{ code: 'design.inadequate', detail: 'x', subject: null }] })],
    })), (e: Error) => e.name === 'ZodError');
    assert.doesNotThrow(() => parseStepLedger(ledger({
      steps: [step({ observations: [{ code: 'observed.step-without-expected-result', detail: 'x', subject: null }] })],
    })));
  });

  test('the completion state vocabulary carries no quality claim', () => {
    for (const bad of ['certified', 'passed', 'good']) {
      assert.throws(() => parseStepLedger(ledger({ completionState: bad })), (e: Error) => e.name === 'ZodError');
    }
  });

  test('assertNoVerdict finds a verdict nested inside a passthrough field', () => {
    const v = findVerdictFields({ steps: [{ extra: { reviews: [{ approved: true }] } }] });
    assert.ok(v.length > 0);
  });
});

// ── the register refuses duplication ────────────────────────────────────────

const capability = (over: Partial<CapabilityDeclaration> = {}): CapabilityDeclaration => ({
  capabilityId: 'business-rule-extraction',
  ownerPlane: 'IP',
  purpose: 'Identify the business rules a requirement states, citing the span each came from.',
  inputContract: 'dbiz.observation-set@1',
  outputContract: 'dbiz.knowledge-graph@1',
  producer: 'packages/discovery-flow-engine/src/agents/requirement-and-workitem.ts',
  consumers: ['test-design'],
  sourceOfTruth: 'story.business-rule-extraction',
  reasoningType: 'classification',
  executionType: 'reasoning',
  knowledgeType: 'business-rule',
  ciEnforcementRule: 'no-knowledge-in-ep',
  ...over,
});

const register = (capabilities: CapabilityDeclaration[]): CapabilityRegister =>
  ({ contractVersion: CAPABILITY_REGISTER_VERSION, capabilities });

describe('CapabilityRegister — exactly one implementation of every capability', () => {
  test('a well-formed register validates', () => {
    assert.deepEqual(validateRegister(register([capability()])), []);
  });

  test('THE duplication check: two capabilities owning one knowledge type is refused', () => {
    // This is the shape of the audit's most expensive finding — business-rule extraction existing in
    // both planes, with two implementations and two answers.
    const violations = validateRegister(register([
      capability(),
      capability({ capabilityId: 'ep-business-rule-discovery', ownerPlane: 'IP', producer: 'elsewhere.mjs' }),
    ]));
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.rule, 'duplicate-knowledge');
  });

  test('an Execution-Plane capability that REASONS is refused', () => {
    const violations = validateRegister(register([capability({
      capabilityId: 'ep-rule-scan', ownerPlane: 'EP', reasoningType: 'extraction',
      knowledgeType: null, executionType: 'collection',
    })]));
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.rule, 'ep-reasons');
  });

  test('an Execution-Plane capability that OWNS KNOWLEDGE is refused', () => {
    const violations = validateRegister(register([capability({
      capabilityId: 'ep-rule-scan', ownerPlane: 'EP', reasoningType: 'none',
      knowledgeType: 'business-rule', executionType: 'collection',
    })]));
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.rule, 'ep-owns-knowledge');
  });

  test('an Execution-Plane capability that reviews, certifies or plans is refused', () => {
    for (const executionType of ['review', 'certification', 'planning', 'decision'] as const) {
      const violations = validateRegister(register([capability({
        capabilityId: `ep-${executionType}`, ownerPlane: 'EP', reasoningType: 'none',
        knowledgeType: null, executionType,
      })]));
      assert.equal(violations.length, 1, `EP ${executionType} must be refused`);
      assert.equal(violations[0]!.rule, 'ep-reasons');
    }
  });

  test('a collection capability in the Execution Plane is admitted — that is its job', () => {
    assert.deepEqual(validateRegister(register([capability({
      capabilityId: 'work-item-collection', ownerPlane: 'EP', reasoningType: 'none',
      knowledgeType: null, executionType: 'collection',
      outputContract: 'dbiz.observation-set@1', sourceOfTruth: 'connectors/azure-devops.mjs',
    })])), []);
  });

  test('the same id declared twice is refused', () => {
    const violations = validateRegister(register([capability(), capability({ knowledgeType: 'coverage' })]));
    assert.equal(violations[0]!.rule, 'duplicate-id');
  });

  test('a capability nothing consumes is refused — that is dead payload (C-04)', () => {
    assert.throws(() => parseCapabilityRegister(register([capability({ consumers: [] })])), (e: Error) => e.name === 'ZodError');
  });

  test('every declaration must name the CI rule that enforces it', () => {
    assert.throws(() => parseCapabilityRegister(register([capability({ ciEnforcementRule: '' })])), (e: Error) => e.name === 'ZodError');
  });

  test('parseCapabilityRegister throws with every violation listed', () => {
    try {
      parseCapabilityRegister(register([capability(), capability({ capabilityId: 'other', producer: 'x' })]));
      assert.fail('should have refused');
    } catch (e) {
      assert.ok(e instanceof CapabilityRegisterError);
      assert.equal(e.violations.length, 1);
    }
  });
});
