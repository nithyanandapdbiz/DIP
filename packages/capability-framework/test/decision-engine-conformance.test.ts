/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 3 Decision Engine.
 *
 * A minimal reference consumer: it consumes an Execution Context, requests
 * deterministic decisions, and receives immutable Decision Objects. No connector
 * implementation, no Functional-Testing logic, no orchestration logic.
 *
 * Proves, by execution: determinism, rule precedence, AI advisory-only behaviour,
 * and decision immutability.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 13-ai-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-DECISION · deterministic + AI-advisory (G-6) · capability-neutral (G-16)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealExecutionContext, EXECUTION_CONTEXT_VERSION, type ExecutionContext } from '../src/execution-context.js';
import {
  createDecisionEngine, RULE_PRECEDENCE,
  type DecisionRequest, type DecisionRule, type AiRecommendation,
} from '../src/decision.js';

function ctx(): ExecutionContext {
  return sealExecutionContext({
    contractVersion: EXECUTION_CONTEXT_VERSION, correlationId: 'c1',
    tenant: { tenantId: 't1', environment: 'test' },
    governance: { policyVersion: '1.0.0', governanceTriadRequired: true },
    security: { zeroTrust: true, classification: 'internal' },
    configuration: { configVersion: '1.0.0', source: 'tenant' },
    decision: { deterministic: true, aiAdvisoryOnly: true },
    audit: { auditLogId: 'a1', appendOnly: true },
    trace: { traceId: 'tr1', spanId: 'sp1' },
    capability: { capabilityId: 'reference', capabilityVersion: '0.0.0' },
    environment: { platform: 'ref', runtime: 'ref' },
    metadata: { entries: [] },
  });
}

function request(rules: readonly DecisionRule[], ai: AiRecommendation | null): DecisionRequest {
  return {
    type: 'execution-strategy',
    candidates: ['alpha', 'beta', 'gamma'],
    rules, aiRecommendation: ai, context: ctx(), traceId: 'tr1',
  };
}

const engine = createDecisionEngine();

test('Wave 3 — the engine is deterministic: identical inputs give identical decisions', () => {
  const req = request(
    [{ source: 'tenant-configuration', type: 'execution-strategy', selects: 'beta' }],
    { type: 'execution-strategy', recommends: 'gamma', confidence: 0.9, rationale: 'ai' });
  assert.deepEqual(engine.decide(req), engine.decide(req));
});

test('Wave 3 — rule precedence holds: a higher tier always wins', () => {
  const d = engine.decide(request(
    [
      { source: 'capability-configuration', type: 'execution-strategy', selects: 'gamma' },
      { source: 'tenant-configuration', type: 'execution-strategy', selects: 'beta' },
      { source: 'platform-governance', type: 'execution-strategy', selects: 'alpha' },
    ], null));
  assert.equal(d.selectedStrategy, 'alpha');
  assert.equal(d.ruleSource, 'platform-governance');
});

test('Wave 3 — AI is advisory only: it never overrides a higher tier, and is recorded separately', () => {
  const ai: AiRecommendation = { type: 'execution-strategy', recommends: 'gamma', confidence: 0.99, rationale: 'ai prefers gamma' };
  const d = engine.decide(request(
    [{ source: 'platform-governance', type: 'execution-strategy', selects: 'alpha' }], ai));
  assert.equal(d.selectedStrategy, 'alpha', 'governance wins, not AI');
  assert.notEqual(d.ruleSource, 'ai-recommendation');
  assert.deepEqual(d.aiRecommendation, ai, 'the AI recommendation is recorded separately, not conflated');
});

test('Wave 3 — AI may decide only at its own tier when nothing higher applies', () => {
  const ai: AiRecommendation = { type: 'execution-strategy', recommends: 'gamma', confidence: 0.7, rationale: 'ai' };
  const d = engine.decide(request([], ai));
  assert.equal(d.selectedStrategy, 'gamma');
  assert.equal(d.ruleSource, 'ai-recommendation');
  assert.equal(d.confidence, 0.7);
});

test('Wave 3 — with no rule and no AI, a deterministic platform default is chosen', () => {
  const d = engine.decide(request([], null));
  assert.equal(d.ruleSource, 'platform-default');
  assert.equal(d.selectedStrategy, 'alpha', 'lexicographically smallest candidate, deterministic');
});

test('Wave 3 — the Decision Object is immutable', () => {
  const d = engine.decide(request([{ source: 'security', type: 'execution-strategy', selects: 'beta' }], null));
  assert.ok(Object.isFrozen(d));
  assert.throws(() => { (d as unknown as { selectedStrategy: string }).selectedStrategy = 'x'; });
  assert.equal(d.deterministic, true);
  assert.equal(RULE_PRECEDENCE[0], 'platform-governance', 'governance is the highest tier');
});
