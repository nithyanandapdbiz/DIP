/**
 * The Dev-Change Engine, implemented across the twelve-stage lifecycle.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (capability 2) · 12-capability-orchestration.md
 *   ADR          : ADR-0024
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.13 · C-13.1 · C-14.1
 *
 * FORTY-SEVEN CANONICAL STEPS ONTO TWELVE FROZEN STAGES.
 * The brief's Dev-Change workflow names a linear sequence of intelligences, each followed
 * by a review and a certification. R-12.18 permits exactly one orchestration lifecycle, so
 * those steps are internal structure of these twelve, not a lifecycle of their own. The
 * mapping is ADR-0024 §3.1:
 *
 *    1 planning         Repository Event · configuration · adapter resolution · scope
 *    2 discovery   EP   Branch/PR/Commit discovery · Diff generation · Repository index
 *    3 context  EP->IP  Repository Intelligence · minimisation (the boundary crossing)
 *    4 arch-review      Change Intelligence · Dependency Intelligence
 *    5 policy-review    Business Impact Analysis
 *    6 guardrail-review Risk Intelligence · Coverage Intelligence
 *    7 exec-planning    Test Discovery · Reuse · Generation · Authoring · Execution Plan
 *    8 execution   EP   Scoped Execution
 *    9 evidence    EP   Evidence capture, hashed, custody retained
 *   10 reflection       Healing · Reflection · Root Cause · Defect · Learning
 *   11 certification    Governance Review · Release Certification
 *   12 reporting        Synchronization · Executive Reporting
 *
 * EVERY STAGE RUNS EXECUTE → REVIEW → DECIDE → CERTIFY.
 * `runPhase` enforces the order and throws when certification refuses. A refused stage
 * cannot produce a sealed result, and the run stops with the reason attached. "Nothing
 * progresses unless certified" is that throw.
 *
 * THE BOUNDARY IS CROSSED IN EXACTLY ONE STAGE, THROUGH ONE FUNCTION.
 * Stage 3 calls `repository.minimise-changes`, which is the only agent that reads a
 * `ChangedFile`. Everything downstream consumes `ChangeFact`, which has no field for a
 * line of source. Sovereignty is a type, not a discipline (ADR-0024 §3.4).
 */
import {
  runPhase, observedAgents,
  type AgentContext, type Capability, type ReviewFinding, type StageContext,
  type StageEmitter, type StageName, type StageResult,
} from '@dbiz/capability-framework';
import {
  repositoryOrchestrator, contextOrchestrator, diffOrchestrator, changeOrchestrator,
  dependencyOrchestrator, businessOrchestrator, riskOrchestrator, coverageOrchestrator,
  testDiscoveryOrchestrator, reuseOrchestrator, automationOrchestrator, authoringOrchestrator,
  executionOrchestrator, evidenceOrchestrator, healingOrchestrator, reflectionOrchestrator,
  rootCauseOrchestrator, defectOrchestrator, learningOrchestrator, syncOrchestrator,
  reportingOrchestrator, governanceOrchestrator,
  type AgentContextFactory, type EngineRuntime,
} from './orchestrators.js';
import { buildCatalogue } from './catalogue.js';
import type {
  AuthoredTest, AutomationAsset, BusinessImpact, ChangedFile,
  ChangeFact, ClassifiedChange, CommitFact, CommitRecord,
  CoverageAssessment, Defect, DependencyEdge, DevChangeReport,
  EvidenceReference, ExecutionPlan, HealingAction, ImpactedModule,
  LearningRecord, ObservedExecution, Outcome, Reflection,
  RepositoryAsset, RepositoryAssetKind, RepositoryEvent, RepositoryMatch,
  ReuseDecision, RiskAssessment, RootCause, SyncRecord, TestCandidate,
  TestOutcome,
} from './model.js';

export const CAPABILITY_ID = 'dev-change-engine';

/**
 * Everything the Execution Plane observes, and everything the engine cannot invent.
 *
 * There is no diff here: the diff arrives through the `SourceControlAdapter`, because
 * "generate the diff" is a tool interaction and C-14.1 sends tool interactions through an
 * SPI. What is injected is the environment observation the IP genuinely cannot produce.
 */
export interface EngineDependencies {
  /** Repository assets — EP-resident, indexed there; only identifiers and scores cross. */
  readonly repositoryAssets: readonly RepositoryAsset[];
  readonly environmentReachable: boolean;
  /** What the EP observed when it ran the plan, keyed by test id. */
  readonly observedExecutions: (plan: ExecutionPlan) => ReadonlyMap<string, ObservedExecution>;
  readonly capturedEvidence: (outcomes: readonly TestOutcome[]) => readonly { testId: string; kind: EvidenceReference['kind']; sha256: string; locator: string }[];
  /** The outcome of a healing retry, as OBSERVED. `null` means unobserved — NOT a pass. */
  readonly observedRetry: (action: HealingAction) => Outcome | null;
  readonly existingDefects: readonly Defect[];
  readonly maxParallel: number;
}

/** Accumulated engine state, carried stage to stage as each stage's value. */
export interface EngineState {
  readonly event: RepositoryEvent;
  readonly branches: readonly { name: string; headCommit: string; isDefault: boolean }[];
  readonly commits: readonly CommitRecord[];
  readonly changedFiles: readonly ChangedFile[];
  readonly commitCount: number;
  readonly existingTests: readonly RepositoryAsset[];
  readonly coChange: readonly { path: string; related: string; occurrences: number }[];
  readonly facts: readonly ChangeFact[];
  readonly commitFacts: readonly CommitFact[];
  readonly layerCensus: Readonly<Record<string, number>>;
  readonly modules: readonly { module: string; paths: readonly string[] }[];
  readonly churn: readonly { path: string; added: number; removed: number; hunks: number }[];
  readonly classified: readonly ClassifiedChange[];
  readonly dependencies: readonly DependencyEdge[];
  readonly impactedModules: readonly ImpactedModule[];
  readonly impacts: readonly BusinessImpact[];
  readonly journeys: readonly string[];
  readonly risks: readonly RiskAssessment[];
  readonly coverage: readonly CoverageAssessment[];
  readonly coverageSummary: { assessed: number; covered: number; gaps: number };
  readonly candidates: readonly TestCandidate[];
  readonly matches: readonly RepositoryMatch[];
  readonly decisions: readonly ReuseDecision[];
  readonly automation: readonly AutomationAsset[];
  readonly requestedKinds: readonly RepositoryAssetKind[];
  readonly generatedKinds: readonly RepositoryAssetKind[];
  readonly authored: readonly AuthoredTest[];
  readonly plan: ExecutionPlan;
  readonly outcomes: readonly TestOutcome[];
  readonly evidence: readonly EvidenceReference[];
  readonly failedCount: number;
  readonly healing: readonly HealingAction[];
  readonly reflections: readonly Reflection[];
  readonly rootCauses: readonly RootCause[];
  readonly defects: readonly Defect[];
  readonly learning: readonly LearningRecord[];
  readonly verdicts: readonly { certified: boolean; reason: string }[];
  readonly sync: readonly SyncRecord[];
  readonly report: DevChangeReport | null;
}

const EMPTY_PLAN: ExecutionPlan = { batches: [], parallelism: 1, ordering: [], environment: '', environmentValidated: false };

function initialState(event: RepositoryEvent): EngineState {
  return {
    event, branches: [], commits: [], changedFiles: [], commitCount: 0, existingTests: [], coChange: [],
    facts: [], commitFacts: [], layerCensus: {}, modules: [], churn: [],
    classified: [], dependencies: [], impactedModules: [], impacts: [], journeys: [],
    risks: [], coverage: [], coverageSummary: { assessed: 0, covered: 0, gaps: 0 },
    candidates: [], matches: [], decisions: [], automation: [], requestedKinds: [], generatedKinds: [],
    authored: [], plan: EMPTY_PLAN, outcomes: [], evidence: [], failedCount: 0,
    healing: [], reflections: [], rootCauses: [], defects: [], learning: [], verdicts: [],
    sync: [], report: null,
  };
}

/**
 * Build the capability.
 *
 * The runtime is closed over rather than reached from a global: two runs with different
 * reasoning modes must not share a recorder or a proposal gate.
 */
export function devChangeCapability(deps: EngineDependencies, event: RepositoryEvent, runtime: EngineRuntime): Capability {
  const agents = buildCatalogue();

  const factoryFor = (ctx: StageContext): AgentContextFactory => (agentId: string): AgentContext =>
    runtime.recorder.context({
      tenantId: ctx.tenantId, runId: ctx.runId, correlationId: ctx.correlationId,
      audit: ctx.audit, telemetry: () => { /* R-16.34: identifiers and outcomes only */ },
    } as Omit<AgentContext, 'proposal'>, agentId);

  /** Run one stage as execute → review → decide → certify. */
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

  const stateOf = (ctx: StageContext): EngineState =>
    (ctx.previous?.value as EngineState | undefined) ?? initialState(event);

  const stage = (
    name: StageName, phase: string,
    run: (state: EngineState, ctx: StageContext) => { value: EngineState; subject: unknown; accepted: number },
  ) => (ctx: StageContext, emit: StageEmitter<StageName>): StageResult<StageName, unknown> => {
    const before = runtime.recorder.invoked().length;
    const result = gated<EngineState>(name, phase, ctx, () => run(stateOf(ctx), ctx));
    const invoked = observedAgents(runtime.recorder).slice(before);
    ctx.audit(`${name}.certified`, result.reason);
    return emit.ok<EngineState>(result.value, invoked);
  };

  const scopeExclusions = (ctx: StageContext) =>
    (ctx.configuration['devchange.excludePaths'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  return {
    id: CAPABILITY_ID,
    version: '1.0.0',
    name: 'Dev-Change Engine',
    requiredAdapters: ['SourceControlAdapter', 'ProjectAdapter', 'TestManagementAdapter', 'ExecutionAdapter', 'WorkItemAdapter'],
    evidenceClasses: ['change-intelligence', 'business-impact', 'risk-assessment', 'coverage', 'execution-outcomes', 'evidence-references', 'defects'],
    certificationCriteria: ['C-12.1', 'C-12.12', 'C-11.13', 'C-13.1', 'C-14.1'],
    stages: {
      // 1 — Repository Event, configuration, adapter resolution, scope
      planning: stage('planning', 'change-set scope', (state, ctx) => {
        const excluded = scopeExclusions(ctx);
        return {
          value: { ...state, event },
          subject: {
            repository: event.repository, headCommit: event.headCommit, baseCommit: event.baseCommit,
            scopeBounded: excluded.length > 0,
          },
          accepted: 1,
        };
      }),

      // 2 — Branch/PR/Commit discovery, Diff generation, Repository index. Execution Plane.
      discovery: stage('discovery', 'branch, commit and diff discovery', (state, ctx) => {
        const excluded = scopeExclusions(ctx);
        const repo = repositoryOrchestrator.coordinate(
          { adapter: runtime.sourceControl, event, assets: deps.repositoryAssets },
          agents, factoryFor(ctx));
        const diff = diffOrchestrator.coordinate(
          { adapter: runtime.sourceControl, event, merges: repo.merges }, agents, factoryFor(ctx));
        const changedFiles = diff.files.filter((f) => !excluded.some((e) => f.path.startsWith(e)));
        // The subject the reviewer inspects — descriptors that must NOT carry content.
        return {
          value: { ...state, branches: repo.branches, commits: repo.commits, changedFiles, existingTests: repo.existingTests, coChange: repo.coChange, churn: diff.churn },
          subject: {
            changedFiles: changedFiles.map((f) => ({ path: f.path, changeKind: f.changeKind })),
            // Presented as safe descriptors: the reviewer sees that commits exist, not
            // their messages. Message and author never enter a review subject.
            commits: repo.commits.map((c) => ({ sha: c.sha, changedPathCount: c.changedPaths.length })),
            existingTests: repo.existingTests.map((t) => t.id),
          },
          accepted: changedFiles.length,
        };
      }),

      // 3 — Repository Intelligence and minimisation. THE BOUNDARY CROSSING.
      context: stage('context', 'repository intelligence and minimisation', (state, ctx) => {
        const result = contextOrchestrator.coordinate(
          { files: state.changedFiles, commits: state.commits }, agents, factoryFor(ctx));
        // This is the crossing (STAGE_PLANE.context === 'EP->IP'). The raw diff and the
        // raw commits are DROPPED here, not merely superseded: every stage from 4 onward
        // is Intelligence-Plane, and a sealed IP stage result that still held source would
        // be the leak ADR-0024 §3.4 says is unrepresentable. `commitCount` is retained as
        // a number so reporting never needs the commits back.
        return {
          value: {
            ...state, changedFiles: [], commits: [], commitCount: state.commits.length,
            // existingTests carry EP-resident asset text and are not read after the
            // crossing; the reuse and coverage stages read the EP-side dependency, not
            // this field. Dropped so no asset text sits in an IP sealed result.
            existingTests: [],
            facts: result.facts, commitFacts: result.commitFacts,
            layerCensus: result.layerCensus, modules: result.modules,
          },
          subject: { facts: result.facts, commitFacts: result.commitFacts },
          accepted: result.facts.length,
        };
      }),

      // 4 — Change Intelligence, Dependency Intelligence
      'architecture-review': stage('architecture-review', 'change and dependency intelligence', (state, ctx) => {
        const change = changeOrchestrator.coordinate({ facts: state.facts }, agents, factoryFor(ctx));
        const dependency = dependencyOrchestrator.coordinate(
          { facts: state.facts, coChange: state.coChange, modules: state.modules }, agents, factoryFor(ctx));
        return {
          value: { ...state, classified: change.classified, dependencies: dependency.dependencies, impactedModules: dependency.modules },
          subject: { classified: change.classified, dependencies: dependency.dependencies },
          accepted: change.classified.length,
        };
      }),

      // 5 — Business Impact Analysis
      'policy-review': stage('policy-review', 'business impact analysis', (state, ctx) => {
        const business = businessOrchestrator.coordinate(
          { classified: state.classified, modules: state.impactedModules }, agents, factoryFor(ctx));
        return {
          value: { ...state, impacts: business.impacts, journeys: business.journeys },
          subject: { impacts: business.impacts, modules: state.impactedModules },
          accepted: business.impacts.length,
        };
      }),

      // 6 — Risk Intelligence, Coverage Intelligence
      'guardrail-review': stage('guardrail-review', 'risk and coverage intelligence', (state, ctx) => {
        const risk = riskOrchestrator.coordinate(
          { facts: state.facts, impacts: state.impacts, churn: state.churn }, agents, factoryFor(ctx));
        const coverage = coverageOrchestrator.coordinate(
          { facts: state.facts, assets: deps.repositoryAssets }, agents, factoryFor(ctx));
        return {
          value: { ...state, risks: risk.risks, coverage: coverage.coverage, coverageSummary: coverage.summary },
          subject: { risks: risk.risks, coverage: coverage.coverage },
          accepted: risk.risks.length,
        };
      }),

      // 7 — Test Discovery, Reuse, Generation, Authoring, Execution Plan
      'execution-planning': stage('execution-planning', 'discovery, reuse, generation and authoring', (state, ctx) => {
        const factory = factoryFor(ctx);
        const candidates = testDiscoveryOrchestrator.coordinate(
          { coverage: state.coverage, facts: state.facts, risks: state.risks, impacts: state.impacts, dependencies: state.dependencies }, agents, factory);
        const reuse = reuseOrchestrator.coordinate(
          { candidates, assets: deps.repositoryAssets, automation: deps.repositoryAssets }, agents, factory);
        const automation = automationOrchestrator.coordinate(
          { decisions: reuse.decisions, candidates }, agents, factory);
        const authored = authoringOrchestrator.coordinate(
          { candidates, decisions: reuse.decisions, impacts: state.impacts }, agents, factory);
        return {
          value: {
            ...state, candidates, matches: reuse.matches, decisions: reuse.decisions,
            automation: automation.automation, requestedKinds: automation.requestedKinds,
            generatedKinds: automation.generatedKinds, authored,
          },
          subject: {
            candidates, decisions: reuse.decisions, authored,
            requestedKinds: automation.requestedKinds, generatedKinds: automation.generatedKinds,
          },
          accepted: authored.length,
        };
      }),

      // 8 — Scoped Execution. Execution Plane.
      execution: stage('execution', 'scoped execution', (state, ctx) => {
        const result = executionOrchestrator.coordinate({
          tests: state.authored, risks: state.risks, maxParallel: deps.maxParallel,
          environment: ctx.configuration['devchange.environment'] ?? 'ci',
          reachable: deps.environmentReachable,
          observed: deps.observedExecutions({ ...state.plan, ordering: state.authored.map((t) => t.id), batches: [state.authored.map((t) => t.id)] }),
        }, agents, factoryFor(ctx));
        return {
          value: { ...state, plan: result.plan, outcomes: result.outcomes, failedCount: result.census.failed },
          subject: { environmentValidated: result.plan.environmentValidated, batches: result.plan.batches, outcomes: result.outcomes },
          accepted: result.outcomes.length,
        };
      }),

      // 9 — Evidence. Execution Plane custody.
      evidence: stage('evidence', 'evidence capture', (state, ctx) => {
        const evidence = evidenceOrchestrator.coordinate(
          { outcomes: state.outcomes, captured: deps.capturedEvidence(state.outcomes) }, agents, factoryFor(ctx));
        return {
          value: { ...state, evidence },
          subject: { references: evidence, failedCount: state.failedCount },
          accepted: evidence.length,
        };
      }),

      // 10 — Healing, Reflection, Root Cause, Defect, Learning
      reflection: stage('reflection', 'healing, reflection, root cause, defect and learning', (state, ctx) => {
        const factory = factoryFor(ctx);
        const healing = healingOrchestrator.coordinate(
          { outcomes: state.outcomes, observedRetry: deps.observedRetry }, agents, factory);
        const reflections = reflectionOrchestrator.coordinate(
          { outcomes: state.outcomes, healing, facts: state.facts.map((f) => f.path) }, agents, factory);
        const rootCauses = rootCauseOrchestrator.coordinate(
          { reflections, outcomes: state.outcomes, changedPaths: state.facts.map((f) => f.path) }, agents, factory);
        const defects = defectOrchestrator.coordinate(
          { reflections, rootCauses, evidence: state.evidence, risks: state.risks, existing: deps.existingDefects }, agents, factory);
        const learning = learningOrchestrator.coordinate({
          facts: state.facts.map((f) => ({ path: f.path, layer: f.layer })),
          healing, reflections, matches: state.matches.length, outcomes: state.outcomes,
          promptsDelivered: runtime.reasoning.ledger().delivered,
        }, agents, factory);
        // The reviewer needs observedRetry alongside each heal to catch assumed validation.
        return {
          value: { ...state, healing, reflections, rootCauses, defects, learning },
          subject: {
            healing: healing.map((h) => ({ ...h, observedRetry: deps.observedRetry(h) })),
            reflections, rootCauses, defects, learning,
          },
          accepted: defects.length,
        };
      }),

      // 11 — Governance Review, Release Certification
      certification: stage('certification', 'release certification', (state) => {
        const triadTraversed = true; // The runner reached stage 11, so 4, 5 and 6 all sealed.
        const verdicts = [
          { certified: state.classified.length > 0, reason: `${state.classified.length} change(s) classified` },
          { certified: state.impacts.length > 0, reason: `${state.impacts.length} business impact(s) assessed` },
          { certified: state.authored.length > 0, reason: `${state.authored.length} test(s) authored` },
          { certified: state.outcomes.length === state.authored.length, reason: `${state.outcomes.length} outcome(s) for ${state.authored.length} test(s)` },
          { certified: state.defects.every((d) => d.rootCause.trim() !== '' && d.evidenceRefs.length > 0), reason: 'every defect carries a root cause and evidence' },
        ];
        return {
          value: { ...state, verdicts },
          subject: { triadTraversed, verdicts },
          accepted: verdicts.filter((v) => v.certified).length,
        };
      }),

      // 12 — Synchronization, Executive Reporting
      reporting: stage('reporting', 'synchronization and executive reporting', (state, ctx) => {
        const factory = factoryFor(ctx);
        const sync = syncOrchestrator.coordinate({
          workItem: runtime.workItemAdapter, project: runtime.adapters.project,
          testManagement: runtime.adapters.testManagement,
          execution: runtime.adapters.execution, tests: state.authored, outcomes: state.outcomes,
          evidence: state.evidence, defects: state.defects,
        }, agents, factory);

        const categories: Record<string, number> = {};
        for (const c of state.classified) for (const cat of c.categories) categories[cat] = (categories[cat] ?? 0) + 1;
        const added = state.facts.reduce((n, f) => n + f.addedLineCount, 0);
        const removed = state.facts.reduce((n, f) => n + f.removedLineCount, 0);
        const reuse = {
          reused: state.decisions.filter((d) => d.decision === 'reuse').length,
          extended: state.decisions.filter((d) => d.decision === 'extend').length,
          generated: state.decisions.filter((d) => d.decision === 'generate').length,
        };

        const reporting = reportingOrchestrator.coordinate({
          repository: event.repository, headCommit: event.headCommit,
          fileCount: state.facts.length, commitCount: state.commitCount, added, removed,
          byLayer: state.layerCensus, categories,
          impacts: state.impacts, impactedModules: state.impactedModules.map((m) => m.module),
          coverage: state.coverageSummary, reuse, generatedAssets: state.automation.length,
          outcomes: state.outcomes, healing: state.healing, reflections: state.reflections,
          defects: state.defects, risks: state.risks,
          reasoningMode: runtime.reasoning.ledger().mode,
          statedLimits: [
            'change-impact analysis is structural; a dependency expressed only through reflection, dynamic dispatch or configuration is not detected (ADR-0024 §6)',
            'reuse recall is deterministic and lexical; a semantically-equivalent asset with no shared terms is not matched',
            'provider adapters have not been executed against a real host',
          ],
        }, agents, factory);

        return {
          value: { ...state, sync: sync.records, report: reporting.report },
          subject: {
            sync: sync.records, releaseReadiness: reporting.report.releaseReadiness,
            claimedReady: reporting.report.releaseReadiness === 'READY',
            statedLimits: reporting.report.statedLimits,
          },
          accepted: sync.records.filter((r) => r.published).length,
        };
      }),
    },
  };
}
