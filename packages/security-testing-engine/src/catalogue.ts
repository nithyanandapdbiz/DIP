/**
 * The complete Security Testing agent catalogue.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (capability 5) · 12-capability-orchestration.md
 *   ADR          : ADR-0028 · ADR-0029 (Security Intelligence Layer)
 *   Criteria     : C-11.13 · C-12.2
 *
 * Built in one place so no run can register a partial catalogue. Registration validates
 * the full contract of every agent (retry policy, failure handling, prompt contract with
 * a rejection rule for reasoning agents), so an incomplete agent cannot enter here.
 *
 * `intelligenceLayerAgents` IS AN AGGREGATE, NOT A DOMAIN.
 * It carries the nine ADR-0029 intelligence groups — knowledge graph, risk correlation,
 * business context, attack surface, developer guidance, predictive, certification,
 * executive and contribution. Registering the aggregate rather than the nine groups is
 * what keeps the Intelligence Layer from being half-present in a run.
 *
 * WHY THIS IS ITS OWN FILE.
 * The catalogue is the engine's agent registry, and `capability.ts` is the twelve-stage
 * implementation. Holding registration here keeps the capability free of it and gives
 * every engine in the Intelligence Plane the same seven-file surface — the standard the
 * Dev-Change Engine sets.
 */
import { AgentCatalogue } from '@dbiz/capability-framework';
import { scopeAgents, requirementAgents, modelAgents } from './agents/requirement.js';
import { inventoryAgents, contextAgents } from './agents/inventory.js';
import { authorizationAgents, guardrailAgents, campaignAgents } from './agents/authorization.js';
import { verificationAgents, evidenceAgents } from './agents/verification.js';
import {
  assessmentAgents, complianceAgents, remediationAgents, postureAgents, learningAgents,
} from './agents/intelligence.js';
import { intelligenceLayerAgents } from './agents/intelligence-layer.js';
import { syncAgents, reportingAgents } from './agents/reporting.js';
import { governanceAgents } from './agents/governance.js';

export const ALL_AGENTS = [
  ...scopeAgents, ...requirementAgents, ...inventoryAgents, ...contextAgents, ...modelAgents,
  ...authorizationAgents, ...guardrailAgents, ...campaignAgents,
  ...verificationAgents, ...evidenceAgents,
  ...assessmentAgents, ...complianceAgents, ...remediationAgents, ...postureAgents, ...learningAgents,
  ...intelligenceLayerAgents,
  ...syncAgents, ...reportingAgents,
  ...governanceAgents,
];

export function buildCatalogue(): AgentCatalogue {
  const catalogue = new AgentCatalogue();
  catalogue.registerAll(ALL_AGENTS);
  return catalogue;
}
