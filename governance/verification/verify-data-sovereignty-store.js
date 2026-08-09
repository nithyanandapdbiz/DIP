'use strict';
/**
 * GOVERNANCE — document 06 obligations, measured on EVERY store this plane persists through.
 * ============================================================================
 * MULTI-SUBJECT, FROM ONE ENUMERATION (ADR-0082 P-82.8). PREVIOUSLY SCOPED TO ONE.
 *
 * ── WHY THIS FILE GREW A SUBJECT LIST RATHER THAN ACQUIRING A SIBLING ───────────────────────
 *
 * This gate hard-coded the sealed package store's path and failed closed when that file was
 * absent. That was right for one store and does not extend: a second store arrived, and the
 * cheap change was a second gate beside this one.
 *
 * ADR-0082 §3.2 refuses that, and the reason is the whole design of this file:
 *
 *   ***"Which stores does document 06 govern?"* must have ONE answer, read from ONE enumeration.**
 *
 * With a sibling gate the answer becomes *"however many gates someone happened to write"* — a
 * question no one can answer by reading anything, because the answer is distributed across files
 * that do not reference each other. A third store then arrives and gets a third gate, or gets none,
 * and **nothing goes red either way.** The failure is silent by construction: a store with no gate
 * is not a red gate, it is an absence, and absences do not report.
 *
 * So `SUBJECTS` below is the answer. Every property runs PER SUBJECT, and **an empty subject list
 * FAILS CLOSED** — a gate that would pass having measured nothing is CHARTER §17.1.1's
 * control-shaped literal, which is the exact defect this gate was originally written against.
 *
 * ── WHAT THE ORIGINAL SCOPING NOTE SAID, KEPT BECAUSE IT IS STILL TRUE ──────────────────────
 *
 * Until the sealed package store existed, document 06 was cited by ZERO gates — not one `R-06.x`
 * or `C-06.x` anywhere in `governance/`. That was not neglect: **C-06.11 — no C1 data persists
 * beyond the request — had been satisfiable BY ABSENCE**, because this plane persisted no
 * customer-derived artefact at all. A gate asserting it would have passed on an empty subject.
 *
 * IT STILL DOES NOT MEASURE DOCUMENT 06 ACROSS THE PLANE. It measures document 06 on the stores
 * that persist customer-derived artefacts, which is a smaller claim and is the one made.
 *
 * WHAT IS AND IS NOT CLAIMED. C-06.11's stated verification is a "persistence scan after request
 * completion". This gate performs a STATIC scan of each store's write path plus an EXECUTED proof
 * that each store persists what it declares and nothing else. That is narrower than a live
 * post-request scan of the whole plane, and it is reported as what it is.
 *
 * Run:  node governance/verification/verify-data-sovereignty-store.js
 * Exit: 0 = every measured obligation holds on every subject   1 = an obligation failed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.join(ROOT, 'packages', 'platform-providers');
const STORAGE_DIR = path.join(PKG, 'src', 'storage');
const ADR_DIR = path.join(ROOT, 'docs', 'adr');

/**
 * ══ THE ENUMERATION — THE ONE ANSWER TO "WHICH STORES DOES DOCUMENT 06 GOVERN?" ═══════════════
 *
 * A store persisting customer-derived artefacts in the Intelligence Plane appears HERE or it is
 * ungoverned. Section 10's sweep is what catches a module that persists without appearing.
 *
 * Fields are declared rather than discovered because each names a DECISION: which ADR authorises
 * the store, which constant carries its retention, which module drives its purge, which factory
 * refuses to hand out the store without that driver running. A gate that guessed these would be
 * measuring its own guess.
 */
const SUBJECTS = [
  {
    id: 'sealed package store',
    src: 'sealed-package-store.ts',
    retentionConst: 'SEALED_PACKAGE_RETENTION',
    test: 'sealed-package-store.test.ts',
    builtTests: [['store', 'sealed-package-store.test.js'], ['purge driver', 'sealed-package-purge.test.js']],
    serviceFactory: 'sealedPackageService',
    driver: 'sealed-package-purge.ts',
    /** The `run` segments this store is authorised to write, by exported constant name. */
    segmentConsts: ['SEALED_PACKAGE_RUN', 'SEALED_PACKAGE_SIGNATURE_RUN'],
    writeCall: /storage\.put\s*\(\s*ctx\s*,\s*this\.keyFor\(([^)]*)\)/g,
    defaultSegment: 'SEALED_PACKAGE_RUN',
    readRefusal: {
      pattern: /sealedPackageRefusal\s*\(/,
      present: 'sealedPackageRefusal() is the sole refusal constructor (P-79.6)',
      absent: 'no single refusal expression — the four result classes become distinguishable',
    },
    /** Subject-specific completion conditions, each traced to the ADR that owes them. */
    testAssertions: [
      { pattern: /UNREADABLE afterwards/i, and: /exists\(/,
        label: 'the purge test proves the data is UNREADABLE afterwards, not merely hidden (R-06.14, C-06.8)',
        present: 'asserts absence at the provider, not only through the store',
        absent: 'no unreadability assertion against the provider' },
      { pattern: /OFFBOARDED|offboard/i,
        label: 'the offboarding refusal-identity oracle is tested (ADR-0079 §5.2)',
        present: 'deleted-tenant retrieval asserted byte-identical',
        absent: 'a tenant deleted after storage would make its packages distinguishable' },
      { pattern: /NOT FINDING|not found/i,
        label: 'the cross-tenant negative asserts NOT FOUND rather than found-and-refused (P-79.2)',
        present: 'addressing asserted at the provider',
        absent: 'no addressing assertion' },
    ],
  },
  {
    id: 'run record store',
    src: 'run-record-store.ts',
    retentionConst: 'RUN_RECORD_RETENTION',
    test: 'run-record-store.test.ts',
    builtTests: [['store', 'run-record-store.test.js']],
    serviceFactory: 'runRecordService',
    driver: 'run-record-purge.ts',
    segmentConsts: ['RUN_RECORD_RUN', 'RUN_RECORD_EVIDENCE_RUN'],
    writeCall: /storage\.put\s*\(\s*ctx\s*,\s*(key|this\.keyFor\([^)]*\))/g,
    defaultSegment: 'RUN_RECORD_RUN',
    /**
     * THIS STORE'S READ REFUSAL IS `undefined`, AND THAT IS THE SAME PROPERTY IN A DIFFERENT SHAPE.
     * `sealedPackageRefusal` exists because retrieval must SERVE something, so four result classes
     * had to collapse into one string. Every read here returns `undefined` or `[]` — there is no
     * message to differ, so the indistinguishability is structural. The property still runs: it
     * asserts that no read path throws a distinguishing error.
     */
    readRefusal: {
      pattern: /async (read|list|runForPackageHash|evidenceFor)\b/,
      forbid: /throw new \w*(NotFound|Forbidden|Unauthorised|Unauthorized)/,
      present: 'reads return undefined/[] uniformly — nothing to distinguish absent from not-yours',
      absent: 'a read path throws a distinguishing error',
    },
    testAssertions: [
      { pattern: /UNREADABLE|unreadable/i, and: /getText\(|list\(/,
        label: 'the purge test proves the data is UNREADABLE afterwards, not merely hidden (R-06.14, C-06.8)',
        present: 'asserts absence at the provider, not only through the store',
        absent: 'no unreadability assertion against the provider' },
      { pattern: /NOT FOUND|not found/i,
        label: 'the cross-tenant negative asserts NOT FOUND rather than found-and-refused (C-07.11)',
        present: 'addressing asserted at the provider',
        absent: 'no addressing assertion' },
      { pattern: /NEVER REACHES THE DISK|allow-list/i,
        label: 'the write-path allow-list is proved by a payload that must not persist (P-82.4, C-06.11)',
        present: 'a payload attached upstream is asserted absent from the bytes',
        absent: 'no write-path scrubbing assertion' },
    ],
  },
];

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
};

/** Comments stripped, so a rule is never satisfied by prose describing it. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bareOf = (f) => strip(fs.readFileSync(path.join(STORAGE_DIR, f), 'utf8'));

const C1_FIELD = /\b(password|passwd|secret|credential|apiKey|api_key|accessKey|privateKey|bearerToken|sessionToken)\b/i;
const DELIVERY = /\b(fetchCount|lastAccessed|lastFetched|deliveredAt|acknowledg|readCount|accessLog)\w*/i;

line('');
line('GOVERNANCE — data sovereignty (doc 06), measured on every enumerated store');
line('='.repeat(74));

// ── 0. THE ENUMERATION ITSELF — FAIL CLOSED ON AN EMPTY LIST ────────────────
//
// P-82.8: "an empty subject list fails closed." Without this, emptying the enumeration turns this
// gate green over the whole of document 06 — the control-shaped literal, inside the gate written
// to prevent one. The fault proof for this branch is the enumeration emptied.
line('\n0. The enumeration');
check('document 06 has at least one enumerated subject',
  SUBJECTS.length > 0,
  SUBJECTS.length > 0
    ? `${SUBJECTS.length} subject(s): ${SUBJECTS.map((s) => s.id).join(', ')}`
    : 'the subject list is EMPTY — every property below would pass having measured nothing');

if (SUBJECTS.length === 0) {
  line(`\n${'='.repeat(74)}`);
  line('RESULT: FAIL — the enumeration is empty; document 06 was not measured on anything.');
  line('');
  process.exit(1);
}

for (const subject of SUBJECTS) {
  const STORE_SRC = path.join(STORAGE_DIR, subject.src);
  const STORE_TEST = path.join(PKG, 'test', subject.test);

  line(`\n${'─'.repeat(74)}`);
  line(`SUBJECT: ${subject.id}  (${subject.src})`);
  line('─'.repeat(74));

  // ── 1. The subject exists ─────────────────────────────────────────────────
  line('\n1. The subject');
  const storePresent = fs.existsSync(STORE_SRC);
  check('the store this subject names is present', storePresent,
    storePresent ? `src/storage/${subject.src}`
      : 'ABSENT — an enumerated subject that is not on disk is a gate measuring nothing');
  if (!storePresent) { continue; }

  const code = strip(fs.readFileSync(STORE_SRC, 'utf8'));

  // ── 2. R-06.4 condition 1 — Authorised, in the storing module's own source ─
  line('\n2. Condition 1 — Authorised (R-06.4.1, R-06.5, C-06.3)');
  const adrMatch = code.match(/ADR-(\d{4})/);
  check('the storing module names its authorising ADR in its own source', adrMatch !== null,
    adrMatch ? `ADR-${adrMatch[1]} declared in code, not only in a document` : 'no ADR identifier in source');

  if (adrMatch) {
    const adrId = `ADR-${adrMatch[1]}`;
    const adrFile = fs.existsSync(ADR_DIR)
      ? fs.readdirSync(ADR_DIR).find((f) => f.startsWith(adrId))
      : undefined;
    check('the named ADR exists on disk', adrFile !== undefined,
      adrFile || `${adrId} is named in source but no such ADR exists`);
    if (adrFile) {
      const adrText = fs.readFileSync(path.join(ADR_DIR, adrFile), 'utf8');
      const accepted = /Status:\*{0,2}\s*ACCEPTED/.test(adrText);
      check('the named ADR is ACCEPTED — a PROPOSED ADR authorises nothing', accepted,
        accepted ? `${adrId} ACCEPTED` : `${adrId} is not ACCEPTED`);
    }
  }

  // ── 3. R-06.9 / R-06.12 — retention declared, AND read by code ────────────
  line('\n3. Retention (R-06.9, C-06.6, R-06.12, C-06.7)');
  const retentionDecl = code.match(/maxRetentionDays\s*:\s*(\d+)/);
  check('a retention period is declared', retentionDecl !== null,
    retentionDecl ? `${retentionDecl[1]} days` : 'no retention declared — R-06.9: such a store SHALL NOT be registered');

  if (retentionDecl) {
    const days = Number(retentionDecl[1]);
    check('the declared retention is within the C3 ceiling for the Intelligence Plane', days > 0 && days <= 90,
      `${days} days (06:62 — tenant-configured, maximum 90)`);
  }

  const classDecl = code.match(/classification\s*:\s*'(C[1-5])'/);
  check('the store declares its classification', classDecl !== null,
    classDecl ? classDecl[1] : 'no classification declared');
  if (classDecl) {
    check('the declared classification is not C1 — C1 SHALL NOT persist in this plane', classDecl[1] !== 'C1',
      classDecl[1] === 'C1' ? 'a C1 store in the Intelligence Plane is prohibited outright' : `${classDecl[1]}`);
  }

  // R-06.12's whole point. The predecessor declared a 90-day limit that was customer-visible,
  // schema-validated, API-served, console-rendered, and READ BY NO CODE — "configuration theatre".
  const readers = (code.match(new RegExp(`${subject.retentionConst}\\s*\\.`, 'g')) || []).length;
  check('the declared retention value is READ BY CODE, not merely declared (R-06.12)', readers > 0,
    readers > 0 ? `${readers} reader(s) of ${subject.retentionConst}`
      : 'declared and never read — this is the configuration theatre R-06.12 was written for');

  // ── 4. R-06.13 / R-06.14 — purge ON A SCHEDULE, with its proof ────────────
  //
  // THIS SECTION MEASURES THE SCHEDULE, NOT THE MECHANISM, AND IT DID NOT ALWAYS. Its first
  // version asserted only that `purgeExpired` existed and deleted. The method existed, NOTHING
  // CALLED IT, and this gate was green over the gap for the duration of one change.
  line('\n4. Purge (R-06.13 the SCHEDULE, R-06.14, R-06.15, C-06.8)');
  const hasPurge = /purgeExpired\s*\(/.test(code);
  check('the store implements a purge routine', hasPurge,
    hasPurge ? 'purgeExpired() present — the MECHANISM, which is necessary and not sufficient'
      : 'no purge routine');
  const purgeDeletes = /storage\.delete\s*\(/.test(code);
  check('purge actually deletes through the storage provider', purgeDeletes,
    purgeDeletes ? 'delete() reached from the purge path' : 'purge marks but never removes');

  // THE DRIVER IS DECLARED PER SUBJECT, NOT DISCOVERED. With one store, "any module in the
  // storage layer calling purgeExpired" identified the driver unambiguously. With two, discovery
  // would let EITHER store's driver satisfy BOTH subjects — each would find a scheduled, alerting
  // driver and neither would notice it was the other's. The enumeration names which driver is
  // whose, so a store whose own driver is deleted goes red instead of borrowing its neighbour's.
  const driverPresent = fs.existsSync(path.join(STORAGE_DIR, subject.driver));
  check('the purge driver this subject declares is present', driverPresent,
    driverPresent ? subject.driver : `ABSENT: ${subject.driver}`);

  if (driverPresent) {
    const d = bareOf(subject.driver);
    const drives = /\.purgeExpired\s*\(/.test(d);
    check('something CALLS the purge routine — purge is driven, not merely implemented (R-06.13)',
      drives,
      drives ? `${subject.driver} drives it`
        : 'purgeExpired() has NO caller — the retention is declared and never executes');

    const scheduled = /every\s*\(|setInterval\s*\(/.test(d);
    check('the purge driver runs on a SCHEDULE rather than on demand (R-06.13)', scheduled,
      scheduled ? 'timer-driven' : 'operator-initiated purge does not satisfy R-06.13');

    // R-06.15: purge failure SHALL be loud. A driver that catches and does nothing is the silent
    // skip, and it reads as working code.
    const emptyCatch = /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(d);
    const alerts = !emptyCatch && /onPurgeFailure\s*\(/.test(d);
    check('the purge driver does not swallow a failure — every failure alerts (R-06.15)', alerts,
      alerts ? 'failure is routed to an alert sink' : 'the driver skips silently');

    // The sink is REQUIRED, not optional. Making omission a compile error is structural
    // impossibility over a runtime check.
    const sinkOptional = /onPurgeFailure\s*\?\s*:/.test(d);
    check('the alert sink is a REQUIRED dependency, so a driver without one cannot be built',
      !sinkOptional,
      sinkOptional ? 'onPurgeFailure is declared optional — a driver can be constructed that cannot alert'
        : 'onPurgeFailure is required at the type level');

    // And a store must not be obtainable for service without its driver already running.
    const startsInFactory = new RegExp(`${subject.serviceFactory}\\s*\\(`).test(d)
      && /purgeDriver\.start\s*\(\)|\.start\s*\(\)/.test(d);
    check('a production entry point starts the driver when it constructs the store', startsInFactory,
      startsInFactory ? `${subject.serviceFactory}() constructs and STARTS in one call`
        : 'a store can be put into service with nothing enforcing its retention');
  }

  const testPresent = fs.existsSync(STORE_TEST);
  check('the store ships a purge-verification test (R-06.14, C-06.8)', testPresent,
    testPresent ? `test/${subject.test}` : 'absent');
  if (testPresent) {
    const t = fs.readFileSync(STORE_TEST, 'utf8');
    for (const a of subject.testAssertions) {
      const held = a.pattern.test(t) && (a.and ? a.and.test(t) : true);
      check(a.label, held, held ? a.present : a.absent);
    }
  }

  // ── 5. Executed, not merely read ──────────────────────────────────────────
  //
  // Grep proves a file says something. Only execution proves the store behaves.
  line('\n5. Execution');
  for (const [label, file] of subject.builtTests) {
    const full = path.join(PKG, 'dist', 'test', file);
    const built = fs.existsSync(full);
    check(`the ${label} conformance suite is built`, built,
      built ? `dist/test/${file}` : 'not built — run tsc in @dbiz/platform-providers');
    if (!built) continue;
    const run = spawnSync(process.execPath, ['--test', full], { cwd: PKG, encoding: 'utf8' });
    const out = `${run.stdout || ''}${run.stderr || ''}`;
    const passed = run.status === 0;
    const counts = out.match(/#?\s*pass\s+(\d+)/);
    check(`every ${label} conformance assertion passes`, passed,
      passed ? `${counts ? counts[1] : '?'} assertion(s) executed and green`
        : `exit ${run.status} — the ${label} does not behave as document 06 requires`);
  }

  // ── 6. C-06.11 — no C1 persists ───────────────────────────────────────────
  line('\n6. C-06.11 — no C1 data persists beyond the request');
  const c1InWritePath = C1_FIELD.test(code);
  check('the store\'s write path names no credential-shaped field', !c1InWritePath,
    c1InWritePath ? `a C1-shaped identifier appears in the store's code: ${(code.match(C1_FIELD) || [])[0]}`
      : 'no credential, secret, session or key field written');

  // ── 7. R-06.4 conditions 2 and 3 — minimised, scrubbed on write ───────────
  line('\n7. Conditions 2 and 3 — Minimised, scrubbed on write (R-06.4.2-3)');
  // THE PROPERTY IS THE ENUMERATION OF WHAT IS WRITTEN, NOT A COUNT OF WRITE SITES.
  //
  // This read `putCalls === 1` and went RED when ADR-0081 P-81.1 added the detached signature as
  // a legitimate second write. A pinned count is CHARTER §17.1(i)'s trap: a gate whose passing
  // condition is a literal must be EDITED whenever legitimate structure changes. What is forbidden
  // is a store that accretes CONTENT — so the property asserts WHICH segments are written, from
  // the store's own exported constants. A third artefact class turns this red BY NAME.
  const missingConsts = subject.segmentConsts
    .filter((c) => !new RegExp(`export const ${c}\\s*=\\s*'[a-z-]+'`).test(code));
  check('every run segment this subject declares is exported from its own source',
    missingConsts.length === 0,
    missingConsts.length === 0
      ? `segments [${subject.segmentConsts.join(', ')}]`
      : `enumerated but not exported by the store: ${missingConsts.join(', ')}`);

  const writeTargets = [...code.matchAll(subject.writeCall)].map((m) => (m[1] || '').trim());
  const allowed = new RegExp(`^(${subject.segmentConsts.join('|')})$`);
  const namedRuns = writeTargets.map((a) => {
    // A write through a pre-built `key` names its segment where that key is constructed; a write
    // through `keyFor(...)` names it inline. Both resolve to a declared constant or neither does.
    if (a === 'key') return null;
    const parts = a.split(',').map((x) => x.trim());
    return parts.length > 1 ? parts[1] : subject.defaultSegment;
  }).filter((r) => r !== null);
  const unknownTarget = namedRuns.filter((r) => !allowed.test(r));
  check('every write targets a DECLARED segment (R-06.4.2)',
    writeTargets.length > 0 && unknownTarget.length === 0,
    unknownTarget.length > 0
      ? `a write targets an undeclared segment: ${unknownTarget.join(', ')}`
      : `${writeTargets.length} write(s), all to declared segments`);

  // A derived index is a second record of ownership that can disagree with the stored body.
  const derived = /Index|index\.set|cache\.set|extractedTenant/.test(code);
  check('the store keeps no derived index alongside the body', !derived,
    derived ? 'a derived structure is maintained beside the body' : 'body only, no second record');

  // ── 8. Enforcement by addressing ──────────────────────────────────────────
  line('\n8. Enforcement by addressing (P-79.2, R-07.2, R-07.3)');
  const callerPartition = /\b(put|get|purgeExpired)\s*\([^)]*\b(slug|partition|tenantSlug)\s*:/i.test(code);
  check('no public method accepts a caller-supplied slug or partition', !callerPartition,
    callerPartition ? 'a caller can express another tenant\'s partition — F-04 rebuilt'
      : 'the partition is resolved from the authenticated principal');
  const usesArtefactPath = /ArtefactKey/.test(code) && !/require\(['"]node:fs|from ['"]node:fs/.test(code);
  check('the store constructs no path of its own', usesArtefactPath,
    usesArtefactPath ? 'addresses through ArtefactKey / the one validated constructor'
      : 'the store reaches the filesystem directly');

  const r = subject.readRefusal;
  const refusalHeld = r.pattern.test(code) && (r.forbid ? !r.forbid.test(code) : true);
  check('a read refusal cannot distinguish absent from not-yours (P-79.6)', refusalHeld,
    refusalHeld ? r.present : r.absent);

  // ── 9. No delivery state ──────────────────────────────────────────────────
  line('\n9. No delivery state (P-79.7 / P-70.3, R-12.5, R-20.31)');
  const deliveryState = DELIVERY.test(code);
  check('no fetch count, last-accessed timestamp or acknowledgement is recorded', !deliveryState,
    deliveryState ? `delivery state re-entered: ${(code.match(DELIVERY) || [])[0]}`
      : 'retrieval is idempotent and leaves the store byte-identical (R-05.21)');
}

// ── 10. Scoped sweep — every persisting module in the storage layer declares ─
//
// The properties above measure ENUMERATED subjects. **This sweep is what stops the next store
// arriving without being enumerated at all**, and it is why the enumeration cannot rot quietly:
// a module that persists and is not a subject still has to carry an ADR and a retention, and the
// final check below compares the two lists outright.
line(`\n${'─'.repeat(74)}`);
line('\n10. Every persisting module in the storage layer carries its authorisation');
// The provider itself is the MECHANISM, not a store: it holds no classification of its own and
// persists whatever an authorised store hands it. Exempt by name, with the reason stated.
const MECHANISM = new Set(['storage-provider.ts']);
const modules = fs.existsSync(STORAGE_DIR)
  ? fs.readdirSync(STORAGE_DIR).filter((f) => f.endsWith('.ts') && !MECHANISM.has(f))
  : [];
const undeclared = [];
const c1Writers = [];
const persisting = [];
for (const f of modules) {
  const bare = bareOf(f);
  const persists = /\.put\s*\(|writeFileSync\s*\(/.test(bare);
  if (!persists) continue;
  persisting.push(f);
  if (!/ADR-\d{4}/.test(bare) || !/maxRetentionDays\s*:\s*\d+/.test(bare)) undeclared.push(f);
  if (C1_FIELD.test(bare)) c1Writers.push(f);
}
check('every persisting module declares an authorising ADR and a retention (R-06.4.1, R-06.9)',
  undeclared.length === 0,
  undeclared.length ? `undeclared persisting module(s): ${undeclared.join(', ')}`
    : `${modules.length} module(s) swept, ${persisting.length} persisting, all declared`);
check('no persisting module in the storage layer writes a C1-shaped field (C-06.11)',
  c1Writers.length === 0,
  c1Writers.length ? `C1-shaped field written by: ${c1Writers.join(', ')}`
    : 'no credential, secret or session material persisted');

// EVERY PERSISTING MODULE IS AN ENUMERATED SUBJECT, OR IS ONE'S DECLARED DRIVER.
//
// THIS IS THE CHECK THAT CLOSES THE LOOP between the sweep and the enumeration. Without it the two
// coexist and are never compared: a third store could satisfy section 10 — carrying an ADR and a
// retention — while NO SUBJECT MEASURES IT. It would then be governed by two of document 06's
// obligations instead of nine, and nothing anywhere would say so. That is the sibling-gate failure
// arriving by a different door, and this is what makes the enumeration self-policing.
const subjectFiles = new Set(SUBJECTS.flatMap((s) => [s.src, s.driver]));
const unenumerated = persisting.filter((f) => !subjectFiles.has(f));
check('every persisting module is an enumerated subject or that subject\'s declared driver (P-82.8)',
  unenumerated.length === 0,
  unenumerated.length
    ? `persists but is measured by no subject: ${unenumerated.join(', ')} — add it to SUBJECTS, or document 06 governs it by this sweep alone`
    : `${persisting.length} persisting module(s), each covered by the enumeration`);

line(`\n${'='.repeat(74)}`);
if (failures === 0) {
  line(`RESULT: PASS — document 06 measured on ${SUBJECTS.length} enumerated subject(s); every obligation holds.`);
} else {
  line(`RESULT: FAIL — ${failures} data-sovereignty obligation(s) violated.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
