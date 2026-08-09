/**
 * The master orchestrator and fifteen domain orchestrators.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 15-configuration-model.md · 16-runtime-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-11.11 (no framework code branches on a capability identity) · C-12.1
 *
 * THE MASTER ORCHESTRATOR RUNS THE ONE LIFECYCLE. IT DOES NOT DEFINE ONE.
 * `PenetrationTestingOrchestrator` accepts a request, loads tenant, AI, security and pentest
 * configuration, resolves the security adapter, and hands the capability to the framework's
 * twelve-stage runner. It has no stage list and could not have one — the runner is the only
 * thing that can mint a sealed stage result.
 *
 * THE DOMAIN ORCHESTRATORS ACTUALLY SEQUENCE THEIR AGENTS.
 * Each `coordinate` invokes its domain's agents in order and returns the domain's result. A
 * domain that never ran an agent would fail the conformance suite.
 *
 * WHERE `pentest.aiEnabled` BECOMES `ai.enabled`.
 * The framework reads the capability-neutral `ai.enabled`; framework code that read a
 * capability's own key would be branching on a capability identity (C-11.11). The translation
 * happens here, in the capability that owns the surface — one line, in the right place.
 */
import {
  runCapability, certify, resolveReasoningMode, gateProposals, proposalsFrom, invocationRecorder,
  VectorMemory,
  type AgentCatalogue, type AgentContext, type Capability, type CertificationOutcome,
  type InvocationRecorder, type ProposalSource, type ReasoningLedger, type ReasoningMode,
  type RunOutcome,
} from '@dbiz/capability-framework';
import type {
  AssessedFinding, AttackChain, CvssScore, Finding, FindingCategory,
  FindingDisposition, LearningRecord, ObservedTarget, PentestScope, Priority, Remediation,
  RepositoryMatch, Severity, SyncRecord, ThreatAssessment, ThreatLandscape,
} from './model.js';
import type { SecurityAdapter, PentestAdapterRegistry } from './adapters.js';
import type { ScopeBoundary } from './agents/scope-and-recon.js';
import type { PriorRecord } from './agents/intelligence.js';
import { assembleThreatLandscape } from './agents/threat-attackchain.js';
import { assembleAssessment } from './agents/assessment-risk.js';
import { assembleRemediations } from './agents/intelligence.js';

export const DOMAINS = [
  'scope', 'recon', 'scanner', 'repository', 'assessment', 'risk', 'threat', 'attackchain',
  'aiintel', 'historical', 'remediation', 'sync', 'reporting', 'learning', 'governance',
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

// ── scope (stage 1, planning) ───────────────────────────────────────────────

export const scopeOrchestrator = defineDomainOrchestrator<{ scope: PentestScope }, ScopeBoundary>(
  'scope', 'Validate the penetration-test request and bind every later probe to a fail-closed boundary.',
  (input, agents, ctx) => {
    const scope = agents.invoke<{ scope: PentestScope }, PentestScope>('scope.authorization-reference', { scope: input.scope }, ctx('scope.authorization-reference'));
    const validated = agents.invoke<{ scope: PentestScope }, PentestScope>('scope.allowed-host-validation', { scope }, ctx('scope.allowed-host-validation'));
    agents.invoke<{ scope: PentestScope }, { enforced: boolean; reason: string }>('scope.https-enforcement', { scope: validated }, ctx('scope.https-enforcement'));
    const boundary = agents.invoke<{ scope: PentestScope }, { inScope: (u: string) => boolean; summary: string }>('scope.boundary-enforcement', { scope: validated }, ctx('scope.boundary-enforcement'));
    const rate = agents.invoke<{ scope: PentestScope }, { requestsPerSecond: number; rationale: string }>('scope.rate-limit', { scope: validated }, ctx('scope.rate-limit'));
    agents.invoke<{ scope: PentestScope }, { environment: string; production: boolean; rationale: string }>('scope.production-detection', { scope: validated }, ctx('scope.production-detection'));
    return {
      scope: validated, inScope: boundary.inScope, summary: boundary.summary,
      requestsPerSecond: rate.requestsPerSecond, phaseCeiling: validated.scanPhaseCeiling,
      authorized: true, authorizationReference: validated.authorizationReference,
    };
  });

// ── recon (stage 2, discovery — EP) ─────────────────────────────────────────

export interface ReconResult { readonly observed: readonly ObservedTarget[]; readonly waf: boolean; }

export const reconOrchestrator = defineDomainOrchestrator<
  { observed: readonly ObservedTarget[]; scope: PentestScope; inScope: (u: string) => boolean }, ReconResult>(
  'recon', 'Run every reconnaissance probe inside the Execution Plane and assemble the observed target surface.',
  (input, agents, ctx) => {
    const reconIds = agents.byDomain('recon').filter((a) => a.stage === 'discovery').map((a) => a.id);
    const byId = new Map<string, ObservedTarget>();
    for (const id of reconIds) {
      const found = agents.invoke<typeof input, readonly ObservedTarget[]>(id, input, ctx(id));
      for (const t of found) byId.set(t.id, t);
    }
    return { observed: [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), waf: [...byId.values()].some((t) => t.kind === 'waf') };
  });

// ── scanner (stage 8, execution — EP) ───────────────────────────────────────

export interface ScannerResult { readonly raw: readonly import('./model.js').RawFinding[]; readonly scanned: readonly FindingCategory[]; readonly skipped: readonly FindingCategory[]; }

export const scannerOrchestrator = defineDomainOrchestrator<
  { authorization: import('./agents/scope-and-recon.js').ScanAuthorization; targets: readonly ObservedTarget[] }, ScannerResult>(
  'scanner', 'Run every authorized scanner inside the Execution Plane, in phase order, and collect evidence-based findings.',
  (input, agents, ctx) => {
    const authorized = input.authorization.authorizedCategories as readonly FindingCategory[];
    const raw: import('./model.js').RawFinding[] = [];
    const scanned: FindingCategory[] = [];
    const skipped: FindingCategory[] = [];
    for (const category of authorized) {
      const id = `scanner.${category}`;
      if (!agents.get(id)) { skipped.push(category); continue; }
      const found = agents.invoke<typeof input, readonly import('./model.js').RawFinding[]>(id, input, ctx(id));
      scanned.push(category);
      raw.push(...found);
    }
    return { raw, scanned, skipped };
  });

// ── repository (stage 10, reflection — search agents are EP) ─────────────────

export interface RepositoryResult {
  readonly matches: readonly RepositoryMatch[];
  readonly dispositions: ReadonlyMap<string, FindingDisposition>;
  readonly counts: { readonly newCount: number; readonly duplicate: number; readonly suppressed: number };
}

export const repositoryOrchestrator = defineDomainOrchestrator<
  { findings: readonly Finding[]; priorRecords: readonly PriorRecord[]; index: import('@dbiz/capability-framework').VectorIndex }, RepositoryResult>(
  'repository', 'Search the customer prior-findings store in the Execution Plane and decide new, duplicate or suppressed.',
  (input, agents, ctx) => {
    const searchIds = agents.byDomain('repository').filter((a) => a.id.startsWith('repository.search.')).map((a) => a.id);
    const matches: RepositoryMatch[] = [];
    for (const id of searchIds) matches.push(...agents.invoke<typeof input, readonly RepositoryMatch[]>(id, input, ctx(id)));
    matches.push(...agents.invoke<typeof input, readonly RepositoryMatch[]>('repository.vector-search', input, ctx('repository.vector-search')));

    const dispositions = agents.invoke<{ findings: readonly Finding[]; matches: readonly RepositoryMatch[] }, ReadonlyMap<string, FindingDisposition>>(
      'repository.disposition', { findings: input.findings, matches }, ctx('repository.disposition'));
    const counts = agents.invoke<{ dispositions: ReadonlyMap<string, FindingDisposition> }, { newCount: number; duplicate: number; suppressed: number }>(
      'repository.new-only-filter', { dispositions }, ctx('repository.new-only-filter'));
    return { matches, dispositions, counts };
  });

// ── assessment (stage 10, reflection) ───────────────────────────────────────

export const assessmentOrchestrator = defineDomainOrchestrator<
  { findings: readonly Finding[]; surface: import('./model.js').AttackSurface }, readonly AssessedFinding[]>(
  'assessment', 'Assess every finding: CVSS, business risk, false positives, duplicates, compliance, priority and SLA.',
  (input, agents, ctx) => {
    const cvss = agents.invoke<typeof input, ReadonlyMap<string, CvssScore>>('assessment.cvss', input, ctx('assessment.cvss'));
    const businessRisk = agents.invoke<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, string>>('assessment.business-risk', { findings: input.findings, cvss }, ctx('assessment.business-risk'));
    const fp = agents.invoke<{ findings: readonly Finding[] }, ReadonlyMap<string, { fp: boolean; reason: string | null }>>('assessment.false-positive', { findings: input.findings }, ctx('assessment.false-positive'));
    const dup = agents.invoke<{ findings: readonly Finding[] }, ReadonlyMap<string, string | null>>('assessment.duplicate-detection', { findings: input.findings }, ctx('assessment.duplicate-detection'));
    const groups = agents.invoke<{ findings: readonly Finding[] }, readonly (readonly string[])[]>('assessment.semantic-correlation', { findings: input.findings }, ctx('assessment.semantic-correlation'));
    agents.invoke<{ groups: readonly (readonly string[])[]; cvss: ReadonlyMap<string, CvssScore> }, unknown>('assessment.compound-risk', { groups, cvss }, ctx('assessment.compound-risk'));
    const compliance = agents.invoke<{ findings: readonly Finding[] }, ReadonlyMap<string, readonly string[]>>('assessment.compliance-mapping', { findings: input.findings }, ctx('assessment.compliance-mapping'));
    const priority = agents.invoke<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, Priority>>('assessment.priority', { findings: input.findings, cvss }, ctx('assessment.priority'));
    const sla = agents.invoke<{ priorities: ReadonlyMap<string, Priority> }, ReadonlyMap<string, number>>('assessment.sla', { priorities: priority }, ctx('assessment.sla'));
    const cia = agents.invoke<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, { c: boolean; i: boolean; a: boolean }>>('assessment.cia-impact', { findings: input.findings, cvss }, ctx('assessment.cia-impact'));
    const criticality = agents.invoke<{ findings: readonly Finding[]; surface: import('./model.js').AttackSurface }, ReadonlyMap<string, 'low' | 'medium' | 'high'>>('assessment.business-criticality', input, ctx('assessment.business-criticality'));
    return assembleAssessment(input.findings, cvss, businessRisk, fp, dup, compliance, priority, sla, cia, criticality);
  });

// ── risk (stage 10, reflection) ─────────────────────────────────────────────

export interface RiskResult { readonly score: number; readonly prioritized: readonly string[]; readonly compound: number; readonly trend: 'improving' | 'stable' | 'worsening'; }

export const riskOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedFinding[] }, RiskResult>(
  'risk', 'Aggregate, prioritise and forecast the risk the assessed findings carry.',
  (input, agents, ctx) => {
    const score = agents.invoke<typeof input, { score: number; rationale: string }>('risk.aggregate-score', input, ctx('risk.aggregate-score'));
    const prioritized = agents.invoke<typeof input, readonly string[]>('risk.prioritization', input, ctx('risk.prioritization'));
    const compound = agents.invoke<typeof input, { compound: number; rationale: string }>('risk.compound-correlation', input, ctx('risk.compound-correlation'));
    const trend = agents.invoke<typeof input, { trend: 'improving' | 'stable' | 'worsening'; rationale: string }>('risk.exposure-trend', input, ctx('risk.exposure-trend'));
    agents.invoke<typeof input, { forecast: string }>('risk.forecast', input, ctx('risk.forecast'));
    return { score: score.score, prioritized, compound: compound.compound, trend: trend.trend };
  });

// ── threat (stage 10, reflection) — the Threat Intelligence Engine ───────────

export interface ThreatResult { readonly threats: ReadonlyMap<string, ThreatAssessment>; readonly landscape: ThreatLandscape; }

export const threatOrchestrator = defineDomainOrchestrator<
  { assessed: readonly AssessedFinding[]; targetId: string; reasoningMode: 'enabled' | 'disabled' }, ThreatResult>(
  'threat', 'Run the Threat Intelligence engine: MITRE, CVE, CWE, CAPEC, exploit maturity, actors, heat map and the executive threat score.',
  (input, agents, ctx) => {
    const base = { assessed: input.assessed };
    // Every mapping agent runs, so the census records the full Threat Intelligence engine.
    agents.invoke<typeof base, unknown>('threat.mitre-mapping', base, ctx('threat.mitre-mapping'));
    agents.invoke<typeof base, unknown>('threat.cve-intelligence', base, ctx('threat.cve-intelligence'));
    agents.invoke<typeof base, unknown>('threat.cwe-intelligence', base, ctx('threat.cwe-intelligence'));
    agents.invoke<typeof base, unknown>('threat.capec-correlation', base, ctx('threat.capec-correlation'));
    agents.invoke<typeof base, unknown>('threat.exploit-maturity', base, ctx('threat.exploit-maturity'));
    agents.invoke<typeof base, unknown>('threat.threat-actor-mapping', base, ctx('threat.threat-actor-mapping'));
    agents.invoke<typeof base, unknown>('threat.cloud-threat-context', base, ctx('threat.cloud-threat-context'));
    agents.invoke<typeof base, unknown>('threat.zero-day-awareness', base, ctx('threat.zero-day-awareness'));
    agents.invoke<typeof base, unknown>('threat.exposure-trend', base, ctx('threat.exposure-trend'));
    agents.invoke<typeof base, unknown>('threat.business-risk-forecast', base, ctx('threat.business-risk-forecast'));
    agents.invoke<typeof base, unknown>('threat.historical-comparison', base, ctx('threat.historical-comparison'));

    const threats = agents.invoke<typeof base, ReadonlyMap<string, ThreatAssessment>>('threat.assessment', base, ctx('threat.assessment'));
    const heatMap = agents.invoke<typeof base, Readonly<Record<string, number>>>('threat.heat-map', base, ctx('threat.heat-map'));
    const executive = agents.invoke<{ assessed: readonly AssessedFinding[]; threats: ReadonlyMap<string, ThreatAssessment> }, { score: number; rationale: string }>('threat.executive-score', { assessed: input.assessed, threats }, ctx('threat.executive-score'));
    const forecast = agents.invoke<typeof base, { forecast: string }>('threat.business-risk-forecast', base, ctx('threat.business-risk-forecast'));
    const landscape = assembleThreatLandscape(input.targetId, heatMap, executive.score, forecast.forecast, input.reasoningMode);
    return { threats, landscape };
  });

// ── attackchain (stage 10, reflection) ──────────────────────────────────────

export const attackChainOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedFinding[] }, AttackChain>(
  'attackchain', 'Construct the attack graph, kill chain, MITRE matrix and exploit paths from confirmed findings.',
  (input, agents, ctx) => {
    const nodes = agents.invoke<typeof input, readonly import('./model.js').AttackNode[]>('attackchain.graph', input, ctx('attackchain.graph'));
    const edges = agents.invoke<{ nodes: readonly import('./model.js').AttackNode[] }, readonly import('./model.js').AttackEdge[]>('attackchain.exploit-path', { nodes }, ctx('attackchain.exploit-path'));
    const killChain = agents.invoke<{ nodes: readonly import('./model.js').AttackNode[] }, readonly import('./model.js').KillChainPhase[]>('attackchain.kill-chain', { nodes }, ctx('attackchain.kill-chain'));
    agents.invoke<{ nodes: readonly import('./model.js').AttackNode[] }, unknown>('attackchain.mitre-matrix', { nodes }, ctx('attackchain.mitre-matrix'));
    agents.invoke<{ nodes: readonly import('./model.js').AttackNode[]; edges: readonly import('./model.js').AttackEdge[] }, unknown>('attackchain.progression', { nodes, edges }, ctx('attackchain.progression'));
    const impact = agents.invoke<{ assessed: readonly AssessedFinding[]; nodes: readonly import('./model.js').AttackNode[] }, { impact: string; severity: Severity }>('attackchain.business-impact', { assessed: input.assessed, nodes }, ctx('attackchain.business-impact'));
    const multi = agents.invoke<{ nodes: readonly import('./model.js').AttackNode[]; edges: readonly import('./model.js').AttackEdge[] }, { multiStage: boolean; stages: number }>('attackchain.multi-stage-correlation', { nodes, edges }, ctx('attackchain.multi-stage-correlation'));
    return { id: 'chain-1', nodes, edges, killChain, businessImpact: impact.impact, severity: impact.severity, multiStage: multi.multiStage };
  });

// ── aiintel (stage 10, reflection) ──────────────────────────────────────────

export const aiIntelOrchestrator = defineDomainOrchestrator<
  { assessed: readonly AssessedFinding[]; threats: ReadonlyMap<string, ThreatAssessment>; chain: AttackChain | null }, readonly string[]>(
  'aiintel', 'Enrich every intelligence stage with reasoning where available, and degrade deterministically where not.',
  (input, agents, ctx) => {
    const ids = agents.byDomain('aiintel').map((a) => a.id);
    for (const id of ids) agents.invoke<typeof input, unknown>(id, input, ctx(id));
    return ids;
  });

// ── historical (stage 10, reflection) ───────────────────────────────────────

export interface HistoricalResult { readonly trend: 'improving' | 'stable' | 'worsening'; readonly recurring: number; readonly novel: number; }

export const historicalOrchestrator = defineDomainOrchestrator<
  { findings: readonly Finding[]; memory: VectorMemory }, HistoricalResult>(
  'historical', 'Correlate this run against remembered findings to separate recurring from novel and report a trend.',
  (input, agents, ctx) => {
    agents.invoke<typeof input, unknown>('historical.similarity', input, ctx('historical.similarity'));
    const correlation = agents.invoke<typeof input, { recurring: number; novel: number }>('historical.correlation', input, ctx('historical.correlation'));
    agents.invoke<typeof input, unknown>('historical.vector-search', input, ctx('historical.vector-search'));
    agents.invoke<{ findings: readonly Finding[] }, unknown>('historical.knowledge-graph', { findings: input.findings }, ctx('historical.knowledge-graph'));
    const trend = agents.invoke<{ recurring: number; novel: number }, { trend: 'improving' | 'stable' | 'worsening'; rationale: string }>('historical.trend-comparison', correlation, ctx('historical.trend-comparison'));
    return { trend: trend.trend, recurring: correlation.recurring, novel: correlation.novel };
  });

// ── remediation (stage 10, reflection) ──────────────────────────────────────

export const remediationOrchestrator = defineDomainOrchestrator<{ assessed: readonly AssessedFinding[] }, readonly Remediation[]>(
  'remediation', 'Generate quick, long-term, code, configuration and infrastructure fixes with priority, effort and owner.',
  (input, agents, ctx) => {
    const quick = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.quick-fix', input, ctx('remediation.quick-fix'));
    const longTerm = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.long-term-fix', input, ctx('remediation.long-term-fix'));
    const code = agents.invoke<typeof input, ReadonlyMap<string, string | null>>('remediation.code-example', input, ctx('remediation.code-example'));
    const config = agents.invoke<typeof input, ReadonlyMap<string, string | null>>('remediation.configuration-fix', input, ctx('remediation.configuration-fix'));
    const infra = agents.invoke<typeof input, ReadonlyMap<string, string | null>>('remediation.infrastructure-fix', input, ctx('remediation.infrastructure-fix'));
    const priority = agents.invoke<typeof input, ReadonlyMap<string, Priority>>('remediation.business-priority', input, ctx('remediation.business-priority'));
    const effort = agents.invoke<typeof input, ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>>('remediation.effort-estimate', input, ctx('remediation.effort-estimate'));
    const owner = agents.invoke<typeof input, ReadonlyMap<string, string>>('remediation.owner', input, ctx('remediation.owner'));
    const reduction = agents.invoke<typeof input, ReadonlyMap<string, number>>('remediation.risk-reduction', input, ctx('remediation.risk-reduction'));
    return assembleRemediations(input.assessed, quick, longTerm, code, config, infra, priority, effort, owner, reduction);
  });

// ── learning (stage 10, reflection) ─────────────────────────────────────────

export const learningOrchestrator = defineDomainOrchestrator<Record<string, unknown>, readonly LearningRecord[]>(
  'learning', 'Fold every learnable signal from this run into records the next run can use.',
  (input, agents, ctx) => agents.byDomain('learning').flatMap((a) => agents.invoke<typeof input, readonly LearningRecord[]>(a.id, input, ctx(a.id))));

// ── sync (stage 12, reporting) ──────────────────────────────────────────────

export const syncOrchestrator = defineDomainOrchestrator<Record<string, unknown>, readonly SyncRecord[]>(
  'sync', 'Publish the container, findings, defects, threats, evidence references and traceability through the adapter.',
  (input, agents, ctx) => {
    const container = agents.invoke<Record<string, unknown>, { containerId: string; records: readonly SyncRecord[] }>('sync.container', input, ctx('sync.container'));
    return [
      ...container.records,
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.findings', input, ctx('sync.findings')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.defects', input, ctx('sync.defects')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.threats', input, ctx('sync.threats')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.evidence', input, ctx('sync.evidence')),
      ...agents.invoke<typeof input, readonly SyncRecord[]>('sync.traceability', input, ctx('sync.traceability')),
    ];
  });

// ── reporting (stage 12, reporting) ─────────────────────────────────────────

export const reportingOrchestrator = defineDomainOrchestrator<Record<string, unknown>, Record<string, unknown>>(
  'reporting', 'Assemble the report parts, then render the executive and board artefacts from the assembled report.',
  (input, agents, ctx) => {
    const call = <O>(id: string): O => agents.invoke<typeof input, O>(id, input, ctx(id));
    return {
      findingCounts: call('reporting.severity-counts'),
      owaspSummary: call('reporting.owasp-summary'),
      cvssAverage: call('reporting.cvss-summary'),
      riskHeatMap: call('reporting.risk-heatmap'),
      threatHeatMap: call('reporting.threat-heatmap'),
      mitreMatrix: call('reporting.mitre-matrix'),
      complianceSummary: call('reporting.compliance-dashboard'),
      attackChain: call('reporting.attack-chain-report'),
      threatIntel: call('reporting.threat-intel-report'),
      securityScore: call('reporting.security-score'),
      readiness: call('reporting.release-readiness'),
      historicalTrend: call('reporting.historical-trend'),
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
  recon: reconOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  scanner: scannerOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  repository: repositoryOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  assessment: assessmentOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  risk: riskOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  threat: threatOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  attackchain: attackChainOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  aiintel: aiIntelOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  historical: historicalOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  remediation: remediationOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  sync: syncOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  reporting: reportingOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  learning: learningOrchestrator as unknown as DomainOrchestrator<never, unknown>,
  governance: governanceOrchestrator as unknown as DomainOrchestrator<never, unknown>,
};

// ── The master orchestrator ─────────────────────────────────────────────────

export interface PentestRequest {
  readonly tenantId: string;
  readonly runId: string;
  readonly correlationId: string;
  readonly scope: PentestScope;
  /** Tenant configuration, including `pentest.aiEnabled`, `pentest.safeMode` and provider selection. */
  readonly configuration: Readonly<Record<string, string>>;
  readonly proposals?: Readonly<Record<string, unknown>>;
}

export interface PentestOrchestrationResult {
  readonly run: RunOutcome;
  readonly certification: CertificationOutcome;
  readonly reasoningMode: ReasoningMode;
  readonly reasoning: ReasoningLedger;
  readonly adapter: string;
  readonly agentsInvoked: readonly string[];
  readonly resumed: boolean;
  readonly rolledBack: boolean;
}

/** The engine's runtime seam. Everything the Execution Plane observes arrives here. */
export interface EngineRuntime {
  readonly reasoning: { readonly source: ProposalSource; readonly ledger: () => ReasoningLedger };
  readonly recorder: InvocationRecorder;
  readonly adapter: SecurityAdapter;
  readonly memory: VectorMemory;
}

export class PenetrationTestingOrchestrator {
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
    private readonly adapterRegistry: PentestAdapterRegistry,
  ) {}

  orchestratorFor(domain: Domain): DomainOrchestrator<never, unknown> | null { return domainOrchestrators[domain] ?? null; }
  resolveAdapter(configuration: Readonly<Record<string, string>>): SecurityAdapter { return this.adapterRegistry.resolve(configuration); }

  execute(request: PentestRequest): PentestOrchestrationResult {
    const adapter = this.resolveAdapter(request.configuration);
    const configuration = {
      ...request.configuration,
      'ai.enabled': request.configuration['pentest.aiEnabled'] ?? 'false',
      'adapter.security': adapter.identity.provider,
    };

    const mode = resolveReasoningMode(configuration);
    const reasoning = gateProposals(mode, proposalsFrom(request.proposals ?? {}));
    const recorder = invocationRecorder(reasoning.source);

    const prior = this.state.get(request.runId);
    const resumed = prior !== undefined && prior.failedAt !== null;

    const run = runCapability(
      this.capabilityFor({ reasoning, recorder, adapter, memory: this.memoryFor(request.tenantId) }),
      { tenantId: request.tenantId, runId: request.runId, correlationId: request.correlationId, configuration },
      resumed ? prior.results : undefined,
    );

    this.state.set(request.runId, run);
    const rolledBack = run.failedAt !== null;
    if (rolledBack) this.state.set(request.runId, { ...run, results: new Map() });

    return {
      run, certification: certify(run.results), reasoningMode: mode, reasoning: reasoning.ledger(),
      adapter: adapter.identity.provider, agentsInvoked: recorder.invoked(), resumed, rolledBack,
    };
  }

  retry(request: PentestRequest): PentestOrchestrationResult { return this.execute(request); }
  auditTrailFor(runId: string): readonly { at: number; stage: string | null; event: string; detail: string }[] { return this.state.get(runId)?.audit ?? []; }
}
