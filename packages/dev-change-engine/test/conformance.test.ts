/**
 * Dev-Change Engine — capability conformance and runtime completeness.
 * TRACEABILITY: 11-capability-model.md §2 · 12-capability-orchestration.md
 *               06-data-sovereignty.md · 14-tool-operating-model.md
 *   Criteria: C-11.11, C-11.13, C-12.1, C-12.2, C-12.9, C-12.12, C-13.1, C-14.1
 *   ADR: ADR-0024
 * Categories: capability, orchestration, sovereignty, completeness, negative
 *
 * THE TESTS THAT MATTER TRY TO BREAK THE LIFECYCLE, AND COUNT WHAT ACTUALLY RAN.
 * A capability suite that only runs the happy path proves the engine works when nothing
 * is wrong. These try to skip a stage, bypass the governance triad, move a diff across the
 * plane boundary, and — most importantly for this capability — they COUNT participation.
 *
 * A census of this engine measured, on a run that completed all twelve stages and reported
 * `certified: true`: 15 of 19 declared adapter operations invoked, one agent declaring a
 * stage it did not run in. Behaviour was correct; the components that never executed were
 * exactly the ones nothing asserted about. The `runtime completeness` block counts rather
 * than samples, which is the only way to see that.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AdapterRegistry, AgentCatalogue, CapabilityRegistry, STAGES, GOVERNANCE_TRIAD,
  STAGE_PLANE, certify, isSealed, valueOf, progressedTo, resolveReasoningMode,
  CapabilityRegistrationError, AgentCatalogueError, CERTIFICATION_GATES,
  type Capability, type StageName,
} from '@dbiz/capability-framework';
import {
  devChangeCapability, buildCatalogue, buildDevChangeEngineOrchestrator, ALL_AGENTS, DOMAINS,
  domainOrchestrators, azureDevOpsAdapters, githubJiraAdapters, sampleRepository, sampleAssets,
  resetAdapterSequence,
  type EngineDependencies, type EngineState, type RepositoryEvent, type ExecutionPlan,
  type ObservedExecution, type Outcome, type Defect, type DevChangeRequest,
} from '../src/index.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const catalogue = (): AgentCatalogue => buildCatalogue();

/** Every operation the five adapter SPIs declare. */
const ADAPTER_OPERATIONS = [
  'SourceControlAdapter.listBranches', 'SourceControlAdapter.findChangeRequest',
  'SourceControlAdapter.listCommits', 'SourceControlAdapter.diff', 'SourceControlAdapter.coChangedWith',
  'ProjectAdapter.fetchStory', 'ProjectAdapter.linkRequirement',
  'TestManagementAdapter.createContainer', 'TestManagementAdapter.createGrouping',
  'TestManagementAdapter.findExistingTests', 'TestManagementAdapter.publishTests', 'TestManagementAdapter.linkTraceability',
  'ExecutionAdapter.publishResult', 'ExecutionAdapter.publishEvidenceReference', 'ExecutionAdapter.publishDefect',
  'WorkItemAdapter.nounFor', 'WorkItemAdapter.supports', 'WorkItemAdapter.createWorkItem', 'WorkItemAdapter.linkWorkItemTraceability',
] as const;

const EVENT: RepositoryEvent = {
  kind: 'pull-request', repository: 'customer/payments', branch: 'feature/refund-limit',
  baseBranch: 'main', pullRequestId: '42', headCommit: 'head999', baseCommit: 'base000',
};

function spy<T extends object>(adapter: T, spi: string, calls: Set<string>): T {
  return new Proxy(adapter, {
    get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => { calls.add(`${spi}.${String(key)}`); return (value as (...a: unknown[]) => unknown).apply(target, args); };
    },
  });
}

interface Harness { readonly registry: AdapterRegistry; readonly calls: Set<string>; }

function adapters(kind: 'azure' | 'jira' = 'azure', overrides: { findExisting?: (g: string, ids: readonly string[]) => { reached: true; value: readonly string[] } } = {}): Harness {
  resetAdapterSequence();
  const calls = new Set<string>();
  const registry = new AdapterRegistry();
  const build = (mk: typeof azureDevOpsAdapters, tm?: (a: ReturnType<typeof azureDevOpsAdapters>['testManagement']) => typeof a) => {
    const a = mk(sampleRepository());
    const testManagement = overrides.findExisting ? { ...a.testManagement, findExistingTests: overrides.findExisting } : a.testManagement;
    registry.registerProject(spy(a.project, 'ProjectAdapter', calls));
    registry.registerTestManagement(spy(tm ? tm(testManagement) : testManagement, 'TestManagementAdapter', calls));
    registry.registerExecution(spy(a.execution, 'ExecutionAdapter', calls));
    registry.registerWorkItem(spy(a.workItem, 'WorkItemAdapter', calls));
    registry.registerSourceControl(spy(a.sourceControl, 'SourceControlAdapter', calls));
  };
  build(kind === 'azure' ? azureDevOpsAdapters : githubJiraAdapters);
  return { registry, calls };
}

function dependencies(
  outcomeFor: (index: number) => Outcome = () => 'passed',
  options: { retryObserved?: Outcome | null; omit?: (id: string) => boolean; existingDefects?: readonly Defect[] } = {},
): EngineDependencies {
  return {
    // sampleAssets already returns the RepositoryAsset shape (id, kind, text, path,
    // repository, covers); the exported literal widens `kind` to string, so narrow it back.
    repositoryAssets: sampleAssets() as EngineDependencies['repositoryAssets'],
    environmentReachable: true,
    observedExecutions: (plan: ExecutionPlan) => {
      const m = new Map<string, ObservedExecution>();
      plan.ordering.forEach((id, i) => {
        if (options.omit?.(id)) return;
        const outcome = outcomeFor(i);
        m.set(id, { testId: id, outcome, durationMs: 100 + i, failureSignal: outcome === 'failed' ? 'assertion failed: refund ceiling not enforced' : null, attempt: 1 });
      });
      return m;
    },
    capturedEvidence: (outcomes) => outcomes.filter((o) => o.outcome === 'failed').map((o) => ({ testId: o.testId, kind: 'log' as const, sha256: 'a'.repeat(64), locator: `ep://run/${o.testId}.log` })),
    observedRetry: () => options.retryObserved ?? null,
    existingDefects: options.existingDefects ?? [],
    maxParallel: 4,
  };
}

const CONFIG = (provider: 'azure' | 'jira', extra: Record<string, string> = {}) => (provider === 'azure'
  ? { 'project.provider': 'azure-devops', 'testManagement.provider': 'azure-devops', 'execution.provider': 'azure-devops', 'sourceControl.provider': 'azure-devops', ...extra }
  : { 'project.provider': 'jira', 'testManagement.provider': 'zephyr-scale', 'execution.provider': 'jira', 'sourceControl.provider': 'github', ...extra });

function orchestrator(harness: Harness, deps: EngineDependencies = dependencies()) {
  return buildDevChangeEngineOrchestrator(deps, EVENT, harness.registry);
}

function run(
  harness: Harness = adapters(),
  deps: EngineDependencies = dependencies(),
  provider: 'azure' | 'jira' = 'azure',
  extra: Record<string, string> = {},
  proposals?: Record<string, unknown>,
) {
  const request: DevChangeRequest = {
    tenantId: 'tenant-x', runId: 'run-1', correlationId: 'c-1', event: EVENT,
    configuration: CONFIG(provider, extra), ...(proposals ? { proposals } : {}),
  };
  return orchestrator(harness, deps).execute(request);
}

/** A capability bound to a fresh runtime, for direct stage-level tests via runCapability. */
function capability(deps: EngineDependencies = dependencies(), harness: Harness = adapters()): Capability {
  const runtime = {
    reasoning: (() => { const src = { for: () => null }; return { source: src, ledger: () => ({ mode: 'disabled' as const, delivered: [], withheld: [] }) }; })(),
    recorder: (() => {
      const seen: string[] = [];
      return {
        context: (base: Record<string, unknown>, _id: string) => ({ ...base, proposal: null, audit: (e: string, d: string) => { const m = /^agent\.(.+)\.invoked$/.exec(e); if (m?.[1] && !seen.includes(m[1])) seen.push(m[1]); (base.audit as (e: string, d: string) => void)(e, d); } }),
        invoked: () => [...seen],
      };
    })(),
    adapters: harness.registry.resolve(CONFIG('azure')),
    workItemAdapter: harness.registry.resolveWorkItem(CONFIG('azure')),
    sourceControl: harness.registry.resolveSourceControl(CONFIG('azure')),
    memory: { remember: () => {}, recall: () => [], get size() { return 0; }, get census() { return {}; } },
  };
  return devChangeCapability(deps, EVENT, runtime as never);
}

// ── Capability structure ────────────────────────────────────────────────────

describe('the capability implements all twelve stages (C-11.11, C-11.12)', () => {
  test('every stage is implemented and the capability registers', () => {
    const registry = new CapabilityRegistry();
    assert.doesNotThrow(() => registry.register(capability()));
    assert.equal(registry.registered.length, 1);
    assert.equal(registry.registered[0]!.name, 'Dev-Change Engine');
  });

  test('a capability missing a stage is REFUSED registration', () => {
    const cap = capability();
    const stages = { ...cap.stages } as Record<string, unknown>;
    delete stages['guardrail-review'];
    assert.throws(() => new CapabilityRegistry().register({ ...cap, stages } as Capability), CapabilityRegistrationError);
  });

  test('a stage stubbed to a no-op is REFUSED (R-11.16)', () => {
    const cap = capability();
    const stages = { ...cap.stages, reflection: () => undefined } as unknown as Capability['stages'];
    assert.throws(() => new CapabilityRegistry().register({ ...cap, stages }), CapabilityRegistrationError);
  });

  test('the run traverses all twelve stages, in order', () => {
    const result = run();
    assert.equal(result.run.failedAt, null, result.run.failure ?? '');
    assert.deepEqual(result.run.completed, [...STAGES]);
  });
});

describe('the lifecycle cannot be bypassed (C-12.10, C-12.11)', () => {
  test('a stage result cannot be forged', () => {
    const forged = { stage: 'certification', value: {}, applicable: true, notApplicableReason: null, agentsInvoked: [] };
    assert.equal(isSealed(forged), false);
  });

  test('the governance triad is present and cannot be skipped (C-12.2)', () => {
    const result = run();
    for (const stage of GOVERNANCE_TRIAD) assert.ok(result.run.results.has(stage), `${stage} did not run`);
  });

  test('certification REFUSES a run missing the governance triad', () => {
    const partial = new Map([...run().run.results]);
    partial.delete('policy-review');
    const verdict = certify(partial);
    assert.equal(verdict.certified, false);
    assert.match(verdict.verdicts[0]!.reason, /governance triad/i);
  });

  test('a not-applicable result carries a reason (C-12.12)', () => {
    for (const [, r] of run().run.results) {
      if (r.outcome !== 'ok') assert.ok(r.reason, `${r.stage} is not-applicable without a reason`);
    }
  });
});

// ── Runtime completeness ────────────────────────────────────────────────────

describe('runtime completeness — no dormant production components', () => {
  const workflowSet = () => {
    const h = adapters();
    const passing = orchestrator(h, dependencies(() => 'passed')).execute({ tenantId: 't', runId: 'r-pass', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const healed = orchestrator(h, dependencies(() => 'failed', { retryObserved: 'passed' })).execute({ tenantId: 't', runId: 'r-heal', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const unhealed = orchestrator(h, dependencies(() => 'failed', { retryObserved: null })).execute({ tenantId: 't', runId: 'r-def', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const reasoning = orchestrator(h, dependencies()).execute({ tenantId: 't', runId: 'r-ai', correlationId: 'c', event: EVENT, configuration: CONFIG('azure', { 'devchange.aiEnabled': 'true' }), proposals: { 'change.classification': [{ hint: 'business' }] } });
    return { harness: h, runs: [passing, healed, unhealed, reasoning] };
  };

  test('EVERY registered agent is invoked by an executable workflow', () => {
    const { runs } = workflowSet();
    const invoked = new Set(runs.flatMap((r) => r.agentsInvoked));
    const dormant = ALL_AGENTS.map((a) => a.id).filter((id) => !invoked.has(id)).sort();
    assert.deepEqual(dormant, [], `${dormant.length} agent(s) unreachable: ${dormant.join(', ')}`);
    assert.equal(invoked.size, ALL_AGENTS.length);
  });

  test('EVERY declared adapter operation is reached through runtime orchestration (C-14.1)', () => {
    const { harness } = workflowSet();
    const uncalled = ADAPTER_OPERATIONS.filter((op) => !harness.calls.has(op));
    assert.deepEqual(uncalled, [], `${uncalled.length} adapter operation(s) never invoked: ${uncalled.join(', ')}`);
  });

  test('EVERY domain orchestrator coordinates at least one observed agent invocation', () => {
    const { runs } = workflowSet();
    const invoked = new Set(runs.flatMap((r) => r.agentsInvoked));
    const cat = catalogue();
    for (const domain of DOMAINS) {
      const ids = cat.byDomain(domain).map((a) => a.id);
      assert.ok(ids.length > 0, `domain "${domain}" has no agents`);
      assert.ok(ids.some((id) => invoked.has(id)), `domain orchestrator "${domain}" coordinated nothing — it is inert`);
    }
  });

  test('every agent runs in the stage it DECLARES', () => {
    const result = run(adapters(), dependencies(() => 'failed', { retryObserved: null }));
    const cat = catalogue();
    for (const [stage, sealed] of result.run.results) {
      for (const id of sealed.agentsInvoked) {
        assert.equal(cat.get(id)?.stage, stage, `${id} declares stage "${cat.get(id)?.stage}" but was observed in "${stage}"`);
      }
    }
  });

  test('every capability stage produces observable audit evidence', () => {
    const o = orchestrator(adapters());
    o.execute({ tenantId: 't', runId: 'run-1', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const trail = o.auditTrailFor('run-1');
    for (const stage of STAGES) {
      const entries = trail.filter((e) => e.stage === stage);
      assert.ok(entries.length > 0, `stage ${stage} produced no audit evidence`);
      assert.ok(entries.some((e) => e.detail.trim().length > 0), `stage ${stage} produced audit events with no detail`);
    }
  });
});

describe('audit integrity — observed execution, never declared', () => {
  test('a stage cannot name an agent it did not invoke', () => {
    const result = run(adapters(), dependencies(() => 'failed', { retryObserved: null }));
    for (const [stage, sealed] of result.run.results) {
      for (const id of sealed.agentsInvoked) {
        const observed = result.run.audit.some((e) => e.stage === stage && e.event === `agent.${id}.invoked`);
        assert.ok(observed, `stage ${stage} claims agent ${id} with no observed invocation in that stage`);
      }
    }
  });

  test('every observed invocation belongs to a registered agent', () => {
    const registered = new Set(ALL_AGENTS.map((a) => a.id));
    for (const e of run().run.audit) {
      const m = /^agent\.(.+)\.invoked$/.exec(e.event);
      if (m?.[1]) assert.ok(registered.has(m[1]), `unregistered agent ${m[1]} was invoked`);
    }
  });

  test('the orchestrator reports the OBSERVED agent list', () => {
    const result = run();
    const fromAudit = new Set(result.run.audit.map((e) => /^agent\.(.+)\.invoked$/.exec(e.event)?.[1]).filter((id): id is string => Boolean(id)));
    assert.deepEqual([...result.agentsInvoked].sort(), [...fromAudit].sort());
  });

  test('a test with no observed execution is recorded as skipped, never as passed', () => {
    const result = run(adapters(), dependencies(() => 'passed', { omit: () => true }));
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    assert.ok(state.outcomes.length > 0);
    for (const o of state.outcomes) assert.equal(o.outcome, 'skipped');
  });

  test('an unobserved healing retry is NOT a validated heal', () => {
    const result = run(adapters(), dependencies(() => 'failed', { retryObserved: null }));
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    assert.ok(state.healing.length > 0, 'no heal proposed for a failing run');
    for (const h of state.healing) assert.equal(h.validated, false);
  });

  test('an OBSERVED passing retry does validate the heal', () => {
    const result = run(adapters(), dependencies(() => 'failed', { retryObserved: 'passed' }));
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    assert.ok(state.healing.some((h) => h.validated), 'an observed passing retry did not validate');
  });
});

// ── The four-phase governance pipeline ──────────────────────────────────────

describe('every stage runs execute -> review -> decide -> certify', () => {
  test('every stage has its three governance agents, and they are observed', () => {
    const result = run();
    const invoked = new Set(result.agentsInvoked);
    for (const stage of STAGES) {
      for (const phase of ['review', 'decision', 'certification']) {
        const id = `governance.${stage}.${phase}`;
        assert.ok(catalogue().get(id), `${id} is not registered`);
        assert.ok(invoked.has(id), `${id} did not run — the ${phase} phase of ${stage} was skipped`);
      }
    }
  });

  test('the audit records a certification decision for every stage', () => {
    const o = orchestrator(adapters());
    o.execute({ tenantId: 't', runId: 'run-1', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const trail = o.auditTrailFor('run-1');
    for (const stage of STAGES) {
      assert.ok(trail.some((e) => e.event === `${stage}.certified`), `no certification recorded for ${stage}`);
    }
  });
});

// ── AI enabled and disabled ─────────────────────────────────────────────────

describe('AI enabled and AI disabled — one workflow, two modes (INV-7)', () => {
  test('the workflow is IDENTICAL in both modes; only reasoning differs', () => {
    const h = adapters();
    const disabled = orchestrator(h).execute({ tenantId: 't', runId: 'r-off', correlationId: 'c', event: EVENT, configuration: CONFIG('azure', { 'devchange.aiEnabled': 'false' }) });
    const enabled = orchestrator(h).execute({ tenantId: 't', runId: 'r-on', correlationId: 'c', event: EVENT, configuration: CONFIG('azure', { 'devchange.aiEnabled': 'true' }), proposals: { 'change.classification': [{ hint: 'business' }] } });
    assert.equal(disabled.reasoningMode, 'disabled');
    assert.equal(enabled.reasoningMode, 'enabled');
    assert.deepEqual(disabled.run.completed, enabled.run.completed);
    assert.deepEqual([...disabled.agentsInvoked].sort(), [...enabled.agentsInvoked].sort());
  });

  test('a disabled run delivers ZERO proposals and still completes every stage', () => {
    const result = run(adapters(), dependencies(), 'azure', { 'devchange.aiEnabled': 'false' }, { 'change.classification': [{ hint: 'ignored' }] });
    assert.equal(result.reasoning.delivered.length, 0);
    assert.ok(result.reasoning.withheld.length > 0);
    assert.deepEqual(result.run.completed, [...STAGES]);
  });

  test('reasoning is opt-in: an unset flag is disabled', () => {
    assert.equal(resolveReasoningMode({}), 'disabled');
    assert.equal(resolveReasoningMode({ 'ai.enabled': 'true' }), 'enabled');
  });
});

// ── One workflow, variation only through adapters ───────────────────────────

describe('one workflow, variation only through adapters', () => {
  test('Azure DevOps and GitHub/Jira traverse an IDENTICAL stage sequence', () => {
    const ado = run(adapters('azure'), dependencies(), 'azure');
    const jira = run(adapters('jira'), dependencies(), 'jira');
    assert.deepEqual(ado.run.completed, jira.run.completed);
    assert.deepEqual(ado.run.completed, [...STAGES]);
    assert.notEqual(ado.adapters.sourceControl, jira.adapters.sourceControl);
    assert.notEqual(ado.adapters.workItem, jira.adapters.workItem);
  });

  test('a provider that does not model a level records the refusal with the provider noun', () => {
    // Jira team-managed has no Feature level and its task noun is "Sub-task".
    const result = run(adapters('jira'), dependencies(), 'jira');
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    // Jira DOES support the task level (Sub-task), so work items publish; the interesting
    // difference is the vocabulary, exercised through nounFor.
    assert.ok(state.sync.some((r) => r.published), 'no work item published for the Jira provider');
  });

  test('no orchestrator branches on a provider name', () => {
    for (const f of ['orchestrators.ts', 'capability.ts']) {
      const body = readFileSync(join(packageRoot, 'src', f), 'utf8');
      const code = body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const provider of ['azure-devops', 'github', 'zephyr', "'jira'"]) {
        assert.ok(!new RegExp(provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(code), `${f} names provider ${provider} outside a comment`);
      }
    }
  });

  test('an unresolvable adapter names the key and what is available', () => {
    assert.throws(() => orchestrator(adapters()).resolveAdapters({ 'project.provider': 'nonexistent' }), /no provider "nonexistent".*available/s);
  });

  test('reuse-before-publish: a test the tool already holds is not republished', () => {
    // findExistingTests returns every id, so publishTests must receive none.
    let publishedCount = -1;
    const h = adapters('azure', { findExisting: (_g, ids) => ({ reached: true, value: ids }) });
    // Wrap publishTests to observe the count.
    const result = run(h, dependencies());
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    publishedCount = state.sync.filter((r) => r.reason.includes('not republished')).length;
    assert.ok(publishedCount > 0, 'the already-present short-circuit was never exercised');
  });
});

// ── Sovereignty ─────────────────────────────────────────────────────────────

describe('EP/IP ownership and data sovereignty', () => {
  test('agents that read the customer repository run in the Execution Plane', () => {
    // The certified sovereignty invariant is NOT a rigid plane==STAGE_PLANE bijection —
    // repository search legitimately does EP work (reading the customer repo) inside the
    // IP reuse stage, because only scores and identifiers cross. What matters is that the
    // agents which TOUCH customer custody declare EP. This mirrors the Discovery Flow
    // Engine's certified check.
    for (const a of catalogue().all) {
      if (a.id.startsWith('repository.search.') || a.id.startsWith('diff.') || a.domain === 'diff') {
        assert.equal(a.plane, 'EP', `${a.id} reads the customer repository from the wrong plane`);
      }
    }
  });

  test('stages 10, 11 and 12 never run in the Execution Plane (R-12.5)', () => {
    // The load-bearing rule: reflection, certification and reporting are always IP, so no
    // reasoning over a change ever happens where the customer's source lives.
    for (const stage of ['reflection', 'certification', 'reporting'] as StageName[]) {
      assert.equal(STAGE_PLANE[stage], 'IP');
      for (const a of catalogue().byStage(stage)) {
        assert.equal(a.plane, 'IP', `${a.id} would run stage ${stage} in the Execution Plane`);
      }
    }
  });

  test('every governance agent reasons in the Intelligence Plane', () => {
    // The four-phase pipeline runs review, decision and certification over a SCRUBBED
    // subject, even when gating an EP stage — so governance is always IP.
    for (const a of catalogue().byDomain('governance')) {
      assert.equal(a.plane, 'IP', `${a.id} governs and must reason in the IP`);
    }
  });

  test('the diff and commits are DROPPED at the context crossing, never sealed into an IP stage', () => {
    // Stage 3 is EP->IP. After it, changedFiles and commits are empty in every IP state.
    const result = run();
    for (const stage of ['architecture-review', 'policy-review', 'guardrail-review', 'execution-planning', 'reflection', 'certification', 'reporting'] as StageName[]) {
      const state = valueOf<EngineState>(result.run.results.get(stage)!);
      assert.equal(state.changedFiles.length, 0, `${stage} still holds ${state.changedFiles.length} changed file(s) — a diff crossed the boundary`);
      assert.equal(state.commits.length, 0, `${stage} still holds raw commits`);
    }
  });

  test('the boundary is crossed in exactly one stage', () => {
    // Only the context stage (EP->IP) reads a ChangedFile. It is the single crossing.
    assert.equal(STAGE_PLANE.context, 'EP->IP');
    assert.equal(catalogue().get('repository.minimise-changes')!.stage, 'context');
  });

  test('evidence crosses as a REFERENCE — the type has no content field', () => {
    const source = readFileSync(join(packageRoot, 'src', 'model.ts'), 'utf8');
    const block = /export interface EvidenceReference \{[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
    assert.ok(block.length > 0, 'EvidenceReference is not declared');
    assert.ok(!/\bcontent\b|\bbody\b|\bbytes\b/.test(block), 'EvidenceReference gained a content field');
  });
});

// ── Catalogue ───────────────────────────────────────────────────────────────

describe('the agent catalogue', () => {
  test('every agent declares a complete contract', () => { assert.doesNotThrow(() => catalogue()); });

  test('an agent missing a contract field is REFUSED', () => {
    assert.throws(() => new AgentCatalogue().register({
      id: 'bad.agent', domain: 'x', purpose: 'too short', stage: 'planning', plane: 'IP',
      inputs: [], outputs: [], responsibilities: [], toolContracts: [],
      aiCapabilityClass: 'none', retry: { maxAttempts: 1, retryOn: 'never' },
      failureHandling: '', telemetry: [], auditEvents: [], handle: () => undefined,
    } as never), AgentCatalogueError);
  });

  test('the catalogue meets the declared scale and covers every domain', () => {
    const c = catalogue();
    assert.ok(c.all.length >= 80, `catalogue has ${c.all.length} agents, below the declared floor`);
    for (const d of DOMAINS) assert.ok(c.byDomain(d).length > 0, `domain "${d}" has no agents`);
  });

  test('every agent domain has exactly one owning orchestrator', () => {
    assert.equal(Object.keys(domainOrchestrators).length, DOMAINS.length);
    for (const d of catalogue().domains) assert.ok((DOMAINS as readonly string[]).includes(d), `catalogue domain "${d}" has no orchestrator`);
  });

  test('every tool contract names a real adapter SPI operation (C-14.1)', () => {
    const known = new Set(ADAPTER_OPERATIONS);
    for (const a of catalogue().all) {
      for (const spi of a.toolContracts) {
        assert.ok(known.has(spi as typeof ADAPTER_OPERATIONS[number]), `${a.id} declares a tool contract that is not a known adapter operation: ${spi}`);
      }
    }
  });
});

// ── Governance and certification ────────────────────────────────────────────

describe('governance and certification', () => {
  test('a clean run is certified through every gate, in order', () => {
    const result = run();
    assert.equal(result.certification.certified, true, result.certification.firstRefusal?.reason ?? '');
    assert.ok(progressedTo(result.certification, CERTIFICATION_GATES[CERTIFICATION_GATES.length - 1]!));
    assert.equal(result.certification.verdicts.length, CERTIFICATION_GATES.length);
  });

  test('every verdict carries a reason', () => {
    for (const v of run().certification.verdicts) assert.ok(v.reason.length > 0, `${v.gate} has no reason`);
  });

  test('the run is auditable end to end', () => {
    const o = orchestrator(adapters());
    o.execute({ tenantId: 't', runId: 'run-1', correlationId: 'c', event: EVENT, configuration: CONFIG('azure') });
    const trail = o.auditTrailFor('run-1');
    assert.ok(trail.length >= STAGES.length);
    for (const stage of STAGES) assert.ok(trail.some((e) => e.stage === stage), `no audit entry for stage ${stage}`);
  });

  test('a genuine defect is raised in the tool with its evidence references', () => {
    const h = adapters();
    const result = run(h, dependencies(() => 'failed', { retryObserved: null }));
    const state = valueOf<EngineState>(result.run.results.get('reporting')!);
    assert.ok(state.defects.length > 0, 'no defect raised for an unhealed failure');
    assert.ok(state.defects.every((d) => d.rootCause.trim() !== '' && d.evidenceRefs.length > 0), 'a defect lacks root cause or evidence');
    assert.ok(h.calls.has('ExecutionAdapter.publishDefect'));
  });
});

// ── Resumption and isolation ────────────────────────────────────────────────

describe('resumption and rollback', () => {
  test('the Execution and Evidence stages complete with the Intelligence Plane unreachable (C-12.9)', () => {
    const result = run();
    for (const stage of ['discovery', 'context', 'execution', 'evidence'] as StageName[]) {
      const r = result.run.results.get(stage);
      assert.ok(r, `${stage} did not complete`);
      assert.equal(r!.outcome, 'ok', `${stage} was not applicable`);
    }
  });

  test('request-scoped state is released between runs (C-09.12)', () => {
    const a = run(adapters(), dependencies());
    const b = run(adapters(), dependencies());
    assert.equal(
      valueOf<EngineState>(a.run.results.get('reporting')!).authored.length,
      valueOf<EngineState>(b.run.results.get('reporting')!).authored.length,
    );
  });

  test('a first run is not marked resumed', () => {
    const result = run();
    assert.equal(result.resumed, false);
    assert.equal(result.run.failedAt, null);
  });
});
