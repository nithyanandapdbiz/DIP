/**
 * Application Intelligence and Application Model — Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 11-capability-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-13.1 (AI proposes; code decides)
 *   Invariants   : INV-7 (functions with reasoning unavailable)
 *
 * EVERY AGENT HERE READS `ApplicationFact`, NEVER `ObservedArtefact`.
 * That is the sovereignty boundary expressed as a type constraint: a fact carries
 * attribute NAMES, so no agent in this file can read a cookie value, a form entry or a
 * response body — not because it declines to, but because there is no field holding one.
 *
 * OBSERVED VERSUS INFERRED IS CARRIED ON EVERY EDGE.
 * `Relationship.provenance` distinguishes what the Execution Plane saw from what
 * reasoning proposed. Without it, one enrichment pass makes an inferred dependency
 * indistinguishable from a measured one, and the graph stops being evidence. With
 * reasoning disabled every edge is `observed` — which is the same graph, smaller.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  type ApiContract, type ApplicationFact, type ApplicationIntelligence, type ApplicationModel,
  type BusinessCapability, type BusinessEntity, type BusinessRule, type Graph, type Journey,
  type Relationship, norm,
} from '../model.js';
import { graphOf } from './scope-and-discovery.js';

const EMPTY_GRAPH: Graph = { name: 'empty', nodes: [], edges: [] };

/** A fact's module: the first path segment. Applications are organised by URL prefix. */
function moduleOf(fact: ApplicationFact): string {
  return fact.path.split('/').filter(Boolean)[0] ?? 'root';
}

// ── Application Intelligence ────────────────────────────────────────────────

export const applicationIntelligenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ contracts: readonly ApiContract[] }, readonly string[]>({
    id: 'appintel.services', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Enumerate the services the application is composed of.',
    inputs: ['ApiContract[]'], outputs: ['service[]'],
    responsibilities: ['derive from assigned service ids only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable service list is empty and the report states that service decomposition was not established.',
    handle: (input) => [...new Set(input.contracts.map((c) => c.serviceId).filter((s): s is string => s !== null))].sort(),
  }),

  defineAgent<{ contracts: readonly ApiContract[]; facts: readonly ApplicationFact[] }, readonly ApiContract[]>({
    id: 'appintel.api-contracts', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Consolidate API contracts and attach the pages that call them.',
    inputs: ['ApiContract[]', 'ApplicationFact[]'], outputs: ['ApiContract[]'],
    responsibilities: ['merge duplicate contracts', 'union parameter names'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unconsolidated contract remains separate, over-counting endpoints rather than losing one.',
    handle: (input) => {
      const merged = new Map<string, ApiContract>();
      for (const c of input.contracts) {
        const prior = merged.get(c.id);
        merged.set(c.id, prior
          ? { ...prior, parameterNames: [...new Set([...prior.parameterNames, ...c.parameterNames])].sort() }
          : c);
      }
      return [...merged.values()];
    },
  }),

  defineAgent<{ facts: readonly ApplicationFact[]; contracts: readonly ApiContract[] }, readonly BusinessEntity[]>({
    id: 'appintel.entities', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Reconstruct business entities from field and parameter names.',
    inputs: ['ApplicationFact[]', 'ApiContract[]'], outputs: ['BusinessEntity[]'],
    responsibilities: ['group field names by owning module', 'name the entity from its module'],
    toolContracts: [], aiCapabilityClass: 'extraction',
    promptContract: {
      intent: 'Extract the business entity a group of field and parameter names describes.',
      inputsProvided: ['field names', 'parameter names', 'module name', 'page labels'],
      expects: 'an entity name per group',
      rejectionRules: [
        'an entity naming a module that was not discovered is discarded',
        'an entity claiming a field name not in the input is discarded',
        'a name shorter than three characters is discarded',
      ],
    },
    aiBehaviour: 'Names entities in domain terms — "purchase order" where the module is "po".',
    nonAiBehaviour: 'Names entities after the module that owns them. The same entities are found; their names are structural.',
    failureHandling: 'An unnamed entity keeps its module name, which is always available and never wrong, only coarse.',
    handle: (input, ctx) => {
      const byModule = new Map<string, Set<string>>();
      const sources = new Map<string, Set<string>>();
      for (const f of input.facts) {
        if (f.kind !== 'form' && f.kind !== 'field') continue;
        const m = moduleOf(f);
        if (!byModule.has(m)) { byModule.set(m, new Set()); sources.set(m, new Set()); }
        for (const n of f.attributeNames) byModule.get(m)?.add(n);
        sources.get(m)?.add(f.id);
      }
      for (const c of input.contracts) {
        const m = c.serviceId ?? c.path.split('/').filter(Boolean)[0] ?? 'root';
        if (!byModule.has(m)) { byModule.set(m, new Set()); sources.set(m, new Set()); }
        for (const n of c.parameterNames) byModule.get(m)?.add(n);
      }

      const proposedNames = (ctx.proposal ?? null) as Record<string, unknown> | null;
      return [...byModule.entries()].map(([module, fields]) => {
        const proposed = typeof proposedNames?.[module] === 'string' ? (proposedNames[module] as string).trim() : '';
        // CODE DECIDES: a proposed name is accepted only for a module that exists and
        // only when it is substantive. Otherwise the structural name stands.
        const name = proposed.length >= 3 ? proposed : module;
        return {
          id: `entity-${module}`, name,
          fieldNames: [...fields].sort(),
          sourceFactIds: [...(sources.get(module) ?? [])].sort(),
        };
      }).sort((a, b) => (a.id < b.id ? -1 : 1));
    },
  }),

  defineAgent<{ observed: readonly Relationship[]; facts: readonly ApplicationFact[] }, readonly Relationship[]>({
    id: 'appintel.relationships', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Establish relationships between application elements, marking each as observed or inferred.',
    inputs: ['Relationship[]', 'ApplicationFact[]'], outputs: ['Relationship[]'],
    responsibilities: ['keep every observed edge', 'accept an inferred edge only between known nodes', 'never mark an inference observed'],
    toolContracts: [], aiCapabilityClass: 'reconciliation',
    promptContract: {
      intent: 'Infer relationships between application elements that were not directly traversed.',
      inputsProvided: ['fact identifiers', 'fact kinds', 'fact labels', 'observed edges'],
      expects: 'an array of {from, to, kind} triples',
      rejectionRules: [
        'an edge naming an identifier that was not discovered is discarded',
        'an inferred edge is recorded with provenance "inferred" and confidence 0.6, never as observed',
        'an edge duplicating an observed edge is discarded rather than promoted',
        'a kind outside the declared relationship kinds is discarded',
      ],
    },
    aiBehaviour: 'Adds inferred edges — an implied dependency between two services that never called each other during the crawl.',
    nonAiBehaviour: 'Returns only edges the Execution Plane traversed. The graph is smaller and every edge is measured.',
    failureHandling: 'On failure only observed edges survive, which is the correct conservative graph.',
    handle: (input, ctx) => {
      const known = new Set(input.facts.map((f) => f.id));
      const kinds = new Set(['navigates-to', 'submits-to', 'reads', 'writes', 'depends-on', 'contains']);
      const seen = new Set(input.observed.map((e) => `${e.from}->${e.to}:${e.kind}`));
      const edges: Relationship[] = [...input.observed];

      const proposed = Array.isArray(ctx.proposal) ? (ctx.proposal as Record<string, unknown>[]) : [];
      let accepted = 0;
      for (const p of proposed) {
        const from = typeof p['from'] === 'string' ? p['from'] : '';
        const to = typeof p['to'] === 'string' ? p['to'] : '';
        const kind = typeof p['kind'] === 'string' ? p['kind'] : '';
        if (!known.has(from) || !known.has(to) || !kinds.has(kind)) continue;
        if (seen.has(`${from}->${to}:${kind}`)) continue;
        seen.add(`${from}->${to}:${kind}`);
        edges.push({ from, to, kind: kind as Relationship['kind'], provenance: 'inferred', confidence: 0.6 });
        accepted += 1;
      }
      ctx.audit('appintel.relationships.decided', `${accepted}/${proposed.length} inferred edges accepted`);
      return edges;
    },
  }),

  defineAgent<{ facts: readonly ApplicationFact[] }, readonly BusinessRule[]>({
    id: 'appintel.business-rules', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Reconstruct business rules from the constraints the application enforces.',
    inputs: ['ApplicationFact[]'], outputs: ['BusinessRule[]'],
    responsibilities: ['derive a rule per enforced constraint', 'cite the fact it came from'],
    toolContracts: [], aiCapabilityClass: 'extraction',
    promptContract: {
      intent: 'Extract the business rule a set of field constraints expresses.',
      inputsProvided: ['field names', 'constraint names', 'page labels', 'module name'],
      expects: 'a rule statement per constraint group',
      rejectionRules: [
        'a rule citing a fact identifier not in the input is discarded',
        'a rule with no source fact is discarded — an unsourced rule is an assertion about a system nobody observed',
        'a statement shorter than 15 characters is discarded',
      ],
    },
    aiBehaviour: 'States the rule in business terms — "an order cannot be submitted without a delivery address".',
    nonAiBehaviour: 'States the constraint structurally — "field deliveryAddress is required on module orders". Same rules, mechanical wording.',
    failureHandling: 'An underivable rule is omitted; a fabricated rule would generate tests asserting behaviour the application never had.',
    handle: (input, ctx) => {
      const CONSTRAINTS = ['required', 'min', 'max', 'pattern', 'maxlength', 'minlength', 'step'];
      const rules: BusinessRule[] = [];
      for (const f of input.facts) {
        const present = f.attributeNames.filter((n) => CONSTRAINTS.includes(n.toLowerCase()));
        for (const c of present) {
          rules.push({
            id: `rule-${f.id}-${c}`,
            statement: `field "${f.label}" on ${moduleOf(f)} enforces ${c}`,
            sourceFactIds: [f.id],
            provenance: 'observed',
          });
        }
      }

      const proposed = Array.isArray(ctx.proposal) ? (ctx.proposal as Record<string, unknown>[]) : [];
      const known = new Set(input.facts.map((f) => f.id));
      for (const p of proposed) {
        const statement = typeof p['statement'] === 'string' ? p['statement'].trim() : '';
        const cited = Array.isArray(p['sourceFactIds']) ? (p['sourceFactIds'] as unknown[]).filter((s): s is string => typeof s === 'string') : [];
        const valid = cited.filter((id) => known.has(id));
        // An unsourced rule is refused. Reconstruction that cannot point at what it was
        // reconstructed from is invention wearing the word "discovery".
        if (statement.length < 15 || valid.length === 0) continue;
        rules.push({ id: `rule-inferred-${rules.length + 1}`, statement, sourceFactIds: valid, provenance: 'inferred' });
      }
      return rules;
    },
  }),

  defineAgent<{ facts: readonly ApplicationFact[] }, readonly string[]>({
    id: 'appintel.modules', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Group discovered facts into application modules.',
    inputs: ['ApplicationFact[]'], outputs: ['module[]'],
    responsibilities: ['group by leading path segment'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An ungrouped fact falls into the root module and is still counted.',
    handle: (input) => [...new Set(input.facts.map(moduleOf))].sort(),
  }),

  defineAgent<{ facts: readonly ApplicationFact[] }, readonly string[]>({
    id: 'appintel.menus', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Reconstruct the application menu structure.',
    inputs: ['ApplicationFact[]'], outputs: ['menu[]'],
    responsibilities: ['order by label so the structure is reproducible'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unreconstructed menu leaves navigation to the observed edges, which is the more reliable source anyway.',
    handle: (input) => input.facts.filter((f) => f.kind === 'menu').map((f) => f.label).sort(),
  }),

  defineAgent<{ facts: readonly ApplicationFact[] }, readonly string[]>({
    id: 'appintel.pages', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Produce the page inventory.',
    inputs: ['ApplicationFact[]'], outputs: ['page[]'],
    responsibilities: ['include pages and client-rendered views'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing page understates coverage, which the completeness figure then reports rather than hides.',
    handle: (input) => [...new Set(input.facts.filter((f) => f.kind === 'page' || f.kind === 'spa-view').map((f) => f.path))].sort(),
  }),

  defineAgent<{ edges: readonly Relationship[] }, Graph>({
    id: 'appintel.navigation-graph', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Build the navigation graph from navigation edges.',
    inputs: ['Relationship[]'], outputs: ['Graph'],
    responsibilities: ['include only navigation edges'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuildable graph is empty, and an empty navigation graph is reported as a discovery gap.',
    handle: (input) => graphOf('navigation', input.edges.filter((e) => e.kind === 'navigates-to')),
  }),

  defineAgent<{ journeys: readonly Journey[] }, Graph>({
    id: 'appintel.journey-graph', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Build the journey graph from discovered journeys.',
    inputs: ['Journey[]'], outputs: ['Graph'],
    responsibilities: ['one edge per consecutive step pair'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuildable journey graph leaves journeys as flat step lists, which are still testable.',
    handle: (input) => graphOf('journey', input.journeys.flatMap((j) =>
      j.steps.slice(0, -1).map((from, i) => ({
        from, to: j.steps[i + 1] as string, kind: 'navigates-to' as const,
        provenance: j.provenance, confidence: 1,
      })))),
  }),

  defineAgent<{ contracts: readonly ApiContract[]; edges: readonly Relationship[] }, Graph>({
    id: 'appintel.dependency-graph', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Build the service dependency graph from calls between services.',
    inputs: ['ApiContract[]', 'Relationship[]'], outputs: ['Graph'],
    responsibilities: ['edge only between two named services', 'never create a self-dependency'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuildable dependency graph is empty; a wrong one would drive execution ordering that deadlocks.',
    handle: (input) => graphOf('dependency', input.edges.filter((e) =>
      e.kind === 'depends-on' && e.from !== e.to)),
  }),

  defineAgent<{ intelligence: Omit<ApplicationIntelligence, 'knowledgeGraph'> }, Graph>({
    id: 'appintel.knowledge-graph', domain: 'appintel', stage: 'context', plane: 'IP',
    purpose: 'Fold entities, services, rules and navigation into one knowledge graph.',
    inputs: ['ApplicationIntelligence'], outputs: ['Graph'],
    responsibilities: ['connect each entity to its module', 'connect each rule to its source'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A partial knowledge graph is kept; the graph is a reasoning aid and never the source of a verdict.',
    handle: (input) => {
      const i = input.intelligence;
      const edges: Relationship[] = [
        ...i.relationships,
        ...i.entities.flatMap((e) => e.sourceFactIds.map((s) => ({
          from: e.id, to: s, kind: 'contains' as const, provenance: 'observed' as const, confidence: 1,
        }))),
        ...i.businessRules.flatMap((r) => r.sourceFactIds.map((s) => ({
          from: r.id, to: s, kind: 'depends-on' as const, provenance: r.provenance, confidence: 1,
        }))),
      ];
      return graphOf('knowledge', edges);
    },
  }),
];

// ── Application Model ───────────────────────────────────────────────────────

export const applicationModelAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ applicationId: string; intelligence: ApplicationIntelligence }, string>({
    id: 'appmodel.application', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the application identity the model is built for.',
    inputs: ['applicationId', 'ApplicationIntelligence'], outputs: ['applicationId'],
    responsibilities: ['refuse a model with no application identity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A model with no application identity is refused; every downstream artefact traces to it.',
    handle: (input) => {
      if (!input.applicationId.trim()) throw new Error('an application model requires an application identity');
      return input.applicationId;
    },
  }),

  defineAgent<{ intelligence: ApplicationIntelligence }, readonly string[]>({
    id: 'appmodel.domain', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the business domains the application spans.',
    inputs: ['ApplicationIntelligence'], outputs: ['domain[]'],
    responsibilities: ['derive domains from modules that own entities'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable domain set falls back to the module list, which is coarser but always available.',
    handle: (input) => {
      const owning = new Set(input.intelligence.entities.map((e) => e.id.replace(/^entity-/, '')));
      const domains = input.intelligence.modules.filter((m) => owning.has(m));
      return (domains.length > 0 ? domains : input.intelligence.modules).slice().sort();
    },
  }),

  defineAgent<{ intelligence: ApplicationIntelligence }, readonly string[]>({
    id: 'appmodel.service', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the service model.',
    inputs: ['ApplicationIntelligence'], outputs: ['service[]'],
    responsibilities: ['include only services carrying at least one contract'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty service model is reported as a monolithic application rather than as a discovery failure.',
    handle: (input) => input.intelligence.services.filter((s) =>
      input.intelligence.apiContracts.some((c) => c.serviceId === s)),
  }),

  defineAgent<{ intelligence: ApplicationIntelligence }, readonly BusinessEntity[]>({
    id: 'appmodel.entity', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the entity model, dropping entities with no fields.',
    inputs: ['ApplicationIntelligence'], outputs: ['BusinessEntity[]'],
    responsibilities: ['refuse an entity with no field'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An entity with no fields is dropped; it would generate test data with no shape.',
    handle: (input) => input.intelligence.entities.filter((e) => e.fieldNames.length > 0),
  }),

  defineAgent<{ intelligence: ApplicationIntelligence; entities: readonly BusinessEntity[] }, readonly Relationship[]>({
    id: 'appmodel.relationship', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the relationship model, keeping only edges between modelled elements.',
    inputs: ['ApplicationIntelligence', 'BusinessEntity[]'], outputs: ['Relationship[]'],
    responsibilities: ['drop an edge whose endpoint was dropped from the model'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A dangling edge is dropped rather than kept; a graph with edges to nothing cannot be traversed.',
    handle: (input) => {
      const modelled = new Set<string>([
        ...input.entities.map((e) => e.id),
        ...input.intelligence.services,
        ...input.intelligence.pages,
        ...input.intelligence.navigationGraph.nodes,
        ...input.intelligence.businessRules.map((r) => r.id),
        ...input.intelligence.entities.flatMap((e) => e.sourceFactIds),
      ]);
      return input.intelligence.relationships.filter((e) => modelled.has(e.from) && modelled.has(e.to));
    },
  }),

  defineAgent<{ intelligence: ApplicationIntelligence }, Graph>({
    id: 'appmodel.navigation', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the navigation model.',
    inputs: ['ApplicationIntelligence'], outputs: ['Graph'],
    responsibilities: ['carry the navigation graph into the model unchanged'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An absent navigation model is empty and is reported as a coverage gap.',
    handle: (input) => input.intelligence.navigationGraph ?? EMPTY_GRAPH,
  }),

  defineAgent<{ journeys: readonly Journey[]; navigation: Graph }, readonly Journey[]>({
    id: 'appmodel.journey', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish the journey model, keeping only journeys the navigation model supports.',
    inputs: ['Journey[]', 'Graph'], outputs: ['Journey[]'],
    responsibilities: ['drop a journey with a step outside the navigation model'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unsupported journey is dropped. A journey with an unreachable step generates a test that can never pass.',
    handle: (input) => {
      const reachable = new Set(input.navigation.nodes);
      return input.journeys.filter((j) => j.steps.every((s) => reachable.has(s)));
    },
  }),

  defineAgent<{ services: readonly string[]; journeys: readonly Journey[]; modules: readonly string[] }, readonly BusinessCapability[]>({
    id: 'appmodel.business-capability', domain: 'appmodel', stage: 'architecture-review', plane: 'IP',
    purpose: 'Establish business capabilities from services and the journeys that exercise them.',
    inputs: ['service[]', 'Journey[]', 'module[]'], outputs: ['BusinessCapability[]'],
    responsibilities: ['bind each capability to its services and journeys'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Classify services and journeys into the business capabilities they deliver.',
      inputsProvided: ['service names', 'journey names', 'module names'],
      expects: 'a capability name per group of services and journeys',
      rejectionRules: [
        'a capability naming a service or journey not in the input is discarded',
        'a capability with neither a service nor a journey is discarded — a capability nothing delivers is a label',
      ],
    },
    aiBehaviour: 'Names capabilities in business terms and may group several modules under one.',
    nonAiBehaviour: 'Derives one capability per module, bound to the services and journeys that touch it.',
    failureHandling: 'An underivable capability set falls back to one capability per module, which is always derivable.',
    handle: (input) => input.modules.map((m) => ({
      id: `capability-${m}`,
      name: m,
      serviceIds: input.services.filter((s) => s === m),
      journeyIds: input.journeys.filter((j) => j.steps.some((s) => s.includes(m))).map((j) => j.id),
    })).filter((c) => c.serviceIds.length > 0 || c.journeyIds.length > 0),
  }),
];

export { norm, type ApplicationModel };
