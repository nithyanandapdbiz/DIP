/**
 * Release governance — manifests, artefact integrity, version and upgrade compatibility.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md · 20-cross-plane-contracts.md
 *                  19-repository-ownership.md
 *   ADR          : ADR-0011 (contract distribution) · ADR-0020
 *   Criteria     : C-24.2 (every metric traces to an artefact and a commit)
 *                  C-24.3 (evidence lacking provenance is rejected at ingestion)
 *                  C-24.4 (ingested evidence is integrity-verified before use)
 *                  C-25.4 (upgrade succeeds from every supported contract version)
 *
 * A RELEASE IS NOT A TAG. IT IS A SET OF ARTEFACTS THAT CAN BE VERIFIED.
 * The manifest below is what makes "reproducible" and "traceable" checkable rather
 * than asserted: every artefact carries a content hash, the manifest carries the
 * commit that produced it, and verification recomputes rather than re-reads.
 *
 * VERIFICATION RECOMPUTES. A verifier that compares a recorded hash against another
 * recorded hash proves only that a file was copied consistently. This one hashes the
 * bytes on disk and compares against the manifest, so a modified artefact fails even
 * when its recorded hash was modified to match.
 */
import { createHash } from 'node:crypto';

export interface ArtefactRecord {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ReleaseManifest {
  readonly releaseVersion: string;
  readonly contractVersion: string;
  /** Contract majors this release accepts from an Execution Plane (C-25.4). */
  readonly supportedContractMajors: readonly number[];
  /** Releases an Execution Plane may upgrade FROM to reach this one. */
  readonly upgradeableFrom: readonly string[];
  readonly commit: string | null;
  readonly branch: string | null;
  readonly builtAt: string;
  readonly artefacts: readonly ArtefactRecord[];
  readonly dependencies: readonly { readonly name: string; readonly version: string }[];
  readonly manifestHash: string;
}

export type IntegrityFailure =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'modified'; readonly path: string; readonly expected: string; readonly actual: string }
  | { readonly kind: 'unlisted'; readonly path: string };

export interface IntegrityResult {
  readonly ok: boolean;
  readonly verified: number;
  readonly failures: readonly IntegrityFailure[];
}

export function hashBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Build a manifest from artefacts already read.
 *
 * Reading is the caller's job so this module touches no filesystem — it stays testable
 * and stays unable to reach anything it was not handed.
 */
export function buildManifest(input: {
  releaseVersion: string;
  contractVersion: string;
  supportedContractMajors: readonly number[];
  upgradeableFrom: readonly string[];
  commit: string | null;
  branch: string | null;
  builtAt: string;
  artefacts: readonly { path: string; content: Uint8Array | string }[];
  dependencies: readonly { name: string; version: string }[];
}): ReleaseManifest {
  const artefacts: ArtefactRecord[] = input.artefacts
    .map((a) => ({
      path: a.path,
      sha256: hashBytes(a.content),
      bytes: typeof a.content === 'string' ? Buffer.byteLength(a.content, 'utf8') : a.content.byteLength,
    }))
    // Sorted, so two builds of the same release produce an identical manifest.
    .sort((x, y) => (x.path < y.path ? -1 : 1));

  const dependencies = [...input.dependencies].sort((a, b) => (a.name < b.name ? -1 : 1));

  const body = {
    releaseVersion: input.releaseVersion,
    contractVersion: input.contractVersion,
    supportedContractMajors: [...input.supportedContractMajors].sort((a, b) => a - b),
    upgradeableFrom: [...input.upgradeableFrom].sort(),
    commit: input.commit,
    branch: input.branch,
    builtAt: input.builtAt,
    artefacts,
    dependencies,
  };

  return {
    ...body,
    manifestHash: createHash('sha256')
      .update('dbiz.release-manifest@1')
      .update(Uint8Array.from([0]))
      .update(JSON.stringify(body))
      .digest('hex'),
  };
}

/**
 * Verify artefacts on disk against the manifest.
 *
 * Three distinct failures, kept distinct because they mean different things: a MISSING
 * artefact is an incomplete release; a MODIFIED one is a tampered or rebuilt release;
 * an UNLISTED one is a release carrying something nobody recorded — the last being the
 * one most likely to be waved through, and the one a supply-chain attack produces.
 */
export function verifyIntegrity(
  manifest: ReleaseManifest,
  present: readonly { path: string; content: Uint8Array | string }[],
): IntegrityResult {
  const byPath = new Map(present.map((p) => [p.path, p.content]));
  const failures: IntegrityFailure[] = [];
  let verified = 0;

  for (const a of manifest.artefacts) {
    const content = byPath.get(a.path);
    if (content === undefined) {
      failures.push({ kind: 'missing', path: a.path });
      continue;
    }
    // Recomputed from the bytes, not read from a record.
    const actual = hashBytes(content);
    if (actual !== a.sha256) {
      failures.push({ kind: 'modified', path: a.path, expected: a.sha256, actual });
      continue;
    }
    verified += 1;
  }

  const listed = new Set(manifest.artefacts.map((a) => a.path));
  for (const p of present) {
    if (!listed.has(p.path)) failures.push({ kind: 'unlisted', path: p.path });
  }

  return { ok: failures.length === 0, verified, failures };
}

/** Verify the manifest has not itself been edited. */
export function verifyManifestHash(manifest: ReleaseManifest): boolean {
  const { manifestHash, ...body } = manifest;
  return manifestHash === createHash('sha256')
    .update('dbiz.release-manifest@1')
    .update(Uint8Array.from([0]))
    .update(JSON.stringify(body))
    .digest('hex');
}

// ── Version and upgrade compatibility ───────────────────────────────────────

export type CompatibilityVerdict =
  | { readonly ok: true; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported-major'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'malformed-version'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'upgrade-path-unsupported'; readonly detail: string };

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Is a client's contract version accepted by this release?
 *
 * The refusal names the version sent, the window that is current, and what to change.
 * A bare rejection forces a support case for what is a two-minute fix.
 */
export function checkContractCompatibility(
  manifest: ReleaseManifest, clientContractVersion: string,
): CompatibilityVerdict {
  const m = SEMVER.exec(clientContractVersion);
  if (!m) {
    return {
      ok: false, reason: 'malformed-version',
      detail: `"${clientContractVersion}" is not a semantic version. Expected MAJOR.MINOR.PATCH, for example ${manifest.contractVersion}.`,
    };
  }
  const major = Number(m[1]);
  if (!manifest.supportedContractMajors.includes(major)) {
    return {
      ok: false, reason: 'unsupported-major',
      detail: `contract major ${major} is outside the supported window [${manifest.supportedContractMajors.join(', ')}]. Upgrade your Execution Plane to a release using contract ${manifest.contractVersion}.`,
    };
  }
  return { ok: true, detail: `contract ${clientContractVersion} is inside the supported window` };
}

/**
 * May a deployment upgrade FROM this release to the one described by the manifest?
 *
 * Explicit rather than inferred from ordering. "Newer is upgradeable" is an assumption
 * that holds until one release requires an intermediate migration, and by then the
 * assumption is spread across every tool that made it.
 */
export function checkUpgradePath(manifest: ReleaseManifest, fromRelease: string): CompatibilityVerdict {
  if (manifest.upgradeableFrom.includes(fromRelease)) {
    return { ok: true, detail: `${fromRelease} -> ${manifest.releaseVersion} is a supported upgrade` };
  }
  return {
    ok: false, reason: 'upgrade-path-unsupported',
    detail: `${fromRelease} is not a supported source for ${manifest.releaseVersion}. Supported: ${manifest.upgradeableFrom.join(', ') || 'none declared'}.`,
  };
}

/**
 * Every declared dependency is pinned to an exact version.
 *
 * A range means the release is not reproducible, and the day it breaks will not be the
 * day anything changed on our side.
 */
export function checkDependencyPinning(manifest: ReleaseManifest): {
  ok: boolean; unpinned: readonly string[];
} {
  const unpinned = manifest.dependencies
    .filter((d) => /[\^~*]|latest|^>=|\bx\b/.test(d.version))
    .map((d) => `${d.name}@${d.version}`);
  return { ok: unpinned.length === 0, unpinned };
}

/**
 * Reject evidence lacking provenance, BEFORE it is used (C-24.3).
 *
 * At ingestion rather than at read: evidence without provenance that is stored and
 * later found untraceable has already contaminated everything computed from it.
 */
export function admitEvidence(candidate: Record<string, unknown>): {
  admitted: boolean; missing: readonly string[];
} {
  const required = ['evidenceId', 'generator', 'timestamp', 'commit', 'contentHash'];
  const missing = required.filter((k) => candidate[k] === undefined || candidate[k] === null);
  return { admitted: missing.length === 0, missing };
}
