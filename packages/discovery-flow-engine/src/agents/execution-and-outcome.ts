/**
 * Execution, Healing, Defect, Synchronization, Reporting and Learning.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0023 · ADR-0019 (evidence over assertion)
 *   Criteria     : C-14.1 (tools reached through an adapter SPI)
 *   Evidence     : E-5 (no customer artefact retained in the Intelligence Plane)
 *
 * PUBLICATION HAPPENS, OR IT IS RECORDED AS NOT HAVING HAPPENED.
 * Every synchronization agent calls its adapter and returns `SyncRecord`s carrying the
 * provider-assigned identifier. `published: false` always carries a reason. A count of
 * things that "would be" published is not synchronization, and the audit of the first
 * capability found exactly that: three agents returning counts and no adapter call.
 *
 * A HEAL IS VALIDATED BY AN OBSERVED RETRY, NEVER BY ASSUMPTION.
 * `healing.validation` takes the retry outcome as an input from the Execution Plane. The
 * first implementation of the predecessor capability hardcoded a passing retry, so every
 * proposed heal validated and every genuine failure vanished — inside the agent whose
 * whole purpose is preventing that.
 */
import {
  defineAgent, VectorMemory,
  type AgentDefinition, type ExecutionAdapter, type ProjectAdapter, type TestManagementAdapter,
} from '@dbiz/capability-framework';
import {
  type ApplicationIntelligence, type AutomationAsset, type Defect, type DiscoveryReport,
  type EvidenceReference, type ExecutionPlan, type HealingAction, type HealingKind,
  type Journey, type LearningRecord, type Outcome, type QaAsset, type RepositoryMatch,
  type RiskLevel, type SyncRecord, type TestOutcome, type VirtualStory,
  fingerprint, norm,
} from '../model.js';
import { renderPdf, executivePages, boardReport } from './report.js';

// ── Execution Intelligence — Execution Plane ────────────────────────────────

export const executionAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ assets: readonly QaAsset[]; stories: readonly VirtualStory[] }, ExecutionPlan>({
    id: 'execution.planner', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Order QA assets into batches that respect story dependencies.',
    inputs: ['QaAsset[]', 'VirtualStory[]'], outputs: ['ExecutionPlan'],
    responsibilities: ['never schedule a dependent before its dependency'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unplannable set runs as a single sequential batch — slow, and always correct.',
    handle: (input) => {
      const depth = new Map<string, number>();
      const storyById = new Map(input.stories.map((s) => [s.id, s]));
      const depthOf = (id: string, seen = new Set<string>()): number => {
        if (depth.has(id)) return depth.get(id) as number;
        if (seen.has(id)) return 0;
        seen.add(id);
        const story = storyById.get(id);
        const d = story && story.dependsOn.length > 0
          ? 1 + Math.max(...story.dependsOn.map((p) => depthOf(p, seen)))
          : 0;
        depth.set(id, d);
        return d;
      };

      const byDepth = new Map<number, string[]>();
      for (const asset of input.assets) {
        const d = depthOf(asset.storyId);
        byDepth.set(d, [...(byDepth.get(d) ?? []), asset.id]);
      }
      return {
        batches: [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids.sort()),
        parallelism: 1, environment: 'discovery target environment', environmentValidated: false,
      };
    },
  }),

  defineAgent<{ plan: ExecutionPlan; maxParallel: number }, ExecutionPlan>({
    id: 'execution.batch-optimiser', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Balance batch sizes so no single batch dominates the run.',
    inputs: ['ExecutionPlan'], outputs: ['ExecutionPlan'],
    responsibilities: ['preserve batch order', 'never merge across dependency depths'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unoptimised plan runs as given; optimisation affects duration only, never correctness.',
    handle: (input) => {
      const size = Math.max(1, input.maxParallel);
      // Splitting WITHIN a depth is safe; merging ACROSS depths would run a dependent
      // alongside its dependency, which is the one thing the plan exists to prevent.
      const batches = input.plan.batches.flatMap((batch) => {
        const chunks: string[][] = [];
        for (let i = 0; i < batch.length; i += size) chunks.push(batch.slice(i, i + size));
        return chunks.length > 0 ? chunks : [[]];
      }).filter((b) => b.length > 0);
      return { ...input.plan, batches };
    },
  }),

  defineAgent<{ plan: ExecutionPlan; maxParallel: number }, ExecutionPlan>({
    id: 'execution.parallel-scheduler', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Set the parallelism the target environment will tolerate.',
    inputs: ['ExecutionPlan'], outputs: ['ExecutionPlan'],
    responsibilities: ['never exceed the declared ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable parallelism is 1. Sequential execution is slow; an overloaded customer environment is an incident.',
    handle: (input) => ({ ...input.plan, parallelism: Math.max(1, Math.min(input.maxParallel, 8)) }),
  }),

  defineAgent<{ plan: ExecutionPlan; reachable: boolean }, ExecutionPlan>({
    id: 'execution.environment-validation', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Confirm the target environment is reachable before anything runs.',
    inputs: ['ExecutionPlan', 'reachability'], outputs: ['ExecutionPlan'],
    responsibilities: ['refuse to mark validated without an observation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unvalidated environment stops execution. Running against an unreachable target produces failures that look like defects.',
    handle: (input) => {
      if (!input.reachable) throw new Error('the target environment did not respond; execution would produce false failures');
      return { ...input.plan, environmentValidated: true };
    },
  }),

  defineAgent<{ plan: ExecutionPlan; observed: readonly TestOutcome[] }, readonly TestOutcome[]>({
    id: 'execution.runner', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Return the outcomes observed for the planned assets, and only for those.',
    inputs: ['ExecutionPlan', 'observed outcomes'], outputs: ['TestOutcome[]'],
    responsibilities: ['refuse an outcome for an unplanned asset', 'refuse to invent an outcome'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An asset with no observed outcome is reported as NOT RUN, which the platform treats as a failure (C-0.4), never as a pass.',
    handle: (input) => {
      const planned = new Set(input.plan.batches.flat());
      const byId = new Map(input.observed.map((o) => [o.qaAssetId, o]));
      // Every planned asset produces a row. An asset with no observation is `skipped`
      // with a stated signal — never absent, because an absent row reads as a pass.
      return [...planned].sort().map((id) => byId.get(id) ?? {
        qaAssetId: id, outcome: 'skipped' as Outcome,
        failureSignal: 'no outcome was observed for this asset', durationMs: 0,
      });
    },
  }),

  defineAgent<{ outcomes: readonly TestOutcome[] }, { readonly running: number; readonly completed: number; readonly failing: number }>({
    id: 'execution.live-monitor', domain: 'execution', stage: 'execution', plane: 'EP',
    purpose: 'Report live execution progress without interpreting it.',
    inputs: ['TestOutcome[]'], outputs: ['progress'],
    responsibilities: ['count only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost progress sample costs visibility during the run and never a result.',
    handle: (input) => ({
      running: 0,
      completed: input.outcomes.length,
      failing: input.outcomes.filter((o) => o.outcome === 'failed').length,
    }),
  }),

  defineAgent<{ outcomes: readonly TestOutcome[]; captured: readonly { qaAssetId: string; kind: EvidenceReference['kind']; locator: string; digest: string }[] }, readonly EvidenceReference[]>({
    id: 'execution.evidence-capture', domain: 'execution', stage: 'evidence', plane: 'EP',
    purpose: 'Record evidence as hash and locator, retaining custody in the Execution Plane.',
    inputs: ['TestOutcome[]', 'captured artefacts'], outputs: ['EvidenceReference[]'],
    responsibilities: ['emit a reference per captured artefact', 'never emit artefact content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Uncaptured evidence is reported as missing for that outcome. A defect with no evidence is still raised, and says so.',
    handle: (input) => {
      const known = new Set(input.outcomes.map((o) => o.qaAssetId));
      // `EvidenceReference` has no content field, so this function is structurally
      // incapable of moving an artefact. The hash and locator are the whole payload.
      return input.captured.filter((c) => known.has(c.qaAssetId)).map((c) => ({
        qaAssetId: c.qaAssetId, kind: c.kind, sha256: c.digest, locator: c.locator,
        capturedAtStage: 'evidence',
      }));
    },
  }),
];

// ── Healing Intelligence ────────────────────────────────────────────────────

const HEALING_KINDS: readonly HealingKind[] = [
  'reactive', 'proactive', 'predictive', 'vision', 'dom', 'locator',
  'timing', 'api', 'network', 'ai-repair', 'code-repair', 'self',
];

/** Each kind claims only the signals it can address. A healer that claims everything hides defects. */
const HEALING_CLAIMS: Readonly<Record<HealingKind, RegExp>> = {
  reactive: /element not found|no such element/,
  proactive: /deprecat|will be removed/,
  predictive: /flak|intermittent/,
  vision: /not visible|obscured|overlap/,
  dom: /stale element|detached/,
  locator: /selector|xpath|css/,
  timing: /timeout|timed out|wait/,
  api: /\b5\d\d\b|bad gateway|service unavailable/,
  network: /connection refused|econnreset|dns|network unreachable|socket hang up/,
  'ai-repair': /unexpected structure/,
  'code-repair': /syntax|compile/,
  self: /retry succeeded/,
};

const healingKindAgents: readonly AgentDefinition<never, unknown>[] = HEALING_KINDS.map((kind) =>
  defineAgent<{ outcome: TestOutcome }, HealingAction | null>({
    id: `healing.${kind}`, domain: 'healing', stage: 'reflection', plane: 'IP',
    purpose: `Propose a ${kind} healing action from the failure signal, without touching customer systems.`,
    inputs: ['TestOutcome'], outputs: ['HealingAction | null'],
    responsibilities: ['claim only the signals this kind addresses', 'never heal a genuine functional failure'],
    toolContracts: [],
    aiCapabilityClass: kind === 'ai-repair' || kind === 'vision' ? 'generation' : 'classification',
    promptContract: {
      intent: `Decide whether a failure signal is one ${kind} healing can address, and what the remediation would be.`,
      inputsProvided: ['failure signal text', 'QA asset identifier', 'the healing kind under consideration'],
      expects: 'a remediation description, or an explicit statement that this kind does not apply',
      rejectionRules: [
        `a proposal for a signal ${kind} does not claim is discarded`,
        'a proposed heal is never trusted until an observed retry confirms it',
        'a proposal that would modify a customer system rather than a test asset is discarded',
      ],
    },
    aiBehaviour: `Proposes a specific ${kind} remediation for the observed signal.`,
    nonAiBehaviour: `Matches the signal against the fixed ${kind} claim pattern and proposes the generic remediation, or nothing.`,
    failureHandling: 'No healing action is proposed. Healing a genuine defect would hide it, which is worse than a red test.',
    handle: (input: { outcome: TestOutcome }) => {
      if (input.outcome.outcome !== 'failed' || !input.outcome.failureSignal) return null;
      if (!HEALING_CLAIMS[kind].test(input.outcome.failureSignal.toLowerCase())) return null;
      return {
        kind, qaAssetId: input.outcome.qaAssetId,
        before: input.outcome.failureSignal, after: `${kind} remediation applied`,
        confidence: 0.6, validated: false,
      };
    },
  }) as AgentDefinition<never, unknown>);

export const healingAgents: readonly AgentDefinition<never, unknown>[] = [
  ...healingKindAgents,

  defineAgent<{ action: HealingAction; observedRetry: Outcome | null }, HealingAction>({
    id: 'healing.validation', domain: 'healing', stage: 'reflection', plane: 'IP',
    purpose: 'Mark a healing action validated only on an observed passing retry.',
    inputs: ['HealingAction', 'observed retry outcome'], outputs: ['HealingAction'],
    responsibilities: ['refuse to validate without an observation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unobserved retry leaves the action unvalidated. Assumed validation is how a genuine defect disappears.',
    // `observedRetry: null` means the retry was not observed, which is NOT a pass.
    handle: (input) => ({ ...input.action, validated: input.observedRetry === 'passed' }),
  }),

  defineAgent<{ actions: readonly HealingAction[] }, readonly LearningRecord[]>({
    id: 'healing.learning-feed', domain: 'healing', stage: 'reflection', plane: 'IP',
    purpose: 'Feed validated healing actions into Learning Intelligence.',
    inputs: ['HealingAction[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['emit only for validated actions'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost learning record costs future accuracy but never a current result.',
    handle: (input) => input.actions.filter((a) => a.validated).map((a) => ({
      kind: 'healing' as const, signal: a.before,
      lesson: `${a.kind} healing resolved this signal`, occurrences: 1,
    })),
  }),
];

// ── Defect Intelligence ─────────────────────────────────────────────────────

export const defectAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ outcome: TestOutcome; healing: readonly HealingAction[] }, { readonly genuine: boolean; readonly reason: string }>({
    id: 'defect.genuineness', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Decide whether a failure is a genuine defect or an environmental artefact.',
    inputs: ['TestOutcome', 'HealingAction[]'], outputs: ['genuineness'],
    responsibilities: ['exclude validated heals', 'exclude environmental signals', 'default to genuine'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Ambiguous failures are treated as GENUINE. Suppressing a real defect costs more than an extra triage.',
    handle: (input) => {
      if (input.outcome.outcome !== 'failed') return { genuine: false, reason: 'the test did not fail' };
      if (input.healing.some((h) => h.validated && h.qaAssetId === input.outcome.qaAssetId)) {
        return { genuine: false, reason: 'a validated healing action resolved the failure' };
      }
      const signal = (input.outcome.failureSignal ?? '').toLowerCase();
      if (HEALING_CLAIMS.network.test(signal)) {
        return { genuine: false, reason: 'environmental failure, not application behaviour' };
      }
      return { genuine: true, reason: 'the failure was neither healed nor environmental' };
    },
  }),

  defineAgent<{ outcome: TestOutcome; asset: QaAsset }, string>({
    id: 'defect.root-cause', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'State a root cause grounded in the observed signal.',
    inputs: ['TestOutcome', 'QaAsset'], outputs: ['root cause'],
    responsibilities: ['reject a cause that does not reference the signal'],
    toolContracts: [], aiCapabilityClass: 'summarisation',
    promptContract: {
      intent: 'Summarise the root cause of a failure from its observed signal and the step that failed.',
      inputsProvided: ['failure signal text', 'QA asset identifier', 'step actions and targets'],
      expects: 'a single root-cause sentence',
      rejectionRules: [
        'a summary that does not reference the observed signal is discarded as invention',
        'a summary shorter than 20 characters is discarded',
        'where no signal was recorded the cause is stated as unknown rather than inferred',
      ],
    },
    aiBehaviour: 'States a specific cause, accepted only where it references the observed signal.',
    nonAiBehaviour: 'States the observed signal and the asset it occurred in, explicitly labelled unknown.',
    failureHandling: 'An unknown root cause is stated as unknown. A plausible wrong cause sends triage down a path that cannot work.',
    handle: (input, ctx) => {
      const proposal = typeof ctx.proposal === 'string' ? ctx.proposal.trim() : '';
      const signal = input.outcome.failureSignal ?? '';
      const anchor = signal.toLowerCase().split(' ')[0] ?? '';
      if (proposal.length > 20 && anchor !== '' && proposal.toLowerCase().includes(anchor)) return proposal;
      return `unknown; the observed signal was "${signal || 'none recorded'}" on ${input.asset.id}`;
    },
  }),

  defineAgent<{ asset: QaAsset; story: VirtualStory | undefined }, string>({
    id: 'defect.business-impact', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'State business impact from the recorded risk and the requirement affected.',
    inputs: ['QaAsset', 'VirtualStory'], outputs: ['business impact'],
    responsibilities: ['derive from risk, never from severity guesswork'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Defaults to the recorded risk level rather than omitting impact.',
    handle: (input) => `risk ${input.asset.risk}; affects ${input.story?.title ?? input.asset.storyId}`
      + (input.asset.businessRuleIds.length > 0 ? `; breaks ${input.asset.businessRuleIds.length} business rule(s)` : ''),
  }),

  defineAgent<{ title: string; existing: readonly Defect[] }, string | null>({
    id: 'defect.duplicate-search', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Find an existing defect for the same failure before raising a new one.',
    inputs: ['title', 'Defect[]'], outputs: ['duplicate id | null'],
    responsibilities: ['match on the normalised title'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure no duplicate is claimed, producing a duplicate rather than suppressing a real defect.',
    handle: (input) => input.existing.find((d) => norm(d.title) === norm(input.title))?.id ?? null,
  }),

  defineAgent<{ qaAssetId: string; evidence: readonly EvidenceReference[] }, readonly string[]>({
    id: 'defect.evidence-binding', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Bind the evidence references captured for the failing asset to the defect.',
    inputs: ['EvidenceReference[]'], outputs: ['evidence locator[]'],
    responsibilities: ['bind references only, never artefacts'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A defect with no evidence is raised and says so. Withholding the defect for want of a screenshot loses the finding.',
    handle: (input) => input.evidence.filter((e) => e.qaAssetId === input.qaAssetId).map((e) => `${e.kind}:${e.sha256}@${e.locator}`),
  }),

  defineAgent<{ adapter: ExecutionAdapter; defects: readonly Defect[] }, readonly Defect[]>({
    id: 'defect.publication', domain: 'defect', stage: 'reflection', plane: 'IP',
    purpose: 'Publish genuine, non-duplicate defects through the adapter.',
    inputs: ['Defect[]', 'ExecutionAdapter'], outputs: ['Defect[]'],
    responsibilities: ['publish through the adapter', 'never publish a duplicate', 'record the provider identifier'],
    toolContracts: ['ExecutionAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unpublished defect keeps published=false and its reason travels in the sync record; it is never silently dropped.',
    handle: (input) => input.defects.map((d) => {
      if (d.duplicateOf !== null) return { ...d, published: false, externalId: null };
      const created = input.adapter.publishDefect({
        title: d.title, testId: d.qaAssetId, rootCause: d.rootCause, evidenceRefs: d.evidenceRefs,
      });
      // UNDECIDED (ADR-0072) — the failure path is owned by the Inverse-Flow capability. Reference adapters
      // always succeed, so this branch is unreachable today; it preserves the previous behaviour
      // exactly and decides nothing about what a failed publication should mean.
      return { ...d, published: true, externalId: created.published ? created.externalRef : null };
    }),
  }),
];

// ── Synchronization Intelligence — every agent calls its adapter ────────────

export interface SyncInput {
  readonly project: ProjectAdapter;
  readonly testManagement: TestManagementAdapter;
  readonly execution: ExecutionAdapter;
  readonly applicationId: string;
  readonly assets: readonly QaAsset[];
  readonly stories: readonly VirtualStory[];
  readonly outcomes: readonly TestOutcome[];
  readonly evidence: readonly EvidenceReference[];
  readonly defects: readonly Defect[];
}

export const syncAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<SyncInput, { readonly containerId: string; readonly groupingId: string; readonly records: readonly SyncRecord[] }>({
    id: 'sync.container', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Create the provider container and grouping the discovered assets belong to.',
    inputs: ['TestManagementAdapter'], outputs: ['container', 'grouping'],
    responsibilities: ['create through the adapter', 'use the provider noun in the record'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A container that cannot be created stops synchronization; publishing tests with no home orphans them in the provider.',
    handle: (input) => {
      // UNDECIDED — Discovery-Flow capability (ADR-0085 §4.3, on ADR-0074 §4's precedent). The
      // creates can now REFUSE, and what a Discovery-Flow run should do when the customer's tool
      // declines belongs to this capability rather than to the ADR that widened the signature.
      // Deciding it here would be D-024's shape: wrong, and invisible until the capability disagrees.
      //
      // The declared `failureHandling` above already says a container that cannot be created stops
      // synchronization — and until now the SPI could not report that it had not been created.
      const containerWrite = input.testManagement.createContainer(`Discovery — ${input.applicationId}`);
      if (!containerWrite.published) throw new Error(`test-management adapter refused to create a container for ${input.applicationId}: ${containerWrite.reason}`);
      const container = containerWrite.value;
      const groupingWrite = input.testManagement.createGrouping(container.containerId, 'Reconstructed requirements');
      if (!groupingWrite.published) throw new Error(`test-management adapter refused to create a grouping in ${container.containerId}: ${groupingWrite.reason}`);
      const grouping = groupingWrite.value;
      return {
        containerId: container.containerId, groupingId: grouping.groupingId,
        records: [
          { target: 'work-item' as const, localId: input.applicationId, externalId: container.containerId, published: true, reason: `created as ${container.noun}` },
          { target: 'work-item' as const, localId: `${input.applicationId}-grouping`, externalId: grouping.groupingId, published: true, reason: `created as ${grouping.noun}` },
        ],
      };
    },
  }),

  defineAgent<SyncInput & { groupingId: string }, readonly SyncRecord[]>({
    id: 'sync.test-cases', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish QA assets not already present in the provider.',
    inputs: ['QaAsset[]', 'TestManagementAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['find existing before publishing', 'never publish a duplicate'],
    toolContracts: ['TestManagementAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unpublished asset is recorded with its reason and no result is later published against it.',
    handle: (input) => {
      // Existing assets are found by fingerprint BEFORE publication. Publishing first
      // and deduplicating afterwards leaves duplicates in the customer's provider.
      // UNDECIDED — Discovery-Flow capability (ADR-0074 §4). The comment above states the
      // reason this read exists: publishing first and deduplicating afterwards leaves
      // duplicates in the customer's provider. An UNREACHED read produces exactly that outcome
      // while looking like a clean empty result — D-045's shape, in this capability. What
      // Discovery-Flow should do about it is not decided here. Behaviour unchanged: an
      // unreached read throws where the previous signature threw on a transport error.
      const existingRead = input.testManagement.findExistingTests(
        input.groupingId, input.assets.map((a) => a.fingerprint));
      if (!existingRead.reached) throw new Error(`test-management adapter unreachable for ${input.groupingId}: ${existingRead.reason}`);
      const existing = new Set(existingRead.value);

      const toPublish = input.assets.filter((a) => !existing.has(a.fingerprint));
      const publishedIds = input.testManagement.publishTests(
        input.groupingId, toPublish.map((a) => ({ id: a.id, title: a.title })));

      return [
        ...input.assets.filter((a) => existing.has(a.fingerprint)).map((a) => ({
          target: 'test-case' as const, localId: a.id, externalId: a.fingerprint, published: false,
          reason: 'an asset with this fingerprint already exists in the provider',
        })),
        // UNDECIDED (ADR-0072) — the failure path is owned by the Inverse-Flow capability.
        // `published` now reads the outcome instead of inferring it from array length, which is
        // the same answer today because reference adapters accept everything. What a REFUSED
        // publication should mean for this record is theirs to decide.
        ...toPublish.map((a, i) => ({
          target: 'test-case' as const, localId: a.id,
          externalId: publishedIds[i]?.published ? publishedIds[i].externalRef : null,
          published: publishedIds[i]?.published === true,
          reason: publishedIds[i]?.published ? 'published through the adapter' : 'the adapter returned no identifier',
        })),
      ];
    },
  }),

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.results', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish each execution outcome through the adapter.',
    inputs: ['TestOutcome[]', 'ExecutionAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish every outcome including skipped'],
    toolContracts: ['ExecutionAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unpublished result is recorded as such. A missing result in the provider reads as a test that was never written.',
    handle: (input) => input.outcomes.map((o) => {
      const result = input.execution.publishResult(o.qaAssetId, o.outcome);
      return {
        target: 'result' as const, localId: o.qaAssetId,
        externalId: result.published ? o.qaAssetId : null, published: result.published,
        reason: result.published ? `published outcome ${o.outcome}` : 'the adapter refused the result',
      };
    }),
  }),

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.evidence', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish evidence REFERENCES, never evidence artefacts.',
    inputs: ['EvidenceReference[]', 'ExecutionAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish hash and locator only'],
    toolContracts: ['ExecutionAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unpublished reference leaves the artefact in Execution Plane custody, which is where it already was.',
    handle: (input) => input.evidence.map((e) => {
      // The adapter signature accepts a sha256, a locator and a kind. There is no
      // parameter that could carry the artefact, by design.
      const result = input.execution.publishEvidenceReference(e.qaAssetId, {
        sha256: e.sha256, locator: e.locator, kind: e.kind,
      });
      return {
        target: 'evidence' as const, localId: `${e.qaAssetId}:${e.kind}`,
        externalId: result.published ? e.sha256 : null, published: result.published,
        reason: result.published ? 'reference published; the artefact remains in Execution Plane custody' : 'the adapter refused the reference',
      };
    }),
  }),

  defineAgent<SyncInput & { groupingId: string }, readonly SyncRecord[]>({
    id: 'sync.traceability', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Link every published asset to the requirement it verifies.',
    inputs: ['QaAsset[]', 'TestManagementAdapter', 'ProjectAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['link through both adapters', 'never claim a link that was refused'],
    toolContracts: ['TestManagementAdapter', 'ProjectAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unlinked pair is recorded unpublished. Traceability claimed but not established is worse than traceability known to be missing.',
    handle: (input) => input.assets.flatMap((a) => {
      // UNDECIDED (ADR-0072) — the failure path is owned by the Inverse-Flow capability. Reference adapters
      // always succeed, so this branch is unreachable today; it preserves the previous behaviour
      // exactly and decides nothing about what a failed publication should mean.
      const test = input.testManagement.linkTraceability(a.id, a.storyId);
      const linked = test.published;
      const requirement = input.project.linkRequirement(a.storyId, a.id);
      return [{
        target: 'traceability' as const, localId: `${a.id}:${a.storyId}`,
        externalId: linked && requirement.linked ? a.storyId : null,
        published: linked && requirement.linked,
        reason: linked && requirement.linked
          ? `linked via ${requirement.via}`
          : 'one or both adapters refused the link',
      }];
    }),
  }),

  defineAgent<{ defects: readonly Defect[] }, readonly SyncRecord[]>({
    id: 'sync.defects', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Record the publication outcome of every defect.',
    inputs: ['Defect[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['carry the provider identifier where publication succeeded'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unrecorded defect publication is reported as unknown, never as published.',
    handle: (input) => input.defects.map((d) => ({
      target: 'defect' as const, localId: d.id, externalId: d.externalId, published: d.published,
      reason: d.published ? 'published through the adapter'
        : d.duplicateOf !== null ? `duplicate of ${d.duplicateOf}` : 'not published',
    })),
  }),
];

// ── Reporting Intelligence ──────────────────────────────────────────────────

export interface ReportInput {
  readonly applicationId: string;
  readonly intelligence: ApplicationIntelligence;
  readonly journeys: readonly Journey[];
  readonly capabilities: readonly string[];
  readonly stories: readonly VirtualStory[];
  readonly epicCount: number;
  readonly featureCount: number;
  readonly assets: readonly QaAsset[];
  readonly automation: readonly AutomationAsset[];
  readonly outcomes: readonly TestOutcome[];
  readonly healing: readonly HealingAction[];
  readonly defects: readonly Defect[];
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly scopeReached: number;
}

export const reportingAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.application-inventory', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Count what discovery found, by kind.',
    inputs: ['ApplicationIntelligence'], outputs: ['inventory'],
    responsibilities: ['count only what was discovered'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncountable category is omitted rather than reported as zero; zero means none was found.',
    handle: (input) => ({
      pages: input.intelligence.pages.length,
      modules: input.intelligence.modules.length,
      menus: input.intelligence.menus.length,
      services: input.intelligence.services.length,
      apiEndpoints: input.intelligence.apiContracts.length,
      entities: input.intelligence.entities.length,
      businessRules: input.intelligence.businessRules.length,
      relationships: input.intelligence.relationships.length,
    }),
  }),

  defineAgent<ReportInput, readonly string[]>({
    id: 'reporting.journey-inventory', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'List discovered journeys with their length.',
    inputs: ['Journey[]'], outputs: ['journey[]'],
    responsibilities: ['name each journey and its step count'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unlistable journey is omitted and the count states the discrepancy.',
    handle: (input) => input.journeys.map((j) => `${j.name} (${j.steps.length} steps, ${j.provenance})`),
  }),

  defineAgent<ReportInput, readonly string[]>({
    id: 'reporting.api-inventory', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'List discovered API endpoints as method and route template.',
    inputs: ['ApiContract[]'], outputs: ['endpoint[]'],
    responsibilities: ['list templates, never concrete identifiers'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unlistable endpoint is omitted; the count in the inventory remains authoritative.',
    handle: (input) => input.intelligence.apiContracts.map((c) => `${c.method} ${c.path}`),
  }),

  defineAgent<ReportInput, readonly string[]>({
    id: 'reporting.business-capability', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'List the business capabilities the application delivers.',
    inputs: ['BusinessCapability[]'], outputs: ['capability[]'],
    responsibilities: ['list capabilities as modelled'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty capability list reports that capability modelling did not resolve, never that the application has none.',
    handle: (input) => [...input.capabilities].sort(),
  }),

  defineAgent<ReportInput, { readonly epics: number; readonly features: number; readonly stories: number }>({
    id: 'reporting.requirement-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Report the reconstructed requirement counts.',
    inputs: ['VirtualStory[]'], outputs: ['requirement counts'],
    responsibilities: ['count what was reconstructed'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncountable level is reported as zero only when zero was reconstructed.',
    handle: (input) => ({ epics: input.epicCount, features: input.featureCount, stories: input.stories.length }),
  }),

  defineAgent<ReportInput, number>({
    id: 'reporting.coverage', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Compute the proportion of reconstructed requirements covered by a QA asset.',
    inputs: ['QaAsset[]', 'VirtualStory[]'], outputs: ['coverage'],
    responsibilities: ['divide by the reconstructed total, never by the covered total'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Coverage that cannot be computed is reported as NOT MEASURED rather than as zero or one.',
    handle: (input) => {
      if (input.stories.length === 0) return 0;
      return new Set(input.assets.map((a) => a.storyId)).size / input.stories.length;
    },
  }),

  defineAgent<ReportInput, number>({
    id: 'reporting.automation-coverage', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Compute the proportion of QA assets carrying an automation asset.',
    inputs: ['AutomationAsset[]', 'QaAsset[]'], outputs: ['automation coverage'],
    responsibilities: ['count an asset as automated only when an automation asset traces to it'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Uncomputable coverage is NOT MEASURED. A zero would be read as no automation, which is a different finding.',
    handle: (input) => {
      if (input.assets.length === 0) return 0;
      const automated = new Set(input.automation.flatMap((a) => a.qaAssetIds));
      return input.assets.filter((a) => automated.has(a.id)).length / input.assets.length;
    },
  }),

  defineAgent<ReportInput, Readonly<Record<RiskLevel, number>>>({
    id: 'reporting.risk-analysis', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Profile reconstructed requirements by risk band.',
    inputs: ['VirtualStory[]'], outputs: ['risk profile'],
    responsibilities: ['count every band including empty ones'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncounted band is reported as zero, which is correct: the band was measured and nothing fell in it.',
    handle: (input) => ({
      low: input.stories.filter((s) => s.risk === 'low').length,
      medium: input.stories.filter((s) => s.risk === 'medium').length,
      high: input.stories.filter((s) => s.risk === 'high').length,
      critical: input.stories.filter((s) => s.risk === 'critical').length,
    }),
  }),

  defineAgent<ReportInput, { readonly readiness: string; readonly rationale: string }>({
    id: 'reporting.release-readiness', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'State release readiness, refusing to claim readiness without execution evidence.',
    inputs: ['TestOutcome[]', 'Defect[]'], outputs: ['readiness'],
    responsibilities: ['never claim readiness from an unexecuted plan'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Undeterminable readiness is NOT MEASURED, which the platform treats as a refusal rather than a pass (R-13.3).',
    handle: (input) => {
      const executed = input.outcomes.filter((o) => o.outcome !== 'skipped').length;
      if (executed === 0) {
        // NOT MEASURED is not a pass. R-13.3, and the reason this branch exists.
        return { readiness: 'NOT MEASURED', rationale: 'no QA asset executed, so no requirement is verified by evidence' };
      }
      const failed = input.outcomes.filter((o) => o.outcome === 'failed').length;
      const genuine = input.defects.filter((d) => d.duplicateOf === null).length;
      if (genuine > 0) return { readiness: 'NOT READY', rationale: `${genuine} genuine defect(s) from ${failed} failure(s)` };
      return { readiness: 'READY', rationale: `${executed} asset(s) executed with no genuine defect` };
    },
  }),

  defineAgent<ReportInput, number>({
    id: 'reporting.discovery-completeness', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Report how much of the declared scope discovery actually reached.',
    inputs: ['scope reach'], outputs: ['completeness'],
    responsibilities: ['never report bounded coverage as complete'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Unknown completeness is reported as zero with the bound stated, so partial coverage is never read as full.',
    handle: (input) => Math.max(0, Math.min(1, input.scopeReached)),
  }),

  defineAgent<{ report: DiscoveryReport }, readonly string[]>({
    id: 'reporting.executive-dashboard', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Assemble the executive dashboard sections from measured figures only.',
    inputs: ['DiscoveryReport'], outputs: ['sections'],
    responsibilities: ['never present an unmeasured figure as measured'],
    toolContracts: [], aiCapabilityClass: 'summarisation',
    promptContract: {
      intent: 'Summarise measured discovery figures into executive narrative sections.',
      inputsProvided: ['computed counts', 'coverage percentages', 'release readiness', 'rationale'],
      expects: 'a narrative section per supplied figure',
      rejectionRules: [
        'a section presenting an unmeasured figure as measured is discarded',
        'a section stating a readiness different from the computed one is discarded',
        'a section introducing a figure not in the input is discarded',
      ],
    },
    aiBehaviour: 'Renders the measured figures as narrative prose for a non-technical reader.',
    nonAiBehaviour: 'Renders the measured figures as labelled values. Every figure appears; none is narrated.',
    failureHandling: 'A section that cannot be produced is listed as NOT MEASURED rather than omitted.',
    handle: (input) => [
      `application: ${input.report.applicationId}`,
      `reasoning mode: ${input.report.reasoningMode}`,
      `discovery completeness: ${(input.report.discoveryCompleteness * 100).toFixed(1)}%`,
      `requirements reconstructed: ${input.report.requirementCounts.stories}`,
      `requirement coverage: ${(input.report.requirementCoverage * 100).toFixed(1)}%`,
      `automation coverage: ${(input.report.automationCoverage * 100).toFixed(1)}%`,
      `release readiness: ${input.report.releaseReadiness}`,
      `rationale: ${input.report.rationale}`,
    ],
  }),

  defineAgent<{ report: DiscoveryReport }, { readonly bytes: number; readonly pages: number }>({
    id: 'reporting.executive-pdf', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the executive pack as a real PDF document.',
    inputs: ['DiscoveryReport'], outputs: ['pdf'],
    responsibilities: ['emit valid PDF bytes', 'never render an unmeasured figure as a number'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A PDF that cannot be rendered is reported as not produced. A zero-byte file presented as a report is worse than its absence.',
    handle: (input) => {
      const pages = executivePages(input.report);
      const bytes = renderPdf(`Discovery — ${input.report.applicationId}`, pages);
      if (bytes.length < 400 || !bytes.subarray(0, 8).toString('latin1').startsWith('%PDF-1.')) {
        throw new Error('the rendered PDF is not a valid document');
      }
      return { bytes: bytes.length, pages: pages.length };
    },
  }),

  defineAgent<{ report: DiscoveryReport }, { readonly figures: number; readonly unmeasured: number; readonly decisionRequired: string }>({
    id: 'reporting.board-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Produce the board report, stating the decision required and what is unmeasured.',
    inputs: ['DiscoveryReport'], outputs: ['board report'],
    responsibilities: ['mark every figure measured or unmeasured', 'always state the decision required'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A board report that cannot be produced is reported as not produced; a partial one at that table is a misleading one.',
    handle: (input) => {
      const board = boardReport(input.report);
      return {
        figures: board.figures.length,
        unmeasured: board.figures.filter((f) => !f.measured).length,
        decisionRequired: board.decisionRequired,
      };
    },
  }),
];

// ── Learning Intelligence — every declared kind is emitted ──────────────────

export interface LearningInput {
  readonly intelligence: ApplicationIntelligence;
  readonly journeys: readonly Journey[];
  readonly matches: readonly RepositoryMatch[];
  readonly automation: readonly AutomationAsset[];
  readonly healing: readonly HealingAction[];
  readonly outcomes: readonly TestOutcome[];
  readonly memory: VectorMemory;
  readonly promptsDelivered: readonly string[];
  readonly promptsWithheld: readonly string[];
}

export const learningAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.application-patterns', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn recurring structural patterns in the discovered application.',
    inputs: ['ApplicationIntelligence'], outputs: ['LearningRecord[]'],
    responsibilities: ['record a pattern only where it recurs'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost pattern costs future recall and never a current result.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const f of input.intelligence.pages) {
        const segment = f.split('/').filter(Boolean)[0] ?? 'root';
        counts.set(segment, (counts.get(segment) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, n]) => n > 1).map(([signal, occurrences]) => ({
        kind: 'application-pattern' as const, signal,
        lesson: `module "${signal}" carries ${occurrences} pages; expect similar structure on re-discovery`,
        occurrences,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.business-rules', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn which constraint shapes recur as business rules.',
    inputs: ['BusinessRule[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['group by constraint shape'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost rule pattern costs future reconstruction quality and never a current result.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const r of input.intelligence.businessRules) {
        const shape = r.statement.replace(/"[^"]*"/g, '"{field}"');
        counts.set(shape, (counts.get(shape) ?? 0) + 1);
      }
      return [...counts.entries()].map(([signal, occurrences]) => ({
        kind: 'business-rule' as const, signal,
        lesson: occurrences > 1 ? 'a recurring constraint shape' : 'observed once', occurrences,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.journeys', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn journey shapes so a re-discovery can recognise them sooner.',
    inputs: ['Journey[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['record length and provenance'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost journey shape costs future recall and never a current result.',
    handle: (input) => input.journeys.map((j) => ({
      kind: 'journey' as const, signal: j.name,
      lesson: `${j.steps.length}-step ${j.provenance} journey`, occurrences: 1,
    })),
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.repository', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn which repositories and asset kinds actually yield reusable matches.',
    inputs: ['RepositoryMatch[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['group by repository and kind'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost repository lesson costs future search precision and never a current result.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const m of input.matches.filter((m) => m.similarity >= 0.6)) {
        const key = `${m.repository}:${m.assetKind}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) {
        // A repository that yielded nothing reusable is the more valuable lesson, and
        // emitting nothing would make the failure indistinguishable from not looking.
        return [{
          kind: 'repository' as const,
          signal: `${new Set(input.matches.map((m) => m.repository)).size || 0} repository/repositories searched`,
          lesson: `no asset reached the reuse threshold from ${input.matches.length} candidate(s); everything had to be generated`,
          occurrences: input.matches.length,
        }];
      }
      return [...counts.entries()].map(([signal, occurrences]) => ({
        kind: 'repository' as const, signal,
        lesson: `yielded ${occurrences} reusable match(es)`, occurrences,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.automation', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn which automation asset kinds are persistently missing.',
    inputs: ['AutomationAsset[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['group generated assets by kind'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost automation lesson costs future gap prediction and never a current result.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const a of input.automation) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
      return [...counts.entries()].map(([signal, occurrences]) => ({
        kind: 'automation' as const, signal,
        lesson: `${occurrences} ${signal} asset(s) had to be generated; the repository lacks this kind`,
        occurrences,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.healing', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn which healing kinds validate, and which merely propose.',
    inputs: ['HealingAction[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['distinguish validated from proposed'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost healing lesson costs future healing accuracy and never a current result.',
    handle: (input) => {
      const counts = new Map<string, { proposed: number; validated: number }>();
      for (const h of input.healing) {
        const c = counts.get(h.kind) ?? { proposed: 0, validated: 0 };
        counts.set(h.kind, { proposed: c.proposed + 1, validated: c.validated + (h.validated ? 1 : 0) });
      }
      return [...counts.entries()].map(([signal, c]) => ({
        kind: 'healing' as const, signal,
        lesson: `${c.validated}/${c.proposed} ${signal} heals validated by an observed retry`,
        occurrences: c.proposed,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.prompts', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Learn which reasoning requests were answered and which went unanswered.',
    inputs: ['reasoning ledger'], outputs: ['LearningRecord[]'],
    responsibilities: ['record delivery, never prompt content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost prompt lesson costs future contract tuning and never a current result.',
    handle: (input) => [
      { kind: 'prompt' as const, signal: 'delivered', lesson: 'reasoning answered these agents', occurrences: input.promptsDelivered.length },
      { kind: 'prompt' as const, signal: 'withheld', lesson: 'these agents ran on their deterministic path', occurrences: input.promptsWithheld.length },
    ],
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.knowledge-graph', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Fold the knowledge graph into a learned shape, separating observed from inferred.',
    inputs: ['Graph'], outputs: ['LearningRecord[]'],
    responsibilities: ['never merge observed and inferred edges into one figure'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost graph lesson costs future inference quality and never a current result.',
    handle: (input) => {
      const edges = input.intelligence.knowledgeGraph.edges;
      return [
        { kind: 'knowledge-graph' as const, signal: 'observed-edges', lesson: 'edges the Execution Plane traversed', occurrences: edges.filter((e) => e.provenance === 'observed').length },
        { kind: 'knowledge-graph' as const, signal: 'inferred-edges', lesson: 'edges reasoning proposed and code accepted', occurrences: edges.filter((e) => e.provenance === 'inferred').length },
      ];
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.vector-memory', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Commit journeys, rules and entities to vector memory for future runs.',
    inputs: ['VectorMemory'], outputs: ['LearningRecord[]'],
    responsibilities: ['store vectors and identifiers only, never text'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncommitted memory costs future recall and never a current result. Memory is an accelerator, never a source of truth.',
    handle: (input) => {
      for (const j of input.journeys) input.memory.remember('journey', j.id, `${j.name} ${j.steps.join(' ')}`, { provenance: j.provenance });
      for (const r of input.intelligence.businessRules) input.memory.remember('business-rule', r.id, r.statement, { provenance: r.provenance });
      for (const e of input.intelligence.entities) input.memory.remember('entity', e.id, `${e.name} ${e.fieldNames.join(' ')}`, {});
      return Object.entries(input.memory.census).map(([signal, occurrences]) => ({
        kind: 'vector-memory' as const, signal,
        lesson: `${occurrences} vector(s) retained; identifiers and directions only, no text`,
        occurrences,
      }));
    },
  }),

  defineAgent<LearningInput, readonly LearningRecord[]>({
    id: 'learning.failure-patterns', domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose: 'Extract recurring failure signals for future runs.',
    inputs: ['TestOutcome[]'], outputs: ['LearningRecord[]'],
    responsibilities: ['count occurrences per signal'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A lost learning record degrades future accuracy but never a current result.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const o of input.outcomes) {
        if (!o.failureSignal) continue;
        counts.set(o.failureSignal, (counts.get(o.failureSignal) ?? 0) + 1);
      }
      return [...counts.entries()].map(([signal, occurrences]) => ({
        kind: 'application-pattern' as const, signal,
        lesson: occurrences > 1 ? 'a recurring failure signal; a candidate for a predictive heal' : 'observed once',
        occurrences,
      }));
    },
  }),
];

export { fingerprint };
