/**
 * The Security Testing Engine, implemented across the twelve-stage lifecycle — capability 5 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (capability 5) · 12-capability-orchestration.md
 *                  08-security-model.md · 22-security-threat-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.13 · C-13.1 · C-14.1
 *
 * REQUIREMENT-DRIVEN VERIFICATION ONTO TWELVE FROZEN STAGES (ADR-0028 §4):
 *    1 planning            Verification request, scope, security-requirement elicitation
 *    2 discovery      EP    Resource inventory (endpoints, headers, TLS, deps, IaC, cloud, ...)
 *    3 context     EP->IP   Fact minimisation — the single structure-only crossing
 *    4 arch-review         Security Requirement Model                         (governance triad)
 *    5 policy-review       Verification Authorization                          (governance triad)
 *    6 guardrail-review    Verification Guardrails                             (governance triad)
 *    7 exec-planning       Verification campaign
 *    8 execution      EP    Read-only, deterministic checkers
 *    9 evidence       EP    Evidence by reference, hashed, EP custody
 *   10 reflection          Assessment, compliance, remediation, posture, learning
 *   11 certification       Security certification
 *   12 reporting           Synchronization and executive reporting
 *
 * NO CHECK RUNS BEFORE THE GUARDRAIL STAGE CERTIFIES. A request for an intrusive category
 * (capability 6), a non-read-only run, or a run with no authorization is refused at
 * guardrail-review, before the execution stage — the verification analogue of pentest's
 * "no destructive probe before any packet".
 */
import {
  runPhase, observedAgents, resolveReasoningMode,
  type AgentContext, type Capability, type ReviewFinding, type StageContext,
  type StageEmitter, type StageName, type StageResult,
} from '@dbiz/capability-framework';
import { buildCatalogue } from './catalogue.js';
import type { ScopeResolution } from './agents/requirement.js';
import type { VerificationCampaign } from './agents/authorization.js';
import type { ReportInput } from './agents/reporting.js';
import {
  scopeOrchestrator, requirementOrchestrator, inventoryOrchestrator, modelOrchestrator,
  authorizationOrchestrator, guardrailOrchestrator, campaignOrchestrator, verifyOrchestrator,
  evidenceOrchestrator, assessmentOrchestrator, complianceOrchestrator, remediationOrchestrator,
  postureOrchestrator, learningOrchestrator, syncOrchestrator, reportingOrchestrator,
  governanceOrchestrator, domainOrchestrators, SecurityTestingOrchestrator,
  knowledgeGraphOrchestrator, riskCorrelationOrchestrator, businessContextOrchestrator,
  attackSurfaceOrchestrator, developerOrchestrator, predictiveOrchestrator,
  certificationIntelOrchestrator, executiveOrchestrator, contributionOrchestrator,
  type AgentContextFactory, type AuthorizationCandidate, type EngineRuntime, type VerifyResult,
} from './orchestrators.js';
import type {
  AttackSurfaceGraph, BusinessContext, DeveloperGuidance, EnterpriseRisk, ExecutiveIntelligence,
  HistoricalFinding, PredictiveIntelligence, SecurityCertification, SecurityIntelligenceContribution,
  SecurityIntelligenceReport, SecurityKnowledgeGraph,
} from './intelligence-layer.js';
import type { SecurityAdapterRegistry } from './adapters.js';
import {
  minimiseWeakness,
  type AssessedWeakness, type Authorization, type ComplianceResult,
  type EvidenceReference, type LearningRecord, type ObservedResource, type PostureScores,
  type RawWeakness, type Remediation, type SecurityFact, type SecurityModel, type SecurityReport,
  type SecurityRequirement, type SecurityScope, type Severity, type SyncRecord, type Weakness,
} from './model.js';
import { boardReport, renderReportPdf } from './agents/report.js';

export const CAPABILITY_ID = 'security-testing';

export interface EngineDependencies {
  /** The Execution-Plane observation of the target's resources. Bound by the scope predicate. */
  readonly observe: (scope: SecurityScope, inScope: (path: string) => boolean) => readonly ObservedResource[];
  /** Whether the target responded. `false` yields an empty, honest execution stage. */
  readonly environmentReachable: boolean;
  /**
   * Prior security findings for the Predictive Security intelligence (ADR-0029), supplied by
   * the Intelligence-Plane knowledge base — NEVER by the Execution Plane, which holds no
   * intelligence. Absent means predictions are low-confidence, and say so.
   */
  readonly priorFindings?: readonly HistoricalFinding[];
}

interface EngineState {
  readonly scopeRes: ScopeResolution;
  readonly requirements: readonly SecurityRequirement[];
  readonly observed: readonly ObservedResource[];
  readonly facts: readonly SecurityFact[];
  readonly model: SecurityModel;
  readonly candidate: AuthorizationCandidate;
  readonly authorization: Authorization;
  readonly campaign: VerificationCampaign;
  readonly raw: readonly RawWeakness[];
  readonly weaknesses: readonly Weakness[];
  readonly verify: VerifyResult;
  readonly evidence: readonly EvidenceReference[];
  readonly assessed: readonly AssessedWeakness[];
  readonly compliance: readonly ComplianceResult[];
  readonly complianceScore: number;
  readonly remediations: readonly Remediation[];
  readonly scores: PostureScores;
  readonly learning: readonly LearningRecord[];
  // Security Intelligence Layer (ADR-0029)
  readonly risks: readonly EnterpriseRisk[];
  readonly graph: SecurityKnowledgeGraph;
  readonly businessContext: BusinessContext | null;
  readonly attackSurface: AttackSurfaceGraph;
  readonly developer: readonly DeveloperGuidance[];
  readonly predictive: PredictiveIntelligence;
  readonly certification: SecurityCertification | null;
  readonly executive: ExecutiveIntelligence | null;
  readonly contribution: SecurityIntelligenceContribution | null;
  readonly intelligenceReport: SecurityIntelligenceReport | null;
  readonly sync: readonly SyncRecord[];
  readonly report: SecurityReport | null;
}

const EMPTY_SCOPE: SecurityScope = { targetId: '', allowedHosts: [], asvsLevel: 2, requestedCategories: [], complianceTargets: [], authorizationReference: '', environment: 'unknown', readOnly: true };
const EMPTY_MODEL: SecurityModel = { targetId: '', facts: [], requirements: [], trustBoundaries: [], assets: [], inScopeCategories: [], exposureScore: 0 };
const EMPTY_AUTH: Authorization = { targetId: '', authorizedCategories: [], refusedCategories: [], asvsLevel: 2, readOnly: true, certified: false, refusals: [] };
const EMPTY_SCORES: PostureScores = { securityScore: 0, owaspScore: 0, apiScore: 0, cloudScore: 0, identityScore: 0, complianceScore: 0, riskHeatMap: {}, attackSurfaceSummary: '', trend: 'stable' };
const EMPTY_GRAPH: SecurityKnowledgeGraph = { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, central: [] };
const EMPTY_SURFACE: AttackSurfaceGraph = { entryPoints: [], trustBoundaries: [], apiGraph: [], dataFlows: [], externalIntegrations: [], secretsSurfaces: [], exposureScore: 0 };
const EMPTY_PREDICTIVE: PredictiveIntelligence = { hotspots: [], regressionProbability: [], trendingCategories: [], highRiskModules: [], frequentlyVulnerableApis: [] };

function initialState(): EngineState {
  return {
    scopeRes: { scope: EMPTY_SCOPE, requestedCategories: [], intrusiveRequested: false, missingAuthorization: false, readOnlyViolated: false, complianceTargets: [], production: false, summary: '' },
    requirements: [], observed: [], facts: [], model: EMPTY_MODEL,
    candidate: { candidateCategories: [], refusedIntrusive: [] }, authorization: EMPTY_AUTH,
    campaign: { batches: [], parallelism: 1, ordered: [] }, raw: [], weaknesses: [],
    verify: { raw: [], checked: [], skipped: [] }, evidence: [], assessed: [], compliance: [], complianceScore: 0,
    remediations: [], scores: EMPTY_SCORES, learning: [],
    risks: [], graph: EMPTY_GRAPH, businessContext: null, attackSurface: EMPTY_SURFACE, developer: [],
    predictive: EMPTY_PREDICTIVE, certification: null, executive: null, contribution: null, intelligenceReport: null,
    sync: [], report: null,
  };
}

function buildScope(config: Readonly<Record<string, string>>): SecurityScope {
  const list = (k: string): string[] => (config[k] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    targetId: config['sectest.targetId'] ?? '',
    allowedHosts: list('sectest.allowedHosts'),
    asvsLevel: (Number(config['sectest.asvsLevel'] ?? '2') as 1 | 2 | 3),
    requestedCategories: list('sectest.categories'),
    complianceTargets: list('sectest.compliance'),
    authorizationReference: config['sectest.authorizationReference'] ?? '',
    environment: (config['sectest.environment'] as SecurityScope['environment']) ?? 'unknown',
    readOnly: (config['sectest.readOnly'] ?? 'true').toLowerCase() === 'true',
  };
}

export function securityTestingCapability(deps: EngineDependencies, runtime: EngineRuntime): Capability {
  const agents = buildCatalogue();

  const factoryFor = (ctx: StageContext): AgentContextFactory => (agentId: string): AgentContext =>
    runtime.recorder.context({
      tenantId: ctx.tenantId, runId: ctx.runId, correlationId: ctx.correlationId,
      audit: ctx.audit, telemetry: () => { /* R-16.34: identifiers and outcomes only */ },
    } as Omit<AgentContext, 'proposal'>, agentId);

  function gated<T>(
    stageName: StageName, phase: string, ctx: StageContext,
    execute: () => { value: T; subject: unknown; accepted: number },
  ): { value: T; reason: string } {
    const factory = factoryFor(ctx);
    const gov = (input: Parameters<typeof governanceOrchestrator.coordinate>[0]) => governanceOrchestrator.coordinate(input, agents, factory);
    let accepted = 0;
    const outcome = runPhase<{ value: T; subject: unknown; accepted: number }, T>({
      stage: stageName, phase,
      execute: () => { const produced = execute(); accepted = produced.accepted; return produced; },
      review: (x) => gov({ stage: stageName, phase: 'review', subject: x.subject, findings: [], accept: false, accepted }) as readonly ReviewFinding[],
      decide: (x, findings) => {
        const decision = gov({ stage: stageName, phase: 'decision', subject: x.subject, findings, accept: false, accepted }) as { accept: boolean; rejected: readonly { subject: string; reason: string }[] };
        return { accepted: x.value, rejected: decision.rejected };
      },
      certifyPhase: (_d, findings) => {
        const blocking = findings.some((f) => f.severity === 'blocking');
        return gov({ stage: stageName, phase: 'certification', subject: null, findings, accept: !blocking, accepted }) as { certified: boolean; reason: string };
      },
    });
    return { value: outcome.accepted, reason: outcome.certification.reason };
  }

  const stateOf = (ctx: StageContext): EngineState => (ctx.previous?.value as EngineState | undefined) ?? initialState();

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

  const openRequirementIds = (requirements: readonly SecurityRequirement[], assessed: readonly AssessedWeakness[]): readonly string[] =>
    requirements.filter((r) => assessed.some((a) => !a.falsePositive && r.categories.includes(a.weakness.category))).map((r) => r.id);

  return {
    id: CAPABILITY_ID,
    version: '1.0.0',
    name: 'Security Testing Engine',
    requiredAdapters: ['SecurityAdapter'],
    evidenceClasses: ['security-requirements', 'verification-findings', 'evidence-references', 'compliance-mapping', 'posture-scores'],
    certificationCriteria: ['C-12.1', 'C-12.2', 'C-12.12', 'C-11.13', 'C-13.1', 'C-14.1'],
    stages: {
      // 1 — scope and requirement elicitation
      planning: stage('planning', 'scope and requirements', (state, ctx) => {
        const factory = factoryFor(ctx);
        const scopeRes = scopeOrchestrator.coordinate({ scope: buildScope(ctx.configuration) }, agents, factory);
        const requirements = requirementOrchestrator.coordinate({ asvsLevel: scopeRes.scope.asvsLevel }, agents, factory);
        return {
          value: { ...state, scopeRes, requirements },
          subject: { hosts: scopeRes.scope.allowedHosts.length, requirements: requirements.length },
          accepted: requirements.length,
        };
      }),

      // 2 — resource inventory (Execution Plane)
      discovery: stage('discovery', 'resource inventory', (state, ctx) => {
        const inScope = (path: string) => typeof path === 'string';
        const observed = inventoryOrchestrator.coordinate({ observed: deps.observe(state.scopeRes.scope, inScope) }, agents, factoryFor(ctx));
        return { value: { ...state, observed }, subject: { observed: observed.length }, accepted: observed.length };
      }),

      // 3 — fact minimisation (the single crossing)
      context: stage('context', 'fact minimisation', (state, ctx) => {
        const factory = factoryFor(ctx);
        const facts = agents.invoke<{ observed: readonly ObservedResource[] }, readonly SecurityFact[]>('inventory.fact-minimisation', { observed: state.observed }, factory('inventory.fact-minimisation'));
        agents.invoke<{ facts: readonly SecurityFact[] }, { kinds: number; total: number }>('inventory.attribute-summary', { facts }, factory('inventory.attribute-summary'));
        return { value: { ...state, facts }, subject: { facts: facts.length }, accepted: facts.length };
      }),

      // 4 — Security Requirement Model (governance triad)
      'architecture-review': stage('architecture-review', 'security requirement model', (state, ctx) => {
        const model = modelOrchestrator.coordinate({ targetId: state.scopeRes.scope.targetId, facts: state.facts, requirements: state.requirements, asvsLevel: state.scopeRes.scope.asvsLevel }, agents, factoryFor(ctx));
        return {
          value: { ...state, model },
          subject: { categories: model.inScopeCategories.length, requirements: model.requirements.length, exposureScore: model.exposureScore },
          accepted: model.inScopeCategories.length,
        };
      }),

      // 5 — Verification Authorization (governance triad)
      'policy-review': stage('policy-review', 'verification authorization', (state, ctx) => {
        const candidate = authorizationOrchestrator.coordinate({ scope: state.scopeRes.scope, inScopeCategories: state.model.inScopeCategories, requestedCategories: state.scopeRes.requestedCategories, complianceTargets: state.scopeRes.complianceTargets }, agents, factoryFor(ctx));
        return { value: { ...state, candidate }, subject: { candidateCategories: candidate.candidateCategories.length }, accepted: candidate.candidateCategories.length };
      }),

      // 6 — Verification Guardrails (governance triad). No check runs before this certifies.
      'guardrail-review': stage('guardrail-review', 'verification guardrails', (state, ctx) => {
        const result = guardrailOrchestrator.coordinate({ scope: state.scopeRes.scope, candidateCategories: state.candidate.candidateCategories, refusedIntrusive: state.candidate.refusedIntrusive }, agents, factoryFor(ctx));
        return {
          value: { ...state, authorization: result.authorization },
          subject: {
            certified: result.authorization.certified,
            refusals: result.refusals,
            intrusiveRequested: state.scopeRes.intrusiveRequested,
            readOnlyViolated: state.scopeRes.readOnlyViolated,
            missingAuthorization: state.scopeRes.missingAuthorization,
          },
          accepted: result.authorization.authorizedCategories.length,
        };
      }),

      // 7 — verification campaign
      'execution-planning': stage('execution-planning', 'verification campaign', (state, ctx) => {
        const campaign = campaignOrchestrator.coordinate({ authorizedCategories: state.authorization.authorizedCategories }, agents, factoryFor(ctx));
        return { value: { ...state, campaign }, subject: { batches: campaign.batches.length, authorizedCategories: state.authorization.authorizedCategories.length }, accepted: campaign.batches.length };
      }),

      // 8 — read-only verification (Execution Plane)
      execution: stage('execution', 'verification', (state, ctx) => {
        const reachable = deps.environmentReachable;
        let verify: VerifyResult = { raw: [], checked: [], skipped: [] };
        if (reachable) verify = verifyOrchestrator.coordinate({ authorizedCategories: state.authorization.authorizedCategories, resources: state.observed }, agents, factoryFor(ctx));
        const weaknesses = verify.raw.map((r, i) => minimiseWeakness(r, `W-${i + 1}`, []));
        return { value: { ...state, verify, raw: verify.raw, weaknesses }, subject: { environmentReachable: reachable, weaknesses: weaknesses.length, checked: verify.checked }, accepted: weaknesses.length };
      }),

      // 9 — evidence by reference (Execution Plane custody)
      evidence: stage('evidence', 'evidence capture', (state, ctx) => {
        const references = evidenceOrchestrator.coordinate({ raw: state.raw }, agents, factoryFor(ctx));
        const weaknesses = state.weaknesses.map((w, i) => ({ ...w, evidenceRefs: references[i] ? [references[i]!.locator] : [] }));
        return { value: { ...state, evidence: references, weaknesses }, subject: { references: references.length, weaknessesWithEvidence: weaknesses.filter((w) => w.evidenceRefs.length > 0).length }, accepted: references.length };
      }),

      // 10 — assessment, compliance, remediation, posture, learning + Security Intelligence Layer
      reflection: stage('reflection', 'assessment and intelligence', (state, ctx) => {
        const factory = factoryFor(ctx);
        const assessed = assessmentOrchestrator.coordinate({ weaknesses: state.weaknesses }, agents, factory);
        const compliance = complianceOrchestrator.coordinate({ weaknesses: state.weaknesses }, agents, factory);
        const complianceScore = compliance.length ? Math.round(compliance.reduce((s, c) => s + c.score, 0) / compliance.length) : 100;
        const remediations = remediationOrchestrator.coordinate({ assessed }, agents, factory);
        const scores = postureOrchestrator.coordinate({ assessed, complianceScore }, agents, factory);
        const learning = learningOrchestrator.coordinate({ assessed, requirements: state.requirements }, agents, factory);
        // ── Security Intelligence Layer (ADR-0029): correlation, graph, business context, surface, developer, prediction ──
        const risks = riskCorrelationOrchestrator.coordinate({ assessed }, agents, factory);
        const graph = knowledgeGraphOrchestrator.coordinate({ facts: state.facts, assessed, requirements: state.requirements, compliance, model: state.model, risks }, agents, factory);
        const business = businessContextOrchestrator.coordinate({ configuration: ctx.configuration, risks }, agents, factory);
        const attackSurface = attackSurfaceOrchestrator.coordinate({ facts: state.facts, model: state.model }, agents, factory);
        const developer = developerOrchestrator.coordinate({ assessed }, agents, factory);
        const predictive = predictiveOrchestrator.coordinate({ history: deps.priorFindings ?? [], assessed }, agents, factory);
        return {
          value: { ...state, assessed, compliance, complianceScore, remediations, scores, learning, risks, graph, businessContext: business.context, attackSurface, developer, predictive },
          subject: { assessed: assessed.length, correlatedRisks: risks.length, graphNodes: graph.nodeCount, graphEdges: graph.edgeCount, openRequirements: openRequirementIds(state.requirements, assessed).length },
          accepted: assessed.length,
        };
      }),

      // 11 — security certification (+ the enterprise certification engine, ADR-0029)
      certification: stage('certification', 'security certification', (state, ctx) => {
        const factory = factoryFor(ctx);
        const liveW = state.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);
        const certification = certificationIntelOrchestrator.coordinate({ assessed: state.assessed, complianceScore: state.complianceScore, riskTrend: state.scores.trend }, agents, factory);
        const verdicts = [
          { certified: state.authorization.certified, reason: `verification authorized and guardrails passed` },
          { certified: state.weaknesses.every((w) => w.evidenceRefs.length > 0), reason: 'every weakness carries an evidence reference' },
          { certified: liveW.every((a) => a.cvss.baseScore >= 0), reason: `${liveW.length} weakness(es) scored with CVSS` },
          { certified: state.evidence.every((e) => e.sha256.trim() !== ''), reason: 'every evidence reference carries a hash' },
        ];
        return { value: { ...state, certification }, subject: { triadTraversed: true, verdicts, certificationStatus: certification.status, maturityLevel: certification.maturityLevel }, accepted: verdicts.filter((v) => v.certified).length };
      }),

      // 12 — synchronization and executive reporting
      reporting: stage('reporting', 'synchronization and reporting', (state, ctx) => {
        const factory = factoryFor(ctx);
        const reasoningMode = resolveReasoningMode(ctx.configuration);
        const open = openRequirementIds(state.requirements, state.assessed);
        const sync = syncOrchestrator.coordinate({
          adapter: runtime.adapter, targetId: state.scopeRes.scope.targetId, requirements: state.requirements,
          assessed: state.assessed, evidence: state.evidence, openRequirementIds: open,
        }, agents, factory);

        const verified = state.requirements.filter((r) => r.categories.some((c) => state.authorization.authorizedCategories.includes(c))).length;
        const reportInput: ReportInput = {
          targetId: state.scopeRes.scope.targetId, assessed: state.assessed, compliance: state.compliance, scores: state.scores,
          requirementCoverage: { total: state.requirements.length, verified, satisfied: state.requirements.length - open.length },
          reasoningMode, asvsLevel: state.scopeRes.scope.asvsLevel,
        };
        const parts = reportingOrchestrator.coordinate(reportInput, agents, factory) as Record<string, unknown>;
        const readiness = parts['readiness'] as { readiness: 'READY' | 'CONDITIONAL' | 'NOT-READY'; rationale: string };
        const fpDenominator = state.weaknesses.length;
        const fpCount = state.assessed.filter((a) => a.falsePositive).length;

        const report: SecurityReport = {
          targetId: state.scopeRes.scope.targetId, reasoningMode, asvsLevel: state.scopeRes.scope.asvsLevel,
          findingCounts: parts['findingCounts'] as Readonly<Record<Severity, number>>,
          owaspSummary: parts['owaspSummary'] as Readonly<Record<string, number>>,
          cvssAverage: parts['cvssAverage'] as number | null,
          scores: state.scores, compliance: state.compliance,
          requirementCoverage: reportInput.requirementCoverage,
          releaseReadiness: readiness.readiness, rationale: readiness.rationale,
          falsePositiveRate: fpDenominator === 0 ? null : fpCount / fpDenominator,
        };
        agents.invoke<{ report: SecurityReport }, { bytes: number; pages: number }>('reporting.board-report', { report }, factory('reporting.board-report'));

        // ── Security Intelligence Layer (ADR-0029): executive intelligence + the Platform-Intelligence contribution ──
        const certification = state.certification!; // always set by stage 11, which precedes reporting
        const executive = executiveOrchestrator.coordinate({ risks: state.risks, assessed: state.assessed, certification, scores: state.scores }, agents, factory);
        const contribution = contributionOrchestrator.coordinate({ certification, risks: state.risks, scores: state.scores }, agents, factory);
        const intelligenceReport: SecurityIntelligenceReport = {
          graph: state.graph, risks: state.risks, businessContext: state.businessContext!, attackSurface: state.attackSurface,
          certification, executive, developer: state.developer, predictive: state.predictive, contribution,
        };

        return {
          value: { ...state, sync, report, executive, contribution, intelligenceReport },
          subject: { releaseReadiness: report.releaseReadiness, certificationStatus: certification.status, maturityLevel: certification.maturityLevel, topRisks: state.risks.length, claimedReady: report.releaseReadiness === 'READY', published: sync.filter((r) => r.published).length },
          accepted: sync.filter((r) => r.published).length,
        };
      }),
    },
  };
}

/** Wire the master orchestrator with a capability factory bound to these dependencies. */
export function buildSecurityTestingOrchestrator(deps: EngineDependencies, registry: SecurityAdapterRegistry): SecurityTestingOrchestrator {
  return new SecurityTestingOrchestrator((runtime) => securityTestingCapability(deps, runtime), buildCatalogue(), registry);
}

export { domainOrchestrators };
// re-export for convenience so a builder need not import from two files
export { boardReport, renderReportPdf };
