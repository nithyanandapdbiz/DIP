/**
 * DI token for the injected domain dependencies (repository, services, endpoint, authenticate).
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0034 · ADR-0033
 */
export const TENANT_DEPS = Symbol('TENANT_DEPS');

/** DI token for the Microsoft (Entra) sign-in bridge dependencies (config + optional verifier). */
export const MS_AUTH = Symbol('MS_AUTH');

/** DI token for the EP registration/trust-establishment dependencies (OTC store + issuance). */
export const REGISTRATION_DEPS = Symbol('REGISTRATION_DEPS');

/** DI token for sealed package retrieval (ADR-0079): the tenant repository + the package store. */
export const PACKAGE_DEPS = Symbol('PACKAGE_DEPS');

/**
 * DI token for evidence ingress (ADR-0082, D-128): the tenant repository + the authenticator.
 *
 * NO STORE YET, DELIBERATELY. ADR-0082 P-82.2's durable record is §6 step 3; until it exists this
 * route validates and refuses but persists nothing, and the absence of a store field is how a
 * reader can tell.
 */
export const EVIDENCE_DEPS = Symbol('EVIDENCE_DEPS');
