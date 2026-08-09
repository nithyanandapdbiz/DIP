/**
 * Software Update Management — orchestration over the EXISTING pull/emit/generate/audit infrastructure.
 *
 * TRACEABILITY: ADR-0035 (EP portal + updates) · ADR-0032 (tenant.json SSOT) · ADR-0011 (contract/package
 *   distribution) · Doc 05 (EP-initiated, one direction) · INV-3 (IP never dials in) · R-17.2 (customer deploys).
 *
 * The Intelligence Plane PUBLISHES; the Execution Plane always PULLS (INV-3). This module holds only NEW
 * logic — the version band, the version diff, the compatibility comparison, and the solution-update payload
 * — and reuses `SolutionManifest` content hashes, `emitUpdate`, and `audit`. There is NO second persistence
 * model: the version band lives on `tenant.json`.
 */
import type { DetachedSignature } from './package-signing.js';

export type UpdateStatus = 'up-to-date' | 'update-available' | 'installing' | 'failed' | 'rolled-back';

/**
 * Additive version band persisted on `tenant.json` — the SINGLE home of EP solution version state.
 * `published*` is IP-side (what is available); `installed*` is EP-reported (what is actually running).
 */
export interface EpSolutionVersion {
  publishedVersion: string;
  publishedHash: string;
  publishedAt: string;
  publishedKeyId?: string;
  installedVersion?: string;
  installedHash?: string;
  installedAt?: string;
  status: UpdateStatus;
  rollbackPoint?: { version: string; hash: string; at: string };
}

/** The subset of `SolutionManifest` this module needs (avoids a hard dependency cycle). */
export interface ManifestVersionInfo {
  contentHash: string;
  generatorVersion: string;
  templateVersion: string;
  fileCount: number;
}

/** The payload carried by a `solution-update` event that the EP pulls, verifies, and installs. */
export interface SolutionUpdatePayload {
  version: string;
  contentHash: string;
  generatorVersion: string;
  templateVersion: string;
  fileCount: number;
  signature: DetachedSignature;
  mandatory: boolean;
  publishedAt: string;
  /** Where the EP pulls the package from (IP-owned staging ref; EP-initiated fetch). */
  packageRef: string;
}

/** Composite, human-readable solution version string. */
export function solutionVersion(m: ManifestVersionInfo): string {
  return `gen-${m.generatorVersion}+tpl-${m.templateVersion}`;
}

/** Build the pull payload for a `solution-update` event from a fresh manifest + its signature. */
export function buildUpdatePayload(
  m: ManifestVersionInfo, signature: DetachedSignature, packageRef: string, mandatory: boolean, at: string,
): SolutionUpdatePayload {
  return {
    version: solutionVersion(m),
    contentHash: m.contentHash,
    generatorVersion: m.generatorVersion,
    templateVersion: m.templateVersion,
    fileCount: m.fileCount,
    signature,
    mandatory,
    publishedAt: at,
    packageRef,
  };
}

/** Stamp/refresh the version band from a freshly generated manifest (publish). Pure; preserves install state. */
export function stampPublished(
  m: ManifestVersionInfo, keyId: string, at: string, prior?: EpSolutionVersion,
): EpSolutionVersion {
  const installedHash = prior?.installedHash;
  const status: UpdateStatus = installedHash && installedHash === m.contentHash ? 'up-to-date' : 'update-available';
  return {
    publishedVersion: solutionVersion(m),
    publishedHash: m.contentHash,
    publishedAt: at,
    publishedKeyId: keyId,
    ...(prior?.installedVersion ? { installedVersion: prior.installedVersion } : {}),
    ...(installedHash ? { installedHash } : {}),
    ...(prior?.installedAt ? { installedAt: prior.installedAt } : {}),
    status,
    ...(prior?.rollbackPoint ? { rollbackPoint: prior.rollbackPoint } : {}),
  };
}

/** The EP reports what it actually installed (EP-initiated telemetry after a successful install). */
export function markInstalled(v: EpSolutionVersion, version: string, hash: string, at: string): EpSolutionVersion {
  return {
    ...v,
    installedVersion: version,
    installedHash: hash,
    installedAt: at,
    status: hash === v.publishedHash ? 'up-to-date' : 'update-available',
    rollbackPoint: { version: v.installedVersion ?? v.publishedVersion, hash: v.installedHash ?? v.publishedHash, at },
  };
}

/** True when the deployed EP is behind the published version (drives the dashboard "update available"). */
export function isUpdateAvailable(v: EpSolutionVersion | undefined): boolean {
  return !!v && !!v.publishedHash && v.installedHash !== v.publishedHash;
}

// ── Compatibility ────────────────────────────────────────────────────────────

export interface CompatibilityInput {
  publishedContractVersion: string;
  installedContractVersion?: string;
  publishedSchemaVersion: string;
  installedSchemaVersion?: string;
  epRuntimeVersion?: string;
  minRuntimeVersion?: string;
  publishedCapabilities: readonly string[];
  installedCapabilities?: readonly string[];
}
export interface CompatibilityReason { code: string; detail: string; severity: 'block' | 'warn'; }
export interface CompatibilityResult { compatible: boolean; reasons: CompatibilityReason[]; }

function major(v: string): number {
  const n = Number((v || '0').split('.')[0]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure compatibility comparison run before an install. A cross-plane CONTRACT major mismatch, a SCHEMA
 * major mismatch, or an EP runtime below the required floor BLOCKS the upgrade; a capability that is no
 * longer entitled is a WARN (the update still applies). Reuses existing version metadata only.
 */
export function checkCompatibility(inp: CompatibilityInput): CompatibilityResult {
  const reasons: CompatibilityReason[] = [];
  if (inp.installedContractVersion && major(inp.publishedContractVersion) !== major(inp.installedContractVersion)) {
    reasons.push({ code: 'contract-major-mismatch', detail: `cross-plane contract ${inp.installedContractVersion} -> ${inp.publishedContractVersion} crosses a major boundary`, severity: 'block' });
  }
  if (inp.installedSchemaVersion && major(inp.publishedSchemaVersion) !== major(inp.installedSchemaVersion)) {
    reasons.push({ code: 'schema-major-mismatch', detail: `manifest schema ${inp.installedSchemaVersion} -> ${inp.publishedSchemaVersion} crosses a major boundary`, severity: 'block' });
  }
  if (inp.minRuntimeVersion && inp.epRuntimeVersion && major(inp.epRuntimeVersion) < major(inp.minRuntimeVersion)) {
    reasons.push({ code: 'runtime-too-old', detail: `EP runtime ${inp.epRuntimeVersion} is below the required ${inp.minRuntimeVersion}`, severity: 'block' });
  }
  if (inp.installedCapabilities) {
    const removed = inp.installedCapabilities.filter((c) => !inp.publishedCapabilities.includes(c));
    if (removed.length) reasons.push({ code: 'capabilities-removed', detail: `capabilities no longer entitled: ${removed.join(', ')}`, severity: 'warn' });
  }
  return { compatible: !reasons.some((r) => r.severity === 'block'), reasons };
}

// ── Update history (reuses the existing audit trail; no new store) ─────────────

export interface UpdateHistoryEntry { at: string; event: string; detail: string; }

/** Extract the update-management slice of the tenant audit trail (reuse `audit()`, never a second store). */
export function updateHistory(auditTrail: readonly { at: string; event: string; detail: string }[]): UpdateHistoryEntry[] {
  return auditTrail
    .filter((e) => /update|publish|install|rollback|solution|sync/i.test(e.event))
    .map((e) => ({ at: e.at, event: e.event, detail: e.detail }));
}
