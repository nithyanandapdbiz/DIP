/**
 * EP solution export — materialise the Execution-Plane solution from a tenant's canonical config.
 *
 * TRACEABILITY: ADR-0030 (generateSolution is the ONE generator, reused) · Doc 19 (sovereignty).
 *
 * The Intelligence Plane GENERATES the solution package; it never deploys it into the Execution Plane
 * (that is the customer's act). So this writes the package to an IP-owned output directory — a staging
 * artifact the customer then deploys. It never writes across the plane boundary.
 *
 * generateSolution is deterministic in the technology profile; the only per-run difference is the
 * one-time registration credential embedded in the EP bootstrap (single-use, short-lived — R-21.33).
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { generateSolution, adapterInterface, ADAPTER_INTERFACES, GENERATOR_VERSION, type GeneratedSolution, type TechnologyProfile } from '@dbiz/platform-core';
import type { TenantEnvelope } from './tenant-config.js';
import { workPathFor } from './registration.js';
import { WORK_POLL_INTERVAL_SECONDS } from './work-path-distribution.js';
import { portalBrand, portalIndexHtml, PORTAL_SERVER_MJS, EP_CLI_MJS } from './portal-templates.js';
import {
  buildApplicationPlane, applicationConfigDocument, applicationEnvBlocks, applicationEnvNames,
  applicationIntegrationBlock, applicationAuthProfile, applicationDocument, applicationConfigurationSummary,
  applicationPortalSnapshot, applyCapabilityProfile, capabilityTargetProfile,
  type ApplicationPlane,
} from './application-plane.js';

export { signInCredentials } from './application-plane.js';
export type { AppTargetCredentials } from './application-plane.js';

export interface SolutionBuildOptions {
  readonly registrationEndpoint: string;
  /** Issues the one-time EP registration credential embedded in the bootstrap file. */
  readonly issueCredential: (tenantId: string) => string;
}

export interface SolutionFile { readonly path: string; readonly content: string }

/** The API response shape for a generated solution — a manifest plus the file bodies. */
export interface SolutionManifest {
  readonly tenantId: string;
  readonly profile: { readonly language: string; readonly framework: string; readonly testRunner: string; readonly packageManager: string };
  /** Entitled capabilities the package enables (each with a fill-in config). */
  readonly capabilities: readonly string[];
  /** Selected customer tools the package integrates (each with an endpoint + secret placeholder). */
  readonly tools: readonly string[];
  readonly fileCount: number;
  readonly contentHash: string;
  readonly generatorVersion: string;
  readonly templateVersion: string;
  /** Where the package was written on the IP side (absent if no output directory is configured). */
  readonly outputPath?: string;
  readonly files: readonly SolutionFile[];
}

/** Build the EP solution from a tenant's canonical technology profile. */
export function buildTenantSolution(env: TenantEnvelope, opts: SolutionBuildOptions): GeneratedSolution {
  const tenantId = env.onboarding.tenantId;
  const oneTimeRegistrationCredential = opts.issueCredential(tenantId);
  return generateSolution(env.configuration.technologyProfile as unknown as TechnologyProfile, {
    tenantId, registrationEndpoint: opts.registrationEndpoint, oneTimeRegistrationCredential,
  });
}

/**
 * Bookkeeping side-car recording which paths THIS generator wrote.
 *
 * Not part of the package manifest and not content-hashed: it is the writer's own record, used
 * only to decide what a later regeneration may delete. Dot-prefixed so it sorts out of the way.
 */
const PACKAGE_MANIFEST = '.dbiz-package-manifest.json';

/**
 * Path prefixes this generator will NEVER write, declared so the Execution Plane can build on them.
 *
 * A path is outside the generated set today only because no entry happens to name it — absence, which
 * is exactly as durable as the next template author's attention. An EP that puts its runtime under
 * `src/runtime/` is relying on that absence. Declaring the reservation positively turns "outside by
 * omission" into "outside by contract": `assertReservationsHonoured` fails the generation if a template
 * ever emits into one of these, so the promise breaks HERE, in the IP's own test run, rather than by
 * silently overwriting customer code during a routine regeneration.
 *
 * R-05.3 puts the single cross-plane client in the EP; Doc 19 makes that code customer-owned. This is
 * the ground it stands on.
 */
const RESERVED_PATH_PREFIXES: readonly string[] = ['src/runtime/', 'tests/', 'tools/'];

/** True when `rel` falls inside a reserved area (which the generator must never write or prune). */
function isReserved(rel: string): boolean {
  const norm = rel.replace(/\\/g, '/');
  return RESERVED_PATH_PREFIXES.some((p) => norm.startsWith(p));
}

/**
 * Refuse to generate into reserved ground.
 *
 * `tests/.gitkeep` is the live example of why this is a check and not a comment: the generator does
 * emit it, so `tests/` is reserved WITH a declared exception rather than reserved absolutely. Any
 * NEW emission under a reserved prefix is a template author about to overwrite customer runtime code,
 * and it fails here instead of in a customer's tenancy.
 */
const RESERVED_EXCEPTIONS: ReadonlySet<string> = new Set(['tests/.gitkeep']);

function assertReservationsHonoured(files: readonly SolutionFile[]): void {
  const violations = files
    .map((f) => f.path.replace(/\\/g, '/'))
    .filter((p) => isReserved(p) && !RESERVED_EXCEPTIONS.has(p));
  if (violations.length) {
    throw new Error(
      `solution generation refused: templates emitted into reserved Execution-Plane runtime ground — ${violations.join(', ')}. ` +
        `Reserved prefixes (${RESERVED_PATH_PREFIXES.join(', ')}) are customer-owned; generating into them overwrites EP runtime code on regeneration.`,
    );
  }
}

/** The paths a previous generation claimed, or `null` when this package predates the manifest. */
function previouslyGeneratedPaths(root: string): readonly string[] | null {
  try {
    const parsed = JSON.parse(readFileSync(join(root, PACKAGE_MANIFEST), 'utf8')) as { generatedPaths?: unknown };
    return Array.isArray(parsed.generatedPaths) ? parsed.generatedPaths.filter((p): p is string => typeof p === 'string') : null;
  } catch {
    return null; // absent or unreadable — treated as "nothing is known to be ours"
  }
}

/**
 * Write a set of files to <outputDir>/<slug>/ as a materialised, deployable package.
 *
 * WRITE IN PLACE — never delete-then-recreate the output directory. On Windows a held handle
 * on the output directory (a process whose working directory is inside it, an editor watcher,
 * a running portal) makes `rmSync(root, {recursive})` fail with EPERM — the exact failure the
 * tenant "update" button hits. Overwriting each file in place does not require removing the
 * (possibly locked) root, and pruning is best-effort so one locked stale file cannot fail the
 * whole regeneration.
 *
 * PRUNE ONLY WHAT WE PREVIOUSLY WROTE. The output directory is a LIVE Execution Plane, not a build
 * output: alongside the generated files the operator and the runtime own `.env` (the filled-in
 * credentials), `config/portal.json` (saved operational settings), `.auth/…` (the captured sign-in
 * session — deleting it forces a fresh interactive MFA challenge) and `evidence/…` (locally
 * custodied evidence, INV-1). Pruning everything not in the new package deleted all of it, so a
 * routine regeneration destroyed the customer's credentials and their evidence.
 *
 * The manifest side-car makes the distinction knowable: a path is ours to remove only if a previous
 * generation recorded writing it. A package with no manifest — one generated before this record
 * existed — prunes NOTHING and simply adopts a manifest, so the first regeneration is safe and
 * every one after it prunes precisely. Erring toward a stale leftover file is recoverable; erring
 * toward deleting a customer's evidence is not.
 */
export function writeSolutionFiles(outputDir: string, slug: string, files: readonly SolutionFile[]): string {
  assertReservationsHonoured(files);
  const root = join(outputDir, slug);
  mkdirSync(root, { recursive: true });
  const wanted = new Set(files.map((f) => f.path));
  const previous = previouslyGeneratedPaths(root);

  // Best-effort prune — a locked stale file is left behind, never fatal to the regeneration.
  //
  // The manifest is skipped because it is rewritten below, not pruned. A RESERVED path is skipped
  // even when a previous manifest claims it: an older generator that wrongly emitted into customer
  // runtime ground must not license this one to delete what the customer has since built there.
  // Reservation outranks the recorded claim.
  for (const rel of previous ?? []) {
    if (wanted.has(rel) || rel === PACKAGE_MANIFEST || isReserved(rel)) continue;
    try { rmSync(join(root, rel), { force: true }); } catch { /* locked stale file — leave it */ }
  }

  // Overwrite in place — safe even while another process holds a handle on the directory.
  for (const f of files) {
    const full = join(root, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, 'utf8');
  }

  // Record what we wrote, last, so a crash mid-write cannot leave a manifest claiming more than
  // the directory holds — which would authorise the NEXT run to delete a file it never wrote.
  writeFileSync(
    join(root, PACKAGE_MANIFEST),
    `${JSON.stringify({
      _note: 'Written by the DBiz solution generator to record which files it owns. A regeneration overwrites the paths in generatedPaths and deletes only paths a PREVIOUS generation recorded there; anything else in this directory — .env, config/portal.json, .auth/, evidence/ — is yours and is never removed. Paths under reservedPaths are never generated and never pruned, so Execution-Plane runtime code placed there survives every regeneration.',
      generatorVersion: GENERATOR_VERSION,
      // The manifest lists ITSELF. It is rewritten on every run, so claiming to be customer-owned
      // was simply false — and a file that misreports its own ownership is the last file that
      // should be the authority on everyone else's.
      generatedPaths: [...wanted, PACKAGE_MANIFEST].sort(),
      reservedPaths: [...RESERVED_PATH_PREFIXES],
    }, null, 2)}\n`,
    'utf8',
  );
  return root;
}

// EP-side config scaffolds per capability. `<FILL: …>` marks values the customer completes at the EP.
// Per-capability EP runtime scaffold: the adapter interface it drives (R-11.11), a single target
// reference (@integrations.application — one source of truth), an auth-profile reference, a per-capability
// timeout (R-16.20), and guardrail/blast-radius limits (R-16.18). `@…` are references; `<FILL: …>` are values.
const CAP_SCAFFOLD: Record<string, Record<string, unknown>> = {
  'functional-testing': { adapterInterface: 'I2-browser', target: '@integrations.application', authProfileRef: 'app-default', timeoutSeconds: 300, guardrail: { maxConcurrency: 4 }, suite: 'tests/functional', browsers: ['chromium'] },
  'inverse-flow-discovery': { adapterInterface: 'I2-browser', target: '@integrations.application', authProfileRef: 'app-default', timeoutSeconds: 600, guardrail: { maxConcurrency: 2, nonDestructive: true, requestsPerSecond: 2, excludePaths: ['<FILL: destructive paths to exclude>'] }, seedFlows: [], maxDepth: 3 },
  performance: { adapterInterface: 'I4-load-generation', target: '@integrations.application', authProfileRef: 'app-default', timeoutSeconds: 120, guardrail: { maxVirtualUsers: 50, costCeiling: '<FILL: cost/blast-radius cap>' }, virtualUsers: 10, durationSeconds: 60, thresholds: { p95Ms: 800 } },
  'security-testing': { adapterInterface: 'I5-security-scan', target: '@integrations.application', sourceAccess: '@integrations.sourceControl', authProfileRef: 'app-default', timeoutSeconds: 1800, guardrail: { maxConcurrency: 1 }, scanProfile: 'baseline' },
  'penetration-testing': { adapterInterface: 'I6-penetration', target: '@integrations.application', authProfileRef: '<FILL: pen-test auth profile>', timeoutSeconds: 3600, guardrail: { scope: ['<FILL: in-scope hosts>'], rulesOfEngagement: '<FILL: RoE reference>' } },
  'dev-change': { adapterInterface: 'I7-source-control', changeRef: '<FILL: base..head or PR ref>', target: '@integrations.application', authProfileRef: 'app-default', timeoutSeconds: 600, guardrail: { maxConcurrency: 2 }, strategy: 'impacted', watchPaths: ['src/'] },
};

// Which interface class each capability drives → the execution adapter the EP must bind (verified path).
// A capability's OWN interface; the application template may override it (an API target drives
// functional testing through I3-api, not a browser), which is why the merge happens per tenant.
const CAP_ADAPTER: Record<string, string> = {
  'functional-testing': 'I2-browser', 'inverse-flow-discovery': 'I2-browser', performance: 'I4-load-generation',
  'security-testing': 'I5-security-scan', 'penetration-testing': 'I6-penetration', 'dev-change': 'I7-source-control',
};

/**
 * The EP config scaffold for a single capability, SPECIALISED to the tenant's application target.
 *
 * Used both when the package is generated and when a capability is added to a live tenant. The
 * plane is REQUIRED, not optional: an update event carrying a generic scaffold would land in a
 * D365 tenant's `config/capabilities.json` and overwrite the concurrency ceiling, adapter class and
 * authenticated strategies its target needs — reintroducing the generic-package defect through the
 * update path after generation had got it right. Every caller has the tenant envelope, so every
 * caller can resolve the plane; making it optional only made it possible to forget.
 */
export function capabilityScaffold(capability: string, plane: ApplicationPlane): Record<string, unknown> {
  const base: Record<string, unknown> = { enabled: true, ...(CAP_SCAFFOLD[capability] ?? { config: '<FILL: capability settings>' }) };
  const specialised = applyCapabilityProfile(base, plane.primary.capabilityProfiles[capability]);
  return { ...specialised, ...capabilityTargetProfile(plane) };
}

/**
 * The EP config scaffold for a named INTEGRATION — used both in the package and in update events.
 * References/placeholders only; the AI vendor + key are resolved in the EP, never in the IP (INV-9).
 */
export function integrationScaffold(name: string, source?: Record<string, unknown>): Record<string, unknown> | null {
  if (name === 'ai') {
    return {
      providerHandle: (source?.['providerHandle'] as string) ?? 'handle:capability',
      capabilityClasses: (source?.['capabilityClasses'] as string[]) ?? [],
      vendor: '<FILL: AI vendor — resolved here in the EP, never named in the IP (INV-9)>',
      endpoint: '<FILL: provider endpoint>',
      model: '<FILL: model or deployment name>',
      apiKeyEnv: 'AI_PROVIDER_KEY',
    };
  }
  return null;
}

/**
 * Human-readable comments for the PLATFORM `.env.example` secret slots.
 *
 * Application-target slots are NOT listed here — their comments come from the Application Template
 * that declared them, so a new target type describes its own slots without editing this table. What
 * remains is genuinely platform-level: the IP token, the tool credentials, and the adapter
 * credentials (whose comments are read from the adapter interface catalogue below).
 */
const ENV_COMMENT: Record<string, string> = {
  DBIZ_EP_TOKEN: 'IP API token issued to this EP at registration',
  PM_TOKEN: 'project-management credential',
  TM_TOKEN: 'test-management credential',
  AI_PROVIDER_KEY: 'AI provider API key (vendor resolved here in the EP — INV-9)',
  // Adapter credentials describe themselves in the interface catalogue — one source of truth.
  ...Object.fromEntries(
    Object.values(ADAPTER_INTERFACES)
      .filter((d) => d.credentialEnv)
      .map((d) => [d.credentialEnv!, d.credentialComment ?? `${d.id} adapter credential`]),
  ),
};

// The EP update agent — a real, EP-INITIATED pull loop (INV-3). Written with string concatenation so
// it carries no template-literal escaping into the generated file.
const EP_UPDATE_AGENT = [
  '// EP update agent — EP-INITIATED pull of tenant updates from the Intelligence Plane.',
  '// The IP never pushes (INV-3): this loop pulls pending updates, applies their config, and acks.',
  '// Auth: the token in the env var named by connectivity.intelligencePlane.credentialEnv (issued at registration).',
  '//',
  '// THE ACK IS NOT A COURTESY — IT IS WHAT MOVES THE QUEUE STATUS, AND THE QUEUE STATUS IS THE',
  '// RECORD THE INTELLIGENCE PLANE READS. So every function that handles an event RETURNS whether it',
  '// applied, and only a TRUE return is acked. A refusal that acked would erase this plane\'s',
  '// strongest safety property through the only channel able to report it.',
  'import { readFileSync, writeFileSync, existsSync } from "node:fs";',
  'import { join, dirname } from "node:path";',
  'import { fileURLToPath } from "node:url";',
  '',
  'const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");',
  'const CONN = join(ROOT, "config/connectivity.json");',
  'const conn = JSON.parse(readFileSync(CONN, "utf8"));',
  'const CAPS = join(ROOT, "config/capabilities.json");',
  'const INTEG = join(ROOT, "config/integrations.json");',
  'const APPLICATION = join(ROOT, "config/application.json");',
  'const token = process.env[conn.intelligencePlane.credentialEnv];',
  '',
  '// Instance-configurable connection — a dev instance points INTELLIGENCE_API_URL at its IP API.',
  'const apiBase = process.env.INTELLIGENCE_API_URL;',
  'const updatesUrl = apiBase ? apiBase.replace(/\\/$/, "") + "/api/tenants/" + conn.slug + "/updates" : conn.intelligencePlane.updatesEndpoint;',
  'const apiVersion = process.env.INTELLIGENCE_API_VERSION || conn.contractVersion || "1.0.0";',
  'const timeoutMs = Number(process.env.INTELLIGENCE_TIMEOUT_MS) || (conn.transport && conn.transport.requestTimeoutMs) || 30000;',
  'const retries = Number(process.env.INTELLIGENCE_RETRY) || 0;',
  '',
  'async function call(url, init) {',
  '  for (let attempt = 0; ; attempt++) {',
  '    const ctl = new AbortController();',
  '    const timer = setTimeout(() => ctl.abort(), timeoutMs);',
  '    try { return await fetch(url, { ...init, signal: ctl.signal }); }',
  '    catch (e) { if (attempt >= retries) throw e; }',
  '    finally { clearTimeout(timer); }',
  '  }',
  '}',
  '',
  '// Returns TRUE only when this EP actually changed its own state because of the event. FALSE is',
  '// returned by every path that did not: a deliberate refusal, a failed write, and — critically —',
  '// an UNRECOGNISED TYPE, which exits at the final catch-all having matched no branch at all. The',
  '// caller acks on TRUE and only on TRUE, so an event this build does not understand stays pending',
  '// and remains visible to the Intelligence Plane instead of being silently consumed.',
  'function apply(u) {',
  '  if (u.type === "solution-update") return applySolutionUpdate(u.config || {});',
  '  if (u.type === "work-path-changed") return applyWorkPath(u.config || {});',
  '  let applied = false;',
  '  // The APPLICATION BAND travels with any configuration change. Applying it is what keeps a live',
  '  // EP coherent when the declared application class or its MFA posture changes: without this the',
  '  // manifest would say one target and the runtime would keep driving the previous one.',
  '  if (u.config && u.config.application) {',
  '    writeFileSync(APPLICATION, JSON.stringify(u.config.application, null, 2) + "\\n");',
  '    console.log("applied application band:", (u.config.application.template || {}).id || "unknown");',
  '    applied = true;',
  '  }',
  '  if (u.integration) {',
  '    const integ = existsSync(INTEG) ? JSON.parse(readFileSync(INTEG, "utf8")) : {};',
  '    if (u.type === "integration-disabled") delete integ[u.integration];',
  '    else if (u.config) integ[u.integration] = u.config;',
  '    else return applied; // named an integration but carried nothing to write — not an application.',
  '    writeFileSync(INTEG, JSON.stringify(integ, null, 2) + "\\n");',
  '    return true;',
  '  }',
  '  // THE CATCH-ALL. Every type with no branch above reaches here, and returning `applied` (false,',
  '  // unless the application band was written) is what keeps it unacked.',
  '  if (!u.capability) return applied;',
  '  const removed = u.type === "capability-removed";',
  '  if (!removed && !u.config) return applied;',
  '  const doc = existsSync(CAPS) ? JSON.parse(readFileSync(CAPS, "utf8")) : { capabilities: {} };',
  '  if (removed) delete doc.capabilities[u.capability];',
  '  else doc.capabilities[u.capability] = u.config;',
  '  writeFileSync(CAPS, JSON.stringify(doc, null, 2) + "\\n");',
  '  return true;',
  '}',
  '',
  '// WHERE THIS EP ASKS FOR WORK (ADR-0080 §6). The registration grant carries `workPath` for a',
  '// tenancy registering from now on; this event is the carrier for one that registered before the',
  '// exchange existed, and for any later rotation of the route.',
  '//',
  '// AN EP HOLDING NO workPath DOES NOT POLL, AND SO OBSERVES NOTHING — which is indistinguishable',
  '// from an empty collection unless it knows which it is in. Treat an absent workPath as NOT',
  '// CONFIGURED, never as idle. Persisting it here is what makes the distinction knowable to the',
  '// runtime after this process exits.',
  'function applyWorkPath(p) {',
  '  if (!p || typeof p.workPath !== "string" || !p.workPath.startsWith("/")) { console.error("work-path-changed refused: no absolute workPath"); return false; }',
  '  try {',
  '    const doc = JSON.parse(readFileSync(CONN, "utf8"));',
  '    doc.intelligencePlane = doc.intelligencePlane || {};',
  '    doc.intelligencePlane.workPath = p.workPath;',
  '    doc.polling = doc.polling || {};',
  '    const cadence = Number(p.pollingIntervalSeconds);',
  '    if (Number.isFinite(cadence) && cadence > 0) doc.polling.workIntervalSeconds = cadence;',
  '    writeFileSync(CONN, JSON.stringify(doc, null, 2) + "\\n");',
  '    conn.intelligencePlane = conn.intelligencePlane || {};',
  '    conn.intelligencePlane.workPath = p.workPath; // keep THIS process coherent with what it just wrote.',
  '    console.log("applied work path:", p.workPath, "every", doc.polling.workIntervalSeconds || 60, "s");',
  '    return true;',
  '  } catch (e) { console.error("work-path-changed: connectivity write failed", e && e.message); return false; }',
  '}',
  '',
  '// Software Update Management (ADR-0035): a signed platform update is AVAILABLE to pull. The EP never',
  '// auto-installs code it cannot verify (INV-3 / ADR-0007) — it records availability + the verify/install',
  '// plan, and REFUSES any event lacking a signature + content hash. The install itself is operator-approved.',
  '//',
  '// THE REFUSAL BELOW IS THIS FILE\'S STRONGEST SAFETY PROPERTY, SO IT RETURNS FALSE AND IS NEVER',
  '// ACKED. An acked refusal told the Intelligence Plane the unsigned update had been applied, which',
  '// is the exact inverse of what happened — and it closed the only channel able to report it.',
  'function applySolutionUpdate(p) {',
  '  if (!p || !p.signature || !p.contentHash) { console.error("solution-update REFUSED (left pending): missing signature/contentHash"); return false; }',
  '  const marker = {',
  '    version: p.version, contentHash: p.contentHash, generatorVersion: p.generatorVersion, templateVersion: p.templateVersion,',
  '    signatureKeyId: p.signature.keyId, mandatory: p.mandatory === true, packageRef: p.packageRef, availableAt: p.publishedAt,',
  '    install: "operator-approved: download packageRef -> recompute hash -> verify ed25519 signature -> backup -> install -> health-check -> rollback on failure -> POST /installed",',
  '  };',
  '  // The marker IS the application — it is the whole of what this event changes here. A failed',
  '  // write leaves nothing recorded, so it is not applied and must not be acked.',
  '  try { writeFileSync(join(ROOT, ".update-available.json"), JSON.stringify(marker, null, 2) + "\\n"); }',
  '  catch (e) { console.error("solution-update: marker write failed", e && e.message); return false; }',
  '  console.log("solution update AVAILABLE:", p.version, "(" + String(p.contentHash).slice(0, 16) + ")", "signed", p.signature.keyId, p.mandatory === true ? "[mandatory]" : "[optional]");',
  '  console.log("  -> operator-approved install: verify signature + hash, backup, install, health-check, rollback-on-failure");',
  '  return true;',
  '}',
  '',
  'async function pollOnce() {',
  '  if (!token) { console.error("Set " + conn.intelligencePlane.credentialEnv + " (issued at registration)."); return; }',
  '  const headers = { authorization: "Bearer " + token, "x-dbiz-contract-version": apiVersion };',
  '  const res = await call(updatesUrl, { headers });',
  '  if (!res.ok) { console.error("pull failed:", res.status); return; }',
  '  const updates = await res.json();',
  '  for (const u of updates.filter((x) => x.status === "pending")) {',
  '    // THE QUEUE STATUS IS ALREADY THE RECORD OF WHETHER AN EVENT WAS APPLIED — the IP reads it and',
  '    // this filter depends on it. The ack is a SECOND record of that same fact, written by the party',
  '    // that never checked, and when the two disagree the second wins BY CONSTRUCTION, because acking',
  '    // is what moves the first. So the ack is now derived from the outcome and nothing else.',
  '    let applied = false;',
  '    try { applied = apply(u) === true; }',
  '    catch (e) { console.error("apply threw:", u.id, u.type, e && e.message); }',
  '    const label = [u.type, u.capability || u.integration || ""].join(" ").trim();',
  '    // Left PENDING on purpose. The next poll retries it, and until then the IP can still see it.',
  '    if (!applied) { console.error("NOT applied, left pending:", u.id, label); continue; }',
  '    const ack = await call(updatesUrl, {',
  '      method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ id: u.id }),',
  '    });',
  '    console.log("applied", u.id, label, "-> ack", ack.status);',
  '  }',
  '}',
  '',
  'const everyMs = (conn.polling && conn.polling.updatesIntervalSeconds ? conn.polling.updatesIntervalSeconds : 60) * 1000;',
  'console.log("EP update agent: polling", updatesUrl, "every", everyMs / 1000, "s");',
  'await pollOnce();',
  'setInterval(() => pollOnce().catch((e) => console.error(e)), everyMs);',
  '',
].join('\n');

/**
 * EP config derived from the tenant's IDENTITY, ENTITLED CAPABILITIES and SELECTED TOOLS. Each
 * capability is enabled with a config scaffold; each tool gets an endpoint + a *credential env
 * reference* (never a secret value — INV-2). A connectivity config maps the EP to its tenant and to
 * the IP endpoints, and an update agent pulls change events. `<FILL: …>` = complete at the EP.
 */
function epConfigFiles(env: TenantEnvelope, registrationEndpoint: string): { files: SolutionFile[]; capabilities: string[]; tools: string[] } {
  const caps = [...env.configuration.dbiz.entitledCapabilities];
  const co = env.configuration.customerOwned as Record<string, any>;
  const tp = env.configuration.technologyProfile;
  const slug = env.onboarding.slug;
  const files: SolutionFile[] = [];
  const tools: string[] = [];
  const envVars: string[] = ['DBIZ_EP_TOKEN']; // IP API token issued to the EP at registration.

  // 0) The application plane. Resolved ONCE and threaded through everything below, so the env
  //    slots, the integrations block, the auth profile, the capability profiles, the portal schema
  //    and the documentation all name the same variables and the same strategies by construction.
  const plane = buildApplicationPlane(env);

  // 1) config/capabilities.json — every entitled capability, ENABLED, with a fill-in config
  //    scaffold specialised to the target the tenant declared (concurrency ceiling, adapter class,
  //    discovery/execution strategy). A D365 tenant no longer receives a web-app capability config.
  const capConfig: Record<string, unknown> = {};
  for (const c of caps) capConfig[c] = capabilityScaffold(c, plane);
  // The functional workflow starts with user-story analysis. The issue key is entered at the EP (the
  // customer's application context) at runtime — never captured at onboarding — so it is always fill-in.
  if (capConfig['functional-testing']) {
    const ft = capConfig['functional-testing'] as Record<string, unknown>;
    ft.issueKey = '<FILL: user story / issue key (e.g. CARL-123)>';
    // Honour the customer's captured browser requirements over the template default.
    const browsers = co?.['application']?.browserRequirements as string[] | undefined;
    if (browsers && browsers.length) ft.browsers = browsers;
  }
  files.push({ path: 'config/capabilities.json', content: `${JSON.stringify({ capabilities: capConfig }, null, 2)}\n` });

  // 1b) config/application.json — the application band: resolved template, authentication strategy,
  //     discovery + execution strategies, runtime requirements, slot references, portal schema and
  //     the validation rules the EP enforces before it starts. One document, no duplication.
  files.push({ path: 'config/application.json', content: `${JSON.stringify(applicationConfigDocument(plane, env), null, 2)}\n` });

  // 2) config/integrations.json — selected tools with endpoints + credential ENV references only.
  const integrations: Record<string, unknown> = {
    _note: 'Fill <FILL: …> values and set the referenced *_ENV secrets at the Execution Plane. Credentials never leave your tenancy (INV-2).',
  };
  const pm = co?.['projectManagement'];
  if (pm?.provider && pm.provider !== 'none') { integrations['projectManagement'] = { provider: pm.provider, project: pm.project ?? '<FILL: project>', ...(pm.board ? { board: pm.board } : {}), ...(pm.repository ? { repository: pm.repository } : {}), baseUrl: '<FILL: provider base URL>', credentialEnv: 'PM_TOKEN' }; tools.push(pm.provider); envVars.push('PM_TOKEN'); }
  // ADR-0085 §6.1 step 2 — THE BLOCK MUST STOP READING COMPLETE.
  //
  // This block previously emitted three valued fields and NO `<FILL:>` at all, which is why a tenant
  // whose Azure DevOps project already held a Test Plan and a tenant for whom one had to be created
  // generated BYTE-IDENTICAL configurations. They were not under-specified; they were
  // indistinguishable — an under-specified block has a slot a reader can see they have not answered.
  //
  // The `<FILL:>` convention WORKS BY EXCEPTION, so a block with no exceptions is the block that
  // looks finished. It was the smallest block in the file and the only fully-valued one, and both
  // facts were consequences of the same emptiness. Every field a tenant did not supply therefore
  // emits a marker, and the widening is worthless without that: an emitted-but-silent field would
  // reproduce the defect one field wider.
  //
  // `repositoryDisposition` carries a marker rather than a value when the record says `unknown`
  // (§5, D-133). It is NOT defaulted here. A default written at the exporter would be the inference
  // §3 rejects, installed as a constant, on behalf of every tenancy that never took the decision.
  const tm = co?.['testManagement'];
  if (tm?.provider && tm.provider !== 'none') {
    const declared = tm.repositoryDisposition;
    integrations['testManagement'] = {
      provider: tm.provider,
      projectKey: tm.projectKey ?? '<FILL: project key>',
      // Ruling 2 FIRST — the organisation root. The consuming plane's adapter factory requires it,
      // and no other block can lawfully supply it: reading `projectManagement.baseUrl` from a
      // test-management code path would couple two providers a tenant may host separately.
      baseUrl: tm.baseUrl ?? '<FILL: test-management organisation base URL>',
      repositoryDisposition: declared && declared !== 'unknown'
        ? declared
        : '<FILL: reuse-existing | create-if-absent | must-exist — REQUIRED, and not inferable from the fields below>',
      // Ruling 3 — plan identity. THE ID IS AUTHORITATIVE; a name that disagrees with a resolved id
      // is recorded, never used to re-target. Both are emitted because they answer two different
      // moments: an id resolves an EXISTING plan, a name is what a CREATED plan is called.
      planId: tm.planId ?? '<FILL: existing Test Plan id — required under reuse-existing / must-exist>',
      planName: tm.planName ?? '<FILL: Test Plan name — required under create-if-absent>',
      // Ruling 4 — suite identity, same rule, plus the discriminant `discoverGrouping` returns. A
      // discovered value nothing can be compared against is a read whose result cannot be checked.
      suiteId: tm.suiteId ?? '<FILL: existing Test Suite id — required under reuse-existing / must-exist>',
      suiteName: tm.suiteName ?? '<FILL: Test Suite name — required under create-if-absent>',
      suiteKind: tm.suiteKind ?? '<FILL: requirement-based | static>',
      credentialEnv: 'TM_TOKEN',
    };
    tools.push(tm.provider); envVars.push('TM_TOKEN');
  }
  if (tp.gitProvider) { integrations['sourceControl'] = { provider: tp.gitProvider, ...(pm?.repository ? { repository: pm.repository } : {}), credentialEnv: 'SCM_TOKEN' }; tools.push(tp.gitProvider); envVars.push('SCM_TOKEN'); }
  const app = co?.['application'];
  // The application target, wholly derived from the resolved Application Template. The integrations
  // block, the auth-profile registry and the .env.example target blocks all read the SAME plane, so
  // they cannot name different env vars for the same slot.
  if (app) integrations['application'] = applicationIntegrationBlock(plane, env);
  // AI is included ONLY when enabled. The vendor/key are resolved in the EP, never in the IP (INV-9).
  const ai = co?.['ai'];
  if (ai?.providerHandle && ai.providerHandle !== 'ai-none') {
    integrations['ai'] = integrationScaffold('ai', ai);
    tools.push('ai-capability'); envVars.push('AI_PROVIDER_KEY');
  }
  // Auth-profile registry — defined ONCE, referenced by every capability's authProfileRef (no dangling
  // <FILL>). It carries the resolved STRATEGY as well as the slots, so a capability resolving
  // `app-default` knows whether to capture a session, where the storage state lives and when to
  // refresh it — without reading the application block or knowing the target's class.
  integrations['authProfiles'] = { 'app-default': applicationAuthProfile(plane, env) };
  // Execution adapters for the interface classes that must be bound — those the ENTITLED capabilities
  // drive, PLUS those the application target itself requires (a desktop or mobile target needs a
  // runner class no capability selects on its own). A capability without a bound runner is the
  // predecessor failure (R-11.13). Selection is tenant-configured (<FILL>).
  const capabilityIfaces = caps.map((c) => (plane.primary.capabilityProfiles[c]?.['adapterInterface'] as string | undefined) ?? CAP_ADAPTER[c]).filter(Boolean) as string[];
  const neededIfaces = [...new Set([...capabilityIfaces, plane.primary.runtime.primaryAdapterInterface])].sort();
  const adapters: Record<string, unknown> = {};
  for (const iface of neededIfaces) {
    const def = adapterInterface(iface);
    adapters[iface] = {
      selection: `<FILL: runner/tool implementing ${iface}>`,
      endpoint: '<FILL: adapter endpoint or "local">',
      timeoutSeconds: def.timeoutSeconds,
      leastPrivilegeScope: '<FILL: minimal scope for this target>',
      ...(def.credentialEnv ? { credentialEnv: def.credentialEnv } : {}),
    };
    if (def.credentialEnv) envVars.push(def.credentialEnv);
  }
  integrations['executionAdapters'] = adapters;
  files.push({ path: 'config/integrations.json', content: `${JSON.stringify(integrations, null, 2)}\n` });

  // 3) config/connectivity.json — the tenant IDENTITY + IP endpoints that MAP this EP to its tenant
  //    and establish connectivity (registration + update pull). The missing "ID to map/connect".
  let ipBase = '<FILL: Intelligence Plane API base URL>';
  try { ipBase = new URL(registrationEndpoint).origin; } catch { /* keep placeholder */ }
  const cust = (env.configuration as unknown as Record<string, any>).customer ?? {};
  const sec = co?.['security'] ?? {};
  const connectivity = {
    tenantId: env.onboarding.tenantId,
    slug,
    // Customer identity captured at onboarding — propagated so the EP knows who it is,
    // which business unit and environment it serves, and its region (non-secret metadata).
    customerName: cust.customerName ?? env.onboarding.displayName ?? slug,
    tenantName: cust.tenantName ?? slug,
    businessUnit: cust.businessUnit ?? '<FILL: business unit>',
    environment: cust.environment ?? 'test',
    executionPlaneName: co?.['deployment']?.executionPlaneName ?? `${slug}_ExecutionPlane`,
    region: co?.['deployment']?.region ?? '<FILL: region>',
    contractVersion: env.configuration.dbiz?.contractVersion ?? '1.0.0',
    intelligencePlane: {
      registrationEndpoint,
      mtlsGatewayBaseUrl: ipBase,
      // Only routes the Intelligence Plane ACTUALLY SERVES are baked as URLs. `/api/register` and
      // `/api/tenants/<slug>/updates` are real and verified. The execute, evidence, OAuth-token and
      // telemetry routes are NOT: nothing in the IP serves `/v1/execute`, `/v1/evidence`, `/v1/token`
      // or `/v1/telemetry`, and composing them from the gateway origin manufactured four confident,
      // well-formed, wrong URLs. A tenant took them at face value and every call 404'd.
      //
      // A placeholder is worse cosmetically and better operationally: `<FILL:>` is caught by the
      // register-then-run boot guard (refuse start on any unresolved placeholder, R-16.9/10/11), so
      // the EP says "this is not configured" instead of failing mid-run against a route that never
      // existed. Bake these only once the cross-plane contract names them — Doc 20, not a guess.
      executeEndpoint: '<FILL: IP execution endpoint — not yet served; see Doc 20 cross-plane contracts>',
      evidenceEndpoint: '<FILL: IP evidence endpoint — not yet served; see Doc 20 cross-plane contracts>',
      updatesEndpoint: `${ipBase}/api/tenants/${slug}/updates`,
      // ADR-0080 §6. THE GENERATOR EMITS THE WORK PATH, AND THAT IS THE DECISION — not a reserved key.
      //
      // The update agent's `work-path-changed` branch WRITES this key back into this generated file,
      // and this file is generator-owned: without an entry here the next routine regeneration would
      // restore a document with no `workPath` at all, and the EP would silently stop polling for work
      // it had already been told about. Silence is not "no work available" — it is "no route known" —
      // so that regression would look exactly like an idle tenancy and redden nothing.
      //
      // The two candidate remedies are NOT equivalent guarantees, and the EP cannot tell which it has:
      //   · a RESERVED KEY promises the generator will not touch what the agent wrote, but the
      //     reservation mechanism here is PATH-prefixed (`RESERVED_PATH_PREFIXES`) and this whole file
      //     is generated. Reserving a key inside a generated JSON document requires a merge-on-write
      //     the generator does not have — a second owner of one file, which is Doc 19's boundary drawn
      //     through the middle of a document instead of between two of them.
      //   · EMITTING IT DEPENDABLY is SELF-HEALING: regeneration RESTORES the correct value rather
      //     than preserving whatever was last written. It is also the stronger guarantee, because it
      //     holds for a tenancy that never received the rotation event at all.
      //
      // Emitting is chosen. It is built by the SAME `workPathFor(slug)` the grant and the rotation
      // carrier use (ADR-0032 — one construction), so all three carriers cannot drift.
      workPath: workPathFor(slug),
      oauthTokenEndpoint: '<FILL: IP OAuth token endpoint — not yet served; see Doc 20 cross-plane contracts>',
      telemetryEndpoint: '<FILL: IP telemetry endpoint — not yet served; see Doc 20 cross-plane contracts>',
      // ADR-0081 P-81.4. NOT a `<FILL:>` — this one is not the operator's to complete.
      //
      // THE PLACEHOLDER WAS FAIL-CLOSED AND STILL WRONG, AND THE DISTINCTION IS THE FINDING (D-125).
      // Every other `<FILL:>` in this package names something the CUSTOMER holds: their CA bundle,
      // their KMS key, their EP signing key. The boot guard's refusal on an unresolved marker is
      // therefore an instruction the operator can act on. **The IP's package verification key is
      // DBiz-held and appears in no artefact the customer possesses**, so this marker sat in a list
      // headed "complete these" naming a value the reader could not obtain — and the EP would have
      // refused to boot forever rather than proceeded, which is safe and permanently non-functional.
      //
      // It now names where the value ARRIVES rather than asking for it: the registration grant
      // carries the key SET (`RegistrationGrant.configuration.packageVerificationKeys`), resolved by
      // `keyId` from each package's `provenance.signingKeyId`, and rotated over the update channel.
      verificationKeySource: 'registration-grant:configuration.packageVerificationKeys',
      credentialEnv: 'DBIZ_EP_TOKEN',
    },
    transport: { connectTimeoutMs: 5000, requestTimeoutMs: 30000, tlsCaRef: '<FILL: CA trust bundle reference>', proxy: null, outboundOnly: true, mutualTls: sec.mutualTls === true },
    // `workIntervalSeconds` matches the grant's `pollingIntervalSeconds` and the rotation carrier's
    // default, so a tenancy's work cadence does not depend on WHEN it onboarded.
    polling: { updatesIntervalSeconds: 60, workIntervalSeconds: WORK_POLL_INTERVAL_SECONDS },
  };
  files.push({ path: 'config/connectivity.json', content: `${JSON.stringify(connectivity, null, 2)}\n` });

  // config/identity.json — durable REFERENCE slots for the registration-issued grant. The registration
  // client persists the grant into the customer secret store and records the refs here (never values, INV-2).
  const identity = {
    _note: 'Durable identity issued at registration. REFERENCES ONLY — never store secret values here (INV-2).',
    tenantId: env.onboarding.tenantId,
    clientCertRef: '<FILL: ref to registration-issued client certificate>',
    keyId: '<FILL: issued key id>',
    oauthClientId: '<FILL: issued OAuth client id>',
    accessTokenRef: '<FILL: secret-store ref>',
    refreshTokenRef: '<FILL: secret-store ref>',
    configurationMapRef: '<FILL: ref to RegistrationGrant.configuration downloaded at registration>',
  };
  files.push({ path: 'config/identity.json', content: `${JSON.stringify(identity, null, 2)}\n` });

  // config/security.json — signature verification, evidence encryption + retention/purge, request signing,
  // residency, isolation. References/placeholders only; DBiz never holds customer keys (R-08.23, INV-2).
  const security = {
    _note: 'Security/isolation references. Placeholders/refs only — never secret values (INV-2).',
    // ADR-0081 P-81.4 — see the note beside `verificationKeySource` in connectivity above.
    // The EP resolves a package's key by its `provenance.signingKeyId` against the set delivered at
    // registration. A SET, not a key: ADR-0007 §6 keeps multiple keys concurrently valid so rotation
    // needs no redeployment, and baking one PEM here would rebuild exactly that coupling.
    signatureVerification: {
      source: 'registration-grant:configuration.packageVerificationKeys',
      resolveBy: 'provenance.signingKeyId',
      algorithm: 'ed25519',
      note: 'Verification keys only. Possession cannot produce a signature (R-08.15).',
    },
    requestSigning: { nonce: true, algorithm: 'ed25519', signingKeyRef: '<FILL: EP signing key ref>' },
    evidence: {
      encryptionKmsKeyRef: '<FILL: customer-held KMS key ref — DBiz never holds it>',
      retentionDays: env.configuration.dbiz?.retentionObligationDays ?? 365,
      purgeSchedule: '0 3 * * *',
    },
    // Security posture captured at onboarding — reflected so the EP enforces the customer's choices.
    posture: { mutualTls: sec.mutualTls === true, oauth: sec.oauth === true, vault: sec.vault === true },
    residency: { region: co?.['deployment']?.region ?? '<FILL: declared residency region>' },
    isolation: { namespace: env.isolation?.namespace ?? env.onboarding.tenantId, networkPolicy: 'default-deny' },
  };
  files.push({ path: 'config/security.json', content: `${JSON.stringify(security, null, 2)}\n` });

  // 4) bin/ep-update-agent.mjs — EP-initiated pull loop: pull pending updates → apply config → ack.
  files.push({ path: 'bin/ep-update-agent.mjs', content: EP_UPDATE_AGENT });

  // 5) docs/EP-CONNECTIVITY.md — how the EP maps to its tenant and pulls updates.
  files.push({ path: 'docs/EP-CONNECTIVITY.md', content: [
    '# Execution Plane — connectivity to the Intelligence Plane',
    '',
    '`config/connectivity.json` maps THIS Execution Plane to its tenant and to the IP:',
    '',
    `- \`tenantId\` — the opaque tenant identity the IP recognises (\`${env.onboarding.tenantId}\`).`,
    '- `intelligencePlane.registrationEndpoint` — where this EP registers on first start (single-use credential in `src/bootstrap/register.*`).',
    '- `intelligencePlane.updatesEndpoint` — where the EP pulls capability/config update events.',
    `- \`intelligencePlane.workPath\` — where the EP asks for work (\`${workPathFor(slug)}\`), relative to the API base.`,
    '- `intelligencePlane.credentialEnv` — env var holding the IP API token issued at registration (`DBIZ_EP_TOKEN`).',
    `- \`polling.workIntervalSeconds\` — how often to ask for work (default ${WORK_POLL_INTERVAL_SECONDS}s).`,
    '',
    '### An absent `workPath` means NOT CONFIGURED — never "idle"',
    '',
    'An EP holding no `workPath` does not poll, so it observes nothing — which is indistinguishable from an empty collection unless it knows which case it is in. An empty collection is a **positive assertion that nothing is pending**; an absent `workPath` is a **deployment fact** — this tenancy is not participating in the work exchange at all. Treating the second as the first leaves an EP permanently idle while work accumulates, reporting itself healthy.',
    '',
    'The key is written by the generator and re-stated by the `work-path-changed` update event, so a regeneration **restores** it rather than erasing it.',
    '',
    '## Update agent (EP-initiated — the IP never dials in, INV-3)',
    '',
    '`bin/ep-update-agent.mjs` pulls pending updates and applies their config into `config/capabilities.json` (capability events), `config/integrations.json` (integration events, e.g. AI) or `config/connectivity.json` (`work-path-changed`), then acknowledges them.',
    '',
    '**An event is acknowledged ONLY if it was applied.** The acknowledgement is what moves the event out of `pending` in the IP\'s queue, so acking an event that was refused, failed to write, or was not recognised by this build would tell the IP the opposite of what happened. A refused `solution-update` (missing signature or content hash — INV-3/ADR-0007) and any event type this build does not recognise are both left **pending**, logged as `NOT applied, left pending`, and retried on the next poll. Connection settings come from `.env` (see `.env.example`):',
    '',
    '- `INTELLIGENCE_API_URL` — IP API base URL; **overrides the baked endpoint** (required for a dev instance).',
    '- `INTELLIGENCE_API_VERSION` — contract version stamped on each call.',
    '- `INTELLIGENCE_TIMEOUT_MS` / `INTELLIGENCE_RETRY` — per-call timeout + retry.',
    '- `DBIZ_EP_TOKEN` — the IP API token issued at registration.',
    '',
    '    INTELLIGENCE_API_URL=<IP API base> DBIZ_EP_TOKEN=<issued-at-registration> node bin/ep-update-agent.mjs',
    '',
  ].join('\n') });

  // 6) .env.example — the IP API connection settings, the application-target slots declared by the
  //    resolved template(s), and one secret per selected tool that needs a credential. A slot the
  //    application plane already defines is NOT repeated in the platform block: one definition per
  //    variable, or the file contradicts itself.
  const applicationEnv = applicationEnvNames(plane);
  const uniqueEnv = [...new Set(envVars)].filter((v) => !applicationEnv.has(v));
  const isDev = tp.cloudProvider === 'dev';
  files.push({ path: '.env.example', content: [
    '# ── Runtime (process) ──',
    `NODE_ENV=${isDev ? 'development' : ''}  # [optional] production | development — affects logging/DX ONLY,`,
    '           #   NOT transport/identity security (that is fixed by config/security.json; see Doc 08 security model)',
    'PORT=  # [optional] port the EP health/service listens on (default 8080)',
    '',
    '# ── Execution mode / strategy (Execution Readiness Framework) ──',
    '#   OPTIONAL. Precedence: request → these env vars → src/config/execution.config.json → default.',
    '#   An invalid value is a Configuration Error (never silently changed); leave blank to use the committed default.',
    `EP_EXECUTION_MODE=${isDev ? 'dry-run' : ''}  # [optional] dry-run | mock-live | live | provisioned-local-live | customer-cloud-live | dbiz-managed-cloud-live`,
    'EP_EXECUTION_STRATEGY=  # [optional] local | customer-cloud | dbiz-managed-cloud  (default: the strategy in src/config/execution.config.json)',
    '',
    '# ── DBiz Intelligence Plane API connection ──',
    `INTELLIGENCE_API_URL=${isDev ? 'http://127.0.0.1:4610' : ''}  # [required] DBiz Intelligence API base URL${isDev ? ' (dev instance)' : ''}`,
    `INTELLIGENCE_API_VERSION=${env.configuration.dbiz?.contractVersion ?? '1.0.0'}  # [optional] contract version to call`,
    'INTELLIGENCE_TIMEOUT_MS=200000  # [optional] per-call timeout ≈ IP tenant deadline (180s) + margin',
    'INTELLIGENCE_RETRY=3  # [optional] outbound retry attempts on transient failure',
    '',
    applicationEnvBlocks(plane),
    '',
    '# ── Secrets — fill in YOUR tenancy; never committed, never sent to the IP (INV-2) ──',
    ...uniqueEnv.map((v) => `${v}=${ENV_COMMENT[v] ? `  # ${ENV_COMMENT[v]}` : ''}`),
    '',
  ].join('\n') });

  // 4) docs/EP-CONFIGURATION.md — what to complete.
  files.push({ path: 'docs/EP-CONFIGURATION.md', content: [
    '# Execution Plane — configuration to complete',
    '',
    'This package was generated with your **entitled capabilities** and **selected tools** enabled.',
    'Complete the `<FILL: …>` placeholders and set the secrets in `.env.example` — the Intelligence Plane holds none of them.',
    '',
    '## Capabilities — `config/capabilities.json`',
    ...(caps.length ? caps.map((c) => `- **${c}** — enabled; complete its settings.`) : ['- (none entitled)']),
    '',
    '## Integrations — `config/integrations.json`',
    ...(tools.length ? tools.map((t) => `- **${t}** — set its endpoint and the referenced \`*_ENV\` secret.`) : ['- (no tools selected)']),
    '',
    '## Application under test — `config/application.json`',
    ...applicationConfigurationSummary(plane),
    '',
    '## Connectivity — `config/connectivity.json`',
    '- Maps this EP to its tenant + IP endpoints; `bin/ep-update-agent.mjs` pulls updates. See `docs/EP-CONNECTIVITY.md`.',
    '',
    '## Application slots — `.env.example`',
    ...(plane.envFields.length
      ? plane.envFields.map((f) => `- \`${f.envVar}\`${f.required ? ' — required' : ''}${f.secret ? ' — secret' : ''}`)
      : ['- (this target needs no environment slot)']),
    '',
    '## Platform secrets — `.env.example`',
    ...(uniqueEnv.length ? uniqueEnv.map((v) => `- \`${v}\``) : ['- (none required)']),
    '',
  ].join('\n') });

  // docs/EP-APPLICATION.md — the operator guidance for THIS target class, and no other. Generated
  // from the resolved template's documentation fragments, so a D365 tenant is told about session
  // capture and MFA while a REST tenant is told about its OpenAPI document — never both.
  files.push({ path: 'docs/EP-APPLICATION.md', content: applicationDocument(plane) });

  // docs/EP-RUNTIME-REQUIREMENTS.md — the RUNTIME CODE the generator does not yet emit, made explicit so
  // nothing is silently missing (audited against docs 04/05/06/07/08/11/12/14/16/17/20).
  files.push({ path: 'docs/EP-RUNTIME-REQUIREMENTS.md', content: [
    '# Execution Plane — runtime code required (roadmap)',
    '',
    'This template ships COMPLETE CONFIGURATION (identity, connectivity, capabilities, integrations, security',
    '— all references/placeholders, no secrets, INV-2) plus a working update-pull agent. The RUNTIME CODE below',
    'is required for a fully operational EP and is NOT yet emitted by the generator.',
    '',
    '## Cross-plane + identity (high)',
    '- **Single cross-plane client** — the only egress: mTLS + short-lived OAuth + per-request nonce + signing; Success/Refusal/Unavailability results; bounded backoff; correlation/idempotency; contract-version stamped (R-05.3).',
    '- **Registration client** — presents the one-time credential, consumes it once, PERSISTS the issued grant (cert/keyId, OAuth tokens, configuration map) to the durable secret store; without persistence a restart loses identity forever (R-08.48/50).',
    '- **Register-then-run entrypoint** — config load+validate (refuse start on any unresolved `<FILL:>`), constitutional boot guards (refuse if inference is detected in the EP), register, compose, ready; accept no work before readiness (R-16.9/10/11).',
    '',
    '## Execution + evidence (high)',
    '- **Execution-package sequencer** — verify-before-execute, and BOTH checks pass before execution (R-20.29): the recomputed content hash equals the hash the package was requested by (R-20.28), and the detached signature verifies against the key resolved by `provenance.signingKeyId` from `security.signatureVerification.source` — the key set delivered in the registration grant (ADR-0081 P-81.4). Also: proceed flag, provenance, validity window. Failure halts as a refusal, never a degrade (R-08.13–15).',
    '- **The signature travels beside the package, not inside it.** `GET /api/packages/{hash}` returns an envelope carrying the package and its detached signature (ADR-0081 P-81.2); the content hash is recomputed over the PACKAGE MEMBER, never over the envelope. A package served without its signature is refused by the Intelligence Plane and never reaches this sequencer.',
    '- **Execution-tool adapters (I2–I6/I7)** — implement the runners bound in `config/integrations.json.executionAdapters`; a capability with no runner must not surface (R-11.13).',
    '- **Evidence record + submission** — build the full record (package/content hash, algorithm version, capture context, classification) via the canonical `tenant/capability/run/artefact` path constructor; submit reference+hash to `/v1/evidence`.',
    '- **Deferred certification queue** — durable, survives restart; holds evidence while the IP is unavailable ("testing continues, judgment waits").',
    '- **Evidence retention** — reader + scheduled purge (`security.evidence.purgeSchedule`) + a test proving data unreadable after `retentionDays` (R-06.13/14).',
    '',
    '## Runtime surface (high/medium)',
    '- **Health / liveness / readiness** endpoint + Dockerfile `HEALTHCHECK` + a real Deployment/Service spec (replace the ConfigMap-only deploy).',
    '- **Graceful shutdown** — SIGTERM → stop accepting → drain → flush evidence + queue → exit.',
    '- **Telemetry export + contract-version reporting** — stage-transition events, correlation propagation, deployed contract version (R-16.30–33).',
    '- **Depend on `@dbiz/platform-runtime`** in the dependency manifest so registration/isolation/health/vault code reaches the artefact.',
    '',
    '## Needs design first (low)',
    '- **Heartbeat cross-plane call** — no EP-initiated heartbeat path is defined in Docs 04/05/20 yet; design it (EP-initiated, R-05.1) before generating it.',
    '',
    'Audit priorities: 20 high, 8 medium, 3 low.',
    '',
  ].join('\n') });

  // 7) Execution-Plane Operational Portal (ADR-0035) — branded, self-contained UI + Local Execution API + CLI.
  //    Runs in the customer tenancy; the Run button and `ep run <cap>` both call the SAME Local Execution API
  //    (one sequencing path, R-04.5). No external calls (self-contained); secrets are vault:// refs (INV-2);
  //    the sequencer verifies-before-execute and reports PENDING/DEGRADED — it never emits a verdict (R-05.11).
  const cfg = env.configuration as unknown as Record<string, any>;
  const customerName = cfg.customer?.customerName ?? cfg.customer?.tenantName ?? env.onboarding?.displayName ?? slug;
  const environment = (cfg.customer?.environment as string | undefined) ?? (co?.['deployment']?.environment as string | undefined) ?? 'UAT';
  const appUrl = (co?.['application']?.applicationUrl as string | undefined) ?? '<FILL: app URL>';
  // Branding band from the SSOT (ADR-0035 R-35.7); absent -> deterministic monogram fallback (backward-compatible).
  const portal = portalBrand(String(customerName), String(environment), env.branding as import('./portal-templates.js').BrandingInput | undefined);
  // The portal's configuration screen is rendered from the APPLICATION TEMPLATE's portal schema —
  // fields, groups, input types, secret handling, help text and conditional visibility all come
  // from metadata. A D365 tenant sees a sign-in section; a REST tenant sees OAuth fields; neither
  // is a hard-coded form. `config/application.json` carries the same schema for the live portal;
  // this snapshot is what the page renders when the Local Execution API is not yet running.
  files.push({ path: 'web/index.html', content: portalIndexHtml(portal, caps, appUrl, applicationPortalSnapshot(plane)) });
  files.push({ path: 'src/portal/server.mjs', content: `${PORTAL_SERVER_MJS}\n` });
  files.push({ path: 'bin/ep.mjs', content: `${EP_CLI_MJS}\n` });
  files.push({ path: 'docs/EP-PORTAL.md', content: [
    '# Execution Plane — Operational Portal (ADR-0035)',
    '',
    'A branded, self-contained operational console generated into this solution. It runs in YOUR tenancy and',
    'talks only to the Local Execution API — it opens no path to DBiz and requires no inbound port (INV-3).',
    '',
    '## Run it',
    '',
    '    node src/portal/server.mjs      # starts the Local Execution API + serves the portal on http://127.0.0.1:8080',
    '',
    'Open http://127.0.0.1:8080 for the console: Dashboard, Configuration, Capabilities, Execution monitor,',
    'Live logs, Evidence, Reports, Health, Settings.',
    '',
    '## One execution path (UI and terminal are identical, R-04.5)',
    '',
    'The Run button and the CLI call the SAME endpoint — only the trigger differs:',
    '',
    '    node bin/ep.mjs run functional-testing   # == clicking Run on the Functional testing card',
    '',
    '## Configuration — rendered from your application template',
    '',
    `The Configuration screen is generated from \`config/application.json\`, the band produced for your declared`,
    `target (**${plane.primary.label}**). Its groups, fields, input types, help text and validation all come from`,
    'that file — the portal holds no field list of its own, so a package for a different target shows a different',
    'form without any change to portal code.',
    '',
    'Two kinds of field appear:',
    '',
    '- **Environment slots** — shown read-only as `env:NAME`. Their values live in `.env` at this Execution Plane.',
    '  The portal shows you WHERE a value is read from and never holds the value itself (INV-2).',
    '- **Operational settings** — editable, persisted to `config/portal.json`, and applied on reload.',
    '',
    'Tool credentials remain `vault://` references, never plaintext. Which capabilities are ENABLED is owned by',
    'the Intelligence Plane and arrives via `bin/ep-update-agent.mjs`.',
    '',
    '## Configuration readiness',
    '',
    'The validation rules in `config/application.json` are the SAME rules the Intelligence Plane applied when it',
    'generated this package. `GET /api/validation` evaluates them against this environment, and the Health screen',
    'reports any unmet rule by name — so an incomplete package says so rather than failing mid-run.',
    '',
    '## What is live, and what is pending',
    '',
    'The portal, config service, Local Execution API and queue are live. Clicking Run enqueues a job and reports',
    'it PENDING: real execution against your systems (stage 8) needs the EP execution runtime and a container',
    'runtime — see `docs/EP-RUNTIME-REQUIREMENTS.md`. The portal never fabricates a verdict.',
    '',
  ].join('\n') });

  return { files, capabilities: caps, tools };
}

/** Build (and optionally write) the full solution, returning the manifest the API surfaces. */
export function generateTenantSolution(env: TenantEnvelope, opts: SolutionBuildOptions & { outputDir?: string }): SolutionManifest {
  const solution = buildTenantSolution(env, opts);
  const { files: extra, capabilities, tools } = epConfigFiles(env, opts.registrationEndpoint);
  const base: SolutionFile[] = solution.files.map((f) => ({ path: f.path, content: f.content }));
  const all = [...base, ...extra].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const tp = env.configuration.technologyProfile;
  const outputPath = opts.outputDir ? writeSolutionFiles(opts.outputDir, env.onboarding.slug, all) : undefined;
  return {
    tenantId: env.onboarding.tenantId,
    profile: { language: tp.language, framework: tp.framework, testRunner: tp.testRunner, packageManager: tp.packageManager },
    capabilities,
    tools,
    fileCount: all.length,
    contentHash: solution.contentHash.value,
    generatorVersion: solution.generatorVersion,
    templateVersion: solution.templateVersion,
    ...(outputPath ? { outputPath } : {}),
    files: all,
  };
}
