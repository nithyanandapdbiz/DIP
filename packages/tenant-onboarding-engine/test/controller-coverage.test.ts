/**
 * PERMANENT ARCHITECTURAL GUARD — route() ↔ the NestJS controllers must stay synchronized.
 *
 * TRACEABILITY: ADR-0033 (NestJS wraps the tested domain; controllers add no logic).
 *
 * The defect class this prevents: a business action is implemented in route() (and unit/integration
 * tested there), but the NestJS controller never maps it — so the LIVE server returns HTTP 404 before
 * route() is ever reached. This shipped twice (publish-update, branding) because tests exercised route()
 * directly, one layer below the controller. This guard fails the build the moment the two drift apart.
 *
 * IT SHIPPED A THIRD TIME, THROUGH THE GAP IN THIS FILE. `GET /api/application-templates` is a
 * TOP-LEVEL path (`parts[1] === '<x>'`), not a tenant sub-resource (`action === '<x>'`), so the two
 * checks below could not see it: route() served it, no controller mapped it, and the wizard's
 * application step failed live with "request failed (404)" against a green test suite. The guard now
 * covers BOTH shapes, and additionally checks that a controller which exists is actually MOUNTED —
 * an unregistered controller 404s exactly like a missing one.
 *
 * Categories: architecture, regression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const apiSrc = read('../../src/engine/api.ts');
const ctrlSrc = read('../../src/server/tenant.controller.ts');
const moduleSrc = read('../../src/server/app.module.ts');

const serverDir = fileURLToPath(new URL('../../src/server/', import.meta.url));
const controllerFiles = readdirSync(serverDir).filter((f) => f.endsWith('.controller.ts'));
const controllerSrcs = controllerFiles.map((f) => read(`../../src/server/${f}`));

/**
 * Every business action the ENGINE dispatches on — `action === '<x>'` and `action !== '<x>'`.
 *
 * THE SECOND FORM WAS ADDED WITH ADR-0080's `/work`, AND THE WIDENING IS THE POINT RATHER THAN A
 * CONCESSION. This set's subject was never really "actions `route()` handles" — it is **actions the
 * engine serves**, which was the same thing while `route()` was the only handler in `api.ts`.
 * `handleWorkRequest` is the second, because `/work` reads the run record store and `route()` is
 * pure and synchronous; it names its action by REFUSING everything else (`action !== 'work'`).
 *
 * Matching only `===` would have made a live, mounted, authorised route look DEAD to this guard —
 * the guard's own defect class inverted, and the fix that suggests itself in that state is deleting
 * the controller mapping, which would 404 the route the Execution Plane has been waiting for.
 */
const routeActions = new Set([...apiSrc.matchAll(/action [!=]== '([a-z-]+)'/g)].map((m) => m[1]));
/** Every action the controller maps as an HTTP route (`@Verb(':slug/<action>')`). */
const controllerActions = new Set([...ctrlSrc.matchAll(/@(?:Get|Post|Patch|Delete)\(':slug\/([a-z-]+)'\)/g)].map((m) => m[1]));

/** Every TOP-LEVEL path route() resolves on its own (`parts[1] === '<x>'`, or the `!==` fallthrough). */
const routeTopLevel = new Set([...apiSrc.matchAll(/parts\[1\] [!=]== '([a-z-]+)'/g)].map((m) => m[1]));
/** Every top-level prefix some controller claims (`@Controller('api/<x>')`). */
const controllerPrefixes = new Set(
  controllerSrcs.flatMap((s) => [...s.matchAll(/@Controller\('api\/([a-z-]+)'\)/g)].map((m) => m[1])),
);

describe('route() ↔ TenantController coverage — permanent guard (ADR-0033)', () => {
  test('the guard sees a non-trivial surface (self-check)', () => {
    assert.ok(routeActions.size >= 20, `expected many route() actions, saw ${routeActions.size}`);
    assert.ok(controllerActions.size >= 20, `expected many controller mappings, saw ${controllerActions.size}`);
  });

  test('EVERY action route() handles is exposed by the NestJS controller (no dead endpoints)', () => {
    const unmapped = [...routeActions].filter((a) => !controllerActions.has(a)).sort();
    assert.deepEqual(unmapped, [],
      `route() handles these actions with NO controller mapping — the live server would 404: ${unmapped.join(', ')}`);
  });

  test('the controller exposes no orphan action route() cannot handle', () => {
    const orphan = [...controllerActions].filter((a) => !routeActions.has(a)).sort();
    assert.deepEqual(orphan, [],
      `controller maps actions route() does not handle (dead controller routes): ${orphan.join(', ')}`);
  });

  test('the six Software Update Management actions are mapped (ADR-0035)', () => {
    for (const a of ['publish-update', 'sync-config', 'installed', 'update-history', 'check-compatibility', 'rollback']) {
      assert.ok(controllerActions.has(a), `Software Update Management action "${a}" is not mapped by TenantController`);
    }
  });

  // ── Top-level paths. The shape that got through: route() resolves `/api/<x>` itself, with no
  //    `:slug` and therefore no `action` for the checks above to see.
  test('the guard sees the top-level surface (self-check)', () => {
    assert.ok(routeTopLevel.has('tenants'), 'the top-level scanner did not even find /api/tenants');
    assert.ok(routeTopLevel.has('application-templates'), 'the top-level scanner did not find /api/application-templates');
  });

  test('EVERY top-level path route() serves has a controller prefix (no dead top-level endpoints)', () => {
    const unmapped = [...routeTopLevel].filter((p) => !controllerPrefixes.has(p)).sort();
    assert.deepEqual(unmapped, [],
      `route() serves these top-level paths with NO @Controller('api/<path>') — the live server would 404: ${unmapped.join(', ')}`);
  });

  // A controller class that is never registered 404s exactly like one that was never written, so
  // existence is not the property that matters — being mounted is.
  test('every controller class is referenced by AppModule (declared is not mounted)', () => {
    const declared = controllerSrcs.flatMap((s) => [...s.matchAll(/export class (\w+Controller)/g)].map((m) => String(m[1])));
    const unmounted = declared.filter((c) => !moduleSrc.includes(c)).sort();
    assert.deepEqual(unmounted, [],
      `these controllers exist but AppModule never registers them: ${unmounted.join(', ')}`);
  });
});
