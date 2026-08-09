/**
 * Unified Platform Bootstrap (ADR-0060) — the ONE canonical startup path.
 *
 * TRACEABILITY: 17-deployment-topology.md · ADR-0060 §4
 *
 * `bootstrapPlatform` reads configuration (once, fail-fast), then composes the Secret, Storage and
 * Distributed-State providers SELECTED BY CONFIGURATION — so the same binary and image become a laptop,
 * a Docker container, or an Azure Container App with no code change. It returns an immutable
 * `PlatformContext`. This is additive: an entrypoint may adopt it without any change to runtime
 * orchestration (the deferred M4/M5/M6 components are untouched).
 */
import { ConfigurationProvider, type EnvSnapshot } from '../config/configuration-provider.js';
import type { PlatformConfig } from '../config/schema.js';
import {
  type StorageProvider, FilesystemStorageProvider, InMemoryStorageProvider,
} from '../storage/storage-provider.js';
import {
  type SecretProvider, EnvSecretProvider, FileSecretProvider, InMemorySecretProvider,
} from '../secret/secret-provider.js';
import {
  type DistributedStateProvider, type RedisLikeClient,
  InMemoryDistributedStateProvider, RedisDistributedStateProvider,
} from '../distributed/distributed-state-provider.js';

/** The composed, immutable platform runtime context. Everything downstream consumes THIS, not env/fs. */
export interface PlatformContext {
  readonly config: PlatformConfig;
  readonly configuration: ConfigurationProvider;
  readonly secrets: SecretProvider;
  readonly storage: StorageProvider;
  readonly state: DistributedStateProvider;
}

export interface BootstrapOptions {
  /** Environment snapshot (defaults to process.env via the Configuration Provider). */
  readonly env?: EnvSnapshot;
  /**
   * Factory for the Redis client when `distributed.backend=redis`. Injected so the package needs no
   * `ioredis` dependency. Required if the configuration selects the redis backend.
   */
  readonly redisClientFactory?: (redisUrl: string) => RedisLikeClient;
}

function selectStorage(config: PlatformConfig): StorageProvider {
  switch (config.storage.backend) {
    case 'filesystem': return new FilesystemStorageProvider(config.storage.root);
    case 'memory': return new InMemoryStorageProvider();
  }
}

function selectSecrets(config: PlatformConfig, env: EnvSnapshot): SecretProvider {
  switch (config.secret.backend) {
    case 'env': return new EnvSecretProvider(env);
    case 'file': return new FileSecretProvider(config.secret.dir);
    case 'memory': return new InMemorySecretProvider();
  }
}

function selectState(config: PlatformConfig, opts: BootstrapOptions): DistributedStateProvider {
  if (config.distributed.backend === 'redis') {
    if (!opts.redisClientFactory) {
      throw new Error('distributed.backend=redis but no redisClientFactory was provided to bootstrapPlatform');
    }
    const client = opts.redisClientFactory(config.distributed.redisUrl!);
    return new RedisDistributedStateProvider(client, config.distributed.keyPrefix);
  }
  return new InMemoryDistributedStateProvider(config.distributed.keyPrefix);
}

/**
 * Compose the platform from configuration. Fails fast with a clear, aggregated diagnostic if the
 * environment is invalid or a selected backend is missing its dependency.
 */
export function bootstrapPlatform(opts: BootstrapOptions = {}): PlatformContext {
  const configuration = ConfigurationProvider.fromEnvironment(opts.env);
  const config = configuration.config;
  const secrets = selectSecrets(config, configuration.environmentSnapshot);
  const storage = selectStorage(config);
  const state = selectState(config, opts);
  return Object.freeze({ config, configuration, secrets, storage, state });
}
