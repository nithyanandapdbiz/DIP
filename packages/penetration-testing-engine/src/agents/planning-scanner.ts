/**
 * Scan authorization (stage 5, policy-review) and campaign assembly (stage 7,
 * execution-planning) — Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 12-capability-orchestration.md · 14-tool-operating-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-11.13 (no capability bypasses the governance triad) · C-13.1
 *
 * SCAN AUTHORIZATION IS A GOVERNANCE-TRIAD STAGE, NOT AN AFTERTHOUGHT.
 * The mission's linear workflow names a "Scanner Review" and a "Scanner Certification" but no
 * architecture review, policy review or guardrail review by those names. Those three stages
 * are mandatory (R-12.2) and no capability may bypass them. Here they are the attack-surface
 * model (stage 4, in recon), scan authorization (stage 5, here) and the scan guardrails
 * (stage 6, in scope). An engine that followed the linear list literally would ship a
 * capability the registry refuses — ADR-0027 §3.
 *
 * WHICH CATEGORIES MAY FIRE IS DECIDED HERE, BEFORE ANY PACKET.
 * These agents select the categories permitted by the configured phase ceiling and safe mode.
 * The scanners themselves re-check the resulting authorization, so a category can only fire if
 * both the plan authorized it and the scanner confirmed the authorization.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  CATEGORY_DESTRUCTIVE, CATEGORY_PHASE, SCAN_PHASES, phaseAllowed,
  type Endpoint, type FindingCategory, type PentestScope, type ScanPhase,
} from '../model.js';

const ALL_CATEGORIES = Object.keys(CATEGORY_PHASE) as FindingCategory[];

export interface ScanPlan {
  readonly phaseCeiling: ScanPhase;
  readonly activePhases: readonly ScanPhase[];
  readonly selectedCategories: readonly FindingCategory[];
  readonly destructiveCategories: readonly FindingCategory[];
  readonly rationale: string;
}

// ── Scan authorization — stage 5 (policy-review, IP) ────────────────────────

export interface AuthorizationInput {
  readonly scope: PentestScope;
  readonly endpoints: readonly Endpoint[];
  readonly exposureScore: number;
}

export const scanAuthorizationAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<AuthorizationInput, readonly ScanPhase[]>({
    id: 'scanner.phase-policy', domain: 'scanner', stage: 'policy-review', plane: 'IP',
    purpose: 'Determine which scan phases are active under the configured ceiling.',
    inputs: ['AuthorizationInput'], outputs: ['ScanPhase[]'],
    responsibilities: ['include a phase only if it is at or below the ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable phase policy falls back to passive only, which sends no active probe.',
    handle: (input) => SCAN_PHASES.filter((p) => phaseAllowed(input.scope.scanPhaseCeiling, p)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<AuthorizationInput, readonly FindingCategory[]>({
    id: 'scanner.category-selection', domain: 'scanner', stage: 'policy-review', plane: 'IP',
    purpose: 'Select the vulnerability categories permitted by the active phases.',
    inputs: ['AuthorizationInput'], outputs: ['FindingCategory[]'],
    responsibilities: ['select every category whose phase is within the ceiling'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable selection falls back to the passive categories only.',
    handle: (input) => ALL_CATEGORIES.filter((c) => phaseAllowed(input.scope.scanPhaseCeiling, CATEGORY_PHASE[c])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ scope: PentestScope; selected: readonly FindingCategory[]; endpoints: readonly Endpoint[] }, readonly FindingCategory[]>({
    id: 'scanner.injection-authorization', domain: 'scanner', stage: 'policy-review', plane: 'IP',
    purpose: 'Authorize injection categories only when the surface has parameters to inject.',
    inputs: ['selected categories', 'Endpoint[]'], outputs: ['FindingCategory[]'],
    responsibilities: ['drop an injection category with no parameterised endpoint to target'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no parameters observed, injection categories are dropped rather than fired blindly at an unparameterised surface.',
    handle: (input) => {
      const hasParams = input.endpoints.some((e) => e.parameterNames.length > 0);
      const injection: FindingCategory[] = ['sql-injection', 'blind-sql-injection', 'nosql-injection', 'command-injection', 'ldap-injection', 'ssti', 'xxe'];
      return input.selected.filter((c) => (injection.includes(c) ? hasParams : true));
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ scope: PentestScope; selected: readonly FindingCategory[] }, ScanPlan>({
    id: 'scanner.safe-mode-preselect', domain: 'scanner', stage: 'policy-review', plane: 'IP',
    purpose: 'Assemble the proposed scan plan, marking destructive categories for the guardrail stage.',
    inputs: ['selected categories'], outputs: ['ScanPlan'],
    responsibilities: ['record which selected categories are destructive', 'never silently drop; the guardrail decides'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unassemblable plan defaults to passive-only, which the guardrail stage certifies trivially.',
    handle: (input) => {
      const destructive = input.selected.filter((c) => CATEGORY_DESTRUCTIVE[c]);
      const activePhases = SCAN_PHASES.filter((p) => phaseAllowed(input.scope.scanPhaseCeiling, p));
      return {
        phaseCeiling: input.scope.scanPhaseCeiling, activePhases,
        selectedCategories: input.selected, destructiveCategories: destructive,
        rationale: `${input.selected.length} categor(y/ies) selected across ${activePhases.join(', ')}; ${destructive.length} destructive, pending the guardrail`,
      };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Campaign assembly — stage 7 (execution-planning, IP) ────────────────────

export interface ScanCampaign {
  readonly batches: readonly (readonly FindingCategory[])[];
  readonly requestsPerSecond: number;
  readonly ordered: readonly FindingCategory[];
  readonly parallelism: number;
}

export interface CampaignInput {
  readonly authorizedCategories: readonly FindingCategory[];
  readonly requestsPerSecond: number;
}

export const campaignAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<CampaignInput, readonly FindingCategory[]>({
    id: 'scanner.campaign-planner', domain: 'scanner', stage: 'execution-planning', plane: 'IP',
    purpose: 'Order the authorized categories by phase, least intrusive first.',
    inputs: ['CampaignInput'], outputs: ['ordered categories'],
    responsibilities: ['order passive before active-safe before active-full'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unorderable campaign runs passive categories only, which is the safe subset.',
    handle: (input) => [...input.authorizedCategories].sort((a, b) =>
      SCAN_PHASES.indexOf(CATEGORY_PHASE[a]) - SCAN_PHASES.indexOf(CATEGORY_PHASE[b]) || (a < b ? -1 : 1)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ ordered: readonly FindingCategory[]; requestsPerSecond: number }, ScanCampaign>({
    id: 'scanner.batch-optimiser', domain: 'scanner', stage: 'execution-planning', plane: 'IP',
    purpose: 'Group ordered categories into batches sized by the request budget.',
    inputs: ['ordered categories', 'request budget'], outputs: ['ScanCampaign'],
    responsibilities: ['bound batch size by the request budget'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unsizable batch runs one category at a time, which is slow but never a load event.',
    handle: (input) => {
      const parallelism = Math.max(1, Math.min(8, Math.floor(input.requestsPerSecond / 4)));
      const batches: FindingCategory[][] = [];
      for (let i = 0; i < input.ordered.length; i += parallelism) batches.push(input.ordered.slice(i, i + parallelism));
      return { batches, requestsPerSecond: input.requestsPerSecond, ordered: input.ordered, parallelism };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ campaign: ScanCampaign }, ScanCampaign>({
    id: 'scanner.scheduler', domain: 'scanner', stage: 'execution-planning', plane: 'IP',
    purpose: 'Finalise the scan schedule, preserving phase ordering across batches.',
    inputs: ['ScanCampaign'], outputs: ['ScanCampaign'],
    responsibilities: ['never schedule an active-full batch before an active-safe one completes'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unschedulable campaign preserves the input order, which is already phase-sorted.',
    handle: (input) => input.campaign,
  }) as AgentDefinition<never, unknown>,
];

export { ALL_CATEGORIES };
