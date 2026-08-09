/**
 * @dbiz/dev-change-engine — capability 2 of 6.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 12-capability-orchestration.md
 *   ADR          : ADR-0024
 *   Criteria     : C-11.13 · C-12.1 · C-12.2 · C-12.12 · C-13.1 · C-14.1
 *
 * ONE CAPABILITY, NOT A SEVENTH. Twenty domain orchestrators and ~130 agents are INTERNAL
 * structure of the Dev-Change Engine. The platform still exposes exactly six capabilities
 * (R-11.4), and this package creates no orchestration lifecycle of its own (R-12.18).
 */
import type { AdapterRegistry } from '@dbiz/capability-framework';
import { devChangeCapability, type EngineDependencies } from './capability.js';
import { DevChangeEngineOrchestrator, type EngineRuntime } from './orchestrators.js';
import { buildCatalogue } from './catalogue.js';
import type { RepositoryEvent } from './model.js';

export { devChangeCapability, CAPABILITY_ID } from './capability.js';
export type { EngineDependencies, EngineState } from './capability.js';

export {
  DevChangeEngineOrchestrator, defineDomainOrchestrator, domainOrchestrators, DOMAINS,
  repositoryOrchestrator, contextOrchestrator, diffOrchestrator, changeOrchestrator,
  dependencyOrchestrator, businessOrchestrator, riskOrchestrator, coverageOrchestrator,
  testDiscoveryOrchestrator, reuseOrchestrator, automationOrchestrator, authoringOrchestrator,
  executionOrchestrator, evidenceOrchestrator, healingOrchestrator, reflectionOrchestrator,
  rootCauseOrchestrator, defectOrchestrator, learningOrchestrator, syncOrchestrator,
  reportingOrchestrator, governanceOrchestrator,
} from './orchestrators.js';
export type {
  Domain, DomainOrchestrator, AgentContextFactory, EngineRuntime,
  DevChangeRequest, DevChangeOrchestrationResult,
} from './orchestrators.js';

export { STAGE_RULES } from './agents/governance.js';
export { buildCatalogue, ALL_AGENTS } from './catalogue.js';

export {
  azureDevOpsAdapters, githubJiraAdapters, sampleRepository, sampleAssets, resetAdapterSequence,
} from './adapters.js';
export type { AdapterJournal, SampleRepository } from './adapters.js';

export type * from './model.js';

/** Wire the master orchestrator with a capability factory bound to these dependencies. */
export function buildDevChangeEngineOrchestrator(
  deps: EngineDependencies, event: RepositoryEvent, registry: AdapterRegistry,
): DevChangeEngineOrchestrator {
  return new DevChangeEngineOrchestrator(
    (runtime: EngineRuntime) => devChangeCapability(deps, event, runtime),
    buildCatalogue(),
    registry,
  );
}
