/**
 * @dbiz/contracts — the cross-plane contract surface.
 *
 * TRACEABILITY
 *   Architecture : 19-repository-ownership.md §3 · 20-cross-plane-contracts.md
 *   ADR          : ADR-0003 (shared package vehicle) · ADR-0004 · ADR-0005
 *   Criteria     : C-19.4 (no shared-package export computes a decision)
 *
 * Shape and validation only. This package contains NO business logic: no
 * inference, no credential handling, no decision computation (R-19.7). Shared
 * logic would execute in both a DBiz tenancy and a customer tenancy under
 * different threat models, satisfying neither. Shared *shape* has no such problem.
 */
export { canonicalise, canonicalBytes, CanonicalisationError } from './canonical.js';
export type { JsonValue } from './canonical.js';

export {
  hash, verify, HASH_DOMAINS, ALGORITHM_VERSIONS, CURRENT_ALGORITHM,
} from './integrity.js';
export type { Digest, HashDomain, AlgorithmVersion, VerificationResult, VerificationFailure } from './integrity.js';

export { CONTRACT_VERSION, SUPPORTED_MAJORS, majorOf, isSupported } from './version.js';
export type { ContractVersion } from './version.js';

export { ASSURANCE_STATES, isCertifiable, admitForCertification } from './assurance.js';
export type { AssuranceState, CertificationAdmission } from './assurance.js';

export {
  ExecutionPackageSchema, parseExecutionPackage, hashableContent,
  OperationSchema, DirectivesSchema, GateDefinitionSchema,
  EvidenceRequirementSchema, ProvenanceSchema, ValiditySchema, ProceedSchema,
} from './execution-package.js';
export type { ExecutionPackage } from './execution-package.js';

export {
  EvidenceReferenceSchema, CaptureOutcomeSchema, parseEvidenceReference, statusAt,
  carriesEvidencePayload, EVIDENCE_PAYLOAD_FIELDS,
} from './evidence.js';

// D-123 link 1 / ruling 1 — ONE detached-signature shape, declared here and nowhere else.
export {
  DetachedSignatureSchema, SIGNATURE_ALGORITHMS, parseDetachedSignature, signatureMatchesProvenance,
} from './signature.js';
export type { DetachedSignature, SignatureAlgorithm } from './signature.js';
export type { EvidenceReference, ReferenceStatus } from './evidence.js';

// ADR-0040 Wave 4 — canonical intelligence models (descriptive, immutable, capability-neutral).
export { REPOSITORY_INTELLIGENCE_VERSION, sealRepositoryIntelligence } from './repository-intelligence.js';
export type {
  RepositoryIntelligenceModel, RepositoryAsset, CoverageDatum, SimilarityDatum,
  TraceabilityEdge, RepositoryMetadataEntry, RepositoryRecommendation,
} from './repository-intelligence.js';

export { AUTOMATION_INTELLIGENCE_VERSION, sealAutomationIntelligence } from './automation-intelligence.js';
export type {
  AutomationIntelligenceModel, AutomationCandidate, AutomationTraceabilityEdge,
} from './automation-intelligence.js';

// ADR-0040 Wave 5 — the canonical Reporting model (references-only, immutable, capability-neutral).
export { REPORTING_MODEL_VERSION, sealReportingModel } from './reporting-model.js';
export type {
  ReportingModel, ReportEntry, ReportSection, CertificationDescription, ReportVersionInformation,
} from './reporting-model.js';

// ADR-0040 Wave 6 — canonical Platform Event + Observability contracts (observational-only, immutable).
export {
  PLATFORM_EVENT_VERSION, OBSERVABILITY_MODEL_VERSION, sealPlatformEvent, sealObservabilityModel,
} from './events.js';
export type {
  PlatformEvent, PlatformEventMetadataEntry, ObservabilityModel, Observation,
  // `ObservationSet` here is the observability model's set of observations, and is NOT the
  // cross-plane Observation Set below. Aliased on export so the two cannot be confused at a call
  // site — they have different owners, different lifecycles and different guards.
  ObservationSet as ObservabilityObservationSet,
} from './events.js';

// ── Sovereignty remediation — the EP→IP contract surface ────────────────────
// The Execution Plane sends facts with provenance and a record of what it did. Both are guarded on
// receipt: one refuses interpretation, the other refuses a verdict.
export {
  OBSERVATION_SET_VERSION, CONFIDENCE, ObservationSetSchema, parseObservationSet,
  assertNoKnowledge, findKnowledgeFields, KnowledgeInObservationSetError,
  // Aliased: `ProvenanceSchema` on the execution package is the AUTHORING provenance of a sealed
  // artefact (who signed it, under which key). This is the RETRIEVAL provenance of a single fact
  // (which field of which work item, fetched how). Two different claims; two different names.
  ProvenanceSchema as FactProvenanceSchema,
  WorkItemObservationSchema, TextSpanSchema, ArtefactObservationSchema,
  FormalSpecificationSchema, ScreenObservationSchema, ControlObservationSchema,
  RepositoryInventorySchema, MeasurementSchema, RetrievalGapSchema,
} from './observation-set.js';
export type { ObservationSet, Provenance as FactProvenance, Confidence, KnowledgeViolation } from './observation-set.js';

export {
  STEP_LEDGER_VERSION, COMPLETION_STATES, StepLedgerSchema, StepEntrySchema,
  StepOutcomeSchema, StepObservationSchema, StepMeasurementSchema,
  parseStepLedger, assertNoVerdict, findVerdictFields, VerdictInStepLedgerError,
} from './step-ledger.js';
export type { StepLedger, StepEntry, CompletionState, VerdictViolation } from './step-ledger.js';

// Testing expertise the Intelligence Plane authors and the Execution Plane merely evaluates.
// The rule moves; the evaluation stays where the data is (audit V-14/15/19/21/23).
export {
  POLICY_TABLES_VERSION, PolicyTablesSchema, FailureTaxonomySchema, HealingPolicySchema,
  ChangeSignificanceSchema, SelectorProfileSchema, AutomationPolicySchema, FailureRuleSchema,
  parsePolicyTables, DEFAULT_POLICY_TABLES,
} from './policy-tables.js';
export type { PolicyTables, FailureTaxonomy, HealingPolicy } from './policy-tables.js';

// The platform-wide answer to "who owns this?" — one declaration per capability, CI-enforced.
export {
  CAPABILITY_REGISTER_VERSION, OWNER_PLANES, REASONING_TYPES, EXECUTION_TYPES, KNOWLEDGE_TYPES,
  CapabilityDeclarationSchema, CapabilityRegisterSchema, validateRegister,
  parseCapabilityRegister, CapabilityRegisterError,
} from './capability-register.js';
export type {
  CapabilityRegister, CapabilityDeclaration, OwnerPlane, ReasoningType, ExecutionType,
  KnowledgeType, RegisterViolation,
} from './capability-register.js';
