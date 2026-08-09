/**
 * The verification checkers (stage 8, Execution Plane) and evidence capture (stage 9).
 *
 * TRACEABILITY
 *   Architecture : 04-execution-plane-architecture.md · 06-data-sovereignty.md · 10-evidence-flow-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI) · C-06.x
 *   Invariants   : INV-7 (the engine functions with reasoning unavailable)
 *
 * EVERY CHECKER IS DETERMINISTIC AND READ-ONLY. It inspects a resource's observed
 * configuration or structure and reports whether a control is present and correct. No
 * checker sends a payload, mutates state, or needs a reasoning provider (11 §2, R-11.7:
 * "Security Testing execution requires reasoning: No — scanning is entirely deterministic").
 * The raw weakness it produces — with its proving snippet — stays in the Execution Plane;
 * only the minimised `Weakness` crosses.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  CHECK_META, digestOf,
  type CheckCategory, type Confidence, type EvidenceKind, type EvidenceReference,
  type ObservedResource, type RawWeakness, type Severity,
} from '../model.js';

function weakness(category: CheckCategory, r: ObservedResource, detail: string, snippet: string, severity: Severity, confidence: Confidence): RawWeakness {
  return { category, resourceId: r.id, path: r.path, detail, evidenceSnippet: snippet, severity, confidence };
}

type Detect = (resources: readonly ObservedResource[]) => readonly RawWeakness[];

/** Resources of the kind a category reads. */
function readsOf(category: CheckCategory, resources: readonly ObservedResource[]): readonly ObservedResource[] {
  const kind = CHECK_META[category].reads;
  return resources.filter((r) => r.kind === kind);
}

const REQUIRED_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];

const DETECTORS: Readonly<Record<CheckCategory, Detect>> = {
  'security-header': (res) => readsOf('security-header', res).flatMap((r) =>
    REQUIRED_HEADERS.filter((h) => (r.values[h] ?? '').trim() === '')
      .map((h) => weakness('security-header', r, `missing response header ${h}`, `${h}: <absent>`, 'medium', 'confirmed'))),
  'csp-policy': (res) => readsOf('csp-policy', res).flatMap((r) => {
    const csp = r.values['content-security-policy'] ?? '';
    if (csp.trim() === '') return [weakness('csp-policy', r, 'no Content-Security-Policy', 'content-security-policy: <absent>', 'medium', 'confirmed')];
    if (/unsafe-inline|unsafe-eval|\*/.test(csp)) return [weakness('csp-policy', r, 'Content-Security-Policy permits unsafe sources', `content-security-policy: ${csp}`, 'medium', 'firm')];
    return [];
  }),
  'cors-policy': (res) => readsOf('cors-policy', res).flatMap((r) => {
    const origin = r.values['access-control-allow-origin'] ?? '';
    const creds = (r.values['access-control-allow-credentials'] ?? '').toLowerCase() === 'true';
    if (origin === '*' && creds) return [weakness('cors-policy', r, 'wildcard CORS origin with credentials', `access-control-allow-origin: * (+credentials)`, 'high', 'confirmed')];
    if (origin === '*') return [weakness('cors-policy', r, 'wildcard CORS origin', 'access-control-allow-origin: *', 'medium', 'firm')];
    return [];
  }),
  'cookie-flags': (res) => readsOf('cookie-flags', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['secure'] ?? '').toLowerCase() !== 'true') out.push(weakness('cookie-flags', r, 'cookie missing Secure', 'secure: false', 'medium', 'confirmed'));
    if ((r.values['httponly'] ?? '').toLowerCase() !== 'true') out.push(weakness('cookie-flags', r, 'cookie missing HttpOnly', 'httponly: false', 'medium', 'confirmed'));
    if ((r.values['samesite'] ?? '').trim() === '') out.push(weakness('cookie-flags', r, 'cookie missing SameSite', 'samesite: <absent>', 'low', 'firm'));
    return out;
  }),
  'tls-configuration': (res) => readsOf('tls-configuration', res).flatMap((r) => {
    const v = r.values['version'] ?? '';
    const ciphers = r.values['ciphers'] ?? '';
    const out: RawWeakness[] = [];
    if (/TLS1\.0|TLS1\.1|SSL/i.test(v)) out.push(weakness('tls-configuration', r, `obsolete TLS version ${v}`, `version: ${v}`, 'high', 'confirmed'));
    if (/RC4|3DES|NULL|EXPORT/i.test(ciphers)) out.push(weakness('tls-configuration', r, 'weak cipher suite offered', `ciphers: ${ciphers}`, 'high', 'firm'));
    return out;
  }),
  'certificate-validity': (res) => readsOf('certificate-validity', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['expired'] ?? '').toLowerCase() === 'true') out.push(weakness('certificate-validity', r, 'certificate expired', 'expired: true', 'high', 'confirmed'));
    if ((r.values['selfsigned'] ?? '').toLowerCase() === 'true') out.push(weakness('certificate-validity', r, 'certificate self-signed', 'selfsigned: true', 'medium', 'firm'));
    return out;
  }),
  'dependency-cve': (res) => readsOf('dependency-cve', res).flatMap((r) => {
    const cve = r.values['cve'] ?? '';
    return cve.trim() !== '' ? [weakness('dependency-cve', r, `dependency carries ${cve}`, `${r.values['name'] ?? r.label}@${r.values['version'] ?? '?'} -> ${cve}`, (r.values['severity'] as Severity) || 'high', 'confirmed')] : [];
  }),
  'secret-exposure': (res) => readsOf('secret-exposure', res).flatMap((r) => {
    const secret = r.values['secret'] ?? r.values['token'] ?? '';
    return secret.trim() !== '' ? [weakness('secret-exposure', r, 'secret material exposed in configuration or source', `${r.path}: <secret present>`, 'critical', 'confirmed')] : [];
  }),
  'sast-pattern': (res) => readsOf('sast-pattern', res).flatMap((r) => {
    const pattern = r.values['pattern'] ?? '';
    return pattern.trim() !== '' ? [weakness('sast-pattern', r, `insecure code pattern: ${pattern}`, `${r.path}: ${pattern}`, (r.values['severity'] as Severity) || 'medium', 'firm')] : [];
  }),
  'iac-misconfig': (res) => readsOf('iac-misconfig', res).flatMap((r) => {
    const insecure = r.values['insecure'] ?? '';
    return insecure.trim() !== '' ? [weakness('iac-misconfig', r, `IaC misconfiguration: ${insecure}`, `${r.path}: ${insecure}`, 'high', 'firm')] : [];
  }),
  'container-hardening': (res) => readsOf('container-hardening', res).flatMap((r) =>
    (r.values['runAsRoot'] ?? '').toLowerCase() === 'true' ? [weakness('container-hardening', r, 'container runs as root', 'runAsRoot: true', 'medium', 'confirmed')] : []),
  'kubernetes-policy': (res) => readsOf('kubernetes-policy', res).flatMap((r) =>
    (r.values['privileged'] ?? '').toLowerCase() === 'true' ? [weakness('kubernetes-policy', r, 'privileged pod security context', 'privileged: true', 'high', 'confirmed')] : []),
  'cloud-baseline': (res) => readsOf('cloud-baseline', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['publicAccess'] ?? '').toLowerCase() === 'true') out.push(weakness('cloud-baseline', r, 'resource publicly accessible', 'publicAccess: true', 'high', 'confirmed'));
    if ((r.values['encrypted'] ?? 'true').toLowerCase() === 'false') out.push(weakness('cloud-baseline', r, 'resource not encrypted at rest', 'encrypted: false', 'high', 'firm'));
    return out;
  }),
  'authn-config': (res) => readsOf('authn-config', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['mfa'] ?? 'true').toLowerCase() === 'false') out.push(weakness('authn-config', r, 'multi-factor authentication disabled', 'mfa: false', 'high', 'firm'));
    if ((r.values['lockout'] ?? 'true').toLowerCase() === 'false') out.push(weakness('authn-config', r, 'no account lockout policy', 'lockout: false', 'medium', 'firm'));
    return out;
  }),
  'authz-config': (res) => readsOf('authz-config', res).flatMap((r) =>
    (r.values['rbac'] ?? 'true').toLowerCase() === 'false' ? [weakness('authz-config', r, 'no server-side authorization policy', 'rbac: false', 'high', 'firm')] : []),
  'session-config': (res) => readsOf('session-config', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['rotation'] ?? 'true').toLowerCase() === 'false') out.push(weakness('session-config', r, 'session identifier not rotated on privilege change', 'rotation: false', 'medium', 'firm'));
    if (Number(r.values['timeoutMinutes'] ?? '15') > 720) out.push(weakness('session-config', r, 'excessive session timeout', `timeoutMinutes: ${r.values['timeoutMinutes']}`, 'low', 'tentative'));
    return out;
  }),
  'privacy-control': (res) => readsOf('privacy-control', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['consent'] ?? 'true').toLowerCase() === 'false') out.push(weakness('privacy-control', r, 'PII processed without consent control', 'consent: false', 'high', 'firm'));
    if ((r.values['retention'] ?? '').trim() === '') out.push(weakness('privacy-control', r, 'no data retention limit configured', 'retention: <absent>', 'medium', 'tentative'));
    return out;
  }),
  'ai-guardrail-config': (res) => readsOf('ai-guardrail-config', res).flatMap((r) => {
    const out: RawWeakness[] = [];
    if ((r.values['promptInjectionGuard'] ?? 'true').toLowerCase() === 'false') out.push(weakness('ai-guardrail-config', r, 'no prompt-injection guardrail configured', 'promptInjectionGuard: false', 'high', 'firm'));
    if ((r.values['outputFilter'] ?? 'true').toLowerCase() === 'false') out.push(weakness('ai-guardrail-config', r, 'no model output filter configured', 'outputFilter: false', 'medium', 'tentative'));
    return out;
  }),
};

function checkerAgent(category: CheckCategory): AgentDefinition<never, unknown> {
  const meta = CHECK_META[category];
  return defineAgent<{ resources: readonly ObservedResource[] }, readonly RawWeakness[]>({
    id: `verify.${category}`, domain: 'verify',
    purpose: `Verify ${meta.title.toLowerCase()} by reading ${meta.reads} configuration — read-only, deterministic.`,
    stage: 'execution', plane: 'EP',
    inputs: [`observed ${meta.reads} resources`], outputs: ['raw weaknesses with Execution-Plane evidence'],
    responsibilities: [`detect ${meta.title.toLowerCase()} without sending any payload`, 'retain the proving snippet in the Execution Plane'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a resource the checker cannot parse is reported as not-verified, never as passed',
    handle: (i) => DETECTORS[category](i.resources),
  }) as unknown as AgentDefinition<never, unknown>;
}

export const verificationAgents: readonly AgentDefinition<never, unknown>[] =
  (Object.keys(CHECK_META) as CheckCategory[]).map(checkerAgent);

// ── Evidence capture (stage 9, Execution Plane custody) ─────────────────────

const EVIDENCE_KIND: Readonly<Record<string, EvidenceKind>> = {
  'security-header': 'header-capture', 'csp-policy': 'header-capture', 'cors-policy': 'header-capture', 'cookie-flags': 'header-capture',
  'tls-configuration': 'tls-handshake', 'certificate-validity': 'tls-handshake',
  'dependency-cve': 'dependency-manifest', 'secret-exposure': 'pattern-match', 'sast-pattern': 'pattern-match',
  'iac-misconfig': 'iac-fragment', 'container-hardening': 'config-snapshot', 'kubernetes-policy': 'config-snapshot',
  'cloud-baseline': 'config-snapshot', 'authn-config': 'config-snapshot', 'authz-config': 'config-snapshot',
  'session-config': 'config-snapshot', 'privacy-control': 'config-snapshot', 'ai-guardrail-config': 'config-snapshot',
};

export const evidenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ raw: readonly RawWeakness[] }, readonly EvidenceReference[]>({
    id: 'evidence.capture', domain: 'evidence',
    purpose: 'Hash each raw weakness snippet and emit a reference; the snippet never leaves the Execution Plane.',
    stage: 'evidence', plane: 'EP', inputs: ['raw weaknesses'], outputs: ['evidence references (hash and locator only)'],
    responsibilities: ['emit a hash and a locator per weakness', 'never place snippet content in the reference'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a weakness whose evidence cannot be hashed is reported without a reference, never with a fabricated one',
    handle: (i) => i.raw.map((w, n): EvidenceReference => ({
      weaknessCategory: w.category,
      kind: EVIDENCE_KIND[w.category] ?? 'config-snapshot',
      sha256: digestOf(w.category, w.resourceId, w.evidenceSnippet),
      locator: `ep://evidence/${w.resourceId}/${n + 1}`,
      capturedAtStage: 'evidence',
    })),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ references: readonly EvidenceReference[] }, { integrity: boolean; count: number }>({
    id: 'evidence.integrity', domain: 'evidence',
    purpose: 'Confirm every evidence reference carries a non-empty hash.',
    stage: 'evidence', plane: 'EP', inputs: ['evidence references'], outputs: ['an integrity verdict'],
    responsibilities: ['reject any reference with a blank hash'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a reference with no hash fails integrity; the run does not treat it as evidence',
    handle: (i) => ({ integrity: i.references.every((r) => r.sha256.trim() !== ''), count: i.references.length }),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ references: readonly EvidenceReference[] }, { custody: 'execution-plane' }>({
    id: 'evidence.chain-of-custody', domain: 'evidence',
    purpose: 'Record that evidence artefacts remain in Execution-Plane custody.',
    stage: 'evidence', plane: 'EP', inputs: ['evidence references'], outputs: ['a custody record'],
    responsibilities: ['assert artefacts never left the Execution Plane'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a broken custody chain refuses to certify the evidence',
    handle: (i) => { void i.references.length; return { custody: 'execution-plane' }; },
  }) as unknown as AgentDefinition<never, unknown>,
];
