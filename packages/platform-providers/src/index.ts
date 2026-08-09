/**
 * @dbiz/platform-providers (ADR-0060) — cloud-native infrastructure abstraction.
 *
 * TRACEABILITY: 17-deployment-topology.md (R-17.11/12/15/20) · ADR-0060
 *
 * One image everywhere; local vs. cloud is configuration, never code. No `@azure/*` dependency.
 * Business logic consumes these providers and never reads `process.env` (except the Configuration
 * Provider), never calls `node:fs` (except the Storage Provider), and never names a cloud primitive.
 */
export { ConfigurationProvider, ConfigurationError } from './config/configuration-provider.js';
export type { EnvSnapshot, ConfigOverrides, EffectiveConfig } from './config/configuration-provider.js';
export {
  PlatformConfigSchema, EnvironmentName, StorageBackend, SecretBackend, StateBackend, LogLevel,
} from './config/schema.js';
export type { PlatformConfig } from './config/schema.js';

export { tenantContext, normaliseTenantSlug, tenantPartition } from './tenant/tenant-context.js';
export type { TenantContext } from './tenant/tenant-context.js';

export {
  FilesystemStorageProvider, InMemoryStorageProvider, artefactPath,
} from './storage/storage-provider.js';
export type { StorageProvider, ArtefactKey } from './storage/storage-provider.js';

export {
  SealedPackageStore, SealedPackageWriteRefused, sealedPackageRefusal,
  AUTHORISING_ADR, SEALED_PACKAGE_RETENTION, SEALED_PACKAGE_CAPABILITY, SEALED_PACKAGE_RUN,
} from './storage/sealed-package-store.js';
export type {
  TenantOwnershipResolver, SealedPackageRetrieval,
} from './storage/sealed-package-store.js';

export {
  SealedPackagePurgeDriver, sealedPackageService, nodeIntervalScheduler,
  DEFAULT_PURGE_INTERVAL_MS,
} from './storage/sealed-package-purge.js';
export type {
  PurgeDriverDeps, PurgeSweepOutcome, IntervalScheduler, SealedPackageService,
} from './storage/sealed-package-purge.js';

// ── The Run Record Store (ADR-0082 §6 step 2) ────────────────────────────────────────────────
//
// `AUTHORISING_ADR` is NOT re-exported here: `sealed-package-store.ts` already exports that name,
// and two stores exporting one symbol under one name is the second-source defect in miniature.
// Each store's authorising ADR is read from its own module by the document-06 gate, which is the
// only reader that needs it (P-82.8's multi-subject enumeration, §6 step 4).
export {
  RunRecordStore, RunRecordWriteRefused,
  RUN_RECORD_RETENTION, RUN_RECORD_CAPABILITY, RUN_RECORD_RUN, RUN_RECORD_EVIDENCE_RUN,
} from './storage/run-record-store.js';
export type {
  RunRecord, PackageAuthoredEvent,
  EvidenceRecord, EvidenceArrivedEvent, EvidenceReferenceRecord, EvidenceArrivalOutcome,
} from './storage/run-record-store.js';

export { RunRecordPurgeDriver, runRecordService } from './storage/run-record-purge.js';
export type {
  RunRecordPurgeDriverDeps, RunRecordPurgeSweepOutcome, RunRecordService,
} from './storage/run-record-purge.js';

export {
  EnvSecretProvider, FileSecretProvider, InMemorySecretProvider, MissingSecretError,
} from './secret/secret-provider.js';
export type { SecretProvider } from './secret/secret-provider.js';

export {
  InMemoryDistributedStateProvider, RedisDistributedStateProvider,
} from './distributed/distributed-state-provider.js';
export type {
  DistributedStateProvider, RedisLikeClient, LockHandle, Clock,
} from './distributed/distributed-state-provider.js';

export { bootstrapPlatform } from './bootstrap/platform-bootstrap.js';
export type { PlatformContext, BootstrapOptions } from './bootstrap/platform-bootstrap.js';
