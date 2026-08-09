/**
 * Stage governance — a review, a decision and a certification agent for every stage.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-11.13 (no capability bypasses review) · C-12.11 (no verdict in a degraded state)
 *
 * "EVERY STAGE SHALL CONTAIN EXECUTION, REVIEW, DECISION AND CERTIFICATION AGENTS."
 * That requirement is met here, for all twelve stages, by three agents per stage plus the
 * domain execution agents — thirty-six agents. Each stage declares its own defect rules below,
 * and each rule names a specific way that stage's output can be wrong: a scan authorized with
 * no reference, a finding that crossed with its payload, a destructive probe certified against
 * production, a release readiness of READY on an unscanned target.
 *
 * REVIEW CANNOT DECIDE; DECISION CANNOT INVENT; CERTIFICATION CAN REFUSE.
 * The three are separate agents. A reviewer that could act on its findings can excuse them; a
 * certifier that could add a finding can manufacture the grounds for a refusal it wanted anyway.
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
    (s) => (arr(s, 'allowedHosts').length === 0 ? blocking('scope', 'no host is in scope, so there is nothing authorised to test') : null),
    (s) => (!get<string>(s, 'authorizationReference')?.trim() ? blocking('scope', 'no authorization reference; no probe may be sent without one') : null),
    (s) => ((get<number>(s, 'requestsPerSecond') ?? 0) < 1 ? blocking('rate', 'the request budget is below one per second, so scanning cannot proceed safely') : null),
    (s) => (arr(s, 'exclusions').length === 0 ? advisory('scope', 'no exclusion is declared; the whole host is in scope') : null),
  ],

  discovery: [
    (s) => (arr(s, 'observed').length === 0 ? blocking('recon', 'no target was observed; an empty result reads as an absent attack surface') : null),
    (s) => (get<boolean>(s, 'httpsEnforced') === false && get<boolean>(s, 'httpsRequired') === true
      ? blocking('recon', 'https was required but an http target was observed in scope') : null),
    (s) => (get<boolean>(s, 'waf') === true ? advisory('recon', 'a WAF is present; active-scan results may be filtered and should be read with that in mind') : null),
  ],

  context: [
    (s) => (arr(s, 'facts').length === 0 ? blocking('facts', 'no surface fact crossed into the Intelligence Plane, so nothing can be reasoned about') : null),
    // The one that matters most: a fact carrying values would be content in the IP.
    (s) => (arr<object>(s, 'facts').some((f) => 'values' in f)
      ? blocking('facts', 'a surface fact carries observed values; only attribute names cross the boundary') : null),
    (s) => (arr(s, 'endpoints').length === 0 ? advisory('endpoints', 'no endpoint was reconstructed; scanning will be limited to observed structure') : null),
  ],

  'architecture-review': [
    (s) => (arr(s, 'endpoints').length === 0 ? blocking('surface', 'the attack surface has no endpoint, so there is nothing to authorise a scan against') : null),
    (s) => (arr(s, 'entryPoints').length === 0 && arr(s, 'trustBoundaries').length === 0
      ? blocking('surface', 'the surface has no entry point and no trust boundary, so no exposure can be reasoned about') : null),
    (s) => (arr(s, 'assets').length === 0 ? advisory('assets', 'no asset was reconstructed; business criticality will be structural only') : null),
  ],

  'policy-review': [
    (s) => (arr(s, 'selectedCategories').length === 0 ? blocking('scan-authorization', 'no scan category was authorized, so the scan would do nothing') : null),
    // Injection authorized with no parameterised surface is a scan that cannot land — refuse it.
    (s) => (get<boolean>(s, 'injectionWithoutParameters') === true
      ? blocking('scan-authorization', 'an injection category was authorized against a surface with no parameters to inject') : null),
    (s) => (get<string>(s, 'phaseCeiling') === 'passive' && arr(s, 'selectedCategories').some((c) => String(c).startsWith('sql') || String(c) === 'command-injection')
      ? blocking('scan-authorization', 'an active category was authorized under a passive-only ceiling') : null),
  ],

  'guardrail-review': [
    (s) => (get<boolean>(s, 'certified') !== true ? blocking('guardrail', `the scan guardrails refused authorization: ${arr<string>(s, 'refusals').join('; ') || 'no reason recorded'}`) : null),
    // No packet before certification: a destructive category surviving to authorization on production is the failure.
    (s) => (get<boolean>(s, 'destructiveOnProduction') === true
      ? blocking('guardrail', 'a destructive category is authorized against a production target; no destructive probe may run on production') : null),
    (s) => (get<boolean>(s, 'safeModeDestructive') === true
      ? blocking('guardrail', 'a destructive category is authorized under safe mode') : null),
  ],

  'execution-planning': [
    (s) => (arr(s, 'batches').length === 0 && arr(s, 'authorizedCategories').length > 0
      ? blocking('campaign', 'categories were authorized but no scan batch was planned') : null),
    (s) => {
      const parallelism = get<number>(s, 'parallelism') ?? 1;
      const oversize = arr<readonly unknown[]>(s, 'batches').some((b) => Array.isArray(b) && b.length > parallelism);
      return oversize ? blocking('campaign', 'a scan batch exceeds the planned parallelism, which would breach the request budget') : null;
    },
    (s) => (get<boolean>(s, 'phaseOrderViolated') === true ? blocking('campaign', 'an active-full batch is scheduled before active-safe completes') : null),
  ],

  execution: [
    (s) => (get<boolean>(s, 'environmentReachable') === false ? blocking('execution', 'the target did not respond; findings could not be distinguished from unreachability') : null),
    // Evidence-based scanning: a finding with no evidence reference is speculative.
    (s) => (arr<{ evidenceRefs?: readonly string[] }>(s, 'findings').some((f) => (f.evidenceRefs ?? []).length === 0)
      ? blocking('execution', 'a finding carries no evidence reference; a speculative finding must never be reported') : null),
    (s) => (arr(s, 'skipped').length > 0 ? advisory('execution', `${arr(s, 'skipped').length} authorized categor(y/ies) did not run; NOT SCANNED is treated as unassessed, never clean`) : null),
  ],

  evidence: [
    (s) => (arr<object>(s, 'references').some((r) => 'content' in r || 'body' in r || 'bytes' in r || 'payload' in r)
      ? blocking('evidence', 'an evidence reference carries content; only a hash and a locator cross') : null),
    (s) => (arr<{ sha256?: string; locator?: string }>(s, 'references').some((r) => !r.sha256?.trim() || !r.locator?.trim())
      ? blocking('evidence', 'an evidence reference has no hash or no locator, so it proves nothing and finds nothing') : null),
    (s) => (arr(s, 'references').length === 0 && get<number>(s, 'findingCount') !== 0
      ? advisory('evidence', 'findings were produced but no evidence was captured; defects would be raised without supporting artefacts') : null),
  ],

  reflection: [
    (s) => (arr<{ cwe?: string }>(s, 'findings').some((f) => !f.cwe?.trim())
      ? blocking('assessment', 'a finding carries no CWE; a finding with no classification cannot be assessed or tracked') : null),
    // A reasoning-inferred attack edge with no provenance is indistinguishable from an observation.
    (s) => (arr<{ provenance?: string }>(s, 'chainEdges').some((e) => e.provenance !== 'observed' && e.provenance !== 'inferred')
      ? blocking('attack-chain', 'an attack edge carries no provenance, so an inference is indistinguishable from an observed path') : null),
    // A high-confidence finding must not be silently dismissed as a false positive.
    (s) => (arr<{ falsePositive?: boolean; confidence?: number }>(s, 'assessed').some((a) => a.falsePositive === true && (a.confidence ?? 0) > 0.9)
      ? blocking('assessment', 'a finding with confidence above 0.90 was assessed a false positive; a confirmed finding is not dismissed by reasoning') : null),
    (s) => (arr(s, 'learning').length === 0 ? advisory('learning', 'no learning record was produced; this run teaches the next one nothing') : null),
  ],

  certification: [
    (s) => (get<boolean>(s, 'triadTraversed') !== true ? blocking('governance', 'the governance triad was not traversed (R-12.2)') : null),
    (s) => (arr<{ certified?: boolean; reason?: string }>(s, 'verdicts').some((v) => !v.reason?.trim())
      ? blocking('governance', 'a verdict carries no reason; a refusal without one is indistinguishable from a crash') : null),
  ],

  reporting: [
    (s) => (arr(s, 'sync').length === 0 ? blocking('sync', 'no synchronization record was produced; nothing was published and nothing was refused') : null),
    (s) => (arr<{ reason?: string }>(s, 'sync').some((r) => !r.reason?.trim())
      ? blocking('sync', 'a synchronization record carries no reason') : null),
    // R-13.3: NOT MEASURED is never a pass, and must never be rendered as a ready verdict.
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
