/**
 * Discovery Flow Engine conformance scenario.
 *
 * Executes the engine and emits machine-readable observations on stdout. It asserts
 * nothing — the gate does the judging. Separating the two is what stops a scenario from
 * quietly relaxing a threshold to keep itself green.
 *
 * The properties here are the ones the Functional Testing Engine audit found missing or
 * defective in the first capability, so a regression on any of them is a regression to a
 * known, measured failure rather than a hypothetical one.
 */
import { AdapterRegistry } from '../../packages/capability-framework/dist/src/index.js';
import {
  buildCatalogue, buildDiscoveryFlowOrchestrator,
  azureDevOpsAdapters, jiraAdapters, resetAdapterSequence,
} from '../../packages/discovery-flow-engine/dist/src/index.js';

const PAGES = ['/home', '/orders', '/orders/{id}', '/checkout', '/admin/payments/refund'];
const a = (kind, id, label, path, values = {}, parentId = null) => ({ kind, id, label, path, values, parentId });

const OBSERVED = [
  ...PAGES.map((p) => a('page', p, `page ${p}`, p)),
  a('navigation-edge', '/orders', 'to orders', '/orders', {}, '/home'),
  a('navigation-edge', '/orders/{id}', 'to order', '/orders/{id}', {}, '/orders'),
  a('navigation-edge', '/checkout', 'to checkout', '/checkout', {}, '/orders/{id}'),
  a('navigation-edge', '/admin/payments/refund', 'to refund', '/admin/payments/refund', {}, '/checkout'),
  a('form', 'form-checkout', 'checkout form', '/checkout', { type: 'form' }, '/checkout'),
  a('field', 'field-quantity', 'quantity', '/checkout', { type: 'number', required: 'true', min: '1', max: '99' }, '/checkout'),
  a('field', 'field-address', 'delivery address', '/checkout', { type: 'text', required: 'true', maxlength: '200' }, '/checkout'),
  a('field', 'field-amount', 'refund amount', '/admin/payments/refund', { type: 'number', required: 'true' }, '/admin/payments/refund'),
  a('control', 'control-pay', 'Pay now', '/checkout', {}, '/checkout'),
  a('control', 'control-refund', 'Issue refund', '/admin/payments/refund', {}, '/admin/payments/refund'),
  a('api-endpoint', 'api-orders', 'orders api', '/api/orders/4471', { method: 'get', customerId: '', status: '' }),
  a('api-endpoint', 'api-refund', 'refund api', '/api/payments/98/refund', { method: 'post', amount: '' }),
  a('cookie', 'cookie-session', 'SESSIONID', '/', { domain: 'shop.example', path: '/', secure: 'true', value: 'S3CR3T-SESSION-TOKEN' }),
  a('storage-key', 'storage-cart', 'cart.draft', '/', { value: '{"items":[1,2]}' }),
  a('iframe', 'frame-analytics', 'analytics', 'https://tracker.example/embed'),
  a('menu', 'menu-main', 'Main menu', '/'),
];

const REPOSITORY_ASSETS = [
  { id: 'repo-existing-checkout', kind: 'test-case', text: 'functional Exercise /checkout within journey', repository: 'customer/qa' },
  { id: 'repo-pom-checkout', kind: 'page-object', text: 'checkout page object pay now quantity address', repository: 'customer/automation' },
];

const deps = {
  observe: () => OBSERVED,
  repositoryAssets: REPOSITORY_ASSETS,
  environmentReachable: true,
  observedOutcomes: (plan) => plan.batches.flat().map((id, i) => ({
    qaAssetId: id,
    outcome: i === 0 ? 'failed' : 'passed',
    failureSignal: i === 0 ? 'Timeout 30000ms exceeded waiting for selector' : null,
    durationMs: 100 + i,
  })),
  capturedEvidence: (outcomes) => outcomes.filter((o) => o.outcome === 'failed').map((o) => ({
    qaAssetId: o.qaAssetId, kind: 'screenshot', locator: `ep://evidence/${o.qaAssetId}.png`, digest: 'a1b2c3d4',
  })),
  observedRetry: () => null,
  existingDefects: [],
  maxParallel: 4,
  scopeReached: 0.9,
};

function buildRegistry() {
  const registry = new AdapterRegistry();
  const ado = azureDevOpsAdapters();
  const jira = jiraAdapters();
  for (const set of [ado, jira]) {
    registry.registerProject(set.project);
    registry.registerTestManagement(set.testManagement);
    registry.registerExecution(set.execution);
    registry.registerWorkItem(set.workItem);
  }
  return { registry, ado, jira };
}

function execute(provider, aiEnabled) {
  resetAdapterSequence();
  const { registry, ado, jira } = buildRegistry();
  const orchestrator = buildDiscoveryFlowOrchestrator(deps, registry);
  const result = orchestrator.execute({
    tenantId: 'tenant-a', runId: `run-${provider}-${aiEnabled}`, correlationId: 'c1',
    scope: { applicationId: 'shop', origins: [], exclusions: [], depth: 'standard', authenticationMode: 'anonymous', rateLimitPerSecond: 8, apiSpecificationUris: [] },
    configuration: {
      'discovery.aiEnabled': String(aiEnabled),
      'discovery.applicationId': 'shop',
      'discovery.origins': 'https://shop.example',
      'discovery.exclusions': '/logout',
      'discovery.depth': 'standard',
      'discovery.rateLimit': '8',
      'project.provider': provider,
      'testManagement.provider': provider === 'azure-devops' ? 'azure-devops' : 'zephyr-scale',
      'execution.provider': provider === 'azure-devops' ? 'azure-devops' : 'zephyr-scale',
    },
    ...(aiEnabled ? {
      proposals: {
        'appintel.entities': { checkout: 'purchase basket', admin: 'refund authorisation' },
        'repository.semantic-search': ['repo-pom-checkout', 'repo-existing-checkout'],
      },
    } : {}),
  });
  return { result, journal: provider === 'azure-devops' ? ado.journal : jira.journal, orchestrator };
}

const catalogue = buildCatalogue();
const adoAi = execute('azure-devops', true);
const adoNoAi = execute('azure-devops', false);
const jiraAi = execute('jira', true);

const stateOf = (r) => r.run.results.get('reporting')?.value ?? {};
const adoState = stateOf(adoAi.result);
const noAiState = stateOf(adoNoAi.result);

const ADAPTER_METHODS = [
  'createWorkItem', 'linkWorkItemTraceability', 'createContainer', 'createGrouping',
  'findExistingTests', 'publishTests', 'linkTraceability', 'linkRequirement',
  'publishResult', 'publishEvidenceReference', 'publishDefect',
];
const called = new Set(adoAi.journal.calls.map((c) => c.method));
const uncalled = ADAPTER_METHODS.filter((m) => !called.has(m));

const sameAgents = JSON.stringify([...adoAi.result.agentsInvoked].sort())
  === JSON.stringify([...adoNoAi.result.agentsInvoked].sort());
const sameAcrossProviders = JSON.stringify([...adoAi.result.agentsInvoked].sort())
  === JSON.stringify([...jiraAi.result.agentsInvoked].sort());

const registeredIds = new Set(catalogue.all.map((x) => x.id));
const claimed = [...adoAi.result.run.results.values()].flatMap((r) => r.agentsInvoked);
const phantom = claimed.filter((id) => !registeredIds.has(id));

const sealed = JSON.stringify({
  facts: adoState.facts, intelligence: adoState.intelligence, requirements: adoState.requirements,
});

const aiClassed = catalogue.all.filter((x) => x.aiCapabilityClass !== 'none');
const contractless = aiClassed.filter((x) => !x.promptContract || x.promptContract.rejectionRules.length === 0);

const misplaced = catalogue.all.filter((x) =>
  (x.domain === 'discovery' || x.id.startsWith('repository.search.') || x.id.startsWith('automation.search.'))
  && x.plane !== 'EP');

const jiraWorkItems = (stateOf(jiraAi.result).workItems ?? []);
const jiraFeatures = jiraWorkItems.filter((r) => r.localId.startsWith('feature-'));
const jiraStories = jiraWorkItems.filter((r) => r.localId.startsWith('story-'));

const requested = [...(adoState.requestedKinds ?? [])].sort();
const generated = [...(adoState.generatedKinds ?? [])].sort();

const domainOf = new Map(catalogue.all.map((x) => [x.id, x.domain]));
const domainsThatRan = new Set(adoAi.result.agentsInvoked.map((id) => domainOf.get(id)));
const inertDomains = catalogue.domains.filter((d) => !domainsThatRan.has(d));

const learningKinds = new Set((adoState.learning ?? []).map((r) => r.kind));
const DECLARED_LEARNING = ['application-pattern', 'business-rule', 'journey', 'repository', 'automation', 'healing', 'prompt', 'knowledge-graph', 'vector-memory'];

const properties = [
  { id: 'D-1', property: 'the engine traverses all twelve stages and fails at none', observed: adoAi.result.run.failure === null && adoAi.result.run.completed.length === 12, detail: adoAi.result.run.failure ?? '12 stages' },
  { id: 'D-2', property: 'the governance triad is traversed and certification is reached', observed: adoAi.result.certification.certified === true, detail: adoAi.result.certification.firstRefusal?.reason ?? 'certified' },
  { id: 'D-3', property: 'AI and non-AI modes run the same stages and the same agents', observed: sameAgents, detail: `${adoAi.result.agentsInvoked.length} vs ${adoNoAi.result.agentsInvoked.length} agents` },
  { id: 'D-4', property: 'no proposal is delivered when reasoning is disabled', observed: adoNoAi.result.reasoning.delivered.length === 0 && adoNoAi.result.run.failure === null, detail: `${adoNoAi.result.reasoning.withheld.length} withheld, run completed` },
  { id: 'D-5', property: 'every declared adapter method is actually invoked', observed: uncalled.length === 0, detail: uncalled.length ? `never called: ${uncalled.join(', ')}` : `${ADAPTER_METHODS.length} methods invoked` },
  { id: 'D-6', property: 'two providers produce identical stage sequences and agents', observed: sameAcrossProviders, detail: 'azure-devops vs jira + zephyr-scale' },
  { id: 'D-7', property: 'the two providers genuinely differ, so D-6 is not trivially true', observed: jiraFeatures.length > 0 && jiraFeatures.every((f) => !f.published) && jiraStories.some((s) => s.published), detail: `${jiraFeatures.length} feature(s) refused by the provider, stories re-parented` },
  { id: 'D-8', property: 'no customer value reaches the Intelligence Plane', observed: !sealed.includes('S3CR3T') && !sealed.includes('"items"'), detail: 'no cookie or storage value in the sealed state' },
  { id: 'D-9', property: 'evidence crosses by reference only', observed: (adoState.evidence ?? []).every((e) => !('content' in e) && e.sha256 && e.locator), detail: `${(adoState.evidence ?? []).length} reference(s), each hash and locator only` },
  { id: 'D-10', property: 'every QA step carries an expected result', observed: (adoState.assets ?? []).every((x) => x.steps.every((s) => s.expectedResult && s.expectedResult.trim())), detail: `${(adoState.assets ?? []).length} asset(s)` },
  { id: 'D-11', property: 'generated automation kinds match the kinds found missing', observed: JSON.stringify(requested) === JSON.stringify(generated), detail: `${generated.length} generated, ${requested.length} requested` },
  { id: 'D-12', property: 'no heal is validated without an observed passing retry', observed: (adoState.healing ?? []).every((h) => !h.validated), detail: `${(adoState.healing ?? []).length} proposal(s), none self-validated` },
  { id: 'D-13', property: 'the sealed audit trail names no agent that did not run', observed: phantom.length === 0, detail: phantom.length ? `phantom: ${phantom.join(', ')}` : `${new Set(claimed).size} distinct agents, all registered` },
  { id: 'D-14', property: 'every domain orchestrator actually ran agents', observed: inertDomains.length === 0, detail: inertDomains.length ? `inert: ${inertDomains.join(', ')}` : `${catalogue.domains.length} domains active` },
  { id: 'D-15', property: 'every reasoning agent declares a prompt contract with a rejection rule', observed: contractless.length === 0, detail: contractless.length ? contractless.map((x) => x.id).join(', ') : `${aiClassed.length} reasoning agents` },
  { id: 'D-16', property: 'discovery and repository search run in the Execution Plane', observed: misplaced.length === 0, detail: misplaced.length ? misplaced.map((x) => x.id).join(', ') : 'all EP' },
  { id: 'D-17', property: 'every declared learning kind is emitted', observed: DECLARED_LEARNING.every((k) => learningKinds.has(k)), detail: `${learningKinds.size}/${DECLARED_LEARNING.length} kinds emitted` },
  { id: 'D-18', property: 'every stage carries a review, a decision and a certification agent', observed: catalogue.byDomain('governance').length === 36, detail: `${catalogue.byDomain('governance').length} governance agents` },
  { id: 'D-19', property: 'every synchronization record carries a reason', observed: (adoState.sync ?? []).length > 0 && (adoState.sync ?? []).every((r) => r.reason && r.reason.trim()), detail: `${(adoState.sync ?? []).length} record(s)` },
  { id: 'D-20', property: 'the non-AI run reconstructs requirements without reasoning', observed: (noAiState.requirements?.stories ?? []).length > 0, detail: `${(noAiState.requirements?.stories ?? []).length} story/stories reconstructed with no proposals` },
];

const census = {
  agents: catalogue.all.length,
  governanceAgents: catalogue.byDomain('governance').length,
  domainAgents: catalogue.all.length - catalogue.byDomain('governance').length,
  domains: catalogue.domains.length,
  executionPlane: catalogue.all.filter((x) => x.plane === 'EP').length,
  intelligencePlane: catalogue.all.filter((x) => x.plane === 'IP').length,
  reasoningAgents: aiClassed.length,
  deterministicAgents: catalogue.all.length - aiClassed.length,
  stories: (adoState.requirements?.stories ?? []).length,
  qaAssets: (adoState.assets ?? []).length,
  adapterMethodsInvoked: ADAPTER_METHODS.length - uncalled.length,
};

process.stdout.write(JSON.stringify({
  properties, census,
  digest: `${properties.filter((p) => p.observed).length}/${properties.length}`,
}, null, 2));
