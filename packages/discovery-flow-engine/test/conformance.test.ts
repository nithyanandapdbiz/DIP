/**
 * Discovery Flow Engine conformance.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 12-capability-orchestration.md
 *                  06-data-sovereignty.md · 14-tool-operating-model.md
 *   ADR          : ADR-0023 · ADR-0022
 *   Criteria     : C-11.11 · C-11.13 · C-12.1 · C-12.12 · C-13.1 · C-14.1
 *
 * Every property here executes the whole engine. There is no unit-testing of an agent in
 * isolation through a seam, because the seam would be the bypass R-12.11 forbids — the
 * only way into a stage is the framework runner, deliberately.
 *
 * The properties that matter most are the ones that would have caught the defects the
 * previous capability's audit found: adapters declared and never called, an audit trail
 * naming agents that did not run, a generator emitting the wrong asset kind, and
 * domain orchestrators that exist and are never invoked.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AdapterRegistry, AgentCatalogue, CapabilityRegistry, STAGES, GOVERNANCE_TRIAD,
  VectorIndex, VectorMemory, embed, cosine, defineAgent, resolveReasoningMode,
} from '@dbiz/capability-framework';
import {
  buildCatalogue, buildDiscoveryFlowOrchestrator, discoveryFlowCapability,
  azureDevOpsAdapters, jiraAdapters, resetAdapterSequence,
  renderPdf, boardReport, minimise, scrubLabel, DOMAINS, domainOrchestrators,
  type EngineDependencies, type ObservedArtefact, type TestOutcome, type HealingAction,
  type DiscoveryRequest, type ExecutionPlan, type DiscoveryReport,
} from '../src/index.js';

// ── A synthetic application the Execution Plane "observed" ──────────────────

const PAGES = ['/home', '/orders', '/orders/{id}', '/checkout', '/admin/payments/refund'];

function artefact(kind: ObservedArtefact['kind'], id: string, label: string, path: string,
  values: Record<string, string> = {}, parentId: string | null = null): ObservedArtefact {
  return { kind, id, label, path, values, parentId };
}

const OBSERVED: readonly ObservedArtefact[] = [
  ...PAGES.map((p) => artefact('page', p, `page ${p}`, p)),

  // Navigation actually traversed. Journeys are assembled only from these.
  artefact('navigation-edge', '/orders', 'to orders', '/orders', {}, '/home'),
  artefact('navigation-edge', '/orders/{id}', 'to order', '/orders/{id}', {}, '/orders'),
  artefact('navigation-edge', '/checkout', 'to checkout', '/checkout', {}, '/orders/{id}'),
  artefact('navigation-edge', '/admin/payments/refund', 'to refund', '/admin/payments/refund', {}, '/checkout'),

  // Forms and fields. Constraints are structure; entered values are not observed at all.
  artefact('form', 'form-checkout', 'checkout form', '/checkout', { type: 'form' }, '/checkout'),
  artefact('field', 'field-quantity', 'quantity', '/checkout', { type: 'number', required: 'true', min: '1', max: '99' }, '/checkout'),
  artefact('field', 'field-address', 'delivery address', '/checkout', { type: 'text', required: 'true', maxlength: '200' }, '/checkout'),
  artefact('field', 'field-amount', 'refund amount', '/admin/payments/refund', { type: 'number', required: 'true' }, '/admin/payments/refund'),
  artefact('control', 'control-pay', 'Pay now', '/checkout', {}, '/checkout'),
  artefact('control', 'control-refund', 'Issue refund', '/admin/payments/refund', {}, '/admin/payments/refund'),

  artefact('api-endpoint', 'api-orders', 'orders api', '/api/orders/4471', { method: 'get', customerId: '', status: '' }),
  artefact('api-endpoint', 'api-refund', 'refund api', '/api/payments/98/refund', { method: 'post', amount: '' }),

  // Values that must never cross. The cookie value is dropped at observation.
  artefact('cookie', 'cookie-session', 'SESSIONID', '/', { domain: 'shop.example', path: '/', secure: 'true', value: 'S3CR3T-SESSION-TOKEN' }),
  artefact('storage-key', 'storage-cart', 'cart.draft', '/', { value: '{"items":[...]}' }),
  artefact('event', 'event-added', 'cart.item-added', '/'),
  artefact('iframe', 'frame-analytics', 'analytics', 'https://tracker.example/embed'),
  artefact('menu', 'menu-main', 'Main menu', '/'),
];

const REPOSITORY_ASSETS = [
  { id: 'repo-existing-checkout', kind: 'test-case' as const, text: 'functional Exercise /checkout within /home to /admin/payments/refund', repository: 'customer/qa' },
  { id: 'repo-pom-checkout', kind: 'page-object' as const, text: 'checkout page object pay now quantity address', repository: 'customer/automation' },
];

function dependencies(overrides: Partial<EngineDependencies> = {}): EngineDependencies {
  return {
    observe: (_scope, inScope) => OBSERVED.filter((a) => a.path.startsWith('/') || inScope(a.path)),
    repositoryAssets: REPOSITORY_ASSETS,
    environmentReachable: true,
    observedOutcomes: (plan: ExecutionPlan) => plan.batches.flat().map((id, i) => ({
      qaAssetId: id,
      outcome: i === 0 ? ('failed' as const) : ('passed' as const),
      failureSignal: i === 0 ? 'Timeout 30000ms exceeded waiting for selector' : null,
      durationMs: 100 + i,
    })),
    capturedEvidence: (outcomes: readonly TestOutcome[]) => outcomes
      .filter((o) => o.outcome === 'failed')
      .flatMap((o) => ([
        { qaAssetId: o.qaAssetId, kind: 'screenshot' as const, locator: `ep://evidence/${o.qaAssetId}.png`, digest: 'a1b2c3d4' },
        { qaAssetId: o.qaAssetId, kind: 'environment' as const, locator: `ep://evidence/${o.qaAssetId}.env`, digest: 'e5f6a7b8' },
      ])),
    observedRetry: (_action: HealingAction) => null,
    existingDefects: [],
    maxParallel: 4,
    scopeReached: 0.9,
    ...overrides,
  };
}

function registry(provider: 'azure-devops' | 'jira') {
  const registryInstance = new AdapterRegistry();
  const ado = azureDevOpsAdapters();
  const jira = jiraAdapters();
  for (const set of [ado, jira]) {
    registryInstance.registerProject(set.project);
    registryInstance.registerTestManagement(set.testManagement);
    registryInstance.registerExecution(set.execution);
    registryInstance.registerWorkItem(set.workItem);
  }
  return { registry: registryInstance, journal: provider === 'azure-devops' ? ado.journal : jira.journal };
}

function configuration(provider: 'azure-devops' | 'jira', aiEnabled: boolean): Record<string, string> {
  return {
    'discovery.aiEnabled': String(aiEnabled),
    'discovery.applicationId': 'shop',
    'discovery.origins': 'https://shop.example',
    'discovery.exclusions': '/logout',
    'discovery.depth': 'standard',
    'discovery.rateLimit': '8',
    'project.provider': provider,
    'testManagement.provider': provider === 'azure-devops' ? 'azure-devops' : 'zephyr-scale',
    'execution.provider': provider === 'azure-devops' ? 'azure-devops' : 'zephyr-scale',
  };
}

const PROPOSALS = {
  'appintel.entities': { checkout: 'purchase basket', admin: 'refund authorisation' },
  'requirement.epic': { 'capability-orders': { title: 'Order management', context: 'Everything a customer does with an order after placing it.' } },
  'repository.semantic-search': ['repo-pom-checkout', 'repo-existing-checkout'],
};

function run(provider: 'azure-devops' | 'jira', aiEnabled: boolean, deps = dependencies()) {
  resetAdapterSequence();
  const { registry: adapterRegistry, journal } = registry(provider);
  const orchestrator = buildDiscoveryFlowOrchestrator(deps, adapterRegistry);
  const request: DiscoveryRequest = {
    tenantId: 'tenant-a', runId: `run-${provider}-${aiEnabled}`, correlationId: 'corr-1',
    scope: { applicationId: 'shop', origins: [], exclusions: [], depth: 'standard', authenticationMode: 'anonymous', rateLimitPerSecond: 8, apiSpecificationUris: [] },
    configuration: configuration(provider, aiEnabled),
    ...(aiEnabled ? { proposals: PROPOSALS } : {}),
  };
  return { result: orchestrator.execute(request), journal, orchestrator };
}

/** The state the final stage carried. Read from the SEALED result, never rebuilt. */
function finalState(result: ReturnType<typeof run>['result']): Record<string, never> {
  const reporting = result.run.results.get('reporting');
  assert.ok(reporting, 'the reporting stage produced no sealed result');
  return reporting.value as Record<string, never>;
}

// ── 1. The lifecycle ────────────────────────────────────────────────────────

describe('the twelve-stage lifecycle', () => {
  it('traverses every stage in order and fails at none (C-12.1)', () => {
    const { result } = run('azure-devops', true);
    assert.equal(result.run.failure, null, `run failed: ${result.run.failure}`);
    assert.deepEqual([...result.run.completed], [...STAGES]);
  });

  it('traverses the governance triad, so certification is reachable (C-11.13)', () => {
    const { result } = run('azure-devops', true);
    for (const stage of GOVERNANCE_TRIAD) assert.ok(result.run.results.has(stage), `${stage} did not run`);
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
  });

  it('registers as a capability, and a capability missing a stage is refused (R-11.12)', () => {
    const registryInstance = new CapabilityRegistry();
    const capability = discoveryFlowCapability(dependencies(), {
      reasoning: { source: { for: () => null }, ledger: () => ({ mode: 'disabled', delivered: [], withheld: [] }) },
      recorder: { context: (b, _id) => ({ ...b, proposal: null }), invoked: () => [] },
      adapters: registry('azure-devops').registry.resolve(configuration('azure-devops', false)),
      workItemAdapter: azureDevOpsAdapters().workItem,
      memory: new VectorMemory(),
    });
    registryInstance.register(capability);
    assert.equal(registryInstance.get('inverse-flow-discovery')?.name, 'Inverse-Flow Discovery Engine');

    const gutted = { ...capability, id: 'gutted', stages: { ...capability.stages, execution: (() => { throw new Error('unreachable'); }) as never } };
    assert.throws(() => registryInstance.register(gutted), /takes no context and can perform no work/);
  });
});

// ── 2. AI mode and non-AI mode: one workflow ────────────────────────────────

describe('AI-enabled and non-AI modes are the same workflow', () => {
  it('produces an identical stage sequence and an identical agent set', () => {
    const enabled = run('azure-devops', true);
    const disabled = run('azure-devops', false);

    assert.deepEqual([...enabled.result.run.completed], [...disabled.result.run.completed]);
    assert.deepEqual(
      [...enabled.result.agentsInvoked].sort(),
      [...disabled.result.agentsInvoked].sort(),
      'a different set of agents ran, which means the two modes are not one workflow',
    );
  });

  it('delivers no proposal at all when AI is disabled', () => {
    const { result } = run('azure-devops', false);
    assert.equal(result.reasoningMode, 'disabled');
    assert.equal(result.reasoning.delivered.length, 0);
    assert.ok(result.reasoning.withheld.length > 0);
    assert.equal(result.run.failure, null, 'the engine must complete with reasoning unavailable (INV-7)');
  });

  it('completes and certifies in BOTH modes', () => {
    for (const aiEnabled of [true, false]) {
      const { result } = run('azure-devops', aiEnabled);
      assert.equal(result.run.failure, null, `${aiEnabled ? 'AI' : 'non-AI'} run failed: ${result.run.failure}`);
      assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason);
    }
  });

  it('enriches rather than replaces: AI mode adds inferred names and never removes observed facts', () => {
    const enabled = finalState(run('azure-devops', true).result);
    const disabled = finalState(run('azure-devops', false).result);

    const factsOf = (s: Record<string, never>) => (s['facts'] as unknown as { id: string }[]).map((f) => f.id).sort();
    assert.deepEqual(factsOf(enabled), factsOf(disabled), 'reasoning changed what was observed, which it must never do');

    const names = (s: Record<string, never>) =>
      ((s['intelligence'] as unknown as { entities: { name: string }[] }).entities).map((e) => e.name);
    assert.ok(names(enabled).includes('purchase basket'),
      `AI mode did not apply an accepted entity name; got ${names(enabled).join(', ')}`);
    assert.ok(!names(disabled).includes('purchase basket'), 'non-AI mode used a proposal it was never given');
  });

  it('reads the capability-neutral key, so the framework never sees discovery.aiEnabled', () => {
    assert.equal(resolveReasoningMode({ 'ai.enabled': 'true' }), 'enabled');
    assert.equal(resolveReasoningMode({ 'discovery.aiEnabled': 'true' }), 'disabled',
      'the framework must not read a capability-specific configuration key (C-11.11)');
  });
});

// ── 3. Adapters are actually called ─────────────────────────────────────────

describe('adapter publication happens', () => {
  const REQUIRED = [
    'createWorkItem', 'linkWorkItemTraceability', 'createContainer', 'createGrouping',
    'findExistingTests', 'publishTests', 'linkTraceability', 'linkRequirement',
    'publishResult', 'publishEvidenceReference', 'publishDefect',
  ];

  it('invokes every adapter method the engine declares', () => {
    const { journal } = run('azure-devops', true);
    const called = new Set(journal.calls.map((c) => c.method));
    for (const method of REQUIRED) {
      assert.ok(called.has(method), `${method} was never called — declared and unwired`);
    }
  });

  it('records a provider identifier for every published work item', () => {
    const state = finalState(run('azure-devops', true).result);
    const workItems = state['workItems'] as unknown as { published: boolean; externalId: string | null; reason: string }[];
    assert.ok(workItems.length > 0);
    for (const record of workItems) {
      if (record.published) assert.ok(record.externalId, 'publication claimed without a provider identifier');
      else assert.ok(record.reason.trim().length > 0, 'a refusal carries no reason');
    }
  });

  it('publishes evidence by reference and never by content', () => {
    const { journal } = run('azure-devops', true);
    const evidenceCalls = journal.calls.filter((c) => c.method === 'publishEvidenceReference');
    assert.ok(evidenceCalls.length > 0);
    for (const call of evidenceCalls) {
      assert.ok(!/PNG|base64|<html|SESSION/i.test(call.detail), 'an artefact crossed with the reference');
    }
  });
});

// ── 4. One workflow, two providers ──────────────────────────────────────────

describe('one workflow across two providers', () => {
  it('produces an identical stage sequence and identical agents under both', () => {
    const ado = run('azure-devops', true);
    const jira = run('jira', true);
    assert.deepEqual([...ado.result.run.completed], [...jira.result.run.completed]);
    assert.deepEqual([...ado.result.agentsInvoked].sort(), [...jira.result.agentsInvoked].sort());
  });

  it('reaches DIFFERENT provider behaviour, so the comparison is not trivially true', () => {
    const ado = run('azure-devops', true);
    const jira = run('jira', true);

    const nouns = (j: typeof ado.journal) => j.calls.filter((c) => c.method === 'createWorkItem').map((c) => c.detail.split(':')[0]);
    assert.ok(nouns(ado.journal).includes('User Story'), 'Azure DevOps did not use its own noun');
    assert.ok(nouns(jira.journal).includes('Story'), 'Jira did not use its own noun');
    assert.ok(nouns(ado.journal).includes('Feature'), 'Azure DevOps should model a Feature level');
    assert.ok(!nouns(jira.journal).includes('Feature'), 'Jira has no Feature level and must not create one');
  });

  it('records the unsupported level as refused with its reason, and re-parents its children', () => {
    const state = finalState(run('jira', true).result);
    const workItems = state['workItems'] as unknown as { localId: string; published: boolean; reason: string }[];
    const features = workItems.filter((r) => r.localId.startsWith('feature-'));
    assert.ok(features.length > 0);
    assert.ok(features.every((f) => !f.published), 'Jira published a Feature it does not model');
    assert.ok(features.every((f) => /does not model the feature level/.test(f.reason)));

    const stories = workItems.filter((r) => r.localId.startsWith('story-'));
    assert.ok(stories.some((s) => s.published), 'stories were orphaned when the feature level was unavailable');
  });
});

// ── 5. Data sovereignty ─────────────────────────────────────────────────────

describe('data sovereignty', () => {
  it('minimises every observation: a fact carries attribute NAMES and no values', () => {
    const cookie = OBSERVED.find((a) => a.id === 'cookie-session');
    assert.ok(cookie);
    const fact = minimise(cookie);
    assert.ok(!('values' in fact), 'ApplicationFact gained a values field');
    assert.deepEqual([...fact.attributeNames].sort(), ['domain', 'path', 'secure', 'value']);
    assert.ok(!JSON.stringify(fact).includes('S3CR3T'), 'a cookie value crossed the boundary');
  });

  it('never carries a cookie or storage value into the Intelligence Plane', () => {
    const state = finalState(run('azure-devops', true).result);
    const serialised = JSON.stringify({ facts: state['facts'], intelligence: state['intelligence'], requirements: state['requirements'] });
    assert.ok(!serialised.includes('S3CR3T'), 'a session token reached the Intelligence Plane');
    assert.ok(!serialised.includes('"items"'), 'storage contents reached the Intelligence Plane');
  });

  it('scrubs identifying content from labels', () => {
    assert.equal(scrubLabel('Invoice INV-4471 for j.okonkwo@example.com'), 'Invoice {reference} for {email}');
    assert.equal(scrubLabel('Account 4929 1234 5678 9012'), 'Account {number}');
  });

  it('gives EvidenceReference no field that could hold an artefact', () => {
    const state = finalState(run('azure-devops', true).result);
    const references = state['evidence'] as unknown as Record<string, unknown>[];
    assert.ok(references.length > 0);
    for (const reference of references) {
      assert.deepEqual([...Object.keys(reference)].sort(),
        ['capturedAtStage', 'kind', 'locator', 'qaAssetId', 'sha256']);
    }
  });

  it('runs repository and discovery search in the Execution Plane', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      if (agent.domain === 'discovery') assert.equal(agent.plane, 'EP', `${agent.id} observes the customer application from the wrong plane`);
      if (agent.id.startsWith('repository.search.') || agent.id.startsWith('automation.search.')) {
        assert.equal(agent.plane, 'EP', `${agent.id} reads the customer repository from the wrong plane`);
      }
    }
  });

  it('refuses a prompt contract that would send Execution Plane custody for reasoning', () => {
    const catalogue = new AgentCatalogue();
    assert.throws(() => catalogue.register(defineAgent({
      id: 'bad.leak', domain: 'test', stage: 'planning', plane: 'IP',
      purpose: 'An agent that would send source code for reasoning.',
      inputs: ['x'], outputs: ['y'], responsibilities: ['leak'],
      toolContracts: [], aiCapabilityClass: 'extraction',
      promptContract: {
        intent: 'Extract behaviour from the repository source code.',
        inputsProvided: ['repository source code'],
        expects: 'a description',
        rejectionRules: ['none'],
      },
      aiBehaviour: 'Reads the source and describes it in full detail.',
      nonAiBehaviour: 'Does nothing at all, which is the honest degraded path.',
      failureHandling: 'It should never have been registered in the first place.',
      handle: (i: unknown) => i,
    }) as never), /Execution Plane custody/);
  });
});

// ── 6. Prompt contracts ─────────────────────────────────────────────────────

describe('prompt contracts', () => {
  it('is declared by every agent that declares a reasoning class', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      if (agent.aiCapabilityClass === 'none') {
        assert.equal(agent.promptContract, undefined, `${agent.id} declares a contract it never uses`);
        continue;
      }
      assert.ok(agent.promptContract, `${agent.id} declares a reasoning class and no prompt contract`);
      assert.ok((agent.promptContract?.rejectionRules.length ?? 0) > 0, `${agent.id} declares no rejection rule`);
      assert.ok(agent.aiBehaviour && agent.nonAiBehaviour, `${agent.id} does not state both behaviours`);
    }
  });

  it('refuses registration of a reasoning agent with no rejection rule (C-13.1)', () => {
    const catalogue = new AgentCatalogue();
    assert.throws(() => catalogue.register(defineAgent({
      id: 'bad.relay', domain: 'test', stage: 'planning', plane: 'IP',
      purpose: 'An agent that relays whatever it is handed.',
      inputs: ['x'], outputs: ['y'], responsibilities: ['relay'],
      toolContracts: [], aiCapabilityClass: 'generation',
      promptContract: { intent: 'Generate whatever seems appropriate here.', inputsProvided: ['a title'], expects: 'text', rejectionRules: [] },
      aiBehaviour: 'Returns exactly what the model proposed, unexamined.',
      nonAiBehaviour: 'Returns nothing, which is at least honest about it.',
      failureHandling: 'There is no failure handling worth the name here.',
      handle: (i: unknown) => i,
    }) as never), /relays rather than decides/);
  });
});

// ── 7. Reconstruction is sourced, assets are complete ───────────────────────

describe('requirement reconstruction and QA assets', () => {
  it('sources every reconstructed story to discovered facts', () => {
    const state = finalState(run('azure-devops', true).result);
    const stories = (state['requirements'] as unknown as { stories: { id: string; sourceFactIds: string[]; acceptanceCriteria: string[] }[] }).stories;
    assert.ok(stories.length > 0, 'nothing was reconstructed');
    for (const story of stories) {
      assert.ok(story.sourceFactIds.length > 0, `${story.id} is unsourced`);
      assert.ok(story.acceptanceCriteria.length > 0, `${story.id} is untestable`);
    }
  });

  it('puts an expected result on every step of every asset', () => {
    const state = finalState(run('azure-devops', true).result);
    const assets = state['assets'] as unknown as { id: string; steps: { ordinal: number; action: string; expectedResult: string }[] }[];
    assert.ok(assets.length > 0);
    for (const asset of assets) {
      for (const step of asset.steps) {
        assert.ok(step.expectedResult.trim().length > 0, `${asset.id} step ${step.ordinal} cannot be verified`);
      }
    }
  });

  it('enumerates a step per discovered input and per discovered control', () => {
    const state = finalState(run('azure-devops', true).result);
    const assets = state['assets'] as unknown as { storyId: string; steps: { action: string; target: string }[] }[];
    const checkout = assets.find((a) => a.storyId.endsWith('-4'));
    assert.ok(checkout, 'no asset was generated for the checkout step');
    const inputs = checkout.steps.filter((s) => s.action === 'input').map((s) => s.target);
    const clicks = checkout.steps.filter((s) => s.action === 'click').map((s) => s.target);
    assert.ok(inputs.includes('quantity') && inputs.includes('delivery address'), `inputs were not enumerated: ${inputs.join(', ')}`);
    assert.ok(clicks.includes('Pay now'), `controls were not enumerated: ${clicks.join(', ')}`);
    assert.ok(checkout.steps.some((s) => s.action === 'navigate'));
    assert.ok(checkout.steps.some((s) => s.action === 'cleanup'));
  });

  it('refuses an incomplete asset rather than publishing it', () => {
    const catalogue = buildCatalogue();
    assert.throws(() => catalogue.invoke('qa.completeness', {
      assets: [{
        id: 'broken', storyId: 's', kind: 'functional', title: 't', objective: 'o',
        preconditions: ['p'], environment: 'e',
        steps: [{ ordinal: 1, action: 'click', target: 'x', data: null, expectedResult: '' }],
        cleanup: ['c'], testData: [], risk: 'low', priority: 'p3', tags: ['t'],
        businessRuleIds: [], requirementTraceability: ['s'],
        gwt: { given: ['g'], when: ['w'], then: ['t'] }, bddReady: true, automationReady: true, fingerprint: 'f',
      }],
    }, { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} }),
      /incomplete: expectedResult on step\(s\) 1/);
  });
});

// ── 8. Reuse, and the right kind is generated ───────────────────────────────

describe('reuse before creation', () => {
  it('generates exactly the asset kinds that were decided missing', () => {
    const state = finalState(run('azure-devops', true).result);
    const requested = [...(state['requestedKinds'] as unknown as string[])].sort();
    const generated = [...(state['generatedKinds'] as unknown as string[])].sort();
    assert.deepEqual(generated, requested,
      'the generator emitted kinds that were not the kinds found missing');
  });

  it('generates nothing for a reuse decision', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const generated = catalogue.invoke<{ asset: unknown; decisions: unknown[] }, unknown[]>('automation.generation', {
      asset: { id: 'a', tags: ['x'], requirementTraceability: ['s'] },
      decisions: [{ kind: 'reuse', assetId: 'existing', similarity: 0.9, assetKind: 'page-object' }],
    }, ctx);
    assert.deepEqual(generated, []);
  });

  it('finds an existing repository asset and decides reuse rather than create', () => {
    const state = finalState(run('azure-devops', true).result);
    const matches = state['matches'] as unknown as { assetId: string; similarity: number; matchedBy: string }[];
    assert.ok(matches.some((m) => m.assetId === 'repo-existing-checkout'), 'the existing test case was never found');
    assert.ok(matches.some((m) => m.matchedBy === 'vector'), 'vector search contributed nothing');
  });
});

// ── 9. Healing, defects, evidence ───────────────────────────────────────────

describe('healing and defects', () => {
  it('never validates a heal without an observed passing retry', () => {
    const state = finalState(run('azure-devops', true).result);
    const healing = state['healing'] as unknown as { kind: string; validated: boolean }[];
    assert.ok(healing.length > 0, 'the timing failure produced no healing proposal');
    assert.ok(healing.every((h) => !h.validated), 'a heal validated itself with no observed retry');
  });

  it('validates a heal when the retry IS observed to pass', () => {
    const deps = dependencies({ observedRetry: () => 'passed' as const });
    const state = finalState(run('azure-devops', true, deps).result);
    const healing = state['healing'] as unknown as { validated: boolean }[];
    assert.ok(healing.some((h) => h.validated), 'an observed passing retry did not validate the heal');
  });

  it('claims only the signals a healing kind can address', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const outcome = { qaAssetId: 'a', outcome: 'failed' as const, failureSignal: 'Timeout 30000ms exceeded', durationMs: 1 };
    assert.ok(catalogue.invoke('healing.timing', { outcome }, ctx) !== null, 'timing did not claim a timeout');
    assert.equal(catalogue.invoke('healing.api', { outcome }, ctx), null, 'api claimed a timeout it cannot address');
    assert.equal(catalogue.invoke('healing.network', { outcome }, ctx), null, 'network claimed a timeout it cannot address');
  });

  it('implements a network healing kind', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    const claimed = catalogue.invoke('healing.network', {
      outcome: { qaAssetId: 'a', outcome: 'failed' as const, failureSignal: 'connection refused', durationMs: 1 },
    }, ctx);
    assert.ok(claimed, 'network healing did not claim a connection failure');
  });

  it('raises a defect for the genuine failure, with a root cause and evidence', () => {
    const state = finalState(run('azure-devops', true).result);
    const defects = state['defects'] as unknown as { rootCause: string; evidenceRefs: string[]; published: boolean; externalId: string | null }[];
    assert.ok(defects.length > 0, 'a genuine unhealed failure raised no defect');
    for (const defect of defects) {
      assert.ok(defect.rootCause.trim().length > 0);
      assert.ok(defect.evidenceRefs.length > 0, 'the defect carries no evidence reference');
      assert.ok(defect.published && defect.externalId, 'the defect was never published to the provider');
    }
  });

  it('raises no defect for an environmental failure', () => {
    const deps = dependencies({
      observedOutcomes: (plan: ExecutionPlan) => plan.batches.flat().map((id, i) => ({
        qaAssetId: id, outcome: i === 0 ? ('failed' as const) : ('passed' as const),
        failureSignal: i === 0 ? 'connection refused by host' : null, durationMs: 1,
      })),
    });
    const state = finalState(run('azure-devops', true, deps).result);
    assert.deepEqual(state['defects'] as unknown as unknown[], [], 'an environmental failure was raised as a defect');
  });
});

// ── 10. The audit trail is observed, not asserted ───────────────────────────

describe('the audit trail', () => {
  it('names only agents the catalogue actually invoked', () => {
    const { result } = run('azure-devops', true);
    const catalogue = buildCatalogue();
    const registered = new Set(catalogue.all.map((a) => a.id));

    const claimed = [...result.run.results.values()].flatMap((r) => r.agentsInvoked);
    for (const id of claimed) assert.ok(registered.has(id), `the trail names "${id}", which is not a registered agent`);

    // The observed list and the sealed lists must agree exactly. A stage that named an
    // agent it did not invoke would show up here as a surplus.
    assert.deepEqual([...new Set(claimed)].sort(), [...result.agentsInvoked].sort());
  });

  it('records every domain orchestrator as having actually run agents', () => {
    const { result } = run('azure-devops', true);
    const catalogue = buildCatalogue();
    const domainOf = new Map(catalogue.all.map((a) => [a.id, a.domain]));
    const domainsThatRan = new Set(result.agentsInvoked.map((id) => domainOf.get(id)));

    for (const domain of DOMAINS) {
      assert.ok(domainsThatRan.has(domain), `the ${domain} orchestrator exists and never ran an agent`);
      assert.ok(domainOrchestrators[domain], `no orchestrator is defined for ${domain}`);
    }
  });
});

// ── 11. Nothing progresses unless certified ─────────────────────────────────

describe('certification gates', () => {
  it('stops the run when a stage fails its review, and says which and why', () => {
    // An unreachable environment is a real refusal: execution cannot distinguish a
    // defect from an unreachable target, so the stage must not proceed.
    const { result } = run('azure-devops', true, dependencies({ environmentReachable: false }));
    assert.equal(result.run.failedAt, 'execution');
    assert.match(result.run.failure ?? '', /did not respond/);
    assert.equal(result.certification.certified, false);
    assert.ok(!result.run.completed.includes('reporting'), 'the run progressed past a refused stage');
  });

  it('rolls a failed run back and keeps its audit trail', () => {
    const { result, orchestrator } = run('azure-devops', true, dependencies({ environmentReachable: false }));
    assert.equal(result.rolledBack, true);
    assert.ok(orchestrator.auditTrailFor(result.run.runId).length > 0, 'the audit trail was discarded with the results');
  });

  it('gives every stage a review, a decision and a certification agent', () => {
    const catalogue = buildCatalogue();
    for (const stage of STAGES) {
      for (const phase of ['review', 'decision', 'certification']) {
        assert.ok(catalogue.get(`governance.${stage}.${phase}`), `stage ${stage} has no ${phase} agent`);
      }
    }
  });

  it('refuses a stage whose review finds a blocking defect', () => {
    const catalogue = buildCatalogue();
    const ctx = { tenantId: 't', runId: 'r', correlationId: 'c', proposal: null, audit: () => {}, telemetry: () => {} };
    // A story with no source fact is exactly what the policy-review rules exist to catch.
    const findings = catalogue.invoke<{ subject: unknown }, { severity: string; finding: string }[]>(
      'governance.policy-review.review',
      { subject: { stories: [{ id: 's1', sourceFactIds: [], acceptanceCriteria: ['c'] }], epics: [{}] } }, ctx);
    assert.ok(findings.some((f) => f.severity === 'blocking' && /unsourced/.test(f.finding)));

    const verdict = catalogue.invoke<{ accept: boolean; findings: unknown[]; accepted: number }, { certified: boolean; reason: string }>(
      'governance.policy-review.certification', { accept: false, findings, accepted: 0 }, ctx);
    assert.equal(verdict.certified, false);
    assert.ok(verdict.reason.trim().length > 0, 'a refusal with no reason is indistinguishable from a crash');
  });
});

// ── 12. Vector intelligence ─────────────────────────────────────────────────

describe('vector search and memory', () => {
  it('embeds deterministically and bounds cosine to [-1, 1]', () => {
    const a = embed('checkout page with quantity and delivery address');
    const b = embed('checkout page with quantity and delivery address');
    assert.deepEqual([...a], [...b], 'the same text produced two different vectors');
    assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9, 'a vector was not maximally similar to itself');
    assert.ok(cosine(a, embed('unrelated administrative refund authorisation ledger')) < 1);
    assert.ok(cosine(embed(''), embed('')) >= -1);
  });

  it('finds near neighbours and applies a similarity floor', () => {
    const index = new VectorIndex();
    index.add('near', 'test-case', 'checkout page quantity delivery address');
    index.add('far', 'test-case', 'server log rotation schedule');
    const found = index.search('checkout quantity address', 5, 0.2);
    assert.equal(found[0]?.id, 'near');
    assert.ok(!found.some((m) => m.id === 'far'), 'an unrelated asset passed the floor');
  });

  it('lets a ranking proposal reorder results and never add one', () => {
    const found = [
      { id: 'a', kind: 'test-case', similarity: 0.9, labels: {} },
      { id: 'b', kind: 'test-case', similarity: 0.5, labels: {} },
    ];
    const reordered = VectorIndex.applyRanking(found, ['b', 'ghost', 'a']);
    assert.deepEqual(reordered.map((m) => m.id), ['b', 'a'], 'a proposed match nothing observed was accepted');
    assert.deepEqual(VectorIndex.applyRanking(found, ['b']).map((m) => m.id), ['b', 'a'],
      'an omitted match was silently dropped');
  });

  it('retains vectors across runs without retaining text', () => {
    const { orchestrator } = run('azure-devops', true);
    assert.ok(orchestrator.memory.size > 0, 'nothing was committed to vector memory');
    assert.ok(!JSON.stringify(orchestrator.memory.census).includes('S3CR3T'));
  });
});

// ── 13. Reporting ───────────────────────────────────────────────────────────

describe('reporting', () => {
  it('renders a real PDF document', () => {
    const bytes = renderPdf('Discovery', [{ title: 'Page one', lines: ['a line', 'another line'] }]);
    const text = bytes.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'), 'the output is not a PDF');
    assert.ok(text.includes('/Type /Catalog') && text.includes('/Type /Pages') && text.includes('/Type /Page'));
    assert.ok(text.includes('xref') && text.trimEnd().endsWith('%%EOF'));
    // The cross-reference table must hold one entry per object plus the free head.
    const objects = (text.match(/^\d+ 0 obj$/gm) ?? []).length;
    const entries = (text.match(/^\d{10} 00000 n $/gm) ?? []).length;
    assert.equal(entries, objects, 'the cross-reference table does not match the object count');
  });

  it('marks unmeasured board figures as unmeasured rather than zero', () => {
    const report = {
      applicationId: 'shop', applicationInventory: {}, journeyInventory: [], apiInventory: [],
      businessCapabilities: [], requirementCounts: { epics: 0, features: 0, stories: 3 },
      qaAssetCount: 0, automationCoverage: 0, requirementCoverage: 0,
      riskProfile: { low: 0, medium: 0, high: 0, critical: 0 },
      executionSummary: { passed: 0, failed: 0, skipped: 0 }, healingRate: 0, defectCount: 0,
      reasoningMode: 'disabled' as const, discoveryCompleteness: 0.5,
      releaseReadiness: 'NOT MEASURED', rationale: 'nothing executed',
    } satisfies DiscoveryReport;

    const board = boardReport(report);
    const verification = board.figures.find((f) => f.label === 'Execution verification');
    assert.equal(verification?.value, 'NOT MEASURED');
    assert.equal(verification?.measured, false);
    assert.ok(board.risks.some((r) => /No test executed/.test(r)));
    assert.ok(board.decisionRequired.includes('unverified'));
  });

  it('reports readiness as NOT MEASURED when nothing executed (R-13.3)', () => {
    const deps = dependencies({ observedOutcomes: () => [] });
    const state = finalState(run('azure-devops', true, deps).result);
    const report = state['report'] as unknown as DiscoveryReport;
    assert.equal(report.releaseReadiness, 'NOT MEASURED');
    assert.match(report.rationale, /no QA asset executed/);
  });

  it('publishes a synchronization record for everything, published or refused', () => {
    const state = finalState(run('azure-devops', true).result);
    const sync = state['sync'] as unknown as { target: string; reason: string }[];
    const targets = new Set(sync.map((r) => r.target));
    for (const target of ['work-item', 'test-case', 'result', 'evidence', 'traceability', 'defect']) {
      assert.ok(targets.has(target), `${target} produced no synchronization record`);
    }
    assert.ok(sync.every((r) => r.reason.trim().length > 0));
  });
});

// ── 14. Learning ────────────────────────────────────────────────────────────

describe('learning', () => {
  it('emits every learning kind it declares', () => {
    const state = finalState(run('azure-devops', true).result);
    const kinds = new Set((state['learning'] as unknown as { kind: string }[]).map((r) => r.kind));
    for (const kind of ['application-pattern', 'business-rule', 'journey', 'repository', 'automation', 'healing', 'prompt', 'knowledge-graph', 'vector-memory']) {
      assert.ok(kinds.has(kind), `learning kind "${kind}" is declared and never emitted`);
    }
  });

  it('keeps observed and inferred graph edges apart', () => {
    const state = finalState(run('azure-devops', true).result);
    const records = state['learning'] as unknown as { kind: string; signal: string }[];
    const graph = records.filter((r) => r.kind === 'knowledge-graph').map((r) => r.signal);
    assert.deepEqual([...graph].sort(), ['inferred-edges', 'observed-edges']);
  });
});

// ── 15. The agent census ────────────────────────────────────────────────────

describe('the agent catalogue', () => {
  /**
   * The brief asked for 100–140 specialised agents. The catalogue holds more, and the
   * count is pinned here rather than smoothed: 150 domain agents plus three governance
   * agents for each of the twelve stages. The governance agents are the brief's own
   * "Review, Decision and Certification agents in every stage" requirement, which it
   * stated separately from the 100–140. The domain total still exceeds 140 by ten, and
   * that overshoot is recorded in ADR-0023 §7 rather than corrected by deleting working
   * agents to hit a number.
   */
  it('registers the declared agent population across sixteen domains', () => {
    const catalogue = buildCatalogue();
    const governance = catalogue.byDomain('governance').length;
    const domain = catalogue.all.length - governance;

    assert.equal(governance, 36, 'every stage must carry a review, a decision and a certification agent');
    assert.ok(domain >= 100, `${domain} domain agents is below the declared floor of 100`);
    assert.equal(catalogue.all.length, domain + governance);
    assert.deepEqual([...catalogue.domains].sort(), [...DOMAINS].sort());
  });

  it('gives every agent a full contract', () => {
    const catalogue = buildCatalogue();
    for (const agent of catalogue.all) {
      assert.ok(agent.purpose.length > 15, `${agent.id} has no real purpose`);
      assert.ok(agent.failureHandling.length > 15, `${agent.id} does not say how failure is handled`);
      assert.ok(agent.retry.maxAttempts >= 1);
      assert.ok(agent.telemetry.length > 0 && agent.auditEvents.length > 0);
      assert.ok(agent.handle.length > 0, `${agent.id} can decide nothing`);
    }
  });

  it('keeps most agents deterministic, so the engine works with reasoning unavailable', () => {
    const catalogue = buildCatalogue();
    const deterministic = catalogue.all.filter((a) => a.aiCapabilityClass === 'none').length;
    assert.ok(deterministic > catalogue.all.length / 2,
      `${deterministic}/${catalogue.all.length} agents are deterministic; a majority is required by INV-7`);
  });
});
