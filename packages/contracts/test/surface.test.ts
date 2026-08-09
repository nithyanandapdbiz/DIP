/**
 * Published surface — the package boundary itself.
 * TRACEABILITY: 19-repository-ownership.md §3 · 20-cross-plane-contracts.md §1
 *   ADR: ADR-0003 (shared package vehicle) · ADR-0004 (JSON Schema artefact)
 *   Criteria: C-19.4 (no shared-package export computes a decision)
 *             C-20.4 (both planes validate against the SAME schema artefact)
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contracts from '../src/index.js';
import { CONTRACT_VERSION } from '../src/version.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaDir = join(packageRoot, 'schema');

describe('published JSON Schema artefact (C-20.4)', () => {
  const artefacts = ['execution-package', 'evidence-reference'];

  test('an artefact is emitted for every cross-plane contract', () => {
    for (const name of artefacts) {
      const file = join(schemaDir, `${name}-v${CONTRACT_VERSION}.json`);
      assert.equal(existsSync(file), true, `missing published schema for ${name}`);
    }
  });

  test('each artefact is valid JSON Schema carrying a versioned $id', () => {
    for (const name of artefacts) {
      const doc = JSON.parse(
        readFileSync(join(schemaDir, `${name}-v${CONTRACT_VERSION}.json`), 'utf8'),
      ) as Record<string, unknown>;
      assert.equal(typeof doc['$schema'], 'string', `${name} declares no $schema dialect`);
      assert.match(String(doc['$id']), new RegExp(`/${name}/v${CONTRACT_VERSION}$`));
    }
  });

  test('the artefact is language-neutral — it names no TypeScript or Zod construct', () => {
    // The published artefact must be consumable by a non-TypeScript plane (ADR-0004 §4).
    for (const name of artefacts) {
      const raw = readFileSync(join(schemaDir, `${name}-v${CONTRACT_VERSION}.json`), 'utf8');
      assert.equal(/zod|ZodType|typescript/i.test(raw), false,
        `${name} leaks an implementation construct into the published artefact`);
    }
  });

  test('the published package schema requires the fields the parser requires', () => {
    // Guards against the artefact drifting from the Zod definition it is generated
    // from — the failure that would let the two planes validate differently.
    const raw = readFileSync(join(schemaDir, `execution-package-v${CONTRACT_VERSION}.json`), 'utf8');
    for (const field of [
      'contractVersion', 'runId', 'correlationId', 'capabilityId',
      'operations', 'directives', 'gates', 'evidenceRequirements', 'provenance', 'validity',
    ]) {
      assert.equal(raw.includes(`"${field}"`), true, `published schema omits ${field}`);
    }
  });
});

describe('package surface contains no business logic (C-19.4)', () => {
  test('no export computes a decision', () => {
    // Shared logic would run in a DBiz tenancy and a customer tenancy under
    // different threat models, satisfying neither. Shared *shape* has no such
    // problem — so this package defines shape and validates it, and decides nothing.
    //
    // `*Schema` exports are excluded because a schema is declarative: it describes
    // a shape and evaluates nothing. `GateDefinitionSchema` is the case that makes
    // this distinction necessary — R-20.7 requires gate definitions to be CARRIED
    // by the Execution Plane and evaluated only by the Intelligence Plane, so a
    // schema for one belongs here while an evaluator for one would not.
    const decisionVerb = /^(decide|evaluate|certify|judge|score|approve|reject|infer|execute|run)/i;
    const offenders = Object.keys(contracts)
      .filter((name) => !name.endsWith('Schema'))
      .filter((name) => decisionVerb.test(name));
    assert.deepEqual(offenders, [], `decision-computing exports: ${offenders.join(', ')}`);
  });

  test('gate definitions are carried, never evaluated here (R-20.7)', () => {
    // The distinction the previous test rests on, asserted directly: this package
    // exports a shape for a gate and no means of evaluating one.
    assert.equal('GateDefinitionSchema' in contracts, true);
    const evaluators = Object.keys(contracts).filter((n) => /evaluat|assess|apply/i.test(n));
    assert.deepEqual(evaluators, [], `gate evaluation must not live in the contracts package`);
  });

  test('every export is a schema, parser, predicate, or constant', () => {
    for (const [name, value] of Object.entries(contracts)) {
      const kind = typeof value;
      assert.equal(
        kind === 'function' || kind === 'object' || kind === 'string',
        true,
        `export ${name} has unexpected kind ${kind}`,
      );
    }
  });

  test('the package declares no inference, credential or network dependency', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(manifest.dependencies ?? {});
    const forbidden = /openai|anthropic|bedrock|vertex|langchain|axios|node-fetch|got|vault|keyvault/i;
    const offenders = deps.filter((d) => forbidden.test(d));
    assert.deepEqual(offenders, [], `forbidden dependency: ${offenders.join(', ')}`);
  });

  test('the assurance guard refuses rather than throws, so it cannot be swallowed', () => {
    // A thrown error can be caught and ignored; a returned refusal must be handled.
    const admission = contracts.admitForCertification('DEGRADED');
    assert.equal(admission.admitted, false);
  });
});
