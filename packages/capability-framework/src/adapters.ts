/**
 * Adapter SPIs — the only permitted locus of variation.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0022 · ADR-0040
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * ONE WORKFLOW. VARIATION ONLY THROUGH ADAPTERS.
 * Azure DevOps and Jira + Zephyr differ in their *nouns* — Test Plan and Test Suite
 * versus Test Cycle and Folder — and not in the order anything happens. The canonical
 * planning sequence is identical for both:
 *
 *     story -> requirement -> container -> grouping -> existing -> new -> traceability -> execution plan
 *
 * The adapter names the container and the grouping. It does not get to reorder, add or
 * skip a step. That is what stops "support Jira" from becoming a second workflow, and
 * then a third, until the canonical one describes nothing that runs.
 *
 * A provider-specific branch in orchestration would be the failure this file exists to
 * prevent, and the conformance gate scans for exactly that.
 */

export interface AdapterIdentity {
  readonly spi: string;
  readonly provider: string;
  readonly version: string;
}

/** The canonical planning sequence. Identical for every provider. */
export const PLANNING_SEQUENCE = [
  'story', 'requirement', 'container', 'grouping',
  'existing-tests', 'new-tests', 'traceability', 'execution-plan',
] as const;
export type PlanningStep = (typeof PLANNING_SEQUENCE)[number];

/**
 * Project adapter — where work items live.
 *
 * `containerNoun` and `groupingNoun` are the entire difference between providers at
 * this layer. Azure DevOps says "Test Plan"/"Test Suite"; Zephyr says
 * "Test Cycle"/"Folder". Same sequence, different vocabulary.
 */
export interface ProjectAdapter {
  readonly identity: AdapterIdentity;
  readonly containerNoun: string;
  readonly groupingNoun: string;
  fetchStory(storyId: string): ReadOutcome<{ id: string; title: string; body: string; acceptanceCriteria: readonly string[] }>;
  linkRequirement(storyId: string, requirementId: string): { linked: true; via: string };
}

/**
 * WHAT A PUBLICATION INTO THE CUSTOMER'S SYSTEM OF RECORD ACTUALLY DID (ADR-0072).
 *
 * Until this type existed, every publication operation returned `{ published: true }` — a
 * type-level literal, so **an adapter could not report a failed publication**: `published: false`
 * did not type-check. The consequence was not local. No layer between the customer's tool and the
 * executive report could represent a failed publication into that customer's system of record,
 * and `synchronisation.ts`'s five `status: 'published'` literals were the only value the SPI
 * permitted a caller to derive (TECHNICAL_DEBT.md D-023).
 *
 * A DISCRIMINATED UNION, for the reason ADR-0071 gives: success carries the external identity it
 * created, failure carries the reason it failed, and neither can be constructed without its half.
 *
 * THIS IS AN OBSERVATION, NOT A JUDGEMENT. `published: false` records what the tool did; whether
 * the run should refuse because of it is the calling domain's decision, and the tool-operating
 * model keeps that decision in the Intelligence Plane rather than in an adapter.
 */
/**
 * A WRITE THAT CARRIES A PAYLOAD, AND CAN REFUSE.
 *
 * `PublicationOutcome` covers writes whose success is an IDENTITY — a link, a suite assignment,
 * an attachment id. These four return a RECORD: the created test case, the created shared step.
 * The two are deliberately NOT collapsed into one type. A union representing both an identity and
 * a record distinguishes neither, which is the undiscriminating-field defect this section spent
 * its length removing (D-013, D-029) expressed in the type meant to fix it.
 *
 * THE `try/catch` AT THE CALL SITE STAYS. A thrown transport error means the tool could not be
 * REACHED; `published: false` means it was reached and REFUSED. Collapsing them would repeat the
 * not-applicable/refused conflation ADR-0071 removed — the third defence of that distinction in
 * this session, at a third altitude.
 */
export type ReadOutcome<T> =
  | { readonly reached: true; readonly value: T }
  | { readonly reached: false; readonly reason: string };

export type WriteOutcome<T> =
  | { readonly published: true; readonly value: T }
  | { readonly published: false; readonly reason: string };

export type PublicationOutcome =
  | { readonly published: true; readonly externalRef: string }
  | { readonly published: false; readonly reason: string };

/** Test management adapter — where test assets live. */
export interface TestManagementAdapter {
  readonly identity: AdapterIdentity;
  /**
   * ADR-0085 §4.3 — **THE DISCOVERY OPERATIONS ARE WHAT MAKE THE TENANT'S DISPOSITION ACTIONABLE
   * RATHER THAN MERELY REPORTABLE, AND THEY ARE THE REASON THIS INTERFACE CHANGED AT ALL.**
   *
   * This SPI could create and never ask; the design-sync SPI (removed with capability 1, ADR-0087)
   * could ask and never create. **The
   * reuse-or-create decision was therefore not implemented incorrectly — it was UNREPRESENTABLE**,
   * because no single port could express both of its branches, and every call site on this port
   * consequently created unconditionally with no prior search. N runs of one story produced N
   * containers, each holding one run's worth of tests, and every one looked correct on the way in.
   *
   * **Widening the two writes below WITHOUT these reads would have left the platform able to report
   * that an unconditional create was refused** — better reporting, and the same decision. The create
   * would still be unconditional, because the port that creates still could not ask.
   *
   * The nesting is ADR-0074's and it carries the whole rule:
   *   `{ reached: true, value: X }`    — the tool answered: here it is.
   *   `{ reached: true, value: null }` — the tool answered: no such container. **A FACT.**
   *   `{ reached: false, reason }`     — the tool was not consulted. **AN ABSENCE OF FACT.**
   *
   * **ONLY `{ reached: true, value: null }` LICENSES A CREATE, UNDER EVERY DISPOSITION.**
   * `{ reached: false }` refuses under every disposition — it is never a create and never a pass.
   * Treating unreached as absent is D-045's harm with a PLAN in place of a test case: a certified
   * decision to create everything the customer already holds, one level up, where the duplicate is
   * the container everything else hangs off.
   */
  discoverContainer(name: string): ReadOutcome<{ readonly containerId: string; readonly noun: string } | null>;
  /** ADR-0085 §4.3. Same nesting: `value: null` is *the tool answered, and there is no such grouping*. */
  discoverGrouping(containerId: string, name: string):
  ReadOutcome<{ readonly groupingId: string; readonly noun: string } | null>;
  /**
   * ADR-0085 §4.3 — widened to `WriteOutcome`, matching the three neighbours below.
   *
   * **D-057's SHAPE, THIRD OCCURRENCE, AT THE SHORTEST POSSIBLE DISTANCE.** `publishTests` and
   * `linkTraceability` were widened by ADR-0072; `findExistingTests` by ADR-0074. Three of five
   * operations widened, **these two passed over — in the same interface, in the same file both ADRs
   * edited, four lines away.** D-057's own finding applies and is what makes this worth a comment
   * rather than a changelog line: **the count is not the finding; the absence of a recorded boundary
   * is.** The exclusion was not a package away. It was two lines away, twice.
   *
   * Before this, a caller had to treat every return as success, so **even a correctly-licensed
   * create could not report that the customer's tool declined it.**
   */
  createContainer(name: string): WriteOutcome<{ containerId: string; noun: string }>;
  createGrouping(containerId: string, name: string): WriteOutcome<{ groupingId: string; noun: string }>;
  findExistingTests(groupingId: string, fingerprints: readonly string[]): ReadOutcome<readonly string[]>;
  /**
   * ONE OUTCOME PER TEST, positionally aligned with `tests`. Previously `readonly string[]`,
   * which could express partial success only by being short — and a short array cannot say WHICH
   * test was not accepted, so the caller guessed with `?? testCase.id`.
   */
  publishTests(groupingId: string, tests: readonly { id: string; title: string }[]): readonly PublicationOutcome[];
  linkTraceability(testId: string, requirementId: string): PublicationOutcome;
}

// ── Design-time synchronisation ─────────────────────────────────────

/**
 * `TestDesignSyncAdapter` AND ITS TYPES (`TestCaseSpec`, `SyncedTestCase`, `DesignAttachmentRef`)
 * WERE REMOVED WITH THE FUNCTIONAL TESTING CAPABILITY (ADR-0087).
 *
 * The design-time synchronisation SPI existed to push authored test cases, shared steps, shared
 * parameters, tags, classifications and design attachments into a customer's test-management tool.
 * Every one of its fifteen methods was invoked from the Functional Testing Engine and from nowhere
 * else, and no surviving capability implemented the interface at all — the whole port was reachable
 * only through capability 1.
 *
 * It is deleted rather than kept as a declared-but-unused port because this framework gates on
 * exactly that: `every declared adapter SPI method is invoked by at least one capability`. A port
 * left standing with no caller does not read as dead code — it reads as a capability the platform
 * still offers, which is R-11.14's failure mode one level down from the registry.
 */


/** Execution adapter — publishing results and evidence REFERENCES, never artefacts. */
export interface ExecutionAdapter {
  readonly identity: AdapterIdentity;
  publishResult(testId: string, outcome: 'passed' | 'failed' | 'skipped'): PublicationOutcome;
  /**
   * Evidence is published by REFERENCE.
   *
   * Screenshots, video, HAR and traces are Execution Plane custody. What crosses is a
   * hash and a locator, never the artefact — which is what keeps E-5 non-retention
   * true while still letting a defect carry its evidence.
   */
  publishEvidenceReference(testId: string, reference: { sha256: string; locator: string; kind: string }): PublicationOutcome;
  /** Success carries the defect id the customer's tool assigned, as `externalRef`. */
  publishDefect(defect: { title: string; testId: string; rootCause: string; evidenceRefs: readonly string[] }): PublicationOutcome;
}

/**
 * The canonical work-item hierarchy. Identical for every provider.
 *
 * Azure DevOps calls the third level a User Story and the fourth a Task; Jira calls them
 * Story and Sub-task and adds components and labels. Same four levels, same parentage,
 * different vocabulary — so the hierarchy is declared once here and the adapter supplies
 * the nouns, exactly as `containerNoun` and `groupingNoun` already do for test assets.
 */
export const WORK_ITEM_LEVELS = ['epic', 'feature', 'story', 'task'] as const;
export type WorkItemLevel = (typeof WORK_ITEM_LEVELS)[number];

export interface WorkItemRequest {
  readonly level: WorkItemLevel;
  readonly title: string;
  readonly description: string;
  /** The parent's provider-assigned id. `null` only for an epic. */
  readonly parentId: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
}

export interface WorkItemHandle {
  readonly workItemId: string;
  readonly level: WorkItemLevel;
  readonly noun: string;
}

/**
 * Work item adapter — where reconstructed requirements are published.
 *
 * Separate from `ProjectAdapter` rather than bolted onto it. A capability that reads
 * stories and one that writes an epic hierarchy need different things, and widening the
 * existing SPI would have obliged every capability to implement methods it never calls —
 * which is the declared-but-unwired pattern this platform has already audited once.
 */
export interface WorkItemAdapter {
  readonly identity: AdapterIdentity;
  /** The provider's name for each level, e.g. story -> "User Story" or "Story". */
  nounFor(level: WorkItemLevel): string;
  /** Does the provider model this level at all? Jira has no Feature in a team-managed project. */
  supports(level: WorkItemLevel): boolean;
  createWorkItem(request: WorkItemRequest): WorkItemHandle;
  linkWorkItemTraceability(workItemId: string, testId: string): { linked: true };
}

/**
 * Source control adapter — where commits, branches, pull requests and diffs live.
 *
 * Separate from `ProjectAdapter` rather than bolted onto it, for the reason recorded on
 * `WorkItemAdapter`: widening an existing SPI obliges every capability to implement
 * methods it never calls, which is the declared-but-unwired pattern this platform has
 * already audited once.
 *
 * EVERY METHOD RETURNS EXECUTION PLANE CUSTODY. A diff is source code. This SPI is
 * implemented and invoked in the Execution Plane, and what the Intelligence Plane
 * receives is a minimised projection produced there — never one of these return values.
 * GitHub, GitLab, Bitbucket and Azure DevOps Repos differ in their nouns and in nothing
 * else: same sequence, different vocabulary.
 */
export interface SourceControlAdapter {
  readonly identity: AdapterIdentity;
  /** The provider's name for a merge request, e.g. "Pull Request" or "Merge Request". */
  readonly changeRequestNoun: string;
  listBranches(repository: string): ReadOutcome<readonly { name: string; headCommit: string; isDefault: boolean }[]>;
  /** ADR-0074. `value: null` is *no such change request*; `reached: false` is *never asked*. */
  findChangeRequest(repository: string, id: string):
  ReadOutcome<{ id: string; title: string; sourceBranch: string; targetBranch: string; state: string; linkedWorkItemIds: readonly string[] } | null>;
  listCommits(repository: string, baseCommit: string, headCommit: string):
  ReadOutcome<readonly { sha: string; message: string; authorEmail: string; authorName: string; parents: readonly string[]; changedPaths: readonly string[] }[]>;
  /** The diff. Source text — Execution Plane custody, permanently. */
  diff(repository: string, baseCommit: string, headCommit: string): readonly {
    path: string; previousPath: string | null; changeKind: string;
    hunks: readonly { startLine: number; addedLines: readonly string[]; removedLines: readonly string[] }[];
    symbolsAdded: readonly string[]; symbolsRemoved: readonly string[]; symbolsModified: readonly string[];
    imports: readonly string[]; exports: readonly string[];
  }[];
  /** Paths that historically change together with this one. Metadata, not content. */
  coChangedWith(repository: string, path: string): readonly { path: string; occurrences: number }[];
}

// ── ADR-0040 Wave 2 — the remaining connector SPI families ──────────────────
// Capability-neutral: these define BEHAVIOUR only. They name no provider, no
// application kind, no report format and no AI vendor. A provider implements one
// of these; the SPI never mentions it (C-14.1, G-7/G-16). Credentials and tokens
// cross only as REFERENCES (INV-2) — no plaintext secret is named or returned.

/**
 * Authentication SPI — identity acquisition, authentication, token lifecycle,
 * credential validation and session establishment.
 */
export interface AuthenticationAdapter {
  readonly identity: AdapterIdentity;
  acquireIdentity(request: { readonly principalRef: string; readonly scopeRefs: readonly string[] }): { readonly identityRef: string };
  authenticate(identityRef: string, credentialRef: string): { readonly authenticated: boolean; readonly reason: string };
  validateCredential(credentialRef: string): { readonly valid: boolean; readonly reason: string };
  issueToken(identityRef: string): { readonly tokenRef: string; readonly expiresAt: number };
  refreshToken(tokenRef: string): { readonly tokenRef: string; readonly expiresAt: number };
  revokeToken(tokenRef: string): { readonly revoked: true };
  establishSession(tokenRef: string): { readonly sessionRef: string };
}

/**
 * Application Strategy SPI — how a capability discovers, navigates, interacts
 * with, locates within, synchronises against and plans execution over an
 * application. The application kind is a tenant-configured label, never a brand.
 */
export interface ApplicationStrategyAdapter {
  readonly identity: AdapterIdentity;
  readonly applicationKindRef: string;
  discover(target: { readonly targetRef: string }): { readonly surfaces: readonly string[] };
  navigate(sessionRef: string, destination: string): { readonly navigated: boolean; readonly location: string };
  interact(sessionRef: string, action: { readonly verb: string; readonly locatorRef: string; readonly value: string | null }): { readonly acted: boolean };
  locate(sessionRef: string, descriptor: { readonly strategy: string; readonly query: string }): { readonly locatorRef: string | null };
  synchronize(sessionRef: string, condition: { readonly kind: string; readonly timeoutMs: number }): { readonly settled: boolean };
  planExecution(objective: { readonly steps: readonly string[] }): { readonly ordered: readonly string[] };
}

/**
 * Reporting SPI — rendering a canonical report model, publishing, persisting and
 * transporting it, and publishing evidence by reference. Format and channel are
 * references, never a concrete brand.
 */
export interface ReportingAdapter {
  readonly identity: AdapterIdentity;
  readonly formatRef: string;
  render(model: { readonly kind: string; readonly sections: readonly string[] }): { readonly reportRef: string; readonly mediaTypeRef: string };
  publish(reportRef: string, destination: { readonly channelRef: string }): { readonly published: true; readonly locator: string };
  persist(reportRef: string): { readonly stored: true; readonly locator: string };
  transport(reportRef: string, channelRef: string): { readonly delivered: boolean };
  publishEvidenceReference(reference: { readonly sha256: string; readonly locator: string; readonly kind: string }): { readonly published: true };
}

/** SPI governance metadata (ADR-0040 §4.4 G-7). Declared for every connector SPI. */
export interface ConnectorSpiDescriptor {
  readonly id: string;
  readonly version: string;
  readonly owner: string;
  readonly requiredOperations: readonly string[];
  readonly optionalOperations: readonly string[];
  readonly supportedOperations: readonly string[];
  readonly failureSemantics: string;
  readonly retrySemantics: string;
  readonly securityModel: string;
  readonly authenticationRequirements: string;
  readonly capabilityNeutral: true;
  readonly stability: 'experimental' | 'internal' | 'stable' | 'deprecated' | 'removed';
  readonly dependsOn: readonly string[];
}

export const CONNECTOR_SPI_DESCRIPTORS: readonly ConnectorSpiDescriptor[] = [
  {
    id: 'AuthenticationAdapter', version: '1.0.0', owner: '@dbiz/capability-framework',
    requiredOperations: ['acquireIdentity', 'authenticate', 'issueToken', 'establishSession'],
    optionalOperations: ['refreshToken', 'revokeToken', 'validateCredential'],
    supportedOperations: ['acquireIdentity', 'authenticate', 'validateCredential', 'issueToken', 'refreshToken', 'revokeToken', 'establishSession'],
    failureSemantics: 'a wrong credential returns authenticated:false with a reason; it never throws for a rejected credential',
    retrySemantics: 'reads are idempotent and may retry; token issuance is single-attempt per identity request',
    securityModel: 'credential references only; no plaintext secret crosses the boundary',
    authenticationRequirements: 'the caller supplies a credential reference resolved from a vault; the SPI never holds a secret',
    capabilityNeutral: true, stability: 'stable', dependsOn: [],
  },
  {
    id: 'ApplicationStrategyAdapter', version: '1.0.0', owner: '@dbiz/capability-framework',
    requiredOperations: ['discover', 'navigate', 'interact', 'locate', 'synchronize', 'planExecution'],
    optionalOperations: [],
    supportedOperations: ['discover', 'navigate', 'interact', 'locate', 'synchronize', 'planExecution'],
    failureSemantics: 'a failed interaction or unmet synchronisation returns a negative flag with a location/condition; it does not throw',
    retrySemantics: 'navigation and synchronisation are retryable to a timeout; interaction is single-attempt',
    securityModel: 'operates only within an established session reference; holds no credential',
    authenticationRequirements: 'requires a session reference produced by the Authentication SPI',
    capabilityNeutral: true, stability: 'stable', dependsOn: ['AuthenticationAdapter'],
  },
  {
    id: 'ReportingAdapter', version: '1.0.0', owner: '@dbiz/capability-framework',
    requiredOperations: ['render', 'publish', 'persist', 'publishEvidenceReference'],
    optionalOperations: ['transport'],
    supportedOperations: ['render', 'publish', 'persist', 'transport', 'publishEvidenceReference'],
    failureSemantics: 'a failed transport returns delivered:false; render/persist either succeed or throw an AdapterError',
    retrySemantics: 'publish/persist are idempotent by report reference and may retry; render is deterministic',
    securityModel: 'evidence is published by reference (hash + locator); no artefact payload crosses',
    authenticationRequirements: 'requires a channel reference the tenant has authorised; holds no credential',
    capabilityNeutral: true, stability: 'stable', dependsOn: [],
  },
];

export interface AdapterSet {
  readonly project: ProjectAdapter;
  readonly testManagement: TestManagementAdapter;
  readonly execution: ExecutionAdapter;
}

export class AdapterError extends Error {
  constructor(public readonly spi: string, message: string) {
    super(`adapter ${spi}: ${message}`);
    this.name = 'AdapterError';
  }
}

/**
 * Adapter resolution — configuration, never a code path (C-15.x).
 *
 * The orchestrator asks for a provider by name and receives an implementation. It does
 * not know which one it got, and it must not: an orchestrator that can name a provider
 * can branch on it, and one that can branch on it will.
 */
export class AdapterRegistry {
  private readonly projects = new Map<string, ProjectAdapter>();
  private readonly testManagement = new Map<string, TestManagementAdapter>();
  private readonly executions = new Map<string, ExecutionAdapter>();
  private readonly workItems = new Map<string, WorkItemAdapter>();
  private readonly sourceControl = new Map<string, SourceControlAdapter>();

  registerProject(a: ProjectAdapter): void { this.projects.set(a.identity.provider, a); }
  registerTestManagement(a: TestManagementAdapter): void { this.testManagement.set(a.identity.provider, a); }
  registerExecution(a: ExecutionAdapter): void { this.executions.set(a.identity.provider, a); }
  registerWorkItem(a: WorkItemAdapter): void { this.workItems.set(a.identity.provider, a); }
  registerSourceControl(a: SourceControlAdapter): void { this.sourceControl.set(a.identity.provider, a); }


  /**
   * Resolve the source-control adapter.
   *
   * Keyed on `sourceControl.provider` rather than on the project provider: a tenant may
   * plan work in Azure DevOps and host code in GitHub, and a resolution that could not
   * express that would force one of the two into a code branch.
   */
  resolveSourceControl(config: Readonly<Record<string, string>>): SourceControlAdapter {
    const provider = config['sourceControl.provider'] ?? '';
    const adapter = this.sourceControl.get(provider);
    if (!adapter) {
      throw new AdapterError('SourceControlAdapter',
        `no provider "${provider || '(unset)'}" for key "sourceControl.provider"; available: ${[...this.sourceControl.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }

  /**
   * Resolve the work-item adapter.
   *
   * Separate from `resolve` so a capability that publishes no work items is not obliged
   * to configure one. It selects on `project.provider`: work items live in the project
   * tool, and a configuration that could point them elsewhere would let an epic and its
   * stories land in different systems.
   */
  resolveWorkItem(config: Readonly<Record<string, string>>): WorkItemAdapter {
    const provider = config['project.provider'] ?? '';
    const adapter = this.workItems.get(provider);
    if (!adapter) {
      throw new AdapterError('WorkItemAdapter',
        `no provider "${provider || '(unset)'}" for key "project.provider"; available: ${[...this.workItems.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }

  resolve(config: Readonly<Record<string, string>>): AdapterSet {
    const project = this.projects.get(config['project.provider'] ?? '');
    const testManagement = this.testManagement.get(config['testManagement.provider'] ?? '');
    const execution = this.executions.get(config['execution.provider'] ?? '');

    // Named refusals. "Adapter not found" sends someone to read source; naming the
    // configuration key and what is available does not.
    if (!project) {
      throw new AdapterError('ProjectAdapter',
        `no provider "${config['project.provider'] ?? '(unset)'}"; available: ${[...this.projects.keys()].join(', ') || 'none'}`);
    }
    if (!testManagement) {
      throw new AdapterError('TestManagementAdapter',
        `no provider "${config['testManagement.provider'] ?? '(unset)'}"; available: ${[...this.testManagement.keys()].join(', ') || 'none'}`);
    }
    if (!execution) {
      throw new AdapterError('ExecutionAdapter',
        `no provider "${config['execution.provider'] ?? '(unset)'}"; available: ${[...this.executions.keys()].join(', ') || 'none'}`);
    }
    return { project, testManagement, execution };
  }

  get providers(): { project: readonly string[]; testManagement: readonly string[]; execution: readonly string[]; workItem: readonly string[]; sourceControl: readonly string[] } {
    return {
      project: [...this.projects.keys()].sort(),
      testManagement: [...this.testManagement.keys()].sort(),
      execution: [...this.executions.keys()].sort(),
      workItem: [...this.workItems.keys()].sort(),
      sourceControl: [...this.sourceControl.keys()].sort(),
    };
  }
}
