/**
 * @dbiz/penetration-testing-engine — capability 6 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 — **Penetration Testing Engine**
 *   ADR          : ADR-0027
 *
 * This package creates no new capability. The platform still exposes six (R-11.4) and still
 * runs one orchestration lifecycle (R-12.18). The Penetration Testing Engine is the canonical
 * implementation of capability 6, built as internal structure over the twelve frozen stages —
 * one master orchestrator, fifteen domain orchestrators (including a Threat Intelligence
 * engine), and a scanner, threat, assessment and remediation catalogue, with AI-enabled and
 * non-AI modes selected by configuration and no duplicated workflow.
 */
export {
  CAPABILITY_ID, penetrationTestingCapability, buildPenetrationTestingOrchestrator,
} from './capability.js';
export type { EngineDependencies } from './capability.js';

export { buildCatalogue, ALL_AGENTS } from './catalogue.js';

export {
  PenetrationTestingOrchestrator, DOMAINS, domainOrchestrators, defineDomainOrchestrator,
  scopeOrchestrator, reconOrchestrator, scannerOrchestrator, repositoryOrchestrator,
  assessmentOrchestrator, riskOrchestrator, threatOrchestrator, attackChainOrchestrator,
  aiIntelOrchestrator, historicalOrchestrator, remediationOrchestrator, syncOrchestrator,
  reportingOrchestrator, learningOrchestrator, governanceOrchestrator,
} from './orchestrators.js';
export type {
  Domain, DomainOrchestrator, PentestRequest, PentestOrchestrationResult, EngineRuntime,
  AgentContextFactory, ReconResult, ScannerResult, RiskResult, ThreatResult, HistoricalResult,
  RepositoryResult, GovernancePhase, GovernanceInput,
} from './orchestrators.js';

export {
  PentestAdapterRegistry, AdapterError, azureDevOpsSecurityAdapter, securityHubAdapter, resetAdapterSequence,
} from './adapters.js';
export type { SecurityAdapter, AdapterIdentity, AdapterJournal } from './adapters.js';

export { renderPdf, executivePages, renderReportPdf, boardReport, num } from './agents/report.js';
export type { PdfPage, BoardReport } from './agents/report.js';

export { STAGE_RULES, governanceAgents } from './agents/governance.js';
export type { StageRule } from './agents/governance.js';

export { computeCvss } from './agents/assessment-risk.js';
export type { PriorRecord } from './agents/intelligence.js';
export type { ScanAuthorization, ScopeBoundary } from './agents/scope-and-recon.js';

export {
  minimise, minimiseFinding, scrubLabel, fingerprint, phaseAllowed, severityForScore,
  SCAN_PHASES, CATEGORY_META, CATEGORY_PHASE, CATEGORY_DESTRUCTIVE, SEVERITY_ORDER,
} from './model.js';
export type {
  ScanPhase, PentestScope, ObservedTarget, SurfaceFact, TargetKind, AttackSurface, Endpoint,
  TrustBoundary, Asset, Severity, FindingCategory, RawFinding, Finding, CvssVector, CvssScore,
  Priority, AssessedFinding, MitreTechnique, ThreatAssessment, ThreatLandscape, KillChainPhase,
  AttackNode, AttackEdge, AttackChain, PriorRecordKind, RepositoryMatch, FindingDisposition,
  HistoricalComparison, Remediation, SyncRecord, PentestReport, EvidenceKind, EvidenceReference,
  LearningKind, LearningRecord,
} from './model.js';
