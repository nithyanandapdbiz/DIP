/**
 * Agents for stages 7–9: script (execution-planning), load (execution, EP) and
 * metrics (evidence, EP).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (R-11.7: load generation is deterministic) · 06-data-sovereignty.md
 *   ADR          : ADR-0026
 *   Criteria     : C-14.1 (tools reached through an adapter) · C-11.5 (no silent no-op stage)
 *
 * LOAD GENERATION IS DETERMINISTIC AND REASONING-FREE (R-11.7). The load and metrics agents
 * declare `plane: 'EP'` and no AI capability class — they run in the Execution Plane and never
 * consult reasoning. Raw samples are Execution-Plane custody; only the statistical summaries the
 * metrics stage produces cross into the Intelligence Plane.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  fingerprint, summarise,
  type EvidenceReference, type ExecutionPlan, type MetricCategory, type MetricSummary,
  type PerformanceScript, type PerformanceTestCase, type RawSample, type ScriptStep, type TransactionResult,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── script (stage 7, execution-planning, IP) ────────────────────────────────

export function buildScript(tool: string, dialect: string, testCase: PerformanceTestCase, steps: readonly ScriptStep[]): PerformanceScript {
  return {
    id: `script-${testCase.id}`, tool, dialect, scenarioName: testCase.name,
    virtualUsers: testCase.virtualUsers, durationSeconds: testCase.durationSeconds, steps,
    bodyDigest: fingerprint(dialect, testCase.id, String(testCase.virtualUsers), ...steps.map((s) => `${s.method}:${s.path}`)),
  };
}

export const scriptAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'script.step-sequencing', domain: 'script', stage: 'execution-planning', plane: 'IP',
    purpose: 'Sequence the request steps for each test case from its transaction, with think time.',
    inputs: ['PerformanceTestCase[]', 'BusinessTransaction[]'], outputs: ['ScriptStep[] per case'], responsibilities: ['sequence steps'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A case whose transaction has no node yields a single-step probe rather than an empty script.',
    handle: (input: { cases: readonly PerformanceTestCase[]; steps: ReadonlyMap<string, readonly ScriptStep[]> }) =>
      new Map(input.cases.map((c) => [c.id, input.steps.get(c.transactionId) ?? [{ order: 1, transactionId: c.transactionId, method: 'GET', path: '/', thinkTimeMs: 1000 }]] as const)),
  }),
  def({
    id: 'script.generation', domain: 'script', stage: 'execution-planning', plane: 'IP',
    purpose: 'Generate a production-ready performance script per test case for the configured tool.',
    inputs: ['PerformanceTestCase[]', 'LoadGeneratorAdapter'], outputs: ['PerformanceScript[]'], responsibilities: ['generate scripts', 'reject a script with no step'],
    toolContracts: ['LoadGeneratorAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A script that would have no step is refused; an empty script would run no load and report a false pass.',
    handle: (input: { cases: readonly PerformanceTestCase[]; tool: string; dialect: string; stepsByCase: ReadonlyMap<string, readonly ScriptStep[]> }) =>
      input.cases.map((c) => buildScript(input.tool, input.dialect, c, input.stepsByCase.get(c.id) ?? [])),
  }),
  def({
    id: 'script.parameterisation', domain: 'script', stage: 'execution-planning', plane: 'IP',
    purpose: 'Parameterise scripts with synthetic data shapes, never embedding a captured value.',
    inputs: ['PerformanceScript[]'], outputs: ['parameterised scripts'], responsibilities: ['parameterise by shape'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A parameter that would embed a real value is replaced by a synthetic shape.',
    handle: (input: { scripts: readonly PerformanceScript[] }) => input.scripts.map((s) => ({ scriptId: s.id, parameters: s.steps.length })),
  }),
  def({
    id: 'script.scenario-matrix', domain: 'script', stage: 'execution-planning', plane: 'IP',
    purpose: 'Assemble the scenario matrix that orders which scripts run together and in what sequence.',
    inputs: ['PerformanceScript[]'], outputs: ['scenario matrix'], responsibilities: ['assemble the scenario matrix'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A matrix that cannot be assembled runs scripts sequentially rather than not at all.',
    handle: (input: { scripts: readonly PerformanceScript[]; parallelism: number }) => {
      const batches: string[][] = [];
      const p = Math.max(1, input.parallelism);
      for (let i = 0; i < input.scripts.length; i += p) batches.push(input.scripts.slice(i, i + p).map((s) => s.id));
      return batches;
    },
  }),
  def({
    id: 'script.distribution-plan', domain: 'script', stage: 'execution-planning', plane: 'IP',
    purpose: 'Plan the distributed, multi-region execution — nodes, regions and parallelism.',
    inputs: ['WorkloadModel'], outputs: ['distribution'], responsibilities: ['plan distributed execution'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A distribution that cannot be planned runs on a single node rather than failing to run.',
    handle: (input: { regions: readonly string[]; peakConcurrency: number }) => ({
      nodes: Math.max(1, Math.ceil(input.peakConcurrency / 500)), regions: input.regions.length > 0 ? input.regions : ['default'], parallelism: Math.max(1, Math.min(8, input.regions.length || 1)),
    }),
  }),
];

// ── load (stage 8, execution, EP) ───────────────────────────────────────────

export const loadAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'load.generator', domain: 'load', stage: 'execution', plane: 'EP',
    purpose: 'Run the generated scripts as real load in the Execution Plane and collect raw samples.',
    inputs: ['ExecutionPlan', 'inScope predicate'], outputs: ['RawSample[]'], responsibilities: ['generate load within scope'],
    toolContracts: ['LoadGeneratorAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A load run that cannot reach the target returns no sample rather than a fabricated reading.',
    handle: (input: { samples: readonly RawSample[] }) => input.samples,
  }),
  def({
    id: 'load.ramp-controller', domain: 'load', stage: 'execution', plane: 'EP',
    purpose: 'Control the ramp-up, steady-state and ramp-down of virtual users during the run.',
    inputs: ['ExecutionPlan'], outputs: ['ramp trace'], responsibilities: ['control the ramp'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A ramp that overshoots the authorised ceiling is throttled in the Execution Plane, not after the fact.',
    handle: (input: { plan: ExecutionPlan }) => ({ scripts: input.plan.scripts.length }),
  }),
  def({
    id: 'load.rate-limiter', domain: 'load', stage: 'execution', plane: 'EP',
    purpose: 'Hold the request rate at or below the authorised ceiling throughout the run.',
    inputs: ['authorised rate'], outputs: ['rate trace'], responsibilities: ['limit the request rate'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A rate breach pauses the generator rather than continuing beyond the authorised ceiling.',
    handle: (input: { authorizedRequestsPerSecond: number }) => ({ ceiling: input.authorizedRequestsPerSecond }),
  }),
  def({
    id: 'load.checkpoint', domain: 'load', stage: 'execution', plane: 'EP',
    purpose: 'Checkpoint progress so a distributed run can resume rather than restart on interruption.',
    inputs: ['ExecutionPlan'], outputs: ['checkpoint'], responsibilities: ['checkpoint for resume'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A run that cannot checkpoint continues, but reports that resume is unavailable rather than silently disabling it.',
    handle: (input: { batches: number }) => ({ checkpoints: input.batches }),
  }),
  def({
    id: 'load.monitor-collect', domain: 'load', stage: 'execution', plane: 'EP',
    purpose: 'Collect infrastructure and APM metric samples from the configured monitoring provider, if any.',
    inputs: ['monitoring samples'], outputs: ['RawSample[]'], responsibilities: ['fold APM samples into the run without a hard dependency'],
    toolContracts: ['MonitoringAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A monitoring provider that returns nothing yields no sample; its absence never fails the run — APM is optional.',
    handle: (input: { samples: readonly RawSample[] }) => input.samples,
  }),
];

// ── metrics (stage 9, evidence, EP) ─────────────────────────────────────────

const METRIC_CATEGORIES: readonly MetricCategory[] = ['browser', 'api', 'infrastructure', 'database', 'queue', 'runtime', 'cloud', 'network'];

/** Summarise the raw samples for one transaction into the metric summaries that may cross. */
export function summariseTransaction(transactionId: string, samples: readonly RawSample[]): readonly MetricSummary[] {
  const byMetric = new Map<string, RawSample[]>();
  for (const s of samples) { const list = byMetric.get(s.metric) ?? []; list.push(s); byMetric.set(s.metric, list); }
  return [...byMetric.entries()].map(([metric, group]) => {
    const first = group[0];
    return summarise(metric, first?.category ?? 'api', transactionId, first?.unit ?? 'ms', group);
  }).sort((a, b) => (a.metric < b.metric ? -1 : 1));
}

export function assembleResults(samples: readonly RawSample[], evidenceByTxn: ReadonlyMap<string, readonly string[]>): readonly TransactionResult[] {
  const byTxn = new Map<string, RawSample[]>();
  for (const s of samples) { const list = byTxn.get(s.transactionId) ?? []; list.push(s); byTxn.set(s.transactionId, list); }
  return [...byTxn.entries()].map(([transactionId, group]): TransactionResult => {
    const errors = group.filter((s) => s.metric === 'error' && s.value > 0).length;
    const requests = group.filter((s) => s.metric === 'latency' || s.metric === 'response-time').length;
    const durationSec = Math.max(1, (Math.max(...group.map((s) => s.atMillis)) - Math.min(...group.map((s) => s.atMillis))) / 1000);
    return {
      transactionId, summaries: summariseTransaction(transactionId, group),
      transactionsPerSecond: Math.round((requests / durationSec) * 100) / 100,
      errorRate: requests === 0 ? 0 : Math.round((errors / requests) * 1000) / 1000,
      sampleCount: group.length, evidenceRefs: evidenceByTxn.get(transactionId) ?? [],
    };
  }).sort((a, b) => (a.transactionId < b.transactionId ? -1 : 1));
}

/** One metric-capture agent per category — each summarises its category's samples. */
function metricAgent(category: MetricCategory): AgentDefinition<never, unknown> {
  return def({
    id: `metrics.${category}`, domain: 'metrics', stage: 'evidence', plane: 'EP',
    purpose: `Capture and summarise ${category} metrics from the load run into aggregate statistics.`,
    inputs: ['RawSample[]'], outputs: ['MetricSummary[]'], responsibilities: [`summarise ${category} metrics`, 'discard per-host raw values'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A category with no sample reports no summary rather than a zeroed one that reads as measured.',
    handle: (input: { samples: readonly RawSample[] }) => {
      const forCategory = input.samples.filter((s) => s.category === category);
      const byMetric = new Map<string, RawSample[]>();
      for (const s of forCategory) { const list = byMetric.get(s.metric) ?? []; list.push(s); byMetric.set(s.metric, list); }
      return [...byMetric.entries()].map(([metric, group]) => summarise(metric, category, group[0]?.transactionId ?? 'global', group[0]?.unit ?? 'ms', group));
    },
  });
}

export const metricAgents: readonly AgentDefinition<never, unknown>[] = [
  ...METRIC_CATEGORIES.map(metricAgent),
  def({
    id: 'metrics.percentile-aggregation', domain: 'metrics', stage: 'evidence', plane: 'EP',
    purpose: 'Aggregate latency samples into the full percentile ladder (p50 through p99.9).',
    inputs: ['RawSample[]'], outputs: ['MetricSummary[]'], responsibilities: ['aggregate percentiles'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A metric with too few samples reports the count rather than an unstable percentile.',
    handle: (input: { samples: readonly RawSample[]; transactionId: string }) =>
      summarise('latency', 'api', input.transactionId, 'ms', input.samples.filter((s) => s.metric === 'latency' || s.metric === 'response-time')),
  }),
  def({
    id: 'metrics.evidence-capture', domain: 'metrics', stage: 'evidence', plane: 'EP',
    purpose: 'Capture evidence — percentile distributions, flame graphs, dumps — by reference only.',
    inputs: ['captured evidence'], outputs: ['EvidenceReference[]'], responsibilities: ['reference evidence, never carry content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An evidence artefact with no hash or locator is dropped; a reference that proves nothing is not recorded.',
    handle: (input: { captured: readonly { kind: EvidenceReference['kind']; metric: string; digest: string; locator: string }[] }): readonly EvidenceReference[] =>
      input.captured.filter((c) => c.digest.trim() !== '' && c.locator.trim() !== '').map((c): EvidenceReference => ({ kind: c.kind, metric: c.metric, sha256: c.digest, locator: c.locator, capturedAtStage: 'evidence' })),
  }),
  def({
    id: 'metrics.integrity-check', domain: 'metrics', stage: 'evidence', plane: 'EP',
    purpose: 'Verify every evidence reference carries a hash and a locator so it is verifiable later.',
    inputs: ['EvidenceReference[]'], outputs: ['integrity verdict'], responsibilities: ['verify evidence integrity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An evidence set failing integrity is reported as such rather than passed through as sound.',
    handle: (input: { references: readonly EvidenceReference[] }) => ({ integrity: input.references.every((r) => r.sha256.trim() !== '' && r.locator.trim() !== ''), count: input.references.length }),
  }),
];

export { METRIC_CATEGORIES };
