/**
 * Reflection-stage intelligence: assessment, compliance, remediation, posture, learning.
 *
 * TRACEABILITY
 *   Architecture : 13-ai-operating-model.md · 08-security-model.md · 18-governance-model.md
 *   ADR          : ADR-0028 · ADR-0016 (AI tool agnosticism)
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-11.11
 *   Invariants   : INV-7 (functions with reasoning unavailable)
 *
 * REASONING ENRICHES; IT NEVER DECIDES. The CVSS score, the compliance mapping and the
 * security score are computed deterministically and are never overwritten by a proposal.
 * The one reasoning agent here — false-positive reduction — receives a proposal and its own
 * code rejects any suggestion that would suppress a confirmed weakness. With reasoning
 * disabled it withholds nothing real: it simply proposes no suppressions, and every finding
 * stands (INV-7).
 */
import { defineAgent, type AgentContext, type AgentDefinition } from '@dbiz/capability-framework';
import {
  computeCvss, maxSeverity, SEVERITY_ORDER,
  type AssessedWeakness, type ComplianceResult, type CvssScore, type LearningRecord,
  type PostureScores, type Priority, type Remediation, type SecurityRequirement, type Severity, type Weakness,
} from '../model.js';

// ── Assessment ──────────────────────────────────────────────────────────────

const PRIORITY_OF: Record<Severity, Priority> = { critical: 'P1', high: 'P1', medium: 'P2', low: 'P3', info: 'P4' };
const SLA_OF: Record<Priority, number> = { P1: 24, P2: 72, P3: 168, P4: 720 };

export const assessmentAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ weaknesses: readonly Weakness[] }, ReadonlyMap<string, CvssScore>>({
    id: 'assessment.cvss', domain: 'assessment', purpose: 'Compute a deterministic CVSS base score for every weakness.',
    stage: 'reflection', plane: 'IP', inputs: ['minimised weaknesses'], outputs: ['a CVSS score per weakness'],
    responsibilities: ['score from severity and confidence, never from a proposal'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness that cannot be scored is reported unscored, never defaulted to zero risk',
    handle: (i) => new Map(i.weaknesses.map((w) => [w.id, computeCvss(w.severity, w.confidence)])),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ weaknesses: readonly Weakness[] }, ReadonlyMap<string, { fp: boolean; reason: string | null }>>({
    id: 'assessment.false-positive', domain: 'assessment',
    purpose: 'Reduce false positives — proposing suppressions, never deciding them.',
    stage: 'reflection', plane: 'IP', inputs: ['minimised weaknesses (category, path, confidence)'], outputs: ['a false-positive verdict per weakness'],
    responsibilities: ['accept a suppression only for a non-confirmed weakness', 'never suppress a confirmed weakness'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'classify which tentative or firm weaknesses are likely false positives given their category and location',
      inputsProvided: ['weakness category', 'weakness path', 'weakness confidence'],
      expects: 'a list of weakness identifiers proposed as false positives',
      rejectionRules: ['reject any proposal that suppresses a weakness whose confidence is confirmed', 'reject a proposal referencing an unknown identifier'],
    },
    aiBehaviour: 'accepts proposed suppressions for tentative/firm weaknesses after validating each against the rejection rules',
    nonAiBehaviour: 'proposes no suppressions; every weakness stands, so no confirmed finding is ever lost when reasoning is unavailable',
    failureHandling: 'a malformed proposal is discarded and no weakness is suppressed; verification never loses a finding to a bad proposal',
    handle: (i: { weaknesses: readonly Weakness[] }, ctx: AgentContext) => {
      const proposed = new Set(Array.isArray(ctx.proposal) ? (ctx.proposal as unknown[]).map(String) : []);
      const byId = new Map(i.weaknesses.map((w) => [w.id, w]));
      const out = new Map<string, { fp: boolean; reason: string | null }>();
      for (const w of i.weaknesses) {
        const suppress = proposed.has(w.id) && byId.get(w.id)?.confidence !== 'confirmed';
        out.set(w.id, suppress ? { fp: true, reason: 'reasoning-proposed suppression, validated against a non-confirmed weakness' } : { fp: false, reason: null });
      }
      return out;
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ weaknesses: readonly Weakness[] }, ReadonlyMap<string, string | null>>({
    id: 'assessment.duplicate-detection', domain: 'assessment', purpose: 'Detect duplicate weaknesses by category and path.',
    stage: 'reflection', plane: 'IP', inputs: ['minimised weaknesses'], outputs: ['a duplicate-of pointer per weakness'],
    responsibilities: ['keep the first occurrence, point later ones at it'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an ambiguous duplicate is kept as distinct, never merged away',
    handle: (i) => {
      const seen = new Map<string, string>();
      const out = new Map<string, string | null>();
      for (const w of i.weaknesses) {
        const key = `${w.category}@${w.path}`;
        if (seen.has(key)) out.set(w.id, seen.get(key)!);
        else { seen.set(key, w.id); out.set(w.id, null); }
      }
      return out;
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ weaknesses: readonly Weakness[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, Priority>>({
    id: 'assessment.priority', domain: 'assessment', purpose: 'Assign a deterministic priority from severity.',
    stage: 'reflection', plane: 'IP', inputs: ['weaknesses', 'CVSS scores'], outputs: ['a priority per weakness'],
    responsibilities: ['map severity to priority deterministically'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unscored weakness defaults to P2, never below the median',
    handle: (i) => new Map(i.weaknesses.map((w) => [w.id, PRIORITY_OF[i.cvss.get(w.id)?.severity ?? w.severity]])),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ weaknesses: readonly Weakness[] }, ReadonlyMap<string, string>>({
    id: 'assessment.business-impact', domain: 'assessment', purpose: 'State the business impact of each weakness in plain terms.',
    stage: 'reflection', plane: 'IP', inputs: ['weaknesses'], outputs: ['a business-impact statement per weakness'],
    responsibilities: ['tie technical severity to a business consequence'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unclassifiable impact is stated as unknown, never as none',
    handle: (i) => new Map(i.weaknesses.map((w) => [w.id, `${w.severity} ${w.category} at ${w.path} may weaken ${w.owasp}`])),
  }) as unknown as AgentDefinition<never, unknown>,
];

export function assembleAssessment(
  weaknesses: readonly Weakness[], cvss: ReadonlyMap<string, CvssScore>,
  fp: ReadonlyMap<string, { fp: boolean; reason: string | null }>, dup: ReadonlyMap<string, string | null>,
  priority: ReadonlyMap<string, Priority>, business: ReadonlyMap<string, string>, compliance: ReadonlyMap<string, readonly string[]>,
): readonly AssessedWeakness[] {
  return weaknesses.map((w) => {
    const p = priority.get(w.id) ?? 'P2';
    const f = fp.get(w.id) ?? { fp: false, reason: null };
    return {
      weakness: w,
      cvss: cvss.get(w.id) ?? computeCvss(w.severity, w.confidence),
      priority: p,
      slaHours: SLA_OF[p],
      falsePositive: f.fp,
      falsePositiveReason: f.reason,
      duplicateOf: dup.get(w.id) ?? null,
      businessImpact: business.get(w.id) ?? 'unknown',
      compliance: compliance.get(w.id) ?? [],
    };
  });
}

// ── Compliance mapping ──────────────────────────────────────────────────────

const FRAMEWORKS: readonly { readonly id: string; readonly controls: number; readonly owasp: readonly string[] }[] = [
  { id: 'OWASP-ASVS', controls: 286, owasp: [] },
  { id: 'OWASP-TOP10', controls: 10, owasp: ['A01:2021', 'A02:2021', 'A04:2021', 'A05:2021', 'A06:2021', 'A07:2021'] },
  { id: 'OWASP-API-TOP10', controls: 10, owasp: ['A01:2021', 'A05:2021'] },
  { id: 'NIST-800-53', controls: 20, owasp: [] },
  { id: 'CIS-BENCHMARK', controls: 24, owasp: [] },
  { id: 'PCI-DSS', controls: 12, owasp: ['A02:2021', 'A06:2021'] },
  { id: 'SOC2', controls: 9, owasp: [] },
  { id: 'ISO-27001', controls: 14, owasp: [] },
  { id: 'HIPAA', controls: 8, owasp: [] },
  { id: 'GDPR', controls: 7, owasp: ['A04:2021'] },
  { id: 'AZURE-SECURITY-BENCHMARK', controls: 12, owasp: [] },
  { id: 'CSA-CCM', controls: 17, owasp: [] },
];

function complianceAgent(fw: { id: string; controls: number; owasp: readonly string[] }): AgentDefinition<never, unknown> {
  return defineAgent<{ weaknesses: readonly Weakness[] }, ComplianceResult>({
    id: `compliance.${fw.id.toLowerCase()}`, domain: 'compliance',
    purpose: `Map assessed weaknesses to ${fw.id} controls and report the gaps.`,
    stage: 'reflection', plane: 'IP', inputs: ['minimised weaknesses'], outputs: [`a ${fw.id} compliance result`],
    responsibilities: [`report a control gap for every weakness touching a ${fw.id} control`], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unmapped weakness is reported as an unassessed control, never a satisfied one',
    handle: (i) => {
      const relevant = fw.owasp.length === 0 ? i.weaknesses : i.weaknesses.filter((w) => fw.owasp.includes(w.owasp));
      const gaps = [...new Set(relevant.map((w) => `${w.category} (${w.cwe})`))];
      const satisfied = Math.max(0, fw.controls - gaps.length);
      return { framework: fw.id, controlsAssessed: fw.controls, controlsSatisfied: satisfied, gaps, score: Math.round((satisfied / fw.controls) * 100) };
    },
  }) as unknown as AgentDefinition<never, unknown>;
}

export const complianceAgents: readonly AgentDefinition<never, unknown>[] = FRAMEWORKS.map(complianceAgent);

export function complianceByFinding(weaknesses: readonly Weakness[]): ReadonlyMap<string, readonly string[]> {
  return new Map(weaknesses.map((w) => [w.id, FRAMEWORKS.filter((fw) => fw.owasp.length === 0 || fw.owasp.includes(w.owasp)).map((fw) => fw.id)]));
}

// ── Remediation ─────────────────────────────────────────────────────────────

export const remediationAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ assessed: readonly AssessedWeakness[] }, ReadonlyMap<string, string>>({
    id: 'remediation.developer-guidance', domain: 'remediation', purpose: 'Produce developer guidance per weakness category.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['guidance per weakness'],
    responsibilities: ['give category-specific, actionable guidance'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a category with no template yields a generic hardening step, never an empty fix',
    handle: (i) => new Map(i.assessed.map((a) => [a.weakness.id, `Remediate ${a.weakness.category}: enforce the control at ${a.weakness.path} (${a.weakness.cwe}).`])),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, ReadonlyMap<string, string>>({
    id: 'remediation.config-fix', domain: 'remediation', purpose: 'Produce a configuration-level fix per weakness.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['a config fix per weakness'],
    responsibilities: ['express the fix as a configuration change where possible'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness with no config fix is routed to a code fix, never left unaddressed',
    handle: (i) => new Map(i.assessed.map((a) => [a.weakness.id, `Set the ${a.weakness.category} control correctly at ${a.weakness.path}.`])),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>>({
    id: 'remediation.effort-estimate', domain: 'remediation', purpose: 'Estimate remediation effort per weakness.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['an effort estimate per weakness'],
    responsibilities: ['estimate from category and severity'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unknown effort defaults to medium',
    handle: (i) => new Map(i.assessed.map((a) => [a.weakness.id, (a.weakness.category === 'dependency-cve' ? 'small' : a.weakness.category === 'sast-pattern' ? 'medium' : 'trivial') as 'trivial' | 'small' | 'medium' | 'large'])),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, ReadonlyMap<string, string>>({
    id: 'remediation.owner', domain: 'remediation', purpose: 'Route each weakness to an owning team.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['an owner per weakness'],
    responsibilities: ['route by category domain'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unroutable weakness goes to platform security, never nowhere',
    handle: (i) => new Map(i.assessed.map((a) => {
      const infra = ['iac-misconfig', 'container-hardening', 'kubernetes-policy', 'cloud-baseline'];
      const identity = ['authn-config', 'authz-config', 'session-config'];
      const owner = infra.includes(a.weakness.category) ? 'platform-engineering' : identity.includes(a.weakness.category) ? 'identity-team' : 'application-team';
      return [a.weakness.id, owner];
    })),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, ReadonlyMap<string, string>>({
    id: 'remediation.regression-test', domain: 'remediation', purpose: 'Name a regression test that proves each fix.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['a regression test per weakness'],
    responsibilities: ['name a re-runnable verification for the fix'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness with no obvious test yields a re-run of its own checker',
    handle: (i) => new Map(i.assessed.map((a) => [a.weakness.id, `Re-run verify.${a.weakness.category} against ${a.weakness.path}.`])),
  }) as unknown as AgentDefinition<never, unknown>,
];

export function assembleRemediations(
  assessed: readonly AssessedWeakness[], guidance: ReadonlyMap<string, string>, config: ReadonlyMap<string, string>,
  effort: ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>, owner: ReadonlyMap<string, string>, test: ReadonlyMap<string, string>,
): readonly Remediation[] {
  return assessed.filter((a) => !a.falsePositive).map((a): Remediation => ({
    weaknessId: a.weakness.id,
    kind: a.weakness.category === 'dependency-cve' ? 'dependency-upgrade' : a.weakness.category === 'sast-pattern' ? 'code-fix' : 'config-fix',
    summary: guidance.get(a.weakness.id) ?? config.get(a.weakness.id) ?? 'harden the affected control',
    priority: a.priority,
    effort: effort.get(a.weakness.id) ?? 'medium',
    owner: owner.get(a.weakness.id) ?? 'platform-security',
    regressionTest: test.get(a.weakness.id) ?? `re-run verify.${a.weakness.category}`,
  }));
}

// ── Posture scoring ─────────────────────────────────────────────────────────

function scoreFor(assessed: readonly AssessedWeakness[], categories: readonly string[]): number {
  const live = assessed.filter((a) => !a.falsePositive && a.duplicateOf === null && (categories.length === 0 || categories.includes(a.weakness.category)));
  const penalty = live.reduce((s, a) => s + SEVERITY_ORDER[a.weakness.severity] * 4, 0);
  return Math.max(0, 100 - penalty);
}

export const postureAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ assessed: readonly AssessedWeakness[] }, number>({
    id: 'posture.security-score', domain: 'posture', purpose: 'Compute the overall security score deterministically.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['the security score'],
    responsibilities: ['penalise by severity of live findings'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncomputable score reports zero and is flagged, never omitted',
    handle: (i) => scoreFor(i.assessed, []),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, number>({
    id: 'posture.identity-score', domain: 'posture', purpose: 'Score the identity and access posture.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['the identity score'],
    responsibilities: ['score authn/authz/session categories'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no identity findings scores 100, stated as measured-clean',
    handle: (i) => scoreFor(i.assessed, ['authn-config', 'authz-config', 'session-config']),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, number>({
    id: 'posture.cloud-score', domain: 'posture', purpose: 'Score the cloud and infrastructure posture.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['the cloud score'],
    responsibilities: ['score IaC/container/k8s/cloud categories'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no infrastructure findings scores 100, stated as measured-clean',
    handle: (i) => scoreFor(i.assessed, ['iac-misconfig', 'container-hardening', 'kubernetes-policy', 'cloud-baseline']),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, Readonly<Record<string, number>>>({
    id: 'posture.risk-heatmap', domain: 'posture', purpose: 'Build a risk heat map by weakness category.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['a category heat map'],
    responsibilities: ['weight each category by severity'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty set yields an empty heat map, reported as zero coverage',
    handle: (i) => {
      const map: Record<string, number> = {};
      for (const a of i.assessed) if (!a.falsePositive) map[a.weakness.category] = (map[a.weakness.category] ?? 0) + SEVERITY_ORDER[a.weakness.severity];
      return map;
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ assessed: readonly AssessedWeakness[] }, string>({
    id: 'posture.attack-surface-summary', domain: 'posture', purpose: 'Summarise the attack surface in one line for executives.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['a one-line surface summary'],
    responsibilities: ['name the dominant risk area'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no findings summarises as measured-clean, never as unknown',
    handle: (i) => {
      const live = i.assessed.filter((a) => !a.falsePositive);
      if (live.length === 0) return 'no weaknesses verified as present';
      const worst = live.reduce((m, a) => maxSeverity(m, a.weakness.severity), 'info' as Severity);
      return `${live.length} weakness(es), worst severity ${worst}`;
    },
  }) as unknown as AgentDefinition<never, unknown>,
];

export function assemblePosture(assessed: readonly AssessedWeakness[], heatMap: Readonly<Record<string, number>>, complianceScore: number, summary: string): PostureScores {
  return {
    securityScore: scoreFor(assessed, []),
    owaspScore: scoreFor(assessed, ['security-header', 'csp-policy', 'cors-policy', 'authz-config', 'authn-config', 'dependency-cve']),
    apiScore: scoreFor(assessed, ['authn-config', 'authz-config', 'cors-policy', 'security-header']),
    cloudScore: scoreFor(assessed, ['iac-misconfig', 'container-hardening', 'kubernetes-policy', 'cloud-baseline']),
    identityScore: scoreFor(assessed, ['authn-config', 'authz-config', 'session-config']),
    complianceScore,
    riskHeatMap: heatMap,
    attackSurfaceSummary: summary,
    trend: 'stable',
  };
}

// ── Learning ────────────────────────────────────────────────────────────────

export const learningAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ assessed: readonly AssessedWeakness[] }, readonly LearningRecord[]>({
    id: 'learning.false-positive-memory', domain: 'learning', purpose: 'Record confirmed false positives for future suppression.',
    stage: 'reflection', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['false-positive learning records'],
    responsibilities: ['remember only validated false positives'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a record that cannot be formed is skipped, never fabricated',
    handle: (i) => i.assessed.filter((a) => a.falsePositive).map((a): LearningRecord => ({ kind: 'false-positive', key: `${a.weakness.category}@${a.weakness.path}`, detail: a.falsePositiveReason ?? 'suppressed' })),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ requirements: readonly SecurityRequirement[]; assessed: readonly AssessedWeakness[] }, readonly LearningRecord[]>({
    id: 'learning.requirement-coverage', domain: 'learning', purpose: 'Record which requirements this run verified.',
    stage: 'reflection', plane: 'IP', inputs: ['requirements', 'assessed weaknesses'], outputs: ['requirement-coverage learning records'],
    responsibilities: ['record verified and satisfied requirements'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncovered requirement is recorded as open, never as covered',
    handle: (i) => i.requirements.map((r): LearningRecord => {
      const open = i.assessed.some((a) => !a.falsePositive && r.categories.includes(a.weakness.category));
      return { kind: 'requirement-coverage', key: r.id, detail: open ? 'open' : 'satisfied' };
    }),
  }) as unknown as AgentDefinition<never, unknown>,
];
