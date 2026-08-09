/**
 * The Discovery Flow Engine's domain model.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 11-capability-model.md · 19-repository-ownership.md
 *   ADR          : ADR-0023
 *   Criteria     : C-06.x (customer artefacts are Execution Plane custody)
 *   Evidence     : E-5 (no customer artefact is retained in the Intelligence Plane)
 *
 * THE BOUNDARY IS IN THE TYPES, NOT IN THE DISCIPLINE.
 *
 * Inverse-flow discovery has a problem the Functional Testing Engine does not: the
 * Intelligence Plane must reason about the customer's application, so application
 * STRUCTURE has to cross the boundary. "Nothing crosses" is not available as an answer.
 *
 * The line drawn here is between structure and content, and it is drawn in the type
 * system so that no future edit can blur it:
 *
 *   ObservedArtefact  — Execution Plane. May carry values: cookie contents, storage
 *                       contents, response bodies, form field values, headers.
 *   ApplicationFact   — Intelligence Plane. Carries a kind, an identifier, a label, a
 *                       path and ATTRIBUTE NAMES. `attributeNames: readonly string[]`
 *                       has nowhere to put a value.
 *
 * A cookie's existence, name and scope are structure and cross. A cookie's value is
 * content and cannot cross, because `ApplicationFact` has no field that could hold it.
 * The same reasoning gives `EvidenceReference` a hash and a locator and no content
 * field — a rule the platform has already certified and this engine inherits rather
 * than restates.
 */

// ── Scope ───────────────────────────────────────────────────────────────────

export type DiscoveryDepth = 'shallow' | 'standard' | 'deep';

export interface DiscoveryScope {
  readonly applicationId: string;
  /** Origins in scope. Anything outside them is refused at the scope gate. */
  readonly origins: readonly string[];
  /** Paths explicitly excluded. Checked before any request is made, never after. */
  readonly exclusions: readonly string[];
  readonly depth: DiscoveryDepth;
  readonly authenticationMode: 'anonymous' | 'credentialed';
  /** Requests per second the customer's environment will tolerate. */
  readonly rateLimitPerSecond: number;
  readonly apiSpecificationUris: readonly string[];
}

// ── Execution Plane observation ─────────────────────────────────────────────

export type ArtefactKind =
  | 'page' | 'route' | 'spa-view' | 'form' | 'field' | 'control'
  | 'api-endpoint' | 'microservice' | 'websocket' | 'event'
  | 'cookie' | 'storage-key' | 'file' | 'download'
  | 'iframe' | 'shadow-root' | 'menu' | 'navigation-edge' | 'auth-flow';

/**
 * What the Execution Plane saw. Execution Plane custody, permanently.
 *
 * `values` is where content lives — and it is the reason this type never leaves the EP.
 * Nothing in the Intelligence Plane accepts an `ObservedArtefact`, and the compiler is
 * what enforces that rather than a review comment.
 */
export interface ObservedArtefact {
  readonly kind: ArtefactKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  /** Attribute name to observed value. EP only. */
  readonly values: Readonly<Record<string, string>>;
  /** Where it was found, relative to the application. Not a filesystem path. */
  readonly parentId: string | null;
}

/**
 * The minimised projection that crosses into the Intelligence Plane.
 *
 * Note what is absent: there is no `values`, and `attributeNames` is a list of strings
 * that are names. A future change that wanted to smuggle a value across would have to
 * add a field, which is a reviewable act rather than an invisible one.
 */
export interface ApplicationFact {
  readonly kind: ArtefactKind;
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly attributeNames: readonly string[];
  readonly parentId: string | null;
}

/**
 * Minimise an observation into a fact.
 *
 * The single crossing point. Every fact in the Intelligence Plane passed through this
 * function, so auditing what crosses means auditing one function rather than every
 * agent that ever touched an artefact.
 */
export function minimise(artefact: ObservedArtefact): ApplicationFact {
  return {
    kind: artefact.kind,
    id: artefact.id,
    label: scrubLabel(artefact.label),
    path: artefact.path,
    attributeNames: Object.keys(artefact.values).sort(),
    parentId: artefact.parentId,
  };
}

/**
 * Remove content that a label sometimes carries by accident.
 *
 * A page title is structure. A page title reading "Invoice INV-4471 — J. Okonkwo" is
 * structure with a customer's name and an invoice number in it, and it would be
 * retained in the Intelligence Plane as a label. Long digit runs, address-shaped text
 * and email addresses are replaced rather than the whole label being dropped, because a
 * label is what makes a journey graph readable.
 */
export function scrubLabel(label: string): string {
  return label
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '{email}')
    .replace(/\b\d[\d\s-]{7,}\b/g, '{number}')
    .replace(/\b[A-Z]{2,}-\d{3,}\b/g, '{reference}')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Application intelligence ────────────────────────────────────────────────

export interface ApiContract {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  /** Parameter names. Never example values — those are content. */
  readonly parameterNames: readonly string[];
  readonly serviceId: string | null;
}

export interface BusinessEntity {
  readonly id: string;
  readonly name: string;
  /** Field names observed across forms and API contracts. */
  readonly fieldNames: readonly string[];
  readonly sourceFactIds: readonly string[];
}

export type RelationshipKind = 'navigates-to' | 'submits-to' | 'reads' | 'writes' | 'depends-on' | 'contains';

export interface Relationship {
  readonly from: string;
  readonly to: string;
  readonly kind: RelationshipKind;
  /** `observed` was seen; `inferred` was proposed by reasoning and accepted. */
  readonly provenance: 'observed' | 'inferred';
  readonly confidence: number;
}

export interface BusinessRule {
  readonly id: string;
  readonly statement: string;
  readonly sourceFactIds: readonly string[];
  readonly provenance: 'observed' | 'inferred';
}

export interface Graph {
  readonly name: string;
  readonly nodes: readonly string[];
  readonly edges: readonly Relationship[];
}

export interface ApplicationIntelligence {
  readonly services: readonly string[];
  readonly apiContracts: readonly ApiContract[];
  readonly entities: readonly BusinessEntity[];
  readonly relationships: readonly Relationship[];
  readonly businessRules: readonly BusinessRule[];
  readonly modules: readonly string[];
  readonly menus: readonly string[];
  readonly pages: readonly string[];
  readonly navigationGraph: Graph;
  readonly journeyGraph: Graph;
  readonly dependencyGraph: Graph;
  readonly knowledgeGraph: Graph;
}

// ── Application model ───────────────────────────────────────────────────────

export interface Journey {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly string[];
  readonly entryFactId: string;
  readonly exitFactId: string;
  readonly provenance: 'observed' | 'inferred';
}

export interface BusinessCapability {
  readonly id: string;
  readonly name: string;
  readonly serviceIds: readonly string[];
  readonly journeyIds: readonly string[];
}

export interface ApplicationModel {
  readonly applicationId: string;
  readonly domains: readonly string[];
  readonly services: readonly string[];
  readonly entities: readonly BusinessEntity[];
  readonly relationships: readonly Relationship[];
  readonly navigation: Graph;
  readonly journeys: readonly Journey[];
  readonly capabilities: readonly BusinessCapability[];
}

// ── Requirement reconstruction ──────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type Complexity = 'simple' | 'moderate' | 'complex';

export interface VirtualStory {
  readonly id: string;
  readonly featureId: string;
  readonly title: string;
  readonly businessContext: string;
  readonly acceptanceCriteria: readonly string[];
  readonly businessRuleIds: readonly string[];
  readonly keywords: readonly string[];
  readonly risk: RiskLevel;
  readonly priority: Priority;
  readonly complexity: Complexity;
  readonly dependsOn: readonly string[];
  /** The facts this story was reconstructed from. Reconstruction is never unsourced. */
  readonly sourceFactIds: readonly string[];
}

export interface VirtualFeature {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly businessContext: string;
  readonly storyIds: readonly string[];
}

export interface VirtualEpic {
  readonly id: string;
  readonly title: string;
  readonly businessContext: string;
  readonly capabilityId: string;
  readonly featureIds: readonly string[];
}

export interface ReconstructedRequirements {
  readonly epics: readonly VirtualEpic[];
  readonly features: readonly VirtualFeature[];
  readonly stories: readonly VirtualStory[];
}

// ── QA assets ───────────────────────────────────────────────────────────────

export type TestKind =
  | 'functional' | 'api' | 'integration' | 'negative' | 'boundary'
  | 'security' | 'accessibility' | 'performance-awareness' | 'edge-case';

export interface TestStep {
  readonly ordinal: number;
  readonly action: 'navigate' | 'click' | 'input' | 'select' | 'upload' | 'assert' | 'call' | 'cleanup';
  readonly target: string;
  readonly data: string | null;
  /** Mandatory. A step with no expected result cannot be verified, so it is refused. */
  readonly expectedResult: string;
}

export interface QaAsset {
  readonly id: string;
  readonly storyId: string;
  readonly kind: TestKind;
  readonly title: string;
  readonly objective: string;
  readonly preconditions: readonly string[];
  readonly environment: string;
  readonly steps: readonly TestStep[];
  readonly cleanup: readonly string[];
  readonly testData: readonly string[];
  readonly risk: RiskLevel;
  readonly priority: Priority;
  readonly tags: readonly string[];
  readonly businessRuleIds: readonly string[];
  readonly requirementTraceability: readonly string[];
  readonly gwt: { readonly given: readonly string[]; readonly when: readonly string[]; readonly then: readonly string[] };
  readonly bddReady: boolean;
  readonly automationReady: boolean;
  readonly fingerprint: string;
}

// ── Repository and automation ───────────────────────────────────────────────

export type RepositoryAssetKind =
  | 'test-case' | 'automation' | 'feature-file' | 'page-object'
  | 'locator' | 'utility' | 'hook' | 'step-definition';

/** Scores and identifiers cross the boundary. Asset content never does. */
export interface RepositoryMatch {
  readonly assetId: string;
  readonly assetKind: RepositoryAssetKind;
  readonly similarity: number;
  readonly repository: string;
  readonly matchedBy: 'lexical' | 'vector' | 'semantic';
}

export type ReuseDecision =
  | { readonly kind: 'reuse'; readonly assetId: string; readonly similarity: number; readonly assetKind: RepositoryAssetKind }
  | { readonly kind: 'merge'; readonly assetId: string; readonly similarity: number; readonly assetKind: RepositoryAssetKind; readonly delta: string }
  | { readonly kind: 'create'; readonly assetKind: RepositoryAssetKind; readonly reason: string };

export interface AutomationAsset {
  readonly id: string;
  readonly kind: RepositoryAssetKind;
  readonly path: string;
  readonly module: string;
  readonly qaAssetIds: readonly string[];
  readonly tags: readonly string[];
  readonly traceability: readonly string[];
}

// ── Execution, evidence, healing, defects ───────────────────────────────────

export interface ExecutionPlan {
  readonly batches: readonly (readonly string[])[];
  readonly parallelism: number;
  readonly environment: string;
  readonly environmentValidated: boolean;
}

export type Outcome = 'passed' | 'failed' | 'skipped';

export interface TestOutcome {
  readonly qaAssetId: string;
  readonly outcome: Outcome;
  readonly failureSignal: string | null;
  readonly durationMs: number;
}

export type EvidenceKind = 'screenshot' | 'video' | 'har' | 'trace' | 'log' | 'console' | 'environment';

/**
 * Evidence by REFERENCE.
 *
 * There is no content field and there will not be one. A hash proves the artefact
 * existed and was not altered; a locator says where in Execution Plane custody it is.
 * That is everything the Intelligence Plane needs to reason about evidence, and it is
 * the whole of what E-5 permits it to hold.
 */
export interface EvidenceReference {
  readonly qaAssetId: string;
  readonly kind: EvidenceKind;
  readonly sha256: string;
  readonly locator: string;
  readonly capturedAtStage: string;
}

export type HealingKind =
  | 'reactive' | 'proactive' | 'predictive' | 'vision' | 'dom' | 'locator'
  | 'timing' | 'api' | 'network' | 'ai-repair' | 'code-repair' | 'self';

export interface HealingAction {
  readonly kind: HealingKind;
  readonly qaAssetId: string;
  readonly before: string;
  readonly after: string;
  readonly confidence: number;
  /** Never true without an OBSERVED retry. Assumed validation hides defects. */
  readonly validated: boolean;
}

export interface Defect {
  readonly id: string;
  readonly title: string;
  readonly qaAssetId: string;
  readonly storyId: string;
  readonly rootCause: string;
  readonly businessImpact: string;
  readonly evidenceRefs: readonly string[];
  readonly duplicateOf: string | null;
  readonly published: boolean;
  readonly externalId: string | null;
}

// ── Synchronization and reporting ───────────────────────────────────────────

export interface SyncRecord {
  readonly target: 'work-item' | 'test-case' | 'result' | 'evidence' | 'traceability' | 'defect';
  readonly localId: string;
  /** The provider-assigned identifier. Present only when publication actually happened. */
  readonly externalId: string | null;
  readonly published: boolean;
  readonly reason: string;
}

export interface DiscoveryReport {
  readonly applicationId: string;
  readonly applicationInventory: Readonly<Record<string, number>>;
  readonly journeyInventory: readonly string[];
  readonly apiInventory: readonly string[];
  readonly businessCapabilities: readonly string[];
  readonly requirementCounts: { readonly epics: number; readonly features: number; readonly stories: number };
  readonly qaAssetCount: number;
  readonly automationCoverage: number;
  readonly requirementCoverage: number;
  readonly riskProfile: Readonly<Record<RiskLevel, number>>;
  readonly executionSummary: Readonly<Record<Outcome, number>>;
  readonly healingRate: number;
  readonly defectCount: number;
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly discoveryCompleteness: number;
  readonly releaseReadiness: string;
  readonly rationale: string;
}

// ── Learning ────────────────────────────────────────────────────────────────

export type LearningKind =
  | 'application-pattern' | 'business-rule' | 'journey' | 'repository'
  | 'automation' | 'healing' | 'prompt' | 'knowledge-graph' | 'vector-memory';

export interface LearningRecord {
  readonly kind: LearningKind;
  readonly signal: string;
  readonly lesson: string;
  readonly occurrences: number;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

export function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A stable content fingerprint.
 *
 * FNV-1a rendered as hex. Used for deduplication and as the evidence hash placeholder
 * where a real digest is computed in the Execution Plane — never as a security primitive,
 * which is what `platform-runtime` is for.
 */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
