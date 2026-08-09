/**
 * Repository Intelligence and Diff Intelligence agents.
 *
 * TRACEABILITY
 *   Architecture : 04-execution-plane-architecture.md · 06-data-sovereignty.md · 19-repository-ownership.md
 *   ADR          : ADR-0024 §3.4 · §3.5
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * EVERYTHING THAT TOUCHES SOURCE RUNS IN THE EXECUTION PLANE.
 * Branch, pull-request and commit discovery, diff generation, symbol extraction and the
 * repository index all declare `plane: 'EP'`. The conformance gate reads that field and
 * fails a catalogue that places any of them in the Intelligence Plane.
 *
 * THE BOUNDARY IS CROSSED IN EXACTLY ONE PLACE.
 * `repository.minimise-changes` and `repository.minimise-commits` call `minimise` and
 * `minimiseCommit` from the model. Every other Intelligence Plane agent in this engine
 * consumes their output and could not consume a `ChangedFile` if it wanted to — the type
 * has no field for a line of source.
 */
import { defineAgent, type AgentDefinition, type SourceControlAdapter } from '@dbiz/capability-framework';
import {
  layerOf, languageOf, minimise, minimiseCommit,
  type ChangedFile, type ChangeFact, type ChangeKind, type CodeLayer, type CommitFact,
  type CommitRecord, type RepositoryAsset, type RepositoryEvent,
} from '../model.js';

// ── Repository Intelligence · Execution Plane ───────────────────────────────

export const repositoryAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ adapter: SourceControlAdapter; event: RepositoryEvent }, readonly { name: string; headCommit: string; isDefault: boolean }[]>({
    id: 'repository.branch-discovery', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate branches through the source-control adapter and locate the change branch.',
    inputs: ['SourceControlAdapter', 'RepositoryEvent'], outputs: ['branches'],
    responsibilities: ['call the adapter, never a provider API directly', 'confirm the event branch exists'],
    toolContracts: ['SourceControlAdapter.listBranches'], aiCapabilityClass: 'none',
    failureHandling: 'A repository that cannot be enumerated stops the run. Proceeding would analyse a range nobody confirmed exists.',
    // UNDECIDED — Dev-Change capability (ADR-0074 §4). This agent's own failureHandling names
    // the case: "A repository that cannot be enumerated stops the run." It could not previously
    // tell an unreachable repository from an empty one. Behaviour unchanged — an unreached read
    // throws where the old signature threw on transport error; what Dev-Change should do
    // instead is this capability's decision.
    handle: (input) => {
      const read = input.adapter.listBranches(input.event.repository);
      if (!read.reached) throw new Error(`source-control adapter unreachable for ${input.event.repository}: ${read.reason}`);
      return read.value;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: SourceControlAdapter; event: RepositoryEvent }, { id: string; title: string; sourceBranch: string; targetBranch: string; state: string; linkedWorkItemIds: readonly string[] } | null>({
    id: 'repository.pull-request-discovery', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Resolve the pull request behind the event, where the event names one.',
    inputs: ['SourceControlAdapter', 'RepositoryEvent'], outputs: ['pull request or null'],
    responsibilities: ['return null rather than inventing a request for a push event'],
    toolContracts: ['SourceControlAdapter.findChangeRequest'], aiCapabilityClass: 'none',
    failureHandling: 'An unresolvable pull request degrades to null and the run continues against the commit range, which is the authoritative bound anyway.',
    // UNDECIDED — Dev-Change capability (ADR-0074 §4). THIS ONE IS THE MOST CONSEQUENTIAL OF
    // THE THREE AND THE LEAST OBVIOUS. Its failureHandling chooses to DEGRADE: "An unresolvable
    // pull request degrades to null and the run continues against the commit range." That is a
    // reasonable decision about a request the tool says does not exist. It is NOT obviously the
    // right decision when the tool was never reached — the run would then continue without
    // linked work items it might actually have. Behaviour unchanged; the distinction now
    // exists, and the choice belongs to this capability.
    handle: (input) => {
      if (!input.event.pullRequestId) return null;
      const read = input.adapter.findChangeRequest(input.event.repository, input.event.pullRequestId);
      if (!read.reached) throw new Error(`source-control adapter unreachable for ${input.event.repository}#${input.event.pullRequestId}: ${read.reason}`);
      return read.value;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: SourceControlAdapter; event: RepositoryEvent }, readonly CommitRecord[]>({
    id: 'repository.commit-discovery', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Enumerate every commit in the base..head range through the adapter.',
    inputs: ['SourceControlAdapter', 'RepositoryEvent'], outputs: ['CommitRecord[]'],
    responsibilities: ['bound strictly by base and head', 'never widen the range to find more'],
    toolContracts: ['SourceControlAdapter.listCommits'], aiCapabilityClass: 'none',
    failureHandling: 'An empty or unreadable range stops the run. An empty diff that reads as "nothing broke" is the most expensive possible false negative.',
    // UNDECIDED — Dev-Change capability (ADR-0074 §4). THIS AGENT STATES D-045 VERBATIM, and it
    // is the most explicit statement of the hazard anywhere in the platform:
    //   "An empty or unreadable range stops the run. An empty diff that reads as 'nothing
    //    broke' is the most expensive possible false negative."
    // Until now an unreachable adapter produced exactly that empty diff, and nothing could
    // tell it from a genuinely empty range. Behaviour unchanged; the declaration is keepable.
    handle: (input) => {
      const read = input.adapter.listCommits(input.event.repository, input.event.baseCommit, input.event.headCommit);
      if (!read.reached) throw new Error(`source-control adapter unreachable for ${input.event.repository} ${input.event.baseCommit}..${input.event.headCommit}: ${read.reason}`);
      return read.value.map((c) => ({ ...c }));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ commits: readonly CommitRecord[] }, readonly string[]>({
    id: 'repository.merge-detection', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Identify merge commits so their combined diffs are not counted as original change.',
    inputs: ['CommitRecord[]'], outputs: ['merge commit shas'],
    responsibilities: ['a commit with more than one parent is a merge'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Undetected merges inflate churn. On failure the list is empty and churn is reported as an upper bound.',
    handle: (input) => input.commits.filter((c) => c.parents.length > 1).map((c) => c.sha),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>({
    id: 'repository.index', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Build the searchable index of the customer repository, in the Execution Plane.',
    inputs: ['RepositoryAsset[]'], outputs: ['indexed assets'],
    responsibilities: ['index asset text where it lives', 'never emit asset text'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuilt index means no reuse can be demonstrated, so every candidate is treated as requiring generation — expensive, but never a false reuse claim.',
    handle: (input) => [...input.assets].sort((a, b) => (a.id < b.id ? -1 : 1)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>({
    id: 'repository.existing-test-discovery', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Find existing tests, features and step definitions already present in the repository.',
    inputs: ['RepositoryAsset[]'], outputs: ['existing test assets'],
    responsibilities: ['reuse before generate begins here'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty result causes generation of assets that may already exist, which duplicates automation — recorded as an advisory finding rather than hidden.',
    handle: (input) => input.assets.filter((a) =>
      a.kind === 'test-case' || a.kind === 'feature-file' || a.kind === 'api-test' || a.kind === 'step-definition'),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ assets: readonly RepositoryAsset[] }, readonly RepositoryAsset[]>({
    id: 'repository.automation-inventory', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Inventory existing page objects, components, locators and fixtures.',
    inputs: ['RepositoryAsset[]'], outputs: ['automation assets'],
    responsibilities: ['distinguish authored tests from the automation scaffolding they use'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure the inventory is empty and generation proposes new page objects, which the reuse gate then reports as unverified.',
    handle: (input) => input.assets.filter((a) =>
      a.kind === 'page-object' || a.kind === 'component' || a.kind === 'locator'
      || a.kind === 'fixture' || a.kind === 'data-file' || a.kind === 'test-data'),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ adapter: SourceControlAdapter; repository: string; paths: readonly string[] }, readonly { path: string; related: string; occurrences: number }[]>({
    id: 'repository.co-change-history', domain: 'repository', stage: 'discovery', plane: 'EP',
    purpose: 'Retrieve paths that historically change together, as repository metadata.',
    inputs: ['SourceControlAdapter', 'changed paths'], outputs: ['co-change pairs'],
    responsibilities: ['emit path pairs and counts only, never commit content'],
    toolContracts: ['SourceControlAdapter.coChangedWith'], aiCapabilityClass: 'none',
    failureHandling: 'Absent history removes an impact signal. The dependency graph falls back to static imports and the report states the reduced confidence.',
    handle: (input) => input.paths.flatMap((path) =>
      input.adapter.coChangedWith(input.repository, path)
        .map((c) => ({ path, related: c.path, occurrences: c.occurrences }))),
  }) as AgentDefinition<never, unknown>,

  // ── The boundary crossing · EP -> IP ──────────────────────────────────────

  defineAgent<{ files: readonly ChangedFile[] }, readonly ChangeFact[]>({
    id: 'repository.minimise-changes', domain: 'repository', stage: 'context', plane: 'EP',
    purpose: 'Minimise changed files into change facts. The sole crossing point for diffs.',
    inputs: ['ChangedFile[]'], outputs: ['ChangeFact[]'],
    responsibilities: [
      'call minimise and return only its output',
      'never carry a hunk, a line of source or a file body forward',
    ],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A minimisation that cannot complete stops the run. Passing an unminimised file forward would move source across the boundary, which is a sovereignty breach rather than a degraded result.',
    handle: (input) => input.files.map(minimise),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ commits: readonly CommitRecord[] }, readonly CommitFact[]>({
    id: 'repository.minimise-commits', domain: 'repository', stage: 'context', plane: 'EP',
    purpose: 'Minimise commits into commit facts, discarding message bodies and authorship.',
    inputs: ['CommitRecord[]'], outputs: ['CommitFact[]'],
    responsibilities: ['retain message shape only', 'never carry a message or an author email'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Stops the run for the same reason as change minimisation: the failure mode is a boundary breach, not a lost signal.',
    handle: (input) => input.commits.map(minimiseCommit),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, Readonly<Record<CodeLayer, number>>>({
    id: 'repository.layer-census', domain: 'repository', stage: 'context', plane: 'IP',
    purpose: 'Count changed files by architectural layer, so impact can be reasoned by stratum.',
    inputs: ['ChangeFact[]'], outputs: ['layer census'],
    responsibilities: ['derive from the fact, never re-read the path from source'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty census degrades impact analysis to path matching, and the report states it.',
    handle: (input) => {
      const census = {} as Record<CodeLayer, number>;
      for (const fact of input.facts) census[fact.layer] = (census[fact.layer] ?? 0) + 1;
      return census;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ facts: readonly ChangeFact[] }, readonly { module: string; paths: readonly string[] }[]>({
    id: 'repository.module-mapping', domain: 'repository', stage: 'context', plane: 'IP',
    purpose: 'Group changed paths into modules by their highest meaningful path segment.',
    inputs: ['ChangeFact[]'], outputs: ['modules'],
    responsibilities: ['group deterministically', 'never invent a module no path belongs to'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Ungrouped paths are reported as a single "unattributed" module rather than silently dropped.',
    handle: (input) => {
      const byModule = new Map<string, string[]>();
      for (const fact of input.facts) {
        const segments = fact.path.split('/').filter(Boolean);
        // The first segment that is not a conventional container is the module name.
        const module = segments.find((s) => !['src', 'lib', 'app', 'packages', 'apps'].includes(s.toLowerCase()))
          ?? segments[0] ?? 'unattributed';
        byModule.set(module, [...(byModule.get(module) ?? []), fact.path]);
      }
      return [...byModule.entries()]
        .map(([module, paths]) => ({ module, paths }))
        .sort((a, b) => (a.module < b.module ? -1 : 1));
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Diff Intelligence · Execution Plane ─────────────────────────────────────

export const diffAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ adapter: SourceControlAdapter; event: RepositoryEvent }, readonly ChangedFile[]>({
    id: 'diff.generation', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Generate the base..head diff through the source-control adapter.',
    inputs: ['SourceControlAdapter', 'RepositoryEvent'], outputs: ['ChangedFile[]'],
    responsibilities: ['produce the diff in the Execution Plane', 'never transmit it'],
    toolContracts: ['SourceControlAdapter.diff'], aiCapabilityClass: 'none',
    failureHandling: 'A diff that cannot be generated stops the run. There is no degraded form of "what changed".',
    handle: (input) => input.adapter.diff(input.event.repository, input.event.baseCommit, input.event.headCommit)
      .map((f) => ({
        path: f.path,
        previousPath: f.previousPath,
        changeKind: f.changeKind as ChangeKind,
        hunks: f.hunks,
        symbolsAdded: f.symbolsAdded,
        symbolsRemoved: f.symbolsRemoved,
        symbolsModified: f.symbolsModified,
        imports: f.imports,
        exports: f.exports,
      })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[] }, readonly ChangedFile[]>({
    id: 'diff.binary-and-generated-filter', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Exclude binary, vendored and generated files from impact analysis.',
    inputs: ['ChangedFile[]'], outputs: ['analysable files'],
    responsibilities: ['exclude by path convention only', 'never exclude a source file to reduce noise'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'On failure nothing is excluded. Over-analysis is a cost; under-analysis is a missed regression.',
    handle: (input) => input.files.filter((f) =>
      !/(^|\/)(node_modules|vendor|dist|build|out|\.min\.)|\.(png|jpe?g|gif|svg|ico|pdf|zip|jar|dll|exe|lock)$/i.test(f.path)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[] }, readonly { path: string; added: number; removed: number; hunks: number }[]>({
    id: 'diff.hunk-analysis', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Measure the size and distribution of each file change.',
    inputs: ['ChangedFile[]'], outputs: ['per-file churn'],
    responsibilities: ['count lines, never carry them'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Missing churn removes a risk input; risk is then banded on structure alone and says so.',
    handle: (input) => input.files.map((f) => ({
      path: f.path,
      added: f.hunks.reduce((n, h) => n + h.addedLines.length, 0),
      removed: f.hunks.reduce((n, h) => n + h.removedLines.length, 0),
      hunks: f.hunks.length,
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[] }, readonly { path: string; symbols: readonly string[] }[]>({
    id: 'diff.symbol-extraction', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Collect the identifier names each file added, removed or modified.',
    inputs: ['ChangedFile[]'], outputs: ['symbol names per path'],
    responsibilities: ['emit names only — a name is structure, a body is content'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Without symbols the dependency graph falls back to file-level edges, which is coarser and is reported as such.',
    handle: (input) => input.files.map((f) => ({
      path: f.path,
      symbols: [...new Set([...f.symbolsAdded, ...f.symbolsRemoved, ...f.symbolsModified])].sort(),
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[] }, readonly { from: string; to: string }[]>({
    id: 'diff.rename-detection', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Identify renames so a move is not analysed as a delete plus an unrelated add.',
    inputs: ['ChangedFile[]'], outputs: ['rename pairs'],
    responsibilities: ['pair only where the adapter reported a previous path'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Undetected renames double-count churn and overstate risk. The direction of the error is conservative and is stated.',
    handle: (input) => input.files
      .filter((f) => f.changeKind === 'renamed' && f.previousPath)
      .map((f) => ({ from: f.previousPath as string, to: f.path })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[] }, readonly { path: string; language: string; layer: CodeLayer }[]>({
    id: 'diff.file-classification', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Classify each changed path by language and architectural layer.',
    inputs: ['ChangedFile[]'], outputs: ['path classifications'],
    responsibilities: ['classify from the path, deterministically and identically for every provider'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Unclassified paths are reported as unknown rather than assigned a default layer, because a wrong layer misroutes impact analysis silently.',
    handle: (input) => input.files.map((f) => ({
      path: f.path, language: languageOf(f.path), layer: layerOf(f.path),
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ files: readonly ChangedFile[]; merges: readonly string[] }, { analysable: number; excluded: number; renamed: number }>({
    id: 'diff.summary', domain: 'diff', stage: 'discovery', plane: 'EP',
    purpose: 'Summarise the diff so the review stage has a subject it can assess.',
    inputs: ['ChangedFile[]', 'merge shas'], outputs: ['diff summary'],
    responsibilities: ['report counts the reviewer can check against the file list'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A summary that cannot be produced yields zeroes, which the review stage treats as an empty diff and refuses.',
    handle: (input) => ({
      analysable: input.files.length,
      excluded: 0,
      renamed: input.files.filter((f) => f.changeKind === 'renamed').length,
    }),
  }) as AgentDefinition<never, unknown>,
];
