/**
 * The Security Intelligence Layer agents — nine Intelligence-Plane domains.
 *
 * TRACEABILITY
 *   Architecture : 24-platform-intelligence-model.md · 08-security-model.md · 18-governance-model.md
 *   ADR          : ADR-0029
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-11.11
 *   Invariants   : INV-7 (functions with reasoning unavailable)
 *
 * These agents run in Reflection (10), Certification (11) and Reporting (12) — all Intelligence
 * Plane. They operate only on minimised artefacts; the Execution Plane is untouched. The
 * deterministic core (knowledge graph, correlation, scoring, prediction) is complete on its own;
 * four reasoning agents ENRICH it and each has a deterministic degraded path (INV-7).
 */
import { defineAgent, type AgentContext, type AgentDefinition } from '@dbiz/capability-framework';
import {
  buildAttackSurface, buildCertification, buildContribution, buildDeveloperIntelligence,
  buildExecutive, buildKnowledgeGraph, buildPredictive, correlateRisks, parseBusinessContext, toBusinessSeverity,
  type AttackSurfaceGraph, type BusinessContext, type DeveloperGuidance, type EnterpriseRisk,
  type ExecutiveIntelligence, type GraphEdge, type HistoricalFinding,
  type PredictiveIntelligence, type SecurityCertification, type SecurityIntelligenceContribution,
  type SecurityKnowledgeGraph,
} from '../intelligence-layer.js';
import type {
  AssessedWeakness, ComplianceResult, PostureScores, SecurityFact, SecurityModel, SecurityRequirement, Severity,
} from '../model.js';

const A = <I, O>(d: Parameters<typeof defineAgent<I, O>>[0]): AgentDefinition<never, unknown> =>
  defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;

// ── knowledgegraph (reflection) ─────────────────────────────────────────────

export const knowledgeGraphAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ facts: readonly SecurityFact[]; assessed: readonly AssessedWeakness[]; requirements: readonly SecurityRequirement[]; compliance: readonly ComplianceResult[]; model: SecurityModel; risks: readonly EnterpriseRisk[] }, SecurityKnowledgeGraph>({
    id: 'knowledgegraph.node-extraction', domain: 'knowledgegraph', purpose: 'Extract graph nodes from facts, weaknesses, requirements, controls, assets and risks.',
    stage: 'reflection', plane: 'IP', inputs: ['minimised facts, assessed weaknesses, requirements, compliance, model, risks'], outputs: ['a knowledge graph'],
    responsibilities: ['emit one node per correlated entity'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an entity that cannot be nodalised is reported, never dropped from the graph',
    handle: (i) => buildKnowledgeGraph(i.facts, i.assessed, i.requirements, i.compliance, i.model, i.risks),
  }),
  A<{ graph: SecurityKnowledgeGraph }, readonly GraphEdge[]>({
    id: 'knowledgegraph.edge-correlation', domain: 'knowledgegraph', purpose: 'Correlate the graph edges: located-at, violates, maps-to, aggregates.',
    stage: 'reflection', plane: 'IP', inputs: ['the assembled graph'], outputs: ['the correlated edges'],
    responsibilities: ['expose every relation between security entities'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncorrelated node is left isolated and reported, never force-linked',
    handle: (i) => i.graph.edges,
  }),
  A<{ graph: SecurityKnowledgeGraph }, readonly { id: string; degree: number }[]>({
    id: 'knowledgegraph.centrality', domain: 'knowledgegraph', purpose: 'Rank the most-connected nodes as correlation hotspots.',
    stage: 'reflection', plane: 'IP', inputs: ['the assembled graph'], outputs: ['the central nodes by degree'],
    responsibilities: ['surface the entities that connect the most risk'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty graph yields an empty ranking, reported as zero correlation',
    handle: (i) => i.graph.central,
  }),
];

// ── riskcorrelation (reflection) ────────────────────────────────────────────

export const riskCorrelationAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ assessed: readonly AssessedWeakness[] }, readonly EnterpriseRisk[]>({
    id: 'riskcorrelation.correlate', domain: 'riskcorrelation', purpose: 'Correlate isolated weaknesses into enterprise risks by rule.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['enterprise risks'],
    responsibilities: ['never report an isolated finding when it combines into a worse risk'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness that matches no rule is still reported individually, never lost',
    handle: (i) => correlateRisks(i.assessed),
  }),
  A<{ risks: readonly EnterpriseRisk[] }, readonly EnterpriseRisk[]>({
    id: 'riskcorrelation.emergent', domain: 'riskcorrelation', purpose: 'Propose emergent correlations reasoning may see that the rules did not.',
    stage: 'reflection', plane: 'IP', inputs: ['deterministic enterprise risks (titles, categories, severities)'], outputs: ['the risks, with any validated emergent correlation appended'],
    responsibilities: ['append only; never remove or downgrade a deterministic risk'], toolContracts: [], aiCapabilityClass: 'reconciliation',
    promptContract: {
      intent: 'identify an emergent enterprise risk that spans several deterministic risks',
      inputsProvided: ['risk titles', 'risk categories', 'risk severities'],
      expects: 'a proposed additional correlation referencing existing risk identifiers',
      rejectionRules: ['reject a proposal that removes or lowers any deterministic risk', 'reject a proposal referencing an unknown risk identifier'],
    },
    aiBehaviour: 'appends a validated emergent risk labelled as reasoning-proposed',
    nonAiBehaviour: 'returns the deterministic risks unchanged; no emergent risk is invented when reasoning is unavailable',
    failureHandling: 'a malformed proposal is discarded; the deterministic risks always stand',
    handle: (i: { risks: readonly EnterpriseRisk[] }, ctx: AgentContext) => {
      const known = new Set(i.risks.map((r) => r.id));
      const proposal = ctx.proposal as { id?: string; title?: string; refs?: string[] } | null;
      if (proposal && proposal.id && !known.has(proposal.id) && Array.isArray(proposal.refs) && proposal.refs.every((r) => known.has(r))) {
        const severity = i.risks.filter((r) => proposal.refs!.includes(r.id)).reduce((m, r) => (['info', 'low', 'medium', 'high', 'critical'] as Severity[]).indexOf(r.severity) > (['info', 'low', 'medium', 'high', 'critical'] as Severity[]).indexOf(m) ? r.severity : m, 'info' as Severity);
        return [...i.risks, { id: proposal.id, title: proposal.title ?? 'Emergent correlated risk', category: 'infrastructure' as EnterpriseRisk['category'], severity, contributingWeaknessIds: [], rationale: 'reasoning-proposed emergent correlation, validated against deterministic risks', businessImpact: 'spans multiple deterministic risks', confidence: 'medium' as const }];
      }
      return i.risks;
    },
  }),
];

// ── businesscontext (reflection) ────────────────────────────────────────────

export const businessContextAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ configuration: Readonly<Record<string, string>> }, BusinessContext>({
    id: 'businesscontext.parse', domain: 'businesscontext', purpose: 'Resolve the business context from configuration.',
    stage: 'reflection', plane: 'IP', inputs: ['tenant configuration'], outputs: ['the business context'],
    responsibilities: ['default data classification to confidential when unstated'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unstated context defaults conservatively (confidential), never permissively',
    handle: (i) => parseBusinessContext(i.configuration),
  }),
  A<{ risks: readonly EnterpriseRisk[]; context: BusinessContext }, readonly { id: string; technical: Severity; business: Severity }[]>({
    id: 'businesscontext.severity-elevation', domain: 'businesscontext', purpose: 'Translate technical severity into business severity.',
    stage: 'reflection', plane: 'IP', inputs: ['enterprise risks', 'business context'], outputs: ['business severity per risk'],
    responsibilities: ['elevate severity on restricted data or revenue-flow impact'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'when context is unknown, business severity equals technical severity, never lower',
    handle: (i) => i.risks.map((r) => ({ id: r.id, technical: r.severity, business: toBusinessSeverity(r.severity, i.context) })),
  }),
];

// ── attacksurface (reflection) ──────────────────────────────────────────────

export const attackSurfaceAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ facts: readonly SecurityFact[]; model: SecurityModel }, AttackSurfaceGraph>({
    id: 'attacksurface.assemble', domain: 'attacksurface', purpose: 'Build the structural attack surface graph — entry points, boundaries, flows (read-only, not exploitation).',
    stage: 'reflection', plane: 'IP', inputs: ['minimised facts', 'the security model'], outputs: ['the attack surface graph'],
    responsibilities: ['map structure only; never generate or execute an attack'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unmappable surface element is reported as unknown, never omitted from the boundary',
    handle: (i) => buildAttackSurface(i.facts, i.model),
  }),
  A<{ surface: AttackSurfaceGraph }, readonly string[]>({
    id: 'attacksurface.entry-points', domain: 'attacksurface', purpose: 'Enumerate the external entry points.',
    stage: 'reflection', plane: 'IP', inputs: ['the attack surface graph'], outputs: ['entry points'],
    responsibilities: ['list every externally reachable entry'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an ambiguous entry is listed as an entry, the safe assumption',
    handle: (i) => i.surface.entryPoints,
  }),
  A<{ surface: AttackSurfaceGraph }, readonly string[]>({
    id: 'attacksurface.secrets-flow', domain: 'attacksurface', purpose: 'Enumerate secret-bearing surfaces on the attack graph.',
    stage: 'reflection', plane: 'IP', inputs: ['the attack surface graph'], outputs: ['secret surfaces'],
    responsibilities: ['identify where secrets touch the surface'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a possible secret surface is flagged, never assumed clean',
    handle: (i) => i.surface.secretsSurfaces,
  }),
];

// ── developer (reflection) ──────────────────────────────────────────────────

export const developerAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ assessed: readonly AssessedWeakness[] }, readonly DeveloperGuidance[]>({
    id: 'developer.guidance', domain: 'developer', purpose: 'Produce per-finding developer intelligence: root cause, guidance, references, patch, regression, prevention.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['developer guidance per weakness'],
    responsibilities: ['give a root cause and a concrete fix for every live weakness'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness with no template yields a generic hardening step, never empty guidance',
    handle: (i) => buildDeveloperIntelligence(i.assessed),
  }),
  A<{ guidance: readonly DeveloperGuidance[] }, readonly DeveloperGuidance[]>({
    id: 'developer.fix-recommendation', domain: 'developer', purpose: 'Enrich fix guidance with reasoning where available.',
    stage: 'reflection', plane: 'IP', inputs: ['developer guidance (category, cwe, owasp, path)'], outputs: ['the guidance, enriched'],
    responsibilities: ['keep the deterministic patch; add narrative only'], toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'expand a fix recommendation into clearer developer prose',
      inputsProvided: ['weakness category', 'cwe', 'owasp reference', 'affected path'],
      expects: 'clearer prose for the existing fix',
      rejectionRules: ['reject a proposal that changes the CWE or the regression test', 'reject a proposal that introduces source code'],
    },
    aiBehaviour: 'appends clearer prose to the deterministic patch',
    nonAiBehaviour: 'returns the deterministic guidance unchanged',
    failureHandling: 'a malformed proposal is discarded; the deterministic guidance always stands',
    handle: (i: { guidance: readonly DeveloperGuidance[] }, _ctx: AgentContext) => i.guidance,
  }),
];

// ── predictive (reflection) ─────────────────────────────────────────────────

export const predictiveAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ history: readonly HistoricalFinding[]; assessed: readonly AssessedWeakness[] }, PredictiveIntelligence>({
    id: 'predictive.forecast', domain: 'predictive', purpose: 'Predict hotspots, regression probability and trending categories from history.',
    stage: 'reflection', plane: 'IP', inputs: ['IP-supplied historical findings', 'assessed weaknesses'], outputs: ['predictive intelligence'],
    responsibilities: ['predict deterministically from observed history'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no history yields low-confidence predictions, stated as such, never fabricated certainty',
    handle: (i) => buildPredictive(i.history, i.assessed),
  }),
  A<{ prediction: PredictiveIntelligence }, readonly string[]>({
    id: 'predictive.high-risk-modules', domain: 'predictive', purpose: 'Name the modules most likely to regress.',
    stage: 'reflection', plane: 'IP', inputs: ['predictive intelligence'], outputs: ['high-risk modules'],
    responsibilities: ['rank by recurrence'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty history yields an empty list, reported as insufficient data',
    handle: (i) => i.prediction.highRiskModules,
  }),
];

// ── certification (certification stage) ─────────────────────────────────────

export const certificationAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ assessed: readonly AssessedWeakness[]; complianceScore: number; riskTrend: 'improving' | 'stable' | 'worsening' }, SecurityCertification>({
    id: 'certification.assemble', domain: 'certification', purpose: 'Compute per-domain scores, maturity, readiness and certification status.',
    stage: 'certification', plane: 'IP', inputs: ['assessed weaknesses', 'compliance score', 'risk trend'], outputs: ['the security certification'],
    responsibilities: ['derive certification from evidence, never assign it'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a critical weakness forces NOT-CERTIFIED; certification is never asserted over an open critical',
    handle: (i) => buildCertification(i.assessed, i.complianceScore, i.riskTrend),
  }),
  A<{ certification: SecurityCertification }, number>({
    id: 'certification.maturity', domain: 'certification', purpose: 'Report the security maturity level (1-5).',
    stage: 'certification', plane: 'IP', inputs: ['the certification'], outputs: ['the maturity level'],
    responsibilities: ['derive maturity from the overall score'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncomputable maturity reports level 1, the conservative floor',
    handle: (i) => i.certification.maturityLevel,
  }),
  A<{ certification: SecurityCertification }, string>({
    id: 'certification.status', domain: 'certification', purpose: 'Report the certification status verdict.',
    stage: 'certification', plane: 'IP', inputs: ['the certification'], outputs: ['the certification status'],
    responsibilities: ['report NOT-CERTIFIED over any open critical'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncertain status reports NOT-CERTIFIED, never CERTIFIED',
    handle: (i) => i.certification.status,
  }),
];

// ── executive (reporting) ───────────────────────────────────────────────────

export const executiveAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ risks: readonly EnterpriseRisk[]; assessed: readonly AssessedWeakness[]; certification: SecurityCertification; scores: PostureScores }, ExecutiveIntelligence>({
    id: 'executive.assemble', domain: 'executive', purpose: 'Assemble the executive and board intelligence: top risks, KPIs, security debt, cost of risk, recommendations.',
    stage: 'reporting', plane: 'IP', inputs: ['risks', 'assessed weaknesses', 'certification', 'posture scores'], outputs: ['executive intelligence'],
    responsibilities: ['render figures deterministically for the board'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncomputable figure reports NOT MEASURED, never a fabricated pass',
    handle: (i) => buildExecutive(i.risks, i.assessed, i.certification, i.scores),
  }),
  A<{ executive: ExecutiveIntelligence }, readonly string[]>({
    id: 'executive.recommendations', domain: 'executive', purpose: 'Surface the top executive recommendations.',
    stage: 'reporting', plane: 'IP', inputs: ['executive intelligence'], outputs: ['recommendations'],
    responsibilities: ['prioritise by enterprise risk'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no risks yields a positive assurance statement, never a blank',
    handle: (i) => i.executive.recommendations.length > 0 ? i.executive.recommendations : ['no enterprise-level security risk correlated this run'],
  }),
  A<{ executive: ExecutiveIntelligence; certification: SecurityCertification }, string>({
    id: 'executive.summary', domain: 'executive', purpose: 'Render an executive narrative from the figures, where reasoning is available.',
    stage: 'reporting', plane: 'IP', inputs: ['executive figures (scores, counts)', 'certification status'], outputs: ['an executive summary line'],
    responsibilities: ['never overstate readiness; the figures govern'], toolContracts: [], aiCapabilityClass: 'summarisation',
    promptContract: {
      intent: 'summarise the security posture for an executive audience',
      inputsProvided: ['security score', 'top risk count', 'certification status'],
      expects: 'a concise executive narrative',
      rejectionRules: ['reject a summary that claims readiness the certification does not support', 'reject a summary that names a customer system by content'],
    },
    aiBehaviour: 'renders a narrative consistent with the figures',
    nonAiBehaviour: 'renders a deterministic one-line summary from the figures',
    failureHandling: 'a summary that overstates readiness is rejected and the deterministic line is used',
    handle: (i: { executive: ExecutiveIntelligence; certification: SecurityCertification }, ctx: AgentContext) => {
      const deterministic = `Security score ${i.executive.securityScore}/100; ${i.executive.topRisks.length} top enterprise risk(s); certification ${i.certification.status}, maturity L${i.certification.maturityLevel}.`;
      const proposal = typeof ctx.proposal === 'string' ? ctx.proposal : null;
      const overstates = proposal !== null && /ready|certified|secure/i.test(proposal) && i.certification.status !== 'CERTIFIED';
      return proposal && !overstates ? proposal : deterministic;
    },
  }),
];

// ── contribution (reporting) — the Platform-Intelligence seam ───────────────

export const contributionAgents: readonly AgentDefinition<never, unknown>[] = [
  A<{ certification: SecurityCertification; risks: readonly EnterpriseRisk[]; scores: PostureScores }, SecurityIntelligenceContribution>({
    id: 'contribution.assemble', domain: 'contribution', purpose: 'Assemble the capability-5 contribution the Platform Intelligence service consumes.',
    stage: 'reporting', plane: 'IP', inputs: ['certification', 'risks', 'posture scores'], outputs: ['the security intelligence contribution'],
    responsibilities: ['emit scores and identifiers only', 'never aggregate other capabilities (that is the Platform Intelligence service, ADR-0029)'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an incomplete contribution is emitted with the missing field marked, never silently completed',
    handle: (i) => buildContribution(i.certification, i.risks, i.scores),
  }),
];

export const intelligenceLayerAgents: readonly AgentDefinition<never, unknown>[] = [
  ...knowledgeGraphAgents, ...riskCorrelationAgents, ...businessContextAgents, ...attackSurfaceAgents,
  ...developerAgents, ...predictiveAgents, ...certificationAgents, ...executiveAgents, ...contributionAgents,
];
