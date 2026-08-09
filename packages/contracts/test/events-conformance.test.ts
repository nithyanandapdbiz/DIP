/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 6 Platform Event & Observability.
 *
 * A minimal reference consumer of the PlatformEvent and Observability contracts.
 * It constructs each, seals it, validates immutability, and validates that they
 * carry references only (observational). No messaging, no queues, no telemetry
 * implementation, no business logic.
 *
 * TRACEABILITY
 *   Architecture : 16-runtime-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-EVENTS · observational-only (G-9) · immutable (G-8)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvidenceReference, type EvidenceReference } from '../src/evidence.js';
import {
  sealPlatformEvent, PLATFORM_EVENT_VERSION, type PlatformEvent,
  sealObservabilityModel, OBSERVABILITY_MODEL_VERSION, type ObservabilityModel,
} from '../src/events.js';

function evidenceRef(): EvidenceReference {
  return parseEvidenceReference({
    contractVersion: '1.0.0', evidenceId: 'ev-ref',
    packageHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: '2'.repeat(64) },
    contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.evidence-record@1', value: '3'.repeat(64) },
    classification: 'C1', capturedAt: '2026-07-22T10:30:00Z', expiresAt: '2027-07-22T10:30:00Z',
    assuranceState: 'CERTIFIED', outcome: 'captured',
  });
}

function event(): PlatformEvent {
  return sealPlatformEvent({
    eventId: 'e1', eventType: 'stage.completed', eventVersion: PLATFORM_EVENT_VERSION,
    timestamp: '2026-07-28T00:00:00Z', correlationId: 'c1', traceId: 'tr1',
    tenantRef: 't1', capabilityRef: 'functional-testing', domainRef: 'reference', stageRef: 'planning',
    severity: 'info', classification: 'C1', source: 'platform',
    metadata: [{ key: 'k', value: 'v' }],
    evidenceReferences: [evidenceRef()],
    decisionReferences: ['decision:e1'], auditReferences: ['audit:e1'],
  });
}

function observability(): ObservabilityModel {
  const obs = [{ at: '2026-07-28T00:00:00Z', kind: 'info', note: 'reference' }];
  return sealObservabilityModel({
    modelVersion: OBSERVABILITY_MODEL_VERSION,
    executionTimeline: obs, domainObservations: obs, connectorObservations: obs, decisionObservations: obs,
    governanceObservations: obs, securityObservations: obs, certificationObservations: obs,
    performanceObservations: obs, auditObservations: obs, traceabilityObservations: obs,
  });
}

test('Wave 6 — the PlatformEvent is immutable and carries references only', () => {
  const e = event();
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.evidenceReferences) && Object.isFrozen(e.metadata));
  assert.throws(() => { (e as unknown as { severity: string }).severity = 'x'; });
  // Observational metadata only — references, no payload.
  assert.equal(e.evidenceReferences.length, 1);
  assert.equal(e.decisionReferences[0], 'decision:e1');
});

test('Wave 6 — the Observability model is immutable and observational', () => {
  const o = observability();
  assert.ok(Object.isFrozen(o) && Object.isFrozen(o.executionTimeline));
  assert.throws(() => { (o as unknown as { modelVersion: string }).modelVersion = 'x'; });
  assert.equal(o.executionTimeline[0]?.kind, 'info');
  assert.equal(o.traceabilityObservations.length, 1);
});

test('Wave 6 — both contracts are consumable together with no execution coupling', () => {
  const e = event();
  const o = observability();
  assert.equal(e.eventVersion, '1.0.0');
  assert.equal(o.modelVersion, '1.0.0');
});
