/**
 * Scope Intelligence (Intelligence Plane) and Live Application Discovery (Execution Plane).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 11-capability-model.md · 12-capability-orchestration.md
 *   ADR          : ADR-0023
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-06.x (EP custody)
 *
 * EVERY DISCOVERY AGENT RUNS IN THE EXECUTION PLANE, WITHOUT EXCEPTION.
 * They read `ObservedArtefact`, which carries values — cookie contents, field contents,
 * storage contents. The Intelligence Plane never sees one. What crosses is produced by
 * `minimise` at the Context stage and carries names, not values.
 *
 * SCOPE IS ENFORCED BEFORE A REQUEST IS MADE, NEVER AFTER.
 * A boundary check applied to results is a record of where the engine has already been.
 * `scope.boundary-enforcement` produces a predicate the probe is bound by, and the
 * conformance suite asserts that an out-of-scope origin is refused rather than reported.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  type ApiContract, type ArtefactKind, type DiscoveryScope, type Graph,
  type Journey, type ObservedArtefact, type Relationship, norm,
} from '../model.js';

const RETRY_NEVER = { maxAttempts: 1, retryOn: 'never' } as const;

// ── Scope Intelligence ──────────────────────────────────────────────────────

export const scopeAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ scope: DiscoveryScope }, DiscoveryScope>({
    id: 'scope.target-validation', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Validate that the requested discovery targets are well formed and non-empty.',
    inputs: ['DiscoveryScope'], outputs: ['DiscoveryScope'],
    responsibilities: ['reject an empty origin set', 'reject a malformed origin', 'normalise trailing slashes'],
    toolContracts: [], aiCapabilityClass: 'none',
    retry: RETRY_NEVER,
    failureHandling: 'An invalid scope stops the run at planning. Discovering against an unvalidated target is how a crawler reaches a system nobody authorised.',
    handle: (input) => {
      if (input.scope.origins.length === 0) {
        throw new Error('discovery scope names no origin; there is nothing to discover');
      }
      const origins = input.scope.origins.map((o) => {
        const trimmed = o.trim().replace(/\/+$/, '');
        if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) {
          throw new Error(`origin "${o}" is not a scheme and host; scope must be unambiguous`);
        }
        return trimmed.toLowerCase();
      });
      return { ...input.scope, origins: [...new Set(origins)] };
    },
  }),

  defineAgent<{ scope: DiscoveryScope }, { readonly inScope: (url: string) => boolean; readonly summary: string }>({
    id: 'scope.boundary-enforcement', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Produce the fail-closed predicate that binds every subsequent request.',
    inputs: ['DiscoveryScope'], outputs: ['boundary predicate'],
    responsibilities: ['allow only declared origins', 'apply exclusions before allowance', 'default to refusal'],
    toolContracts: [], aiCapabilityClass: 'none',
    retry: RETRY_NEVER,
    failureHandling: 'A boundary that cannot be built refuses everything. An open crawler is the worse failure by a wide margin.',
    handle: (input) => {
      const origins = input.scope.origins;
      const exclusions = input.scope.exclusions.map((e) => e.toLowerCase());
      return {
        // Fail closed. Exclusions are checked FIRST: an exclusion that could be
        // overridden by a matching origin is not an exclusion.
        inScope: (url: string) => {
          const u = url.trim().toLowerCase();
          if (exclusions.some((e) => e !== '' && u.includes(e))) return false;
          // A root-relative path is same-origin by construction — it can only be
          // requested against an origin already in scope, so resolving it against every
          // declared origin and testing each would give the same answer more slowly.
          // An absolute URL is a different matter and must match a declared origin, which
          // is what refuses a third-party frame.
          if (u.startsWith('/')) return origins.length > 0;
          return origins.some((o) => u === o || u.startsWith(`${o}/`));
        },
        summary: `${origins.length} origin(s), ${exclusions.length} exclusion(s), default refuse`,
      };
    },
  }),

  defineAgent<{ scope: DiscoveryScope }, { readonly mode: string; readonly credentialsHandledBy: string }>({
    id: 'scope.authentication', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Determine the authentication posture without ever handling a credential.',
    inputs: ['DiscoveryScope'], outputs: ['authentication posture'],
    responsibilities: ['name the plane that holds credentials', 'never request a credential value'],
    toolContracts: [], aiCapabilityClass: 'none',
    retry: RETRY_NEVER,
    failureHandling: 'An undetermined posture defaults to anonymous, which discovers less and risks nothing.',
    handle: (input) => ({
      mode: input.scope.authenticationMode,
      // The Intelligence Plane names where the credential lives. It never receives one,
      // and this agent has no field that could carry it.
      credentialsHandledBy: 'Execution Plane vault; no credential value crosses the boundary',
    }),
  }),

  defineAgent<{ scope: DiscoveryScope }, { readonly requestsPerSecond: number; readonly rationale: string }>({
    id: 'scope.rate-limit', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Derive a request budget the customer environment will tolerate.',
    inputs: ['DiscoveryScope'], outputs: ['rate budget'],
    responsibilities: ['never exceed the declared limit', 'reduce for deep traversal'],
    toolContracts: [], aiCapabilityClass: 'none',
    retry: RETRY_NEVER,
    failureHandling: 'An underivable budget falls back to one request per second — slow discovery, never a load event.',
    handle: (input) => {
      const declared = Math.max(1, input.scope.rateLimitPerSecond);
      // Deeper traversal issues far more requests over a longer window, so the per-second
      // ceiling comes down as depth rises. The product of rate and duration is what the
      // customer's environment actually feels.
      const factor = input.scope.depth === 'deep' ? 0.5 : input.scope.depth === 'standard' ? 0.75 : 1;
      return {
        requestsPerSecond: Math.max(1, Math.floor(declared * factor)),
        rationale: `declared ${declared}/s reduced by ${factor} for ${input.scope.depth} traversal`,
      };
    },
  }),

  defineAgent<{ scope: DiscoveryScope }, { readonly maxDepth: number; readonly maxArtefacts: number }>({
    id: 'scope.depth-policy', domain: 'scope', stage: 'planning', plane: 'IP',
    purpose: 'Translate the requested depth into concrete traversal limits.',
    inputs: ['DiscoveryScope'], outputs: ['traversal limits'],
    responsibilities: ['bound traversal', 'state the bound so partial coverage is never read as complete'],
    toolContracts: [], aiCapabilityClass: 'none',
    retry: RETRY_NEVER,
    failureHandling: 'An underivable policy uses the shallow limits and the report records that coverage was bounded.',
    handle: (input) => {
      const limits = { shallow: { maxDepth: 2, maxArtefacts: 200 }, standard: { maxDepth: 5, maxArtefacts: 2000 }, deep: { maxDepth: 12, maxArtefacts: 20000 } };
      return limits[input.scope.depth];
    },
  }),
];

// ── Live Application Discovery — Execution Plane ────────────────────────────

/** Everything a discovery agent is given. `inScope` has already refused the rest. */
export interface DiscoveryInput {
  readonly observed: readonly ObservedArtefact[];
  readonly scope: DiscoveryScope;
  readonly inScope: (url: string) => boolean;
}

function ofKind(input: DiscoveryInput, ...kinds: ArtefactKind[]): readonly ObservedArtefact[] {
  return input.observed.filter((a) => kinds.includes(a.kind) && input.inScope(a.path));
}

/** `/users/4471/orders/98` becomes `/users/{id}/orders/{id}`. */
export function routeTemplate(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}')
    .replace(/\/\d+/g, '/{id}')
    .replace(/\/[0-9a-f]{16,}/gi, '/{hash}');
}

export const discoveryAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.web', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate distinct in-scope pages, collapsing identical paths.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['deduplicate by path', 'refuse out-of-scope paths'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A page that cannot be read is recorded as unreachable, never omitted — an omitted page reads as an absent feature.',
    handle: (input) => {
      const seen = new Set<string>();
      return ofKind(input, 'page').filter((a) => (seen.has(a.path) ? false : (seen.add(a.path), true)));
    },
  }),

  defineAgent<DiscoveryInput, readonly string[]>({
    id: 'discovery.routes', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Derive route templates by collapsing identifier segments.',
    inputs: ['ObservedArtefact[]'], outputs: ['route template[]'],
    responsibilities: ['collapse numeric, uuid and hash segments', 'deduplicate templates'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable template keeps the concrete path, producing a larger route set rather than a wrong one.',
    handle: (input) => [...new Set(ofKind(input, 'route', 'page').map((a) => routeTemplate(a.path)))].sort(),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.spa', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Identify client-rendered views reached without a document load.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['distinguish a view transition from a navigation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unclassified view is treated as a page, which over-counts navigation rather than losing a view.',
    handle: (input) => ofKind(input, 'spa-view'),
  }),

  defineAgent<DiscoveryInput, readonly ApiContract[]>({
    id: 'discovery.api', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate API endpoints as method and route template with parameter names.',
    inputs: ['ObservedArtefact[]'], outputs: ['ApiContract[]'],
    responsibilities: ['group by method and template', 'record parameter names, never values'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An endpoint that cannot be parsed is recorded with its raw path so it is still counted.',
    handle: (input) => {
      const byKey = new Map<string, ApiContract>();
      for (const a of ofKind(input, 'api-endpoint')) {
        const method = (a.values['method'] ?? 'GET').toUpperCase();
        const template = routeTemplate(a.path);
        const key = `${method} ${template}`;
        const existing = byKey.get(key);
        // Parameter NAMES only. The values on the observation stay in the Execution
        // Plane and are not read here, because reading them would put them in an object
        // that later crosses.
        const names = Object.keys(a.values).filter((k) => k !== 'method');
        byKey.set(key, {
          id: key, method, path: template, serviceId: null,
          parameterNames: [...new Set([...(existing?.parameterNames ?? []), ...names])].sort(),
        });
      }
      return [...byKey.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    },
  }),

  defineAgent<{ contracts: readonly ApiContract[] }, readonly ApiContract[]>({
    id: 'discovery.microservices', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Infer service boundaries from shared API path prefixes.',
    inputs: ['ApiContract[]'], outputs: ['ApiContract[]'],
    responsibilities: ['assign a service id from the first stable path segment'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unassignable endpoint keeps a null service, which is reported as an ungrouped endpoint rather than guessed into a service.',
    handle: (input) => input.contracts.map((c) => {
      const segment = c.path.split('/').filter(Boolean).find((s) => !s.startsWith('{'));
      // A single-endpoint prefix is not evidence of a service, so `api` and `v1` are
      // skipped: they are routing conventions, not boundaries.
      const serviceId = segment && !/^(api|v\d+)$/i.test(segment) ? segment : null;
      return { ...c, serviceId };
    }),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.shadow-dom', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Reach controls that exist only inside a shadow root.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record the host so a locator can pierce it later'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unpierceable shadow root is reported as an inaccessible region, never as an empty one.',
    handle: (input) => {
      const roots = ofKind(input, 'shadow-root');
      const hosts = new Set(roots.map((r) => r.id));
      // A control inside a shadow root is only automatable if its host is known, so the
      // pair is what is returned, not the control alone.
      return [...roots, ...input.observed.filter((a) => a.parentId !== null && hosts.has(a.parentId))];
    },
  }),

  defineAgent<DiscoveryInput, { readonly sameOrigin: readonly ObservedArtefact[]; readonly refused: readonly string[] }>({
    id: 'discovery.iframes', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Traverse same-origin frames and refuse cross-origin ones.',
    inputs: ['ObservedArtefact[]'], outputs: ['frames', 'refused'],
    responsibilities: ['refuse a frame outside the declared scope'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A frame that cannot be classified is refused. Traversing into an unscoped third party is the failure this prevents.',
    handle: (input) => {
      const frames = input.observed.filter((a) => a.kind === 'iframe');
      return {
        sameOrigin: frames.filter((f) => input.inScope(f.path)),
        refused: frames.filter((f) => !input.inScope(f.path)).map((f) => f.path),
      };
    },
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.authentication', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Identify authentication flows without recording any credential.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['identify sign-in, sign-out and refresh', 'strip any field that looks like a secret'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unidentified flow is reported as an unclassified form rather than guessed, which would mislabel a payment form as a login.',
    handle: (input) => ofKind(input, 'auth-flow', 'form')
      .filter((a) => /\b(login|log in|sign in|signin|logout|sign out|authenticate|token|refresh|sso|oauth)\b/i.test(`${a.label} ${a.path}`))
      .map((a) => ({
        ...a,
        // Even inside the Execution Plane the secret-bearing fields are dropped here, so
        // that no later agent can read what this one chose not to keep.
        values: Object.fromEntries(Object.entries(a.values)
          .filter(([k]) => !/pass|secret|token|otp|pin|credential/i.test(k))),
      })),
  }),

  defineAgent<DiscoveryInput, readonly Relationship[]>({
    id: 'discovery.navigation', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Record navigation edges actually traversed between pages and views.',
    inputs: ['ObservedArtefact[]'], outputs: ['Relationship[]'],
    responsibilities: ['record only edges observed', 'never infer an edge'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An untraversed edge is absent, not assumed. An assumed edge produces a journey nobody can walk.',
    handle: (input) => ofKind(input, 'navigation-edge')
      .filter((a) => a.parentId !== null)
      .map((a) => ({
        from: a.parentId as string, to: a.id, kind: 'navigates-to' as const,
        provenance: 'observed' as const, confidence: 1,
      })),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.forms', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate forms and their fields by name, type and constraint.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record field names and constraints', 'never record an entered value'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A form that cannot be read is reported as an unmapped interaction point rather than skipped.',
    handle: (input) => ofKind(input, 'form', 'field').map((a) => ({
      ...a,
      // Constraints are structure and are kept; anything named as a value is discarded.
      values: Object.fromEntries(Object.entries(a.values)
        .filter(([k]) => /^(type|required|min|max|pattern|maxlength|minlength|step)$/i.test(k))),
    })),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.controls', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate every activatable control, so every click has a step to become.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record the control and its owning surface', 'record the accessible name, never the content it acts on'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unenumerated control becomes a click no test performs, which is silent under-coverage — so it is reported as an unmapped interaction point.',
    handle: (input) => ofKind(input, 'control', 'menu'),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.dynamic-pages', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Identify regions whose content changes without a route change.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['flag content updated by event rather than navigation'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unflagged dynamic region produces a timing-sensitive test, which the healing engine will later report as flaky.',
    handle: (input) => input.observed.filter((a) => a.values['dynamic'] === 'true'),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.files', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate file upload points by accepted type and size limit.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record accepted types', 'never read a file'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unreadable upload control is reported as an unmapped interaction point.',
    handle: (input) => ofKind(input, 'file'),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.downloads', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate download triggers by declared content type.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record the trigger and type', 'never retain downloaded content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unclassified download is recorded by its trigger alone, which is enough to author a test against.',
    handle: (input) => ofKind(input, 'download').map((a) => ({
      // The content type is structure. The file is customer data and is never held.
      ...a, values: { contentType: a.values['contentType'] ?? 'unknown' },
    })),
  }),

  defineAgent<DiscoveryInput, readonly ObservedArtefact[]>({
    id: 'discovery.websockets', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate websocket endpoints and the message types seen.',
    inputs: ['ObservedArtefact[]'], outputs: ['ObservedArtefact[]'],
    responsibilities: ['record endpoint and message type names', 'never record a message body'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unobserved socket is absent from the inventory and the report states that real-time coverage was partial.',
    handle: (input) => ofKind(input, 'websocket').map((a) => ({
      ...a, values: { messageTypes: a.values['messageTypes'] ?? '' },
    })),
  }),

  defineAgent<DiscoveryInput, readonly string[]>({
    id: 'discovery.events', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate the client event names an application dispatches.',
    inputs: ['ObservedArtefact[]'], outputs: ['event name[]'],
    responsibilities: ['record event names only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missed event narrows behavioural coverage and is reported as such.',
    handle: (input) => [...new Set(ofKind(input, 'event').map((a) => a.label))].sort(),
  }),

  defineAgent<DiscoveryInput, readonly { readonly name: string; readonly scope: string }[]>({
    id: 'discovery.cookies', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate cookie names and scopes, never cookie values.',
    inputs: ['ObservedArtefact[]'], outputs: ['cookie descriptor[]'],
    responsibilities: ['record name, domain, path and flags', 'discard the value'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unreadable cookie is recorded by name alone. A session cookie value is never recorded under any condition.',
    handle: (input) => ofKind(input, 'cookie').map((a) => ({
      name: a.label,
      // The value is dropped HERE, in the Execution Plane, at the point of observation.
      // A cookie value is a session, and a session in an audit log is an account.
      scope: `${a.values['domain'] ?? ''}${a.values['path'] ?? '/'}${a.values['secure'] === 'true' ? ' secure' : ''}`,
    })),
  }),

  defineAgent<DiscoveryInput, readonly string[]>({
    id: 'discovery.storage', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate local and session storage keys, never their contents.',
    inputs: ['ObservedArtefact[]'], outputs: ['storage key[]'],
    responsibilities: ['record keys only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unreadable store is reported as unmapped. Contents are never read, so there is nothing to fail to protect.',
    handle: (input) => [...new Set(ofKind(input, 'storage-key').map((a) => a.label))].sort(),
  }),

  defineAgent<{ edges: readonly Relationship[]; pages: readonly ObservedArtefact[] }, readonly Journey[]>({
    id: 'discovery.journeys', domain: 'discovery', stage: 'discovery', plane: 'EP',
    purpose: 'Assemble observed navigation edges into end-to-end candidate journeys.',
    inputs: ['Relationship[]', 'ObservedArtefact[]'], outputs: ['Journey[]'],
    responsibilities: ['walk only observed edges', 'terminate on a cycle', 'never invent a step'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A journey that cannot be completed is recorded as a partial path rather than discarded; a partial path is still a testable flow.',
    handle: (input) => {
      const out = new Map<string, string[]>();
      for (const e of input.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
      const targets = new Set(input.edges.map((e) => e.to));
      const entries = [...new Set(input.edges.map((e) => e.from))].filter((n) => !targets.has(n));

      const journeys: Journey[] = [];
      for (const entry of entries) {
        // Depth-first to the first terminal node, with a visited set. A cycle in a
        // navigation graph is normal — a header link back to the home page makes one —
        // so termination is by visitation, not by depth.
        const steps: string[] = [];
        const visited = new Set<string>();
        let node: string | undefined = entry;
        while (node && !visited.has(node)) {
          visited.add(node);
          steps.push(node);
          node = out.get(node)?.find((n) => !visited.has(n));
        }
        if (steps.length < 2) continue;
        journeys.push({
          id: `journey-${journeys.length + 1}`,
          name: `${steps[0]} to ${steps[steps.length - 1]}`,
          steps,
          entryFactId: steps[0] as string,
          exitFactId: steps[steps.length - 1] as string,
          provenance: 'observed',
        });
      }
      return journeys;
    },
  }),
];

/** Build a graph from edges. Nodes are derived, so a node can never lack an edge. */
export function graphOf(name: string, edges: readonly Relationship[]): Graph {
  return {
    name,
    nodes: [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort(),
    edges,
  };
}

export { norm };
