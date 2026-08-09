/**
 * The master orchestrator and twenty domain orchestrators.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 15-configuration-model.md · 16-runtime-model.md
 *   ADR          : ADR-0024
 *   Criteria     : C-11.11 (no framework code branches on a capability identity)
 *                  C-12.1 (implements all twelve stages)
 *
 * THE MASTER ORCHESTRATOR RUNS THE ONE LIFECYCLE. IT DOES NOT DEFINE ONE.
 * `DevChangeEngineOrchestrator` receives a repository event, loads tenant, AI and
 * Dev-Change configuration, resolves the provider adapters, and hands the capability to
 * the framework's twelve-stage runner. It has no stage list and could not have one — the
 * runner is the only thing that can mint a sealed stage result.
 *
 * THE DOMAIN ORCHESTRATORS ACTUALLY SEQUENCE THEIR AGENTS.
 * Each `coordinate` invokes its domain's agents in order and returns the domain result;
 * the stages call `coordinate` rather than reaching past it. An orchestrator nothing
 * calls fails the conformance suite, which asserts every domain contributed at least one
 * observed agent invocation.
 *
 * WHERE `devchange.aiEnabled` BECOMES `ai.enabled`.
 * The translation happens here, in the capability that owns the surface — one line.
 * Framework code reading `devchange.aiEnabled` would be branching on a capability
 * identity, which C-11.11 forbids.
 */
import {
  runCapability, certify, resolveReasoningMode, gateProposals, proposalsFrom,
  invocationRecorder, VectorMemory,
  type AdapterRegistry, type AdapterSet, type AgentCatalogue, type AgentContext,
  type Capability, type CertificationOutcome, type InvocationRecorder, type ProposalSource,
  type ReasoningLedger, type ReasoningMode, type RunOutcome, type SourceControlAdapter,
  type WorkItemAdapter,
} from '@dbiz/capability-framework';
import type {
  AuthoredTest, AutomationAsset, BusinessImpact, ChangedFile, ChangeFact, ChangeKind,
  ClassifiedChange, CommitFact, CommitRecord, CoverageAssessment, Defect, DependencyEdge,
  DevChangeReport, EvidenceReference, ExecutionPlan, HealingAction, ImpactedModule,
  LearningRecord, ObservedExecution, Outcome, PullRequest, Reflection, RepositoryAsset,
  RepositoryAssetKind, RepositoryEvent, RepositoryMatch, ReuseDecision, RiskAssessment,
  RootCause, SyncRecord, TestCandidate, TestOutcome,
} from './model.js';
import type { ReportInput } from './agents/sync-and-reporting.js';

export const DOMAINS = [
  'repository', 'diff', 'change', 'dependency', 'business', 'risk', 'coverage',
  'testdiscovery', 'reuse', 'automation', 'authoring', 'execution', 'evidence',
  'healing', 'reflection', 'rootcause', 'defect', 'learning', 'sync', 'reporting',
  'governance',
] as const;
export type Domain = (typeof DOMAINS)[number];

export interface DomainOrchestrator<I, O> {
  readonly domain: Domain;
  readonly purpose: string;
  coordinate(input: I, agents: AgentCatalogue, ctx: AgentContextFactory): O;
}

export type AgentContextFactory = (agentId: string) => AgentContext;

export function defineDomainOrchestrator<I, O>(
  domain: Domain,
  purpose: string,
  coordinate: (input: I, agents: AgentCatalogue, ctx: AgentContextFactory) => O,
): DomainOrchestrator<I, O> {
  return { domain, purpose, coordinate };
}

const call = <I, O>(agents: AgentCatalogue, id: string, input: I, ctx: AgentContextFactory): O =>
  agents.invoke<I, O>(id, input, ctx(id));

// ── Repository Intelligence ─────────────────────────────────────────────────

export interface RepositoryResult {
  readonly branches: readonly { name: string; headCommit: string; isDefault: boolean }[];
  readonly pullRequest: PullRequest | null;
  readonly commits: readonly CommitRecord[];
  readonly merges: readonly string[];
  readonly index: readonly RepositoryAsset[];
  readonly existingTests: readonly RepositoryAsset[];
  readonly automationInventory: readonly RepositoryAsset[];
  readonly coChange: readonly { path: string; related: string; occurrences: number }[];
}

export const repositoryOrchestrator = defineDomainOrchestrator<
  { adapter: SourceControlAdapter; event: RepositoryEvent; assets: readonly RepositoryAsset[] }, RepositoryResult>(
  'repository', 'Discover branches, pull requests, commits and existing assets in the Execution Plane.',
  (input, agents, ctx) => {
    const branches = call<typeof input, RepositoryResult['branches']>(agents, 'repository.branch-discovery', input, ctx);
    const pr = call<typeof input, PullRequest | null>(agents, 'repository.pull-request-discovery', input, ctx);
    const commits = call<typeof input, readonly CommitRecord[]>(agents, 'repository.commit-discovery', input, ctx);
    const merges = call<{ commits: readonly CommitRecord[] }, readonly string[]>(agents, 'repository.merge-detection', { commits }, ctx);
    const index = call<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>(agents, 'repository.index', { assets: input.assets }, ctx);
    const existingTests = call<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>(agents, 'repository.existing-test-discovery', { assets: input.assets }, ctx);
    const automationInventory = call<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>(agents, 'repository.automation-inventory', { assets: input.assets }, ctx);
    // Changed paths are derived from the commits just discovered — never taken on faith.
    const changedPaths = [...new Set(commits.flatMap((c) => c.changedPaths))];
    const coChange = call<{ adapter: SourceControlAdapter; repository: string; paths: readonly string[] }, readonly { path: string; related: string; occurrences: number }[]>(
      agents, 'repository.co-change-history', { adapter: input.adapter, repository: input.event.repository, paths: changedPaths }, ctx);
    return { branches, pullRequest: pr, commits, merges, index, existingTests, automationInventory, coChange };
  });

export interface ContextResult {
  readonly facts: readonly ChangeFact[];
  readonly commitFacts: readonly CommitFact[];
  readonly layerCensus: Readonly<Record<string, number>>;
  readonly modules: readonly { module: string; paths: readonly string[] }[];
}

export const contextOrchestrator = defineDomainOrchestrator<
  { files: readonly ChangedFile[]; commits: readonly CommitRecord[] }, ContextResult>(
  'repository', 'Minimise diffs and commits into facts — the single boundary crossing.',
  (input, agents, ctx) => {
    const facts = call<{ files: readonly ChangedFile[] }, readonly ChangeFact[]>(agents, 'repository.minimise-changes', { files: input.files }, ctx);
    const commitFacts = call<{ commits: readonly CommitRecord[] }, readonly CommitFact[]>(agents, 'repository.minimise-commits', { commits: input.commits }, ctx);
    const layerCensus = call<{ facts: readonly ChangeFact[] }, Readonly<Record<string, number>>>(agents, 'repository.layer-census', { facts }, ctx);
    const modules = call<{ facts: readonly ChangeFact[] }, readonly { module: string; paths: readonly string[] }[]>(agents, 'repository.module-mapping', { facts }, ctx);
    return { facts, commitFacts, layerCensus, modules };
  });

// ── Diff Intelligence ───────────────────────────────────────────────────────

export interface DiffResult {
  readonly files: readonly ChangedFile[];
  readonly churn: readonly { path: string; added: number; removed: number; hunks: number }[];
  readonly renames: readonly { from: string; to: string }[];
  readonly summary: { analysable: number; excluded: number; renamed: number };
}

export const diffOrchestrator = defineDomainOrchestrator<
  { adapter: SourceControlAdapter; event: RepositoryEvent; merges: readonly string[] }, DiffResult>(
  'diff', 'Generate and structurally analyse the diff, entirely within the Execution Plane.',
  (input, agents, ctx) => {
    const raw = call<typeof input, readonly ChangedFile[]>(agents, 'diff.generation', input, ctx);
    const files = call<{ files: readonly ChangedFile[] }, readonly ChangedFile[]>(agents, 'diff.binary-and-generated-filter', { files: raw }, ctx);
    const churn = call<{ files: readonly ChangedFile[] }, DiffResult['churn']>(agents, 'diff.hunk-analysis', { files }, ctx);
    call<{ files: readonly ChangedFile[] }, unknown>(agents, 'diff.symbol-extraction', { files }, ctx);
    const renames = call<{ files: readonly ChangedFile[] }, readonly { from: string; to: string }[]>(agents, 'diff.rename-detection', { files }, ctx);
    call<{ files: readonly ChangedFile[] }, unknown>(agents, 'diff.file-classification', { files }, ctx);
    const summary = call<{ files: readonly ChangedFile[]; merges: readonly string[] }, DiffResult['summary']>(agents, 'diff.summary', { files, merges: input.merges }, ctx);
    return { files, churn, renames, summary };
  });

// ── Change Intelligence ─────────────────────────────────────────────────────

export interface ChangeResult {
  readonly classified: readonly ClassifiedChange[];
  readonly breaking: readonly string[];
  readonly apiPaths: readonly string[];
  readonly schemaPaths: readonly string[];
  readonly configPaths: readonly string[];
  readonly changeTypes: Readonly<Record<string, readonly string[]>>;
}

/** The change types the brief enumerates, each detected by its own agent. */
const CHANGE_TYPE_AGENTS: readonly { id: string; type: string }[] = [
  { id: 'change.business-change', type: 'business' },
  { id: 'change.functional-change', type: 'functional' },
  { id: 'change.technical-change', type: 'technical' },
  { id: 'change.ui-change', type: 'ui' },
  { id: 'change.behaviour-change', type: 'behaviour' },
  { id: 'change.infrastructure-change', type: 'infrastructure' },
  { id: 'change.dependency-change', type: 'dependency' },
];

export const changeOrchestrator = defineDomainOrchestrator<{ facts: readonly ChangeFact[] }, ChangeResult>(
  'change', 'Classify changes into business, functional, technical, API, schema, UI and breaking categories.',
  (input, agents, ctx) => {
    // Each enumerated change type is detected by its own agent; the results are folded
    // into a breakdown the report surfaces, so none is a dormant producer.
    const changeTypes: Record<string, readonly string[]> = {};
    for (const a of CHANGE_TYPE_AGENTS) {
      changeTypes[a.type] = call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, a.id, input, ctx);
    }
    return {
      classified: call<{ facts: readonly ChangeFact[] }, readonly ClassifiedChange[]>(agents, 'change.classification', input, ctx),
      breaking: call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, 'change.breaking-detection', input, ctx),
      apiPaths: call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, 'change.api-surface', input, ctx),
      schemaPaths: call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, 'change.schema-detection', input, ctx),
      configPaths: call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, 'change.configuration-drift', input, ctx),
      changeTypes,
    };
  });

export interface DependencyResult {
  readonly dependencies: readonly DependencyEdge[];
  readonly modules: readonly ImpactedModule[];
  readonly packageChanges: readonly { module: string; version: string | null }[];
}

export const dependencyOrchestrator = defineDomainOrchestrator<
  { facts: readonly ChangeFact[]; coChange: readonly { path: string; related: string; occurrences: number }[]; modules: readonly { module: string; paths: readonly string[] }[] }, DependencyResult>(
  'dependency', 'Build the dependency graph and compute blast radius across modules.',
  (input, agents, ctx) => {
    const dependencies = call<typeof input, readonly DependencyEdge[]>(agents, 'dependency.graph', input, ctx);
    const modules = call<{ facts: readonly ChangeFact[]; edges: readonly DependencyEdge[]; modules: readonly { module: string; paths: readonly string[] }[] }, readonly ImpactedModule[]>(
      agents, 'dependency.blast-radius', { facts: input.facts, edges: dependencies, modules: input.modules }, ctx);
    const packageChanges = call<{ facts: readonly ChangeFact[] }, readonly { module: string; version: string | null }[]>(agents, 'dependency.package-changes', { facts: input.facts }, ctx);
    return { dependencies, modules, packageChanges };
  });

export interface BusinessResult {
  readonly impacts: readonly BusinessImpact[];
  readonly journeys: readonly string[];
  readonly releaseRisk: { critical: number; customerFacing: number; releaseRisk: boolean };
  readonly capabilities: readonly string[];
  readonly crossModule: readonly { module: string; reaches: readonly string[] }[];
  readonly criticality: { criticality: string; customerFacing: number };
}

export const businessOrchestrator = defineDomainOrchestrator<
  { classified: readonly ClassifiedChange[]; modules: readonly ImpactedModule[] }, BusinessResult>(
  'business', 'Determine business impact, capabilities, cross-module reach, journeys and release risk.',
  (input, agents, ctx) => {
    const impacts = call<typeof input, readonly BusinessImpact[]>(agents, 'business.impact-analysis', input, ctx);
    const journeys = call<{ impacts: readonly BusinessImpact[] }, readonly string[]>(agents, 'business.customer-journeys', { impacts }, ctx);
    const releaseRisk = call<{ impacts: readonly BusinessImpact[] }, BusinessResult['releaseRisk']>(agents, 'business.release-risk', { impacts }, ctx);
    const capabilities = call<{ impacts: readonly BusinessImpact[] }, readonly string[]>(agents, 'business.affected-capabilities', { impacts }, ctx);
    const crossModule = call<{ impacts: readonly BusinessImpact[]; modules: readonly ImpactedModule[] }, readonly { module: string; reaches: readonly string[] }[]>(
      agents, 'business.cross-module-impact', { impacts, modules: input.modules }, ctx);
    const criticality = call<{ impacts: readonly BusinessImpact[] }, { criticality: string; customerFacing: number }>(agents, 'business.criticality-summary', { impacts }, ctx);
    return { impacts, journeys, releaseRisk, capabilities, crossModule, criticality };
  });

export interface RiskResult {
  readonly risks: readonly RiskAssessment[];
  readonly gate: { releaseBlocking: number; band: string };
}

export const riskOrchestrator = defineDomainOrchestrator<
  { facts: readonly ChangeFact[]; impacts: readonly BusinessImpact[]; churn: readonly { path: string; added: number; removed: number }[] }, RiskResult>(
  'risk', 'Band risk per changed area and summarise the release gate.',
  (input, agents, ctx) => {
    const risks = call<typeof input, readonly RiskAssessment[]>(agents, 'risk.assessment', input, ctx);
    const gate = call<{ risks: readonly RiskAssessment[] }, RiskResult['gate']>(agents, 'risk.release-gate', { risks }, ctx);
    return { risks, gate };
  });

export interface CoverageResult {
  readonly coverage: readonly CoverageAssessment[];
  readonly summary: { assessed: number; covered: number; gaps: number };
  readonly priorityGaps: readonly string[];
}

export const coverageOrchestrator = defineDomainOrchestrator<
  { facts: readonly ChangeFact[]; assets: readonly RepositoryAsset[] }, CoverageResult>(
  'coverage', 'Assess existing coverage, summarise gaps and flag the risk-weighted priority gaps.',
  (input, agents, ctx) => {
    const coverage = call<typeof input, readonly CoverageAssessment[]>(agents, 'coverage.assessment', input, ctx);
    const summary = call<{ coverage: readonly CoverageAssessment[] }, CoverageResult['summary']>(agents, 'coverage.gap-summary', { coverage }, ctx);
    const priorityGaps = call<{ facts: readonly ChangeFact[] }, readonly string[]>(agents, 'coverage.risk-weighted-gaps', { facts: input.facts }, ctx);
    return { coverage, summary, priorityGaps };
  });

// ── Planning: discovery, reuse, generation, authoring ───────────────────────

export interface PlanningResult {
  readonly candidates: readonly TestCandidate[];
  readonly matches: readonly RepositoryMatch[];
  readonly decisions: readonly ReuseDecision[];
  readonly automation: readonly AutomationAsset[];
  readonly requestedKinds: readonly RepositoryAssetKind[];
  readonly generatedKinds: readonly RepositoryAssetKind[];
  readonly authored: readonly AuthoredTest[];
}

export const testDiscoveryOrchestrator = defineDomainOrchestrator<
  { coverage: readonly CoverageAssessment[]; facts: readonly ChangeFact[]; risks: readonly RiskAssessment[]; impacts: readonly BusinessImpact[]; dependencies: readonly DependencyEdge[] }, readonly TestCandidate[]>(
  'testdiscovery', 'Select the tests that must run or exist to re-verify the change, including dependency fan-out.',
  (input, agents, ctx) => {
    const base = call<{ coverage: readonly CoverageAssessment[]; facts: readonly ChangeFact[]; risks: readonly RiskAssessment[]; impacts: readonly BusinessImpact[] }, readonly TestCandidate[]>(
      agents, 'discovery.candidate-selection', input, ctx);
    const journeys = call<{ candidates: readonly TestCandidate[]; impacts: readonly BusinessImpact[] }, readonly TestCandidate[]>(
      agents, 'discovery.journey-candidates', { candidates: base, impacts: input.impacts }, ctx);
    // Paths that DEPEND on a changed export must be re-verified even though they did not
    // change — the dependency fan-out agent is what turns blast radius into candidates.
    const fanoutPaths = call<{ facts: readonly ChangeFact[]; dependencies: readonly { from: string; to: string }[] }, readonly string[]>(
      agents, 'discovery.dependency-fanout', { facts: input.facts, dependencies: input.dependencies }, ctx);
    const known = new Set(base.map((c) => c.targetPath));
    const fanout: readonly TestCandidate[] = fanoutPaths.filter((p) => !known.has(p)).map((p) => ({
      id: `cand-fanout-${p.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      title: `Re-verify dependent ${p}`, targetPath: p, kind: 'test-case' as RepositoryAssetKind,
      priority: 'P2' as const, reason: 'depends on a changed export (fan-out)',
    }));
    return [...base, ...journeys, ...fanout];
  });

export const reuseOrchestrator = defineDomainOrchestrator<
  { candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[]; automation: readonly RepositoryAsset[] },
  { matches: readonly RepositoryMatch[]; decisions: readonly ReuseDecision[] }>(
  'reuse', 'Search the repository index in the Execution Plane and decide reuse before generate.',
  (input, agents, ctx) => {
    const byPath = call<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly RepositoryMatch[]>(
      agents, 'repository.search.path-and-symbol', { candidates: input.candidates, assets: input.assets }, ctx);
    const byVector = call<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly RepositoryMatch[]>(
      agents, 'repository.search.lexical-vector', { candidates: input.candidates, assets: input.assets }, ctx);
    // One search agent per reuse target the brief enumerates. Each returns candidate/asset
    // id pairs; they widen the match pool the reuse decision then rules on.
    const targeted: RepositoryMatch[] = [];
    for (const id of REPOSITORY_SEARCH_AGENTS) {
      const found = call<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly { candidateId: string; assetId: string }[]>(
        agents, id, { candidates: input.candidates, assets: input.assets }, ctx);
      for (const m of found) {
        const asset = input.assets.find((a) => a.id === m.assetId);
        targeted.push({ candidateId: m.candidateId, assetId: m.assetId, assetKind: (asset?.kind ?? 'test-case') as RepositoryAssetKind, score: 0.75, method: 'path' });
      }
    }
    // Deduplicate by candidate+asset, keeping the strongest score.
    const byKey = new Map<string, RepositoryMatch>();
    for (const m of [...byPath, ...byVector, ...targeted]) {
      const key = `${m.candidateId}:${m.assetId}`;
      const existing = byKey.get(key);
      if (!existing || m.score > existing.score) byKey.set(key, m);
    }
    const matches = [...byKey.values()];
    const decisions = call<{ candidates: readonly TestCandidate[]; matches: readonly RepositoryMatch[]; existingAutomation: readonly RepositoryAsset[] }, readonly ReuseDecision[]>(
      agents, 'reuse.decision', { candidates: input.candidates, matches, existingAutomation: input.automation }, ctx);
    return { matches, decisions };
  });

const REPOSITORY_SEARCH_AGENTS: readonly string[] = [
  'repository.search.existing-tests', 'repository.search.features', 'repository.search.page-objects',
  'repository.search.components', 'repository.search.apis', 'repository.search.step-definitions',
  'repository.search.locators', 'repository.search.fixtures',
];

export const automationOrchestrator = defineDomainOrchestrator<
  { decisions: readonly ReuseDecision[]; candidates: readonly TestCandidate[] },
  { automation: readonly AutomationAsset[]; requestedKinds: readonly RepositoryAssetKind[]; generatedKinds: readonly RepositoryAssetKind[] }>(
  'automation', 'Generate only the automation reuse could not satisfy, per framework, and reconcile the kinds.',
  (input, agents, ctx) => {
    const automation = call<typeof input, readonly AutomationAsset[]>(agents, 'automation.generation', input, ctx);
    // One generator per framework the brief names. Each returns outlines for the
    // candidates whose kind maps to it; the outlines augment the generated assets.
    const outlinesByCandidate = new Map<string, string[]>();
    for (const id of FRAMEWORK_AGENTS) {
      const produced = call<typeof input, readonly { candidateId: string; framework: string; outline: readonly string[] }[]>(agents, id, input, ctx);
      for (const p of produced) outlinesByCandidate.set(p.candidateId, [...(outlinesByCandidate.get(p.candidateId) ?? []), ...p.outline]);
    }
    const enriched = automation.map((a) => {
      const extra = outlinesByCandidate.get(a.candidateId) ?? [];
      return extra.length ? { ...a, outline: [...a.outline, ...extra] } : a;
    });
    const kinds = call<typeof input, { requested: readonly RepositoryAssetKind[]; generated: readonly RepositoryAssetKind[] }>(agents, 'automation.kind-reconciliation', input, ctx);
    return { automation: enriched, requestedKinds: kinds.requested, generatedKinds: kinds.generated };
  });

const FRAMEWORK_AGENTS: readonly string[] = [
  'automation.playwright', 'automation.cypress', 'automation.selenium', 'automation.api-tests', 'automation.bdd',
];

export const authoringOrchestrator = defineDomainOrchestrator<
  { candidates: readonly TestCandidate[]; decisions: readonly ReuseDecision[]; impacts: readonly BusinessImpact[] }, readonly AuthoredTest[]>(
  'authoring', 'Author enterprise test cases with steps, expected results and traceability.',
  (input, agents, ctx) => call<typeof input, readonly AuthoredTest[]>(agents, 'authoring.enterprise-test-cases', input, ctx));

// ── Execution, evidence, reflection, reporting ──────────────────────────────

export interface ExecutionResult {
  readonly plan: ExecutionPlan;
  readonly outcomes: readonly TestOutcome[];
  readonly census: { passed: number; failed: number; skipped: number };
}

export const executionOrchestrator = defineDomainOrchestrator<
  { tests: readonly AuthoredTest[]; risks: readonly RiskAssessment[]; maxParallel: number; environment: string; reachable: boolean; observed: ReadonlyMap<string, ObservedExecution> }, ExecutionResult>(
  'execution', 'Plan risk-first batches and report the outcome the Execution Plane observed.',
  (input, agents, ctx) => {
    const plan = call<{ tests: readonly AuthoredTest[]; risks: readonly RiskAssessment[]; maxParallel: number; environment: string; reachable: boolean }, ExecutionPlan>(
      agents, 'execution.planning', input, ctx);
    const outcomes = call<{ plan: ExecutionPlan; observed: ReadonlyMap<string, ObservedExecution> }, readonly TestOutcome[]>(
      agents, 'execution.scoped-run', { plan, observed: input.observed }, ctx);
    const census = call<{ outcomes: readonly TestOutcome[] }, ExecutionResult['census']>(agents, 'execution.monitor', { outcomes }, ctx);
    return { plan, outcomes, census };
  });

export const evidenceOrchestrator = defineDomainOrchestrator<
  { outcomes: readonly TestOutcome[]; captured: readonly { testId: string; kind: EvidenceReference['kind']; sha256: string; locator: string }[] }, readonly EvidenceReference[]>(
  'evidence', 'Turn captured artefacts into references — hash and locator only.',
  (input, agents, ctx) => call<typeof input, readonly EvidenceReference[]>(agents, 'evidence.capture', input, ctx));

export interface ReflectionResult {
  readonly healing: readonly HealingAction[];
  readonly reflections: readonly Reflection[];
  readonly rootCauses: readonly RootCause[];
  readonly defects: readonly Defect[];
  readonly learning: readonly LearningRecord[];
}

const HEALING_KIND_AGENTS: readonly string[] = [
  'healing.locator', 'healing.dom', 'healing.retry', 'healing.dependency', 'healing.environment', 'healing.data',
];

export const healingOrchestrator = defineDomainOrchestrator<
  { outcomes: readonly TestOutcome[]; observedRetry: (a: HealingAction) => Outcome | null }, readonly HealingAction[]>(
  'healing', 'Propose heals per kind and validate them only on an observed passing retry.',
  (input, agents, ctx) => {
    // The per-kind agents each propose for the failures their signal matches. The coarse
    // proposer catches anything the specific ones did not. Deduplicated by test id, so a
    // failure yields exactly one heal and its validated status is unambiguous.
    const proposals: HealingAction[] = [];
    for (const id of HEALING_KIND_AGENTS) {
      proposals.push(...call<typeof input, readonly HealingAction[]>(agents, id, input, ctx));
    }
    proposals.push(...call<typeof input, readonly HealingAction[]>(agents, 'healing.proposal', input, ctx));
    const byTest = new Map<string, HealingAction>();
    for (const h of proposals) if (!byTest.has(h.testId)) byTest.set(h.testId, h);
    return [...byTest.values()];
  });

export const reflectionOrchestrator = defineDomainOrchestrator<
  { outcomes: readonly TestOutcome[]; healing: readonly HealingAction[]; facts: readonly string[] }, readonly Reflection[]>(
  'reflection', 'Classify each failure with reasoning and a confidence.',
  (input, agents, ctx) => call<typeof input, readonly Reflection[]>(agents, 'reflection.classification', input, ctx));

export const rootCauseOrchestrator = defineDomainOrchestrator<
  { reflections: readonly Reflection[]; outcomes: readonly TestOutcome[]; changedPaths: readonly string[] }, readonly RootCause[]>(
  'rootcause', 'Determine the cause category and suspect paths for each real bug.',
  (input, agents, ctx) => {
    const causes = call<typeof input, readonly RootCause[]>(agents, 'rootcause.analysis', input, ctx);
    // Category-specific suspect finders sharpen the suspect set: a configuration or
    // manifest path in the change is a stronger suspect for the matching cause category.
    const configSuspects = call<{ changedPaths: readonly string[] }, readonly string[]>(agents, 'rootcause.configuration-suspects', { changedPaths: input.changedPaths }, ctx);
    const dependencySuspects = call<{ changedPaths: readonly string[] }, readonly string[]>(agents, 'rootcause.dependency-suspects', { changedPaths: input.changedPaths }, ctx);
    return causes.map((c) => {
      const sharpened = c.kind === 'configuration' ? configSuspects : c.kind === 'dependency' ? dependencySuspects : [];
      return sharpened.length > 0 ? { ...c, suspectPaths: [...new Set([...c.suspectPaths, ...sharpened])] } : c;
    });
  });

export const defectOrchestrator = defineDomainOrchestrator<
  { reflections: readonly Reflection[]; rootCauses: readonly RootCause[]; evidence: readonly EvidenceReference[]; risks: readonly RiskAssessment[]; existing: readonly Defect[] }, readonly Defect[]>(
  'defect', 'Raise a defect for every real bug, with impact, evidence and traceability.',
  (input, agents, ctx) => call<typeof input, readonly Defect[]>(agents, 'defect.generation', input, ctx));

export const learningOrchestrator = defineDomainOrchestrator<
  { facts: readonly { path: string; layer: string }[]; healing: readonly HealingAction[]; reflections: readonly Reflection[]; matches: number; outcomes: readonly TestOutcome[]; promptsDelivered: readonly string[] }, readonly LearningRecord[]>(
  'learning', 'Capture repository, change, failure, healing, history, graph, memory and prompt learning.',
  (input, agents, ctx) => call<typeof input, readonly LearningRecord[]>(agents, 'learning.capture', input, ctx));

export interface SyncResult {
  readonly records: readonly SyncRecord[];
}

export const syncOrchestrator = defineDomainOrchestrator<
  { workItem: WorkItemAdapter; project: AdapterSet['project']; testManagement: AdapterSet['testManagement']; execution: AdapterSet['execution']; tests: readonly AuthoredTest[]; outcomes: readonly TestOutcome[]; evidence: readonly EvidenceReference[]; defects: readonly Defect[] }, SyncResult>(
  'sync', 'Publish work items, tests, requirement traceability, results, evidence and defects through the resolved adapters.',
  (input, agents, ctx) => {
    const workItems = call<{ adapter: WorkItemAdapter; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>(agents, 'sync.work-items', { adapter: input.workItem, tests: input.tests }, ctx);
    const tests = call<{ adapter: AdapterSet['testManagement']; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>(agents, 'sync.test-management', { adapter: input.testManagement, tests: input.tests }, ctx);
    // Close the loop the PR opened: link the change's tests back to the requirement they
    // re-verify, in the project tool. This is where ProjectAdapter is exercised.
    const traceability = call<{ adapter: AdapterSet['project']; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>(agents, 'sync.requirement-traceability', { adapter: input.project, tests: input.tests }, ctx);
    const results = call<{ adapter: AdapterSet['execution']; outcomes: readonly TestOutcome[]; evidence: readonly EvidenceReference[] }, readonly SyncRecord[]>(agents, 'sync.results-and-evidence', { adapter: input.execution, outcomes: input.outcomes, evidence: input.evidence }, ctx);
    const defects = call<{ adapter: AdapterSet['execution']; defects: readonly Defect[] }, readonly SyncRecord[]>(agents, 'sync.defects', { adapter: input.execution, defects: input.defects }, ctx);
    return { records: [...workItems, ...tests, ...traceability, ...results, ...defects] };
  });

export const reportingOrchestrator = defineDomainOrchestrator<ReportInput, { report: DevChangeReport; dashboard: readonly string[]; pdf: { bytes: number; pages: number } }>(
  'reporting', 'Compose the report and render the dashboard, PDF and board determination.',
  (input, agents, ctx) => {
    const report = call<ReportInput, DevChangeReport>(agents, 'reporting.dev-change-report', input, ctx);
    const dashboard = call<{ report: DevChangeReport }, readonly string[]>(agents, 'reporting.executive-dashboard', { report }, ctx);
    const pdf = call<{ report: DevChangeReport }, { bytes: number; pages: number }>(agents, 'reporting.executive-pdf', { report }, ctx);
    call<{ report: DevChangeReport }, unknown>(agents, 'reporting.board-report', { report }, ctx);
    return { report, dashboard, pdf };
  });

// ── Governance orchestrator ─────────────────────────────────────────────────

import type { ReviewFinding, StageName } from '@dbiz/capability-framework';

export interface GovernanceInput {
  readonly stage: StageName;
  readonly phase: 'review' | 'decision' | 'certification';
  readonly subject: unknown;
  readonly findings: readonly ReviewFinding[];
  readonly accept: boolean;
  readonly accepted: number;
}

export const governanceOrchestrator = defineDomainOrchestrator<GovernanceInput, unknown>(
  'governance', 'Run the review, decision or certification agent for a stage.',
  (input, agents, ctx) => {
    if (input.phase === 'review') {
      return call<{ subject: unknown }, readonly ReviewFinding[]>(agents, `governance.${input.stage}.review`, { subject: input.subject }, ctx);
    }
    if (input.phase === 'decision') {
      return call<{ subject: unknown; findings: readonly ReviewFinding[] }, unknown>(agents, `governance.${input.stage}.decision`, { subject: input.subject, findings: input.findings }, ctx);
    }
    return call<{ accept: boolean; findings: readonly ReviewFinding[]; accepted: number }, unknown>(
      agents, `governance.${input.stage}.certification`, { accept: input.accept, findings: input.findings, accepted: input.accepted }, ctx);
  });

// ── The domain orchestrator registry ────────────────────────────────────────

export const domainOrchestrators: Readonly<Record<Domain, DomainOrchestrator<never, unknown>>> = {
  repository: repositoryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  diff: diffOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  change: changeOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  dependency: dependencyOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  business: businessOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  risk: riskOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  coverage: coverageOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  testdiscovery: testDiscoveryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reuse: reuseOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  automation: automationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  authoring: authoringOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  execution: executionOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  evidence: evidenceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  healing: healingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reflection: reflectionOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  rootcause: rootCauseOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  defect: defectOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  learning: learningOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  sync: syncOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reporting: reportingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  governance: governanceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
};

// ── The master orchestrator ─────────────────────────────────────────────────

export interface DevChangeRequest {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly event: RepositoryEvent;
  /** Tenant configuration, including `devchange.aiEnabled` and provider selection. */
  readonly configuration: Readonly<Record<string, string>>;
  /** Reasoning proposals by agent id. Ignored entirely when AI is disabled. */
  readonly proposals?: Readonly<Record<string, unknown>>;
}

export interface DevChangeOrchestrationResult {
  readonly run: RunOutcome;
  readonly certification: CertificationOutcome;
  readonly reasoningMode: ReasoningMode;
  readonly reasoning: ReasoningLedger;
  readonly adapters: { readonly project: string; readonly testManagement: string; readonly execution: string; readonly workItem: string; readonly sourceControl: string };
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
  readonly sourceControl: SourceControlAdapter;
  readonly memory: VectorMemory;
}

export class DevChangeEngineOrchestrator {
  private readonly state = new Map<string, RunOutcome>();
  /** Vector memory outlives a run. That is what makes it memory rather than an index. */
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

  execute(request: DevChangeRequest): DevChangeOrchestrationResult {
    const adapters = this.resolveAdapters(request.configuration);
    const workItemAdapter = this.adapterRegistry.resolveWorkItem(request.configuration);
    const sourceControl = this.adapterRegistry.resolveSourceControl(request.configuration);

    // The capability's own configuration surface translated onto the framework's
    // capability-neutral key. One line, and the only place the two names meet.
    const configuration = {
      ...request.configuration,
      'ai.enabled': request.configuration['devchange.aiEnabled'] ?? 'false',
      'adapter.project': adapters.project.identity.provider,
      'adapter.testManagement': adapters.testManagement.identity.provider,
      'adapter.execution': adapters.execution.identity.provider,
      'adapter.workItem': workItemAdapter.identity.provider,
      'adapter.sourceControl': sourceControl.identity.provider,
    };

    const mode = resolveReasoningMode(configuration);
    const reasoning = gateProposals(mode, proposalsFrom(request.proposals ?? {}));
    const recorder = invocationRecorder(reasoning.source);

    const prior = this.state.get(request.runId);
    const resumed = prior !== undefined && prior.failedAt !== null;

    const run = runCapability(
      this.capabilityFor({ reasoning, recorder, adapters, workItemAdapter, sourceControl, memory: this.memoryFor(request.tenantId) }),
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
        sourceControl: sourceControl.identity.provider,
      },
      agentsInvoked: recorder.invoked(),
      resumed, rolledBack,
    };
  }

  retry(request: DevChangeRequest): DevChangeOrchestrationResult { return this.execute(request); }

  auditTrailFor(runId: string): readonly { at: number; stage: string | null; event: string; detail: string }[] {
    return this.state.get(runId)?.audit ?? [];
  }
}

export type { ChangeKind };
