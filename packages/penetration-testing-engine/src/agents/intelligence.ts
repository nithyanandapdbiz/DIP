/**
 * Repository Intelligence (EP search, IP disposition), AI Intelligence, Historical
 * Intelligence and Remediation Intelligence — stage 10 (reflection).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 13-ai-operating-model.md · 19-repository-ownership.md
 *   ADR          : ADR-0027 · ADR-0016 (AI tool agnosticism)
 *   Criteria     : C-13.1 (AI proposes; code decides) · INV-7 (functions with reasoning off)
 *
 * REPOSITORY SEARCH IS EXECUTION PLANE; THE SCORES ARE WHAT CROSS.
 * The five search agents and the vector search declare `plane: 'EP'` and `stage: 'discovery'`
 * — their semantic home is Execution Plane observation, even though the orchestrator invokes
 * them during reflection. `RepositoryMatch` carries a fingerprint, a kind and a score — no
 * finding body, no excerpt. The customer's prior-findings store never leaves their tenancy.
 *
 * AI INTELLIGENCE PROPOSES; THE CODE DECIDES.
 * Every agent in the `aiintel` domain declares an AI Capability Class and a prompt contract,
 * and every one has a deterministic degraded path for when no proposal is supplied. The
 * proposal is an input like any other: the agent's own code accepts, narrows or rejects it,
 * and the same finding set, CWE and CVSS score stand whether reasoning ran or not. Disabling
 * reasoning withholds the proposals; it changes no workflow.
 */
import {
  defineAgent, VectorIndex, VectorMemory,
  type AgentDefinition,
} from '@dbiz/capability-framework';
import {
  type AssessedFinding, type AttackChain, type Finding, type FindingDisposition, type Priority,
  type Remediation, type RepositoryMatch, type ThreatAssessment, type PriorRecordKind,
} from '../model.js';

const RETRY_NEVER = { maxAttempts: 1, retryOn: 'never' } as const;

// ── Repository Intelligence ─────────────────────────────────────────────────

export interface PriorRecord {
  readonly id: string;
  readonly kind: PriorRecordKind;
  readonly fingerprint: string;
  readonly text: string;
  readonly repository: string;
}

export interface RepoSearchInput {
  readonly findings: readonly Finding[];
  readonly priorRecords: readonly PriorRecord[];
  readonly index: VectorIndex;
}

const PRIOR_KINDS: readonly PriorRecordKind[] = ['finding', 'defect', 'exception', 'waiver', 'suppression'];

/** One fingerprint-exact search agent per prior-record kind, all Execution Plane. */
const repositorySearchAgents: readonly AgentDefinition<never, unknown>[] = PRIOR_KINDS.map((kind) =>
  defineAgent<RepoSearchInput, readonly RepositoryMatch[]>({
    id: `repository.search.${kind}`, domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: `Search the customer's prior ${kind} records for a fingerprint match to a new finding.`,
    inputs: ['Finding[]', 'PriorRecord[]'], outputs: ['RepositoryMatch[]'],
    responsibilities: [`match new findings against prior ${kind} records by fingerprint`, 'return scores and identifiers only'],
    toolContracts: ['CustomerFindingStore'], aiCapabilityClass: 'none',
    failureHandling: `A ${kind} store that cannot be read is reported as unavailable, so a new finding is never suppressed by a record nobody could read.`,
    handle: (input) => input.findings.flatMap((f) =>
      input.priorRecords.filter((r) => r.kind === kind && r.fingerprint === f.fingerprint).map((r) => ({
        recordId: r.id, recordKind: r.kind, fingerprint: r.fingerprint, similarity: 1,
        repository: r.repository, matchedBy: 'fingerprint' as const,
      }))),
  }) as AgentDefinition<never, unknown>);

export const repositoryAgents: readonly AgentDefinition<never, unknown>[] = [
  ...repositorySearchAgents,

  defineAgent<RepoSearchInput, readonly RepositoryMatch[]>({
    id: 'repository.vector-search', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Find near-duplicate prior records by vector similarity when a fingerprint differs slightly.',
    inputs: ['Finding[]', 'VectorIndex'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['search the prior-record vector index', 'apply a similarity floor'],
    toolContracts: ['CustomerFindingStore'], aiCapabilityClass: 'none',
    failureHandling: 'An unavailable index contributes no match, so recall is reduced rather than a wrong suppression introduced.',
    handle: (input) => input.findings.flatMap((f) =>
      input.index.search(`${f.category} ${f.targetPath} ${f.parameterName ?? ''}`, 3, 0.6).map((m) => ({
        recordId: m.id, recordKind: (m.labels['kind'] as PriorRecordKind) ?? 'finding',
        fingerprint: m.labels['fingerprint'] ?? '', similarity: m.similarity,
        repository: m.labels['repository'] ?? 'unknown', matchedBy: 'vector' as const,
      }))),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[]; matches: readonly RepositoryMatch[] }, ReadonlyMap<string, FindingDisposition>>({
    id: 'repository.disposition', domain: 'repository', stage: 'reflection', plane: 'IP',
    purpose: 'Decide new, duplicate or suppressed for each finding from the repository matches.',
    inputs: ['Finding[]', 'RepositoryMatch[]'], outputs: ['FindingDisposition per finding'],
    responsibilities: ['suppress only against a waiver, exception or suppression record', 'treat a prior finding or defect as a duplicate'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding whose disposition is unclear is treated as new, never suppressed; suppression requires a positive match.',
    handle: (input) => {
      const byFinding = new Map<string, RepositoryMatch[]>();
      for (const f of input.findings) byFinding.set(f.id, []);
      // Matches are aligned to findings by fingerprint, which is how the exact search produced them.
      for (const f of input.findings) {
        const ms = input.matches.filter((m) => m.fingerprint === f.fingerprint);
        byFinding.set(f.id, ms);
      }
      const out = new Map<string, FindingDisposition>();
      for (const f of input.findings) {
        const ms = byFinding.get(f.id) ?? [];
        const suppress = ms.find((m) => m.recordKind === 'waiver' || m.recordKind === 'exception' || m.recordKind === 'suppression');
        const dup = ms.find((m) => m.recordKind === 'finding' || m.recordKind === 'defect');
        if (suppress) out.set(f.id, { kind: 'suppressed', by: suppress.recordId, recordKind: suppress.recordKind });
        else if (dup) out.set(f.id, { kind: 'duplicate', of: dup.recordId, similarity: dup.similarity });
        else out.set(f.id, { kind: 'new', reason: 'no prior record matched this fingerprint' });
      }
      return out;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ dispositions: ReadonlyMap<string, FindingDisposition> }, { readonly newCount: number; readonly duplicate: number; readonly suppressed: number }>({
    id: 'repository.new-only-filter', domain: 'repository', stage: 'reflection', plane: 'IP',
    purpose: 'Count what is genuinely new, so only missing findings are generated downstream.',
    inputs: ['FindingDisposition per finding'], outputs: ['disposition counts'],
    responsibilities: ['count new, duplicate and suppressed dispositions'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncountable disposition set reports every finding as new, which over-reports rather than hides.',
    handle: (input) => {
      let n = 0; let d = 0; let s = 0;
      for (const disp of input.dispositions.values()) {
        if (disp.kind === 'new') n += 1; else if (disp.kind === 'duplicate') d += 1; else s += 1;
      }
      return { newCount: n, duplicate: d, suppressed: s };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── AI Intelligence (reasoning agents, with deterministic degraded paths) ────

/** Read a proposal field safely; reasoning output is untrusted structure. */
function propField<T>(proposal: unknown, key: string): T | undefined {
  return typeof proposal === 'object' && proposal !== null ? (proposal as Record<string, unknown>)[key] as T | undefined : undefined;
}

export interface AiInput {
  readonly assessed: readonly AssessedFinding[];
  readonly threats: ReadonlyMap<string, ThreatAssessment>;
  readonly chain: AttackChain | null;
}

export const aiIntelAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<AiInput, ReadonlyMap<string, string>>({
    id: 'aiintel.semantic-risk', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Enrich each finding with a semantic risk statement, decided against the CVSS floor.',
    inputs: ['AssessedFinding[]'], outputs: ['semantic risk per finding'],
    responsibilities: ['accept a proposed narrative only if it does not lower the deterministic severity', 'fall back to a template narrative'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Classify the semantic risk of a finding from its category, CWE and severity.',
      inputsProvided: ['finding categories', 'cwe identifiers', 'cvss severities', 'minimised endpoint paths'],
      expects: 'a short risk statement per finding id',
      rejectionRules: ['reject a statement that contradicts the computed severity', 'reject a statement naming a category not in the finding set'],
    },
    aiBehaviour: 'Applies the proposed risk narrative where it does not lower the computed severity; otherwise keeps the deterministic one.',
    nonAiBehaviour: 'Produces a template risk statement from the category title and the computed severity, so every finding is described.',
    retry: RETRY_NEVER,
    failureHandling: 'A finding whose narrative cannot be produced falls back to its category title; reasoning never gates the result.',
    handle: (input, ctx) => {
      const proposed = propField<Record<string, string>>(ctx.proposal, 'narratives');
      return new Map(input.assessed.map((a) => {
        const template = `${a.finding.category} (${a.cvss.severity}) affects ${a.finding.targetPath}`;
        const enriched = proposed?.[a.finding.id];
        // Code decides: a proposal is accepted only if it mentions the real category.
        const use = enriched && enriched.toLowerCase().includes(a.finding.category.split('-')[0] ?? '') ? enriched : template;
        return [a.finding.id, use];
      }));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, string>({
    id: 'aiintel.business-impact-narrative', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Produce an executive business-impact narrative for the engagement.',
    inputs: ['AssessedFinding[]', 'AttackChain'], outputs: ['business impact narrative'],
    responsibilities: ['ground the narrative in the actual finding counts', 'reject a proposal that overstates the counts'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate an executive business-impact narrative from the finding profile.',
      inputsProvided: ['severity counts', 'top finding categories', 'attack chain phases'],
      expects: 'a short narrative paragraph',
      rejectionRules: ['reject a narrative citing a severity count higher than the real one', 'reject a narrative naming an unfound category'],
    },
    aiBehaviour: 'Uses the proposed narrative when its cited counts match the real ones; otherwise uses the deterministic summary.',
    nonAiBehaviour: 'Emits a deterministic summary of the critical and high finding counts and the chain reach.',
    retry: RETRY_NEVER,
    failureHandling: 'An unproducible narrative falls back to the deterministic count summary.',
    handle: (input, ctx) => {
      const critical = input.assessed.filter((a) => a.cvss.severity === 'critical' && !a.falsePositive).length;
      const high = input.assessed.filter((a) => a.cvss.severity === 'high' && !a.falsePositive).length;
      const deterministic = `${critical} critical and ${high} high finding(s); attack chain ${input.chain?.multiStage ? 'is multi-stage' : 'is single-stage or absent'}.`;
      const proposed = propField<string>(ctx.proposal, 'narrative');
      // Reject a narrative that overstates the critical count.
      const overstates = proposed ? /(\d+)\s+critical/i.exec(proposed) : null;
      const use = proposed && (!overstates || Number(overstates[1]) <= critical) ? proposed : deterministic;
      return use;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, readonly string[]>({
    id: 'aiintel.attack-chain-prediction', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Predict the next likely attacker step beyond the confirmed chain.',
    inputs: ['AttackChain'], outputs: ['predicted next steps'],
    responsibilities: ['predict only from confirmed nodes', 'never assert an unconfirmed finding as present'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Predict the next kill-chain step from the confirmed attack nodes.',
      inputsProvided: ['confirmed kill-chain phases', 'finding categories'],
      expects: 'an ordered list of predicted next techniques',
      rejectionRules: ['reject a prediction presented as a confirmed finding', 'reject a prediction outside the kill-chain model'],
    },
    aiBehaviour: 'Offers a proposed next-step list, labelled as prediction, in addition to the deterministic one.',
    nonAiBehaviour: 'Derives the next kill-chain phase deterministically from the furthest confirmed node.',
    retry: RETRY_NEVER,
    failureHandling: 'An unpredictable chain yields no prediction rather than a fabricated finding.',
    handle: (input, ctx) => {
      const proposed = propField<string[]>(ctx.proposal, 'predictions');
      const deterministic = input.chain && input.chain.nodes.length > 0
        ? [`likely escalation from ${input.chain.killChain[input.chain.killChain.length - 1] ?? 'exploitation'}`]
        : [];
      // Predictions are advisory: keep both, deterministic first, so a run with no reasoning still predicts.
      return Array.isArray(proposed) ? [...deterministic, ...proposed.map((p) => `predicted: ${p}`)] : deterministic;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, ReadonlyMap<string, number>>({
    id: 'aiintel.false-positive-prediction', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Predict the probability each finding is a false positive, bounded by the confidence.',
    inputs: ['AssessedFinding[]'], outputs: ['false-positive probability per finding'],
    responsibilities: ['never predict a confirmed high-confidence finding is a false positive'],
    toolContracts: [], aiCapabilityClass: 'classification',
    promptContract: {
      intent: 'Estimate the false-positive probability of a finding from its category and confidence.',
      inputsProvided: ['finding categories', 'detector confidence scores'],
      expects: 'a probability per finding id',
      rejectionRules: ['reject a probability above 0.5 for a finding whose detector confidence is above 0.8'],
    },
    aiBehaviour: 'Adjusts the false-positive probability within the bound the detector confidence permits.',
    nonAiBehaviour: 'Sets the probability to one minus the detector confidence, deterministically.',
    retry: RETRY_NEVER,
    failureHandling: 'An unpredictable finding keeps one minus its confidence; reasoning cannot raise a high-confidence finding into a false positive.',
    handle: (input, ctx) => {
      const proposed = propField<Record<string, number>>(ctx.proposal, 'probabilities');
      return new Map(input.assessed.map((a) => {
        const floor = 1 - a.finding.confidence;
        const p = proposed?.[a.finding.id];
        // Code decides: a proposed FP probability is clamped so a high-confidence finding cannot be dismissed.
        const use = typeof p === 'number' && !(a.finding.confidence > 0.8 && p > 0.5) ? p : floor;
        return [a.finding.id, use];
      }));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, readonly string[]>({
    id: 'aiintel.threat-correlation', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Correlate findings against emerging threat intelligence themes.',
    inputs: ['ThreatAssessment per finding'], outputs: ['threat correlations'],
    responsibilities: ['correlate only across the findings actually present'],
    toolContracts: [], aiCapabilityClass: 'reconciliation',
    promptContract: {
      intent: 'Reconcile the finding threat scores against emerging threat themes.',
      inputsProvided: ['threat scores', 'finding categories', 'exploit maturity ratings'],
      expects: 'a list of correlated themes with the finding ids they span',
      rejectionRules: ['reject a correlation naming a finding id not in the set', 'reject a theme with no supporting finding'],
    },
    aiBehaviour: 'Adds proposed threat themes that reference only present findings.',
    nonAiBehaviour: 'Groups findings by exploit maturity deterministically as the correlation baseline.',
    retry: RETRY_NEVER,
    failureHandling: 'An uncorrelatable set yields the deterministic maturity grouping only.',
    handle: (input, ctx) => {
      const ids = new Set(input.assessed.map((a) => a.finding.id));
      const highMaturity = [...input.threats.values()].filter((t) => t.exploitMaturity === 'high').map((t) => t.category);
      const deterministic = highMaturity.length ? [`high-maturity cluster: ${[...new Set(highMaturity)].join(', ')}`] : [];
      const proposed = propField<{ theme: string; findingIds: string[] }[]>(ctx.proposal, 'correlations');
      const accepted = Array.isArray(proposed)
        ? proposed.filter((c) => Array.isArray(c.findingIds) && c.findingIds.every((id) => ids.has(id))).map((c) => c.theme)
        : [];
      return [...deterministic, ...accepted];
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, string>({
    id: 'aiintel.executive-narrative', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Summarise the engagement for an executive audience.',
    inputs: ['AssessedFinding[]'], outputs: ['executive narrative'],
    responsibilities: ['summarise without overstating the outcome'],
    toolContracts: [], aiCapabilityClass: 'summarisation',
    promptContract: {
      intent: 'Summarise the penetration test outcome for executives.',
      inputsProvided: ['severity counts', 'security score', 'release readiness'],
      expects: 'a two-sentence executive summary',
      rejectionRules: ['reject a summary asserting readiness the security score does not support'],
    },
    aiBehaviour: 'Uses the proposed summary when it is consistent with the security posture.',
    nonAiBehaviour: 'Emits a deterministic two-line summary of counts and the highest severity.',
    retry: RETRY_NEVER,
    failureHandling: 'An unproducible summary falls back to the deterministic count summary.',
    handle: (input, ctx) => {
      const live = input.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);
      const deterministic = `The test produced ${live.length} live finding(s). The highest severity observed is ${live.reduce((m, a) => (a.cvss.baseScore > m ? a.cvss.baseScore : m), 0).toFixed(1)}.`;
      const proposed = propField<string>(ctx.proposal, 'summary');
      return proposed && !/no (issues|findings|risk)/i.test(proposed) ? proposed : deterministic;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, ReadonlyMap<string, string>>({
    id: 'aiintel.remediation-enrichment', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Enrich remediation guidance with reasoning while keeping the deterministic fix.',
    inputs: ['AssessedFinding[]'], outputs: ['enriched remediation hint per finding'],
    responsibilities: ['never replace the deterministic fix; only add context'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate additional remediation context for a finding category.',
      inputsProvided: ['finding categories', 'cwe identifiers', 'technology fingerprint'],
      expects: 'a remediation hint per finding id',
      rejectionRules: ['reject a hint that contradicts the category\'s standard control'],
    },
    aiBehaviour: 'Adds a proposed remediation hint alongside the deterministic quick fix.',
    nonAiBehaviour: 'Provides the standard control name for the CWE as the hint, deterministically.',
    retry: RETRY_NEVER,
    failureHandling: 'A finding with no enrichment keeps the deterministic control name.',
    handle: (input, ctx) => {
      const proposed = propField<Record<string, string>>(ctx.proposal, 'hints');
      return new Map(input.assessed.map((a) => [a.finding.id, proposed?.[a.finding.id] ?? `apply the standard control for ${a.finding.cwe}`]));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<AiInput, readonly string[]>({
    id: 'aiintel.decision-intelligence', domain: 'aiintel', stage: 'reflection', plane: 'IP',
    purpose: 'Rank the findings by remediation urgency for the decision-maker.',
    inputs: ['AssessedFinding[]'], outputs: ['ranked finding ids'],
    responsibilities: ['a reasoning ranking may reorder but never add or drop a finding'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Rank findings by remediation urgency.',
      inputsProvided: ['finding ids', 'cvss scores', 'business criticality'],
      expects: 'an ordered list of finding ids',
      rejectionRules: ['reject a ranking that introduces an id not in the set', 'reject a ranking that omits a critical finding'],
    },
    aiBehaviour: 'Reorders the deterministic ranking by the proposed order, keeping only known ids.',
    nonAiBehaviour: 'Ranks by CVSS score then business criticality, deterministically.',
    retry: RETRY_NEVER,
    failureHandling: 'An unrankable set keeps the deterministic CVSS ordering.',
    handle: (input, ctx) => {
      const deterministic = [...input.assessed]
        .filter((a) => !a.falsePositive && a.duplicateOf === null)
        .sort((a, b) => (b.cvss.baseScore - a.cvss.baseScore) || (a.finding.id < b.finding.id ? -1 : 1))
        .map((a) => a.finding.id);
      const known = new Set(deterministic);
      const proposed = propField<string[]>(ctx.proposal, 'order');
      if (!Array.isArray(proposed)) return deterministic;
      const reordered = proposed.filter((id) => typeof id === 'string' && known.has(id));
      // Anything the proposal omitted keeps its deterministic place at the back — a proposal cannot drop a finding.
      for (const id of deterministic) if (!reordered.includes(id)) reordered.push(id);
      return reordered;
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Historical Intelligence ─────────────────────────────────────────────────

export interface HistoricalInput {
  readonly findings: readonly Finding[];
  readonly memory: VectorMemory;
}

export const historicalAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<HistoricalInput, ReadonlyMap<string, number>>({
    id: 'historical.similarity', domain: 'historical', stage: 'reflection', plane: 'IP',
    purpose: 'Score each finding\'s similarity to findings remembered from prior runs.',
    inputs: ['Finding[]', 'VectorMemory'], outputs: ['similarity per finding'],
    responsibilities: ['recall by category and location', 'return a score, never remembered text'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty memory yields zero similarity, which reports a finding as new rather than recurring.',
    handle: (input) => new Map(input.findings.map((f) => {
      const recalled = input.memory.recall('finding', `${f.category} ${f.targetPath}`, 1, 0.6);
      return [f.id, recalled[0]?.similarity ?? 0];
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<HistoricalInput, { readonly recurring: number; readonly novel: number }>({
    id: 'historical.correlation', domain: 'historical', stage: 'reflection', plane: 'IP',
    purpose: 'Correlate the current findings against remembered ones to separate recurring from novel.',
    inputs: ['Finding[]', 'VectorMemory'], outputs: ['recurring and novel counts'],
    responsibilities: ['count findings recalled above the similarity floor as recurring'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no memory it reports every finding as novel and records that history was unavailable.',
    handle: (input) => {
      let recurring = 0;
      for (const f of input.findings) if (input.memory.recall('finding', `${f.category} ${f.targetPath}`, 1, 0.6).length > 0) recurring += 1;
      return { recurring, novel: input.findings.length - recurring };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<HistoricalInput, readonly RepositoryMatch[]>({
    id: 'historical.vector-search', domain: 'historical', stage: 'reflection', plane: 'IP',
    purpose: 'Surface the nearest remembered finding for each current finding.',
    inputs: ['Finding[]', 'VectorMemory'], outputs: ['RepositoryMatch[]'],
    responsibilities: ['return identifiers and scores from memory only'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty memory returns no match rather than a fabricated neighbour.',
    handle: (input) => input.findings.flatMap((f) =>
      input.memory.recall('finding', `${f.category} ${f.targetPath}`, 1, 0.6).map((m) => ({
        recordId: m.id, recordKind: 'finding' as PriorRecordKind, fingerprint: m.labels['fingerprint'] ?? '',
        similarity: m.similarity, repository: 'memory', matchedBy: 'vector' as const,
      }))),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ findings: readonly Finding[] }, { readonly nodes: number; readonly edges: number }>({
    id: 'historical.knowledge-graph', domain: 'historical', stage: 'reflection', plane: 'IP',
    purpose: 'Fold the current findings into the knowledge graph of category-location relationships.',
    inputs: ['Finding[]'], outputs: ['knowledge graph delta'],
    responsibilities: ['relate categories to the locations they recur at'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuildable graph reports a zero delta rather than an invented one.',
    handle: (input) => {
      const nodes = new Set<string>();
      for (const f of input.findings) { nodes.add(f.category); nodes.add(f.targetPath); }
      return { nodes: nodes.size, edges: input.findings.length };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ recurring: number; novel: number }, { readonly trend: 'improving' | 'stable' | 'worsening'; readonly rationale: string }>({
    id: 'historical.trend-comparison', domain: 'historical', stage: 'reflection', plane: 'IP',
    purpose: 'Compare this run against history to report a trend.',
    inputs: ['recurring and novel counts'], outputs: ['historical trend'],
    responsibilities: ['report worsening when novel findings dominate'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no baseline it reports stable and records the absence of history, never improving.',
    handle: (input) => {
      const trend = input.novel > input.recurring ? 'worsening' : input.recurring > 0 ? 'improving' : 'stable';
      return { trend, rationale: `${input.novel} novel, ${input.recurring} recurring` };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Remediation Intelligence ────────────────────────────────────────────────

const QUICK_FIX: Partial<Record<string, string>> = {
  'missing-security-header': 'Add the missing security response headers at the edge or framework layer.',
  'weak-tls': 'Disable TLS below 1.2 and remove weak cipher suites.',
  'sql-injection': 'Replace string-built queries with parameterised statements.',
  'reflected-xss': 'Contextually encode all reflected output and set a strict CSP.',
  'idor': 'Enforce object-level authorization on every identifier-addressed resource.',
  'ssrf': 'Allow-list outbound destinations and block link-local and metadata ranges.',
  'command-injection': 'Avoid the shell; pass arguments as an array to an exec API with no interpolation.',
};

export interface RemediationInput {
  readonly assessed: readonly AssessedFinding[];
}

export const remediationAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<RemediationInput, ReadonlyMap<string, string>>({
    id: 'remediation.quick-fix', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Provide the immediate quick fix for each finding category.',
    inputs: ['AssessedFinding[]'], outputs: ['quick fix per finding'],
    responsibilities: ['give a category-specific quick fix'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no template quick fix is given the standard control for its CWE rather than left blank.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, QUICK_FIX[a.finding.category] ?? `Apply the standard control for ${a.finding.cwe}.`])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, string>>({
    id: 'remediation.long-term-fix', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Provide the structural long-term fix for each finding.',
    inputs: ['AssessedFinding[]'], outputs: ['long-term fix per finding'],
    responsibilities: ['recommend a systemic control, not just a point fix'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no long-term recommendation is given a secure-design review action rather than left blank.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, `Adopt a systemic control for ${a.finding.cwe} across the codebase and add a regression test.`])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, string | null>>({
    id: 'remediation.code-example', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Provide a code example where the category admits one.',
    inputs: ['AssessedFinding[]'], outputs: ['code example per finding'],
    responsibilities: ['give a generic, technology-neutral snippet where applicable'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A category with no meaningful code example carries null rather than a misleading snippet.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id,
      a.finding.category === 'sql-injection' ? 'db.query("SELECT * FROM orders WHERE id = ?", [id])'
      : a.finding.category === 'command-injection' ? 'execFile("ls", [dir])  // never exec(`ls ${dir}`)'
      : null])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, string | null>>({
    id: 'remediation.configuration-fix', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Provide a configuration fix where the finding is a misconfiguration.',
    inputs: ['AssessedFinding[]'], outputs: ['configuration fix per finding'],
    responsibilities: ['give a configuration change for header, TLS and CORS categories'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A non-configuration finding carries null rather than an irrelevant config change.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id,
      ['missing-security-header', 'weak-tls', 'permissive-cors', 'insecure-cookie'].includes(a.finding.category)
        ? `Set the correct directive for ${a.finding.category} at the reverse proxy or framework config.` : null])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, string | null>>({
    id: 'remediation.infrastructure-fix', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Provide an infrastructure fix where the finding is network or platform level.',
    inputs: ['AssessedFinding[]'], outputs: ['infrastructure fix per finding'],
    responsibilities: ['give an infra control for SSRF and metadata categories'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A non-infrastructure finding carries null rather than an irrelevant infra change.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id,
      ['ssrf', 'cloud-metadata-exposure'].includes(a.finding.category)
        ? 'Enforce egress network policy and disable IMDSv1 in favour of IMDSv2.' : null])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, Priority>>({
    id: 'remediation.business-priority', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Assign a business remediation priority to each finding.',
    inputs: ['AssessedFinding[]'], outputs: ['business priority per finding'],
    responsibilities: ['inherit the assessment priority, raising it for regulated assets'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no derivable priority is given p1 rather than the lowest.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, a.businessCriticality === 'high' && a.priority !== 'p1' ? 'p2' : a.priority])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>>({
    id: 'remediation.effort-estimate', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Estimate remediation effort per finding.',
    inputs: ['AssessedFinding[]'], outputs: ['effort per finding'],
    responsibilities: ['estimate from the category class'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no estimate is rated medium rather than trivial; unknown effort is never trivialised.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id,
      ['missing-security-header', 'insecure-cookie', 'permissive-cors'].includes(a.finding.category) ? 'trivial'
      : ['sql-injection', 'command-injection', 'remote-code-execution'].includes(a.finding.category) ? 'large' : 'medium'])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, string>>({
    id: 'remediation.owner', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Assign a remediation owner role per finding.',
    inputs: ['AssessedFinding[]'], outputs: ['owner per finding'],
    responsibilities: ['route infra findings to platform, code findings to engineering'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no clear owner is routed to the security team rather than left unassigned.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id,
      ['ssrf', 'cloud-metadata-exposure', 'weak-tls', 'expiring-certificate'].includes(a.finding.category) ? 'platform-engineering'
      : ['missing-security-header', 'permissive-cors', 'insecure-cookie'].includes(a.finding.category) ? 'application-platform' : 'application-engineering'])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<RemediationInput, ReadonlyMap<string, number>>({
    id: 'remediation.risk-reduction', domain: 'remediation', stage: 'reflection', plane: 'IP',
    purpose: 'Estimate the risk reduction each remediation achieves.',
    inputs: ['AssessedFinding[]'], outputs: ['risk reduction per finding'],
    responsibilities: ['estimate reduction proportional to CVSS score'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no derivable reduction is credited zero rather than an optimistic figure.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, Math.round(a.cvss.baseScore * 10)])),
  }) as AgentDefinition<never, unknown>,
];

/** Assemble remediations from the remediation agents' outputs. Deterministic composition. */
export function assembleRemediations(
  assessed: readonly AssessedFinding[],
  quick: ReadonlyMap<string, string>, longTerm: ReadonlyMap<string, string>,
  code: ReadonlyMap<string, string | null>, config: ReadonlyMap<string, string | null>,
  infra: ReadonlyMap<string, string | null>, priority: ReadonlyMap<string, Priority>,
  effort: ReadonlyMap<string, 'trivial' | 'small' | 'medium' | 'large'>,
  owner: ReadonlyMap<string, string>, reduction: ReadonlyMap<string, number>,
): readonly Remediation[] {
  return assessed.map((a) => ({
    findingId: a.finding.id,
    quickFix: quick.get(a.finding.id) ?? `Apply the standard control for ${a.finding.cwe}.`,
    longTermFix: longTerm.get(a.finding.id) ?? 'Adopt a systemic control and add a regression test.',
    codeExample: code.get(a.finding.id) ?? null,
    configurationFix: config.get(a.finding.id) ?? null,
    infrastructureFix: infra.get(a.finding.id) ?? null,
    businessPriority: priority.get(a.finding.id) ?? a.priority,
    estimatedEffort: effort.get(a.finding.id) ?? 'medium',
    owner: owner.get(a.finding.id) ?? 'security-team',
    riskReduction: reduction.get(a.finding.id) ?? 0,
  }));
}
