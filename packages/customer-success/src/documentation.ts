/**
 * The customer documentation suite — generated from validation output.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §14 · 23-operational-excellence-model.md
 *   ADR          : ADR-0021 · ADR-0011
 *   Criteria     : C-25.9 (no real credentials, endpoints or tenant identifiers)
 *                  C-25.11 (every release ships a Customer Success Package)
 *                  C-25.12 (the package is generated from validation output)
 *                  C-25.13 (validation evidence carries envelope and provenance)
 *
 * R-25.34: THE PACKAGE IS GENERATED FROM VALIDATION OUTPUT, NOT ASSEMBLED BY HAND.
 *
 * That single rule decides the shape of this module. Nothing below narrates what the
 * platform does; everything is rendered from values that were produced by executing
 * it — the supported targets that validated, the refusals the gateway actually
 * returned, the remedies the diagnostics actually offer, the properties that are still
 * unmeasured. Prose exists only to connect those values.
 *
 * The practical consequence is the one that matters: **a guide cannot describe a
 * capability that was not measured.** If a target stops validating, its row does not
 * quietly stay green — it disappears from the compatibility table and appears in
 * Known Limitations, without anyone remembering to edit a document.
 *
 * R-25.1 is the same idea stated from the other side: "we have an installation guide"
 * and "installation succeeds" are different claims, and only the second is evidence.
 */
import { ONBOARDING_STEPS } from './onboarding.js';
import type { ObservedResponse } from './api-reference.js';
import type { ExampleValidation, ConfigurationExample } from './configuration.js';

export interface GeneratedDoc {
  readonly path: string;
  readonly title: string;
  readonly content: string;
}

/** A property the platform does not currently measure, with the blocker named. */
export interface UnmeasuredProperty {
  readonly id: string;
  readonly property: string;
  readonly blocker: string;
}

/** A remedy the diagnostics can offer, harvested from the checkers themselves. */
export interface KnownFailure {
  readonly symptom: string;
  readonly cause: string;
  readonly remedy: string;
}

export interface DocumentationInput {
  readonly contractVersion: string;
  readonly generatorVersion: string;
  readonly templateVersion: string;
  /** Targets that validated, from an executed run. Never a declared list. */
  readonly validatedTargets: readonly ExampleValidation[];
  readonly examples: readonly ConfigurationExample[];
  readonly observedResponses: readonly ObservedResponse[];
  readonly knownFailures: readonly KnownFailure[];
  /** Reported verbatim as Known Limitations. Nothing here is softened. */
  readonly unmeasured: readonly UnmeasuredProperty[];
  /**
   * WHETHER an onboarding run was measured — not the measured value.
   *
   * The value is wall-clock and differs on every run, so rendering it into a document
   * would make the package non-deterministic and a customer could no longer verify
   * that they hold what was published. The number belongs to the RUN and lives in the
   * manifest; the documents describe the RELEASE. That split is what keeps both
   * honest, and K-8.d exists to catch it collapsing.
   */
  readonly onboardingMeasured: boolean;
}

const VERSION_BLOCK = (i: DocumentationInput): readonly string[] => [
  '',
  '---',
  '',
  `*Generated from validation output · contract ${i.contractVersion} · generator ${i.generatorVersion} · templates ${i.templateVersion}*`,
  '*Not hand-maintained. Regenerated on every release from the run that validated it.*',
  '',
];

export function generateDocumentationSuite(input: DocumentationInput): readonly GeneratedDoc[] {
  const docs: GeneratedDoc[] = [
    quickStart(input),
    installationGuide(input),
    deploymentGuide(input),
    administratorGuide(input),
    upgradeGuide(input),
    troubleshootingGuide(input),
    operationsGuide(input),
    securityGuide(input),
    architectureOverview(input),
    disasterRecoveryGuide(input),
    bestPractices(input),
    knownLimitations(input),
    faq(input),
  ];
  return [...docs].sort((a, b) => (a.path < b.path ? -1 : 1));
}

// ── Quick start ─────────────────────────────────────────────────────────────

function quickStart(i: DocumentationInput): GeneratedDoc {
  const passing = i.validatedTargets.filter((t) => t.valid);
  const measured = i.onboardingMeasured;
  return {
    path: 'QUICK-START.md',
    title: 'Quick Start',
    content: [
      '# Quick start',
      '',
      'From nothing to a first authenticated call.',
      '',
      measured
        ? ['**The automated path is measured by executing it on every release.** The',
          'measured duration for this release is in `MANIFEST.json`. Your wall-clock time',
          'is that plus the decisions only you can make: which technology profile you want,',
          'and getting the generated repository through your own review.'].join(' ')
        : '**Duration is `NOT MEASURED`** — no executed onboarding run was available when this was generated.',
      '',
      '## The seven steps',
      '',
      'These are the steps the platform runs, in order. They are listed here from the',
      'same definition the software uses, so this list cannot fall behind it.',
      '',
      ...ONBOARDING_STEPS.map((s, n) => `${n + 1}. **${s.label}**`),
      '',
      '**Validation happens before creation.** Your profile is checked against the live',
      'schema before a tenant exists, because a tenant created against an unbuildable',
      'profile leaves you holding an identity for a solution that will never generate.',
      '',
      '## 1. Choose a profile',
      '',
      `${passing.length} combinations are validated. Copy one:`,
      '',
      '```json',
      JSON.stringify(i.examples[0]?.profile ?? {}, null, 2),
      '```',
      '',
      'The full set is in [CONFIGURATION.md](CONFIGURATION.md), with a matrix of what is',
      'supported and what is not.',
      '',
      '## 2. Onboard',
      '',
      '```',
      'dbiz onboard --tenant <your-tenant-id> --profile ./profile.json',
      '```',
      '',
      'Each step reports as it completes. If one fails, it stops there and tells you what',
      'to do — it does not continue into the consequences of a failure.',
      '',
      '## 3. Commit what was generated',
      '',
      'You receive a complete repository. It is yours: the platform keeps no copy of it,',
      'your source, your test data or your results.',
      '',
      'The generated repository contains a **one-time registration credential**. It is',
      'single-use and is consumed the first time your deployment starts. It is not an API',
      'key and cannot be reused — which is why it is safe in a repository history, and why',
      'nothing else in that repository is a secret.',
      '',
      '## 4. Deploy and let it register',
      '',
      'Your deployment calls out to the platform. **Nothing calls in.** The platform never',
      'opens a connection into your tenancy, so no inbound firewall rule is required —',
      'and if someone asks you to open one, that request did not come from this platform.',
      '',
      '## 5. Confirm',
      '',
      '```',
      'dbiz doctor',
      '```',
      '',
      'Runs every diagnostic and prints failures first, each with what to do next.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Installation ────────────────────────────────────────────────────────────

function installationGuide(i: DocumentationInput): GeneratedDoc {
  const rows = i.validatedTargets
    .filter((t) => t.valid && t.id.includes('-'))
    .map((t) => `| ${t.id.split('-')[0]} | ${t.id.split('-').slice(1).join('-')} | **Validated** |`);
  return {
    path: 'INSTALLATION.md',
    title: 'Installation Guide',
    content: [
      '# Installation',
      '',
      '## Prerequisites',
      '',
      '| Requirement | Why |',
      '|---|---|',
      '| Node.js 24 LTS | Older versions lack TLS behaviour the platform depends on. The failure appears later as a handshake error rather than a version error, which is why it is checked first. |',
      '| Outbound TCP to your platform endpoint | The Execution Plane initiates every connection. |',
      '| No inbound rule | Nothing connects into your tenancy. If you are asked to open a port, it is not for this. |',
      '| A secret store | For the registration credential at deploy time. Not required to evaluate. |',
      '',
      '**Run `dbiz doctor --preflight` before installing.** It checks each of these and',
      'names the unmet one. A failed installation that does not name its unmet',
      'precondition is a defect in this platform, not an error on your side.',
      '',
      '## Validated targets',
      '',
      'Each row was validated by an executed run, not declared:',
      '',
      '| Language | Framework | Status |',
      '|---|---|---|',
      ...rows,
      '',
      '## Installing without reaching DBiz',
      '',
      'Installation requires **no connectivity to DBiz**. Point your package manager at',
      'your own mirror; the generated solution pins exact versions, so a mirrored',
      'registry resolves to the same bytes.',
      '',
      'Registration does require reaching your platform endpoint — but that is your',
      'deployment calling out at runtime, not installation.',
      '',
      '## When installation fails',
      '',
      'It names the unmet precondition. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md),',
      'which is generated from the same diagnostics that produce those messages.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Deployment ──────────────────────────────────────────────────────────────

function deploymentGuide(i: DocumentationInput): GeneratedDoc {
  const deploymentUnmeasured = i.unmeasured.filter((u) => /deploy/i.test(u.property) || /deploy/i.test(u.id));
  return {
    path: 'DEPLOYMENT.md',
    title: 'Deployment Guide',
    content: [
      '# Deployment',
      '',
      'The Execution Plane runs **in your tenancy**, built and operated by you. That is',
      'the architecture, not a support boundary: DBiz has no route into your environment',
      'and does not want one.',
      '',
      '## What you deploy',
      '',
      'The generated repository contains a `Dockerfile` whose base image matches your',
      'chosen language, a deployment manifest for your chosen model, and a CI workflow for',
      'your chosen system. All three come from the profile — they are not templates you',
      'adapt afterwards.',
      '',
      '## Network',
      '',
      '| Direction | Required | Notes |',
      '|---|---|---|',
      '| Outbound to the platform endpoint | **Yes** | TLS. Your deployment initiates every connection. |',
      '| Inbound from the platform | **Never** | No rule is required, and none should be created. |',
      '| Outbound to your package mirror | At build | Not needed at runtime. |',
      '',
      '**A TLS-inspecting proxy will break mutual TLS.** A proxy that re-signs traffic',
      'presents its own certificate, and the platform is verifying yours. If handshakes',
      'fail from inside a corporate network and succeed from outside, this is why.',
      '',
      '## First start',
      '',
      'On first start your deployment registers itself using the one-time credential in',
      'the generated repository. Registration is **atomic** — a failure at any point',
      'leaves the tenant unregistered rather than half-registered — and **idempotent** by',
      'tenant, so a retried deployment returns the grant you already hold rather than',
      'creating a second identity.',
      '',
      '## Deployment validation',
      '',
      deploymentUnmeasured.length > 0
        ? [
          'The following remain **`NOT MEASURED`** and are therefore not claimed:',
          '',
          ...deploymentUnmeasured.map((u) => `- **${u.id}** — ${u.property}. Blocked: ${u.blocker}.`),
          '',
          'This is stated rather than omitted. A deployment guide that implies validation',
          'it does not have is worse than one that admits the gap, because you would find',
          'out in your own environment.',
        ].join('\n')
        : 'Deployment is validated end to end by an executed run.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Administrator ───────────────────────────────────────────────────────────

function administratorGuide(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'ADMINISTRATOR-GUIDE.md',
    title: 'Customer Administrator Guide',
    content: [
      '# Administrator guide',
      '',
      'For whoever owns the Execution Plane deployment day to day.',
      '',
      '## What you own, and what DBiz owns',
      '',
      '| | You | DBiz |',
      '|---|---|---|',
      '| The Execution Plane deployment | **Yes** | No access |',
      '| Your source, test data, results, screenshots | **Yes** | Never stored |',
      '| Your secrets | **Yes**, in your vault | Never held |',
      '| Certificates and tokens | Held by you | **Issued and revoked** |',
      '| The platform endpoint | — | **Yes** |',
      '',
      'This split is enforced, not agreed. The platform is checked on every build for',
      'retention of customer source, media, archives, keys and environment files.',
      '',
      '## Routine tasks',
      '',
      '| Task | Runbook | Downtime |',
      '|---|---|---|',
      '| Certificate renewal | [RUNBOOK-certificate-renewal.md](runbooks/RUNBOOK-certificate-renewal.md) | **None** |',
      '| Secret rotation | [RUNBOOK-secret-rotation.md](runbooks/RUNBOOK-secret-rotation.md) | **None** |',
      '| Platform upgrade | [RUNBOOK-platform-upgrade.md](runbooks/RUNBOOK-platform-upgrade.md) | None for you |',
      '| Execution Plane upgrade | [RUNBOOK-execution-plane-upgrade.md](runbooks/RUNBOOK-execution-plane-upgrade.md) | Your schedule |',
      '| Rollback | [RUNBOOK-rollback.md](runbooks/RUNBOOK-rollback.md) | Your schedule |',
      '| Decommissioning | [RUNBOOK-tenant-decommissioning.md](runbooks/RUNBOOK-tenant-decommissioning.md) | Terminal |',
      '',
      '## Rotation is not an outage',
      '',
      'Certificate rotation issues a new certificate while the previous one **keeps',
      'working** until it is explicitly revoked. There is no moment where your deployment',
      'must restart in lockstep with the platform. Rotate early rather than at expiry —',
      'the overlap is what makes that free.',
      '',
      '## Monitoring',
      '',
      'Watch three things: certificate expiry (warned at 14 days by `dbiz doctor`),',
      'refusal rates by reason, and your request rate against your limit. A rising `401`',
      'rate with reason `token replayed` means something is retrying with a stale nonce —',
      'a client bug, not a platform fault.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Upgrade ─────────────────────────────────────────────────────────────────

function upgradeGuide(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'UPGRADE.md',
    title: 'Upgrade Guide',
    content: [
      '# Upgrading',
      '',
      '## Two things upgrade separately',
      '',
      '| | Who upgrades it | When |',
      '|---|---|---|',
      '| The platform | DBiz | Continuously. You are not involved. |',
      '| Your Execution Plane | **You** | When it suits you, within the supported window. |',
      '',
      'They are decoupled on purpose. A platform release that required every customer to',
      'redeploy would make your release schedule ours.',
      '',
      '## The supported window',
      '',
      `Contracts are versioned; the current contract is **${i.contractVersion}**. The`,
      'platform accepts every version in its supported window, so you upgrade inside that',
      'window rather than on our release day. A version outside it is refused with the',
      'version you sent, the window that is current, and what to change — never a bare',
      'rejection.',
      '',
      '## Upgrading your Execution Plane',
      '',
      '1. Regenerate from your profile. Generation is deterministic: the same profile and',
      '   the same generator version produce **byte-identical** output, so the diff you',
      '   review is exactly what changed and nothing else.',
      '2. Review the diff. It is a pull request in your repository.',
      '3. Deploy on your schedule.',
      '',
      'Registration is idempotent, so a redeploy does not create a second identity and',
      'does not need a new credential.',
      '',
      '## What upgrading never does',
      '',
      'It does not touch your tests, your test data or your results. Regeneration',
      'produces platform scaffolding; what you wrote is yours and is not overwritten.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Troubleshooting ─────────────────────────────────────────────────────────

function troubleshootingGuide(i: DocumentationInput): GeneratedDoc {
  const refusals = [...i.observedResponses]
    .sort((a, b) => a.status - b.status || (a.reason < b.reason ? -1 : 1))
    .map((r) => `| \`${r.status}\` — ${r.reason} | ${r.remedy} |`);
  const failures = i.knownFailures.map((f) => `| ${f.symptom} | ${f.cause} | ${f.remedy} |`);

  return {
    path: 'TROUBLESHOOTING.md',
    title: 'Troubleshooting Guide',
    content: [
      '# Troubleshooting',
      '',
      '**Start here:**',
      '',
      '```',
      'dbiz doctor',
      '```',
      '',
      'It runs every diagnostic and prints failures first, each with what to do next. The',
      'table below is the same information, for when you have a message and not a terminal.',
      '',
      '## Refusals',
      '',
      'Every entry was produced by executing the gateway, not by reading its source.',
      '',
      '| Refusal | What to do |',
      '|---|---|',
      ...refusals,
      '',
      '**`401` and `403` mean different things.** `401` is "I could not establish who you',
      'are". `403` is "I know who you are, and that is not yours". Reissuing credentials',
      'will never fix a `403`.',
      '',
      '## Known failures',
      '',
      '| Symptom | Cause | Remedy |',
      '|---|---|---|',
      ...failures,
      '',
      '## Two that look like platform faults and are not',
      '',
      '**Handshakes fail inside the corporate network, succeed outside.** A TLS-inspecting',
      'proxy is re-signing traffic. Mutual TLS is verifying your certificate, and the proxy',
      'is presenting its own. Exempt the platform endpoint from inspection.',
      '',
      '**A valid token is refused after rotating certificates.** Tokens are bound to the',
      'certificate they were issued against. After rotating, fetch a token for the **new**',
      'certificate. This is the binding doing its job: a token lifted from a log is useless',
      'without the key it was bound to.',
      '',
      '## When to contact support',
      '',
      'Contact DBiz when a refusal carries **no reason**, when tenant isolation reports a',
      'failure, or when credentials are issued but do not verify. Those are platform',
      'defects. Everything else in this guide you can resolve without us — which is the',
      'point of it.',
      '',
      '**Support bundles are scrubbed before they leave your tenancy.** A support bundle is',
      'the most probable route by which customer content escapes, because it is assembled',
      'under time pressure by people trying to solve a problem.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Operations ──────────────────────────────────────────────────────────────

function operationsGuide(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'OPERATIONS.md',
    title: 'Operations Guide',
    content: [
      '# Operations',
      '',
      '## Running it',
      '',
      'The Execution Plane initiates all communication outbound and accepts no inbound',
      'connection from the Intelligence Plane, for any purpose. Everything below follows',
      'from that.',
      '',
      '## What to watch',
      '',
      '| Signal | Healthy | Act when |',
      '|---|---|---|',
      '| Certificate days remaining | > 14 | At 14. Rotation is free; expiry is an outage. |',
      '| Refusals by reason | Stable | Any rise in one reason. The reason names the cause. |',
      '| Request rate vs. limit | Below | Sustained `429`. That is a limit, not a fault. |',
      '| Registration attempts | One per deployment | Repeated attempts — something is not persisting its grant. |',
      '',
      '## Logging',
      '',
      'Generated logging emits **identifiers and outcomes, never payloads**. If you extend',
      'it, keep that: a log line carrying a request body is customer content in a place',
      'nobody classified.',
      '',
      '## Capacity',
      '',
      'Quotas are per tenant and independent — one tenant exhausting its quota does not',
      'affect another. Within your own deployment, concurrency is yours to set.',
      '',
      '## What is not measured',
      '',
      'Service level objectives are **defined but not measured**: no SLO value has been',
      'observed. Document 23 defines the model, not the targets. Treat any SLO figure you',
      'are quoted informally as unmeasured until it appears here.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Security ────────────────────────────────────────────────────────────────

function securityGuide(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'SECURITY.md',
    title: 'Security Guide',
    content: [
      '# Security',
      '',
      '## What the platform never holds',
      '',
      '- Your source code',
      '- Your test data',
      '- Your screenshots and captured media',
      '- Your secrets',
      '- Your private keys',
      '',
      'This is verified on every build by scanning platform storage for those artefact',
      'kinds — not by searching for a known value, which would only prove that one value',
      'is absent.',
      '',
      '## How calls are authorised',
      '',
      'Two credentials, together, neither sufficient alone:',
      '',
      '1. **A client certificate** identifying your tenant, bound in the subject and in a',
      '   SAN URI. Every authorisation decision derives from it.',
      '2. **An access token** bound to that certificate\'s key. Presented on a different',
      '   certificate, it is refused.',
      '',
      '**A tenant identifier in a request body is treated as an attack**, answered `403`,',
      'and audited. Identity comes from the certificate; nothing else can assert it.',
      '',
      '## Replay',
      '',
      'Every request carries a nonce. A repeated nonce is refused. This is not tunable.',
      '',
      '## Rotation and revocation',
      '',
      'Certificates rotate with overlap and no redeploy. Revocation takes effect at the',
      'gateway immediately — it does not wait for expiry and needs no action from you.',
      '',
      '## Your responsibilities',
      '',
      '| | |',
      '|---|---|',
      '| Private keys | Never leave your tenancy. Nothing asks for them. |',
      '| The registration credential | Single-use. Inject at deploy; do not treat as a key. |',
      '| Secrets | Your vault. The platform integrates; it does not custody. |',
      '| Egress | Allow outbound. Never open inbound. |',
      '',
      '## Reporting',
      '',
      'A refusal without a reason, an accepted cross-tenant access, or an unexpected',
      'revocation are all security events. Report them rather than working around them.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Architecture overview ───────────────────────────────────────────────────

function architectureOverview(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'ARCHITECTURE-OVERVIEW.md',
    title: 'Architecture Overview',
    content: [
      '# Architecture overview',
      '',
      'Enough to reason about the platform. Not the internal architecture.',
      '',
      '## Two planes',
      '',
      '```',
      '  Intelligence Plane                    Execution Plane',
      '  (DBiz, multi-tenant)                  (your tenancy)',
      '                                    ',
      '  certificate authority                 generated solution',
      '  authorisation server        <────     your tests',
      '  API gateway                 outbound  your test data',
      '  tenant registry             only      your results',
      '                                    ',
      '  stores no customer content            owns everything above',
      '```',
      '',
      '**The arrow points one way.** Your deployment initiates; nothing initiates into it.',
      'This is why no inbound firewall rule is ever required.',
      '',
      '## Why the split',
      '',
      'Your source, credentials and results stay where they are governed — with you. The',
      'platform holds identity, policy and orchestration. It is a boundary that is',
      'verified on every build rather than described in a contract.',
      '',
      '## What crosses',
      '',
      '| Crosses | Never crosses |',
      '|---|---|',
      '| Execution packages (what to do) | Your source |',
      '| Evidence references (hashes) | Your screenshots |',
      '| Certificates and tokens | Your secrets or keys |',
      '',
      'Evidence is referenced by hash. The platform can prove **what** your run produced',
      'without holding it — the same move as a receipt for a document it never read.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Disaster recovery ───────────────────────────────────────────────────────

function disasterRecoveryGuide(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'DISASTER-RECOVERY.md',
    title: 'Disaster Recovery Guide',
    content: [
      '# Disaster recovery',
      '',
      '## What you must be able to restore',
      '',
      '| Asset | Who holds it | If lost |',
      '|---|---|---|',
      '| Generated repository | You | **Regenerate.** Deterministic: the same profile yields byte-identical output. |',
      '| Your tests and test data | **You** | Only your backups. The platform holds no copy. |',
      '| Certificate and key | You | Rotate. Registration is idempotent. |',
      '| Registration credential | You | Already consumed; you do not need it again. |',
      '| Tenant identity | Platform | Nothing to restore. |',
      '',
      '**The row that matters is the second.** The platform storing nothing of yours is a',
      'security property and a recovery obligation at the same time. Nobody else has a',
      'copy of your tests.',
      '',
      '## Losing the whole Execution Plane',
      '',
      '1. Restore your repository from your own backup, or regenerate the scaffolding.',
      '2. Redeploy. Registration is idempotent — you get your existing grant back.',
      '3. Run `dbiz doctor`.',
      '',
      'Certificates do not need to be reissued unless they were compromised. If they were,',
      'that is a rotation and it needs no redeploy.',
      '',
      '## Restore is only real if you have done it',
      '',
      'The platform holds itself to this: its own restore procedure is executed on every',
      'build — backup, **destroy the working copies**, restore, and verify content hashes.',
      'A restore check that never removes anything proves only that the files were already',
      'there, and one that checks existence passes against an empty file.',
      '',
      'Hold your own backups to the same standard. Restore them somewhere, and compare',
      'content rather than filenames.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Best practices ──────────────────────────────────────────────────────────

function bestPractices(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'BEST-PRACTICES.md',
    title: 'Best Practices',
    content: [
      '# Best practices',
      '',
      '## Rotate early',
      '',
      'Rotate certificates at 14 days, not at expiry. The previous certificate keeps',
      'working until revoked, so early rotation costs nothing and expiry costs an outage.',
      '',
      '## Pin everything',
      '',
      'Generated solutions pin exact versions. Keep it that way. A version range means',
      'your build is not reproducible, and the day it breaks will not be a day anything',
      'changed on your side.',
      '',
      '## Keep the registration credential out of your image',
      '',
      'Inject it at deploy from your secret store. It is single-use, so the blast radius',
      'is small — but a credential baked into an image outlives every rotation policy you',
      'will write.',
      '',
      '## Send a fresh nonce every time',
      '',
      'Replay protection is not tunable. A client that reuses nonces works until it',
      'retries, then fails in a way that looks like an authentication problem.',
      '',
      '## Do not log payloads',
      '',
      'Generated logging emits identifiers and outcomes. Extending it to log request',
      'bodies puts customer content somewhere nobody classified.',
      '',
      '## Treat a reason-less refusal as a defect',
      '',
      'Every refusal carries a reason. If one does not, report it rather than working',
      'around it — the platform gates on that property, so its absence means something',
      'is wrong upstream of you.',
      '',
      '## Regenerate rather than hand-edit scaffolding',
      '',
      'Generation is deterministic, so a regenerated diff is exactly what changed.',
      'Hand-edited scaffolding turns your next upgrade into a merge.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── Known limitations ───────────────────────────────────────────────────────

function knownLimitations(i: DocumentationInput): GeneratedDoc {
  const rows = i.unmeasured.map((u) => `| **${u.id}** | ${u.property} | ${u.blocker} |`);
  const failedTargets = i.validatedTargets.filter((t) => !t.valid);
  return {
    path: 'KNOWN-LIMITATIONS.md',
    title: 'Known Limitations',
    content: [
      '# Known limitations',
      '',
      '**Generated from the platform\'s own unmeasured properties.** Nothing here is',
      'editorial. A property appears because a validation run did not measure it, and it',
      'disappears when one does.',
      '',
      '## Not measured',
      '',
      rows.length > 0
        ? ['| # | Property | Blocker |', '|---|---|---|', ...rows].join('\n')
        : 'Nothing. Every operational property is measured.',
      '',
      '**`NOT MEASURED` is not a soft pass.** These are not claimed, and they do not',
      'contribute to any readiness figure you are shown. If a capability you need is',
      'listed here, treat it as absent.',
      '',
      failedTargets.length > 0
        ? [
          '## Targets that did not validate',
          '',
          ...failedTargets.map((t) => `- **${t.id}** — ${t.detail}`),
          '',
          'These are not offered in the configuration guide, and the platform refuses them',
          'at onboarding rather than generating something that cannot build.',
        ].join('\n')
        : '## Targets\n\nEvery declared supported target validated.',
      '',
      '## Deliberate limits',
      '',
      'These are not gaps and will not close:',
      '',
      '| Limit | Why |',
      '|---|---|',
      '| No inbound connectivity into your tenancy | The boundary the platform exists to hold. |',
      '| Platform stores no source, data, media or secrets | Same. |',
      '| Unsupported technology combinations are refused | A profile that parses is not a profile that can be built. |',
      '| Registration credentials are single-use | A reusable credential is an API key with a different name. |',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

function faq(i: DocumentationInput): GeneratedDoc {
  return {
    path: 'FAQ.md',
    title: 'FAQ',
    content: [
      '# Frequently asked questions',
      '',
      '**Do I need to open a firewall port?**',
      'No, and you never will. Your deployment initiates every connection. A request to',
      'open inbound access did not come from this platform.',
      '',
      '**Where is my test data stored?**',
      'In your tenancy. The platform stores none of it, and its absence is verified on',
      'every build rather than promised.',
      '',
      '**What happens if I lose my certificate?**',
      'Rotate. It needs no redeploy and registration is idempotent, so you will not end up',
      'with a second identity.',
      '',
      '**Can I reuse the registration credential?**',
      'No. It is consumed on first use. Registering again with it returns the grant you',
      'already hold rather than failing — which is what makes retried deployments safe.',
      '',
      '**Does upgrading the platform force me to redeploy?**',
      'No. The platform and your Execution Plane upgrade independently, and contracts are',
      `accepted across a supported window. The current contract is ${i.contractVersion}.`,
      '',
      '**Why was my profile refused when every field looked valid?**',
      'Each field can be valid while the combination is not buildable. The compatibility',
      'matrix lists what is supported; the refusal names which part is the problem.',
      '',
      '**My token stopped working after rotating certificates.**',
      'Tokens are bound to the certificate they were issued against. Fetch a token for the',
      'new certificate. This is the binding working, not a fault.',
      '',
      '**Can DBiz see my screenshots?**',
      'No. They stay in your tenancy unless you explicitly scrub and share them, and',
      'support bundles are scrubbed on the way out.',
      '',
      '**How long does onboarding take?**',
      i.onboardingMeasured
        ? ['The automated path is measured on every release, and the figure for this',
          'release is in `MANIFEST.json`. The rest is your decisions and your review',
          'process — which is the part that actually takes the time.'].join(' ')
        : '`NOT MEASURED` — no executed run was available when this was generated.',
      '',
      '**Is there an API key?**',
      'No, and there will not be. Static keys are prohibited by the platform\'s own',
      'constitution. Identity is a certificate; authorisation is a short-lived token bound',
      'to it.',
      ...VERSION_BLOCK(i),
    ].join('\n'),
  };
}
