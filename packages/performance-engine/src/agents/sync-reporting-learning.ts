/**
 * Agents for stages 11–12 plus learning: certification (11), sync + reporting (12) and
 * learning (folded into reflection).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 18-governance-model.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026 · ADR-0019 (evidence over assertion) · ADR-0025 (certification framework)
 *   Criteria     : C-13.1 · R-13.3 (NOT MEASURED is never a pass)
 *
 * CERTIFICATION IS DETERMINISTIC AND CARRIES ITS REASON. Each dimension is scored from measured
 * evidence; a dimension with no measurement reports `measured: false` and is excluded from the
 * average rather than counted as a pass (R-13.3). The verdict is PASS, CONDITIONAL PASS or FAIL,
 * and it always states why.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import type { TestManagementAdapter } from '../adapters.js';
import {
  fingerprint, thresholdHolds,
  type Bottleneck, type CapacityForecast, type CertificationDimension, type DimensionScore,
  type LearningRecord, type PerformanceCertification, type PerformanceDefect, type PerformanceReport,
  type PerformanceThreshold, type Regression, type SyncRecord, type TransactionResult, type Verdict,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── certification (stage 11, IP) ────────────────────────────────────────────

export interface CertificationInputs {
  readonly targetId: string;
  readonly results: readonly TransactionResult[];
  readonly thresholds: readonly PerformanceThreshold[];
  readonly bottlenecks: readonly Bottleneck[];
  readonly forecasts: readonly CapacityForecast[];
  readonly regressions: readonly Regression[];
}

function measuredScore(dimension: CertificationDimension, score: number, rationale: string): DimensionScore {
  return { dimension, score: Math.max(0, Math.min(100, Math.round(score))), measured: true, rationale };
}
function notMeasured(dimension: CertificationDimension, why: string): DimensionScore {
  return { dimension, score: 0, measured: false, rationale: why };
}

/** Fraction of blocking thresholds that hold, 0..1, or null when there is nothing to measure. */
export function slaCompliance(inputs: CertificationInputs): number | null {
  const blocking = inputs.thresholds.filter((t) => t.severity === 'blocking');
  if (blocking.length === 0 || inputs.results.length === 0) return null;
  let checked = 0; let held = 0;
  for (const r of inputs.results) for (const t of blocking.filter((x) => x.appliesTo === r.transactionId || x.appliesTo === 'global')) {
    const summary = r.summaries.find((s) => s.metric === 'latency' || s.metric === 'response-time' || s.metric === t.metric);
    const measured = t.metric === 'p95' ? summary?.percentiles.p95 : t.metric === 'p99' ? summary?.percentiles.p99 : t.metric === 'error.rate' ? r.errorRate * 100 : summary?.mean;
    if (measured === undefined) continue;
    checked += 1; if (thresholdHolds(t.comparator, measured, t.value)) held += 1;
  }
  return checked === 0 ? null : held / checked;
}

export function scoreDimension(dimension: CertificationDimension, inputs: CertificationInputs): DimensionScore {
  const measured = inputs.results.length > 0;
  const compliance = slaCompliance(inputs);
  const avgError = measured ? inputs.results.reduce((a, r) => a + r.errorRate, 0) / inputs.results.length : null;
  const minHeadroom = inputs.forecasts.length > 0 ? Math.min(...inputs.forecasts.map((f) => f.headroomPercent)) : null;
  const criticalBtl = inputs.bottlenecks.filter((b) => b.severity === 'critical' || b.severity === 'high').length;
  const cv = measured ? coefficientOfVariation(inputs.results) : null;
  switch (dimension) {
    case 'performance': return compliance === null ? notMeasured(dimension, 'no threshold was measured under load') : measuredScore(dimension, compliance * 100, `${Math.round(compliance * 100)}% of blocking thresholds held`);
    case 'scalability': return minHeadroom === null ? notMeasured(dimension, 'no capacity forecast was produced') : measuredScore(dimension, minHeadroom, `minimum capacity headroom ${minHeadroom}%`);
    case 'reliability': return avgError === null ? notMeasured(dimension, 'no load was executed') : measuredScore(dimension, (1 - avgError) * 100, `mean error rate ${(avgError * 100).toFixed(2)}%`);
    case 'availability': return avgError === null ? notMeasured(dimension, 'no load was executed') : measuredScore(dimension, (1 - Math.min(1, avgError * 2)) * 100, `derived from error rate under load`);
    case 'stability': return cv === null ? notMeasured(dimension, 'no latency variance could be computed') : measuredScore(dimension, (1 - Math.min(1, cv)) * 100, `latency coefficient of variation ${cv.toFixed(2)}`);
    case 'capacity': return minHeadroom === null ? notMeasured(dimension, 'no capacity forecast was produced') : measuredScore(dimension, minHeadroom, `capacity headroom ${minHeadroom}%`);
    case 'risk': return !measured ? notMeasured(dimension, 'no load was executed') : measuredScore(dimension, 100 - Math.min(100, criticalBtl * 25), `${criticalBtl} high/critical bottleneck(s)`);
    case 'business-readiness': return compliance === null ? notMeasured(dimension, 'no threshold was measured') : measuredScore(dimension, compliance * 100 - criticalBtl * 10, `SLA compliance net of ${criticalBtl} serious bottleneck(s)`);
    case 'production-readiness': return compliance === null ? notMeasured(dimension, 'no threshold was measured') : measuredScore(dimension, (compliance * 100) - criticalBtl * 15 - (inputs.regressions.filter((x) => x.direction === 'regressed' && x.significant).length) * 10, 'compliance net of bottlenecks and significant regressions');
    default: return notMeasured(dimension, 'unknown dimension');
  }
}

function coefficientOfVariation(results: readonly TransactionResult[]): number | null {
  const cvs: number[] = [];
  for (const r of results) for (const s of r.summaries) if ((s.metric === 'latency' || s.metric === 'response-time') && s.mean > 0) cvs.push(s.stdDev / s.mean);
  return cvs.length === 0 ? null : cvs.reduce((a, x) => a + x, 0) / cvs.length;
}

export function assembleCertification(targetId: string, scores: readonly DimensionScore[], blockingBreaches: readonly string[]): PerformanceCertification {
  const measured = scores.filter((s) => s.measured);
  const overall = measured.length === 0 ? 0 : Math.round(measured.reduce((a, s) => a + s.score, 0) / measured.length);
  let verdict: Verdict;
  let rationale: string;
  if (measured.length === 0) { verdict = 'FAIL'; rationale = 'no dimension was measured; NOT MEASURED is never a pass (R-13.3)'; }
  else if (blockingBreaches.length > 0) { verdict = 'FAIL'; rationale = `${blockingBreaches.length} blocking threshold breach(es): ${blockingBreaches.slice(0, 3).join('; ')}`; }
  else if (overall >= 80) { verdict = 'PASS'; rationale = `overall ${overall}/100 with no blocking breach`; }
  else if (overall >= 60) { verdict = 'CONDITIONAL PASS'; rationale = `overall ${overall}/100; below the 80 pass bar but no blocking breach`; }
  else { verdict = 'FAIL'; rationale = `overall ${overall}/100 is below the conditional-pass bar of 60`; }
  return { targetId, scores, overallScore: overall, verdict, rationale, blockingBreaches };
}

export const certificationAgents: readonly AgentDefinition<never, unknown>[] = (
  ['performance', 'scalability', 'reliability', 'availability', 'stability', 'capacity', 'risk', 'business-readiness', 'production-readiness'] as const
).map((dimension) => def({
  id: `certification.${dimension}`, domain: 'certification', stage: 'certification', plane: 'IP',
  purpose: `Score the ${dimension} certification dimension from measured evidence only.`,
  inputs: ['CertificationInputs'], outputs: ['DimensionScore'], responsibilities: [`score ${dimension}`, 'report NOT MEASURED where there is no evidence'],
  toolContracts: [], aiCapabilityClass: 'none',
  failureHandling: 'A dimension with no measurable evidence reports NOT MEASURED, which is never scored as a pass.',
  handle: (input: { inputs: CertificationInputs }) => scoreDimension(dimension, input.inputs),
}));

// ── sync (stage 12, reporting, IP) — the Functional Testing Engine lifecycle ─

export interface SyncContext {
  readonly adapter: TestManagementAdapter;
  readonly targetId: string;
  readonly results: readonly TransactionResult[];
  readonly defects: readonly PerformanceDefect[];
  readonly verdict: Verdict;
  readonly evidenceRefs: readonly { sha256: string; locator: string; kind: string }[];
}

export const syncAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'sync.container', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Create the test-management container for this performance run through the adapter.',
    inputs: ['SyncContext'], outputs: ['SyncRecord[]'], responsibilities: ['create the container'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A container that cannot be created is recorded as a refused sync with its reason, never skipped silently.',
    handle: (input: { ctx: SyncContext }): readonly SyncRecord[] => {
      const c = input.ctx.adapter.createContainer(`Performance run · ${input.ctx.targetId}`);
      return [{ target: 'container', published: true, reason: `created ${c.noun}`, externalId: c.containerId }];
    },
  }),
  def({
    id: 'sync.results', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish each transaction result and its verdict through the adapter.',
    inputs: ['SyncContext'], outputs: ['SyncRecord[]'], responsibilities: ['publish results'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A result that cannot be published is recorded as refused with a reason.',
    handle: (input: { ctx: SyncContext }): readonly SyncRecord[] =>
      input.ctx.results.map((r): SyncRecord => {
        input.ctx.adapter.publishResult({ transactionId: r.transactionId, verdict: input.ctx.verdict, summary: `${r.transactionsPerSecond} TPS, ${(r.errorRate * 100).toFixed(2)}% errors` });
        return { target: 'result', published: true, reason: `${r.transactionId} published`, externalId: null };
      }),
  }),
  def({
    id: 'sync.defects', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish each performance defect as an enterprise-grade bug through the adapter.',
    inputs: ['SyncContext'], outputs: ['SyncRecord[]'], responsibilities: ['publish defects'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A defect that cannot be published is recorded as refused with a reason rather than lost.',
    handle: (input: { ctx: SyncContext }): readonly SyncRecord[] =>
      input.ctx.defects.map((d): SyncRecord => {
        const r = input.ctx.adapter.publishDefect({ title: d.title, severity: d.severity, priority: d.priority, transactionId: d.transactionId, evidenceRefs: d.evidenceRefs });
        return { target: 'defect', published: true, reason: `${d.title} published`, externalId: r.defectId };
      }),
  }),
  def({
    id: 'sync.evidence', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish evidence references — hash and locator only — through the adapter.',
    inputs: ['SyncContext'], outputs: ['SyncRecord[]'], responsibilities: ['publish evidence by reference'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An evidence reference with no hash is refused; a reference that proves nothing is not published.',
    handle: (input: { ctx: SyncContext }): readonly SyncRecord[] =>
      input.ctx.evidenceRefs.filter((e) => e.sha256.trim() !== '').map((e): SyncRecord => {
        input.ctx.adapter.publishEvidenceReference(input.ctx.targetId, e);
        return { target: 'evidence', published: true, reason: `${e.kind}@${e.sha256} referenced`, externalId: null };
      }),
  }),
  def({
    id: 'sync.traceability', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Link each published defect back to its transaction for business traceability.',
    inputs: ['SyncContext'], outputs: ['SyncRecord[]'], responsibilities: ['link traceability'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A defect that cannot be linked is recorded as a refused link with its reason.',
    handle: (input: { ctx: SyncContext }): readonly SyncRecord[] =>
      input.ctx.defects.map((d): SyncRecord => {
        input.ctx.adapter.linkTraceability(d.id, d.transactionId);
        return { target: 'traceability', published: true, reason: `${d.id}->${d.transactionId}`, externalId: null };
      }),
  }),
];

// ── reporting (stage 12, reporting, IP) ─────────────────────────────────────

export const reportingAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'reporting.executive-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Write the executive summary of the performance certification for a business audience.',
    inputs: ['PerformanceReport'], outputs: ['summary'], responsibilities: ['write the executive summary', 'reject a claim not supported by the verdict'],
    toolContracts: [], aiCapabilityClass: 'summarisation',
    promptContract: {
      intent: 'Summarise the performance certification outcome for an executive audience.',
      inputsProvided: ['overall score', 'verdict', 'top bottleneck kinds', 'defect count'],
      expects: 'a short executive summary',
      rejectionRules: ['reject a summary that claims READY when the verdict is FAIL', 'reject an empty summary'],
    },
    aiBehaviour: 'Uses the reasoning proposal to phrase the executive summary.',
    nonAiBehaviour: 'Emits a deterministic summary built from the verdict, overall score and defect count.',
    failureHandling: 'A rejected or absent summary falls back to the deterministic verdict-derived text.',
    handle: (input: { report: Pick<PerformanceReport, 'verdict' | 'overallScore' | 'defectCount'> }, ctx) => {
      const deterministic = `Verdict ${input.report.verdict} at ${input.report.overallScore}/100 with ${input.report.defectCount} defect(s) raised.`;
      const proposal = ctx.proposal as { summary?: string } | null;
      const accepted = proposal?.summary && proposal.summary.trim() !== '' && !(input.report.verdict === 'FAIL' && /ready/i.test(proposal.summary)) ? proposal.summary : deterministic;
      return accepted;
    },
  }),
  def({
    id: 'reporting.dimension-scores', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the certification dimension scores, marking unmeasured dimensions as such.',
    inputs: ['DimensionScore[]'], outputs: ['rendered scores'], responsibilities: ['render scores without inventing a measurement'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unmeasured dimension renders NOT MEASURED, never a zero that reads as measured.',
    handle: (input: { scores: readonly DimensionScore[] }) => input.scores.map((s) => ({ dimension: s.dimension, value: s.measured ? `${s.score}/100` : 'NOT MEASURED' })),
  }),
  def({
    id: 'reporting.sla-compliance', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the SLA/SLO compliance figure for the run.',
    inputs: ['compliance'], outputs: ['compliance figure'], responsibilities: ['render compliance'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With nothing measured, compliance renders NOT MEASURED rather than 100%.',
    handle: (input: { compliance: number | null }) => ({ compliance: input.compliance }),
  }),
  def({
    id: 'reporting.bottleneck-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise the top bottlenecks by severity for the engineering report.',
    inputs: ['Bottleneck[]'], outputs: ['bottleneck summary'], responsibilities: ['summarise bottlenecks'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No bottleneck yields an empty summary rather than a fabricated clean bill of health.',
    handle: (input: { bottlenecks: readonly Bottleneck[] }) => input.bottlenecks.slice(0, 20).map((b) => ({ kind: b.kind, component: b.component, severity: b.severity })),
  }),
  def({
    id: 'reporting.capacity-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise the capacity forecast and headroom for the capacity report.',
    inputs: ['CapacityForecast[]'], outputs: ['capacity summary'], responsibilities: ['summarise capacity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no forecast, headroom renders NOT MEASURED rather than as full capacity.',
    handle: (input: { forecasts: readonly CapacityForecast[] }) => ({ headroomPercent: input.forecasts.length === 0 ? null : Math.min(...input.forecasts.map((f) => f.headroomPercent)) }),
  }),
  def({
    id: 'reporting.regression-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise the regressions against baseline for the release-comparison report.',
    inputs: ['Regression[]'], outputs: ['regression summary'], responsibilities: ['summarise regressions'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no baseline, regressions render as not-measured rather than as none.',
    handle: (input: { regressions: readonly Regression[] }) => ({
      count: input.regressions.filter((r) => r.direction === 'regressed').length,
      worst: input.regressions.length === 0 ? null : Math.max(...input.regressions.map((r) => r.deltaPercent)),
    }),
  }),
  def({
    id: 'reporting.executive-pdf', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the executive PDF from the assembled report.',
    inputs: ['PerformanceReport', 'renderer'], outputs: ['pdf stats'], responsibilities: ['render a real PDF'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A PDF that renders below a valid document size fails the reporting review rather than shipping.',
    handle: (input: { report: PerformanceReport; render: (r: PerformanceReport) => { bytes: number; pages: number } }) => input.render(input.report),
  }),
  def({
    id: 'reporting.board-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the board report, marking unmeasured figures as unmeasured rather than zero.',
    inputs: ['PerformanceReport', 'renderer'], outputs: ['board report'], responsibilities: ['render the board report'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A board figure with no measurement is rendered NOT MEASURED, never as a zero.',
    handle: (input: { report: PerformanceReport; board: (r: PerformanceReport) => unknown }) => input.board(input.report),
  }),
];

// ── learning (reflection, IP) ───────────────────────────────────────────────

export interface LearningInputs {
  readonly targetId: string;
  readonly results: readonly TransactionResult[];
  readonly bottlenecks: readonly Bottleneck[];
  readonly regressions: readonly Regression[];
  readonly forecasts: readonly CapacityForecast[];
  readonly promptsDelivered: readonly string[];
  readonly promptsWithheld: readonly string[];
}

export const learningAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'learning.baseline', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Record the measured p95 of each transaction as the baseline for the next run.',
    inputs: ['LearningInputs'], outputs: ['LearningRecord[]'], responsibilities: ['record baselines'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no measurement records no baseline rather than a zero one.',
    handle: (input: { inputs: LearningInputs }): readonly LearningRecord[] =>
      input.inputs.results.map((r) => {
        const p95 = r.summaries.find((s) => s.metric === 'latency' || s.metric === 'response-time')?.percentiles.p95 ?? 0;
        return { kind: 'baseline' as const, key: r.transactionId, text: `p95=${p95}ms`, fingerprint: fingerprint(input.inputs.targetId, r.transactionId, String(p95)) };
      }).filter((rec) => rec.text !== 'p95=0ms'),
  }),
  def({
    id: 'learning.signature', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Record the performance signature of this run for fingerprint-based comparison.',
    inputs: ['LearningInputs'], outputs: ['LearningRecord[]'], responsibilities: ['record the performance signature'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A run with no result records no signature rather than an empty one.',
    handle: (input: { inputs: LearningInputs }): readonly LearningRecord[] =>
      input.inputs.results.length === 0 ? [] : [{ kind: 'performance-signature', key: input.inputs.targetId, text: `${input.inputs.results.length} transaction(s)`, fingerprint: fingerprint(input.inputs.targetId, ...input.inputs.results.map((r) => r.transactionId)) }],
  }),
  def({
    id: 'learning.known-bottleneck', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Record each detected bottleneck so a recurrence is recognised next time.',
    inputs: ['LearningInputs'], outputs: ['LearningRecord[]'], responsibilities: ['record known bottlenecks'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No bottleneck records nothing rather than a synthetic clean signature.',
    handle: (input: { inputs: LearningInputs }): readonly LearningRecord[] =>
      input.inputs.bottlenecks.map((b) => ({ kind: 'known-bottleneck' as const, key: b.kind, text: `${b.component} at ${b.saturationPercent}%`, fingerprint: fingerprint(b.kind, b.component) })),
  }),
  def({
    id: 'learning.regression-history', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Record the regressions so the regression trend can be tracked across runs.',
    inputs: ['LearningInputs'], outputs: ['LearningRecord[]'], responsibilities: ['record regression history'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No baseline records no regression history rather than a false stable trend.',
    handle: (input: { inputs: LearningInputs }): readonly LearningRecord[] =>
      input.inputs.regressions.filter((r) => r.significant).map((r) => ({ kind: 'regression-history' as const, key: r.transactionId, text: `${r.deltaPercent}% ${r.direction}`, fingerprint: fingerprint(r.transactionId, r.direction) })),
  }),
  def({
    id: 'learning.capacity-growth', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Record the capacity headroom so growth can be tracked and forecast improved.',
    inputs: ['LearningInputs'], outputs: ['LearningRecord[]'], responsibilities: ['record capacity growth'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No forecast records no capacity growth rather than an invented headroom.',
    handle: (input: { inputs: LearningInputs }): readonly LearningRecord[] =>
      input.inputs.forecasts.length === 0 ? [] : [{ kind: 'capacity-growth', key: input.inputs.targetId, text: `min headroom ${Math.min(...input.inputs.forecasts.map((f) => f.headroomPercent))}%`, fingerprint: fingerprint(input.inputs.targetId, 'headroom') }],
  }),
];
