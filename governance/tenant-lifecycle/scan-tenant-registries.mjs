/**
 * TENANT REGISTRY ENUMERATION — D-109 piece (1), the evidence the survivor ruling needs.
 * ============================================================================
 * D-109 records one customer existing as two tenants in two registries, and DEFERS the
 * survivor decision "PENDING AN ENUMERATION OF BOTH REGISTRIES ... it is the evidence the
 * decision needs and it does not yet exist." This is that enumeration.
 *
 * It is READ-ONLY and it is NOT A GATE. It asserts nothing, writes no tenant state, and
 * exits 0 whatever it finds — the gate D-109 calls piece (3) ("no two tenants share an
 * identityKey, evaluated over the registry, crossing replicas") is deliberately NOT built
 * here. Folding it in is the scope error D-087 counts and D-108/D-109/D-110 each refused.
 *
 * WHAT IT REFUSES TO DO, AND WHY THAT IS THE POINT
 * ------------------------------------------------
 * D-109's complaint about the live side is that "which records exist there is INFERRED from
 * one portal view rather than enumerated", and that choosing a survivor on that basis is the
 * D-041 shape — the question stops being asked without having been answered. So:
 *
 *   · Every registry is DECLARED by the caller. Nothing is discovered, defaulted or guessed.
 *   · A declared registry that cannot be read is reported `unreachable` WITH ITS CAUSE. It is
 *     never silently omitted, and its absence is never read as "no tenants there".
 *   · The verdict is COMPLETE only when every declared registry was actually enumerated.
 *     Any unreachable source ⇒ INCOMPLETE ⇒ the survivor ruling is still not evidenced.
 *
 * A scan that reported a collision from one reachable registry would recreate the fault it
 * exists to measure.
 *
 * RECENCY IS REPORTED AND EXPLICITLY DISCLAIMED
 * ---------------------------------------------
 * D-109's measurement is a RECENCY INVERSION: on updatedAt, token version and audit depth the
 * ABANDONED record is the newer, busier one, because the dev loop kept regenerating against it
 * after the real tenant was provisioned. Those three signals are carried here so the inversion
 * is visible — and every collision is stamped `survivorFromRecency: null` with the reason, so
 * the evidence cannot be misread as nominating a survivor. Identity has no recency.
 *
 * SECRETS: only `epToken.version` is read. No token value, and no `.env`-bound field, is ever
 * copied into the output (INV-2).
 *
 * NO NETWORK, BY ARCHITECTURE RATHER THAN BY CHOICE
 * -------------------------------------------------
 * An earlier draft read the live registry over `GET /api/tenants`. The Intelligence-Plane
 * egress gate refused it — R-3.2 / R-6.3 / R-14.16, "tool I/O belongs to the Execution Plane" —
 * and the gate is right. So the live registry is enumerated WHERE THE IP RUNS, against its own
 * `/state` mount, and the result is carried back out of band as a file:
 *
 *   in the deployment :  node scan-tenant-registries.mjs --dir /state/tenants --out live.json
 *   on this machine   :  node scan-tenant-registries.mjs --dir ./tenants --merge live.json
 *
 * `--merge` re-reads a previous run's own output and folds its tenants in as a source, so the
 * two-registry comparison happens in one place without either plane dialling the other. A merged
 * source is labelled with its origin host and scan digest, never silently blended.
 *
 * Usage:
 *   node governance/tenant-lifecycle/scan-tenant-registries.mjs \
 *     --dir   ./tenants          # a filesystem registry root (<slug>/tenant.json), repeatable
 *     --merge live.json          # a scan output produced elsewhere, repeatable
 *     [--out  registry-scan.json]
 *
 * Out:  {"sources":[...],"tenants":[...],"collisions":[...],"verdict":...,"digest":...,"fatal":...}
 * Exit: 0 always. This is evidence, not a verdict.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const payloadName = 'D-109 piece (1) — tenant registry enumeration';

/* ---------------------------------------------------------------------------
 * identityKey — MIRRORED from tenant-repository.ts, and checked against it.
 *
 * The real one is module-private, so it cannot be imported. A silent copy is the
 * duplication CHARTER §4 forbids, so the mirror is VERIFIED against the source text on
 * every run: if the implementation changes, this scan reports `fatal` and enumerates
 * nothing rather than grouping on a stale rule. A drifted key would merge or split
 * tenants — the exact error the scan exists to detect.
 * ------------------------------------------------------------------------ */
const identityKey = (slug) => slug.replace(/-/g, '');

function verifyIdentityKeyMirror() {
  const src = join(ROOT, 'packages', 'tenant-onboarding-engine', 'src', 'engine', 'tenant-repository.ts');
  if (!existsSync(src)) return `tenant-repository.ts not found at ${src} — cannot verify the identityKey mirror`;
  const text = readFileSync(src, 'utf8');
  const m = text.match(/function identityKey\(slug: string\): string \{\s*return ([^\n]+?);\s*\}/);
  if (!m) return 'identityKey() not found in tenant-repository.ts in the expected shape — the mirror cannot be verified';
  const body = m[1].trim();
  if (body !== "slug.replace(/-/g, '')") {
    return `identityKey() has changed (source: \`${body}\`). This scan's mirror is stale; update it before trusting any grouping.`;
  }
  return null;
}

/* ------------------------------- arguments ------------------------------- */
const argv = process.argv.slice(2);
const dirs = [];
const merges = [];
let out = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') dirs.push(argv[++i]);
  else if (a === '--merge') merges.push(argv[++i]);
  else if (a === '--out') out = argv[++i];
  else if (a === '--help' || a === '-h') { process.stdout.write(helpText()); process.exit(0); }
  else { process.stderr.write(`unknown argument: ${a}\n${helpText()}`); process.exit(2); }
}

function helpText() {
  return [
    'scan-tenant-registries — D-109 piece (1), read-only enumeration over every DECLARED registry.',
    '',
    '  --dir <path>     filesystem registry root containing <slug>/tenant.json (repeatable)',
    '  --merge <file>   a scan output produced on another host, folded in as a source (repeatable)',
    '  --out <file>     also write the JSON here (default: stdout only)',
    '',
    'There is no network mode: the IP egress ban (R-3.2, R-6.3) forbids it. Enumerate the live',
    'registry where the IP runs (--dir /state/tenants --out live.json) and carry the file back.',
    '',
    'Declaring no source is itself an answer: the scan reports INCOMPLETE and names what is missing.',
    '',
  ].join('\n');
}

/* ------------------------------ enumeration ------------------------------ */
const sources = [];
const tenants = [];
let fatal = verifyIdentityKeyMirror();

/** Pull only the fields the ruling needs. Never the token value (INV-2). */
function summarise(env, origin) {
  const o = env?.onboarding ?? {};
  return {
    source: origin,
    slug: o.slug ?? null,
    tenantId: o.tenantId ?? null,
    identityKey: typeof o.slug === 'string' ? identityKey(o.slug) : null,
    displayName: o.displayName ?? null,
    status: o.status ?? null,
    lifecycleState: o.lifecycleState ?? null,
    projection: o.projection ?? null,
    createdAt: o.createdAt ?? null,
    // The three recency signals D-109 measured the inversion on. Reported, never ranked on.
    updatedAt: o.updatedAt ?? null,
    epTokenVersion: o.epToken?.version ?? null,
    auditEvents: Array.isArray(o.audit) ? o.audit.length : null,
  };
}

function scanDir(spec) {
  const abs = resolve(ROOT, spec);
  const src = { kind: 'dir', declared: spec, resolved: abs, state: null, cause: null, count: 0 };
  try {
    if (!existsSync(abs)) throw new Error('directory does not exist');
    if (!statSync(abs).isDirectory()) throw new Error('not a directory');
    const slugs = readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const slug of slugs) {
      const manifest = join(abs, slug, 'tenant.json');
      if (!existsSync(manifest)) {
        // A directory without a manifest is reported, not skipped — it may be a half-written
        // tenant, which is exactly the kind of thing an enumeration must not hide.
        tenants.push({ source: `dir:${spec}`, slug, tenantId: null, identityKey: identityKey(slug),
          readError: 'no tenant.json in this directory' });
        src.count++;
        continue;
      }
      try {
        tenants.push(summarise(JSON.parse(readFileSync(manifest, 'utf8')), `dir:${spec}`));
      } catch (e) {
        tenants.push({ source: `dir:${spec}`, slug, tenantId: null, identityKey: identityKey(slug),
          readError: `unreadable manifest: ${e.message}` });
      }
      src.count++;
    }
    src.state = 'enumerated';
  } catch (e) {
    src.state = 'unreachable';
    src.cause = e.message;
  }
  sources.push(src);
}

/**
 * Fold in a scan output produced on another host. This is an out-of-band EVIDENCE HANDOFF, not a
 * second measurement: the tenants it carries were enumerated there and are re-labelled with their
 * origin so nothing in the merged result reads as locally observed.
 */
function mergeScan(spec) {
  const abs = resolve(ROOT, spec);
  const src = { kind: 'merge', declared: spec, resolved: abs, state: null, cause: null, count: 0, origin: null };
  try {
    if (!existsSync(abs)) throw new Error('file does not exist');
    const prior = JSON.parse(readFileSync(abs, 'utf8'));
    if (prior.scan !== payloadName) throw new Error('not a scan-tenant-registries output');
    if (prior.fatal) throw new Error(`the merged scan reported fatal: ${prior.fatal}`);
    // A merged scan that was itself INCOMPLETE cannot repair this one. Carrying its tenants while
    // dropping that fact is how a partial enumeration launders into a complete-looking comparison.
    if (prior.verdict?.state !== 'COMPLETE' && prior.verdict?.state !== 'INCOMPLETE') {
      throw new Error(`merged scan has an unusable verdict: ${prior.verdict?.state}`);
    }
    const priorDirs = (prior.sources ?? []).filter((s) => s.state === 'enumerated').map((s) => s.declared);
    if (priorDirs.length === 0) throw new Error('the merged scan enumerated no registry');
    for (const t of prior.tenants ?? []) {
      tenants.push({ ...t, source: `merge:${spec}(${t.source})` });
      src.count++;
    }
    src.origin = { digest: prior.digest ?? null, enumerated: priorDirs, verdict: prior.verdict?.state ?? null };
    src.state = 'enumerated';
  } catch (e) {
    src.state = 'unreachable';
    src.cause = e.message;
  }
  sources.push(src);
}

if (!fatal) {
  for (const d of dirs) scanDir(d);
  for (const m of merges) mergeScan(m);
}

/* ------------------------------- collisions ------------------------------ */
const byKey = new Map();
for (const t of tenants) {
  if (!t.identityKey) continue;
  if (!byKey.has(t.identityKey)) byKey.set(t.identityKey, []);
  byKey.get(t.identityKey).push(t);
}

const collisions = [];
for (const [key, group] of byKey) {
  const ids = [...new Set(group.map((g) => g.tenantId).filter(Boolean))];
  if (ids.length > 1) {
    collisions.push({
      identityKey: key,
      tenantIds: ids,
      spellings: [...new Set(group.map((g) => g.slug))],
      records: group,
      crossesRegistries: new Set(group.map((g) => g.source)).size > 1,
      // Stated, not computed. D-109: "Identity has no recency, and the platform has no
      // supersession" — both records read Provisioned and no field in either can say the
      // other exists. Nominating a survivor from these signals returns the WRONG answer,
      // because the orphan is busier precisely BECAUSE the dev loop kept using it.
      survivorFromRecency: null,
      survivorNote: 'Not derivable from this evidence. updatedAt / epTokenVersion / auditEvents are '
        + 'reported to make the D-109 recency inversion visible, NOT to rank the records. The survivor '
        + 'is a programme-owner ruling (D-109 piece 2).',
    });
  }
}

/* -------------------------------- verdict -------------------------------- */
const declared = dirs.length + merges.length;
const unreachable = sources.filter((s) => s.state === 'unreachable');

let verdict;
if (fatal) {
  verdict = { state: 'FATAL', reason: fatal };
} else if (declared === 0) {
  verdict = {
    state: 'INCOMPLETE',
    reason: 'No registry was declared. D-109 names two: the local dev registry (a --dir) and the '
      + "live registry on the deployment's /state mount — enumerated by a --dir run WHERE THE IP RUNS "
      + 'and carried back with --merge, since the IP egress ban (R-3.2, R-6.3) forbids dialling it. '
      + 'Both must appear in one run for the comparison to mean anything.',
  };
} else if (unreachable.length > 0) {
  verdict = {
    state: 'INCOMPLETE',
    reason: `${unreachable.length} of ${declared} declared registries could not be enumerated. `
      + 'The survivor ruling (D-109 piece 2) is NOT evidenced by a partial scan — that is the D-041 '
      + 'shape the deferral exists to avoid.',
    unreachable: unreachable.map((s) => ({ declared: s.declared, cause: s.cause })),
  };
} else if (sources.filter((s) => s.state === 'enumerated').length < 2) {
  // A ONE-REGISTRY SCAN CANNOT FALSIFY THE D-109 INVARIANT, so it must never report COMPLETE.
  // The fault D-109 measured is a collision ACROSS replicas; within a single store it is already
  // caught at creation by tenant-repository.ts:222, which scans `this.store.list()` — one store,
  // one rootDir. So a single-source run reproduces exactly the blindness this scan exists to
  // remove, and reporting "no collisions" from it would be a green that means "I could not have
  // seen one" — the vacuous-pass class D-011, D-015 and D-103 count.
  verdict = {
    state: 'INCOMPLETE',
    reason: 'Only one registry was enumerated. A cross-replica collision is not observable from a '
      + 'single registry — that is the structural blindness D-109 records at tenant-repository.ts:222, '
      + 'not something this scan can compensate for. Declare both registries in ONE run.',
    enumerated: sources.filter((s) => s.state === 'enumerated').map((s) => s.declared),
  };
} else {
  verdict = {
    state: 'COMPLETE',
    reason: `All ${declared} declared registries enumerated.`,
    collisionsFound: collisions.length,
    ruling: collisions.length > 0
      ? 'Collisions present. The survivor is a programme-owner ruling (D-109 piece 2); retirement '
        + 'runs through archive() with the manifest retained (R-21.24) and NEVER delete()/rm. Note '
        + "that archive() accepts ACTIVE|SUSPENDED and PROVISIONED is neither — for a PROVISIONED "
        + 'twin the transition is unbuilt and must not be forced.'
      : 'No identityKey is shared by two tenantIds across the declared registries.',
  };
}

const payload = {
  scan: payloadName,
  readOnly: true,
  isGate: false,
  declaredSources: declared,
  sources,
  tenants,
  collisions,
  verdict,
  fatal,
};
payload.digest = createHash('sha256')
  .update(JSON.stringify([tenants.map((t) => [t.source, t.slug, t.tenantId]), verdict.state]))
  .digest('hex');

const json = JSON.stringify(payload, null, 2);
if (out) writeFileSync(resolve(ROOT, out), json + '\n');
process.stdout.write(json + '\n');
