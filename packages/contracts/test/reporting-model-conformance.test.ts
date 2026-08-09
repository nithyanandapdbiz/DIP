/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 5 Reporting model.
 *
 * A minimal reference consumer of the canonical Reporting model. It constructs a
 * report, seals it, validates immutability, and validates that evidence is carried
 * by reference only. No rendering, no business logic, no connector logic, no
 * Functional-Testing logic.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-REPORT-MODEL · references-only (G-10) · immutable (G-8)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvidenceReference, type EvidenceReference } from '../src/evidence.js';
import {
  sealReportingModel, REPORTING_MODEL_VERSION, type ReportingModel,
} from '../src/reporting-model.js';

function evidenceRef(): EvidenceReference {
  return parseEvidenceReference({
    contractVersion: '1.0.0',
    evidenceId: 'ev-ref',
    packageHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.execution-package@1', value: '2'.repeat(64) },
    contentHash: { algorithm: 'sha256-jcs-v1', domain: 'dbiz.evidence-record@1', value: '3'.repeat(64) },
    classification: 'C1',
    capturedAt: '2026-07-22T10:30:00Z',
    expiresAt: '2027-07-22T10:30:00Z',
    assuranceState: 'CERTIFIED',
    outcome: 'captured',
  });
}

function report(): ReportingModel {
  const section = [{ label: 'metric', value: '1' }];
  return sealReportingModel({
    modelVersion: REPORTING_MODEL_VERSION,
    executionSummary: section,
    capabilitySummary: section,
    certificationSummary: { verdict: 'NOT CERTIFIED', describedBy: 'platform-certification-framework', criteria: ['C-1'] },
    governanceSummary: section,
    securitySummary: section,
    riskSummary: section,
    coverageSummary: section,
    evidenceReferences: [evidenceRef()],
    traceabilitySummary: section,
    repositoryIntelligenceSummary: section,
    automationIntelligenceSummary: section,
    decisionSummary: section,
    observabilitySummary: section,
    metadata: [{ label: 'source', value: 'reference' }],
    versionInformation: { modelVersion: REPORTING_MODEL_VERSION, contractVersions: [{ label: 'evidence', value: '1.0.0' }] },
  });
}

test('Wave 5 — the Reporting model is immutable', () => {
  const r = report();
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.evidenceReferences) && Object.isFrozen(r.executionSummary));
  assert.throws(() => { (r as unknown as { modelVersion: string }).modelVersion = 'x'; });
  assert.throws(() => { (r.executionSummary as unknown as { push: (e: { label: string; value: string }) => number }).push({ label: 'z', value: 'z' }); });
});

test('Wave 5 — evidence is carried by reference only (hash + metadata, no payload)', () => {
  const r = report();
  assert.equal(r.evidenceReferences.length, 1);
  const ref = r.evidenceReferences[0];
  assert.ok(ref && ref.contentHash && ref.contentHash.value.length === 64, 'a reference carries a content hash');
  // No payload/content field is present on the reference.
  assert.equal(('content' in (ref as object)), false);
  assert.equal(('payload' in (ref as object)), false);
});

test('Wave 5 — the model describes certification, it does not perform it', () => {
  const r = report();
  assert.equal(r.certificationSummary.verdict, 'NOT CERTIFIED');
  assert.equal(typeof r.certificationSummary.describedBy, 'string');
  assert.equal(r.metadata[0]?.value, 'reference');
});
