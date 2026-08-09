/**
 * Scope, security-requirement elicitation, and the Security Requirement Model.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 22-security-threat-model.md · 11-capability-model.md §2
 *   ADR          : ADR-0028
 *   Criteria     : C-11.13 · C-13.1
 *
 * Capability 5 is requirement-driven. It does not "scan and see what turns up"; it
 * elicits the security requirements the application must satisfy — from ASVS, the OWASP
 * Top 10, the OWASP API Top 10, Microsoft SDL, privacy law and AI-guardrail practice —
 * and then verifies each. The Security Requirement Model (stage 4, the architecture-review
 * governance stage) is the artefact every later stage is judged against.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  CHECK_CATEGORIES, isIntrusive,
  type Asset, type CheckCategory, type SecurityFact, type SecurityModel,
  type SecurityRequirement, type SecurityScope, type TrustBoundary,
} from '../model.js';

// ── Scope resolution (stage 1, planning) ────────────────────────────────────

export interface ScopeResolution {
  readonly scope: SecurityScope;
  readonly requestedCategories: readonly string[];
  readonly intrusiveRequested: boolean;
  readonly missingAuthorization: boolean;
  readonly readOnlyViolated: boolean;
  readonly complianceTargets: readonly string[];
  readonly production: boolean;
  readonly summary: string;
}

export const scopeAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ scope: SecurityScope }, { missingAuthorization: boolean }>({
    id: 'scope.authorization-reference', domain: 'scope', purpose: 'Confirm an authorization reference permits this verification at all.',
    stage: 'planning', plane: 'IP', inputs: ['the requested scope'], outputs: ['whether authorization is present'],
    responsibilities: ['refuse verification with no authorization reference'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a missing or blank authorization reference is a refusal, never a warning',
    handle: (i) => ({ missingAuthorization: (i.scope.authorizationReference ?? '').trim() === '' }),
  }),
  defineAgent<{ scope: SecurityScope }, { hosts: readonly string[] }>({
    id: 'scope.allowed-host-validation', domain: 'scope', purpose: 'Normalise and validate the hosts authorised for verification.',
    stage: 'planning', plane: 'IP', inputs: ['the requested scope'], outputs: ['the validated host list'],
    responsibilities: ['keep only well-formed, in-scope hosts'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unparseable host is dropped and recorded, never silently kept',
    handle: (i) => ({ hosts: i.scope.allowedHosts.map((h) => h.trim()).filter(Boolean) }),
  }),
  defineAgent<{ scope: SecurityScope }, { readOnlyViolated: boolean }>({
    id: 'scope.readonly-enforcement', domain: 'scope', purpose: 'Enforce that verification is read-only and non-intrusive.',
    stage: 'planning', plane: 'IP', inputs: ['the requested scope'], outputs: ['whether read-only was violated'],
    responsibilities: ['a state-changing request is a boundary violation'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'when read-only cannot be guaranteed, the stage refuses rather than proceeds',
    handle: (i) => ({ readOnlyViolated: i.scope.readOnly !== true }),
  }),
  defineAgent<{ scope: SecurityScope }, { requested: readonly string[]; intrusiveRequested: boolean }>({
    id: 'scope.category-request', domain: 'scope', purpose: 'Separate verification categories from intrusive categories that belong to capability 6.',
    stage: 'planning', plane: 'IP', inputs: ['the requested categories'], outputs: ['requested categories and whether any are intrusive'],
    responsibilities: ['flag any adversarial/exploitation category as out of capability-5 scope'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an intrusive request is flagged for refusal downstream, never quietly executed',
    handle: (i) => ({ requested: i.scope.requestedCategories, intrusiveRequested: i.scope.requestedCategories.some(isIntrusive) }),
  }),
  defineAgent<{ scope: SecurityScope }, { environment: string; production: boolean }>({
    id: 'scope.environment-detection', domain: 'scope', purpose: 'Classify the target environment so guardrails can tighten on production.',
    stage: 'planning', plane: 'IP', inputs: ['the requested scope'], outputs: ['the environment classification'],
    responsibilities: ['treat unknown as production for safety'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unclassifiable environment defaults to production, the safe assumption',
    handle: (i) => ({ environment: i.scope.environment, production: i.scope.environment === 'production' || i.scope.environment === 'unknown' }),
  }),
  defineAgent<{ scope: SecurityScope }, { complianceTargets: readonly string[] }>({
    id: 'scope.compliance-scope', domain: 'scope', purpose: 'Resolve the compliance frameworks this verification must report against.',
    stage: 'planning', plane: 'IP', inputs: ['the requested compliance targets'], outputs: ['the compliance frameworks in scope'],
    responsibilities: ['normalise framework identifiers'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unknown framework is recorded as unmapped rather than silently dropped',
    handle: (i) => ({ complianceTargets: i.scope.complianceTargets.map((c) => c.trim().toUpperCase()).filter(Boolean) }),
  }),
];

// ── Requirement elicitation (stage 1, planning) ─────────────────────────────

interface ReqSeed { readonly control: string; readonly statement: string; readonly categories: readonly CheckCategory[]; readonly level: 1 | 2 | 3; }

function seedAgent(
  id: string, source: SecurityRequirement['source'], purpose: string, seeds: readonly ReqSeed[],
): AgentDefinition<never, unknown> {
  return defineAgent<{ asvsLevel: 1 | 2 | 3 }, readonly SecurityRequirement[]>({
    id, domain: 'requirement', purpose,
    stage: 'planning', plane: 'IP', inputs: ['the target ASVS assurance level'], outputs: ['security requirements with the categories that verify them'],
    responsibilities: ['emit only requirements at or below the target assurance level'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unmappable control is emitted as an unverifiable requirement, never dropped',
    handle: (i) => seeds
      .filter((s) => s.level <= i.asvsLevel)
      .map((s, n) => ({ id: `SR-${source}-${String(n + 1).padStart(3, '0')}`, source, control: s.control, statement: s.statement, categories: s.categories, asvsLevel: s.level })),
  }) as unknown as AgentDefinition<never, unknown>;
}

export const requirementAgents: readonly AgentDefinition<never, unknown>[] = [
  seedAgent('requirement.asvs-elicitation', 'ASVS', 'Elicit OWASP ASVS verification requirements for the target assurance level.', [
    { control: 'V2.1 Password Security', statement: 'Authentication enforces credential strength and lockout', categories: ['authn-config'], level: 1 },
    { control: 'V3.2 Session Binding', statement: 'Sessions are bound, rotated and invalidated correctly', categories: ['session-config', 'cookie-flags'], level: 1 },
    { control: 'V4.1 Access Control Design', statement: 'Authorization is enforced server-side by policy', categories: ['authz-config'], level: 1 },
    { control: 'V6.2 Algorithms', statement: 'Approved cryptographic algorithms and key management are used', categories: ['tls-configuration', 'secret-exposure'], level: 2 },
    { control: 'V9.1 Communications Security', statement: 'All transport uses strong TLS', categories: ['tls-configuration', 'certificate-validity'], level: 1 },
    { control: 'V14.4 HTTP Security Headers', statement: 'Security response headers are present and correct', categories: ['security-header', 'csp-policy'], level: 1 },
    { control: 'V14.5 CORS', statement: 'Cross-origin policy is restrictive', categories: ['cors-policy'], level: 2 },
    { control: 'V14.2 Dependency', statement: 'Third-party components are free of known vulnerabilities', categories: ['dependency-cve'], level: 2 },
    { control: 'V1.14 Configuration Architecture', statement: 'Infrastructure and platform are hardened to baseline', categories: ['iac-misconfig', 'container-hardening', 'kubernetes-policy', 'cloud-baseline'], level: 3 },
  ]),
  seedAgent('requirement.owasp-top10', 'OWASP-Top10', 'Elicit OWASP Top 10 (2021) verification requirements.', [
    { control: 'A01 Broken Access Control', statement: 'Access control is verified in configuration', categories: ['authz-config'], level: 1 },
    { control: 'A02 Cryptographic Failures', statement: 'Data in transit and at rest uses strong cryptography', categories: ['tls-configuration', 'certificate-validity'], level: 1 },
    { control: 'A05 Security Misconfiguration', statement: 'Headers, CORS, CSP and platform config are hardened', categories: ['security-header', 'cors-policy', 'csp-policy', 'iac-misconfig'], level: 1 },
    { control: 'A06 Vulnerable Components', statement: 'Dependencies carry no known CVEs', categories: ['dependency-cve'], level: 1 },
    { control: 'A07 Identification and Auth Failures', statement: 'Authentication and session management are correct', categories: ['authn-config', 'session-config'], level: 1 },
  ]),
  seedAgent('requirement.owasp-api-top10', 'OWASP-API-Top10', 'Elicit OWASP API Security Top 10 verification requirements.', [
    { control: 'API2 Broken Authentication', statement: 'API authentication is configured correctly', categories: ['authn-config'], level: 1 },
    { control: 'API3 Broken Object Property Level Authz', statement: 'Property-level authorization is enforced', categories: ['authz-config'], level: 2 },
    { control: 'API8 Security Misconfiguration', statement: 'API transport, headers and CORS are hardened', categories: ['security-header', 'cors-policy', 'tls-configuration'], level: 1 },
  ]),
  seedAgent('requirement.sdl-controls', 'SDL', 'Elicit Microsoft SDL verification requirements.', [
    { control: 'SDL Secrets Management', statement: 'No secret is embedded in source or configuration', categories: ['secret-exposure'], level: 1 },
    { control: 'SDL Static Analysis', statement: 'Code is free of high-risk insecure patterns', categories: ['sast-pattern'], level: 2 },
  ]),
  seedAgent('requirement.privacy-controls', 'privacy', 'Elicit privacy and data-protection verification requirements.', [
    { control: 'GDPR Data Minimisation', statement: 'PII handling is configured for minimisation and consent', categories: ['privacy-control'], level: 2 },
  ]),
  seedAgent('requirement.ai-controls', 'AI', 'Elicit AI/LLM guardrail verification requirements.', [
    { control: 'LLM Guardrail Configuration', statement: 'Prompt-injection and output guardrails are configured', categories: ['ai-guardrail-config'], level: 2 },
  ]),
];

/** Concatenate and de-duplicate elicited requirements. */
export function assembleRequirements(lists: readonly (readonly SecurityRequirement[])[]): readonly SecurityRequirement[] {
  const byId = new Map<string, SecurityRequirement>();
  for (const list of lists) for (const r of list) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ── Security Requirement Model (stage 4, architecture-review) ───────────────

export const modelAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly SecurityFact[] }, readonly TrustBoundary[]>({
    id: 'model.trust-boundaries', domain: 'model', purpose: 'Derive trust boundaries from the minimised application facts.',
    stage: 'architecture-review', plane: 'IP', inputs: ['minimised security facts'], outputs: ['trust boundaries'],
    responsibilities: ['identify each crossing between planes, tiers or origins'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an ambiguous boundary is recorded as a boundary, never omitted',
    handle: (i) => {
      const out: TrustBoundary[] = [];
      if (i.facts.some((f) => f.kind === 'endpoint')) out.push({ id: 'tb-edge', from: 'client', to: 'application', description: 'public network edge' });
      if (i.facts.some((f) => f.kind === 'dependency')) out.push({ id: 'tb-supply', from: 'application', to: 'third-party', description: 'software supply chain' });
      if (i.facts.some((f) => f.kind === 'cloud-resource' || f.kind === 'k8s-manifest')) out.push({ id: 'tb-infra', from: 'application', to: 'infrastructure', description: 'platform and infrastructure' });
      return out;
    },
  }),
  defineAgent<{ facts: readonly SecurityFact[] }, readonly Asset[]>({
    id: 'model.asset-inventory', domain: 'model', purpose: 'Inventory the assets under verification and classify them.',
    stage: 'architecture-review', plane: 'IP', inputs: ['minimised security facts'], outputs: ['classified assets'],
    responsibilities: ['classify data-bearing resources conservatively'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unclassifiable asset defaults to confidential',
    handle: (i) => i.facts.filter((f) => f.kind === 'endpoint' || f.kind === 'secret-surface' || f.kind === 'cloud-resource')
      .map((f) => ({ id: `asset-${f.id}`, label: f.label || f.path, classification: (f.kind === 'secret-surface' ? 'restricted' : 'confidential') as Asset['classification'] })),
  }),
  defineAgent<{ facts: readonly SecurityFact[]; requirements: readonly SecurityRequirement[] }, { score: number; rationale: string }>({
    id: 'model.exposure-score', domain: 'model', purpose: 'Compute a deterministic exposure score for the target surface.',
    stage: 'architecture-review', plane: 'IP', inputs: ['facts', 'requirements'], outputs: ['an exposure score'],
    responsibilities: ['score by surface breadth and requirement count'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an incomputable score reports zero and is flagged, never guessed',
    handle: (i) => {
      const score = Math.min(100, i.facts.length * 3 + i.requirements.length * 2);
      return { score, rationale: `${i.facts.length} facts, ${i.requirements.length} requirements` };
    },
  }),
  defineAgent<{ requirements: readonly SecurityRequirement[]; asvsLevel: 1 | 2 | 3 }, readonly CheckCategory[]>({
    id: 'model.category-scope', domain: 'model', purpose: 'Resolve the verification categories in scope from the requirement set.',
    stage: 'architecture-review', plane: 'IP', inputs: ['requirements', 'assurance level'], outputs: ['the in-scope verification categories'],
    responsibilities: ['include every category any in-scope requirement depends on'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a requirement with no category is reported as unverifiable, never silently satisfied',
    handle: (i) => {
      const set = new Set<CheckCategory>();
      for (const r of i.requirements) for (const c of r.categories) set.add(c);
      return CHECK_CATEGORIES.filter((c) => set.has(c));
    },
  }),
];

export function assembleModel(
  targetId: string, facts: readonly SecurityFact[], requirements: readonly SecurityRequirement[],
  trustBoundaries: readonly TrustBoundary[], assets: readonly Asset[], inScopeCategories: readonly CheckCategory[], exposureScore: number,
): SecurityModel {
  return { targetId, facts, requirements, trustBoundaries, assets, inScopeCategories, exposureScore };
}
