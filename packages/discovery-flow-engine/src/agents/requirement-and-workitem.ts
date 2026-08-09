/**
 * Requirement Reconstruction and Work Item Generation — Intelligence Plane.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md · 14-tool-operating-model.md
 *   ADR          : ADR-0023
 *   Criteria     : C-13.1 (AI proposes; code decides) · C-14.1 (tools reached through an adapter SPI)
 *
 * RECONSTRUCTION IS ALWAYS SOURCED.
 * Every virtual story carries `sourceFactIds`. A reconstructed requirement that cannot
 * name what it was reconstructed from is a statement about an application nobody
 * observed — and inverse-flow discovery exists precisely because the documentation
 * already contains those. A story whose sources are empty is refused, not published.
 *
 * WORK ITEMS ARE PUBLISHED THROUGH THE ADAPTER, NOT DESCRIBED.
 * These agents call `createWorkItem` and `linkWorkItemTraceability`. The audit of the
 * first capability built on this framework found nine of ten adapter methods declared
 * and never invoked — the integration existed as a type and not as a behaviour. Here the
 * publication is the agent's output: a `SyncRecord` carries the provider-assigned
 * identifier, and `published: false` is a recorded refusal rather than a silent absence.
 */
import {
  defineAgent, WORK_ITEM_LEVELS,
  type AgentDefinition, type WorkItemAdapter, type WorkItemLevel,
} from '@dbiz/capability-framework';
import {
  type ApplicationFact, type ApplicationModel, type BusinessRule, type Complexity, type Priority, type RiskLevel,
  type SyncRecord, type VirtualEpic, type VirtualFeature, type VirtualStory,
  type Journey, type BusinessCapability, norm,
} from '../model.js';

// ── Requirement Reconstruction ──────────────────────────────────────────────

const RISK_KEYWORDS: readonly (readonly [string, RegExp])[] = [
  ['financial', /\b(payment|invoice|price|refund|charge|billing|order|checkout)\b/i],
  ['security', /\b(login|auth|password|token|permission|role|admin|access)\b/i],
  ['privacy', /\b(profile|personal|address|email|contact|consent|gdpr)\b/i],
  ['destructive', /\b(delete|remove|cancel|purge|archive|deactivate)\b/i],
];

/** Risk from named, matched factors. Never a guess, and never lowered by reasoning. */
export function riskOf(text: string): { level: RiskLevel; factors: readonly string[] } {
  const factors = RISK_KEYWORDS.filter(([, re]) => re.test(text)).map(([name]) => name);
  const level: RiskLevel = factors.length >= 3 ? 'critical'
    : factors.length === 2 ? 'high' : factors.length === 1 ? 'medium' : 'low';
  return { level, factors };
}

export const requirementAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<{ capabilities: readonly BusinessCapability[]; applicationId: string }, readonly VirtualEpic[]>({
    id: 'requirement.epic', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Reconstruct a virtual epic for each business capability discovered.',
    inputs: ['BusinessCapability[]'], outputs: ['VirtualEpic[]'],
    responsibilities: ['one epic per capability', 'never an epic without a capability'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate an epic title and business context for a discovered business capability.',
      inputsProvided: ['capability name', 'service names', 'journey names'],
      expects: 'a title and a business-context paragraph per capability',
      rejectionRules: [
        'an epic for a capability not in the input is discarded',
        'a title shorter than four characters is discarded and the capability name stands',
      ],
    },
    aiBehaviour: 'Writes an epic title and business context in the customer domain language.',
    nonAiBehaviour: 'Titles the epic after the capability and states the services and journeys it covers.',
    failureHandling: 'An epic that cannot be titled uses the capability name, which is always present.',
    handle: (input, ctx) => {
      const proposals = (ctx.proposal ?? null) as Record<string, { title?: unknown; context?: unknown }> | null;
      return input.capabilities.map((c) => {
        const p = proposals?.[c.id];
        const title = typeof p?.title === 'string' && p.title.trim().length >= 4 ? p.title.trim() : `${c.name} capability`;
        const context = typeof p?.context === 'string' && p.context.trim().length >= 15
          ? p.context.trim()
          : `Covers ${c.serviceIds.length} service(s) and ${c.journeyIds.length} journey(s) discovered under ${c.name}.`;
        return { id: `epic-${c.id}`, title, businessContext: context, capabilityId: c.id, featureIds: [] };
      });
    },
  }),

  defineAgent<{ epics: readonly VirtualEpic[]; model: ApplicationModel }, readonly VirtualFeature[]>({
    id: 'requirement.feature', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Reconstruct a virtual feature per journey within each epic.',
    inputs: ['VirtualEpic[]', 'ApplicationModel'], outputs: ['VirtualFeature[]'],
    responsibilities: ['one feature per journey', 'bind each feature to its epic'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A journey with no epic produces no feature and is reported as an orphaned journey rather than attached arbitrarily.',
    handle: (input) => {
      const features: VirtualFeature[] = [];
      for (const epic of input.epics) {
        const capability = input.model.capabilities.find((c) => c.id === epic.capabilityId);
        for (const journeyId of capability?.journeyIds ?? []) {
          const journey = input.model.journeys.find((j) => j.id === journeyId);
          if (!journey) continue;
          features.push({
            id: `feature-${journeyId}`, epicId: epic.id,
            title: journey.name,
            businessContext: `Journey of ${journey.steps.length} step(s) from ${journey.entryFactId} to ${journey.exitFactId}.`,
            storyIds: [],
          });
        }
      }
      return features;
    },
  }),

  defineAgent<{ features: readonly VirtualFeature[]; model: ApplicationModel; rules: readonly BusinessRule[]; facts: readonly ApplicationFact[] }, readonly VirtualStory[]>({
    id: 'requirement.story', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Reconstruct a virtual story per journey step, sourced to the facts it came from.',
    inputs: ['VirtualFeature[]', 'ApplicationModel', 'BusinessRule[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['cite source facts on every story', 'refuse an unsourced story'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate a user-story title for a discovered journey step.',
      inputsProvided: ['journey name', 'step identifiers', 'page labels', 'field names'],
      expects: 'a story title per step',
      rejectionRules: [
        'a story for a step not in the journey is discarded',
        'a story is emitted only with the source fact identifiers it was reconstructed from',
        'a title shorter than four characters is discarded and the structural title stands',
      ],
    },
    aiBehaviour: 'Titles stories as user intent — "a customer reviews the basket before paying".',
    nonAiBehaviour: 'Titles stories after the step being exercised. The same stories exist, sourced identically.',
    failureHandling: 'A story that cannot be sourced to at least one discovered fact is refused rather than published unsourced.',
    handle: (input, ctx) => {
      const proposals = (ctx.proposal ?? null) as Record<string, unknown> | null;
      const stories: VirtualStory[] = [];

      for (const feature of input.features) {
        const journey = input.model.journeys.find((j) => `feature-${j.id}` === feature.id);
        if (!journey) continue;

        for (const [index, step] of journey.steps.entries()) {
          const id = `story-${journey.id}-${index + 1}`;
          const proposed = typeof proposals?.[id] === 'string' ? (proposals[id] as string).trim() : '';
          const title = proposed.length >= 4 ? proposed : `Exercise ${step} within ${journey.name}`;
          const risk = riskOf(`${title} ${step}`);

          // A story is sourced to the step AND to the controls the step contains. A
          // story sourced only to a page cannot bind the rules its fields enforce, and
          // would then generate no negative or boundary coverage.
          const childIds = input.facts.filter((f) => f.parentId === step).map((f) => f.id);
          const surface = [step, ...childIds];
          const relatedRules = input.rules.filter((r) => r.sourceFactIds.some((f) => surface.includes(f)));

          // The refusal that keeps reconstruction honest. A story with no source is an
          // assertion about an application nobody observed.
          const sourceFactIds = [...surface, ...relatedRules.flatMap((r) => r.sourceFactIds)];
          if (sourceFactIds.length === 0) continue;

          stories.push({
            id, featureId: feature.id, title,
            businessContext: `Step ${index + 1} of ${journey.steps.length} in ${journey.name}.`,
            acceptanceCriteria: [],
            businessRuleIds: relatedRules.map((r) => r.id),
            keywords: [],
            risk: risk.level,
            priority: 'p3',
            complexity: 'simple',
            dependsOn: index === 0 ? [] : [`story-${journey.id}-${index}`],
            sourceFactIds: [...new Set(sourceFactIds)],
          });
        }
      }
      return stories;
    },
  }),

  defineAgent<{ stories: readonly VirtualStory[]; model: ApplicationModel }, readonly VirtualStory[]>({
    id: 'requirement.business-context', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Attach business context to each story from the model it was reconstructed from.',
    inputs: ['VirtualStory[]', 'ApplicationModel'], outputs: ['VirtualStory[]'],
    responsibilities: ['name the entities the story touches'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A story with no attachable context keeps its structural context, which is never absent.',
    handle: (input) => input.stories.map((s) => {
      const entities = input.model.entities.filter((e) => e.sourceFactIds.some((f) => s.sourceFactIds.includes(f)));
      return entities.length === 0 ? s
        : { ...s, businessContext: `${s.businessContext} Touches entity/entities: ${entities.map((e) => e.name).join(', ')}.` };
    }),
  }),

  defineAgent<{ stories: readonly VirtualStory[]; rules: readonly BusinessRule[] }, readonly VirtualStory[]>({
    id: 'requirement.acceptance-criteria', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Derive acceptance criteria from the business rules a story is bound to.',
    inputs: ['VirtualStory[]', 'BusinessRule[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['one criterion per bound rule', 'always at least one criterion'],
    toolContracts: [], aiCapabilityClass: 'generation',
    promptContract: {
      intent: 'Generate acceptance criteria for a story from the business rules it is bound to.',
      inputsProvided: ['story title', 'bound rule statements', 'entity field names'],
      expects: 'an array of criterion strings',
      rejectionRules: [
        'a criterion referencing a rule the story is not bound to is discarded',
        'a criterion duplicating an existing one after normalisation is discarded',
        'a criterion shorter than 12 characters is discarded',
      ],
    },
    aiBehaviour: 'Adds criteria for behaviour the rules imply but do not state.',
    nonAiBehaviour: 'Emits one criterion per bound rule, plus the reachability criterion every story carries.',
    failureHandling: 'A story with no derivable criteria receives the reachability criterion, so no story is ever published untestable.',
    handle: (input, ctx) => {
      const proposals = (ctx.proposal ?? null) as Record<string, unknown> | null;
      return input.stories.map((s) => {
        const bound = input.rules.filter((r) => s.businessRuleIds.includes(r.id));
        const criteria = [
          `the step is reachable and completes within ${s.title}`,
          ...bound.map((r) => `the application enforces: ${r.statement}`),
        ];
        const proposed = Array.isArray(proposals?.[s.id]) ? (proposals[s.id] as unknown[]) : [];
        for (const p of proposed) {
          const text = typeof p === 'string' ? p.trim() : '';
          if (text.length < 12) continue;
          if (criteria.some((c) => norm(c) === norm(text))) continue;
          criteria.push(text);
        }
        return { ...s, acceptanceCriteria: criteria };
      });
    },
  }),

  defineAgent<{ stories: readonly VirtualStory[]; rules: readonly BusinessRule[] }, readonly VirtualStory[]>({
    id: 'requirement.business-rules', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Bind each story to every business rule its source facts enforce.',
    inputs: ['VirtualStory[]', 'BusinessRule[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['bind by source fact, never by keyword'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An unbound rule is reported as an uncovered rule rather than attached to an arbitrary story.',
    handle: (input) => input.stories.map((s) => ({
      ...s,
      businessRuleIds: [...new Set(input.rules
        .filter((r) => r.sourceFactIds.some((f) => s.sourceFactIds.includes(f)))
        .map((r) => r.id))],
    })),
  }),

  defineAgent<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>({
    id: 'requirement.keywords', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Extract search keywords so a story can be matched against an existing repository.',
    inputs: ['VirtualStory[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['drop stop words', 'keep terms of three characters or more'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A story with no keywords still matches by title; keyword extraction improves recall and is never the only route.',
    handle: (input) => {
      const STOP = new Set(['the', 'and', 'for', 'with', 'within', 'from', 'that', 'this', 'exercise', 'step']);
      return input.stories.map((s) => ({
        ...s,
        keywords: [...new Set(norm(`${s.title} ${s.businessContext}`).split(' ')
          .filter((w) => w.length >= 3 && !STOP.has(w)))].sort(),
      }));
    },
  }),

  defineAgent<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>({
    id: 'requirement.risk', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Assign a risk level to each story from named, matched factors.',
    inputs: ['VirtualStory[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['score named factors only', 'never lower a matched level'],
    toolContracts: [], aiCapabilityClass: 'ranking',
    promptContract: {
      intent: 'Rank reconstructed stories by the business risk their failure would carry.',
      inputsProvided: ['story titles', 'business rule statements', 'matched risk factors'],
      expects: 'story identifiers ordered from highest risk to lowest',
      rejectionRules: [
        'a ranking may raise a level and may never lower one derived from a matched factor',
        'a story identifier not in the input is discarded',
      ],
    },
    aiBehaviour: 'May raise a story to a higher band where domain context makes it riskier than its keywords show.',
    nonAiBehaviour: 'Bands strictly on the count of matched factors: financial, security, privacy, destructive.',
    failureHandling: 'An unscored story defaults to HIGH. Defaulting low would hide exactly what this exists to surface.',
    handle: (input, ctx) => {
      const ORDER: readonly RiskLevel[] = ['low', 'medium', 'high', 'critical'];
      const raised = Array.isArray(ctx.proposal) ? new Set(ctx.proposal as unknown[]) : new Set();
      return input.stories.map((s) => {
        const derived = riskOf(`${s.title} ${s.businessContext} ${s.keywords.join(' ')}`).level;
        // A proposal may only move a story UP the band. The measured factors are a
        // floor, and a reasoning pass that could lower them would be able to quiet a
        // critical finding by rewording it.
        if (!raised.has(s.id)) return { ...s, risk: derived };
        const next = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(derived) + 1)] ?? derived;
        return { ...s, risk: next };
      });
    },
  }),

  defineAgent<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>({
    id: 'requirement.priority', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Derive priority from risk and position in the journey.',
    inputs: ['VirtualStory[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['derive from risk, never from opinion'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'An underivable priority defaults to p2, which schedules the work rather than deferring it silently.',
    handle: (input) => input.stories.map((s) => {
      const priority: Priority = s.risk === 'critical' ? 'p1' : s.risk === 'high' ? 'p2' : s.risk === 'medium' ? 'p3' : 'p4';
      return { ...s, priority };
    }),
  }),

  defineAgent<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>({
    id: 'requirement.complexity', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Estimate complexity from acceptance criteria count and rule density.',
    inputs: ['VirtualStory[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['band the score'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'Complexity informs batching only; an error degrades to moderate.',
    handle: (input) => input.stories.map((s) => {
      const score = s.acceptanceCriteria.length + s.businessRuleIds.length * 2 + s.dependsOn.length;
      const complexity: Complexity = score > 12 ? 'complex' : score > 5 ? 'moderate' : 'simple';
      return { ...s, complexity };
    }),
  }),

  defineAgent<{ stories: readonly VirtualStory[] }, readonly VirtualStory[]>({
    id: 'requirement.dependencies', domain: 'requirement', stage: 'policy-review', plane: 'IP',
    purpose: 'Establish story dependencies, refusing any that would form a cycle.',
    inputs: ['VirtualStory[]'], outputs: ['VirtualStory[]'],
    responsibilities: ['drop a dependency on an unknown story', 'never close a cycle'],
    toolContracts: [], aiCapabilityClass: 'none',
    failureHandling: 'A dependency that would form a cycle is dropped; a cyclic plan cannot be scheduled at all.',
    handle: (input) => {
      const known = new Set(input.stories.map((s) => s.id));
      const edges = new Map<string, string[]>();
      const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
        if (from === to) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return (edges.get(from) ?? []).some((n) => reaches(n, to, seen));
      };
      return input.stories.map((s) => {
        const kept: string[] = [];
        for (const d of s.dependsOn) {
          if (!known.has(d) || d === s.id) continue;
          if (reaches(d, s.id)) continue;
          kept.push(d);
          edges.set(s.id, [...(edges.get(s.id) ?? []), d]);
        }
        return { ...s, dependsOn: kept };
      });
    },
  }),
];

// ── Work Item Generation — published through the adapter ────────────────────

export interface WorkItemInput {
  readonly adapter: WorkItemAdapter;
  readonly epics: readonly VirtualEpic[];
  readonly features: readonly VirtualFeature[];
  readonly stories: readonly VirtualStory[];
  /** Provider ids assigned so far, by local id. Threaded so parentage is real. */
  readonly published: ReadonlyMap<string, string>;
}

/**
 * Publish one level of the hierarchy.
 *
 * A level the provider does not model is recorded as a refusal carrying its reason,
 * never skipped. "Jira has no Feature here" is information; an absent record is not.
 */
function publishLevel(
  level: WorkItemLevel,
  items: readonly { id: string; title: string; description: string; parentLocalId: string | null; labels: readonly string[]; components: readonly string[] }[],
  input: WorkItemInput,
): readonly SyncRecord[] {
  if (!input.adapter.supports(level)) {
    return items.map((i) => ({
      target: 'work-item' as const, localId: i.id, externalId: null, published: false,
      reason: `provider does not model the ${level} level`,
    }));
  }
  return items.map((i) => {
    const parentId = i.parentLocalId === null ? null : input.published.get(i.parentLocalId) ?? null;
    // A child whose parent failed to publish is not orphaned into the backlog root.
    if (i.parentLocalId !== null && parentId === null) {
      return {
        target: 'work-item' as const, localId: i.id, externalId: null, published: false,
        reason: `parent ${i.parentLocalId} was not published, so this ${level} would be orphaned`,
      };
    }
    const handle = input.adapter.createWorkItem({
      level, title: i.title, description: i.description, parentId,
      labels: i.labels, components: i.components,
    });
    return {
      target: 'work-item' as const, localId: i.id, externalId: handle.workItemId, published: true,
      reason: `published as ${handle.noun}`,
    };
  });
}

export const workItemAgents: readonly AgentDefinition<never, unknown>[] = [
  defineAgent<WorkItemInput, readonly SyncRecord[]>({
    id: 'workitem.epic', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Publish a work item for every reconstructed epic through the adapter.',
    inputs: ['VirtualEpic[]', 'WorkItemAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['create through the adapter', 'record the provider identifier'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An epic that cannot be published is recorded unpublished with its reason; its children are then refused rather than orphaned.',
    handle: (input) => publishLevel('epic', input.epics.map((e) => ({
      id: e.id, title: e.title, description: e.businessContext, parentLocalId: null,
      labels: ['discovered'], components: [],
    })), input),
  }),

  defineAgent<WorkItemInput, readonly SyncRecord[]>({
    id: 'workitem.feature', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Publish a work item for every reconstructed feature, parented to its epic.',
    inputs: ['VirtualFeature[]', 'WorkItemAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['parent to the published epic', 'refuse an orphan'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A provider without a feature level records every feature as unpublished with that reason, and stories parent to the epic instead.',
    handle: (input) => publishLevel('feature', input.features.map((f) => ({
      id: f.id, title: f.title, description: f.businessContext, parentLocalId: f.epicId,
      labels: ['discovered'], components: [],
    })), input),
  }),

  defineAgent<WorkItemInput, readonly SyncRecord[]>({
    id: 'workitem.story', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Publish a work item for every reconstructed story with its acceptance criteria.',
    inputs: ['VirtualStory[]', 'WorkItemAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['carry acceptance criteria into the description', 'parent to the feature, or to the epic where the provider has no feature level'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unpublished story is recorded with its reason and no QA asset is linked to it.',
    handle: (input) => {
      const featureSupported = input.adapter.supports('feature');
      return publishLevel('story', input.stories.map((s) => {
        const feature = input.features.find((f) => f.id === s.featureId);
        return {
          id: s.id, title: s.title,
          description: [
            s.businessContext, '',
            'Acceptance criteria:',
            ...s.acceptanceCriteria.map((c) => `- ${c}`),
            '',
            `Reconstructed from ${s.sourceFactIds.length} discovered fact(s).`,
          ].join('\n'),
          // Where the provider has no feature level, the story parents to the epic. It
          // does not become a root item — the hierarchy shape is the deliverable.
          parentLocalId: featureSupported ? s.featureId : feature?.epicId ?? null,
          labels: ['discovered', s.risk, s.priority],
          components: [s.complexity],
        };
      }), input);
    },
  }),

  defineAgent<WorkItemInput, readonly SyncRecord[]>({
    id: 'workitem.task', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Publish an implementation task per story acceptance criterion.',
    inputs: ['VirtualStory[]', 'WorkItemAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['one task per criterion', 'parent to the published story'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'A provider without a task level records the refusal; criteria remain on the story description regardless.',
    handle: (input) => publishLevel('task', input.stories.flatMap((s) =>
      s.acceptanceCriteria.map((c, i) => ({
        id: `${s.id}-task-${i + 1}`, title: `Verify: ${c}`.slice(0, 120),
        description: c, parentLocalId: s.id, labels: ['discovered'], components: [],
      }))), input),
  }),

  defineAgent<{ stories: readonly VirtualStory[]; adapter: WorkItemAdapter }, { readonly labels: readonly string[]; readonly components: readonly string[]; readonly levelNouns: Readonly<Record<string, string>> }>({
    id: 'workitem.labels-components', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Establish the label, component and provider level vocabulary the published items use.',
    inputs: ['VirtualStory[]', 'WorkItemAdapter'], outputs: ['labels', 'components', 'levelNouns'],
    responsibilities: ['derive labels from story attributes only', 'ask the adapter for each level noun'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An empty vocabulary publishes items without labels, which is untidy and never wrong. An unavailable level noun is reported as unsupported rather than guessed.',
    handle: (input) => ({
      labels: [...new Set(['discovered', ...input.stories.flatMap((s) => [s.risk, s.priority])])].sort(),
      components: [...new Set(input.stories.map((s) => s.complexity))].sort(),
      // The engine asks the ADAPTER what the provider calls each level. Hard-coding
      // "User Story" here would be the provider-specific branch the SPI exists to
      // prevent, one string at a time.
      levelNouns: Object.fromEntries(WORK_ITEM_LEVELS.map((level) => [
        level, input.adapter.supports(level) ? input.adapter.nounFor(level) : 'not modelled by this provider',
      ])),
    }),
  }),

  defineAgent<{ adapter: WorkItemAdapter; links: readonly { workItemId: string; testId: string }[] }, readonly SyncRecord[]>({
    id: 'workitem.traceability', domain: 'workitem', stage: 'execution-planning', plane: 'IP',
    purpose: 'Link every published work item to the QA assets that verify it.',
    inputs: ['work item ids', 'test ids', 'WorkItemAdapter'], outputs: ['SyncRecord[]'],
    responsibilities: ['link through the adapter', 'never claim a link that was refused'],
    toolContracts: ['WorkItemAdapter'], aiCapabilityClass: 'none',
    failureHandling: 'An unlinkable pair is recorded unpublished. Traceability claimed but not established is worse than traceability known to be missing.',
    handle: (input) => input.links.map((l) => {
      const result = input.adapter.linkWorkItemTraceability(l.workItemId, l.testId);
      return {
        target: 'traceability' as const, localId: `${l.workItemId}:${l.testId}`,
        externalId: result.linked ? l.workItemId : null, published: result.linked,
        reason: result.linked ? 'linked through the adapter' : 'the adapter refused the link',
      };
    }),
  }),
];

export { type Journey };
