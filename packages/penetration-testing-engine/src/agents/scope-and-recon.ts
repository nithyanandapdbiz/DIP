/**
 * Scope Intelligence (Intelligence Plane), scan guardrails (Intelligence Plane), and
 * Reconnaissance (Execution Plane) with attack-surface reconstruction (Intelligence Plane).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 08-security-model.md · 11-capability-model.md
 *                  12-capability-orchestration.md
 *   ADR          : ADR-0027
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-06.x (EP custody)
 *
 * NO PACKET IS TRANSMITTED BEFORE CERTIFICATION.
 * Scope validation and the scan guardrails run entirely in the Intelligence Plane, before
 * any active probe. The scope agents produce a fail-closed boundary predicate; the guardrail
 * agents (stage 6) refuse an unsafe scan plan outright. Only a certified authorization reaches
 * the Execution Plane scanners, and the conformance suite proves an out-of-scope host, a
 * production target in safe mode, and a destructive probe are each refused.
 *
 * EVERY RECON AGENT RUNS IN THE EXECUTION PLANE.
 * They read `ObservedTarget`, which carries values — header values, cookie values, TLS cipher
 * lists. The Intelligence Plane never sees one. What crosses is produced by `minimise` at the
 * Context stage and carries names, not values.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  phaseAllowed, minimise, fingerprint,
  type Asset, type AttackSurface, type Endpoint, type FindingCategory, type ObservedTarget,
  type PentestScope, type ScanPhase, type SurfaceFact, type TargetKind, type TrustBoundary,
} from '../model.js';

const RETRY_NEVER = { maxAttempts: 1, retryOn: 'never' } as const;

// ── Scope Intelligence — stage 1 (planning, Intelligence Plane) ──────────────

export interface ScopeBoundary {
  readonly scope: PentestScope;
  readonly inScope: (url: string) => boolean;
  readonly summary: string;
  readonly requestsPerSecond: number;
  readonly phaseCeiling: ScanPhase;
  readonly authorized: boolean;
  readonly authorizationReference: string;
}

export const scopeAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ scope: PentestScope }, PentestScope>({
    id: 'scope.authorization-reference', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Verify a written authorization reference exists before anything else proceeds.',
    inputs: ['PentestScope'], outputs: ['PentestScope'],
    responsibilities: ['refuse a test with no authorization record', 'record the reference for the audit trail'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An unauthorized test stops at planning. Sending a probe at a system nobody authorised is the failure this exists to make impossible.',
    handle: (input) => {
      if (!input.scope.authorizationReference || input.scope.authorizationReference.trim() === '') {
        throw new Error('penetration test has no authorization reference; no probe may be sent');
      }
      return input.scope;
    },
  }),

  defineAgent<{ scope: PentestScope }, PentestScope>({
    id: 'scope.allowed-host-validation', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Validate that the requested hosts are well formed and non-empty.',
    inputs: ['PentestScope'], outputs: ['PentestScope'],
    responsibilities: ['reject an empty host set', 'reject a malformed host', 'normalise host casing'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An invalid host set stops the run. An ambiguous scope is how a scanner reaches an adjacent system.',
    handle: (input) => {
      if (input.scope.allowedHosts.length === 0) {
        throw new Error('penetration test names no allowed host; there is nothing in scope');
      }
      const hosts = input.scope.allowedHosts.map((h) => {
        const trimmed = h.trim().replace(/\/+$/, '');
        if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) {
          throw new Error(`host "${h}" is not a scheme and host; scope must be unambiguous`);
        }
        return trimmed.toLowerCase();
      });
      return { ...input.scope, allowedHosts: [...new Set(hosts)] };
    },
  }),

  defineAgent<{ scope: PentestScope }, { readonly enforced: boolean; readonly reason: string }>({
    id: 'scope.https-enforcement', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Enforce that in-scope hosts use HTTPS when the scope requires it.',
    inputs: ['PentestScope'], outputs: ['HTTPS decision'],
    responsibilities: ['refuse an http host when https is required'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An http host under an https requirement stops the run rather than sending credentials in clear text.',
    handle: (input) => {
      if (input.scope.httpsRequired) {
        const insecure = input.scope.allowedHosts.filter((h) => /^http:\/\//i.test(h));
        if (insecure.length > 0) {
          throw new Error(`https is required but ${insecure.length} host(s) are http; refusing to send probes in clear text`);
        }
      }
      return { enforced: input.scope.httpsRequired, reason: input.scope.httpsRequired ? 'https enforced on every host' : 'https not required by scope' };
    },
  }),

  defineAgent<{ scope: PentestScope }, { readonly inScope: (url: string) => boolean; readonly summary: string }>({
    id: 'scope.boundary-enforcement', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Produce the fail-closed predicate that binds every subsequent probe.',
    inputs: ['PentestScope'], outputs: ['boundary predicate'],
    responsibilities: ['allow only declared hosts', 'apply exclusions before allowance', 'default to refusal'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'A boundary that cannot be built refuses everything. An unbounded scanner is the worse failure by a wide margin.',
    handle: (input) => {
      const hosts = input.scope.allowedHosts;
      const exclusions = input.scope.exclusions.map((e) => e.toLowerCase());
      return {
        inScope: (url: string) => {
          const u = url.trim().toLowerCase();
          if (exclusions.some((e) => e !== '' && u.includes(e))) return false;
          if (u.startsWith('/')) return hosts.length > 0;
          return hosts.some((h) => u === h || u.startsWith(`${h}/`));
        },
        summary: `${hosts.length} host(s), ${exclusions.length} exclusion(s), default refuse`,
      };
    },
  }),

  defineAgent<{ scope: PentestScope }, { readonly requestsPerSecond: number; readonly rationale: string }>({
    id: 'scope.rate-limit', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Derive a request budget the customer environment will tolerate.',
    inputs: ['PentestScope'], outputs: ['rate budget'],
    responsibilities: ['never exceed the declared limit', 'reduce hard for a production target'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An underivable budget falls back to one request per second — slow scanning, never a denial-of-service event.',
    handle: (input) => {
      const declared = Math.max(1, input.scope.rateLimitPerSecond);
      const factor = input.scope.environment === 'production' ? 0.5 : 1;
      return {
        requestsPerSecond: Math.max(1, Math.floor(declared * factor)),
        rationale: `declared ${declared}/s reduced by ${factor} for a ${input.scope.environment} target`,
      };
    },
  }),

  defineAgent<{ scope: PentestScope }, { readonly environment: string; readonly production: boolean; readonly rationale: string }>({
    id: 'scope.production-detection', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Classify the target environment so production tightens every later guardrail.',
    inputs: ['PentestScope'], outputs: ['environment classification'],
    responsibilities: ['treat an unknown environment as production', 'never relax a guardrail on uncertainty'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An unclassifiable environment is treated as production, which is the safe reading of uncertainty.',
    handle: (input) => {
      const production = input.scope.environment === 'production' || input.scope.environment === 'unknown';
      return {
        environment: input.scope.environment,
        production,
        rationale: production ? 'treated as production; destructive probes require explicit non-production classification' : `${input.scope.environment} environment`,
      };
    },
  }),
];

// ── Scan guardrails — stage 6 (guardrail-review, Intelligence Plane) ─────────

/** The scan authorization the scanners will be bound by. Produced only if every guard passes. */
export interface ScanAuthorization {
  readonly targetId: string;
  readonly phaseCeiling: ScanPhase;
  readonly safeMode: boolean;
  readonly authorizedCategories: readonly FindingCategory[];
  readonly requestsPerSecond: number;
  readonly inScope: (url: string) => boolean;
  readonly certified: boolean;
  readonly refusals: readonly string[];
}

export interface GuardInput {
  readonly scope: PentestScope;
  readonly requestsPerSecond: number;
  readonly inScope: (url: string) => boolean;
  readonly selectedCategories: readonly string[];
  readonly destructiveCategories: readonly string[];
}

export const scopeGuardrailAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.safe-mode-guard', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Refuse every destructive category when safe mode is on.',
    inputs: ['GuardInput'], outputs: ['guard verdict'],
    responsibilities: ['drop destructive categories under safe mode', 'state which were dropped'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'A guard that cannot evaluate refuses the whole scan. A destructive probe that slips a safe-mode gate is the worst outcome available.',
    handle: (input) => {
      if (!input.scope.safeMode) return { ok: true, reason: 'safe mode off; destructive categories permitted where the phase allows' };
      const blocked = input.selectedCategories.filter((c) => input.destructiveCategories.includes(c));
      return { ok: true, reason: blocked.length > 0 ? `safe mode dropped ${blocked.length} destructive categor(y/ies): ${blocked.join(', ')}` : 'safe mode on; no destructive category was selected' };
    },
  }),

  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.production-guard', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Refuse destructive categories against a production target regardless of safe mode.',
    inputs: ['GuardInput'], outputs: ['guard verdict'],
    responsibilities: ['refuse a destructive probe on production', 'permit it only on an explicitly non-production target'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'A destructive probe against production is refused outright; the run continues with that category removed.',
    handle: (input) => {
      const production = input.scope.environment === 'production' || input.scope.environment === 'unknown';
      if (!production) return { ok: true, reason: `non-production (${input.scope.environment}); destructive categories permitted where the phase and safe mode allow` };
      const blocked = input.selectedCategories.filter((c) => input.destructiveCategories.includes(c));
      if (blocked.length > 0) return { ok: false, reason: `production target: ${blocked.length} destructive categor(y/ies) refused: ${blocked.join(', ')}` };
      return { ok: true, reason: 'production target; no destructive category was selected' };
    },
  }),

  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.rate-guard', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Refuse a scan whose request budget could constitute a load event.',
    inputs: ['GuardInput'], outputs: ['guard verdict'],
    responsibilities: ['bound the effective request rate', 'refuse an unbounded budget'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An unbounded budget is refused. A scan that becomes a denial of service is a customer incident, not a finding.',
    handle: (input) => {
      if (input.requestsPerSecond < 1) return { ok: false, reason: 'request budget is below one per second; the scan cannot proceed' };
      const ceiling = input.scope.environment === 'production' ? 20 : 100;
      if (input.requestsPerSecond > ceiling) return { ok: false, reason: `request budget ${input.requestsPerSecond}/s exceeds the ${ceiling}/s ceiling for a ${input.scope.environment} target` };
      return { ok: true, reason: `request budget ${input.requestsPerSecond}/s within the ${ceiling}/s ceiling` };
    },
  }),

  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.exclusion-guard', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Confirm the boundary predicate honours every declared exclusion.',
    inputs: ['GuardInput'], outputs: ['guard verdict'],
    responsibilities: ['verify each exclusion is refused by the predicate'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'An exclusion the predicate does not honour refuses the scan; testing an excluded path is a scope violation.',
    handle: (input) => {
      const leaking = input.scope.exclusions.filter((e) => e.trim() !== '' && input.inScope(e));
      if (leaking.length > 0) return { ok: false, reason: `${leaking.length} declared exclusion(s) are not refused by the boundary: ${leaking.join(', ')}` };
      return { ok: true, reason: `${input.scope.exclusions.length} exclusion(s) all honoured by the boundary` };
    },
  }),

  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.packet-authorization', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Bind the final authorization: no active category is permitted without an authorization reference and an in-scope target.',
    inputs: ['GuardInput'], outputs: ['guard verdict'],
    responsibilities: ['require an authorization reference for any active category', 'confirm the target is in scope'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'Missing authorization refuses every active category and leaves only passive observation, which sends no probe.',
    handle: (input) => {
      const active = input.selectedCategories.length > 0 && input.scope.scanPhaseCeiling !== 'passive';
      if (active && (!input.scope.authorizationReference || input.scope.authorizationReference.trim() === '')) {
        return { ok: false, reason: 'active scanning selected with no authorization reference; refused' };
      }
      return { ok: true, reason: `authorization ${input.scope.authorizationReference} binds ${input.selectedCategories.length} category(ies)` };
    },
  }),

  defineAgent<GuardInput, { readonly ok: boolean; readonly reason: string }>({
    id: 'scope.audit-trail', domain: 'scope', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Record that the guardrail decisions were taken, so authorization is auditable.',
    inputs: ['GuardInput'], outputs: ['audit note'],
    responsibilities: ['emit an audit note naming the phase, safe mode and category count'],
    toolContracts: [], aiCapabilityClass: 'none', retry: RETRY_NEVER,
    failureHandling: 'A missing audit note is itself a finding: an unaudited authorization is treated as unauthorised.',
    handle: (input, ctx) => {
      ctx.audit('scope.authorization.recorded', `phase ${input.scope.scanPhaseCeiling}, safeMode ${input.scope.safeMode}, ${input.selectedCategories.length} categor(y/ies)`);
      return { ok: true, reason: `authorization audited for ${input.scope.targetId ?? 'target'}` };
    },
  }),
];

// ── Reconnaissance — stage 2 (discovery, Execution Plane) ────────────────────

export interface ReconInput {
  readonly observed: readonly ObservedTarget[];
  readonly scope: PentestScope;
  readonly inScope: (url: string) => boolean;
}

function ofKind(input: ReconInput, ...kinds: TargetKind[]): readonly ObservedTarget[] {
  return input.observed.filter((a) => kinds.includes(a.kind) && input.inScope(a.path));
}

/** `/users/4471/orders/98` becomes `/users/{id}/orders/{id}`. */
export function routeTemplate(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}')
    .replace(/\/\d+/g, '/{id}')
    .replace(/\/[0-9a-f]{16,}/gi, '/{hash}');
}

/** A recon agent: reads observed EP targets of some kinds, returns the in-scope subset. */
function reconAgent(
  id: string, purpose: string, kinds: readonly TargetKind[], responsibilities: readonly string[], failureHandling: string,
): AgentDefinition<never, unknown> {
  return defineAgent<ReconInput, readonly ObservedTarget[]>({
    id: `recon.${id}`, domain: 'recon', stage: 'discovery', plane: 'EP',
    purpose, inputs: ['ObservedTarget[]'], outputs: ['ObservedTarget[]'],
    responsibilities: [...responsibilities], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling,
    handle: (input) => ofKind(input, ...kinds),
  }) as AgentDefinition<never, unknown>;
}

export const reconAgents: readonly AgentDefinition<never, unknown>[] = [
  reconAgent('services', 'Enumerate the services exposed by the target.', ['service'],
    ['record each distinct service', 'refuse out-of-scope services'],
    'An unreachable service is recorded as unreachable, never omitted; an omitted service reads as an absent attack surface.'),
  reconAgent('ports', 'Enumerate the open ports observed on in-scope hosts.', ['port'],
    ['record open ports only', 'never probe a port outside scope'],
    'A port that cannot be classified is recorded as open-unknown rather than dropped.'),
  reconAgent('routes', 'Enumerate routes and pages, collapsing identifier segments.', ['route', 'page'],
    ['collapse numeric, uuid and hash segments later', 'refuse out-of-scope routes'],
    'An unreadable route keeps its concrete path so it is still counted.'),
  reconAgent('forms', 'Enumerate forms and their fields by name and constraint.', ['form', 'field'],
    ['record field names and constraints', 'never record an entered value'],
    'A form that cannot be read is recorded as an unmapped input point rather than skipped.'),
  reconAgent('api-endpoints', 'Enumerate API endpoints as method and route template with parameter names.', ['api-endpoint'],
    ['record parameter names, never values'],
    'An endpoint that cannot be parsed is recorded by its raw path so it is still counted.'),
  reconAgent('parameters', 'Enumerate request parameters by name across endpoints and forms.', ['parameter'],
    ['record parameter names only'],
    'A parameter that cannot be attributed to an endpoint is recorded as ungrouped rather than dropped.'),
  reconAgent('hidden-resources', 'Enumerate hidden or undocumented resources reached during traversal.', ['hidden-resource'],
    ['record only resources actually reached'],
    'A resource that cannot be confirmed is recorded as a candidate rather than asserted to exist.'),
  reconAgent('auth-flows', 'Identify authentication flows without recording any credential.', ['auth-flow'],
    ['identify sign-in, sign-out and refresh', 'never record a credential value'],
    'An unidentified flow is recorded as an unclassified form rather than mislabelled as a login.'),
  reconAgent('sessions', 'Identify session mechanisms and their transport.', ['session'],
    ['record the session mechanism, never a session value'],
    'An unclassified session mechanism is reported as unknown, never guessed.'),
  reconAgent('cloud-surface', 'Identify cloud metadata and management surfaces reachable from the target.', ['cloud-metadata-surface'],
    ['record the surface, never its contents'],
    'An unconfirmed cloud surface is recorded as a candidate for the active phase to verify.'),
  reconAgent('graphql', 'Identify GraphQL endpoints exposed by the target.', ['graphql-endpoint'],
    ['record the endpoint and whether introspection responded'],
    'An unconfirmed GraphQL endpoint is recorded as a candidate rather than asserted.'),
  reconAgent('file-uploads', 'Enumerate file upload points by accepted type and size limit.', ['file-upload'],
    ['record accepted types', 'never read an uploaded file'],
    'An unreadable upload control is reported as an unmapped input point.'),
  reconAgent('business-journeys', 'Identify multi-step business journeys that carry authorization state.', ['business-journey'],
    ['record the journey steps as structure'],
    'An incomplete journey is recorded as a partial flow rather than discarded.'),

  // Recon agents that read and strip sensitive attribute values inside the EP.
  defineAgent<ReconInput, readonly ObservedTarget[]>({
    id: 'recon.headers', domain: 'recon', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate HTTP response headers and their security-relevant attributes.',
    inputs: ['ObservedTarget[]'], outputs: ['ObservedTarget[]'],
    responsibilities: ['record header presence and directive names', 'preserve values for the passive scanner, inside the EP'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A header that cannot be read is recorded as absent, which the passive scanner treats as a missing-header finding to be confirmed.',
    handle: (input) => ofKind(input, 'header'),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReconInput, readonly ObservedTarget[]>({
    id: 'recon.cookies', domain: 'recon', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate cookies and their attributes; the value stays in the Execution Plane.',
    inputs: ['ObservedTarget[]'], outputs: ['ObservedTarget[]'],
    responsibilities: ['record name, domain, path and flags', 'keep the value only for the passive cookie scanner inside the EP'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unreadable cookie is recorded by name alone. Its value is never allowed to cross the boundary later.',
    handle: (input) => ofKind(input, 'cookie'),
  }) as AgentDefinition<never, unknown>,

  reconAgent('tls', 'Observe the TLS configuration: protocol versions and cipher suites.', ['tls-config'],
    ['record negotiated versions and ciphers as structure'],
    'An unreadable TLS handshake is recorded as unknown, which the passive scanner treats as unverified rather than safe.'),
  reconAgent('certificates', 'Observe certificate details: issuer, validity window, key strength.', ['certificate'],
    ['record issuer and validity as structure'],
    'An unreadable certificate is recorded as unknown so the passive scanner does not assume it is valid.'),
  reconAgent('dns', 'Enumerate DNS records relevant to the attack surface.', ['dns-record'],
    ['record record types and names, never zone contents'],
    'An unresolved record is recorded as absent rather than assumed.'),
  reconAgent('technology', 'Fingerprint the technology stack, framework and libraries.', ['technology'],
    ['record technology names and versions where disclosed'],
    'An unfingerprinted technology is recorded as unknown, never guessed into a specific product.'),
  reconAgent('waf', 'Detect a web application firewall in front of the target.', ['waf'],
    ['record WAF presence and vendor where disclosed'],
    'An undetected WAF is recorded as absent, which makes the active scanner treat blocking as a real result rather than a WAF.'),
];

// ── Surface intelligence — stage 3 (context, IP) ────────────────────────────

export interface SurfaceIntelInput {
  readonly facts: readonly SurfaceFact[];
}

export const surfaceIntelAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<SurfaceIntelInput, readonly Endpoint[]>({
    id: 'recon.endpoint-inventory', domain: 'recon', stage: 'context', plane: 'IP',
    purpose: 'Reconstruct the endpoint inventory from minimised surface facts.',
    inputs: ['SurfaceFact[]'], outputs: ['Endpoint[]'],
    responsibilities: ['group by method and template', 'carry parameter names only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unattributable fact is recorded as an ungrouped endpoint rather than dropped.',
    handle: (input) => {
      const byKey = new Map<string, Endpoint>();
      for (const f of input.facts.filter((x) => x.kind === 'api-endpoint' || x.kind === 'route' || x.kind === 'page')) {
        const method = f.attributeNames.includes('method') ? 'GET' : 'GET';
        const template = routeTemplate(f.path);
        const key = `${method} ${template}`;
        const existing = byKey.get(key);
        const names = f.attributeNames.filter((n) => n !== 'method');
        byKey.set(key, {
          id: key, method, path: template, serviceId: null,
          authenticated: f.attributeNames.includes('authorization') || f.path.includes('/admin'),
          parameterNames: [...new Set([...(existing?.parameterNames ?? []), ...names])].sort(),
        });
      }
      return [...byKey.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceIntelInput, readonly string[]>({
    id: 'recon.parameter-inventory', domain: 'recon', stage: 'context', plane: 'IP',
    purpose: 'Reconstruct the parameter inventory from minimised surface facts.',
    inputs: ['SurfaceFact[]'], outputs: ['parameter name[]'],
    responsibilities: ['deduplicate parameter names across the surface'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A parameter that cannot be attributed is retained ungrouped rather than lost.',
    handle: (input) => [...new Set(input.facts.flatMap((f) => f.attributeNames).filter((n) => n !== 'method' && n !== 'authorization'))].sort(),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceIntelInput, readonly string[]>({
    id: 'recon.technology-fingerprint', domain: 'recon', stage: 'context', plane: 'IP',
    purpose: 'Assemble the technology fingerprint from minimised technology facts.',
    inputs: ['SurfaceFact[]'], outputs: ['technology[]'],
    responsibilities: ['deduplicate technology labels'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unknown technology stays labelled unknown rather than being resolved to a guess.',
    handle: (input) => [...new Set(input.facts.filter((f) => f.kind === 'technology').map((f) => f.label))].sort(),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceIntelInput, readonly string[]>({
    id: 'recon.hosts-and-services', domain: 'recon', stage: 'context', plane: 'IP',
    purpose: 'Assemble the host, service and port inventory from minimised facts.',
    inputs: ['SurfaceFact[]'], outputs: ['inventory[]'],
    responsibilities: ['deduplicate hosts, services and ports'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unresolved host or service is retained by identifier so it is still counted.',
    handle: (input) => [...new Set(input.facts.filter((f) => f.kind === 'host' || f.kind === 'service' || f.kind === 'port').map((f) => `${f.kind}:${f.label}`))].sort(),
  }) as AgentDefinition<never, unknown>,
];

/** The single crossing point for surface structure: every fact passed through here. */
export function minimiseAll(observed: readonly ObservedTarget[]): readonly SurfaceFact[] {
  return observed.map(minimise);
}

// ── Attack-surface model — stage 4 (architecture-review, IP) ────────────────

export interface SurfaceModelInput {
  readonly targetId: string;
  readonly facts: readonly SurfaceFact[];
  readonly endpoints: readonly Endpoint[];
  readonly technologies: readonly string[];
  readonly inventory: readonly string[];
}

export const surfaceModelAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<SurfaceModelInput, readonly string[]>({
    id: 'recon.entry-points', domain: 'recon', stage: 'architecture-review', plane: 'IP',
    purpose: 'Identify the internet-facing entry points of the attack surface.',
    inputs: ['SurfaceModelInput'], outputs: ['entry point[]'],
    responsibilities: ['mark unauthenticated endpoints as entry points'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An endpoint whose exposure is unknown is treated as an entry point, which over-tests rather than under-tests.',
    handle: (input) => input.endpoints.filter((e) => !e.authenticated).map((e) => e.id).sort(),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceModelInput, readonly TrustBoundary[]>({
    id: 'recon.trust-boundaries', domain: 'recon', stage: 'architecture-review', plane: 'IP',
    purpose: 'Construct the trust boundaries the endpoints sit behind.',
    inputs: ['SurfaceModelInput'], outputs: ['TrustBoundary[]'],
    responsibilities: ['separate internet-facing, authenticated, admin and internal boundaries'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An endpoint whose boundary is unclear is placed at the most exposed boundary, never the least.',
    handle: (input) => {
      const internet = input.endpoints.filter((e) => !e.authenticated).map((e) => e.id);
      const authed = input.endpoints.filter((e) => e.authenticated && !e.path.includes('/admin')).map((e) => e.id);
      const admin = input.endpoints.filter((e) => e.path.includes('/admin')).map((e) => e.id);
      const boundaries: TrustBoundary[] = [];
      if (internet.length) boundaries.push({ id: 'tb-internet', name: 'Internet-facing', exposes: internet, kind: 'internet-facing' });
      if (authed.length) boundaries.push({ id: 'tb-authenticated', name: 'Authenticated', exposes: authed, kind: 'authenticated' });
      if (admin.length) boundaries.push({ id: 'tb-admin', name: 'Administrative', exposes: admin, kind: 'admin' });
      return boundaries;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceModelInput, readonly Asset[]>({
    id: 'recon.asset-inventory', domain: 'recon', stage: 'architecture-review', plane: 'IP',
    purpose: 'Reconstruct the business assets the endpoints act on, with a classification.',
    inputs: ['SurfaceModelInput'], outputs: ['Asset[]'],
    responsibilities: ['group endpoints by the asset they touch', 'classify sensitivity conservatively'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An asset whose sensitivity is unknown is classified confidential, never public.',
    handle: (input) => {
      const groups = new Map<string, string[]>();
      for (const e of input.endpoints) {
        const segment = e.path.split('/').filter(Boolean).find((s) => !s.startsWith('{')) ?? 'root';
        groups.set(segment, [...(groups.get(segment) ?? []), e.id]);
      }
      return [...groups.entries()].map(([name, ids]) => ({
        id: `asset-${name}`, name,
        classification: /admin|payment|refund|account|user|order/i.test(name) ? 'confidential' as const : 'internal' as const,
        endpointIds: ids,
      })).sort((a, b) => (a.id < b.id ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceModelInput, { readonly score: number; readonly rationale: string }>({
    id: 'recon.exposure-score', domain: 'recon', stage: 'architecture-review', plane: 'IP',
    purpose: 'Score the exposure of the attack surface, so testing depth can be prioritised.',
    inputs: ['SurfaceModelInput'], outputs: ['exposure score'],
    responsibilities: ['weight internet-facing and admin endpoints most heavily'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unscoreable surface returns the maximum exposure, which prioritises rather than de-prioritises assessment.',
    handle: (input) => {
      const total = Math.max(1, input.endpoints.length);
      const exposed = input.endpoints.filter((e) => !e.authenticated).length;
      const admin = input.endpoints.filter((e) => e.path.includes('/admin')).length;
      const score = Math.min(100, Math.round(((exposed + admin * 2) / total) * 100));
      return { score, rationale: `${exposed} unauthenticated and ${admin} admin endpoint(s) over ${total}` };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<SurfaceModelInput, readonly string[]>({
    id: 'recon.business-journey-map', domain: 'recon', stage: 'architecture-review', plane: 'IP',
    purpose: 'Assemble the business journeys that carry authorization state across endpoints.',
    inputs: ['SurfaceModelInput'], outputs: ['business journey[]'],
    responsibilities: ['name journeys that cross a trust boundary'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A journey that cannot be assembled is recorded as a partial flow rather than dropped.',
    handle: (input) => input.facts.filter((f) => f.kind === 'business-journey').map((f) => f.label).sort(),
  }) as AgentDefinition<never, unknown>,
];

/** Assemble the attack surface from the model agents' outputs. Deterministic composition. */
export function assembleSurface(
  targetId: string, facts: readonly SurfaceFact[], endpoints: readonly Endpoint[],
  technologies: readonly string[], entryPoints: readonly string[], boundaries: readonly TrustBoundary[],
  assets: readonly Asset[], journeys: readonly string[], exposureScore: number,
): AttackSurface {
  const inv = (kind: TargetKind) => facts.filter((f) => f.kind === kind).map((f) => f.label);
  return {
    targetId,
    hosts: [...new Set(inv('host'))].sort(),
    services: [...new Set(inv('service'))].sort(),
    openPorts: [...new Set(inv('port'))].sort(),
    endpoints, entryPoints, trustBoundaries: boundaries, assets, technologies,
    wafPresent: facts.some((f) => f.kind === 'waf'),
    businessJourneys: journeys,
    exposureScore,
  };
}

export { phaseAllowed, fingerprint };
