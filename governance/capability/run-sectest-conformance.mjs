/**
 * CAPABILITY CONFORMANCE SCENARIO — the Security Testing Engine (capability 5).
 * ============================================================================
 * Exercises capability 5 end to end and reports what was OBSERVED as JSON. Asserts nothing;
 * exits 0 either way. The gate that spawns it decides pass or fail.
 *
 * WHAT THIS PROVES THAT THE UNIT TESTS DO NOT.
 * It runs the whole capability twice — once through an Azure DevOps security adapter, once
 * through a cloud Security Hub — and compares the stage sequences. "One workflow, variation
 * only through adapters" is either true of an executed run or a claim about source. It also
 * proves the property that most distinguishes capability 5 from capability 6: an intrusive
 * (exploitation) request is refused at the guardrail stage, before any checker runs.
 *
 *   P-1   the capability registers with all twelve stages
 *   P-2   a run traverses all twelve, in order
 *   P-3   the governance triad is traversed and cannot be skipped
 *   P-4   a forged stage result is refused
 *   P-5   two providers produce an IDENTICAL stage sequence
 *   P-5.n no orchestrator branches on a provider name
 *   P-6   the agent catalogue meets its declared scale and contract
 *   P-7   EP/IP ownership matches the stage plane for every agent
 *   P-8   the engine runs with NO reasoning proposals (INV-7)
 *   P-9   an intrusive/exploitation request is refused before any checker (the cap-5/6 boundary)
 *   P-10  the platform still declares exactly five capabilities, no architecture document added
 *
 * Run:  node governance/capability/run-sectest-conformance.mjs
 * Out:  {"properties":[...],"digest":"<sha256>","census":{...}}
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (pkg) => join(ROOT, 'packages', pkg, 'dist', 'src', 'index.js');

const properties = [];
let census = null;
let fatal = null;
const record = (id, property, ok, detail) => properties.push({ id, property, ok: Boolean(ok), detail });

function emit() {
  const digest = createHash('sha256').update('dbiz.sectest-conformance@1').update(JSON.stringify(properties.map((p) => [p.id, p.ok]))).digest('hex');
  process.stdout.write(JSON.stringify({ properties, digest, fatal, census }));
  process.exit(0);
}

for (const pkg of ['capability-framework', 'security-testing-engine']) {
  if (!existsSync(entry(pkg))) { fatal = `@dbiz/${pkg} is not built`; emit(); }
}

const fw = await import(pathToFileURL(entry('capability-framework')).href);
const st = await import(pathToFileURL(entry('security-testing-engine')).href);

const OBSERVED = [
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
const deps = () => ({ observe: (_s, inScope) => OBSERVED.filter((r) => inScope(r.path)), environmentReachable: true });
const SCOPE = { targetId: 'shop', allowedHosts: ['https://shop.example'], asvsLevel: 3, requestedCategories: [], complianceTargets: ['OWASP-TOP10', 'PCI-DSS'], authorizationReference: 'AUTH-1', environment: 'staging', readOnly: true };
function config(provider, ai, over = {}) {
  return { 'sectest.aiEnabled': String(ai), 'sectest.targetId': 'shop', 'sectest.allowedHosts': 'https://shop.example', 'sectest.asvsLevel': '3', 'sectest.authorizationReference': 'AUTH-1', 'sectest.environment': 'staging', 'sectest.readOnly': 'true', 'sectest.compliance': 'OWASP-TOP10,PCI-DSS', 'security.provider': provider, ...over };
}
function registry() {
  const r = new st.SecurityAdapterRegistry();
  r.register(st.azureDevOpsSecurityAdapter().adapter);
  r.register(st.securityHubAdapter().adapter);
  return r;
}
function execute(provider, ai, over = {}) {
  st.resetAdapterSequence();
  const orch = st.buildSecurityTestingOrchestrator(deps(), registry());
  return orch.execute({ tenantId: 't', runId: `r-${provider}-${ai}-${Object.keys(over).join('')}`, correlationId: 'c', scope: SCOPE, configuration: config(provider, ai, over) });
}

try {
  const catalogue = st.buildCatalogue();

  // P-1
  const reg = new fw.CapabilityRegistry();
  let registered = true; let err = '';
  try {
    reg.register(st.securityTestingCapability(deps(), {
      reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
      recorder: { context: (b) => ({ ...b, proposal: null }), invoked: () => [] },
      adapter: st.azureDevOpsSecurityAdapter().adapter,
    }));
  } catch (e) { registered = false; err = e.message; }
  record('P-1', 'the capability registers with all twelve stage implementations', registered, registered ? `${fw.STAGES.length} stages accepted` : err);

  // P-2
  const run = execute('azure-devops', true);
  const inOrder = JSON.stringify(run.run.completed) === JSON.stringify([...fw.STAGES]);
  record('P-2', 'a run traverses all twelve stages, in order (C-12.1)', run.run.failedAt === null && inOrder, run.run.failedAt ? `failed at ${run.run.failedAt}: ${run.run.failure}` : `${run.run.completed.length} stages`);

  // P-3
  const triadRan = fw.GOVERNANCE_TRIAD.every((s) => run.run.results.has(s));
  const without = new Map([...run.run.results]); without.delete('policy-review');
  const triadRefused = fw.certify(without).certified === false;
  record('P-3', 'the governance triad is traversed, and certification refuses a run without it (C-12.2)', triadRan && triadRefused, `triad traversed: ${triadRan}; a run missing policy-review is refused: ${triadRefused}`);

  // P-4
  const forged = { stage: 'certification', value: {}, outcome: 'ok', reason: null, agentsInvoked: [] };
  record('P-4', 'a hand-written stage result is not sealed and cannot enter the lifecycle (C-12.10)', fw.isSealed(forged) === false, 'the seal is a module-private symbol');

  // P-5
  const ado = execute('azure-devops', true); const hub = execute('security-hub', true);
  const identical = JSON.stringify(ado.run.completed) === JSON.stringify(hub.run.completed);
  record('P-5', 'two providers produce an IDENTICAL stage sequence — one workflow, adapters vary', identical && ado.adapter !== hub.adapter, `${ado.adapter} and ${hub.adapter} traversed the same ${ado.run.completed.length} stages`);

  const orchestrationSource = ['orchestrators.ts', 'capability.ts'].map((f) => readFileSync(join(ROOT, 'packages', 'security-testing-engine', 'src', f), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const leaked = ['azure-devops', 'security-hub', 'jira', 'zephyr'].filter((p) => new RegExp(`['"\`]${p}`).test(orchestrationSource));
  record('P-5.n', 'no orchestrator branches on a provider name', leaked.length === 0, leaked.length === 0 ? 'orchestration names no provider' : `provider names in orchestration: ${leaked.join(', ')}`);

  // P-6
  const gov = catalogue.byDomain('governance').length;
  const domain = catalogue.all.length - gov;
  record('P-6', 'the agent catalogue meets its declared scale with a complete contract each', domain >= 100 && gov === 36, `${domain} domain agents + ${gov} governance across ${catalogue.domains.length} domains`);
  record('P-6.o', 'there is one domain orchestrator per declared domain, plus one master', Object.keys(st.domainOrchestrators).length === st.DOMAINS.length, `${Object.keys(st.domainOrchestrators).length} orchestrators for ${st.DOMAINS.length} domains, plus 1 master`);

  // P-7
  const misplaced = catalogue.all.filter((a) => {
    if (a.domain === 'governance') return false;
    const plane = fw.STAGE_PLANE[a.stage];
    return (plane === 'EP' && a.plane !== 'EP') || (plane === 'IP' && a.plane !== 'IP');
  });
  record('P-7', "every execution agent's declared plane matches the plane of its stage (governance is IP by architecture)", misplaced.length === 0, misplaced.length === 0 ? `${catalogue.all.filter((a) => a.plane === 'EP').length} agents in the Execution Plane; no execution agent misplaced` : misplaced.map((a) => `${a.id} (${a.plane} in ${fw.STAGE_PLANE[a.stage]})`).join(', '));

  const modelSrc = readFileSync(join(ROOT, 'packages', 'security-testing-engine', 'src', 'model.ts'), 'utf8');
  const evBlock = /export interface EvidenceReference \{[\s\S]*?\n\}/.exec(modelSrc)?.[0] ?? '';
  record('P-7.s', 'evidence crosses as a reference — the type carries no artefact content', evBlock.length > 0 && !/\bcontent\b|\bbody\b|\bpayload\b|\bsnippet\b/.test(evBlock), 'EvidenceReference declares a hash and a locator only');
  const weakBlock = /export interface Weakness \{[\s\S]*?\n\}/.exec(modelSrc)?.[0] ?? '';
  record('P-7.w', 'a minimised weakness carries no proving snippet', weakBlock.length > 0 && !/\bsnippet\b|\bbody\b|evidenceSnippet/.test(weakBlock), 'Weakness declares a category, a location and an evidence reference only');

  // P-8
  const noai = execute('azure-devops', false);
  const rep = fw.valueOf(noai.run.results.get('reporting'));
  record('P-8', 'the engine completes with NO reasoning proposals supplied (INV-7)', noai.run.failedAt === null && noai.reasoning.delivered.length === 0 && (rep.report?.scores.securityScore ?? -1) >= 0, `completed with ${noai.reasoning.withheld.length} proposal(s) withheld`);

  // P-9 — the property that most distinguishes capability 5 from capability 6.
  const intrusive = execute('azure-devops', true, { 'sectest.categories': 'sql-injection,xss' });
  record('P-9', 'an intrusive/exploitation request is refused at the guardrail stage, before any checker (cap-5/6 boundary)', intrusive.run.failedAt === 'guardrail-review' && !intrusive.run.completed.includes('execution'), intrusive.run.failedAt ? `refused at ${intrusive.run.failedAt}: ${(intrusive.run.failure || '').slice(0, 100)}` : 'an intrusive request was permitted');

  // P-11 — the Security Intelligence Layer (ADR-0029).
  const intelState = fw.valueOf(run.run.results.get('reporting'));
  const ir = intelState && intelState.intelligenceReport;
  record('P-11', 'the Security Intelligence Layer produces a knowledge graph, correlated risks, certification and a contribution',
    Boolean(ir) && ir.graph.nodeCount > 0 && ir.graph.edgeCount > 0 && ir.risks.length > 0 && ['CERTIFIED', 'PROVISIONAL', 'NOT-CERTIFIED'].includes(ir.certification.status),
    ir ? `${ir.graph.nodeCount} nodes / ${ir.graph.edgeCount} edges, ${ir.risks.length} enterprise risks, certification ${ir.certification.status} (maturity L${ir.certification.maturityLevel}), ${ir.developer.length} developer guidance` : 'no intelligence report');
  record('P-11.b', 'the contribution is security-only and does NOT aggregate other capabilities (Platform-Intelligence boundary, ADR-0029)',
    Boolean(ir) && ir.contribution.capability === 'security-testing' && ir.contribution.aggregatesOtherCapabilities === false,
    ir ? `capability=${ir.contribution.capability}, aggregatesOtherCapabilities=${ir.contribution.aggregatesOtherCapabilities}, securityRiskScore=${ir.contribution.securityRiskScore}` : 'no contribution');

  // P-11.n — the intelligence layer runs with reasoning disabled.
  const noaiIr = (fw.valueOf(execute('azure-devops', false).run.results.get('reporting')) || {}).intelligenceReport;
  record('P-11.n', 'the Security Intelligence Layer runs fully with reasoning disabled (INV-7)', Boolean(noaiIr) && noaiIr.graph.nodeCount > 0 && noaiIr.risks.length > 0, noaiIr ? `graph and ${noaiIr.risks.length} risks produced with reasoning off` : 'no intelligence report with reasoning off');

  // P-10
  const doc11 = readFileSync(join(ROOT, 'docs', 'architecture', '11-capability-model.md'), 'utf8');
  const declared = [...doc11.matchAll(/^\|\s*\d\s*\|\s*\*\*([^*]+Engine)\*\*/gm)].map((m) => m[1].trim());
  record('P-10', 'the platform still declares exactly five capabilities (R-11.4, ADR-0087)', declared.length === 5, `${declared.length} capabilities: ${declared.join(', ')}`);
  const archDocs = readdirSync(join(ROOT, 'docs', 'architecture')).filter((f) => /^\d\d-.*\.md$/.test(f));
  record('P-10.a', 'no architecture document was added', archDocs.length === 25 && !archDocs.some((f) => Number(f.slice(0, 2)) >= 26), `${archDocs.length} architecture documents`);

  census = {
    agents: catalogue.all.length, domainAgents: domain, governanceAgents: gov, domains: catalogue.domains.length,
    executionPlaneAgents: catalogue.all.filter((a) => a.plane === 'EP').length,
    intelligencePlaneAgents: catalogue.all.filter((a) => a.plane === 'IP').length,
    reasoningAgents: catalogue.all.filter((a) => a.aiCapabilityClass !== 'none').length,
    deterministicAgents: catalogue.all.filter((a) => a.aiCapabilityClass === 'none').length,
    checkers: catalogue.all.filter((a) => a.id.startsWith('verify.') && a.stage === 'execution').length,
    domainOrchestrators: Object.keys(st.domainOrchestrators).length, masterOrchestrators: 1,
    stages: fw.STAGES.length,
    intelligenceLayer: { graphNodes: ir ? ir.graph.nodeCount : 0, graphEdges: ir ? ir.graph.edgeCount : 0, enterpriseRisks: ir ? ir.risks.length : 0, certificationStatus: ir ? ir.certification.status : 'NONE', maturityLevel: ir ? ir.certification.maturityLevel : 0 },
  };
  emit();
} catch (e) {
  fatal = e && e.message ? e.message : String(e);
  emit();
}
