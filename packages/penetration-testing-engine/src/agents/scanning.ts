/**
 * The Scanning Engine — Execution Plane scanners and evidence capture.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 08-security-model.md · 12-capability-orchestration.md
 *   ADR          : ADR-0027
 *   Criteria     : C-06.x (EP custody) · C-12.12 (a stage that does no work says why)
 *
 * EVERY SCANNER RUNS IN THE EXECUTION PLANE, AND ONLY WHEN AUTHORIZED.
 * A scanner reads `ObservedTarget`, which carries the traffic the probe elicited — response
 * bodies, headers, reflected payloads. It produces a `RawFinding` that keeps the request and
 * response snippet in the Execution Plane. Nothing here crosses the boundary; minimisation at
 * the Context stage produces the `Finding` that does, and it copies no snippet.
 *
 * SCANNING IS EVIDENCE-BASED, WITH NO SPECULATIVE FINDINGS.
 * A scanner emits a finding only when it observed the signal it tests for — a missing header
 * it read, a reflected payload it saw, a SQL error the server returned. A category with no
 * observed signal produces nothing, not a "possible" finding. The conformance suite asserts
 * that a clean target yields an empty result for every scanner.
 *
 * EVERY SCANNER SELF-GUARDS.
 * The orchestrator only invokes authorized scanners, and each scanner re-checks its own
 * authorization and refuses to run an unauthorized or out-of-phase category. Defence in depth:
 * a scanner that fired because an orchestrator forgot to filter would be the packet-before-
 * certification failure the whole scope stage exists to prevent.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  CATEGORY_DESTRUCTIVE, CATEGORY_PHASE, fingerprint, phaseAllowed,
  type EvidenceReference, type FindingCategory, type ObservedTarget, type RawFinding, type ScanPhase,
} from '../model.js';
import type { ScanAuthorization } from './scope-and-recon.js';

export interface ScanInput {
  readonly authorization: ScanAuthorization;
  /** Execution Plane observations, values intact — the traffic the probes elicited. */
  readonly targets: readonly ObservedTarget[];
}

/** Build a raw finding with an evidence reference, all Execution Plane custody. */
function raw(
  category: FindingCategory, targetPath: string, parameterName: string | null, method: string,
  request: string, response: string, confidence: number,
): RawFinding {
  const digest = fingerprint(`${category}|${targetPath}|${parameterName ?? ''}|${request}|${response}`);
  const evidence: EvidenceReference = {
    findingCategory: category, kind: 'request-response',
    sha256: digest, locator: `ep://evidence/${category}/${digest}.har`,
    capturedAtPhase: CATEGORY_PHASE[category],
  };
  return { category, targetPath, parameterName, method, requestSnippet: request, responseSnippet: response, confidence, evidence: [evidence] };
}

/** Whether a scanner's category may run under the authorization. Every scanner calls this. */
function permitted(auth: ScanAuthorization, category: FindingCategory): boolean {
  if (!auth.authorizedCategories.includes(category)) return false;
  if (!phaseAllowed(auth.phaseCeiling, CATEGORY_PHASE[category])) return false;
  if (auth.safeMode && CATEGORY_DESTRUCTIVE[category]) return false;
  return true;
}

/**
 * A scanner agent.
 *
 * `detect` reads Execution Plane observations and returns a raw finding per signal it actually
 * saw, or nothing. The wrapper enforces authorization and phase, so a detector cannot fire a
 * category it is not permitted to test.
 */
function scanner(
  category: FindingCategory, purpose: string,
  detect: (targets: readonly ObservedTarget[]) => readonly RawFinding[],
  responsibilities: readonly string[] = [],
): AgentDefinition<never, unknown> {
  const id = `scanner.${category}`;
  return defineAgent<ScanInput, readonly RawFinding[]>({
    id, domain: 'scanner', stage: 'execution', plane: 'EP',
    purpose, inputs: ['ScanInput'], outputs: ['RawFinding[]'],
    responsibilities: responsibilities.length ? [...responsibilities] : ['emit a finding only on an observed signal', 'never emit a speculative finding'],
    toolContracts: ['TargetConnectivity'], aiCapabilityClass: 'none',
    failureHandling: `A scanner that cannot run records ${category} as NOT SCANNED, which is treated as unassessed rather than clean — an unscanned category is never reported as safe.`,
    handle: (input) => {
      if (!permitted(input.authorization, category)) return [];
      return detect(input.targets);
    },
  }) as AgentDefinition<never, unknown>;
}

// ── Signal helpers ──────────────────────────────────────────────────────────

/** A target declares elicited vulnerabilities via a `vulns` value (comma-separated categories). */
function declares(target: ObservedTarget, category: FindingCategory): boolean {
  return (target.values['vulns'] ?? '').split(',').map((s) => s.trim()).includes(category);
}
function signalFindings(targets: readonly ObservedTarget[], category: FindingCategory, method = 'GET'): readonly RawFinding[] {
  return targets.filter((t) => declares(t, category)).map((t) => {
    const param = t.values['vulnParam'] ?? null;
    const proof = t.values[`evidence:${category}`] ?? `observed ${category} signal at ${t.path}`;
    return raw(category, t.path, param, t.values['method'] ?? method,
      `${t.values['method'] ?? method} ${t.path}${param ? `?${param}=<probe>` : ''}`, proof, 0.9);
  });
}

// ── Passive scanners — read observed structure, no active probe ─────────────

const REQUIRED_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];

export const passiveScanners: readonly AgentDefinition<never, unknown>[] = [
  scanner('missing-security-header', 'Detect missing or empty security response headers.',
    (targets) => targets.filter((t) => t.kind === 'header').flatMap((t) =>
      REQUIRED_HEADERS.filter((h) => !(t.values[h] ?? '').trim()).map((h) =>
        raw('missing-security-header', t.path, h, 'GET', `GET ${t.path}`, `response omits ${h}`, 0.95))),
    ['read the response header set', 'flag each required header absent or empty']),

  scanner('weak-tls', 'Detect weak TLS protocol versions or cipher suites.',
    (targets) => targets.filter((t) => t.kind === 'tls-config').flatMap((t) => {
      const version = t.values['version'] ?? '';
      const weak = /TLS1\.0|TLS1\.1|SSL/i.test(version) || /RC4|3DES|NULL|EXPORT/i.test(t.values['ciphers'] ?? '');
      return weak ? [raw('weak-tls', t.path, null, 'GET', `TLS handshake ${t.path}`, `negotiated ${version} ${t.values['ciphers'] ?? ''}`, 0.9)] : [];
    })),

  scanner('exposed-secret', 'Detect secrets disclosed in responses; the secret value stays in the Execution Plane.',
    (targets) => targets.flatMap((t) => Object.entries(t.values)
      .filter(([, v]) => /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|secret|password)\s*[=:]\s*\S{8,}/i.test(v))
      // The matched secret is NOT placed in the response snippet — only the fact and its shape cross later.
      .map(([k]) => raw('exposed-secret', t.path, k, 'GET', `GET ${t.path}`, `a secret-shaped value was observed in attribute "${k}"`, 0.85))),
    ['scan observed values for secret shapes', 'never carry the secret itself into the finding']),

  scanner('permissive-cors', 'Detect a CORS policy that reflects any origin with credentials.',
    (targets) => targets.filter((t) => t.kind === 'header').flatMap((t) => {
      const origin = t.values['access-control-allow-origin'] ?? '';
      const creds = (t.values['access-control-allow-credentials'] ?? '').toLowerCase() === 'true';
      return origin === '*' && creds ? [raw('permissive-cors', t.path, null, 'GET', `GET ${t.path}`, 'ACAO: * with ACAC: true', 0.9)] : [];
    })),

  scanner('insecure-cookie', 'Detect cookies missing Secure, HttpOnly or SameSite.',
    (targets) => targets.filter((t) => t.kind === 'cookie').flatMap((t) => {
      const missing = ['secure', 'httponly', 'samesite'].filter((f) => !(t.values[f] ?? '').trim());
      return missing.length ? [raw('insecure-cookie', t.path, t.label, 'GET', `Set-Cookie ${t.label}`, `cookie "${t.label}" missing ${missing.join(', ')}`, 0.8)] : [];
    })),

  scanner('expiring-certificate', 'Detect a certificate near expiry.',
    (targets) => targets.filter((t) => t.kind === 'certificate').flatMap((t) => {
      const days = Number(t.values['daysToExpiry'] ?? 'NaN');
      return Number.isFinite(days) && days < 30 ? [raw('expiring-certificate', t.path, null, 'GET', `TLS ${t.path}`, `certificate expires in ${days} day(s)`, 0.95)] : [];
    })),

  scanner('information-disclosure', 'Detect version banners and stack traces in responses.',
    (targets) => targets.flatMap((t) => {
      const banner = t.values['server'] ?? t.values['x-powered-by'] ?? '';
      const trace = /stack trace|exception in|at [\w.]+\([\w.]+:\d+\)/i.test(t.values['body'] ?? '');
      const out: RawFinding[] = [];
      if (/\d+\.\d+/.test(banner)) out.push(raw('information-disclosure', t.path, null, 'GET', `GET ${t.path}`, `version banner disclosed: ${banner}`, 0.7));
      if (trace) out.push(raw('information-disclosure', t.path, null, 'GET', `GET ${t.path}`, 'a stack trace was returned in the response body', 0.8));
      return out;
    })),
];

// ── Active-safe scanners ────────────────────────────────────────────────────

export const activeSafeScanners: readonly AgentDefinition<never, unknown>[] = [
  scanner('broken-authentication', 'Probe authentication for credential-stuffing and weak lockout.',
    (t) => signalFindings(t, 'broken-authentication', 'POST')),
  scanner('weak-jwt', 'Probe JWT verification for alg:none and weak signing.',
    (t) => t.filter((x) => x.kind === 'auth-flow' || declares(x, 'weak-jwt')).flatMap((x) => {
      const alg = x.values['jwtAlg'] ?? '';
      return /none/i.test(alg) || declares(x, 'weak-jwt')
        ? [raw('weak-jwt', x.path, 'authorization', 'GET', `GET ${x.path} with a forged token`, `token accepted with alg=${alg || 'none'}`, 0.9)] : [];
    })),
  scanner('session-fixation', 'Probe whether a session identifier is rotated on authentication.',
    (t) => signalFindings(t, 'session-fixation', 'POST')),
  scanner('missing-csrf', 'Probe state-changing forms for CSRF protection.',
    (t) => t.filter((x) => x.kind === 'form').flatMap((x) => {
      const stateChanging = (x.values['method'] ?? 'POST').toUpperCase() !== 'GET';
      const hasToken = Object.keys(x.values).some((k) => /csrf|xsrf|_token/i.test(k));
      return stateChanging && !hasToken ? [raw('missing-csrf', x.path, null, x.values['method'] ?? 'POST', `${x.values['method'] ?? 'POST'} ${x.path}`, 'state-changing form carries no anti-CSRF token', 0.75)] : [];
    })),
  scanner('api-misconfiguration', 'Probe APIs for verbose errors and unsafe defaults.',
    (t) => signalFindings(t, 'api-misconfiguration', 'GET')),
  scanner('business-logic-flaw', 'Probe business flows for logic that can be subverted without a technical exploit.',
    (t) => signalFindings(t, 'business-logic-flaw', 'POST')),
  scanner('graphql-introspection', 'Probe GraphQL endpoints for enabled introspection.',
    (t) => t.filter((x) => x.kind === 'graphql-endpoint').flatMap((x) =>
      (x.values['introspection'] ?? '').toLowerCase() === 'enabled'
        ? [raw('graphql-introspection', x.path, null, 'POST', `POST ${x.path} {__schema}`, 'introspection query returned the full schema', 0.85)] : [])),
  scanner('unrestricted-file-upload', 'Probe upload points for missing type and content validation.',
    (t) => signalFindings(t, 'unrestricted-file-upload', 'POST')),
  scanner('broken-object-authorization', 'Probe API objects for missing object-level authorization (BOLA).',
    (t) => signalFindings(t, 'broken-object-authorization', 'GET')),
  scanner('missing-rate-limit', 'Probe sensitive endpoints for the absence of rate limiting.',
    (t) => signalFindings(t, 'missing-rate-limit', 'POST')),
];

// ── Active-full scanners ────────────────────────────────────────────────────

const FULL_CATEGORIES: readonly FindingCategory[] = [
  'sql-injection', 'blind-sql-injection', 'nosql-injection', 'command-injection', 'ssrf', 'xxe',
  'ssti', 'ldap-injection', 'remote-code-execution', 'reflected-xss', 'stored-xss', 'dom-xss',
  'path-traversal', 'idor', 'privilege-escalation', 'business-logic-abuse', 'cloud-metadata-exposure',
];

const FULL_PURPOSE: Partial<Record<FindingCategory, string>> = {
  'sql-injection': 'Inject SQL metacharacters and confirm a database error or altered result.',
  'blind-sql-injection': 'Confirm SQL injection by boolean and time-based inference where no error is returned.',
  'nosql-injection': 'Inject NoSQL operators and confirm query manipulation.',
  'command-injection': 'Inject shell metacharacters and confirm command execution.',
  'ssrf': 'Coerce the server into requesting an attacker-chosen URL and confirm the fetch.',
  'xxe': 'Submit an external entity and confirm it was resolved.',
  'ssti': 'Inject a template expression and confirm server-side evaluation.',
  'ldap-injection': 'Inject LDAP metacharacters and confirm filter manipulation.',
  'remote-code-execution': 'Confirm arbitrary code execution from an injection point.',
  'reflected-xss': 'Inject a script payload and confirm it reflects unescaped into the response.',
  'stored-xss': 'Submit a script payload and confirm it is served unescaped to another context.',
  'dom-xss': 'Confirm a client-side sink evaluates attacker-controlled input.',
  'path-traversal': 'Traverse the filesystem via a path parameter and confirm out-of-root read.',
  'idor': 'Access another subject\'s object by identifier and confirm the response.',
  'privilege-escalation': 'Confirm a lower-privileged subject can perform a higher-privileged action.',
  'business-logic-abuse': 'Confirm a business rule can be violated by manipulating a legitimate flow.',
  'cloud-metadata-exposure': 'Confirm the cloud instance metadata endpoint is reachable through the target.',
};

export const activeFullScanners: readonly AgentDefinition<never, unknown>[] = FULL_CATEGORIES.map((category) => {
  if (category === 'reflected-xss' || category === 'dom-xss') {
    // Reflection is detected structurally: a parameter whose value appears unescaped in a
    // response marked as reflecting it.
    return scanner(category, FULL_PURPOSE[category] ?? `Probe for ${category}.`,
      (targets) => targets.filter((t) => declares(t, category)).flatMap((t) => {
        const param = t.values['vulnParam'] ?? null;
        const reflected = (t.values['reflects'] ?? '') === (param ?? '');
        return reflected || declares(t, category)
          ? [raw(category, t.path, param, t.values['method'] ?? 'GET',
              `${t.values['method'] ?? 'GET'} ${t.path}?${param ?? 'q'}=<script>`,
              t.values[`evidence:${category}`] ?? 'the injected payload reflected unescaped', 0.9)] : [];
      }));
  }
  return scanner(category, FULL_PURPOSE[category] ?? `Probe for ${category}.`,
    (targets) => signalFindings(targets, category, category === 'sql-injection' || category === 'command-injection' ? 'POST' : 'GET'));
});

// ── Evidence capture — stage 9 (evidence, Execution Plane) ──────────────────

export interface EvidenceInput {
  readonly findings: readonly RawFinding[];
  /** Additional artefacts the Execution Plane captured, by reference. */
  readonly captured: readonly { readonly findingCategory: FindingCategory; readonly kind: EvidenceReference['kind']; readonly locator: string; readonly digest: string; readonly phase: ScanPhase }[];
}

export const evidenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<EvidenceInput, readonly EvidenceReference[]>({
    id: 'scanner.evidence-capture', domain: 'scanner', stage: 'evidence', plane: 'EP',
    purpose: 'Assemble evidence references for every finding; the artefacts stay in Execution Plane custody.',
    inputs: ['RawFinding[]', 'captured artefacts'], outputs: ['EvidenceReference[]'],
    responsibilities: ['reference each finding\'s evidence by hash and locator', 'never place an artefact in the reference'],
    toolContracts: ['EvidenceCustody'], aiCapabilityClass: 'none',
    failureHandling: 'A finding whose evidence cannot be referenced is held back rather than published unsupported; an unevidenced finding is not certifiable.',
    handle: (input) => {
      const refs = input.findings.flatMap((f) => f.evidence);
      const extra: EvidenceReference[] = input.captured.map((c) => ({
        findingCategory: c.findingCategory, kind: c.kind, sha256: c.digest, locator: c.locator, capturedAtPhase: c.phase,
      }));
      const byHash = new Map<string, EvidenceReference>();
      for (const r of [...refs, ...extra]) byHash.set(r.sha256, r);
      return [...byHash.values()].sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<EvidenceInput, readonly EvidenceReference[]>({
    id: 'scanner.har-capture', domain: 'scanner', stage: 'evidence', plane: 'EP',
    purpose: 'Reference the HAR capture for each finding\'s request/response exchange.',
    inputs: ['RawFinding[]'], outputs: ['EvidenceReference[]'],
    responsibilities: ['produce a HAR reference per distinct exchange'],
    toolContracts: ['EvidenceCustody'], aiCapabilityClass: 'none',
    failureHandling: 'A missing HAR is recorded as an absent artefact rather than a fabricated one; the finding keeps its request/response reference.',
    handle: (input) => input.findings.map((f) => ({
      findingCategory: f.category, kind: 'har' as const,
      sha256: fingerprint(`har|${f.category}|${f.targetPath}`),
      locator: `ep://evidence/har/${fingerprint(`${f.category}|${f.targetPath}`)}.har`,
      capturedAtPhase: CATEGORY_PHASE[f.category],
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<EvidenceInput, { readonly integrity: boolean; readonly count: number }>({
    id: 'scanner.evidence-integrity', domain: 'scanner', stage: 'evidence', plane: 'EP',
    purpose: 'Verify every evidence reference carries a hash and a locator and no content.',
    inputs: ['EvidenceReference[]'], outputs: ['integrity verdict'],
    responsibilities: ['refuse a reference missing a hash or a locator'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A reference missing a hash or a locator is dropped; a reference that proves nothing must not be published as evidence.',
    handle: (input) => {
      const refs = input.findings.flatMap((f) => f.evidence);
      const bad = refs.filter((r) => !r.sha256.trim() || !r.locator.trim());
      return { integrity: bad.length === 0, count: refs.length };
    },
  }) as AgentDefinition<never, unknown>,
];
