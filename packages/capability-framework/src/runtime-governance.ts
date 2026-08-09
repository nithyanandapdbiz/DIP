/**
 * Runtime execution governance — the v2.3 machinery.
 *
 * TRACEABILITY
 *   Architecture : 12-capability-orchestration.md · 10-evidence-flow-model.md
 *   ADR          : ADR-0066 · ADR-0022
 *   Criteria     : C-13.1 (no verdict without the measurement behind it)
 *                  C-12.12 (a result that performs no work carries a typed reason)
 *
 * THE DIFFERENCE BETWEEN v2.2 AND v2.3 IS WHAT A VERIFIER CAN SEE.
 * v2.2 declared, per constitutional step, that eighteen micro-phases would run. A gate can
 * read that declaration and confirm it is well-formed — and confirm nothing whatsoever
 * about whether the phases ran. This module produces the RECORD: every state transition,
 * with its timestamp, its evidence and its hash, appended to a chain that cannot be
 * rewritten without detection. A declaration is a promise; this is the receipt.
 *
 * ILLEGAL TRANSITIONS FAIL AT THE TRANSITION, NOT AT THE AUDIT.
 * `transition()` throws. A state machine that recorded an illegal move and let a later
 * gate object would already have executed whatever followed it, and the gate would be
 * reporting history rather than preventing it.
 *
 * TIME IS INJECTED, SO REPRODUCIBILITY IS REAL.
 * A ledger stamped from `Date.now()` cannot be replayed and compared: every run differs in
 * a field that means nothing. The clock is a constructor argument. Production passes the
 * wall clock; replay passes the recorded one; tests pass a counter — and the same inputs
 * then produce the same ledger, byte for byte, which is what "deterministic" has to mean
 * if it is going to be checkable.
 */
import { createHash } from 'node:crypto';

// ── The runtime state machine ───────────────────────────────────────────────

/**
 * The eighteen governed runtime states, in order.
 *
 * `AUTO_CORRECTED` is the one optional state: a step that needed no correction moves from
 * UNDER_REVIEW straight to VERIFIED. Every other state is mandatory and cannot be skipped.
 */
export const RUNTIME_STATES = [
  'REGISTERED',
  'DISCOVERED',
  'EVIDENCE_COLLECTED',
  'ANALYSED',
  'DEPENDENCIES_VERIFIED',
  'RISK_EVALUATED',
  'COVERAGE_ANALYSED',
  'GENERATED',
  'VALIDATED',
  'UNDER_REVIEW',
  'AUTO_CORRECTED',
  'VERIFIED',
  'QUALITY_GATE_PASSED',
  'CERTIFIED',
  'EVIDENCE_LOCKED',
  'METRICS_RECORDED',
  'GOVERNANCE_LOGGED',
  'COMPLETED',
] as const;

export type RuntimeState = (typeof RUNTIME_STATES)[number];

/** The only state a step may legitimately pass over. */
export const OPTIONAL_STATES: readonly RuntimeState[] = ['AUTO_CORRECTED'];

/**
 * The legal successors of each state.
 *
 * Derived from the ordered list rather than hand-written, so the table cannot drift from
 * the sequence it is supposed to encode. A state may advance to the next state, or skip a
 * next state that is optional.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<RuntimeState, readonly RuntimeState[]>> =
  Object.freeze(Object.fromEntries(RUNTIME_STATES.map((state, i) => {
    const successors: RuntimeState[] = [];
    const next = RUNTIME_STATES[i + 1];
    if (next) {
      successors.push(next);
      if (OPTIONAL_STATES.includes(next)) {
        const afterOptional = RUNTIME_STATES[i + 2];
        if (afterOptional) successors.push(afterOptional);
      }
    }
    return [state, Object.freeze(successors)];
  })) as Record<RuntimeState, readonly RuntimeState[]>);

export class RuntimeTransitionError extends Error {
  constructor(
    readonly stepId: string,
    readonly from: RuntimeState,
    readonly to: RuntimeState,
    reason: string,
  ) {
    super(`${stepId}: ${from} -> ${to} is not a legal runtime transition (${reason})`);
    this.name = 'RuntimeTransitionError';
  }
}

/** One recorded transition. Immutable, and what the verifier reads. */
export interface RuntimeTransition {
  readonly stepId: string;
  readonly from: RuntimeState | null;
  readonly to: RuntimeState;
  readonly at: number;
  readonly durationMs: number;
  /** Evidence references produced by the phase this transition completes. */
  readonly evidence: readonly string[];
  readonly detail: string;
}

/**
 * Execution proof for one micro-phase.
 *
 * Inputs and outputs are recorded as COUNTS AND IDENTIFIERS, never as payloads. A proof
 * that embedded what it observed would carry customer content into the audit trail, which
 * is the sovereignty boundary INV-1 exists to hold.
 */
export interface ExecutionProof {
  readonly stepId: string;
  readonly state: RuntimeState;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly evidence: readonly string[];
  readonly reviewerApprovals: readonly string[];
  readonly gateDecisions: readonly { readonly gate: string; readonly passed: boolean }[];
  readonly certification: 'PASS' | 'AUTO_CORRECTED' | 'BLOCKED_WITH_EVIDENCE' | 'IN_PROGRESS';
}

/** What a phase reports when it completes. */
export interface PhaseOutcome {
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly evidence?: readonly string[];
  readonly reviewerApprovals?: readonly string[];
  readonly gateDecisions?: readonly { readonly gate: string; readonly passed: boolean }[];
  readonly detail?: string;
}

/**
 * A governed runtime for one constitutional step.
 *
 * Construct it, advance it through the states, and it produces the transitions and proofs
 * a verifier needs. It cannot be advanced illegally and it cannot be rewound.
 */
export class StepRuntime {
  private current: RuntimeState | null = null;
  private readonly transitions: RuntimeTransition[] = [];
  private readonly proofs: ExecutionProof[] = [];
  private phaseStartedAt: number;

  constructor(
    readonly stepId: string,
    private readonly clock: () => number,
    private readonly onTransition?: (t: RuntimeTransition) => void,
  ) {
    this.phaseStartedAt = clock();
  }

  get state(): RuntimeState | null { return this.current; }
  get history(): readonly RuntimeTransition[] { return this.transitions; }
  get executionProofs(): readonly ExecutionProof[] { return this.proofs; }

  /** Whether `to` may follow the current state. Exposed so a caller can ask before acting. */
  canTransitionTo(to: RuntimeState): boolean {
    if (this.current === null) return to === 'REGISTERED';
    return LEGAL_TRANSITIONS[this.current].includes(to);
  }

  /**
   * Advance one state, recording the proof of the phase that just completed.
   *
   * Throws on an illegal move. That is deliberate: a machine that recorded the violation
   * and continued would let everything downstream run before anyone objected.
   */
  transition(to: RuntimeState, outcome: PhaseOutcome = {}): RuntimeTransition {
    if (!this.canTransitionTo(to)) {
      const reason = this.current === null
        ? 'a step runtime must begin at REGISTERED'
        : this.transitions.some((t) => t.to === to)
          ? 'a runtime state cannot be re-entered'
          : `legal successors are ${LEGAL_TRANSITIONS[this.current].join(', ') || 'none — the runtime is COMPLETED'}`;
      throw new RuntimeTransitionError(this.stepId, this.current ?? 'REGISTERED', to, reason);
    }

    const at = this.clock();
    const durationMs = at - this.phaseStartedAt;
    const transition: RuntimeTransition = Object.freeze({
      stepId: this.stepId,
      from: this.current,
      to,
      at,
      durationMs,
      evidence: Object.freeze([...(outcome.evidence ?? [])]),
      detail: outcome.detail ?? '',
    });

    this.proofs.push(Object.freeze({
      stepId: this.stepId,
      state: to,
      startedAt: this.phaseStartedAt,
      endedAt: at,
      durationMs,
      inputs: Object.freeze([...(outcome.inputs ?? [])]),
      outputs: Object.freeze([...(outcome.outputs ?? [])]),
      evidence: Object.freeze([...(outcome.evidence ?? [])]),
      reviewerApprovals: Object.freeze([...(outcome.reviewerApprovals ?? [])]),
      gateDecisions: Object.freeze([...(outcome.gateDecisions ?? [])]),
      certification: to === 'CERTIFIED' ? 'PASS'
        : to === 'AUTO_CORRECTED' ? 'AUTO_CORRECTED' : 'IN_PROGRESS',
    }));

    this.transitions.push(transition);
    this.current = to;
    this.phaseStartedAt = at;
    this.onTransition?.(transition);
    return transition;
  }

  /** Every mandatory state this runtime never entered. Empty means none was skipped. */
  skippedStates(): readonly RuntimeState[] {
    const entered = new Set(this.transitions.map((t) => t.to));
    return RUNTIME_STATES.filter((s) => !OPTIONAL_STATES.includes(s) && !entered.has(s));
  }

  get completed(): boolean { return this.current === 'COMPLETED'; }
}

// ── The immutable governance ledger ─────────────────────────────────────────

export interface LedgerRecord {
  readonly decisionId: string;
  readonly stepId: string;
  readonly runtimeState: RuntimeState;
  readonly at: number;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly evidence: readonly string[];
  readonly reviewerDecisions: readonly string[];
  readonly gateResults: readonly { readonly gate: string; readonly passed: boolean }[];
  readonly certification: ExecutionProof['certification'];
  readonly confidence: number;
  readonly version: string;
  /** Hash over this record AND its predecessor. Rewriting history breaks the chain. */
  readonly hash: string;
  readonly previousHash: string;
}

const GENESIS = '0'.repeat(64);

/**
 * An append-only, hash-chained record of every runtime decision.
 *
 * THE CHAIN IS THE POINT. Each record's hash covers the record and the hash before it, so
 * altering an entry invalidates every entry after it. `verify()` walks the chain and
 * reports the first break — an audit trail that can be edited silently is not an audit
 * trail, and this is what makes "complete audit reconstruction" a checkable claim.
 */
export class GovernanceLedger {
  private readonly records: LedgerRecord[] = [];
  private sealed = false;

  constructor(private readonly version: string, private readonly clock: () => number) {}

  get entries(): readonly LedgerRecord[] { return this.records; }
  get isSealed(): boolean { return this.sealed; }
  get head(): string { return this.records[this.records.length - 1]?.hash ?? GENESIS; }

  append(entry: Omit<LedgerRecord, 'decisionId' | 'at' | 'hash' | 'previousHash' | 'version'>): LedgerRecord {
    if (this.sealed) {
      throw new Error('the governance ledger is sealed; a decision taken after certification cannot be recorded, and an unrecorded decision is not taken');
    }
    const previousHash = this.head;
    const at = this.clock();
    const decisionId = `${entry.stepId}:${entry.runtimeState}:${this.records.length + 1}`;
    const body = JSON.stringify({ ...entry, decisionId, at, version: this.version, previousHash });
    const record: LedgerRecord = Object.freeze({
      ...entry,
      decisionId,
      at,
      version: this.version,
      previousHash,
      hash: createHash('sha256').update(body).digest('hex'),
    });
    this.records.push(record);
    return record;
  }

  /** Seal after certification. Nothing may be appended afterwards. */
  seal(): void { this.sealed = true; }

  /** Walk the chain. Reports the first break, or confirms the whole chain. */
  verify(): { readonly intact: boolean; readonly length: number; readonly brokenAt: string | null; readonly reason: string } {
    let previousHash = GENESIS;
    for (const r of this.records) {
      if (r.previousHash !== previousHash) {
        return { intact: false, length: this.records.length, brokenAt: r.decisionId, reason: 'the record does not chain to its predecessor' };
      }
      const { hash, ...rest } = r;
      const recomputed = createHash('sha256').update(JSON.stringify({
        stepId: rest.stepId, runtimeState: rest.runtimeState, inputs: rest.inputs, outputs: rest.outputs,
        evidence: rest.evidence, reviewerDecisions: rest.reviewerDecisions, gateResults: rest.gateResults,
        certification: rest.certification, confidence: rest.confidence,
        decisionId: rest.decisionId, at: rest.at, version: rest.version, previousHash: rest.previousHash,
      })).digest('hex');
      if (recomputed !== hash) {
        return { intact: false, length: this.records.length, brokenAt: r.decisionId, reason: 'the record hash does not match its content' };
      }
      previousHash = hash;
    }
    return { intact: true, length: this.records.length, brokenAt: null, reason: `${this.records.length} record(s) chain to the genesis hash` };
  }
}

// ── The runtime evidence graph ──────────────────────────────────────────────

/** The nineteen node kinds the evidence chain links, in order. */
export const EVIDENCE_NODE_KINDS = [
  'requirement', 'acceptance-criteria', 'business-rule', 'user-story', 'manual-test-case',
  'automation', 'feature', 'scenario', 'step-definition', 'page-object', 'locator',
  'execution', 'logs', 'screenshots', 'video', 'trace', 'bug', 'report', 'release',
] as const;

export type EvidenceNodeKind = (typeof EVIDENCE_NODE_KINDS)[number];

export interface EvidenceNode {
  readonly id: string;
  readonly kind: EvidenceNodeKind;
  readonly label: string;
}

export interface EvidenceEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface GraphValidation {
  readonly complete: boolean;
  readonly nodes: number;
  readonly edges: number;
  readonly brokenEdges: readonly string[];
  readonly orphans: readonly string[];
  readonly duplicates: readonly string[];
  readonly cycles: readonly string[];
  readonly reason: string;
}

/**
 * The immutable execution graph.
 *
 * SEALED AT CERTIFICATION, AND NOT BEFORE. A graph sealed early cannot record what
 * execution produced; a graph never sealed can be edited after the release it evidences
 * was certified. `seal()` is called by the certification path and refuses every mutation
 * afterwards.
 */
export class EvidenceGraph {
  private readonly nodes = new Map<string, EvidenceNode>();
  private readonly edges: EvidenceEdge[] = [];
  private readonly duplicateIds: string[] = [];
  private sealed = false;

  get isSealed(): boolean { return this.sealed; }
  get nodeCount(): number { return this.nodes.size; }
  get edgeCount(): number { return this.edges.length; }

  addNode(node: EvidenceNode): void {
    if (this.sealed) throw new Error('the evidence graph is sealed; it evidences a certified release and cannot be extended');
    // A duplicate id is RECORDED rather than overwritten: silently replacing a node would
    // lose the artefact whose id collided, which is the very thing the graph exists to track.
    if (this.nodes.has(node.id)) { this.duplicateIds.push(node.id); return; }
    this.nodes.set(node.id, Object.freeze(node));
  }

  addEdge(edge: EvidenceEdge): void {
    if (this.sealed) throw new Error('the evidence graph is sealed; it evidences a certified release and cannot be extended');
    this.edges.push(Object.freeze(edge));
  }

  seal(): void { this.sealed = true; }

  /** Every node, for a caller that needs to walk it. Frozen copies only. */
  allNodes(): readonly EvidenceNode[] { return [...this.nodes.values()]; }

  /**
   * Validate the graph.
   *
   * A broken edge (naming a node that does not exist), an orphan (a node no edge reaches),
   * a duplicate id or a cycle each fail certification — because each means the chain from
   * requirement to release cannot actually be walked.
   */
  validate(): GraphValidation {
    const brokenEdges = this.edges
      .filter((e) => !this.nodes.has(e.from) || !this.nodes.has(e.to))
      .map((e) => `${e.from} -> ${e.to}`);

    const touched = new Set(this.edges.flatMap((e) => [e.from, e.to]));
    const orphans = [...this.nodes.keys()].filter((id) => !touched.has(id));

    // Depth-first cycle detection over the edges that actually resolve.
    const adjacency = new Map<string, string[]>();
    for (const e of this.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) continue;
      adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
    }
    const cycles: string[] = [];
    const colour = new Map<string, 'grey' | 'black'>();
    const walk = (id: string, path: string[]): void => {
      colour.set(id, 'grey');
      for (const next of adjacency.get(id) ?? []) {
        if (colour.get(next) === 'grey') { cycles.push([...path, id, next].join(' -> ')); continue; }
        if (!colour.has(next)) walk(next, [...path, id]);
      }
      colour.set(id, 'black');
    };
    for (const id of this.nodes.keys()) if (!colour.has(id)) walk(id, []);

    const duplicates = [...new Set(this.duplicateIds)];
    const complete = brokenEdges.length === 0 && orphans.length === 0
      && duplicates.length === 0 && cycles.length === 0 && this.nodes.size > 0;

    return {
      complete,
      nodes: this.nodes.size,
      edges: this.edges.length,
      brokenEdges,
      orphans,
      duplicates,
      cycles,
      reason: complete
        ? `${this.nodes.size} node(s) and ${this.edges.length} edge(s) form a complete, acyclic chain`
        : this.nodes.size === 0
          ? 'the graph is empty; nothing was evidenced'
          : `${brokenEdges.length} broken edge(s), ${orphans.length} orphan(s), ${duplicates.length} duplicate(s), ${cycles.length} cycle(s)`,
    };
  }
}

// ── Deterministic replay ────────────────────────────────────────────────────

export interface ReplaySnapshot {
  readonly stepId: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly testData: Readonly<Record<string, string>>;
  readonly configuration: Readonly<Record<string, string>>;
  readonly browserContext: string | null;
  readonly logs: readonly string[];
  readonly transitions: readonly RuntimeTransition[];
  readonly hash: string;
}

/** Capture everything a deterministic replay needs. References only, never payloads. */
export function captureSnapshot(input: Omit<ReplaySnapshot, 'hash'>): ReplaySnapshot {
  const hash = createHash('sha256').update(JSON.stringify({
    stepId: input.stepId, environment: input.environment, testData: input.testData,
    configuration: input.configuration, browserContext: input.browserContext,
  })).digest('hex');
  return Object.freeze({ ...input, hash });
}

export interface ReplayComparison {
  readonly reproducible: boolean;
  readonly identicalInputs: boolean;
  readonly differences: readonly string[];
  readonly reason: string;
}

/**
 * Compare a replay against the run it reproduces.
 *
 * DIFFERENCES ARE ANALYSED BEFORE A DEFECT IS RAISED. A replay that diverges may have
 * found a real intermittency, or may have run against a different environment — and
 * raising a defect without distinguishing the two produces a bug report nobody can act on.
 * The comparison names what differed so that decision is made on evidence.
 */
export function compareReplay(original: ReplaySnapshot, replay: ReplaySnapshot): ReplayComparison {
  const differences: string[] = [];
  if (original.hash !== replay.hash) differences.push('the replay ran against different inputs, so a divergence is not evidence of intermittency');

  const originalStates = original.transitions.map((t) => t.to).join(',');
  const replayStates = replay.transitions.map((t) => t.to).join(',');
  if (originalStates !== replayStates) {
    differences.push(`state sequence diverged: ${originalStates || 'none'} vs ${replayStates || 'none'}`);
  }

  const originalEvidence = new Set(original.transitions.flatMap((t) => t.evidence));
  const replayEvidence = new Set(replay.transitions.flatMap((t) => t.evidence));
  for (const e of originalEvidence) if (!replayEvidence.has(e)) differences.push(`evidence "${e}" was not reproduced`);

  const identicalInputs = original.hash === replay.hash;
  return {
    reproducible: identicalInputs && differences.length === 0,
    identicalInputs,
    differences,
    reason: differences.length === 0
      ? 'the replay reproduced the original state sequence and evidence set'
      : `${differences.length} difference(s) require analysis before a defect is raised`,
  };
}

// ── The step runtime registry ───────────────────────────────────────────────

export interface RuntimeGovernanceReport {
  readonly steps: number;
  readonly completed: number;
  readonly transitions: number;
  readonly proofs: number;
  readonly skipped: readonly string[];
  readonly incomplete: readonly string[];
  readonly ledger: ReturnType<GovernanceLedger['verify']>;
  readonly graph: GraphValidation;
  readonly governed: boolean;
  readonly reason: string;
}

/**
 * Governs a whole run: one `StepRuntime` per constitutional step, one ledger, one graph.
 *
 * The report it produces is what the Release Certification Board reads to answer the only
 * question v2.3 adds — not "was the workflow defined correctly" but "did it actually run".
 */
export class RuntimeGovernor {
  private readonly runtimes = new Map<string, StepRuntime>();
  readonly ledger: GovernanceLedger;
  readonly graph = new EvidenceGraph();

  constructor(
    version: string,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.ledger = new GovernanceLedger(version, clock);
  }

  /** Begin governing a step. Transitions are recorded to the ledger as they happen. */
  register(stepId: string): StepRuntime {
    const existing = this.runtimes.get(stepId);
    if (existing) return existing;
    const runtime = new StepRuntime(stepId, this.clock, (t) => {
      this.ledger.append({
        stepId: t.stepId,
        runtimeState: t.to,
        inputs: [],
        outputs: [],
        evidence: t.evidence,
        reviewerDecisions: [],
        gateResults: [],
        certification: t.to === 'CERTIFIED' ? 'PASS' : t.to === 'AUTO_CORRECTED' ? 'AUTO_CORRECTED' : 'IN_PROGRESS',
        confidence: 1,
      });
    });
    this.runtimes.set(stepId, runtime);
    runtime.transition('REGISTERED', { detail: `${stepId} entered runtime governance` });
    return runtime;
  }

  runtimeFor(stepId: string): StepRuntime | null { return this.runtimes.get(stepId) ?? null; }
  get governedSteps(): readonly string[] { return [...this.runtimes.keys()]; }

  /** Seal the ledger and the graph. Called once, at certification. */
  seal(): void { this.ledger.seal(); this.graph.seal(); }

  report(): RuntimeGovernanceReport {
    const runtimes = [...this.runtimes.values()];
    const skipped = runtimes.flatMap((r) => r.skippedStates().map((s) => `${r.stepId}:${s}`));
    const incomplete = runtimes.filter((r) => !r.completed).map((r) => r.stepId);
    const ledger = this.ledger.verify();
    const graph = this.graph.validate();

    const governed = runtimes.length > 0 && skipped.length === 0
      && incomplete.length === 0 && ledger.intact && graph.complete;

    return {
      steps: runtimes.length,
      completed: runtimes.filter((r) => r.completed).length,
      transitions: runtimes.reduce((n, r) => n + r.history.length, 0),
      proofs: runtimes.reduce((n, r) => n + r.executionProofs.length, 0),
      skipped,
      incomplete,
      ledger,
      graph,
      governed,
      reason: governed
        ? `${runtimes.length} step(s) completed the eighteen-state runtime; ledger and graph intact`
        : runtimes.length === 0
          ? 'no step entered runtime governance, so nothing can be certified as having run'
          : `${incomplete.length} incomplete step(s), ${skipped.length} skipped state(s); `
            + `ledger ${ledger.intact ? 'intact' : ledger.reason}; graph ${graph.complete ? 'complete' : graph.reason}`,
    };
  }
}
