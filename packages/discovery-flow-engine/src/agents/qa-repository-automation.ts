/**
 * QA Asset Generation, Repository Intelligence and Automation Intelligence.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 11-capability-model.md · 19-repository-ownership.md
 *   ADR          : ADR-0023
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-14.1 (tools via adapter SPI)
 *
 * EVERY CLICK AND EVERY INPUT — AND WHY THIS ENGINE CAN DO IT.
 * The brief requires a test case to cover navigation, every click and every input, each
 * with an expected result. A capability that starts from a written story cannot satisfy
 * that: the story does not enumerate the controls, so the best it can do is a generic
 * baseline. Inverse-flow discovery starts from the application itself, so the controls
 * and fields ARE the input. Steps here are generated one per discovered field and one
 * per discovered control — the enumeration is measured, not assumed.
 *
 * REPOSITORY SEARCH IS EXECUTION PLANE. THE SCORES ARE WHAT CROSS.
 * All eight search agents and the vector search declare `plane: 'EP'`. `RepositoryMatch`
 * carries an identifier, a kind, a score and the repository name — no path body, no
 * excerpt, no content. The customer's repository never leaves their tenancy, and the
 * type is what guarantees it rather than the agent's good behaviour.
 *
 * GENERATION EMITS THE KIND THAT WAS MISSING.
 * The audit of the first capability found its generator selecting an asset kind by
 * rotating through a list, so three missing page objects could produce a feature file, a
 * step definition and a page object. Here `ReuseDecision` carries `assetKind`, and the
 * generator emits that kind. The conformance suite asserts the kinds match.
 */
import { defineAgent, VectorIndex, type AgentDefinition, type VectorMatch } from '@dbiz/capability-framework';
import {
  type ApplicationFact, type AutomationAsset, type BusinessRule, type QaAsset,
  type RepositoryAssetKind, type RepositoryMatch, type ReuseDecision, type TestKind,
  type TestStep, type VirtualStory, fingerprint, norm,
} from '../model.js';

// ── QA Asset Generation ─────────────────────────────────────────────────────

export interface QaInput {
  readonly stories: readonly VirtualStory[];
  readonly facts: readonly ApplicationFact[];
  readonly rules: readonly BusinessRule[];
}

/** The facts a story was reconstructed from, plus the fields and controls they contain. */
function surfaceFor(story: VirtualStory, facts: readonly ApplicationFact[]): {
  entry: ApplicationFact | undefined;
  fields: readonly ApplicationFact[];
  controls: readonly ApplicationFact[];
} {
  const sources = new Set(story.sourceFactIds);
  const own = facts.filter((f) => sources.has(f.id) || (f.parentId !== null && sources.has(f.parentId)));
  return {
    entry: own.find((f) => f.kind === 'page' || f.kind === 'spa-view') ?? own[0],
    fields: own.filter((f) => f.kind === 'field'),
    controls: own.filter((f) => f.kind === 'control' || f.kind === 'menu'),
  };
}

/**
 * Build the step list: navigate, then every input, then every click, then assert, then cleanup.
 *
 * Every step carries an expected result. A step without one cannot be verified, and an
 * unverifiable step in a suite is worse than a missing one — it reports green having
 * checked nothing.
 */
function stepsFor(story: VirtualStory, facts: readonly ApplicationFact[], kind: TestKind): readonly TestStep[] {
  const surface = surfaceFor(story, facts);
  const steps: TestStep[] = [];
  const push = (s: Omit<TestStep, 'ordinal'>) => steps.push({ ...s, ordinal: steps.length + 1 });

  push({
    action: 'navigate', target: surface.entry?.path ?? '/', data: null,
    expectedResult: `${surface.entry?.label ?? 'the entry point'} loads and is interactive`,
  });

  // One input per discovered field. The field NAME is structure and crossed the
  // boundary; the value is synthesised here and was never the customer's.
  for (const field of surface.fields) {
    push({
      action: 'input', target: field.label, data: sampleFor(field, kind),
      expectedResult: kind === 'negative' || kind === 'boundary'
        ? `the application rejects the value and states why on "${field.label}"`
        : `the value is accepted and shown on "${field.label}"`,
    });
  }

  // One click per discovered control.
  for (const control of surface.controls) {
    push({
      action: 'click', target: control.label, data: null,
      expectedResult: `activating "${control.label}" produces its observed transition`,
    });
  }

  push({
    action: kind === 'api' ? 'call' : 'assert',
    target: story.acceptanceCriteria[0] ?? story.title, data: null,
    expectedResult: `the acceptance criterion holds: ${story.acceptanceCriteria[0] ?? story.title}`,
  });

  push({ action: 'cleanup', target: 'session and created data', data: null, expectedResult: 'the environment is returned to its pre-test state' });
  return steps;
}

/** Test data derived from the field's declared constraints, never from observed content. */
function sampleFor(field: ApplicationFact, kind: TestKind): string {
  const has = (n: string) => field.attributeNames.some((a) => a.toLowerCase() === n);
  if (kind === 'boundary') return has('maxlength') ? '{max-length value}' : '{boundary value}';
  if (kind === 'negative') return has('required') ? '{empty}' : '{invalid value}';
  if (kind === 'security') return '{injection probe}';
  return '{representative value}';
}

const TEST_KINDS: readonly { kind: TestKind; purpose: string; applies: (s: VirtualStory) => boolean }[] = [
  { kind: 'functional', purpose: 'Verify the story behaves as its acceptance criteria state.', applies: () => true },
  { kind: 'api', purpose: 'Verify the story at its service contract rather than through the interface.', applies: (s) => s.keywords.some((k) => /api|service|endpoint/.test(k)) || s.businessRuleIds.length > 0 },
  { kind: 'integration', purpose: 'Verify the story across the services it depends on.', applies: (s) => s.dependsOn.length > 0 },
  { kind: 'negative', purpose: 'Verify the application refuses invalid input and says why.', applies: (s) => s.businessRuleIds.length > 0 },
  { kind: 'boundary', purpose: 'Verify behaviour at the limits the application declares.', applies: (s) => s.businessRuleIds.length > 0 },
  { kind: 'security', purpose: 'Verify authorisation and input handling on a sensitive story.', applies: (s) => s.risk === 'high' || s.risk === 'critical' },
  { kind: 'accessibility', purpose: 'Verify the interface is operable without a pointing device.', applies: (s) => s.sourceFactIds.length > 0 },
  { kind: 'performance-awareness', purpose: 'Record the response profile so a regression is visible.', applies: (s) => s.complexity !== 'simple' },
  { kind: 'edge-case', purpose: 'Verify behaviour reasoning identified as unusual but reachable.', applies: (s) => s.risk === 'critical' },
];

const qaGenerationAgents: readonly AgentDefinition<never, unknown>[] = TEST_KINDS.map(({ kind, purpose, applies }) =>
  defineAgent<QaInput, readonly QaAsset[]>({
    id: `qa.${kind}`, domain: 'qa', stage: 'guardrail-review', plane: 'IP',
    purpose,
    inputs: ['VirtualStory[]', 'ApplicationFact[]'], outputs: ['QaAsset[]'],
    responsibilities: ['generate only where the kind applies', 'attach an expected result to every step', 'fingerprint for deduplication'],
    toolContracts: [],
    aiCapabilityClass: kind === 'edge-case' ? 'generation' : 'none',
    ...(kind === 'edge-case' ? {
      promptContract: {
        intent: 'Generate edge-case scenarios reachable in the discovered application but unlikely to be exercised.',
        inputsProvided: ['story title', 'acceptance criteria', 'field names', 'constraint names'],
        expects: 'an array of edge-case titles',
        rejectionRules: [
          'an edge case referencing a field not discovered on the story surface is discarded',
          'an edge case duplicating an existing asset fingerprint is discarded',
          'an edge case for a story not in the input is discarded',
        ],
      },
      aiBehaviour: 'Adds edge cases derived from the interaction of two constraints.',
      nonAiBehaviour: 'Emits the structural edge case for each critical-risk story. Fewer cases; each still fully specified.',
    } : {}),
    failureHandling: 'A kind that produces nothing is recorded as not-applicable with its reason, never as zero coverage.',
    handle: (input: QaInput) => input.stories.filter(applies).map((story) => {
      const steps = stepsFor(story, input.facts, kind);
      const title = `${kind}: ${story.title}`;
      return {
        id: `${story.id}-${kind}`,
        storyId: story.id, kind, title,
        objective: `Verify ${story.title} using the ${kind} technique.`,
        preconditions: [`the application is reachable`, `the ${story.risk}-risk path is available in the target environment`],
        environment: 'discovery target environment',
        steps,
        cleanup: ['restore session state', 'remove data created by this test'],
        testData: steps.filter((s) => s.data !== null).map((s) => `${s.target}: ${s.data}`),
        risk: story.risk, priority: story.priority,
        tags: ['discovered', kind, story.risk, story.priority],
        businessRuleIds: story.businessRuleIds,
        requirementTraceability: [story.id, ...story.sourceFactIds],
        gwt: {
          given: [`the application is at ${steps[0]?.target ?? '/'}`],
          when: steps.filter((s) => s.action === 'input' || s.action === 'click').map((s) => `the tester ${s.action}s ${s.target}`),
          then: steps.map((s) => s.expectedResult),
        },
        bddReady: true, automationReady: true,
        fingerprint: fingerprint(`${kind}:${norm(story.title)}:${steps.length}`),
      };
    }),
  }) as AgentDefinition<never, unknown>);

export const qaAgents: readonly AgentDefinition<never, unknown>[] = [
  ...qaGenerationAgents,

  defineAgent<{ assets: readonly QaAsset[] }, readonly QaAsset[]>({
    id: 'qa.deduplication', domain: 'qa', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Remove assets that duplicate an existing fingerprint.',
    inputs: ['QaAsset[]'], outputs: ['QaAsset[]'],
    responsibilities: ['keep the first occurrence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missed duplicate costs execution time; a false duplicate loses coverage, so matching is exact.',
    handle: (input) => {
      const seen = new Set<string>();
      return input.assets.filter((a) => (seen.has(a.fingerprint) ? false : (seen.add(a.fingerprint), true)));
    },
  }),

  defineAgent<{ assets: readonly QaAsset[] }, readonly QaAsset[]>({
    id: 'qa.completeness', domain: 'qa', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Refuse any asset missing a mandatory field or an expected result.',
    inputs: ['QaAsset[]'], outputs: ['QaAsset[]'],
    responsibilities: ['refuse, never repair'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An incomplete asset is refused with the field named. Publishing a partial test case is how a suite reports green having verified nothing.',
    handle: (input) => {
      for (const a of input.assets) {
        const missing: string[] = [];
        if (!a.objective.trim()) missing.push('objective');
        if (a.preconditions.length === 0) missing.push('preconditions');
        if (!a.environment.trim()) missing.push('environment');
        if (a.steps.length === 0) missing.push('steps');
        if (a.cleanup.length === 0) missing.push('cleanup');
        if (a.tags.length === 0) missing.push('tags');
        if (a.requirementTraceability.length === 0) missing.push('requirementTraceability');
        if (a.gwt.then.length === 0) missing.push('gwt.then');
        const stepless = a.steps.filter((s) => !s.expectedResult.trim());
        if (stepless.length > 0) missing.push(`expectedResult on step(s) ${stepless.map((s) => s.ordinal).join(', ')}`);
        if (missing.length > 0) throw new Error(`QA asset ${a.id} is incomplete: ${missing.join(', ')}`);
      }
      return input.assets;
    },
  }),

  defineAgent<{ assets: readonly QaAsset[]; stories: readonly VirtualStory[] }, { readonly covered: number; readonly uncovered: readonly string[] }>({
    id: 'qa.traceability', domain: 'qa', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Establish which stories are covered by at least one QA asset.',
    inputs: ['QaAsset[]', 'VirtualStory[]'], outputs: ['coverage'],
    responsibilities: ['name every uncovered story'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Unmeasurable coverage is reported as NOT MEASURED, never as zero or as complete.',
    handle: (input) => {
      const covered = new Set(input.assets.map((a) => a.storyId));
      return {
        covered: covered.size,
        uncovered: input.stories.filter((s) => !covered.has(s.id)).map((s) => s.id),
      };
    },
  }),

  defineAgent<{ assets: readonly QaAsset[] }, readonly string[]>({
    id: 'qa.test-data', domain: 'qa', stage: 'guardrail-review', plane: 'IP',
    purpose: 'Consolidate the test data each asset requires, as shapes rather than values.',
    inputs: ['QaAsset[]'], outputs: ['test data[]'],
    responsibilities: ['emit shapes only, never customer values'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Missing test data leaves the asset automation-ready but unrunnable, which the execution planner reports rather than silently skips.',
    handle: (input) => [...new Set(input.assets.flatMap((a) => a.testData))].sort(),
  }),
];

// ── Repository Intelligence ─────────────────────────────────────────────────

export interface RepositorySearchInput {
  readonly query: string;
  /** The customer's repository index, built and held in the Execution Plane. */
  readonly index: VectorIndex;
  readonly assets: readonly { readonly id: string; readonly kind: RepositoryAssetKind; readonly text: string; readonly repository: string }[];
}

const REPOSITORY_KINDS: readonly RepositoryAssetKind[] =
  ['test-case', 'automation', 'feature-file', 'page-object', 'locator', 'utility', 'hook', 'step-definition'];

const repositorySearchAgents: readonly AgentDefinition<never, unknown>[] = REPOSITORY_KINDS.map((kind) =>
  defineAgent<RepositorySearchInput, readonly RepositoryMatch[]>({
    id: `repository.search.${kind}`, domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: `Search the customer repository for existing ${kind} assets matching the query.`,
    inputs: ['query', 'repository assets'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['score by token overlap', 'return identifiers and scores, never content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A search that fails returns no match, so the reuse decision becomes CREATE — wasteful, never destructive.',
    handle: (input: RepositorySearchInput) => {
      const queryTokens = new Set(norm(input.query).split(' ').filter(Boolean));
      return input.assets.filter((a) => a.kind === kind).map((a) => {
        const assetTokens = new Set(norm(a.text).split(' ').filter(Boolean));
        const shared = [...queryTokens].filter((t) => assetTokens.has(t)).length;
        const union = new Set([...queryTokens, ...assetTokens]).size || 1;
        return {
          assetId: a.id, assetKind: a.kind, similarity: shared / union,
          repository: a.repository, matchedBy: 'lexical' as const,
        };
      }).filter((m) => m.similarity > 0.15).sort((a, b) => b.similarity - a.similarity);
    },
  }) as AgentDefinition<never, unknown>);

export const repositoryAgents: readonly AgentDefinition<never, unknown>[] = [
  ...repositorySearchAgents,

  defineAgent<RepositorySearchInput, readonly RepositoryMatch[]>({
    id: 'repository.vector-search', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Find repository assets by vector nearest-neighbour rather than by shared tokens.',
    inputs: ['query', 'VectorIndex'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['apply a similarity floor', 'return identifiers and scores only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unavailable index returns no vector match; the lexical searches still run, so recall degrades rather than disappearing.',
    handle: (input) => {
      const byId = new Map(input.assets.map((a) => [a.id, a]));
      return input.index.search(input.query, 20, 0.25).map((m: VectorMatch) => ({
        assetId: m.id,
        assetKind: (byId.get(m.id)?.kind ?? 'automation') as RepositoryAssetKind,
        similarity: m.similarity,
        repository: byId.get(m.id)?.repository ?? m.labels['repository'] ?? 'unknown',
        matchedBy: 'vector' as const,
      }));
    },
  }),

  defineAgent<{ matches: readonly RepositoryMatch[] }, readonly RepositoryMatch[]>({
    // INTELLIGENCE PLANE (audit V-35). Declared `plane: 'EP'` while carrying a reasoning class and
    // a prompt contract. The searches above stay in the Execution Plane — they are deterministic
    // and return scores, never source — and the semantic judgement about what those scores MEAN
    // moves here, alongside every other ranking decision.
    id: 'repository.semantic-search', domain: 'repository', stage: 'discovery', plane: 'IP',
    purpose: 'Re-rank lexical and vector matches where a ranking proposal is available.',
    inputs: ['RepositoryMatch[]'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['reorder only', 'never add a match'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Re-rank candidate repository assets by how closely each addresses the query.',
      inputsProvided: ['asset identifiers', 'asset kinds', 'similarity scores', 'the query text'],
      expects: 'the asset identifiers, reordered',
      rejectionRules: [
        'an identifier not returned by search is discarded — a match nothing observed is not a match',
        'an omitted identifier keeps its deterministic position rather than being dropped',
        'a non-array proposal leaves the ranking untouched',
      ],
    },
    aiBehaviour: 'Reorders candidates by semantic closeness. Precision rises; recall is unchanged.',
    nonAiBehaviour: 'The lexical and vector ordering stands. This is the floor the ranking can only reorder, never reduce.',
    failureHandling: 'Without a proposal the deterministic ordering stands, which is why the engine still works with reasoning unavailable (INV-7).',
    handle: (input, ctx) => {
      const asVector = input.matches.map((m) => ({ id: m.assetId, kind: m.assetKind, similarity: m.similarity, labels: {} }));
      const reordered = VectorIndex.applyRanking(asVector, ctx.proposal);
      const byId = new Map(input.matches.map((m) => [m.assetId, m]));
      return reordered.map((m) => byId.get(m.id)).filter((m): m is RepositoryMatch => m !== undefined);
    },
  }),

  defineAgent<{ matches: readonly RepositoryMatch[] }, readonly RepositoryMatch[]>({
    id: 'repository.duplicate-detection', domain: 'repository', stage: 'context', plane: 'IP',
    purpose: 'Identify matches close enough to be the same asset.',
    inputs: ['RepositoryMatch[]'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['apply the duplicate threshold'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missed duplicate creates a redundant asset; a false duplicate loses a test. The threshold is deliberately conservative.',
    handle: (input) => input.matches.filter((m) => m.similarity >= 0.85),
  }),

  defineAgent<{ asset: QaAsset; wanted: RepositoryAssetKind; matches: readonly RepositoryMatch[] }, ReuseDecision>({
    id: 'repository.reuse-decision', domain: 'repository', stage: 'context', plane: 'IP',
    purpose: 'Decide whether to reuse, merge or create — and record which kind was missing.',
    inputs: ['QaAsset', 'RepositoryMatch[]'], outputs: ['ReuseDecision'],
    responsibilities: ['reuse above the duplicate threshold', 'merge in the overlap band', 'carry the asset kind on every decision'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure the decision is CREATE, which is wasteful but never destroys an existing asset.',
    handle: (input) => {
      // `assetKind` is on every branch. Without it the generator cannot know WHICH kind
      // to produce, which is how a rotating generator emitted a feature file where a
      // page object was missing.
      const candidates = input.matches.filter((m) => m.assetKind === input.wanted);
      const best = [...candidates].sort((a, b) => b.similarity - a.similarity)[0];
      if (!best) return { kind: 'create', assetKind: input.wanted, reason: `no existing ${input.wanted} resembled ${input.asset.id}` };
      if (best.similarity >= 0.85) return { kind: 'reuse', assetId: best.assetId, similarity: best.similarity, assetKind: input.wanted };
      if (best.similarity >= 0.6) {
        return {
          kind: 'merge', assetId: best.assetId, similarity: best.similarity, assetKind: input.wanted,
          delta: `extend ${best.assetId} to cover ${input.asset.kind} for ${input.asset.storyId}`,
        };
      }
      return { kind: 'create', assetKind: input.wanted, reason: `closest ${input.wanted} scored ${best.similarity.toFixed(2)}, below the merge threshold` };
    },
  }),
];

// ── Automation Intelligence ─────────────────────────────────────────────────

const AUTOMATION_KINDS: readonly RepositoryAssetKind[] =
  ['automation', 'feature-file', 'step-definition', 'page-object', 'locator', 'utility'];

const automationSearchAgents: readonly AgentDefinition<never, unknown>[] = AUTOMATION_KINDS.map((kind) =>
  defineAgent<RepositorySearchInput, readonly RepositoryMatch[]>({
    id: `automation.search.${kind}`, domain: 'automation', stage: 'execution-planning', plane: 'EP',
    purpose: `Search existing automation for a reusable ${kind} before anything is generated.`,
    inputs: ['query', 'repository assets'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['search before generation', 'return identifiers and scores only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A failed search yields no match and generation proceeds, duplicating an asset rather than losing one.',
    handle: (input: RepositorySearchInput) => {
      const queryTokens = new Set(norm(input.query).split(' ').filter(Boolean));
      return input.assets.filter((a) => a.kind === kind).map((a) => {
        const assetTokens = new Set(norm(a.text).split(' ').filter(Boolean));
        const shared = [...queryTokens].filter((t) => assetTokens.has(t)).length;
        return {
          assetId: a.id, assetKind: a.kind,
          similarity: shared / (new Set([...queryTokens, ...assetTokens]).size || 1),
          repository: a.repository, matchedBy: 'lexical' as const,
        };
      }).filter((m) => m.similarity > 0.15);
    },
  }) as AgentDefinition<never, unknown>);

export const automationAgents: readonly AgentDefinition<never, unknown>[] = [
  ...automationSearchAgents,

  defineAgent<{ decisions: readonly ReuseDecision[] }, { readonly generate: readonly RepositoryAssetKind[]; readonly reuse: number; readonly gaps: readonly string[] }>({
    id: 'automation.gap-detection', domain: 'automation', stage: 'execution-planning', plane: 'IP',
    purpose: 'Determine exactly which asset kinds are missing and must be generated.',
    inputs: ['ReuseDecision[]'], outputs: ['gap analysis'],
    responsibilities: ['name the missing kind, not merely the count'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure nothing is generated and the gap is reported; generating blindly duplicates assets.',
    handle: (input) => ({
      generate: input.decisions.filter((d) => d.kind === 'create').map((d) => d.assetKind),
      reuse: input.decisions.filter((d) => d.kind !== 'create').length,
      gaps: input.decisions.filter((d): d is Extract<ReuseDecision, { kind: 'create' }> => d.kind === 'create').map((d) => d.reason),
    }),
  }),

  defineAgent<{ asset: QaAsset; decisions: readonly ReuseDecision[] }, readonly AutomationAsset[]>({
    id: 'automation.generation', domain: 'automation', stage: 'execution-planning', plane: 'IP',
    purpose: 'Generate only the assets a search found missing, each of the kind that was missing.',
    inputs: ['QaAsset', 'ReuseDecision[]'], outputs: ['AutomationAsset[]'],
    responsibilities: ['generate only for CREATE decisions', 'emit the decided kind', 'carry traceability'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate the body of a missing automation asset of a stated kind.',
      inputsProvided: ['QA asset identifier', 'step actions and targets', 'tags', 'the asset kind to produce'],
      expects: 'an asset body for the requested kind',
      rejectionRules: [
        'an asset of a kind that was not decided CREATE is discarded — reuse means reuse',
        'an asset for a QA asset identifier not under generation is discarded',
        'an asset carrying no traceability to its QA asset is discarded',
      ],
    },
    aiBehaviour: 'Produces asset bodies carrying the concrete selectors and steps the QA asset describes.',
    nonAiBehaviour: 'Produces conformant skeletons with the module, tags and traceability bound, and no step bodies.',
    failureHandling: 'Generation failure is reported per asset; a partially generated set is never published.',
    handle: (input) => input.decisions
      .filter((d): d is Extract<ReuseDecision, { kind: 'create' }> => d.kind === 'create')
      .map((decision) => ({
        // The kind is the DECIDED kind. Not a rotation, not a default.
        id: `${input.asset.id}-${decision.assetKind}`,
        kind: decision.assetKind,
        path: `automation/${decision.assetKind}/${input.asset.id}.${decision.assetKind === 'feature-file' ? 'feature' : 'ts'}`,
        module: input.asset.tags[0] ?? 'general',
        qaAssetIds: [input.asset.id],
        tags: input.asset.tags,
        traceability: input.asset.requirementTraceability,
      })),
  }),
];
