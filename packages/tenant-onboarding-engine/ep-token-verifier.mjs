// EP token verification for the execution gateway — identity, then tenant scope, then rotation.
//
// TRACEABILITY
//   Architecture : 08-security-model.md §5a (short-lived signed tokens) · 07-tenant-isolation.md (C-07.11)
//   ADR          : ADR-0033 §R-33.5 · ADR-0049 M5
//   Audit        : PLANE-SOVEREIGNTY-AUDIT.md V-06 / C-06
//
// WHY THIS EXISTS.
// `/v1/execute` returns a SIGNED execution package that customer infrastructure is built to verify and
// then run against a live production system. Before this module, the only access control on that
// endpoint was `knownTenant(tenantId)` — and a tenantId is not a secret: it is returned in the
// registration grant and in every tenant API response. A Bearer header was read and written to the log
// line, and gated nothing. An unauthenticated caller therefore obtained a cross-plane execution
// artefact (CWE-306).
//
// The interlock that refuses to start in production was a stop-gap, not a control: it protects against
// the environment being production, not against the endpoint being reachable.
//
// WHY THE VERIFICATION IS DUPLICATED RATHER THAN IMPORTED.
// This is the same deliberate choice as `canonicalize` in the gateway: the harness is plain ESM and the
// engine is TypeScript compiled to `dist/`, which is not guaranteed to be built when the harness runs.
// The token format is a frozen contract (HS256 over `header.payload`, principal `ep:<slug>:v<N>`), and
// two independent implementations of one contract is the platform's stated position. The conformance
// test `ep-token-verifier.test.mjs` pins them together by verifying a token this module did not issue.
//
// WHAT IT DOES NOT DO.
// It does not authorise. It answers "which Execution Plane is calling, and is that credential current?"
// Whether that EP may have a package for this tenant is the caller's check, and the gateway makes it
// immediately afterwards by comparing the token's slug against the tenant the package is requested for.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { devKeyPath } from "./dev-key-store.mjs";

const b64url = (b) => b.toString("base64url");
const sign = (secret, data) => b64url(createHmac("sha256", secret).update(data).digest());

/**
 * Resolve the session signing secret exactly as `run-server.mjs` does.
 *
 * Order matters and mirrors the issuer: an explicit SESSION_SECRET, else the persisted per-user dev
 * key. It NEVER generates one — a verifier that mints its own secret would reject every real token
 * while reporting a healthy configuration, which is worse than refusing to start.
 */
export function resolveSessionSecret(env = process.env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const file = devKeyPath("session-secret");
  if (existsSync(file)) {
    const s = readFileSync(file, "utf8").trim();
    if (s) return s;
  }
  return null;
}

/** Parse an EP principal id → { slug, version }, or null when it is not an EP token. */
export function parseEpPrincipal(id) {
  const m = /^ep:(.+):v(\d+)$/.exec(String(id ?? ""));
  return m && m[1] ? { slug: m[1], version: Number(m[2]) } : null;
}

/**
 * Verify a Bearer credential and resolve the calling Execution Plane.
 *
 * Returns a TYPED refusal rather than a boolean. "No credential", "bad signature" and "the credential
 * was superseded by a rotation" are three different operational facts, and an operator who is handed
 * only `false` has to guess which one they are looking at.
 */
export function verifyEpToken(authorizationHeader, { secret, now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: "not-configured", detail: "no session signing secret is resolvable; the gateway cannot authenticate an Execution Plane" };

  const raw = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (typeof raw !== "string" || !raw.startsWith("Bearer ")) {
    return { ok: false, reason: "absent", detail: "an Execution-Plane bearer credential is required" };
  }

  const token = raw.slice("Bearer ".length);
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed", detail: "credential is not a three-part signed token" };

  const [header, payload, signature] = parts;
  const expected = sign(secret, `${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length is compared first because timingSafeEqual THROWS on a length mismatch; comparing lengths is
  // not itself a leak, since the signature length is fixed by the algorithm.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature", detail: "credential signature failed verification" };
  }

  let claims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { return { ok: false, reason: "malformed", detail: "credential payload is not decodable" }; }

  if (typeof claims.exp !== "number" || Math.floor(now / 1000) >= claims.exp) {
    return { ok: false, reason: "expired", detail: "credential has expired; re-register the Execution Plane" };
  }
  if (typeof claims.sub !== "string" || !Array.isArray(claims.roles)) {
    return { ok: false, reason: "malformed", detail: "credential names no principal" };
  }

  const ep = parseEpPrincipal(claims.sub);
  if (!ep) return { ok: false, reason: "not-execution-plane", detail: `principal ${claims.sub} is not an Execution Plane credential` };
  if (!claims.roles.includes("execution-plane")) {
    return { ok: false, reason: "not-execution-plane", detail: "credential does not carry the execution-plane role" };
  }

  return { ok: true, slug: ep.slug, version: ep.version, principal: claims.sub, tenants: Array.isArray(claims.tenants) ? claims.tenants : [] };
}

/**
 * Bind a verified credential to the tenant a package is being requested for.
 *
 * Two checks, and both are load-bearing:
 *
 *   • SCOPE — the credential's slug must be the tenant being asked about. Without this any registered
 *     Execution Plane could obtain a signed package for any other tenant, which is a multi-tenant
 *     isolation break (C-07.11) that authentication alone does not close.
 *
 *   • ROTATION — the credential's version must be the tenant's current one. Regeneration bumps the
 *     stored version, so a superseded token stops working with no denylist to maintain.
 */
export function authoriseForTenant(principal, tenant, slug) {
  if (principal.slug !== slug) {
    return { ok: false, reason: "tenant-scope", detail: `credential is scoped to ${principal.slug} and cannot request a package for ${slug}` };
  }
  const current = tenant?.onboarding?.epToken?.version;
  if (typeof current === "number" && principal.version !== current) {
    return { ok: false, reason: "superseded", detail: `credential version v${principal.version} was superseded by v${current}; re-register the Execution Plane` };
  }
  return { ok: true };
}
