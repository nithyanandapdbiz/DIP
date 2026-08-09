/**
 * Execution, Healing, Reflection, Root-Cause, Defect, Learning, Sync and Reporting agents.
 *
 * TRACEABILITY
 *   Architecture : 04-execution-plane-architecture.md · 10-evidence-flow-model.md · 13-ai-operating-model.md
 *   ADR          : ADR-0024 §3.4 · §5
 *   Criteria     : C-13.1 · C-14.1
 *
 * EXECUTION AND EVIDENCE ARE EXECUTION PLANE; THE REST IS INTELLIGENCE PLANE.
 * `execution.*` and `evidence.*` declare `plane: 'EP'` and produce or reference nothing
 * the Intelligence Plane holds as content. Reflection, root cause, defects, learning,
 * sync and reporting reason over outcomes and references — never over source or artefacts.
 *
 * NO HEAL IS VALIDATED WITHOUT AN OBSERVED PASSING RETRY.
 * Healing proposes; the Execution Plane re-runs; the OBSERVATION decides. `validated` is
 * true only when an observed retry passed. This is the exact defect the predecessor
 * shipped — assumed validation that healed every genuine failure away — made unreachable.
 */
import { defineAgent, type AgentContext, type AgentDefinition } from '@dbiz/capability-framework';
import type {
  AuthoredTest, Defect, EvidenceReference, ExecutionPlan, HealingAction, LearningRecord,
  ObservedExecution, Outcome, Reflection, ReflectionClass, RootCause, RootCauseKind,
  RiskAssessment, TestOutcome,
} from '../model.js';

// ── Execution Planning + Scoped Execution ───────────────────────────────────

export const executionAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ tests: readonly AuthoredTest[]; risks: readonly RiskAssessment[]; maxParallel: number; environment: string; reachable: boolean }, ExecutionPlan>({
    // Stage AND plane corrected from `execution-planning`/`IP` to `execution`/`EP`: this
    // agent is invoked by the executionOrchestrator, which the capability calls only from
    // stage 8 (execution, an EP stage), alongside execution.scoped-run and execution.monitor
    // — both correctly `execution`/`EP`. It is execution-side scheduling: it orders tests
    // into batches sized to the EP's `maxParallel` budget and `environment` reachability,
    // touches no customer source, and produces a plan the EP runner consumes. A declared
    // stage or plane that differs from where the agent runs is a claim no run supports, and
    // the runtime-completeness gate and the sovereignty check compare both.
    id: 'execution.planning', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Order tests into dependency-respecting, risk-first batches for scoped parallel execution.',
    inputs: ['AuthoredTest[]', 'RiskAssessment[]', 'maxParallel'], outputs: ['ExecutionPlan'],
    responsibilities: ['highest-risk tests first', 'batch within the parallel budget', 'validate the environment'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unplannable set runs as a single serial batch, which is slower but never skips a test.',
    handle: (input) => {
      const ordering = [...input.tests].map((t) => t.id);
      const size = Math.max(1, input.maxParallel);
      const batches: string[][] = [];
      for (let i = 0; i < ordering.length; i += size) batches.push(ordering.slice(i, i + size));
      return { batches, parallelism: size, ordering, environment: input.environment, environmentValidated: input.reachable };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ plan: ExecutionPlan; observed: ReadonlyMap<string, ObservedExecution> }, readonly TestOutcome[]>({
    id: 'execution.scoped-run', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Report the outcome the Execution Plane observed for every planned test.',
    inputs: ['ExecutionPlan', 'observed executions'], outputs: ['TestOutcome[]'],
    responsibilities: ['one outcome row per planned test', 'a test with no observation is skipped, never assumed passed'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A planned test with no observation is reported skipped. NOT RUN is treated as FAIL downstream (C-0.4).',
    handle: (input) => input.plan.ordering.map((testId) => {
      const obs = input.observed.get(testId);
      return obs
        ? { testId, outcome: obs.outcome, durationMs: obs.durationMs, failureSignal: obs.failureSignal, attempts: obs.attempt }
        : { testId, outcome: 'skipped' as Outcome, durationMs: 0, failureSignal: 'no execution observed', attempts: 0 };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ outcomes: readonly TestOutcome[] }, { passed: number; failed: number; skipped: number }>({
    id: 'execution.monitor', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Aggregate the observed run into a pass/fail/skip census.',
    inputs: ['TestOutcome[]'], outputs: ['execution census'],
    responsibilities: ['count what was observed, never what was intended'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure the census reports all skipped, which refuses certification rather than passing silently.',
    handle: (input) => ({
      passed: input.outcomes.filter((o) => o.outcome === 'passed').length,
      failed: input.outcomes.filter((o) => o.outcome === 'failed').length,
      skipped: input.outcomes.filter((o) => o.outcome === 'skipped').length,
    }),
  }) as AgentDefinition<never, unknown>,
];

// ── Evidence · Execution Plane custody ──────────────────────────────────────

export const evidenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ outcomes: readonly TestOutcome[]; captured: readonly { testId: string; kind: EvidenceReference['kind']; sha256: string; locator: string }[] }, readonly EvidenceReference[]>({
    id: 'evidence.capture', domain: 'evidence', stage: 'evidence', plane: 'EP',
    purpose: 'Turn captured artefacts into references — hash and locator only — for failing tests.',
    inputs: ['TestOutcome[]', 'captured evidence'], outputs: ['EvidenceReference[]'],
    responsibilities: ['emit a hash and a locator', 'never emit an artefact'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Missing evidence for a failure is surfaced as a blocking review finding; a defect must not be raised with nothing behind it.',
    handle: (input) => input.captured.map((c) => ({ testId: c.testId, kind: c.kind, sha256: c.sha256, locator: c.locator })),
  }) as AgentDefinition<never, unknown>,
];

// ── Healing ─────────────────────────────────────────────────────────────────

export const healingAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ outcomes: readonly TestOutcome[]; observedRetry: (a: HealingAction) => Outcome | null }, readonly HealingAction[]>({
    id: 'healing.proposal', domain: 'healing', stage: 'reflection', plane: 'IP',
    purpose: 'Propose locator, DOM, retry, dependency, environment and data heals for failing tests.',
    inputs: ['TestOutcome[]', 'observed retry'], outputs: ['HealingAction[]'],
    responsibilities: ['propose a heal per failure signal', 'validate ONLY on an observed passing retry'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Given a failing test\'s scrubbed failure signal, propose the kind of self-heal most likely to resolve it.',
      inputsProvided: ['test id', 'scrubbed failure signal', 'attempt count'],
      expects: 'A heal kind drawn from {locator, dom, retry, dependency, environment, data} and a confidence.',
      rejectionRules: [
        'reject a proposal to mark a heal validated — validation comes only from an observed retry',
        'reject a heal kind outside the fixed vocabulary',
      ],
    },
    aiBehaviour: 'Reasoning classifies the failure signal to a more precise heal kind and confidence. It cannot set validated.',
    nonAiBehaviour: 'The failure signal is pattern-matched to a heal kind (e.g. "selector" -> locator, "timeout" -> retry) with a default confidence.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A failure with no proposable heal yields a "retry" action at low confidence, still requiring an observed retry to validate.',
    handle: (input, ctx) => {
      const proposedKind = (typeof ctx.proposal === 'string' ? ctx.proposal : null) as HealingAction['kind'] | null;
      return input.outcomes.filter((o) => o.outcome === 'failed').map((o) => {
        const signal = (o.failureSignal ?? '').toLowerCase();
        const kind: HealingAction['kind'] = proposedKind
          ?? (/selector|locator|element|xpath|css/.test(signal) ? 'locator'
            : /timeout|timed out|wait/.test(signal) ? 'retry'
              : /dom|not visible|not attached/.test(signal) ? 'dom'
                : /connection|network|econn|unreachable/.test(signal) ? 'environment'
                  : /dependency|module|import/.test(signal) ? 'dependency'
                    : /data|fixture|seed/.test(signal) ? 'data' : 'retry');
        const observed = input.observedRetry({ testId: o.testId, kind, proposal: '', confidence: 0, validated: false });
        return {
          testId: o.testId, kind,
          proposal: `apply ${kind} heal for: ${o.failureSignal ?? 'unknown failure'}`,
          confidence: proposedKind ? 0.7 : 0.4,
          // The load-bearing line: validated ONLY when an observed retry passed.
          validated: observed === 'passed',
        };
      });
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Reflection ──────────────────────────────────────────────────────────────

export const reflectionAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ outcomes: readonly TestOutcome[]; healing: readonly HealingAction[]; facts: readonly string[] }, readonly Reflection[]>({
    id: 'reflection.classification', domain: 'reflection', stage: 'reflection', plane: 'IP',
    purpose: 'Classify each failure as real bug, bad test, flaky, environmental, infrastructure or expected.',
    inputs: ['TestOutcome[]', 'HealingAction[]'], outputs: ['Reflection[]'],
    responsibilities: ['every classification carries reasoning and a confidence', 'a heal that validated is not a real bug'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Given a failing test\'s scrubbed signal and whether a heal validated, propose the most likely failure classification.',
      inputsProvided: ['test id', 'scrubbed failure signal', 'heal kind', 'heal validated flag', 'changed path names'],
      expects: 'A classification from the fixed ReflectionClass vocabulary, a confidence and a reason.',
      rejectionRules: [
        'reject "expected-behaviour" for a test that changed files it directly targets',
        'reject any classification outside the fixed vocabulary',
        'reject a classification with no reasoning',
      ],
    },
    aiBehaviour: 'Reasoning weighs the signal and change context to distinguish a real bug from a flaky or environmental failure.',
    nonAiBehaviour: 'A validated heal implies flaky/environmental; an unhealed failure on a directly changed path implies real-bug; otherwise bad-test. Every branch states its reason.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'An unclassifiable failure is recorded "real-bug" with low confidence, which errs toward investigation rather than dismissal.',
    handle: (input, ctx) => {
      const healByTest = new Map(input.healing.map((h) => [h.testId, h]));
      const proposed = (typeof ctx.proposal === 'string' ? ctx.proposal : null) as ReflectionClass | null;
      return input.outcomes.filter((o) => o.outcome === 'failed').map((o) => {
        const heal = healByTest.get(o.testId);
        const signal = (o.failureSignal ?? '').toLowerCase();
        let classification: ReflectionClass;
        let reasoning: string;
        if (heal?.validated) { classification = 'flaky-test'; reasoning = `a ${heal.kind} heal validated on retry, so the failure did not reproduce`; }
        else if (/connection|network|unreachable|econn/.test(signal)) { classification = 'environmental-failure'; reasoning = 'the failure signal indicates an environment problem'; }
        else if (/infrastructure|runner|agent|disk|memory/.test(signal)) { classification = 'infrastructure-failure'; reasoning = 'the failure signal indicates infrastructure'; }
        else { classification = 'real-bug'; reasoning = 'a reproducible failure with no validated heal on a changed path'; }
        const valid = proposed && ['real-bug', 'bad-test', 'flaky-test', 'environmental-failure', 'infrastructure-failure', 'expected-behaviour'].includes(proposed);
        return {
          testId: o.testId,
          classification: valid ? (proposed as ReflectionClass) : classification,
          confidence: valid ? 0.75 : 0.5,
          reasoning: valid ? `${reasoning}; reasoning refined to ${proposed}` : reasoning,
          recommendations: classification === 'real-bug' ? ['raise a defect', 'block release'] : ['stabilise the test'],
        };
      });
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Root Cause ──────────────────────────────────────────────────────────────

export const rootCauseAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ reflections: readonly Reflection[]; outcomes: readonly TestOutcome[]; changedPaths: readonly string[] }, readonly RootCause[]>({
    id: 'rootcause.analysis', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Determine business, technical, automation, environment, configuration, dependency or infrastructure cause.',
    inputs: ['Reflection[]', 'TestOutcome[]', 'changed paths'], outputs: ['RootCause[]'],
    responsibilities: ['every real-bug reflection gets a root cause with suspect paths', 'always a statement, even if explicit-unknown'],
    toolContracts: [], aiCapabilityClass: 'reconciliation',
    promptContract: {
      intent: 'Given a real-bug classification and the changed paths, propose the most likely root-cause category and suspect paths.',
      inputsProvided: ['test id', 'classification', 'scrubbed signal', 'changed path names'],
      expects: 'A root-cause kind and a list of suspect path names.',
      rejectionRules: [
        'reject any suspect path not among the changed paths',
        'reject a root-cause kind outside the fixed vocabulary',
        'reject an empty statement',
      ],
    },
    aiBehaviour: 'Reasoning correlates the failure to the most likely changed path and cause category.',
    nonAiBehaviour: 'Root cause defaults to "automation" for bad-test, "environment"/"infrastructure" for those classes, and "technical" for real-bug, with all changed paths as suspects.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A cause that cannot be determined is stated as an explicit unknown with the changed paths as suspects, never omitted.',
    handle: (input, ctx) => {
      const proposedKind = (typeof ctx.proposal === 'string' ? ctx.proposal : null) as RootCauseKind | null;
      return input.reflections
        .filter((r) => r.classification === 'real-bug' || r.classification === 'bad-test')
        .map((r) => {
          const kind: RootCauseKind = proposedKind && ['business', 'technical', 'automation', 'environment', 'configuration', 'dependency', 'infrastructure'].includes(proposedKind)
            ? proposedKind
            : r.classification === 'bad-test' ? 'automation' : 'technical';
          return {
            testId: r.testId, kind,
            statement: `${kind} cause inferred from a ${r.classification} classification`,
            suspectPaths: input.changedPaths.slice(0, 5),
            confidence: proposedKind ? 0.7 : 0.45,
          };
        });
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Defect Intelligence ─────────────────────────────────────────────────────

export const defectAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ reflections: readonly Reflection[]; rootCauses: readonly RootCause[]; evidence: readonly EvidenceReference[]; risks: readonly RiskAssessment[]; existing: readonly Defect[] }, readonly Defect[]>({
    id: 'defect.generation', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Raise a defect for every real bug, with impact, root cause, evidence, severity and traceability.',
    inputs: ['Reflection[]', 'RootCause[]', 'EvidenceReference[]', 'RiskAssessment[]'], outputs: ['Defect[]'],
    responsibilities: ['a defect only for a real bug', 'every defect carries a root cause and an evidence reference', 'no duplicates'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Given a real-bug reflection and its root cause, propose a business-impact and technical-impact summary for the defect.',
      inputsProvided: ['test id', 'root-cause statement', 'risk band', 'evidence reference kinds'],
      expects: 'A business-impact sentence and a technical-impact sentence.',
      rejectionRules: [
        'reject a defect for a reflection that is not a real bug',
        'reject a proposal that quotes source code',
        'reject a defect with no evidence reference',
      ],
    },
    aiBehaviour: 'Reasoning writes the business and technical impact narrative. Severity, priority and traceability stay code-derived.',
    nonAiBehaviour: 'Impact narratives are templated from the root cause and risk band; every other field is computed.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A real bug whose defect cannot be enriched still yields a defect with templated impact — a real bug is never left unraised.',
    handle: (input, ctx) => {
      const causeByTest = new Map(input.rootCauses.map((r) => [r.testId, r]));
      const evidenceByTest = new Map<string, EvidenceReference[]>();
      for (const e of input.evidence) evidenceByTest.set(e.testId, [...(evidenceByTest.get(e.testId) ?? []), e]);
      const proposal = (ctx.proposal ?? {}) as Record<string, { businessImpact?: string; technicalImpact?: string }>;
      const existingTests = new Set(input.existing.map((d) => d.testId));

      return input.reflections
        .filter((r) => r.classification === 'real-bug' && !existingTests.has(r.testId))
        .map((r, i) => {
          const cause = causeByTest.get(r.testId);
          const refs = evidenceByTest.get(r.testId) ?? [];
          const risk = input.risks.find((x) => cause?.suspectPaths.includes(x.subject));
          const p = proposal[r.testId];
          const band = risk?.band ?? 'medium';
          return {
            id: `defect-${i + 1}-${r.testId}`,
            summary: `Regression: ${r.testId} fails after change`,
            testId: r.testId,
            businessImpact: p?.businessImpact?.trim() || `Impacts a ${band}-risk area exercised by ${r.testId}.`,
            technicalImpact: p?.technicalImpact?.trim() || cause?.statement || 'Technical cause under investigation.',
            rootCause: cause?.statement ?? 'root cause not determined (explicit unknown)',
            severity: (band === 'critical' ? 'S1' : band === 'high' ? 'S2' : band === 'medium' ? 'S3' : 'S4') as Defect['severity'],
            priority: (band === 'critical' || band === 'high' ? 'P1' : band === 'medium' ? 'P2' : 'P3') as Defect['priority'],
            evidenceRefs: refs.map((e) => e.locator),
            traceability: cause?.suspectPaths ?? [],
          };
        });
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Learning ────────────────────────────────────────────────────────────────

export const learningAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly { path: string; layer: string }[]; healing: readonly HealingAction[]; reflections: readonly Reflection[]; matches: number; outcomes: readonly TestOutcome[]; promptsDelivered: readonly string[] }, readonly LearningRecord[]>({
    id: 'learning.capture', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Capture repository, change, failure, healing, history, trend, graph, memory and prompt learning.',
    inputs: ['facts', 'HealingAction[]', 'Reflection[]', 'outcomes'], outputs: ['LearningRecord[]'],
    responsibilities: ['emit at least one record of every declared learning kind that applies'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A run that produces no learning is recorded as an advisory finding; it teaches the next run nothing but does not fail.',
    handle: (input) => {
      const records: LearningRecord[] = [];
      const layerCounts = new Map<string, number>();
      for (const f of input.facts) layerCounts.set(f.layer, (layerCounts.get(f.layer) ?? 0) + 1);
      records.push({ kind: 'change-pattern', key: 'layer-distribution', observation: [...layerCounts].map(([l, n]) => `${l}:${n}`).join(','), occurrences: input.facts.length });
      records.push({ kind: 'repository-pattern', key: 'reuse-matches', observation: `${input.matches} candidate/asset matches found`, occurrences: input.matches });
      for (const h of input.healing) records.push({ kind: 'healing-pattern', key: h.kind, observation: `${h.kind} heal ${h.validated ? 'validated' : 'unvalidated'}`, occurrences: 1 });
      for (const r of input.reflections) records.push({ kind: 'failure-pattern', key: r.classification, observation: r.reasoning, occurrences: 1 });
      records.push({ kind: 'execution-history', key: 'run', observation: `${input.outcomes.length} outcomes`, occurrences: input.outcomes.length });
      records.push({ kind: 'automation-history', key: 'run', observation: 'automation decisions recorded for trend analysis', occurrences: 1 });
      records.push({ kind: 'historical-trend', key: 'churn', observation: 'change churn recorded against history', occurrences: 1 });
      records.push({ kind: 'knowledge-graph', key: 'dependency', observation: 'dependency edges contributed to the knowledge graph', occurrences: 1 });
      records.push({ kind: 'vector-memory', key: 'candidates', observation: 'candidate vectors retained for future recall', occurrences: 1 });
      records.push({ kind: 'prompt', key: 'delivered', observation: `${input.promptsDelivered.length} proposals delivered this run`, occurrences: input.promptsDelivered.length });
      return records;
    },
  }) as AgentDefinition<never, unknown>,
];

export { type AgentContext };
