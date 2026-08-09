/**
 * The complete Penetration Testing agent catalogue.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 (capability 6) · 12-capability-orchestration.md
 *   ADR          : ADR-0027
 *   Criteria     : C-11.13 · C-12.2
 *
 * Built in one place so no run can register a partial catalogue. Registration validates
 * the full contract of every agent (retry policy, failure handling, prompt contract with
 * a rejection rule for reasoning agents), so an incomplete agent cannot enter here.
 *
 * THE SCANNER TIERS ARE REGISTERED TOGETHER, GATED SEPARATELY.
 * `passiveScanners`, `activeSafeScanners` and `activeFullScanners` all enter the catalogue;
 * which tier may transmit is decided by the guardrail stage, never by what was registered.
 * A catalogue that omitted a tier would make the guardrail decision unobservable.
 *
 * WHY THIS IS ITS OWN FILE.
 * The catalogue is the engine's agent registry, and `capability.ts` is the twelve-stage
 * implementation. Holding registration here keeps the capability free of it and gives
 * every engine in the Intelligence Plane the same seven-file surface — the standard the
 * Dev-Change Engine sets.
 */
import { AgentCatalogue } from '@dbiz/capability-framework';
import {
  scopeAgents, scopeGuardrailAgents, reconAgents, surfaceIntelAgents, surfaceModelAgents,
} from './agents/scope-and-recon.js';
import {
  passiveScanners, activeSafeScanners, activeFullScanners, evidenceAgents,
} from './agents/scanning.js';
import { scanAuthorizationAgents, campaignAgents } from './agents/planning-scanner.js';
import { assessmentAgents, riskAgents } from './agents/assessment-risk.js';
import { threatAgents, attackChainAgents } from './agents/threat-attackchain.js';
import {
  repositoryAgents, aiIntelAgents, historicalAgents, remediationAgents,
} from './agents/intelligence.js';
import { syncAgents, reportingAgents, learningAgents } from './agents/sync-reporting-learning.js';
import { governanceAgents } from './agents/governance.js';

export const ALL_AGENTS = [
  ...scopeAgents, ...scopeGuardrailAgents, ...reconAgents, ...surfaceIntelAgents, ...surfaceModelAgents,
  ...scanAuthorizationAgents, ...campaignAgents,
  ...passiveScanners, ...activeSafeScanners, ...activeFullScanners, ...evidenceAgents,
  ...assessmentAgents, ...riskAgents, ...threatAgents, ...attackChainAgents,
  ...repositoryAgents, ...aiIntelAgents, ...historicalAgents, ...remediationAgents,
  ...syncAgents, ...reportingAgents, ...learningAgents,
  ...governanceAgents,
];

export function buildCatalogue(): AgentCatalogue {
  const catalogue = new AgentCatalogue();
  catalogue.registerAll(ALL_AGENTS);
  return catalogue;
}
