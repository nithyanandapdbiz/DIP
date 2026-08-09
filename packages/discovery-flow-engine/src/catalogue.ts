/**
 * The complete Inverse-Flow Discovery agent catalogue.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §3 (capability 3) · 12-capability-orchestration.md
 *   ADR          : ADR-0023
 *   Criteria     : C-11.13 · C-12.2
 *
 * Built in one place so no run can register a partial catalogue. Registration validates
 * the full contract of every agent (retry policy, failure handling, prompt contract with
 * a rejection rule for reasoning agents), so an incomplete agent cannot enter here.
 *
 * WHY THIS IS ITS OWN FILE.
 * The catalogue is the engine's agent registry, and `capability.ts` is the twelve-stage
 * implementation. Holding registration here keeps the capability free of it and gives
 * every engine in the Intelligence Plane the same seven-file surface — the standard the
 * Dev-Change Engine sets.
 */
import { AgentCatalogue } from '@dbiz/capability-framework';
import { scopeAgents, discoveryAgents } from './agents/scope-and-discovery.js';
import { applicationIntelligenceAgents, applicationModelAgents } from './agents/intelligence-and-model.js';
import { requirementAgents, workItemAgents } from './agents/requirement-and-workitem.js';
import { qaAgents, repositoryAgents, automationAgents } from './agents/qa-repository-automation.js';
import {
  executionAgents, healingAgents, defectAgents, syncAgents, reportingAgents, learningAgents,
} from './agents/execution-and-outcome.js';
import { governanceAgents } from './agents/governance.js';

export const ALL_AGENTS = [
  ...scopeAgents, ...discoveryAgents,
  ...applicationIntelligenceAgents, ...applicationModelAgents,
  ...requirementAgents, ...workItemAgents,
  ...qaAgents, ...repositoryAgents, ...automationAgents,
  ...executionAgents, ...healingAgents, ...defectAgents,
  ...syncAgents, ...reportingAgents, ...learningAgents,
  ...governanceAgents,
];

export function buildCatalogue(): AgentCatalogue {
  const catalogue = new AgentCatalogue();
  catalogue.registerAll(ALL_AGENTS);
  return catalogue;
}
