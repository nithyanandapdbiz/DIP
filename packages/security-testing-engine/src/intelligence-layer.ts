/**
 * The Security Intelligence Layer — deterministic builders and types.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 22-security-threat-model.md · 24-platform-intelligence-model.md
 *                  18-governance-model.md · 06-data-sovereignty.md
 *   ADR          : ADR-0029 (Security Intelligence Layer and the Platform-Intelligence boundary)
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-11.11
 *   Rules        : R-13.6 (Platform Intelligence consumes evidence; it never manufactures it)
 *
 * WHERE THIS LIVES. The Security Intelligence Layer is internal structure of capability 5,
 * running in Reflection (10), Certification (11) and Reporting (12). It creates no stage, no
 * capability and no framework change. Every function here is DETERMINISTIC — the knowledge
 * graph, the correlation rules, the scoring, the prediction. Reasoning (when enabled) enriches
 * these outputs with narrative; it never replaces a computed number (C-13.1).
 *
 * SOVEREIGNTY. Everything here operates on ALREADY-MINIMISED artefacts — `Weakness`,
 * `AssessedWeakness`, `SecurityFact`, `SecurityModel` — which carry no customer content. The
 * Execution Plane is untouched. The `SecurityIntelligenceContribution` this module emits carries
 * scores, identifiers and titles only, so it is safe for the Platform Intelligence service to
 * consume across the capability boundary.
 *
 * THE CAPABILITY-5 / PLATFORM-INTELLIGENCE BOUNDARY (ADR-0029). This layer produces capability
 * 5's SECURITY intelligence. Cross-capability correlation and the single enterprise risk score
 * across all six capabilities are NOT here — that is the Platform Intelligence service (doc 24),
 * which consumes this contribution alongside the other five. Building the aggregator here would
 * make capability 5 consume capability 6's attack evidence (the overlap the brief forbids) and
 * reach across the capability boundary (which R-11.1 forbids).
 */
import {
  CHECK_META, SEVERITY_ORDER, maxSeverity, severityForScore,
  type AssessedWeakness, type CheckCategory, type ComplianceResult, type PostureScores,
  type SecurityFact, type SecurityModel, type SecurityRequirement, type Severity,
} from './model.js';

const live = (assessed: readonly AssessedWeakness[]): readonly AssessedWeakness[] =>
  assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);

// ── 1. Security Knowledge Graph ─────────────────────────────────────────────

export type GraphNodeKind =
  | 'resource' | 'weakness' | 'requirement' | 'compliance-control' | 'asset'
  | 'trust-boundary' | 'enterprise-risk' | 'business-domain';

export interface GraphNode { readonly id: string; readonly kind: GraphNodeKind; readonly label: string; readonly attributes: readonly string[]; }
export interface GraphEdge { readonly from: string; readonly to: string; readonly relation: string; }
export interface SecurityKnowledgeGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** Nodes with the most edges — the correlation hotspots. */
  readonly central: readonly { readonly id: string; readonly degree: number }[];
}

export function buildKnowledgeGraph(
  facts: readonly SecurityFact[], assessed: readonly AssessedWeakness[],
  requirements: readonly SecurityRequirement[], compliance: readonly ComplianceResult[],
  model: SecurityModel, risks: readonly EnterpriseRisk[],
): SecurityKnowledgeGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  for (const f of facts) add({ id: `res:${f.id}`, kind: 'resource', label: f.label || f.path, attributes: f.attributeNames });
  for (const r of requirements) add({ id: `req:${r.id}`, kind: 'requirement', label: r.control, attributes: [r.source] });
  for (const b of model.trustBoundaries) add({ id: `tb:${b.id}`, kind: 'trust-boundary', label: b.description, attributes: [b.from, b.to] });
  for (const a of model.assets) add({ id: `asset:${a.id}`, kind: 'asset', label: a.label, attributes: [a.classification] });
  for (const c of compliance) add({ id: `ctl:${c.framework}`, kind: 'compliance-control', label: c.framework, attributes: [`${c.score}`] });

  const byPath = new Map(facts.map((f) => [f.path, f.id]));
  for (const a of live(assessed)) {
    const w = a.weakness;
    add({ id: `weak:${w.id}`, kind: 'weakness', label: w.category, attributes: [w.cwe, w.owasp, w.severity] });
    const resId = byPath.get(w.path);
    if (resId) edges.push({ from: `weak:${w.id}`, to: `res:${resId}`, relation: 'located-at' });
    for (const req of requirements) if (req.categories.includes(w.category)) edges.push({ from: `weak:${w.id}`, to: `req:${req.id}`, relation: 'violates' });
    for (const c of compliance) if (c.gaps.some((g) => g.includes(w.category))) edges.push({ from: `weak:${w.id}`, to: `ctl:${c.framework}`, relation: 'maps-to' });
  }
  for (const risk of risks) {
    add({ id: `risk:${risk.id}`, kind: 'enterprise-risk', label: risk.title, attributes: [risk.category, risk.severity] });
    for (const wid of risk.contributingWeaknessIds) edges.push({ from: `risk:${risk.id}`, to: `weak:${wid}`, relation: 'aggregates' });
  }

  const degree = new Map<string, number>();
  for (const e of edges) { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); }
  const central = [...degree.entries()].map(([id, d]) => ({ id, degree: d })).sort((x, y) => y.degree - x.degree).slice(0, 10);

  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length, central };
}

// ── 2. Risk Correlation Engine ──────────────────────────────────────────────

export type RiskCategory =
  | 'identity-compromise' | 'supply-chain' | 'browser-attack' | 'data-exposure'
  | 'infrastructure' | 'crypto-failure' | 'privacy' | 'ai-risk';

export interface EnterpriseRisk {
  readonly id: string;
  readonly title: string;
  readonly category: RiskCategory;
  readonly severity: Severity;
  readonly contributingWeaknessIds: readonly string[];
  readonly rationale: string;
  readonly businessImpact: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

interface CorrelationRule {
  readonly id: string; readonly title: string; readonly category: RiskCategory;
  readonly anyOf: readonly CheckCategory[]; readonly escalate: number; readonly impact: string;
}

/**
 * Correlation rules — findings become enterprise risks. Never report isolated findings when
 * they combine into something worse. Deterministic and inspectable; reasoning may add an
 * emergent correlation as a labelled proposal, but never removes one of these.
 */
export const CORRELATION_RULES: readonly CorrelationRule[] = [
  { id: 'R-IDENTITY', title: 'Critical Identity Compromise Risk', category: 'identity-compromise', anyOf: ['tls-configuration', 'authn-config', 'authz-config', 'session-config'], escalate: 1, impact: 'account takeover and privilege escalation across the identity surface' },
  { id: 'R-SUPPLY', title: 'Supply Chain Risk', category: 'supply-chain', anyOf: ['dependency-cve', 'secret-exposure', 'container-hardening'], escalate: 1, impact: 'compromise introduced through dependencies, secrets or images' },
  { id: 'R-BROWSER', title: 'Browser Attack Risk', category: 'browser-attack', anyOf: ['csp-policy', 'cors-policy', 'security-header', 'cookie-flags'], escalate: 1, impact: 'client-side attack surface exposed to malicious content' },
  { id: 'R-DATA', title: 'Data Exposure Risk', category: 'data-exposure', anyOf: ['secret-exposure', 'cloud-baseline', 'privacy-control'], escalate: 1, impact: 'confidential or regulated data exposed at rest or in configuration' },
  { id: 'R-INFRA', title: 'Infrastructure Risk', category: 'infrastructure', anyOf: ['iac-misconfig', 'kubernetes-policy', 'cloud-baseline', 'container-hardening'], escalate: 1, impact: 'platform and infrastructure hardening gaps widen the blast radius' },
  { id: 'R-CRYPTO', title: 'Cryptographic Failure Risk', category: 'crypto-failure', anyOf: ['tls-configuration', 'certificate-validity'], escalate: 0, impact: 'weak transport cryptography undermines every control above it' },
  { id: 'R-PRIVACY', title: 'Privacy Risk', category: 'privacy', anyOf: ['privacy-control'], escalate: 0, impact: 'regulatory exposure under data-protection law' },
  { id: 'R-AI', title: 'AI Security Risk', category: 'ai-risk', anyOf: ['ai-guardrail-config'], escalate: 1, impact: 'model manipulation or leakage through missing AI guardrails' },
];

export function correlateRisks(assessed: readonly AssessedWeakness[]): readonly EnterpriseRisk[] {
  const byCategory = new Map<CheckCategory, AssessedWeakness[]>();
  for (const a of live(assessed)) {
    const list = byCategory.get(a.weakness.category) ?? [];
    list.push(a); byCategory.set(a.weakness.category, list);
  }
  const risks: EnterpriseRisk[] = [];
  for (const rule of CORRELATION_RULES) {
    const matched = rule.anyOf.filter((c) => byCategory.has(c));
    if (matched.length === 0) continue;
    const contributing = matched.flatMap((c) => byCategory.get(c)!);
    const base = contributing.reduce((m, a) => maxSeverity(m, a.weakness.severity), 'info' as Severity);
    const escalatedScore = Math.min(4, SEVERITY_ORDER[base] + (matched.length >= 2 ? rule.escalate : 0));
    const severity = (['info', 'low', 'medium', 'high', 'critical'] as Severity[])[escalatedScore] ?? 'info';
    risks.push({
      id: rule.id, title: rule.title, category: rule.category, severity,
      contributingWeaknessIds: contributing.map((a) => a.weakness.id),
      rationale: `${matched.length} correlated weakness categor${matched.length === 1 ? 'y' : 'ies'}: ${matched.join(', ')}`,
      businessImpact: rule.impact,
      confidence: matched.length >= 2 ? 'high' : 'medium',
    });
  }
  return risks.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}

// ── 3. Business Context Engine ──────────────────────────────────────────────

export interface BusinessContext {
  readonly applicationId: string;
  readonly businessCapability: string;
  readonly customerJourney: string;
  readonly revenueImpacting: boolean;
  readonly dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  readonly regulations: readonly string[];
  readonly criticalAssets: readonly string[];
}

export function parseBusinessContext(config: Readonly<Record<string, string>>): BusinessContext {
  const list = (k: string) => (config[k] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    applicationId: config['sectest.business.applicationId'] ?? config['sectest.targetId'] ?? '',
    businessCapability: config['sectest.business.capability'] ?? 'unspecified',
    customerJourney: config['sectest.business.journey'] ?? 'unspecified',
    revenueImpacting: (config['sectest.business.revenue'] ?? 'false').toLowerCase() === 'true',
    dataClassification: (config['sectest.business.dataClassification'] as BusinessContext['dataClassification']) ?? 'confidential',
    regulations: list('sectest.business.regulations'),
    criticalAssets: list('sectest.business.criticalAssets'),
  };
}

/** Security severity becomes business severity: restricted data or revenue flow elevates. */
export function toBusinessSeverity(technical: Severity, ctx: BusinessContext): Severity {
  let score = SEVERITY_ORDER[technical];
  if (ctx.dataClassification === 'restricted') score += 1;
  else if (ctx.dataClassification === 'confidential' && ctx.revenueImpacting) score += 1;
  return (['info', 'low', 'medium', 'high', 'critical'] as Severity[])[Math.min(4, score)] ?? technical;
}

// ── 4. Attack Surface Intelligence (structural, read-only — NOT exploitation) ─

export interface AttackSurfaceGraph {
  readonly entryPoints: readonly string[];
  readonly trustBoundaries: readonly { readonly id: string; readonly from: string; readonly to: string }[];
  readonly apiGraph: readonly GraphEdge[];
  readonly dataFlows: readonly string[];
  readonly externalIntegrations: readonly string[];
  readonly secretsSurfaces: readonly string[];
  readonly exposureScore: number;
}

export function buildAttackSurface(facts: readonly SecurityFact[], model: SecurityModel): AttackSurfaceGraph {
  const entryPoints = facts.filter((f) => f.kind === 'endpoint').map((f) => f.path);
  const externalIntegrations = facts.filter((f) => f.kind === 'dependency' || f.kind === 'cloud-resource').map((f) => f.label || f.path);
  const secretsSurfaces = facts.filter((f) => f.kind === 'secret-surface').map((f) => f.path);
  const apiGraph: GraphEdge[] = entryPoints.map((p) => ({ from: 'client', to: `api:${p}`, relation: 'requests' }));
  const dataFlows = facts.filter((f) => f.kind === 'endpoint' || f.kind === 'cloud-resource').map((f) => `${f.kind}:${f.path}`);
  return {
    entryPoints,
    trustBoundaries: model.trustBoundaries.map((b) => ({ id: b.id, from: b.from, to: b.to })),
    apiGraph, dataFlows, externalIntegrations, secretsSurfaces,
    exposureScore: model.exposureScore,
  };
}

// ── 5. Security Certification Engine ────────────────────────────────────────

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type MaturityLevel = 1 | 2 | 3 | 4 | 5;
export interface DomainScore { readonly domain: string; readonly score: number; readonly grade: Grade; }
export interface SecurityCertification {
  readonly domainScores: readonly DomainScore[];
  readonly overallScore: number;
  readonly maturityLevel: MaturityLevel;
  readonly readiness: 'READY' | 'CONDITIONAL' | 'NOT-READY';
  readonly status: 'CERTIFIED' | 'PROVISIONAL' | 'NOT-CERTIFIED';
  readonly riskTrend: 'improving' | 'stable' | 'worsening';
}

const CERT_DOMAINS: Readonly<Record<string, readonly CheckCategory[]>> = {
  authentication: ['authn-config'], authorization: ['authz-config'], identity: ['authn-config', 'authz-config', 'session-config'],
  cloud: ['cloud-baseline'], containers: ['container-hardening', 'kubernetes-policy'], dependencies: ['dependency-cve'],
  infrastructure: ['iac-misconfig', 'kubernetes-policy', 'cloud-baseline', 'container-hardening'], api: ['security-header', 'cors-policy', 'authn-config'],
  privacy: ['privacy-control'], secrets: ['secret-exposure'], certificates: ['certificate-validity', 'tls-configuration'],
  'ai-security': ['ai-guardrail-config'], 'supply-chain': ['dependency-cve', 'secret-exposure', 'container-hardening'],
};

function gradeFor(score: number): Grade { return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'; }

function domainScore(assessed: readonly AssessedWeakness[], categories: readonly CheckCategory[]): number {
  const relevant = live(assessed).filter((a) => categories.includes(a.weakness.category));
  const penalty = relevant.reduce((s, a) => s + SEVERITY_ORDER[a.weakness.severity] * 6, 0);
  return Math.max(0, 100 - penalty);
}

export function buildCertification(assessed: readonly AssessedWeakness[], complianceScore: number, riskTrend: 'improving' | 'stable' | 'worsening'): SecurityCertification {
  const domainScores: DomainScore[] = Object.entries(CERT_DOMAINS).map(([domain, cats]) => {
    const score = domain === 'compliance' ? complianceScore : domainScore(assessed, cats);
    return { domain, score, grade: gradeFor(score) };
  });
  domainScores.push({ domain: 'compliance', score: complianceScore, grade: gradeFor(complianceScore) });
  const overallScore = Math.round(domainScores.reduce((s, d) => s + d.score, 0) / domainScores.length);
  const criticals = live(assessed).filter((a) => a.weakness.severity === 'critical').length;
  const highs = live(assessed).filter((a) => a.weakness.severity === 'high').length;
  const maturityLevel = (overallScore >= 90 ? 5 : overallScore >= 80 ? 4 : overallScore >= 65 ? 3 : overallScore >= 50 ? 2 : 1) as MaturityLevel;
  const readiness = criticals > 0 || highs > 0 ? 'NOT-READY' : overallScore >= 80 ? 'READY' : 'CONDITIONAL';
  const status = criticals > 0 ? 'NOT-CERTIFIED' : overallScore >= 85 ? 'CERTIFIED' : 'PROVISIONAL';
  return { domainScores, overallScore, maturityLevel, readiness, status, riskTrend };
}

// ── 6. Executive Intelligence ───────────────────────────────────────────────

export interface ExecutiveIntelligence {
  readonly securityScore: number;
  readonly topRisks: readonly { readonly id: string; readonly title: string; readonly severity: Severity }[];
  readonly riskHeatMap: Readonly<Record<string, number>>;
  readonly kpis: Readonly<Record<string, number>>;
  readonly securityDebt: { readonly items: number; readonly effortUnits: number };
  readonly costOfRisk: number;
  readonly recommendations: readonly string[];
}

const COST_OF_SEVERITY: Record<Severity, number> = { critical: 100, high: 40, medium: 10, low: 3, info: 0 };

export function buildExecutive(
  risks: readonly EnterpriseRisk[], assessed: readonly AssessedWeakness[], certification: SecurityCertification, scores: PostureScores,
): ExecutiveIntelligence {
  const l = live(assessed);
  const heatMap: Record<string, number> = {};
  for (const r of risks) heatMap[r.category] = SEVERITY_ORDER[r.severity];
  const kpis = {
    openWeaknesses: l.length,
    criticalRisks: risks.filter((r) => r.severity === 'critical').length,
    overallScore: certification.overallScore,
    maturityLevel: certification.maturityLevel,
    identityScore: scores.identityScore,
    cloudScore: scores.cloudScore,
    complianceScore: scores.complianceScore,
  };
  const costOfRisk = l.reduce((s, a) => s + COST_OF_SEVERITY[a.weakness.severity], 0);
  const recommendations = risks.slice(0, 5).map((r) => `Address ${r.title.toLowerCase()} — ${r.businessImpact}`);
  return {
    securityScore: scores.securityScore,
    topRisks: risks.slice(0, 5).map((r) => ({ id: r.id, title: r.title, severity: r.severity })),
    riskHeatMap: heatMap, kpis,
    securityDebt: { items: l.length, effortUnits: l.length * 5 },
    costOfRisk, recommendations,
  };
}

// ── 7. Developer Intelligence ───────────────────────────────────────────────

export interface DeveloperGuidance {
  readonly weaknessId: string; readonly category: CheckCategory; readonly rootCause: string;
  readonly secureCodingGuidance: string; readonly owasp: string; readonly cwe: string;
  readonly suggestedPatch: string; readonly regressionTest: string;
  readonly prevention: string; readonly architectureRecommendation: string;
}

const ROOT_CAUSE: Partial<Record<CheckCategory, string>> = {
  'security-header': 'response headers not set at the edge or framework layer',
  'cors-policy': 'permissive cross-origin policy configured',
  'tls-configuration': 'obsolete TLS version or weak cipher suite enabled',
  'dependency-cve': 'a dependency pinned to a version with a known advisory',
  'secret-exposure': 'a secret committed to source or configuration',
  'authn-config': 'authentication policy weaker than the requirement',
  'kubernetes-policy': 'a pod security context that grants excess privilege',
};

export function buildDeveloperIntelligence(assessed: readonly AssessedWeakness[]): readonly DeveloperGuidance[] {
  return live(assessed).map((a): DeveloperGuidance => {
    const w = a.weakness;
    return {
      weaknessId: w.id, category: w.category,
      rootCause: ROOT_CAUSE[w.category] ?? `${w.category} control absent or misconfigured`,
      secureCodingGuidance: `Enforce the ${CHECK_META[w.category].title.toLowerCase()} control at ${w.path}.`,
      owasp: w.owasp, cwe: w.cwe,
      suggestedPatch: `Configure ${w.category} correctly; re-run verify.${w.category}.`,
      regressionTest: `verify.${w.category} @ ${w.path}`,
      prevention: `Add ${w.category} to the pre-merge security gate for this service.`,
      architectureRecommendation: `Own ${CHECK_META[w.category].domain} controls in a shared, tested platform baseline.`,
    };
  });
}

// ── 8. Predictive Security (deterministic, from IP-supplied history) ─────────

export interface HistoricalFinding { readonly category: CheckCategory; readonly path: string; }
export interface PredictiveIntelligence {
  readonly hotspots: readonly { readonly path: string; readonly count: number }[];
  readonly regressionProbability: readonly { readonly path: string; readonly probability: number }[];
  readonly trendingCategories: readonly { readonly category: string; readonly count: number }[];
  readonly highRiskModules: readonly string[];
  readonly frequentlyVulnerableApis: readonly string[];
}

export function buildPredictive(history: readonly HistoricalFinding[], assessed: readonly AssessedWeakness[]): PredictiveIntelligence {
  const pathCount = new Map<string, number>();
  const catCount = new Map<string, number>();
  for (const h of history) {
    pathCount.set(h.path, (pathCount.get(h.path) ?? 0) + 1);
    catCount.set(h.category, (catCount.get(h.category) ?? 0) + 1);
  }
  for (const a of live(assessed)) { pathCount.set(a.weakness.path, (pathCount.get(a.weakness.path) ?? 0) + 1); catCount.set(a.weakness.category, (catCount.get(a.weakness.category) ?? 0) + 1); }
  const hotspots = [...pathCount.entries()].filter(([, c]) => c >= 2).map(([path, count]) => ({ path, count })).sort((x, y) => y.count - x.count);
  const currentPaths = new Set(live(assessed).map((a) => a.weakness.path));
  const historyPaths = new Set(history.map((h) => h.path));
  const regressionProbability = [...currentPaths].map((path) => ({ path, probability: historyPaths.has(path) ? 0.8 : 0.2 })).sort((x, y) => y.probability - x.probability);
  const trendingCategories = [...catCount.entries()].map(([category, count]) => ({ category, count })).sort((x, y) => y.count - x.count).slice(0, 8);
  return {
    hotspots, regressionProbability, trendingCategories,
    highRiskModules: hotspots.slice(0, 5).map((h) => h.path),
    frequentlyVulnerableApis: hotspots.filter((h) => h.path.includes('/api')).map((h) => h.path),
  };
}

// ── The Platform-Intelligence boundary contribution (items 9-10 seam) ───────

/**
 * What capability 5 hands the Platform Intelligence service (doc 24). It carries scores,
 * identifiers and titles only — never customer content — so it crosses the capability
 * boundary safely. The Platform Intelligence service consumes this ALONGSIDE the other five
 * capabilities' contributions to compute the single enterprise risk score and release
 * decision. That aggregation is NOT performed here (R-11.1, R-13.6, ADR-0029).
 */
export interface SecurityIntelligenceContribution {
  readonly capability: 'security-testing';
  readonly securityRiskScore: number;
  readonly topRisks: readonly { readonly id: string; readonly title: string; readonly category: RiskCategory; readonly severity: Severity }[];
  readonly certificationStatus: SecurityCertification['status'];
  readonly maturityLevel: MaturityLevel;
  readonly readiness: SecurityCertification['readiness'];
  readonly posture: PostureScores;
  /** The contribution is evidence for a consumer; it manufactures no cross-capability verdict. */
  readonly aggregatesOtherCapabilities: false;
}

export function buildContribution(certification: SecurityCertification, risks: readonly EnterpriseRisk[], scores: PostureScores): SecurityIntelligenceContribution {
  const riskScore = Math.max(0, 100 - risks.reduce((s, r) => s + SEVERITY_ORDER[r.severity] * 5, 0));
  return {
    capability: 'security-testing',
    securityRiskScore: riskScore,
    topRisks: risks.slice(0, 5).map((r) => ({ id: r.id, title: r.title, category: r.category, severity: r.severity })),
    certificationStatus: certification.status,
    maturityLevel: certification.maturityLevel,
    readiness: certification.readiness,
    posture: scores,
    aggregatesOtherCapabilities: false,
  };
}

// ── The assembled intelligence report ───────────────────────────────────────

export interface SecurityIntelligenceReport {
  readonly graph: SecurityKnowledgeGraph;
  readonly risks: readonly EnterpriseRisk[];
  readonly businessContext: BusinessContext;
  readonly attackSurface: AttackSurfaceGraph;
  readonly certification: SecurityCertification;
  readonly executive: ExecutiveIntelligence;
  readonly developer: readonly DeveloperGuidance[];
  readonly predictive: PredictiveIntelligence;
  readonly contribution: SecurityIntelligenceContribution;
}

export { severityForScore };
