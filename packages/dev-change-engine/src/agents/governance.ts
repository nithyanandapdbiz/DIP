/**
 * Stage governance — a review, a decision and a certification agent for every stage.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0024 §3.3
 *   Criteria     : C-11.13 (no capability bypasses review)
 *                  C-12.11 (no verdict is emitted in a degraded state)
 *
 * "EVERY STAGE SHALL CONTAIN EXECUTION, REVIEW, DECISION AND CERTIFICATION AGENTS."
 * Met here for all twelve stages by three agents per stage, plus the domain execution
 * agents. Thirty-six is not ceremony: each stage has different ways of being wrong, and
 * one generic reviewer would check none of them properly.
 *
 * THE RULES ARE DEV-CHANGE'S OWN.
 * They are not a copy of another capability's rules with the nouns changed. Each names a
 * specific way *this* engine's output can be defective — an impact analysis that found
 * nothing to test, a coverage claim with no asset behind it, a heal validated without an
 * observed retry, a report claiming READY on unmeasured readiness.
 *
 * REVIEW CANNOT DECIDE; DECISION CANNOT INVENT; CERTIFICATION CAN REFUSE.
 * Three agents, because a reviewer that can act on its findings can excuse them, and a
 * certifier that can add a finding can manufacture grounds for a refusal it wanted anyway.
 */
import { defineAgent, STAGES, type AgentDefinition, type ReviewFinding, type StageName } from '@dbiz/capability-framework';

export type StageRule = (subject: unknown) => ReviewFinding | null;

function blocking(subject: string, finding: string): ReviewFinding {
  return { severity: 'blocking', subject, finding };
}
function advisory(subject: string, finding: string): ReviewFinding {
  return { severity: 'advisory', subject, finding };
}

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
 * The rules, per stage. Each names a specific defect this engine can produce.
 *
 * These are the review criteria in executable form. A change here is a change to what
 * the platform will accept, which is why they live in one readable place rather than
 * distributed across twelve stages that would each own a piece of the standard.
 */
export const STAGE_RULES: Readonly<Record<StageName, readonly StageRule[]>> = {
  planning: [
    (s) => (!get<string>(s, 'repository')?.trim()
      ? blocking('event', 'the repository event names no repository, so there is nothing to analyse') : null),
    (s) => (!get<string>(s, 'headCommit')?.trim() || !get<string>(s, 'baseCommit')?.trim()
      ? blocking('event', 'the change set has no base or no head, so no diff can be bounded') : null),
    (s) => (get<string>(s, 'headCommit') === get<string>(s, 'baseCommit')
      ? blocking('event', 'base and head are the same commit; an empty range would certify a release nobody analysed') : null),
    (s) => (!get<boolean>(s, 'scopeBounded')
      ? advisory('scope', 'no path exclusion is configured; the whole repository is in scope') : null),
  ],

  discovery: [
    (s) => (arr(s, 'changedFiles').length === 0
      ? blocking('diff', 'no changed file was discovered; an empty diff reads as a change that broke nothing') : null),
    (s) => (arr(s, 'commits').length === 0
      ? blocking('commits', 'no commit was discovered in the range') : null),
    // Discovery is Execution-Plane: commits legitimately carry messages and authors here.
    // The sovereignty rule that forbids those fields is enforced at the CONTEXT stage,
    // which is the boundary crossing. Checking it here would refuse a correct EP result.
    (s) => (arr(s, 'existingTests').length === 0
      ? advisory('tests', 'the repository index found no existing test asset; every candidate will require generation') : null),
  ],

  context: [
    (s) => (arr(s, 'facts').length === 0
      ? blocking('facts', 'no change fact crossed into the Intelligence Plane, so nothing can be reasoned about') : null),
    // The one that matters most: a fact carrying hunks would be source in the IP.
    (s) => (arr<object>(s, 'facts').some((f) => 'hunks' in f || 'addedLines' in f || 'content' in f)
      ? blocking('facts', 'a change fact carries source lines; only symbol names and counts cross the boundary') : null),
    (s) => (arr<object>(s, 'commitFacts').some((c) => 'message' in c || 'authorEmail' in c)
      ? blocking('commits', 'a commit fact carries a message or an author email') : null),
    (s) => (arr<{ layer?: string }>(s, 'facts').every((f) => f.layer === 'unknown') && arr(s, 'facts').length > 0
      ? advisory('facts', 'every changed path resolved to an unknown layer; impact analysis will be structural only') : null),
  ],

  'architecture-review': [
    (s) => (arr(s, 'classified').length === 0
      ? blocking('change', 'no change was classified, so the nature of this change is unknown') : null),
    (s) => (arr<{ categories?: readonly string[] }>(s, 'classified').some((c) => (c.categories ?? []).length === 0)
      ? blocking('change', 'a change was classified into no category at all, which is indistinguishable from not classifying it') : null),
    (s) => (arr<{ rationale?: string }>(s, 'classified').some((c) => !c.rationale?.trim())
      ? blocking('change', 'a classification carries no rationale and cannot be reviewed') : null),
    (s) => (arr(s, 'dependencies').length === 0
      ? advisory('dependency', 'no dependency edge was derived; blast radius will be limited to directly changed paths') : null),
  ],

  'policy-review': [
    (s) => (arr(s, 'impacts').length === 0
      ? blocking('business impact', 'no business impact was determined; a change with no assessed impact cannot be risk-ranked') : null),
    (s) => (arr<{ rationale?: string }>(s, 'impacts').some((i) => !i.rationale?.trim())
      ? blocking('business impact', 'an impact carries no rationale; an unexplained criticality is an assertion') : null),
    // Impact analysis that cannot cite the change it came from is invention.
    (s) => (arr<{ paths?: readonly string[] }>(s, 'modules').some((m) => (m.paths ?? []).length === 0)
      ? blocking('business impact', 'an impacted module cites no changed path, so nothing connects it to this change') : null),
    (s) => (arr<{ customerFacing?: boolean }>(s, 'impacts').every((i) => i.customerFacing === false) && arr(s, 'impacts').length > 0
      ? advisory('business impact', 'no impact was assessed as customer-facing; confirm the classification before release') : null),
  ],

  'guardrail-review': [
    (s) => (arr(s, 'risks').length === 0
      ? blocking('risk', 'no risk assessment was produced') : null),
    (s) => (arr<{ factors?: readonly string[] }>(s, 'risks').some((r) => (r.factors ?? []).length === 0)
      ? blocking('risk', 'a risk band was assigned with no contributing factor, which is a number without a derivation') : null),
    (s) => (arr(s, 'coverage').length === 0
      ? blocking('coverage', 'no coverage assessment was produced; nothing establishes what this change leaves unverified') : null),
    // The defect that makes a coverage report dangerous rather than merely wrong.
    (s) => (arr<{ covered?: boolean; coveredBy?: readonly string[] }>(s, 'coverage')
      .some((c) => c.covered === true && (c.coveredBy ?? []).length === 0)
      ? blocking('coverage', 'a path is reported covered with no asset covering it; a false covered reads as verified') : null),
    (s) => {
      const gaps = arr<{ covered?: boolean }>(s, 'coverage').filter((c) => c.covered === false).length;
      return gaps > 0 ? advisory('coverage', `${gaps} changed path(s) have no existing coverage`) : null;
    },
  ],

  'execution-planning': [
    (s) => (arr(s, 'candidates').length === 0
      ? blocking('planning', 'no test candidate was selected; a change analysed and then not tested certifies nothing') : null),
    (s) => (arr(s, 'decisions').length === 0
      ? blocking('reuse', 'no reuse decision was recorded; reuse-before-generate cannot be demonstrated') : null),
    // "Reuse before generate. Never duplicate automation." — checked, not intended.
    (s) => (arr<{ decision?: string; assetId?: string | null }>(s, 'decisions')
      .some((d) => (d.decision === 'reuse' || d.decision === 'extend') && !d.assetId)
      ? blocking('reuse', 'a decision reuses an asset without naming it') : null),
    (s) => (arr<{ decision?: string; reason?: string }>(s, 'decisions').some((d) => !d.reason?.trim())
      ? blocking('reuse', 'a reuse decision carries no reason') : null),
    // The generator defect capability 1 shipped: kinds produced that nobody asked for.
    (s) => {
      const wanted = [...arr<string>(s, 'requestedKinds')].sort().join(',');
      const produced = [...arr<string>(s, 'generatedKinds')].sort().join(',');
      return wanted !== produced
        ? blocking('automation', `generated kinds [${produced}] do not match the kinds decided missing [${wanted}]`) : null;
    },
    (s) => (arr<{ steps?: readonly { expectedResult?: string }[] }>(s, 'authored')
      .some((t) => (t.steps ?? []).length === 0 || (t.steps ?? []).some((st) => !st.expectedResult?.trim()))
      ? blocking('authoring', 'an authored test has a step with no expected result and cannot be verified') : null),
    (s) => (arr<{ traceability?: readonly string[] }>(s, 'authored').some((t) => (t.traceability ?? []).length === 0)
      ? blocking('authoring', 'an authored test carries no traceability back to the change that required it') : null),
  ],

  execution: [
    (s) => (get<boolean>(s, 'environmentValidated') !== true
      ? blocking('environment', 'the target environment was not validated; failures could not be distinguished from unreachability') : null),
    (s) => {
      const planned = arr<readonly string[]>(s, 'batches').flat().length;
      const rows = arr(s, 'outcomes').length;
      return planned !== rows
        ? blocking('execution', `${planned} test(s) planned but ${rows} outcome row(s) returned; a missing row reads as a pass`) : null;
    },
    (s) => {
      const skipped = arr<{ outcome?: string }>(s, 'outcomes').filter((o) => o.outcome === 'skipped').length;
      return skipped > 0 ? advisory('execution', `${skipped} test(s) did not run; NOT RUN is treated as FAIL (C-0.4)`) : null;
    },
  ],

  evidence: [
    (s) => (arr<object>(s, 'references').some((r) => 'content' in r || 'body' in r || 'bytes' in r)
      ? blocking('evidence', 'an evidence reference carries content; only a hash and a locator cross') : null),
    (s) => (arr<{ sha256?: string; locator?: string }>(s, 'references').some((r) => !r.sha256?.trim() || !r.locator?.trim())
      ? blocking('evidence', 'an evidence reference has no hash or no locator, so it proves nothing and finds nothing') : null),
    (s) => {
      const failed = get<number>(s, 'failedCount') ?? 0;
      return failed > 0 && arr(s, 'references').length === 0
        ? blocking('evidence', 'tests failed and no evidence was captured; a defect would be raised with nothing behind it') : null;
    },
  ],

  reflection: [
    // The defect that hid every failure in the predecessor capability.
    (s) => (arr<{ validated?: boolean; observedRetry?: unknown }>(s, 'healing')
      .some((h) => h.validated === true && h.observedRetry !== 'passed')
      ? blocking('healing', 'a heal is validated without an observed passing retry; assumed validation is how a genuine defect disappears') : null),
    (s) => (arr<{ classification?: string; reasoning?: string }>(s, 'reflections').some((r) => !r.reasoning?.trim())
      ? blocking('reflection', 'a failure classification carries no reasoning; "flaky" without a reason is how a real bug is closed') : null),
    (s) => (arr<{ kind?: string; statement?: string }>(s, 'rootCauses').some((r) => !r.statement?.trim())
      ? blocking('root cause', 'a root cause carries no statement, not even an explicit unknown') : null),
    (s) => (arr<{ rootCause?: string }>(s, 'defects').some((d) => !d.rootCause?.trim())
      ? blocking('defects', 'a defect carries no root cause') : null),
    (s) => (arr<{ evidenceRefs?: readonly string[] }>(s, 'defects').some((d) => (d.evidenceRefs ?? []).length === 0)
      ? blocking('defects', 'a defect carries no evidence reference') : null),
    (s) => (arr(s, 'learning').length === 0
      ? advisory('learning', 'no learning record was produced; this run teaches the next one nothing') : null),
  ],

  certification: [
    (s) => (get<boolean>(s, 'triadTraversed') !== true
      ? blocking('governance', 'the governance triad was not traversed (R-12.2)') : null),
    (s) => (arr<{ reason?: string }>(s, 'verdicts').some((v) => !v.reason?.trim())
      ? blocking('governance', 'a verdict carries no reason; a refusal without one is indistinguishable from a crash') : null),
    (s) => (arr(s, 'verdicts').length === 0
      ? blocking('governance', 'release certification rendered no verdict at all') : null),
  ],

  reporting: [
    (s) => (arr(s, 'sync').length === 0
      ? blocking('sync', 'no synchronization record was produced; nothing was published and nothing was refused') : null),
    (s) => (arr<{ reason?: string }>(s, 'sync').some((r) => !r.reason?.trim())
      ? blocking('sync', 'a synchronization record carries no reason') : null),
    (s) => (arr<{ published?: boolean; remoteId?: string | null }>(s, 'sync').some((r) => r.published === true && !r.remoteId)
      ? blocking('sync', 'a record claims publication without a provider identifier') : null),
    // R-13.3: NOT MEASURED is never a pass, and must never be rendered as READY.
    (s) => (get<string>(s, 'releaseReadiness') === 'NOT MEASURED' && get<boolean>(s, 'claimedReady') === true
      ? blocking('reporting', 'readiness is NOT MEASURED and the report claims READY') : null),
    (s) => (arr(s, 'statedLimits').length === 0
      ? blocking('reporting', 'the report states no analysis limit; a change-impact report that claims no blind spot is claiming more than it measured') : null),
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
          // The decision quotes the reviewer. It cannot add a subject the review did not
          // raise, which is what keeps it from becoming a second review.
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
