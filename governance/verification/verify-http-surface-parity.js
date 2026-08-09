'use strict';
/**
 * GOVERNANCE — deployed HTTP surface parity: route() ↔ the mounted NestJS controllers.
 * ============================================================================
 * TRACEABILITY
 *   Architecture : 03-intelligence-plane-architecture.md · 22-platform-api-model.md
 *   ADR          : ADR-0033 (NestJS wraps the tested domain; controllers add no logic) · ADR-0069 §2.4
 *   Criteria     : C-03.14 · R-13.4 (self-proof) · R-14.20 (unavailability is never a clean result)
 *   Debt         : TECHNICAL_DEBT.md D-007 instance (iv) — the class this gate retires
 *
 * THE DEFECT CLASS THIS RETIRES, STATED PLAINLY.
 *
 * A business action is implemented in `route()` and thoroughly tested there. No NestJS controller
 * maps it. NestJS is the only transport in the deployed image, so the LIVE server answers its own
 * 404 before `route()` is ever reached — while every route()-level test passes. The tested surface
 * and the deployed surface are different objects, and nothing compared them.
 *
 * IT SHIPPED THREE TIMES:
 *   1. Software Update Management actions   — fixed in c7157f4 ("was 404")
 *   2. branding                             — fixed in bb7238f
 *   3. GET /api/application-templates       — fixed in adc9c2c; the wizard's application step
 *                                             failed live with "request failed (404)"
 *
 * Each was found by a human hitting a broken page, never by the suite. That is the signature of
 * D-007: a DECLARATION (route() serves this) and an IMPLEMENTATION (a controller maps it) disagreed,
 * and no gate compared them. `controller-coverage.test.ts` guards this inside the package suite;
 * this gate raises the same property to governance, where it carries a recorded fault proof (R-13.4)
 * and cannot be skipped by running a narrower test command.
 *
 * WHY BOTH DIRECTIONS. An unmapped route 404s. An orphan controller — one mapping an action `route()`
 * cannot handle — is dead surface that answers requests nothing serves, and it is equally a
 * divergence. A gate that checked one direction would bless half the drift.
 *
 * WHICH CONTROLLERS THE ORPHAN CHECK APPLIES TO. Not all of them, and getting this wrong makes the
 * gate lie. `auth` and `register` implement their own handlers and never call `route()`; they assert
 * nothing about it, so comparing their prefixes against route()'s table is a category error — the
 * first draft of this gate did exactly that and reported two false divergences. The orphan direction
 * (HS-2, HS-4) therefore applies only to controllers that DELEGATE to `route()`, which are the only
 * ones making a claim about what it serves. The 404 direction (HS-1, HS-3) still compares route()'s
 * surface against EVERY controller: what matters there is that something maps it, not which one.
 *
 * WHY "MOUNTED" AND NOT "EXISTS". A controller class that AppModule never registers 404s exactly
 * like one that was never written. Existence is not the property that matters.
 *
 * SCOPE. Tree-wide discovery: every `*.controller.ts` under `packages/`, and every module that
 * registers controllers. The class is retired platform-wide, not only where it last bit.
 *
 * DECLARED LIMITS — what this gate does NOT prove, stated so nobody infers it does.
 *
 *   1. Top-level paths are compared by PATH ONLY, not by method. `@Controller('api/<x>')` with a
 *      bare `@Get()` carries no `:slug/<action>` pair for HS-6 to read, so a top-level route whose
 *      verb diverges would pass. The tenant sub-resource surface — where all three live incidents
 *      occurred and where 23 of the 23 actions live — IS verb-compared (HS-6/HS-7).
 *   2. The comparison is static text, not the assembled NestJS router. A route registered at
 *      runtime, or a decorator applied dynamically, is invisible to it. That is deliberate:
 *      importing NestJS to ask it would make the gate depend on the wiring it audits.
 *   3. Guards, interceptors and pipes are out of scope. This gate proves a route is REACHABLE,
 *      never that it is correctly authorised — `verify-http-surface.js` owns that over a socket.
 *
 *   Limit 1 is the residual of the verb gap. HS-7 exists so limit 2 can never masquerade as a
 *   pass: an action whose method cannot be read statically is reported NOT MEASURED and counted,
 *   never assumed correct (R-13.3).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
  return cond;
};

// ── Extractors ──────────────────────────────────────────────────────────────
// Deliberately source-text extractors rather than an import of the assembled app: the
// property is a STATIC agreement between two declarations, and importing NestJS to ask
// it would make the gate depend on the very wiring it is auditing.

/**
 * Business actions THE ENGINE dispatches on: `action === '<x>'` and `action !== '<x>'`.
 *
 * THE `!==` FORM ARRIVED WITH ADR-0080's `/work`, AND WIDENING IS CORRECT RATHER THAN LENIENT.
 * This set's subject was always *actions the engine serves*; that was the same as *actions `route()`
 * serves* only while `route()` was `api.ts`'s single handler. `handleWorkRequest` is the second —
 * `/work` reads the run record store and `route()` is pure and synchronous — and it names its action
 * by refusing every other one (`action !== 'work'`).
 *
 * **Matching only `===` makes a live, mounted, correctly-authorised route look DEAD to HS-2.** The
 * repair that suggests itself in that state is deleting the controller mapping, which would 404 the
 * exchange the Execution Plane has been blocked on since D-122 — this gate's own defect class, with
 * the gate on the wrong side of it.
 */
const routeActionsOf = (src) => new Set([...src.matchAll(/action [!=]== '([a-z0-9-]+)'/g)].map((m) => m[1]));

/** Top-level paths route() resolves itself: `parts[1] === '<x>'` (and the `!==` fallthrough). */
const routeTopLevelOf = (src) => new Set([...src.matchAll(/parts\[1\] [!=]== '([a-z0-9-]+)'/g)].map((m) => m[1]));

/** Actions a controller maps: `@Verb(':slug/<action>')`. */
const controllerActionsOf = (src) =>
  new Set([...src.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(':slug\/([a-z0-9-]+)'\)/g)].map((m) => m[1]));

// ── Method dimension ────────────────────────────────────────────────────────
// An action mapped under the WRONG verb is a live 404/405 that the action-level
// comparison above cannot see: both sides name the action, so both agree it exists.
// route() states the pair on one line — `req.method === 'PATCH' && action === 'connect'`
// — and the controller states it in one decorator, so the pair is directly comparable.
const VERBS = 'GET|POST|PUT|PATCH|DELETE';
/** `VERB action` pairs route() accepts, in either written order. */
const routeMethodPairsOf = (src) => new Set([
  ...[...src.matchAll(new RegExp(`req\\.method === '(${VERBS})'\\s*&&\\s*action === '([a-z0-9-]+)'`, 'g'))]
    .map((m) => `${m[1]} ${m[2]}`),
  ...[...src.matchAll(new RegExp(`action === '([a-z0-9-]+)'\\s*&&\\s*req\\.method === '(${VERBS})'`, 'g'))]
    .map((m) => `${m[2]} ${m[1]}`),
]);
/** `VERB action` pairs a controller maps. */
const controllerMethodPairsOf = (src) => new Set(
  [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(':slug\/([a-z0-9-]+)'\)/g)]
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`),
);

/** Top-level prefixes a controller claims: `@Controller('api/<x>')`. */
const controllerPrefixesOf = (src) =>
  new Set([...src.matchAll(/@Controller\('api\/([a-z0-9-]+)'\)/g)].map((m) => m[1]));

/** Controller classes a file declares. */
const declaredControllersOf = (src) => [...src.matchAll(/export class (\w+Controller)\b/g)].map((m) => m[1]);

// ── Self-proof (R-13.4) — positive and negative detection, before any verdict ─
// In-memory fixtures. These are INPUT to the detector, never a substitute for the
// system under test: they prove the scanner can see a divergence and does not
// invent one. A gate that cannot demonstrate detection may not report a pass.
line('GOVERNANCE — deployed HTTP surface parity (route() ↔ mounted controllers)');
line('='.repeat(74));
line('\n0. Self-proof — the gate demonstrates detection before it judges (R-13.4)');

const CLEAN_ROUTE = `
  if (parts[1] === 'tenants') { if (action === 'branding') return brand(); if (action === 'installed') return inst(); }
  if (parts[1] === 'application-templates') return templates();
`;
const CLEAN_CTRL = `
  @Controller('api/tenants') export class TenantController { @Get(':slug/branding') a() { return route(req, deps); } @Post(':slug/installed') b() { return route(req, deps); } }
`;
const CLEAN_CTRL2 = `@Controller('api/application-templates') export class ApplicationTemplateController { @Get() c() { return route(req, deps); } }`;
/** A controller that implements its own handlers and never calls route(). Must be OUT of scope
 *  for the orphan direction — the first draft of this gate flagged exactly this and was wrong. */
const CLEAN_SELF_HANDLED = `@Controller('api/auth') export class AuthController { @Get('callback') d() { return this.msal.handle(); } }`;
const CLEAN_MODULE = `controllers: [TenantController, ApplicationTemplateController, AuthController]`;

const backedOf = (srcs) => srcs.filter((s) => /\broute\s*\(/.test(s));
const cleanAll = [CLEAN_CTRL, CLEAN_CTRL2, CLEAN_SELF_HANDLED];
const cleanRouteActions = routeActionsOf(CLEAN_ROUTE);
const cleanRouteTop = routeTopLevelOf(CLEAN_ROUTE);
const cleanCtrlActions = new Set(cleanAll.flatMap((s) => [...controllerActionsOf(s)]));
const cleanCtrlPrefixes = new Set(cleanAll.flatMap((s) => [...controllerPrefixesOf(s)]));
const cleanBackedPrefixes = new Set(backedOf(cleanAll).flatMap((s) => [...controllerPrefixesOf(s)]));
const cleanDeclared = cleanAll.flatMap(declaredControllersOf);

const negUnmappedAction = [...cleanRouteActions].filter((a) => !cleanCtrlActions.has(a));
const negUnmappedPrefix = [...cleanRouteTop].filter((p) => !cleanCtrlPrefixes.has(p));
const negOrphanPrefix = [...cleanBackedPrefixes].filter((p) => !cleanRouteTop.has(p));
const negUnmounted = cleanDeclared.filter((c) => !CLEAN_MODULE.includes(c));
const negativeOk = negUnmappedAction.length === 0 && negUnmappedPrefix.length === 0
  && negOrphanPrefix.length === 0 && negUnmounted.length === 0;
// The specific false positive the first draft produced: a self-handled controller treated as
// a claim about route(). Proving its absence is proving the correction, not asserting it.
const selfHandledExcluded = !cleanBackedPrefixes.has('auth') && cleanCtrlPrefixes.has('auth');

// The faulted fixture reproduces all three historical shapes at once.
const FAULT_ROUTE = CLEAN_ROUTE + `\n  if (action === 'publish-update') return pub();\n`;
const FAULT_CTRL2 = `@Controller('api/application-templates') export class ApplicationTemplateController { @Get() c() {} }`;
const faultRouteActions = routeActionsOf(FAULT_ROUTE);
const faultRouteTop = routeTopLevelOf(FAULT_ROUTE);
const faultCtrlActions = controllerActionsOf(CLEAN_CTRL);          // application-templates controller absent
const faultCtrlPrefixes = controllerPrefixesOf(CLEAN_CTRL);        // its @Controller prefix therefore absent
const faultDeclared = [...declaredControllersOf(CLEAN_CTRL), ...declaredControllersOf(FAULT_CTRL2)];
const FAULT_MODULE = `controllers: [TenantController]`;            // declared but never mounted

const posUnmappedAction = [...faultRouteActions].filter((a) => !faultCtrlActions.has(a));
const posUnmappedPrefix = [...faultRouteTop].filter((p) => !faultCtrlPrefixes.has(p));
const posUnmounted = faultDeclared.filter((c) => !FAULT_MODULE.includes(c));
const positiveOk = posUnmappedAction.includes('publish-update')
  && posUnmappedPrefix.includes('application-templates')
  && posUnmounted.includes('ApplicationTemplateController');

check('POSITIVE — an unmapped action, an unmapped top-level path and an unmounted controller are all detected',
  positiveOk,
  positiveOk
    ? `detected: action "${posUnmappedAction.join(', ')}" · prefix "${posUnmappedPrefix.join(', ')}" · unmounted "${posUnmounted.join(', ')}"`
    : 'NOT DETECTED — the scanner is blind to the defect it exists to catch');
check('NEGATIVE — a correctly wired surface is NOT flagged', negativeOk,
  negativeOk ? 'no false positive on a clean route()/controller/module triple'
    : `FALSE POSITIVE: ${[...negUnmappedAction, ...negUnmappedPrefix, ...negOrphanPrefix, ...negUnmounted].join(', ')}`);
check('NEGATIVE — a self-handled controller is excluded from the orphan direction', selfHandledExcluded,
  selfHandledExcluded
    ? 'a controller that never calls route() is seen, but makes no claim about it'
    : 'a self-handled controller is being judged against route() — the first draft\'s false positive');

if (!positiveOk || !negativeOk || !selfHandledExcluded) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — self-proof failed; the gate cannot demonstrate detection (C-0.4, R-13.4).');
  line('');
  process.exit(1);
}

// ── Discovery (tree-wide) ───────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'build', 'out', '.turbo', '.vite']);
const controllerFiles = [];
const moduleFiles = [];
const routerFiles = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (!e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) continue;
    if (e.name.endsWith('.controller.ts')) { controllerFiles.push(full); continue; }
    if (e.name.endsWith('.module.ts')) { moduleFiles.push(full); continue; }
    if (e.name === 'api.ts') routerFiles.push(full);
  }
})(path.join(ROOT, 'packages'));

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const readOf = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// The dispatcher is whichever api.ts actually exports `route(`. Discovered, not hard-coded:
// a gate that names its input by path stops working the moment the input moves.
const routerSrcs = routerFiles.map(readOf).filter((s) => /export function route\s*\(/.test(s));
const routerPaths = routerFiles.filter((p) => /export function route\s*\(/.test(readOf(p)));
const routeSrc = routerSrcs.join('\n');
const controllerSrcs = controllerFiles.map(readOf);
const moduleSrc = moduleFiles.map(readOf).join('\n');

line('\n1. Discovery');
check(`the deployed HTTP surface was found (${controllerFiles.length} controller(s), ${routerPaths.length} dispatcher(s), ${moduleFiles.length} module(s))`,
  controllerFiles.length > 0 && routerPaths.length > 0 && moduleFiles.length > 0,
  controllerFiles.length && routerPaths.length && moduleFiles.length
    ? `dispatcher: ${routerPaths.map(rel).join(', ')}`
    : 'nothing to compare — a scanner that finds no surface cannot prove parity');

const routeActions = routeActionsOf(routeSrc);
const routeTopLevel = routeTopLevelOf(routeSrc);
const controllerActions = new Set(controllerSrcs.flatMap((s) => [...controllerActionsOf(s)]));
const controllerPrefixes = new Set(controllerSrcs.flatMap((s) => [...controllerPrefixesOf(s)]));
const declaredControllers = controllerSrcs.flatMap(declaredControllersOf);

// A controller is route()-backed if it delegates to the dispatcher. Only those make a
// claim about what route() serves, and only those are subject to the orphan direction.
const isRouteBacked = (s) => /\broute\s*\(/.test(s);
const routeBackedSrcs = controllerSrcs.filter(isRouteBacked);
const selfHandledFiles = controllerFiles.filter((_, i) => !isRouteBacked(controllerSrcs[i])).map(rel);
const backedActions = new Set(routeBackedSrcs.flatMap((s) => [...controllerActionsOf(s)]));
const backedPrefixes = new Set(routeBackedSrcs.flatMap((s) => [...controllerPrefixesOf(s)]));

check(`the extracted surface is non-trivial (${routeActions.size} action(s), ${routeTopLevel.size} top-level path(s), ${controllerActions.size} mapping(s), ${controllerPrefixes.size} prefix(es))`,
  routeActions.size >= 5 && controllerActions.size >= 5 && routeTopLevel.size >= 1 && controllerPrefixes.size >= 1,
  'a regex that silently matches nothing reports parity for an empty set');

// ── 2. Parity, both directions ──────────────────────────────────────────────
line('\n2. Parity — route() ↔ controllers, both directions');

const unmappedActions = [...routeActions].filter((a) => !controllerActions.has(a)).sort();
check('HS-1  every action route() handles is mapped by a controller', unmappedActions.length === 0,
  unmappedActions.length
    ? `route() handles these with NO controller mapping — the live server 404s: ${unmappedActions.join(', ')}`
    : `${routeActions.size} action(s), all mapped`);

const orphanActions = [...backedActions].filter((a) => !routeActions.has(a)).sort();
check('HS-2  every route()-backed controller mapping is served by route() (no dead surface)', orphanActions.length === 0,
  orphanActions.length
    ? `route()-backed controllers map these actions route() cannot handle: ${orphanActions.join(', ')}`
    : `${backedActions.size} route()-backed mapping(s), all served`);

const unmappedPrefixes = [...routeTopLevel].filter((p) => !controllerPrefixes.has(p)).sort();
check('HS-3  every top-level path route() serves has a controller prefix', unmappedPrefixes.length === 0,
  unmappedPrefixes.length
    ? `route() serves these with NO @Controller('api/<path>') — the live server 404s: ${unmappedPrefixes.join(', ')}`
    : `${routeTopLevel.size} top-level path(s), all claimed`);

const orphanPrefixes = [...backedPrefixes].filter((p) => !routeTopLevel.has(p)).sort();
check('HS-4  every route()-backed controller prefix is served by route() (no dead top-level surface)', orphanPrefixes.length === 0,
  orphanPrefixes.length
    ? `route()-backed controllers claim these prefixes route() does not serve: ${orphanPrefixes.join(', ')}`
    : `${backedPrefixes.size} route()-backed prefix(es), all served`
      + (selfHandledFiles.length ? ` · out of scope (self-handled, never call route()): ${selfHandledFiles.join(', ')}` : ''));

// ── 2b. The method dimension ────────────────────────────────────────────────
// An action mapped under the wrong verb passes every check above: both sides name it.
// The live server still answers 404/405, because NestJS routes on (method, path).
const routePairs = routeMethodPairsOf(routeSrc);
const backedPairs = new Set(routeBackedSrcs.flatMap((s) => [...controllerMethodPairsOf(s)]));
const pairedActions = new Set([...routePairs].map((p) => p.split(' ')[1]));
// Actions whose verb route() does not state on one line are reported, never assumed
// correct: an unmeasured action is excluded from the comparison and counted, so the
// coverage of this check is visible rather than implied (R-13.3).
const verbUndetermined = [...routeActions].filter((a) => !pairedActions.has(a)).sort();

const verbMismatch = [...routePairs].filter((p) => !backedPairs.has(p)).sort();
check(`HS-6  every route() (method, action) pair is mapped under the SAME verb (${routePairs.size} pair(s) compared)`,
  verbMismatch.length === 0,
  verbMismatch.length
    ? `route() accepts these but no controller maps that verb — the live server 404s/405s: ${verbMismatch.join(', ')}`
    : `${routePairs.size} pair(s), verb-for-verb`);

check(`HS-7  the method dimension covers the action surface (${pairedActions.size}/${routeActions.size} action(s) have a statically determinable verb)`,
  verbUndetermined.length === 0,
  verbUndetermined.length
    ? `NOT MEASURED for these — route() does not state method and action together, so HS-6 cannot judge them: ${verbUndetermined.join(', ')}`
    : 'every action route() handles states its method alongside it');

// ── 3. Mounted, not merely declared ─────────────────────────────────────────
line('\n3. Registration — declared is not mounted');
const unmounted = declaredControllers.filter((c) => !moduleSrc.includes(c)).sort();
check('HS-5  every declared controller class is registered by a module', unmounted.length === 0,
  unmounted.length
    ? `these controllers exist but no module registers them — they 404 exactly like a missing one: ${unmounted.join(', ')}`
    : `${declaredControllers.length} controller class(es), all registered`);

// ── Evidence artefact ───────────────────────────────────────────────────────
const evidence = {
  evidenceId: 'http-surface-parity',
  generator: 'governance/verification/verify-http-surface-parity.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  ruleReference: ['ADR-0033', 'ADR-0069', 'C-03.14', 'R-13.4', 'R-14.20', 'D-007'],
  method: 'static extraction of route() dispatch keys and controller decorators, compared in both directions',
  selfProof: {
    positiveDetected: { actions: posUnmappedAction, prefixes: posUnmappedPrefix, unmounted: posUnmounted },
    negativeFlagged: [...negUnmappedAction, ...negUnmappedPrefix, ...negUnmounted],
  },
  dispatchers: routerPaths.map(rel),
  controllerFiles: controllerFiles.map(rel),
  routeActions: [...routeActions].sort(),
  controllerActions: [...controllerActions].sort(),
  routeTopLevel: [...routeTopLevel].sort(),
  controllerPrefixes: [...controllerPrefixes].sort(),
  declaredControllers,
  violations: { unmappedActions, orphanActions, unmappedPrefixes, orphanPrefixes, unmounted },
  verificationStatus: failures === 0 ? 'surface-parity-holds' : 'divergence',
  timestamp: new Date().toISOString(),
};
try {
  fs.mkdirSync(path.join(ROOT, 'governance', 'boundary'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'governance', 'boundary', 'http-surface-parity-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n', 'utf8');
} catch { /* evidence write is best-effort; the verdict below is authoritative */ }

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the deployed HTTP surface matches the tested one.');
  line(`${routeActions.size} action(s) + ${routeTopLevel.size} top-level path(s) compared both ways; ${declaredControllers.length} controller(s) all mounted.`);
} else {
  line(`RESULT: FAIL — ${failures} HTTP surface divergence(s). The live server does not serve what route() implements (D-007).`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
