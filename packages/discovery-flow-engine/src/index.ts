/**
 * @dbiz/discovery-flow-engine — capability 3 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 — **Inverse-Flow Discovery Engine**
 *   ADR          : ADR-0023
 *
 * A NOTE ON THE NAME.
 * The canonical architectural name of capability 3 is the **Inverse-Flow Discovery
 * Engine** (document 11 §3, frozen and hash-baselined). The brief that commissioned this
 * work called it the Discovery Flow Engine and named its master orchestrator
 * `DiscoveryFlowOrchestrator`. Both are here and neither was changed: the capability's
 * architectural identity is unchanged, and the implementation carries the name the brief
 * gave it. Renaming the frozen document would have been the only way to make them agree,
 * and it is not available — nor is it necessary.
 *
 * This package creates no new capability. The platform still exposes six (R-11.4) and
 * still runs one orchestration lifecycle (R-12.18).
 */
export { CAPABILITY_ID, discoveryFlowCapability, buildDiscoveryFlowOrchestrator } from './capability.js';
export type { EngineDependencies } from './capability.js';

export { buildCatalogue, ALL_AGENTS } from './catalogue.js';

export {
  DiscoveryFlowOrchestrator, DOMAINS, domainOrchestrators, defineDomainOrchestrator,
  scopeOrchestrator, discoveryOrchestrator, applicationIntelligenceOrchestrator,
  applicationModelOrchestrator, requirementOrchestrator, workItemOrchestrator,
  qaOrchestrator, repositoryOrchestrator, automationOrchestrator, executionOrchestrator,
  healingOrchestrator, defectOrchestrator, syncOrchestrator, reportingOrchestrator,
  learningOrchestrator, governanceOrchestrator,
} from './orchestrators.js';
export type {
  Domain, DomainOrchestrator, DiscoveryRequest, DiscoveryOrchestrationResult,
  EngineRuntime, AgentContextFactory, ScopeResult, DiscoveryResult, RequirementResult,
  GovernancePhase, GovernanceInput,
} from './orchestrators.js';

export { azureDevOpsAdapters, jiraAdapters, resetAdapterSequence } from './adapters.js';
export type { AdapterJournal } from './adapters.js';

export { renderPdf, executivePages, boardReport, pct } from './agents/report.js';
export type { PdfPage, BoardReport } from './agents/report.js';

export { STAGE_RULES, governanceAgents } from './agents/governance.js';
export type { StageRule } from './agents/governance.js';

export { minimise, scrubLabel, fingerprint, norm } from './model.js';
export type {
  ApplicationFact, ApplicationIntelligence, ApplicationModel, ApiContract, ArtefactKind,
  AutomationAsset, BusinessCapability, BusinessEntity, BusinessRule, Complexity, Defect,
  DiscoveryDepth, DiscoveryReport, DiscoveryScope, EvidenceKind, EvidenceReference,
  ExecutionPlan, Graph, HealingAction, HealingKind, Journey, LearningKind, LearningRecord,
  ObservedArtefact, Outcome, Priority, QaAsset, Relationship, RelationshipKind,
  RepositoryAssetKind, RepositoryMatch, ReuseDecision, RiskLevel, SyncRecord, TestKind,
  TestOutcome, TestStep, VirtualEpic, VirtualFeature, VirtualStory,
} from './model.js';
