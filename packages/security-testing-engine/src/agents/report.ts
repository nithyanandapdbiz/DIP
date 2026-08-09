/**
 * Report rendering helpers — deterministic, no reasoning.
 *
 * TRACEABILITY
 *   Architecture : 24-platform-intelligence-model.md · 18-governance-model.md
 *   ADR          : ADR-0028
 *
 * The executive and board artefacts are rendered from the assembled report. Reasoning may
 * add a narrative in the reporting stage, but the figures here are computed and are never
 * replaced by a proposal — a report that overstates readiness is rejected, not published.
 */
import type { SecurityReport, Severity } from '../model.js';

export interface PdfPage { readonly heading: string; readonly lines: readonly string[]; }
export interface BoardReport { readonly figures: number; readonly unmeasured: number; readonly decisionRequired: string; }

export function num(n: number | null): string { return n === null ? 'NOT MEASURED' : String(n); }

const SEV_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function executivePages(report: SecurityReport): readonly PdfPage[] {
  return [
    {
      heading: `Security verification — ${report.targetId}`,
      lines: [
        `Security score: ${report.scores.securityScore}/100`,
        `OWASP score: ${report.scores.owaspScore}/100 · API: ${report.scores.apiScore}/100 · Cloud: ${report.scores.cloudScore}/100 · Identity: ${report.scores.identityScore}/100`,
        `Compliance score: ${report.scores.complianceScore}/100`,
        `Release readiness: ${report.releaseReadiness} — ${report.rationale}`,
        `CVSS average: ${num(report.cvssAverage)}`,
        `Findings: ${SEV_ORDER.map((s) => `${s} ${report.findingCounts[s]}`).join(' · ')}`,
        `Requirement coverage: ${report.requirementCoverage.satisfied}/${report.requirementCoverage.total} satisfied`,
      ],
    },
  ];
}

export function renderReportPdf(report: SecurityReport): { bytes: number; pages: number } {
  const pages = executivePages(report);
  const bytes = pages.reduce((s, p) => s + p.heading.length + p.lines.join('').length, 0);
  return { bytes, pages: pages.length };
}

export function boardReport(report: SecurityReport): BoardReport {
  const figures = 1 + Object.keys(report.scores.riskHeatMap).length + report.compliance.length;
  const unmeasured = report.cvssAverage === null ? 1 : 0;
  const decisionRequired = report.releaseReadiness === 'READY'
    ? 'none — verification passed'
    : `remediate before release: ${report.rationale}`;
  return { figures, unmeasured, decisionRequired };
}
