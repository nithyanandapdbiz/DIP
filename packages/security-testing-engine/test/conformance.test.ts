/**
 * Conformance tests for the Security Testing Engine (capability 5).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 12-capability-orchestration.md · 08-security-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.11 · C-11.13 · C-13.1 · C-14.1
 *
 * These prove each property in isolation; the standalone harness proves the whole capability
 * end to end, twice, and compares. The property that most distinguishes capability 5 from
 * capability 6 is verified here: an intrusive/exploitation request is refused at the guardrail
 * stage, before any checker runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, GOVERNANCE_TRIAD, CapabilityRegistry, STAGE_PLANE, isSealed, valueOf, certify,
} from '@dbiz/capability-framework';
import {
  buildCatalogue, securityTestingCapability, buildSecurityTestingOrchestrator,
  SecurityAdapterRegistry, azureDevOpsSecurityAdapter, securityHubAdapter, resetAdapterSequence,
  type EngineDependencies, type ObservedResource, type SecurityReport, type SecurityScope,
  type SecurityIntelligenceReport, type SecurityIntelligenceContribution,
} from '../src/index.js';

/** The reflection/reporting stage value carries the intelligence report and contribution. */
type IntelState = { intelligenceReport: SecurityIntelligenceReport; contribution: SecurityIntelligenceContribution };

const OBSERVED: readonly ObservedResource[] = [
  { kind: 'header-set', id: 'h1', label: 'root', path: '/', parentId: null, values: { 'content-security-policy': '', 'strict-transport-security': '', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' } },
  { kind: 'cookie', id: 'c1', label: 'SESSIONID', path: '/', parentId: null, values: { secure: 'false', httponly: 'false', samesite: '' } },
  { kind: 'tls-config', id: 't1', label: 'tls', path: '/', parentId: null, values: { version: 'TLS1.0', ciphers: 'RC4', expired: 'false', selfsigned: 'true' } },
  { kind: 'dependency', id: 'd1', label: 'lodash', path: 'package.json', parentId: null, values: { name: 'lodash', version: '4.17.11', cve: 'CVE-2019-10744', severity: 'high' } },
  { kind: 'secret-surface', id: 's1', label: 'config', path: 'app.config', parentId: null, values: { secret: 'AKIAEXAMPLE' } },
  { kind: 'auth-config', id: 'a1', label: 'auth', path: '/auth', parentId: null, values: { mfa: 'false', lockout: 'false', rbac: 'false', rotation: 'false', timeoutMinutes: '900' } },
  { kind: 'k8s-manifest', id: 'k1', label: 'pod', path: 'deploy.yaml', parentId: null, values: { privileged: 'true' } },
  { kind: 'cloud-resource', id: 'cl1', label: 'bucket', path: 's3://x', parentId: null, values: { publicAccess: 'true', encrypted: 'false' } },
  { kind: 'ai-config', id: 'ai1', label: 'llm', path: 'ai.yaml', parentId: null, values: { promptInjectionGuard: 'false', outputFilter: 'false' } },
];

const deps = (over: Partial<EngineDependencies> = {}): EngineDependencies => ({
  observe: (_s, inScope) => OBSERVED.filter((r) => inScope(r.path)),
  environmentReachable: true,
  ...over,
});

const SCOPE: SecurityScope = { targetId: 'shop', allowedHosts: ['https://shop.example'], asvsLevel: 3, requestedCategories: [], complianceTargets: ['OWASP-TOP10', 'PCI-DSS'], authorizationReference: 'AUTH-1', environment: 'staging', readOnly: true };

function config(provider: string, ai: boolean, over: Record<string, string> = {}): Record<string, string> {
  return {
    'sectest.aiEnabled': String(ai), 'sectest.targetId': 'shop', 'sectest.allowedHosts': 'https://shop.example',
    'sectest.asvsLevel': '3', 'sectest.authorizationReference': 'AUTH-1', 'sectest.environment': 'staging',
    'sectest.readOnly': 'true', 'sectest.compliance': 'OWASP-TOP10,PCI-DSS', 'security.provider': provider, ...over,
  };
}

function execute(provider: string, ai: boolean, over: Record<string, string> = {}, d: EngineDependencies = deps()) {
  resetAdapterSequence();
  const registry = new SecurityAdapterRegistry();
  registry.register(azureDevOpsSecurityAdapter().adapter);
  registry.register(securityHubAdapter().adapter);
  const orch = buildSecurityTestingOrchestrator(d, registry);
  return orch.execute({ tenantId: 't', runId: `r-${provider}-${ai}-${Object.keys(over).join('')}`, correlationId: 'c', scope: SCOPE, configuration: config(provider, ai, over) });
}

test('P-1 the capability registers with all twelve stage implementations', () => {
  const reg = new CapabilityRegistry();
  const cap = securityTestingCapability(deps(), {
    reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
    recorder: { context: (b) => ({ ...b, proposal: null }), invoked: () => [] },
    adapter: azureDevOpsSecurityAdapter().adapter,
  });
  assert.doesNotThrow(() => reg.register(cap));
  assert.equal(Object.keys(cap.stages).length, STAGES.length);
});

test('P-2 a run traverses all twelve stages, in order', () => {
  const run = execute('azure-devops', true).run;
  assert.equal(run.failedAt, null, run.failure ?? '');
  assert.deepEqual([...run.completed], [...STAGES]);
});

test('P-3 the governance triad is traversed and certification refuses a run without it', () => {
  const run = execute('azure-devops', true).run;
  assert.ok(GOVERNANCE_TRIAD.every((s) => run.results.has(s)));
  const without = new Map([...run.results]);
  without.delete('policy-review');
  assert.equal(certify(without).certified, false);
});

test('P-4 a hand-written stage result is not sealed', () => {
  const forged = { stage: 'certification', value: {}, applicable: true, notApplicableReason: null, agentsInvoked: [] };
  assert.equal(isSealed(forged), false);
});

test('P-5 two providers produce an identical stage sequence', () => {
  const ado = execute('azure-devops', true);
  const hub = execute('security-hub', true);
  assert.deepEqual([...ado.run.completed], [...hub.run.completed]);
  assert.notEqual(ado.adapter, hub.adapter);
});

test('P-6 the agent catalogue is complete and every stage plane matches', () => {
  const catalogue = buildCatalogue();
  const gov = catalogue.byDomain('governance').length;
  assert.equal(gov, 36);
  assert.ok(catalogue.all.length - gov >= 100, `expected >= 100 domain agents, got ${catalogue.all.length - gov}`);
  const misplaced = catalogue.all.filter((a) => {
    if (a.domain === 'governance') return false;
    const plane = STAGE_PLANE[a.stage];
    return (plane === 'EP' && a.plane !== 'EP') || (plane === 'IP' && a.plane !== 'IP');
  });
  assert.deepEqual(misplaced.map((a) => a.id), []);
});

test('P-7 the engine completes with NO reasoning proposals (INV-7)', () => {
  const noai = execute('azure-devops', false);
  assert.equal(noai.run.failedAt, null, noai.run.failure ?? '');
  assert.equal(noai.reasoning.delivered.length, 0);
  const report = (valueOf(noai.run.results.get('reporting')!) as { report: SecurityReport | null }).report;
  assert.ok(report && report.scores.securityScore >= 0);
});

test('P-8 an intrusive category is refused at the guardrail stage, before any checker runs', () => {
  const intrusive = execute('azure-devops', true, { 'sectest.categories': 'sql-injection,xss' });
  assert.equal(intrusive.run.failedAt, 'guardrail-review');
  assert.ok(!intrusive.run.completed.includes('execution'));
});

test('P-9 a non-read-only run is refused at the guardrail stage', () => {
  const mutating = execute('azure-devops', true, { 'sectest.readOnly': 'false', 'sectest.environment': 'production' });
  assert.equal(mutating.run.failedAt, 'guardrail-review');
});

test('P-10 verification produces findings, evidence references and compliance mapping', () => {
  const run = execute('azure-devops', true);
  const report = (valueOf(run.run.results.get('reporting')!) as { report: SecurityReport | null }).report!;
  const totalFindings = Object.values(report.findingCounts).reduce((s, n) => s + n, 0);
  assert.ok(totalFindings > 0, 'expected findings from the seeded weaknesses');
  assert.ok(report.compliance.length >= 12, 'expected compliance mapping across frameworks');
  assert.ok(report.scores.securityScore <= 100 && report.scores.securityScore >= 0);
});

test('P-11 evidence crosses as a reference only — no content field on the crossing types', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'model.ts'), 'utf8');
  const ev = /export interface EvidenceReference \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
  assert.ok(ev.length > 0 && !/\bcontent\b|\bbody\b|\bpayload\b|\bsnippet\b/.test(ev));
  const weak = /export interface Weakness \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
  assert.ok(weak.length > 0 && !/\bsnippet\b|\bbody\b|evidenceSnippet/.test(weak));
});

test('P-12 the Security Intelligence Layer produces a knowledge graph, correlated risks, certification and a contribution', () => {
  const run = execute('azure-devops', true).run;
  const s = valueOf(run.results.get('reporting')!) as IntelState;
  assert.ok(s.intelligenceReport, 'an intelligence report is produced');
  assert.ok(s.intelligenceReport.graph.nodeCount > 0 && s.intelligenceReport.graph.edgeCount > 0, 'the knowledge graph has correlated nodes and edges');
  assert.ok(s.intelligenceReport.risks.length > 0, 'isolated findings were correlated into enterprise risks');
  assert.ok(['CERTIFIED', 'PROVISIONAL', 'NOT-CERTIFIED'].includes(s.intelligenceReport.certification.status));
  assert.ok(s.intelligenceReport.certification.maturityLevel >= 1 && s.intelligenceReport.certification.maturityLevel <= 5);
  assert.ok(s.intelligenceReport.developer.length > 0, 'developer intelligence produced per finding');
});

test('P-13 the contribution is security-only and does NOT aggregate other capabilities (Platform-Intelligence boundary, ADR-0029)', () => {
  const run = execute('azure-devops', true).run;
  const s = valueOf(run.results.get('reporting')!) as IntelState;
  assert.equal(s.contribution.capability, 'security-testing');
  assert.equal(s.contribution.aggregatesOtherCapabilities, false);
  assert.ok(typeof s.contribution.securityRiskScore === 'number');
});

test('P-14 the intelligence layer runs fully with reasoning disabled (INV-7 preserved end to end)', () => {
  const noai = execute('azure-devops', false);
  assert.equal(noai.run.failedAt, null, noai.run.failure ?? '');
  assert.equal(noai.reasoning.delivered.length, 0);
  const s = valueOf(noai.run.results.get('reporting')!) as IntelState;
  assert.ok(s.intelligenceReport.graph.nodeCount > 0);
  assert.ok(s.intelligenceReport.risks.length > 0);
  assert.ok(s.intelligenceReport.contribution.certificationStatus.length > 0);
});
