/**
 * Recommendations — AI-optional, deterministic-by-default suggestions over discovered data.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md (R-11.4 six capabilities) · 21-tenant-lifecycle.md §3 (R-21.11)
 *   ADR          : ADR-0031 · ADR-0016 (AI as capability classes, never a product — INV-9)
 *   Invariant    : INV-7 (the platform is AI-optional and certifies with AI disabled)
 *
 * RECOMMENDATIONS ENHANCE; THEY NEVER GATE. Every recommendation has a deterministic
 * derivation. An AI advisor may re-rank or explain, but with AI disabled the engine still
 * produces a complete, sensible set and onboarding still certifies (INV-7). The advisor is
 * injected and provider-agnostic: it is handed candidates and a context string, never a
 * vendor name and never a credential (INV-9).
 *
 * CAPABILITY RECOMMENDATIONS ARE BOUNDED BY THE EXECUTION-PATH GUARD (R-21.11). The engine
 * cannot recommend a capability that has no built engine — it reuses the platform's own
 * registry, so a recommendation can never entitle something that would fail at provisioning.
 */
import { CAPABILITIES_WITH_EXECUTION_PATH } from '../domain/index.js';
import type { DiscoveredMetadata } from './discovery.js';
import { detectFramework } from './discovery.js';

/**
 * The advisor seam. Provider-agnostic (INV-9): it ranks candidates for a context, or
 * returns them unchanged. The deterministic advisor is the default and the fallback.
 */
export interface Advisor {
  readonly aiEnabled: boolean;
  rank<T>(candidates: readonly T[], context: string): readonly T[];
}

export const deterministicAdvisor: Advisor = {
  aiEnabled: false,
  rank: (candidates) => candidates,
};

export interface Recommendation<T> {
  readonly value: T;
  readonly rationale: string;
  readonly aiAssisted: boolean;
  readonly overridable: true;
}

export interface RecommendationSet {
  readonly project?: Recommendation<string>;
  readonly repository?: Recommendation<string>;
  readonly testManagement?: Recommendation<string>;
  /** The programming language the EP solution is generated for (typescript / java / python / …). */
  readonly language?: Recommendation<string>;
  readonly automationFramework?: Recommendation<'playwright' | 'selenium'>;
  readonly capabilities: Recommendation<readonly string[]>;
  readonly deploymentModel?: Recommendation<string>;
}

function rec<T>(value: T, rationale: string, ai: boolean): Recommendation<T> {
  return { value, rationale, aiAssisted: ai, overridable: true };
}

/**
 * Build the recommendation set from discovered metadata. Deterministic; the advisor only
 * re-orders candidate lists and flags AI assistance. Nothing here can fail onboarding.
 */
export function recommend(
  discovered: DiscoveredMetadata,
  advisor: Advisor = deterministicAdvisor,
  preferredDeployment?: string,
): RecommendationSet {
  const ai = advisor.aiEnabled;

  // Project — most-active discovered project.
  const pmProjects = discovered.projectManagement?.projects ?? [];
  const rankedProjects = advisor.rank([...pmProjects].sort((a, b) => (b.recentActivity ?? 0) - (a.recentActivity ?? 0)), 'ranking:project');
  const topProject = rankedProjects[0];

  // Repository — first discovered repo with a detected framework, else first repo.
  const repos = discovered.sourceControl?.repositories ?? [];
  const withFramework = repos.find((r) => r.detectedFramework === 'playwright' || r.detectedFramework === 'selenium');
  const repo = withFramework ?? repos[0];

  // Automation framework — detected, bounded by what the platform SUPPORTS.
  const framework = discovered.sourceControl ? detectFramework(discovered.sourceControl) : null;

  // Test management — the connected provider, if any.
  const tm = discovered.testManagement?.provider;

  // Capabilities — a safe baseline, plus signal-driven additions, ALWAYS bounded by R-21.11.
  const baseline = ['functional-testing', 'inverse-flow-discovery'];
  const signalled: string[] = [];
  if ((discovered.application?.apiEndpoints?.length ?? 0) > 0) signalled.push('performance');
  const proposed = [...new Set([...baseline, ...signalled])]
    .filter((c) => CAPABILITIES_WITH_EXECUTION_PATH.has(c));
  const capabilities = advisor.rank(proposed, 'ranking:capabilities') as readonly string[];

  return {
    ...(topProject ? { project: rec(topProject.key, ai ? 'Ranked highest by recent activity and AI signal.' : 'Most-active discovered project.', ai) } : {}),
    ...(repo ? { repository: rec(repo.name, repo.detectedFramework ? `Has a detected ${repo.detectedFramework} suite.` : 'First discovered repository.', ai) } : {}),
    ...(tm ? { testManagement: rec(tm, 'The connected test-management provider.', ai) } : {}),
    ...(framework ? { automationFramework: rec(framework, `Detected ${framework} in the source repositories.`, ai) } : {}),
    capabilities: rec(capabilities, 'Baseline coverage; only capabilities with a verified execution path (R-21.11).', ai),
    ...(preferredDeployment ? { deploymentModel: rec(preferredDeployment, 'From your stated deployment preference.', ai) } : {}),
  };
}
