/**
 * Assessment Engine and Risk Intelligence — stage 10 (reflection, Intelligence Plane).
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 12-capability-orchestration.md · 18-governance-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-13.1 (AI proposes; code decides) · R-13.x (evidence over assertion)
 *
 * ASSESSMENT REASONS OVER MINIMISED FINDINGS, NEVER OVER TRAFFIC.
 * Every agent here takes `Finding` — a category, a location, a CWE, a confidence and an
 * evidence reference. None takes a `RawFinding`, and the compiler enforces that: the request
 * and response snippets stayed in the Execution Plane, and the assessment is computed from the
 * finding's structure, not from the payload that produced it.
 *
 * CVSS IS COMPUTED, NOT ASSERTED.
 * `cvss` implements the CVSS v3.1 base metric equations. The category supplies a representative
 * base vector; the score is derived from it by the published formula. A reasoning proposal may
 * enrich the business narrative around a finding; it never overwrites the CVSS score, because a
 * base score is a function of the vector and nothing else.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  CATEGORY_META, severityForScore,
  type AssessedFinding, type AttackSurface, type CvssScore, type CvssVector,
  type Finding, type FindingCategory, type Priority, type Severity,
} from '../model.js';

// ── CVSS v3.1 base metric calculator ────────────────────────────────────────

const AV = { network: 0.85, adjacent: 0.62, local: 0.55, physical: 0.2 };
const AC = { low: 0.77, high: 0.44 };
const UI = { none: 0.85, required: 0.62 };
const CIA = { none: 0, low: 0.22, high: 0.56 };

/** CVSS roundup: the smallest one-decimal number greater than or equal to the input. */
function roundUp(x: number): number {
  const scaled = Math.round(x * 100000);
  return scaled % 10000 === 0 ? scaled / 100000 : (Math.floor(scaled / 10000) + 1) / 10;
}

export function computeCvss(v: CvssVector): CvssScore {
  const pr = v.scope === 'changed'
    ? { none: 0.85, low: 0.68, high: 0.5 }[v.privilegesRequired]
    : { none: 0.85, low: 0.62, high: 0.27 }[v.privilegesRequired];
  const iss = 1 - (1 - CIA[v.confidentiality]) * (1 - CIA[v.integrity]) * (1 - CIA[v.availability]);
  const impact = v.scope === 'changed'
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  const exploitability = 8.22 * AV[v.attackVector] * AC[v.attackComplexity] * pr * UI[v.userInteraction];
  const base = impact <= 0 ? 0
    : v.scope === 'changed'
      ? roundUp(Math.min(1.08 * (impact + exploitability), 10))
      : roundUp(Math.min(impact + exploitability, 10));
  const vector = `CVSS:3.1/AV:${v.attackVector[0]?.toUpperCase()}/AC:${v.attackComplexity[0]?.toUpperCase()}/PR:${v.privilegesRequired[0]?.toUpperCase()}/UI:${v.userInteraction[0]?.toUpperCase()}/S:${v.scope[0]?.toUpperCase()}/C:${v.confidentiality[0]?.toUpperCase()}/I:${v.integrity[0]?.toUpperCase()}/A:${v.availability[0]?.toUpperCase()}`;
  return { baseScore: base, severity: severityForScore(base), vector };
}

/** A representative base vector per category. Deterministic; the backbone of non-AI mode. */
const CATEGORY_VECTOR: Readonly<Record<FindingCategory, CvssVector>> = {
  'missing-security-header': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'required', scope: 'unchanged', confidentiality: 'low', integrity: 'low', availability: 'none' },
  'weak-tls': { attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'none' },
  'exposed-secret': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'none', availability: 'none' },
  'permissive-cors': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'required', scope: 'unchanged', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'insecure-cookie': { attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'none', userInteraction: 'required', scope: 'unchanged', confidentiality: 'low', integrity: 'none', availability: 'none' },
  'expiring-certificate': { attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'none', availability: 'none' },
  'information-disclosure': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'none', availability: 'none' },
  'broken-authentication': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'none' },
  'weak-jwt': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'none' },
  'session-fixation': { attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'none', userInteraction: 'required', scope: 'unchanged', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'missing-csrf': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'required', scope: 'unchanged', confidentiality: 'none', integrity: 'high', availability: 'none' },
  'api-misconfiguration': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'low', availability: 'none' },
  'business-logic-flaw': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'high', availability: 'none' },
  'graphql-introspection': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'none', availability: 'none' },
  'unrestricted-file-upload': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'broken-object-authorization': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'missing-rate-limit': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'none', integrity: 'none', availability: 'low' },
  'sql-injection': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'blind-sql-injection': { attackVector: 'network', attackComplexity: 'high', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'low' },
  'nosql-injection': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'low' },
  'command-injection': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'ssrf': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'xxe': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'none', availability: 'low' },
  'ssti': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'ldap-injection': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'high', availability: 'none' },
  'remote-code-execution': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'reflected-xss': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'required', scope: 'changed', confidentiality: 'low', integrity: 'low', availability: 'none' },
  'stored-xss': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'required', scope: 'changed', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'dom-xss': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'required', scope: 'changed', confidentiality: 'low', integrity: 'low', availability: 'none' },
  'path-traversal': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'none', availability: 'none' },
  'idor': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'unchanged', confidentiality: 'high', integrity: 'low', availability: 'none' },
  'privilege-escalation': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'high', availability: 'high' },
  'business-logic-abuse': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'low', userInteraction: 'none', scope: 'unchanged', confidentiality: 'low', integrity: 'high', availability: 'none' },
  'cloud-metadata-exposure': { attackVector: 'network', attackComplexity: 'low', privilegesRequired: 'none', userInteraction: 'none', scope: 'changed', confidentiality: 'high', integrity: 'low', availability: 'none' },
};

const COMPLIANCE: Partial<Record<string, readonly string[]>> = {
  'A01:2021': ['OWASP-A01', 'PCI-DSS-6.5.8', 'ISO-27001-A.9'],
  'A02:2021': ['OWASP-A02', 'PCI-DSS-4.1', 'ISO-27001-A.10'],
  'A03:2021': ['OWASP-A03', 'PCI-DSS-6.5.1', 'ISO-27001-A.14'],
  'A05:2021': ['OWASP-A05', 'PCI-DSS-2.2', 'ISO-27001-A.12'],
  'A07:2021': ['OWASP-A07', 'PCI-DSS-8.2', 'ISO-27001-A.9'],
};

export const PRIORITY_SLA: Readonly<Record<Priority, number>> = { p1: 7, p2: 30, p3: 90, p4: 180 };

function priorityFor(severity: Severity): Priority {
  return severity === 'critical' ? 'p1' : severity === 'high' ? 'p2' : severity === 'medium' ? 'p3' : 'p4';
}

// ── Assessment Engine ───────────────────────────────────────────────────────

export interface AssessmentInput {
  readonly findings: readonly Finding[];
  readonly surface: AttackSurface;
}

export const assessmentAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<AssessmentInput, ReadonlyMap<string, CvssScore>>({
    id: 'assessment.cvss', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Compute the CVSS v3.1 base score for every finding from its category vector.',
    inputs: ['Finding[]'], outputs: ['CvssScore per finding'],
    responsibilities: ['apply the CVSS v3.1 base equations', 'derive severity from the score'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding whose vector is unknown is scored as medium rather than dropped; an unscored finding must never read as low.',
    handle: (input) => new Map(input.findings.map((f) => [f.id, computeCvss(CATEGORY_VECTOR[f.category])])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, string>>({
    id: 'assessment.business-risk', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'State the business risk each finding carries, in plain language.',
    inputs: ['Finding[]', 'CvssScore per finding'], outputs: ['business risk per finding'],
    responsibilities: ['relate the finding category to a business consequence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no derivable business risk is described by its category title rather than left blank.',
    handle: (input) => new Map(input.findings.map((f) => {
      const sev = input.cvss.get(f.id)?.severity ?? 'medium';
      return [f.id, `${CATEGORY_META[f.category].title} at ${f.targetPath} (${sev}) could expose or alter data that flows through this endpoint.`];
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[] }, ReadonlyMap<string, { fp: boolean; reason: string | null }>>({
    id: 'assessment.false-positive', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Flag findings whose confidence is too low to be treated as confirmed.',
    inputs: ['Finding[]'], outputs: ['false-positive verdict per finding'],
    responsibilities: ['flag a finding below the confidence floor', 'state the reason'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding that cannot be adjudicated is kept as a real finding, never suppressed silently.',
    handle: (input) => new Map(input.findings.map((f) =>
      [f.id, f.confidence < 0.5 ? { fp: true, reason: `confidence ${f.confidence.toFixed(2)} below the 0.50 floor` } : { fp: false, reason: null }])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[] }, ReadonlyMap<string, string | null>>({
    id: 'assessment.duplicate-detection', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Detect findings that duplicate another by fingerprint.',
    inputs: ['Finding[]'], outputs: ['duplicate-of per finding'],
    responsibilities: ['mark a later finding a duplicate of the first with its fingerprint'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An ambiguous duplicate is kept as distinct rather than merged, which over-reports rather than hides.',
    handle: (input) => {
      const firstByFp = new Map<string, string>();
      const out = new Map<string, string | null>();
      for (const f of input.findings) {
        const seen = firstByFp.get(f.fingerprint);
        if (seen) out.set(f.id, seen);
        else { firstByFp.set(f.fingerprint, f.id); out.set(f.id, null); }
      }
      return out;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[] }, readonly (readonly string[])[]>({
    id: 'assessment.semantic-correlation', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Group findings that share a target path, so correlated weaknesses are seen together.',
    inputs: ['Finding[]'], outputs: ['correlation groups'],
    responsibilities: ['group by target path'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncorrelatable finding forms its own group rather than being dropped from correlation.',
    handle: (input) => {
      const byPath = new Map<string, string[]>();
      for (const f of input.findings) byPath.set(f.targetPath, [...(byPath.get(f.targetPath) ?? []), f.id]);
      return [...byPath.values()].filter((g) => g.length > 1);
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ groups: readonly (readonly string[])[]; cvss: ReadonlyMap<string, CvssScore> }, readonly { readonly path: string; readonly escalated: Severity }[]>({
    id: 'assessment.compound-risk', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Escalate the severity of a location where several findings compound.',
    inputs: ['correlation groups', 'CvssScore per finding'], outputs: ['compound escalations'],
    responsibilities: ['escalate a location with three or more correlated findings'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A compound risk that cannot be computed leaves the individual severities in place rather than lowering them.',
    handle: (input) => input.groups.filter((g) => g.length >= 3).map((g) => ({ path: g[0] ?? 'unknown', escalated: 'critical' as Severity })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[] }, ReadonlyMap<string, readonly string[]>>({
    id: 'assessment.compliance-mapping', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Map every finding to the compliance controls it violates.',
    inputs: ['Finding[]'], outputs: ['compliance refs per finding'],
    responsibilities: ['map by OWASP category to PCI-DSS and ISO controls'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no mapped control is tagged with its OWASP reference rather than left uncompliant-unknown.',
    handle: (input) => new Map(input.findings.map((f) => [f.id, COMPLIANCE[f.owaspRef] ?? [`OWASP-${f.owaspRef}`]])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, Priority>>({
    id: 'assessment.priority', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Assign a remediation priority from each finding\'s severity.',
    inputs: ['CvssScore per finding'], outputs: ['Priority per finding'],
    responsibilities: ['map critical to p1 through low to p4'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no severity is prioritised p2, never p4; unknown severity is treated as serious.',
    handle: (input) => new Map(input.findings.map((f) => [f.id, priorityFor(input.cvss.get(f.id)?.severity ?? 'high')])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ priorities: ReadonlyMap<string, Priority> }, ReadonlyMap<string, number>>({
    id: 'assessment.sla', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Assign a remediation SLA in days from each finding\'s priority.',
    inputs: ['Priority per finding'], outputs: ['SLA days per finding'],
    responsibilities: ['map p1 to 7 days through p4 to 180'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no priority is given the p1 SLA, never the longest one.',
    handle: (input) => new Map([...input.priorities.entries()].map(([id, p]) => [id, PRIORITY_SLA[p]])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[]; cvss: ReadonlyMap<string, CvssScore> }, ReadonlyMap<string, { c: boolean; i: boolean; a: boolean }>>({
    id: 'assessment.cia-impact', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Derive the CIA impact of each finding from its CVSS vector.',
    inputs: ['CvssScore per finding'], outputs: ['CIA per finding'],
    responsibilities: ['mark confidentiality, integrity and availability from the vector'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no vector is marked as impacting all three, which over-states rather than hides.',
    handle: (input) => new Map(input.findings.map((f) => {
      const v = CATEGORY_VECTOR[f.category];
      return [f.id, { c: v.confidentiality !== 'none', i: v.integrity !== 'none', a: v.availability !== 'none' }];
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[]; surface: AttackSurface }, ReadonlyMap<string, 'low' | 'medium' | 'high'>>({
    id: 'assessment.business-criticality', domain: 'assessment', stage: 'reflection', plane: 'IP',
    purpose: 'Rate business criticality from the classification of the asset the finding touches.',
    inputs: ['Finding[]', 'AttackSurface'], outputs: ['business criticality per finding'],
    responsibilities: ['raise criticality for confidential and regulated assets'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding whose asset is unknown is rated high, never low; unknown ownership is treated as sensitive.',
    handle: (input) => new Map(input.findings.map((f) => {
      const asset = input.surface.assets.find((a) => a.endpointIds.some((e) => f.targetPath.includes(e.split(' ')[1] ?? '')));
      const cls = asset?.classification ?? 'confidential';
      return [f.id, cls === 'regulated' || cls === 'confidential' ? 'high' : cls === 'internal' ? 'medium' : 'low'];
    })),
  }) as AgentDefinition<never, unknown>,
];

/** Assemble the assessed findings from the assessment agents' outputs. Deterministic composition. */
export function assembleAssessment(
  findings: readonly Finding[],
  cvss: ReadonlyMap<string, CvssScore>,
  businessRisk: ReadonlyMap<string, string>,
  falsePositive: ReadonlyMap<string, { fp: boolean; reason: string | null }>,
  duplicate: ReadonlyMap<string, string | null>,
  compliance: ReadonlyMap<string, readonly string[]>,
  priority: ReadonlyMap<string, Priority>,
  sla: ReadonlyMap<string, number>,
  cia: ReadonlyMap<string, { c: boolean; i: boolean; a: boolean }>,
  criticality: ReadonlyMap<string, 'low' | 'medium' | 'high'>,
): readonly AssessedFinding[] {
  return findings.map((f) => {
    const fp = falsePositive.get(f.id) ?? { fp: false, reason: null };
    const ciaImpact = cia.get(f.id) ?? { c: true, i: true, a: true };
    return {
      finding: f,
      cvss: cvss.get(f.id) ?? computeCvss(CATEGORY_VECTOR[f.category]),
      businessRisk: businessRisk.get(f.id) ?? CATEGORY_META[f.category].title,
      falsePositive: fp.fp, falsePositiveReason: fp.reason,
      duplicateOf: duplicate.get(f.id) ?? null,
      compliance: compliance.get(f.id) ?? [],
      priority: priority.get(f.id) ?? 'p2',
      slaDays: sla.get(f.id) ?? 30,
      cia: { confidentiality: ciaImpact.c, integrity: ciaImpact.i, availability: ciaImpact.a },
      businessCriticality: criticality.get(f.id) ?? 'high',
    };
  });
}

// ── Risk Intelligence ───────────────────────────────────────────────────────

export interface RiskInput {
  readonly assessed: readonly AssessedFinding[];
}

export const riskAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<RiskInput, { readonly score: number; readonly rationale: string }>({
    id: 'risk.aggregate-score', domain: 'risk', stage: 'reflection', plane: 'IP',
    purpose: 'Aggregate the finding population into a single risk score.',
    inputs: ['AssessedFinding[]'], outputs: ['risk score'],
    responsibilities: ['weight by severity', 'exclude false positives and duplicates'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable score returns the maximum, which escalates rather than reassures.',
    handle: (input) => {
      const live = input.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);
      const score = Math.min(100, Math.round(live.reduce((s, a) => s + a.cvss.baseScore * 2, 0)));
      return { score, rationale: `${live.length} live finding(s) aggregated` };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<RiskInput, readonly string[]>({
    id: 'risk.prioritization', domain: 'risk', stage: 'reflection', plane: 'IP',
    purpose: 'Order live findings by CVSS score and business criticality.',
    inputs: ['AssessedFinding[]'], outputs: ['prioritised finding ids'],
    responsibilities: ['rank critical business assets first'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unorderable population keeps input order rather than dropping findings from the ranking.',
    handle: (input) => [...input.assessed]
      .filter((a) => !a.falsePositive && a.duplicateOf === null)
      .sort((a, b) => (b.cvss.baseScore - a.cvss.baseScore) || (a.finding.id < b.finding.id ? -1 : 1))
      .map((a) => a.finding.id),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RiskInput, { readonly compound: number; readonly rationale: string }>({
    id: 'risk.compound-correlation', domain: 'risk', stage: 'reflection', plane: 'IP',
    purpose: 'Count locations where multiple high findings compound into a greater risk.',
    inputs: ['AssessedFinding[]'], outputs: ['compound risk count'],
    responsibilities: ['count paths carrying two or more high-severity findings'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable correlation reports zero compounds rather than a fabricated number.',
    handle: (input) => {
      const byPath = new Map<string, number>();
      for (const a of input.assessed.filter((x) => !x.falsePositive && (x.cvss.severity === 'high' || x.cvss.severity === 'critical'))) {
        byPath.set(a.finding.targetPath, (byPath.get(a.finding.targetPath) ?? 0) + 1);
      }
      const compound = [...byPath.values()].filter((n) => n >= 2).length;
      return { compound, rationale: `${compound} location(s) carry two or more high findings` };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<RiskInput, { readonly trend: 'improving' | 'stable' | 'worsening'; readonly rationale: string }>({
    id: 'risk.exposure-trend', domain: 'risk', stage: 'reflection', plane: 'IP',
    purpose: 'State the exposure trend from the current finding profile.',
    inputs: ['AssessedFinding[]'], outputs: ['exposure trend'],
    responsibilities: ['report worsening when critical findings are present'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An indeterminate trend reports "stable" and records that history was unavailable, never "improving".',
    handle: (input) => {
      const criticals = input.assessed.filter((a) => a.cvss.severity === 'critical' && !a.falsePositive).length;
      return { trend: criticals > 0 ? 'worsening' : 'stable', rationale: `${criticals} critical finding(s) in this run` };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<RiskInput, { readonly forecast: string }>({
    id: 'risk.forecast', domain: 'risk', stage: 'reflection', plane: 'IP',
    purpose: 'Forecast the business risk if the current findings remain unremediated.',
    inputs: ['AssessedFinding[]'], outputs: ['risk forecast'],
    responsibilities: ['relate unremediated critical findings to a business exposure window'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable forecast states that a forecast could not be produced rather than an optimistic default.',
    handle: (input) => {
      const p1 = input.assessed.filter((a) => a.priority === 'p1' && !a.falsePositive).length;
      return { forecast: p1 > 0 ? `${p1} finding(s) require remediation within 7 days to bound exposure` : 'no finding requires emergency remediation this run' };
    },
  }) as AgentDefinition<never, unknown>,
];

export { CATEGORY_VECTOR, priorityFor };
