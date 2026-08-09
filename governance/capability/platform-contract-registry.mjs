// PLATFORM CONTRACT REGISTRY — the canonical platform contracts (ADR-0040).
// ============================================================================
// The machine-readable declaration of the platform's canonical contracts. It
// EXTENDS the ADR-0039 contract registry (there is one registry, not two,
// CHARTER §4) with the platform-wide contract layer every capability consumes.
//
// Each contract carries the registry + governance fields ADR-0040 §4.3/§4.4
// require, and — per the ADR-0040 close-out (C1) — the constitutional index
// fields that make the registry the single authoritative index:
//   id · title · owner · version · stability · maturity · compatibilityPolicy ·
//   canonicalSource · dependsOn · verificationRule (certification rule) ·
//   faultProofRef · evidenceRef · expected
//
//   stability (G-3): experimental | internal | stable | deprecated | removed
//   maturity  (G-13): draft | proposed | implemented | certified | deprecated | retired
//   faultProofRef: a proof id in governance/verification/proofs.json (referenced, not duplicated).
//   evidenceRef:   the gate's evidence envelope (referenced, not duplicated).
//
// The certification STATE is never declared here — it is MEASURED by the scenario
// from executed evidence (does the canonical source export the declared symbol?).
// `expected` records what the platform CLAIMS is built, so the certification
// engine can catch an over-claim (R-13.1).
//
// verificationRule = { file, requires: [exported symbols], anyOf? }
//   all required present -> PASS · some (anyOf) -> PARTIAL · none/absent -> NOT IMPLEMENTED
//
// This file adds NO business logic (ADR-0040 constraint). Owners are shared
// PACKAGES, never a capability (G-16).

const COMPAT = 'G-4; versioned via PCT-VERSION — a breaking (major) change requires an ADR, version increment, migration path and updated certification';
const FRAMEWORK_PROOF = 'proof:verify-platform-contract-framework.js#platform-contract-over-claiming-its-state';
const FRAMEWORK_EVIDENCE = 'governance/capability/platform-contract-framework-evidence.json';

/** The canonical platform contracts (ADR-0040 §4.2). */
export const PLATFORM_CONTRACTS = [
  // ── Already implemented (consumed as-is) ─────────────────────────────────
  { id: 'PCT-EXEC-PACKAGE', title: 'Execution-Package contract', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/execution-package.ts', dependsOn: [], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/execution-package.ts', requires: ['ExecutionPackage', 'parseExecutionPackage'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },
  { id: 'PCT-EVIDENCE', title: 'Canonical Evidence model', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/evidence.ts', dependsOn: ['PCT-VERSION'], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/evidence.ts', requires: ['EvidenceReference', 'parseEvidenceReference'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },
  { id: 'PCT-VERSION', title: 'Contract Versioning authority', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/version.ts', dependsOn: [], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/version.ts', requires: ['ContractVersion', 'SUPPORTED_MAJORS', 'majorOf'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },
  { id: 'PCT-CAPABILITY', title: 'Capability / lifecycle contract', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/stages.ts', dependsOn: [], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/stages.ts', requires: ['STAGES', 'Capability', 'GOVERNANCE_TRIAD'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },
  { id: 'PCT-CERTIFICATION', title: 'Certification contract', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/certification.ts', dependsOn: ['PCT-CAPABILITY'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/certification.ts', requires: ['CERTIFICATION_GATES', 'certify'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },
  { id: 'PCT-REASONING', title: 'Reasoning / AI-optional contract', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/reasoning.ts', dependsOn: [], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/reasoning.ts', requires: ['resolveReasoningMode', 'gateProposals'] },
    faultProofRef: FRAMEWORK_PROOF, evidenceRef: FRAMEWORK_EVIDENCE },

  // ── Connector SPI family (Wave 2) ────────────────────────────────────────
  { id: 'PCT-CONNECTOR-SPI', title: 'Connector SPI family (six families)', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/adapters.ts', dependsOn: ['PCT-EVIDENCE'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/adapters.ts', anyOf: true,
      requires: ['ProjectAdapter', 'TestManagementAdapter', 'ExecutionAdapter', 'WorkItemAdapter',
        'AuthenticationAdapter', 'ApplicationStrategyAdapter', 'ReportingAdapter'] },
    faultProofRef: 'proof:verify-connector-spi.js#connector-spi-naming-a-provider', evidenceRef: 'governance/capability/connector-spi-evidence.json' },

  // ── Execution contracts (Wave 1) ─────────────────────────────────────────
  { id: 'PCT-EXEC-CONTEXT', title: 'Canonical Execution Context', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/execution-context.ts', dependsOn: ['PCT-CAPABILITY'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/execution-context.ts', requires: ['ExecutionContext', 'sealExecutionContext'] },
    faultProofRef: 'proof:verify-execution-contracts.js#execution-context-that-is-not-immutable', evidenceRef: 'governance/capability/execution-contracts-evidence.json' },
  { id: 'PCT-DECISION', title: 'Decision Intelligence contract', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/decision.ts', dependsOn: ['PCT-EXEC-CONTEXT', 'PCT-REASONING'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/decision.ts', requires: ['DecisionEngine', 'createDecisionEngine'] },
    faultProofRef: 'proof:verify-decision-engine.js#decision-engine-mutable-decision', evidenceRef: 'governance/capability/decision-engine-evidence.json' },
  { id: 'PCT-REPO-MODEL', title: 'Repository Intelligence model', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/repository-intelligence.ts', dependsOn: ['PCT-VERSION'], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/repository-intelligence.ts', requires: ['RepositoryIntelligenceModel', 'sealRepositoryIntelligence'] },
    faultProofRef: 'proof:verify-intelligence-models.js#intelligence-model-mutable', evidenceRef: 'governance/capability/intelligence-models-evidence.json' },
  { id: 'PCT-AUTO-MODEL', title: 'Automation Intelligence model', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/automation-intelligence.ts', dependsOn: ['PCT-REPO-MODEL'], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/automation-intelligence.ts', requires: ['AutomationIntelligenceModel', 'sealAutomationIntelligence'] },
    faultProofRef: 'proof:verify-intelligence-models.js#intelligence-model-mutable', evidenceRef: 'governance/capability/intelligence-models-evidence.json' },
  { id: 'PCT-REPORT-MODEL', title: 'Canonical Reporting model', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/reporting-model.ts', dependsOn: ['PCT-EVIDENCE'], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/reporting-model.ts', requires: ['ReportingModel', 'sealReportingModel'] },
    faultProofRef: 'proof:verify-reporting-model.js#reporting-model-mutable', evidenceRef: 'governance/capability/reporting-model-evidence.json' },
  { id: 'PCT-DOMAIN', title: 'Canonical Domain Contract', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/domain.ts', dependsOn: ['PCT-CAPABILITY', 'PCT-EXEC-CONTEXT'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/domain.ts', requires: ['DomainContract'] },
    faultProofRef: 'proof:verify-execution-contracts.js#execution-context-that-is-not-immutable', evidenceRef: 'governance/capability/execution-contracts-evidence.json' },
  { id: 'PCT-DOMAIN-STATE', title: 'Canonical Domain State model (observational)', owner: '@dbiz/capability-framework', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/capability-framework/src/domain.ts', dependsOn: ['PCT-DOMAIN'], expected: 'implemented',
    verificationRule: { file: 'packages/capability-framework/src/domain.ts', requires: ['DomainState', 'observeDomainState'] },
    faultProofRef: 'proof:verify-execution-contracts.js#execution-context-that-is-not-immutable', evidenceRef: 'governance/capability/execution-contracts-evidence.json' },

  // ── Platform Event + Observability (Wave 6) ──────────────────────────────
  { id: 'PCT-EVENTS', title: 'Platform Event + Observability contracts (observational)', owner: '@dbiz/contracts', version: '1.0.0',
    stability: 'stable', maturity: 'implemented', compatibilityPolicy: COMPAT,
    canonicalSource: 'packages/contracts/src/events.ts', dependsOn: ['PCT-VERSION', 'PCT-EVIDENCE'], expected: 'implemented',
    verificationRule: { file: 'packages/contracts/src/events.ts', requires: ['PlatformEvent', 'ObservabilityModel'] },
    faultProofRef: 'proof:verify-platform-events.js#platform-event-mutable', evidenceRef: 'governance/capability/platform-events-evidence.json' },
];

/** Valid certification states (ADR-0040 §4.3). */
export const CERT_STATES = ['PASS', 'PARTIAL', 'FAIL', 'NOT IMPLEMENTED', 'UNKNOWN'];

/** Valid stability classifications (ADR-0040 §4.4 G-3). */
export const STABILITY_LEVELS = ['experimental', 'internal', 'stable', 'deprecated', 'removed'];

/** Valid maturity levels (ADR-0040 §4.4 G-13). */
export const MATURITY_LEVELS = ['draft', 'proposed', 'implemented', 'certified', 'deprecated', 'retired'];

/** A shared package owns a contract; a capability engine must never own one (G-16). */
export const CAPABILITY_PACKAGE = /-engine$|functional-testing|dev-change|discovery|performance|penetration|security-testing/;
