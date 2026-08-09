/**
 * Change, Dependency, Business-Impact, Risk and Coverage Intelligence agents.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md · 13-ai-operating-model.md
 *   ADR          : ADR-0024 §3.2 · §3.6
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-11.11
 *
 * THESE ARE THE STAGES WHERE REASONING HELPS AND IS NEVER REQUIRED.
 * Every agent that declares an AI capability class has deterministic decision logic that
 * runs when the proposal is `null`. AI-disabled mode is not a second path — it is these
 * same agents, receiving no proposal, taking the degraded branch each already has (INV-7).
 *
 * A REASONING AGENT STATES WHEN IT REJECTS THE PROPOSAL.
 * `promptContract.rejectionRules` is non-empty for every one, enforced at registration.
 * An agent that cannot say when it refuses a proposal relays rather than decides.
 */
import { defineAgent, type AgentContext, type AgentDefinition } from '@dbiz/capability-framework';
import type {
  BusinessImpact, ChangeCategory, ChangeFact, ClassifiedChange, CoverageAssessment,
  DependencyEdge, ImpactedModule, RepositoryAsset, RiskAssessment,
} from '../model.js';

/** Read a string-array proposal, tolerating anything the caller supplied. */
function proposedList(ctx: AgentContext): readonly string[] | null {
  return Array.isArray(ctx.proposal) ? (ctx.proposal as unknown[]).filter((x): x is string => typeof x === 'string') : null;
}

// ── Change Intelligence ─────────────────────────────────────────────────────

const CATEGORY_RULES: readonly { readonly when: (f: ChangeFact) => boolean; readonly category: ChangeCategory }[] = [
  { when: (f) => f.layer === 'ui', category: 'ui' },
  { when: (f) => f.layer === 'api', category: 'api' },
  { when: (f) => f.layer === 'data', category: 'database' },
  { when: (f) => f.layer === 'configuration', category: 'configuration' },
  { when: (f) => f.layer === 'infrastructure', category: 'infrastructure' },
  { when: (f) => f.layer === 'domain', category: 'functional' },
  { when: (f) => f.layer === 'build' || f.imports.length !== f.exports.length, category: 'dependency' },
  { when: (f) => f.symbolsRemoved.length > 0, category: 'breaking' },
  { when: (f) => f.exports.length > 0 && f.symbolsModified.length > 0, category: 'behaviour' },
  { when: (f) => f.churn > 200, category: 'risk' },
];

export const changeIntelligenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[] }, readonly ClassifiedChange[]>({
    id: 'change.classification', domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: 'Classify each change into business, functional, technical, API, UI and other categories.',
    inputs: ['ChangeFact[]'], outputs: ['ClassifiedChange[]'],
    responsibilities: ['assign at least one category to every change', 'derive from structure, cite the fact'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Given a changed file\'s layer, symbols and imports, propose additional change categories a purely structural rule set would miss.',
      inputsProvided: ['path', 'layer', 'symbol names added/removed/modified', 'import specifiers', 'churn counts'],
      expects: 'A list of category names drawn from the fixed ChangeCategory vocabulary.',
      rejectionRules: [
        'reject any category not in the ChangeCategory vocabulary',
        'reject a proposal that would leave the deterministic categories unset',
        'reject the whole proposal when the fact carries no symbols to reason about',
      ],
    },
    aiBehaviour: 'Reasoning may ADD categories (e.g. "behaviour" on a subtle signature change) on top of the rule-derived set; it may never remove one.',
    nonAiBehaviour: 'The ordered CATEGORY_RULES assign categories from layer, symbols, imports and churn alone. Every change still receives at least one.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A change that cannot be classified is assigned "technical" with a stated reason, never left uncategorised.',
    handle: (input, ctx) => input.facts.map((fact) => {
      const deterministic = CATEGORY_RULES.filter((r) => r.when(fact)).map((r) => r.category);
      const base: ChangeCategory[] = deterministic.length > 0 ? deterministic : ['technical'];
      const proposed = proposedList(ctx) ?? [];
      const valid = proposed.filter((p): p is ChangeCategory =>
        (['business', 'functional', 'technical', 'api', 'database', 'configuration',
          'infrastructure', 'ui', 'breaking', 'behaviour', 'dependency', 'risk'] as const)
          .includes(p as ChangeCategory));
      const categories = [...new Set([...base, ...valid])].sort();
      return {
        path: fact.path,
        categories,
        rationale: `layer=${fact.layer}, +${fact.symbolsAdded.length}/-${fact.symbolsRemoved.length} symbols, churn ${fact.churn}`
          + (valid.length ? `; reasoning added ${valid.join(', ')}` : ''),
        sourceFactPath: fact.path,
      };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: 'change.breaking-detection', domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: 'Flag changes that remove or alter an exported symbol as potentially breaking.',
    inputs: ['ChangeFact[]'], outputs: ['breaking paths'],
    responsibilities: ['a removed export is breaking until proven otherwise'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure every export change is treated as breaking, which over-tests rather than under-tests.',
    handle: (input) => input.facts
      .filter((f) => f.symbolsRemoved.length > 0 || (f.exports.length > 0 && f.symbolsModified.length > 0))
      .map((f) => f.path),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: 'change.api-surface', domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: 'Identify changes to the API layer that alter the external contract.',
    inputs: ['ChangeFact[]'], outputs: ['api paths'],
    responsibilities: ['an api-layer change with export deltas touches the contract'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure all api-layer changes are treated as contract-affecting.',
    handle: (input) => input.facts.filter((f) => f.layer === 'api').map((f) => f.path),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: 'change.schema-detection', domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: 'Identify database and schema changes that may require migration and data-shape tests.',
    inputs: ['ChangeFact[]'], outputs: ['schema paths'],
    responsibilities: ['a data-layer change is schema-affecting until shown otherwise'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure all data-layer changes are treated as schema-affecting.',
    handle: (input) => input.facts.filter((f) => f.layer === 'data').map((f) => f.path),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: 'change.configuration-drift', domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: 'Identify configuration and infrastructure changes that alter runtime behaviour.',
    inputs: ['ChangeFact[]'], outputs: ['configuration paths'],
    responsibilities: ['config change is behaviour change'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure all configuration and infrastructure changes are flagged.',
    handle: (input) => input.facts
      .filter((f) => f.layer === 'configuration' || f.layer === 'infrastructure').map((f) => f.path),
  }) as AgentDefinition<never, unknown>,
];

// ── Dependency Intelligence ─────────────────────────────────────────────────

export const dependencyIntelligenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[]; coChange: readonly { path: string; related: string; occurrences: number }[] }, readonly DependencyEdge[]>({
    id: 'dependency.graph', domain: 'dependency', stage: 'architecture-review', plane: 'IP',
    purpose: 'Build the dependency graph over changed paths from imports, exports and co-change history.',
    inputs: ['ChangeFact[]', 'co-change pairs'], outputs: ['DependencyEdge[]'],
    responsibilities: ['every edge carries a kind and a strength', 'derive strength deterministically'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A graph that cannot be built falls back to co-change edges alone; blast radius is reported as a lower bound.',
    handle: (input) => {
      const changedPaths = new Set(input.facts.map((f) => f.path));
      const exportOwners = new Map<string, string>();
      for (const fact of input.facts) for (const e of fact.exports) exportOwners.set(e, fact.path);

      const edges: DependencyEdge[] = [];
      for (const fact of input.facts) {
        for (const imp of fact.imports) {
          const target = exportOwners.get(imp);
          if (target && target !== fact.path) {
            edges.push({ from: fact.path, to: target, kind: 'import', strength: 0.8 });
          }
        }
      }
      for (const pair of input.coChange) {
        if (changedPaths.has(pair.path) && changedPaths.has(pair.related) && pair.path !== pair.related) {
          edges.push({
            from: pair.path, to: pair.related, kind: 'co-change',
            strength: Math.min(0.9, 0.2 + pair.occurrences * 0.1),
          });
        }
      }
      return edges.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[]; edges: readonly DependencyEdge[]; modules: readonly { module: string; paths: readonly string[] }[] }, readonly ImpactedModule[]>({
    id: 'dependency.blast-radius', domain: 'dependency', stage: 'architecture-review', plane: 'IP',
    purpose: 'Compute the transitive set of modules a change can reach through the dependency graph.',
    inputs: ['ChangeFact[]', 'DependencyEdge[]', 'modules'], outputs: ['ImpactedModule[]'],
    responsibilities: ['a directly changed module is depth 0', 'reached modules carry their depth'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure only directly changed modules are reported, which under-states rather than over-states reach and is labelled a lower bound.',
    handle: (input) => {
      const moduleOf = new Map<string, string>();
      for (const m of input.modules) for (const p of m.paths) moduleOf.set(p, m.module);

      const directPaths = new Set(input.facts.map((f) => f.path));
      const depth = new Map<string, number>();
      for (const p of directPaths) depth.set(p, 0);

      // Breadth-first over the edges, bounded — a change cannot reach further than the
      // graph it produced, and the bound is what keeps this deterministic and finite.
      let frontier = [...directPaths];
      for (let d = 1; d <= 4 && frontier.length > 0; d += 1) {
        const next: string[] = [];
        for (const edge of input.edges) {
          if (frontier.includes(edge.to) && !depth.has(edge.from)) {
            depth.set(edge.from, d); next.push(edge.from);
          }
        }
        frontier = next;
      }

      const byModule = new Map<string, { paths: Set<string>; minDepth: number; direct: boolean }>();
      for (const [path, d] of depth) {
        const module = moduleOf.get(path) ?? path.split('/')[0] ?? 'unattributed';
        const entry = byModule.get(module) ?? { paths: new Set(), minDepth: d, direct: d === 0 };
        entry.paths.add(path);
        entry.minDepth = Math.min(entry.minDepth, d);
        entry.direct = entry.direct || d === 0;
        byModule.set(module, entry);
      }
      return [...byModule.entries()]
        .map(([module, e]) => ({ module, paths: [...e.paths].sort(), directly: e.direct, depth: e.minDepth }))
        .sort((a, b) => a.depth - b.depth || (a.module < b.module ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly { module: string; version: string | null }[]>({
    id: 'dependency.package-changes', domain: 'dependency', stage: 'architecture-review', plane: 'IP',
    purpose: 'Detect dependency-manifest changes that alter third-party versions.',
    inputs: ['ChangeFact[]'], outputs: ['package changes'],
    responsibilities: ['a build-layer manifest change is a dependency change'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure the run continues without a supply-chain signal, which the risk stage records as unmeasured rather than clean.',
    handle: (input) => input.facts
      .filter((f) => f.layer === 'build' && /package\.json|pnpm-lock|requirements|go\.mod|pom\.xml|gemfile/i.test(f.path))
      .map((f) => ({ module: f.path, version: null })),
  }) as AgentDefinition<never, unknown>,
];

// ── Business Impact Intelligence ────────────────────────────────────────────

export const businessImpactAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ classified: readonly ClassifiedChange[]; modules: readonly ImpactedModule[] }, readonly BusinessImpact[]>({
    id: 'business.impact-analysis', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Determine business modules, capabilities, customer impact and criticality for the change.',
    inputs: ['ClassifiedChange[]', 'ImpactedModule[]'], outputs: ['BusinessImpact[]'],
    responsibilities: ['every impact cites a changed path', 'criticality is derived, never assumed'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Given impacted modules and their change categories, propose the business capability and user journeys each module supports.',
      inputsProvided: ['module names', 'changed path names', 'change categories', 'impact depth'],
      expects: 'A capability label and a list of user-journey labels per module.',
      rejectionRules: [
        'reject a proposal for a module with no changed path behind it',
        'reject any capability label that is empty',
        'reject journeys when the module is a test or build module, which has no user journey',
      ],
    },
    aiBehaviour: 'Reasoning names the business capability and journeys a module serves, which structure alone cannot know. Criticality remains rule-derived.',
    nonAiBehaviour: 'Capability defaults to the module name and journeys to the empty list; criticality, customer-facing and cross-module are computed from layer and depth.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A module that cannot be assessed is emitted at criticality "medium" with a stated reason, never dropped.',
    handle: (input, ctx) => {
      const proposal = (ctx.proposal ?? {}) as Record<string, { capability?: string; journeys?: readonly string[] }>;
      return input.modules
        .filter((m) => !m.module.match(/test|spec|build|ci|docs/i))
        .map((m) => {
          const categories = new Set(input.classified.filter((c) => m.paths.includes(c.path)).flatMap((c) => c.categories));
          const customerFacing = categories.has('ui') || categories.has('api') || categories.has('behaviour');
          const breaking = categories.has('breaking');
          const criticality: BusinessImpact['criticality'] =
            breaking ? 'critical' : (customerFacing && m.directly) ? 'high' : m.directly ? 'medium' : 'low';
          const p = proposal[m.module];
          return {
            module: m.module,
            capability: p?.capability?.trim() || m.module,
            userJourneys: p?.journeys ?? [],
            criticality,
            customerFacing,
            crossModule: input.modules.filter((o) => o.module !== m.module && !o.directly).map((o) => o.module).slice(0, 8),
            rationale: `depth ${m.depth}, categories ${[...categories].sort().join('/') || 'none'}`
              + (p?.capability ? '; capability named by reasoning' : '; capability defaulted to module'),
          };
        });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ impacts: readonly BusinessImpact[] }, readonly string[]>({
    id: 'business.customer-journeys', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Assemble the distinct user journeys the change touches, for coverage targeting.',
    inputs: ['BusinessImpact[]'], outputs: ['journeys'],
    responsibilities: ['deduplicate journeys across modules'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty journey set narrows coverage to path level, which is stated in the report.',
    handle: (input) => [...new Set(input.impacts.flatMap((i) => i.userJourneys))].sort(),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ impacts: readonly BusinessImpact[] }, { critical: number; customerFacing: number; releaseRisk: boolean }>({
    id: 'business.release-risk', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Summarise business release risk from the assessed impacts.',
    inputs: ['BusinessImpact[]'], outputs: ['release-risk summary'],
    responsibilities: ['a critical customer-facing impact is a release risk'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure release risk defaults to true, which delays a release rather than shipping an unassessed one.',
    handle: (input) => ({
      critical: input.impacts.filter((i) => i.criticality === 'critical').length,
      customerFacing: input.impacts.filter((i) => i.customerFacing).length,
      releaseRisk: input.impacts.some((i) => i.criticality === 'critical' && i.customerFacing),
    }),
  }) as AgentDefinition<never, unknown>,
];

// ── Risk Intelligence ───────────────────────────────────────────────────────

export const riskIntelligenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[]; impacts: readonly BusinessImpact[]; churn: readonly { path: string; added: number; removed: number }[] }, readonly RiskAssessment[]>({
    id: 'risk.assessment', domain: 'risk', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Assign a risk band to each changed area from churn, layer, breaking status and business criticality.',
    inputs: ['ChangeFact[]', 'BusinessImpact[]', 'churn'], outputs: ['RiskAssessment[]'],
    responsibilities: ['every band names its contributing factors', 'the score is reproducible'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Given per-path risk scores and their factors, propose a re-ordering that surfaces the highest-risk areas first.',
      inputsProvided: ['path names', 'risk scores', 'contributing factor labels'],
      expects: 'An ordering of the same path set, most risky first.',
      rejectionRules: [
        'reject an ordering that omits or adds a path',
        'reject any re-ordering that would move a critical band below a non-critical one',
      ],
    },
    aiBehaviour: 'Reasoning may re-order paths of equal computed band to surface the most consequential first. It never changes a band or a score.',
    nonAiBehaviour: 'Bands and scores are computed from churn, layer weight, breaking status and business criticality, and sorted by score.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A path that cannot be scored is banded "high" with the reason recorded, never omitted.',
    handle: (input) => {
      const criticalityByModule = new Map(input.impacts.map((i) => [i.module, i.criticality]));
      const churnByPath = new Map(input.churn.map((c) => [c.path, c.added + c.removed]));
      const LAYER_WEIGHT: Record<string, number> = {
        data: 0.9, api: 0.85, domain: 0.8, infrastructure: 0.7, configuration: 0.6,
        ui: 0.5, build: 0.4, test: 0.2, documentation: 0.1, unknown: 0.5,
      };
      return input.facts.map((fact) => {
        const churn = churnByPath.get(fact.path) ?? fact.churn;
        const breaking = fact.symbolsRemoved.length > 0;
        const businessCritical = [...criticalityByModule.entries()].some(([m, c]) => fact.path.includes(m) && (c === 'critical' || c === 'high'));
        const factors: string[] = [];
        let score = (LAYER_WEIGHT[fact.layer] ?? 0.5) * 0.4;
        factors.push(`layer ${fact.layer}`);
        if (churn > 100) { score += 0.25; factors.push(`churn ${churn}`); }
        else if (churn > 30) { score += 0.1; factors.push(`churn ${churn}`); }
        if (breaking) { score += 0.25; factors.push('removes an exported symbol'); }
        if (businessCritical) { score += 0.2; factors.push('touches a business-critical module'); }
        const band: RiskAssessment['band'] =
          score >= 0.8 ? 'critical' : score >= 0.6 ? 'high' : score >= 0.35 ? 'medium' : 'low';
        return {
          subject: fact.path, band, score: Math.round(Math.min(1, score) * 100) / 100,
          factors, releaseRisk: band === 'critical' || (band === 'high' && (breaking || businessCritical)),
        };
      }).sort((a, b) => b.score - a.score);
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ risks: readonly RiskAssessment[] }, { releaseBlocking: number; band: string }>({
    id: 'risk.release-gate', domain: 'risk', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Summarise the overall risk band and whether any area blocks release.',
    inputs: ['RiskAssessment[]'], outputs: ['risk summary'],
    responsibilities: ['the overall band is the highest present, never an average that hides a critical'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure the overall band is reported critical, which is the safe direction.',
    handle: (input) => {
      const order = ['critical', 'high', 'medium', 'low'];
      const band = order.find((b) => input.risks.some((r) => r.band === b)) ?? 'low';
      return { releaseBlocking: input.risks.filter((r) => r.releaseRisk).length, band };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Coverage Intelligence ───────────────────────────────────────────────────

export const coverageIntelligenceAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[]; assets: readonly RepositoryAsset[] }, readonly CoverageAssessment[]>({
    id: 'coverage.assessment', domain: 'coverage', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Establish which changed paths are covered by an existing test and which are gaps.',
    inputs: ['ChangeFact[]', 'RepositoryAsset[]'], outputs: ['CoverageAssessment[]'],
    responsibilities: ['covered requires a named covering asset', 'a gap is stated, never omitted'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure every path is reported as an uncovered gap, which drives generation rather than a false covered.',
    handle: (input) => input.facts.map((fact) => {
      const coveredBy = input.assets
        .filter((a) => a.covers.some((c) => c === fact.path || fact.path.startsWith(c) || c.startsWith(fact.path)))
        .map((a) => a.id);
      return {
        path: fact.path,
        coveredBy,
        covered: coveredBy.length > 0,
        gap: coveredBy.length > 0 ? null : `no existing test covers ${fact.path}`,
      };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ coverage: readonly CoverageAssessment[] }, { assessed: number; covered: number; gaps: number }>({
    id: 'coverage.gap-summary', domain: 'coverage', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Summarise coverage so the planning stage knows how much automation must be generated.',
    inputs: ['CoverageAssessment[]'], outputs: ['coverage summary'],
    responsibilities: ['report gaps as a count the reviewer can check against the assessment list'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A summary that cannot be produced reports every path as a gap.',
    handle: (input) => ({
      assessed: input.coverage.length,
      covered: input.coverage.filter((c) => c.covered).length,
      gaps: input.coverage.filter((c) => !c.covered).length,
    }),
  }) as AgentDefinition<never, unknown>,
];
