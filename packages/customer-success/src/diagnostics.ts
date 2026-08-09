/**
 * Diagnostics toolkit — checks a customer runs themselves, before and after onboarding.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §5, §15 · 23-operational-excellence-model.md
 *   ADR          : ADR-0021
 *   Criteria     : C-25.3 (a failed installation names the unmet precondition)
 *                  C-25.5 (configuration validates against the live schema)
 *                  C-25.9 (no real credentials, endpoints or tenant identifiers)
 *
 * EVERY CHECK EXECUTES SOMETHING. None reports on the existence of a file or the
 * presence of a setting. A diagnostic that cannot fail for a real reason is a progress
 * bar with opinions, and it is worse than nothing because it is believed.
 *
 * THE OUTPUT IS DESIGNED FOR SOMEONE WHO IS STUCK.
 * Each result carries three things: what was checked, what happened, and what to do
 * next. The third is the one that is usually missing, and its absence is why customers
 * open support cases that say "it says failed".
 */
import { X509Certificate } from 'node:crypto';
import type { CertificateAuthority, AuthorisationServer, ApiGateway } from '@dbiz/platform-runtime';
import { validateProfile } from '@dbiz/platform-core';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skipped';

export interface CheckResult {
  readonly id: string;
  /** What was checked, in the customer's terms rather than the platform's. */
  readonly checked: string;
  readonly status: CheckStatus;
  /** What was observed. Specific enough to act on without asking anyone. */
  readonly detail: string;
  /** What to do next. Present on every non-pass, because that is when it is needed. */
  readonly remedy?: string;
}

export interface DiagnosticReport {
  readonly results: readonly CheckResult[];
  readonly passed: number;
  readonly failed: number;
  readonly warned: number;
  readonly skipped: number;
  /** True only when nothing failed. Warnings do not block; failures do. */
  readonly ready: boolean;
}

export function summarise(results: readonly CheckResult[]): DiagnosticReport {
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return {
    results,
    passed: count('pass'),
    failed: count('fail'),
    warned: count('warn'),
    skipped: count('skipped'),
    ready: count('fail') === 0,
  };
}

// ── Pre-flight: runnable before anything is deployed ────────────────────────

/**
 * Node runtime check.
 *
 * Named precisely because "unsupported Node version" is the single most common cause
 * of a first-run failure, and the resulting stack trace never mentions the version.
 */
export function checkNodeRuntime(required = 24): CheckResult {
  const major = Number(process.versions.node.split('.')[0]);
  if (Number.isNaN(major)) {
    return {
      id: 'preflight.node', checked: 'Node.js runtime', status: 'fail',
      detail: `could not read a version from "${process.version}"`,
      remedy: `Install Node.js ${required} LTS and run this check again.`,
    };
  }
  if (major < required) {
    return {
      id: 'preflight.node', checked: 'Node.js runtime', status: 'fail',
      detail: `found ${process.version}, which is older than the supported minimum`,
      remedy: `Install Node.js ${required} LTS. Older versions lack TLS behaviour the platform depends on, and the failure appears later as a handshake error rather than a version error.`,
    };
  }
  return {
    id: 'preflight.node', checked: 'Node.js runtime', status: 'pass',
    detail: `${process.version} meets the minimum of ${required}`,
  };
}

/** Configuration check, against the live validator rather than a copy of its rules. */
export function checkConfiguration(profile: unknown): CheckResult {
  const r = validateProfile(profile);
  if (r.ok) {
    return {
      id: 'preflight.configuration', checked: 'technology profile', status: 'pass',
      detail: `${r.profile.language} + ${r.profile.framework} is a supported combination`,
    };
  }
  // The three rejection reasons need three different remedies. Collapsing them into
  // "invalid configuration" is what turns a two-minute fix into a support case.
  const remedy = r.reason === 'malformed'
    ? 'A field is missing or is not one of the permitted values. The message above names it. Compare against the examples in the configuration guide.'
    : r.reason === 'unsupported-combination'
      ? 'Each field is individually valid, but the platform cannot build them together. See the compatibility matrix for combinations that are supported.'
      : 'Correct the profile and run this check again.';
  return {
    id: 'preflight.configuration', checked: 'technology profile', status: 'fail',
    detail: `${r.reason}: ${r.detail}`, remedy,
  };
}

/**
 * Outbound connectivity check.
 *
 * Deliberately outbound-only. The platform never opens a connection into a customer
 * tenancy (INV-3), so a check that tested inbound reachability would be testing for
 * something that must never work.
 */
export async function checkOutboundConnectivity(
  host: string, port: number, timeoutMs = 5000,
): Promise<CheckResult> {
  const { connect } = await import('node:net');
  return new Promise<CheckResult>((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const done = (r: CheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done({
      id: 'preflight.connectivity', checked: `outbound reachability of ${host}:${port}`, status: 'fail',
      detail: `no response within ${timeoutMs}ms`,
      remedy: 'Your egress rules are the usual cause. The Execution Plane needs outbound TCP to this endpoint; it never needs inbound. Ask your network team to allow egress, not to open a port.',
    }), timeoutMs);
    socket.on('connect', () => done({
      id: 'preflight.connectivity', checked: `outbound reachability of ${host}:${port}`, status: 'pass',
      detail: 'connection established',
    }));
    socket.on('error', (e) => done({
      id: 'preflight.connectivity', checked: `outbound reachability of ${host}:${port}`, status: 'fail',
      detail: (e as Error).message,
      remedy: 'Check the endpoint issued during onboarding, then egress rules and any TLS-inspecting proxy. A proxy that re-signs traffic will break mutual TLS and is worth ruling out early.',
    }));
  });
}

// ── Post-registration: checks against the platform's own components ─────────

/** Certificate check — expiry, tenant binding and chain, from the certificate itself. */
export function checkCertificate(
  ca: CertificateAuthority, certificatePem: string, expectedTenantId: string, now = new Date(),
): CheckResult {
  const validation = ca.validate(certificatePem, expectedTenantId, now);
  if (!validation.ok) {
    const remedy: Record<string, string> = {
      malformed: 'The certificate file is not readable as PEM. Re-fetch it; a truncated copy is the usual cause.',
      'untrusted-issuer': 'This certificate was not issued by the platform. If you generated it yourself, that is the problem — registration issues it.',
      'not-yet-valid': 'Your system clock is behind. Certificate validity is absolute time, so a skewed clock fails a valid certificate.',
      expired: 'Rotate the certificate. Rotation needs no redeploy and the new one works immediately.',
      revoked: 'This certificate was revoked. If you did not expect that, treat it as a security event and contact support before reissuing.',
      'wrong-tenant': 'This certificate belongs to a different tenant. Check which credentials the deployment mounted.',
    };
    return {
      id: 'runtime.certificate', checked: 'client certificate', status: 'fail',
      detail: validation.reason,
      remedy: remedy[validation.reason] ?? 'Re-run registration.',
    };
  }

  // Valid, but expiry is a gradient rather than a cliff for the customer: warning
  // early is the difference between a scheduled rotation and an outage.
  const x = new X509Certificate(certificatePem);
  const daysLeft = Math.floor((Date.parse(x.validTo) - now.getTime()) / 86_400_000);
  if (daysLeft <= 14) {
    return {
      id: 'runtime.certificate', checked: 'client certificate', status: 'warn',
      detail: `valid, expiring in ${daysLeft} day(s)`,
      remedy: 'Rotate now rather than at expiry. The previous certificate keeps working until it is revoked, so rotating early costs nothing.',
    };
  }
  return {
    id: 'runtime.certificate', checked: 'client certificate', status: 'pass',
    detail: `valid for ${expectedTenantId}, ${daysLeft} day(s) remaining`,
  };
}

/** OAuth check — token validity AND that it is bound to the certificate presented. */
export function checkAccessToken(
  auth: AuthorisationServer, token: string, presentedKeyId: string, now = new Date(),
): CheckResult {
  const nonce = `diagnostic-${presentedKeyId.slice(0, 8)}`;
  const v = auth.verify(token, presentedKeyId, nonce, now);
  if (v.ok) {
    return {
      id: 'runtime.oauth', checked: 'access token', status: 'pass',
      detail: `valid for ${v.tenantId} and bound to the certificate presented`,
    };
  }
  const remedy: Record<string, string> = {
    malformed: 'The token is not a readable JWT. Re-fetch it rather than repairing it.',
    expired: 'Refresh the token. Expiry is short by design; a long-lived token is a stolen token waiting to happen.',
    'not-bound-to-certificate': 'This token was issued against a different certificate. That is exactly what binding prevents — after rotating, fetch a token for the NEW certificate.',
    'unknown-tenant': 'The token names a tenant the platform does not recognise. Re-run registration.',
    replayed: 'This nonce was used before. Send a fresh nonce on every call; replay protection is not optional.',
  };
  return {
    id: 'runtime.oauth', checked: 'access token', status: 'fail',
    detail: v.reason,
    remedy: remedy[v.reason] ?? 'Re-run registration to obtain a fresh token.',
  };
}

/**
 * End-to-end gateway check: does an authenticated call actually get served?
 *
 * This is the check that matters. Certificate and token can both be individually valid
 * while the call is still refused — for authorisation, rate limiting, or a path the
 * tenant is not entitled to. Only asking the gateway answers the customer's question.
 */
export function checkGateway(
  gateway: ApiGateway, certificatePem: string, token: string, path: string, nonce: string,
): CheckResult {
  const r = gateway.handle(certificatePem, { path, token, nonce });
  if (r.status === 200) {
    return {
      id: 'runtime.gateway', checked: `authenticated call to ${path}`, status: 'pass',
      detail: `served for ${r.tenantId}`,
    };
  }
  const remedy = r.status === 429
    ? 'You are above your request rate. Back off and retry; this is a limit, not a fault.'
    : r.status === 403
      ? 'Authenticated, but not entitled to this path. Check the path rather than the credentials — reissuing them will not change this.'
      : 'Run the certificate and token checks above; one of them will name the cause.';
  return {
    id: 'runtime.gateway', checked: `authenticated call to ${path}`, status: 'fail',
    detail: `${r.status}: ${r.reason}`, remedy,
  };
}

/**
 * Tenant isolation check.
 *
 * Verifies the platform refuses a path that escapes the tenant's own scope. This is a
 * check the customer can run to satisfy themselves — and their auditor — that
 * isolation is enforced rather than intended.
 */
export function checkTenantIsolation(
  attemptEscape: () => unknown,
): CheckResult {
  try {
    attemptEscape();
    return {
      id: 'runtime.isolation', checked: 'tenant isolation', status: 'fail',
      detail: 'a path escaping the tenant scope was ACCEPTED',
      remedy: 'Stop and contact DBiz. This is a platform defect, not a configuration problem, and it should never reach a customer environment.',
    };
  } catch (e) {
    const reason = (e as { reason?: string }).reason ?? 'rejected';
    return {
      id: 'runtime.isolation', checked: 'tenant isolation', status: 'pass',
      detail: `an escaping path was refused (${reason})`,
    };
  }
}

/** Dependency check — every declared dependency is pinned to an exact version. */
export function checkDependencyPinning(manifest: Record<string, string>): CheckResult {
  const unpinned = Object.entries(manifest)
    .filter(([, v]) => /[\^~*]|latest|^>=|\sx$/.test(v))
    .map(([k, v]) => `${k}@${v}`);
  if (unpinned.length > 0) {
    return {
      id: 'preflight.dependencies', checked: 'dependency pinning', status: 'fail',
      detail: `${unpinned.length} dependency(ies) not pinned: ${unpinned.slice(0, 3).join(', ')}`,
      remedy: 'Pin to exact versions. A range means your build is not reproducible, and the day it breaks will not be the day anything changed on your side.',
    };
  }
  return {
    id: 'preflight.dependencies', checked: 'dependency pinning', status: 'pass',
    detail: `${Object.keys(manifest).length} dependency(ies), all pinned to exact versions`,
  };
}

/**
 * Render a report for a human who is trying to get unstuck.
 *
 * Failures first. A report that lists twelve passes before the one failure makes the
 * reader scroll past the answer.
 */
export function renderReport(report: DiagnosticReport): string {
  const order: Record<CheckStatus, number> = { fail: 0, warn: 1, skipped: 2, pass: 3 };
  const icon: Record<CheckStatus, string> = { pass: '  ok  ', fail: ' FAIL ', warn: ' warn ', skipped: ' skip ' };
  const sorted = [...report.results].sort((a, b) => order[a.status] - order[b.status]);

  const lines = ['', 'DIAGNOSTICS', '='.repeat(72)];
  for (const r of sorted) {
    lines.push(`${icon[r.status]} ${r.checked}`);
    lines.push(`        ${r.detail}`);
    if (r.remedy) lines.push(`        -> ${r.remedy}`);
  }
  lines.push('='.repeat(72));
  lines.push(`${report.passed} passed · ${report.failed} failed · ${report.warned} warning(s) · ${report.skipped} skipped`);
  lines.push(report.ready
    ? 'READY.'
    : 'NOT READY. Each failure above names what to do next.');
  lines.push('');
  return lines.join('\n');
}
