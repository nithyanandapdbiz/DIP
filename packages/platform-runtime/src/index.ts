/**
 * @dbiz/platform-runtime — Intelligence Plane runtime infrastructure.
 *
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md §2a · 07-tenant-isolation.md
 *                  08-security-model.md §5a · 21-tenant-lifecycle.md §3b
 *   ADR          : ADR-0021 · ADR-0010 · ADR-0008 · ADR-0007
 *   Criteria     : C-08.20 (mTLS and OAuth together) · C-08.21 (rotation with overlap)
 *                  C-08.22 (nonce replay rejected) · C-08.23 (gateway precedes components)
 *                  C-08.25 (revocation without customer action) · C-07.1 (canonical paths)
 *                  C-07.12 (per-tenant quotas)
 *
 * Platform Core infrastructure: identity, authentication, gateway, isolation, vault.
 * It contains no capability engine and no AI, and nothing here dials into a customer
 * tenancy — the Execution Plane always initiates (INV-3).
 */
export { CertificateAuthority } from './certificate-authority.js';
export type { CertificateMaterial, CertificateAuthorityOptions, ChainValidation } from './certificate-authority.js';

export { AuthorisationServer, loadOrCreateSigningKey, InMemoryNonceStore } from './authentication.js';
export type {
  AccessToken, RefreshToken, OAuthClient, TokenVerification, AuthorisationServerOptions, NonceStore,
} from './authentication.js';

export { ApiGateway } from './gateway.js';
export type { GatewayRequest, GatewayResponse, GatewayOptions, AuditEvent } from './gateway.js';

export { RegistrationService } from './registration.js';
export type {
  RegistrationRequest, RegistrationGrant, RegistrationOutcome, RegistrationServiceOptions, AuditRecord,
} from './registration.js';

export {
  TenantPaths, TenantPathError, TenantStorage, TenantQueues,
  TenantConfiguration, TenantQuotas, TenantVault,
} from './tenant-runtime.js';
export type { PathRejection, SecretVersion } from './tenant-runtime.js';
