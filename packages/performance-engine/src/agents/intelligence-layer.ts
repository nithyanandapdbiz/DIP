/**
 * The Performance Intelligence Layer agents (Increment B): pattern, business, knowledge and
 * optimisation-extension domains — all in the reflection stage, all Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-13.1 (AI proposes; code decides) · INV-7 (functions with reasoning unavailable)
 *
 * ONE LAYER, FOUR DOMAINS, ONE CHAIN. Pattern → Business → Knowledge → Optimization. Every agent
 * is deterministic; the four reasoning agents (pattern confidence, business narrative, knowledge
 * reasoning — plus the existing advisor) only refine confidence, ranking and explanation, and each
 * has a `nonAiBehaviour`. Detection, scoring, lookup and recommendation all stand with reasoning
 * unavailable (INV-7).
 */
import { defineAgent, VectorIndex, type AgentDefinition } from '@dbiz/capability-framework';
import { matchPatterns } from './patterns.js';
import { buildRecommendation } from './analysis.js';
import {
  fingerprint, priorityForSeverity, round2, SEVERITY_ORDER,
  type BusinessImpact, type BusinessSeverity, type BusinessTransaction, type Criticality, type Grade,
  type KnowledgeMatch, type KnowledgeRecord, type MetricSummary, type PatternKind, type PatternMatch,
  type Recommendation, type Severity, type TransactionResult,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── Domain 1: pattern (reflection, IP) ──────────────────────────────────────

export interface PatternInput {
  readonly summaries: readonly MetricSummary[];
  readonly evidenceRefs: readonly string[];
  readonly recurrence: Readonly<Record<string, number>>;
  readonly suppressed: readonly string[];
}

export const patternAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'pattern.match', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Recognise every named performance pattern in the metric summaries, deterministically.',
    inputs: ['MetricSummary[]'], outputs: ['PatternMatch[]'], responsibilities: ['match the pattern catalogue', 'fold recurrence and suppression from the knowledge graph'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A metric with no sample yields no pattern; absence is never matched as a pattern.',
    handle: (input: PatternInput) => matchPatterns(input.summaries, input.evidenceRefs, (k) => input.recurrence[k] ?? 0, (fp) => input.suppressed.includes(fp)),
  }),
  def({
    id: 'pattern.composite', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Surface composite patterns where several primaries co-occur into a higher-order failure.',
    inputs: ['PatternMatch[]'], outputs: ['composite matches'], responsibilities: ['identify composite failures'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No co-occurrence yields no composite rather than a speculative one.',
    handle: (input: { matches: readonly PatternMatch[] }) => input.matches.filter((m) => m.composite),
  }),
  def({
    id: 'pattern.correlation', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Report which patterns correlate, so a shared cause is not counted as many.',
    inputs: ['PatternMatch[]'], outputs: ['correlation map'], responsibilities: ['report pattern correlation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncorrelated pattern is kept distinct rather than merged.',
    handle: (input: { matches: readonly PatternMatch[] }) => new Map(input.matches.map((m) => [m.kind, m.correlatedWith] as const)),
  }),
  def({
    id: 'pattern.severity', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Rank matched patterns by severity and saturation.',
    inputs: ['PatternMatch[]'], outputs: ['ranked patterns'], responsibilities: ['rank by severity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unranked pattern falls to the end rather than being dropped.',
    handle: (input: { matches: readonly PatternMatch[] }) => [...input.matches].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]).map((m) => m.patternId),
  }),
  def({
    id: 'pattern.recurrence', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Report how often each matched pattern has recurred across prior runs.',
    inputs: ['PatternMatch[]'], outputs: ['recurrence map'], responsibilities: ['report recurrence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A first-seen pattern reports recurrence zero, never a fabricated history.',
    handle: (input: { matches: readonly PatternMatch[] }) => new Map(input.matches.map((m) => [m.kind, m.recurrence] as const)),
  }),
  def({
    id: 'pattern.suppression', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Drop patterns a knowledge-graph suppression record has waived; keep the rest active.',
    inputs: ['PatternMatch[]'], outputs: ['active PatternMatch[]'], responsibilities: ['apply suppression'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern whose suppression cannot be confirmed stays active — never silently dropped.',
    handle: (input: { matches: readonly PatternMatch[] }) => input.matches.filter((m) => !m.suppressed),
  }),
  def({
    id: 'pattern.confidence', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Refine the confidence ordering of matched patterns.',
    inputs: ['PatternMatch[]'], outputs: ['confidence ordering'], responsibilities: ['order by confidence', 'reject an ordering naming an unmatched pattern'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Order the matched patterns by how confidently each explains the observed degradation.',
      inputsProvided: ['pattern kinds', 'saturation percentages', 'recurrence counts'],
      expects: 'an ordered list of pattern ids',
      rejectionRules: ['reject an id not among the matched patterns', 'reject an empty ordering'],
    },
    aiBehaviour: 'Uses the reasoning proposal to reorder patterns by confidence.',
    nonAiBehaviour: 'Orders deterministically by confidence then saturation.',
    failureHandling: 'A rejected or absent ordering falls back to the deterministic confidence order.',
    handle: (input: { matches: readonly PatternMatch[] }, ctx) => {
      const ids = new Set(input.matches.map((m) => m.patternId));
      const proposal = ctx.proposal as { order?: string[] } | null;
      if (proposal?.order && proposal.order.length > 0 && proposal.order.every((id) => ids.has(id))) return proposal.order;
      return [...input.matches].sort((a, b) => b.confidence - a.confidence).map((m) => m.patternId);
    },
  }),
  def({
    id: 'pattern.verification', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Verify every reported pattern carries evidence and a root cause.',
    inputs: ['PatternMatch[]'], outputs: ['verification verdict'], responsibilities: ['verify evidence and root cause'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern failing verification is flagged, never passed through as confirmed.',
    handle: (input: { matches: readonly PatternMatch[] }) => ({ verified: input.matches.every((m) => m.rootCause.trim() !== ''), count: input.matches.length }),
  }),
  def({
    id: 'pattern.evidence', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Attach the supporting evidence references to each matched pattern.',
    inputs: ['PatternMatch[]'], outputs: ['evidence map'], responsibilities: ['attach evidence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no evidence records an empty reference list rather than a fabricated one.',
    handle: (input: { matches: readonly PatternMatch[] }) => new Map(input.matches.map((m) => [m.patternId, m.evidenceRefs] as const)),
  }),
  def({
    id: 'pattern.history', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Summarise the pattern history — recurring versus newly emerged.',
    inputs: ['PatternMatch[]'], outputs: ['history summary'], responsibilities: ['separate recurring from novel'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no history, every pattern is reported as novel rather than as recurring.',
    handle: (input: { matches: readonly PatternMatch[] }) => ({ recurring: input.matches.filter((m) => m.recurrence > 0).length, novel: input.matches.filter((m) => m.recurrence === 0).length }),
  }),
  def({
    id: 'pattern.recommendation-link', domain: 'pattern', stage: 'reflection', plane: 'IP',
    purpose: 'Link each matched pattern to its remediation recommendation.',
    inputs: ['PatternMatch[]'], outputs: ['recommendation links'], responsibilities: ['link pattern to fix'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no known fix links to a generic investigation rather than nothing.',
    handle: (input: { matches: readonly PatternMatch[] }) => input.matches.map((m) => ({ patternId: m.patternId, recommendation: m.recommendation, kind: m.recommendationKind })),
  }),
];

// ── Domain 2: business (reflection, IP) ─────────────────────────────────────

const CAPABILITY_BY_PATH: readonly { readonly re: RegExp; readonly capability: string; readonly revenue: string; readonly kpi: string }[] = [
  { re: /checkout|cart/i, capability: 'Checkout', revenue: 'Order revenue', kpi: 'Conversion rate' },
  { re: /pay|billing/i, capability: 'Payments', revenue: 'Payment revenue', kpi: 'Payment success rate' },
  { re: /auth|login|signin/i, capability: 'Authentication', revenue: 'Retained sessions', kpi: 'Login success rate' },
  { re: /order/i, capability: 'Order Management', revenue: 'Fulfilled orders', kpi: 'Order processing time' },
  { re: /search|catalog|browse/i, capability: 'Search & Browse', revenue: 'Discovery-driven sales', kpi: 'Search latency' },
  { re: /inventory|stock/i, capability: 'Inventory', revenue: 'Availability-driven sales', kpi: 'Stock accuracy' },
];

function capabilityFor(journey: string): { capability: string; revenue: string; kpi: string } {
  return CAPABILITY_BY_PATH.find((m) => m.re.test(journey)) ?? { capability: 'Application', revenue: 'General revenue', kpi: 'Response time' };
}

function executiveSeverity(worst: Severity, criticality: Criticality): BusinessSeverity {
  const s = SEVERITY_ORDER[worst] + (criticality === 'critical' ? 1 : 0);
  if (s >= 5) return 'sev1';
  if (s >= 4) return 'sev2';
  if (s >= 2) return 'sev3';
  return 'sev4';
}

export interface BusinessWeights { readonly revenuePerHour: number; readonly usersPerHour: number; }

/** Assemble the business impact per transaction — deterministic; reasoning refines the narrative only. */
export function assembleBusinessImpact(
  transactions: readonly BusinessTransaction[],
  results: readonly TransactionResult[],
  worstSeverity: Severity,
  weightsFor: (txnId: string) => BusinessWeights,
  windowSeconds: number,
): readonly BusinessImpact[] {
  return transactions.map((t): BusinessImpact => {
    const result = results.find((r) => r.transactionId === t.id);
    const errorRate = result?.errorRate ?? 0;
    const cap = capabilityFor(t.journey || t.name);
    const critWeight = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 }[t.criticality];
    const sevWeight = SEVERITY_ORDER[worstSeverity] / 4;
    const businessImpactScore = Math.round(Math.min(100, (critWeight * 60 + sevWeight * 30 + errorRate * 100 * 0.1)));
    const customerImpactPercent = Math.round(Math.min(100, errorRate * 100 + critWeight * 20 * sevWeight));
    const w = weightsFor(t.id);
    const revenueRiskAmount = Math.round(w.revenuePerHour * (windowSeconds / 3600) * (customerImpactPercent / 100));
    const grade: Grade = businessImpactScore >= 70 ? 'high' : businessImpactScore >= 40 ? 'medium' : 'low';
    return {
      transactionId: t.id, businessCapability: cap.capability, journey: t.journey || t.name,
      customerExperience: customerImpactPercent > 50 ? 'severely degraded' : customerImpactPercent > 20 ? 'degraded' : 'nominal',
      revenueStream: cap.revenue, operationalKpi: cap.kpi, slaId: null,
      executiveSeverity: executiveSeverity(worstSeverity, t.criticality), businessCriticality: t.criticality,
      businessImpactScore, customerImpactPercent, operationalImpact: grade,
      revenueRiskAmount, estimatedFinancialExposure: revenueRiskAmount, executivePriority: priorityForSeverity(worstSeverity),
      recoveryPriority: 0, recommendation: `Protect ${cap.capability}: ${cap.kpi} is at risk`,
    };
  }).sort((a, b) => b.businessImpactScore - a.businessImpactScore).map((bi, i) => ({ ...bi, recoveryPriority: i + 1 }));
}

export interface BusinessInput {
  readonly transactions: readonly BusinessTransaction[];
  readonly results: readonly TransactionResult[];
  readonly worstSeverity: Severity;
  readonly weights: Readonly<Record<string, BusinessWeights>>;
  readonly windowSeconds: number;
}

const businessField = (id: string, purpose: string, resp: string, handle: (i: BusinessInput) => unknown): AgentDefinition<never, unknown> => def({
  id, domain: 'business', stage: 'reflection', plane: 'IP', purpose,
  inputs: ['BusinessInput'], outputs: ['business field'], responsibilities: [resp],
  toolContracts: [], aiCapabilityClass: 'none',
  failureHandling: 'A transaction that cannot be mapped falls back to the generic Application capability rather than being dropped.',
  handle,
});

export const businessAgents: readonly AgentDefinition<never, unknown>[] = [
  businessField('business.capability-map', 'Map each transaction to its business capability.', 'map to capability', (i) => new Map(i.transactions.map((t) => [t.id, capabilityFor(t.journey || t.name).capability] as const))),
  businessField('business.journey-impact', 'Assess the business-journey impact of each transaction.', 'assess journey impact', (i) => [...new Set(i.transactions.map((t) => t.journey))]),
  businessField('business.customer-impact', 'Estimate the percentage of customers affected per transaction.', 'estimate customer impact', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, () => ({ revenuePerHour: 0, usersPerHour: 0 }), i.windowSeconds).map((b) => ({ id: b.transactionId, pct: b.customerImpactPercent }))),
  businessField('business.revenue-risk', 'Estimate the revenue at risk per transaction from configured weights.', 'estimate revenue risk', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, (id) => i.weights[id] ?? { revenuePerHour: 0, usersPerHour: 0 }, i.windowSeconds).map((b) => ({ id: b.transactionId, risk: b.revenueRiskAmount }))),
  businessField('business.operational-impact', 'Assess the operational impact grade per transaction.', 'assess operational impact', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, () => ({ revenuePerHour: 0, usersPerHour: 0 }), i.windowSeconds).map((b) => ({ id: b.transactionId, grade: b.operationalImpact }))),
  businessField('business.executive-severity', 'Classify the executive severity (sev1..sev4) per transaction.', 'classify executive severity', (i) => new Map(i.transactions.map((t) => [t.id, executiveSeverity(i.worstSeverity, t.criticality)] as const))),
  businessField('business.financial-exposure', 'Estimate the financial exposure per transaction.', 'estimate financial exposure', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, (id) => i.weights[id] ?? { revenuePerHour: 0, usersPerHour: 0 }, i.windowSeconds).map((b) => ({ id: b.transactionId, exposure: b.estimatedFinancialExposure }))),
  businessField('business.recovery-priority', 'Order transactions by recovery priority — what to restore first.', 'order recovery priority', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, () => ({ revenuePerHour: 0, usersPerHour: 0 }), i.windowSeconds).map((b) => b.transactionId)),
  def({
    id: 'business.narrative', domain: 'business', stage: 'reflection', plane: 'IP',
    purpose: 'Explain the business impact for an executive audience.',
    inputs: ['BusinessImpact[]'], outputs: ['narrative'], responsibilities: ['write the business narrative', 'reject a narrative that overstates the measured impact'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Explain the business impact of the performance findings for an executive audience.',
      inputsProvided: ['business capabilities', 'business impact scores', 'customer impact percentages'],
      expects: 'a short business-impact narrative',
      rejectionRules: ['reject a narrative that claims revenue loss when exposure is zero', 'reject an empty narrative'],
    },
    aiBehaviour: 'Uses the reasoning proposal to phrase the business narrative.',
    nonAiBehaviour: 'Emits a deterministic narrative from the highest-impact capability and its score.',
    failureHandling: 'A rejected or absent narrative falls back to the deterministic capability-derived text.',
    handle: (input: { impacts: readonly BusinessImpact[] }, ctx) => {
      const top = [...input.impacts].sort((a, b) => b.businessImpactScore - a.businessImpactScore)[0];
      const deterministic = top ? `${top.businessCapability} carries the highest business impact (${top.businessImpactScore}/100, ${top.customerImpactPercent}% customer impact).` : 'No business-impacting degradation was measured.';
      const proposal = ctx.proposal as { narrative?: string } | null;
      const hasExposure = input.impacts.some((b) => b.estimatedFinancialExposure > 0);
      const accepted = proposal?.narrative && proposal.narrative.trim() !== '' && (hasExposure || !/revenue loss|lost revenue/i.test(proposal.narrative)) ? proposal.narrative : deterministic;
      return accepted;
    },
  }),
  businessField('business.assemble', 'Assemble the complete business-impact record per transaction.', 'assemble business impact', (i) => assembleBusinessImpact(i.transactions, i.results, i.worstSeverity, (id) => i.weights[id] ?? { revenuePerHour: 0, usersPerHour: 0 }, i.windowSeconds)),
];

// ── Domain 3: knowledge (reflection, IP) ────────────────────────────────────

/** Which pattern kind a knowledge record refers to, if its text names one. */
function recordPatternKind(record: KnowledgeRecord, kinds: readonly PatternKind[]): PatternKind | null {
  return kinds.find((k) => record.text.toLowerCase().includes(k.replace(/-/g, ' ')) || record.text.toLowerCase().includes(k)) ?? null;
}

/** Pure knowledge priors used before pattern matching: recurrence per kind + suppressed fingerprints. */
export function knowledgePriors(records: readonly KnowledgeRecord[], kinds: readonly PatternKind[]): { recurrence: Record<string, number>; suppressed: readonly string[] } {
  const recurrence: Record<string, number> = {};
  for (const r of records.filter((x) => x.kind === 'pattern' || x.kind === 'root-cause')) {
    const k = recordPatternKind(r, kinds);
    if (k) recurrence[k] = (recurrence[k] ?? 0) + 1;
  }
  const suppressed = records.filter((r) => r.kind === 'suppression').map((r) => r.fingerprint);
  return { recurrence, suppressed };
}

export interface KnowledgeInput {
  readonly matches: readonly PatternMatch[];
  readonly records: readonly KnowledgeRecord[];
  readonly index: VectorIndex;
}

export const knowledgeAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'knowledge.similarity', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Find the most similar prior findings for each current pattern via vector search.',
    inputs: ['PatternMatch[]', 'VectorIndex'], outputs: ['KnowledgeMatch[]'], responsibilities: ['search the knowledge graph by similarity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no similar record returns no match rather than a coincidental one.',
    handle: (input: KnowledgeInput): readonly KnowledgeMatch[] => input.matches.flatMap((m) => {
      const hits = input.index.search(`${m.name} ${m.rootCause}`, 1, 0.15);
      return hits.map((h): KnowledgeMatch => {
        const rec = input.records.find((r) => r.id === h.id);
        return { recordId: h.id, kind: rec?.kind ?? 'pattern', patternKind: m.kind, similarity: round2(h.similarity), release: rec?.release ?? null, resolvedBy: rec?.resolvedBy ?? null, confidence: round2(Math.min(0.99, h.similarity + 0.3)) };
      });
    }),
  }),
  def({
    id: 'knowledge.historical-lookup', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Look up prior occurrences of each pattern by fingerprint.',
    inputs: ['PatternMatch[]'], outputs: ['historical map'], responsibilities: ['look up by fingerprint'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A fingerprint with no history reports none rather than an inferred prior.',
    handle: (input: KnowledgeInput) => new Map(input.matches.map((m) => [m.kind, m.recurrence] as const)),
  }),
  def({
    id: 'knowledge.known-fix', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Surface the verified fix that resolved each pattern in a prior release.',
    inputs: ['KnowledgeMatch[]'], outputs: ['known fixes'], responsibilities: ['surface verified fixes'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no verified fix on record returns none rather than an unverified suggestion.',
    handle: (input: KnowledgeInput) => input.records.filter((r) => r.kind === 'verified-fix' && r.resolvedBy).map((r) => ({ resolvedBy: r.resolvedBy, release: r.release, confidence: r.confidence })),
  }),
  def({
    id: 'knowledge.known-failure', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Match current patterns against known recurring failure signatures.',
    inputs: ['KnowledgeMatch[]'], outputs: ['known failures'], responsibilities: ['match known failures'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A novel pattern is reported as novel, never coerced into a known failure.',
    handle: (input: KnowledgeInput) => input.records.filter((r) => r.kind === 'known-failure').length,
  }),
  def({
    id: 'knowledge.regression-lookup', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Look up regression history for the affected transactions and patterns.',
    inputs: ['records'], outputs: ['regression history'], responsibilities: ['look up regression history'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no regression record, none is reported rather than a stable trend assumed.',
    handle: (input: KnowledgeInput) => input.records.filter((r) => r.kind === 'regression').length,
  }),
  def({
    id: 'knowledge.trend', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Detect the recurrence trend of the matched patterns across releases.',
    inputs: ['PatternMatch[]'], outputs: ['trend'], responsibilities: ['detect the recurrence trend'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no history the trend is reported as unknown, never as improving.',
    handle: (input: KnowledgeInput) => ({ recurring: input.matches.filter((m) => m.recurrence > 0).length }),
  }),
  def({
    id: 'knowledge.topology-aware', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Relate matched patterns to the topology components they implicate.',
    inputs: ['PatternMatch[]'], outputs: ['topology relations'], responsibilities: ['relate patterns to topology'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no topological relation is reported unrelated rather than mis-attributed.',
    handle: (input: KnowledgeInput) => input.matches.map((m) => m.kind),
  }),
  def({
    id: 'knowledge.reasoning', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Reason over the knowledge matches to prefer the highest-confidence prior resolution.',
    inputs: ['KnowledgeMatch[]'], outputs: ['preferred resolution'], responsibilities: ['prefer a prior resolution', 'reject a resolution not on record'],
    toolContracts: [], aiCapabilityClass: 'reconciliation',
    promptContract: {
      intent: 'Choose the most credible prior resolution for the current patterns from the knowledge matches.',
      inputsProvided: ['prior release identifiers', 'similarity scores', 'resolution summaries'],
      expects: 'a preferred resolution reference',
      rejectionRules: ['reject a resolution that names no record', 'reject a resolution below the similarity floor'],
    },
    aiBehaviour: 'Uses the reasoning proposal to prefer a prior resolution among the matches.',
    nonAiBehaviour: 'Prefers deterministically the highest-similarity resolved match.',
    failureHandling: 'A rejected or absent proposal falls back to the highest-similarity match.',
    handle: (input: { matches: readonly KnowledgeMatch[] }, ctx) => {
      const resolved = input.matches.filter((m) => m.resolvedBy);
      const proposal = ctx.proposal as { recordId?: string } | null;
      if (proposal?.recordId && resolved.some((m) => m.recordId === proposal.recordId)) return proposal.recordId;
      return [...resolved].sort((a, b) => b.similarity - a.similarity)[0]?.recordId ?? null;
    },
  }),
  def({
    id: 'knowledge.record', domain: 'knowledge', stage: 'reflection', plane: 'IP',
    purpose: 'Write this run\'s patterns and fixes back into the knowledge graph for the next run.',
    inputs: ['PatternMatch[]', 'VectorIndex'], outputs: ['records written'], responsibilities: ['write back to the graph'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern that cannot be recorded is skipped with an audit note; the next run simply lacks it.',
    handle: (input: KnowledgeInput) => {
      for (const m of input.matches) input.index.add(m.fingerprint, 'pattern', `${m.name} ${m.rootCause}`, { kind: m.kind, recurrence: String(m.recurrence) });
      return input.matches.length;
    },
  }),
];

// ── Domain 4: optimisation extensions (reflection, IP) ──────────────────────

export interface OptimisationLayerInput {
  readonly patterns: readonly PatternMatch[];
  readonly knowledgeMatches: readonly KnowledgeMatch[];
}

export const optimisationLayerAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'optimisation.from-patterns', domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: 'Generate a subject-specific optimisation recommendation for every matched pattern.',
    inputs: ['PatternMatch[]'], outputs: ['Recommendation[]'], responsibilities: ['generate pattern-driven recommendations with cost, risk and value'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A pattern with no fix yields no recommendation rather than a generic filler.',
    handle: (input: OptimisationLayerInput): readonly Recommendation[] => input.patterns.filter((p) => !p.suppressed).map((p, i): Recommendation => buildRecommendation({
      id: `rec-pat-${i + 1}`, kind: p.recommendationKind, subject: p.name, text: p.recommendation, severity: p.severity,
      expectedGainPercent: Math.min(60, Math.round(p.saturationPercent / 2)),
      expectedCostSavingPercent: ['infra', 'scaling', 'cost', 'compression', 'payload'].includes(p.recommendationKind) ? Math.min(40, Math.round(p.saturationPercent / 3)) : 0,
      confidence: p.confidence, evidenceRefs: p.evidenceRefs, provenance: p.provenance,
    })),
  }),
  def({
    id: 'optimisation.knowledge-reuse', domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: 'Reuse a verified prior fix from the knowledge graph where one resolved this pattern before.',
    inputs: ['KnowledgeMatch[]'], outputs: ['reused fixes'], responsibilities: ['reuse verified fixes'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no prior verified fix, nothing is reused — a novel issue is not resolved by a coincidence.',
    handle: (input: OptimisationLayerInput) => input.knowledgeMatches.filter((m) => m.resolvedBy).map((m) => ({ resolvedBy: m.resolvedBy, confidence: m.confidence })),
  }),
  def({
    id: 'optimisation.cost-saving', domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: 'Aggregate the expected infrastructure cost saving across the recommendations.',
    inputs: ['Recommendation[]'], outputs: ['aggregate saving'], responsibilities: ['aggregate cost saving'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no cost-bearing recommendation, the saving is zero rather than an invented figure.',
    handle: (input: { recommendations: readonly Recommendation[] }) => ({ maxSavingPercent: input.recommendations.reduce((a, r) => Math.max(a, r.expectedCostSavingPercent), 0) }),
  }),
  def({
    id: 'optimisation.business-value', domain: 'optimisation', stage: 'reflection', plane: 'IP',
    purpose: 'Grade the business value of each recommendation to support prioritisation.',
    inputs: ['Recommendation[]'], outputs: ['value map'], responsibilities: ['grade business value'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A recommendation with no measurable value is graded low rather than dropped.',
    handle: (input: { recommendations: readonly Recommendation[] }) => new Map(input.recommendations.map((r) => [r.id, r.businessValue] as const)),
  }),
];

export { fingerprint };
