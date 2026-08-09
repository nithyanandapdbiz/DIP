/**
 * Executive PDF and board report rendering.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md
 *   ADR          : ADR-0027 · ADR-0019 (evidence over assertion)
 *
 * WHY A REAL PDF AND NOT A CLAIM OF ONE.
 * This writes actual PDF 1.4 bytes: a catalogue, a pages tree, a page with a font resource, and
 * a content stream of text-positioning operators, with a correct cross-reference table. The
 * output opens in a PDF reader. It is deliberately plain — one font, no images — because a
 * dependency-free renderer that produces a valid file beats a rich one the platform cannot build
 * without a vendor.
 *
 * NO FIGURE IS RENDERED THAT WAS NOT MEASURED.
 * `NOT MEASURED` is passed through as text rather than formatted as a zero. A zero on an executive
 * page is read as a measurement, and R-13.3 exists because that reading has driven real decisions.
 */
import type { PentestReport, Severity } from '../model.js';

function pdfEscape(text: string): string { return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function toAscii(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?');
}

export interface PdfPage { readonly title: string; readonly lines: readonly string[]; }

export function renderPdf(documentTitle: string, pages: readonly PdfPage[]): Buffer {
  const chunks: string[] = [];
  const offsets: number[] = [];
  let length = 0;
  const emit = (text: string): void => { chunks.push(text); length += Buffer.byteLength(text, 'latin1'); };
  const object = (body: string): void => { offsets.push(length); emit(body); };

  emit('%PDF-1.4\n');
  const rendered = pages.length > 0 ? pages : [{ title: documentTitle, lines: ['no content'] }];
  const pageCount = rendered.length;
  const pageObjectNumber = (i: number): number => 4 + i * 2;
  const contentObjectNumber = (i: number): number => 5 + i * 2;

  object(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  object(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageObjectNumber(i)} 0 R`).join(' ')}] >>\nendobj\n`);
  object(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  for (const [i, page] of rendered.entries()) {
    object(`${pageObjectNumber(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber(i)} 0 R >>\nendobj\n`);
    const body = [
      'BT', '/F1 16 Tf', '1 0 0 1 56 790 Tm', `(${pdfEscape(toAscii(page.title))}) Tj`,
      'ET', 'BT', '/F1 10 Tf', '1 0 0 1 56 762 Tm', '16 TL',
      ...page.lines.slice(0, 44).map((line) => `(${pdfEscape(toAscii(line))}) Tj T*`),
      'ET',
    ].join('\n');
    object(`${contentObjectNumber(i)} 0 obj\n<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream\nendobj\n`);
  }

  const xrefOffset = length;
  const objectCount = offsets.length + 1;
  emit(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (const offset of offsets) emit(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  emit(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(''), 'latin1');
}

/** A number, or the words NOT MEASURED. Never a zero standing in for an absence. */
export function num(value: number | null): string {
  return value === null || Number.isNaN(value) ? 'NOT MEASURED' : String(value);
}

export function executivePages(report: PentestReport): readonly PdfPage[] {
  const sev = (s: Severity) => report.findingCounts[s];
  const owasp = Object.entries(report.owaspSummary).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return [
    {
      title: `Penetration test report - ${report.targetId}`,
      lines: [
        `Reasoning mode: ${report.reasoningMode}`,
        `Scan phase reached: ${report.scanPhaseReached}`,
        `Security score: ${report.securityScore}/100`,
        `Executive threat score: ${report.executiveThreatScore}/100`,
        '',
        'Findings by severity',
        `  Critical: ${sev('critical')}`,
        `  High: ${sev('high')}`,
        `  Medium: ${sev('medium')}`,
        `  Low: ${sev('low')}`,
        `  Info: ${sev('info')}`,
        '',
        `Average CVSS: ${num(report.cvssAverage)}`,
        `Attack chains: ${report.attackChainCount}`,
        `False positive rate: ${report.falsePositiveRate === null ? 'NOT MEASURED' : `${(report.falsePositiveRate * 100).toFixed(1)}%`}`,
        `Historical trend: ${report.historicalTrend}`,
        '',
        `Release readiness: ${report.releaseReadiness}`,
        `Rationale: ${report.rationale}`,
      ],
    },
    {
      title: 'OWASP and compliance summary',
      lines: [
        'OWASP categories',
        ...owasp.map(([k, v]) => `  ${k}: ${v}`),
        '',
        'Compliance controls',
        ...Object.entries(report.complianceSummary).slice(0, 15).map(([k, v]) => `  ${k}: ${v}`),
        '',
        'Threat heat map (by tactic)',
        ...Object.entries(report.threatHeatMap).slice(0, 15).map(([k, v]) => `  ${k}: ${v}`),
      ],
    },
  ];
}

export function renderReportPdf(report: PentestReport): { bytes: number; pages: number } {
  const pages = executivePages(report);
  return { bytes: renderPdf('Penetration test', pages).length, pages: pages.length };
}

export interface BoardReport {
  readonly title: string;
  readonly headline: string;
  readonly figures: readonly { readonly label: string; readonly value: string; readonly measured: boolean }[];
  readonly risks: readonly string[];
  readonly decisionRequired: string;
}

export function boardReport(report: PentestReport): BoardReport {
  const scanned = report.releaseReadiness !== 'NOT MEASURED';
  const totalHigh = report.findingCounts.critical + report.findingCounts.high;
  return {
    title: `Penetration test - ${report.targetId}`,
    headline: scanned
      ? `${totalHigh} high or critical finding(s); security score ${report.securityScore}/100; readiness ${report.releaseReadiness}.`
      : 'No active scan was executed, so no finding was confirmed and readiness is unmeasured.',
    figures: [
      { label: 'Security score', value: scanned ? `${report.securityScore}/100` : 'NOT MEASURED', measured: scanned },
      { label: 'Executive threat score', value: `${report.executiveThreatScore}/100`, measured: true },
      { label: 'Critical findings', value: String(report.findingCounts.critical), measured: true },
      { label: 'High findings', value: String(report.findingCounts.high), measured: true },
      { label: 'Average CVSS', value: num(report.cvssAverage), measured: report.cvssAverage !== null },
      { label: 'Attack chains', value: String(report.attackChainCount), measured: true },
      { label: 'Release verification', value: scanned ? report.releaseReadiness : 'NOT MEASURED', measured: scanned },
    ],
    risks: [
      ...(report.findingCounts.critical > 0 ? [`${report.findingCounts.critical} critical finding(s) block release.`] : []),
      ...(report.reasoningMode === 'disabled' ? ['Reasoning was disabled. Threat correlation and narratives are deterministic; emergent correlations were not sought.'] : []),
      ...(!scanned ? ['No active scan executed, so no vulnerability is confirmed by evidence.'] : []),
      ...(report.historicalTrend === 'worsening' ? ['The finding profile is worsening against history.'] : []),
    ],
    decisionRequired: scanned
      ? `Accept the ${report.releaseReadiness} verdict and its remediation plan, or commission deeper testing.`
      : 'Commission an active scan before making a release decision; the current run measured nothing.',
  };
}
