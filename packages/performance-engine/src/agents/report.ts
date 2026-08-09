/**
 * Executive PDF, engineering report and board report rendering.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026 · ADR-0019 (evidence over assertion)
 *
 * WHY A REAL PDF AND NOT A CLAIM OF ONE.
 * This writes actual PDF 1.4 bytes: a catalogue, a pages tree, pages with a font resource, and
 * content streams of text-positioning operators, with a correct cross-reference table. The
 * output opens in a PDF reader. It is deliberately plain — one font, no images — because a
 * dependency-free renderer that produces a valid file beats a rich one the platform cannot build
 * without a vendor.
 *
 * NO FIGURE IS RENDERED THAT WAS NOT MEASURED.
 * `NOT MEASURED` is passed through as text rather than formatted as a zero. A zero on an executive
 * page is read as a measurement, and R-13.3 exists because that reading has driven real decisions.
 */
import type { DimensionScore, PerformanceReport, Severity } from '../model.js';

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

function pct(value: number | null): string {
  return value === null || Number.isNaN(value) ? 'NOT MEASURED' : `${value.toFixed(1)}%`;
}

function scoreLine(s: DimensionScore): string {
  return `  ${s.dimension.padEnd(20)} ${s.measured ? `${s.score}/100` : 'NOT MEASURED'}`;
}

export function executivePages(report: PerformanceReport): readonly PdfPage[] {
  const sev = (list: readonly { severity: Severity }[], s: Severity) => list.filter((b) => b.severity === s).length;
  return [
    {
      title: `Performance certification - ${report.targetId}`,
      lines: [
        `Reasoning mode: ${report.reasoningMode}`,
        `Test types run: ${report.testTypesRun.join(', ') || 'none'}`,
        `Overall score: ${report.overallScore}/100`,
        `Verdict: ${report.verdict}`,
        '',
        'Dimension scores',
        ...report.scores.map(scoreLine),
        '',
        `SLA compliance: ${pct(report.slaCompliancePercent)}`,
        `Capacity headroom: ${pct(report.capacityHeadroomPercent)}`,
        `Regressions: ${report.regressionCount} (worst ${report.worstRegressionPercent === null ? 'NOT MEASURED' : `${report.worstRegressionPercent.toFixed(1)}%`})`,
        `Predictions: ${report.predictionCount}`,
        `Defects raised: ${report.defectCount}`,
        '',
        'Executive summary',
        report.executiveSummary,
      ],
    },
    {
      title: 'Bottlenecks and rationale',
      lines: [
        'Top bottlenecks by severity',
        `  Critical: ${sev(report.topBottlenecks, 'critical')}`,
        `  High: ${sev(report.topBottlenecks, 'high')}`,
        `  Medium: ${sev(report.topBottlenecks, 'medium')}`,
        '',
        ...report.topBottlenecks.slice(0, 20).map((b) => `  [${b.severity}] ${b.kind} @ ${b.component}`),
        '',
        'Rationale',
        report.rationale,
      ],
    },
  ];
}

export function renderReportPdf(report: PerformanceReport): { bytes: number; pages: number } {
  const pages = executivePages(report);
  return { bytes: renderPdf('Performance certification', pages).length, pages: pages.length };
}

export interface BoardReport {
  readonly title: string;
  readonly headline: string;
  readonly figures: readonly { readonly label: string; readonly value: string; readonly measured: boolean }[];
  readonly risks: readonly string[];
  readonly decisionRequired: string;
}

export function boardReport(report: PerformanceReport): BoardReport {
  const measured = report.testTypesRun.length > 0 && report.transactionsSummarised > 0;
  const critical = report.topBottlenecks.filter((b) => b.severity === 'critical').length;
  return {
    title: `Performance - ${report.targetId}`,
    headline: measured
      ? `Overall ${report.overallScore}/100; verdict ${report.verdict}; ${critical} critical bottleneck(s); ${report.defectCount} defect(s).`
      : 'No load was executed, so no performance figure was measured and the verdict is unmeasured.',
    figures: [
      { label: 'Overall score', value: measured ? `${report.overallScore}/100` : 'NOT MEASURED', measured },
      { label: 'Verdict', value: measured ? report.verdict : 'NOT MEASURED', measured },
      { label: 'SLA compliance', value: pct(report.slaCompliancePercent), measured: report.slaCompliancePercent !== null },
      { label: 'Capacity headroom', value: pct(report.capacityHeadroomPercent), measured: report.capacityHeadroomPercent !== null },
      { label: 'Critical bottlenecks', value: String(critical), measured },
      { label: 'Defects raised', value: String(report.defectCount), measured },
    ],
    risks: [
      ...(critical > 0 ? [`${critical} critical bottleneck(s) threaten release.`] : []),
      ...(report.verdict === 'FAIL' ? ['At least one blocking threshold was breached under load.'] : []),
      ...(report.reasoningMode === 'disabled' ? ['Reasoning was disabled. Bottleneck and root-cause analysis is deterministic; emergent correlations were not sought.'] : []),
      ...(!measured ? ['No load was executed, so no performance obligation is confirmed by evidence.'] : []),
      ...(report.capacityHeadroomPercent !== null && report.capacityHeadroomPercent < 20 ? ['Capacity headroom is below 20%; peak demand may breach objectives.'] : []),
    ],
    decisionRequired: measured
      ? `Accept the ${report.verdict} verdict and its remediation plan, or commission deeper load testing.`
      : 'Commission a load run before making a release decision; the current run measured nothing.',
  };
}
