/**
 * Stage governance — a review, a decision and a certification agent for every stage.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-11.13 (no capability bypasses review)
 *                  C-12.11 (no verdict is emitted in a degraded state)
 *
 * "EVERY STAGE MUST CONTAIN EXECUTION, REVIEW, DECISION AND CERTIFICATION AGENTS."
 * That requirement is met here, for all twelve stages, by three agents per stage plus
 * the domain execution agents. Thirty-six agents is not ceremony: each stage has
 * different ways of being wrong, and a single generic reviewer would check none of them
 * properly.
 *
 * WHAT MAKES A REVIEWER REAL.
 * Each stage declares its own rule set below, and each rule names a specific way that
 * stage's output can be defective — a story with no source facts, a heal validated
 * without an observed retry, an evidence reference with no hash. A reviewer that
 * returned "looks fine" for everything would pass registration and fail the conformance
 * suite, which asserts that each rule set actually refuses its own violation.
 *
 * REVIEW CANNOT DECIDE; DECISION CANNOT INVENT; CERTIFICATION CAN REFUSE.
 * The three are separate agents because a reviewer that could act on its findings can
 * excuse them, and a certifier that could add a finding can manufacture the grounds for
 * a refusal it wanted anyway.
 */
import { defineAgent, STAGES, type AgentDefinition, type ReviewFinding, type StageName } from '@dbiz/capability-framework';

/** A rule: given the stage's output, return a finding or null. */
export type StageRule = (subject: unknown) => ReviewFinding | null;

function blocking(subject: string, finding: string): ReviewFinding {
  return { severity: 'blocking', subject, finding };
}
function advisory(subject: string, finding: string): ReviewFinding {
  return { severity: 'advisory', subject, finding };
}

/** Read a property from an unknown stage output without asserting its shape. */
function get<T>(subject: unknown, key: string): T | undefined {
  return typeof subject === 'object' && subject !== null
    ? (subject as Record<string, unknown>)[key] as T | undefined
    : undefined;
}

function arr<T>(subject: unknown, key: string): readonly T[] {
  const value = get<readonly T[]>(subject, key);
  return Array.isArray(value) ? value : [];
}

/**
 * The rules, per stage. Each names a specific defect that stage can produce.
 *
 * These are the review criteria in executable form. A change here is a change to what
 * the platform will accept, which is why they are in one readable place rather than
 * distributed across the stages that would then each own a piece of the standard.
 */
export const STAGE_RULES: Readonly<Record<StageName, readonly StageRule[]>> = {
  planning: [
    (s) => (arr(s, 'origins').length === 0 ? blocking('scope', 'no origin is in scope, so there is nothing to discover') : null),
    (s) => ((get<number>(s, 'requestsPerSecond') ?? 0) < 1 ? blocking('rate', 'the request budget is below one per second, so discovery cannot proceed') : null),
    (s) => ((get<number>(s, 'maxArtefacts') ?? 0) <= 0 ? blocking('depth', 'the traversal limit is zero, so nothing would be visited') : null),
    (s) => (arr(s, 'exclusions').length === 0 ? advisory('scope', 'no exclusion is declared; the whole origin is in scope') : null),
  ],

  discovery: [
    (s) => (arr(s, 'observed').length === 0 ? blocking('discovery', 'no artefact was observed; an empty result reads as an empty application') : null),
    // The sovereignty rule, checked where it can still be caught: a cookie descriptor
    // that carried a value would have crossed as a label.
    (s) => (arr<{ name?: string; scope?: string }>(s, 'cookies').some((c) => 'value' in (c as object))
      ? blocking('cookies', 'a cookie descriptor carries a value; cookie values never leave the point of observation') : null),
    (s) => (arr(s, 'refusedFrames').length > 0 ? advisory('iframes', `${arr(s, 'refusedFrames').length} cross-origin frame(s) were refused and are unassessed`) : null),
    (s) => (arr(s, 'journeys').length === 0 ? advisory('journeys', 'no end-to-end journey was assembled; navigation may be too shallow to reconstruct flows') : null),
  ],

  context: [
    (s) => (arr(s, 'facts').length === 0 ? blocking('facts', 'no fact crossed into the Intelligence Plane, so nothing can be reasoned about') : null),
    // The one that matters most: a fact carrying values would be content in the IP.
    (s) => (arr<object>(s, 'facts').some((f) => 'values' in f)
      ? blocking('facts', 'a fact carries observed values; only attribute names cross the boundary') : null),
    (s) => (arr<{ provenance?: string }>(s, 'relationships').some((r) => r.provenance !== 'observed' && r.provenance !== 'inferred')
      ? blocking('relationships', 'a relationship carries no provenance, so an inference is indistinguishable from an observation') : null),
    (s) => (arr(s, 'entities').length === 0 ? advisory('entities', 'no business entity was reconstructed; requirement quality will be structural only') : null),
  ],

  'architecture-review': [
    (s) => (!get<string>(s, 'applicationId') ? blocking('model', 'the application model has no application identity') : null),
    (s) => (arr(s, 'journeys').length === 0 && arr(s, 'services').length === 0
      ? blocking('model', 'the model has neither a journey nor a service, so there is no behaviour to reconstruct requirements from') : null),
    (s) => (arr(s, 'capabilities').length === 0 ? advisory('capabilities', 'no business capability resolved; epics will be module-shaped') : null),
  ],

  'policy-review': [
    (s) => (arr(s, 'stories').length === 0 ? blocking('requirements', 'no requirement was reconstructed') : null),
    // Reconstruction that cannot cite what it was reconstructed from is invention.
    (s) => (arr<{ sourceFactIds?: readonly string[] }>(s, 'stories').some((st) => (st.sourceFactIds ?? []).length === 0)
      ? blocking('requirements', 'a story cites no source fact; an unsourced requirement is an assertion about a system nobody observed') : null),
    (s) => (arr<{ acceptanceCriteria?: readonly string[] }>(s, 'stories').some((st) => (st.acceptanceCriteria ?? []).length === 0)
      ? blocking('requirements', 'a story carries no acceptance criterion and is therefore untestable') : null),
    (s) => (arr(s, 'epics').length === 0 ? advisory('requirements', 'no epic was reconstructed; the hierarchy will be flat') : null),
  ],

  'guardrail-review': [
    (s) => (arr(s, 'assets').length === 0 ? blocking('qa', 'no QA asset was generated') : null),
    (s) => (arr<{ steps?: readonly { expectedResult?: string }[] }>(s, 'assets')
      .some((a) => (a.steps ?? []).some((st) => !st.expectedResult?.trim()))
      ? blocking('qa', 'a step carries no expected result and cannot be verified') : null),
    (s) => (arr<{ requirementTraceability?: readonly string[] }>(s, 'assets').some((a) => (a.requirementTraceability ?? []).length === 0)
      ? blocking('qa', 'an asset carries no requirement traceability') : null),
    (s) => (arr(s, 'uncovered').length > 0 ? advisory('qa', `${arr(s, 'uncovered').length} reconstructed requirement(s) have no QA asset`) : null),
  ],

  'execution-planning': [
    (s) => (arr(s, 'workItems').length === 0 ? blocking('work items', 'no work item was published or refused; synchronization produced no record at all') : null),
    // A record with neither an identifier nor a reason is the shape the audit found:
    // publication that neither happened nor was recorded as not happening.
    (s) => (arr<{ published?: boolean; externalId?: string | null; reason?: string }>(s, 'workItems')
      .some((r) => r.published === true && !r.externalId)
      ? blocking('work items', 'a record claims publication without a provider identifier') : null),
    (s) => (arr<{ published?: boolean; reason?: string }>(s, 'workItems').some((r) => r.published === false && !r.reason?.trim())
      ? blocking('work items', 'a refusal carries no reason') : null),
    // The generator defect the first capability shipped: kinds that do not match the
    // decisions that requested them.
    (s) => {
      const wanted = arr<string>(s, 'requestedKinds');
      const produced = arr<string>(s, 'generatedKinds');
      const w = [...wanted].sort().join(','); const p = [...produced].sort().join(',');
      return w !== p ? blocking('automation', `generated kinds [${p}] do not match the kinds decided missing [${w}]`) : null;
    },
  ],

  execution: [
    (s) => (get<boolean>(s, 'environmentValidated') !== true ? blocking('environment', 'the target environment was not validated; failures could not be distinguished from unreachability') : null),
    (s) => {
      const planned = arr<readonly string[]>(s, 'batches').flat().length;
      const rows = arr(s, 'outcomes').length;
      return planned !== rows ? blocking('execution', `${planned} asset(s) planned but ${rows} outcome row(s) returned; a missing row reads as a pass`) : null;
    },
    (s) => {
      const skipped = arr<{ outcome?: string }>(s, 'outcomes').filter((o) => o.outcome === 'skipped').length;
      return skipped > 0 ? advisory('execution', `${skipped} asset(s) did not run; NOT RUN is treated as FAIL (C-0.4)`) : null;
    },
  ],

  evidence: [
    (s) => (arr<object>(s, 'references').some((r) => 'content' in r || 'body' in r || 'bytes' in r)
      ? blocking('evidence', 'an evidence reference carries content; only a hash and a locator cross') : null),
    (s) => (arr<{ sha256?: string; locator?: string }>(s, 'references').some((r) => !r.sha256?.trim() || !r.locator?.trim())
      ? blocking('evidence', 'an evidence reference has no hash or no locator, so it proves nothing and finds nothing') : null),
    (s) => (arr(s, 'references').length === 0 ? advisory('evidence', 'no evidence was captured; defects will be raised without supporting artefacts') : null),
  ],

  reflection: [
    // The defect that hid every failure in the predecessor capability.
    (s) => (arr<{ validated?: boolean; observedRetry?: unknown }>(s, 'healing')
      .some((h) => h.validated === true && h.observedRetry !== 'passed')
      ? blocking('healing', 'a heal is validated without an observed passing retry; assumed validation is how a genuine defect disappears') : null),
    (s) => (arr<{ duplicateOf?: string | null; published?: boolean }>(s, 'defects').some((d) => d.duplicateOf !== null && d.published === true)
      ? blocking('defects', 'a duplicate defect was published') : null),
    (s) => (arr<{ rootCause?: string }>(s, 'defects').some((d) => !d.rootCause?.trim())
      ? blocking('defects', 'a defect carries no root cause, not even an explicit unknown') : null),
    (s) => (arr(s, 'learning').length === 0 ? advisory('learning', 'no learning record was produced; this run teaches the next one nothing') : null),
  ],

  certification: [
    (s) => (get<boolean>(s, 'triadTraversed') !== true ? blocking('governance', 'the governance triad was not traversed (R-12.2)') : null),
    (s) => (arr<{ certified?: boolean; reason?: string }>(s, 'verdicts').some((v) => !v.reason?.trim())
      ? blocking('governance', 'a verdict carries no reason; a refusal without one is indistinguishable from a crash') : null),
  ],

  reporting: [
    (s) => (arr(s, 'sync').length === 0 ? blocking('sync', 'no synchronization record was produced; nothing was published and nothing was refused') : null),
    (s) => (arr<{ published?: boolean; reason?: string }>(s, 'sync').some((r) => !r.reason?.trim())
      ? blocking('sync', 'a synchronization record carries no reason') : null),
    // R-13.3: NOT MEASURED is never a pass, and must never be rendered as a number.
    (s) => (get<string>(s, 'releaseReadiness') === 'NOT MEASURED' && get<boolean>(s, 'claimedReady') === true
      ? blocking('reporting', 'readiness is NOT MEASURED and the report claims READY') : null),
    (s) => (get<number>(s, 'pdfBytes') !== undefined && (get<number>(s, 'pdfBytes') ?? 0) < 400
      ? blocking('reporting', 'the executive PDF is too small to be a valid document') : null),
  ],
};

/** Three governance agents per stage: review, decision, certification. */
function governanceFor(stage: StageName): readonly AgentDefinition<never, unknown>[] {
  const rules = STAGE_RULES[stage];

  return [
    defineAgent<{ subject: unknown }, readonly ReviewFinding[]>({
      id: `governance.${stage}.review`, domain: 'governance', stage, plane: 'IP',
      purpose: `Review the ${stage} stage output against its declared defect rules.`,
      inputs: ['stage output'], outputs: ['ReviewFinding[]'],
      responsibilities: ['apply every declared rule', 'produce findings only, never act on them'],
      toolContracts: [], aiCapabilityClass: 'none',
      failureHandling: 'A review that cannot run produces a blocking finding. An unreviewed stage is not a passed stage.',
      handle: (input) => {
        const findings: ReviewFinding[] = [];
        for (const rule of rules) {
          const finding = rule(input.subject);
          if (finding) findings.push(finding);
        }
        return findings;
      },
    }) as AgentDefinition<never, unknown>,

    defineAgent<{ subject: unknown; findings: readonly ReviewFinding[] }, { readonly accept: boolean; readonly rejected: readonly { subject: string; reason: string }[] }>({
      id: `governance.${stage}.decision`, domain: 'governance', stage, plane: 'IP',
      purpose: `Decide what survives review at the ${stage} stage.`,
      inputs: ['stage output', 'ReviewFinding[]'], outputs: ['decision'],
      responsibilities: ['act only on findings the reviewer produced', 'never invent a finding'],
      toolContracts: [], aiCapabilityClass: 'none',
      failureHandling: 'A decision that cannot be made rejects the stage output, which stops the run rather than progressing an unreviewed result.',
      handle: (input) => {
        const blockingFindings = input.findings.filter((f) => f.severity === 'blocking');
        return {
          accept: blockingFindings.length === 0,
          // The decision quotes the reviewer. It cannot add a subject the review did
          // not raise, which is what keeps it from being a second review.
          rejected: blockingFindings.map((f) => ({ subject: f.subject, reason: f.finding })),
        };
      },
    }) as AgentDefinition<never, unknown>,

    defineAgent<{ accept: boolean; findings: readonly ReviewFinding[]; accepted: number }, { readonly certified: boolean; readonly reason: string }>({
      id: `governance.${stage}.certification`, domain: 'governance', stage, plane: 'IP',
      purpose: `Render the certification verdict for the ${stage} stage.`,
      inputs: ['decision', 'ReviewFinding[]'], outputs: ['verdict'],
      responsibilities: ['refuse on any blocking finding', 'always state the reason'],
      toolContracts: [], aiCapabilityClass: 'none',
      failureHandling: 'A verdict that cannot be rendered is a refusal carrying that fact. Nothing progresses uncertified.',
      handle: (input) => {
        const blockingFindings = input.findings.filter((f) => f.severity === 'blocking');
        if (!input.accept || blockingFindings.length > 0) {
          return {
            certified: false,
            reason: `${blockingFindings.length} blocking finding(s): ${blockingFindings.map((f) => `${f.subject}: ${f.finding}`).join('; ')}`,
          };
        }
        return {
          certified: true,
          reason: `${stage}: ${input.accepted} item(s) accepted, ${input.findings.length} advisory finding(s), no blocking findings`,
        };
      },
    }) as AgentDefinition<never, unknown>,
  ];
}

export const governanceAgents: readonly AgentDefinition<never, unknown>[] =
  STAGES.flatMap((stage) => governanceFor(stage));

export { advisory, blocking };
