/**
 * The complete Dev-Change agent catalogue.
 *
 * TRACEABILITY
 *   ADR : ADR-0024
 *
 * Built in one place so no run can register a partial catalogue. Registration validates
 * the full contract of every agent (retry policy, failure handling, prompt contract with
 * a rejection rule for reasoning agents), so an incomplete agent cannot enter here.
 */
import { AgentCatalogue } from '@dbiz/capability-framework';
import { repositoryAgents, diffAgents } from './agents/repository-and-diff.js';
import {
  changeIntelligenceAgents, dependencyIntelligenceAgents, businessImpactAgents,
  riskIntelligenceAgents, coverageIntelligenceAgents,
} from './agents/change-intelligence.js';
import {
  testDiscoveryAgents, reuseAgents, generationAgents, authoringAgents,
} from './agents/planning-and-automation.js';
import {
  executionAgents, evidenceAgents, healingAgents, reflectionAgents, rootCauseAgents,
  defectAgents, learningAgents,
} from './agents/execution-and-outcome.js';
import { syncAgents, reportingAgents } from './agents/sync-and-reporting.js';
import { governanceAgents } from './agents/governance.js';
import {
  changeTypeAgents, repositorySearchAgents, healingKindAgents, frameworkAgents,
  businessDetailAgents, coverageDetailAgents, discoveryStrategyAgents, rootCauseCategoryAgents,
} from './agents/expanded.js';

export const ALL_AGENTS = [
  ...repositoryAgents, ...diffAgents,
  ...changeIntelligenceAgents, ...changeTypeAgents,
  ...dependencyIntelligenceAgents,
  ...businessImpactAgents, ...businessDetailAgents,
  ...riskIntelligenceAgents,
  ...coverageIntelligenceAgents, ...coverageDetailAgents,
  ...testDiscoveryAgents, ...discoveryStrategyAgents,
  ...reuseAgents, ...repositorySearchAgents,
  ...generationAgents, ...frameworkAgents, ...authoringAgents,
  ...executionAgents, ...evidenceAgents,
  ...healingAgents, ...healingKindAgents,
  ...reflectionAgents, ...rootCauseAgents, ...rootCauseCategoryAgents, ...defectAgents, ...learningAgents,
  ...syncAgents, ...reportingAgents,
  ...governanceAgents,
];
// `syncAgents` now includes sync.requirement-traceability, which exercises ProjectAdapter —
// without it the capability declared ProjectAdapter in requiredAdapters and never called it.

export function buildCatalogue(): AgentCatalogue {
  const catalogue = new AgentCatalogue();
  catalogue.registerAll(ALL_AGENTS);
  return catalogue;
}
