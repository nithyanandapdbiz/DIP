# @dbiz/platform-providers

Cloud-native infrastructure abstraction for the Intelligence Plane (**ADR-0060**). One image runs on a
laptop, in Docker, and in Azure Container Apps — **local vs. cloud is configuration, never code**. No
`@azure/*` dependency; no vendor lock-in.

## Why

The platform is portable by design (no server-side Azure SDK; secrets from env; storage behind
interfaces), but its runtime posture lacked a single configuration pipeline, a shared storage/secret/
cache abstraction, and a Redis consumer for distributed state. This package supplies exactly the
interfaces architecture already mandates (R-17.11/12/15/20) and nothing more. It is **additive**: it
changes no frozen contract, no capability/domain, and does not touch the deferred runtime (ADR-0046/0049
M5/M6).

## The four providers + bootstrap

| Provider | Interface | Local | Cloud (approved services only) |
|---|---|---|---|
| **Configuration** | `ConfigurationProvider` | `.env` / process env | Container App env (Key Vault → env) |
| **Storage** | `StorageProvider` | `FilesystemStorageProvider` (local folder) / `InMemory` | `FilesystemStorageProvider` on the **Azure Files** mount |
| **Secret** | `SecretProvider` | `FileSecretProvider` / `InMemory` | `EnvSecretProvider` (**Key Vault** secretRef → env) |
| **Distributed state** | `DistributedStateProvider` | `InMemoryDistributedStateProvider` | `RedisDistributedStateProvider` (**Azure Cache for Redis**) via injected port |

```ts
import { bootstrapPlatform, tenantContext } from '@dbiz/platform-providers';

const platform = bootstrapPlatform();           // reads + validates config once, fail-fast
const ctx = tenantContext({ tenantId, tenantSlug }); // case-folded, traversal-safe

await platform.storage.put(ctx, { capability: 'functional-testing', run, artefact: 'result.json' }, body);
const secret = platform.secrets.require('SESSION_SECRET');
const fresh  = await platform.state.seenNonce(ctx, nonce, 300);  // replay protection, shared in Redis
```

## Invariants (certified by `governance/verification/verify-provider-platform.js`)

- **PP-3** exactly one reader of `process.env` (the Configuration Provider).
- **PP-4** zero `@azure/*` imports or dependencies.
- **PP-5** `node:fs` confined to the Storage/Secret providers.
- **PP-6** no import of the deferred runtime / legacy engine / `/v1/execute` gateway (additive-only).
- **PP-7/8** distributed state holds no secrets; Redis is reached through an injected `RedisLikeClient`
  (no `ioredis` dependency).

Every invariant is proved against the real build by `test/provider-platform-conformance.test.ts` and
fault-injected in `record-fault-proofs.js`.

## Configuration → Redis backend (horizontal scale seam)

Setting `REDIS_URL` (or `DBIZ_STATE_BACKEND=redis`) selects the Redis backend, sharing nonce/session/
lock/rate-limit state across replicas — the precondition for `maxReplicas > 1`. Flipping the replica
count is a separate, gated topology change (this package wires the seam only). Supply the client with
`bootstrapPlatform({ redisClientFactory })`.

## Adoption (each step separately authorised, gate-first)

1. Container entrypoint composes `bootstrapPlatform`.
2. `FileRegistrationStore` / nonce / session move behind the Distributed State Provider; select Redis.
3. Remaining direct `node:fs` / `process.env` call sites migrate to the providers.
