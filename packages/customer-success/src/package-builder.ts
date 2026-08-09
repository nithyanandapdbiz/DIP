/**
 * The Customer Success Package — assembled from validation output, never by hand.
 *
 * TRACEABILITY
 *   Architecture : 25-customer-success-model.md §14
 *   ADR          : ADR-0011 (contract distribution) · ADR-0021
 *   Criteria     : C-25.11 (every release ships a package)
 *                  C-25.12 (generated from validation output)
 *                  C-25.13 (evidence carries envelope and provenance, and expires)
 *                  C-25.9  (no real credentials, endpoints or tenant identifiers)
 *
 * R-25.35: a release SHALL NOT be published without its package. The package is the
 * release's evidence that a customer can actually adopt it.
 *
 * WHAT MAKES THIS A PACKAGE RATHER THAN A FOLDER OF DOCUMENTS.
 * It carries the validation run that produced it. Remove the evidence and the same
 * files become a set of claims about a release nobody validated — which is the state
 * this whole document set exists to make impossible.
 *
 * The package is also CONTENT-HASHED and its inputs are ordered, so two builds of the
 * same release produce identical bytes. That is what lets a customer verify they hold
 * what was published rather than something that resembles it.
 */
import { createHash } from 'node:crypto';
import { canonicalBytes } from '@dbiz/contracts';
import { generateOpenApi, generateErrorCatalogue, generateAuthenticationGuide, type ApiSurface, type SchemaSource } from './api-reference.js';
import { buildExamples, validateExamples, generateCompatibilityMatrix } from './configuration.js';
import { generateDocumentationSuite, type DocumentationInput, type GeneratedDoc } from './documentation.js';
import { generateRunbookDocs } from './runbooks.js';

export interface PackageInput {
  readonly releaseVersion: string;
  readonly contractVersion: string;
  readonly generatorVersion: string;
  readonly templateVersion: string;
  readonly apiSurface: ApiSurface;
  readonly schemaSources: readonly SchemaSource[];
  readonly knownFailures: DocumentationInput['knownFailures'];
  readonly unmeasured: DocumentationInput['unmeasured'];
  /** Measured, from an executed onboarding run. `null` reports NOT MEASURED. */
  readonly onboardingDurationMs: number | null;
  /** Provenance (R-14.4). A claim detached from its origin cannot be reproduced. */
  readonly provenance: {
    readonly repository: string;
    readonly commit: string | null;
    readonly branch: string | null;
    readonly executionContext: string;
  };
  /** ISO timestamp. Supplied rather than read from the clock, so builds are replayable. */
  readonly builtAt: string;
  /** Days until validation evidence expires (R-14.5 / C-25.13). */
  readonly expiryDays?: number;
}

export interface CustomerSuccessPackage {
  readonly files: readonly GeneratedDoc[];
  readonly manifest: Record<string, unknown>;
  readonly contentHash: { readonly algorithm: string; readonly value: string };
  /** False when any validation input failed. A package can be built and not shippable. */
  readonly shippable: boolean;
  readonly blockers: readonly string[];
}

export function buildCustomerSuccessPackage(input: PackageInput): CustomerSuccessPackage {
  const examples = buildExamples();
  const validations = validateExamples(examples);
  const failedExamples = validations.filter((v) => !v.valid);

  const docs: GeneratedDoc[] = [
    ...generateDocumentationSuite({
      contractVersion: input.contractVersion,
      generatorVersion: input.generatorVersion,
      templateVersion: input.templateVersion,
      validatedTargets: validations,
      examples,
      observedResponses: input.apiSurface.observedResponses,
      knownFailures: input.knownFailures,
      unmeasured: input.unmeasured,
      // The boolean, not the value: see DocumentationInput.onboardingMeasured.
      onboardingMeasured: input.onboardingDurationMs !== null,
    }),
    ...generateRunbookDocs(),
    {
      path: 'api/openapi.json',
      title: 'OpenAPI specification',
      content: `${JSON.stringify(generateOpenApi(input.apiSurface, input.schemaSources), null, 2)}\n`,
    },
    {
      path: 'api/ERROR-CATALOGUE.md',
      title: 'Error catalogue',
      content: generateErrorCatalogue(input.apiSurface),
    },
    {
      path: 'api/AUTHENTICATION.md',
      title: 'Authenticating',
      content: generateAuthenticationGuide(input.apiSurface),
    },
    {
      path: 'CONFIGURATION.md',
      title: 'Configuration compatibility matrix',
      content: generateCompatibilityMatrix(validations),
    },
  ];

  // One file per example per format. A customer copies a file; they do not transcribe
  // a fenced block out of a guide, and every transcription is a chance to introduce
  // the error the validation was supposed to prevent.
  for (const e of examples) {
    docs.push({
      path: `examples/${e.id}/profile.json`, title: `${e.title} — JSON`, content: e.rendered.json,
    });
    docs.push({
      path: `examples/${e.id}/profile.yaml`, title: `${e.title} — YAML`, content: e.rendered.yaml,
    });
    // `env.example`, deliberately without the leading dot. The platform's own
    // non-retention scan treats anything matching `.env*` as a retained secret file,
    // and it is right to: loosening a security scan so that documentation can use a
    // familiar filename would be trading a real control for a cosmetic one. The guide
    // says to copy it to `.env`, which is where it belongs and where it is ignored.
    docs.push({
      path: `examples/${e.id}/env.example`, title: `${e.title} — environment`, content: e.rendered.env,
    });
  }

  // The schemas themselves, so the package is self-contained and a customer can
  // validate offline against exactly what the release published.
  for (const s of input.schemaSources) {
    docs.push({
      path: `api/schema/${s.name}`,
      title: `Schema — ${s.name}`,
      content: `${JSON.stringify(s.schema, null, 2)}\n`,
    });
  }

  const files = [...docs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const expiryDays = input.expiryDays ?? 30;
  const manifest = {
    packageId: 'customer-success-package',
    releaseVersion: input.releaseVersion,
    contractVersion: input.contractVersion,
    generatorVersion: input.generatorVersion,
    templateVersion: input.templateVersion,
    builtAt: input.builtAt,
    // Run metadata, deliberately here and not in any document: it varies per run, and
    // a document that varies per run cannot be verified against what was published.
    onboardingDurationMs: input.onboardingDurationMs,
    // C-25.13: validation evidence expires. Installation validated against a
    // superseded release is not evidence about the current one.
    expiresAt: new Date(Date.parse(input.builtAt) + expiryDays * 86_400_000).toISOString(),
    ...input.provenance,
    fileCount: files.length,
    validatedTargets: validations.map((v) => ({ id: v.id, valid: v.valid, detail: v.detail })),
    unmeasured: input.unmeasured,
    documentedResponses: input.apiSurface.observedResponses.length,
    ruleReference: ['R-25.1', 'R-25.26', 'R-25.27', 'R-25.33', 'R-25.34', 'R-25.35', 'R-13.3', 'R-14.5'],
  };

  const blockers: string[] = [];
  if (failedExamples.length > 0) {
    blockers.push(`${failedExamples.length} configuration example(s) do not validate: ${failedExamples.map((f) => f.id).join(', ')}`);
  }
  if (input.schemaSources.length === 0) {
    blockers.push('no contract schema was supplied — API documentation would not be generated from contracts (C-25.6)');
  }
  if (input.apiSurface.observedResponses.length === 0) {
    blockers.push('no observed gateway response was supplied — the error catalogue would be written from memory rather than from execution');
  }

  // Hashed here rather than through the contract's `hash()` primitive, and
  // deliberately so. That primitive's domain set is closed to CONTRACT artefacts;
  // borrowing one of its domains would assert that a documentation package is part of
  // the cross-plane contract surface, which it is not. Canonicalisation still comes
  // from the contract package, so ordering is the platform's, not this module's.
  const contentHash = {
    algorithm: 'sha256',
    value: createHash('sha256')
      .update('dbiz.customer-success-package@1')
      .update(Uint8Array.from([0]))
      .update(canonicalBytes({
        releaseVersion: input.releaseVersion,
        contractVersion: input.contractVersion,
        files: files.map((f) => [f.path, f.content]),
      }))
      .digest('hex'),
  };

  return { files, manifest: { ...manifest, contentHash: contentHash.value }, contentHash, shippable: blockers.length === 0, blockers };
}

/**
 * The package index. Generated last so it cannot list a file the package lacks.
 *
 * A hand-maintained index is the first thing to rot, and it rots invisibly: every
 * broken link looks like a missing document rather than a stale index.
 */
export function generateIndex(pkg: CustomerSuccessPackage): GeneratedDoc {
  const guides = pkg.files.filter((f) => !f.path.includes('/') && f.path.endsWith('.md'));
  const runbooks = pkg.files.filter((f) => f.path.startsWith('runbooks/'));
  const api = pkg.files.filter((f) => f.path.startsWith('api/'));
  const examples = pkg.files.filter((f) => f.path.startsWith('examples/'));

  return {
    path: 'README.md',
    title: 'Customer Success Package',
    content: [
      '# Customer Success Package',
      '',
      `Release **${pkg.manifest['releaseVersion']}** · contract **${pkg.manifest['contractVersion']}**`,
      '',
      'Generated from the validation run that produced this release. Every guide below',
      'describes behaviour that was executed, not behaviour that was intended.',
      '',
      '## Start here',
      '',
      '1. [Quick start](QUICK-START.md) — nothing to a first authenticated call',
      '2. [Installation](INSTALLATION.md) — prerequisites, and what to do when one is unmet',
      '3. [Configuration](CONFIGURATION.md) — what is supported, proven by validation',
      '4. [Troubleshooting](TROUBLESHOOTING.md) — generated from real refusals',
      '',
      '## Guides',
      '',
      ...guides.map((g) => `- [${g.title}](${g.path})`),
      '',
      '## Runbooks',
      '',
      'Every step names a platform operation that exists; the generator refuses to emit',
      'a runbook whose steps do not.',
      '',
      ...runbooks.map((r) => `- [${r.title.replace('Runbook — ', '')}](${r.path})`),
      '',
      '## API',
      '',
      'Generated from the published contract schemas and the gateway\'s observed behaviour.',
      '',
      ...api.map((a) => `- [${a.title}](${a.path})`),
      '',
      `## Configuration examples (${examples.length} files)`,
      '',
      'Each validates against the live schema — the same validator that will receive it.',
      'Copy the file; do not transcribe from a guide.',
      '',
      ...[...new Set(examples.map((e) => e.path.split('/')[1]))].map((id) => `- \`examples/${id}/\``),
      '',
      '## Verifying this package',
      '',
      '```',
      `content hash : ${pkg.contentHash.value}`,
      `built at     : ${pkg.manifest['builtAt']}`,
      `expires at   : ${pkg.manifest['expiresAt']}`,
      `commit       : ${pkg.manifest['commit'] ?? 'NOT RECORDED'}`,
      '```',
      '',
      '**The expiry is not a formality.** Installation validated against a superseded',
      'release is not evidence about the current one. Past that date, treat this package',
      'as unvalidated rather than merely old.',
      '',
    ].join('\n'),
  };
}
