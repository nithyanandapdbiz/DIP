/**
 * Emit the published JSON Schema artefact.
 *
 * TRACEABILITY
 *   Architecture : 20-cross-plane-contracts.md §1 · 19-repository-ownership.md §3
 *   ADR          : ADR-0004 (JSON Schema is the published artefact)
 *   Criteria     : C-20.4 (both planes validate against the SAME schema artefact)
 *
 * The schema is DATA, so one artefact validates identically in both planes with no
 * code generation — and a future non-TypeScript consumer is not excluded. That is
 * why the published artefact is JSON Schema rather than TypeScript types.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ExecutionPackageSchema } from '../execution-package.js';
import { EvidenceReferenceSchema } from '../evidence.js';
import { CONTRACT_VERSION } from '../version.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'schema');
mkdirSync(outDir, { recursive: true });

const artefacts: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['execution-package', ExecutionPackageSchema],
  ['evidence-reference', EvidenceReferenceSchema],
];

for (const [name, schema] of artefacts) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  const doc = { $id: `https://contracts.dbiz.platform/${name}/v${CONTRACT_VERSION}`, ...json };
  const file = join(outDir, `${name}-v${CONTRACT_VERSION}.json`);
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`emitted ${file}`);
}
