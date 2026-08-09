/**
 * Canonical Platform Execution Context — ADR-0040 Wave 1 (PCT-EXEC-CONTEXT).
 *
 * The ONE execution context every capability consumes. It is capability-neutral
 * and carries PLATFORM concerns only — no stories, tests, evidence, bugs,
 * automation plans or repository analysis (those are higher platform models,
 * ADR-0040 §4.4 G-16). It names no tool, no provider and no AI vendor.
 *
 * IMMUTABILITY (G-8). Once sealed — which is what "orchestration begins" means —
 * the context cannot change. The immutable core (tenant, governance, security,
 * configuration, capability, correlation) is deep-frozen. The ONLY permitted
 * extension is append-only execution metadata, and even that is applied by
 * returning a NEW sealed context whose immutable fields are carried by identity,
 * never by mutation. The certification framework verifies this.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 13-ai-operating-model.md
 *   ADR          : ADR-0040
 *   Contract     : PCT-EXEC-CONTEXT · immutability (G-8) · capability-neutral (G-16)
 */

export interface TenantContext { readonly tenantId: string; readonly environment: string; }
export interface GovernanceContext { readonly policyVersion: string; readonly governanceTriadRequired: true; }
export interface SecurityContext { readonly zeroTrust: true; readonly classification: string; }
export interface ConfigurationContext { readonly configVersion: string; readonly source: string; }
/** Decisions are deterministic; AI is advisory only (G-6). */
export interface DecisionContext { readonly deterministic: true; readonly aiAdvisoryOnly: true; }
export interface AuditContext { readonly auditLogId: string; readonly appendOnly: true; }
export interface TraceContext { readonly traceId: string; readonly spanId: string; }
export interface CapabilityMetadata { readonly capabilityId: string; readonly capabilityVersion: string; }
export interface EnvironmentMetadata { readonly platform: string; readonly runtime: string; }

/** The single append-only extension surface (G-8). */
export interface ExecutionMetadataEntry { readonly key: string; readonly value: string; readonly at: number; }
export interface ExecutionMetadata { readonly entries: readonly ExecutionMetadataEntry[]; }

export interface ExecutionContext {
  readonly contractVersion: string;
  readonly correlationId: string;
  readonly tenant: TenantContext;
  readonly governance: GovernanceContext;
  readonly security: SecurityContext;
  readonly configuration: ConfigurationContext;
  readonly decision: DecisionContext;
  readonly audit: AuditContext;
  readonly trace: TraceContext;
  readonly capability: CapabilityMetadata;
  readonly environment: EnvironmentMetadata;
  readonly metadata: ExecutionMetadata;
}

/** The fields that SHALL NEVER change once orchestration begins (G-8). */
export const IMMUTABLE_FIELDS = [
  'tenant', 'governance', 'security', 'configuration', 'capability', 'correlationId',
] as const;
export type ImmutableField = (typeof IMMUTABLE_FIELDS)[number];

export const EXECUTION_CONTEXT_VERSION = '1.0.0';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * Seal a context — orchestration begins. After this the context is deep-frozen:
 * any assignment to an immutable field (or a nested field) throws in module
 * scope. Returns the same shape, frozen.
 */
export function sealExecutionContext(init: ExecutionContext): ExecutionContext {
  return deepFreeze({ ...init, metadata: { entries: [...init.metadata.entries] } });
}

/**
 * The approved append-only extension point (G-8). Returns a NEW sealed context
 * with one metadata entry added; every immutable field is carried by identity
 * (same reference), never mutated, and the original is left untouched.
 */
export function appendMetadata(ctx: ExecutionContext, key: string, value: string, at: number): ExecutionContext {
  const entry: ExecutionMetadataEntry = { key, value, at };
  return deepFreeze({ ...ctx, metadata: { entries: [...ctx.metadata.entries, entry] } });
}

/** True when the context and its metadata band are deep-frozen (immutability holds). */
export function isContextSealed(ctx: ExecutionContext): boolean {
  return Object.isFrozen(ctx) && Object.isFrozen(ctx.metadata) && Object.isFrozen(ctx.metadata.entries);
}
