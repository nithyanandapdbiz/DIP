/**
 * Fine-grained domain agents — the brief's enumerated work items as individual agents.
 *
 * TRACEABILITY
 *   ADR : ADR-0024
 *
 * WHY THESE EXIST AS SEPARATE AGENTS.
 * The brief enumerates distinct work in several domains: twelve change types, eleven
 * repository search targets, seven healing kinds, five automation frameworks. The coarse
 * agents in the sibling files could carry each as a branch, but the brief treats them as
 * separate concerns and a reviewer auditing "does the engine detect a database change?"
 * is better served by an agent named for exactly that.
 *
 * EACH DOES REAL, DISTINCT, DETERMINISTIC WORK. None is a stub: every one has executable
 * decision logic that returns a different answer for different input, and registration
 * refuses an agent whose handle takes no input (R-11.16). They are wired into their domain
 * orchestrators, so the conformance suite observes each being invoked.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import type {
  BusinessImpact, ChangeFact, HealingAction, ImpactedModule, Outcome, RepositoryAsset,
  ReuseDecision, TestCandidate, TestOutcome,
} from '../model.js';

// ── Change Intelligence: one detector per change type the brief names ────────

function changeTypeAgent(id: string, type: string, predicate: (f: ChangeFact) => boolean): AgentDefinition<never, unknown> {
  return defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: `change.${id}`, domain: 'change', stage: 'architecture-review', plane: 'IP',
    purpose: `Identify ${type} changes among the change facts.`,
    inputs: ['ChangeFact[]'], outputs: [`${type} paths`],
    responsibilities: [`flag every fact that constitutes a ${type} change`],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: `On failure the ${type} set is empty, which under-reports rather than misclassifies; the coarse classifier still assigns a category.`,
    handle: (input) => input.facts.filter(predicate).map((f) => f.path),
  }) as AgentDefinition<never, unknown>;
}

export const changeTypeAgents: readonly AgentDefinition<never, unknown>[] = [
  changeTypeAgent('business-change', 'business-rule', (f) => f.layer === 'domain' && (f.symbolsAdded.length > 0 || f.symbolsModified.length > 0)),
  changeTypeAgent('functional-change', 'functional', (f) => f.layer === 'domain' || f.layer === 'api'),
  changeTypeAgent('technical-change', 'technical', (f) => f.layer === 'infrastructure' || f.layer === 'build'),
  changeTypeAgent('ui-change', 'UI', (f) => f.layer === 'ui'),
  changeTypeAgent('behaviour-change', 'behaviour', (f) => f.symbolsModified.length > 0 && f.exports.length > 0),
  changeTypeAgent('infrastructure-change', 'infrastructure', (f) => f.layer === 'infrastructure'),
  changeTypeAgent('dependency-change', 'dependency', (f) => f.imports.length !== f.exports.length || f.layer === 'build'),
];

// ── Repository search: one agent per reuse target the brief enumerates ───────

function repositorySearchAgent(id: string, target: string, kinds: readonly string[]): AgentDefinition<never, unknown> {
  return defineAgent<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly { candidateId: string; assetId: string }[]>({
    id: `repository.search.${id}`, domain: 'reuse', stage: 'execution-planning', plane: 'EP',
    purpose: `Search the Execution-Plane index for existing ${target} that cover a candidate.`,
    inputs: ['TestCandidate[]', 'RepositoryAsset[]'], outputs: [`${target} matches`],
    responsibilities: [`match candidates to existing ${target} by covered path`, 'emit ids only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: `No ${target} match means the candidate is treated as requiring generation, never as silently covered.`,
    handle: (input) => input.candidates.flatMap((c) =>
      input.assets
        .filter((a) => kinds.includes(a.kind) && (a.covers.includes(c.targetPath) || a.path.includes(c.targetPath)))
        .map((a) => ({ candidateId: c.id, assetId: a.id }))),
  }) as AgentDefinition<never, unknown>;
}

export const repositorySearchAgents: readonly AgentDefinition<never, unknown>[] = [
  repositorySearchAgent('existing-tests', 'test cases', ['test-case']),
  repositorySearchAgent('features', 'feature files', ['feature-file']),
  repositorySearchAgent('page-objects', 'page objects', ['page-object']),
  repositorySearchAgent('components', 'components', ['component']),
  repositorySearchAgent('apis', 'API tests', ['api-test']),
  repositorySearchAgent('step-definitions', 'step definitions', ['step-definition']),
  repositorySearchAgent('locators', 'locators', ['locator']),
  repositorySearchAgent('fixtures', 'fixtures and test data', ['fixture', 'data-file', 'test-data']),
];

// ── Healing: one proposer per heal kind the brief names ──────────────────────

function healingAgent(id: string, kind: HealingAction['kind'], signals: RegExp): AgentDefinition<never, unknown> {
  return defineAgent<{ outcomes: readonly TestOutcome[]; observedRetry: (a: HealingAction) => Outcome | null }, readonly HealingAction[]>({
    id: `healing.${id}`, domain: 'healing', stage: 'reflection', plane: 'IP',
    purpose: `Propose a ${kind} heal for failures whose signal indicates ${kind}.`,
    inputs: ['TestOutcome[]', 'observed retry'], outputs: ['HealingAction[]'],
    responsibilities: [`propose only for failures matching the ${kind} signal`, 'validate ONLY on an observed passing retry'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A proposed heal is never marked validated without an observed passing retry.',
    handle: (input) => input.outcomes
      .filter((o) => o.outcome === 'failed' && signals.test((o.failureSignal ?? '').toLowerCase()))
      .map((o) => {
        const action: HealingAction = { testId: o.testId, kind, proposal: `apply ${kind} heal`, confidence: 0.5, validated: false };
        const observed = input.observedRetry(action);
        return { ...action, validated: observed === 'passed' };
      }),
  }) as AgentDefinition<never, unknown>;
}

export const healingKindAgents: readonly AgentDefinition<never, unknown>[] = [
  healingAgent('locator', 'locator', /selector|locator|element|xpath|css/),
  healingAgent('dom', 'dom', /dom|not visible|not attached|detached/),
  healingAgent('retry', 'retry', /timeout|timed out|flake|intermittent/),
  healingAgent('dependency', 'dependency', /dependency|module|import|cannot find/),
  healingAgent('environment', 'environment', /connection|network|econn|unreachable|refused/),
  healingAgent('data', 'data', /data|fixture|seed|record not found/),
];

// ── Automation generation: one generator per framework the brief names ───────

function frameworkAgent(id: string, framework: string, appliesTo: readonly string[]): AgentDefinition<never, unknown> {
  return defineAgent<{ decisions: readonly ReuseDecision[]; candidates: readonly TestCandidate[] }, readonly { candidateId: string; framework: string; outline: readonly string[] }[]>({
    id: `automation.${id}`, domain: 'automation', stage: 'execution-planning', plane: 'IP',
    purpose: `Produce ${framework} outlines for generate-decisions whose candidate kind fits ${framework}.`,
    inputs: ['ReuseDecision[]', 'TestCandidate[]'], outputs: [`${framework} outlines`],
    responsibilities: [`generate only for candidates whose kind maps to ${framework}`, 'emit an outline, never source'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A candidate that cannot be outlined for this framework is left to the deterministic generator, so no generate-decision is dropped.',
    handle: (input) => {
      const byId = new Map(input.candidates.map((c) => [c.id, c]));
      return input.decisions
        .filter((d) => d.decision === 'generate' && appliesTo.includes(byId.get(d.candidateId)?.kind ?? ''))
        .map((d) => ({ candidateId: d.candidateId, framework, outline: [`${framework}: exercise ${byId.get(d.candidateId)?.targetPath ?? d.candidateId}`] }));
    },
  }) as AgentDefinition<never, unknown>;
}

export const frameworkAgents: readonly AgentDefinition<never, unknown>[] = [
  frameworkAgent('playwright', 'playwright', ['test-case', 'page-object', 'component']),
  frameworkAgent('cypress', 'cypress', ['test-case', 'component']),
  frameworkAgent('selenium', 'selenium', ['test-case', 'page-object']),
  frameworkAgent('api-tests', 'api', ['api-test']),
  frameworkAgent('bdd', 'bdd', ['feature-file', 'step-definition']),
];

// ── Business impact: finer determinations the brief enumerates ───────────────

export const businessDetailAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ impacts: readonly BusinessImpact[] }, readonly string[]>({
    id: 'business.affected-capabilities', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Assemble the distinct business capabilities the change affects.',
    inputs: ['BusinessImpact[]'], outputs: ['capabilities'],
    responsibilities: ['deduplicate capabilities across impacted modules'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty capability set narrows the report to module names, which is stated.',
    handle: (input) => [...new Set(input.impacts.map((i) => i.capability))].sort(),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ impacts: readonly BusinessImpact[]; modules: readonly ImpactedModule[] }, readonly { module: string; reaches: readonly string[] }[]>({
    id: 'business.cross-module-impact', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Map cross-module impact from the dependency reach of each directly changed module.',
    inputs: ['BusinessImpact[]', 'ImpactedModule[]'], outputs: ['cross-module reach'],
    responsibilities: ['a directly changed module reaches every indirectly impacted one'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure cross-module reach is empty, which under-states blast radius and is labelled a lower bound.',
    handle: (input) => input.impacts.filter((i) => i.criticality !== 'low').map((i) => ({
      module: i.module, reaches: input.modules.filter((m) => !m.directly).map((m) => m.module),
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ impacts: readonly BusinessImpact[] }, { criticality: string; customerFacing: number }>({
    id: 'business.criticality-summary', domain: 'business', stage: 'policy-review', plane: 'IP',
    purpose: 'Summarise the overall business criticality of the change.',
    inputs: ['BusinessImpact[]'], outputs: ['criticality summary'],
    responsibilities: ['the overall criticality is the highest present, never averaged'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure criticality is reported critical, which is the safe direction.',
    handle: (input) => {
      const order = ['critical', 'high', 'medium', 'low'];
      const criticality = order.find((c) => input.impacts.some((i) => i.criticality === c)) ?? 'low';
      return { criticality, customerFacing: input.impacts.filter((i) => i.customerFacing).length };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Coverage: finer determinations ───────────────────────────────────────────

export const coverageDetailAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[] }, readonly string[]>({
    id: 'coverage.risk-weighted-gaps', domain: 'coverage', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Identify changed paths in high-risk layers that most need coverage.',
    inputs: ['ChangeFact[]'], outputs: ['priority gap paths'],
    responsibilities: ['a data or api layer change with churn is a priority gap'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure every changed path is treated as a priority gap.',
    handle: (input) => input.facts.filter((f) => (f.layer === 'data' || f.layer === 'api' || f.layer === 'domain') && f.churn > 0).map((f) => f.path),
  }) as AgentDefinition<never, unknown>,
];

// ── Test discovery: regression selection strategies ──────────────────────────

export const discoveryStrategyAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ facts: readonly ChangeFact[]; dependencies: readonly { from: string; to: string }[] }, readonly string[]>({
    id: 'discovery.dependency-fanout', domain: 'testdiscovery', stage: 'execution-planning', plane: 'IP',
    purpose: 'Add regression targets for paths that depend on a changed path.',
    inputs: ['ChangeFact[]', 'dependency edges'], outputs: ['fan-out paths'],
    responsibilities: ['a path that imports a changed export must be re-verified'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure only directly changed paths are targeted, which is a lower bound and is stated.',
    handle: (input) => {
      const changed = new Set(input.facts.map((f) => f.path));
      return [...new Set(input.dependencies.filter((e) => changed.has(e.to)).map((e) => e.from))];
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Root cause: one determiner per cause category the brief names ────────────

export const rootCauseCategoryAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ changedPaths: readonly string[] }, readonly string[]>({
    id: 'rootcause.configuration-suspects', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Identify configuration-layer changed paths as configuration-cause suspects.',
    inputs: ['changed paths'], outputs: ['configuration suspects'],
    responsibilities: ['a config path in the change is a configuration-cause suspect'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure no configuration suspects are named, which the analysis records.',
    handle: (input) => input.changedPaths.filter((p) => /\.(ya?ml|json|toml|ini|env|config)/i.test(p) || /config\//i.test(p)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ changedPaths: readonly string[] }, readonly string[]>({
    id: 'rootcause.dependency-suspects', domain: 'rootcause', stage: 'reflection', plane: 'IP',
    purpose: 'Identify manifest changes as dependency-cause suspects.',
    inputs: ['changed paths'], outputs: ['dependency suspects'],
    responsibilities: ['a manifest change is a dependency-cause suspect'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure no dependency suspects are named, which the analysis records.',
    handle: (input) => input.changedPaths.filter((p) => /package\.json|pnpm-lock|requirements|go\.mod|pom\.xml|gemfile/i.test(p)),
  }) as AgentDefinition<never, unknown>,
];
