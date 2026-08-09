/**
 * Platform Core — bounded-context boundary.
 * TRACEABILITY: 03-intelligence-plane-architecture.md §2a · ADR-0021
 *   Criteria: C-03.13 (exactly two bounded contexts, neither separately deployable)
 *             C-03.14 (Intelligence Core does not depend on Platform Core)
 *             C-03.22 (Platform Core stores no customer asset)
 * Categories: contract, security, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as platformCore from '../src/index.js';

// Compiled output runs from dist/test/, so the package root is two levels up.
// Resolving against the source layout would silently read the wrong files.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaceRoot = join(packageRoot, '..', '..');

describe('bounded context is not separately deployable (C-03.13)', () => {
  test('platform-core binds no listener and declares no server entry point', () => {
    // R-03.24: a context that acquired its own listener would be a third runtime.
    // The check is on source, not behaviour, because a listener that is never called
    // is still a listener one line from being called — the F-Q13-1 lesson.
    const srcDir = join(packageRoot, 'src');
    const walk = (d: string): string[] => readdirSync(d).flatMap((e) => {
      const full = join(d, e);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
    const listenerPattern = /\.listen\s*\(|createServer|new\s+WebSocketServer|Fastify\(|express\(/;
    for (const f of walk(srcDir)) {
      const body = readFileSync(f, 'utf8');
      assert.equal(listenerPattern.test(body), false, `${f} contains listener-binding code`);
    }
  });

  test('the package manifest declares no start script and is private', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      private?: boolean; scripts?: Record<string, string>;
    };
    assert.equal(manifest.private, true, 'a bounded context must not be publishable as a deployable');
    assert.equal(manifest.scripts?.['start'], undefined, 'a start script implies a runtime of its own');
  });
});

describe('dependency direction (C-03.14)', () => {
  test('platform-core depends on contracts only, never on an Intelligence Core package', () => {
    // R-03.23: the arrow runs Platform Core -> Intelligence Core, never back.
    // Depending on contracts is correct — contracts is the shared layer above both.
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(manifest.dependencies ?? {});
    const intelligenceCore = /intelligence-core|workflow-runtime|decision-intelligence|agent-runtime|capability-/;
    const offenders = deps.filter((d) => intelligenceCore.test(d));
    assert.deepEqual(offenders, [], `platform-core depends on Intelligence Core: ${offenders.join(', ')}`);
  });

  /**
   * Packages admitted to depend on Platform Core, each with the reason it is admitted.
   *
   * An ALLOWLIST, not a denylist of Intelligence Core names. A denylist fails open: a
   * future Intelligence Core package with an unanticipated name would pass silently,
   * and the collapse this criterion prevents would happen without a red test. An
   * allowlist fails closed — a new importer must be admitted deliberately, here, with
   * a stated reason.
   */
  const PERMITTED_IMPORTERS = new Map<string, string>([
    ['customer-success', 'A Platform Service (ADR-0018), not Intelligence Core. It generates onboarding artefacts FROM Platform Core, which is what Platform Core exists to do, and it renders no quality verdict.'],
    ['tenant-onboarding-engine', 'The consolidated Tenant Onboarding Engine (ADR-0034) inside the Platform Core bounded context (ADR-0021 §4) — the re-founding of the former tenant-lifecycle + onboarding-experience + onboarding-api into one Node package. An intra-context dependency, never Intelligence Core. It consumes Platform Core generation and profile validation (generateSolution, validateProfile, TechnologyProfileSchema) and reimplements none of it; it renders no quality verdict.'],
  ]);

  test('only admitted packages import platform-core, and Intelligence Core never does', () => {
    // C-03.14 is "Intelligence Core does not depend on Platform Core". This test
    // previously asserted that NO package did — identical while only one other package
    // existed, and broader than the criterion once a Platform Service appeared. It now
    // enforces the criterion, and keeps the stricter allowlist so the broader
    // protection is not lost.
    //
    // The failure it guards against: if Intelligence Core imported Platform Core,
    // onboarding would become a dependency of reasoning and the two bounded contexts
    // would collapse into one.
    const packagesDir = join(workspaceRoot, 'packages');
    const importers: string[] = [];
    for (const pkg of readdirSync(packagesDir)) {
      if (pkg === 'platform-core') continue;
      const manifestPath = join(packagesDir, pkg, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
      };
      const all = { ...m.dependencies, ...m.devDependencies };
      if (Object.keys(all).includes('@dbiz/platform-core')) importers.push(pkg);
    }

    const unadmitted = importers.filter((p) => !PERMITTED_IMPORTERS.has(p));
    assert.deepEqual(unadmitted, [],
      `packages depending on platform-core without being admitted: ${unadmitted.join(', ')}`);

    const intelligenceCore = /intelligence-core|workflow-runtime|decision-intelligence|agent-runtime|capability-/;
    const collapsing = importers.filter((p) => intelligenceCore.test(p));
    assert.deepEqual(collapsing, [],
      `Intelligence Core depends on Platform Core, collapsing the two contexts: ${collapsing.join(', ')}`);
  });

  test('every admitted importer still exists, so the allowlist cannot accumulate', () => {
    // An allowlist entry for a package that no longer exists is a permission nobody
    // reviews. It grants nothing today and hides the next addition in a longer list.
    const packagesDir = join(workspaceRoot, 'packages');
    const present = new Set(readdirSync(packagesDir));
    const stale = [...PERMITTED_IMPORTERS.keys()].filter((p) => !present.has(p));
    assert.deepEqual(stale, [], `admitted packages that no longer exist: ${stale.join(', ')}`);
  });
});

describe('Platform Core holds no customer asset (C-03.22)', () => {
  test('no export returns customer source, secrets or evidence', () => {
    // The generation record is metadata only; nothing here surfaces generated
    // content, credentials, or captured evidence.
    const forbidden = /secret|credentialStore|repository|screenshot|evidenceBlob/i;
    const offenders = Object.keys(platformCore).filter((n) => forbidden.test(n));
    assert.deepEqual(offenders, [], `exports suggesting customer asset custody: ${offenders.join(', ')}`);
  });

  test('the package declares no filesystem or storage dependency', () => {
    // Generation returns files in memory; persisting them is the customer's action.
    // A storage dependency here would be the first step toward retaining them.
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const storage = /fs-extra|aws-sdk|@azure\/storage|@google-cloud\/storage|minio|s3/i;
    const offenders = Object.keys(manifest.dependencies ?? {}).filter((d) => storage.test(d));
    assert.deepEqual(offenders, [], `storage dependency in Platform Core: ${offenders.join(', ')}`);
  });
});
