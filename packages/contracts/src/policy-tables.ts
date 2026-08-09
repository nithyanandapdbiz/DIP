/**
 * Policy tables — testing expertise the Intelligence Plane authors and the Execution Plane evaluates.
 *
 * TRACEABILITY
 *   Architecture : 15-configuration-model.md · 20-cross-plane-contracts.md
 *   ADR          : ADR-0004 (wire format) · ADR-0007 (signing)
 *   Audit        : PLANE-SOVEREIGNTY-AUDIT.md V-14 (failure taxonomy) · V-15 (healing policy)
 *                  V-19 (automation review) · V-21 (selector profile) · V-23 (change significance)
 *
 * THE PROBLEM THESE SOLVE.
 * A handful of the audit's findings could not be fixed by moving code, because the Execution Plane
 * genuinely has to do the work in the moment. Failure classification is the clearest case: a raw
 * Playwright error is customer content and must never cross the boundary, so SOMETHING in the
 * customer's tenancy has to reduce it to a classified token before anything is sent. The
 * Intelligence Plane cannot do it — it never sees the text.
 *
 * But the TAXONOMY is diagnostic expertise. Deciding that `resolved to 3 elements` means
 * AMBIGUOUS_SELECTOR rather than ELEMENT_NOT_FOUND is exactly the judgement `defect.root-cause`
 * exists to make, and the Execution Plane had already made it before the Intelligence Plane saw
 * anything.
 *
 * So the rule moves and the evaluation stays. The Intelligence Plane authors the table, signs it
 * into the execution package, and the Execution Plane runs rules it did not write — precisely the
 * arrangement that already works for `config/application.json`, whose validation rules are authored
 * at onboarding and merely evaluated in the tenancy.
 *
 * WHY A PATTERN STRING RATHER THAN A REGEX.
 * A regex crosses as a string and is compiled on the far side. That is a code-injection surface, so
 * the schema constrains it: bounded length, no lookbehind, and the Execution Plane compiles with a
 * match timeout. A table is data; it must never become a way to run Intelligence-Plane code inside a
 * customer's tenancy.
 *
 * This file contains shape and validation only. No business logic (R-19.7).
 */
import { z } from 'zod';

export const POLICY_TABLES_VERSION = '1.0.0';

/**
 * A pattern safe to compile in a foreign tenancy.
 *
 * Bounded, and refusing the constructs that make catastrophic backtracking easy to write by
 * accident. This is not a sandbox — it is a guard rail on a table the Intelligence Plane authors and
 * signs, where the threat model is a mistake rather than an attacker.
 */
const SafePattern = z.string().min(1).max(200)
  .refine((p) => !/\(\?<[=!]/.test(p), 'lookbehind is not portable and is refused')
  .refine((p) => !/(\(\?:.*\+.*\)\+|\(\.\*\)\+|\(\.\+\)\+)/.test(p), 'nested unbounded quantifiers risk catastrophic backtracking');

/** One classification rule: if the failure text matches, it is this token. First match wins. */
export const FailureRuleSchema = z.object({
  pattern: SafePattern,
  /** A CLASSIFIED token — short, whitespace-free, never content. */
  token: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'a failure token is an UPPER_SNAKE classification, never text'),
  rationale: z.string().min(1),
});

/**
 * The failure taxonomy (audit V-14).
 *
 * `fallback` is required and exists to stop the Execution Plane inventing a class for something the
 * table does not cover. Unmatched means UNCLASSIFIED, and UNCLASSIFIED is a useful signal — it tells
 * the Intelligence Plane its taxonomy has a gap.
 */
export const FailureTaxonomySchema = z.object({
  rules: z.array(FailureRuleSchema).min(1),
  fallback: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
});

/**
 * The healing policy (audit V-15).
 *
 * The Execution Plane used to refuse an Intelligence-Plane healing proposal whose replacement
 * selector was `*`, `body` or `html`, on its own judgement — and never told the Intelligence Plane
 * it had done so. The set was also arbitrary: `div`, `:nth-child(1)` and `[class*=btn]` are equally
 * broad and passed.
 *
 * The guard rail is right and stays; the definition of "too broad" moves here, and every refusal is
 * returned as an observation so the proposer learns its proposal was rejected.
 */
export const HealingPolicySchema = z.object({
  /** Selector forms the Execution Plane must refuse to apply, however they were proposed. */
  forbiddenSelectors: z.array(SafePattern),
  /** A heal touching more than this many elements is refused as too broad. */
  maxBlastRadius: z.number().int().min(1),
  /** Whether a refusal blocks the run or is recorded and continues. */
  onRefusal: z.enum(['record-and-continue', 'block']),
});

/**
 * Which requirement changes matter for regression (audit V-23).
 *
 * The Execution Plane filtered revision history to four "significant" fields, deciding which changes
 * to a customer's requirement were worth noticing. It now collects every revision; this says which
 * ones the Intelligence Plane wants weighted.
 */
export const ChangeSignificanceSchema = z.object({
  significantFields: z.array(z.string().min(1)),
});

/**
 * Which controls are worth authoring against (audit V-21).
 *
 * The Execution Plane's own comment said it best — "anything not interactive is noise to the author"
 * — which is the Execution Plane deciding what the author needs to see. It defines what the
 * Intelligence Plane is ABLE to reason about, so the Intelligence Plane defines it.
 */
export const SelectorProfileSchema = z.object({
  interactiveSelectors: z.array(z.string().min(1)).min(1),
  maxPages: z.number().int().min(1),
  maxControlsPerPage: z.number().int().min(1),
  selectorStrategyRanking: z.array(z.enum(['role', 'label', 'testid', 'css', 'xpath'])),
});

/**
 * Automation architecture severities (audit V-19).
 *
 * Detecting an undefined step is mechanical and stays in the Execution Plane. Deciding that it is an
 * ERROR while an unreferenced page object is a WARNING is an automation-architecture judgement, and
 * `executionReady` is a go/no-go decision.
 */
export const AutomationPolicySchema = z.object({
  severities: z.record(z.string(), z.enum(['error', 'warning', 'info'])),
  /** Finding codes that make a suite unfit to execute. Empty means execution is never blocked here. */
  blocksExecution: z.array(z.string()),
});

export const PolicyTablesSchema = z.object({
  contractVersion: z.literal(POLICY_TABLES_VERSION),
  failureTaxonomy: FailureTaxonomySchema,
  healing: HealingPolicySchema,
  changeSignificance: ChangeSignificanceSchema,
  selectorProfile: SelectorProfileSchema,
  automation: AutomationPolicySchema,
});

export type PolicyTables = z.infer<typeof PolicyTablesSchema>;
export type FailureTaxonomy = z.infer<typeof FailureTaxonomySchema>;
export type HealingPolicy = z.infer<typeof HealingPolicySchema>;

export function parsePolicyTables(input: unknown): PolicyTables {
  return PolicyTablesSchema.parse(input);
}

/**
 * The platform's default policy tables.
 *
 * Transcribed from what the Execution Plane was running, so the move changes ownership and nothing
 * else — the same rule as every other capability in this remediation. They now live where they can
 * be argued about, versioned and improved for every tenant at once, and a tenant that needs
 * different rules gets them by authoring a different table rather than by forking a runtime.
 */
export const DEFAULT_POLICY_TABLES = Object.freeze({
  contractVersion: POLICY_TABLES_VERSION,
  failureTaxonomy: {
    rules: [
      { pattern: 'timeout|timed out', token: 'TIMEOUT', rationale: 'the operation exceeded its budget' },
      { pattern: 'not visible|hidden', token: 'NOT_VISIBLE', rationale: 'the element exists but is not shown' },
      { pattern: 'no (?:such )?element|not found|resolved to 0', token: 'ELEMENT_NOT_FOUND', rationale: 'the selector matched nothing' },
      { pattern: 'strict mode|resolved to \\d+ elements', token: 'AMBIGUOUS_SELECTOR', rationale: 'the selector matched more than one element' },
      { pattern: 'net::|ERR_|ECONN|DNS', token: 'NETWORK', rationale: 'the failure is below the application' },
      { pattern: 'navigation', token: 'NAVIGATION', rationale: 'the page did not reach the expected state' },
      { pattern: 'expected .* to (?:contain|be)', token: 'ASSERTION_MISMATCH', rationale: 'the observed value differed from the expected one' },
      { pattern: 'unsupported operation', token: 'UNSUPPORTED_OPERATION', rationale: 'the adapter does not implement this instruction' },
    ],
    fallback: 'UNCLASSIFIED',
  },
  healing: {
    // Broader than the Execution Plane's original three: `div`, positional and attribute-substring
    // selectors are equally capable of matching half a page, and they used to pass.
    forbiddenSelectors: ['^\\s*\\*\\s*$', '^\\s*(?:body|html|div|span|main)\\s*$', ':nth-child\\(', '\\[class\\*='],
    maxBlastRadius: 1,
    onRefusal: 'record-and-continue',
  },
  changeSignificance: {
    significantFields: [
      'Microsoft.VSTS.Common.AcceptanceCriteria',
      'System.Description',
      'System.State',
      'Microsoft.VSTS.Common.Priority',
    ],
  },
  selectorProfile: {
    interactiveSelectors: [
      'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
      '[role=button]', '[role=link]', '[role=textbox]', '[role=combobox]', '[role=checkbox]',
      '[role=radio]', '[role=tab]', '[role=menuitem]', '[role=switch]', '[role=searchbox]',
    ],
    maxPages: 3,
    maxControlsPerPage: 60,
    selectorStrategyRanking: ['role', 'label', 'testid', 'css', 'xpath'],
  },
  automation: {
    severities: {
      'automation.undefined-step': 'error',
      'automation.duplicate-step': 'error',
      'automation.no-executable-surface': 'error',
      'automation.unused-page-object': 'warning',
      'automation.brittle-locator': 'warning',
    },
    blocksExecution: ['automation.undefined-step', 'automation.duplicate-step', 'automation.no-executable-surface'],
  },
} as const satisfies PolicyTables);
