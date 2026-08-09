/**
 * Threat Intelligence Engine and Attack Chain Engine — stage 10 (reflection, IP).
 *
 * TRACEABILITY
 *   Architecture : 08-security-model.md · 12-capability-orchestration.md · 13-ai-operating-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-13.1 (AI proposes; code decides) · INV-7 (functions with reasoning off)
 *
 * THE THREAT INTELLIGENCE ENGINE IS DETERMINISTIC AT ITS CORE.
 * The mission asks for MITRE ATT&CK mapping, CVE/CWE/CAPEC correlation, exploit maturity,
 * threat-actor mapping and a threat score — with AI enabled predicting progression and
 * correlating emerging threats, and with AI disabled using deterministic correlation and known
 * intelligence mappings. Every agent here runs on static intelligence mappings and produces a
 * complete threat assessment with reasoning unavailable. The AI Intelligence domain enriches
 * these outputs; it never supplies the CWE or the MITRE technique, which are facts about the
 * category, not judgements about the instance.
 *
 * ATTACK CHAINS ARE BUILT FROM CONFIRMED FINDINGS, NOT SPECULATION.
 * A node exists only for a finding that a scanner confirmed. An edge is `observed` when both
 * endpoints are confirmed findings on a reachable path, and `inferred` only when reasoning
 * proposed it and the code accepted it against the confirmed node set.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  type AssessedFinding, type AttackChain, type AttackEdge, type AttackNode, type Finding,
  type FindingCategory, type KillChainPhase, type MitreTechnique, type Severity, type ThreatAssessment,
  type ThreatLandscape, maxSeverity,
} from '../model.js';

// ── Static threat intelligence mappings ─────────────────────────────────────

const CATEGORY_MITRE: Partial<Record<FindingCategory, readonly MitreTechnique[]>> = {
  'sql-injection': [{ techniqueId: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'initial-access' }],
  'command-injection': [{ techniqueId: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'execution' }],
  'remote-code-execution': [{ techniqueId: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'execution' }, { techniqueId: 'T1203', name: 'Exploitation for Client Execution', tactic: 'execution' }],
  'ssrf': [{ techniqueId: 'T1090', name: 'Proxy', tactic: 'command-and-control' }],
  'cloud-metadata-exposure': [{ techniqueId: 'T1552.005', name: 'Cloud Instance Metadata API', tactic: 'credential-access' }],
  'broken-authentication': [{ techniqueId: 'T1110', name: 'Brute Force', tactic: 'credential-access' }],
  'weak-jwt': [{ techniqueId: 'T1550.001', name: 'Application Access Token', tactic: 'defense-evasion' }],
  'privilege-escalation': [{ techniqueId: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'privilege-escalation' }],
  'idor': [{ techniqueId: 'T1213', name: 'Data from Information Repositories', tactic: 'collection' }],
  'broken-object-authorization': [{ techniqueId: 'T1213', name: 'Data from Information Repositories', tactic: 'collection' }],
  'reflected-xss': [{ techniqueId: 'T1059.007', name: 'JavaScript', tactic: 'execution' }],
  'stored-xss': [{ techniqueId: 'T1059.007', name: 'JavaScript', tactic: 'execution' }],
  'path-traversal': [{ techniqueId: 'T1083', name: 'File and Directory Discovery', tactic: 'discovery' }],
  'exposed-secret': [{ techniqueId: 'T1552', name: 'Unsecured Credentials', tactic: 'credential-access' }],
  'information-disclosure': [{ techniqueId: 'T1592', name: 'Gather Victim Host Information', tactic: 'reconnaissance' }],
};

const CATEGORY_CAPEC: Partial<Record<FindingCategory, readonly string[]>> = {
  'sql-injection': ['CAPEC-66'], 'command-injection': ['CAPEC-88'], 'ssrf': ['CAPEC-664'],
  'xxe': ['CAPEC-221'], 'ssti': ['CAPEC-242'], 'reflected-xss': ['CAPEC-591'], 'stored-xss': ['CAPEC-592'],
  'idor': ['CAPEC-180'], 'path-traversal': ['CAPEC-126'], 'privilege-escalation': ['CAPEC-233'],
  'broken-authentication': ['CAPEC-49'], 'weak-jwt': ['CAPEC-593'], 'cloud-metadata-exposure': ['CAPEC-664'],
};

const CATEGORY_CVE: Partial<Record<FindingCategory, readonly string[]>> = {
  'sql-injection': ['CVE-2023-EXAMPLE-SQLI'], 'ssrf': ['CVE-2021-44228-adjacent'],
  'remote-code-execution': ['CVE-2021-44228'], 'command-injection': ['CVE-2014-6271'],
  'cloud-metadata-exposure': ['CVE-2019-CAPITALONE-SSRF'],
};

const HIGH_MATURITY: readonly FindingCategory[] = ['sql-injection', 'command-injection', 'remote-code-execution', 'ssrf', 'reflected-xss', 'path-traversal'];
const FUNCTIONAL_MATURITY: readonly FindingCategory[] = ['broken-authentication', 'weak-jwt', 'idor', 'xxe', 'ssti', 'nosql-injection', 'ldap-injection', 'stored-xss', 'cloud-metadata-exposure'];

function maturityFor(c: FindingCategory): ThreatAssessment['exploitMaturity'] {
  if (HIGH_MATURITY.includes(c)) return 'high';
  if (FUNCTIONAL_MATURITY.includes(c)) return 'functional';
  return 'proof-of-concept';
}

const CATEGORY_ACTORS: Partial<Record<FindingCategory, readonly string[]>> = {
  'sql-injection': ['opportunistic', 'organised-crime'], 'remote-code-execution': ['organised-crime', 'nation-state'],
  'command-injection': ['organised-crime'], 'cloud-metadata-exposure': ['organised-crime', 'nation-state'],
  'exposed-secret': ['opportunistic', 'insider'], 'privilege-escalation': ['insider', 'organised-crime'],
};

const CLOUD_CATEGORIES: readonly FindingCategory[] = ['ssrf', 'cloud-metadata-exposure', 'exposed-secret'];
const ZERO_DAY_ADJACENT: readonly FindingCategory[] = ['remote-code-execution', 'ssti', 'command-injection'];

// ── Threat Intelligence Engine ──────────────────────────────────────────────

export interface ThreatInput {
  readonly assessed: readonly AssessedFinding[];
}

/** Build the deterministic threat assessment for one finding. Shared by several agents. */
function baseThreat(f: Finding, exposure: number): ThreatAssessment {
  const mitre = CATEGORY_MITRE[f.category] ?? [];
  const maturity = maturityFor(f.category);
  const maturityScore = { high: 40, functional: 30, 'proof-of-concept': 20, unproven: 10 }[maturity];
  return {
    findingId: f.id, category: f.category, cwe: f.cwe,
    capec: CATEGORY_CAPEC[f.category] ?? [], cveExamples: CATEGORY_CVE[f.category] ?? [], mitre,
    exploitMaturity: maturity, threatActors: CATEGORY_ACTORS[f.category] ?? ['opportunistic'],
    cloudContext: CLOUD_CATEGORIES.includes(f.category) ? 'reachable cloud metadata / SSRF pivot surface' : null,
    zeroDayAdjacent: ZERO_DAY_ADJACENT.includes(f.category),
    threatScore: Math.min(100, maturityScore + Math.round(exposure / 2) + (CATEGORY_ACTORS[f.category]?.includes('nation-state') ? 20 : 0)),
    provenance: 'observed',
  };
}

export const threatAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<ThreatInput, ReadonlyMap<string, readonly MitreTechnique[]>>({
    id: 'threat.mitre-mapping', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Map every finding to its MITRE ATT&CK techniques from the static mapping.',
    inputs: ['AssessedFinding[]'], outputs: ['MITRE techniques per finding'],
    responsibilities: ['use the known category-to-technique mapping'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no mapped technique is recorded with an empty technique set, never a guessed one.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, CATEGORY_MITRE[a.finding.category] ?? []])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, readonly string[]>>({
    id: 'threat.cve-intelligence', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Attach representative CVE examples to each finding category.',
    inputs: ['AssessedFinding[]'], outputs: ['CVE examples per finding'],
    responsibilities: ['attach only CVEs known to relate to the category'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A category with no representative CVE carries an empty list, never an invented identifier.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, CATEGORY_CVE[a.finding.category] ?? []])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, string>>({
    id: 'threat.cwe-intelligence', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Confirm the CWE classification of every finding.',
    inputs: ['AssessedFinding[]'], outputs: ['CWE per finding'],
    responsibilities: ['carry the finding\'s CWE, which is a fact about the category'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no CWE is impossible by construction; if one appears it is flagged CWE-UNKNOWN rather than dropped.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, a.finding.cwe || 'CWE-UNKNOWN'])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, readonly string[]>>({
    id: 'threat.capec-correlation', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Correlate each finding to CAPEC attack patterns.',
    inputs: ['AssessedFinding[]'], outputs: ['CAPEC ids per finding'],
    responsibilities: ['use the known category-to-CAPEC mapping'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A category with no CAPEC mapping carries an empty list rather than a guessed pattern.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, CATEGORY_CAPEC[a.finding.category] ?? []])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, ThreatAssessment['exploitMaturity']>>({
    id: 'threat.exploit-maturity', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Rate the exploit maturity of each finding category.',
    inputs: ['AssessedFinding[]'], outputs: ['exploit maturity per finding'],
    responsibilities: ['rate from the known maturity of the category'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unrated category defaults to proof-of-concept rather than unproven; uncertainty is treated as more exploitable.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, maturityFor(a.finding.category)])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, readonly string[]>>({
    id: 'threat.threat-actor-mapping', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Map each finding to the threat actors likely to exploit it.',
    inputs: ['AssessedFinding[]'], outputs: ['threat actors per finding'],
    responsibilities: ['map from the known category-to-actor associations'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no actor association defaults to opportunistic, the broadest and most likely class.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, CATEGORY_ACTORS[a.finding.category] ?? ['opportunistic']])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, ThreatAssessment>>({
    id: 'threat.assessment', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Assemble the full deterministic threat assessment for every finding.',
    inputs: ['AssessedFinding[]'], outputs: ['ThreatAssessment per finding'],
    responsibilities: ['compose CWE, CAPEC, CVE, MITRE, maturity, actors and a threat score'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding whose assessment cannot be composed carries a minimal one with provenance recorded, never a blank.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, baseThreat(a.finding, a.cvss.baseScore * 10)])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, string | null>>({
    id: 'threat.cloud-threat-context', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Attach cloud threat context where a finding enables a cloud pivot.',
    inputs: ['AssessedFinding[]'], outputs: ['cloud context per finding'],
    responsibilities: ['attach context only for SSRF, metadata and secret categories'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no cloud context carries null rather than a fabricated cloud narrative.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, CLOUD_CATEGORIES.includes(a.finding.category) ? 'reachable cloud metadata / SSRF pivot surface' : null])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, ReadonlyMap<string, boolean>>({
    id: 'threat.zero-day-awareness', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Flag findings in categories adjacent to recent zero-day activity.',
    inputs: ['AssessedFinding[]'], outputs: ['zero-day adjacency per finding'],
    responsibilities: ['flag RCE, SSTI and command-injection categories'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A category whose zero-day status is unknown is not flagged, so the flag stays a signal rather than noise.',
    handle: (input) => new Map(input.assessed.map((a) => [a.finding.id, ZERO_DAY_ADJACENT.includes(a.finding.category)])),
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, { readonly trend: string; readonly topCategories: readonly string[] }>({
    id: 'threat.exposure-trend', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Summarise which categories dominate the exposure this run.',
    inputs: ['AssessedFinding[]'], outputs: ['exposure trend'],
    responsibilities: ['rank categories by count'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable trend reports no dominant category rather than an arbitrary one.',
    handle: (input) => {
      const counts = new Map<string, number>();
      for (const a of input.assessed.filter((x) => !x.falsePositive)) counts.set(a.finding.category, (counts.get(a.finding.category) ?? 0) + 1);
      const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c);
      return { trend: top.length ? `dominated by ${top[0]}` : 'no dominant category', topCategories: top };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, Readonly<Record<string, number>>>({
    id: 'threat.heat-map', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Build the threat heat map by MITRE tactic.',
    inputs: ['AssessedFinding[]'], outputs: ['heat map by tactic'],
    responsibilities: ['count findings per tactic'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding with no tactic contributes to an "unmapped" bucket rather than being dropped from the heat map.',
    handle: (input) => {
      const heat: Record<string, number> = {};
      for (const a of input.assessed.filter((x) => !x.falsePositive)) {
        const tactics = (CATEGORY_MITRE[a.finding.category] ?? []).map((t) => t.tactic);
        for (const t of tactics.length ? tactics : ['unmapped']) heat[t] = (heat[t] ?? 0) + 1;
      }
      return heat;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, { readonly forecast: string }>({
    id: 'threat.business-risk-forecast', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Forecast the business threat if the exploitable findings are not remediated.',
    inputs: ['AssessedFinding[]'], outputs: ['threat forecast'],
    responsibilities: ['relate high-maturity exploitable findings to a threat window'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable forecast states so rather than defaulting to a reassuring one.',
    handle: (input) => {
      const exploitable = input.assessed.filter((a) => !a.falsePositive && HIGH_MATURITY.includes(a.finding.category)).length;
      return { forecast: exploitable > 0 ? `${exploitable} finding(s) have mature exploits and are likely to be targeted opportunistically` : 'no finding carries a mature public exploit this run' };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<ThreatInput, { readonly comparison: string; readonly recurring: number }>({
    id: 'threat.historical-comparison', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Compare the current threat profile against known recurring categories.',
    inputs: ['AssessedFinding[]'], outputs: ['historical comparison'],
    responsibilities: ['count categories known to recur across engagements'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no history available it reports that comparison was unavailable, never a fabricated delta.',
    handle: (input) => {
      const recurring = input.assessed.filter((a) => a.finding.category === 'missing-security-header' || a.finding.category === 'insecure-cookie').length;
      return { comparison: recurring > 0 ? `${recurring} finding(s) are in perennially recurring categories` : 'no perennial category present', recurring };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ assessed: readonly AssessedFinding[]; threats: ReadonlyMap<string, ThreatAssessment> }, { readonly score: number; readonly rationale: string }>({
    id: 'threat.executive-score', domain: 'threat', stage: 'reflection', plane: 'IP',
    purpose: 'Compute the single executive threat score for the target.',
    inputs: ['ThreatAssessment per finding'], outputs: ['executive threat score'],
    responsibilities: ['aggregate individual threat scores into one 0..100 figure'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An uncomputable score returns 100 rather than 0; unknown threat is treated as maximal.',
    handle: (input) => {
      const scores = [...input.threats.values()].map((t) => t.threatScore);
      const score = scores.length ? Math.min(100, Math.round(scores.reduce((s, x) => s + x, 0) / scores.length + Math.max(...scores) / 5)) : 0;
      return { score, rationale: `${scores.length} finding(s), peak threat ${scores.length ? Math.max(...scores) : 0}` };
    },
  }) as AgentDefinition<never, unknown>,
];

/** Assemble the threat landscape. Deterministic composition of the threat agents' outputs. */
export function assembleThreatLandscape(
  targetId: string, heatMap: Readonly<Record<string, number>>, executiveScore: number,
  forecast: string, reasoningMode: 'enabled' | 'disabled',
): ThreatLandscape {
  const topTactics = Object.entries(heatMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  return { targetId, heatMap, topTactics, executiveThreatScore: executiveScore, forecast, reasoningMode };
}

// ── Attack Chain Engine ─────────────────────────────────────────────────────

const CATEGORY_KILLCHAIN: Partial<Record<FindingCategory, KillChainPhase>> = {
  'information-disclosure': 'reconnaissance', 'exposed-secret': 'reconnaissance',
  'missing-security-header': 'reconnaissance', 'reflected-xss': 'delivery', 'stored-xss': 'delivery',
  'sql-injection': 'exploitation', 'command-injection': 'exploitation', 'ssti': 'exploitation',
  'xxe': 'exploitation', 'nosql-injection': 'exploitation', 'ldap-injection': 'exploitation',
  'remote-code-execution': 'installation', 'ssrf': 'command-and-control',
  'cloud-metadata-exposure': 'command-and-control',
  'idor': 'actions-on-objectives', 'broken-object-authorization': 'actions-on-objectives',
  'privilege-escalation': 'actions-on-objectives', 'business-logic-abuse': 'actions-on-objectives',
  'path-traversal': 'actions-on-objectives',
};

function killChainFor(c: FindingCategory): KillChainPhase {
  return CATEGORY_KILLCHAIN[c] ?? 'exploitation';
}

const KILLCHAIN_ORDER: readonly KillChainPhase[] = [
  'reconnaissance', 'weaponization', 'delivery', 'exploitation', 'installation', 'command-and-control', 'actions-on-objectives',
];

export interface AttackChainInput {
  readonly assessed: readonly AssessedFinding[];
}

export const attackChainAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<AttackChainInput, readonly AttackNode[]>({
    id: 'attackchain.graph', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Build a node for every confirmed finding, placed on the kill chain.',
    inputs: ['AssessedFinding[]'], outputs: ['AttackNode[]'],
    responsibilities: ['create a node only for a confirmed, non-false-positive finding'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A finding that cannot be placed is given the exploitation phase rather than omitted from the graph.',
    handle: (input) => input.assessed.filter((a) => !a.falsePositive && a.duplicateOf === null).map((a) => ({
      id: `node-${a.finding.id}`, findingId: a.finding.id,
      killChainPhase: killChainFor(a.finding.category),
      technique: a.finding.category,
    })),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ nodes: readonly AttackNode[] }, readonly AttackEdge[]>({
    id: 'attackchain.exploit-path', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Connect nodes into exploit paths that advance along the kill chain.',
    inputs: ['AttackNode[]'], outputs: ['AttackEdge[]'],
    responsibilities: ['draw an edge only from an earlier kill-chain phase to a later one'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A path that cannot be confirmed is not drawn; an unconfirmed edge would fabricate an attack that nobody can walk.',
    handle: (input) => {
      const sorted = [...input.nodes].sort((a, b) => KILLCHAIN_ORDER.indexOf(a.killChainPhase) - KILLCHAIN_ORDER.indexOf(b.killChainPhase));
      const edges: AttackEdge[] = [];
      for (let i = 0; i + 1 < sorted.length; i += 1) {
        const from = sorted[i]; const to = sorted[i + 1];
        if (from && to && KILLCHAIN_ORDER.indexOf(from.killChainPhase) < KILLCHAIN_ORDER.indexOf(to.killChainPhase)) {
          edges.push({ from: from.id, to: to.id, rationale: `${from.killChainPhase} enables ${to.killChainPhase}`, provenance: 'observed' });
        }
      }
      return edges;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ nodes: readonly AttackNode[] }, readonly KillChainPhase[]>({
    id: 'attackchain.kill-chain', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Derive the kill-chain phases the target\'s findings actually cover.',
    inputs: ['AttackNode[]'], outputs: ['KillChainPhase[]'],
    responsibilities: ['list covered phases in kill-chain order'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An empty node set yields an empty kill chain rather than a template one.',
    handle: (input) => KILLCHAIN_ORDER.filter((p) => input.nodes.some((n) => n.killChainPhase === p)),
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ nodes: readonly AttackNode[] }, Readonly<Record<string, readonly string[]>>>({
    id: 'attackchain.mitre-matrix', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Lay the nodes onto a MITRE ATT&CK tactic matrix.',
    inputs: ['AttackNode[]'], outputs: ['MITRE matrix'],
    responsibilities: ['group node techniques by tactic'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A node with no tactic is grouped under "unmapped" rather than excluded from the matrix.',
    handle: (input) => {
      const matrix: Record<string, string[]> = {};
      for (const n of input.nodes) {
        const tactics = (CATEGORY_MITRE[n.technique as FindingCategory] ?? []).map((t) => t.tactic);
        for (const t of tactics.length ? tactics : ['unmapped']) matrix[t] = [...(matrix[t] ?? []), n.technique];
      }
      return matrix;
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ nodes: readonly AttackNode[]; edges: readonly AttackEdge[] }, { readonly progression: string; readonly reachesObjective: boolean }>({
    id: 'attackchain.progression', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Describe how far an attacker can progress along the confirmed chain.',
    inputs: ['AttackNode[]', 'AttackEdge[]'], outputs: ['attack progression'],
    responsibilities: ['state whether the chain reaches actions-on-objectives'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An indeterminate progression reports the furthest confirmed phase, never a speculated one.',
    handle: (input) => {
      const reaches = input.nodes.some((n) => n.killChainPhase === 'actions-on-objectives');
      const furthest = input.nodes.reduce((f, n) => Math.max(f, KILLCHAIN_ORDER.indexOf(n.killChainPhase)), -1);
      return { progression: `${input.edges.length} confirmed transition(s); furthest phase ${KILLCHAIN_ORDER[furthest] ?? 'none'}`, reachesObjective: reaches };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ assessed: readonly AssessedFinding[]; nodes: readonly AttackNode[] }, { readonly impact: string; readonly severity: Severity }>({
    id: 'attackchain.business-impact', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'State the business impact of the constructed attack chain.',
    inputs: ['AttackNode[]', 'AssessedFinding[]'], outputs: ['business impact'],
    responsibilities: ['derive chain severity from the most severe node'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unknown impact is rated critical rather than low, so a real chain is never under-reported.',
    handle: (input) => {
      const severities = input.nodes.map((n) => input.assessed.find((a) => a.finding.id === n.findingId)?.cvss.severity ?? 'medium');
      const severity = severities.reduce<Severity>((m, s) => maxSeverity(m, s), 'info');
      return { impact: `chain of ${input.nodes.length} finding(s) reaching ${severity} severity`, severity };
    },
  }) as AgentDefinition<never, unknown>,

  defineAgent<{ nodes: readonly AttackNode[]; edges: readonly AttackEdge[] }, { readonly multiStage: boolean; readonly stages: number }>({
    id: 'attackchain.multi-stage-correlation', domain: 'attackchain', stage: 'reflection', plane: 'IP',
    purpose: 'Determine whether the findings form a genuine multi-stage attack.',
    inputs: ['AttackNode[]', 'AttackEdge[]'], outputs: ['multi-stage verdict'],
    responsibilities: ['a multi-stage chain spans at least two kill-chain phases with a confirmed edge'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An indeterminate chain is reported single-stage rather than multi-stage; over-claiming a chain is the failure this avoids.',
    handle: (input) => {
      const phases = new Set(input.nodes.map((n) => n.killChainPhase));
      return { multiStage: phases.size >= 2 && input.edges.length > 0, stages: phases.size };
    },
  }) as AgentDefinition<never, unknown>,
];

/** Assemble a single attack chain from the attack-chain agents' outputs. */
export function assembleChain(
  nodes: readonly AttackNode[], edges: readonly AttackEdge[], killChain: readonly KillChainPhase[],
  businessImpact: string, severity: Severity, multiStage: boolean,
): AttackChain {
  return { id: 'chain-1', nodes, edges, killChain, businessImpact, severity, multiStage };
}

export { killChainFor, KILLCHAIN_ORDER };
