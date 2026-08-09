/**
 * The Predictive Performance Layer agents (Increment C): twin and simulation domains — both in the
 * reflection stage (with one accuracy agent in reporting), both Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md §2 · 24-platform-intelligence-model.md
 *   ADR          : ADR-0026
 *   Criteria     : C-13.1 (AI proposes; code decides) · INV-7 · C-12.12 (typed NOT-APPLICABLE)
 *
 * THE TWIN NEVER EXECUTES LOAD. Every agent here is deterministic; the single reasoning agent
 * (simulation narrative) only phrases the summary and has a `nonAiBehaviour`. Prediction stands
 * with reasoning unavailable (INV-7).
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import {
  buildTwin, simulateScenario, resourceForecast, seasonalForecast, baselineTiers, worstOf, riskGrade,
  scenarioTransform, type TwinInput,
} from './twin.js';
import {
  type Baseline, type DigitalTwin, type PerformanceThreshold, type PredictionAccuracy, type PredictiveCertification,
  type ReleaseImpact, type ResourceForecast, type ScenarioKind, type SeasonalForecast, type SeasonalPeriod,
  type SimulationResult, type SimulationScenario, type Verdict,
} from '../model.js';

function def<I, O>(
  d: Omit<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'> &
    Partial<Pick<AgentDefinition<I, O>, 'retry' | 'telemetry' | 'auditEvents'>>,
): AgentDefinition<never, unknown> {
  return defineAgent<I, O>(d) as unknown as AgentDefinition<never, unknown>;
}

// ── Domain 1: twin (reflection, IP) ─────────────────────────────────────────

export const twinAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'twin.model', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Build the Digital Twin — a virtual performance model that predicts and never executes load.',
    inputs: ['TwinInput'], outputs: ['DigitalTwin'], responsibilities: ['synthesise a baseline model from topology, workload and history'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no history the twin uses the default resource baseline and reports lower confidence — never a fabricated one.',
    handle: (input: { twinInput: TwinInput }) => buildTwin(input.twinInput),
  }),
  def({
    id: 'twin.topology-model', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Model the application topology within the twin.',
    inputs: ['DigitalTwin'], outputs: ['topology'], responsibilities: ['model topology'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A twin with no node reports an empty topology rather than an assumed one.',
    handle: (input: { twin: DigitalTwin }) => ({ nodeCount: input.twin.nodeCount, transactions: input.twin.transactionCount }),
  }),
  def({
    id: 'twin.infrastructure-model', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Model the infrastructure resources and their baseline saturation within the twin.',
    inputs: ['DigitalTwin'], outputs: ['resources'], responsibilities: ['model infrastructure'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A resource with no baseline uses the conservative default rather than being omitted.',
    handle: (input: { twin: DigitalTwin }) => input.twin.resources,
  }),
  def({
    id: 'twin.dependency-model', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Model the service and external dependencies within the twin.',
    inputs: ['DigitalTwin'], outputs: ['dependencies'], responsibilities: ['model dependencies'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An undiscovered dependency is reported absent rather than assumed present.',
    handle: (input: { twin: DigitalTwin }) => input.twin.dependencies,
  }),
  def({
    id: 'twin.capacity-timeline', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Forecast per-resource capacity, headroom and exhaustion from the twin.',
    inputs: ['DigitalTwin'], outputs: ['ResourceForecast[]'], responsibilities: ['forecast resource capacity'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A resource with no baseline forecasts no exhaustion rather than an invented one.',
    handle: (input: { twin: DigitalTwin; concurrency: number }): readonly ResourceForecast[] => resourceForecast(input.twin, input.concurrency),
  }),
  def({
    id: 'twin.seasonal-forecast', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Forecast seasonal peaks — daily through yearly, holiday and campaign.',
    inputs: ['DigitalTwin'], outputs: ['SeasonalForecast[]'], responsibilities: ['forecast seasonal demand'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no history a neutral multiplier is applied rather than a fabricated peak.',
    handle: (input: { peakConcurrency: number; periods: readonly SeasonalPeriod[] }): readonly SeasonalForecast[] => seasonalForecast(input.peakConcurrency, input.periods),
  }),
  def({
    id: 'twin.baseline-tiers', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Maintain the multi-tier baselines — golden, production, environment, release and more.',
    inputs: ['DigitalTwin', 'baselines'], outputs: ['Baseline[]'], responsibilities: ['maintain tiered baselines'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A tier with no data records no baseline rather than a placeholder.',
    handle: (input: { twin: DigitalTwin; baselines: ReadonlyMap<string, number> }): readonly Baseline[] => baselineTiers(input.twin, input.baselines),
  }),
  def({
    id: 'twin.confidence', domain: 'twin', stage: 'reflection', plane: 'IP',
    purpose: 'Report the twin confidence, derived from how much history informed it.',
    inputs: ['DigitalTwin'], outputs: ['confidence'], responsibilities: ['report twin confidence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A twin with no history reports low confidence honestly, never a high one.',
    handle: (input: { twin: DigitalTwin }) => ({ confidence: input.twin.confidence }),
  }),
];

// ── Domain 2: simulation (reflection, IP; accuracy in reporting) ────────────

export interface ScenarioInput {
  readonly twin: DigitalTwin;
  readonly scenario: SimulationScenario;
  readonly thresholds: readonly PerformanceThreshold[];
  readonly transactions: readonly { readonly id: string; readonly slaMs: number }[];
}

const familyAgent = (id: string, family: string, kinds: readonly ScenarioKind[]): AgentDefinition<never, unknown> => def({
  id, domain: 'simulation', stage: 'reflection', plane: 'IP',
  purpose: `Report the ${family} simulation outcomes among the run's scenarios.`,
  inputs: ['SimulationResult[]'], outputs: ['family outcomes'], responsibilities: [`summarise ${family} scenarios`],
  toolContracts: [], aiCapabilityClass: 'none',
  failureHandling: 'A family with no scenario in this run reports none rather than an assumed outcome.',
  handle: (input: { simulations: readonly SimulationResult[] }) => input.simulations.filter((s) => kinds.includes(s.kind)).map((s) => ({ kind: s.kind, verdict: s.predictedVerdict })),
});

export const simulationAgents: readonly AgentDefinition<never, unknown>[] = [
  def({
    id: 'simulation.scenario', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Simulate one scenario against the Digital Twin, predicting patterns, SLA, capacity, cost and verdict.',
    inputs: ['ScenarioInput'], outputs: ['SimulationResult'], responsibilities: ['predict a scenario deterministically, reusing the analysis pipeline'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A scenario the twin cannot model returns its baseline prediction rather than a fabricated failure.',
    handle: (input: ScenarioInput): SimulationResult => simulateScenario(input.twin, input.scenario, input.thresholds, input.transactions),
  }),
  familyAgent('simulation.traffic', 'traffic', ['traffic-increase', 'traffic-decrease']),
  familyAgent('simulation.infrastructure', 'infrastructure', ['infra-reduction', 'infra-expansion', 'scaling-delay']),
  familyAgent('simulation.failure', 'failure', ['region-failure', 'database-failure', 'cache-failure', 'queue-saturation', 'container-failure', 'node-failure', 'memory-leak', 'thread-exhaustion']),
  familyAgent('simulation.seasonal-event', 'seasonal', ['holiday', 'black-friday', 'end-of-month', 'peak-banking', 'insurance-renewal', 'retail-promotion']),
  def({
    id: 'simulation.release-impact', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Predict the impact of deploying a release — performance, business, infrastructure and operational risk.',
    inputs: ['DigitalTwin', 'release'], outputs: ['ReleaseImpact'], responsibilities: ['predict release risk before deployment'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A release with no expected regression predicts a nominal impact rather than none.',
    handle: (input: { twin: DigitalTwin; release: string; magnitude: number; thresholds: readonly PerformanceThreshold[]; transactions: readonly { id: string; slaMs: number }[] }): ReleaseImpact => {
      const scenario: SimulationScenario = { id: 'release', kind: 'release-deploy', name: `Release ${input.release}`, description: 'release deployment prediction', magnitude: input.magnitude };
      const sim = simulateScenario(input.twin, scenario, input.thresholds, input.transactions);
      const grade = riskGrade(sim.predictedScore);
      return {
        release: input.release, performanceRisk: grade, businessRisk: grade, infrastructureRisk: riskGrade(sim.predictedCapacityHeadroomPercent ?? 100), operationalRisk: grade,
        predictedVerdict: sim.predictedVerdict, expectedRegressionPercent: Math.round((input.magnitude - 1) * 100),
        topBottlenecks: sim.predictedPatterns.slice(0, 3).map((p) => p.name), topRecommendations: sim.predictedPatterns.slice(0, 3).map((p) => p.recommendation), confidence: sim.confidence,
      };
    },
  }),
  def({
    id: 'simulation.what-if', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Answer a configured what-if question against the twin, returning predicted behaviour and confidence.',
    inputs: ['ScenarioInput'], outputs: ['SimulationResult'], responsibilities: ['answer a what-if deterministically'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A what-if with no configured magnitude uses the neutral baseline rather than a guess.',
    handle: (input: ScenarioInput): SimulationResult => simulateScenario(input.twin, input.scenario, input.thresholds, input.transactions),
  }),
  def({
    id: 'simulation.predictive-certification', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Predict the certification verdict before execution — the worst simulated scenario governs.',
    inputs: ['SimulationResult[]'], outputs: ['PredictiveCertification'], responsibilities: ['predict PASS/CONDITIONAL/FAIL with confidence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no scenario simulated, the prediction is PASS at zero confidence, reported as unproven.',
    handle: (input: { simulations: readonly SimulationResult[] }): PredictiveCertification => {
      const w = worstOf(input.simulations);
      return { predictedVerdict: w.verdict, predictedScore: w.score, confidence: w.confidence, rationale: w.scenario ? `worst scenario "${w.scenario.name}" predicts ${w.verdict}` : 'no scenario simulated' };
    },
  }),
  def({
    id: 'simulation.confidence', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Aggregate the confidence across the simulated scenarios.',
    inputs: ['SimulationResult[]'], outputs: ['confidence'], responsibilities: ['aggregate confidence'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'With no scenario, confidence is zero rather than an assumed value.',
    handle: (input: { simulations: readonly SimulationResult[] }) => ({ confidence: input.simulations.length === 0 ? 0 : Math.min(...input.simulations.map((s) => s.confidence)) }),
  }),
  def({
    id: 'simulation.narrative', domain: 'simulation', stage: 'reflection', plane: 'IP',
    purpose: 'Explain the predictive outcome for an executive audience.',
    inputs: ['PredictiveCertification'], outputs: ['narrative'], responsibilities: ['explain the prediction', 'reject a narrative that contradicts the predicted verdict'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Explain the pre-execution performance prediction for an executive audience.',
      inputsProvided: ['predicted verdict', 'predicted score', 'worst scenario name'],
      expects: 'a short predictive narrative',
      rejectionRules: ['reject a narrative that claims the system will survive when the predicted verdict is FAIL', 'reject an empty narrative'],
    },
    aiBehaviour: 'Uses the reasoning proposal to phrase the predictive narrative.',
    nonAiBehaviour: 'Emits a deterministic narrative from the predicted verdict and worst scenario.',
    failureHandling: 'A rejected or absent narrative falls back to the deterministic verdict-derived text.',
    handle: (input: { prediction: PredictiveCertification }, ctx) => {
      const deterministic = `Pre-execution prediction: ${input.prediction.predictedVerdict} at ${input.prediction.predictedScore}/100 (confidence ${input.prediction.confidence}).`;
      const proposal = ctx.proposal as { narrative?: string } | null;
      const contradicts = input.prediction.predictedVerdict === 'FAIL' && /survive|will pass|no risk/i.test(proposal?.narrative ?? '');
      return proposal?.narrative && proposal.narrative.trim() !== '' && !contradicts ? proposal.narrative : deterministic;
    },
  }),
  def({
    id: 'simulation.accuracy', domain: 'simulation', stage: 'reporting', plane: 'IP',
    purpose: 'Compare the pre-execution prediction against the actual certified outcome and measure accuracy.',
    inputs: ['prediction', 'actual'], outputs: ['PredictionAccuracy'], responsibilities: ['measure prediction accuracy so the platform can improve'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'When execution did not run (simulate mode), accuracy is reported as not-yet-measurable rather than fabricated.',
    handle: (input: { predictedVerdict: Verdict; predictedScore: number; actualVerdict: Verdict | null; actualScore: number | null }): PredictionAccuracy => ({
      predictedVerdict: input.predictedVerdict, actualVerdict: input.actualVerdict, predictedScore: input.predictedScore, actualScore: input.actualScore,
      verdictMatch: input.actualVerdict === null ? null : input.predictedVerdict === input.actualVerdict,
      scoreErrorPercent: input.actualScore === null ? null : Math.round(Math.abs(input.predictedScore - input.actualScore)),
    }),
  }),
];

export { scenarioTransform };
