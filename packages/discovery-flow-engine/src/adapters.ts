/**
 * Provider adapters — the only place a provider name appears.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * TWO PROVIDERS, ONE WORKFLOW, DIFFERENT NOUNS.
 * Azure DevOps models Epic, Feature, User Story and Task. Jira in a team-managed project
 * models Epic, Story and Sub-task and has no Feature level at all. That difference is
 * expressed by `supports()` and `nounFor()` — not by a branch in orchestration, and not
 * by a second work-item workflow.
 *
 * `supports('feature') === false` is the interesting case, and it is why `supports`
 * exists rather than a silent no-op: the engine records every feature as unpublished
 * with the provider's limitation as the reason, and re-parents its stories to the epic.
 * A capability that quietly dropped the level would publish an orphaned backlog and
 * report success.
 *
 * These adapters are in-process implementations that assign identifiers and record what
 * was asked of them. They are the seam a hosted provider client is installed at; the
 * engine cannot tell the difference, which is the point of the SPI.
 */
import type {
  AdapterIdentity, ExecutionAdapter, ProjectAdapter, TestManagementAdapter,
  WorkItemAdapter, WorkItemLevel, WorkItemRequest, WorkItemHandle,
} from '@dbiz/capability-framework';

/** What an adapter was asked to do. Read by the conformance suite, never by the engine. */
export interface AdapterJournal {
  readonly calls: readonly { readonly method: string; readonly detail: string }[];
}

class Journal {
  readonly calls: { method: string; detail: string }[] = [];
  record(method: string, detail: string): void { this.calls.push({ method, detail }); }
}

let sequence = 0;
/** Monotonic within a process. Deterministic, so a conformance run is reproducible. */
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString().padStart(5, '0')}`;
}

/** Reset between conformance runs so identifiers do not drift across tests. */
export function resetAdapterSequence(): void { sequence = 0; }

// ── Azure DevOps ────────────────────────────────────────────────────────────

const ADO_NOUNS: Readonly<Record<WorkItemLevel, string>> = {
  epic: 'Epic', feature: 'Feature', story: 'User Story', task: 'Task',
};

export function azureDevOpsAdapters(): {
  project: ProjectAdapter; testManagement: TestManagementAdapter;
  execution: ExecutionAdapter; workItem: WorkItemAdapter; journal: AdapterJournal;
} {
  const journal = new Journal();
  const identity = (spi: string): AdapterIdentity => ({ spi, provider: 'azure-devops', version: '1.0.0' });
  // ADR-0085 §4.3 — the reference adapter's memory, so that `discoverContainer` can answer
  // `value: null` for a container that does not exist. Without it the absent branch is unreachable.
  const containers = new Map<string, string>();
  const groupings = new Map<string, string>();

  return {
    journal,
    project: {
      identity: identity('ProjectAdapter'),
      containerNoun: 'Test Plan', groupingNoun: 'Test Suite',
      fetchStory: (storyId) => {
        journal.record('fetchStory', storyId);
        return { reached: true, value: { id: storyId, title: `story ${storyId}`, body: '', acceptanceCriteria: [] } };
      },
      linkRequirement: (storyId, requirementId) => {
        journal.record('linkRequirement', `${storyId}->${requirementId}`);
        return { linked: true, via: 'Tested By' };
      },
    },
    testManagement: {
      identity: identity('TestManagementAdapter'),
      // ADR-0085 §4.3. Discovery REMEMBERS rather than materialises: a discovery that created the
      // thing it was asked to find would make `value: null` unreachable in this tree, which is the
      // defect §2.2 measured and the reason the absent branch had never once executed.
      discoverContainer: (name) => {
        journal.record('discoverContainer', name);
        const id = containers.get(name);
        return { reached: true, value: id === undefined ? null : { containerId: id, noun: 'Test Plan' } };
      },
      discoverGrouping: (containerId, name) => {
        journal.record('discoverGrouping', `${containerId}/${name}`);
        const id = groupings.get(`${containerId}/${name}`);
        return { reached: true, value: id === undefined ? null : { groupingId: id, noun: 'Test Suite' } };
      },
      createContainer: (name) => {
        journal.record('createContainer', name);
        const id = nextId('ado-plan');
        containers.set(name, id);
        return { published: true as const, value: { containerId: id, noun: 'Test Plan' } };
      },
      createGrouping: (containerId, name) => {
        journal.record('createGrouping', `${containerId}/${name}`);
        const id = nextId('ado-suite');
        groupings.set(`${containerId}/${name}`, id);
        return { published: true as const, value: { groupingId: id, noun: 'Test Suite' } };
      },
      findExistingTests: (groupingId, fingerprints) => {
        journal.record('findExistingTests', `${groupingId}: ${fingerprints.length} fingerprint(s)`);
        return { reached: true, value: [] };
      },
      publishTests: (groupingId, tests) => {
        journal.record('publishTests', `${groupingId}: ${tests.length} test(s)`);
        return tests.map(() => ({ published: true as const, externalRef: nextId('ado-test') }));
      },
      linkTraceability: (testId, requirementId) => {
        journal.record('linkTraceability', `${testId}->${requirementId}`);
        return { published: true as const, externalRef: `${requirementId}<-${testId}` };
      },
    },
    execution: {
      identity: identity('ExecutionAdapter'),
      publishResult: (testId, outcome) => {
        journal.record('publishResult', `${testId}=${outcome}`);
        return { published: true as const, externalRef: testId };
      },
      publishEvidenceReference: (testId, reference) => {
        journal.record('publishEvidenceReference', `${testId}: ${reference.kind}@${reference.sha256}`);
        return { published: true as const, externalRef: reference.locator || testId };
      },
      publishDefect: (defect) => {
        journal.record('publishDefect', defect.title);
        return { published: true as const, externalRef: nextId('ado-bug') };
      },
    },
    workItem: {
      identity: identity('WorkItemAdapter'),
      nounFor: (level) => ADO_NOUNS[level],
      supports: () => true,
      createWorkItem: (request: WorkItemRequest): WorkItemHandle => {
        journal.record('createWorkItem', `${ADO_NOUNS[request.level]}: ${request.title}`);
        return { workItemId: nextId('ado-wi'), level: request.level, noun: ADO_NOUNS[request.level] };
      },
      linkWorkItemTraceability: (workItemId, testId) => {
        journal.record('linkWorkItemTraceability', `${workItemId}->${testId}`);
        return { linked: true };
      },
    },
  };
}

// ── Jira and Zephyr Scale ───────────────────────────────────────────────────

const JIRA_NOUNS: Readonly<Record<WorkItemLevel, string>> = {
  epic: 'Epic', feature: 'Feature', story: 'Story', task: 'Sub-task',
};

export function jiraAdapters(): {
  project: ProjectAdapter; testManagement: TestManagementAdapter;
  execution: ExecutionAdapter; workItem: WorkItemAdapter; journal: AdapterJournal;
} {
  const journal = new Journal();
  const identity = (spi: string, provider: string): AdapterIdentity => ({ spi, provider, version: '1.0.0' });
  // ADR-0085 §4.3 — the reference adapter's memory, so that `discoverContainer` can answer
  // `value: null` for a container that does not exist. Without it the absent branch is unreachable.
  const containers = new Map<string, string>();
  const groupings = new Map<string, string>();

  return {
    journal,
    project: {
      identity: identity('ProjectAdapter', 'jira'),
      containerNoun: 'Test Cycle', groupingNoun: 'Folder',
      fetchStory: (storyId) => {
        journal.record('fetchStory', storyId);
        return { reached: true, value: { id: storyId, title: `issue ${storyId}`, body: '', acceptanceCriteria: [] } };
      },
      linkRequirement: (storyId, requirementId) => {
        journal.record('linkRequirement', `${storyId}->${requirementId}`);
        return { linked: true, via: 'is tested by' };
      },
    },
    testManagement: {
      identity: identity('TestManagementAdapter', 'zephyr-scale'),
      // ADR-0085 §4.3. Discovery REMEMBERS rather than materialises: a discovery that created the
      // thing it was asked to find would make `value: null` unreachable in this tree, which is the
      // defect §2.2 measured and the reason the absent branch had never once executed.
      discoverContainer: (name) => {
        journal.record('discoverContainer', name);
        const id = containers.get(name);
        return { reached: true, value: id === undefined ? null : { containerId: id, noun: 'Test Cycle' } };
      },
      discoverGrouping: (containerId, name) => {
        journal.record('discoverGrouping', `${containerId}/${name}`);
        const id = groupings.get(`${containerId}/${name}`);
        return { reached: true, value: id === undefined ? null : { groupingId: id, noun: 'Folder' } };
      },
      createContainer: (name) => {
        journal.record('createContainer', name);
        const id = nextId('zephyr-cycle');
        containers.set(name, id);
        return { published: true as const, value: { containerId: id, noun: 'Test Cycle' } };
      },
      createGrouping: (containerId, name) => {
        journal.record('createGrouping', `${containerId}/${name}`);
        const id = nextId('zephyr-folder');
        groupings.set(`${containerId}/${name}`, id);
        return { published: true as const, value: { groupingId: id, noun: 'Folder' } };
      },
      findExistingTests: (groupingId, fingerprints) => {
        journal.record('findExistingTests', `${groupingId}: ${fingerprints.length} fingerprint(s)`);
        return { reached: true, value: [] };
      },
      publishTests: (groupingId, tests) => {
        journal.record('publishTests', `${groupingId}: ${tests.length} test(s)`);
        return tests.map(() => ({ published: true as const, externalRef: nextId('zephyr-test') }));
      },
      linkTraceability: (testId, requirementId) => {
        journal.record('linkTraceability', `${testId}->${requirementId}`);
        return { published: true as const, externalRef: `${requirementId}<-${testId}` };
      },
    },
    execution: {
      identity: identity('ExecutionAdapter', 'zephyr-scale'),
      publishResult: (testId, outcome) => {
        journal.record('publishResult', `${testId}=${outcome}`);
        return { published: true as const, externalRef: testId };
      },
      publishEvidenceReference: (testId, reference) => {
        journal.record('publishEvidenceReference', `${testId}: ${reference.kind}@${reference.sha256}`);
        return { published: true as const, externalRef: reference.locator || testId };
      },
      publishDefect: (defect) => {
        journal.record('publishDefect', defect.title);
        return { published: true as const, externalRef: nextId('jira-bug') };
      },
    },
    workItem: {
      identity: identity('WorkItemAdapter', 'jira'),
      nounFor: (level) => JIRA_NOUNS[level],
      // The real difference between the two providers, and the only one the engine sees.
      supports: (level) => level !== 'feature',
      createWorkItem: (request: WorkItemRequest): WorkItemHandle => {
        journal.record('createWorkItem', `${JIRA_NOUNS[request.level]}: ${request.title}`);
        return { workItemId: nextId('jira-issue'), level: request.level, noun: JIRA_NOUNS[request.level] };
      },
      linkWorkItemTraceability: (workItemId, testId) => {
        journal.record('linkWorkItemTraceability', `${workItemId}->${testId}`);
        return { linked: true };
      },
    },
  };
}
