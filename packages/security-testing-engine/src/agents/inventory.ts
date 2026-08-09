/**
 * Resource inventory (Execution Plane) and the minimisation crossing (context).
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 04-execution-plane-architecture.md · 09-data-flow-model.md
 *   ADR          : ADR-0028
 *   Criteria     : C-06.x (customer content is Execution Plane custody)
 *
 * The inventory agents run in the Execution Plane. They observe the customer's endpoints,
 * headers, cookies, TLS configuration, dependencies, IaC, containers, Kubernetes manifests,
 * cloud resources, secret-bearing surfaces, source units, authentication configuration,
 * privacy configuration and AI configuration — all of which carry content. Only the
 * minimisation agent crosses, and it crosses `SecurityFact`, which has no field for a value.
 */
import { defineAgent, type AgentDefinition } from '@dbiz/capability-framework';
import { minimiseFacts, type ObservedResource, type ResourceKind, type SecurityFact } from '../model.js';

const KINDS: readonly ResourceKind[] = [
  'endpoint', 'header-set', 'cookie', 'tls-config', 'dependency', 'iac-file',
  'container-image', 'k8s-manifest', 'cloud-resource', 'secret-surface',
  'source-unit', 'auth-config', 'privacy-config', 'ai-config',
];

function inventoryAgent(kind: ResourceKind): AgentDefinition<never, unknown> {
  return defineAgent<{ observed: readonly ObservedResource[] }, readonly ObservedResource[]>({
    id: `inventory.${kind}`, domain: 'inventory',
    purpose: `Enumerate ${kind} resources in the Execution Plane without moving their content across the boundary.`,
    stage: 'discovery', plane: 'EP',
    inputs: ['the Execution-Plane observations'], outputs: [`the ${kind} resources`],
    responsibilities: [`collect every ${kind} the Execution Plane observed`, 'retain content in the Execution Plane'],
    toolContracts: ['SecurityAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'an unreadable resource is recorded as observed-but-unparsed, never dropped from the inventory',
    handle: (i) => i.observed.filter((r) => r.kind === kind),
  }) as unknown as AgentDefinition<never, unknown>;
}

export const inventoryAgents: readonly AgentDefinition<never, unknown>[] = KINDS.map(inventoryAgent);

// ── The minimisation crossing (stage 3, context) ────────────────────────────

export const contextAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ observed: readonly ObservedResource[] }, readonly SecurityFact[]>({
    id: 'inventory.fact-minimisation', domain: 'inventory',
    purpose: 'Minimise observed resources to security facts — the single structure-only crossing.',
    stage: 'context', plane: 'EP',
    inputs: ['the Execution-Plane observations'], outputs: ['minimised security facts (structure and names, never values)'],
    responsibilities: ['emit attribute names, never attribute values', 'be the only crossing point for resource structure'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'a resource that cannot be minimised safely is withheld from the crossing, not partially crossed',
    handle: (i) => minimiseFacts(i.observed),
  }) as unknown as AgentDefinition<never, unknown>,
  defineAgent<{ facts: readonly SecurityFact[] }, { kinds: number; total: number }>({
    id: 'inventory.attribute-summary', domain: 'inventory',
    purpose: 'Summarise the minimised facts by kind for the Security Requirement Model.',
    stage: 'context', plane: 'IP',
    inputs: ['minimised security facts'], outputs: ['a fact summary by kind'],
    responsibilities: ['count facts by kind for later scoping'], toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'an empty fact set is reported as zero coverage, never as complete',
    handle: (i) => ({ kinds: new Set(i.facts.map((f) => f.kind)).size, total: i.facts.length }),
  }) as unknown as AgentDefinition<never, unknown>,
];
