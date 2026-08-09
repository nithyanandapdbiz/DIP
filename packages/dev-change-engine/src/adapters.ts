/**
 * Provider adapters — the only place a provider name appears.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0024 §3.6
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * TWO PROVIDERS, ONE WORKFLOW, DIFFERENT NOUNS.
 * Azure DevOps hosts code in Azure Repos, plans in Azure Boards and manages tests in Azure
 * Test Plans. The GitHub tenant hosts code in GitHub, plans in Jira and manages tests in
 * Zephyr Scale. The Dev-Change workflow is identical for both; only the nouns each adapter
 * returns differ, and only `supports()` / `nounFor()` express the differences.
 *
 * `supports('feature') === false` on Jira is the interesting case: the engine records
 * every unpublishable level with the provider's limitation as the reason rather than
 * silently dropping it.
 *
 * These are in-process implementations that assign identifiers and record what was asked
 * of them. They are the seam a hosted provider client is installed at; the engine cannot
 * tell the difference, which is the point of the SPI. NONE of them has been executed
 * against a real host — ADR-0024 §6 states that limit.
 */
import type {
  AdapterSet, ExecutionAdapter, ProjectAdapter, SourceControlAdapter, TestManagementAdapter,
  WorkItemAdapter, WorkItemLevel,
} from '@dbiz/capability-framework';

export interface AdapterJournal {
  readonly calls: readonly { readonly method: string; readonly detail: string }[];
}

class Journal {
  readonly calls: { method: string; detail: string }[] = [];
  record(method: string, detail: string): void { this.calls.push({ method, detail }); }
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString().padStart(5, '0')}`;
}
export function resetAdapterSequence(): void { sequence = 0; }

/** A tiny sample repository, so a conformance run has real commits and a real diff. */
export interface SampleRepository {
  readonly commits: readonly { sha: string; message: string; authorEmail: string; authorName: string; parents: readonly string[]; changedPaths: readonly string[] }[];
  readonly files: readonly {
    path: string; previousPath: string | null; changeKind: string;
    hunks: readonly { startLine: number; addedLines: readonly string[]; removedLines: readonly string[] }[];
    symbolsAdded: readonly string[]; symbolsRemoved: readonly string[]; symbolsModified: readonly string[];
    imports: readonly string[]; exports: readonly string[];
  }[];
  readonly coChange: Readonly<Record<string, readonly { path: string; occurrences: number }[]>>;
  readonly branches: readonly { name: string; headCommit: string; isDefault: boolean }[];
}

function sourceControlAdapter(provider: string, changeRequestNoun: string, repo: SampleRepository, journal: Journal): SourceControlAdapter {
  return {
    identity: { spi: 'SourceControlAdapter', provider, version: '1.0.0' },
    changeRequestNoun,
    listBranches: (repo_) => { journal.record('listBranches', repo_); return { reached: true, value: repo.branches }; },
    findChangeRequest: (repo_, id) => {
      journal.record('findChangeRequest', `${repo_}#${id}`);
      return { reached: true, value: { id, title: `Change ${id}`, sourceBranch: 'feature/x', targetBranch: 'main', state: 'open', linkedWorkItemIds: [] } };
    },
    listCommits: (repo_, base, head) => { journal.record('listCommits', `${repo_} ${base}..${head}`); return { reached: true, value: repo.commits }; },
    diff: (repo_, base, head) => { journal.record('diff', `${repo_} ${base}..${head}`); return repo.files; },
    coChangedWith: (repo_, path) => { journal.record('coChangedWith', `${repo_}:${path}`); return repo.coChange[path] ?? []; },
  };
}

function projectAdapter(provider: string, journal: Journal): ProjectAdapter {
  return {
    identity: { spi: 'ProjectAdapter', provider, version: '1.0.0' },
    containerNoun: provider === 'azure-devops' ? 'Test Plan' : 'Test Cycle',
    groupingNoun: provider === 'azure-devops' ? 'Test Suite' : 'Folder',
    fetchStory: (storyId) => { journal.record('fetchStory', storyId); return { reached: true, value: { id: storyId, title: `Story ${storyId}`, body: '', acceptanceCriteria: [] } }; },
    linkRequirement: (storyId, requirementId) => { journal.record('linkRequirement', `${storyId}->${requirementId}`); return { linked: true, via: provider }; },
  };
}

function testManagementAdapter(provider: string, containerNoun: string, groupingNoun: string, journal: Journal): TestManagementAdapter {
  // ADR-0085 §4.3. The reference adapter REMEMBERS what it created, so that `discoverContainer` can
  // answer `value: null` for something that does not exist. A discovery that materialised the thing
  // it was asked to find would make the absent branch unreachable in this tree — which is exactly
  // the defect ADR-0085 §2.2 measured in `design-sync-adapters.ts`, and it would ship the repair
  // green, proven by a fixture that cannot produce the case it exists to prove.
  const containers = new Map<string, string>();
  const groupings = new Map<string, string>();
  return {
    identity: { spi: 'TestManagementAdapter', provider, version: '1.0.0' },
    discoverContainer: (name) => {
      journal.record('discoverContainer', name);
      const id = containers.get(name);
      // In-memory: always reached. `value: null` is the tool ANSWERING that there is no such
      // container — a fact, and a different result from not having reached the tool at all.
      return { reached: true, value: id === undefined ? null : { containerId: id, noun: containerNoun } };
    },
    discoverGrouping: (containerId, name) => {
      journal.record('discoverGrouping', `${containerId}/${name}`);
      const id = groupings.get(`${containerId}/${name}`);
      return { reached: true, value: id === undefined ? null : { groupingId: id, noun: groupingNoun } };
    },
    createContainer: (name) => { const id = nextId('container'); containers.set(name, id); journal.record('createContainer', name); return { published: true as const, value: { containerId: id, noun: containerNoun } }; },
    createGrouping: (containerId, name) => { const id = nextId('grouping'); groupings.set(`${containerId}/${name}`, id); journal.record('createGrouping', `${containerId}/${name}`); return { published: true as const, value: { groupingId: id, noun: groupingNoun } }; },
    findExistingTests: (groupingId, fingerprints) => { journal.record('findExistingTests', `${groupingId}:${fingerprints.length}`); return { reached: true, value: [] }; },
    publishTests: (groupingId, tests) => { journal.record('publishTests', `${groupingId}:${tests.length}`); return tests.map((t) => ({ published: true as const, externalRef: t.id })); },
    linkTraceability: (testId, requirementId) => { journal.record('linkTraceability', `${testId}->${requirementId}`); return { published: true as const, externalRef: `${requirementId}<-${testId}` }; },
  };
}

function executionAdapter(provider: string, journal: Journal): ExecutionAdapter {
  return {
    identity: { spi: 'ExecutionAdapter', provider, version: '1.0.0' },
    publishResult: (testId, outcome) => { journal.record('publishResult', `${testId}:${outcome}`); return { published: true as const, externalRef: testId }; },
    publishEvidenceReference: (testId, ref) => { journal.record('publishEvidenceReference', `${testId}:${ref.kind}`); return { published: true as const, externalRef: ref.locator || testId }; },
    publishDefect: (defect) => { const id = nextId('defect'); journal.record('publishDefect', defect.title); return { published: true as const, externalRef: id }; },
  };
}

const ADO_NOUNS: Readonly<Record<WorkItemLevel, string>> = { epic: 'Epic', feature: 'Feature', story: 'User Story', task: 'Task' };
const JIRA_NOUNS: Readonly<Record<WorkItemLevel, string>> = { epic: 'Epic', feature: 'Feature', story: 'Story', task: 'Sub-task' };

function workItemAdapter(provider: string, nouns: Readonly<Record<WorkItemLevel, string>>, supportsFeature: boolean, journal: Journal): WorkItemAdapter {
  return {
    identity: { spi: 'WorkItemAdapter', provider, version: '1.0.0' },
    nounFor: (level) => nouns[level],
    supports: (level) => (level === 'feature' ? supportsFeature : true),
    createWorkItem: (request) => { const id = nextId('wi'); journal.record('createWorkItem', `${request.level}:${request.title}`); return { workItemId: id, level: request.level, noun: nouns[request.level] }; },
    linkWorkItemTraceability: (workItemId, testId) => { journal.record('linkWorkItemTraceability', `${workItemId}->${testId}`); return { linked: true }; },
  };
}

/** A representative change: an API handler, its domain service, a UI page and a config file. */
export function sampleRepository(): SampleRepository {
  const hunk = (added: readonly string[], removed: readonly string[] = []) => ({ startLine: 10, addedLines: added, removedLines: removed });
  return {
    branches: [
      { name: 'main', headCommit: 'base000', isDefault: true },
      { name: 'feature/refund-limit', headCommit: 'head999', isDefault: false },
    ],
    commits: [
      { sha: 'c1', message: 'feat(refund): enforce refund ceiling AB#4471', authorEmail: 'dev@customer.example', authorName: 'Dev', parents: ['base000'], changedPaths: ['src/api/refund-controller.ts', 'src/domain/refund-service.ts'] },
      { sha: 'c2', message: 'fix(ui): show refund cap on the payments page', authorEmail: 'dev@customer.example', authorName: 'Dev', parents: ['c1'], changedPaths: ['src/pages/payments/refund.tsx', 'config/limits.yaml'] },
    ],
    files: [
      {
        path: 'src/api/refund-controller.ts', previousPath: null, changeKind: 'modified',
        hunks: [hunk(['if (amount > MAX_REFUND) throw new RefundExceeded();'], ['// no limit'])],
        symbolsAdded: ['RefundExceeded'], symbolsRemoved: [], symbolsModified: ['postRefund'],
        imports: ['../domain/refund-service'], exports: ['postRefund'],
      },
      {
        path: 'src/domain/refund-service.ts', previousPath: null, changeKind: 'modified',
        hunks: [hunk(['export const MAX_REFUND = 1000;', 'export function ceiling() { return MAX_REFUND; }'])],
        symbolsAdded: ['MAX_REFUND', 'ceiling'], symbolsRemoved: ['legacyCap'], symbolsModified: [],
        imports: [], exports: ['MAX_REFUND', 'ceiling', 'refund'],
      },
      {
        path: 'src/pages/payments/refund.tsx', previousPath: null, changeKind: 'modified',
        hunks: [hunk(['<span>Max refund: {ceiling()}</span>'])],
        symbolsAdded: [], symbolsRemoved: [], symbolsModified: ['RefundPage'],
        imports: ['../../domain/refund-service'], exports: ['RefundPage'],
      },
      {
        path: 'config/limits.yaml', previousPath: null, changeKind: 'modified',
        hunks: [hunk(['maxRefund: 1000'])],
        symbolsAdded: [], symbolsRemoved: [], symbolsModified: [],
        imports: [], exports: [],
      },
    ],
    coChange: {
      'src/api/refund-controller.ts': [{ path: 'src/domain/refund-service.ts', occurrences: 5 }],
      'src/domain/refund-service.ts': [{ path: 'src/pages/payments/refund.tsx', occurrences: 3 }],
    },
  };
}

/** The QA assets the customer already has — one covers the controller, none covers the UI. */
export function sampleAssets(): readonly { id: string; kind: string; text: string; path: string; repository: string; covers: readonly string[] }[] {
  return [
    { id: 'asset-refund-api', kind: 'api-test', text: 'refund controller enforces ceiling exceeded', path: 'tests/api/refund.spec.ts', repository: 'customer/qa', covers: ['src/api/refund-controller.ts'] },
    { id: 'asset-refund-pom', kind: 'page-object', text: 'refund page object payments max refund', path: 'automation/pom/refund.ts', repository: 'customer/automation', covers: ['src/pages/payments/refund.tsx'] },
  ];
}

export function azureDevOpsAdapters(repo: SampleRepository = sampleRepository()): AdapterSet & { workItem: WorkItemAdapter; sourceControl: SourceControlAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  return {
    project: projectAdapter('azure-devops', journal),
    testManagement: testManagementAdapter('azure-devops', 'Test Plan', 'Test Suite', journal),
    execution: executionAdapter('azure-devops', journal),
    workItem: workItemAdapter('azure-devops', ADO_NOUNS, true, journal),
    sourceControl: sourceControlAdapter('azure-devops', 'Pull Request', repo, journal),
    journal,
  };
}

export function githubJiraAdapters(repo: SampleRepository = sampleRepository()): AdapterSet & { workItem: WorkItemAdapter; sourceControl: SourceControlAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  return {
    project: projectAdapter('jira', journal),
    testManagement: testManagementAdapter('zephyr-scale', 'Test Cycle', 'Folder', journal),
    execution: executionAdapter('jira', journal),
    // Jira team-managed has no Feature level — the interesting provider difference.
    workItem: workItemAdapter('jira', JIRA_NOUNS, false, journal),
    sourceControl: sourceControlAdapter('github', 'Pull Request', repo, journal),
    journal,
  };
}
