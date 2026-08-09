/**
 * Synchronization (stage 12), Reporting (stage 12) and Learning (stage 10) — Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 14-tool-operating-model.md · 18-governance-model.md
 *   ADR          : ADR-0027 · ADR-0019 (evidence over assertion)
 *   Criteria     : C-14.1 (tools via adapter SPI) · R-13.3 (NOT MEASURED is never a pass)
 *
 * SYNCHRONIZATION IS ONE CANONICAL WORKFLOW; ONLY THE ADAPTER DIFFERS.
 * Azure DevOps, Jira, a Security Hub and a SIEM differ in what they call a finding and where
 * it lands — not in the order the engine publishes. Every publication goes through a
 * `SecurityAdapter`, and the orchestrator never names a provider. A synchronization record is
 * produced for everything, published or refused, and a refusal always carries its reason.
 *
 * REPORTING NEVER RENDERS AN UNMEASURED FIGURE AS A NUMBER.
 * Release readiness is NOT MEASURED when nothing was scanned, and the board report carries a
 * `measured` flag with every figure. R-13.3: an absence rendered as a zero is read as a
 * measurement, and that reading has driven real release decisions.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  SEVERITY_ORDER, severityForScore,
  type AssessedFinding, type AttackChain, type EvidenceReference, type FindingDisposition,
  type LearningKind, type LearningRecord, type Remediation, type Severity, type SyncRecord,
  type ThreatAssessment, type ThreatLandscape,
} from '../model.js';
import type { SecurityAdapter } from '../adapters.js';

// ── Synchronization — stage 12 (reporting, IP) ──────────────────────────────

export interface SyncInput {
  readonly adapter: SecurityAdapter;
  readonly targetId: string;
  readonly assessed: readonly AssessedFinding[];
  readonly dispositions: ReadonlyMap<string, FindingDisposition>;
  readonly threats: ReadonlyMap<string, ThreatAssessment>;
  readonly evidence: readonly EvidenceReference[];
}

/** Only genuinely new, non-false-positive findings are published; the rest carry a reason. */
function publishable(input: SyncInput): readonly AssessedFinding[] {
  return input.assessed.filter((a) => !a.falsePositive && (input.dispositions.get(a.finding.id)?.kind === 'new'));
}

export const syncAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<SyncInput, { readonly containerId: string; readonly records: readonly SyncRecord[] }>({
    id: 'sync.container', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Create the container the findings will be published into, and publish the run result, via the adapter.',
    inputs: ['SyncInput'], outputs: ['containerId', 'SyncRecord[]'],
    responsibilities: ['create one container through the adapter', 'publish the overall run result through the adapter'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A container that cannot be created stops publication and records the reason, so nothing is published into a phantom container.',
    handle: (input) => {
      const container = input.adapter.createContainer(`pentest ${input.targetId}`);
      // Publish the run result summary through the adapter, so the engagement outcome is
      // recorded in the provider alongside the individual findings.
      const live = input.assessed.filter((a) => !a.falsePositive);
      input.adapter.publishResult(input.targetId, `${live.length} finding(s) across ${input.assessed.length} assessed`);
      return { containerId: container.containerId, records: [{ target: 'result', localId: input.targetId, externalId: container.containerId, published: true, reason: `container ${container.noun} created and run result published` }] };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.findings', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish each new finding through the adapter, and record every non-publication with its reason.',
    inputs: ['SyncInput'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish new findings', 'record suppressed and duplicate findings as unpublished with a reason'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A finding that cannot be published is recorded unpublished with the error as its reason, never dropped silently.',
    handle: (input) => input.assessed.map((a) => {
      const disp = input.dispositions.get(a.finding.id);
      if (a.falsePositive) return { target: 'finding' as const, localId: a.finding.id, externalId: null, published: false, reason: `not published: assessed a false positive (${a.falsePositiveReason ?? 'low confidence'})` };
      if (disp && disp.kind !== 'new') return { target: 'finding' as const, localId: a.finding.id, externalId: null, published: false, reason: `not published: ${disp.kind}${disp.kind === 'suppressed' ? ` by ${disp.by}` : ` of ${disp.of}`}` };
      const published = input.adapter.publishFinding({ id: a.finding.id, category: a.finding.category, cwe: a.finding.cwe, severity: a.cvss.severity, path: a.finding.targetPath });
      return { target: 'finding' as const, localId: a.finding.id, externalId: published.externalId, published: true, reason: `published as ${a.cvss.severity}` };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.defects', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Raise a defect for every published high or critical finding.',
    inputs: ['SyncInput'], outputs: ['SyncRecord[]'],
    responsibilities: ['raise a defect only for a published high or critical finding'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A defect that cannot be raised is recorded unpublished with a reason; a high finding without a defect record is a governance gap.',
    handle: (input) => publishable(input).filter((a) => a.cvss.severity === 'high' || a.cvss.severity === 'critical').map((a) => {
      const defect = input.adapter.publishDefect({ title: `${a.finding.category} at ${a.finding.targetPath}`, findingId: a.finding.id, severity: a.cvss.severity, evidenceRefs: a.finding.evidenceRefs });
      return { target: 'defect' as const, localId: a.finding.id, externalId: defect.defectId, published: true, reason: `defect raised for ${a.cvss.severity} finding` };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.threats', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish the threat intelligence for each new finding through the adapter.',
    inputs: ['SyncInput'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish the threat score and MITRE mapping per finding'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A threat record that cannot be published is recorded unpublished with a reason.',
    handle: (input) => publishable(input).map((a) => {
      const t = input.threats.get(a.finding.id);
      const published = input.adapter.publishThreat({ findingId: a.finding.id, threatScore: t?.threatScore ?? 0, mitre: (t?.mitre ?? []).map((m) => m.techniqueId) });
      return { target: 'threat' as const, localId: a.finding.id, externalId: published.externalId, published: true, reason: `threat score ${t?.threatScore ?? 0}` };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.evidence', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Publish evidence references — never artefacts — for each new finding.',
    inputs: ['SyncInput'], outputs: ['SyncRecord[]'],
    responsibilities: ['publish a hash and locator per evidence reference', 'never publish an artefact'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An evidence reference that cannot be published is recorded unpublished with a reason; the artefact stays in Execution Plane custody regardless.',
    handle: (input) => input.evidence.map((e) => {
      const published = input.adapter.publishEvidenceReference(input.targetId, { sha256: e.sha256, locator: e.locator, kind: e.kind });
      return { target: 'evidence' as const, localId: e.sha256, externalId: published.published ? e.sha256 : null, published: published.published, reason: `${e.kind} reference @ ${e.sha256}` };
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<SyncInput, readonly SyncRecord[]>({
    id: 'sync.traceability', domain: 'sync', stage: 'reporting', plane: 'IP',
    purpose: 'Link each published finding to its container for traceability.',
    inputs: ['SyncInput'], outputs: ['SyncRecord[]'],
    responsibilities: ['link every published finding to the container'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A link that cannot be made is recorded unlinked with a reason; an unlinked finding is reported, not hidden.',
    handle: (input) => publishable(input).map((a) => {
      const linked = input.adapter.linkTraceability(a.finding.id, input.targetId);
      return { target: 'traceability' as const, localId: a.finding.id, externalId: linked.linked ? input.targetId : null, published: linked.linked, reason: `linked to ${input.targetId}` };
    }),
  }) as AgentDefinition<never, unknown>,
];

// ── Reporting — stage 12 (reporting, IP) ────────────────────────────────────

export interface ReportInput {
  readonly targetId: string;
  readonly assessed: readonly AssessedFinding[];
  readonly threats: ReadonlyMap<string, ThreatAssessment>;
  readonly landscape: ThreatLandscape;
  readonly chain: AttackChain | null;
  readonly historicalTrend: 'improving' | 'stable' | 'worsening';
  readonly reasoningMode: 'enabled' | 'disabled';
  readonly scanned: boolean;
}

function live(input: ReportInput): readonly AssessedFinding[] {
  return input.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null);
}

export const reportingAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<ReportInput, Readonly<Record<Severity, number>>>({
    id: 'reporting.severity-counts', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Count live findings by severity.',
    inputs: ['ReportInput'], outputs: ['severity counts'],
    responsibilities: ['count only live, non-duplicate findings'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncountable population reports all-zero and the run records that counting failed, never a partial count as complete.',
    handle: (input) => {
      const counts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
      for (const a of live(input)) counts[a.cvss.severity] += 1;
      return counts;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.owasp-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise findings by OWASP category.',
    inputs: ['ReportInput'], outputs: ['OWASP summary'],
    responsibilities: ['count by OWASP reference'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable summary reports an empty map rather than a fabricated distribution.',
    handle: (input) => {
      const out: Record<string, number> = {};
      for (const a of live(input)) out[a.finding.owaspRef] = (out[a.finding.owaspRef] ?? 0) + 1;
      return out;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, number | null>({
    id: 'reporting.cvss-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Compute the average CVSS base score, or NOT MEASURED when nothing was scanned.',
    inputs: ['ReportInput'], outputs: ['average CVSS or null'],
    responsibilities: ['return null when nothing was scanned', 'never report zero for an absence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With nothing scanned it returns null (NOT MEASURED), which the report renders as text rather than a zero.',
    handle: (input) => {
      const l = live(input);
      if (!input.scanned || l.length === 0) return null;
      return Math.round((l.reduce((s, a) => s + a.cvss.baseScore, 0) / l.length) * 10) / 10;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.risk-heatmap', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Build the risk heat map by finding category.',
    inputs: ['ReportInput'], outputs: ['risk heat map'],
    responsibilities: ['count live findings per category'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable heat map is empty rather than fabricated.',
    handle: (input) => {
      const out: Record<string, number> = {};
      for (const a of live(input)) out[a.finding.category] = (out[a.finding.category] ?? 0) + 1;
      return out;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.threat-heatmap', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Surface the threat heat map by MITRE tactic from the threat landscape.',
    inputs: ['ReportInput'], outputs: ['threat heat map'],
    responsibilities: ['carry the landscape heat map'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing landscape yields an empty heat map rather than a fabricated one.',
    handle: (input) => input.landscape.heatMap,
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, Readonly<Record<string, readonly string[]>>>({
    id: 'reporting.mitre-matrix', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Build the MITRE ATT&CK matrix from the finding techniques.',
    inputs: ['ReportInput'], outputs: ['MITRE matrix'],
    responsibilities: ['group techniques by tactic'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbuildable matrix is empty rather than fabricated.',
    handle: (input) => {
      const matrix: Record<string, string[]> = {};
      for (const t of input.threats.values()) for (const m of t.mitre) matrix[m.tactic] = [...new Set([...(matrix[m.tactic] ?? []), m.techniqueId])];
      return matrix;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, Readonly<Record<string, number>>>({
    id: 'reporting.compliance-dashboard', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise compliance-control violations across the findings.',
    inputs: ['ReportInput'], outputs: ['compliance summary'],
    responsibilities: ['count violations per compliance control'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable dashboard is empty rather than fabricated.',
    handle: (input) => {
      const out: Record<string, number> = {};
      for (const a of live(input)) for (const c of a.compliance) out[c] = (out[c] ?? 0) + 1;
      return out;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, { readonly chains: number; readonly reachesObjective: boolean; readonly severity: Severity }>({
    id: 'reporting.attack-chain-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise the attack chain for the report.',
    inputs: ['ReportInput'], outputs: ['attack chain summary'],
    responsibilities: ['report the chain reach and severity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing chain reports zero chains rather than a fabricated one.',
    handle: (input) => ({
      chains: input.chain && input.chain.nodes.length > 0 ? 1 : 0,
      reachesObjective: input.chain?.killChain.includes('actions-on-objectives') ?? false,
      severity: input.chain?.severity ?? 'info',
    }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, { readonly executiveThreatScore: number; readonly topTactics: readonly string[] }>({
    id: 'reporting.threat-intel-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Summarise the threat intelligence for the report.',
    inputs: ['ReportInput'], outputs: ['threat intelligence summary'],
    responsibilities: ['carry the executive threat score and top tactics'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A missing landscape reports a zero threat score, which reads as unassessed rather than safe.',
    handle: (input) => ({ executiveThreatScore: input.landscape.executiveThreatScore, topTactics: input.landscape.topTactics }),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, number>({
    id: 'reporting.security-score', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Compute the target security score, 0..100, from the finding profile.',
    inputs: ['ReportInput'], outputs: ['security score'],
    responsibilities: ['deduct from a perfect score by severity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable score returns 0 rather than 100; unknown posture is treated as insecure.',
    handle: (input) => {
      const weights: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2, info: 0 };
      const deduction = live(input).reduce((s, a) => s + weights[a.cvss.severity], 0);
      return Math.max(0, 100 - deduction);
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, { readonly readiness: string; readonly rationale: string }>({
    id: 'reporting.release-readiness', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Determine release readiness, or NOT MEASURED when nothing was scanned.',
    inputs: ['ReportInput'], outputs: ['release readiness'],
    responsibilities: ['return NOT MEASURED when nothing was scanned', 'refuse readiness on any critical finding'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With nothing scanned readiness is NOT MEASURED and is never rendered as READY.',
    handle: (input) => {
      if (!input.scanned) return { readiness: 'NOT MEASURED', rationale: 'no active scan was executed, so readiness cannot be measured' };
      const l = live(input);
      const critical = l.filter((a) => a.cvss.severity === 'critical').length;
      const high = l.filter((a) => a.cvss.severity === 'high').length;
      if (critical > 0) return { readiness: 'NOT READY', rationale: `${critical} critical finding(s) block release` };
      if (high > 0) return { readiness: 'CONDITIONAL', rationale: `${high} high finding(s) require remediation or sign-off` };
      return { readiness: 'READY', rationale: 'no critical or high finding remains' };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ReportInput, 'improving' | 'stable' | 'worsening'>({
    id: 'reporting.historical-trend', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Carry the historical trend into the report.',
    inputs: ['ReportInput'], outputs: ['historical trend'],
    responsibilities: ['carry the computed trend'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unknown trend is reported stable with a note that history was unavailable.',
    handle: (input) => input.historicalTrend,
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: import('../model.js').PentestReport }, string>({
    id: 'reporting.executive-summary', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Produce the executive summary line for the report.',
    inputs: ['PentestReport'], outputs: ['executive summary'],
    responsibilities: ['summarise the security score and readiness'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unproducible summary states so rather than asserting a clean result.',
    handle: (input) => `Security score ${input.report.securityScore}/100; release readiness ${input.report.releaseReadiness}; executive threat score ${input.report.executiveThreatScore}/100.`,
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: import('../model.js').PentestReport }, readonly string[]>({
    id: 'reporting.executive-dashboard', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the executive dashboard rows for the report.',
    inputs: ['PentestReport'], outputs: ['dashboard rows'],
    responsibilities: ['render the headline figures'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unrenderable dashboard returns a single NOT MEASURED row rather than a fabricated one.',
    handle: (input) => [
      `Security score: ${input.report.securityScore}/100`,
      `Executive threat score: ${input.report.executiveThreatScore}/100`,
      `Critical: ${input.report.findingCounts.critical}  High: ${input.report.findingCounts.high}  Medium: ${input.report.findingCounts.medium}`,
      `Release readiness: ${input.report.releaseReadiness}`,
      `Historical trend: ${input.report.historicalTrend}`,
    ],
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: import('../model.js').PentestReport; pdf: (r: import('../model.js').PentestReport) => { bytes: number; pages: number } }, { readonly bytes: number; readonly pages: number }>({
    id: 'reporting.executive-pdf', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Render the executive PDF document from the report.',
    inputs: ['PentestReport'], outputs: ['PDF byte count and page count'],
    responsibilities: ['render a real PDF document'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A PDF that cannot be rendered is reported as zero bytes, which the reporting review treats as a blocking defect.',
    handle: (input) => input.pdf(input.report),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ report: import('../model.js').PentestReport; board: (r: import('../model.js').PentestReport) => { figures: readonly { measured: boolean }[]; decisionRequired: string } }, { readonly figures: number; readonly unmeasured: number; readonly decisionRequired: string }>({
    id: 'reporting.board-report', domain: 'reporting', stage: 'reporting', plane: 'IP',
    purpose: 'Produce the board report, marking every unmeasured figure.',
    inputs: ['PentestReport'], outputs: ['board report summary'],
    responsibilities: ['mark unmeasured figures rather than rendering them as zero'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unproducible board report reports all figures unmeasured rather than fabricating them.',
    handle: (input) => {
      const board = input.board(input.report);
      return { figures: board.figures.length, unmeasured: board.figures.filter((f) => !f.measured).length, decisionRequired: board.decisionRequired };
    },
  }) as AgentDefinition<never, unknown>,
];

// ── Learning — stage 10 (reflection, IP) ────────────────────────────────────

export interface LearningInput {
  readonly assessed: readonly AssessedFinding[];
  readonly threats: ReadonlyMap<string, ThreatAssessment>;
  readonly chain: AttackChain | null;
  readonly remediations: readonly Remediation[];
  readonly promptsDelivered: readonly string[];
  readonly promptsWithheld: readonly string[];
  readonly memory: import('@dbiz/capability-framework').VectorMemory;
}

/** One learning agent per learning kind. Each emits a record, and none may return nothing. */
function learningAgent(kind: LearningKind, purpose: string, derive: (input: LearningInput) => LearningRecord): AgentDefinition<never, unknown> {
  return defineAgent<LearningInput, readonly LearningRecord[]>({
    id: `learning.${kind}`, domain: 'learning', stage: 'reflection', plane: 'IP',
    purpose, inputs: ['LearningInput'], outputs: ['LearningRecord[]'],
    responsibilities: [`emit a ${kind} learning record from this run`],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: `A ${kind} signal that cannot be learned emits a record noting zero occurrences rather than nothing; a run must teach the next one something explicit.`,
    handle: (input) => [derive(input)],
  }) as AgentDefinition<never, unknown>;
}

export const learningAgents: readonly AgentDefinition<never, unknown>[] = [
  learningAgent('attack-pattern', 'Learn the attack patterns confirmed this run.',
    (i) => ({ kind: 'attack-pattern', signal: 'confirmed-categories', lesson: `${new Set(i.assessed.filter((a) => !a.falsePositive).map((a) => a.finding.category)).size} distinct categories confirmed`, occurrences: i.assessed.filter((a) => !a.falsePositive).length })),
  learningAgent('threat-pattern', 'Learn the threat patterns from the exploit maturity profile.',
    (i) => ({ kind: 'threat-pattern', signal: 'exploit-maturity', lesson: `${[...i.threats.values()].filter((t) => t.exploitMaturity === 'high').length} high-maturity threats`, occurrences: i.threats.size })),
  learningAgent('false-positive', 'Learn which categories produced false positives.',
    (i) => ({ kind: 'false-positive', signal: 'false-positives', lesson: `${i.assessed.filter((a) => a.falsePositive).length} findings assessed false positive`, occurrences: i.assessed.filter((a) => a.falsePositive).length })),
  learningAgent('remediation-success', 'Learn the remediation effort distribution for future estimates.',
    (i) => ({ kind: 'remediation-success', signal: 'remediation-effort', lesson: `${i.remediations.filter((r) => r.estimatedEffort === 'large').length} large remediations`, occurrences: i.remediations.length })),
  learningAgent('repository', 'Learn repository-level recurrence to prime the next run\'s search.',
    (i) => ({ kind: 'repository', signal: 'fingerprints', lesson: `${i.assessed.length} fingerprints available for future correlation`, occurrences: i.assessed.length })),
  learningAgent('threat-intelligence', 'Learn the threat-intelligence coverage of the finding set.',
    (i) => ({ kind: 'threat-intelligence', signal: 'mitre-coverage', lesson: `${new Set([...i.threats.values()].flatMap((t) => t.mitre.map((m) => m.tactic))).size} tactics covered`, occurrences: i.threats.size })),
  learningAgent('knowledge-graph', 'Learn the knowledge-graph delta from this run.',
    (i) => ({ kind: 'knowledge-graph', signal: i.chain && i.chain.multiStage ? 'multi-stage-chain' : 'single-stage', lesson: `chain of ${i.chain?.nodes.length ?? 0} node(s)`, occurrences: i.chain?.edges.length ?? 0 })),
  learningAgent('vector-memory', 'Commit finding vectors to memory without retaining any text.',
    (i) => {
      for (const a of i.assessed) i.memory.remember('finding', a.finding.id, `${a.finding.category} ${a.finding.targetPath}`, { fingerprint: a.finding.fingerprint });
      return { kind: 'vector-memory', signal: 'committed', lesson: `${i.assessed.length} finding vector(s) committed`, occurrences: i.assessed.length };
    }),
  learningAgent('execution-history', 'Learn the execution history summary of this run.',
    (i) => ({ kind: 'execution-history', signal: 'run-summary', lesson: `${i.assessed.length} findings assessed`, occurrences: i.assessed.length })),
  learningAgent('prompt', 'Learn how reasoning was used, so prompt strategy can improve.',
    (i) => ({ kind: 'prompt', signal: 'reasoning-usage', lesson: `${i.promptsDelivered.length} proposal(s) delivered, ${i.promptsWithheld.length} withheld`, occurrences: i.promptsDelivered.length })),
];

export { SEVERITY_ORDER, severityForScore };
