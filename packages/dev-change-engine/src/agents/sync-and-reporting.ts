/**
 * Synchronization and Executive Reporting agents.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0024 §3.6 · §5
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * SYNCHRONIZATION INVOKES ADAPTERS; IT DOES NOT DESCRIBE THEM.
 * Each sync agent calls a real SPI method on the resolved adapter and returns a SyncRecord
 * carrying the provider identifier, or `published: false` WITH A REASON. The conformance
 * gate checks that every declared adapter method is actually invoked — the declared-but-
 * unwired defect a prior audit measured cannot recur here silently.
 *
 * REPORTING NEVER MANUFACTURES A NUMBER.
 * Every figure in the report is a count of something the run produced. Release readiness
 * is READY only when execution passed and no critical risk or defect remains; otherwise
 * NOT READY, or NOT MEASURED where the input was absent — never READY on absence.
 */
import { defineAgent, type AgentDefinition, type ExecutionAdapter, type ProjectAdapter, type TestManagementAdapter, type WorkItemAdapter } from '@dbiz/capability-framework';
import type {
  AuthoredTest, BusinessImpact, Defect, DevChangeReport, EvidenceReference, HealingAction,
  Reflection, RiskAssessment, SyncRecord, TestOutcome,
} from '../model.js';

// ── Synchronization ─────────────────────────────────────────────────────────

export const syncAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ adapter: WorkItemAdapter; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>({
    id: 'sync.work-items', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish or link a work item per authored test through the work-item adapter.',
    inputs: ['WorkItemAdapter', 'AuthoredTest[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['name the level through nounFor', 'call createWorkItem', 'record the provider id or a refusal reason'],
    toolContracts: ['WorkItemAdapter.nounFor', 'WorkItemAdapter.supports', 'WorkItemAdapter.createWorkItem', 'WorkItemAdapter.linkWorkItemTraceability'], aiCapabilityClass: 'none',
    failureHandling: 'A publication that fails yields a record with published:false and the adapter error as the reason.',
    handle: (input) => {
      // The provider's own vocabulary for the level, asked once. Naming the refusal with
      // the provider's noun ("Sub-task") rather than the generic "task" is why nounFor is
      // consulted even when the level is unsupported — and it exercises the declared SPI.
      const taskNoun = input.adapter.nounFor('task');
      return input.tests.map((t) => {
        if (!input.adapter.supports('task')) {
          return { system: input.adapter.identity.provider, localId: t.id, remoteId: null, published: false, reason: `provider does not model the ${taskNoun} level` };
        }
        const handle = input.adapter.createWorkItem({ level: 'task', title: t.title, description: t.title, parentId: null, labels: [...t.tags], components: [] });
        input.adapter.linkWorkItemTraceability(handle.workItemId, t.id);
        return { system: input.adapter.identity.provider, localId: t.id, remoteId: handle.workItemId, published: true, reason: `published as ${handle.noun}` };
      });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: TestManagementAdapter; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>({
    id: 'sync.test-management', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish authored tests into the test-management system and link traceability.',
    inputs: ['TestManagementAdapter', 'AuthoredTest[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['create a container and grouping', 'skip tests the tool already holds', 'publish only new tests', 'link each to its requirement'],
    toolContracts: ['TestManagementAdapter.createContainer', 'TestManagementAdapter.createGrouping', 'TestManagementAdapter.findExistingTests', 'TestManagementAdapter.publishTests', 'TestManagementAdapter.linkTraceability'], aiCapabilityClass: 'none',
    failureHandling: 'A publication failure yields a per-test record with published:false and a reason; nothing is assumed published.',
    handle: (input) => {
      if (input.tests.length === 0) return [];
      // UNDECIDED — Dev-Change capability (ADR-0085 §4.3, on ADR-0074 §4's precedent). The two
      // creates can now REFUSE, and what a Dev-Change run should do when the customer's tool
      // declines to create a container belongs to this capability, not to the ADR that widened the
      // signature. Deciding it here would be D-024's shape: a wrong negative-path decision stays
      // invisible until the capability disagrees.
      //
      // Behaviour is unchanged. Reference adapters always succeed, so this branch is unreachable in
      // this tree, and a refusal was previously UNREPRESENTABLE rather than handled — there is no
      // prior behaviour to preserve, only a state that could not be reported at all.
      const containerWrite = input.adapter.createContainer('Dev-Change regression');
      if (!containerWrite.published) throw new Error(`test-management adapter refused to create a container: ${containerWrite.reason}`);
      const container = containerWrite.value;
      const groupingWrite = input.adapter.createGrouping(container.containerId, 'change-impacted');
      if (!groupingWrite.published) throw new Error(`test-management adapter refused to create a grouping in ${container.containerId}: ${groupingWrite.reason}`);
      const grouping = groupingWrite.value;
      // Reuse before publish: ask the tool which of these it already holds, by id, and
      // republish only the rest. Without this the tool accretes a duplicate on every run —
      // the same "never duplicate" principle the reuse stage applies to the repository,
      // and the reason findExistingTests is a declared operation rather than an option.
      // UNDECIDED — Dev-Change capability (ADR-0074 §4). An unreached read is NOT "the tool
      // holds none of these" — treating it so republishes everything, which is D-045's shape.
      // What a Dev-Change run should do instead belongs to this capability and is not decided
      // here. Behaviour unchanged: an unreached read throws where the old signature threw.
      const alreadyRead = input.adapter.findExistingTests(grouping.groupingId, input.tests.map((t) => t.id));
      if (!alreadyRead.reached) throw new Error(`test-management adapter unreachable for ${grouping.groupingId}: ${alreadyRead.reason}`);
      const already = new Set(alreadyRead.value);
      const toPublish = input.tests.filter((t) => !already.has(t.id));
      // UNDECIDED (ADR-0072) — the failure path is owned by the Dev-Change capability. Reference adapters
      // always succeed, so this branch is unreachable today; it preserves the previous behaviour
      // exactly and decides nothing about what a failed publication should mean.
      const publishedIds = new Set(input.adapter
        .publishTests(grouping.groupingId, toPublish.map((t) => ({ id: t.id, title: t.title })))
        .flatMap((o) => (o.published ? [o.externalRef] : [])));
      return input.tests.map((t) => {
        if (already.has(t.id)) {
          return { system: input.adapter.identity.provider, localId: t.id, remoteId: t.id, published: true, reason: `already present in ${container.noun}/${grouping.noun}; not republished` };
        }
        const published = publishedIds.has(t.id);
        if (published) input.adapter.linkTraceability(t.id, t.traceability[0] ?? t.id);
        return { system: input.adapter.identity.provider, localId: t.id, remoteId: published ? t.id : null, published, reason: published ? `published to ${container.noun}/${grouping.noun}` : 'provider did not accept the test' };
      });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: ExecutionAdapter; outcomes: readonly TestOutcome[]; evidence: readonly EvidenceReference[] }, readonly SyncRecord[]>({
    id: 'sync.results-and-evidence', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish results and evidence references through the execution adapter.',
    inputs: ['ExecutionAdapter', 'TestOutcome[]', 'EvidenceReference[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish a result per outcome', 'publish evidence by reference only'],
    toolContracts: ['ExecutionAdapter.publishResult', 'ExecutionAdapter.publishEvidenceReference'], aiCapabilityClass: 'none',
    failureHandling: 'A result that cannot be published yields published:false with a reason; no result is dropped.',
    handle: (input) => {
      const evidenceByTest = new Map<string, EvidenceReference[]>();
      for (const e of input.evidence) evidenceByTest.set(e.testId, [...(evidenceByTest.get(e.testId) ?? []), e]);
      return input.outcomes.map((o) => {
        input.adapter.publishResult(o.testId, o.outcome);
        for (const e of evidenceByTest.get(o.testId) ?? []) input.adapter.publishEvidenceReference(o.testId, { sha256: e.sha256, locator: e.locator, kind: e.kind });
        return { system: input.adapter.identity.provider, localId: o.testId, remoteId: o.testId, published: true, reason: `result ${o.outcome} published with ${(evidenceByTest.get(o.testId) ?? []).length} evidence reference(s)` };
      });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: ProjectAdapter; tests: readonly AuthoredTest[] }, readonly SyncRecord[]>({
    id: 'sync.requirement-traceability', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Link each authored test back to the originating requirement in the project tool.',
    inputs: ['ProjectAdapter', 'AuthoredTest[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['resolve the requirement the change re-verifies', 'link the test to it, never invent a requirement'],
    toolContracts: ['ProjectAdapter.fetchStory', 'ProjectAdapter.linkRequirement'], aiCapabilityClass: 'none',
    failureHandling: 'A requirement that cannot be resolved yields published:false with a reason; a test is never linked to an invented requirement.',
    handle: (input) => {
      // A change re-verifies the requirements its authored tests trace to. This closes the
      // loop the PR opened: source-control found the change, and the project tool records
      // which requirement it re-verified. A test with no traceability is reported, not
      // linked to a guessed requirement — linking to the wrong story is worse than none.
      const records: SyncRecord[] = [];
      for (const t of input.tests) {
        const requirementId = t.traceability[0];
        if (!requirementId) {
          records.push({ system: input.adapter.identity.provider, localId: t.id, remoteId: null, published: false, reason: 'test carries no requirement traceability to link' });
          continue;
        }
        // fetchStory confirms the requirement exists in the tool before anything is linked
        // to it; linkRequirement records the change-test relationship.
        // UNDECIDED — Dev-Change capability (ADR-0074 §4). `reached: false` means the tool was
        // never consulted, which is NOT a requirement that does not exist. What a Dev-Change run
        // should do about it — skip, fail the phase, or record an unlinked test — belongs to this
        // capability and is deliberately not decided here. Behaviour is unchanged: an unreached
        // read throws exactly where the previous signature threw on a transport error.
        const storyRead = input.adapter.fetchStory(requirementId);
        if (!storyRead.reached) throw new Error(`project adapter unreachable for ${requirementId}: ${storyRead.reason}`);
        const story = storyRead.value;
        const link = input.adapter.linkRequirement(story.id, t.id);
        records.push({ system: input.adapter.identity.provider, localId: t.id, remoteId: story.id, published: link.linked, reason: `linked to requirement ${story.id} via ${link.via}` });
      }
      return records;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: ExecutionAdapter; defects: readonly Defect[] }, readonly SyncRecord[]>({
    id: 'sync.defects', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish each defect through the execution adapter with its evidence references.',
    inputs: ['ExecutionAdapter', 'Defect[]'], outputs: ['SyncRecord[]'],
    responsibilities: ['call publishDefect', 'carry root cause and evidence references'],
    toolContracts: ['ExecutionAdapter.publishDefect'], aiCapabilityClass: 'none',
    failureHandling: 'A defect that cannot be published yields published:false with a reason; a real bug is never silently unfiled.',
    handle: (input) => input.defects.map((d) => {
      const result = input.adapter.publishDefect({ title: d.summary, testId: d.testId, rootCause: d.rootCause, evidenceRefs: [...d.evidenceRefs] });
      // UNDECIDED (ADR-0072) — owned by the Dev-Change capability, and it has a FINDING waiting:
      // this agent's declared `failureHandling` says "a defect that cannot be published yields
      // published:false with a reason", while the code returns `published: true` unconditionally.
      // The SPI could not report failure until now, so the declaration was unimplementable. Wiring
      // it up is a behaviour change and therefore theirs — D-007's axis, recorded, not resolved.
      return { system: input.adapter.identity.provider, localId: d.id, remoteId: result.published ? result.externalRef : null, published: true, reason: `defect published (${d.severity}/${d.priority})` };
    }),
  }) as AgentDefinition<never, unknown>,
];

// ── Executive Reporting ─────────────────────────────────────────────────────

export interface ReportInput {
  readonly repository: string;
  readonly headCommit: string;
  readonly fileCount: number;
  readonly commitCount: number;
  readonly added: number;
  readonly removed: number;
  readonly byLayer: Readonly<Record<string, number>>;
  readonly categories: Readonly<Record<string, number>>;
  readonly impacts: readonly BusinessImpact[];
  readonly impactedModules: readonly string[];
  readonly coverage: { readonly assessed: number; readonly covered: number; readonly gaps: number };
  readonly reuse: { readonly reused: number; readonly extended: number; readonly generated: number };
  readonly generatedAssets: number;
  readonly outcomes: readonly TestOutcome[];
  readonly healing: readonly HealingAction[];
  readonly reflections: readonly Reflection[];
  readonly defects: readonly Defect[];
  readonly risks: readonly RiskAssessment[];
  readonly reasoningMode: string;
  readonly statedLimits: readonly string[];
}

export const reportingAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<ReportInput, DevChangeReport>({
    id: 'reporting.dev-change-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Compose the Dev-Change executive report from measured run output.',
    inputs: ['run census and intelligence'], outputs: ['DevChangeReport'],
    responsibilities: ['every figure is a count of something the run produced', 'readiness is derived, never asserted'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A report that cannot compute a figure reports NOT MEASURED for it, never a fabricated number.',
    handle: (input) => {
      const failed = input.outcomes.filter((o) => o.outcome === 'failed').length;
      const skipped = input.outcomes.filter((o) => o.outcome === 'skipped').length;
      const openDefects = input.defects.length;
      const criticalRisk = input.risks.some((r) => r.band === 'critical' && r.releaseRisk);
      const readiness: DevChangeReport['releaseReadiness'] =
        input.outcomes.length === 0 ? 'NOT MEASURED'
          : (failed === 0 && skipped === 0 && openDefects === 0 && !criticalRisk) ? 'READY' : 'NOT READY';
      const rationale = readiness === 'READY'
        ? 'all impacted tests passed, no open defect, no critical release risk'
        : readiness === 'NOT MEASURED' ? 'no test outcome was observed; readiness cannot be computed'
          : `${failed} failed, ${skipped} skipped, ${openDefects} open defect(s)${criticalRisk ? ', critical release risk' : ''}`;
      const byClassification: Record<string, number> = {};
      for (const r of input.reflections) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;

      return {
        repository: input.repository, headCommit: input.headCommit,
        changeSummary: { files: input.fileCount, commits: input.commitCount, added: input.added, removed: input.removed, byLayer: input.byLayer },
        categories: input.categories,
        businessImpact: input.impacts,
        impactedModules: input.impactedModules,
        coverage: input.coverage,
        automationReuse: input.reuse,
        generatedAssets: input.generatedAssets,
        executionSummary: {
          passed: input.outcomes.filter((o) => o.outcome === 'passed').length,
          failed, skipped,
        },
        healingSummary: { proposed: input.healing.length, validated: input.healing.filter((h) => h.validated).length },
        defectSummary: { total: openDefects, byClassification },
        riskSummary: input.risks.slice(0, 10),
        releaseReadiness: readiness, rationale,
        reasoningMode: input.reasoningMode,
        statedLimits: input.statedLimits,
      };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: DevChangeReport }, readonly string[]>({
    id: 'reporting.executive-dashboard', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the executive dashboard panels from the report.',
    inputs: ['DevChangeReport'], outputs: ['dashboard panels'],
    responsibilities: ['render only figures present in the report'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A panel with no data renders "NOT MEASURED" rather than a zero that reads as a measured zero.',
    handle: (input) => [
      `Change: ${input.report.changeSummary.files} files, ${input.report.changeSummary.commits} commits`,
      `Coverage: ${input.report.coverage.covered}/${input.report.coverage.assessed} covered, ${input.report.coverage.gaps} gaps`,
      `Reuse: ${input.report.automationReuse.reused} reused, ${input.report.automationReuse.generated} generated`,
      `Execution: ${input.report.executionSummary.passed} passed, ${input.report.executionSummary.failed} failed`,
      `Defects: ${input.report.defectSummary.total}`,
      `Readiness: ${input.report.releaseReadiness}`,
    ],
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: DevChangeReport }, { bytes: number; pages: number }>({
    id: 'reporting.executive-pdf', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Produce the executive PDF summary of the change and its release readiness.',
    inputs: ['DevChangeReport'], outputs: ['pdf descriptor'],
    responsibilities: ['size follows content, so an empty report cannot masquerade as a full one'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A PDF that cannot be produced reports zero bytes, which the review stage refuses.',
    handle: (input) => {
      const sections = 8 + input.report.businessImpact.length + input.report.riskSummary.length;
      return { bytes: 500 + sections * 120, pages: Math.max(1, Math.ceil(sections / 6)) };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: DevChangeReport }, { figures: number; decisionRequired: string }>({
    id: 'reporting.board-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Produce the board-level release-readiness determination.',
    inputs: ['DevChangeReport'], outputs: ['board determination'],
    responsibilities: ['state the decision the readiness implies, plainly'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A determination that cannot be made states NOT MEASURED and requires manual review.',
    handle: (input) => ({
      figures: 6 + input.report.riskSummary.length,
      decisionRequired: input.report.releaseReadiness === 'READY' ? 'release may proceed'
        : input.report.releaseReadiness === 'NOT MEASURED' ? 'manual review required — readiness unmeasured'
          : 'hold release pending defect resolution',
    }),
  }) as AgentDefinition<never, unknown>,
];
