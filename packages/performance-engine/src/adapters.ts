/**
 * Performance adapters — the only place a tool or provider name appears.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * ONE WORKFLOW. VARIATION ONLY THROUGH ADAPTERS.
 * k6, JMeter, Gatling, Locust and Playwright differ in the SCRIPT DIALECT they emit and the
 * runner they invoke — never in the scenario matrix or the order the engine plans, executes and
 * reports. Jira, Azure DevOps, Zephyr and Xray differ in their NOUNS — Test Plan vs Test Cycle,
 * Bug vs Issue — never in the publish sequence. The adapter names the noun and renders the
 * dialect; it does not reorder, add or skip a step. The orchestrator never learns which tool or
 * provider it received, and the conformance suite proves two providers produce an identical
 * publication sequence.
 *
 * These adapters are in-process implementations that render a deterministic artefact and record
 * what was asked of them. They are the seam a hosted provider client or a real load-generator CLI
 * is installed at, in the Execution Plane; the engine cannot tell the difference, which is the
 * point of the SPI.
 */
import { fingerprint, type PerformanceScript, type PerformanceTestCase, type RawSample } from './model.js';

export interface AdapterIdentity {
  readonly spi: string;
  readonly provider: string;
  readonly version: string;
}

/** What an adapter was asked to do. Read by the conformance suite, never by the engine. */
export interface AdapterJournal {
  readonly calls: readonly { readonly method: string; readonly detail: string }[];
}

class Journal {
  readonly calls: { method: string; detail: string }[] = [];
  record(method: string, detail: string): void { this.calls.push({ method, detail }); }
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString().padStart(5, '0')}`;
}
/** Reset between conformance runs so identifiers do not drift across tests. */
export function resetAdapterSequence(): void { sequence = 0; }

// ── Load-generator face ─────────────────────────────────────────────────────

export interface RenderedScript {
  readonly dialect: string;
  readonly digest: string;
  readonly lineCount: number;
}

/**
 * A load-generator adapter — renders the platform's generated script into a tool dialect.
 *
 * `render` is deterministic and content-free: it derives a digest and a line count from the
 * script's structure. The actual tool file is produced in the Execution Plane; what the engine
 * keeps is the digest, so a script is traceable without the Intelligence Plane holding the file.
 */
export interface LoadGeneratorAdapter {
  readonly identity: AdapterIdentity;
  /** The provider's noun for a script, e.g. "k6 script", "JMeter test plan". */
  readonly scriptNoun: string;
  readonly dialect: string;
  render(script: PerformanceScript): RenderedScript;
}

function loadGeneratorFor(provider: string, scriptNoun: string, dialect: string, linesPerStep: number): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  return {
    journal,
    adapter: {
      identity: { spi: 'LoadGeneratorAdapter', provider, version: '1.0.0' },
      scriptNoun, dialect,
      render: (script) => {
        journal.record('render', `${scriptNoun}: ${script.scenarioName} (${script.steps.length} step(s), ${script.virtualUsers} VUs)`);
        // Deterministic line count: a preamble, the step body, and a teardown.
        const lineCount = 8 + script.steps.length * linesPerStep + 4;
        const digest = fingerprint(dialect, script.scenarioName, String(script.virtualUsers), String(script.durationSeconds), ...script.steps.map((s) => `${s.order}:${s.method}:${s.path}`));
        return { dialect, digest, lineCount };
      },
    },
  };
}

export function k6Adapter(): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } { return loadGeneratorFor('k6', 'k6 script', 'javascript-k6', 3); }
export function jmeterAdapter(): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } { return loadGeneratorFor('jmeter', 'JMeter test plan', 'xml-jmeter', 6); }
export function gatlingAdapter(): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } { return loadGeneratorFor('gatling', 'Gatling simulation', 'scala-gatling', 4); }
export function locustAdapter(): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } { return loadGeneratorFor('locust', 'Locust locustfile', 'python-locust', 3); }
export function playwrightAdapter(): { adapter: LoadGeneratorAdapter; journal: AdapterJournal } { return loadGeneratorFor('playwright', 'Playwright performance script', 'typescript-playwright', 5); }

// ── Test-management / defect-sync face ──────────────────────────────────────

/**
 * A test-management adapter — where the performance plan, results, defects and evidence
 * references are published. The Functional Testing Engine lifecycle, inherited not restated.
 *
 * Evidence is published by REFERENCE — a hash and a locator, never the artefact.
 */
export interface TestManagementAdapter {
  readonly identity: AdapterIdentity;
  readonly containerNoun: string;
  readonly defectNoun: string;
  createContainer(name: string): { containerId: string; noun: string };
  publishTestCase(testCase: { id: string; name: string; transactionId: string; testType: string }): { externalId: string };
  publishResult(subject: { transactionId: string; verdict: string; summary: string }): { published: true };
  publishDefect(defect: { title: string; severity: string; priority: string; transactionId: string; evidenceRefs: readonly string[] }): { defectId: string };
  publishEvidenceReference(subject: string, reference: { sha256: string; locator: string; kind: string }): { published: boolean };
  linkTraceability(testId: string, requirementId: string): { linked: boolean };
}

function testManagementFor(provider: string, containerNoun: string, defectNoun: string): { adapter: TestManagementAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  return {
    journal,
    adapter: {
      identity: { spi: 'TestManagementAdapter', provider, version: '1.0.0' },
      containerNoun, defectNoun,
      createContainer: (name) => { journal.record('createContainer', `${containerNoun}: ${name}`); return { containerId: nextId(`${provider}-container`), noun: containerNoun }; },
      publishTestCase: (tc) => { journal.record('publishTestCase', `${tc.name} [${tc.testType}] for ${tc.transactionId}`); return { externalId: nextId(`${provider}-case`) }; },
      publishResult: (r) => { journal.record('publishResult', `${r.transactionId}: ${r.verdict} — ${r.summary}`); return { published: true }; },
      publishDefect: (d) => { journal.record('publishDefect', `${defectNoun}: ${d.title} (${d.severity}/${d.priority})`); return { defectId: nextId(`${provider}-defect`) }; },
      publishEvidenceReference: (subject, ref) => { journal.record('publishEvidenceReference', `${subject}: ${ref.kind}@${ref.sha256}`); return { published: true }; },
      linkTraceability: (testId, reqId) => { journal.record('linkTraceability', `${testId}->${reqId}`); return { linked: true }; },
    },
  };
}

export function azureDevOpsAdapter(): { adapter: TestManagementAdapter; journal: AdapterJournal } { return testManagementFor('azure-devops', 'Test Plan', 'Bug'); }
export function zephyrAdapter(): { adapter: TestManagementAdapter; journal: AdapterJournal } { return testManagementFor('zephyr-scale', 'Test Cycle', 'Issue'); }
export function jiraXrayAdapter(): { adapter: TestManagementAdapter; journal: AdapterJournal } { return testManagementFor('xray', 'Test Plan', 'Test'); }

// ── Monitoring / APM face (OPTIONAL — ADR-0026 §4.3) ────────────────────────

/**
 * A monitoring-collector adapter — the third adapter face ADR-0026 declared.
 *
 * It is the seam an enterprise APM (Dynatrace, AppDynamics, Datadog, New Relic, Azure Monitor,
 * CloudWatch, Google Cloud Operations, Prometheus, Grafana, Elastic APM, OpenTelemetry) is
 * installed at, in the Execution Plane. `collect` returns Execution-Plane `RawSample`s for the
 * window of the load run; the engine summarises them exactly as it summarises load-generated
 * samples, so an APM source adds infrastructure and dependency metrics without a second code path.
 *
 * IT IS OPTIONAL. A tenant with no APM configured runs on load-generated samples alone; the
 * resolver returns `null` rather than throwing, and the engine never hard-depends on a provider
 * (the brief's "adapters must remain optional; never create hard dependencies").
 */
export interface MonitorWindow { readonly fromMillis: number; readonly toMillis: number; }
export interface MonitorRequest { readonly targetId: string; readonly window: MonitorWindow; readonly transactions: readonly string[]; }

export interface MonitoringAdapter {
  readonly identity: AdapterIdentity;
  /** The provider's noun for an observation, e.g. "Dynatrace metric", "Prometheus series". */
  readonly sourceNoun: string;
  /** Whether this provider also supplies distributed traces (feeds trace intelligence). */
  readonly supportsTracing: boolean;
  /** Collect Execution-Plane metric samples for the load window. May be empty. */
  collect(request: MonitorRequest): readonly RawSample[];
}

/**
 * A monitoring adapter for a provider. In-process it records the request and returns whatever the
 * supplied collector yields (empty by default — no fabricated readings). A hosted APM client is
 * dropped in at exactly this seam in the Execution Plane; the engine cannot tell the difference.
 */
function monitoringAdapterFor(provider: string, sourceNoun: string, supportsTracing: boolean, collector?: (request: MonitorRequest) => readonly RawSample[]): { adapter: MonitoringAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  return {
    journal,
    adapter: {
      identity: { spi: 'MonitoringAdapter', provider, version: '1.0.0' },
      sourceNoun, supportsTracing,
      collect: (request) => {
        journal.record('collect', `${sourceNoun}: ${request.transactions.length} transaction(s), window ${request.window.toMillis - request.window.fromMillis}ms`);
        return collector ? collector(request) : [];
      },
    },
  };
}

export function dynatraceAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('dynatrace', 'Dynatrace metric', true, collector); }
export function appDynamicsAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('appdynamics', 'AppDynamics metric', true, collector); }
export function datadogAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('datadog', 'Datadog metric', true, collector); }
export function newRelicAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('new-relic', 'New Relic metric', true, collector); }
export function azureMonitorAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('azure-monitor', 'Azure Monitor metric', false, collector); }
export function cloudWatchAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('cloudwatch', 'CloudWatch metric', false, collector); }
export function gcpOperationsAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('gcp-operations', 'Cloud Operations metric', false, collector); }
export function prometheusAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('prometheus', 'Prometheus series', false, collector); }
export function grafanaAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('grafana', 'Grafana panel', false, collector); }
export function elasticApmAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('elastic-apm', 'Elastic APM metric', true, collector); }
export function openTelemetryAdapter(collector?: (r: MonitorRequest) => readonly RawSample[]) { return monitoringAdapterFor('opentelemetry', 'OpenTelemetry metric', true, collector); }

export class AdapterError extends Error {
  constructor(public readonly spi: string, message: string) { super(`adapter ${spi}: ${message}`); this.name = 'AdapterError'; }
}

/**
 * Adapter resolution — configuration, never a code path (C-15.x).
 *
 * The load generator is keyed on `perf.tool` and the test-management provider on `perf.provider`,
 * so a tenant may generate k6 scripts and publish to Zephyr without a single code branch. The
 * orchestrator asks for a provider by name and receives an implementation; it cannot name one.
 */
export class PerformanceAdapterRegistry {
  private readonly loadGenerators = new Map<string, LoadGeneratorAdapter>();
  private readonly testManagement = new Map<string, TestManagementAdapter>();
  private readonly monitoring = new Map<string, MonitoringAdapter>();

  registerLoadGenerator(a: LoadGeneratorAdapter): void { this.loadGenerators.set(a.identity.provider, a); }
  registerTestManagement(a: TestManagementAdapter): void { this.testManagement.set(a.identity.provider, a); }
  registerMonitoring(a: MonitoringAdapter): void { this.monitoring.set(a.identity.provider, a); }

  /**
   * Resolve the monitoring adapter — OPTIONAL. An unset `perf.monitor` key returns `null` (no APM
   * configured, the engine runs on load-generated samples). A key set to an unknown provider is a
   * misconfiguration and refuses by name — silence there would hide a typo'd APM binding.
   */
  resolveMonitoring(config: Readonly<Record<string, string>>): MonitoringAdapter | null {
    const provider = (config['perf.monitor'] ?? '').trim();
    if (provider === '') return null;
    const adapter = this.monitoring.get(provider);
    if (!adapter) {
      throw new AdapterError('MonitoringAdapter',
        `no provider "${provider}" for key "perf.monitor"; available: ${[...this.monitoring.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }
  get monitoringProviders(): readonly string[] { return [...this.monitoring.keys()].sort(); }

  resolveLoadGenerator(config: Readonly<Record<string, string>>): LoadGeneratorAdapter {
    const provider = config['perf.tool'] ?? '';
    const adapter = this.loadGenerators.get(provider);
    if (!adapter) {
      throw new AdapterError('LoadGeneratorAdapter',
        `no tool "${provider || '(unset)'}" for key "perf.tool"; available: ${[...this.loadGenerators.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }

  resolveTestManagement(config: Readonly<Record<string, string>>): TestManagementAdapter {
    const provider = config['perf.provider'] ?? '';
    const adapter = this.testManagement.get(provider);
    if (!adapter) {
      throw new AdapterError('TestManagementAdapter',
        `no provider "${provider || '(unset)'}" for key "perf.provider"; available: ${[...this.testManagement.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }

  get loadGeneratorProviders(): readonly string[] { return [...this.loadGenerators.keys()].sort(); }
  get testManagementProviders(): readonly string[] { return [...this.testManagement.keys()].sort(); }
}

/** A registry pre-loaded with every in-process adapter, for tests and the conformance runner. */
export function defaultAdapterRegistry(): PerformanceAdapterRegistry {
  const registry = new PerformanceAdapterRegistry();
  for (const build of [k6Adapter, jmeterAdapter, gatlingAdapter, locustAdapter, playwrightAdapter]) registry.registerLoadGenerator(build().adapter);
  for (const build of [azureDevOpsAdapter, zephyrAdapter, jiraXrayAdapter]) registry.registerTestManagement(build().adapter);
  for (const build of [dynatraceAdapter, appDynamicsAdapter, datadogAdapter, newRelicAdapter, azureMonitorAdapter, cloudWatchAdapter, gcpOperationsAdapter, prometheusAdapter, grafanaAdapter, elasticApmAdapter, openTelemetryAdapter]) registry.registerMonitoring(build().adapter);
  return registry;
}

/** Unused-import guard: the test-case shape the adapter publishes. */
export type PublishableTestCase = Pick<PerformanceTestCase, 'id' | 'name' | 'transactionId'>;
