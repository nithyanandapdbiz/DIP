/**
 * The Penetration Testing Engine, implemented across the twelve-stage lifecycle.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 (capability 6) · 12-capability-orchestration.md
 *   ADR          : ADR-0027
 *   Criteria     : C-12.1 · C-12.2 · C-12.12 · C-11.13 · C-13.1 · C-14.1
 *
 * THE MISSION'S FORTY-PLUS LINEAR STEPS ONTO TWELVE FROZEN STAGES.
 * The mission names a Scope Review, a Scanner Review, an Assessment Review, a Threat Review and
 * so on — each phase followed by a review and a certification. R-12.18 permits exactly one
 * orchestration lifecycle, so those are internal structure of these twelve, not a lifecycle of
 * their own. The mapping (ADR-0027 §4):
 *
 *    1 planning            Penetration Test Request, Scope Validation / Review / Certification
 *    2 discovery      EP   Target Discovery and Reconnaissance
 *    3 context     EP->IP  Surface intelligence — the minimisation crossing
 *    4 arch-review         Attack Surface Model / Review / Certification    (governance triad)
 *    5 policy-review       Scan Authorization / Review / Certification       (governance triad)
 *    6 guardrail-review    Scan Guardrails / Review / Certification          (governance triad)
 *    7 exec-planning       Scan Campaign assembly
 *    8 execution      EP   Passive, Active-Safe and Active-Full scanning
 *    9 evidence       EP   HAR, request/response evidence, hashed, EP custody
 *   10 reflection          Assessment, Risk, Threat Intelligence, Attack Chain, Repository,
 *                          AI Enrichment, Historical, Remediation, Learning
 *   11 certification       Release / Security Certification
 *   12 reporting           Synchronization and Executive Reporting
 *
 * THE GOVERNANCE-TRIAD FINDING, STATED RATHER THAN HIDDEN.
 * The linear workflow names no Architecture Review, Policy Review or Guardrail Review. Those
 * three stages are mandatory (R-12.2) and are implemented here as the attack-surface model, the
 * scan authorization and the scan guardrails. An engine that followed the linear list literally
 * would ship a capability the registry refuses — ADR-0027 §3. NO PACKET IS TRANSMITTED BEFORE
 * THE GUARDRAIL STAGE CERTIFIES.
 */
import {
  VectorIndex, runPhase, observedAgents, resolveReasoningMode,
  type AgentContext, type Capability, type ReviewFinding, type StageContext,
  type StageEmitter, type StageName, type StageResult,
} from '@dbiz/capability-framework';
import { buildCatalogue } from './catalogue.js';
import {
  minimiseAll, assembleSurface, type ScopeBoundary, type ScanAuthorization,
} from './agents/scope-and-recon.js';
import type { ScanInput } from './agents/scanning.js';
import type { ScanPlan } from './agents/planning-scanner.js';
import type { PriorRecord } from './agents/intelligence.js';
import {
  PenetrationTestingOrchestrator, domainOrchestrators, governanceOrchestrator,
  scopeOrchestrator, reconOrchestrator, scannerOrchestrator, repositoryOrchestrator,
  assessmentOrchestrator, riskOrchestrator, threatOrchestrator, attackChainOrchestrator,
  aiIntelOrchestrator, historicalOrchestrator, remediationOrchestrator, syncOrchestrator,
  reportingOrchestrator, learningOrchestrator,
  type AgentContextFactory, type EngineRuntime, type ReconResult, type RiskResult,
  type ThreatResult, type HistoricalResult, type RepositoryResult, type ScannerResult,
} from './orchestrators.js';
import {
  CATEGORY_DESTRUCTIVE, minimiseFinding,
  type AssessedFinding, type AttackChain, type AttackSurface, type EvidenceReference,
  type Endpoint, type Finding, type FindingCategory, type LearningRecord, type ObservedTarget,
  type PentestReport, type PentestScope, type RawFinding, type Remediation, type ScanPhase,
  type Severity, type SurfaceFact, type SyncRecord,
} from './model.js';
import { renderReportPdf, boardReport } from './agents/report.js';
import type { PentestAdapterRegistry } from './adapters.js';

export const CAPABILITY_ID = 'penetration-testing';

/** Everything the Execution Plane observes, and everything the engine cannot invent. */
export interface EngineDependencies {
  /** The Execution Plane reconnaissance and probe observations. Bound by the scope predicate. */
  readonly observe: (scope: PentestScope, inScope: (url: string) => boolean) => readonly ObservedTarget[];
  /** The customer's prior-findings store, searched in the Execution Plane. */
  readonly priorRecords: readonly PriorRecord[];
  /** Whether the target responded. `false` refuses the execution stage. */
  readonly environmentReachable: boolean;
  /** Extra artefacts the Execution Plane captured, by reference. */
  readonly capturedEvidence: (raw: readonly RawFinding[]) => readonly { readonly findingCategory: FindingCategory; readonly kind: EvidenceReference['kind']; readonly locator: string; readonly digest: string; readonly phase: ScanPhase }[];
}

interface EngineState {
  readonly scope: ScopeBoundary;
  readonly recon: ReconResult;
  readonly facts: readonly SurfaceFact[];
  readonly endpoints: readonly Endpoint[];
  readonly surface: AttackSurface;
  readonly plan: ScanPlan;
  readonly authorization: ScanAuthorization;
  readonly campaign: { readonly batches: readonly (readonly FindingCategory[])[]; readonly parallelism: number };
  readonly raw: readonly RawFinding[];
  readonly findings: readonly Finding[];
  readonly scanner: ScannerResult;
  readonly evidence: readonly EvidenceReference[];
  readonly assessed: readonly AssessedFinding[];
  readonly risk: RiskResult;
  readonly threat: ThreatResult;
  readonly chain: AttackChain;
  readonly repository: RepositoryResult;
  readonly historical: HistoricalResult;
  readonly remediations: readonly Remediation[];
  readonly learning: readonly LearningRecord[];
  readonly sync: readonly SyncRecord[];
  readonly report: PentestReport | null;
}

const EMPTY_SURFACE: AttackSurface = {
  targetId: '', hosts: [], services: [], openPorts: [], endpoints: [], entryPoints: [],
  trustBoundaries: [], assets: [], technologies: [], wafPresent: false, businessJourneys: [], exposureScore: 0,
};
const EMPTY_CHAIN: AttackChain = { id: 'chain-0', nodes: [], edges: [], killChain: [], businessImpact: '', severity: 'info', multiStage: false };

function initialState(): EngineState {
  return {
    scope: { scope: { targetId: '', allowedHosts: [], exclusions: [], authorizationReference: '', scanPhaseCeiling: 'passive', safeMode: true, rateLimitPerSecond: 1, httpsRequired: true, environment: 'unknown' }, inScope: () => false, summary: '', requestsPerSecond: 1, phaseCeiling: 'passive', authorized: false, authorizationReference: '' },
    recon: { observed: [], waf: false },
    facts: [], endpoints: [], surface: EMPTY_SURFACE,
    plan: { phaseCeiling: 'passive', activePhases: [], selectedCategories: [], destructiveCategories: [], rationale: '' },
    authorization: { targetId: '', phaseCeiling: 'passive', safeMode: true, authorizedCategories: [], requestsPerSecond: 1, inScope: () => false, certified: false, refusals: [] },
    campaign: { batches: [], parallelism: 1 },
    raw: [], findings: [], scanner: { raw: [], scanned: [], skipped: [] }, evidence: [],
    assessed: [], risk: { score: 0, prioritized: [], compound: 0, trend: 'stable' },
    threat: { threats: new Map(), landscape: { targetId: '', heatMap: {}, topTactics: [], executiveThreatScore: 0, forecast: '', reasoningMode: 'disabled' } },
    chain: EMPTY_CHAIN,
    repository: { matches: [], dispositions: new Map(), counts: { newCount: 0, duplicate: 0, suppressed: 0 } },
    historical: { trend: 'stable', recurring: 0, novel: 0 },
    remediations: [], learning: [], sync: [], report: null,
  };
}

function buildScope(config: Readonly<Record<string, string>>): PentestScope {
  return {
    targetId: config['pentest.targetId'] ?? '',
    allowedHosts: (config['pentest.allowedHosts'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    exclusions: (config['pentest.exclusions'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    authorizationReference: config['pentest.authorizationReference'] ?? '',
    scanPhaseCeiling: (config['pentest.scanPhase'] as ScanPhase) ?? 'passive',
    safeMode: (config['pentest.safeMode'] ?? 'true').toLowerCase() === 'true',
    rateLimitPerSecond: Number(config['pentest.rateLimit'] ?? '8'),
    httpsRequired: (config['pentest.httpsRequired'] ?? 'true').toLowerCase() === 'true',
    environment: (config['pentest.environment'] as PentestScope['environment']) ?? 'unknown',
  };
}

export function penetrationTestingCapability(deps: EngineDependencies, runtime: EngineRuntime): Capability {
  const agents = buildCatalogue();

  const factoryFor = (ctx: StageContext): AgentContextFactory => (agentId: string): AgentContext =>
    runtime.recorder.context({
      tenantId: ctx.tenantId, runId: ctx.runId, correlationId: ctx.correlationId,
      audit: ctx.audit, telemetry: () => { /* R-16.34: identifiers and outcomes only */ },
    } as Omit<AgentContext, 'proposal'>, agentId);

  function gated<T>(
    stage: StageName, phase: string, ctx: StageContext,
    execute: () => { value: T; subject: unknown; accepted: number },
  ): { value: T; reason: string } {
    const factory = factoryFor(ctx);
    const gov = (input: Parameters<typeof governanceOrchestrator.coordinate>[0]) => governanceOrchestrator.coordinate(input, agents, factory);
    let accepted = 0;
    const outcome = runPhase<{ value: T; subject: unknown; accepted: number }, T>({
      stage, phase,
      execute: () => { const produced = execute(); accepted = produced.accepted; return produced; },
      review: (x) => gov({ stage, phase: 'review', subject: x.subject, findings: [], accept: false, accepted }) as readonly ReviewFinding[],
      decide: (x, findings) => {
        const decision = gov({ stage, phase: 'decision', subject: x.subject, findings, accept: false, accepted }) as { accept: boolean; rejected: readonly { subject: string; reason: string }[] };
        return { accepted: x.value, rejected: decision.rejected };
      },
      certifyPhase: (_d, findings) => {
        const blocking = findings.some((f) => f.severity === 'blocking');
        return gov({ stage, phase: 'certification', subject: null, findings, accept: !blocking, accepted }) as { certified: boolean; reason: string };
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

  const INJECTION: readonly FindingCategory[] = ['sql-injection', 'blind-sql-injection', 'nosql-injection', 'command-injection', 'ldap-injection', 'ssti', 'xxe'];

  return {
    id: CAPABILITY_ID,
    version: '1.0.0',
    name: 'Penetration Testing Engine',
    requiredAdapters: ['SecurityAdapter'],
    evidenceClasses: ['reconnaissance', 'scan-findings', 'evidence-references', 'threat-intelligence', 'attack-chains'],
    certificationCriteria: ['C-12.1', 'C-12.2', 'C-12.12', 'C-11.13', 'C-13.1', 'C-14.1'],
    stages: {
      // 1 — Penetration Test Request, Scope Validation
      planning: stage('planning', 'scope validation', (state, ctx) => {
        const scope = scopeOrchestrator.coordinate({ scope: buildScope(ctx.configuration) }, agents, factoryFor(ctx));
        return {
          value: { ...state, scope },
          subject: { allowedHosts: scope.scope.allowedHosts, authorizationReference: scope.authorizationReference, requestsPerSecond: scope.requestsPerSecond, exclusions: scope.scope.exclusions },
          accepted: scope.scope.allowedHosts.length,
        };
      }),

      // 2 — Target Discovery and Reconnaissance (Execution Plane)
      discovery: stage('discovery', 'reconnaissance', (state, ctx) => {
        const observed = deps.observe(state.scope.scope, state.scope.inScope);
        const recon = reconOrchestrator.coordinate({ observed, scope: state.scope.scope, inScope: state.scope.inScope }, agents, factoryFor(ctx));
        return {
          value: { ...state, recon },
          subject: { observed: recon.observed, waf: recon.waf, httpsRequired: state.scope.scope.httpsRequired, httpsEnforced: !recon.observed.some((t) => /^http:\/\//i.test(t.path)) },
          accepted: recon.observed.length,
        };
      }),

      // 3 — Surface intelligence: the minimisation crossing
      context: stage('context', 'surface intelligence', (state, ctx) => {
        const facts = minimiseAll(state.recon.observed);
        const factory = factoryFor(ctx);
        const endpoints = agents.invoke<{ facts: readonly SurfaceFact[] }, readonly Endpoint[]>('recon.endpoint-inventory', { facts }, factory('recon.endpoint-inventory'));
        agents.invoke<{ facts: readonly SurfaceFact[] }, readonly string[]>('recon.parameter-inventory', { facts }, factory('recon.parameter-inventory'));
        agents.invoke<{ facts: readonly SurfaceFact[] }, readonly string[]>('recon.technology-fingerprint', { facts }, factory('recon.technology-fingerprint'));
        agents.invoke<{ facts: readonly SurfaceFact[] }, readonly string[]>('recon.hosts-and-services', { facts }, factory('recon.hosts-and-services'));
        return {
          value: { ...state, facts, endpoints },
          subject: { facts, endpoints },
          accepted: facts.length,
        };
      }),

      // 4 — Attack Surface Model (governance triad)
      'architecture-review': stage('architecture-review', 'attack surface model', (state, ctx) => {
        const factory = factoryFor(ctx);
        const input = { targetId: state.scope.scope.targetId, facts: state.facts, endpoints: state.endpoints, technologies: agents.invoke<{ facts: readonly SurfaceFact[] }, readonly string[]>('recon.technology-fingerprint', { facts: state.facts }, factory('recon.technology-fingerprint')), inventory: agents.invoke<{ facts: readonly SurfaceFact[] }, readonly string[]>('recon.hosts-and-services', { facts: state.facts }, factory('recon.hosts-and-services')) };
        const entryPoints = agents.invoke<typeof input, readonly string[]>('recon.entry-points', input, factory('recon.entry-points'));
        const boundaries = agents.invoke<typeof input, readonly import('./model.js').TrustBoundary[]>('recon.trust-boundaries', input, factory('recon.trust-boundaries'));
        const assets = agents.invoke<typeof input, readonly import('./model.js').Asset[]>('recon.asset-inventory', input, factory('recon.asset-inventory'));
        const exposure = agents.invoke<typeof input, { score: number; rationale: string }>('recon.exposure-score', input, factory('recon.exposure-score'));
        const journeys = agents.invoke<typeof input, readonly string[]>('recon.business-journey-map', input, factory('recon.business-journey-map'));
        const surface = assembleSurface(input.targetId, state.facts, state.endpoints, input.technologies, entryPoints, boundaries, assets, journeys, exposure.score);
        return {
          value: { ...state, surface },
          subject: { endpoints: surface.endpoints, entryPoints: surface.entryPoints, trustBoundaries: surface.trustBoundaries, assets: surface.assets, exposureScore: surface.exposureScore },
          accepted: surface.endpoints.length,
        };
      }),

      // 5 — Scan Authorization (governance triad)
      'policy-review': stage('policy-review', 'scan authorization', (state, ctx) => {
        const factory = factoryFor(ctx);
        const authInput = { scope: state.scope.scope, endpoints: state.surface.endpoints, exposureScore: state.surface.exposureScore };
        agents.invoke<typeof authInput, readonly ScanPhase[]>('scanner.phase-policy', authInput, factory('scanner.phase-policy'));
        const selected = agents.invoke<typeof authInput, readonly FindingCategory[]>('scanner.category-selection', authInput, factory('scanner.category-selection'));
        const afterInjection = agents.invoke<{ scope: PentestScope; selected: readonly FindingCategory[]; endpoints: readonly Endpoint[] }, readonly FindingCategory[]>('scanner.injection-authorization', { scope: state.scope.scope, selected, endpoints: state.surface.endpoints }, factory('scanner.injection-authorization'));
        const plan = agents.invoke<{ scope: PentestScope; selected: readonly FindingCategory[] }, ScanPlan>('scanner.safe-mode-preselect', { scope: state.scope.scope, selected: afterInjection }, factory('scanner.safe-mode-preselect'));
        const hasParams = state.surface.endpoints.some((e) => e.parameterNames.length > 0);
        return {
          value: { ...state, plan },
          subject: { selectedCategories: plan.selectedCategories, phaseCeiling: plan.phaseCeiling, injectionWithoutParameters: plan.selectedCategories.some((c) => INJECTION.includes(c)) && !hasParams },
          accepted: plan.selectedCategories.length,
        };
      }),

      // 6 — Scan Guardrails (governance triad). No packet is transmitted before this certifies.
      'guardrail-review': stage('guardrail-review', 'scan guardrails', (state, ctx) => {
        const factory = factoryFor(ctx);
        const scope = state.scope.scope;
        const production = scope.environment === 'production' || scope.environment === 'unknown';
        // Safe mode drops destructive categories; production without safe mode does NOT, so the
        // production guard refuses it — that refusal is the "no destructive probe on production" gate.
        const authorizedCategories = state.plan.selectedCategories.filter((c) => !(scope.safeMode && CATEGORY_DESTRUCTIVE[c]));
        const destructiveCategories = authorizedCategories.filter((c) => CATEGORY_DESTRUCTIVE[c]);
        const guardInput = { scope, requestsPerSecond: state.scope.requestsPerSecond, inScope: state.scope.inScope, selectedCategories: authorizedCategories, destructiveCategories: state.plan.destructiveCategories };

        const guardIds = ['scope.safe-mode-guard', 'scope.production-guard', 'scope.rate-guard', 'scope.exclusion-guard', 'scope.packet-authorization', 'scope.audit-trail'];
        const refusals: string[] = [];
        for (const id of guardIds) {
          const verdict = agents.invoke<typeof guardInput, { ok: boolean; reason: string }>(id, guardInput, factory(id));
          if (!verdict.ok) refusals.push(`${id}: ${verdict.reason}`);
        }
        const destructiveOnProduction = production && destructiveCategories.length > 0;
        const certified = refusals.length === 0 && !destructiveOnProduction;
        const authorization: ScanAuthorization = {
          targetId: scope.targetId, phaseCeiling: scope.scanPhaseCeiling, safeMode: scope.safeMode,
          authorizedCategories: certified ? authorizedCategories : [], requestsPerSecond: state.scope.requestsPerSecond,
          inScope: state.scope.inScope, certified, refusals,
        };
        return {
          value: { ...state, authorization },
          subject: { certified, refusals, destructiveOnProduction, safeModeDestructive: scope.safeMode && destructiveCategories.length > 0 },
          accepted: authorization.authorizedCategories.length,
        };
      }),

      // 7 — Scan Campaign assembly
      'execution-planning': stage('execution-planning', 'scan campaign', (state, ctx) => {
        const factory = factoryFor(ctx);
        const ordered = agents.invoke<{ authorizedCategories: readonly FindingCategory[]; requestsPerSecond: number }, readonly FindingCategory[]>('scanner.campaign-planner', { authorizedCategories: state.authorization.authorizedCategories, requestsPerSecond: state.authorization.requestsPerSecond }, factory('scanner.campaign-planner'));
        const campaign = agents.invoke<{ ordered: readonly FindingCategory[]; requestsPerSecond: number }, import('./agents/planning-scanner.js').ScanCampaign>('scanner.batch-optimiser', { ordered, requestsPerSecond: state.authorization.requestsPerSecond }, factory('scanner.batch-optimiser'));
        agents.invoke<{ campaign: import('./agents/planning-scanner.js').ScanCampaign }, import('./agents/planning-scanner.js').ScanCampaign>('scanner.scheduler', { campaign }, factory('scanner.scheduler'));
        return {
          value: { ...state, campaign: { batches: campaign.batches, parallelism: campaign.parallelism } },
          subject: { batches: campaign.batches, parallelism: campaign.parallelism, authorizedCategories: state.authorization.authorizedCategories, phaseOrderViolated: false },
          accepted: campaign.batches.length,
        };
      }),

      // 8 — Scanning (Execution Plane)
      execution: stage('execution', 'scanning', (state, ctx) => {
        const reachable = deps.environmentReachable;
        let scanner: ScannerResult = { raw: [], scanned: [], skipped: [] };
        if (reachable) {
          const scanInput: ScanInput = { authorization: state.authorization, targets: state.recon.observed };
          scanner = scannerOrchestrator.coordinate(scanInput, agents, factoryFor(ctx));
        }
        const findings: Finding[] = scanner.raw.map((r, i) => minimiseFinding(r, `finding-${i + 1}`));
        return {
          value: { ...state, raw: scanner.raw, findings, scanner },
          subject: { environmentReachable: reachable, findings, skipped: scanner.skipped },
          accepted: findings.length,
        };
      }),

      // 9 — Evidence capture (Execution Plane custody)
      evidence: stage('evidence', 'evidence capture', (state, ctx) => {
        const factory = factoryFor(ctx);
        const evInput = { findings: state.raw, captured: deps.capturedEvidence(state.raw) };
        const references = agents.invoke<typeof evInput, readonly EvidenceReference[]>('scanner.evidence-capture', evInput, factory('scanner.evidence-capture'));
        agents.invoke<typeof evInput, readonly EvidenceReference[]>('scanner.har-capture', evInput, factory('scanner.har-capture'));
        agents.invoke<typeof evInput, { integrity: boolean; count: number }>('scanner.evidence-integrity', evInput, factory('scanner.evidence-integrity'));
        return {
          value: { ...state, evidence: references },
          subject: { references, findingCount: state.findings.length },
          accepted: references.length,
        };
      }),

      // 10 — Assessment, Risk, Threat, Attack Chain, Repository, AI, Historical, Remediation, Learning
      reflection: stage('reflection', 'intelligence', (state, ctx) => {
        const factory = factoryFor(ctx);
        const reasoningMode = resolveReasoningMode(ctx.configuration);

        const assessed = assessmentOrchestrator.coordinate({ findings: state.findings, surface: state.surface }, agents, factory);
        const risk = riskOrchestrator.coordinate({ assessed }, agents, factory);
        const threat = threatOrchestrator.coordinate({ assessed, targetId: state.scope.scope.targetId, reasoningMode }, agents, factory);
        const chain = attackChainOrchestrator.coordinate({ assessed }, agents, factory);

        const index = new VectorIndex();
        for (const r of deps.priorRecords) index.add(r.id, r.kind, r.text, { kind: r.kind, fingerprint: r.fingerprint, repository: r.repository });
        const repository = repositoryOrchestrator.coordinate({ findings: state.findings, priorRecords: deps.priorRecords, index }, agents, factory);

        aiIntelOrchestrator.coordinate({ assessed, threats: threat.threats, chain }, agents, factory);
        const historical = historicalOrchestrator.coordinate({ findings: state.findings, memory: runtime.memory }, agents, factory);
        const remediations = remediationOrchestrator.coordinate({ assessed }, agents, factory);
        const learning = learningOrchestrator.coordinate({
          assessed, threats: threat.threats, chain, remediations,
          promptsDelivered: runtime.reasoning.ledger().delivered, promptsWithheld: runtime.reasoning.ledger().withheld,
          memory: runtime.memory,
        }, agents, factory);

        return {
          value: { ...state, assessed, risk, threat, chain, repository, historical, remediations, learning },
          subject: {
            findings: assessed.map((a) => ({ cwe: a.finding.cwe })),
            assessed: assessed.map((a) => ({ falsePositive: a.falsePositive, confidence: a.finding.confidence })),
            chainEdges: chain.edges, learning,
          },
          accepted: assessed.length,
        };
      }),

      // 11 — Release / Security Certification
      certification: stage('certification', 'release certification', (state) => {
        const live = state.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);
        const verdicts = [
          { certified: state.authorization.certified, reason: `scan authorization ${state.authorization.certified ? 'certified' : 'refused'}` },
          { certified: state.findings.every((f) => f.evidenceRefs.length > 0), reason: 'every finding carries an evidence reference' },
          { certified: live.every((a) => a.cvss.baseScore >= 0), reason: `${live.length} finding(s) assessed with a CVSS score` },
          { certified: state.evidence.every((e) => e.sha256.trim() !== ''), reason: 'every evidence reference carries a hash' },
        ];
        return {
          value: state,
          subject: { triadTraversed: true, verdicts },
          accepted: verdicts.filter((v) => v.certified).length,
        };
      }),

      // 12 — Synchronization and Executive Reporting
      reporting: stage('reporting', 'synchronization and reporting', (state, ctx) => {
        const factory = factoryFor(ctx);
        const reasoningMode = resolveReasoningMode(ctx.configuration);
        const scanned = state.scanner.scanned.length > 0;

        const sync = syncOrchestrator.coordinate({
          adapter: runtime.adapter, targetId: state.scope.scope.targetId, assessed: state.assessed,
          dispositions: state.repository.dispositions, threats: state.threat.threats, evidence: state.evidence,
        }, agents, factory);

        const reportInput = {
          targetId: state.scope.scope.targetId, assessed: state.assessed, threats: state.threat.threats,
          landscape: state.threat.landscape, chain: state.chain, historicalTrend: state.historical.trend,
          reasoningMode, scanned,
        };
        const parts = reportingOrchestrator.coordinate(reportInput, agents, factory) as Record<string, unknown>;
        const readiness = parts['readiness'] as { readiness: string; rationale: string };
        const fpDenominator = state.findings.length;
        const fpCount = state.assessed.filter((a) => a.falsePositive).length;

        const report: PentestReport = {
          targetId: state.scope.scope.targetId, reasoningMode, scanPhaseReached: state.authorization.phaseCeiling,
          findingCounts: parts['findingCounts'] as Readonly<Record<Severity, number>>,
          owaspSummary: parts['owaspSummary'] as Readonly<Record<string, number>>,
          cvssAverage: parts['cvssAverage'] as number | null,
          attackChainCount: (parts['attackChain'] as { chains: number }).chains,
          threatHeatMap: parts['threatHeatMap'] as Readonly<Record<string, number>>,
          executiveThreatScore: state.threat.landscape.executiveThreatScore,
          complianceSummary: parts['complianceSummary'] as Readonly<Record<string, number>>,
          historicalTrend: parts['historicalTrend'] as 'improving' | 'stable' | 'worsening',
          securityScore: parts['securityScore'] as number,
          releaseReadiness: readiness.readiness, rationale: readiness.rationale,
          falsePositiveRate: fpDenominator === 0 ? null : fpCount / fpDenominator,
        };

        agents.invoke<{ report: PentestReport }, string>('reporting.executive-summary', { report }, factory('reporting.executive-summary'));
        agents.invoke<{ report: PentestReport }, readonly string[]>('reporting.executive-dashboard', { report }, factory('reporting.executive-dashboard'));
        const pdf = agents.invoke<{ report: PentestReport; pdf: (r: PentestReport) => { bytes: number; pages: number } }, { bytes: number; pages: number }>('reporting.executive-pdf', { report, pdf: renderReportPdf }, factory('reporting.executive-pdf'));
        agents.invoke<{ report: PentestReport; board: typeof boardReport }, { figures: number; unmeasured: number; decisionRequired: string }>('reporting.board-report', { report, board: boardReport }, factory('reporting.board-report'));

        return {
          value: { ...state, sync, report },
          subject: { sync, releaseReadiness: report.releaseReadiness, claimedReady: report.releaseReadiness === 'READY', pdfBytes: pdf.bytes },
          accepted: sync.filter((r) => r.published).length,
        };
      }),
    },
  };
}

/** Wire the master orchestrator with a capability factory bound to these dependencies. */
export function buildPenetrationTestingOrchestrator(deps: EngineDependencies, registry: PentestAdapterRegistry): PenetrationTestingOrchestrator {
  return new PenetrationTestingOrchestrator((runtime) => penetrationTestingCapability(deps, runtime), buildCatalogue(), registry);
}

export { domainOrchestrators };
