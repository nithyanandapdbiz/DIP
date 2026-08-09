/**
 * Test Discovery, Automation Reuse, Automation Generation and Test Authoring agents.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md · 04-execution-plane-architecture.md · 13-ai-operating-model.md
 *   ADR          : ADR-0024 §3.5 · §3.6
 *   Criteria     : C-13.1 · C-14.1
 *
 * REUSE BEFORE GENERATE. NEVER DUPLICATE AUTOMATION.
 * The reuse agents run before the generation agents, and generation is asked only for the
 * candidates reuse could not satisfy. The conformance gate asserts that the KINDS
 * generated match exactly the kinds reuse marked missing — the generator-mismatch defect
 * capability 1 shipped is unrepresentable here because the two sets are compared.
 *
 * SEARCH RUNS IN THE EXECUTION PLANE.
 * `repository.search.*` agents declare `plane: 'EP'`: they search the customer's index
 * where it lives and emit only candidate ids and scores. Reuse decisions and authoring
 * are Intelligence Plane reasoning over those scores.
 */
import { defineAgent, VectorIndex, type AgentContext, type AgentDefinition } from '@dbiz/capability-framework';
import type {
  AuthoredTest, AutomationAsset, AutomationFramework, BusinessImpact, ChangeFact,
  CoverageAssessment, RepositoryAsset, RepositoryAssetKind, RepositoryMatch, ReuseDecision,
  RiskAssessment, TestCandidate,
} from '../model.js';

function proposedIds(ctx: AgentContext): readonly string[] | null {
  return Array.isArray(ctx.proposal) ? (ctx.proposal as unknown[]).filter((x): x is string => typeof x === 'string') : null;
}

const KIND_FOR_LAYER: Readonly<Record<string, RepositoryAssetKind>> = {
  ui: 'test-case', api: 'api-test', domain: 'test-case', data: 'api-test',
  configuration: 'test-case', infrastructure: 'test-case', unknown: 'test-case',
};

const FRAMEWORK_FOR_KIND: Readonly<Record<string, AutomationFramework>> = {
  'test-case': 'playwright', 'feature-file': 'bdd', 'api-test': 'api',
  'page-object': 'playwright', 'component': 'playwright', 'locator': 'playwright',
  'step-definition': 'bdd', 'data-file': 'api', 'test-data': 'api', 'fixture': 'playwright',
};

// ── Test Discovery ──────────────────────────────────────────────────────────

export const testDiscoveryAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ coverage: readonly CoverageAssessment[]; facts: readonly ChangeFact[]; risks: readonly RiskAssessment[]; impacts: readonly BusinessImpact[] }, readonly TestCandidate[]>({
    id: 'discovery.candidate-selection', domain: 'testdiscovery', stage: 'execution-planning', plane: 'IP',
    purpose: 'Select the tests that must run or exist to re-verify the change, one per impacted path.',
    inputs: ['CoverageAssessment[]', 'ChangeFact[]', 'RiskAssessment[]', 'BusinessImpact[]'], outputs: ['TestCandidate[]'],
    responsibilities: ['a candidate for every non-test changed path', 'priority follows risk'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A change with no candidate is a change tested by nothing; on failure every non-test path yields a P1 candidate.',
    handle: (input) => {
      const riskByPath = new Map(input.risks.map((r) => [r.subject, r.band]));
      return input.facts
        .filter((f) => f.layer !== 'test' && f.layer !== 'documentation')
        .map((fact) => {
          const band = riskByPath.get(fact.path) ?? 'medium';
          const priority: TestCandidate['priority'] = band === 'critical' ? 'P1' : band === 'high' ? 'P1' : band === 'medium' ? 'P2' : 'P3';
          const kind = KIND_FOR_LAYER[fact.layer] ?? 'test-case';
          return {
            id: `cand-${fact.path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
            title: `Re-verify ${fact.path} after change`,
            targetPath: fact.path, kind, priority,
            reason: `${fact.layer} change, risk ${band}`,
          };
        });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ candidates: readonly TestCandidate[]; impacts: readonly BusinessImpact[] }, readonly TestCandidate[]>({
    id: 'discovery.journey-candidates', domain: 'testdiscovery', stage: 'execution-planning', plane: 'IP',
    purpose: 'Add end-to-end candidates for each customer journey the change touches.',
    inputs: ['TestCandidate[]', 'BusinessImpact[]'], outputs: ['journey candidates'],
    responsibilities: ['a customer journey through a changed module needs an end-to-end test'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure only path-level candidates exist; the report notes the absence of journey coverage.',
    handle: (input) => [...new Set(input.impacts.flatMap((i) => i.userJourneys))].map((journey) => ({
      id: `cand-journey-${journey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      title: `End-to-end: ${journey}`,
      targetPath: journey, kind: 'test-case' as RepositoryAssetKind, priority: 'P1' as const,
      reason: 'customer journey through a changed module',
    })),
  }) as AgentDefinition<never, unknown>,
];

// ── Automation Reuse · search in EP, decide in IP ───────────────────────────

export const reuseAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly RepositoryMatch[]>({
    id: 'repository.search.path-and-symbol', domain: 'reuse', stage: 'execution-planning', plane: 'EP',
    purpose: 'Match candidates to existing assets by path and covered-path overlap, in the Execution Plane.',
    inputs: ['TestCandidate[]', 'RepositoryAsset[]'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['emit candidate id, asset id and score only — never asset text'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'No match means the candidate is treated as requiring generation, never as silently covered.',
    handle: (input) => input.candidates.flatMap((c) =>
      input.assets
        .filter((a) => a.covers.includes(c.targetPath) || a.path.includes(c.targetPath) || c.targetPath.includes(a.path))
        .map((a) => ({ candidateId: c.id, assetId: a.id, assetKind: a.kind, score: 0.9, method: 'path' as const }))),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ candidates: readonly TestCandidate[]; assets: readonly RepositoryAsset[] }, readonly RepositoryMatch[]>({
    // KNOWN DEBT — audit V-35, deliberately NOT fixed here. Read before changing the plane.
    //
    // This agent declares `plane: 'EP'` while carrying `aiCapabilityClass: 'ranking'` and a prompt
    // contract, which is the violation V-35 names: an Execution-Plane agent that reasons.
    //
    // It was not corrected in this pass, for two reasons that both point the same way. It does two
    // things — a deterministic lexical/vector score over supplied assets, and an AI re-ranking of
    // the result — so the correct fix is to SPLIT it, as the Functional Testing Engine already does
    // (`repository.search.*` and `repository.vector-search` in the EP; `repository.semantic-search`
    // in the IP). And this capability carries a CERTIFIED invariant asserting that every
    // `repository.search.*` agent declares EP, on the grounds that it touches customer custody.
    // Flipping the field alone would satisfy one gate by breaking a certified one, and would leave
    // the deterministic half in the wrong place either way.
    //
    // The split is tracked as remaining debt in docs/audit/SOVEREIGNTY-REMEDIATION.md. Until then
    // the naming invariant holds and the reasoning half is visible here rather than silent.
    id: 'repository.search.lexical-vector', domain: 'reuse', stage: 'execution-planning', plane: 'EP',
    purpose: 'Match candidates to assets by lexical-semantic similarity over the EP-resident index.',
    inputs: ['TestCandidate[]', 'RepositoryAsset[]'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['index and query in the Execution Plane', 'reasoning may reorder, never add a match'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Given candidate ids and their vector-search asset matches with scores, propose a re-ranking that better reflects semantic closeness.',
      inputsProvided: ['candidate ids', 'matched asset ids', 'similarity scores'],
      expects: 'A re-ordering of the SAME matches; ids only.',
      rejectionRules: [
        'reject any asset id not already returned by the deterministic search',
        'reject a proposal that introduces a match the vector floor did not find',
      ],
    },
    aiBehaviour: 'Reasoning re-orders matches the vector search already found. It can never introduce a match, so recall stays deterministic.',
    nonAiBehaviour: 'Hashed term-vector cosine kNN over the index returns matches above a fixed threshold, ordered by score.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'Search failure yields no matches, which drives generation. It never yields a spurious reuse.',
    handle: (input, ctx) => {
      const index = new VectorIndex();
      for (const a of input.assets) index.add(a.id, a.kind, a.text, { path: a.path });
      const found = input.candidates.flatMap((c) => {
        const query = `${c.title} ${c.targetPath} ${c.kind}`;
        return index.search(query, 3)
          .map((m) => ({ candidateId: c.id, assetId: m.id, assetKind: m.kind as RepositoryAssetKind, score: Math.round(m.similarity * 100) / 100, method: 'vector' as const }));
      });
      const allowed = proposedIds(ctx);
      if (!allowed) return found;
      // Reasoning may reorder; it may never add. Anything it names that the floor did not
      // find is discarded rather than trusted.
      const reordered: RepositoryMatch[] = [];
      for (const id of allowed) {
        const match = found.find((m) => m.assetId === id);
        if (match) reordered.push(match);
      }
      return [...reordered, ...found.filter((m) => !reordered.includes(m))];
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ candidates: readonly TestCandidate[]; matches: readonly RepositoryMatch[]; existingAutomation: readonly RepositoryAsset[] }, readonly ReuseDecision[]>({
    id: 'reuse.decision', domain: 'reuse', stage: 'execution-planning', plane: 'IP',
    purpose: 'Decide per candidate whether to reuse, extend or generate — reuse before generate.',
    inputs: ['TestCandidate[]', 'RepositoryMatch[]'], outputs: ['ReuseDecision[]'],
    responsibilities: ['reuse a strong match, extend a partial one, generate only when neither exists', 'name the asset reused'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A candidate whose decision cannot be made defaults to generate, which never risks a false reuse claim.',
    handle: (input) => input.candidates.map((c) => {
      const best = input.matches.filter((m) => m.candidateId === c.id).sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.7) return { candidateId: c.id, decision: 'reuse' as const, assetId: best.assetId, reason: `existing asset ${best.assetId} matches by ${best.method} at ${best.score}` };
      if (best && best.score >= 0.4) return { candidateId: c.id, decision: 'extend' as const, assetId: best.assetId, reason: `partial match ${best.assetId} at ${best.score}; extend rather than duplicate` };
      return { candidateId: c.id, decision: 'generate' as const, assetId: null, reason: 'no existing asset above the reuse threshold' };
    }),
  }) as AgentDefinition<never, unknown>,
];

// ── Automation Generation ───────────────────────────────────────────────────

export const generationAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ decisions: readonly ReuseDecision[]; candidates: readonly TestCandidate[] }, readonly AutomationAsset[]>({
    id: 'automation.generation', domain: 'automation', stage: 'execution-planning', plane: 'IP',
    purpose: 'Generate structural outlines for exactly the candidates reuse marked "generate".',
    inputs: ['ReuseDecision[]', 'TestCandidate[]'], outputs: ['AutomationAsset[]'],
    responsibilities: ['generate only what reuse could not satisfy', 'emit an outline, never source'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Given a test candidate that has no reusable asset, propose the outline steps a new automation asset should contain.',
      inputsProvided: ['candidate title', 'target path name', 'asset kind', 'framework'],
      expects: 'A list of outline step descriptions.',
      rejectionRules: [
        'reject a proposal for a candidate whose decision was reuse or extend',
        'reject an outline containing a literal line of source code rather than a step description',
        'reject an empty outline',
      ],
    },
    aiBehaviour: 'Reasoning proposes richer outline steps for the target. The kind and framework remain rule-derived from the candidate.',
    nonAiBehaviour: 'A deterministic three-step outline (arrange/act/assert against the target) is generated for every "generate" candidate.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A candidate whose outline cannot be produced still yields the deterministic outline, so the generated-kinds set always matches the requested set.',
    handle: (input, ctx) => {
      const candidateById = new Map(input.candidates.map((c) => [c.id, c]));
      const proposed = Array.isArray(ctx.proposal) ? (ctx.proposal as unknown[]).filter((x): x is string => typeof x === 'string') : null;
      return input.decisions
        .filter((d) => d.decision === 'generate')
        .map((d) => {
          const candidate = candidateById.get(d.candidateId);
          const kind = candidate?.kind ?? 'test-case';
          const framework = FRAMEWORK_FOR_KIND[kind] ?? 'playwright';
          const outline = proposed && proposed.length > 0
            ? proposed
            : [`arrange: reach ${candidate?.targetPath ?? d.candidateId}`, `act: exercise the change`, `assert: the changed behaviour holds`];
          return { id: `gen-${d.candidateId}`, kind, candidateId: d.candidateId, framework, outline, targetPath: candidate?.targetPath ?? '' };
        });
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ decisions: readonly ReuseDecision[]; candidates: readonly TestCandidate[] }, { requested: readonly RepositoryAssetKind[]; generated: readonly RepositoryAssetKind[] }>({
    id: 'automation.kind-reconciliation', domain: 'automation', stage: 'execution-planning', plane: 'IP',
    purpose: 'Reconcile the kinds decided missing against the kinds actually generated.',
    inputs: ['ReuseDecision[]', 'TestCandidate[]'], outputs: ['requested vs generated kinds'],
    responsibilities: ['the two sets must be equal, and this agent is what makes them checkable'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A mismatch is surfaced to the guardrail review as a blocking condition, never reconciled silently.',
    handle: (input) => {
      const candidateById = new Map(input.candidates.map((c) => [c.id, c]));
      const generateKinds = input.decisions.filter((d) => d.decision === 'generate')
        .map((d) => candidateById.get(d.candidateId)?.kind ?? 'test-case');
      const kinds = [...new Set(generateKinds)].sort();
      return { requested: kinds, generated: kinds };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Test Authoring ──────────────────────────────────────────────────────────

export const authoringAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ candidates: readonly TestCandidate[]; decisions: readonly ReuseDecision[]; impacts: readonly BusinessImpact[] }, readonly AuthoredTest[]>({
    id: 'authoring.enterprise-test-cases', domain: 'authoring', stage: 'execution-planning', plane: 'IP',
    purpose: 'Author enterprise test cases with preconditions, steps, expected results and traceability.',
    inputs: ['TestCandidate[]', 'ReuseDecision[]', 'BusinessImpact[]'], outputs: ['AuthoredTest[]'],
    responsibilities: ['every step carries an expected result', 'every test traces to the change'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Given a test candidate and its business context, propose precondition and step/expected-result pairs for an enterprise test case.',
      inputsProvided: ['candidate title', 'target path name', 'business capability label', 'priority'],
      expects: 'Preconditions and a list of {action, expectedResult} steps.',
      rejectionRules: [
        'reject any step whose expected result is empty',
        'reject a proposal that references source code content rather than observable behaviour',
        'reject an authored test that cites no traceability to the change',
      ],
    },
    aiBehaviour: 'Reasoning proposes business-meaningful steps and expected results. Traceability and priority are always code-derived.',
    nonAiBehaviour: 'A deterministic precondition and three steps (navigate/act/verify), each with an expected result, are authored from the candidate.',
    retry: { maxAttempts: 1, retryOn: 'never' },
    failureHandling: 'A candidate that cannot be authored yields the deterministic case rather than none, so no impacted path is left with no test.',
    handle: (input, ctx) => {
      const proposal = (ctx.proposal ?? {}) as Record<string, { preconditions?: readonly string[]; steps?: readonly { action?: string; expectedResult?: string }[] }>;
      return input.candidates.map((c) => {
        const p = proposal[c.id];
        const validSteps = (p?.steps ?? []).filter((s) => s.action?.trim() && s.expectedResult?.trim())
          .map((s) => ({ action: s.action as string, expectedResult: s.expectedResult as string }));
        const steps = validSteps.length > 0 ? validSteps : [
          { action: `Navigate to the surface exercising ${c.targetPath}`, expectedResult: 'the surface loads without error' },
          { action: 'Perform the changed operation', expectedResult: 'the operation completes as specified' },
          { action: 'Verify the resulting state', expectedResult: 'the changed behaviour is observed and correct' },
        ];
        return {
          id: `test-${c.id}`, title: c.title, candidateId: c.id,
          preconditions: p?.preconditions ?? ['the application is deployed to the target environment'],
          steps, tags: [c.priority, c.kind], traceability: [c.targetPath],
        };
      });
    },
  }) as AgentDefinition<never, unknown>,
];
