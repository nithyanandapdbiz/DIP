/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 4 intelligence models.
 *
 * A minimal reference consumer of the Repository Intelligence and Automation
 * Intelligence models. It constructs each model, seals it, validates immutability,
 * and reads its fields (contract usage). No business logic, no AI, no repository
 * scanning, no automation generation.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-REPO-MODEL · PCT-AUTO-MODEL · immutable (G-8) · capability-neutral (G-16)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sealRepositoryIntelligence, REPOSITORY_INTELLIGENCE_VERSION, type RepositoryIntelligenceModel,
} from '../src/repository-intelligence.js';
import {
  sealAutomationIntelligence, AUTOMATION_INTELLIGENCE_VERSION, type AutomationIntelligenceModel,
} from '../src/automation-intelligence.js';

function repo(): RepositoryIntelligenceModel {
  return sealRepositoryIntelligence({
    modelVersion: REPOSITORY_INTELLIGENCE_VERSION,
    existingAssets: [{ assetRef: 'a1', kind: 'component', fingerprint: 'fp1' }],
    coverage: [{ subjectRef: 'r1', covered: true, score: 1 }],
    similarity: [{ assetRef: 'a1', candidateRef: 'a2', score: 0.8 }],
    duplicateCandidates: ['a2'],
    reuseCandidates: ['a1'],
    missingAssets: ['a3'],
    confidence: 0.9,
    traceability: [{ from: 'r1', to: 'a1' }],
    metadata: [{ key: 'source', value: 'reference' }],
    recommendations: [{ subjectRef: 'a1', disposition: 'reuse-candidate', rationale: 'high similarity' }],
  });
}

function auto(): AutomationIntelligenceModel {
  return sealAutomationIntelligence({
    modelVersion: AUTOMATION_INTELLIGENCE_VERSION,
    automationIntent: ['cover-r1'],
    candidateAssets: [{ candidateRef: 'a1', kind: 'component' }],
    reuseOpportunities: ['a1'],
    generationCandidates: ['a3'],
    validationStatus: 'pending',
    materializationPlan: ['materialise-a3'],
    registrationPlan: ['register-a3'],
    executionReadiness: 'not-ready',
    confidence: 0.75,
    traceability: [{ from: 'r1', to: 'a3' }],
  });
}

test('Wave 4 — the Repository Intelligence model is immutable and consumable', () => {
  const m = repo();
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.existingAssets));
  assert.throws(() => { (m as unknown as { confidence: number }).confidence = 0; });
  assert.throws(() => { (m.existingAssets[0] as unknown as { kind: string }).kind = 'x'; });
  // Consume (read) fields — descriptive only, no decision taken here.
  assert.equal(m.reuseCandidates.length, 1);
  assert.equal(m.recommendations[0]?.disposition, 'reuse-candidate');
});

test('Wave 4 — the Automation Intelligence model is immutable and consumable', () => {
  const m = auto();
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.candidateAssets));
  assert.throws(() => { (m as unknown as { executionReadiness: string }).executionReadiness = 'ready'; });
  assert.equal(m.validationStatus, 'pending');
  assert.equal(m.generationCandidates.length, 1);
});

test('Wave 4 — the two models are distinct canonical definitions', () => {
  assert.notEqual(REPOSITORY_INTELLIGENCE_VERSION, undefined);
  assert.notEqual(AUTOMATION_INTELLIGENCE_VERSION, undefined);
  // Consuming both together carries no capability-specific coupling.
  const r = repo();
  const a = auto();
  assert.equal(r.modelVersion, '1.0.0');
  assert.equal(a.modelVersion, '1.0.0');
});
