/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 1.
 *
 * The minimal Platform Reference Capability the directive requires: it exists
 * ONLY to prove the three canonical execution contracts are internally
 * consistent and consumable. It contains no Functional-Testing behaviour, no
 * connector logic and no business logic — a trivial, capability-neutral domain
 * that consumes the Execution Context, implements the Domain Contract, and
 * observes Domain State.
 *
 * It proves, by execution:
 *   - the Execution Context is sealed and immutable (G-8);
 *   - append-only metadata preserves every immutable field by identity (G-8);
 *   - the Domain State model is observational only — observing it does not change
 *     execution (Q2, G-9);
 *   - a domain consumes all three contracts without any capability-specific type.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-EXEC-CONTEXT · PCT-DOMAIN · PCT-DOMAIN-STATE (Wave 1 reference conformance)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sealExecutionContext, appendMetadata, isContextSealed, IMMUTABLE_FIELDS, EXECUTION_CONTEXT_VERSION,
  type ExecutionContext,
} from '../src/execution-context.js';
import {
  observeDomainState, DOMAIN_STATES, isObservationalState,
  type DomainContract, type DomainOutput,
} from '../src/domain.js';

function makeContext(): ExecutionContext {
  return sealExecutionContext({
    contractVersion: EXECUTION_CONTEXT_VERSION,
    correlationId: 'corr-1',
    tenant: { tenantId: 't1', environment: 'test' },
    governance: { policyVersion: '1.0.0', governanceTriadRequired: true },
    security: { zeroTrust: true, classification: 'internal' },
    configuration: { configVersion: '1.0.0', source: 'tenant' },
    decision: { deterministic: true, aiAdvisoryOnly: true },
    audit: { auditLogId: 'log-1', appendOnly: true },
    trace: { traceId: 'tr-1', spanId: 'sp-1' },
    capability: { capabilityId: 'reference', capabilityVersion: '0.0.0' },
    environment: { platform: process.platform, runtime: process.version },
    metadata: { entries: [] },
  });
}

test('Wave 1 — the execution context is sealed and immutable (G-8)', () => {
  const ctx = makeContext();
  assert.ok(isContextSealed(ctx), 'context must be deep-frozen once sealed');
  assert.throws(() => { (ctx as unknown as { correlationId: string }).correlationId = 'x'; },
    'an immutable field must not be assignable');
  assert.throws(() => { (ctx.tenant as unknown as { tenantId: string }).tenantId = 'y'; },
    'a nested immutable field must not be assignable');
});

test('Wave 1 — append-only metadata preserves every immutable field by identity (G-8)', () => {
  const ctx = makeContext();
  const next = appendMetadata(ctx, 'stage', 'planning', 1);
  for (const field of IMMUTABLE_FIELDS) {
    assert.equal(
      (next as unknown as Record<string, unknown>)[field],
      (ctx as unknown as Record<string, unknown>)[field],
      `immutable field ${field} must be carried by identity, never re-created`);
  }
  assert.equal(next.metadata.entries.length, 1, 'metadata is the only thing that grows');
  assert.equal(ctx.metadata.entries.length, 0, 'the original context is untouched');
  assert.ok(isContextSealed(next));
});

test('Wave 1 — a capability-neutral domain consumes all three contracts', () => {
  const domain: DomainContract<number, number> = {
    id: 'reference-domain',
    version: '1.0.0',
    preconditions: ['input is a finite number'],
    postconditions: ['output equals input'],
    determinism: 'deterministic',
    observability: ['reference.executed'],
    auditRequired: true,
    certificationCriteria: ['deterministic', 'observational-state'],
    execute(input: number, ctx: ExecutionContext): DomainOutput<number> {
      void ctx.correlationId; // consumes the context; never mutates it
      return { output: input, certified: true, failure: null, observations: ['reference.executed'] };
    },
  };
  const ctx = makeContext();
  const before = domain.execute(21, ctx);
  assert.deepEqual(before, { output: 21, certified: true, failure: null, observations: ['reference.executed'] });
});

test('Wave 1 — domain state is observational only and never influences execution (Q2/G-9)', () => {
  const domain: DomainContract<number, number> = {
    id: 'reference-domain', version: '1.0.0', preconditions: [], postconditions: [],
    determinism: 'deterministic', observability: ['reference.executed'], auditRequired: true,
    certificationCriteria: ['observational-state'],
    execute(input: number): DomainOutput<number> {
      return { output: input, certified: true, failure: null, observations: [] };
    },
  };
  const ctx = makeContext();
  const before = domain.execute(7, ctx);
  const observation = observeDomainState(domain.id, 'executing', 1, 'mid-run');
  assert.ok(isObservationalState(observation.state));
  assert.ok(Object.isFrozen(observation), 'an observation is an inert, frozen record');
  const after = domain.execute(7, ctx);
  assert.deepEqual(before, after, 'observing state must not change execution');
  assert.equal(DOMAIN_STATES.length, 12, 'twelve observational states');
});
