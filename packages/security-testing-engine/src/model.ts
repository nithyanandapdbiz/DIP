/**
 * The Security Testing Engine's domain model — capability 5 of 6.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 08-security-model.md · 11-capability-model.md §2 (capability 5)
 *                  19-repository-ownership.md · 22-security-threat-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-06.x (customer artefacts are Execution Plane custody)
 *   Evidence     : E-5 (no customer artefact is retained in the Intelligence Plane)
 *
 * THE BOUNDARY IS IN THE TYPES, NOT IN THE DISCIPLINE.
 *
 * Security verification reads the customer's application, its configuration, its
 * dependencies and its infrastructure-as-code. The Execution Plane holds all of that
 * content — header values, cookie values, TLS parameters, dependency manifests, IaC
 * source, secret-bearing strings. The Intelligence Plane must reason about the weaknesses
 * that content reveals without ever holding the content. "Nothing crosses" is not
 * available; a weakness that cannot name where it was found is useless.
 *
 * The line is drawn between EVIDENCE and WEAKNESS, in the type system:
 *
 *   ObservedResource / RawWeakness — Execution Plane. May carry `values`: header values,
 *                                    cookie values, TLS ciphers, dependency versions, the
 *                                    matched snippet that proves the weakness.
 *   SecurityFact / Weakness        — Intelligence Plane. Carry a kind, an identifier, a
 *                                    location, a category, a CWE and a severity. There is
 *                                    no field for a value, a snippet or a body — so none
 *                                    can cross.
 *
 * `minimiseFact` and `minimiseWeakness` are the ONLY two crossing points, exactly as
 * pentest's `minimiseFinding` and Discovery's `minimise` are theirs. Auditing what
 * crosses means auditing two functions, not every agent.
 *
 * WHAT CAPABILITY 5 IS, AND IS NOT (ADR-0028 §2, the boundary against capability 6).
 * Capability 5 answers "does it satisfy its security REQUIREMENTS?" — it verifies, by
 * reading structure and configuration, that controls are present and correct: ASVS/SDL
 * requirements, SAST patterns, dependency CVEs, exposed secrets, security headers, CORS,
 * CSP, cookie flags, TLS, certificates, IaC/cloud/container/Kubernetes hardening,
 * authn/authz/session configuration, privacy controls and AI-guardrail configuration.
 * It is READ-ONLY and NON-INTRUSIVE. It NEVER launches an active exploit — SQL injection,
 * XSS, SSRF, command injection and the rest are ADVERSARIAL categories owned by capability
 * 6 (Penetration Testing Engine). An intrusive category requested here is refused at the
 * guardrail stage, before any check runs — the analogue of pentest's "no destructive
 * probe on production".
 */

// ── Severity ────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  critical: 4, high: 3, medium: 2, low: 1, info: 0,
};
export function severityForScore(score: number): Severity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0.0) return 'low';
  return 'info';
}
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ── Verification check categories (capability 5 scope) ──────────────────────

/**
 * The verification categories capability 5 owns. Every one is READ-ONLY: it inspects a
 * resource's structure or configuration and reports whether a control is present and
 * correct. None sends an exploit payload.
 */
export type CheckCategory =
  | 'sast-pattern'
  | 'dependency-cve'
  | 'secret-exposure'
  | 'security-header'
  | 'cors-policy'
  | 'csp-policy'
  | 'cookie-flags'
  | 'tls-configuration'
  | 'certificate-validity'
  | 'iac-misconfig'
  | 'container-hardening'
  | 'kubernetes-policy'
  | 'cloud-baseline'
  | 'authn-config'
  | 'authz-config'
  | 'session-config'
  | 'privacy-control'
  | 'ai-guardrail-config';

export interface CheckMeta {
  readonly category: CheckCategory;
  readonly title: string;
  readonly cwe: string;
  readonly owasp: string;
  readonly asvs: string;
  readonly domain: 'application' | 'dependency' | 'identity' | 'crypto' | 'infrastructure' | 'privacy' | 'ai';
  /** The resource kind this check reads. */
  readonly reads: ResourceKind;
  readonly defaultSeverity: Severity;
}

export const CHECK_META: Readonly<Record<CheckCategory, CheckMeta>> = {
  'sast-pattern': { category: 'sast-pattern', title: 'Insecure code pattern', cwe: 'CWE-710', owasp: 'A04:2021', asvs: 'V1', domain: 'application', reads: 'source-unit', defaultSeverity: 'medium' },
  'dependency-cve': { category: 'dependency-cve', title: 'Vulnerable dependency', cwe: 'CWE-1035', owasp: 'A06:2021', asvs: 'V14', domain: 'dependency', reads: 'dependency', defaultSeverity: 'high' },
  'secret-exposure': { category: 'secret-exposure', title: 'Exposed secret', cwe: 'CWE-798', owasp: 'A07:2021', asvs: 'V6', domain: 'application', reads: 'secret-surface', defaultSeverity: 'critical' },
  'security-header': { category: 'security-header', title: 'Missing security header', cwe: 'CWE-693', owasp: 'A05:2021', asvs: 'V14.4', domain: 'application', reads: 'header-set', defaultSeverity: 'medium' },
  'cors-policy': { category: 'cors-policy', title: 'Permissive CORS policy', cwe: 'CWE-942', owasp: 'A05:2021', asvs: 'V14.5', domain: 'application', reads: 'header-set', defaultSeverity: 'high' },
  'csp-policy': { category: 'csp-policy', title: 'Weak Content-Security-Policy', cwe: 'CWE-1021', owasp: 'A05:2021', asvs: 'V14.4', domain: 'application', reads: 'header-set', defaultSeverity: 'medium' },
  'cookie-flags': { category: 'cookie-flags', title: 'Insecure cookie flags', cwe: 'CWE-614', owasp: 'A05:2021', asvs: 'V3.4', domain: 'application', reads: 'cookie', defaultSeverity: 'medium' },
  'tls-configuration': { category: 'tls-configuration', title: 'Weak TLS configuration', cwe: 'CWE-326', owasp: 'A02:2021', asvs: 'V9', domain: 'crypto', reads: 'tls-config', defaultSeverity: 'high' },
  'certificate-validity': { category: 'certificate-validity', title: 'Certificate validity issue', cwe: 'CWE-295', owasp: 'A02:2021', asvs: 'V9.2', domain: 'crypto', reads: 'tls-config', defaultSeverity: 'high' },
  'iac-misconfig': { category: 'iac-misconfig', title: 'Infrastructure-as-code misconfiguration', cwe: 'CWE-1188', owasp: 'A05:2021', asvs: 'V1.14', domain: 'infrastructure', reads: 'iac-file', defaultSeverity: 'high' },
  'container-hardening': { category: 'container-hardening', title: 'Container hardening gap', cwe: 'CWE-250', owasp: 'A05:2021', asvs: 'V14.1', domain: 'infrastructure', reads: 'container-image', defaultSeverity: 'medium' },
  'kubernetes-policy': { category: 'kubernetes-policy', title: 'Kubernetes policy violation', cwe: 'CWE-284', owasp: 'A05:2021', asvs: 'V1.14', domain: 'infrastructure', reads: 'k8s-manifest', defaultSeverity: 'high' },
  'cloud-baseline': { category: 'cloud-baseline', title: 'Cloud baseline deviation', cwe: 'CWE-1032', owasp: 'A05:2021', asvs: 'V1.14', domain: 'infrastructure', reads: 'cloud-resource', defaultSeverity: 'high' },
  'authn-config': { category: 'authn-config', title: 'Authentication configuration weakness', cwe: 'CWE-287', owasp: 'A07:2021', asvs: 'V2', domain: 'identity', reads: 'auth-config', defaultSeverity: 'high' },
  'authz-config': { category: 'authz-config', title: 'Authorization configuration weakness', cwe: 'CWE-285', owasp: 'A01:2021', asvs: 'V4', domain: 'identity', reads: 'auth-config', defaultSeverity: 'high' },
  'session-config': { category: 'session-config', title: 'Session management weakness', cwe: 'CWE-384', owasp: 'A07:2021', asvs: 'V3', domain: 'identity', reads: 'auth-config', defaultSeverity: 'medium' },
  'privacy-control': { category: 'privacy-control', title: 'Privacy control gap', cwe: 'CWE-359', owasp: 'A04:2021', asvs: 'V8', domain: 'privacy', reads: 'privacy-config', defaultSeverity: 'medium' },
  'ai-guardrail-config': { category: 'ai-guardrail-config', title: 'AI guardrail configuration gap', cwe: 'CWE-1426', owasp: 'LLM01:2025', asvs: 'V1', domain: 'ai', reads: 'ai-config', defaultSeverity: 'high' },
};

export const CHECK_CATEGORIES: readonly CheckCategory[] = Object.keys(CHECK_META) as CheckCategory[];

/**
 * Adversarial / exploitation categories. THESE ARE CAPABILITY 6, NOT 5.
 *
 * If configuration requests one of these of the Security Testing Engine, the guardrail
 * stage refuses the run and names the boundary: active exploitation belongs to the
 * Penetration Testing Engine. This is the type-level enforcement of ADR-0028 §2.
 */
export const INTRUSIVE_CATEGORIES: readonly string[] = [
  'sql-injection', 'blind-sql-injection', 'nosql-injection', 'command-injection',
  'ldap-injection', 'xpath-injection', 'ssti', 'xxe', 'xss', 'stored-xss', 'dom-xss',
  'ssrf', 'csrf', 'open-redirect', 'idor', 'privilege-escalation', 'race-condition',
  'http-request-smuggling', 'rce', 'attack-chain', 'exploit',
];

export function isIntrusive(category: string): boolean {
  return INTRUSIVE_CATEGORIES.includes(category);
}

// ── Execution Plane observation (custody stays here) ────────────────────────

export type ResourceKind =
  | 'endpoint' | 'header-set' | 'cookie' | 'tls-config' | 'dependency'
  | 'iac-file' | 'container-image' | 'k8s-manifest' | 'cloud-resource'
  | 'secret-surface' | 'source-unit' | 'auth-config' | 'privacy-config' | 'ai-config';

/**
 * A resource the Execution Plane observed. `values` may carry content — header values,
 * cookie values, dependency versions, the matched snippet. It NEVER leaves the Execution
 * Plane; the Intelligence Plane sees only what `minimiseFact` lets across.
 */
export interface ObservedResource {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly values: Readonly<Record<string, string>>;
  readonly parentId: string | null;
}

/**
 * A raw weakness a checker produced in the Execution Plane. Carries the `detail` and the
 * `evidenceSnippet` that prove it — both Execution Plane custody. It is minimised before
 * it can cross.
 */
export interface RawWeakness {
  readonly category: CheckCategory;
  readonly resourceId: string;
  readonly path: string;
  readonly detail: string;
  readonly evidenceSnippet: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
}

// ── Intelligence Plane crossings (structure only) ───────────────────────────

/**
 * A minimised fact about a resource. Carries a kind, an identifier, a location and the
 * NAMES of attributes — never their values. This is what crosses the boundary.
 */
export interface SecurityFact {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly attributeNames: readonly string[];
}

/** The single fact-crossing point. A value cannot cross because `SecurityFact` has no field for one. */
export function minimiseFact(resource: ObservedResource): SecurityFact {
  return {
    kind: resource.kind,
    id: resource.id,
    label: scrubLabel(resource.label),
    path: resource.path,
    attributeNames: Object.keys(resource.values).sort(),
  };
}

export function minimiseFacts(resources: readonly ObservedResource[]): readonly SecurityFact[] {
  return resources.map(minimiseFact).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export type Confidence = 'confirmed' | 'firm' | 'tentative';

/**
 * A minimised weakness. Carries a category, a CWE, an OWASP reference, a location, a
 * severity, a confidence and evidence REFERENCES — never the snippet that proved it.
 */
export interface Weakness {
  readonly id: string;
  readonly category: CheckCategory;
  readonly cwe: string;
  readonly owasp: string;
  readonly asvs: string;
  readonly path: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly evidenceRefs: readonly string[];
}

/** The single weakness-crossing point (the analogue of pentest's `minimiseFinding`). */
export function minimiseWeakness(raw: RawWeakness, id: string, evidenceRefs: readonly string[] = []): Weakness {
  const meta = CHECK_META[raw.category];
  return {
    id,
    category: raw.category,
    cwe: meta.cwe,
    owasp: meta.owasp,
    asvs: meta.asvs,
    path: raw.path,
    severity: raw.severity,
    confidence: raw.confidence,
    evidenceRefs,
  };
}

/** Remove anything that looks like a value from a free-text label before it crosses. */
export function scrubLabel(label: string): string {
  return label.replace(/[=:]\s*\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export type EvidenceKind = 'config-snapshot' | 'dependency-manifest' | 'pattern-match' | 'header-capture' | 'tls-handshake' | 'iac-fragment';

/** Evidence crosses as a reference only: a hash and a locator, never the artefact (E-5). */
export interface EvidenceReference {
  readonly weaknessCategory: CheckCategory;
  readonly kind: EvidenceKind;
  readonly sha256: string;
  readonly locator: string;
  readonly capturedAtStage: string;
}

// ── Security requirements (capability 5's driving artefact) ─────────────────

export type RequirementSource = 'ASVS' | 'OWASP-Top10' | 'OWASP-API-Top10' | 'SDL' | 'NIST' | 'CIS' | 'privacy' | 'AI';

export interface SecurityRequirement {
  readonly id: string;
  readonly source: RequirementSource;
  readonly control: string;
  readonly statement: string;
  /** The verification categories that, if they pass, satisfy this requirement. */
  readonly categories: readonly CheckCategory[];
  readonly asvsLevel: 1 | 2 | 3;
}

export interface RequirementCoverage {
  readonly requirementId: string;
  readonly categories: readonly CheckCategory[];
  readonly verified: boolean;
  readonly satisfied: boolean;
  readonly openWeaknessCount: number;
}

// ── Attack surface (the Security Requirement Model, stage 4) ────────────────

export interface TrustBoundary {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly description: string;
}

export interface Asset {
  readonly id: string;
  readonly label: string;
  readonly classification: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface SecurityModel {
  readonly targetId: string;
  readonly facts: readonly SecurityFact[];
  readonly requirements: readonly SecurityRequirement[];
  readonly trustBoundaries: readonly TrustBoundary[];
  readonly assets: readonly Asset[];
  readonly inScopeCategories: readonly CheckCategory[];
  readonly exposureScore: number;
}

// ── Scope and configuration ─────────────────────────────────────────────────

export interface SecurityScope {
  readonly targetId: string;
  readonly allowedHosts: readonly string[];
  /** The ASVS assurance level to verify against. Higher levels demand more categories. */
  readonly asvsLevel: 1 | 2 | 3;
  /** Categories the tenant requested. May include intrusive ones — those are refused. */
  readonly requestedCategories: readonly string[];
  readonly complianceTargets: readonly string[];
  readonly authorizationReference: string;
  readonly environment: 'production' | 'staging' | 'development' | 'unknown';
  /** Verification is read-only. `false` is refused at the guardrail stage. */
  readonly readOnly: boolean;
}

export interface Authorization {
  readonly targetId: string;
  readonly authorizedCategories: readonly CheckCategory[];
  readonly refusedCategories: readonly string[];
  readonly asvsLevel: 1 | 2 | 3;
  readonly readOnly: boolean;
  readonly certified: boolean;
  readonly refusals: readonly string[];
}

// ── Assessment, compliance, remediation, posture ────────────────────────────

export interface CvssScore {
  readonly baseScore: number;
  readonly vector: string;
  readonly severity: Severity;
}

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export interface AssessedWeakness {
  readonly weakness: Weakness;
  readonly cvss: CvssScore;
  readonly priority: Priority;
  readonly slaHours: number;
  readonly falsePositive: boolean;
  readonly falsePositiveReason: string | null;
  readonly duplicateOf: string | null;
  readonly businessImpact: string;
  readonly compliance: readonly string[];
}

export interface ComplianceResult {
  readonly framework: string;
  readonly controlsAssessed: number;
  readonly controlsSatisfied: number;
  readonly gaps: readonly string[];
  readonly score: number;
}

export type RemediationKind = 'developer-guidance' | 'code-fix' | 'config-fix' | 'dependency-upgrade';

export interface Remediation {
  readonly weaknessId: string;
  readonly kind: RemediationKind;
  readonly summary: string;
  readonly priority: Priority;
  readonly effort: 'trivial' | 'small' | 'medium' | 'large';
  readonly owner: string;
  readonly regressionTest: string;
}

export interface PostureScores {
  readonly securityScore: number;
  readonly owaspScore: number;
  readonly apiScore: number;
  readonly cloudScore: number;
  readonly identityScore: number;
  readonly complianceScore: number;
  readonly riskHeatMap: Readonly<Record<string, number>>;
  readonly attackSurfaceSummary: string;
  readonly trend: 'improving' | 'stable' | 'worsening';
}

export interface SyncRecord {
  readonly kind: string;
  readonly externalId: string;
  readonly published: boolean;
  readonly reason: string | null;
}

export type LearningKind = 'false-positive' | 'requirement-coverage' | 'trend' | 'knowledge';
export interface LearningRecord {
  readonly kind: LearningKind;
  readonly key: string;
  readonly detail: string;
}

// ── The report (stage 12 output) ────────────────────────────────────────────

export interface SecurityReport {
  readonly targetId: string;
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly asvsLevel: 1 | 2 | 3;
  readonly findingCounts: Readonly<Record<Severity, number>>;
  readonly owaspSummary: Readonly<Record<string, number>>;
  readonly cvssAverage: number | null;
  readonly scores: PostureScores;
  readonly compliance: readonly ComplianceResult[];
  readonly requirementCoverage: { readonly total: number; readonly verified: number; readonly satisfied: number };
  readonly releaseReadiness: 'READY' | 'CONDITIONAL' | 'NOT-READY';
  readonly rationale: string;
  readonly falsePositiveRate: number | null;
}

// ── CVSS (deterministic, the score is never overwritten by reasoning) ───────

/** A compact, deterministic CVSS-style base score from severity and confidence. */
export function computeCvss(severity: Severity, confidence: Confidence): CvssScore {
  const base: Record<Severity, number> = { critical: 9.3, high: 7.5, medium: 5.3, low: 3.1, info: 0.0 };
  const conf: Record<Confidence, number> = { confirmed: 1.0, firm: 0.95, tentative: 0.85 };
  const score = Math.round(base[severity] * conf[confidence] * 10) / 10;
  return {
    baseScore: score,
    vector: `CVSS:3.1/AV:N/AC:L/S:U/sev:${severity}/conf:${confidence}`,
    severity: severityForScore(score),
  };
}

/** A stable content hash for evidence references. Deterministic across processes. */
export function digestOf(...parts: readonly string[]): string {
  let h1 = 0x811c9dc5;
  const s = parts.join(' ');
  for (let i = 0; i < s.length; i += 1) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0').repeat(8).slice(0, 64);
}
