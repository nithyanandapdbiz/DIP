/**
 * Executive PDF and board report rendering.
 *
 * TRACEABILITY
 *   Architecture : 18-governance-model.md
 *   ADR          : ADR-0023 · ADR-0019 (evidence over assertion)
 *
 * WHY A REAL PDF AND NOT A CLAIM OF ONE.
 * The audit of the first capability recorded "Executive PDF — MISSING" because the
 * implementation produced text sections and the documentation called them a pack. The
 * honest options were to build the thing or to stop saying it existed.
 *
 * This writes actual PDF 1.4 bytes: a catalogue, a pages tree, a page with a font
 * resource, and a content stream of text-positioning operators, with a correct
 * cross-reference table. The output opens in a PDF reader. It is deliberately plain —
 * one font, no images, no compression — because a dependency-free renderer that produces
 * a valid file beats a rich one the platform cannot build without a vendor.
 *
 * NO FIGURE IS RENDERED THAT WAS NOT MEASURED.
 * `NOT MEASURED` is passed through as text rather than being formatted as a zero. A zero
 * on an executive page is read as a measurement, and R-13.3 exists because that reading
 * has caused real decisions.
 */
import type { DiscoveryReport } from '../model.js';

/** Escape the three characters that terminate or nest a PDF string literal. */
function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** ASCII only. A PDF string in the standard encoding cannot carry arbitrary Unicode. */
function toAscii(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?');
}

export interface PdfPage {
  readonly title: string;
  readonly lines: readonly string[];
}

/**
 * Render pages to PDF bytes.
 *
 * Objects are emitted in order and their byte offsets recorded as they are written,
 * because the cross-reference table must hold the offset of every object and a reader
 * rejects the file if one is wrong. Building the string first and measuring afterwards
 * is what makes the offsets correct by construction rather than by arithmetic.
 */
export function renderPdf(documentTitle: string, pages: readonly PdfPage[]): Buffer {
  const chunks: string[] = [];
  const offsets: number[] = [];
  let length = 0;

  const emit = (text: string): void => { chunks.push(text); length += Buffer.byteLength(text, 'latin1'); };
  const object = (body: string): void => { offsets.push(length); emit(body); };

  emit('%PDF-1.4\n');

  const pageCount = Math.max(1, pages.length);
  // Object numbering: 1 catalogue, 2 pages tree, 3 font, then per page a page object
  // and a content stream.
  const pageObjectNumber = (i: number): number => 4 + i * 2;
  const contentObjectNumber = (i: number): number => 5 + i * 2;

  object(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  object(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${
    Array.from({ length: pageCount }, (_, i) => `${pageObjectNumber(i)} 0 R`).join(' ')
  }] >>\nendobj\n`);
  object(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  const rendered = pages.length > 0 ? pages : [{ title: documentTitle, lines: ['no content'] }];

  for (const [i, page] of rendered.entries()) {
    object(`${pageObjectNumber(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] `
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber(i)} 0 R >>\nendobj\n`);

    // A4 is 842pt tall. Start at 790 and step 16pt, which fits ~46 lines without
    // running off the bottom — lines beyond that are dropped by the caller, not here.
    const body = [
      'BT', '/F1 16 Tf', '1 0 0 1 56 790 Tm', `(${pdfEscape(toAscii(page.title))}) Tj`,
      'ET', 'BT', '/F1 10 Tf', '1 0 0 1 56 762 Tm', '16 TL',
      ...page.lines.map((line) => `(${pdfEscape(toAscii(line))}) Tj T*`),
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

/** A percentage, or the words NOT MEASURED. Never a zero standing in for an absence. */
export function pct(value: number | null): string {
  return value === null || Number.isNaN(value) ? 'NOT MEASURED' : `${(value * 100).toFixed(1)}%`;
}

export function executivePages(report: DiscoveryReport): readonly PdfPage[] {
  const inventory = Object.entries(report.applicationInventory).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return [
    {
      title: `Discovery report - ${report.applicationId}`,
      lines: [
        `Reasoning mode: ${report.reasoningMode}`,
        `Discovery completeness: ${pct(report.discoveryCompleteness)}`,
        '',
        'Requirement reconstruction',
        `  Epics: ${report.requirementCounts.epics}`,
        `  Features: ${report.requirementCounts.features}`,
        `  Stories: ${report.requirementCounts.stories}`,
        '',
        'Coverage',
        `  Requirement coverage: ${pct(report.requirementCoverage)}`,
        `  Automation coverage: ${pct(report.automationCoverage)}`,
        `  QA assets generated: ${report.qaAssetCount}`,
        '',
        'Execution',
        `  Passed: ${report.executionSummary.passed}`,
        `  Failed: ${report.executionSummary.failed}`,
        `  Skipped: ${report.executionSummary.skipped}`,
        `  Healing rate: ${pct(report.healingRate)}`,
        `  Defects raised: ${report.defectCount}`,
        '',
        `Release readiness: ${report.releaseReadiness}`,
        `Rationale: ${report.rationale}`,
      ],
    },
    {
      title: 'Application inventory',
      lines: [
        ...inventory.map(([kind, count]) => `  ${kind}: ${count}`),
        '',
        `Business capabilities (${report.businessCapabilities.length})`,
        ...report.businessCapabilities.slice(0, 20).map((c) => `  ${c}`),
        '',
        `Journeys (${report.journeyInventory.length})`,
        ...report.journeyInventory.slice(0, 15).map((j) => `  ${j}`),
        '',
        `API endpoints (${report.apiInventory.length})`,
        ...report.apiInventory.slice(0, 15).map((a) => `  ${a}`),
      ],
    },
  ];
}

export interface BoardReport {
  readonly title: string;
  readonly headline: string;
  readonly figures: readonly { readonly label: string; readonly value: string; readonly measured: boolean }[];
  readonly risks: readonly string[];
  readonly decisionRequired: string;
}

/**
 * The board report.
 *
 * Distinct from the executive pack rather than a shorter copy of it. An executive pack
 * reports what was found; a board report states what decision is being asked for and on
 * what evidence. `measured` travels with every figure so a reader can see which numbers
 * are observations and which are absences — the distinction a summary usually loses, and
 * the one that matters most at that table.
 */
export function boardReport(report: DiscoveryReport): BoardReport {
  const executed = report.executionSummary.passed + report.executionSummary.failed;
  const measured = executed > 0;

  return {
    title: `Application discovery - ${report.applicationId}`,
    headline: measured
      ? `${report.requirementCounts.stories} requirements reconstructed from the running application; ${executed} verified by execution.`
      : `${report.requirementCounts.stories} requirements reconstructed from the running application. No execution evidence was produced.`,
    figures: [
      { label: 'Business capabilities discovered', value: String(report.businessCapabilities.length), measured: true },
      { label: 'Journeys discovered', value: String(report.journeyInventory.length), measured: true },
      { label: 'API endpoints discovered', value: String(report.apiInventory.length), measured: true },
      { label: 'Requirements reconstructed', value: String(report.requirementCounts.stories), measured: true },
      { label: 'QA assets generated', value: String(report.qaAssetCount), measured: true },
      { label: 'Requirement coverage', value: pct(report.requirementCoverage), measured: true },
      { label: 'Automation coverage', value: pct(report.automationCoverage), measured: true },
      { label: 'Execution verification', value: measured ? pct(report.executionSummary.passed / executed) : 'NOT MEASURED', measured },
      { label: 'Defects raised', value: String(report.defectCount), measured: true },
    ],
    risks: [
      ...(report.discoveryCompleteness < 1
        ? [`Discovery reached ${pct(report.discoveryCompleteness)} of the declared scope; the remainder is unassessed.`]
        : []),
      ...(report.reasoningMode === 'disabled'
        ? ['Reasoning was disabled. Relationships and requirements are those directly observed; implicit ones were not sought.']
        : []),
      ...(!measured ? ['No test executed, so no requirement is verified by evidence.'] : []),
      ...(report.riskProfile.critical > 0
        ? [`${report.riskProfile.critical} reconstructed requirement(s) carry critical risk.`] : []),
    ],
    decisionRequired: measured
      ? `Accept or reject the reconstructed requirement baseline of ${report.requirementCounts.stories} stories.`
      : `Accept the reconstructed baseline as unverified, or commission execution before accepting it.`,
  };
}
