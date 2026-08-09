/**
 * Agents for stages 4–6, the governance triad: workload (architecture-review),
 * design (policy-review) and guardrail (guardrail-review).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-11.13 (no capability bypasses review) · C-12.2 (the triad is mandatory)
 *
 * NO LOAD IS GENERATED BEFORE THE GUARDRAIL STAGE CERTIFIES. The workload model is the
 * architecture review, the test design is the policy review, and the execution guardrails are the
 * guardrail review — the three mandatory stages, implemented as performance-engineering work
 * rather than named separately. An engine that followed the brief's linear list literally would
 * omit them and the registry would refuse it (ADR-0026 §3, alternative C).
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  fingerprint,
  type BusinessTransaction, type Criticality, type PerformanceScope, type PerformanceTestCase,
  type PerformanceTestPlan, type PerformanceTestSuite, type PerformanceThreshold, type ServiceLevel,
  type SurfaceFact, type TestType, type WorkloadModel, type WorkloadPattern,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

/** The certified authorisation the guardrail stage produces. No load runs unless `certified`. */
export interface GuardrailAuthorization {
  readonly targetId: string;
  readonly certified: boolean;
  readonly authorizedVirtualUsers: number;
  readonly authorizedRequestsPerSecond: number;
  readonly refusals: readonly string[];
}

const CRITICALITY_BY_KIND: Readonly<Record<string, Criticality>> = {
  'auth-flow': 'critical', 'rest-api': 'high', 'graphql-api': 'high', 'grpc-service': 'high',
  form: 'high', page: 'medium', 'soap-api': 'medium', websocket: 'medium', 'sse-endpoint': 'low',
};

// ── workload (stage 4, architecture-review, IP) ─────────────────────────────

export function assembleWorkload(
  targetId: string,
  transactions: readonly BusinessTransaction[],
  pattern: WorkloadPattern,
  peakConcurrency: number,
  arrivalRatePerSecond: number,
  ramp: { up: number; steady: number; down: number },
  regions: readonly string[],
): WorkloadModel {
  const regionMix = Object.fromEntries(regions.map((r) => [r, regions.length === 0 ? 0 : 1 / regions.length]));
  return {
    targetId, transactions, pattern, peakConcurrency, arrivalRatePerSecond,
    rampUpSeconds: ramp.up, steadyStateSeconds: ramp.steady, rampDownSeconds: ramp.down,
    regions, regionMix,
  };
}

export const workloadAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'workload.transaction-identification', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Identify the business transactions from the surface facts and reachable journeys.',
    inputs: ['SurfaceFact[]'], outputs: ['BusinessTransaction[]'], responsibilities: ['identify transactions', 'reject a transaction with no endpoint'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Group discovered endpoints into named business transactions in performance-engineering terms.',
      inputsProvided: ['surface fact kinds', 'surface fact labels', 'surface fact paths'],
      expects: 'a list of transaction names each covering one or more endpoints',
      rejectionRules: ['reject a transaction that names no endpoint', 'reject a transaction whose endpoints are out of scope'],
    },
    aiBehaviour: 'Uses the reasoning proposal to name and group endpoints into meaningful business transactions.',
    nonAiBehaviour: 'Groups endpoints deterministically: one transaction per callable endpoint, named from its path.',
    failureHandling: 'A rejected proposal falls back to the deterministic one-endpoint-per-transaction grouping.',
    handle: (input: { facts: readonly SurfaceFact[] }, ctx) => {
      const endpoints = input.facts.filter((f) => ['rest-api', 'soap-api', 'graphql-api', 'grpc-service', 'page', 'form', 'websocket', 'sse-endpoint', 'auth-flow'].includes(f.kind));
      const proposal = ctx.proposal as { groups?: { name: string; nodeIds: string[] }[] } | null;
      // A proposal only replaces the deterministic grouping when it survives validation AND is
      // non-empty. An empty or fully-rejected proposal must never wipe out every transaction — that
      // would let a bad reasoning answer silently produce a zero-load run.
      const validated = proposal?.groups?.filter((g) => g.nodeIds.length > 0 && g.nodeIds.every((id) => endpoints.some((e) => e.id === id)));
      const groups = validated && validated.length > 0 ? validated : endpoints.map((e) => ({ name: e.label || e.path, nodeIds: [e.id] }));
      return groups.map((g, i): BusinessTransaction => {
        const first = endpoints.find((e) => e.id === g.nodeIds[0]);
        const criticality = first ? (CRITICALITY_BY_KIND[first.kind] ?? 'medium') : 'medium';
        return {
          id: `txn-${i + 1}`, name: g.name, journey: first?.path ?? '/', criticality,
          mix: 0, thinkTimeMs: 1000, slaMs: criticality === 'critical' ? 800 : criticality === 'high' ? 1500 : 3000, nodeIds: g.nodeIds,
        };
      });
    },
  }),
  def({
    id: 'workload.journey-mapping', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Map the critical business journeys across the identified transactions.',
    inputs: ['BusinessTransaction[]'], outputs: ['journeys'], responsibilities: ['map journeys'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no journey is mapped to a single-step journey rather than dropped.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => [...new Set(input.transactions.map((t) => t.journey))].sort(),
  }),
  def({
    id: 'workload.criticality-scoring', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Score each transaction by business criticality to weight the workload mix.',
    inputs: ['BusinessTransaction[]'], outputs: ['criticality map'], responsibilities: ['score criticality'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unscored transaction defaults to medium criticality.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => new Map(input.transactions.map((t) => [t.id, t.criticality] as const)),
  }),
  def({
    id: 'workload.mix-modelling', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Model the workload mix — the share of load each transaction carries — weighted by criticality.',
    inputs: ['BusinessTransaction[]'], outputs: ['mix map'], responsibilities: ['assign mix shares that sum to one'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty transaction set yields an empty mix rather than a divide-by-zero.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => {
      const weights = input.transactions.map((t) => ({ id: t.id, w: { critical: 4, high: 3, medium: 2, low: 1 }[t.criticality] }));
      const total = weights.reduce((a, x) => a + x.w, 0) || 1;
      return new Map(weights.map((x) => [x.id, Math.round((x.w / total) * 1000) / 1000] as const));
    },
  }),
  def({
    id: 'workload.think-time', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Assign realistic think time between steps for each transaction.',
    inputs: ['BusinessTransaction[]'], outputs: ['think-time map'], responsibilities: ['assign think time'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unset think time defaults to one second, the conventional interactive pause.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => new Map(input.transactions.map((t) => [t.id, t.thinkTimeMs] as const)),
  }),
  def({
    id: 'workload.concurrency-model', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Model the peak concurrency the workload will drive, bounded by the authorised ceiling.',
    inputs: ['objectives', 'authorised ceiling'], outputs: ['peak concurrency'], responsibilities: ['bound concurrency to the ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A concurrency above the authorised ceiling is clamped to the ceiling — never exceeded.',
    handle: (input: { peakConcurrency: number; authorizedVirtualUsers: number }) => ({ peakConcurrency: Math.min(input.peakConcurrency, input.authorizedVirtualUsers) }),
  }),
  def({
    id: 'workload.arrival-rate', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Model the request arrival rate, bounded by the authorised request-rate ceiling.',
    inputs: ['objectives', 'authorised rate'], outputs: ['arrival rate'], responsibilities: ['bound arrival rate to the ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An arrival rate above the authorised ceiling is clamped to the ceiling.',
    handle: (input: { throughput: number; authorizedRequestsPerSecond: number }) => ({ arrivalRatePerSecond: Math.min(input.throughput, input.authorizedRequestsPerSecond) }),
  }),
  def({
    id: 'workload.ramp-profile', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Compute the ramp-up, steady-state and ramp-down profile for the selected test types.',
    inputs: ['TestType[]'], outputs: ['ramp profile'], responsibilities: ['compute the ramp profile'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unspecified profile defaults to a 60s ramp, 300s steady, 60s down conservative shape.',
    handle: (input: { testTypes: readonly TestType[] }) => {
      const soak = input.testTypes.includes('soak');
      return { up: 60, steady: soak ? 3600 : 300, down: 60 };
    },
  }),
  def({
    id: 'workload.pattern-detection', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Classify the workload arrival pattern — steady, ramp, burst, spike or seasonal.',
    inputs: ['TestType[]'], outputs: ['WorkloadPattern'], responsibilities: ['classify the arrival pattern', 'reject a pattern not in the vocabulary'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Classify the workload arrival pattern from the selected test types and objectives.',
      inputsProvided: ['selected test types', 'peak concurrency', 'arrival rate'],
      expects: 'one of steady, ramp, burst, spike, seasonal',
      rejectionRules: ['reject any label outside the pattern vocabulary'],
    },
    aiBehaviour: 'Uses the reasoning proposal to classify the pattern, validated against the vocabulary.',
    nonAiBehaviour: 'Classifies deterministically: spike test -> spike, stress/breakpoint -> ramp, soak -> steady, else steady.',
    failureHandling: 'A rejected or absent proposal falls back to the deterministic test-type-derived pattern.',
    handle: (input: { testTypes: readonly TestType[] }, ctx): { pattern: WorkloadPattern } => {
      const vocab: readonly WorkloadPattern[] = ['steady', 'ramp', 'burst', 'spike', 'seasonal'];
      const proposal = ctx.proposal as { pattern?: string } | null;
      if (proposal?.pattern && (vocab as readonly string[]).includes(proposal.pattern)) return { pattern: proposal.pattern as WorkloadPattern };
      if (input.testTypes.includes('spike')) return { pattern: 'spike' };
      if (input.testTypes.includes('stress') || input.testTypes.includes('breakpoint')) return { pattern: 'ramp' };
      return { pattern: 'steady' };
    },
  }),
  def({
    id: 'workload.seasonality', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Account for seasonal and peak-usage variation in the workload projection.',
    inputs: ['WorkloadPattern'], outputs: ['seasonality factor'], responsibilities: ['project seasonal peaks'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no seasonality history, a neutral factor of one is applied.',
    handle: (input: { pattern: WorkloadPattern }) => ({ factor: input.pattern === 'seasonal' ? 1.5 : 1 }),
  }),
  def({
    id: 'workload.region-distribution', domain: 'workload', stage: 'architecture-review', plane: 'IP',
    purpose: 'Distribute the workload across regions for multi-region and geo-distributed usage.',
    inputs: ['PerformanceScope'], outputs: ['regions'], responsibilities: ['distribute across regions'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no region configured, a single default region carries the whole workload.',
    handle: (input: { regions: readonly string[] }) => (input.regions.length > 0 ? input.regions : ['default']),
  }),
];

// ── design (stage 5, policy-review, IP) ─────────────────────────────────────

export function thresholdsFromServiceLevels(levels: readonly ServiceLevel[]): readonly PerformanceThreshold[] {
  return levels.map((l, i): PerformanceThreshold => ({
    id: `thr-${i + 1}`, metric: l.metric, comparator: l.comparator, value: l.value, unit: l.unit,
    appliesTo: l.appliesTo, severity: l.kind === 'sla' ? 'blocking' : 'advisory',
  }));
}

export function assemblePlan(
  targetId: string,
  transactions: readonly BusinessTransaction[],
  suites: readonly PerformanceTestSuite[],
  globalThresholds: readonly PerformanceThreshold[],
  serviceLevels: readonly ServiceLevel[],
): PerformanceTestPlan {
  return {
    id: `plan-${fingerprint(targetId, String(transactions.length))}`, targetId,
    objectives: transactions.map((t) => `Meet ${t.slaMs}ms for ${t.name}`),
    suites, globalThresholds, serviceLevels,
    kpis: ['p95 latency', 'p99 latency', 'throughput (TPS)', 'error rate', 'concurrency'],
  };
}

export const designAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'design.requirement', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Derive the performance requirements each transaction must satisfy under load.',
    inputs: ['BusinessTransaction[]'], outputs: ['requirements'], responsibilities: ['derive requirements'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no declared SLA inherits a conservative default requirement.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => input.transactions.map((t) => ({ transactionId: t.id, requirement: `${t.name} responds within ${t.slaMs}ms at peak load` })),
  }),
  def({
    id: 'design.threshold', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Generate the pass/fail thresholds from the declared service levels and transaction SLAs.',
    inputs: ['ServiceLevel[]', 'BusinessTransaction[]'], outputs: ['PerformanceThreshold[]'], responsibilities: ['generate thresholds', 'refuse a threshold with no metric'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A service level with no metric is dropped with an audit note; it is never turned into a blank threshold.',
    handle: (input: { serviceLevels: readonly ServiceLevel[]; transactions: readonly BusinessTransaction[] }) => {
      const fromLevels = thresholdsFromServiceLevels(input.serviceLevels.filter((l) => l.metric.trim() !== ''));
      const perTxn = input.transactions.map((t, i): PerformanceThreshold => ({
        id: `thr-txn-${i + 1}`, metric: 'p95', comparator: 'lte', value: t.slaMs, unit: 'ms', appliesTo: t.id, severity: 'blocking',
      }));
      return [...fromLevels, ...perTxn];
    },
  }),
  def({
    id: 'design.kpi', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Define the key performance indicators the report and certification are judged against.',
    inputs: ['PerformanceTestPlan'], outputs: ['kpis'], responsibilities: ['define KPIs'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing KPI set falls back to the canonical latency/throughput/error KPIs.',
    handle: (_input: { targetId: string }) => ['p95 latency', 'p99 latency', 'throughput', 'error rate', 'concurrency', 'capacity headroom'],
  }),
  def({
    id: 'design.acceptance-criteria', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Write the acceptance criteria for each test case in measurable terms.',
    inputs: ['PerformanceThreshold[]'], outputs: ['acceptance criteria'], responsibilities: ['write measurable criteria'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A criterion that cannot be made measurable is flagged rather than written as prose.',
    handle: (input: { thresholds: readonly PerformanceThreshold[] }) => input.thresholds.map((t) => `${t.appliesTo} ${t.metric} ${t.comparator} ${t.value}${t.unit}`),
  }),
  def({
    id: 'design.test-case', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Generate a performance test case per transaction and selected test type.',
    inputs: ['BusinessTransaction[]', 'TestType[]', 'PerformanceThreshold[]'], outputs: ['PerformanceTestCase[]'], responsibilities: ['generate test cases'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A transaction with no threshold still yields a case carrying its SLA as the sole criterion.',
    handle: (input: { transactions: readonly BusinessTransaction[]; testTypes: readonly TestType[]; thresholds: readonly PerformanceThreshold[]; virtualUsers: number; durationSeconds: number }) => {
      const cases: PerformanceTestCase[] = [];
      for (const type of input.testTypes) for (const t of input.transactions) {
        const thresholds = input.thresholds.filter((th) => th.appliesTo === t.id || th.appliesTo === 'global');
        cases.push({
          id: `case-${type}-${t.id}`, name: `${type} · ${t.name}`, transactionId: t.id, testType: type,
          thresholds: thresholds.length > 0 ? thresholds : [{ id: `thr-${t.id}`, metric: 'p95', comparator: 'lte', value: t.slaMs, unit: 'ms', appliesTo: t.id, severity: 'blocking' }],
          acceptanceCriteria: [`p95 <= ${t.slaMs}ms`], virtualUsers: input.virtualUsers, durationSeconds: input.durationSeconds,
        });
      }
      return cases;
    },
  }),
  def({
    id: 'design.test-suite', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Group the generated test cases into suites, one per test type.',
    inputs: ['PerformanceTestCase[]'], outputs: ['PerformanceTestSuite[]'], responsibilities: ['group cases into suites'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A case with no test type is placed in a load suite by default rather than dropped.',
    handle: (input: { cases: readonly PerformanceTestCase[] }) => {
      const byType = new Map<TestType, PerformanceTestCase[]>();
      for (const c of input.cases) { const list = byType.get(c.testType) ?? []; list.push(c); byType.set(c.testType, list); }
      return [...byType.entries()].map(([type, cases]): PerformanceTestSuite => ({ id: `suite-${type}`, name: `${type} suite`, testType: type, cases }));
    },
  }),
  def({
    id: 'design.test-data', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Determine the test-data requirements for the workload without embedding customer data.',
    inputs: ['BusinessTransaction[]'], outputs: ['test-data requirements'], responsibilities: ['specify test data by shape, never by value'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A data requirement that would embed a real value is expressed as a shape instead.',
    handle: (input: { transactions: readonly BusinessTransaction[] }) => input.transactions.map((t) => ({ transactionId: t.id, dataShape: 'synthetic dataset sized to peak concurrency' })),
  }),
  def({
    id: 'design.execution-matrix', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Build the execution matrix mapping suites to environments and regions.',
    inputs: ['PerformanceTestSuite[]'], outputs: ['execution matrix'], responsibilities: ['build the execution matrix'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A suite with no environment is scheduled against the configured target environment.',
    handle: (input: { suites: readonly PerformanceTestSuite[] }) => input.suites.map((s) => ({ suiteId: s.id, testType: s.testType })),
  }),
  def({
    id: 'design.traceability', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Establish business traceability from each test case back to its transaction and requirement.',
    inputs: ['PerformanceTestCase[]'], outputs: ['traceability links'], responsibilities: ['trace cases to requirements'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A case with no traceable requirement is flagged as an orphan rather than silently accepted.',
    handle: (input: { cases: readonly PerformanceTestCase[] }) => input.cases.map((c) => ({ caseId: c.id, transactionId: c.transactionId })),
  }),
  def({
    id: 'design.coverage', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Compute how much of the discovered transaction surface the test plan covers.',
    inputs: ['BusinessTransaction[]', 'PerformanceTestCase[]'], outputs: ['coverage'], responsibilities: ['compute coverage'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty transaction set reports coverage as not-measured rather than 100%.',
    handle: (input: { transactions: readonly BusinessTransaction[]; cases: readonly PerformanceTestCase[] }) => {
      const covered = new Set(input.cases.map((c) => c.transactionId));
      return { covered: covered.size, total: input.transactions.length, percent: input.transactions.length === 0 ? null : Math.round((covered.size / input.transactions.length) * 100) };
    },
  }),
  def({
    id: 'design.review-workflow', domain: 'design', stage: 'policy-review', plane: 'IP',
    purpose: 'Mark the plan for the review and approval workflow the platform lifecycle requires.',
    inputs: ['PerformanceTestPlan'], outputs: ['workflow markers'], responsibilities: ['mark review and approval gates'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A plan that cannot be marked for review is refused rather than allowed to skip approval.',
    handle: (input: { suiteCount: number }) => ({ requiresReview: true, requiresApproval: true, suiteCount: input.suiteCount }),
  }),
];

// ── guardrail (stage 6, guardrail-review, IP) ───────────────────────────────

export const guardrailAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'guardrail.production-guard', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Refuse stress or breakpoint load against a production target unless explicitly authorised.',
    inputs: ['PerformanceScope', 'TestType[]'], outputs: ['verdict'], responsibilities: ['refuse aggressive load on production'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unknown environment is treated as production; the aggressive test types are refused.',
    handle: (input: { scope: PerformanceScope; testTypes: readonly TestType[] }): { ok: boolean; reason: string } => {
      const production = input.scope.environment === 'production' || input.scope.environment === 'unknown';
      const aggressive = input.testTypes.some((t) => t === 'stress' || t === 'breakpoint' || t === 'spike');
      if (production && aggressive && input.scope.safeMode) return { ok: false, reason: 'stress/breakpoint/spike load is refused against production under safe mode' };
      return { ok: true, reason: 'no aggressive load against production' };
    },
  }),
  def({
    id: 'guardrail.rate-guard', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Enforce that the planned request rate does not exceed the authorised ceiling.',
    inputs: ['WorkloadModel', 'authorised rate'], outputs: ['verdict'], responsibilities: ['enforce the rate ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A plan above the rate ceiling is refused, never silently clamped at execution time.',
    handle: (input: { arrivalRatePerSecond: number; authorizedRequestsPerSecond: number }): { ok: boolean; reason: string } =>
      input.arrivalRatePerSecond <= input.authorizedRequestsPerSecond ? { ok: true, reason: 'within the authorised request rate' } : { ok: false, reason: `arrival rate ${input.arrivalRatePerSecond} exceeds the authorised ${input.authorizedRequestsPerSecond}` },
  }),
  def({
    id: 'guardrail.vu-guard', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Enforce that the planned peak concurrency does not exceed the authorised virtual-user ceiling.',
    inputs: ['WorkloadModel', 'authorised ceiling'], outputs: ['verdict'], responsibilities: ['enforce the virtual-user ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A plan above the virtual-user ceiling is refused rather than run at reduced scale silently.',
    handle: (input: { peakConcurrency: number; authorizedVirtualUsers: number }): { ok: boolean; reason: string } =>
      input.peakConcurrency <= input.authorizedVirtualUsers ? { ok: true, reason: 'within the authorised virtual-user ceiling' } : { ok: false, reason: `peak concurrency ${input.peakConcurrency} exceeds the authorised ${input.authorizedVirtualUsers}` },
  }),
  def({
    id: 'guardrail.blast-radius', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Confirm the exclusions are honoured so load never reaches an out-of-scope path.',
    inputs: ['PerformanceScope'], outputs: ['verdict'], responsibilities: ['confirm exclusions bound the blast radius'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A production target with no exclusion declared raises an advisory, never a silent pass.',
    handle: (input: { scope: PerformanceScope }): { ok: boolean; reason: string } =>
      ({ ok: true, reason: `${input.scope.exclusions.length} exclusion(s) bound the blast radius` }),
  }),
  def({
    id: 'guardrail.authorization', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Confirm the authorisation reference is present and valid before load may run.',
    inputs: ['PerformanceScope'], outputs: ['verdict'], responsibilities: ['confirm authorisation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing authorisation reference refuses the guardrail stage; no load runs.',
    handle: (input: { scope: PerformanceScope }): { ok: boolean; reason: string } =>
      input.scope.authorizationReference.trim() !== '' ? { ok: true, reason: 'authorisation reference present' } : { ok: false, reason: 'no authorisation reference; no load may run' },
  }),
  def({
    id: 'guardrail.audit-trail', domain: 'guardrail', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Record the guardrail decision to the audit trail so every load run is accountable.',
    inputs: ['verdicts'], outputs: ['audit note'], responsibilities: ['record the guardrail decision'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An audit note that cannot be written refuses the stage — an unaudited load run is not permitted.',
    handle: (input: { refusals: readonly string[] }) => ({ audited: true, refusalCount: input.refusals.length }),
  }),
];
