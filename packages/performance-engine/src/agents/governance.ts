/**
 * Stage governance — a review, a decision and a certification agent for every stage.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-11.13 (no capability bypasses review) · C-12.11 (no verdict in a degraded state)
 *
 * "EVERY STAGE SHALL CONTAIN EXECUTION, REVIEW, DECISION AND CERTIFICATION AGENTS."
 * Met here for all twelve stages by three governance agents per stage plus the domain execution
 * agents — thirty-six governance agents. Each stage declares its own defect rules, and each rule
 * names a specific way that stage's output can be wrong: a workload with zero concurrency, a load
 * run against an unreachable target, a metric summary carrying a raw value, a bottleneck reported
 * as a lone symptom, a verdict of PASS on NOT MEASURED evidence, a report claiming READY on a
 * FAIL verdict.
 *
 * REVIEW CANNOT DECIDE; DECISION CANNOT INVENT; CERTIFICATION CAN REFUSE. The three are separate
 * agents, for the reason the pipeline itself is: a reviewer that could act on its findings can
 * excuse them.
 */
import { defineAgent, STAGES, type AgentDefinition, type ReviewFinding, type StageName } from '@dbiz/capability-framework';

export type StageRule = (subject: unknown) => ReviewFinding | null;

function blocking(subject: string, finding: string): ReviewFinding { return { severity: 'blocking', subject, finding }; }
function advisory(subject: string, finding: string): ReviewFinding { return { severity: 'advisory', subject, finding }; }

function get<T>(subject: unknown, key: string): T | undefined {
  return typeof subject === 'object' && subject !== null ? (subject as Record<string, unknown>)[key] as T | undefined : undefined;
}
function arr<T>(subject: unknown, key: string): readonly T[] {
  const value = get<readonly T[]>(subject, key);
  return Array.isArray(value) ? value : [];
}

/** The rules, per stage. Each names a specific defect that stage can produce. */
export const STAGE_RULES: Readonly<Record<StageName, readonly StageRule[]>> = {
  planning: [
    (s) => (arr(s, 'allowedHosts').length === 0 ? blocking('scope', 'no host is in scope, so there is nothing authorised to load') : null),
    (s) => (!get<string>(s, 'authorizationReference')?.trim() ? blocking('scope', 'no authorisation reference; no load may run without one') : null),
    (s) => ((get<number>(s, 'authorizedVirtualUsers') ?? 0) < 1 ? blocking('scope', 'the virtual-user ceiling is below one, so no load can be generated') : null),
    (s) => (arr(s, 'testTypes').length === 0 ? advisory('scope', 'no test type was selected; the run will do nothing') : null),
  ],

  discovery: [
    (s) => (get<number>(s, 'nodeCount') === 0 ? blocking('discovery', 'no node was discovered; an empty topology reads as an absent system') : null),
    (s) => (get<boolean>(s, 'inScopeHonoured') === false ? blocking('discovery', 'a discovered node is out of scope; the boundary was not honoured') : null),
  ],

  context: [
    (s) => (arr(s, 'facts').length === 0 ? blocking('facts', 'no surface fact crossed into the Intelligence Plane, so nothing can be modelled') : null),
    // The one that matters most: a fact carrying values would be content in the IP.
    (s) => (arr<object>(s, 'facts').some((f) => 'values' in f) ? blocking('facts', 'a surface fact carries observed values; only attribute names cross the boundary') : null),
    (s) => (arr(s, 'endpoints').length === 0 ? advisory('endpoints', 'no callable endpoint was inventoried; the workload will be structural only') : null),
  ],

  'architecture-review': [
    (s) => (arr(s, 'transactions').length === 0 ? blocking('workload', 'the workload has no business transaction, so there is nothing to load') : null),
    (s) => ((get<number>(s, 'peakConcurrency') ?? 0) < 1 ? blocking('workload', 'peak concurrency is below one, so the workload generates no load') : null),
    (s) => (arr<{ nodeIds?: readonly string[] }>(s, 'transactions').some((t) => (t.nodeIds ?? []).length === 0) ? blocking('workload', 'a transaction names no endpoint, so it cannot be driven') : null),
  ],

  'policy-review': [
    (s) => (arr(s, 'thresholds').length === 0 ? blocking('design', 'no threshold was defined, so nothing can pass or fail under load') : null),
    (s) => (arr(s, 'cases').length === 0 ? blocking('design', 'no test case was generated, so the run would execute nothing') : null),
    (s) => (arr<{ metric?: string }>(s, 'thresholds').some((t) => !t.metric?.trim()) ? blocking('design', 'a threshold names no metric, so it can never be evaluated') : null),
  ],

  'guardrail-review': [
    (s) => (get<boolean>(s, 'certified') !== true ? blocking('guardrail', `the execution guardrails refused authorisation: ${arr<string>(s, 'refusals').join('; ') || 'no reason recorded'}`) : null),
    // No load before certification: aggressive load surviving to authorisation on production is the failure.
    (s) => (get<boolean>(s, 'productionAggressive') === true ? blocking('guardrail', 'aggressive load (stress/breakpoint/spike) is authorised against a production target under safe mode') : null),
  ],

  'execution-planning': [
    (s) => (arr(s, 'scripts').length === 0 && (get<number>(s, 'caseCount') ?? 0) > 0 ? blocking('script', 'test cases exist but no script was generated') : null),
    (s) => (arr<{ steps?: readonly unknown[] }>(s, 'scripts').some((sc) => (sc.steps ?? []).length === 0) ? blocking('script', 'a script has no step, so it would run no load and report a false pass') : null),
  ],

  execution: [
    (s) => (get<boolean>(s, 'environmentReachable') === false ? blocking('execution', 'the target did not respond; a result could not be distinguished from unreachability') : null),
    (s) => (get<number>(s, 'rawSampleCount') === 0 && get<boolean>(s, 'environmentReachable') === true ? advisory('execution', 'the target responded but produced no sample; the run measured nothing') : null),
  ],

  evidence: [
    (s) => (arr<object>(s, 'references').some((r) => 'content' in r || 'body' in r || 'bytes' in r || 'payload' in r) ? blocking('evidence', 'an evidence reference carries content; only a hash and a locator cross') : null),
    (s) => (arr<{ sha256?: string; locator?: string }>(s, 'references').some((r) => !r.sha256?.trim() || !r.locator?.trim()) ? blocking('evidence', 'an evidence reference has no hash or no locator, so it proves nothing') : null),
    (s) => (arr(s, 'references').length === 0 && (get<number>(s, 'resultCount') ?? 0) > 0 ? advisory('evidence', 'results were produced but no evidence was captured; defects would lack supporting artefacts') : null),
  ],

  reflection: [
    // Never report only symptoms: a serious bottleneck with no root-cause chain is a bare symptom.
    (s) => (get<boolean>(s, 'symptomOnly') === true ? blocking('rootcause', 'a high or critical bottleneck was reported with no root-cause chain; a symptom is not a diagnosis') : null),
    // A root-cause link with no provenance is indistinguishable between observed and inferred.
    (s) => (arr<{ provenance?: string }>(s, 'chainNodes').some((n) => n.provenance !== 'observed' && n.provenance !== 'inferred') ? blocking('rootcause', 'a root-cause link carries no provenance, so an inference is indistinguishable from an observation') : null),
    (s) => (arr<{ thresholdId?: string }>(s, 'defects').some((d) => !d.thresholdId?.trim()) ? blocking('defect', 'a defect cites no threshold, so its deviation cannot be justified') : null),
    // A matched performance pattern with no root cause is a bare label, not a diagnosis (Increment B).
    (s) => (arr<{ rootCause?: string }>(s, 'patterns').some((p) => !p.rootCause?.trim()) ? blocking('pattern', 'a matched pattern carries no root cause; a pattern without one is a label, not a diagnosis') : null),
    (s) => (arr(s, 'learning').length === 0 ? advisory('learning', 'no learning record was produced; this run teaches the next one nothing') : null),
  ],

  certification: [
    // R-13.3: NOT MEASURED is never a pass.
    (s) => (get<number>(s, 'measuredCount') === 0 && get<string>(s, 'verdict') !== 'FAIL' ? blocking('certification', 'no dimension was measured yet the verdict is not FAIL; NOT MEASURED is never a pass') : null),
    (s) => (arr<{ measured?: boolean; rationale?: string }>(s, 'scores').some((v) => v.measured === true && !v.rationale?.trim()) ? blocking('certification', 'a measured dimension carries no rationale; a score without one is an assertion') : null),
    (s) => (!get<string>(s, 'verdictReason')?.trim() ? blocking('certification', 'the verdict carries no reason; a verdict without one is indistinguishable from a crash') : null),
  ],

  reporting: [
    (s) => (arr(s, 'sync').length === 0 ? blocking('sync', 'no synchronisation record was produced; nothing was published and nothing refused') : null),
    (s) => (arr<{ reason?: string }>(s, 'sync').some((r) => !r.reason?.trim()) ? blocking('sync', 'a synchronisation record carries no reason') : null),
    (s) => (get<string>(s, 'verdict') === 'FAIL' && get<boolean>(s, 'claimedReady') === true ? blocking('reporting', 'the verdict is FAIL and the report claims the system is ready') : null),
    (s) => (get<number>(s, 'pdfBytes') !== undefined && (get<number>(s, 'pdfBytes') ?? 0) < 400 ? blocking('reporting', 'the executive PDF is too small to be a valid document') : null),
  ],
};

/** Three governance agents per stage: review, decision, certification. */
function governanceFor(stage: StageName): readonly AgentDefinition<never, unknown>[] {
  const rules = STAGE_RULES[stage];

  return [
    defineAgent<{ subject: unknown }, readonly ReviewFinding[]>({
      id: `governance.${stage}.review`, domain: 'governance', stage, plane: 'IP',
      purpose: `Review the ${stage} stage output against its declared performance defect rules.`,
      inputs: ['stage output'], outputs: ['ReviewFinding[]'],
      responsibilities: ['apply every declared rule', 'produce findings only, never act on them'],
      toolContracts: [], aiCapabilityClass: 'none',
      failureHandling: 'A review that cannot run produces a blocking finding. An unreviewed stage is not a passed stage.',
      handle: (input) => {
        const findings: ReviewFinding[] = [];
        for (const rule of rules) { const f = rule(input.subject); if (f) findings.push(f); }
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
        return { accept: blockingFindings.length === 0, rejected: blockingFindings.map((f) => ({ subject: f.subject, reason: f.finding })) };
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
          return { certified: false, reason: `${blockingFindings.length} blocking finding(s): ${blockingFindings.map((f) => `${f.subject}: ${f.finding}`).join('; ')}` };
        }
        return { certified: true, reason: `${stage}: ${input.accepted} item(s) accepted, ${input.findings.length} advisory finding(s), no blocking findings` };
      },
    }) as AgentDefinition<never, unknown>,
  ];
}

export const governanceAgents: readonly AgentDefinition<never, unknown>[] = STAGES.flatMap((stage) => governanceFor(stage));

export { advisory, blocking };
