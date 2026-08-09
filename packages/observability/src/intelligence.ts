/**
 * Platform Intelligence — failure classification, health scoring, recommendations.
 *
 * TRACEABILITY
 *   Architecture : 24-platform-intelligence-model.md
 *   ADR          : ADR-0018 (Platform Service, not a capability) · ADR-0020
 *   Criteria     : C-24.1  (no metric interpolated, estimated or inferred)
 *                  C-24.5  (every index publishes score, coverage and freshness)
 *                  C-24.7  (absence of incidents is never reported as health)
 *                  C-24.9  (this service performs NO remediation)
 *                  C-24.10 (no cross-tenant aggregation)
 *                  C-24.13 (ingestion failure is reported per source, not globally)
 *                  C-24.14 (this service's own conformance appears in its own output)
 *
 * THIS SERVICE OBSERVES. IT NEVER ACTS.
 * C-24.9 is absolute: no remediation, no writes, no control operations. Every function
 * here returns a description of what is true and what a human might do about it. The
 * temptation to close the loop — restart the thing, rotate the certificate, drain the
 * queue — is exactly what turns a read-only intelligence surface into an unaudited
 * control plane. A source scan in the test suite enforces it, because a comment would
 * not survive the first outage.
 *
 * C-24.7 IS THE ONE THIS MODULE IS BUILT AROUND.
 * "Absence of incidents is never reported as health." A scoring function that averages
 * whatever it happens to find will report a perfect score for a platform that reported
 * nothing at all — the silent-source failure — and that number is most reassuring
 * precisely when it is least true. Coverage is therefore published alongside every
 * score (C-24.5), and a source that went silent is a FINDING, not an absence.
 */
import type { HealthReport } from './health.js';
import type { SliReading } from './slo.js';

export type Severity = 'critical' | 'major' | 'minor' | 'informational';

export interface Finding {
  readonly id: string;
  readonly severity: Severity;
  /** What is true. Observed, never inferred. */
  readonly observation: string;
  /** Why it is true, where that can be established from evidence rather than guessed. */
  readonly likelyCause: string | null;
  /** What a human might do. ADVISORY — this service performs none of it (C-24.9). */
  readonly recommendation: string;
  /** Tenant this concerns, or null for platform-wide. Never aggregated (C-24.10). */
  readonly tenantId: string | null;
  /** The evidence this finding was derived from, so it can be checked. */
  readonly derivedFrom: readonly string[];
}

export interface IndexReport {
  /** Null when coverage is zero. A score over nothing is not a score. */
  readonly score: number | null;
  /** Inputs measured over inputs expected (C-24.5). */
  readonly coverage: { readonly measured: number; readonly expected: number };
  /** Age of the oldest input, and whether it is still current (C-24.6). */
  readonly freshness: { readonly oldestAgeMs: number | null; readonly current: boolean };
  readonly detail: string;
}

/** A source the intelligence layer ingests. Failure is per source (C-24.13). */
export interface IngestedSource {
  readonly name: string;
  readonly available: boolean;
  /** Present when unavailable. Reported per source, never as a global outage. */
  readonly unavailableReason: string | null;
  readonly producedAtMs: number | null;
}

// ── Failure classification ──────────────────────────────────────────────────

/**
 * Classify an observed refusal or error into an actionable category.
 *
 * Classification is by OBSERVED SIGNAL, not by inference from context. A classifier
 * that guesses produces confident wrong answers, and a confident wrong answer sends an
 * operator down a path that cannot work — which costs more than no answer at all.
 *
 * Anything unrecognised is returned as `unclassified` rather than forced into the
 * nearest bucket. An honest "I do not recognise this" is a better handover than a
 * plausible misclassification.
 */
export interface Classification {
  readonly category: string;
  readonly severity: Severity;
  readonly meaning: string;
  readonly recommendation: string;
  readonly customerActionable: boolean;
}

const CLASSIFIERS: readonly (readonly [RegExp, Classification])[] = [
  [/certificate required|no client certificate/i, {
    category: 'authentication.no-certificate',
    severity: 'minor',
    meaning: 'A caller reached the gateway without a client certificate.',
    recommendation: 'Expected during scanning or misconfiguration. Investigate only if the rate rises for a registered tenant — that would mean a deployment lost its credentials.',
    customerActionable: true,
  }],
  [/certificate revoked/i, {
    category: 'authentication.revoked-certificate',
    severity: 'major',
    meaning: 'A revoked certificate was presented.',
    recommendation: 'If the revocation was not expected, treat it as a security event before reissuing. A deployment still using a revoked certificate has not been told to rotate.',
    customerActionable: false,
  }],
  [/certificate-mismatch|not-bound-to-certificate/i, {
    category: 'authentication.token-binding',
    severity: 'minor',
    meaning: 'A token was presented on a certificate it was not issued against.',
    recommendation: 'Almost always a client that rotated its certificate without fetching a new token. This is the binding working; the fix is on the client.',
    customerActionable: true,
  }],
  [/replay|nonce/i, {
    category: 'security.replay',
    severity: 'major',
    meaning: 'A request nonce was reused.',
    recommendation: 'A client bug reuses nonces on retry; an attack replays a captured request. Distinguish by whether the source certificate matches the original call.',
    customerActionable: true,
  }],
  [/tenant scope may not be asserted|claimed/i, {
    category: 'security.cross-tenant-attempt',
    severity: 'critical',
    meaning: 'A caller attempted to assert a tenant other than the one its certificate identifies.',
    recommendation: 'Refused and audited. Investigate the source: legitimate clients have no reason to send a tenant identifier at all.',
    customerActionable: false,
  }],
  [/not authorised for this path/i, {
    category: 'authorisation.path',
    severity: 'minor',
    meaning: 'An authenticated tenant requested a path it is not entitled to.',
    recommendation: 'Reissuing credentials will not change this. Check the path and the entitlement.',
    customerActionable: true,
  }],
  [/rate|429|limit/i, {
    category: 'capacity.rate-limit',
    severity: 'minor',
    meaning: 'A tenant exceeded its request rate.',
    recommendation: 'A limit, not a fault. Review the tenant\'s quota if it is sustained rather than bursty.',
    customerActionable: true,
  }],
  [/expired/i, {
    category: 'lifecycle.expiry',
    severity: 'major',
    meaning: 'A credential expired.',
    recommendation: 'An expiry is a rotation that did not happen. Check why the rotation window was missed — the outage had a known date.',
    customerActionable: false,
  }],
];

export function classify(signal: string): Classification {
  for (const [pattern, classification] of CLASSIFIERS) {
    if (pattern.test(signal)) return classification;
  }
  return {
    category: 'unclassified',
    severity: 'informational',
    meaning: `No classifier matched: "${signal.slice(0, 120)}".`,
    // Deliberately not a guess. A plausible misclassification costs more than none.
    recommendation: 'Unrecognised. Capture the correlation id and the full record; an unclassified signal that recurs is a gap in this classifier, which is itself worth fixing.',
    customerActionable: false,
  };
}

export const CLASSIFIER_CATEGORIES: readonly string[] =
  [...new Set(CLASSIFIERS.map(([, c]) => c.category))].sort();

// ── Silent-source detection (C-24.7) ────────────────────────────────────────

/**
 * A source that reported nothing is a FINDING, not an absence.
 *
 * This is the function C-24.7 exists for. Without it, a monitoring system reports its
 * best numbers during a total outage of the thing that reports — because nothing
 * arrived to contradict it.
 */
export function detectSilentSources(sources: readonly IngestedSource[]): readonly Finding[] {
  return sources
    .filter((s) => !s.available)
    .map((s) => ({
      id: `silence.${s.name}`,
      severity: 'major' as Severity,
      observation: `${s.name} reported nothing.`,
      likelyCause: s.unavailableReason,
      recommendation: 'Treat as unmeasured, not as healthy. A silent source and a working one are indistinguishable from the outside, and the silent one is the more likely explanation for a sudden absence of errors.',
      tenantId: null,
      derivedFrom: [s.name],
    }));
}

// ── Health scoring ──────────────────────────────────────────────────────────

/**
 * Score, coverage and freshness together (C-24.5).
 *
 * The score is deliberately null when coverage is zero. Publishing `100%` over zero
 * inputs is the most dangerous number this module could produce.
 */
export function scoreHealth(
  readings: readonly SliReading[],
  sources: readonly IngestedSource[],
  nowMs: number,
  expiryMs = 86_400_000,
): IndexReport {
  const measured = readings.filter((r) => r.status !== 'NOT MEASURED');
  const expected = readings.length;

  const ages = sources
    .map((s) => s.producedAtMs)
    .filter((t): t is number => t !== null)
    .map((t) => nowMs - t);
  const oldestAgeMs = ages.length > 0 ? Math.max(...ages) : null;
  const current = oldestAgeMs !== null && oldestAgeMs <= expiryMs;

  if (measured.length === 0) {
    return {
      score: null,
      coverage: { measured: 0, expected },
      freshness: { oldestAgeMs, current },
      detail: `NOT MEASURED — 0 of ${expected} indicators reported. A score over zero inputs would be the most misleading number this service could publish (C-24.7).`,
    };
  }

  // Score is the fraction of MEASURED indicators that are met. Unmeasured indicators
  // are excluded from the numerator AND the denominator, and surfaced as coverage —
  // rather than being counted as passes, which would inflate the score, or as
  // failures, which would make the index permanently red and therefore ignored.
  const met = measured.filter((r) => r.status === 'met').length;
  const score = met / measured.length;

  return {
    score,
    coverage: { measured: measured.length, expected },
    freshness: { oldestAgeMs, current },
    detail: `${met}/${measured.length} measured indicators met; ${expected - measured.length} NOT MEASURED and excluded from the score, not counted as passes`,
  };
}

// ── Findings ────────────────────────────────────────────────────────────────

/**
 * Produce findings from readings and health.
 *
 * Every finding names the evidence it came from, so a reader can check it rather than
 * trust it. A finding without traceable evidence is an opinion (C-24.2).
 */
export function analyse(
  readings: readonly SliReading[],
  health: HealthReport,
  sources: readonly IngestedSource[],
): readonly Finding[] {
  const findings: Finding[] = [...detectSilentSources(sources)];

  for (const r of readings) {
    if (r.status === 'breached') {
      findings.push({
        id: `slo.breached.${r.sloId}${r.tenantId ? `.${r.tenantId}` : ''}`,
        severity: 'critical',
        observation: `${r.sloId} is breached${r.tenantId ? ` for ${r.tenantId}` : ''}: ${r.detail}`,
        likelyCause: r.failures > 0 ? `${r.failures} failed outcome(s) recorded in the window` : null,
        recommendation: 'The SLO\'s declared consequence applies. This service does not enforce it — it reports that the condition is met (C-24.9).',
        tenantId: r.tenantId,
        derivedFrom: [`slo:${r.sloId}`],
      });
    } else if (r.status === 'at-risk') {
      findings.push({
        id: `slo.at-risk.${r.sloId}${r.tenantId ? `.${r.tenantId}` : ''}`,
        severity: 'major',
        observation: `${r.sloId} is within budget but at risk${r.tenantId ? ` for ${r.tenantId}` : ''}: ${r.detail}`,
        likelyCause: null,
        recommendation: 'Act before the budget is spent rather than after. The consequence at exhaustion is a freeze, and a freeze arriving mid-release is more expensive than one anticipated.',
        tenantId: r.tenantId,
        derivedFrom: [`slo:${r.sloId}`],
      });
    } else if (r.status === 'NOT MEASURED') {
      findings.push({
        id: `slo.unmeasured.${r.sloId}${r.tenantId ? `.${r.tenantId}` : ''}`,
        severity: 'major',
        observation: `${r.sloId} is NOT MEASURED${r.tenantId ? ` for ${r.tenantId}` : ''}.`,
        likelyCause: r.detail,
        recommendation: 'An unmeasured objective protects nothing. Restore the telemetry rather than removing the objective — the second is how a platform comes to have only the objectives it happens to meet.',
        tenantId: r.tenantId,
        derivedFrom: [`slo:${r.sloId}`],
      });
    }
  }

  if (health.state === 'unknown') {
    findings.push({
      id: 'health.unknown',
      severity: 'critical',
      observation: health.summary,
      likelyCause: 'no activity was observed, or a dependency could not be evaluated',
      recommendation: 'Do not read this as healthy. Establish whether the platform is idle or whether the reporting path is broken; those look identical from here and need opposite responses.',
      tenantId: null,
      derivedFrom: ['health'],
    });
  } else if (health.state === 'unhealthy' || health.state === 'degraded') {
    findings.push({
      id: `health.${health.state}`,
      severity: health.state === 'unhealthy' ? 'critical' : 'major',
      observation: health.summary,
      likelyCause: health.dependencies.filter((d) => d.state !== 'healthy').map((d) => `${d.name}: ${d.detail}`).join('; ') || null,
      recommendation: 'Work the named dependencies. Each carries its own detail line.',
      tenantId: null,
      derivedFrom: ['health'],
    });
  }

  const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2, informational: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.id < b.id ? -1 : 1));
}

/**
 * The service's own conformance, in its own output (C-24.14).
 *
 * An intelligence service that reported on everything except itself would hold an
 * exemption precisely where scrutiny matters most. These are self-assessments computed
 * from this module's own behaviour, not assertions about it.
 */
export function selfConformance(sources: readonly IngestedSource[]): readonly Finding[] {
  const findings: Finding[] = [];
  const unavailable = sources.filter((s) => !s.available);

  findings.push({
    id: 'self.c-24.13',
    severity: 'informational',
    observation: `Ingestion is reported per source: ${sources.length - unavailable.length}/${sources.length} available.`,
    likelyCause: null,
    recommendation: unavailable.length > 0
      ? `Partial ingestion, not a global outage. Unavailable: ${unavailable.map((s) => s.name).join(', ')}.`
      : 'No action.',
    tenantId: null,
    derivedFrom: sources.map((s) => s.name),
  });

  findings.push({
    id: 'self.c-24.9',
    severity: 'informational',
    observation: 'This service performed no remediation, because it has no capability to perform any.',
    likelyCause: null,
    recommendation: 'Every recommendation in this report is advisory. Acting on one is a human decision, deliberately.',
    tenantId: null,
    derivedFrom: ['self'],
  });

  return findings;
}
