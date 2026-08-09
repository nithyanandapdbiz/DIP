/**
 * REFERENCE CONFORMANCE — ADR-0040 Wave 2 connector SPIs.
 *
 * Exercises the reference implementations of the three connector SPIs (defined in
 * src/reference-connectors.ts) to prove each SPI is implementable and every
 * declared method is exercisable. No business logic, no external call, no
 * provider-specific code, no Functional-Testing logic.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-CONNECTOR-SPI · SPI governance (G-7) · capability-neutral (G-16)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTOR_SPI_DESCRIPTORS } from '../src/adapters.js';
import {
  referenceAuthenticationAdapter, referenceApplicationStrategyAdapter, referenceReportingAdapter,
  certifyConnectorReferences,
} from '../src/reference-connectors.js';

test('Wave 2 — every connector SPI has a complete, capability-neutral governance descriptor (G-7)', () => {
  assert.equal(CONNECTOR_SPI_DESCRIPTORS.length, 3);
  for (const d of CONNECTOR_SPI_DESCRIPTORS) {
    assert.ok(d.id && d.version && d.owner, 'identifier/version/owner present');
    assert.ok(d.requiredOperations.length > 0, 'required operations declared');
    assert.ok(d.failureSemantics && d.retrySemantics && d.securityModel && d.authenticationRequirements, 'semantics declared');
    assert.equal(d.capabilityNeutral, true);
    assert.ok(d.owner.startsWith('@dbiz/'), 'owned by a shared package');
  }
});

test('Wave 2 — every declared SPI method is exercised by its reference implementation', () => {
  const result = certifyConnectorReferences();
  assert.equal(result.ok, true);
  assert.equal(result.invoked, 18, 'all eighteen declared methods invoked');
});

test('Wave 2 — each reference implements every required operation declared for its SPI', () => {
  const refs: Record<string, unknown> = {
    AuthenticationAdapter: referenceAuthenticationAdapter,
    ApplicationStrategyAdapter: referenceApplicationStrategyAdapter,
    ReportingAdapter: referenceReportingAdapter,
  };
  for (const d of CONNECTOR_SPI_DESCRIPTORS) {
    const ref = refs[d.id] as Record<string, unknown>;
    for (const op of d.requiredOperations) {
      assert.equal(typeof ref[op], 'function', `${d.id}.${op} implemented`);
    }
  }
});

test('Wave 2 — failure semantics: a rejected credential returns a flag, never a throw', () => {
  const id = referenceAuthenticationAdapter.acquireIdentity({ principalRef: 'p', scopeRefs: [] });
  assert.equal(referenceAuthenticationAdapter.authenticate(id.identityRef, '').authenticated, false);
});
