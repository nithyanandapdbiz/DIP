/**
 * Secret Provider (ADR-0060) — the one interface all secret material is resolved through.
 *
 * TRACEABILITY: 08-security-model.md · 17-deployment-topology.md (R-17.12) · ADR-0060 §4
 *
 * No package accesses a secret except through this interface. There is NO Azure Key Vault SDK: in Azure,
 * Key Vault secrets are resolved to environment variables by the Container App `secretRef` (see
 * containerapp.yaml), so the `EnvSecretProvider` reading the captured environment snapshot IS the Key
 * Vault integration — with zero vendor lock-in. Locally, `FileSecretProvider` reads a gitignored secrets
 * directory; `InMemorySecretProvider` serves tests. A missing REQUIRED secret is a hard, named refusal.
 *
 * Secret VALUES never appear in configuration, in logs, or in any thrown message (only the secret NAME).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EnvSnapshot } from '../config/configuration-provider.js';

export class MissingSecretError extends Error {
  constructor(public readonly secretName: string, backend: string) {
    super(`required secret "${secretName}" is not available from the ${backend} secret backend`);
    this.name = 'MissingSecretError';
  }
}

export interface SecretProvider {
  readonly backend: string;
  /** Resolve an optional secret. Returns undefined if absent. Never throws for absence. */
  get(name: string): string | undefined;
  /** Resolve a required secret. Throws MissingSecretError (name only, never value) if absent. */
  require(name: string): string;
}

abstract class BaseSecretProvider implements SecretProvider {
  abstract readonly backend: string;
  abstract get(name: string): string | undefined;
  require(name: string): string {
    const v = this.get(name);
    if (v === undefined || v === '') throw new MissingSecretError(name, this.backend);
    return v;
  }
}

/**
 * Reads secrets from the environment snapshot captured by the Configuration Provider (Key Vault → env
 * in Azure). Does NOT touch `process.env` directly — the snapshot is injected — so the platform keeps
 * exactly one environment call site.
 */
export class EnvSecretProvider extends BaseSecretProvider {
  readonly backend = 'env';
  constructor(private readonly env: EnvSnapshot) { super(); }
  get(name: string): string | undefined {
    const v = this.env[name];
    return v === undefined || v === '' ? undefined : v;
  }
}

/** Reads secrets from files in a local directory (dev). Each secret is a file named after the env var. */
export class FileSecretProvider extends BaseSecretProvider {
  readonly backend = 'file';
  constructor(private readonly dir: string) { super(); }
  get(name: string): string | undefined {
    const p = join(this.dir, name);
    return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined;
  }
}

/** In-memory secrets for tests. */
export class InMemorySecretProvider extends BaseSecretProvider {
  readonly backend = 'memory';
  private readonly secrets: Map<string, string>;
  constructor(initial: Readonly<Record<string, string>> = {}) {
    super();
    this.secrets = new Map(Object.entries(initial));
  }
  set(name: string, value: string): void { this.secrets.set(name, value); }
  get(name: string): string | undefined { return this.secrets.get(name); }
}
