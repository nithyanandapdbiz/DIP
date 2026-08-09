/**
 * @dbiz/capability-framework — the platform's single orchestration lifecycle.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 12-capability-orchestration.md
 *                  14-tool-operating-model.md · 18-governance-model.md
 *   ADR          : ADR-0022
 *   Criteria     : C-11.11 · C-11.13 · C-12.1 · C-12.2 · C-12.12
 *
 * R-12.18: exactly ONE orchestration lifecycle. All six capabilities run these twelve
 * stages. A capability extends the framework internally and never redefines it — which
 * is precisely what lets the Functional Testing Engine's thirteen intelligences, eleven
 * domain orchestrators and hundred agents exist without becoming a second lifecycle.
 *
 * This package creates NO capability. It is the frame six capabilities run inside, and
 * the count remains six (R-11.4).
 */
export {
  STAGES, STAGE_PLANE, GOVERNANCE_TRIAD, CapabilityRegistry, runCapability,
  isSealed, valueOf, StageError, CapabilityRegistrationError,
} from './stages.js';
export type {
  StageName, StageResult, StageOutcome, StageEmitter, StageContext, StageImplementation,
  Capability, RunOutcome,
} from './stages.js';

export { AgentCatalogue, defineAgent, AgentError, AgentCatalogueError } from './agent.js';
export type {
  AgentDefinition, AgentOutput, CertificationContribution, AgentContext, AgentPlane, AiCapabilityClass, RetryPolicy, PromptContract,
} from './agent.js';

export { AdapterRegistry, AdapterError, PLANNING_SEQUENCE, WORK_ITEM_LEVELS, CONNECTOR_SPI_DESCRIPTORS } from './adapters.js';
export type {
  AdapterIdentity, AdapterSet, ProjectAdapter, PublicationOutcome, WriteOutcome, ReadOutcome, TestManagementAdapter, ExecutionAdapter,
  PlanningStep, WorkItemAdapter, WorkItemLevel, WorkItemRequest, WorkItemHandle,
  SourceControlAdapter,
  // ADR-0040 Wave 2 — the remaining connector SPI families (capability-neutral).
  AuthenticationAdapter, ApplicationStrategyAdapter, ReportingAdapter, ConnectorSpiDescriptor,
} from './adapters.js';

export {
  REASONING_KEY, NO_PROPOSALS, resolveReasoningMode, proposalsFrom, gateProposals,
  invocationRecorder,
} from './reasoning.js';
export type {
  ReasoningMode, ProposalSource, ReasoningLedger, GatedProposals, InvocationRecorder,
} from './reasoning.js';

export {
  EMBEDDING_DIMENSIONS, embed, cosine, tokenise, VectorIndex, VectorMemory,
} from './vector.js';
export type { Embedding, VectorRecord, VectorMatch } from './vector.js';

export {
  runPhase, certifyOnNoBlockingFindings, observedAgents, StageNotCertifiedError,
} from './pipeline.js';
export type {
  ReviewFinding, PhaseDecision, PhaseCertification, StagePipelineSpec, PhaseOutcome,
} from './pipeline.js';

export { CERTIFICATION_GATES, GATE_STAGE, certify, progressedTo } from './certification.js';
export type { CertificationGate, Verdict, CertificationOutcome, VerdictDisposition } from './certification.js';
export { decidePublication } from './publication-admissibility.js';
export type { PublicationDecision, TriadLegRecord } from './publication-admissibility.js';

// ADR-0040 Wave 1 — canonical platform execution contracts (capability-neutral).
export {
  IMMUTABLE_FIELDS, EXECUTION_CONTEXT_VERSION, sealExecutionContext, appendMetadata, isContextSealed,
} from './execution-context.js';
export type {
  ExecutionContext, ImmutableField, TenantContext, GovernanceContext, SecurityContext,
  ConfigurationContext, DecisionContext, AuditContext, TraceContext, CapabilityMetadata,
  EnvironmentMetadata, ExecutionMetadata, ExecutionMetadataEntry,
} from './execution-context.js';

export { DOMAIN_STATES, observeDomainState, isObservationalState } from './domain.js';
export type { DomainContract, DomainOutput, DomainFailure, DomainState, DomainStateObservation } from './domain.js';

// ADR-0040 Wave 3 — the canonical deterministic Decision Engine (AI-advisory).
export { DECISION_TYPES, RULE_PRECEDENCE, DECISION_ENGINE_VERSION, createDecisionEngine } from './decision.js';
export type {
  DecisionType, RuleSource, DecisionRule, AiRecommendation, DecisionRequest, DecisionObject, DecisionEngine,
} from './decision.js';

// ── v2.3 — runtime execution governance ──
export {
  RUNTIME_STATES, OPTIONAL_STATES, LEGAL_TRANSITIONS, RuntimeTransitionError,
  StepRuntime, GovernanceLedger, EvidenceGraph, EVIDENCE_NODE_KINDS,
  RuntimeGovernor, captureSnapshot, compareReplay,
  type RuntimeState, type RuntimeTransition, type ExecutionProof,
  type PhaseOutcome as RuntimePhaseOutcome,
  type LedgerRecord, type EvidenceNode, type EvidenceEdge, type EvidenceNodeKind,
  type GraphValidation, type ReplaySnapshot, type ReplayComparison, type RuntimeGovernanceReport,
} from './runtime-governance.js';
