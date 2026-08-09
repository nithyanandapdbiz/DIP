/**
 * The complete Performance agent catalogue.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 (capability 4) · 12-capability-orchestration.md
 *   ADR          : ADR-0026
 *   Criteria     : C-11.13 · C-12.2
 *
 * Built in one place so no run can register a partial catalogue. Registration validates
 * the full contract of every agent (retry policy, failure handling, prompt contract with
 * a rejection rule for reasoning agents), so an incomplete agent cannot enter here.
 *
 * THE THREE INCREMENTS REGISTER TOGETHER.
 * The base catalogue (Increment A), the Performance Intelligence Layer (Increment B —
 * pattern, business, knowledge and optimisation agents) and the Predictive Layer
 * (Increment C — twin and simulation agents) all enter here. A layer that registered
 * separately would let a run start with only part of the engine present and still look
 * complete.
 *
 * WHY THIS IS ITS OWN FILE.
 * The catalogue is the engine's agent registry, and `capability.ts` is the twelve-stage
 * implementation. Holding registration here keeps the capability free of it and gives
 * every engine in the Intelligence Plane the same seven-file surface — the standard the
 * Dev-Change Engine sets.
 */
import { AgentCatalogue } from '@dbiz/capability-framework';
import { scopeAgents, discoveryAgents, surfaceAgents } from './agents/scope-and-discovery.js';
import { workloadAgents, designAgents, guardrailAgents } from './agents/workload-design-guardrail.js';
import { scriptAgents, loadAgents, metricAgents } from './agents/scripting-load-metrics.js';
import {
  bottleneckAgents, rootcauseAgents, capacityAgents, optimisationAgents, defectAgents,
} from './agents/analysis.js';
import {
  certificationAgents, syncAgents, reportingAgents, learningAgents,
} from './agents/sync-reporting-learning.js';
import {
  patternAgents, businessAgents, knowledgeAgents, optimisationLayerAgents,
} from './agents/intelligence-layer.js';
import { twinAgents, simulationAgents } from './agents/predictive-layer.js';
import { governanceAgents } from './agents/governance.js';

export const ALL_AGENTS = [
  ...scopeAgents, ...discoveryAgents, ...surfaceAgents,
  ...workloadAgents, ...designAgents, ...guardrailAgents,
  ...scriptAgents, ...loadAgents, ...metricAgents,
  ...bottleneckAgents, ...rootcauseAgents, ...capacityAgents, ...optimisationAgents, ...defectAgents,
  ...patternAgents, ...businessAgents, ...knowledgeAgents, ...optimisationLayerAgents,
  ...twinAgents, ...simulationAgents,
  ...certificationAgents, ...syncAgents, ...reportingAgents, ...learningAgents,
  ...governanceAgents,
];

export function buildCatalogue(): AgentCatalogue {
  const catalogue = new AgentCatalogue();
  catalogue.registerAll(ALL_AGENTS);
  return catalogue;
}
