/**
 * The Capability Sovereignty Register — one declaration per capability, platform-wide.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 19-repository-ownership.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0022 · ADR-0039 · ADR-0040
 *   Audit        : PLANE-SOVEREIGNTY-AUDIT.md §13 / §14 (duplication) · V-28 (shadow runtimes)
 *
 * WHY THIS EXISTS.
 * The sovereignty audit's most expensive finding was not a violation, it was a DUPLICATION: business
 * rule extraction existed twice, in two planes, with two implementations and two answers — and the
 * Execution Plane's copy was transported across the boundary and discarded because nothing read it.
 * Entity discovery, coverage, the knowledge graph, the agent runtime, the governance triad and the
 * orchestration lifecycle were all doubled the same way.
 *
 * None of it was noticed, because nothing in the platform could answer "who owns this?" — the
 * question had no place to be asked. This register is that place.
 *
 * WHAT MAKES IT ENFORCEABLE RATHER THAN DOCUMENTARY.
 * A register nobody checks is a wiki page. This one is checked three ways:
 *
 *   • `validateRegister` refuses two capabilities with the same id, and refuses two that claim the
 *     same knowledge type — which is what "there is exactly one implementation" actually means;
 *   • it refuses an Execution-Plane capability that declares a knowledge type or a reasoning type,
 *     because an EP capability that reasons is the violation class this whole remediation removed;
 *   • every entry names the CI rule that enforces it, so a capability cannot be registered with a
 *     claim nothing verifies.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';

export const CAPABILITY_REGISTER_VERSION = '1.0.0';

/**
 * Which plane owns the capability.
 *
 * There is no `both`. A capability owned by both planes is two capabilities with one name, which is
 * precisely the state this register exists to make impossible. A capability that genuinely spans the
 * boundary is modelled as two entries with different ids and an explicit producer/consumer link —
 * `repository-search` (EP, returns scores) and `repository-reuse-decision` (IP, decides from them)
 * being the worked example the audit found already correct.
 */
export const OWNER_PLANES = ['EP', 'IP'] as const;
export type OwnerPlane = (typeof OWNER_PLANES)[number];

/**
 * What KIND of thinking the capability does. `none` is the only value an EP capability may hold.
 *
 * These mirror the AI Capability Classes in document 13 rather than inventing a second vocabulary,
 * because an agent's declared class and its capability's declared reasoning type must be the same
 * claim or one of them is decoration.
 */
export const REASONING_TYPES = ['none', 'extraction', 'classification', 'generation', 'summarisation', 'ranking', 'reconciliation'] as const;
export type ReasoningType = (typeof REASONING_TYPES)[number];

/** What the capability physically DOES. Orthogonal to whether it thinks. */
export const EXECUTION_TYPES = [
  'collection', 'parsing', 'normalization', 'packaging', 'synchronisation',
  'execution', 'evidence', 'reasoning', 'decision', 'review', 'certification', 'planning',
] as const;
export type ExecutionType = (typeof EXECUTION_TYPES)[number];

/**
 * The knowledge this capability OWNS — and the field that makes duplication detectable.
 *
 * `null` means it owns none, which every Execution-Plane capability must declare. Two capabilities
 * naming the same knowledge type is the definition of the duplication this register forbids, and it
 * is a mechanical check rather than a judgement.
 */
export const KNOWLEDGE_TYPES = [
  'requirement-decomposition', 'business-rule', 'validation-rule', 'entity', 'persona',
  'state-model', 'artefact-classification', 'risk', 'ambiguity', 'gap',
  'test-design', 'coverage', 'traceability', 'reuse-decision', 'automation-architecture',
  'failure-taxonomy', 'healing-policy', 'defect-triage', 'completeness', 'release-readiness',
  'knowledge-graph', 'learning',
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const CapabilityDeclarationSchema = z.object({
  capabilityId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a capability id is lowercase kebab-case'),
  ownerPlane: z.enum(OWNER_PLANES),
  purpose: z.string().min(20, 'a purpose must say what the capability does, not name it again'),

  /** The contract it consumes and the contract it produces, by name. Both are required. */
  inputContract: z.string().min(1),
  outputContract: z.string().min(1),

  /** Where it is implemented — one path. A capability implemented twice has two entries, which fails. */
  producer: z.string().min(1),
  /** Who reads its output. Empty means nothing does, which is the dead-payload defect (audit C-04). */
  consumers: z.array(z.string().min(1)).min(1, 'a capability nothing consumes is dead payload'),

  /** The authority for what it produces — the module, agent or table that decides. */
  sourceOfTruth: z.string().min(1),

  reasoningType: z.enum(REASONING_TYPES),
  executionType: z.enum(EXECUTION_TYPES),
  knowledgeType: z.enum(KNOWLEDGE_TYPES).nullable(),

  /** The CI rule that enforces this declaration. A claim nothing checks is not a claim. */
  ciEnforcementRule: z.string().min(1),
});

export type CapabilityDeclaration = z.infer<typeof CapabilityDeclarationSchema>;

export const CapabilityRegisterSchema = z.object({
  contractVersion: z.literal(CAPABILITY_REGISTER_VERSION),
  capabilities: z.array(CapabilityDeclarationSchema),
});

export type CapabilityRegister = z.infer<typeof CapabilityRegisterSchema>;

export interface RegisterViolation {
  readonly capabilityId: string;
  readonly rule: 'duplicate-id' | 'duplicate-knowledge' | 'ep-reasons' | 'ep-owns-knowledge' | 'ip-decides-nothing' | 'unconsumed';
  readonly detail: string;
}

/**
 * Validate the register as a whole.
 *
 * Individual declarations are checked by the schema; these are the properties that only exist ACROSS
 * declarations, which is where duplication lives and why a per-entry check could never have caught
 * what the audit found.
 */
export function validateRegister(register: CapabilityRegister): readonly RegisterViolation[] {
  const violations: RegisterViolation[] = [];

  const byId = new Map<string, CapabilityDeclaration>();
  const byKnowledge = new Map<KnowledgeType, string>();

  for (const c of register.capabilities) {
    if (byId.has(c.capabilityId)) {
      violations.push({ capabilityId: c.capabilityId, rule: 'duplicate-id', detail: `declared twice; a capability has one implementation` });
      continue;
    }
    byId.set(c.capabilityId, c);

    // THE duplication check. Two capabilities owning one knowledge type is what "business rule
    // extraction exists in both planes" looks like when it is stated rather than discovered.
    if (c.knowledgeType) {
      const existing = byKnowledge.get(c.knowledgeType);
      if (existing) {
        violations.push({
          capabilityId: c.capabilityId, rule: 'duplicate-knowledge',
          detail: `owns knowledge type "${c.knowledgeType}", which ${existing} already owns; there is exactly one owner per knowledge type`,
        });
      } else {
        byKnowledge.set(c.knowledgeType, c.capabilityId);
      }
    }

    if (c.ownerPlane === 'EP') {
      // An Execution-Plane capability that reasons is the violation class this remediation removed.
      if (c.reasoningType !== 'none') {
        violations.push({
          capabilityId: c.capabilityId, rule: 'ep-reasons',
          detail: `is Execution-Plane and declares reasoning type "${c.reasoningType}"; the Execution Plane does not reason`,
        });
      }
      if (c.knowledgeType !== null) {
        violations.push({
          capabilityId: c.capabilityId, rule: 'ep-owns-knowledge',
          detail: `is Execution-Plane and owns knowledge type "${c.knowledgeType}"; knowledge belongs to the Intelligence Plane`,
        });
      }
      if (['reasoning', 'decision', 'review', 'certification', 'planning'].includes(c.executionType)) {
        violations.push({
          capabilityId: c.capabilityId, rule: 'ep-reasons',
          detail: `is Execution-Plane with execution type "${c.executionType}"; that is Intelligence-Plane work`,
        });
      }
    }
  }

  return violations;
}

export class CapabilityRegisterError extends Error {
  constructor(public readonly violations: readonly RegisterViolation[]) {
    super(`the capability register is invalid:\n  ${violations.map((v) => `${v.capabilityId}: ${v.detail}`).join('\n  ')}`);
    this.name = 'CapabilityRegisterError';
  }
}

export function parseCapabilityRegister(input: unknown): CapabilityRegister {
  const parsed = CapabilityRegisterSchema.parse(input);
  const violations = validateRegister(parsed);
  if (violations.length > 0) throw new CapabilityRegisterError(violations);
  return parsed;
}
