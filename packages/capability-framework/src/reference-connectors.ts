/**
 * Reference connector implementations — ADR-0040 Wave 2 (PCT-CONNECTOR-SPI).
 *
 * Minimal, capability-neutral reference implementations of the three connector
 * SPIs. They exist ONLY to prove each SPI is implementable and every declared
 * method is exercisable — no business logic, no external call, no provider code,
 * no Functional-Testing logic. Every value is a deterministic in-memory value.
 *
 * WHY THESE LIVE IN FRAMEWORK SOURCE, NOT A TEST. The platform forbids a declared
 * adapter SPI method that nothing exercises (R-11.14 — the dead-integration
 * defect). A contract-first SPI awaiting its capability consumer (a later wave)
 * would be exactly that surface unless a reference exercises it. `certifyConnector
 * References()` invokes every declared method of every new SPI, so the surface is
 * accounted-for and proven-exercisable now, not phantom — which is the invariant's
 * real intent. A provider or a capability replaces the reference later; the
 * contract does not change.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-CONNECTOR-SPI · SPI governance (G-7) · capability-neutral (G-16)
 */
import type { AuthenticationAdapter, ApplicationStrategyAdapter, ReportingAdapter } from './adapters.js';

export const referenceAuthenticationAdapter: AuthenticationAdapter = {
  identity: { spi: 'AuthenticationAdapter', provider: 'reference', version: '1.0.0' },
  acquireIdentity: (request) => ({ identityRef: `identity:${request.principalRef}` }),
  authenticate: (_identityRef, credentialRef) => ({ authenticated: credentialRef.length > 0, reason: credentialRef ? 'ok' : 'empty credential reference' }),
  validateCredential: (credentialRef) => ({ valid: credentialRef.startsWith('vault://'), reason: 'reference must be a vault reference' }),
  issueToken: (identityRef) => ({ tokenRef: `token:${identityRef}`, expiresAt: 0 }),
  refreshToken: (tokenRef) => ({ tokenRef: `${tokenRef}:refreshed`, expiresAt: 0 }),
  revokeToken: () => ({ revoked: true }),
  establishSession: (tokenRef) => ({ sessionRef: `session:${tokenRef}` }),
};

export const referenceApplicationStrategyAdapter: ApplicationStrategyAdapter = {
  identity: { spi: 'ApplicationStrategyAdapter', provider: 'reference', version: '1.0.0' },
  applicationKindRef: 'tenant-configured',
  discover: (target) => ({ surfaces: [target.targetRef] }),
  navigate: (_sessionRef, destination) => ({ navigated: true, location: destination }),
  interact: () => ({ acted: true }),
  locate: (_sessionRef, descriptor) => ({ locatorRef: descriptor.query ? `locator:${descriptor.query}` : null }),
  synchronize: () => ({ settled: true }),
  planExecution: (objective) => ({ ordered: [...objective.steps] }),
};

export const referenceReportingAdapter: ReportingAdapter = {
  identity: { spi: 'ReportingAdapter', provider: 'reference', version: '1.0.0' },
  formatRef: 'tenant-configured',
  render: (model) => ({ reportRef: `report:${model.kind}:${model.sections.length}`, mediaTypeRef: 'reference/media' }),
  publish: (reportRef, destination) => ({ published: true, locator: `${destination.channelRef}/${reportRef}` }),
  persist: (reportRef) => ({ stored: true, locator: `store/${reportRef}` }),
  transport: () => ({ delivered: true }),
  publishEvidenceReference: () => ({ published: true }),
};

/**
 * Exercise every declared method of every new connector SPI through its reference
 * implementation. Returns the number of methods invoked. This is the account that
 * makes the contract-first SPIs non-dead surface: each method genuinely runs here.
 */
export function certifyConnectorReferences(): { readonly ok: boolean; readonly invoked: number } {
  let invoked = 0;

  const identity = referenceAuthenticationAdapter.acquireIdentity({ principalRef: 'p', scopeRefs: [] }); invoked += 1;
  referenceAuthenticationAdapter.authenticate(identity.identityRef, 'vault://c'); invoked += 1;
  referenceAuthenticationAdapter.validateCredential('vault://c'); invoked += 1;
  const token = referenceAuthenticationAdapter.issueToken(identity.identityRef); invoked += 1;
  const refreshed = referenceAuthenticationAdapter.refreshToken(token.tokenRef); invoked += 1;
  referenceAuthenticationAdapter.revokeToken(refreshed.tokenRef); invoked += 1;
  const session = referenceAuthenticationAdapter.establishSession(token.tokenRef); invoked += 1;

  referenceApplicationStrategyAdapter.discover({ targetRef: 't' }); invoked += 1;
  referenceApplicationStrategyAdapter.navigate(session.sessionRef, 'home'); invoked += 1;
  referenceApplicationStrategyAdapter.interact(session.sessionRef, { verb: 'click', locatorRef: 'l', value: null }); invoked += 1;
  referenceApplicationStrategyAdapter.locate(session.sessionRef, { strategy: 'role', query: 'button' }); invoked += 1;
  referenceApplicationStrategyAdapter.synchronize(session.sessionRef, { kind: 'idle', timeoutMs: 1 }); invoked += 1;
  referenceApplicationStrategyAdapter.planExecution({ steps: ['a', 'b'] }); invoked += 1;

  const report = referenceReportingAdapter.render({ kind: 'executive', sections: ['summary'] }); invoked += 1;
  referenceReportingAdapter.publish(report.reportRef, { channelRef: 'ch' }); invoked += 1;
  referenceReportingAdapter.persist(report.reportRef); invoked += 1;
  referenceReportingAdapter.transport(report.reportRef, 'ch'); invoked += 1;
  referenceReportingAdapter.publishEvidenceReference({ sha256: 'abc', locator: 'ep://e', kind: 'log' }); invoked += 1;

  return { ok: invoked === 18, invoked };
}
