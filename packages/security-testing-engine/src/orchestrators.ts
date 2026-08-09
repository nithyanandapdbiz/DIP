/**
 * The master orchestrator and sixteen domain orchestrators.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 15-configuration-model.md · 16-runtime-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-11.11 (no framework code branches on a capability identity) · C-12.1
 *
 * THE MASTER ORCHESTRATOR RUNS THE ONE LIFECYCLE. IT DOES NOT DEFINE ONE.
 * `SecurityTestingOrchestrator` accepts a request, loads tenant, AI and security configuration,
 * resolves the security adapter, and hands the capability to the framework's twelve-stage runner.
 * It has no stage list and could not have one — the runner is the only thing that can mint a
 * sealed stage result.
 *
 * WHERE `sectest.aiEnabled` BECOMES `ai.enabled`.
 * The framework reads the capability-neutral `ai.enabled`; framework code that read a capability's
 * own key would be branching on a capability identity (C-11.11). The translation happens here, in
 * the capability that owns the surface — one line, in the right place.
 */
import {
  runCapability, certify, resolveReasoningMode, gateProposals, proposalsFrom, invocationRecorder,
  type AgentCatalogue, type AgentContext, type Capability, type CertificationOutcome,
  type InvocationRecorder, type ProposalSource, type ReasoningLedger, type ReasoningMode, type RunOutcome,
} from '@dbiz/capability-framework';
import {
  assembleModel, assembleRequirements, type ScopeResolution,
} from './agents/requirement.js';
import {
  assembleAuthorization, type GuardrailInput, type VerificationCampaign,
} from './agents/authorization.js';
import {
  assembleAssessment, assemblePosture, assembleRemediations, complianceByFinding,
} from './agents/intelligence.js';
import { type ReportInput, type SyncInput } from './agents/reporting.js';
import type {
  AttackSurfaceGraph, BusinessContext, DeveloperGuidance, EnterpriseRisk, ExecutiveIntelligence,
  HistoricalFinding, PredictiveIntelligence, SecurityCertification, SecurityIntelligenceContribution,
  SecurityKnowledgeGraph,
} from './intelligence-layer.js';
import type { SecurityAdapter, SecurityAdapterRegistry } from './adapters.js';
import {
  type AssessedWeakness, type Authorization, type CheckCategory, type ComplianceResult,
  type EvidenceReference, type LearningRecord, type ObservedResource, type PostureScores,
  type RawWeakness, type SecurityFact, type SecurityModel, type SecurityRequirement,
  type SecurityScope, type Severity, type SyncRecord, type Weakness,
} from './model.js';

export const DOMAINS = [
  'scope', 'requirement', 'inventory', 'model', 'authorization', 'guardrail', 'campaign',
  'verify', 'evidence', 'assessment', 'compliance', 'remediation', 'posture', 'learning',
  // Security Intelligence Layer (ADR-0029) — internal structure in stages 10/11/12:
  'knowledgegraph', 'riskcorrelation', 'businesscontext', 'attacksurface', 'developer',
  'predictive', 'certification', 'executive', 'contribution',
  'sync', 'reporting', 'governance',
] as const;
export type Domain = (typeof DOMAINS)[number];

export type AgentContextFactory = (agentId: string) => AgentContext;

export interface DomainOrchestrator<I, O> {
  readonly domain: Domain;
  readonly purpose: string;
  coordinate(input: I, agents: AgentCatalogue, ctx: AgentContextFactory): O;
}

export function defineDomainOrchestrator<I, O>(
  domain: Domain, purpose: string,
  coordinate: (input: I, agents: AgentCatalogue, ctx: AgentContextFactory) => O,
): DomainOrchestrator<I, O> {
  return { domain, purpose, coordinate };
}

// ── scope (stage 1) ─────────────────────────────────────────────────────────

export const scopeOrchestrator = defineDomainOrchestrator<{ scope: SecurityScope }, ScopeResolution>(
  'scope', 'Validate the verification request and resolve the read-only, authorized scope.',
  (input, agents, ctx) => {
    const auth = agents.invoke<{ scope: SecurityScope }, { missingAuthorization: boolean }>('scope.authorization-reference', input, ctx('scope.authorization-reference'));
    agents.invoke<{ scope: SecurityScope }, { hosts: readonly string[] }>('scope.allowed-host-validation', input, ctx('scope.allowed-host-validation'));
    const ro = agents.invoke<{ scope: SecurityScope }, { readOnlyViolated: boolean }>('scope.readonly-enforcement', input, ctx('scope.readonly-enforcement'));
    const cat = agents.invoke<{ scope: SecurityScope }, { requested: readonly string[]; intrusiveRequested: boolean }>('scope.category-request', input, ctx('scope.category-request'));
    const env = agents.invoke<{ scope: SecurityScope }, { environment: string; production: boolean }>('scope.environment-detection', input, ctx('scope.environment-detection'));
    const comp = agents.invoke<{ scope: SecurityScope }, { complianceTargets: readonly string[] }>('scope.compliance-scope', input, ctx('scope.compliance-scope'));
    return {
      scope: input.scope, requestedCategories: cat.requested, intrusiveRequested: cat.intrusiveRequested,
      missingAuthorization: auth.missingAuthorization, readOnlyViolated: ro.readOnlyViolated,
      complianceTargets: comp.complianceTargets, production: env.production,
      summary: `${input.scope.allowedHosts.length} host(s), ASVS L${input.scope.asvsLevel}, read-only=${input.scope.readOnly}`,
    };
  });

// ── requirement (stage 1) ───────────────────────────────────────────────────

export const requirementOrchestrator = defineDomainOrchestrator<{ asvsLevel: 1 | 2 | 3 }, readonly SecurityRequirement[]>(
  'requirement', 'Elicit the security requirements the application must satisfy, from every requirement source.',
  (input, agents, ctx) => {
    const lists = agents.byDomain('requirement').map((a) => agents.invoke<typeof input, readonly SecurityRequirement[]>(a.id, input, ctx(a.id)));
    return assembleRequirements(lists);
  });

// ── inventory (stage 2, EP) ─────────────────────────────────────────────────

export const inventoryOrchestrator = defineDomainOrchestrator<{ observed: readonly ObservedResource[] }, readonly ObservedResource[]>(
  'inventory', 'Enumerate every observed resource in the Execution Plane, by kind.',
  (input, agents, ctx) => {
    const ids = agents.byDomain('inventory').filter((a) => a.stage === 'discovery').map((a) => a.id);
    const byId = new Map<string, ObservedResource>();
    for (const id of ids) for (const r of agents.invoke<typeof input, readonly ObservedResource[]>(id, input, ctx(id))) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  });

// ── model (stage 4) ─────────────────────────────────────────────────────────

export const modelOrchestrator = defineDomainOrchestrator<
  { targetId: string; facts: readonly SecurityFact[]; requirements: readonly SecurityRequirement[]; asvsLevel: 1 | 2 | 3 }, SecurityModel>(
  'model', 'Assemble the Security Requirement Model — the artefact every later stage is judged against.',
  (input, agents, ctx) => {
    const boundaries = agents.invoke<{ facts: readonly SecurityFact[] }, readonly import('./model.js').TrustBoundary[]>('model.trust-boundaries', { facts: input.facts }, ctx('model.trust-boundaries'));
    const assets = agents.invoke<{ facts: readonly SecurityFact[] }, readonly import('./model.js').Asset[]>('model.asset-inventory', { facts: input.facts }, ctx('model.asset-inventory'));
    const exposure = agents.invoke<{ facts: readonly SecurityFact[]; requirements: readonly SecurityRequirement[] }, { score: number; rationale: string }>('model.exposure-score', { facts: input.facts, requirements: input.requirements }, ctx('model.exposure-score'));
    const categories = agents.invoke<{ requirements: readonly SecurityRequirement[]; asvsLevel: 1 | 2 | 3 }, readonly CheckCategory[]>('model.category-scope', { requirements: input.requirements, asvsLevel: input.asvsLevel }, ctx('model.category-scope'));
    return assembleModel(input.targetId, input.facts, input.requirements, boundaries, assets, categories, exposure.score);
  });

// ── authorization (stage 5) ─────────────────────────────────────────────────

export interface AuthorizationCandidate { readonly candidateCategories: readonly CheckCategory[]; readonly refusedIntrusive: readonly string[]; }

export const authorizationOrchestrator = defineDomainOrchestrator<
  { scope: SecurityScope; inScopeCategories: readonly CheckCategory[]; requestedCategories: readonly string[]; complianceTargets: readonly string[] }, AuthorizationCandidate>(
  'authorization', 'Authorize the verification categories to run — never an intrusive one.',
  (input, agents, ctx) => {
    const selected = agents.invoke<typeof input, readonly CheckCategory[]>('authorization.category-selection', input, ctx('authorization.category-selection'));
    const levelled = agents.invoke<{ asvsLevel: 1 | 2 | 3; categories: readonly CheckCategory[] }, readonly CheckCategory[]>('authorization.asvs-level-policy', { asvsLevel: input.scope.asvsLevel, categories: selected }, ctx('authorization.asvs-level-policy'));
    const refused = agents.invoke<{ requestedCategories: readonly string[] }, readonly string[]>('authorization.intrusive-rejection', { requestedCategories: input.requestedCategories }, ctx('authorization.intrusive-rejection'));
    agents.invoke<{ complianceTargets: readonly string[]; categories: readonly CheckCategory[] }, readonly string[]>('authorization.compliance-selection', { complianceTargets: input.complianceTargets, categories: levelled }, ctx('authorization.compliance-selection'));
    return { candidateCategories: levelled, refusedIntrusive: refused };
  });

// ── guardrail (stage 6) ─────────────────────────────────────────────────────

export interface GuardrailResult { readonly authorization: Authorization; readonly refusals: readonly string[]; }

export const guardrailOrchestrator = defineDomainOrchestrator<GuardrailInput, GuardrailResult>(
  'guardrail', 'Enforce the verification guardrails; no check runs before this certifies.',
  (input, agents, ctx) => {
    const guardIds = agents.byDomain('guardrail').map((a) => a.id);
    const guards = guardIds.map((id) => agents.invoke<GuardrailInput, { ok: boolean; reason: string }>(id, input, ctx(id)));
    const authorization = assembleAuthorization(input.scope, input.candidateCategories, guards, input.refusedIntrusive);
    return { authorization, refusals: authorization.refusals };
  });

// ── campaign (stage 7) ──────────────────────────────────────────────────────

export const campaignOrchestrator = defineDomainOrchestrator<{ authorizedCategories: readonly CheckCategory[] }, VerificationCampaign>(
  'campaign', 'Assemble the verification campaign — ordered, batched, scheduled.',
  (input, agents, ctx) => {
    const ordered = agents.invoke<{ authorizedCategories: readonly CheckCategory[] }, readonly CheckCategory[]>('campaign.planner', input, ctx('campaign.planner'));
    const campaign = agents.invoke<{ ordered: readonly CheckCategory[] }, VerificationCampaign>('campaign.batch-optimiser', { ordered }, ctx('campaign.batch-optimiser'));
    agents.invoke<{ campaign: VerificationCampaign }, { scheduled: number }>('campaign.scheduler', { campaign }, ctx('campaign.scheduler'));
    return campaign;
  });

// ── verify (stage 8, EP) ────────────────────────────────────────────────────

export interface VerifyResult { readonly raw: readonly RawWeakness[]; readonly checked: readonly CheckCategory[]; readonly skipped: readonly CheckCategory[]; }

export const verifyOrchestrator = defineDomainOrchestrator<
  { authorizedCategories: readonly CheckCategory[]; resources: readonly ObservedResource[] }, VerifyResult>(
  'verify', 'Run every authorized, read-only checker in the Execution Plane and collect raw weaknesses.',
  (input, agents, ctx) => {
    const raw: RawWeakness[] = [];
    const checked: CheckCategory[] = [];
    const skipped: CheckCategory[] = [];
    for (const category of input.authorizedCategories) {
      const id = `verify.${category}`;
      if (!agents.get(id)) { skipped.push(category); continue; }
      raw.push(...agents.invoke<{ resources: readonly ObservedResource[] }, readonly RawWeakness[]>(id, { resources: input.resources }, ctx(id)));
      checked.push(category);
    }
    return { raw, checked, skipped };
  });

// ── evidence (stage 9, EP) ──────────────────────────────────────────────────

export const evidenceOrchestrator = defineDomainOrchestrator<{ raw: readonly RawWeakness[] }, readonly EvidenceReference[]>(
  'evidence', 'Capture evidence by reference in the Execution Plane; the artefact never crosses.',
  (input, agents, ctx) => {
    const references = agents.invoke<{ raw: readonly RawWeakness[] }, readonly EvidenceReference[]>('evidence.capture', input, ctx('evidence.capture'));
    agents.invoke<{ references: readonly EvidenceReference[] }, { integrity: boolean; count: number }>('evidence.integrity', { references }, ctx('evidence.integrity'));
    agents.invoke<{ references: readonly EvidenceReference[] }, { custody: 'execution-plane' }>('evidence.chain-of-custody', { references }, ctx('evidence.chain-of-custody'));
    return references;
  });

// ── assessment (stage 10) ───────────────────────────────────────────────────

export const assessmentOrchestrator = defineDomainOrchestrator<{ weaknesses: readonly Weakness[] }, readonly AssessedWeakness[]>(
  'assessment', 'Assess every weakness: CVSS, false positives, duplicates, priority, SLA, business impact.',
  (input, agents, ctx) => {
    const cvss = agents.invoke<typeof input, ReadonlyMap<string, import('./model.js').CvssScore>>('assessment.cvss', input, ctx('assessment.cvss'));
    const fp = agents.invoke<typeof input, ReadonlyMap<string, { fp: boolean; reason: string | null }>>('assessment.false-positive', input, ctx('assessment.false-positive'));
    const dup = agents.invoke<typeof input, ReadonlyMap<string, string | null>>('assessment.duplicate-detection', input, ctx('assessment.duplicate-detection'));
    const priority = agents.invoke<{ weaknesses: readonly Weakness[]; cvss: ReadonlyMap<string, import('./model.js').CvssScore> }, ReadonlyMap<string, import('./model.js').Priority>>('assessment.priority', { weaknesses: input.weaknesses, cvss }, ctx('assessment.priority'));
    const business = agents.invoke<typeof input, ReadonlyMap<string, string>>('assessment.business-impact', input, ctx('assessment.business-impact'));
    return assembleAssessment(input.weaknesses, cvss, fp, dup, priority, business, complianceByFinding(input.weaknesses));
  });

// ── compliance (stage 10) ───────────────────────────────────────────────────

export const complianceOrchestrator = defineDomainOrchestrator<{ weaknesses: readonly Weakness[] }, readonly ComplianceResult[]>(
  'compliance', 'Map weaknesses to every compliance framework and report the gaps.',
  (input, agents, ctx) => agents.byDomain('compliance').map((a) => agents.invoke<typeof input, ComplianceResult>(a.id, input, ctx(a.id))));

// ── remediation (stage 10) ──────────────────────────────────────────────────

export const remediationOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedWeakness[] }, readonly import('./model.js').Remediation[]>(
  'remediation', 'Generate developer, config and dependency remediations with priority, effort and owner.',
  (input, agents, ctx) => {
    const guidance = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.developer-guidance', input, ctx('remediation.developer-guidance'));
    const config = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.config-fix', input, ctx('remediation.config-fix'));
    const effort = agents.invoke<typeof input, ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>>('remediation.effort-estimate', input, ctx('remediation.effort-estimate'));
    const owner = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.owner', input, ctx('remediation.owner'));
    const test = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.regression-test', input, ctx('remediation.regression-test'));
    return assembleRemediations(input.assessed, guidance, config, effort, owner, test);
  });

// ── posture (stage 10) ──────────────────────────────────────────────────────

export const postureOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedWeakness[]; complianceScore: number }, PostureScores>(
  'posture', 'Compute the security, OWASP, API, cloud, identity and compliance scores.',
  (input, agents, ctx) => {
    agents.invoke<{ assessed: readonly AssessedWeakness[] }, number>('posture.security-score', { assessed: input.assessed }, ctx('posture.security-score'));
    agents.invoke<{ assessed: readonly AssessedWeakness[] }, number>('posture.identity-score', { assessed: input.assessed }, ctx('posture.identity-score'));
    agents.invoke<{ assessed: readonly AssessedWeakness[] }, number>('posture.cloud-score', { assessed: input.assessed }, ctx('posture.cloud-score'));
    const heat = agents.invoke<{ assessed: readonly AssessedWeakness[] }, Readonly<Record<string, number>>>('posture.risk-heatmap', { assessed: input.assessed }, ctx('posture.risk-heatmap'));
    const summary = agents.invoke<{ assessed: readonly AssessedWeakness[] }, string>('posture.attack-surface-summary', { assessed: input.assessed }, ctx('posture.attack-surface-summary'));
    return assemblePosture(input.assessed, heat, input.complianceScore, summary);
  });

// ── learning (stage 10) ─────────────────────────────────────────────────────

export const learningOrchestrator = defineDomainOrchestrator<
  { assessed: readonly AssessedWeakness[]; requirements: readonly SecurityRequirement[] }, readonly LearningRecord[]>(
  'learning', 'Fold learnable signals — false positives, requirement coverage — into records for the next run.',
  (input, agents, ctx) => agents.byDomain('learning').flatMap((a) => agents.invoke<typeof input, readonly LearningRecord[]>(a.id, input, ctx(a.id))));

// ══ Security Intelligence Layer orchestrators (ADR-0029) ═════════════════════
// All Intelligence Plane; run inside Reflection (10), Certification (11), Reporting (12).

export const knowledgeGraphOrchestrator = defineDomainOrchestrator<
  { facts: readonly SecurityFact[]; assessed: readonly AssessedWeakness[]; requirements: readonly SecurityRequirement[]; compliance: readonly ComplianceResult[]; model: SecurityModel; risks: readonly EnterpriseRisk[] }, SecurityKnowledgeGraph>(
  'knowledgegraph', 'Correlate every security entity into one connected knowledge graph.',
  (input, agents, ctx) => {
    const graph = agents.invoke<typeof input, SecurityKnowledgeGraph>('knowledgegraph.node-extraction', input, ctx('knowledgegraph.node-extraction'));
    agents.invoke<{ graph: SecurityKnowledgeGraph }, unknown>('knowledgegraph.edge-correlation', { graph }, ctx('knowledgegraph.edge-correlation'));
    agents.invoke<{ graph: SecurityKnowledgeGraph }, unknown>('knowledgegraph.centrality', { graph }, ctx('knowledgegraph.centrality'));
    return graph;
  });

export const riskCorrelationOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedWeakness[] }, readonly EnterpriseRisk[]>(
  'riskcorrelation', 'Correlate isolated findings into enterprise risks; reasoning may append emergent ones.',
  (input, agents, ctx) => {
    const risks = agents.invoke<typeof input, readonly EnterpriseRisk[]>('riskcorrelation.correlate', input, ctx('riskcorrelation.correlate'));
    return agents.invoke<{ risks: readonly EnterpriseRisk[] }, readonly EnterpriseRisk[]>('riskcorrelation.emergent', { risks }, ctx('riskcorrelation.emergent'));
  });

export interface BusinessContextResult { readonly context: BusinessContext; readonly businessSeverities: readonly { readonly id: string; readonly technical: Severity; readonly business: Severity }[]; }

export const businessContextOrchestrator = defineDomainOrchestrator<{ configuration: Readonly<Record<string, string>>; risks: readonly EnterpriseRisk[] }, BusinessContextResult>(
  'businesscontext', 'Resolve business context and translate technical severity into business severity.',
  (input, agents, ctx) => {
    const context = agents.invoke<{ configuration: Readonly<Record<string, string>> }, BusinessContext>('businesscontext.parse', { configuration: input.configuration }, ctx('businesscontext.parse'));
    const businessSeverities = agents.invoke<{ risks: readonly EnterpriseRisk[]; context: BusinessContext }, readonly { id: string; technical: Severity; business: Severity }[]>('businesscontext.severity-elevation', { risks: input.risks, context }, ctx('businesscontext.severity-elevation'));
    return { context, businessSeverities };
  });

export const attackSurfaceOrchestrator = defineDomainOrchestrator<{ facts: readonly SecurityFact[]; model: SecurityModel }, AttackSurfaceGraph>(
  'attacksurface', 'Build the structural attack surface intelligence graph (read-only, not exploitation).',
  (input, agents, ctx) => {
    const surface = agents.invoke<typeof input, AttackSurfaceGraph>('attacksurface.assemble', input, ctx('attacksurface.assemble'));
    agents.invoke<{ surface: AttackSurfaceGraph }, unknown>('attacksurface.entry-points', { surface }, ctx('attacksurface.entry-points'));
    agents.invoke<{ surface: AttackSurfaceGraph }, unknown>('attacksurface.secrets-flow', { surface }, ctx('attacksurface.secrets-flow'));
    return surface;
  });

export const developerOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedWeakness[] }, readonly DeveloperGuidance[]>(
  'developer', 'Produce developer intelligence per finding: root cause, guidance, patch, regression, prevention.',
  (input, agents, ctx) => {
    const guidance = agents.invoke<typeof input, readonly DeveloperGuidance[]>('developer.guidance', input, ctx('developer.guidance'));
    return agents.invoke<{ guidance: readonly DeveloperGuidance[] }, readonly DeveloperGuidance[]>('developer.fix-recommendation', { guidance }, ctx('developer.fix-recommendation'));
  });

export const predictiveOrchestrator = defineDomainOrchestrator<{ history: readonly HistoricalFinding[]; assessed: readonly AssessedWeakness[] }, PredictiveIntelligence>(
  'predictive', 'Predict security hotspots, regression probability and trending categories from history.',
  (input, agents, ctx) => {
    const prediction = agents.invoke<typeof input, PredictiveIntelligence>('predictive.forecast', input, ctx('predictive.forecast'));
    agents.invoke<{ prediction: PredictiveIntelligence }, unknown>('predictive.high-risk-modules', { prediction }, ctx('predictive.high-risk-modules'));
    return prediction;
  });

export const certificationIntelOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedWeakness[]; complianceScore: number; riskTrend: 'improving' | 'stable' | 'worsening' }, SecurityCertification>(
  'certification', 'Compute the enterprise security certification: domain scores, maturity, readiness, status.',
  (input, agents, ctx) => {
    const certification = agents.invoke<typeof input, SecurityCertification>('certification.assemble', input, ctx('certification.assemble'));
    agents.invoke<{ certification: SecurityCertification }, unknown>('certification.maturity', { certification }, ctx('certification.maturity'));
    agents.invoke<{ certification: SecurityCertification }, unknown>('certification.status', { certification }, ctx('certification.status'));
    return certification;
  });

export const executiveOrchestrator = defineDomainOrchestrator<{ risks: readonly EnterpriseRisk[]; assessed: readonly AssessedWeakness[]; certification: SecurityCertification; scores: PostureScores }, ExecutiveIntelligence>(
  'executive', 'Assemble executive and board intelligence: top risks, KPIs, security debt, cost of risk, recommendations.',
  (input, agents, ctx) => {
    const executive = agents.invoke<typeof input, ExecutiveIntelligence>('executive.assemble', input, ctx('executive.assemble'));
    agents.invoke<{ executive: ExecutiveIntelligence }, unknown>('executive.recommendations', { executive }, ctx('executive.recommendations'));
    agents.invoke<{ executive: ExecutiveIntelligence; certification: SecurityCertification }, unknown>('executive.summary', { executive, certification: input.certification }, ctx('executive.summary'));
    return executive;
  });

export const contributionOrchestrator = defineDomainOrchestrator<{ certification: SecurityCertification; risks: readonly EnterpriseRisk[]; scores: PostureScores }, SecurityIntelligenceContribution>(
  'contribution', 'Assemble the capability-5 contribution the Platform Intelligence service consumes (the cross-capability seam, ADR-0029).',
  (input, agents, ctx) => agents.invoke<typeof input, SecurityIntelligenceContribution>('contribution.assemble', input, ctx('contribution.assemble')));

// ── sync (stage 12) ─────────────────────────────────────────────────────────

export const syncOrchestrator = defineDomainOrchestrator<SyncInput, readonly SyncRecord[]>(
  'sync', 'Publish container, requirements, findings, defects, evidence and traceability through the adapter.',
  (input, agents, ctx) => agents.byDomain('sync').flatMap((a) => agents.invoke<SyncInput, readonly SyncRecord[]>(a.id, input, ctx(a.id))));

// ── reporting (stage 12) ────────────────────────────────────────────────────

export const reportingOrchestrator = defineDomainOrchestrator<ReportInput, Record<string, unknown>>(
  'reporting', 'Assemble the report parts deterministically.',
  (input, agents, ctx) => {
    const call = <O>(id: string): O => agents.invoke<ReportInput, O>(id, input, ctx(id));
    return {
      findingCounts: call('reporting.severity-counts'),
      owaspSummary: call('reporting.owasp-summary'),
      cvssAverage: call('reporting.cvss-summary'),
      complianceScore: call('reporting.compliance-dashboard'),
      readiness: call('reporting.release-readiness'),
      executiveSummary: call('reporting.executive-summary'),
    };
  });

// ── governance (all stages) ─────────────────────────────────────────────────

type Finding_ = import('@dbiz/capability-framework').ReviewFinding;
export type GovernancePhase = 'review' | 'decision' | 'certification';

export interface GovernanceInput {
  readonly stage: string;
  readonly phase: GovernancePhase;
  readonly subject: unknown;
  readonly findings: readonly Finding_[];
  readonly accept: boolean;
  readonly accepted: number;
}

export const governanceOrchestrator = defineDomainOrchestrator<GovernanceInput, unknown>(
  'governance', 'Review, decide or certify a stage output, as the four-phase pipeline requires.',
  (input, agents, ctx) => {
    const id = `governance.${input.stage}.${input.phase}`;
    if (input.phase === 'review') return agents.invoke<{ subject: unknown }, readonly Finding_[]>(id, { subject: input.subject }, ctx(id));
    if (input.phase === 'decision') {
      return agents.invoke<{ subject: unknown; findings: readonly Finding_[] }, { accept: boolean; rejected: readonly { subject: string; reason: string }[] }>(id, { subject: input.subject, findings: input.findings }, ctx(id));
    }
    return agents.invoke<{ accept: boolean; findings: readonly Finding_[]; accepted: number }, { certified: boolean; reason: string }>(id, { accept: input.accept, findings: input.findings, accepted: input.accepted }, ctx(id));
  });

export const domainOrchestrators: Readonly<Record<Domain, DomainOrchestrator<never, unknown>>> = {
  scope: scopeOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  requirement: requirementOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  inventory: inventoryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  model: modelOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  authorization: authorizationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  guardrail: guardrailOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  campaign: campaignOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  verify: verifyOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  evidence: evidenceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  assessment: assessmentOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  compliance: complianceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  remediation: remediationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  posture: postureOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  learning: learningOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  knowledgegraph: knowledgeGraphOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  riskcorrelation: riskCorrelationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  businesscontext: businessContextOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  attacksurface: attackSurfaceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  developer: developerOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  predictive: predictiveOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  certification: certificationIntelOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  executive: executiveOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  contribution: contributionOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  sync: syncOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reporting: reportingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  governance: governanceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
};

// ── The master orchestrator ─────────────────────────────────────────────────

export interface SecurityTestingRequest {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly scope: SecurityScope;
  readonly configuration: Readonly<Record<string, string>>;
  readonly proposals?: Readonly<Record<string, unknown>>;
}

export interface SecurityTestingResult {
  readonly run: RunOutcome;
  readonly certification: CertificationOutcome;
  readonly reasoningMode: ReasoningMode;
  readonly reasoning: ReasoningLedger;
  readonly adapter: string;
  readonly agentsInvoked: readonly string[];
}

export interface EngineRuntime {
  readonly reasoning: { readonly source: ProposalSource; readonly ledger: () => ReasoningLedger };
  readonly recorder: InvocationRecorder;
  readonly adapter: SecurityAdapter;
}

export class SecurityTestingOrchestrator {
  constructor(
    private readonly capabilityFor: (runtime: EngineRuntime) => Capability,
    readonly agents: AgentCatalogue,
    private readonly adapterRegistry: SecurityAdapterRegistry,
  ) {}

  orchestratorFor(domain: Domain): DomainOrchestrator<never, unknown> | null { return domainOrchestrators[domain] ?? null; }
  resolveAdapter(configuration: Readonly<Record<string, string>>): SecurityAdapter { return this.adapterRegistry.resolve(configuration); }

  execute(request: SecurityTestingRequest): SecurityTestingResult {
    const adapter = this.resolveAdapter(request.configuration);
    const configuration = {
      ...request.configuration,
      'ai.enabled': request.configuration['sectest.aiEnabled'] ?? 'false',
      'adapter.security': adapter.identity.provider,
    };

    const mode = resolveReasoningMode(configuration);
    const reasoning = gateProposals(mode, proposalsFrom(request.proposals ?? {}));
    const recorder = invocationRecorder(reasoning.source);

    const run = runCapability(
      this.capabilityFor({ reasoning, recorder, adapter }),
      { tenantId: request.tenantId, runId: request.runId, correlationId: request.correlationId, configuration },
    );

    return {
      run, certification: certify(run.results), reasoningMode: mode, reasoning: reasoning.ledger(),
      adapter: adapter.identity.provider, agentsInvoked: recorder.invoked(),
    };
  }

  auditTrailFor(): readonly { at: number; stage: string | null; event: string; detail: string }[] { return []; }
}
