/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0034 · ADR-0033
 *
 * @dbiz/tenant-onboarding-engine — the consolidated Tenant Onboarding Engine (ADR-0034).
 *
 * One Node bounded context for the whole tenant journey:
 *   domain/  — onboard(), the six FROZEN canonical states (R-21.5), OnboardingConfiguration
 *              schema, validateOnboarding + the R-21.11 guard, the INV-2 credential guard.
 *   engine/  — the tenant.json SSOT repository, session, edge-discovery, AI-optional
 *              recommendations, REST route()/RBAC/session tokens, resolver, dashboard/diff, client.
 *   server/  — the NestJS HTTP tier (createApp/bootstrap) over the tested route().
 *
 * Invariants P1–P7 (ADR-0034) are preserved: the states are unchanged, INV-2/3/9 hold,
 * the SSOT is the one tenant.json, and the Engine is a product surface — NOT a seventh
 * certifiable capability (R-11.4).
 */
export * from './domain/index.js';
export * from './engine/index.js';
export { createApp, bootstrap } from './server/main.js';
