/**
 * Agents for stages 1–3: scope (planning), discovery (Execution Plane) and surface (context).
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 12-capability-orchestration.md · 06-data-sovereignty.md
 *   ADR          : ADR-0026
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-11.5 (no stage is a silent no-op)
 *
 * DISCOVERY RUNS IN THE EXECUTION PLANE. Every discovery agent declares `plane: 'EP'`; the
 * conformance gate reads that and fails a catalogue that crawls a customer system from the
 * Intelligence Plane. The minimisation crossing is stage 3 (context): raw nodes become surface
 * facts, and only facts continue into the Intelligence Plane.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  minimiseNode, testTypeAllowed, TEST_TYPES,
  type NodeKind, type ObservedNode, type PerformanceScope, type ServiceLevel, type SurfaceFact, type TestType,
} from '../model.js';

/** The validated scope boundary produced by the scope domain. */
export interface ScopeBoundary {
  readonly scope: PerformanceScope;
  readonly inScope: (url: string) => boolean;
  readonly serviceLevels: readonly ServiceLevel[];
  readonly testTypes: readonly TestType[];
  readonly authorizedVirtualUsers: number;
  readonly authorizedRequestsPerSecond: number;
  readonly authorized: boolean;
  readonly summary: string;
}

/** Build the fail-closed in-scope predicate from allowed hosts and exclusions. */
export function buildInScope(scope: PerformanceScope): (url: string) => boolean {
  const allowed = scope.allowedHosts.map((h) => h.toLowerCase());
  const excluded = scope.exclusions.map((e) => e.toLowerCase());
  return (url: string): boolean => {
    const u = url.toLowerCase();
    if (excluded.some((e) => e && u.includes(e))) return false;
    if (allowed.length === 0) return false;
    // A path (starting with /) is in scope when no exclusion matched; a full URL must match a host.
    if (u.startsWith('/')) return true;
    return allowed.some((h) => u.includes(h.replace(/^https?:\/\//, '')));
  };
}

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── scope (stage 1, planning, IP) ───────────────────────────────────────────

export const scopeAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'scope.authorization-reference', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Validate that a performance-test authorisation reference is present before any load is planned.',
    inputs: ['PerformanceScope'], outputs: ['PerformanceScope'], responsibilities: ['refuse an unauthorised test'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A scope with no authorisation reference is refused; no load is planned without one.',
    handle: (input: { scope: PerformanceScope }) => input.scope,
  }),
  def({
    id: 'scope.allowed-host-validation', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Validate that at least one host is authorised for load and normalise the host list.',
    inputs: ['PerformanceScope'], outputs: ['PerformanceScope'], responsibilities: ['normalise hosts', 'refuse an empty scope'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A scope with no allowed host is passed through for the planning review to refuse.',
    handle: (input: { scope: PerformanceScope }) => ({
      ...input.scope,
      allowedHosts: [...new Set(input.scope.allowedHosts.map((h) => h.trim()).filter(Boolean))],
    }),
  }),
  def({
    id: 'scope.boundary-enforcement', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Build the fail-closed in-scope predicate that binds every later request to authorised hosts.',
    inputs: ['PerformanceScope'], outputs: ['inScope predicate'], responsibilities: ['bind requests to scope'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A boundary that cannot be built defaults to refusing every URL — fail closed.',
    handle: (input: { scope: PerformanceScope }) => ({
      inScope: buildInScope(input.scope),
      summary: `${input.scope.allowedHosts.length} host(s) in scope, ${input.scope.exclusions.length} exclusion(s)`,
    }),
  }),
  def({
    id: 'scope.service-level-intake', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Parse the declared SLA, SLO and SLI service levels the test will be certified against.',
    inputs: ['configuration'], outputs: ['ServiceLevel[]'], responsibilities: ['parse service levels'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unparseable service level is dropped with an audit note rather than silently accepted.',
    handle: (input: { serviceLevels: readonly ServiceLevel[] }) => input.serviceLevels,
  }),
  def({
    id: 'scope.vu-ceiling', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Resolve the authorised virtual-user ceiling from scope and safe mode.',
    inputs: ['PerformanceScope'], outputs: ['virtual-user ceiling'], responsibilities: ['cap virtual users'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unset ceiling resolves to a conservative default of 50 virtual users.',
    handle: (input: { scope: PerformanceScope }) => {
      const max = input.scope.maxVirtualUsers > 0 ? input.scope.maxVirtualUsers : 50;
      return { virtualUsers: input.scope.safeMode ? Math.min(max, 500) : max };
    },
  }),
  def({
    id: 'scope.rate-ceiling', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Resolve the authorised requests-per-second ceiling the environment will tolerate.',
    inputs: ['PerformanceScope'], outputs: ['rps ceiling'], responsibilities: ['cap request rate'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unset rate resolves to a conservative default of 50 requests per second.',
    handle: (input: { scope: PerformanceScope }) => ({ requestsPerSecond: input.scope.maxRequestsPerSecond > 0 ? input.scope.maxRequestsPerSecond : 50 }),
  }),
  def({
    id: 'scope.environment-detection', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Classify the target environment so production tightens every downstream guardrail.',
    inputs: ['PerformanceScope'], outputs: ['environment classification'], responsibilities: ['classify environment'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unknown environment is treated as production for guardrail purposes — fail safe.',
    handle: (input: { scope: PerformanceScope }) => ({ environment: input.scope.environment, production: input.scope.environment === 'production' || input.scope.environment === 'unknown' }),
  }),
  def({
    id: 'scope.test-type-selection', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Select the performance test types to run, none exceeding the configured intensity ceiling.',
    inputs: ['PerformanceScope'], outputs: ['TestType[]'], responsibilities: ['select test types within the ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'When nothing is requested, a smoke and a load test are selected as the safe baseline.',
    handle: (input: { scope: PerformanceScope; requested: readonly TestType[] }) => {
      const requested = input.requested.length > 0 ? input.requested : (['smoke', 'load'] as readonly TestType[]);
      return requested.filter((t) => testTypeAllowed(input.scope.testTypeCeiling, t));
    },
  }),
  def({
    id: 'scope.workload-objective', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Derive the workload objectives (peak concurrency, target throughput) for this test.',
    inputs: ['PerformanceScope', 'ServiceLevel[]'], outputs: ['objectives'], responsibilities: ['propose objectives', 'reject an objective above the authorised ceiling'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Propose workload objectives from the declared service levels and scope, in performance-engineering terms.',
      inputsProvided: ['service level metrics', 'authorised virtual-user ceiling', 'authorised request rate'],
      expects: 'a peak concurrency and a target throughput',
      rejectionRules: ['reject any objective above the authorised virtual-user or request-rate ceiling', 'reject a non-numeric objective'],
    },
    aiBehaviour: 'Uses the reasoning proposal to shape peak concurrency and throughput toward the declared service levels.',
    nonAiBehaviour: 'Derives objectives deterministically: peak concurrency equals the authorised virtual-user ceiling, throughput equals the authorised request rate.',
    failureHandling: 'A rejected or absent proposal falls back to the deterministic ceiling-derived objectives.',
    handle: (input: { authorizedVirtualUsers: number; authorizedRequestsPerSecond: number }, ctx) => {
      const proposal = ctx.proposal as { peakConcurrency?: number; throughput?: number } | null;
      const peak = proposal && typeof proposal.peakConcurrency === 'number' && proposal.peakConcurrency <= input.authorizedVirtualUsers
        ? proposal.peakConcurrency : input.authorizedVirtualUsers;
      const throughput = proposal && typeof proposal.throughput === 'number' && proposal.throughput <= input.authorizedRequestsPerSecond
        ? proposal.throughput : input.authorizedRequestsPerSecond;
      return { peakConcurrency: peak, throughput };
    },
  }),
];

// ── discovery (stage 2, discovery, EP) ──────────────────────────────────────

/** One discovery agent per node kind — each filters the Execution Plane observation. */
function discoveryAgent(kind: NodeKind, id: string, protocolNote: string): AgentDefinition<never, unknown> {
  return def({
    id, domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: `Discover ${protocolNote} in the Execution Plane and return them as observed nodes.`,
    inputs: ['observed nodes', 'inScope predicate'], outputs: ['ObservedNode[]'],
    responsibilities: [`observe ${kind} nodes`, 'stay within scope'],
    toolContracts: ['LoadGeneratorAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A discovery probe that cannot reach the target returns no node rather than a fabricated one.',
    handle: (input: { observed: readonly ObservedNode[]; inScope: (u: string) => boolean }) =>
      input.observed.filter((n) => n.kind === kind && input.inScope(n.path)),
  });
}

export const discoveryAgents: readonly AgentDefinition<never, unknown>[] = [
  discoveryAgent('page', 'discovery.page-crawl', 'application pages'),
  discoveryAgent('rest-api', 'discovery.rest-api', 'REST API endpoints'),
  discoveryAgent('soap-api', 'discovery.soap-api', 'SOAP API endpoints'),
  discoveryAgent('graphql-api', 'discovery.graphql-api', 'GraphQL endpoints'),
  discoveryAgent('grpc-service', 'discovery.grpc-service', 'gRPC services'),
  discoveryAgent('websocket', 'discovery.websocket', 'WebSocket endpoints'),
  discoveryAgent('sse-endpoint', 'discovery.sse-endpoint', 'server-sent-event endpoints'),
  discoveryAgent('form', 'discovery.form-inventory', 'form submissions'),
  discoveryAgent('auth-flow', 'discovery.auth-flow', 'authentication flows'),
  discoveryAgent('microservice', 'discovery.microservice', 'downstream microservices'),
  discoveryAgent('database', 'discovery.database', 'database dependencies'),
  discoveryAgent('queue', 'discovery.queue', 'message queues (Kafka, RabbitMQ, Azure Service Bus)'),
  discoveryAgent('cache', 'discovery.cache', 'cache tiers (Redis)'),
  discoveryAgent('cdn', 'discovery.cdn', 'CDN edges'),
  discoveryAgent('third-party', 'discovery.third-party', 'third-party service dependencies'),
  discoveryAgent('batch-job', 'discovery.batch-job', 'background and batch jobs'),
  discoveryAgent('scheduler', 'discovery.scheduler', 'schedulers and cron processes'),
  discoveryAgent('stream', 'discovery.stream', 'streaming pipelines'),
  discoveryAgent('load-balancer', 'discovery.load-balancer', 'load balancers'),
];

// ── surface (stage 3, context, IP) ──────────────────────────────────────────

export function assembleFacts(nodes: readonly ObservedNode[]): readonly SurfaceFact[] {
  return nodes.map(minimiseNode).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export const surfaceAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'surface.endpoint-inventory', domain: 'surface', stage: 'context', plane: 'IP',
    purpose: 'Inventory the callable endpoints from the minimised surface facts.',
    inputs: ['SurfaceFact[]'], outputs: ['endpoint ids'], responsibilities: ['inventory endpoints'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty inventory is returned honestly rather than a placeholder endpoint.',
    handle: (input: { facts: readonly SurfaceFact[] }) =>
      input.facts.filter((f) => ['rest-api', 'soap-api', 'graphql-api', 'grpc-service', 'page', 'websocket', 'sse-endpoint', 'form'].includes(f.kind)).map((f) => f.id),
  }),
  def({
    id: 'surface.protocol-inventory', domain: 'surface', stage: 'context', plane: 'IP',
    purpose: 'Inventory the protocols in use across the discovered surface.',
    inputs: ['SurfaceFact[]'], outputs: ['protocols'], responsibilities: ['inventory protocols'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A surface with no protocol is reported as such rather than assumed to be HTTP.',
    handle: (input: { facts: readonly SurfaceFact[] }) => [...new Set(input.facts.map((f) => f.protocol))].sort(),
  }),
  def({
    id: 'surface.dependency-inventory', domain: 'surface', stage: 'context', plane: 'IP',
    purpose: 'Inventory the downstream dependencies — databases, queues, caches, third parties.',
    inputs: ['SurfaceFact[]'], outputs: ['dependency ids'], responsibilities: ['inventory dependencies'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing dependency map is reported as incomplete, never as an absence of dependencies.',
    handle: (input: { facts: readonly SurfaceFact[] }) =>
      input.facts.filter((f) => ['database', 'queue', 'cache', 'cdn', 'third-party', 'microservice', 'load-balancer'].includes(f.kind)).map((f) => f.id),
  }),
  def({
    id: 'surface.topology-assemble', domain: 'surface', stage: 'context', plane: 'IP',
    purpose: 'Assemble the complete performance topology graph from the surface facts.',
    inputs: ['SurfaceFact[]'], outputs: ['topology'], responsibilities: ['assemble topology'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A topology that cannot be assembled reports the disconnected nodes rather than dropping them.',
    handle: (input: { facts: readonly SurfaceFact[] }) => ({
      nodeCount: input.facts.length,
      roots: input.facts.filter((f) => f.parentId === null).map((f) => f.id),
    }),
  }),
];

export { TEST_TYPES };
