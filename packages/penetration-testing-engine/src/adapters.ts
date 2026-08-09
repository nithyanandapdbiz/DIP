/**
 * Security synchronization adapters — the only place a provider name appears.
 *
 * TRACEABILITY
 *   Architecture : 14-tool-operating-model.md · 15-configuration-model.md
 *   ADR          : ADR-0027
 *   Criteria     : C-14.1 (every tool is reached through an adapter SPI)
 *
 * ONE WORKFLOW. VARIATION ONLY THROUGH ADAPTERS.
 * Azure DevOps, Jira, a cloud Security Hub and a SIEM differ in what they call a finding and
 * where it lands — a Bug, an Issue, a Finding, an Event — not in the order the engine publishes
 * container → findings → defects → threats → evidence → traceability. The adapter names the
 * noun; it does not reorder, add or skip a step. The orchestrator never learns which provider it
 * received, and the conformance suite proves two providers produce an identical publication
 * sequence.
 *
 * These adapters are in-process implementations that assign identifiers and record what was
 * asked of them. They are the seam a hosted provider client is installed at; the engine cannot
 * tell the difference, which is the point of the SPI.
 */

export interface AdapterIdentity {
  readonly spi: string;
  readonly provider: string;
  readonly version: string;
}

export interface SecurityAdapter {
  readonly identity: AdapterIdentity;
  /** The provider's noun for a finding container, e.g. "Test Run", "Finding Set". */
  readonly containerNoun: string;
  createContainer(name: string): { containerId: string; noun: string };
  publishFinding(finding: { id: string; category: string; cwe: string; severity: string; path: string }): { externalId: string };
  publishDefect(defect: { title: string; findingId: string; severity: string; evidenceRefs: readonly string[] }): { defectId: string };
  publishThreat(threat: { findingId: string; threatScore: number; mitre: readonly string[] }): { externalId: string };
  publishResult(targetId: string, summary: string): { published: true };
  /** Evidence is published by REFERENCE — a hash and a locator, never the artefact. */
  publishEvidenceReference(targetId: string, reference: { sha256: string; locator: string; kind: string }): { published: boolean };
  linkTraceability(findingId: string, containerId: string): { linked: boolean };
}

/** What an adapter was asked to do. Read by the conformance suite, never by the engine. */
export interface AdapterJournal {
  readonly calls: readonly { readonly method: string; readonly detail: string }[];
}

class Journal {
  readonly calls: { method: string; detail: string }[] = [];
  record(method: string, detail: string): void { this.calls.push({ method, detail }); }
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString().padStart(5, '0')}`;
}
/** Reset between conformance runs so identifiers do not drift across tests. */
export function resetAdapterSequence(): void { sequence = 0; }

/** Build a security adapter for a provider, with its own noun and a recording journal. */
function securityAdapterFor(provider: string, containerNoun: string, findingNoun: string): { adapter: SecurityAdapter; journal: AdapterJournal } {
  const journal = new Journal();
  const identity: AdapterIdentity = { spi: 'SecurityAdapter', provider, version: '1.0.0' };
  return {
    journal,
    adapter: {
      identity, containerNoun,
      createContainer: (name) => { journal.record('createContainer', `${containerNoun}: ${name}`); return { containerId: nextId(`${provider}-container`), noun: containerNoun }; },
      publishFinding: (f) => { journal.record('publishFinding', `${findingNoun}: ${f.category} (${f.severity}) at ${f.path}`); return { externalId: nextId(`${provider}-finding`) }; },
      publishDefect: (d) => { journal.record('publishDefect', `${d.title} (${d.severity})`); return { defectId: nextId(`${provider}-defect`) }; },
      publishThreat: (t) => { journal.record('publishThreat', `${t.findingId}: score ${t.threatScore}, ${t.mitre.length} technique(s)`); return { externalId: nextId(`${provider}-threat`) }; },
      publishResult: (targetId, summary) => { journal.record('publishResult', `${targetId}: ${summary}`); return { published: true }; },
      publishEvidenceReference: (targetId, reference) => { journal.record('publishEvidenceReference', `${targetId}: ${reference.kind}@${reference.sha256}`); return { published: true }; },
      linkTraceability: (findingId, containerId) => { journal.record('linkTraceability', `${findingId}->${containerId}`); return { linked: true }; },
    },
  };
}

export function azureDevOpsSecurityAdapter(): { adapter: SecurityAdapter; journal: AdapterJournal } {
  return securityAdapterFor('azure-devops', 'Test Run', 'Bug');
}

export function securityHubAdapter(): { adapter: SecurityAdapter; journal: AdapterJournal } {
  return securityAdapterFor('security-hub', 'Finding Set', 'Finding');
}

export class AdapterError extends Error {
  constructor(public readonly spi: string, message: string) { super(`adapter ${spi}: ${message}`); this.name = 'AdapterError'; }
}

/**
 * Adapter resolution — configuration, never a code path (C-15.x).
 *
 * The orchestrator asks for a provider by name and receives an implementation. It does not know
 * which one it got, and it must not: an orchestrator that can name a provider can branch on it.
 */
export class PentestAdapterRegistry {
  private readonly adapters = new Map<string, SecurityAdapter>();
  register(adapter: SecurityAdapter): void { this.adapters.set(adapter.identity.provider, adapter); }

  resolve(config: Readonly<Record<string, string>>): SecurityAdapter {
    const provider = config['security.provider'] ?? '';
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new AdapterError('SecurityAdapter',
        `no provider "${provider || '(unset)'}" for key "security.provider"; available: ${[...this.adapters.keys()].join(', ') || 'none'}`);
    }
    return adapter;
  }

  get providers(): readonly string[] { return [...this.adapters.keys()].sort(); }
}
