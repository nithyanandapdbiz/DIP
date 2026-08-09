/**
 * Dev-Change Engine conformance scenario.
 *
 * Executes the engine and emits machine-readable observations on stdout. It asserts
 * nothing — the gate does the judging. Separating the two is what stops a scenario from
 * quietly relaxing a threshold to keep itself green.
 *
 * The properties are the ones prior audits found missing or defective in earlier
 * capabilities, plus the ones specific to Dev-Change's sovereignty problem (a change IS
 * source). A regression on any of them is a regression to a known, measured failure.
 */
import { AdapterRegistry } from '../../packages/capability-framework/dist/src/index.js';
import {
  buildCatalogue, buildDevChangeEngineOrchestrator, sampleAssets,
  azureDevOpsAdapters, githubJiraAdapters, resetAdapterSequence,
} from '../../packages/dev-change-engine/dist/src/index.js';

const EVENT = {
  kind: 'pull-request', repository: 'customer/app', branch: 'feature/refund-limit',
  baseBranch: 'main', pullRequestId: 'PR-1', headCommit: 'head999', baseCommit: 'base000',
};

const deps = {
  repositoryAssets: sampleAssets(),
  environmentReachable: true,
  observedExecutions: (plan) => new Map(plan.ordering.map((id, i) => [id, {
    testId: id, outcome: i === 0 ? 'failed' : 'passed',
    failureSignal: i === 0 ? 'Timeout 30000ms exceeded waiting for selector .pay' : null,
    durationMs: 100 + i, attempt: 1,
  }])),
  capturedEvidence: (outcomes) => outcomes.filter((o) => o.outcome === 'failed').map((o) => ({
    testId: o.testId, kind: 'screenshot', sha256: 'a1b2c3d4'.repeat(8), locator: `ep://ev/${o.testId}.png`,
  })),
  observedRetry: () => null,
  existingDefects: [],
  maxParallel: 4,
};

function buildRegistry(sets) {
  const registry = new AdapterRegistry();
  registry.registerProject(sets.project);
  registry.registerTestManagement(sets.testManagement);
  registry.registerExecution(sets.execution);
  registry.registerWorkItem(sets.workItem);
  registry.registerSourceControl(sets.sourceControl);
  return registry;
}

function execute(sets, aiEnabled) {
  resetAdapterSequence();
  const registry = buildRegistry(sets);
  const orchestrator = buildDevChangeEngineOrchestrator(deps, EVENT, registry);
  const result = orchestrator.execute({
    tenantId: 'tenant-a', runId: `run-${sets.sourceControl.identity.provider}-${aiEnabled}`, correlationId: 'c1', event: EVENT,
    configuration: {
      'devchange.aiEnabled': String(aiEnabled),
      'devchange.environment': 'ci',
      'project.provider': sets.project.identity.provider,
      'testManagement.provider': sets.testManagement.identity.provider,
      'execution.provider': sets.execution.identity.provider,
      'sourceControl.provider': sets.sourceControl.identity.provider,
    },
    ...(aiEnabled ? {
      proposals: {
        'change.classification': ['behaviour'],
        'business.impact-analysis': { src: { capability: 'Refunds', journeys: ['issue a refund'] } },
        'repository.search.lexical-vector': ['asset-refund-api'],
      },
    } : {}),
  });
  return { result, journal: sets.journal };
}

const catalogue = buildCatalogue();
const adoAi = execute(azureDevOpsAdapters(), true);
const adoNoAi = execute(azureDevOpsAdapters(), false);
const ghAi = execute(githubJiraAdapters(), true);

const stateOf = (r) => r.run.results.get('reporting')?.value ?? {};
const adoState = stateOf(adoAi.result);
const noAiState = stateOf(adoNoAi.result);

// The whole sealed Intelligence-Plane state, serialised — the strictest possible check
// that no source, message or author crossed the boundary.
const sealedAll = JSON.stringify(adoState);

const ADAPTER_METHODS = [
  'listBranches', 'findChangeRequest', 'listCommits', 'diff', 'coChangedWith',
  'createWorkItem', 'linkWorkItemTraceability', 'createContainer', 'createGrouping',
  'publishTests', 'linkTraceability', 'publishResult', 'publishEvidenceReference', 'publishDefect',
];
const called = new Set(adoAi.journal.calls.map((c) => c.method));
const uncalled = ADAPTER_METHODS.filter((m) => !called.has(m));

const sameAgents = JSON.stringify([...adoAi.result.agentsInvoked].sort())
  === JSON.stringify([...adoNoAi.result.agentsInvoked].sort());
const sameAcrossProviders = JSON.stringify([...adoAi.result.agentsInvoked].sort())
  === JSON.stringify([...ghAi.result.agentsInvoked].sort());

const registeredIds = new Set(catalogue.all.map((x) => x.id));
const claimed = [...adoAi.result.run.results.values()].flatMap((r) => r.agentsInvoked);
const phantom = claimed.filter((id) => !registeredIds.has(id));

const aiClassed = catalogue.all.filter((x) => x.aiCapabilityClass !== 'none');
const contractless = aiClassed.filter((x) => !x.promptContract || x.promptContract.rejectionRules.length === 0);

// Every agent placed on the plane its stage runs in, and diff/search agents in the EP.
const misplaced = catalogue.all.filter((x) =>
  (x.id.startsWith('diff.') || x.id.startsWith('repository.') || x.id.startsWith('execution.scoped') || x.id.startsWith('evidence.') || x.id.startsWith('repository.search.'))
  && x.stage !== 'context' && x.stage !== 'reflection' && x.plane !== 'EP');

const domainOf = new Map(catalogue.all.map((x) => [x.id, x.domain]));
const domainsThatRan = new Set(adoAi.result.agentsInvoked.map((id) => domainOf.get(id)));
const inertDomains = catalogue.domains.filter((d) => !domainsThatRan.has(d));

const learningKinds = new Set((adoState.learning ?? []).map((r) => r.kind));
const DECLARED_LEARNING = ['change-pattern', 'repository-pattern', 'healing-pattern', 'failure-pattern', 'execution-history', 'automation-history', 'historical-trend', 'knowledge-graph', 'vector-memory', 'prompt'];

const properties = [
  { id: 'V-1', property: 'the engine traverses all twelve stages and fails at none', observed: adoAi.result.run.failure === null && adoAi.result.run.completed.length === 12, detail: adoAi.result.run.failure ?? '12 stages' },
  { id: 'V-2', property: 'the governance triad is traversed and certification is reached', observed: adoAi.result.certification.certified === true, detail: adoAi.result.certification.firstRefusal?.reason ?? 'certified' },
  { id: 'V-3', property: 'AI and AI-disabled modes run the same stages and the same agents', observed: sameAgents, detail: `${adoAi.result.agentsInvoked.length} vs ${adoNoAi.result.agentsInvoked.length} agents` },
  { id: 'V-4', property: 'no proposal is delivered when reasoning is disabled, and the run still completes', observed: adoNoAi.result.reasoning.delivered.length === 0 && adoNoAi.result.run.failure === null, detail: `${adoNoAi.result.reasoning.withheld.length} withheld, run completed` },
  { id: 'V-5', property: 'no source line, commit message or author crosses into the Intelligence Plane', observed: !sealedAll.includes('MAX_REFUND = 1000') && !sealedAll.includes('enforce refund ceiling') && !sealedAll.includes('dev@customer.example') && !sealedAll.includes('addedLines'), detail: 'no source, message or author in the sealed reporting state' },
  { id: 'V-6', property: 'every declared adapter method is actually invoked', observed: uncalled.length === 0, detail: uncalled.length ? `never called: ${uncalled.join(', ')}` : `${ADAPTER_METHODS.length} methods invoked` },
  { id: 'V-7', property: 'two providers produce identical stage sequences and agents', observed: sameAcrossProviders, detail: 'azure-devops vs github + jira + zephyr-scale' },
  { id: 'V-8', property: 'the two providers genuinely differ, so V-7 is not trivially true', observed: (() => { const gs = stateOf(ghAi.result); const wi = (gs.sync ?? []).filter((r) => r.localId.startsWith('test-')); return adoAi.result.adapters.sourceControl !== ghAi.result.adapters.sourceControl && wi.length > 0; })(), detail: `sourceControl ${adoAi.result.adapters.sourceControl} vs ${ghAi.result.adapters.sourceControl}` },
  { id: 'V-9', property: 'evidence crosses by reference only', observed: (adoState.evidence ?? []).every((e) => !('content' in e) && e.sha256 && e.locator), detail: `${(adoState.evidence ?? []).length} reference(s), each hash and locator only` },
  { id: 'V-10', property: 'every authored test step carries an expected result', observed: (adoState.authored ?? []).length > 0 && (adoState.authored ?? []).every((t) => t.steps.every((s) => s.expectedResult && s.expectedResult.trim())), detail: `${(adoState.authored ?? []).length} authored test(s)` },
  { id: 'V-11', property: 'generated automation kinds match the kinds decided missing', observed: JSON.stringify([...(adoState.requestedKinds ?? [])].sort()) === JSON.stringify([...(adoState.generatedKinds ?? [])].sort()), detail: `${(adoState.generatedKinds ?? []).length} generated, ${(adoState.requestedKinds ?? []).length} requested` },
  { id: 'V-12', property: 'no heal is validated without an observed passing retry', observed: (adoState.healing ?? []).every((h) => !h.validated), detail: `${(adoState.healing ?? []).length} proposal(s), none self-validated` },
  { id: 'V-13', property: 'the sealed audit trail names no agent that did not run', observed: phantom.length === 0, detail: phantom.length ? `phantom: ${phantom.join(', ')}` : `${new Set(claimed).size} distinct agents, all registered` },
  { id: 'V-14', property: 'every domain orchestrator actually ran agents', observed: inertDomains.length === 0, detail: inertDomains.length ? `inert: ${inertDomains.join(', ')}` : `${catalogue.domains.length} domains active` },
  { id: 'V-15', property: 'every reasoning agent declares a prompt contract with a rejection rule', observed: contractless.length === 0, detail: contractless.length ? contractless.map((x) => x.id).join(', ') : `${aiClassed.length} reasoning agents` },
  { id: 'V-16', property: 'diff, repository and search agents run in the Execution Plane', observed: misplaced.length === 0, detail: misplaced.length ? misplaced.map((x) => x.id).join(', ') : 'all EP' },
  { id: 'V-17', property: 'every declared learning kind is emitted', observed: DECLARED_LEARNING.every((k) => learningKinds.has(k)), detail: `${learningKinds.size}/${DECLARED_LEARNING.length} kinds emitted` },
  { id: 'V-18', property: 'every stage carries a review, a decision and a certification agent', observed: catalogue.byDomain('governance').length === 36, detail: `${catalogue.byDomain('governance').length} governance agents` },
  { id: 'V-19', property: 'every synchronization record carries a reason', observed: (adoState.sync ?? []).length > 0 && (adoState.sync ?? []).every((r) => r.reason && r.reason.trim()), detail: `${(adoState.sync ?? []).length} record(s)` },
  { id: 'V-20', property: 'the AI-disabled run classifies changes and authors tests with no reasoning', observed: (noAiState.classified ?? []).length > 0 && (noAiState.authored ?? []).length > 0, detail: `${(noAiState.classified ?? []).length} classified, ${(noAiState.authored ?? []).length} authored with no proposals` },
  { id: 'V-21', property: 'a real failure raises a defect with a root cause and an evidence reference', observed: (adoState.defects ?? []).length > 0 && (adoState.defects ?? []).every((d) => d.rootCause.trim() && d.evidenceRefs.length > 0), detail: `${(adoState.defects ?? []).length} defect(s)` },
  { id: 'V-22', property: 'the report states its analysis limits and never claims READY on unmeasured readiness', observed: (adoState.report?.statedLimits ?? []).length > 0 && !(adoState.report?.releaseReadiness === 'READY' && (adoState.outcomes ?? []).length === 0), detail: `readiness ${adoState.report?.releaseReadiness}, ${(adoState.report?.statedLimits ?? []).length} limit(s) stated` },
];

const census = {
  agents: catalogue.all.length,
  governanceAgents: catalogue.byDomain('governance').length,
  domainAgents: catalogue.all.length - catalogue.byDomain('governance').length,
  domains: catalogue.domains.length,
  domainOrchestrators: 20,
  masterOrchestrators: 1,
  executionPlane: catalogue.all.filter((x) => x.plane === 'EP').length,
  intelligencePlane: catalogue.all.filter((x) => x.plane === 'IP').length,
  reasoningAgents: aiClassed.length,
  deterministicAgents: catalogue.all.length - aiClassed.length,
  classified: (adoState.classified ?? []).length,
  authored: (adoState.authored ?? []).length,
  defects: (adoState.defects ?? []).length,
  adapterMethodsInvoked: ADAPTER_METHODS.length - uncalled.length,
};

process.stdout.write(JSON.stringify({
  properties, census,
  digest: `${properties.filter((p) => p.observed).length}/${properties.length}`,
}, null, 2));
