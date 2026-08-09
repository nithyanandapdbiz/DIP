/**
 * The Penetration Testing Engine's domain model.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 08-security-model.md · 11-capability-model.md
 *                  19-repository-ownership.md
 *   ADR          : ADR-0027
 *   Criteria     : C-06.x (customer artefacts are Execution Plane custody)
 *   Evidence     : E-5 (no customer artefact is retained in the Intelligence Plane)
 *
 * THE BOUNDARY IS IN THE TYPES, NOT IN THE DISCIPLINE.
 *
 * A penetration test has the same problem inverse-flow discovery does, sharpened: the
 * Execution Plane sends probes and captures raw HTTP traffic — request bodies, response
 * bodies, headers, cookies, reflected payloads — and the Intelligence Plane must reason
 * about the vulnerabilities that traffic reveals without ever holding the traffic itself.
 * "Nothing crosses" is not available; a finding that cannot name where it was found is
 * useless.
 *
 * The line is drawn between EVIDENCE and FINDING, in the type system:
 *
 *   ObservedTarget / RawFinding — Execution Plane. May carry values: response bodies,
 *                                 header values, cookie values, the reflected payload, the
 *                                 exact request that triggered the finding.
 *   SurfaceFact / Finding       — Intelligence Plane. Carry a kind, an identifier, a
 *                                 location (path + parameter NAME), a category, a CWE and
 *                                 a severity. There is no field for a body, a payload value
 *                                 or a captured header value — so none can cross.
 *
 * A SQL error string in a response proves the injection; the string stays in the Execution
 * Plane as evidence, and what crosses is `{ category: 'sql-injection', location: '/api/orders',
 * parameterName: 'id', cwe: 'CWE-89', evidenceRef: <hash+locator> }`. The proof is held
 * where it was captured; the fact that a proof exists is what the Intelligence Plane reasons
 * over. `EvidenceReference` has a hash and a locator and no content field, a rule the
 * platform has already certified and this engine inherits rather than restates.
 */

// ── Scope and configuration ─────────────────────────────────────────────────

/** The three scan phases, in ascending intrusiveness. Configuration selects the ceiling. */
export type ScanPhase = 'passive' | 'active-safe' | 'active-full';
export const SCAN_PHASES: readonly ScanPhase[] = ['passive', 'active-safe', 'active-full'];

/** A phase is permitted if it is at or below the configured ceiling. */
export function phaseAllowed(ceiling: ScanPhase, phase: ScanPhase): boolean {
  return SCAN_PHASES.indexOf(phase) <= SCAN_PHASES.indexOf(ceiling);
}

export interface PentestScope {
  readonly targetId: string;
  /** Hosts and origins authorised for testing. Anything else is refused at the scope gate. */
  readonly allowedHosts: readonly string[];
  /** Paths explicitly excluded. Checked before any request, never after. */
  readonly exclusions: readonly string[];
  /** The authorisation record that permits this test at all. No packet without it. */
  readonly authorizationReference: string;
  /** The most intrusive phase permitted. `passive` sends no active probe. */
  readonly scanPhaseCeiling: ScanPhase;
  /** Safe mode forbids any destructive or state-changing probe, even in active-full. */
  readonly safeMode: boolean;
  /** Requests per second the customer environment will tolerate. */
  readonly rateLimitPerSecond: number;
  /** HTTPS required on every in-scope host. An http:// target is refused. */
  readonly httpsRequired: boolean;
  /** Environment classification. `production` tightens every guardrail. */
  readonly environment: 'production' | 'staging' | 'test' | 'unknown';
}

// ── Execution Plane observation ─────────────────────────────────────────────

export type TargetKind =
  | 'host' | 'service' | 'port' | 'route' | 'page' | 'form' | 'field' | 'parameter'
  | 'api-endpoint' | 'header' | 'cookie' | 'tls-config' | 'certificate' | 'auth-flow'
  | 'session' | 'hidden-resource' | 'technology' | 'waf' | 'dns-record' | 'business-journey'
  | 'cloud-metadata-surface' | 'graphql-endpoint' | 'file-upload' | 'websocket';

/**
 * What the Execution Plane observed about the target. Execution Plane custody, permanently.
 *
 * `values` is where content lives — a header's value, a cookie's value, a TLS cipher list,
 * a parameter's example value. It is the reason this type never leaves the EP. Nothing in
 * the Intelligence Plane accepts an `ObservedTarget`, and the compiler enforces that rather
 * than a review comment.
 */
export interface ObservedTarget {
  readonly kind: TargetKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  /** Attribute name to observed value. EP only. */
  readonly values: Readonly<Record<string, string>>;
  readonly parentId: string | null;
}

/**
 * The minimised projection of a target that crosses into the Intelligence Plane.
 *
 * Note the absence: there is no `values`, and `attributeNames` is a list of names. A change
 * that wanted to smuggle a value across would have to add a field, which is a reviewable act.
 */
export interface SurfaceFact {
  readonly kind: TargetKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly attributeNames: readonly string[];
  readonly parentId: string | null;
}

/**
 * Minimise an observation into a surface fact.
 *
 * The single crossing point for surface structure. Auditing what crosses means auditing one
 * function rather than every agent that ever touched a target.
 */
export function minimise(target: ObservedTarget): SurfaceFact {
  return {
    kind: target.kind,
    id: target.id,
    label: scrubLabel(target.label),
    path: target.path,
    attributeNames: Object.keys(target.values).sort(),
    parentId: target.parentId,
  };
}

/**
 * Remove content that a label sometimes carries by accident.
 *
 * A route label is structure. A label reading "GET /api/orders/4471?token=S3CR3T" is
 * structure with a session token in it. Emails, long digit runs, reference codes and
 * query-string secrets are replaced rather than the label being dropped, because a label is
 * what makes an attack-surface map readable.
 */
export function scrubLabel(label: string): string {
  return label
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '{email}')
    .replace(/([?&](?:token|key|secret|password|sig|auth)=)[^\s&]+/gi, '$1{redacted}')
    .replace(/\b\d[\d\s-]{7,}\b/g, '{number}')
    .replace(/\b[A-Z]{2,}-\d{3,}\b/g, '{reference}')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Attack surface (Intelligence Plane) ─────────────────────────────────────

export interface Endpoint {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  /** Parameter names only. Never example values — those are content. */
  readonly parameterNames: readonly string[];
  readonly serviceId: string | null;
  readonly authenticated: boolean;
}

export interface TrustBoundary {
  readonly id: string;
  readonly name: string;
  /** Endpoint ids on the exposed side. */
  readonly exposes: readonly string[];
  readonly kind: 'internet-facing' | 'authenticated' | 'admin' | 'internal' | 'third-party';
}

export interface Asset {
  readonly id: string;
  readonly name: string;
  readonly classification: 'public' | 'internal' | 'confidential' | 'regulated';
  readonly endpointIds: readonly string[];
}

export interface AttackSurface {
  readonly targetId: string;
  readonly hosts: readonly string[];
  readonly services: readonly string[];
  readonly openPorts: readonly string[];
  readonly endpoints: readonly Endpoint[];
  readonly entryPoints: readonly string[];
  readonly trustBoundaries: readonly TrustBoundary[];
  readonly assets: readonly Asset[];
  readonly technologies: readonly string[];
  readonly wafPresent: boolean;
  readonly businessJourneys: readonly string[];
  readonly exposureScore: number;
}

// ── Scanning: raw findings (EP) and minimised findings (IP) ──────────────────

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export const SEVERITY_ORDER: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

/**
 * The vulnerability categories the scanners detect. One category per detector so a finding
 * always names what it is, and a scanner never emits a category it did not test for.
 */
export type FindingCategory =
  // passive
  | 'missing-security-header' | 'weak-tls' | 'exposed-secret' | 'permissive-cors'
  | 'insecure-cookie' | 'expiring-certificate' | 'information-disclosure'
  // active-safe
  | 'broken-authentication' | 'weak-jwt' | 'session-fixation' | 'missing-csrf'
  | 'api-misconfiguration' | 'business-logic-flaw' | 'graphql-introspection'
  | 'unrestricted-file-upload' | 'broken-object-authorization' | 'missing-rate-limit'
  // active-full
  | 'sql-injection' | 'blind-sql-injection' | 'nosql-injection' | 'command-injection'
  | 'ssrf' | 'xxe' | 'ssti' | 'ldap-injection' | 'remote-code-execution'
  | 'reflected-xss' | 'stored-xss' | 'dom-xss' | 'path-traversal' | 'idor'
  | 'privilege-escalation' | 'business-logic-abuse' | 'cloud-metadata-exposure';

/** Which phase a category belongs to. A scanner cannot run outside its phase. */
export const CATEGORY_PHASE: Readonly<Record<FindingCategory, ScanPhase>> = {
  'missing-security-header': 'passive', 'weak-tls': 'passive', 'exposed-secret': 'passive',
  'permissive-cors': 'passive', 'insecure-cookie': 'passive', 'expiring-certificate': 'passive',
  'information-disclosure': 'passive',
  'broken-authentication': 'active-safe', 'weak-jwt': 'active-safe', 'session-fixation': 'active-safe',
  'missing-csrf': 'active-safe', 'api-misconfiguration': 'active-safe', 'business-logic-flaw': 'active-safe',
  'graphql-introspection': 'active-safe', 'unrestricted-file-upload': 'active-safe',
  'broken-object-authorization': 'active-safe', 'missing-rate-limit': 'active-safe',
  'sql-injection': 'active-full', 'blind-sql-injection': 'active-full', 'nosql-injection': 'active-full',
  'command-injection': 'active-full', 'ssrf': 'active-full', 'xxe': 'active-full', 'ssti': 'active-full',
  'ldap-injection': 'active-full', 'remote-code-execution': 'active-full', 'reflected-xss': 'active-full',
  'stored-xss': 'active-full', 'dom-xss': 'active-full', 'path-traversal': 'active-full', 'idor': 'active-full',
  'privilege-escalation': 'active-full', 'business-logic-abuse': 'active-full', 'cloud-metadata-exposure': 'active-full',
};

/** Whether a category's probe changes server state. Safe mode refuses these. */
export const CATEGORY_DESTRUCTIVE: Readonly<Record<FindingCategory, boolean>> = Object.fromEntries(
  (Object.keys(CATEGORY_PHASE) as FindingCategory[]).map((c) => [
    c,
    c === 'stored-xss' || c === 'command-injection' || c === 'remote-code-execution' ||
    c === 'unrestricted-file-upload' || c === 'business-logic-abuse' || c === 'privilege-escalation',
  ]),
) as Record<FindingCategory, boolean>;

/**
 * What a scanner observed, before it crosses. Execution Plane custody, permanently.
 *
 * `requestSnippet` and `responseSnippet` carry the actual traffic that proves the finding —
 * a SQL error, a reflected payload, a directory listing. They are the reason this type never
 * leaves the EP. `minimiseFinding` produces the `Finding` that crosses, and it never copies
 * a snippet into it.
 */
export interface RawFinding {
  readonly category: FindingCategory;
  readonly targetPath: string;
  readonly parameterName: string | null;
  readonly method: string;
  /** The exact request that triggered it. EP only. */
  readonly requestSnippet: string;
  /** The response that proved it — an error, a reflection, a listing. EP only. */
  readonly responseSnippet: string;
  /** How confident the detector is that this is real, 0..1. */
  readonly confidence: number;
  /** Evidence captured for it, by reference. */
  readonly evidence: readonly EvidenceReference[];
}

/**
 * The minimised finding that crosses into the Intelligence Plane.
 *
 * There is no request snippet, no response snippet, no payload value. What crosses is the
 * category, the location as a path and a parameter NAME, the CWE, and a reference to the
 * evidence that stayed behind. A future change wanting to carry the proof itself would have
 * to add a field, which is reviewable rather than invisible.
 */
export interface Finding {
  readonly id: string;
  readonly category: FindingCategory;
  readonly targetPath: string;
  readonly parameterName: string | null;
  readonly method: string;
  readonly cwe: string;
  readonly owaspRef: string;
  readonly confidence: number;
  readonly phase: ScanPhase;
  /** References to Execution Plane evidence. Never the artefacts themselves. */
  readonly evidenceRefs: readonly string[];
  /** A stable fingerprint for deduplication and historical comparison. */
  readonly fingerprint: string;
}

/**
 * Minimise a raw finding into a crossing finding.
 *
 * The single crossing point for findings. It reads the category and location; it never reads
 * `requestSnippet` or `responseSnippet`, and there is nowhere on `Finding` to put them if it
 * did.
 */
export function minimiseFinding(raw: RawFinding, id: string): Finding {
  const meta = CATEGORY_META[raw.category];
  return {
    id,
    category: raw.category,
    targetPath: scrubLabel(raw.targetPath),
    parameterName: raw.parameterName,
    method: raw.method.toUpperCase(),
    cwe: meta.cwe,
    owaspRef: meta.owasp,
    confidence: raw.confidence,
    phase: CATEGORY_PHASE[raw.category],
    evidenceRefs: raw.evidence.map((e) => e.sha256),
    fingerprint: fingerprint(`${raw.category}|${scrubLabel(raw.targetPath)}|${raw.parameterName ?? ''}|${raw.method.toUpperCase()}`),
  };
}

// ── Assessment ──────────────────────────────────────────────────────────────

/** CVSS v3.1 base metric inputs, restricted to the values the assessor derives. */
export interface CvssVector {
  readonly attackVector: 'network' | 'adjacent' | 'local' | 'physical';
  readonly attackComplexity: 'low' | 'high';
  readonly privilegesRequired: 'none' | 'low' | 'high';
  readonly userInteraction: 'none' | 'required';
  readonly scope: 'unchanged' | 'changed';
  readonly confidentiality: 'none' | 'low' | 'high';
  readonly integrity: 'none' | 'low' | 'high';
  readonly availability: 'none' | 'low' | 'high';
}

export interface CvssScore {
  readonly baseScore: number;
  readonly severity: Severity;
  readonly vector: string;
}

export type Priority = 'p1' | 'p2' | 'p3' | 'p4';

export interface AssessedFinding {
  readonly finding: Finding;
  readonly cvss: CvssScore;
  readonly businessRisk: string;
  readonly falsePositive: boolean;
  readonly falsePositiveReason: string | null;
  readonly duplicateOf: string | null;
  readonly compliance: readonly string[];
  readonly priority: Priority;
  readonly slaDays: number;
  readonly cia: { readonly confidentiality: boolean; readonly integrity: boolean; readonly availability: boolean };
  readonly businessCriticality: 'low' | 'medium' | 'high';
}

// ── Threat intelligence ─────────────────────────────────────────────────────

export interface MitreTechnique {
  readonly techniqueId: string;
  readonly name: string;
  readonly tactic: string;
}

export interface ThreatAssessment {
  readonly findingId: string;
  readonly category: FindingCategory;
  readonly cwe: string;
  readonly capec: readonly string[];
  readonly cveExamples: readonly string[];
  readonly mitre: readonly MitreTechnique[];
  readonly exploitMaturity: 'unproven' | 'proof-of-concept' | 'functional' | 'high';
  readonly threatActors: readonly string[];
  readonly cloudContext: string | null;
  readonly zeroDayAdjacent: boolean;
  /** 0..100. Composed from exploit maturity, exposure and actor interest. */
  readonly threatScore: number;
  /** `observed` from static mappings; `inferred` proposed by reasoning and accepted. */
  readonly provenance: 'observed' | 'inferred';
}

export interface ThreatLandscape {
  readonly targetId: string;
  readonly heatMap: Readonly<Record<string, number>>;
  readonly topTactics: readonly string[];
  readonly executiveThreatScore: number;
  readonly forecast: string;
  readonly reasoningMode: 'enabled' | 'disabled';
}

// ── Attack chains ───────────────────────────────────────────────────────────

export type KillChainPhase =
  | 'reconnaissance' | 'weaponization' | 'delivery' | 'exploitation'
  | 'installation' | 'command-and-control' | 'actions-on-objectives';

export interface AttackNode {
  readonly id: string;
  readonly findingId: string;
  readonly killChainPhase: KillChainPhase;
  readonly technique: string;
}

export interface AttackEdge {
  readonly from: string;
  readonly to: string;
  readonly rationale: string;
  readonly provenance: 'observed' | 'inferred';
}

export interface AttackChain {
  readonly id: string;
  readonly nodes: readonly AttackNode[];
  readonly edges: readonly AttackEdge[];
  readonly killChain: readonly KillChainPhase[];
  readonly businessImpact: string;
  readonly severity: Severity;
  readonly multiStage: boolean;
}

// ── Repository and historical intelligence ──────────────────────────────────

export type PriorRecordKind = 'finding' | 'defect' | 'exception' | 'waiver' | 'suppression';

/** Scores and identifiers cross the boundary. Record content never does. */
export interface RepositoryMatch {
  readonly recordId: string;
  readonly recordKind: PriorRecordKind;
  readonly fingerprint: string;
  readonly similarity: number;
  readonly repository: string;
  readonly matchedBy: 'fingerprint' | 'lexical' | 'vector' | 'semantic';
}

export type FindingDisposition =
  | { readonly kind: 'new'; readonly reason: string }
  | { readonly kind: 'duplicate'; readonly of: string; readonly similarity: number }
  | { readonly kind: 'suppressed'; readonly by: string; readonly recordKind: PriorRecordKind };

export interface HistoricalComparison {
  readonly newCount: number;
  readonly recurringCount: number;
  readonly resolvedRegressions: number;
  readonly trend: 'improving' | 'stable' | 'worsening';
}

// ── Remediation ─────────────────────────────────────────────────────────────

export interface Remediation {
  readonly findingId: string;
  readonly quickFix: string;
  readonly longTermFix: string;
  readonly codeExample: string | null;
  readonly configurationFix: string | null;
  readonly infrastructureFix: string | null;
  readonly businessPriority: Priority;
  readonly estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
  readonly owner: string;
  readonly riskReduction: number;
}

// ── Synchronization and reporting ───────────────────────────────────────────

export interface SyncRecord {
  readonly target: 'finding' | 'defect' | 'result' | 'evidence' | 'traceability' | 'threat';
  readonly localId: string;
  readonly externalId: string | null;
  readonly published: boolean;
  readonly reason: string;
}

export interface PentestReport {
  readonly targetId: string;
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly scanPhaseReached: ScanPhase;
  readonly findingCounts: Readonly<Record<Severity, number>>;
  readonly owaspSummary: Readonly<Record<string, number>>;
  readonly cvssAverage: number | null;
  readonly attackChainCount: number;
  readonly threatHeatMap: Readonly<Record<string, number>>;
  readonly executiveThreatScore: number;
  readonly complianceSummary: Readonly<Record<string, number>>;
  readonly historicalTrend: 'improving' | 'stable' | 'worsening';
  readonly securityScore: number;
  readonly releaseReadiness: string;
  readonly rationale: string;
  readonly falsePositiveRate: number | null;
}

// ── Evidence (Execution Plane custody, by reference) ────────────────────────

export type EvidenceKind = 'har' | 'request-response' | 'screenshot' | 'log' | 'raw-response' | 'proof-of-concept';

/**
 * Evidence by REFERENCE.
 *
 * There is no content field and there will not be one. A hash proves the artefact existed
 * and was not altered; a locator says where in Execution Plane custody it is. That is
 * everything the Intelligence Plane needs to reason about a finding's evidence, and the whole
 * of what E-5 permits it to hold.
 */
export interface EvidenceReference {
  readonly findingCategory: FindingCategory;
  readonly kind: EvidenceKind;
  readonly sha256: string;
  readonly locator: string;
  readonly capturedAtPhase: ScanPhase;
}

// ── Learning ────────────────────────────────────────────────────────────────

export type LearningKind =
  | 'attack-pattern' | 'threat-pattern' | 'false-positive' | 'remediation-success'
  | 'repository' | 'threat-intelligence' | 'knowledge-graph' | 'vector-memory'
  | 'execution-history' | 'prompt';

export interface LearningRecord {
  readonly kind: LearningKind;
  readonly signal: string;
  readonly lesson: string;
  readonly occurrences: number;
}

// ── Category metadata: CWE and OWASP references (static, deterministic) ──────

interface CategoryMeta { readonly cwe: string; readonly owasp: string; readonly title: string; }

/**
 * Static CWE and OWASP mappings, per category.
 *
 * These are known intelligence mappings — the deterministic backbone the engine uses when
 * reasoning is unavailable. Reasoning may enrich a finding's narrative; it never changes the
 * CWE, because a CWE is a fact about the category, not a judgement about the instance.
 */
export const CATEGORY_META: Readonly<Record<FindingCategory, CategoryMeta>> = {
  'missing-security-header': { cwe: 'CWE-693', owasp: 'A05:2021', title: 'Missing security header' },
  'weak-tls': { cwe: 'CWE-326', owasp: 'A02:2021', title: 'Weak TLS configuration' },
  'exposed-secret': { cwe: 'CWE-200', owasp: 'A01:2021', title: 'Exposed secret' },
  'permissive-cors': { cwe: 'CWE-942', owasp: 'A05:2021', title: 'Permissive CORS policy' },
  'insecure-cookie': { cwe: 'CWE-614', owasp: 'A05:2021', title: 'Insecure cookie attributes' },
  'expiring-certificate': { cwe: 'CWE-324', owasp: 'A02:2021', title: 'Expiring certificate' },
  'information-disclosure': { cwe: 'CWE-200', owasp: 'A01:2021', title: 'Information disclosure' },
  'broken-authentication': { cwe: 'CWE-287', owasp: 'A07:2021', title: 'Broken authentication' },
  'weak-jwt': { cwe: 'CWE-347', owasp: 'A02:2021', title: 'Weak JWT verification' },
  'session-fixation': { cwe: 'CWE-384', owasp: 'A07:2021', title: 'Session fixation' },
  'missing-csrf': { cwe: 'CWE-352', owasp: 'A01:2021', title: 'Missing CSRF protection' },
  'api-misconfiguration': { cwe: 'CWE-16', owasp: 'API8:2023', title: 'API misconfiguration' },
  'business-logic-flaw': { cwe: 'CWE-840', owasp: 'A04:2021', title: 'Business logic flaw' },
  'graphql-introspection': { cwe: 'CWE-200', owasp: 'API8:2023', title: 'GraphQL introspection exposed' },
  'unrestricted-file-upload': { cwe: 'CWE-434', owasp: 'A04:2021', title: 'Unrestricted file upload' },
  'broken-object-authorization': { cwe: 'CWE-639', owasp: 'API1:2023', title: 'Broken object level authorization' },
  'missing-rate-limit': { cwe: 'CWE-770', owasp: 'API4:2023', title: 'Missing rate limiting' },
  'sql-injection': { cwe: 'CWE-89', owasp: 'A03:2021', title: 'SQL injection' },
  'blind-sql-injection': { cwe: 'CWE-89', owasp: 'A03:2021', title: 'Blind SQL injection' },
  'nosql-injection': { cwe: 'CWE-943', owasp: 'A03:2021', title: 'NoSQL injection' },
  'command-injection': { cwe: 'CWE-78', owasp: 'A03:2021', title: 'OS command injection' },
  'ssrf': { cwe: 'CWE-918', owasp: 'A10:2021', title: 'Server-side request forgery' },
  'xxe': { cwe: 'CWE-611', owasp: 'A05:2021', title: 'XML external entity' },
  'ssti': { cwe: 'CWE-1336', owasp: 'A03:2021', title: 'Server-side template injection' },
  'ldap-injection': { cwe: 'CWE-90', owasp: 'A03:2021', title: 'LDAP injection' },
  'remote-code-execution': { cwe: 'CWE-94', owasp: 'A03:2021', title: 'Remote code execution' },
  'reflected-xss': { cwe: 'CWE-79', owasp: 'A03:2021', title: 'Reflected cross-site scripting' },
  'stored-xss': { cwe: 'CWE-79', owasp: 'A03:2021', title: 'Stored cross-site scripting' },
  'dom-xss': { cwe: 'CWE-79', owasp: 'A03:2021', title: 'DOM-based cross-site scripting' },
  'path-traversal': { cwe: 'CWE-22', owasp: 'A01:2021', title: 'Path traversal' },
  'idor': { cwe: 'CWE-639', owasp: 'A01:2021', title: 'Insecure direct object reference' },
  'privilege-escalation': { cwe: 'CWE-269', owasp: 'A01:2021', title: 'Privilege escalation' },
  'business-logic-abuse': { cwe: 'CWE-840', owasp: 'A04:2021', title: 'Business logic abuse' },
  'cloud-metadata-exposure': { cwe: 'CWE-918', owasp: 'A05:2021', title: 'Cloud metadata exposure' },
};

// ── Shared helpers ──────────────────────────────────────────────────────────

export function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A stable content fingerprint.
 *
 * FNV-1a rendered as hex. Used for deduplication, historical comparison and as the evidence
 * hash placeholder where a real digest is computed in the Execution Plane — never as a
 * security primitive, which is what `platform-runtime` is for.
 */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The higher of two severities. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/** Map a CVSS base score to a severity band (CVSS v3.1 qualitative rating). */
export function severityForScore(score: number): Severity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'info';
}
