/**
 * Canonical Domain Contract + Observational Domain State — ADR-0040 Wave 1
 * (PCT-DOMAIN, PCT-DOMAIN-STATE).
 *
 * A domain is an internal unit of work a capability composes WITHIN the frozen
 * twelve-stage lifecycle (R-12.18). This contract defines PLATFORM behaviour only
 * — input, output, pre/postconditions, failure semantics, determinism,
 * observability, audit and certification requirements. It is capability-neutral:
 * it names no tool, provider, AI vendor or Functional-Testing concept (G-16).
 *
 * The Domain State model is OBSERVATIONAL ONLY (Q2, G-9): it exists for
 * visibility, diagnostics, certification and reporting. It never influences,
 * schedules or bypasses execution, and it is not a lifecycle — the twelve-stage
 * pipeline remains authoritative. The certification framework enforces this.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 13-ai-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-DOMAIN · PCT-DOMAIN-STATE · observational-only (Q2, G-9)
 */

import type { ExecutionContext } from './execution-context.js';

/** Failure semantics — a domain reports why it could not certify, and whether recovery is possible. */
export interface DomainFailure {
  readonly category: string;
  readonly reason: string;
  readonly recoverable: boolean;
}

export interface DomainOutput<O> {
  readonly output: O | null;
  readonly certified: boolean;
  readonly failure: DomainFailure | null;
  readonly observations: readonly string[];
}

/**
 * The contract every platform domain implements. `determinism` is either fully
 * deterministic or AI-enhanced-but-still-deterministic — never AI-required (G-6).
 */
export interface DomainContract<I, O> {
  readonly id: string;
  readonly version: string;
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly determinism: 'deterministic' | 'ai-enhanced-deterministic';
  readonly observability: readonly string[];
  readonly auditRequired: true;
  readonly certificationCriteria: readonly string[];
  /** Consumes the immutable execution context; returns an output. It never mutates the context. */
  execute(input: I, ctx: ExecutionContext): DomainOutput<O>;
}

/**
 * The observational domain-state projection. These are states a domain may be
 * OBSERVED in — they are recorded for diagnostics and certification, never used
 * to sequence execution. This is NOT the twelve-stage typestate and NOT the six
 * canonical tenant states.
 */
export const DOMAIN_STATES = [
  'pending', 'initialized', 'discovering', 'planning', 'executing', 'validating',
  'synchronizing', 'reporting', 'certified', 'completed', 'failed', 'archived',
] as const;
export type DomainState = (typeof DOMAIN_STATES)[number];

export interface DomainStateObservation {
  readonly domainId: string;
  readonly state: DomainState;
  readonly at: number;
  readonly note: string;
}

/**
 * Record an observed state. PURE — it returns a frozen observation and has no
 * side effect on execution: it schedules nothing and advances nothing (G-9).
 */
export function observeDomainState(domainId: string, state: DomainState, at: number, note: string): DomainStateObservation {
  return Object.freeze({ domainId, state, at, note });
}

export function isObservationalState(value: string): value is DomainState {
  return (DOMAIN_STATES as readonly string[]).includes(value);
}
