/**
 * The Inverse-Flow Discovery Engine, implemented across the twelve-stage lifecycle.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 (capability 3) · 12-capability-orchestration.md
 *   ADR          : ADR-0023
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.13 · C-13.1 · C-14.1
 *
 * FORTY-FIVE CANONICAL STEPS ONTO TWELVE FROZEN STAGES.
 * The canonical Discovery workflow names fifteen phases, each followed by a review and a
 * certification — forty-five steps in a line. R-12.18 permits exactly one orchestration
 * lifecycle for the platform, so those forty-five are internal structure of these twelve,
 * not a lifecycle of their own. The mapping is in ADR-0023 §4 and is summarised here:
 *
 *    1 planning            Discovery Request, Scope Validation / Review / Certification
 *    2 discovery      EP   Live Application Discovery / Review / Certification
 *    3 context     EP->IP  Application Intelligence Mapping / Review / Certification
 *    4 arch-review         Application Model Construction / Review / Certification
 *    5 policy-review       Requirement Reconstruction / Review / Certification
 *    6 guardrail-review    QA Asset Generation / Review / Certification
 *    7 exec-planning       Work Item Generation, Repository and Automation Intelligence
 *    8 execution      EP   Execution / Review / Certification
 *    9 evidence       EP   evidence capture, hashed and held in Execution Plane custody
 *   10 reflection          Healing, Defect and Learning / Review / Certification
 *   11 certification       Release Certification
 *   12 reporting           Synchronization / Review / Certification, Discovery Reporting
 *
 * ONE DEVIATION, STATED RATHER THAN HIDDEN.
 * The brief orders Work Item Generation before QA Asset Generation. The frozen lifecycle
 * places guardrail review (stage 6) before execution planning (stage 7), so QA assets are
 * generated and certified first and work items are published with the assets already
 * available to link. The stage order governs; the deviation is recorded in ADR-0023 §5.
 *
 * EVERY STAGE RUNS EXECUTE, REVIEW, DECIDE, CERTIFY.
 * `runPhase` enforces the order and throws when certification refuses. A refused stage
 * therefore cannot produce a sealed result, and the run stops with the reason attached.
 * "Nothing progresses unless certified" is that throw.
 */
import {
  AdapterRegistry, VectorIndex, runPhase, observedAgents,
  type AgentContext, type Capability, type ReviewFinding, type StageContext,
  type StageEmitter, type StageName, type StageResult,
} from '@dbiz/capability-framework';
import { buildCatalogue } from './catalogue.js';
import {
  DiscoveryFlowOrchestrator, domainOrchestrators, governanceOrchestrator,
  scopeOrchestrator, discoveryOrchestrator, applicationIntelligenceOrchestrator,
  applicationModelOrchestrator, requirementOrchestrator, qaOrchestrator,
  repositoryOrchestrator, automationOrchestrator, workItemOrchestrator,
  executionOrchestrator, healingOrchestrator, defectOrchestrator, syncOrchestrator,
  reportingOrchestrator, learningOrchestrator,
  type AgentContextFactory, type DiscoveryResult, type EngineRuntime, type RequirementResult,
  type ScopeResult,
} from './orchestrators.js';
import {
  minimise, type ApplicationFact, type ApplicationIntelligence, type ApplicationModel,
  type AutomationAsset, type Defect, type DiscoveryReport, type DiscoveryScope,
  type EvidenceReference, type ExecutionPlan, type HealingAction, type LearningRecord,
  type ObservedArtefact, type Outcome, type QaAsset, type RepositoryAssetKind,
  type RepositoryMatch, type SyncRecord, type TestOutcome,
} from './model.js';

export const CAPABILITY_ID = 'inverse-flow-discovery';

/** Everything the Execution Plane observes, and everything the engine cannot invent. */
export interface EngineDependencies {
  /** The Execution Plane probe. Bound by the scope predicate, never by convention. */
  readonly observe: (scope: DiscoveryScope, inScope: (url: string) => boolean) => readonly ObservedArtefact[];
  readonly repositoryAssets: readonly { readonly id: string; readonly kind: RepositoryAssetKind; readonly text: string; readonly repository: string }[];
  readonly environmentReachable: boolean;
  readonly observedOutcomes: (plan: ExecutionPlan) => readonly TestOutcome[];
  readonly capturedEvidence: (outcomes: readonly TestOutcome[]) => readonly { qaAssetId: string; kind: EvidenceReference['kind']; locator: string; digest: string }[];
  /** `null` means the retry was not observed, which is NOT a pass. */
  readonly observedRetry: (action: HealingAction) => Outcome | null;
  readonly existingDefects: readonly Defect[];
  readonly maxParallel: number;
  /** Proportion of the declared scope discovery reached. Measured, never assumed to be 1. */
  readonly scopeReached: number;
}

interface EngineState {
  readonly scope: ScopeResult;
  readonly discovery: DiscoveryResult;
  readonly facts: readonly ApplicationFact[];
  readonly intelligence: ApplicationIntelligence;
  readonly model: ApplicationModel;
  readonly requirements: RequirementResult;
  readonly assets: readonly QaAsset[];
  readonly uncovered: readonly string[];
  readonly matches: readonly RepositoryMatch[];
  readonly automation: readonly AutomationAsset[];
  readonly requestedKinds: readonly RepositoryAssetKind[];
  readonly generatedKinds: readonly RepositoryAssetKind[];
  readonly workItems: readonly SyncRecord[];
  readonly plan: ExecutionPlan;
  readonly outcomes: readonly TestOutcome[];
  readonly evidence: readonly EvidenceReference[];
  readonly healing: readonly HealingAction[];
  readonly defects: readonly Defect[];
  readonly learning: readonly LearningRecord[];
  readonly sync: readonly SyncRecord[];
  readonly report: DiscoveryReport | null;
}

const EMPTY_GRAPH = { name: 'empty', nodes: [] as readonly string[], edges: [] as never[] };

/** The initial state. Every field is present and empty, so no stage reads `undefined`. */
function initialState(): EngineState {
  return {
    scope: {
      scope: { applicationId: '', origins: [], exclusions: [], depth: 'shallow', authenticationMode: 'anonymous', rateLimitPerSecond: 1, apiSpecificationUris: [] },
      inScope: () => false, boundarySummary: '', requestsPerSecond: 1, maxDepth: 0, maxArtefacts: 0,
      authentication: { mode: 'anonymous', credentialsHandledBy: '' },
    },
    discovery: { observed: [], routes: [], contracts: [], navigationEdges: [], journeys: [], cookies: [], storageKeys: [], events: [], refusedFrames: [] },
    facts: [],
    intelligence: {
      services: [], apiContracts: [], entities: [], relationships: [], businessRules: [],
      modules: [], menus: [], pages: [],
      navigationGraph: EMPTY_GRAPH, journeyGraph: EMPTY_GRAPH, dependencyGraph: EMPTY_GRAPH, knowledgeGraph: EMPTY_GRAPH,
    },
    model: { applicationId: '', domains: [], services: [], entities: [], relationships: [], navigation: EMPTY_GRAPH, journeys: [], capabilities: [] },
    requirements: { epics: [], features: [], stories: [] },
    assets: [], uncovered: [], matches: [], automation: [], requestedKinds: [], generatedKinds: [],
    workItems: [],
    plan: { batches: [], parallelism: 1, environment: '', environmentValidated: false },
    outcomes: [], evidence: [], healing: [], defects: [], learning: [], sync: [], report: null,
  };
}

/**
 * Build the capability.
 *
 * The runtime is closed over rather than reached from a global: two runs with different
 * reasoning modes must not share a recorder or a proposal gate, and a module-level one
 * would guarantee they did.
 */
export function discoveryFlowCapability(deps: EngineDependencies, runtime: EngineRuntime): Capability {
  const agents = buildCatalogue();

  /** Per-agent context, with the proposal gated by the reasoning mode. */
  const factoryFor = (ctx: StageContext): AgentContextFactory => (agentId: string): AgentContext =>
    runtime.recorder.context({
      tenantId: ctx.tenantId, runId: ctx.runId, correlationId: ctx.correlationId,
      audit: ctx.audit, telemetry: () => { /* R-16.34: identifiers and outcomes only */ },
    } as Omit<AgentContext, 'proposal'>, agentId);

  /**
   * Run one stage as execute → review → decide → certify.
   *
   * `subject` is what the reviewer inspects, and it is deliberately separate from the
   * value the stage carries forward: a reviewer given the whole state would drift into
   * checking things another stage already certified.
   */
  function gated<T>(
    stage: StageName, phase: string, ctx: StageContext,
    execute: () => { value: T; subject: unknown; accepted: number },
  ): { value: T; findings: readonly ReviewFinding[]; reason: string } {
    const factory = factoryFor(ctx);
    const gov = (input: Parameters<typeof governanceOrchestrator.coordinate>[0]) =>
      governanceOrchestrator.coordinate(input, agents, factory);

    let accepted = 0;
    const outcome = runPhase<{ value: T; subject: unknown; accepted: number }, T>({
      stage, phase,
      execute: () => { const produced = execute(); accepted = produced.accepted; return produced; },
      review: (x) => gov({ stage, phase: 'review', subject: x.subject, findings: [], accept: false, accepted }) as readonly ReviewFinding[],
      decide: (x, findings) => {
        const decision = gov({ stage, phase: 'decision', subject: x.subject, findings, accept: false, accepted }) as { accept: boolean; rejected: readonly { subject: string; reason: string }[] };
        return { accepted: x.value, rejected: decision.rejected };
      },
      certifyPhase: (_decision, findings) => {
        const blocking = findings.some((f) => f.severity === 'blocking');
        return gov({ stage, phase: 'certification', subject: null, findings, accept: !blocking, accepted }) as { certified: boolean; reason: string };
      },
    });

    return { value: outcome.accepted, findings: outcome.findings, reason: outcome.certification.reason };
  }

  /** Read the state the previous stage carried forward. Planning starts from empty. */
  const stateOf = (ctx: StageContext): EngineState =>
    (ctx.previous?.value as EngineState | undefined) ?? initialState();

  const stage = (
    name: StageName,
    phase: string,
    run: (state: EngineState, ctx: StageContext) => { value: EngineState; subject: unknown; accepted: number },
  ) => (ctx: StageContext, emit: StageEmitter<StageName>): StageResult<StageName, unknown> => {
    const before = runtime.recorder.invoked().length;
    const result = gated<EngineState>(name, phase, ctx, () => run(stateOf(ctx), ctx));
    // The agent list is OBSERVED — the agents the catalogue recorded during this stage,
    // not a list the stage wrote about itself.
    const invoked = observedAgents(runtime.recorder).slice(before);
    ctx.audit(`${name}.certified`, result.reason);
    return emit.ok<EngineState>(result.value, invoked);
  };

  return {
    id: CAPABILITY_ID,
    version: '1.0.0',
    name: 'Inverse-Flow Discovery Engine',
    requiredAdapters: ['ProjectAdapter', 'TestManagementAdapter', 'ExecutionAdapter', 'WorkItemAdapter'],
    evidenceClasses: ['application-inventory', 'requirement-reconstruction', 'qa-assets', 'execution-outcomes', 'evidence-references'],
    certificationCriteria: ['C-12.1', 'C-12.12', 'C-11.13', 'C-13.1', 'C-14.1'],
    stages: {
      // 1 — Discovery Request, Scope Validation, Review, Certification
      planning: stage('planning', 'scope', (state, ctx) => {
        const applicationId = ctx.configuration['discovery.applicationId'] ?? '';
        const scope: DiscoveryScope = {
          applicationId,
          origins: (ctx.configuration['discovery.origins'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          exclusions: (ctx.configuration['discovery.exclusions'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          depth: (ctx.configuration['discovery.depth'] as DiscoveryScope['depth']) ?? 'standard',
          authenticationMode: (ctx.configuration['discovery.authentication'] as DiscoveryScope['authenticationMode']) ?? 'anonymous',
          rateLimitPerSecond: Number(ctx.configuration['discovery.rateLimit'] ?? '4'),
          apiSpecificationUris: (ctx.configuration['discovery.apiSpecs'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        };
        const result = scopeOrchestrator.coordinate({ scope }, agents, factoryFor(ctx));
        return {
          value: { ...state, scope: result },
          subject: { origins: result.scope.origins, exclusions: result.scope.exclusions, requestsPerSecond: result.requestsPerSecond, maxArtefacts: result.maxArtefacts },
          accepted: result.scope.origins.length,
        };
      }),

      // 2 — Live Application Discovery, Execution Plane
      discovery: stage('discovery', 'live application discovery', (state, ctx) => {
        const observed = deps.observe(state.scope.scope, state.scope.inScope);
        const result = discoveryOrchestrator.coordinate(
          { observed, scope: state.scope.scope, inScope: state.scope.inScope }, agents, factoryFor(ctx));
        return {
          value: { ...state, discovery: result },
          subject: { observed: result.observed, cookies: result.cookies, refusedFrames: result.refusedFrames, journeys: result.journeys },
          accepted: result.observed.length,
        };
      }),

      // 3 — Application Intelligence Mapping. The boundary crossing happens here.
      context: stage('context', 'application intelligence mapping', (state, ctx) => {
        // Every fact in the Intelligence Plane passed through `minimise`. One function,
        // one place to audit what crosses.
        const facts = state.discovery.observed.map(minimise);
        const intelligence = applicationIntelligenceOrchestrator.coordinate({
          facts, contracts: state.discovery.contracts,
          edges: state.discovery.navigationEdges, journeys: state.discovery.journeys,
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, facts, intelligence },
          subject: { facts, relationships: intelligence.relationships, entities: intelligence.entities },
          accepted: facts.length,
        };
      }),

      // 4 — Application Model Construction
      'architecture-review': stage('architecture-review', 'application model', (state, ctx) => {
        const model = applicationModelOrchestrator.coordinate({
          applicationId: state.scope.scope.applicationId,
          intelligence: state.intelligence, journeys: state.discovery.journeys,
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, model },
          subject: { applicationId: model.applicationId, journeys: model.journeys, services: model.services, capabilities: model.capabilities },
          accepted: model.journeys.length + model.services.length,
        };
      }),

      // 5 — Requirement Reconstruction
      'policy-review': stage('policy-review', 'requirement reconstruction', (state, ctx) => {
        const requirements = requirementOrchestrator.coordinate(
          { model: state.model, rules: state.intelligence.businessRules, facts: state.facts }, agents, factoryFor(ctx));
        return {
          value: { ...state, requirements },
          subject: { stories: requirements.stories, epics: requirements.epics },
          accepted: requirements.stories.length,
        };
      }),

      // 6 — QA Asset Generation
      'guardrail-review': stage('guardrail-review', 'QA asset generation', (state, ctx) => {
        const qa = qaOrchestrator.coordinate({
          stories: state.requirements.stories, facts: state.facts, rules: state.intelligence.businessRules,
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, assets: qa.assets, uncovered: qa.uncovered },
          subject: { assets: qa.assets, uncovered: qa.uncovered },
          accepted: qa.assets.length,
        };
      }),

      // 7 — Work Items, Repository Intelligence, Automation Intelligence
      'execution-planning': stage('execution-planning', 'work items, repository and automation', (state, ctx) => {
        const factory = factoryFor(ctx);

        // The repository index is built in the Execution Plane from the customer's own
        // assets. Vectors and identifiers are what the Intelligence Plane ever sees.
        const index = new VectorIndex();
        for (const asset of deps.repositoryAssets) {
          index.add(asset.id, asset.kind, asset.text, { repository: asset.repository });
        }
        const repositoryInput = { assets: state.assets, index, repositoryAssets: deps.repositoryAssets };

        const repository = repositoryOrchestrator.coordinate(repositoryInput, agents, factory);
        const automation = automationOrchestrator.coordinate(repositoryInput, agents, factory);
        const workItems = workItemOrchestrator.coordinate({
          adapter: runtime.workItemAdapter, requirements: state.requirements, assets: state.assets,
        }, agents, factory);

        return {
          value: {
            ...state, matches: repository.matches, automation: automation.generated,
            requestedKinds: automation.requestedKinds, generatedKinds: automation.generatedKinds,
            workItems: workItems.records,
          },
          subject: {
            workItems: workItems.records,
            requestedKinds: automation.requestedKinds, generatedKinds: automation.generatedKinds,
          },
          accepted: workItems.records.filter((r) => r.published).length,
        };
      }),

      // 8 — Execution, Execution Plane
      execution: stage('execution', 'execution', (state, ctx) => {
        const result = executionOrchestrator.coordinate({
          assets: state.assets, stories: state.requirements.stories,
          maxParallel: deps.maxParallel, reachable: deps.environmentReachable,
          observedFor: deps.observedOutcomes,
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, plan: result.plan, outcomes: result.outcomes },
          subject: { environmentValidated: result.plan.environmentValidated, batches: result.plan.batches, outcomes: result.outcomes },
          accepted: result.outcomes.length,
        };
      }),

      // 9 — Evidence, Execution Plane custody
      evidence: stage('evidence', 'evidence capture', (state, ctx) => {
        const evidence = agents.invoke<{ outcomes: readonly TestOutcome[]; captured: readonly { qaAssetId: string; kind: EvidenceReference['kind']; locator: string; digest: string }[] }, readonly EvidenceReference[]>(
          'execution.evidence-capture',
          { outcomes: state.outcomes, captured: deps.capturedEvidence(state.outcomes) },
          factoryFor(ctx)('execution.evidence-capture'));
        return {
          value: { ...state, evidence },
          subject: { references: evidence },
          accepted: evidence.length,
        };
      }),

      // 10 — Healing, Defects, Learning
      reflection: stage('reflection', 'healing, defects and learning', (state, ctx) => {
        const factory = factoryFor(ctx);
        const healing = healingOrchestrator.coordinate(
          { outcomes: state.outcomes, observedRetry: deps.observedRetry }, agents, factory);
        const defects = defectOrchestrator.coordinate({
          outcomes: state.outcomes, assets: state.assets, stories: state.requirements.stories,
          healing: healing.actions, evidence: state.evidence,
          existing: deps.existingDefects, adapter: runtime.adapters.execution,
        }, agents, factory);
        const learning = learningOrchestrator.coordinate({
          intelligence: state.intelligence, journeys: state.model.journeys, matches: state.matches,
          automation: state.automation, healing: healing.actions, outcomes: state.outcomes,
          memory: runtime.memory,
          promptsDelivered: runtime.reasoning.ledger().delivered,
          promptsWithheld: runtime.reasoning.ledger().withheld,
        }, agents, factory);

        return {
          value: { ...state, healing: healing.actions, defects, learning: [...healing.learning, ...learning] },
          subject: {
            healing: healing.actions.map((h) => ({ ...h, observedRetry: deps.observedRetry(h) })),
            defects, learning,
          },
          accepted: defects.length,
        };
      }),

      // 11 — Release Certification
      certification: stage('certification', 'release certification', (state) => {
        const triadTraversed = true; // The runner reached stage 11, so 4, 5 and 6 all sealed.
        const verdicts = [
          { certified: state.requirements.stories.length > 0, reason: `${state.requirements.stories.length} requirement(s) reconstructed` },
          { certified: state.assets.length > 0, reason: `${state.assets.length} QA asset(s) generated` },
          { certified: state.workItems.some((w) => w.published), reason: `${state.workItems.filter((w) => w.published).length} work item(s) published` },
          { certified: state.defects.every((d) => d.rootCause.trim() !== ''), reason: 'every defect carries a root cause' },
        ];
        return {
          value: state,
          subject: { triadTraversed, verdicts },
          accepted: verdicts.filter((v) => v.certified).length,
        };
      }),

      // 12 — Synchronization and Discovery Reporting
      reporting: stage('reporting', 'synchronization and reporting', (state, ctx) => {
        const factory = factoryFor(ctx);

        const sync = syncOrchestrator.coordinate({
          project: runtime.adapters.project, testManagement: runtime.adapters.testManagement,
          execution: runtime.adapters.execution, applicationId: state.model.applicationId,
          assets: state.assets, stories: state.requirements.stories, outcomes: state.outcomes,
          evidence: state.evidence, defects: state.defects,
        }, agents, factory);

        const reportInput = {
          applicationId: state.model.applicationId, intelligence: state.intelligence,
          journeys: state.model.journeys, capabilities: state.model.capabilities.map((c) => c.name),
          stories: state.requirements.stories, epicCount: state.requirements.epics.length,
          featureCount: state.requirements.features.length, assets: state.assets,
          automation: state.automation, outcomes: state.outcomes, healing: state.healing,
          defects: state.defects,
          reasoningMode: runtime.reasoning.ledger().mode, scopeReached: deps.scopeReached,
        };
        const parts = reportingOrchestrator.coordinate(reportInput, agents, factory) as Record<string, never>;
        const readiness = parts['readiness'] as unknown as { readiness: string; rationale: string };

        const validated = state.healing.filter((h) => h.validated).length;
        const report: DiscoveryReport = {
          applicationId: state.model.applicationId,
          applicationInventory: parts['applicationInventory'] as unknown as Record<string, number>,
          journeyInventory: parts['journeyInventory'] as unknown as readonly string[],
          apiInventory: parts['apiInventory'] as unknown as readonly string[],
          businessCapabilities: parts['businessCapabilities'] as unknown as readonly string[],
          requirementCounts: parts['requirementCounts'] as unknown as DiscoveryReport['requirementCounts'],
          qaAssetCount: state.assets.length,
          automationCoverage: parts['automationCoverage'] as unknown as number,
          requirementCoverage: parts['requirementCoverage'] as unknown as number,
          riskProfile: parts['riskProfile'] as unknown as DiscoveryReport['riskProfile'],
          executionSummary: {
            passed: state.outcomes.filter((o) => o.outcome === 'passed').length,
            failed: state.outcomes.filter((o) => o.outcome === 'failed').length,
            skipped: state.outcomes.filter((o) => o.outcome === 'skipped').length,
          },
          healingRate: state.healing.length === 0 ? 0 : validated / state.healing.length,
          defectCount: state.defects.length,
          reasoningMode: runtime.reasoning.ledger().mode,
          discoveryCompleteness: parts['discoveryCompleteness'] as unknown as number,
          releaseReadiness: readiness.readiness,
          rationale: readiness.rationale,
        };

        agents.invoke<{ report: DiscoveryReport }, readonly string[]>(
          'reporting.executive-dashboard', { report }, factory('reporting.executive-dashboard'));
        const pdf = agents.invoke<{ report: DiscoveryReport }, { bytes: number; pages: number }>(
          'reporting.executive-pdf', { report }, factory('reporting.executive-pdf'));
        agents.invoke<{ report: DiscoveryReport }, { figures: number; unmeasured: number; decisionRequired: string }>(
          'reporting.board-report', { report }, factory('reporting.board-report'));

        return {
          value: { ...state, sync, report },
          subject: {
            sync, releaseReadiness: report.releaseReadiness,
            claimedReady: report.releaseReadiness === 'READY', pdfBytes: pdf.bytes,
          },
          accepted: sync.filter((r) => r.published).length,
        };
      }),
    },
  };
}

/** Wire the master orchestrator with a capability factory bound to these dependencies. */
export function buildDiscoveryFlowOrchestrator(
  deps: EngineDependencies, registry: AdapterRegistry,
): DiscoveryFlowOrchestrator {
  return new DiscoveryFlowOrchestrator(
    (runtime) => discoveryFlowCapability(deps, runtime),
    buildCatalogue(),
    registry,
  );
}

export { domainOrchestrators };
