'use strict';
/**
 * GOVERNANCE — the composition root actually carries what the surface declares.
 * ============================================================================
 * THE GAP THIS CLOSES, STATED PLAINLY.
 *
 * `GET /api/packages/{hash}` shipped declared, tested, documented and governed — and UNREACHABLE
 * IN EVERY DEPLOYMENT. `AppModule.register` mounts a conditional controller only when its
 * dependency is present on `ApiDeps`, and `composeApiDeps` — the single place that decides what a
 * deployment carries — never set `packageStore`. The route existed everywhere except in a running
 * system, and the whole suite was green over it.
 *
 * NO GATE COULD SEE IT, FOR A STRUCTURAL REASON RATHER THAN AN OVERSIGHT.
 * `verify-http-surface-parity.js` compares the dispatcher's source against controller decorators —
 * it proves the SOURCE declares the surface, and cannot see that a controller is registered behind
 * a condition nothing satisfies. `verify-http-surface.js` opens a socket, which is the only place
 * this is visible, but it probes the routes it was written against and not this one.
 *
 * So the defect lived BETWEEN the module and the deployment. That is one level out from the code
 * every other gate inspects, and it is the same blind spot that let `DELETE /api/tenants/%2e%2e`
 * survive 58 gates: every gate examined the design, and nothing examined the assembly.
 *
 * WHAT THIS GATE MEASURES. For every optional `ApiDeps` field that a controller's registration is
 * conditioned on, the composition root either SETS it, or the field is recorded here as
 * deliberately unmounted with a reason. There is no third state. A new optional dependency that
 * nobody wires turns this gate red on the day it is added rather than on the day someone notices
 * the route 404s.
 *
 * WHY AN EXPLICIT UNMOUNTED LIST RATHER THAN A WARNING. A warning is a silent skip with extra
 * steps. Naming a field here is a decision someone made and can be asked about; leaving it out is
 * a defect. The list is empty today, and that is the point.
 *
 * Run:  node governance/verification/verify-composition-root.js
 * Exit: 0 = the deployment carries what the surface declares   1 = a declared surface is unmounted
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'packages', 'tenant-onboarding-engine', 'src');
const API = path.join(ENGINE, 'engine', 'api.ts');
const MODULE = path.join(ENGINE, 'server', 'app.module.ts');
const COMPOSE = path.join(ENGINE, 'server', 'platform-adoption.ts');

/**
 * Optional `ApiDeps` fields deliberately NOT set by the composition root, each with the reason a
 * reviewer can challenge. Adding a name here is a decision; omitting one is a defect.
 */
const DELIBERATELY_UNMOUNTED = Object.freeze({
  // (empty — every conditional surface is mounted)
});

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
/** Comments stripped, so a rule is never satisfied by prose describing it. */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

line('');
line('GOVERNANCE — the composition root carries what the surface declares');
line('='.repeat(74));

// ── 1. Inputs ───────────────────────────────────────────────────────────────
//
// FAIL CLOSED. A gate that cannot find its inputs reports RED, never green: a vacuous pass here
// would recreate exactly the blind spot the gate exists to remove.
line('\n1. Inputs');
const apiSrc = bare(read(API));
const moduleSrc = bare(read(MODULE));
const composeSrc = bare(read(COMPOSE));
const found = apiSrc && moduleSrc && composeSrc;
check('the API surface, the module and the composition root were all found', Boolean(found),
  found ? 'api.ts · app.module.ts · platform-adoption.ts'
    : 'one or more inputs missing — this gate cannot report green on an unread surface');

if (!found) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — inputs missing; composition cannot be measured.');
  line('');
  process.exit(1);
}

// ── 2. What the module conditions a controller on ───────────────────────────
//
// Discovered from source rather than listed here: a gate that hard-codes the set stops measuring
// the moment someone adds a controller, which is the failure mode being fixed.
line('\n2. Conditionally-mounted surface');
const conditioned = new Map(); // depsField -> controller
const blockRe = /if\s*\(\s*deps\.([A-Za-z0-9_]+)\s*\)\s*\{([\s\S]*?)\n\s*\}/g;
for (let m; (m = blockRe.exec(moduleSrc)) !== null; ) {
  const field = m[1];
  const push = /controllers\.push\(\s*([A-Za-z0-9_]+)\s*\)/.exec(m[2]);
  if (push) conditioned.set(field, push[1]);
}
check('at least one conditionally-mounted controller was found', conditioned.size > 0,
  conditioned.size
    ? [...conditioned].map(([f, c]) => `${c} ⇐ deps.${f}`).join(' · ')
    : 'no conditional registration detected — the extractor has stopped matching, which reads as PASS and is not');

// ── 3. Every conditional dependency is decided, one way or the other ────────
line('\n3. Every conditional dependency is decided by the composition root');
// `field:` or `field,` in the composed literal, or an explicit assignment.
const setsField = (field) =>
  new RegExp(`(^|[\\s{,])${field}\\s*[:,]`, 'm').test(composeSrc)
  || new RegExp(`deps\\.${field}\\s*=`).test(composeSrc);

const unset = [];
const declaredUnmounted = [];
for (const [field, controller] of conditioned) {
  if (setsField(field)) continue;
  if (Object.prototype.hasOwnProperty.call(DELIBERATELY_UNMOUNTED, field)) {
    declaredUnmounted.push(`${field} (${controller}) — ${DELIBERATELY_UNMOUNTED[field]}`);
  } else {
    unset.push(`${controller} is mounted only when deps.${field} is set, and the composition root never sets it`);
  }
}
check('every conditionally-mounted controller has its dependency set, or is declared unmounted with a reason',
  unset.length === 0,
  unset.length
    ? `DECLARED BUT UNREACHABLE IN EVERY DEPLOYMENT:\n         ${unset.join('\n         ')}`
    : `${conditioned.size} conditional surface(s), all mounted`);

// A name left in the exemption list after it is wired is stale governance: it reads as a decision
// nobody has revisited, and the next reader trusts it.
const staleExemptions = Object.keys(DELIBERATELY_UNMOUNTED).filter((f) => setsField(f) || !conditioned.has(f));
check('no stale entry sits in the deliberately-unmounted list', staleExemptions.length === 0,
  staleExemptions.length ? `wired or no longer conditional, but still exempted: ${staleExemptions.join(', ')}`
    : `${Object.keys(DELIBERATELY_UNMOUNTED).length} declared exemption(s)`);
if (declaredUnmounted.length) {
  line(`         deliberately unmounted: ${declaredUnmounted.join('; ')}`);
}

// ── 4. The retrieval surface specifically ───────────────────────────────────
//
// Named because ADR-0079 and ADR-0070 both turn on it, and because it is the instance that
// produced this gate. The generic sweep above would catch it; this says so out loud.
line('\n4. Sealed package retrieval (ADR-0079, ADR-0070 §6 step 2)');
const declaresStore = /packageStore\s*\?:/.test(apiSrc);
check('ApiDeps declares the sealed package store', declaresStore,
  declaresStore ? 'packageStore?: SealedPackageStore' : 'not declared');
const mountsStore = /packageStore/.test(composeSrc);
check('the composition root mounts it', mountsStore,
  mountsStore ? 'packageStore is set by composeApiDeps'
    : 'GET /api/packages/{hash} is unreachable in every deployment');

// R-06.13 again, at the deployment layer: a store mounted through the bare constructor would serve
// reads with nothing enforcing its retention. The factory is the only construction that starts it.
const viaService = /sealedPackageService\s*\(/.test(composeSrc);
const bareConstructor = /new\s+SealedPackageStore\s*\(/.test(composeSrc);
check('it is obtained from sealedPackageService(), so retention is running (R-06.13)',
  viaService && !bareConstructor,
  bareConstructor ? 'constructed directly — the purge driver is never started'
    : viaService ? 'sealedPackageService() — store and purge driver started together'
      : 'no service construction found');

// R-06.15: the sink is required at the type level, but a deployment can still pass one that does
// nothing. The alerting obligation is the deployment's, so it is measured where the deployment is.
const sink = /onPurgeFailure\s*:\s*\(/.test(composeSrc);
const sinkAlerts = /onPurgeFailure[\s\S]{0,400}?(console\.error|logger\.error|\.error\()/.test(composeSrc);
check('the deployment supplies a purge alert sink that actually raises (R-06.15)', sink && sinkAlerts,
  !sink ? 'no alert sink supplied'
    : sinkAlerts ? 'failures are raised at error level' : 'a sink is supplied but it does not raise');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the deployment carries every surface it declares.');
} else {
  line(`RESULT: FAIL — ${failures} composition property violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
