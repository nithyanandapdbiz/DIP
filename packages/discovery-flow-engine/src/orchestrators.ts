/**
 * The master orchestrator and sixteen domain orchestrators.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 15-configuration-model.md · 16-runtime-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-11.11 (no framework code branches on a capability identity)
 *                  C-12.1 (implements all twelve stages)
 *
 * THE MASTER ORCHESTRATOR RUNS THE ONE LIFECYCLE. IT DOES NOT DEFINE ONE.
 * `DiscoveryFlowOrchestrator` accepts a request, loads tenant, AI and discovery
 * configuration, resolves four adapters, and hands the capability to the framework's
 * twelve-stage runner. It has no stage list and could not have one — the runner is the
 * only thing that can mint a sealed stage result.
 *
 * THE DOMAIN ORCHESTRATORS ACTUALLY SEQUENCE THEIR AGENTS.
 * The audit of the first capability found eleven domain orchestrators that enumerated
 * their agents and were never called by any stage — structurally present, functionally
 * inert. Here each `coordinate` invokes its domain's agents in order and returns the
 * domain's result, and the stages call `coordinate` rather than reaching past it. An
 * orchestrator nothing calls would fail the conformance suite, which asserts that every
 * domain contributed at least one observed agent invocation.
 *
 * WHERE `discovery.aiEnabled` BECOMES `ai.enabled`.
 * The brief's configuration surface is `discovery.aiEnabled`. The framework reads the
 * capability-neutral `ai.enabled`, because framework code that read a capability's own
 * key would be branching on a capability identity. The translation happens here, in the
 * capability that owns the surface — one line, in the right place.
 */
import {
  runCapability, certify, resolveReasoningMode, gateProposals, proposalsFrom,
  invocationRecorder, VectorMemory,
  type AdapterRegistry, type AdapterSet, type AgentCatalogue, type AgentContext,
  type Capability, type CertificationOutcome, type InvocationRecorder, type ProposalSource,
  type ReasoningLedger, type ReasoningMode, type RunOutcome, type WorkItemAdapter,
} from '@dbiz/capability-framework';
import type {
  ApiContract, ApplicationFact, ApplicationIntelligence, ApplicationModel, AutomationAsset,
  BusinessCapability, BusinessEntity, BusinessRule, Defect, DiscoveryScope, EvidenceReference,
  ExecutionPlan, Graph, HealingAction, Journey, LearningRecord, ObservedArtefact, Outcome,
  QaAsset, RepositoryAssetKind, RepositoryMatch, ReuseDecision, Relationship, SyncRecord,
  TestOutcome, VirtualEpic, VirtualFeature, VirtualStory,
} from './model.js';

export const DOMAINS = [
  'scope', 'discovery', 'appintel', 'appmodel', 'requirement', 'workitem',
  'qa', 'repository', 'automation', 'execution', 'healing', 'defect',
  'sync', 'reporting', 'learning', 'governance',
] as const;
export type Domain = (typeof DOMAINS)[number];

/**
 * A domain orchestrator.
 *
 * It coordinates its domain's agents within one stage. It receives the catalogue and a
 * context factory; it cannot reach the stage runner, which is what stops it becoming a
 * workflow of its own.
 */
export interface DomainOrchestrator<I, O> {
  readonly domain: Domain;
  readonly purpose: string;
  coordinate(input: I, agents: AgentCatalogue, ctx: AgentContextFactory): O;
}

/** Builds a per-agent context, so each agent's proposal is gated by the reasoning mode. */
export type AgentContextFactory = (agentId: string) => AgentContext;

export function defineDomainOrchestrator<I, O>(
  domain: Domain,
  purpose: string,
  coordinate: (input: I, agents: AgentCatalogue, ctx: AgentContextFactory) => O,
): DomainOrchestrator<I, O> {
  return { domain, purpose, coordinate };
}

// ── The sixteen domain orchestrators ────────────────────────────────────────

export interface ScopeResult {
  readonly scope: DiscoveryScope;
  readonly inScope: (url: string) => boolean;
  readonly boundarySummary: string;
  readonly requestsPerSecond: number;
  readonly maxDepth: number;
  readonly maxArtefacts: number;
  readonly authentication: { readonly mode: string; readonly credentialsHandledBy: string };
}

export const scopeOrchestrator = defineDomainOrchestrator<{ scope: DiscoveryScope }, ScopeResult>(
  'scope', 'Validate the discovery request and bind every later request to a fail-closed boundary.',
  (input, agents, ctx) => {
    const scope = agents.invoke<{ scope: DiscoveryScope }, DiscoveryScope>(
      'scope.target-validation', { scope: input.scope }, ctx('scope.target-validation'));
    const boundary = agents.invoke<{ scope: DiscoveryScope }, { inScope: (u: string) => boolean; summary: string }>(
      'scope.boundary-enforcement', { scope }, ctx('scope.boundary-enforcement'));
    const authentication = agents.invoke<{ scope: DiscoveryScope }, { mode: string; credentialsHandledBy: string }>(
      'scope.authentication', { scope }, ctx('scope.authentication'));
    const rate = agents.invoke<{ scope: DiscoveryScope }, { requestsPerSecond: number; rationale: string }>(
      'scope.rate-limit', { scope }, ctx('scope.rate-limit'));
    const depth = agents.invoke<{ scope: DiscoveryScope }, { maxDepth: number; maxArtefacts: number }>(
      'scope.depth-policy', { scope }, ctx('scope.depth-policy'));

    return {
      scope, inScope: boundary.inScope, boundarySummary: boundary.summary,
      requestsPerSecond: rate.requestsPerSecond, maxDepth: depth.maxDepth,
      maxArtefacts: depth.maxArtefacts, authentication,
    };
  });

export interface DiscoveryResult {
  readonly observed: readonly ObservedArtefact[];
  readonly routes: readonly string[];
  readonly contracts: readonly ApiContract[];
  readonly navigationEdges: readonly Relationship[];
  readonly journeys: readonly Journey[];
  readonly cookies: readonly { readonly name: string; readonly scope: string }[];
  readonly storageKeys: readonly string[];
  readonly events: readonly string[];
  readonly refusedFrames: readonly string[];
}

export const discoveryOrchestrator = defineDomainOrchestrator<
  { observed: readonly ObservedArtefact[]; scope: DiscoveryScope; inScope: (u: string) => boolean }, DiscoveryResult>(
  'discovery', 'Run every surface probe inside the Execution Plane and assemble what was observed.',
  (input, agents, ctx) => {
    const call = <O>(id: string): O => agents.invoke<typeof input, O>(id, input, ctx(id));

    const pages = call<readonly ObservedArtefact[]>('discovery.web');
    const routes = call<readonly string[]>('discovery.routes');
    const spa = call<readonly ObservedArtefact[]>('discovery.spa');
    const rawContracts = call<readonly ApiContract[]>('discovery.api');
    const contracts = agents.invoke<{ contracts: readonly ApiContract[] }, readonly ApiContract[]>(
      'discovery.microservices', { contracts: rawContracts }, ctx('discovery.microservices'));
    const shadow = call<readonly ObservedArtefact[]>('discovery.shadow-dom');
    const frames = call<{ sameOrigin: readonly ObservedArtefact[]; refused: readonly string[] }>('discovery.iframes');
    const auth = call<readonly ObservedArtefact[]>('discovery.authentication');
    const navigationEdges = call<readonly Relationship[]>('discovery.navigation');
    const forms = call<readonly ObservedArtefact[]>('discovery.forms');
    const controls = call<readonly ObservedArtefact[]>('discovery.controls');
    const dynamic = call<readonly ObservedArtefact[]>('discovery.dynamic-pages');
    const files = call<readonly ObservedArtefact[]>('discovery.files');
    const downloads = call<readonly ObservedArtefact[]>('discovery.downloads');
    const sockets = call<readonly ObservedArtefact[]>('discovery.websockets');
    const events = call<readonly string[]>('discovery.events');
    const cookies = call<readonly { name: string; scope: string }[]>('discovery.cookies');
    const storageKeys = call<readonly string[]>('discovery.storage');

    const journeys = agents.invoke<{ edges: readonly Relationship[]; pages: readonly ObservedArtefact[] }, readonly Journey[]>(
      'discovery.journeys', { edges: navigationEdges, pages }, ctx('discovery.journeys'));

    // Deduplicated by id: the surface probes overlap deliberately — a form inside a
    // shadow root is found by two of them, and it is one artefact.
    const byId = new Map<string, ObservedArtefact>();
    for (const a of [...pages, ...spa, ...shadow, ...frames.sameOrigin, ...auth, ...forms, ...controls, ...dynamic, ...files, ...downloads, ...sockets]) {
      byId.set(a.id, a);
    }

    return {
      observed: [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
      routes, contracts, navigationEdges, journeys, cookies, storageKeys, events,
      refusedFrames: frames.refused,
    };
  });

export const applicationIntelligenceOrchestrator = defineDomainOrchestrator<
  { facts: readonly ApplicationFact[]; contracts: readonly ApiContract[]; edges: readonly Relationship[]; journeys: readonly Journey[] },
  ApplicationIntelligence>(
  'appintel', 'Reason over minimised facts to reconstruct services, entities, rules and graphs.',
  (input, agents, ctx) => {
    const services = agents.invoke<{ contracts: readonly ApiContract[] }, readonly string[]>(
      'appintel.services', { contracts: input.contracts }, ctx('appintel.services'));
    const apiContracts = agents.invoke<{ contracts: readonly ApiContract[]; facts: readonly ApplicationFact[] }, readonly ApiContract[]>(
      'appintel.api-contracts', { contracts: input.contracts, facts: input.facts }, ctx('appintel.api-contracts'));
    const entities = agents.invoke<{ facts: readonly ApplicationFact[]; contracts: readonly ApiContract[] }, readonly BusinessEntity[]>(
      'appintel.entities', { facts: input.facts, contracts: apiContracts }, ctx('appintel.entities'));
    const relationships = agents.invoke<{ observed: readonly Relationship[]; facts: readonly ApplicationFact[] }, readonly Relationship[]>(
      'appintel.relationships', { observed: input.edges, facts: input.facts }, ctx('appintel.relationships'));
    const businessRules = agents.invoke<{ facts: readonly ApplicationFact[] }, readonly BusinessRule[]>(
      'appintel.business-rules', { facts: input.facts }, ctx('appintel.business-rules'));
    const modules = agents.invoke<{ facts: readonly ApplicationFact[] }, readonly string[]>(
      'appintel.modules', { facts: input.facts }, ctx('appintel.modules'));
    const menus = agents.invoke<{ facts: readonly ApplicationFact[] }, readonly string[]>(
      'appintel.menus', { facts: input.facts }, ctx('appintel.menus'));
    const pages = agents.invoke<{ facts: readonly ApplicationFact[] }, readonly string[]>(
      'appintel.pages', { facts: input.facts }, ctx('appintel.pages'));
    const navigationGraph = agents.invoke<{ edges: readonly Relationship[] }, Graph>(
      'appintel.navigation-graph', { edges: relationships }, ctx('appintel.navigation-graph'));
    const journeyGraph = agents.invoke<{ journeys: readonly Journey[] }, Graph>(
      'appintel.journey-graph', { journeys: input.journeys }, ctx('appintel.journey-graph'));
    const dependencyGraph = agents.invoke<{ contracts: readonly ApiContract[]; edges: readonly Relationship[] }, Graph>(
      'appintel.dependency-graph', { contracts: apiContracts, edges: relationships }, ctx('appintel.dependency-graph'));

    const partial = {
      services, apiContracts, entities, relationships, businessRules,
      modules, menus, pages, navigationGraph, journeyGraph, dependencyGraph,
    };
    const knowledgeGraph = agents.invoke<{ intelligence: typeof partial }, Graph>(
      'appintel.knowledge-graph', { intelligence: partial }, ctx('appintel.knowledge-graph'));

    return { ...partial, knowledgeGraph };
  });

export const applicationModelOrchestrator = defineDomainOrchestrator<
  { applicationId: string; intelligence: ApplicationIntelligence; journeys: readonly Journey[] }, ApplicationModel>(
  'appmodel', 'Construct the application, domain, service, entity, navigation, journey and capability models.',
  (input, agents, ctx) => {
    const applicationId = agents.invoke<typeof input, string>('appmodel.application', input, ctx('appmodel.application'));
    const domains = agents.invoke<{ intelligence: ApplicationIntelligence }, readonly string[]>(
      'appmodel.domain', { intelligence: input.intelligence }, ctx('appmodel.domain'));
    const services = agents.invoke<{ intelligence: ApplicationIntelligence }, readonly string[]>(
      'appmodel.service', { intelligence: input.intelligence }, ctx('appmodel.service'));
    const entities = agents.invoke<{ intelligence: ApplicationIntelligence }, readonly BusinessEntity[]>(
      'appmodel.entity', { intelligence: input.intelligence }, ctx('appmodel.entity'));
    const relationships = agents.invoke<{ intelligence: ApplicationIntelligence; entities: readonly BusinessEntity[] }, readonly Relationship[]>(
      'appmodel.relationship', { intelligence: input.intelligence, entities }, ctx('appmodel.relationship'));
    const navigation = agents.invoke<{ intelligence: ApplicationIntelligence }, Graph>(
      'appmodel.navigation', { intelligence: input.intelligence }, ctx('appmodel.navigation'));
    const journeys = agents.invoke<{ journeys: readonly Journey[]; navigation: Graph }, readonly Journey[]>(
      'appmodel.journey', { journeys: input.journeys, navigation }, ctx('appmodel.journey'));
    const capabilities = agents.invoke<{ services: readonly string[]; journeys: readonly Journey[]; modules: readonly string[] }, readonly BusinessCapability[]>(
      'appmodel.business-capability',
      { services, journeys, modules: input.intelligence.modules }, ctx('appmodel.business-capability'));

    return { applicationId, domains, services, entities, relationships, navigation, journeys, capabilities };
  });

export interface RequirementResult {
  readonly epics: readonly VirtualEpic[];
  readonly features: readonly VirtualFeature[];
  readonly stories: readonly VirtualStory[];
}

export const requirementOrchestrator = defineDomainOrchestrator<
  { model: ApplicationModel; rules: readonly BusinessRule[]; facts: readonly ApplicationFact[] }, RequirementResult>(
  'requirement', 'Reconstruct virtual epics, features and stories, each sourced to discovered facts.',
  (input, agents, ctx) => {
    const epics = agents.invoke<{ capabilities: readonly BusinessCapability[]; applicationId: string }, readonly VirtualEpic[]>(
      'requirement.epic', { capabilities: input.model.capabilities, applicationId: input.model.applicationId }, ctx('requirement.epic'));
    const features = agents.invoke<{ epics: readonly VirtualEpic[]; model: ApplicationModel }, readonly VirtualFeature[]>(
      'requirement.feature', { epics, model: input.model }, ctx('requirement.feature'));

    let stories = agents.invoke<{ features: readonly VirtualFeature[]; model: ApplicationModel; rules: readonly BusinessRule[]; facts: readonly ApplicationFact[] }, readonly VirtualStory[]>(
      'requirement.story', { features, model: input.model, rules: input.rules, facts: input.facts }, ctx('requirement.story'));

    // Order matters and is not arbitrary: rules bind before criteria are derived from
    // them, and risk is scored before priority is derived from risk.
    stories = agents.invoke<{ stories: readonly VirtualStory[]; rules: readonly BusinessRule[] }, readonly VirtualStory[]>(
      'requirement.business-rules', { stories, rules: input.rules }, ctx('requirement.business-rules'));
    stories = agents.invoke<{ stories: readonly VirtualStory[]; model: ApplicationModel }, readonly VirtualStory[]>(
      'requirement.business-context', { stories, model: input.model }, ctx('requirement.business-context'));
    stories = agents.invoke<{ stories: readonly VirtualStory[]; rules: readonly BusinessRule[] }, readonly VirtualStory[]>(
      'requirement.acceptance-criteria', { stories, rules: input.rules }, ctx('requirement.acceptance-criteria'));
    stories = agents.invoke<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>(
      'requirement.keywords', { stories }, ctx('requirement.keywords'));
    stories = agents.invoke<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>(
      'requirement.risk', { stories }, ctx('requirement.risk'));
    stories = agents.invoke<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>(
      'requirement.priority', { stories }, ctx('requirement.priority'));
    stories = agents.invoke<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>(
      'requirement.complexity', { stories }, ctx('requirement.complexity'));
    stories = agents.invoke<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>(
      'requirement.dependencies', { stories }, ctx('requirement.dependencies'));

    const featureIds = new Map<string, string[]>();
    for (const s of stories) featureIds.set(s.featureId, [...(featureIds.get(s.featureId) ?? []), s.id]);

    return {
      epics: epics.map((e) => ({ ...e, featureIds: features.filter((f) => f.epicId === e.id).map((f) => f.id) })),
      features: features.map((f) => ({ ...f, storyIds: featureIds.get(f.id) ?? [] })),
      stories,
    };
  });

export const qaOrchestrator = defineDomainOrchestrator<
  { stories: readonly VirtualStory[]; facts: readonly ApplicationFact[]; rules: readonly BusinessRule[] },
  { readonly assets: readonly QaAsset[]; readonly uncovered: readonly string[]; readonly testData: readonly string[] }>(
  'qa', 'Generate, deduplicate and refuse-if-incomplete every QA asset for the reconstructed requirements.',
  (input, agents, ctx) => {
    const kinds = agents.byDomain('qa').filter((a) => a.id.startsWith('qa.') && !['qa.deduplication', 'qa.completeness', 'qa.traceability', 'qa.test-data'].includes(a.id));

    const generated = kinds.flatMap((a) => agents.invoke<typeof input, readonly QaAsset[]>(a.id, input, ctx(a.id)));
    const deduplicated = agents.invoke<{ assets: readonly QaAsset[] }, readonly QaAsset[]>(
      'qa.deduplication', { assets: generated }, ctx('qa.deduplication'));
    // Completeness runs AFTER deduplication and BEFORE anything downstream reads an
    // asset, so an incomplete asset can never reach automation or execution.
    const complete = agents.invoke<{ assets: readonly QaAsset[] }, readonly QaAsset[]>(
      'qa.completeness', { assets: deduplicated }, ctx('qa.completeness'));
    const coverage = agents.invoke<{ assets: readonly QaAsset[]; stories: readonly VirtualStory[] }, { covered: number; uncovered: readonly string[] }>(
      'qa.traceability', { assets: complete, stories: input.stories }, ctx('qa.traceability'));
    const testData = agents.invoke<{ assets: readonly QaAsset[] }, readonly string[]>(
      'qa.test-data', { assets: complete }, ctx('qa.test-data'));

    return { assets: complete, uncovered: coverage.uncovered, testData };
  });

export interface RepositoryInput {
  readonly assets: readonly QaAsset[];
  readonly index: import('@dbiz/capability-framework').VectorIndex;
  readonly repositoryAssets: readonly { readonly id: string; readonly kind: RepositoryAssetKind; readonly text: string; readonly repository: string }[];
}

export const repositoryOrchestrator = defineDomainOrchestrator<
  RepositoryInput,
  { readonly matches: readonly RepositoryMatch[]; readonly decisions: readonly ReuseDecision[]; readonly duplicates: readonly RepositoryMatch[] }>(
  'repository', 'Search the customer repository in the Execution Plane and decide reuse, merge or create.',
  (input, agents, ctx) => {
    const searchIds = agents.byDomain('repository').filter((a) => a.id.startsWith('repository.search.')).map((a) => a.id);

    const matches: RepositoryMatch[] = [];
    const decisions: ReuseDecision[] = [];

    for (const asset of input.assets) {
      const query = `${asset.title} ${asset.tags.join(' ')}`;
      const search = { query, index: input.index, assets: input.repositoryAssets };

      const lexical = searchIds.flatMap((id) => agents.invoke<typeof search, readonly RepositoryMatch[]>(id, search, ctx(id)));
      const vector = agents.invoke<typeof search, readonly RepositoryMatch[]>(
        'repository.vector-search', search, ctx('repository.vector-search'));
      const ranked = agents.invoke<{ matches: readonly RepositoryMatch[] }, readonly RepositoryMatch[]>(
        'repository.semantic-search', { matches: [...lexical, ...vector] }, ctx('repository.semantic-search'));

      matches.push(...ranked);
      decisions.push(agents.invoke<{ asset: QaAsset; wanted: RepositoryAssetKind; matches: readonly RepositoryMatch[] }, ReuseDecision>(
        'repository.reuse-decision', { asset, wanted: 'test-case', matches: ranked }, ctx('repository.reuse-decision')));
    }

    const duplicates = agents.invoke<{ matches: readonly RepositoryMatch[] }, readonly RepositoryMatch[]>(
      'repository.duplicate-detection', { matches }, ctx('repository.duplicate-detection'));

    return { matches, decisions, duplicates };
  });

export const automationOrchestrator = defineDomainOrchestrator<
  RepositoryInput,
  { readonly generated: readonly AutomationAsset[]; readonly requestedKinds: readonly RepositoryAssetKind[]; readonly generatedKinds: readonly RepositoryAssetKind[]; readonly gaps: readonly string[] }>(
  'automation', 'Search existing automation, detect the gaps, and generate only the kinds that are missing.',
  (input, agents, ctx) => {
    const searchIds = agents.byDomain('automation').filter((a) => a.id.startsWith('automation.search.')).map((a) => a.id);
    const AUTOMATION_KINDS: readonly RepositoryAssetKind[] = ['automation', 'feature-file', 'step-definition', 'page-object', 'locator', 'utility'];

    const generated: AutomationAsset[] = [];
    const requestedKinds: RepositoryAssetKind[] = [];

    for (const asset of input.assets) {
      const query = `${asset.title} ${asset.tags.join(' ')}`;
      const search = { query, index: input.index, assets: input.repositoryAssets };
      const found = searchIds.flatMap((id) => agents.invoke<typeof search, readonly RepositoryMatch[]>(id, search, ctx(id)));

      // One decision PER KIND. This is what lets the generator know which kind was
      // missing rather than only how many were.
      const decisions = AUTOMATION_KINDS.map((wanted) =>
        agents.invoke<{ asset: QaAsset; wanted: RepositoryAssetKind; matches: readonly RepositoryMatch[] }, ReuseDecision>(
          'repository.reuse-decision', { asset, wanted, matches: found }, ctx('repository.reuse-decision')));

      const gap = agents.invoke<{ decisions: readonly ReuseDecision[] }, { generate: readonly RepositoryAssetKind[]; reuse: number; gaps: readonly string[] }>(
        'automation.gap-detection', { decisions }, ctx('automation.gap-detection'));
      requestedKinds.push(...gap.generate);

      generated.push(...agents.invoke<{ asset: QaAsset; decisions: readonly ReuseDecision[] }, readonly AutomationAsset[]>(
        'automation.generation', { asset, decisions }, ctx('automation.generation')));
    }

    return {
      generated, requestedKinds,
      generatedKinds: generated.map((a) => a.kind),
      gaps: [...new Set(requestedKinds)].map((k) => `${k} was missing for at least one asset`),
    };
  });

export const workItemOrchestrator = defineDomainOrchestrator<
  { adapter: WorkItemAdapter; requirements: RequirementResult; assets: readonly QaAsset[] },
  { readonly records: readonly SyncRecord[]; readonly published: ReadonlyMap<string, string> }>(
  'workitem', 'Publish the reconstructed hierarchy through the work-item adapter, level by level.',
  (input, agents, ctx) => {
    const published = new Map<string, string>();
    const records: SyncRecord[] = [];

    // Levels are published parent-first, and each level's provider identifiers are fed
    // into the next. A child cannot be published before its parent has an identifier,
    // which is why this is a sequence rather than a fan-out.
    const levels = ['workitem.epic', 'workitem.feature', 'workitem.story', 'workitem.task'] as const;
    for (const id of levels) {
      const produced = agents.invoke<Record<string, unknown>, readonly SyncRecord[]>(id, {
        adapter: input.adapter, epics: input.requirements.epics,
        features: input.requirements.features, stories: input.requirements.stories, published,
      }, ctx(id));
      for (const record of produced) {
        records.push(record);
        if (record.published && record.externalId) published.set(record.localId, record.externalId);
      }
    }

    agents.invoke<{ stories: readonly VirtualStory[]; adapter: WorkItemAdapter }, { labels: readonly string[]; components: readonly string[]; levelNouns: Readonly<Record<string, string>> }>(
      'workitem.labels-components',
      { stories: input.requirements.stories, adapter: input.adapter },
      ctx('workitem.labels-components'));

    const links = input.assets
      .map((a) => ({ workItemId: published.get(a.storyId), testId: a.id }))
      .filter((l): l is { workItemId: string; testId: string } => l.workItemId !== undefined);
    records.push(...agents.invoke<{ adapter: WorkItemAdapter; links: typeof links }, readonly SyncRecord[]>(
      'workitem.traceability', { adapter: input.adapter, links }, ctx('workitem.traceability')));

    return { records, published };
  });

export const executionOrchestrator = defineDomainOrchestrator<
  {
    assets: readonly QaAsset[]; stories: readonly VirtualStory[]; maxParallel: number;
    reachable: boolean;
    /** Called AFTER planning. Outcomes are observed for the plan that actually ran. */
    observedFor: (plan: ExecutionPlan) => readonly TestOutcome[];
  },
  { readonly plan: ExecutionPlan; readonly outcomes: readonly TestOutcome[]; readonly progress: { completed: number; failing: number } }>(
  'execution', 'Plan, validate the environment, run and monitor inside the Execution Plane.',
  (input, agents, ctx) => {
    let plan = agents.invoke<{ assets: readonly QaAsset[]; stories: readonly VirtualStory[] }, ExecutionPlan>(
      'execution.planner', { assets: input.assets, stories: input.stories }, ctx('execution.planner'));
    plan = agents.invoke<{ plan: ExecutionPlan; maxParallel: number }, ExecutionPlan>(
      'execution.batch-optimiser', { plan, maxParallel: input.maxParallel }, ctx('execution.batch-optimiser'));
    plan = agents.invoke<{ plan: ExecutionPlan; maxParallel: number }, ExecutionPlan>(
      'execution.parallel-scheduler', { plan, maxParallel: input.maxParallel }, ctx('execution.parallel-scheduler'));
    plan = agents.invoke<{ plan: ExecutionPlan; reachable: boolean }, ExecutionPlan>(
      'execution.environment-validation', { plan, reachable: input.reachable }, ctx('execution.environment-validation'));

    const outcomes = agents.invoke<{ plan: ExecutionPlan; observed: readonly TestOutcome[] }, readonly TestOutcome[]>(
      'execution.runner', { plan, observed: input.observedFor(plan) }, ctx('execution.runner'));
    const progress = agents.invoke<{ outcomes: readonly TestOutcome[] }, { running: number; completed: number; failing: number }>(
      'execution.live-monitor', { outcomes }, ctx('execution.live-monitor'));

    return { plan, outcomes, progress };
  });

export const healingOrchestrator = defineDomainOrchestrator<
  { outcomes: readonly TestOutcome[]; observedRetry: (a: HealingAction) => Outcome | null },
  { readonly actions: readonly HealingAction[]; readonly learning: readonly LearningRecord[] }>(
  'healing', 'Propose healing per kind and validate each proposal against an observed retry.',
  (input, agents, ctx) => {
    const kindAgents = agents.byDomain('healing').filter((a) => a.id !== 'healing.validation' && a.id !== 'healing.learning-feed');

    const actions: HealingAction[] = [];
    for (const outcome of input.outcomes.filter((o) => o.outcome === 'failed')) {
      for (const agent of kindAgents) {
        const proposed = agents.invoke<{ outcome: TestOutcome }, HealingAction | null>(agent.id, { outcome }, ctx(agent.id));
        if (!proposed) continue;
        // Validation is a separate agent taking an OBSERVED retry. Nothing here can
        // mark an action validated on its own authority.
        actions.push(agents.invoke<{ action: HealingAction; observedRetry: Outcome | null }, HealingAction>(
          'healing.validation', { action: proposed, observedRetry: input.observedRetry(proposed) }, ctx('healing.validation')));
      }
    }

    return {
      actions,
      learning: agents.invoke<{ actions: readonly HealingAction[] }, readonly LearningRecord[]>(
        'healing.learning-feed', { actions }, ctx('healing.learning-feed')),
    };
  });

export const defectOrchestrator = defineDomainOrchestrator<
  {
    outcomes: readonly TestOutcome[]; assets: readonly QaAsset[]; stories: readonly VirtualStory[];
    healing: readonly HealingAction[]; evidence: readonly EvidenceReference[];
    existing: readonly Defect[]; adapter: import('@dbiz/capability-framework').ExecutionAdapter;
  },
  readonly Defect[]>(
  'defect', 'Raise defects only for genuine failures, and publish them through the adapter.',
  (input, agents, ctx) => {
    const assetById = new Map(input.assets.map((a) => [a.id, a]));
    const storyById = new Map(input.stories.map((s) => [s.id, s]));
    const raised: Defect[] = [];

    for (const outcome of input.outcomes) {
      const genuineness = agents.invoke<{ outcome: TestOutcome; healing: readonly HealingAction[] }, { genuine: boolean; reason: string }>(
        'defect.genuineness', { outcome, healing: input.healing }, ctx('defect.genuineness'));
      if (!genuineness.genuine) continue;

      const asset = assetById.get(outcome.qaAssetId);
      if (!asset) continue;

      const rootCause = agents.invoke<{ outcome: TestOutcome; asset: QaAsset }, string>(
        'defect.root-cause', { outcome, asset }, ctx('defect.root-cause'));
      const businessImpact = agents.invoke<{ asset: QaAsset; story: VirtualStory | undefined }, string>(
        'defect.business-impact', { asset, story: storyById.get(asset.storyId) }, ctx('defect.business-impact'));
      const evidenceRefs = agents.invoke<{ qaAssetId: string; evidence: readonly EvidenceReference[] }, readonly string[]>(
        'defect.evidence-binding', { qaAssetId: outcome.qaAssetId, evidence: input.evidence }, ctx('defect.evidence-binding'));

      const title = `${asset.title} failed: ${outcome.failureSignal ?? 'no signal'}`;
      const duplicateOf = agents.invoke<{ title: string; existing: readonly Defect[] }, string | null>(
        'defect.duplicate-search', { title, existing: [...input.existing, ...raised] }, ctx('defect.duplicate-search'));

      raised.push({
        id: `defect-${outcome.qaAssetId}`, title, qaAssetId: outcome.qaAssetId, storyId: asset.storyId,
        rootCause, businessImpact, evidenceRefs, duplicateOf, published: false, externalId: null,
      });
    }

    return agents.invoke<{ adapter: typeof input.adapter; defects: readonly Defect[] }, readonly Defect[]>(
      'defect.publication', { adapter: input.adapter, defects: raised }, ctx('defect.publication'));
  });

export const syncOrchestrator = defineDomainOrchestrator<
  Record<string, unknown>, readonly SyncRecord[]>(
  'sync', 'Publish work items, test cases, results, evidence references, traceability and defects.',
  (input, agents, ctx) => {
    const container = agents.invoke<Record<string, unknown>, { containerId: string; groupingId: string; records: readonly SyncRecord[] }>(
      'sync.container', input, ctx('sync.container'));
    const withGrouping = { ...input, groupingId: container.groupingId };

    return [
      ...container.records,
      ...agents.invoke<typeof withGrouping, readonly SyncRecord[]>('sync.test-cases', withGrouping, ctx('sync.test-cases')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.results', input, ctx('sync.results')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.evidence', input, ctx('sync.evidence')),
      ...agents.invoke<typeof withGrouping, readonly SyncRecord[]>('sync.traceability', withGrouping, ctx('sync.traceability')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.defects', input, ctx('sync.defects')),
    ];
  });

export const learningOrchestrator = defineDomainOrchestrator<
  Record<string, unknown>, readonly LearningRecord[]>(
  'learning', 'Fold every learnable signal from this run into records the next run can use.',
  (input, agents, ctx) => agents.byDomain('learning')
    .flatMap((a) => agents.invoke<typeof input, readonly LearningRecord[]>(a.id, input, ctx(a.id))));

/**
 * The reporting orchestrator.
 *
 * Sequenced rather than fanned out because the executive dashboard, the PDF and the
 * board report all consume the assembled report, and assembling it twice would let the
 * two copies disagree.
 */
export const reportingOrchestrator = defineDomainOrchestrator<
  Record<string, unknown>, Record<string, unknown>>(
  'reporting', 'Assemble the discovery report and render the executive and board artefacts from it.',
  (input, agents, ctx) => {
    const call = <O>(id: string): O => agents.invoke<typeof input, O>(id, input, ctx(id));
    return {
      applicationInventory: call('reporting.application-inventory'),
      journeyInventory: call('reporting.journey-inventory'),
      apiInventory: call('reporting.api-inventory'),
      businessCapabilities: call('reporting.business-capability'),
      requirementCounts: call('reporting.requirement-report'),
      requirementCoverage: call('reporting.coverage'),
      automationCoverage: call('reporting.automation-coverage'),
      riskProfile: call('reporting.risk-analysis'),
      readiness: call('reporting.release-readiness'),
      discoveryCompleteness: call('reporting.discovery-completeness'),
    };
  });

type Finding = import('@dbiz/capability-framework').ReviewFinding;

export type GovernancePhase = 'review' | 'decision' | 'certification';

export interface GovernanceInput {
  readonly stage: string;
  readonly phase: GovernancePhase;
  readonly subject: unknown;
  readonly findings: readonly Finding[];
  readonly accept: boolean;
  readonly accepted: number;
}

/**
 * The governance orchestrator — the only one every stage uses.
 *
 * It dispatches to the review, decision or certification agent for a stage. Dispatching
 * by phase rather than running all three in one call is what lets the four-phase
 * pipeline drive the order: `runPhase` calls execute, then review, then decision, then
 * certification, and a stage that tried to reorder them would have to rewrite the
 * pipeline rather than merely call this differently.
 */
export const governanceOrchestrator = defineDomainOrchestrator<GovernanceInput, unknown>(
  'governance', 'Review, decide or certify a stage output, as the four-phase pipeline requires.',
  (input, agents, ctx) => {
    const id = `governance.${input.stage}.${input.phase}`;
    if (input.phase === 'review') {
      return agents.invoke<{ subject: unknown }, readonly Finding[]>(id, { subject: input.subject }, ctx(id));
    }
    if (input.phase === 'decision') {
      return agents.invoke<{ subject: unknown; findings: readonly Finding[] }, { accept: boolean; rejected: readonly { subject: string; reason: string }[] }>(
        id, { subject: input.subject, findings: input.findings }, ctx(id));
    }
    return agents.invoke<{ accept: boolean; findings: readonly Finding[]; accepted: number }, { certified: boolean; reason: string }>(
      id, { accept: input.accept, findings: input.findings, accepted: input.accepted }, ctx(id));
  });

export const domainOrchestrators: Readonly<Record<Domain, DomainOrchestrator<never, unknown>>> = {
  scope: scopeOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  discovery: discoveryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  appintel: applicationIntelligenceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  appmodel: applicationModelOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  requirement: requirementOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  workitem: workItemOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  qa: qaOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  repository: repositoryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  automation: automationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  execution: executionOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  healing: healingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  defect: defectOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  sync: syncOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reporting: reportingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  learning: learningOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  governance: governanceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
};

// ── The master orchestrator ─────────────────────────────────────────────────

export interface DiscoveryRequest {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly scope: DiscoveryScope;
  /** Tenant configuration, including `discovery.aiEnabled` and provider selection. */
  readonly configuration: Readonly<Record<string, string>>;
  /** Reasoning proposals by agent id. Ignored entirely when AI is disabled. */
  readonly proposals?: Readonly<Record<string, unknown>>;
}

export interface DiscoveryOrchestrationResult {
  readonly run: RunOutcome;
  readonly certification: CertificationOutcome;
  readonly reasoningMode: ReasoningMode;
  readonly reasoning: ReasoningLedger;
  readonly adapters: { readonly project: string; readonly testManagement: string; readonly execution: string; readonly workItem: string };
  readonly agentsInvoked: readonly string[];
  readonly resumed: boolean;
  readonly rolledBack: boolean;
}

/** The engine's runtime seam. Everything the Execution Plane observes arrives here. */
export interface EngineRuntime {
  readonly reasoning: { readonly source: ProposalSource; readonly ledger: () => ReasoningLedger };
  readonly recorder: InvocationRecorder;
  readonly adapters: AdapterSet;
  readonly workItemAdapter: WorkItemAdapter;
  readonly memory: VectorMemory;
}

export class DiscoveryFlowOrchestrator {
  private readonly state = new Map<string, RunOutcome>();
  /** Vector memory outlives a run — PER TENANT. A single shared instance let one tenant's
   *  recall() surface another tenant's remembered vectors and labels (cross-tenant leakage).
   *  Isolation is enforced here, at the orchestrator boundary, so no agent needs tenant awareness. */
  private readonly memoryByTenant = new Map<string, VectorMemory>();
  private memoryFor(tenantId: string): VectorMemory {
    let m = this.memoryByTenant.get(tenantId);
    if (m === undefined) { m = new VectorMemory(); this.memoryByTenant.set(tenantId, m); }
    return m;
  }
  /** Aggregate census/size across tenants — counts only, never a cross-tenant recall. */
  get memory(): { readonly size: number; readonly census: Readonly<Record<string, number>> } {
    let size = 0;
    const census: Record<string, number> = {};
    for (const m of this.memoryByTenant.values()) {
      size += m.size;
      for (const [k, n] of Object.entries(m.census)) census[k] = (census[k] ?? 0) + n;
    }
    return { size, census };
  }

  constructor(
    private readonly capabilityFor: (runtime: EngineRuntime) => Capability,
    readonly agents: AgentCatalogue,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  orchestratorFor(domain: Domain): DomainOrchestrator<never, unknown> | null {
    return domainOrchestrators[domain] ?? null;
  }

  resolveAdapters(configuration: Readonly<Record<string, string>>): AdapterSet {
    return this.adapterRegistry.resolve(configuration);
  }

  execute(request: DiscoveryRequest): DiscoveryOrchestrationResult {
    const adapters = this.resolveAdapters(request.configuration);
    const workItemAdapter = this.adapterRegistry.resolveWorkItem(request.configuration);

    // The capability's own configuration surface translated onto the framework's
    // capability-neutral key. One line, and the only place the two names meet.
    const configuration = {
      ...request.configuration,
      'ai.enabled': request.configuration['discovery.aiEnabled'] ?? 'false',
      'adapter.project': adapters.project.identity.provider,
      'adapter.testManagement': adapters.testManagement.identity.provider,
      'adapter.execution': adapters.execution.identity.provider,
      'adapter.workItem': workItemAdapter.identity.provider,
    };

    const mode = resolveReasoningMode(configuration);
    const reasoning = gateProposals(mode, proposalsFrom(request.proposals ?? {}));
    const recorder = invocationRecorder(reasoning.source);

    const prior = this.state.get(request.runId);
    const resumed = prior !== undefined && prior.failedAt !== null;

    const run = runCapability(
      this.capabilityFor({ reasoning, recorder, adapters, workItemAdapter, memory: this.memoryFor(request.tenantId) }),
      {
        tenantId: request.tenantId, runId: request.runId,
        correlationId: request.correlationId, configuration,
      },
      resumed ? prior.results : undefined,
    );

    this.state.set(request.runId, run);
    const rolledBack = run.failedAt !== null;
    if (rolledBack) this.state.set(request.runId, { ...run, results: new Map() });

    return {
      run,
      certification: certify(run.results),
      reasoningMode: mode,
      reasoning: reasoning.ledger(),
      adapters: {
        project: adapters.project.identity.provider,
        testManagement: adapters.testManagement.identity.provider,
        execution: adapters.execution.identity.provider,
        workItem: workItemAdapter.identity.provider,
      },
      // Observed, not asserted: this is what the catalogue recorded, not what the
      // stages claimed.
      agentsInvoked: recorder.invoked(),
      resumed, rolledBack,
    };
  }

  retry(request: DiscoveryRequest): DiscoveryOrchestrationResult { return this.execute(request); }

  auditTrailFor(runId: string): readonly { at: number; stage: string | null; event: string; detail: string }[] {
    return this.state.get(runId)?.audit ?? [];
  }
}
