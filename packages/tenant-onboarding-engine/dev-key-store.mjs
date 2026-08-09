// Development key store — resolves where a LOCAL, NON-PRODUCTION signing key lives.
//
// TRACEABILITY
//   Architecture : 06-data-sovereignty.md (E-5 non-retention) · 08-security-model.md (R-08.15 keys are held, never distributed)
//   ADR          : ADR-0007 (package signing custody)
//
// WHY THIS EXISTS.
// The dev launcher and the execution-gateway harness each need a STABLE signing key: a per-boot key
// would invalidate the signature on every package already published to an Execution Plane. Both solved
// that by persisting a `.pem` next to their own source, inside the repository working tree.
//
// That put live ed25519 private keys in the Intelligence Plane's own directory, which is exactly what
// the E-5 non-retention property forbids — and the operational evidence harness FAILED on it:
//
//   FAIL  E-5  non-retention — credential and key material:
//              packages/tenant-onboarding-engine/.execute-signing-key.pem
//              packages/tenant-onboarding-engine/.package-signing-key.pem
//
// Being gitignored was never the point. Gitignore stops a key reaching the remote; it does nothing
// about a key sitting in a directory that gets zipped, copied to a colleague, mounted into a container
// build context, or swept up by a backup agent. E-5 is a property of the FILESYSTEM, not of git.
//
// So dev keys move to a per-user directory outside the repository, with owner-only permissions. The
// key still persists across restarts — the requirement that put it here — it simply no longer lives
// inside the plane. Production is unaffected and always was: it resolves signing material through the
// SecretProvider / Key Vault and writes no key beside the source.
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { execFileSync } from "node:child_process";

/**
 * The per-user directory holding local development key material.
 *
 * Overridable with DBIZ_DEV_KEY_DIR so CI and containers can point it at a scratch path. It is never
 * inside the repository: an operator who sets it there re-creates the exact defect this file removes.
 */
export function devKeyDir() {
  const override = process.env.DBIZ_DEV_KEY_DIR;
  const base = override
    || (platform() === "win32"
      ? join(process.env.LOCALAPPDATA || homedir(), "DBiz", "dev-keys")
      : join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "dbiz", "dev-keys"));
  mkdirSync(base, { recursive: true });
  restrictToOwner(base);
  return base;
}

/** Absolute path for a named development key, outside the repository tree. */
export function devKeyPath(name) {
  return join(devKeyDir(), name);
}

/**
 * Restrict a path to the current user.
 *
 * `chmod` is a NO-OP against NTFS ACLs, so Windows needs `icacls`: breaking inheritance and granting
 * only the current user. Best-effort by design — a permission failure must not stop a developer
 * working, and the key is out of the repository either way, which is the property E-5 asserts.
 */
export function restrictToOwner(p) {
  if (platform() === "win32") {
    const user = process.env.USERNAME || process.env.USER;
    try { if (user) execFileSync("icacls", [p, "/inheritance:r", "/grant:r", `${user}:F`], { stdio: "ignore" }); }
    catch { /* best-effort */ }
  } else {
    try { chmodSync(p, 0o600); } catch { /* non-POSIX */ }
  }
}
