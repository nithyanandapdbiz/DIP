/**
 * Verification authorization (stage 5), guardrails (stage 6) and campaign assembly (stage 7).
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md · 08-security-model.md · 12-capability-orchestration.md
 *   ADR          : ADR-0028
 *   Criteria     : C-11.13
 *
 * THE GOVERNANCE TRIAD, EXPRESSED IN VERIFICATION TERMS.
 *   Stage 4 architecture-review -> the Security Requirement Model (requirement.ts)
 *   Stage 5 policy-review       -> Verification Authorization (this file)
 *   Stage 6 guardrail-review    -> Verification Guardrails (this file)
 *
 * NO CHECK RUNS BEFORE THE GUARDRAIL STAGE CERTIFIES. The guardrail refuses a run that
 * requests an intrusive category (that is capability 6), that is not read-only, that
 * carries no authorization, or that has no in-scope host — before the execution stage is
 * reached. This is the analogue of pentest's "no destructive probe before any packet".
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  isIntrusive, type Authorization, type CheckCategory, type SecurityScope,
} from '../model.js';

// ── Verification authorization (stage 5, policy-review) ─────────────────────

export interface AuthorizationInput {
  readonly scope: SecurityScope;
  readonly inScopeCategories: readonly CheckCategory[];
  readonly requestedCategories: readonly string[];
}

export const authorizationAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<AuthorizationInput, readonly CheckCategory[]>({
    id: 'authorization.category-selection', domain: 'authorization',
    purpose: 'Select the verification categories to run from the requirement model and the request.',
    stage: 'policy-review', plane: 'IP', inputs: ['in-scope categories', 'requested categories'], outputs: ['the candidate verification categories'],
    responsibilities: ['default to the full in-scope set when nothing specific is requested', 'never select an intrusive category'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a category that cannot be resolved is excluded and reported, never run blind',
    handle: (i) => {
      const requestedVerification = i.requestedCategories.filter((c) => !isIntrusive(c)) as CheckCategory[];
      const wanted = requestedVerification.length > 0 ? new Set(requestedVerification) : new Set(i.inScopeCategories);
      return i.inScopeCategories.filter((c) => wanted.has(c));
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ asvsLevel: 1 | 2 | 3; categories: readonly CheckCategory[] }, readonly CheckCategory[]>({
    id: 'authorization.asvs-level-policy', domain: 'authorization',
    purpose: 'Apply the ASVS assurance level policy to the candidate categories.',
    stage: 'policy-review', plane: 'IP', inputs: ['assurance level', 'candidate categories'], outputs: ['the level-adjusted categories'],
    responsibilities: ['keep every candidate category; the level widens, never narrows silently'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unknown level defaults to level 1, the least-privileged assumption',
    handle: (i) => i.categories,
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ requestedCategories: readonly string[] }, readonly string[]>({
    id: 'authorization.intrusive-rejection', domain: 'authorization',
    purpose: 'Reject any requested category that is adversarial exploitation (capability 6 scope).',
    stage: 'policy-review', plane: 'IP', inputs: ['requested categories'], outputs: ['the rejected intrusive categories'],
    responsibilities: ['name every intrusive category so the guardrail can refuse the run'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an ambiguous category is treated as intrusive and rejected, the safe default',
    handle: (i) => i.requestedCategories.filter(isIntrusive),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ complianceTargets: readonly string[]; categories: readonly CheckCategory[] }, readonly string[]>({
    id: 'authorization.compliance-selection', domain: 'authorization',
    purpose: 'Confirm the selected categories cover the requested compliance frameworks.',
    stage: 'policy-review', plane: 'IP', inputs: ['compliance targets', 'selected categories'], outputs: ['the compliance frameworks covered'],
    responsibilities: ['report frameworks whose controls are not covered'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncovered framework is reported as a coverage gap, never marked satisfied',
    handle: (i) => i.complianceTargets,
  }) as unknown as AgentDefinition<never, unknown>,
];

// ── Verification guardrails (stage 6, guardrail-review) ─────────────────────

export interface GuardrailInput {
  readonly scope: SecurityScope;
  readonly candidateCategories: readonly CheckCategory[];
  readonly refusedIntrusive: readonly string[];
}

type Guard = { ok: boolean; reason: string };

export const guardrailAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<GuardrailInput, Guard>({
    id: 'guardrail.readonly-guard', domain: 'guardrail', purpose: 'Refuse any run that is not strictly read-only.',
    stage: 'guardrail-review', plane: 'IP', inputs: ['the scope'], outputs: ['a read-only verdict'],
    responsibilities: ['verification never mutates the target'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unverifiable read-only guarantee refuses the run',
    handle: (i) => i.scope.readOnly === true ? { ok: true, reason: 'read-only' } : { ok: false, reason: 'verification must be read-only; a state-changing mode was requested' },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<GuardrailInput, Guard>({
    id: 'guardrail.intrusive-guard', domain: 'guardrail', purpose: 'Refuse any run that requested an adversarial exploitation category.',
    stage: 'guardrail-review', plane: 'IP', inputs: ['the rejected intrusive categories'], outputs: ['an intrusive-category verdict'],
    responsibilities: ['active exploitation is capability 6, not capability 5'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'any intrusive category present refuses the whole run before execution',
    handle: (i) => i.refusedIntrusive.length === 0 ? { ok: true, reason: 'no intrusive category requested' } : { ok: false, reason: `intrusive categories belong to capability 6 (Penetration Testing Engine): ${i.refusedIntrusive.join(', ')}` },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<GuardrailInput, Guard>({
    id: 'guardrail.authorization-guard', domain: 'guardrail', purpose: 'Refuse any run with no authorization reference.',
    stage: 'guardrail-review', plane: 'IP', inputs: ['the scope'], outputs: ['an authorization verdict'],
    responsibilities: ['no verification without recorded authorization'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a blank authorization reference refuses the run',
    handle: (i) => (i.scope.authorizationReference ?? '').trim() !== '' ? { ok: true, reason: 'authorized' } : { ok: false, reason: 'no authorization reference supplied' },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<GuardrailInput, Guard>({
    id: 'guardrail.scope-guard', domain: 'guardrail', purpose: 'Refuse any run with no in-scope host.',
    stage: 'guardrail-review', plane: 'IP', inputs: ['the scope'], outputs: ['a scope verdict'],
    responsibilities: ['at least one authorised host must exist'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty host set refuses the run',
    handle: (i) => i.scope.allowedHosts.length > 0 ? { ok: true, reason: `${i.scope.allowedHosts.length} host(s) in scope` } : { ok: false, reason: 'no authorised host in scope' },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<GuardrailInput, Guard>({
    id: 'guardrail.production-guard', domain: 'guardrail', purpose: 'Confirm read-only verification is safe against the declared environment.',
    stage: 'guardrail-review', plane: 'IP', inputs: ['the scope'], outputs: ['a production-safety verdict'],
    responsibilities: ['read-only verification is safe anywhere; a non-read-only run against production is refused'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unclear environment is treated as production',
    handle: (i) => {
      const production = i.scope.environment === 'production' || i.scope.environment === 'unknown';
      return production && i.scope.readOnly !== true ? { ok: false, reason: 'a non-read-only run against production is refused' } : { ok: true, reason: production ? 'read-only verification is production-safe' : 'non-production target' };
    },
  }) as unknown as AgentDefinition<never, unknown>,
];

export function assembleAuthorization(scope: SecurityScope, candidateCategories: readonly CheckCategory[], guards: readonly Guard[], refusedIntrusive: readonly string[]): Authorization {
  const refusals = guards.filter((g) => !g.ok).map((g) => g.reason);
  const certified = refusals.length === 0;
  return {
    targetId: scope.targetId,
    authorizedCategories: certified ? candidateCategories : [],
    refusedCategories: refusedIntrusive,
    asvsLevel: scope.asvsLevel,
    readOnly: scope.readOnly,
    certified,
    refusals,
  };
}

// ── Verification campaign (stage 7, execution-planning) ─────────────────────

export interface VerificationCampaign {
  readonly batches: readonly (readonly CheckCategory[])[];
  readonly parallelism: number;
  readonly ordered: readonly CheckCategory[];
}

export const campaignAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ authorizedCategories: readonly CheckCategory[] }, readonly CheckCategory[]>({
    id: 'campaign.planner', domain: 'campaign', purpose: 'Order the authorized verification categories cheapest-signal-first.',
    stage: 'execution-planning', plane: 'IP', inputs: ['authorized categories'], outputs: ['the ordered category list'],
    responsibilities: ['run configuration and dependency checks before deeper analysis'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unorderable category is appended at the end, never dropped',
    handle: (i) => [...i.authorizedCategories].sort(),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ ordered: readonly CheckCategory[] }, VerificationCampaign>({
    id: 'campaign.batch-optimiser', domain: 'campaign', purpose: 'Batch categories for parallel, read-only verification.',
    stage: 'execution-planning', plane: 'IP', inputs: ['ordered categories'], outputs: ['batches and parallelism'],
    responsibilities: ['size batches so read-only checks stay well within any rate budget'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty category set produces an empty campaign, reported as zero coverage',
    handle: (i) => {
      const size = 6;
      const batches: CheckCategory[][] = [];
      for (let n = 0; n < i.ordered.length; n += size) batches.push(i.ordered.slice(n, n + size));
      return { batches, parallelism: Math.min(4, batches.length || 1), ordered: i.ordered };
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ campaign: VerificationCampaign }, { scheduled: number }>({
    id: 'campaign.scheduler', domain: 'campaign', purpose: 'Schedule the verification batches for execution.',
    stage: 'execution-planning', plane: 'IP', inputs: ['the campaign'], outputs: ['the scheduled batch count'],
    responsibilities: ['preserve batch order at execution time'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unschedulable batch is reported, never silently skipped',
    handle: (i) => ({ scheduled: i.campaign.batches.length }),
  }) as unknown as AgentDefinition<never, unknown>,
];
