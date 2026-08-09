/**
 * @dbiz/security-testing-engine — capability 5 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 — **Security Testing Engine** ("Does it satisfy its
 *                  security requirements?")
 *   ADR          : ADR-0028
 *
 * This package creates no new capability. The platform still exposes six (R-11.4) and still runs
 * one orchestration lifecycle (R-12.18). The Security Testing Engine is the canonical
 * implementation of capability 5, built as internal structure over the twelve frozen stages —
 * one master orchestrator, sixteen domain orchestrators, and a verification catalogue spanning
 * requirements, SAST, dependencies, secrets, configuration, cryptography, infrastructure,
 * identity, privacy and AI posture, with AI-enabled and non-AI modes selected by configuration.
 *
 * It is verification, not exploitation. Adversarial, intrusive testing is capability 6, the
 * Penetration Testing Engine; an intrusive request here is refused at the guardrail stage.
 */
export {
  CAPABILITY_ID, securityTestingCapability, buildSecurityTestingOrchestrator,
  boardReport, renderReportPdf,
} from './capability.js';
export type { EngineDependencies } from './capability.js';

export { buildCatalogue, ALL_AGENTS } from './catalogue.js';

export {
  SecurityTestingOrchestrator, DOMAINS, domainOrchestrators, defineDomainOrchestrator,
  scopeOrchestrator, requirementOrchestrator, inventoryOrchestrator, modelOrchestrator,
  authorizationOrchestrator, guardrailOrchestrator, campaignOrchestrator, verifyOrchestrator,
  evidenceOrchestrator, assessmentOrchestrator, complianceOrchestrator, remediationOrchestrator,
  postureOrchestrator, learningOrchestrator, syncOrchestrator, reportingOrchestrator, governanceOrchestrator,
} from './orchestrators.js';
export type {
  Domain, DomainOrchestrator, SecurityTestingRequest, SecurityTestingResult, EngineRuntime,
  AgentContextFactory, AuthorizationCandidate, GuardrailResult, VerifyResult, GovernancePhase, GovernanceInput,
} from './orchestrators.js';

export {
  SecurityAdapterRegistry, AdapterError, azureDevOpsSecurityAdapter, securityHubAdapter, resetAdapterSequence,
} from './adapters.js';
export type { SecurityAdapter, AdapterIdentity, AdapterJournal } from './adapters.js';

export { STAGE_RULES, governanceAgents, reviewSubject } from './agents/governance.js';
export type { StageRule } from './agents/governance.js';

export {
  minimiseFact, minimiseFacts, minimiseWeakness, scrubLabel, computeCvss, severityForScore, digestOf,
  isIntrusive, maxSeverity, CHECK_META, CHECK_CATEGORIES, INTRUSIVE_CATEGORIES, SEVERITY_ORDER,
} from './model.js';
export type {
  Severity, CheckCategory, CheckMeta, ResourceKind, ObservedResource, RawWeakness, SecurityFact,
  Confidence, Weakness, EvidenceKind, EvidenceReference, RequirementSource, SecurityRequirement,
  RequirementCoverage, TrustBoundary, Asset, SecurityModel, SecurityScope, Authorization, CvssScore,
  Priority, AssessedWeakness, ComplianceResult, RemediationKind, Remediation, PostureScores, SyncRecord,
  LearningKind, LearningRecord, SecurityReport,
} from './model.js';

export { executivePages, num } from './agents/report.js';
export type { PdfPage, BoardReport } from './agents/report.js';

// ── Security Intelligence Layer (ADR-0029) ──────────────────────────────────
export {
  buildKnowledgeGraph, correlateRisks, CORRELATION_RULES, parseBusinessContext, toBusinessSeverity,
  buildAttackSurface, buildCertification, buildExecutive, buildDeveloperIntelligence, buildPredictive,
  buildContribution,
} from './intelligence-layer.js';
export type {
  GraphNode, GraphEdge, GraphNodeKind, SecurityKnowledgeGraph, RiskCategory, EnterpriseRisk,
  BusinessContext, AttackSurfaceGraph, Grade, MaturityLevel, DomainScore, SecurityCertification,
  ExecutiveIntelligence, DeveloperGuidance, HistoricalFinding, PredictiveIntelligence,
  SecurityIntelligenceContribution, SecurityIntelligenceReport,
} from './intelligence-layer.js';
export {
  knowledgeGraphOrchestrator, riskCorrelationOrchestrator, businessContextOrchestrator,
  attackSurfaceOrchestrator, developerOrchestrator, predictiveOrchestrator,
  certificationIntelOrchestrator, executiveOrchestrator, contributionOrchestrator,
} from './orchestrators.js';
export type { BusinessContextResult } from './orchestrators.js';
export { intelligenceLayerAgents } from './agents/intelligence-layer.js';
