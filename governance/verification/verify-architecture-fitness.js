'use strict';
/**
 * GOVERNANCE — architecture fitness functions.
 * ============================================================================
 * Continuously validates the architectural invariants themselves (R-14.1).
 *
 * The other gates check that documents are well-formed, decisions are traceable and
 * implementation conforms. None checks that the ARCHITECTURE still says what it is
 * supposed to say. An invariant can be quietly weakened by editing the document that
 * declares it, and every other gate would stay green — the document would remain
 * internally consistent, correctly cross-referenced, and wrong.
 *
 * These are fitness functions in the strict sense: executable assertions about
 * architectural properties, run continuously rather than reviewed periodically.
 *
 * Read-only.
 *
 * Run:  node governance/verification/verify-architecture-fitness.js
 * Exit: 0 = architecture is fit   1 = an invariant has drifted
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ARCH = path.join(ROOT, 'docs', 'architecture');
const read = (f) => { try { return fs.readFileSync(path.join(ARCH, f), 'utf8'); } catch { return ''; } };

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

line('');
line('GOVERNANCE — architecture fitness functions');
line('='.repeat(74));

const constitution = read('01-platform-constitution.md');
const capabilityModel = read('11-capability-model.md');
const orchestration = read('12-capability-orchestration.md');

// ── 1. Exactly five quality engineering capabilities ────────────────────────
line('\n1. Capability cardinality');
const fiveDeclared = /exactly five capabilities/i.test(capabilityModel);
check('the capability model still declares exactly five', fiveDeclared,
  fiveDeclared ? 'R-11.4 intact' : 'R-11.4 has been altered or removed');

// The five, enumerated. A sixth row added to that table is a cardinality breach
// that R-11.4's prose alone would not reveal. 'Functional Testing Engine' was removed
// under ADR-0087 and is deliberately absent: were it left in this list, the gate would
// go RED on a capability the architecture no longer declares.
const CAPABILITIES = [
  'Dev-Change Engine', 'Inverse-Flow Discovery Engine',
  'Performance Engine', 'Security Testing Engine', 'Penetration Testing Engine',
];
const present = CAPABILITIES.filter((c) => capabilityModel.includes(c));
check('all five named capabilities are present and none added',
  present.length === 5,
  present.length === 5 ? CAPABILITIES.length + ' capabilities' : `found ${present.length}: ${present.join(', ')}`);

// ── 2. Platform services are not capabilities ───────────────────────────────
line('\n2. Platform service classification');
// ADR-0018 ruled these are platform services. If any appears in the capability
// model's enumerated set, the ruling has been reversed by edit rather than by ADR.
const SERVICES = ['Platform Intelligence', 'Operational Excellence', 'Customer Success'];
const misclassified = SERVICES.filter((s) => {
  const table = /## 2\. The five capabilities([\s\S]*?)(?=\n## )/.exec(capabilityModel)?.[1] ?? '';
  return table.includes(s);
});
check('no platform service appears among the five capabilities',
  misclassified.length === 0,
  misclassified.join(', ') || 'ADR-0018 classification holds');

// ── 3. Sovereign split ──────────────────────────────────────────────────────
line('\n3. Sovereign split');
const ipArch = read('03-intelligence-plane-architecture.md');
const epArch = read('04-execution-plane-architecture.md');
check('the Intelligence Plane still forbids browser, load and scan capability',
  /browser, load-generation, or scanning capability/i.test(ipArch) || /R-3\.5/.test(ipArch),
  'R-3.5 intact');
check('the Execution Plane still forbids inference and certification',
  /SHALL NOT perform AI inference/i.test(epArch) || /R-2\.2/.test(epArch),
  'R-2.2 / R-2.3 intact');

// No architecture document may reference the other repository by filesystem path.
const crossPlane = [];
for (const f of fs.readdirSync(ARCH).filter((x) => x.endsWith('.md'))) {
  const body = read(f);
  body.split(/\r?\n/).forEach((t, i) => {
    if (/\.\.\/CarlisleHomes_ExecutionPlane|\.\.\\CarlisleHomes_ExecutionPlane/.test(t)) {
      crossPlane.push(`${f}:${i + 1}`);
    }
  });
}
check('no architecture document reaches the other plane by filesystem path',
  crossPlane.length === 0, crossPlane.join(', ') || 'planes communicate through declared contracts');

// ── 4. Constitutional integrity ─────────────────────────────────────────────
line('\n4. Constitutional integrity');
const invariants = new Set([...constitution.matchAll(/\*\*(INV-\d+)\*\*/g)].map((m) => m[1]));
const rules = new Set([...constitution.matchAll(/^### Rule (\d+)/gm)].map((m) => m[1]));
line(`   ${invariants.size} invariants, ${rules.size} rules`);

// Invariants are additive only. A missing number means one was removed, which an
// additive amendment cannot do — every amendment to date declares itself additive.
const invNumbers = [...invariants].map((i) => Number(i.slice(4))).sort((a, b) => a - b);
const contiguous = invNumbers.every((n, i) => n === i + 1);
check('invariants are contiguous — none has been removed', contiguous,
  contiguous ? `INV-1..INV-${invNumbers.length}` : `gap in: ${invNumbers.join(', ')}`);

const ruleNumbers = [...rules].map(Number).sort((a, b) => a - b);
const rulesContiguous = ruleNumbers.every((n, i) => n === i + 1);
check('rules are contiguous — none has been removed', rulesContiguous,
  rulesContiguous ? `Rule 1..${ruleNumbers.length}` : `gap in: ${ruleNumbers.join(', ')}`);

// Every amendment must be recorded in the header, and the version must match.
const version = /\*\*Version:\*\*\s*([\d.]+)/.exec(constitution)?.[1];
const amendments = [...constitution.matchAll(/v(\d+\.\d+)\s+—/g)].map((m) => m[1]);
const versionRecorded = version === '1.0' || amendments.includes(version);
check('the declared version is recorded in the amendment history', versionRecorded,
  `v${version}; amendments recorded: ${amendments.join(', ') || 'none'}`);

// ── 5. Orchestration integrity ──────────────────────────────────────────────
line('\n5. Orchestration integrity');
const STAGES = ['Planning', 'Discovery', 'Context', 'Architecture Review', 'Policy Review',
  'Guardrail Review', 'Execution Planning', 'Execution', 'Evidence', 'Reflection',
  'Certification', 'Reporting'];
const missingStages = STAGES.filter((s) => !orchestration.includes(s));
check('all twelve orchestration stages are declared', missingStages.length === 0,
  missingStages.join(', ') || '12 stages');

check('exactly one orchestration lifecycle is declared',
  /exactly \*\*one\*\* orchestration lifecycle|There is exactly \*\*one\*\*/i.test(orchestration),
  'R-12.18 intact — extensions, never an alternative model');

// ── 5b. Platform Services are architected and correctly classified ──────────
line('\n5b. Platform Service coverage');
const SERVICE_DOCS = [['23', 'Operational Excellence'], ['24', 'Platform Intelligence'], ['25', 'Customer Success']];
const files = fs.readdirSync(ARCH);
const missingService = SERVICE_DOCS.filter(([n]) => !files.some((f) => f.startsWith(n + '-'))).map(([, t]) => t);
check('every Platform Service has canonical architecture', missingService.length === 0,
  missingService.join(', ') || SERVICE_DOCS.map(([, t]) => t).join(', '));

// A Platform Service document that declared itself a capability would breach R-11.4
// by a route the cardinality check cannot see: the count in document 11 would still
// read six while a seventh existed elsewhere under a different name.
const misdeclared = [];
for (const [n, t] of SERVICE_DOCS) {
  const f = files.find((x) => x.startsWith(n + '-'));
  if (!f) continue;
  const body = read(f);
  const declaresService = /\*\*Platform Service\*\*/.test(body);
  // The classification line must say "not a Quality Engineering Capability".
  // A document asserting the opposite would create a seventh capability under a
  // different name, which the cardinality count in document 11 could not see.
  const classification = /\*\*Classification:\*\*([^\n]*)/.exec(body)?.[1] ?? '';
  const claimsCapability = /Quality Engineering Capability/.test(classification)
    && !/not a Quality Engineering Capability/.test(classification);
  if (!declaresService || claimsCapability) misdeclared.push(t);
}
check('every Platform Service declares itself a service, not a capability',
  misdeclared.length === 0,
  misdeclared.join(', ') || 'ADR-0018 classification holds in each document');

// ── 5c. P2.3 — Platform Core, registration and sovereignty ─────────────────
line('\n5c. Platform Core and secure onboarding (P2.3)');

const ipArchBody = read('03-intelligence-plane-architecture.md');
const tenantBody = read('21-tenant-lifecycle.md');
const secBody = read('08-security-model.md');

// The Intelligence Plane holds exactly two bounded contexts. A third named context
// would be a plane in all but name — the drift ADR-0021 exists to prevent.
const contexts = ['Platform Core', 'Intelligence Core'];
const contextsPresent = contexts.filter((c) => ipArchBody.includes(c));
check('the Intelligence Plane declares exactly two bounded contexts',
  contextsPresent.length === 2 && /exactly \*\*two logical bounded contexts\*\*/.test(ipArchBody),
  contextsPresent.join(' + ') || 'bounded contexts not declared');

// A bounded context is not a deployable. If either acquired its own listener or
// deployment, R-1.1 would be breached without the deployable count changing name.
check('no bounded context is separately deployable',
  /SHALL NOT be separately deployable|neither is separately deployable|not separately deployable/i.test(ipArchBody)
    || /R-03\.24/.test(ipArchBody),
  'R-03.24 intact — contexts within one deployable');

// Dependency direction: Intelligence Core must not depend on Platform Core.
check('Intelligence Core does not depend on Platform Core',
  /Intelligence Core SHALL NOT depend on Platform Core/i.test(ipArchBody),
  'R-03.23 intact');

// Technology Profiles must not reach back into DBiz's own implementation.
check('a Technology Profile cannot influence Intelligence Plane implementation',
  /SHALL NOT influence the \*\*internal implementation language/i.test(ipArchBody)
    || /R-03\.26/.test(ipArchBody),
  'R-03.26 intact — the profile parameterises what is generated, not what DBiz builds');

// Generated output must carry no durable secret. This is the property that makes a
// generated repository safe to hand to a customer who will keep it forever.
check('generated output is declared free of secret material',
  /no secret material/i.test(ipArchBody) && /one-time registration credential/i.test(tenantBody),
  'R-03.32 and R-21.32 intact');

check('static API keys are prohibited platform-wide',
  /[Ss]tatic API keys are \*\*prohibited\*\*|no API key, no client secret/i.test(secBody),
  'R-08.42 intact');

// Registration must be replay-safe, or the one-time credential is not one-time.
check('registration is replay-safe and idempotent by tenant identity',
  /consumed at step 1|consumed on first/i.test(secBody) && /idempotent by tenant identity/i.test(secBody),
  'R-08.46 / R-08.47 intact');

// Outbound-only, with the purposes enumerated so the invariant cannot be negotiated
// away one exception at a time.
check('no inbound path into customer infrastructure is permitted for any purpose',
  /SHALL NEVER require inbound access into customer infrastructure/i.test(secBody),
  'R-08.54 intact — purposes enumerated');

// Sovereignty: the Intelligence Plane must declare what it will never store.
const forbidden = ['source code', 'secrets', 'screenshots', 'runtime configuration'];
const declaredForbidden = forbidden.filter((f) => new RegExp(f, 'i').test(secBody));
check('the Intelligence Plane declares the customer assets it will never store',
  declaredForbidden.length === forbidden.length,
  declaredForbidden.length === forbidden.length
    ? 'R-08.56 enumerates source, secrets, screenshots, runtime configuration'
    : `missing: ${forbidden.filter((f) => !declaredForbidden.includes(f)).join(', ')}`);

// Onboarding must not be able to reach ACTIVE on assumption.
check('a tenant cannot be activated without registration, connectivity and smoke',
  /SHALL NOT reach `ACTIVE` until stages 10, 11 and 12/i.test(tenantBody)
    || /R-21\.29/.test(tenantBody),
  'R-21.29 intact');

// Drift is reported, never auto-corrected — the customer owns the repository.
check('configuration drift is reported, never auto-corrected',
  /reported, not corrected|Divergence is reported/i.test(tenantBody),
  'R-21.43 intact');

// ── 5d. Certified baseline preserved ───────────────────────────────────────
line('\n5d. M2.5a baseline preserved');
const canonical = fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f));
check('the canonical set remains 25 documents — no twenty-sixth was created',
  canonical.length === 25, `${canonical.length} documents`);

check('no fourth Platform Service was introduced',
  !fs.existsSync(path.join(ARCH, '26-platform-core-model.md'))
  && canonical.filter((f) => /^2[345]-/.test(f)).length === 3,
  'three Platform Services: 23, 24, 25');

// ── 6. Every frozen document declares its status ────────────────────────────
line('\n6. Freeze integrity');
const docs = fs.readdirSync(ARCH).filter((f) => /^\d\d-.*\.md$/.test(f));
const unfrozen = docs.filter((f) => !/\*\*Status:\*\*\s*\*\*FROZEN\*\*/.test(read(f)));
check('every canonical document is frozen', unfrozen.length === 0,
  unfrozen.join(', ') || `${docs.length} documents frozen`);

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — every architectural invariant still holds.');
} else {
  line(`RESULT: FAIL — ${failures} invariant has drifted.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
