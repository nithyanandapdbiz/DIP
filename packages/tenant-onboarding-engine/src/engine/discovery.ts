/**
 * Discovery — normalise edge-supplied metadata into the existing configuration model.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §5 (ownership split) · 06-data-sovereignty.md
 *   ADR          : ADR-0031 §Discovery-at-the-edge
 *   Invariant    : INV-2 (no customer credential in the IP) · INV-3 (the IP never dials a customer system)
 *
 * DISCOVERY EXECUTES AT THE CUSTOMER EDGE; THE IP NORMALISES ITS RESULT.
 * The credentialed calls to Jira, Azure DevOps and source control happen in the customer's
 * browser or a customer-tenancy runner, which holds the token. What reaches the Intelligence
 * Plane is *non-secret metadata* — project names, board ids, repository lists, a detected
 * framework. These services turn that metadata into the customer-owned configuration columns.
 *
 * There is deliberately NO function here that accepts a credential and calls a provider. A
 * discovery service the IP could run with a token would be the INV-2 violation this design
 * exists to prevent. The seam is `EdgeDiscovery`: the IP asks the edge for metadata by
 * correlation id; the token is never a parameter.
 */

/** Non-secret metadata the edge returns for a project-management provider (Jira / Azure DevOps). */
export interface ProjectManagementMetadata {
  readonly provider: 'jira' | 'azure-devops';
  readonly projects: readonly { readonly key: string; readonly name: string; readonly recentActivity?: number }[];
  readonly boards?: readonly { readonly id: string; readonly projectKey: string }[];
  readonly repositories?: readonly string[];
}

/** Non-secret metadata for a test-management provider. */
export interface TestManagementMetadata {
  readonly provider: 'zephyr-essential' | 'zephyr-scale' | 'xray' | 'testrail' | 'azure-test-plans';
  readonly projectKeys: readonly string[];
}

/** Non-secret metadata for a source-control provider, incl. detected automation. */
export interface SourceControlMetadata {
  readonly provider: 'github' | 'azure-repos' | 'gitlab';
  readonly repositories: readonly {
    readonly name: string;
    readonly defaultBranch: string;
    readonly detectedFramework?: 'playwright' | 'cypress' | 'selenium' | null;
    readonly hasCiPipeline?: boolean;
  }[];
}

/** Non-secret metadata about the application under test. */
export interface ApplicationMetadata {
  readonly applicationName: string;
  readonly environments: readonly { readonly name: string; readonly url: string }[];
  readonly authenticationType: string;
  readonly browserRequirements?: readonly string[];
  readonly apiEndpoints?: readonly string[];
}

/** Everything the edge has discovered so far, accumulated on the session. */
export interface DiscoveredMetadata {
  projectManagement?: ProjectManagementMetadata;
  testManagement?: TestManagementMetadata;
  sourceControl?: SourceControlMetadata;
  application?: ApplicationMetadata;
}

/**
 * The edge seam. The IP calls this to obtain metadata for a connected provider. A concrete
 * implementation lives at the customer edge and holds the token; the IP holds only this
 * interface and a correlation id. No credential crosses it.
 */
export interface EdgeDiscovery {
  discover(kind: keyof DiscoveredMetadata, sessionId: string): Promise<
    ProjectManagementMetadata | TestManagementMetadata | SourceControlMetadata | ApplicationMetadata
  >;
}

// ── Normalisers: metadata → partial customer-owned configuration ─────────────
// Each maps discovered facts to the EXISTING schema fields. They decide nothing that
// validation or recommendation owns; they only populate.

export interface ProjectManagementConfig {
  readonly provider: 'jira' | 'azure-devops' | 'none';
  readonly project?: string;
  readonly board?: string;
  readonly repository?: string;
}

export interface TestManagementConfig {
  readonly provider: 'zephyr-essential' | 'zephyr-scale' | 'xray' | 'testrail' | 'azure-test-plans' | 'none';
  readonly projectKey?: string;
}

export interface ApplicationConfig {
  readonly applicationName: string;
  readonly applicationUrl: string;
  readonly authenticationType: string;
  readonly browserRequirements: readonly string[];
}

/** Jira / Azure DevOps → project-management config. Picks the most-active project as the default. */
export function normaliseProjectManagement(md: ProjectManagementMetadata): ProjectManagementConfig {
  const ranked = [...md.projects].sort((a, b) => (b.recentActivity ?? 0) - (a.recentActivity ?? 0));
  const chosen = ranked[0];
  const board = md.boards?.find((b) => b.projectKey === chosen?.key)?.id;
  return {
    provider: md.provider,
    ...(chosen ? { project: chosen.key } : {}),
    ...(board ? { board } : {}),
    ...(md.repositories && md.repositories[0] ? { repository: md.repositories[0] } : {}),
  };
}

/** Test-management metadata → config. Every discovered TM provider is a first-class config provider. */
export function normaliseTestManagement(md: TestManagementMetadata): TestManagementConfig {
  const key = md.projectKeys[0];
  return { provider: md.provider, ...(key ? { projectKey: key } : {}) };
}

/** Source-control metadata → a detected framework and repository, for the technology profile. */
export function detectFramework(md: SourceControlMetadata): 'playwright' | 'selenium' | null {
  for (const r of md.repositories) {
    if (r.detectedFramework === 'playwright') return 'playwright';
    if (r.detectedFramework === 'selenium') return 'selenium';
    // Cypress is not in the SUPPORTED matrix; it is surfaced but not selected.
  }
  return null;
}

/** Application metadata → application config, choosing the first environment as primary. */
export function normaliseApplication(md: ApplicationMetadata): ApplicationConfig | null {
  const env = md.environments[0];
  if (!env) return null;
  return {
    applicationName: md.applicationName,
    applicationUrl: env.url,
    authenticationType: md.authenticationType,
    browserRequirements: md.browserRequirements ?? [],
  };
}

/**
 * A simulated edge for tests and demos. It fabricates plausible, entirely synthetic
 * metadata and holds no credential — it stands in for the customer-side connector so the
 * IP path can be exercised end to end without a live provider (and without a secret).
 */
export class SimulatedEdge implements EdgeDiscovery {
  async discover(kind: keyof DiscoveredMetadata, _sessionId: string): Promise<
    ProjectManagementMetadata | TestManagementMetadata | SourceControlMetadata | ApplicationMetadata
  > {
    switch (kind) {
      case 'projectManagement':
        return {
          provider: 'jira',
          projects: [{ key: 'CARL', name: 'Carlisle Portal', recentActivity: 42 }, { key: 'OLD', name: 'Legacy', recentActivity: 1 }],
          boards: [{ id: 'board-9', projectKey: 'CARL' }],
          repositories: ['carlisle-portal'],
        } satisfies ProjectManagementMetadata;
      case 'testManagement':
        return { provider: 'zephyr-scale', projectKeys: ['CARL'] } satisfies TestManagementMetadata;
      case 'sourceControl':
        return {
          provider: 'github',
          repositories: [{ name: 'carlisle-portal', defaultBranch: 'main', detectedFramework: 'playwright', hasCiPipeline: true }],
        } satisfies SourceControlMetadata;
      case 'application':
        return {
          applicationName: 'Carlisle Portal',
          environments: [{ name: 'test', url: 'https://portal.example.test' }],
          authenticationType: 'oauth',
          browserRequirements: ['chromium'],
        } satisfies ApplicationMetadata;
      default: {
        const exhaustive: never = kind;
        throw new Error(`unknown discovery kind ${String(exhaustive)}`);
      }
    }
  }
}
