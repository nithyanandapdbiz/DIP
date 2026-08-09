/**
 * The Dev-Change domain model, and the one place the sovereignty boundary is crossed.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 09-data-flow-model.md · 10-evidence-flow-model.md
 *                  19-repository-ownership.md
 *   ADR          : ADR-0024 §3.4
 *   Criteria     : C-6.x (classification and residency) · C-10.x (evidence by reference)
 *
 * THE HARDEST SOVEREIGNTY PROBLEM ANY CAPABILITY HAS HAD.
 * The Intelligence Plane must reason about a code change, and a code change *is* source.
 * "Nothing crosses" was not available as an answer, and neither was "the diff crosses".
 *
 * The line is between STRUCTURE and CONTENT, and it is drawn here in the type system:
 *
 *   ChangedFile  — Execution Plane. Has `hunks`, and a hunk has `addedLines: string[]`.
 *                  That is source text. Nothing in the Intelligence Plane accepts one.
 *   ChangeFact   — Intelligence Plane. Has `symbolsAdded: string[]` — identifier NAMES —
 *                  and counts. It has nowhere to put a line of source.
 *
 * A function's name is structure and crosses. A function's body is content and cannot,
 * because `ChangeFact` has no field that could hold it. A future change that wanted to
 * smuggle a body across would have to ADD A FIELD, which is a reviewable act rather than
 * an invisible one.
 *
 * `minimise` is the sole crossing point. Auditing what crosses means auditing one
 * function rather than every agent that ever touched a diff.
 */

// ── Execution Plane custody ─────────────────────────────────────────────────

/** What triggered the run. The only input the Intelligence Plane originates. */
export interface RepositoryEvent {
  readonly kind: 'push' | 'pull-request' | 'merge' | 'tag' | 'manual';
  readonly repository: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly pullRequestId: string | null;
  readonly headCommit: string;
  readonly baseCommit: string;
}

export interface Branch {
  readonly name: string;
  readonly headCommit: string;
  readonly isDefault: boolean;
}

export interface PullRequest {
  readonly id: string;
  readonly title: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly state: 'open' | 'merged' | 'closed';
  readonly linkedWorkItemIds: readonly string[];
}

/**
 * A commit as the Execution Plane holds it.
 *
 * `message` and `authorEmail` are here and NOT on the Intelligence Plane projection.
 * A commit message routinely carries customer names, ticket bodies and occasionally a
 * pasted credential; an author email is personal data under document 06.
 */
export interface CommitRecord {
  readonly sha: string;
  readonly message: string;
  readonly authorEmail: string;
  readonly authorName: string;
  readonly parents: readonly string[];
  readonly changedPaths: readonly string[];
}

/** A diff hunk. `addedLines` and `removedLines` are SOURCE. Execution Plane, permanently. */
export interface DiffHunk {
  readonly startLine: number;
  readonly addedLines: readonly string[];
  readonly removedLines: readonly string[];
}

/**
 * A changed file, with its diff. Execution Plane custody, permanently.
 *
 * Nothing in the Intelligence Plane accepts a `ChangedFile`, and the compiler enforces
 * that rather than a review comment.
 */
export interface ChangedFile {
  readonly path: string;
  readonly previousPath: string | null;
  readonly changeKind: ChangeKind;
  readonly hunks: readonly DiffHunk[];
  /** Symbols the Execution Plane's parser found, by name. Names only, already. */
  readonly symbolsAdded: readonly string[];
  readonly symbolsRemoved: readonly string[];
  readonly symbolsModified: readonly string[];
  /** Imports the file declares, as module specifiers. Structure. */
  readonly imports: readonly string[];
  readonly exports: readonly string[];
}

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed';

/** A test or automation asset the Execution Plane found in the customer repository. */
export interface RepositoryAsset {
  readonly id: string;
  readonly kind: RepositoryAssetKind;
  /** The asset's text. EP-resident — it is indexed there and never sent. */
  readonly text: string;
  readonly path: string;
  readonly repository: string;
  /** Source paths this asset is known to exercise. */
  readonly covers: readonly string[];
}

export type RepositoryAssetKind =
  | 'test-case' | 'feature-file' | 'page-object' | 'component' | 'locator'
  | 'api-test' | 'data-file' | 'test-data' | 'step-definition' | 'fixture';

/** What the Execution Plane observed when it ran a test. */
export interface ObservedExecution {
  readonly testId: string;
  readonly outcome: Outcome;
  readonly durationMs: number;
  /** The failure signal, already scrubbed by the EP. `null` when it passed. */
  readonly failureSignal: string | null;
  readonly attempt: number;
}

export type Outcome = 'passed' | 'failed' | 'skipped';

// ── The crossing point ──────────────────────────────────────────────────────

/**
 * The minimised projection that crosses into the Intelligence Plane.
 *
 * Note what is absent: there is no `hunks`, no line of source, no commit message and no
 * author. `symbols*` are identifier names. `addedLineCount` is a number.
 */
export interface ChangeFact {
  readonly path: string;
  readonly previousPath: string | null;
  readonly changeKind: ChangeKind;
  readonly language: string;
  readonly layer: CodeLayer;
  readonly symbolsAdded: readonly string[];
  readonly symbolsRemoved: readonly string[];
  readonly symbolsModified: readonly string[];
  readonly imports: readonly string[];
  readonly exports: readonly string[];
  readonly addedLineCount: number;
  readonly removedLineCount: number;
  readonly hunkCount: number;
  /** Crude structural churn. A number, derived; never the code it was derived from. */
  readonly churn: number;
}

/** Where in the stack a file sits. Derived from its path, deterministically. */
export type CodeLayer =
  | 'ui' | 'api' | 'domain' | 'data' | 'configuration' | 'infrastructure'
  | 'test' | 'build' | 'documentation' | 'unknown';

/**
 * A commit as the Intelligence Plane sees it.
 *
 * No message, no author email. `messageShape` records what KIND of message it was —
 * conventional-commit type and whether it referenced a work item — which is the only
 * part any agent actually reasons over.
 */
export interface CommitFact {
  readonly sha: string;
  readonly parentCount: number;
  readonly changedPathCount: number;
  readonly messageShape: {
    readonly conventionalType: string | null;
    readonly referencesWorkItem: boolean;
    readonly breakingMarker: boolean;
  };
}

const LAYER_RULES: readonly { readonly test: RegExp; readonly layer: CodeLayer }[] = [
  { test: /(^|\/)(test|tests|spec|specs|__tests__|e2e)(\/|$)|\.(test|spec)\.[a-z]+$/i, layer: 'test' },
  { test: /\.(md|mdx|rst|adoc|txt)$/i, layer: 'documentation' },
  { test: /(^|\/)(\.github|ci|pipelines?|deploy|docker|k8s|helm|terraform)(\/|$)|dockerfile|\.tf$/i, layer: 'infrastructure' },
  { test: /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig.*\.json|makefile|\.eslintrc.*|webpack\..*)$/i, layer: 'build' },
  { test: /\.(ya?ml|toml|ini|env|properties|config\.[a-z]+)$/i, layer: 'configuration' },
  { test: /(^|\/)(migrations?|schema|entities|repositor(y|ies)|dao)(\/|$)|\.sql$/i, layer: 'data' },
  { test: /(^|\/)(controllers?|routes?|api|endpoints?|handlers?|graphql)(\/|$)/i, layer: 'api' },
  { test: /\.(tsx|jsx|vue|svelte|html|s?css|less)$/i, layer: 'ui' },
  { test: /(^|\/)(components?|pages?|views?|widgets?)(\/|$)/i, layer: 'ui' },
  { test: /(^|\/)(domain|services?|models?|core|business|usecases?)(\/|$)/i, layer: 'domain' },
];

/** The layer a path sits in. Ordered rules, first match wins — deterministic. */
export function layerOf(path: string): CodeLayer {
  for (const rule of LAYER_RULES) if (rule.test.test(path)) return rule.layer;
  return 'unknown';
}

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  cs: 'csharp', java: 'java', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', php: 'php',
  kt: 'kotlin', swift: 'swift', sql: 'sql', yaml: 'yaml', yml: 'yaml', json: 'json',
  html: 'html', css: 'css', scss: 'css', md: 'markdown', tf: 'terraform', sh: 'shell',
};

export function languageOf(path: string): string {
  const extension = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'unknown';
}

/**
 * Minimise a changed file into a fact. THE SINGLE CROSSING POINT.
 *
 * Everything the Intelligence Plane knows about a code change passed through here.
 * `hunks` is read for its COUNTS and its LENGTHS and is never carried forward — the
 * returned object has no field it could be assigned to.
 */
export function minimise(file: ChangedFile): ChangeFact {
  const addedLineCount = file.hunks.reduce((n, h) => n + h.addedLines.length, 0);
  const removedLineCount = file.hunks.reduce((n, h) => n + h.removedLines.length, 0);
  return {
    path: file.path,
    previousPath: file.previousPath,
    changeKind: file.changeKind,
    language: languageOf(file.path),
    layer: layerOf(file.path),
    symbolsAdded: [...file.symbolsAdded].sort(),
    symbolsRemoved: [...file.symbolsRemoved].sort(),
    symbolsModified: [...file.symbolsModified].sort(),
    imports: [...file.imports].sort(),
    exports: [...file.exports].sort(),
    addedLineCount,
    removedLineCount,
    hunkCount: file.hunks.length,
    churn: addedLineCount + removedLineCount,
  };
}

const CONVENTIONAL = /^(feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert)(\([^)]*\))?!?:/i;
const WORK_ITEM = /\b(?:[A-Z][A-Z0-9]+-\d+|#\d+|AB#\d+)\b/;

/**
 * Minimise a commit. The message is READ here and never carried.
 *
 * What survives is its shape: the conventional-commit type, whether it cited a work
 * item, and whether it carried a breaking-change marker. That is genuinely all any agent
 * reasons over, and it is the difference between a classifier and an exfiltration path.
 */
export function minimiseCommit(commit: CommitRecord): CommitFact {
  const conventional = CONVENTIONAL.exec(commit.message);
  return {
    sha: commit.sha,
    parentCount: commit.parents.length,
    changedPathCount: commit.changedPaths.length,
    messageShape: {
      conventionalType: conventional?.[1]?.toLowerCase() ?? null,
      referencesWorkItem: WORK_ITEM.test(commit.message),
      breakingMarker: /!:/.test(commit.message) || /BREAKING[ -]CHANGE/i.test(commit.message),
    },
  };
}

// ── Intelligence Plane domain ───────────────────────────────────────────────

export type ChangeCategory =
  | 'business' | 'functional' | 'technical' | 'api' | 'database' | 'configuration'
  | 'infrastructure' | 'ui' | 'breaking' | 'behaviour' | 'dependency' | 'risk';

export interface ClassifiedChange {
  readonly path: string;
  readonly categories: readonly ChangeCategory[];
  readonly rationale: string;
  /** Which fact produced it. Traceability without carrying the fact. */
  readonly sourceFactPath: string;
}

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'import' | 'export-consumer' | 'co-change' | 'test-covers';
  /** 0..1. Deterministically derived; reasoning may reorder, never originate. */
  readonly strength: number;
}

export interface ImpactedModule {
  readonly module: string;
  readonly paths: readonly string[];
  readonly directly: boolean;
  readonly depth: number;
}

export interface BusinessImpact {
  readonly module: string;
  readonly capability: string;
  readonly userJourneys: readonly string[];
  readonly criticality: 'critical' | 'high' | 'medium' | 'low';
  readonly customerFacing: boolean;
  readonly crossModule: readonly string[];
  readonly rationale: string;
}

export interface RiskAssessment {
  readonly subject: string;
  readonly band: 'critical' | 'high' | 'medium' | 'low';
  readonly score: number;
  readonly factors: readonly string[];
  readonly releaseRisk: boolean;
}

export interface CoverageAssessment {
  readonly path: string;
  readonly coveredBy: readonly string[];
  readonly covered: boolean;
  readonly gap: string | null;
}

/** A test the engine has decided must run or must exist. */
export interface TestCandidate {
  readonly id: string;
  readonly title: string;
  readonly targetPath: string;
  readonly kind: RepositoryAssetKind;
  readonly reason: string;
  readonly priority: 'P1' | 'P2' | 'P3';
}

export interface RepositoryMatch {
  readonly candidateId: string;
  readonly assetId: string;
  readonly assetKind: RepositoryAssetKind;
  readonly score: number;
  readonly method: 'path' | 'symbol' | 'lexical' | 'vector' | 'coverage-map';
}

export interface ReuseDecision {
  readonly candidateId: string;
  readonly decision: 'reuse' | 'extend' | 'generate';
  readonly assetId: string | null;
  readonly reason: string;
}

export interface AutomationAsset {
  readonly id: string;
  readonly kind: RepositoryAssetKind;
  readonly candidateId: string;
  readonly framework: AutomationFramework;
  /** A structural outline. Never emitted source — generation happens in the EP. */
  readonly outline: readonly string[];
  readonly targetPath: string;
}

export type AutomationFramework = 'playwright' | 'cypress' | 'selenium' | 'api' | 'bdd';

export interface AuthoredTest {
  readonly id: string;
  readonly title: string;
  readonly candidateId: string;
  readonly preconditions: readonly string[];
  readonly steps: readonly { readonly action: string; readonly expectedResult: string }[];
  readonly tags: readonly string[];
  readonly traceability: readonly string[];
}

export interface ExecutionPlan {
  readonly batches: readonly (readonly string[])[];
  readonly parallelism: number;
  readonly ordering: readonly string[];
  readonly environment: string;
  readonly environmentValidated: boolean;
}

export interface TestOutcome {
  readonly testId: string;
  readonly outcome: Outcome;
  readonly durationMs: number;
  readonly failureSignal: string | null;
  readonly attempts: number;
}

/**
 * Evidence crosses as a REFERENCE. There is nowhere here to put an artefact.
 *
 * A screenshot, a video, a HAR and a trace are Execution Plane custody (document 10).
 * What crosses is a hash and a locator.
 */
export interface EvidenceReference {
  readonly testId: string;
  readonly kind: 'screenshot' | 'video' | 'log' | 'trace' | 'har' | 'stack-trace';
  readonly sha256: string;
  readonly locator: string;
}

export interface HealingAction {
  readonly testId: string;
  readonly kind: 'locator' | 'dom' | 'retry' | 'dependency' | 'environment' | 'data';
  readonly proposal: string;
  readonly confidence: number;
  /** Only ever true when an Execution Plane retry was OBSERVED to pass. */
  readonly validated: boolean;
}

export type ReflectionClass =
  | 'real-bug' | 'bad-test' | 'flaky-test'
  | 'environmental-failure' | 'infrastructure-failure' | 'expected-behaviour';

export interface Reflection {
  readonly testId: string;
  readonly classification: ReflectionClass;
  readonly confidence: number;
  readonly reasoning: string;
  readonly recommendations: readonly string[];
}

export type RootCauseKind =
  | 'business' | 'technical' | 'automation' | 'environment'
  | 'configuration' | 'dependency' | 'infrastructure';

export interface RootCause {
  readonly testId: string;
  readonly kind: RootCauseKind;
  readonly statement: string;
  readonly suspectPaths: readonly string[];
  readonly confidence: number;
}

export interface Defect {
  readonly id: string;
  readonly summary: string;
  readonly testId: string;
  readonly businessImpact: string;
  readonly technicalImpact: string;
  readonly rootCause: string;
  readonly severity: 'S1' | 'S2' | 'S3' | 'S4';
  readonly priority: 'P1' | 'P2' | 'P3';
  readonly evidenceRefs: readonly string[];
  readonly traceability: readonly string[];
}

export interface LearningRecord {
  readonly kind: LearningKind;
  readonly key: string;
  readonly observation: string;
  readonly occurrences: number;
}

export type LearningKind =
  | 'repository-pattern' | 'change-pattern' | 'failure-pattern' | 'healing-pattern'
  | 'execution-history' | 'automation-history' | 'historical-trend'
  | 'knowledge-graph' | 'vector-memory' | 'prompt';

export interface SyncRecord {
  readonly system: string;
  readonly localId: string;
  readonly remoteId: string | null;
  readonly published: boolean;
  /** Always present. A record without a reason cannot be audited. */
  readonly reason: string;
}

export interface DevChangeReport {
  readonly repository: string;
  readonly headCommit: string;
  readonly changeSummary: {
    readonly files: number;
    readonly commits: number;
    readonly added: number;
    readonly removed: number;
    readonly byLayer: Readonly<Record<string, number>>;
  };
  readonly categories: Readonly<Record<string, number>>;
  readonly businessImpact: readonly BusinessImpact[];
  readonly impactedModules: readonly string[];
  readonly coverage: { readonly assessed: number; readonly covered: number; readonly gaps: number };
  readonly automationReuse: { readonly reused: number; readonly extended: number; readonly generated: number };
  readonly generatedAssets: number;
  readonly executionSummary: { readonly passed: number; readonly failed: number; readonly skipped: number };
  readonly healingSummary: { readonly proposed: number; readonly validated: number };
  readonly defectSummary: { readonly total: number; readonly byClassification: Readonly<Record<string, number>> };
  readonly riskSummary: readonly RiskAssessment[];
  readonly releaseReadiness: 'READY' | 'NOT READY' | 'NOT MEASURED';
  readonly rationale: string;
  readonly reasoningMode: string;
  /** Stated, not hidden: what this analysis structurally cannot see. */
  readonly statedLimits: readonly string[];
}
