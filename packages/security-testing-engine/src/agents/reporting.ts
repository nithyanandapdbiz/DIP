/**
 * Synchronization (adapter publication) and executive reporting — stage 12.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 24-platform-intelligence-model.md · 18-governance-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-14.1 · C-11.11
 *
 * The publication order — container -> requirements -> findings -> defects -> evidence ->
 * traceability — is identical for every provider; the adapter names the noun, never the
 * sequence. The reporting agents render figures deterministically; a report that overstates
 * release readiness is refused at the certification stage, not published.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import { boardReport, renderReportPdf } from './report.js';
import {
  SEVERITY_ORDER,
  type AssessedWeakness, type ComplianceResult, type EvidenceReference, type PostureScores,
  type SecurityReport, type SecurityRequirement, type Severity, type SyncRecord,
} from '../model.js';
import type { SecurityAdapter } from '../adapters.js';

export interface SyncInput {
  readonly adapter: SecurityAdapter;
  readonly targetId: string;
  readonly requirements: readonly SecurityRequirement[];
  readonly assessed: readonly AssessedWeakness[];
  readonly evidence: readonly EvidenceReference[];
  readonly openRequirementIds: readonly string[];
}

const live = (assessed: readonly AssessedWeakness[]): readonly AssessedWeakness[] =>
  assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);

export const syncAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.container', domain: 'sync', purpose: 'Create the provider container for this verification run.',
    stage: 'reporting', plane: 'IP', inputs: ['the adapter and target'], outputs: ['a container sync record'],
    responsibilities: ['create exactly one container through the adapter'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a container that cannot be created fails the sync; nothing is published headless',
    handle: (i) => { const c = i.adapter.createContainer(`security-verification-${i.targetId}`); return [{ kind: 'container', externalId: c.containerId, published: true, reason: null }]; },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.requirements', domain: 'sync', purpose: 'Publish each security requirement and whether it is satisfied.',
    stage: 'reporting', plane: 'IP', inputs: ['requirements', 'open requirement ids'], outputs: ['requirement sync records'],
    responsibilities: ['publish every requirement with its satisfied state'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a requirement that fails to publish is recorded published:false with a reason',
    handle: (i) => i.requirements.map((r): SyncRecord => { const res = i.adapter.publishRequirement({ id: r.id, source: r.source, control: r.control, satisfied: !i.openRequirementIds.includes(r.id) }); return { kind: 'requirement', externalId: res.externalId, published: true, reason: null }; }),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.findings', domain: 'sync', purpose: 'Publish each live weakness as a finding.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['finding sync records'],
    responsibilities: ['publish only live, non-duplicate weaknesses'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a finding that fails to publish is recorded published:false with a reason',
    handle: (i) => live(i.assessed).map((a): SyncRecord => { const res = i.adapter.publishFinding({ id: a.weakness.id, category: a.weakness.category, cwe: a.weakness.cwe, severity: a.weakness.severity, path: a.weakness.path }); return { kind: 'finding', externalId: res.externalId, published: true, reason: null }; }),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.defects', domain: 'sync', purpose: 'Raise a defect for each priority-1 and priority-2 weakness.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['defect sync records'],
    responsibilities: ['raise defects only for P1/P2 live weaknesses'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a defect that fails to publish is recorded published:false with a reason',
    handle: (i) => live(i.assessed).filter((a) => a.priority === 'P1' || a.priority === 'P2').map((a): SyncRecord => { const res = i.adapter.publishDefect({ title: `${a.weakness.category} at ${a.weakness.path}`, findingId: a.weakness.id, severity: a.weakness.severity, evidenceRefs: a.weakness.evidenceRefs }); return { kind: 'defect', externalId: res.defectId, published: true, reason: null }; }),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.evidence', domain: 'sync', purpose: 'Publish each evidence reference by hash and locator only.',
    stage: 'reporting', plane: 'IP', inputs: ['evidence references'], outputs: ['evidence sync records'],
    responsibilities: ['publish references, never artefact content'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'an evidence reference that fails to publish is recorded published:false with a reason',
    handle: (i) => i.evidence.map((e): SyncRecord => { const res = i.adapter.publishEvidenceReference(i.targetId, { sha256: e.sha256, locator: e.locator, kind: e.kind }); return { kind: 'evidence', externalId: e.locator, published: res.published, reason: null }; }),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.traceability', domain: 'sync', purpose: 'Publish the run result and link findings to the container.',
    stage: 'reporting', plane: 'IP', inputs: ['target and assessed weaknesses'], outputs: ['traceability sync records'],
    responsibilities: ['publish the result and link traceability'], toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'a traceability link that fails is recorded published:false with a reason',
    handle: (i) => { i.adapter.publishResult(i.targetId, `${live(i.assessed).length} live weakness(es)`); return [{ kind: 'result', externalId: i.targetId, published: true, reason: null }]; },
  }) as unknown as AgentDefinition<never, unknown>,
];

// ── Reporting (stage 12) ────────────────────────────────────────────────────

export interface ReportInput {
  readonly targetId: string;
  readonly assessed: readonly AssessedWeakness[];
  readonly compliance: readonly ComplianceResult[];
  readonly scores: PostureScores;
  readonly requirementCoverage: { readonly total: number; readonly verified: number; readonly satisfied: number };
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly asvsLevel: 1 | 2 | 3;
}

function counts(assessed: readonly AssessedWeakness[]): Readonly<Record<Severity, number>> {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const a of assessed) if (!a.falsePositive && a.duplicateOf === null) c[a.weakness.severity] += 1;
  return c;
}

export const reportingAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<ReportInput, Readonly<Record<Severity, number>>>({
    id: 'reporting.severity-counts', domain: 'reporting', purpose: 'Count live weaknesses by severity.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['severity counts'],
    responsibilities: ['count only live, non-duplicate weaknesses'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an uncountable finding is reported separately, never silently omitted',
    handle: (i) => counts(i.assessed),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.owasp-summary', domain: 'reporting', purpose: 'Summarise live weaknesses by OWASP category.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['an OWASP summary'],
    responsibilities: ['group by OWASP reference'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unmapped finding is grouped as unmapped, never dropped',
    handle: (i) => { const m: Record<string, number> = {}; for (const a of i.assessed) if (!a.falsePositive) m[a.weakness.owasp] = (m[a.weakness.owasp] ?? 0) + 1; return m; },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<ReportInput, number | null>({
    id: 'reporting.cvss-summary', domain: 'reporting', purpose: 'Average the CVSS base score across live weaknesses.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['the CVSS average or NOT MEASURED'],
    responsibilities: ['report NOT MEASURED when there is nothing to average'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no live weakness yields null (NOT MEASURED), never a misleading zero',
    handle: (i) => { const l = live(i.assessed); return l.length === 0 ? null : Math.round((l.reduce((s, a) => s + a.cvss.baseScore, 0) / l.length) * 10) / 10; },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<ReportInput, number>({
    id: 'reporting.compliance-dashboard', domain: 'reporting', purpose: 'Compute the aggregate compliance score.',
    stage: 'reporting', plane: 'IP', inputs: ['compliance results'], outputs: ['the aggregate compliance score'],
    responsibilities: ['average framework scores'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'no compliance targets scores 100 and is flagged as not-in-scope, never as satisfied',
    handle: (i) => i.compliance.length === 0 ? 100 : Math.round(i.compliance.reduce((s, c) => s + c.score, 0) / i.compliance.length),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<ReportInput, { readiness: 'READY' | 'CONDITIONAL' | 'NOT-READY'; rationale: string }>({
    id: 'reporting.release-readiness', domain: 'reporting', purpose: 'Decide release readiness from live severities.',
    stage: 'reporting', plane: 'IP', inputs: ['assessed weaknesses'], outputs: ['a release-readiness verdict'],
    responsibilities: ['any critical/high blocks readiness'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'when readiness cannot be computed it reports NOT-READY, the safe default',
    handle: (i) => {
      const l = live(i.assessed);
      const worst = l.reduce((m, a) => Math.max(m, SEVERITY_ORDER[a.weakness.severity]), 0);
      if (worst >= SEVERITY_ORDER.high) return { readiness: 'NOT-READY', rationale: `${l.filter((a) => SEVERITY_ORDER[a.weakness.severity] >= SEVERITY_ORDER.high).length} high/critical weakness(es) open` };
      if (worst >= SEVERITY_ORDER.medium) return { readiness: 'CONDITIONAL', rationale: 'medium weaknesses open; release with a remediation plan' };
      return { readiness: 'READY', rationale: 'no high or critical weakness verified as present' };
    },
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<ReportInput & { report?: SecurityReport }, string>({
    id: 'reporting.executive-summary', domain: 'reporting', purpose: 'Render an executive summary line.',
    stage: 'reporting', plane: 'IP', inputs: ['the scores'], outputs: ['an executive summary'],
    responsibilities: ['state the score and the readiness plainly'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unrenderable summary falls back to the raw score, never to silence',
    handle: (i) => `Security score ${i.scores.securityScore}/100; compliance ${i.scores.complianceScore}/100; ${i.requirementCoverage.satisfied}/${i.requirementCoverage.total} requirements satisfied.`,
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ report: SecurityReport }, { bytes: number; pages: number }>({
    id: 'reporting.board-report', domain: 'reporting', purpose: 'Render the board-level report figures.',
    stage: 'reporting', plane: 'IP', inputs: ['the assembled report'], outputs: ['board report figures'],
    responsibilities: ['render figures and the decision required'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an unrenderable board report reports NOT MEASURED for its figures, never a fabricated pass',
    handle: (i) => { boardReport(i.report); return renderReportPdf(i.report); },
  }) as unknown as AgentDefinition<never, unknown>,
];
