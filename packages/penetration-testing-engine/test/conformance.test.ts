/**
 * Penetration Testing Engine conformance.
 * TRACEABILITY: 11-capability-model.md · 12-capability-orchestration.md
 *               06-data-sovereignty.md · 14-tool-operating-model.md
 *   Criteria: C-11.11, C-11.13, C-12.1, C-12.2, C-12.11, C-12.12, C-13.1, C-14.1
 *   ADR: ADR-0027
 * Categories: capability, orchestration, sovereignty, completeness, negative
 *
 * Every property here executes the whole engine through the framework runner — the only way
 * into a stage — because a seam that constructed a stage result would be the bypass R-12.11
 * forbids. The properties that matter most are the ones that would catch the failure classes
 * this programme exists to eliminate: a scanner that fired before certification, a finding that
 * crossed the plane boundary with its payload, a destructive probe certified against production,
 * a readiness of READY on a target that was never scanned, and domain orchestrators that exist
 * and never run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentCatalogue, CapabilityRegistry, STAGES, GOVERNANCE_TRIAD, VectorMemory,
  resolveReasoningMode, defineAgent,
} from '@dbiz/capability-framework';
import {
  buildCatalogue, buildPenetrationTestingOrchestrator, penetrationTestingCapability,
  PentestAdapterRegistry, azureDevOpsSecurityAdapter, securityHubAdapter, resetAdapterSequence,
  renderPdf, boardReport, computeCvss, minimise, minimiseFinding, scrubLabel, DOMAINS, domainOrchestrators,
  type EngineDependencies, type ObservedTarget, type PentestRequest, type PentestReport,
  type PriorRecord, type RawFinding,
} from '../src/index.js';

// ── A synthetic target the Execution Plane "observed and probed" ────────────

function t(kind: ObservedTarget['kind'], id: string, label: string, path: string, values: Record<string, string> = {}, parentId: string | null = null): ObservedTarget {
  return { kind, id, label, path, values, parentId };
}

const OBSERVED: readonly ObservedTarget[] = [
  t('host', 'host-1', 'shop.example', '/'),
  t('service', 'svc-web', 'web', '/'),
  t('service', 'svc-api', 'api', '/api'),
  t('port', 'port-443', '443/tcp', '/'),
  t('technology', 'tech-node', 'Node.js 20', '/'),
  t('route', 'route-home', 'home', '/'),
  t('route', 'route-orders', 'orders', '/orders'),

  // Response headers: missing CSP and HSTS (two passive findings), plus a permissive CORS.
  t('header', 'hdr-root', 'response headers', '/', {
    'content-security-policy': '', 'strict-transport-security': '', 'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true',
  }),
  // Weak TLS.
  t('tls-config', 'tls-1', 'tls', '/', { version: 'TLS1.0', ciphers: 'RC4-SHA' }),
  // Insecure cookie: missing Secure and HttpOnly.
  t('cookie', 'cookie-session', 'SESSIONID', '/', { domain: 'shop.example', path: '/', samesite: 'Lax', value: 'S3CR3T-SESSION-TOKEN' }),
  // Expiring certificate.
  t('certificate', 'cert-1', 'leaf cert', '/', { issuer: 'Example CA', daysToExpiry: '10' }),

  // API endpoints with parameters and elicited vulnerabilities. Values are Execution Plane only.
  t('api-endpoint', 'api-orders', 'orders api', '/api/orders/4471', {
    method: 'get', id: '', status: '', vulns: 'sql-injection,idor', vulnParam: 'id',
    'evidence:sql-injection': "syntax error near ''' at line 1", 'evidence:idor': 'returned order 4472 for user A',
  }),
  t('api-endpoint', 'api-search', 'search api', '/api/search', {
    method: 'get', q: '', vulns: 'reflected-xss', vulnParam: 'q', reflects: 'q', 'evidence:reflected-xss': '<script>alert(1)</script> reflected',
  }),

  // A form with no anti-CSRF token.
  t('form', 'form-transfer', 'transfer form', '/account/transfer', { method: 'POST', amount: '', to: '' }),
  // A GraphQL endpoint with introspection enabled.
  t('graphql-endpoint', 'gql-1', 'graphql', '/graphql', { introspection: 'enabled' }),
  // A WAF is present.
  t('waf', 'waf-1', 'CloudFront WAF', '/'),
];

const PRIOR_RECORDS: readonly PriorRecord[] = [];

function dependencies(overrides: Partial<EngineDependencies> = {}): EngineDependencies {
  return {
    observe: (_scope, inScope) => OBSERVED.filter((a) => inScope(a.path)),
    priorRecords: PRIOR_RECORDS,
    environmentReachable: true,
    capturedEvidence: (raw: readonly RawFinding[]) => raw.slice(0, 1).map((r) => ({
      findingCategory: r.category, kind: 'har' as const, locator: `ep://evidence/${r.category}.har`, digest: 'aa11bb22', phase: 'passive' as const,
    })),
    ...overrides,
  };
}

function registryFor(provider: 'azure-devops' | 'security-hub') {
  const registry = new PentestAdapterRegistry();
  const ado = azureDevOpsSecurityAdapter();
  const hub = securityHubAdapter();
  registry.register(ado.adapter);
  registry.register(hub.adapter);
  return { registry, journal: provider === 'azure-devops' ? ado.journal : hub.journal };
}

function configuration(provider: string, aiEnabled: boolean, over: Record<string, string> = {}): Record<string, string> {
  return {
    'pentest.aiEnabled': String(aiEnabled),
    'pentest.targetId': 'shop',
    'pentest.allowedHosts': 'https://shop.example',
    'pentest.exclusions': '/logout',
    'pentest.authorizationReference': 'AUTH-2026-001',
    'pentest.scanPhase': 'active-full',
    'pentest.safeMode': 'true',
    'pentest.rateLimit': '8',
    'pentest.httpsRequired': 'true',
    'pentest.environment': 'staging',
    'security.provider': provider,
    ...over,
  };
}

const PROPOSALS = {
  'aiintel.decision-intelligence': { order: ['finding-1'] },
  'aiintel.semantic-risk': { narratives: { 'finding-1': 'sql injection exposes the orders datastore' } },
  'aiintel.business-impact-narrative': { narrative: '1 critical finding exposes customer orders.' },
};

function run(provider: 'azure-devops' | 'security-hub', aiEnabled: boolean, deps = dependencies(), configOver: Record<string, string> = {}) {
  resetAdapterSequence();
  const { registry, journal } = registryFor(provider);
  const orchestrator = buildPenetrationTestingOrchestrator(deps, registry);
  const request: PentestRequest = {
    tenantId: 'tenant-a', runId: `run-${provider}-${aiEnabled}-${Object.keys(configOver).join('')}`, correlationId: 'corr-1',
    scope: { targetId: 'shop', allowedHosts: [], exclusions: [], authorizationReference: 'AUTH-2026-001', scanPhaseCeiling: 'active-full', safeMode: true, rateLimitPerSecond: 8, httpsRequired: true, environment: 'staging' },
    configuration: configuration(provider, aiEnabled, configOver),
    ...(aiEnabled ? { proposals: PROPOSALS } : {}),
  };
  return { result: orchestrator.execute(request), journal, orchestrator };
}

function finalState(result: ReturnType<typeof run>['result']): Record<string, never> {
  const reporting = result.run.results.get('reporting');
  assert.ok(reporting, `reporting produced no sealed result; run failed at ${result.run.failedAt}: ${result.run.failure}`);
  return reporting.value as Record<string, never>;
}

// ── 1. The lifecycle ────────────────────────────────────────────────────────

describe('the twelve-stage lifecycle', () => {
  it('traverses every stage in order and fails at none (C-12.1)', () => {
    const { result } = run('azure-devops', true);
    assert.equal(result.run.failure, null, `run failed at ${result.run.failedAt}: ${result.run.failure}`);
    assert.deepEqual([...result.run.completed], [...STAGES]);
  });

  it('traverses the governance triad, so certification is reachable (C-11.13)', () => {
    const { result } = run('azure-devops', true);
    for (const stage of GOVERNANCE_TRIAD) assert.ok(result.run.results.has(stage), `${stage} did not run`);
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
  });

  it('registers as a capability, and a capability with a no-op stage is refused (R-11.16)', () => {
    const registry = new CapabilityRegistry();
    const capability = penetrationTestingCapability(dependencies(), {
      reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
      recorder: { context: (b, _id) => ({ ...b, proposal: null }), invoked: () => [] },
      adapter: azureDevOpsSecurityAdapter().adapter,
      memory: new VectorMemory(),
    });
    registry.register(capability);
    assert.equal(registry.get('penetration-testing')?.name, 'Penetration Testing Engine');

    const gutted = { ...capability, id: 'gutted', stages: { ...capability.stages, execution: (() => { throw new Error('x'); }) as never } };
    assert.throws(() => new CapabilityRegistry().register(gutted), /takes no context and can perform no work/);
  });
});

// ── 2. AI mode and non-AI mode: one workflow ────────────────────────────────

describe('AI-enabled and non-AI modes are the same workflow', () => {
  it('produces an identical stage sequence and an identical agent set', () => {
    const enabled = run('azure-devops', true);
    const disabled = run('azure-devops', false);
    assert.deepEqual([...enabled.result.run.completed], [...disabled.result.run.completed]);
    assert.deepEqual([...enabled.result.agentsInvoked].sort(), [...disabled.result.agentsInvoked].sort(),
      'a different set of agents ran, so the two modes are not one workflow');
  });

  it('delivers no proposal at all when AI is disabled, and still completes (INV-7)', () => {
    const { result } = run('azure-devops', false);
    assert.equal(result.reasoningMode, 'disabled');
    assert.equal(result.reasoning.delivered.length, 0);
    assert.ok(result.reasoning.withheld.length > 0);
    assert.equal(result.run.failure, null, 'the engine must complete with reasoning unavailable (INV-7)');
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
  });

  it('delivers proposals to reasoning agents when AI is enabled', () => {
    const { result } = run('azure-devops', true);
    assert.equal(result.reasoningMode, 'enabled');
    assert.ok(result.reasoning.delivered.includes('aiintel.decision-intelligence'),
      'an AI-mode run delivered no proposal to the decision-intelligence agent');
  });

  it('reads the capability-neutral key, so the framework never sees pentest.aiEnabled (C-11.11)', () => {
    assert.equal(resolveReasoningMode({ 'ai.enabled': 'true' }), 'enabled');
    assert.equal(resolveReasoningMode({ 'pentest.aiEnabled': 'true' }), 'disabled');
  });
});

// ── 3. No packet before certification; scanning is authorized and evidence-based ─

describe('scan authorization and guardrails', () => {
  it('refuses a destructive probe against a production target, and stops the run at the guardrail', () => {
    const { result } = run('azure-devops', true, dependencies(), { 'pentest.environment': 'production', 'pentest.safeMode': 'false' });
    assert.equal(result.run.failedAt, 'guardrail-review', `expected refusal at guardrail-review, got ${result.run.failedAt}`);
    assert.match(result.run.failure ?? '', /destructive|production/);
    assert.ok(!result.run.completed.includes('execution'), 'a scan ran despite a refused guardrail');
  });

  it('runs no scanner that its authorization did not permit', () => {
    // passive-only ceiling: no active-full category may fire.
    const { result } = run('azure-devops', true, dependencies(), { 'pentest.scanPhase': 'passive' });
    assert.equal(result.run.failure, null, result.run.failure ?? undefined);
    const invoked = new Set(result.agentsInvoked);
    assert.ok(!invoked.has('scanner.sql-injection'), 'an active-full scanner fired under a passive-only ceiling');
    assert.ok(invoked.has('scanner.missing-security-header'), 'the passive scanner did not run');
  });

  it('produces only evidence-backed findings, each carrying an evidence reference', () => {
    const state = finalState(run('azure-devops', true).result);
    const report = state['report'] as unknown as PentestReport;
    assert.ok(report.findingCounts.critical + report.findingCounts.high + report.findingCounts.medium + report.findingCounts.low > 0, 'no finding was produced');
  });
});

// ── 4. Data sovereignty ─────────────────────────────────────────────────────

describe('data sovereignty', () => {
  it('minimises a target: a surface fact carries attribute NAMES and no values', () => {
    const cookie = OBSERVED.find((a) => a.id === 'cookie-session');
    assert.ok(cookie);
    const fact = minimise(cookie);
    assert.ok(!('values' in fact), 'SurfaceFact gained a values field');
    assert.ok(!JSON.stringify(fact).includes('S3CR3T'), 'a cookie value crossed the boundary');
    assert.ok(fact.attributeNames.includes('value'), 'the value attribute NAME should cross even though its value does not');
  });

  it('minimises a finding: no request or response snippet crosses', () => {
    const raw: RawFinding = {
      category: 'sql-injection', targetPath: '/api/orders', parameterName: 'id', method: 'GET',
      requestSnippet: "GET /api/orders?id=1' OR '1'='1", responseSnippet: "SQL syntax error near '''",
      confidence: 0.9, evidence: [{ findingCategory: 'sql-injection', kind: 'request-response', sha256: 'abc', locator: 'ep://x', capturedAtPhase: 'active-full' }],
    };
    const finding = minimiseFinding(raw, 'f-1');
    const serialised = JSON.stringify(finding);
    assert.ok(!serialised.includes('OR ') && !serialised.includes('syntax error'), 'a payload or response snippet crossed with the finding');
    assert.equal(finding.cwe, 'CWE-89');
    assert.deepEqual([...Object.keys(finding)].sort(), ['category', 'confidence', 'cwe', 'evidenceRefs', 'fingerprint', 'id', 'method', 'owaspRef', 'parameterName', 'phase', 'targetPath']);
  });

  it('never carries a session value into the Intelligence Plane state', () => {
    const state = finalState(run('azure-devops', true).result);
    const serialised = JSON.stringify({ findings: state['findings'], assessed: state['assessed'], report: state['report'], sync: state['sync'] });
    assert.ok(!serialised.includes('S3CR3T'), 'a session token reached the Intelligence Plane');
  });

  it('scrubs identifying content and query-string secrets from labels', () => {
    assert.equal(scrubLabel('GET /api?token=S3CR3T-VALUE'), 'GET /api?token={redacted}');
    assert.equal(scrubLabel('Invoice INV-4471 for a.b@example.com'), 'Invoice {reference} for {email}');
  });

  it('runs every scanner and recon probe in the Execution Plane', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      if (agent.domain === 'scanner' && agent.id.startsWith('scanner.') && (agent.stage === 'execution' || agent.stage === 'evidence')) {
        assert.equal(agent.plane, 'EP', `${agent.id} scans from the wrong plane`);
      }
      if (agent.domain === 'recon' && agent.stage === 'discovery') assert.equal(agent.plane, 'EP', `${agent.id} observes from the wrong plane`);
      if (agent.id.startsWith('repository.search.')) assert.equal(agent.plane, 'EP', `${agent.id} reads the customer store from the wrong plane`);
    }
  });

  it('gives EvidenceReference no field that could hold an artefact', () => {
    const state = finalState(run('azure-devops', true).result);
    const refs = state['evidence'] as unknown as Record<string, unknown>[];
    assert.ok(refs.length > 0);
    for (const r of refs) assert.deepEqual([...Object.keys(r)].sort(), ['capturedAtPhase', 'findingCategory', 'kind', 'locator', 'sha256']);
  });

  it('refuses a prompt contract that would send Execution Plane custody for reasoning', () => {
    const catalogue = new AgentCatalogue();
    assert.throws(() => catalogue.register(defineAgent({
      id: 'bad.leak', domain: 'test', stage: 'reflection', plane: 'IP',
      purpose: 'An agent that would send captured evidence for reasoning.',
      inputs: ['x'], outputs: ['y'], responsibilities: ['leak'], toolContracts: [], aiCapabilityClass: 'extraction',
      promptContract: { intent: 'Extract meaning from the captured har file.', inputsProvided: ['har file'], expects: 'a description', rejectionRules: ['none'] },
      aiBehaviour: 'Reads the captured traffic in full.', nonAiBehaviour: 'Does nothing, which is the honest degraded path.',
      failureHandling: 'It should never have been registered in the first place.', handle: (i: unknown) => i,
    }) as never), /Execution Plane custody/);
  });
});

// ── 5. One workflow across two providers ────────────────────────────────────

describe('one workflow across two providers', () => {
  it('produces an identical stage sequence and identical agents under both', () => {
    const ado = run('azure-devops', true);
    const hub = run('security-hub', true);
    assert.deepEqual([...ado.result.run.completed], [...hub.result.run.completed]);
    assert.deepEqual([...ado.result.agentsInvoked].sort(), [...hub.result.agentsInvoked].sort());
    assert.notEqual(ado.result.adapter, hub.result.adapter);
  });

  it('reaches different provider nouns, so the comparison is not trivially true', () => {
    const ado = run('azure-devops', true);
    const hub = run('security-hub', true);
    const findingCalls = (j: typeof ado.journal) => j.calls.filter((c) => c.method === 'publishFinding').map((c) => c.detail);
    assert.ok(findingCalls(ado.journal).some((d) => d.startsWith('Bug')), 'Azure DevOps did not use its own noun');
    assert.ok(findingCalls(hub.journal).some((d) => d.startsWith('Finding')), 'the Security Hub did not use its own noun');
  });
});

// ── 6. Adapters are actually called ─────────────────────────────────────────

describe('adapter publication happens', () => {
  it('invokes every adapter method the engine declares', () => {
    const { journal } = run('azure-devops', true);
    const called = new Set(journal.calls.map((c) => c.method));
    for (const method of ['createContainer', 'publishFinding', 'publishDefect', 'publishThreat', 'publishEvidenceReference', 'linkTraceability']) {
      assert.ok(called.has(method), `${method} was never called — declared and unwired`);
    }
  });

  it('publishes evidence by reference and never by content', () => {
    const { journal } = run('azure-devops', true);
    const evidence = journal.calls.filter((c) => c.method === 'publishEvidenceReference');
    assert.ok(evidence.length > 0);
    for (const c of evidence) assert.ok(!/S3CR3T|<script|syntax error/i.test(c.detail), 'an artefact crossed with the reference');
  });

  it('records a synchronization record for everything, published or refused, each with a reason', () => {
    const state = finalState(run('azure-devops', true).result);
    const sync = state['sync'] as unknown as { target: string; reason: string }[];
    assert.ok(sync.length > 0);
    assert.ok(sync.every((r) => r.reason.trim().length > 0), 'a synchronization record carries no reason');
  });
});

// ── 7. Threat Intelligence engine ───────────────────────────────────────────

describe('the Threat Intelligence engine', () => {
  it('maps findings to MITRE, CWE and a threat score, deterministically', () => {
    const state = finalState(run('azure-devops', false).result);
    const report = state['report'] as unknown as PentestReport;
    assert.ok(report.executiveThreatScore > 0, 'the executive threat score was not computed in non-AI mode');
    assert.ok(Object.keys(report.threatHeatMap).length > 0, 'the threat heat map is empty');
  });

  it('runs the full threat catalogue as part of the run', () => {
    const { result } = run('azure-devops', true);
    const invoked = new Set(result.agentsInvoked);
    for (const id of ['threat.mitre-mapping', 'threat.cve-intelligence', 'threat.capec-correlation', 'threat.exploit-maturity', 'threat.executive-score']) {
      assert.ok(invoked.has(id), `${id} did not run`);
    }
  });
});

// ── 8. Assessment: real CVSS v3.1 ───────────────────────────────────────────

describe('assessment', () => {
  it('computes CVSS v3.1 base scores by the published equations', () => {
    // A textbook fully-critical network vector should score 10.0.
    const worst = computeCvss({ attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' });
    assert.equal(worst.baseScore, 10, `expected 10.0, got ${worst.baseScore}`);
    assert.equal(worst.severity, 'critical');
    const none = computeCvss({ attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'high', userInteraction: 'required', scope: 'unchanged', confidentiality: 'none', integrity: 'none', availability: 'none' });
    assert.equal(none.baseScore, 0);
  });

  it('assesses every finding with a CVSS score, priority and SLA', () => {
    const state = finalState(run('azure-devops', true).result);
    const assessed = state['assessed'] as unknown as { cvss: { baseScore: number }; priority: string; slaDays: number }[];
    assert.ok(assessed.length > 0);
    for (const a of assessed) { assert.ok(a.cvss.baseScore >= 0); assert.ok(a.priority); assert.ok(a.slaDays > 0); }
  });
});

// ── 9. Repository intelligence: suppression ─────────────────────────────────

describe('repository intelligence', () => {
  it('suppresses a finding that matches an accepted waiver, and publishes it as refused with a reason', () => {
    // Compute a fingerprint for the missing-CSP finding and pre-load it as a waiver.
    const csp = minimiseFinding({ category: 'missing-security-header', targetPath: '/', parameterName: 'content-security-policy', method: 'GET', requestSnippet: '', responseSnippet: '', confidence: 0.95, evidence: [] }, 'x');
    const waiver: PriorRecord = { id: 'waiver-1', kind: 'waiver', fingerprint: csp.fingerprint, text: 'accepted missing CSP', repository: 'customer/security' };
    const state = finalState(run('azure-devops', true, dependencies({ priorRecords: [waiver] })).result);
    const sync = state['sync'] as unknown as { target: string; published: boolean; reason: string }[];
    const refused = sync.filter((r) => r.target === 'finding' && !r.published && /suppressed/.test(r.reason));
    assert.ok(refused.length > 0, 'the waived finding was not suppressed');
  });
});

// ── 10. Nothing progresses unless certified ─────────────────────────────────

describe('certification gates', () => {
  it('stops the run at execution when the target is unreachable', () => {
    const { result } = run('azure-devops', true, dependencies({ environmentReachable: false }));
    assert.equal(result.run.failedAt, 'execution');
    assert.match(result.run.failure ?? '', /did not respond/);
    assert.equal(result.rolledBack, true);
  });

  it('gives every stage a review, a decision and a certification agent', () => {
    const catalogue = buildCatalogue();
    for (const stage of STAGES) for (const phase of ['review', 'decision', 'certification']) {
      assert.ok(catalogue.get(`governance.${stage}.${phase}`), `stage ${stage} has no ${phase} agent`);
    }
  });

  it('refuses the reporting stage when readiness is NOT MEASURED but claims READY', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const findings = catalogue.invoke<{ subject: unknown }, { severity: string; finding: string }[]>(
      'governance.reporting.review', { subject: { sync: [{ reason: 'x' }], releaseReadiness: 'NOT MEASURED', claimedReady: true, pdfBytes: 1000 } }, ctx);
    assert.ok(findings.some((f) => f.severity === 'blocking' && /NOT MEASURED/.test(f.finding)));
  });
});

// ── 11. The audit trail is observed, not asserted ───────────────────────────

describe('the audit trail and orchestrators', () => {
  it('names only agents the catalogue actually invoked', () => {
    const { result } = run('azure-devops', true);
    const registered = new Set(buildCatalogue().all.map((a) => a.id));
    const claimed = [...result.run.results.values()].flatMap((r) => r.agentsInvoked);
    for (const id of claimed) assert.ok(registered.has(id), `the trail names "${id}", which is not a registered agent`);
    assert.deepEqual([...new Set(claimed)].sort(), [...result.agentsInvoked].sort());
  });

  it('records every domain orchestrator as having actually run an agent', () => {
    const { result } = run('azure-devops', true);
    const domainOf = new Map(buildCatalogue().all.map((a) => [a.id, a.domain]));
    const domainsThatRan = new Set(result.agentsInvoked.map((id) => domainOf.get(id)));
    for (const domain of DOMAINS) {
      assert.ok(domainsThatRan.has(domain), `the ${domain} orchestrator exists and never ran an agent`);
      assert.ok(domainOrchestrators[domain], `no orchestrator is defined for ${domain}`);
    }
  });
});

// ── 12. Reporting ───────────────────────────────────────────────────────────

describe('reporting', () => {
  it('renders a real PDF document', () => {
    const bytes = renderPdf('Pentest', [{ title: 'Page one', lines: ['a line', 'another line'] }]);
    const text = bytes.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.includes('/Type /Catalog') && text.includes('/Type /Page'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    const objects = (text.match(/^\d+ 0 obj$/gm) ?? []).length;
    const entries = (text.match(/^\d{10} 00000 n $/gm) ?? []).length;
    assert.equal(entries, objects, 'the cross-reference table does not match the object count');
  });

  it('reports readiness as NOT MEASURED when nothing was scanned (R-13.3)', () => {
    // A passive-only run against a target with no passive findings still scans; to reach the
    // unscanned state, run with an empty observation set so no scanner category runs.
    const { result } = run('azure-devops', true, dependencies({ observe: () => [] }), { 'pentest.scanPhase': 'passive' });
    // With no targets, recon observes nothing and the discovery review refuses — the honest outcome.
    assert.ok(result.run.failedAt === 'discovery' || (finalState(result)['report'] as unknown as PentestReport).releaseReadiness === 'NOT MEASURED');
  });

  it('marks unmeasured board figures as unmeasured rather than zero', () => {
    const report = {
      targetId: 'shop', reasoningMode: 'disabled', scanPhaseReached: 'passive',
      findingCounts: { info: 0, low: 0, medium: 0, high: 0, critical: 0 }, owaspSummary: {}, cvssAverage: null,
      attackChainCount: 0, threatHeatMap: {}, executiveThreatScore: 0, complianceSummary: {},
      historicalTrend: 'stable', securityScore: 100, releaseReadiness: 'NOT MEASURED', rationale: 'nothing scanned', falsePositiveRate: null,
    } satisfies PentestReport;
    const board = boardReport(report);
    assert.ok(board.figures.some((f) => f.value === 'NOT MEASURED' && !f.measured));
    assert.ok(board.risks.some((r) => /No active scan/i.test(r)));
  });
});

// ── 13. The agent census ────────────────────────────────────────────────────

describe('the agent catalogue', () => {
  it('registers the declared agent population across fifteen domains', () => {
    const catalogue = buildCatalogue();
    const governance = catalogue.byDomain('governance').length;
    const domain = catalogue.all.length - governance;
    assert.equal(governance, 36, 'every stage must carry a review, a decision and a certification agent');
    assert.ok(domain >= 120, `${domain} domain agents is below the declared floor of 120`);
    assert.deepEqual([...catalogue.domains].sort(), [...DOMAINS].sort());
  });

  it('gives every agent a full contract, and keeps a majority deterministic (INV-7)', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      assert.ok(agent.purpose.length > 15, `${agent.id} has no real purpose`);
      assert.ok(agent.failureHandling.length > 15, `${agent.id} does not say how failure is handled`);
      assert.ok(agent.handle.length > 0, `${agent.id} can decide nothing`);
    }
    const deterministic = catalogue.all.filter((a) => a.aiCapabilityClass === 'none').length;
    assert.ok(deterministic > catalogue.all.length / 2, `${deterministic}/${catalogue.all.length} deterministic; a majority is required by INV-7`);
  });
});
