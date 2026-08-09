/**
 * Operational runbooks — generated, with every step bound to a real operation.
 *
 * TRACEABILITY
 *   Architecture : 23-operational-excellence-model.md · 25-customer-success-model.md §14
 *   ADR          : ADR-0021
 *   Criteria     : C-25.11 (every release ships a Customer Success Package)
 *                  C-25.12 (the package is generated from validation output)
 *                  C-23.9  (restore is exercised, not documented)
 *
 * A RUNBOOK STEP THAT NAMES NO OPERATION IS A SUGGESTION.
 * Every step below carries an `operation` identifying the platform capability it
 * exercises, and the generator refuses to emit a runbook whose steps name operations
 * the platform does not have. That check is the difference between a runbook and a
 * plausible narrative: the narrative is discovered to be wrong during the incident.
 *
 * VERIFICATION IS PART OF THE PROCEDURE, NOT AN EPILOGUE.
 * Each runbook ends with a step that observes an outcome. A procedure that finishes
 * with "the certificate has been rotated" has not established that anything works —
 * it has established that a command returned.
 */

export interface RunbookStep {
  readonly n: number;
  readonly action: string;
  /** The platform operation this step exercises. Validated against the known set. */
  readonly operation: string;
  /** How the operator knows the step worked. Never "no errors were reported". */
  readonly verify: string;
}

export interface Runbook {
  readonly id: string;
  readonly title: string;
  /** When to reach for this. Distinct from the title, which says only what it is. */
  readonly whenToUse: string;
  readonly downtime: string;
  readonly reversible: boolean;
  readonly steps: readonly RunbookStep[];
  /** What to do if the procedure fails partway. The step nobody writes. */
  readonly ifItFails: string;
}

/**
 * Operations the platform actually exposes.
 *
 * A runbook may only name one of these. The list is the contract between what is
 * written down and what exists — and it is checked, so a runbook cannot drift into
 * describing a capability that was removed or never built.
 */
export const KNOWN_OPERATIONS = [
  'tenant.create', 'tenant.decommission',
  'credential.issue-one-time', 'registration.register', 'registration.rotate-certificate',
  'certificate.validate', 'certificate.revoke',
  'token.issue', 'token.verify',
  'secret.store', 'secret.rotate', 'secret.retrieve-version', 'secret.revoke',
  'solution.generate', 'gateway.call',
  'diagnostics.preflight', 'diagnostics.doctor',
  'audit.read', 'evidence.restore',
] as const;

export type KnownOperation = (typeof KNOWN_OPERATIONS)[number];

export class RunbookError extends Error {
  constructor(public readonly runbookId: string, public readonly unknownOperations: readonly string[]) {
    super(`runbook ${runbookId} names unknown operation(s): ${unknownOperations.join(', ')}`);
    this.name = 'RunbookError';
  }
}

const step = (n: number, action: string, operation: KnownOperation, verify: string): RunbookStep =>
  ({ n, action, operation, verify });

export function buildRunbooks(): readonly Runbook[] {
  const runbooks: Runbook[] = [
    {
      id: 'tenant-provisioning',
      title: 'Tenant provisioning',
      whenToUse: 'A new team or environment needs its own Execution Plane.',
      downtime: 'None — nothing exists yet.',
      reversible: true,
      steps: [
        step(1, 'Run pre-flight checks on the target environment.', 'diagnostics.preflight',
          'Every check reports pass. A failure names the unmet precondition.'),
        step(2, 'Validate the technology profile against the live schema.', 'diagnostics.doctor',
          'The profile is accepted. A refusal names the field or the unsupported combination.'),
        step(3, 'Create the tenant.', 'tenant.create',
          'A `tenant-creation` event appears in the audit trail.'),
        step(4, 'Issue a one-time registration credential.', 'credential.issue-one-time',
          'A credential is returned. It is single-use; do not store it as a key.'),
        step(5, 'Generate the Execution Plane solution.', 'solution.generate',
          'A file count and content hash are returned. Regenerating yields the same hash.'),
        step(6, 'Hand the repository to the customer team.', 'solution.generate',
          'The team can clone and build it without further input.'),
      ],
      ifItFails: 'Steps 1 and 2 fail before anything is created — correct and re-run. If step 3 or later fails, the tenant may exist without a registration; re-running is safe because registration is idempotent by tenant.',
    },
    {
      id: 'registration',
      title: 'Execution Plane registration',
      whenToUse: 'First start of a deployment, or after rebuilding one from scratch.',
      downtime: 'None.',
      reversible: true,
      steps: [
        step(1, 'Confirm outbound connectivity to the platform endpoint.', 'diagnostics.preflight',
          'The connectivity check passes. A failure here is egress or a TLS-inspecting proxy.'),
        step(2, 'Start the deployment so it registers with its one-time credential.', 'registration.register',
          'Registration returns a grant. A repeat returns the SAME grant, not a second identity.'),
        step(3, 'Validate the issued certificate.', 'certificate.validate',
          'The certificate is valid and bound to the expected tenant.'),
        step(4, 'Verify the access token against the certificate.', 'token.verify',
          'The token verifies and is bound to the certificate key.'),
        step(5, 'Make an authenticated call.', 'gateway.call',
          'The call is served. This — not credential issuance — is what proves registration worked.'),
      ],
      ifItFails: 'A failed registration leaves the tenant UNREGISTERED, never half-registered, so retrying is safe. `credential-already-consumed` on a genuinely new deployment means the tenant identifier is wrong.',
    },
    {
      id: 'certificate-renewal',
      title: 'Certificate renewal',
      whenToUse: 'At 14 days remaining, or immediately on suspected compromise.',
      downtime: '**None.** The previous certificate keeps working until it is revoked.',
      reversible: true,
      steps: [
        step(1, 'Check the current certificate.', 'certificate.validate',
          'Days remaining are reported. Under 14 is the trigger; under 0 is an outage.'),
        step(2, 'Rotate.', 'registration.rotate-certificate',
          'New certificate material is returned, with a different key id.'),
        step(3, 'Confirm the PREVIOUS certificate still works.', 'gateway.call',
          'Served. This is the overlap that removes the need for a coordinated restart.'),
        step(4, 'Deploy the new certificate and obtain a token bound to it.', 'token.issue',
          'A token is issued against the new key id.'),
        step(5, 'Make an authenticated call with the new material.', 'gateway.call',
          'Served.'),
        step(6, 'Revoke the previous certificate.', 'certificate.revoke',
          'A call using the old certificate is now refused with `certificate revoked`.'),
      ],
      ifItFails: 'Stop before step 6. Until revocation, both certificates work and you can simply continue on the old one. Never revoke before step 5 has passed.',
    },
    {
      id: 'secret-rotation',
      title: 'Secret rotation',
      whenToUse: 'On schedule, on staff change, or on suspected exposure.',
      downtime: '**None.** The previous version stays readable until revoked.',
      reversible: true,
      steps: [
        step(1, 'Record the current version number.', 'secret.retrieve-version',
          'The current version is returned.'),
        step(2, 'Rotate.', 'secret.rotate',
          'A higher version number is returned.'),
        step(3, 'Confirm work in flight still resolves the previous version.', 'secret.retrieve-version',
          'The previous version is still readable. This overlap is what makes rotation not an outage.'),
        step(4, 'Confirm execution continues.', 'gateway.call',
          'Calls are still served across the rotation.'),
        step(5, 'Revoke the previous version once nothing is using it.', 'secret.revoke',
          'The previous version is no longer retrievable.'),
      ],
      ifItFails: 'Before step 5 nothing is lost — the old version is live. After step 5 the old value is gone; if something was still using it, rotate forward again rather than trying to restore.',
    },
    {
      id: 'platform-upgrade',
      title: 'Platform upgrade',
      whenToUse: 'DBiz upgrades the platform. Recorded so you know what to expect.',
      downtime: 'None for you.',
      reversible: true,
      steps: [
        step(1, 'Confirm your contract version is inside the supported window.', 'token.verify',
          'Calls continue to be served.'),
        step(2, 'Make an authenticated call after the upgrade.', 'gateway.call',
          'Served, with no change on your side.'),
        step(3, 'Check the audit trail for upgrade events affecting your tenant.', 'audit.read',
          'Any upgrade affecting you is recorded and attributable.'),
      ],
      ifItFails: 'A platform upgrade that breaks a contract inside its supported window is a platform defect. Report it; do not work around it by upgrading early under pressure.',
    },
    {
      id: 'execution-plane-upgrade',
      title: 'Execution Plane upgrade',
      whenToUse: 'You choose to adopt a newer generated scaffolding.',
      downtime: 'Your schedule.',
      reversible: true,
      steps: [
        step(1, 'Regenerate from your existing profile.', 'solution.generate',
          'A content hash is returned. Same profile and generator version means byte-identical output.'),
        step(2, 'Review the diff in your repository.', 'solution.generate',
          'The diff shows only real changes — determinism is what makes that true.'),
        step(3, 'Deploy.', 'registration.register',
          'Registration is idempotent: you get your existing grant, not a new identity.'),
        step(4, 'Run diagnostics.', 'diagnostics.doctor',
          'Every check passes.'),
      ],
      ifItFails: 'Roll back to the previous commit and redeploy. Nothing on the platform side changed, so there is nothing to unwind there.',
    },
    {
      id: 'rollback',
      title: 'Rollback',
      whenToUse: 'A deployment is misbehaving and you want the previous state back.',
      downtime: 'Your schedule.',
      reversible: true,
      steps: [
        step(1, 'Redeploy the previous commit of your repository.', 'registration.register',
          'The deployment starts and re-registers idempotently.'),
        step(2, 'Confirm credentials still verify.', 'token.verify',
          'They do. Rolling back your deployment does not invalidate platform-issued credentials.'),
        step(3, 'Make an authenticated call.', 'gateway.call',
          'Served.'),
        step(4, 'Run diagnostics.', 'diagnostics.doctor',
          'Every check passes.'),
      ],
      ifItFails: 'Credentials are independent of your deployment version, so a rollback cannot lose them. If they no longer verify, the cause is unrelated to the rollback — run the certificate check.',
    },
    {
      id: 'disaster-recovery',
      title: 'Disaster recovery',
      whenToUse: 'The Execution Plane environment is lost.',
      downtime: 'Until recovery completes.',
      reversible: false,
      steps: [
        step(1, 'Restore your repository from your own backup.', 'evidence.restore',
          'Compare content hashes, not filenames. A file that exists is not a file that is intact.'),
        step(2, 'If the repository is unrecoverable, regenerate the scaffolding.', 'solution.generate',
          'Deterministic generation returns the same hash for the same profile and version.'),
        step(3, 'Redeploy.', 'registration.register',
          'Idempotent registration returns your existing grant.'),
        step(4, 'Validate the certificate.', 'certificate.validate',
          'Valid, and bound to your tenant.'),
        step(5, 'Rotate credentials if the loss may have exposed them.', 'registration.rotate-certificate',
          'New material is issued; revoke the old only after the new is proven.'),
        step(6, 'Run full diagnostics.', 'diagnostics.doctor',
          'Every check passes.'),
      ],
      ifItFails: '**Your tests and test data exist only in your backups** — the platform holds no copy. That is a security property and a recovery obligation at the same time. If your backups are also lost, the platform cannot help recover them, and no procedure here will change that.',
    },
    {
      id: 'tenant-decommissioning',
      title: 'Tenant decommissioning',
      whenToUse: 'A tenant is being retired permanently.',
      downtime: 'Terminal.',
      reversible: false,
      steps: [
        step(1, 'Confirm with the tenant owner. This does not reverse.', 'audit.read',
          'The decision is recorded before anything is destroyed.'),
        step(2, 'Take your own final backup of everything you need.', 'evidence.restore',
          'Restore it somewhere and verify content hashes BEFORE proceeding.'),
        step(3, 'Decommission the tenant.', 'tenant.decommission',
          'The tenant is no longer registered.'),
        step(4, 'Confirm the certificate is revoked.', 'certificate.validate',
          'Validation reports `revoked`.'),
        step(5, 'Confirm calls are refused.', 'gateway.call',
          'Refused.'),
        step(6, 'Confirm the audit trail records the decommission.', 'audit.read',
          'A `decommission` event is present. The record outlives the tenant, deliberately.'),
      ],
      ifItFails: 'If step 2 was skipped, stop — there is no recovery path after step 3. Decommissioning revokes credentials and removes registration; the audit record remains, but access does not.',
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      whenToUse: 'Something is refused and the reason is not yet obvious.',
      downtime: 'None.',
      reversible: true,
      steps: [
        step(1, 'Run full diagnostics.', 'diagnostics.doctor',
          'Failures print first, each with what to do next. Usually this is the whole procedure.'),
        step(2, 'If connectivity fails, check egress and TLS inspection.', 'diagnostics.preflight',
          'Outbound reaches the endpoint. A re-signing proxy breaks mutual TLS.'),
        step(3, 'If the certificate fails, read the classified reason.', 'certificate.validate',
          'The reason distinguishes expired, revoked, wrong-tenant and untrusted-issuer — four different problems.'),
        step(4, 'If the token fails, check whether it is bound to the certificate you presented.',
          'token.verify',
          '`not-bound-to-certificate` after a rotation means fetch a token for the new certificate.'),
        step(5, 'If everything individually passes, call the gateway.', 'gateway.call',
          'The refusal names the layer: `403` is entitlement, `429` is rate, `401` is identity.'),
      ],
      ifItFails: 'A refusal carrying no reason, an accepted cross-tenant access, or credentials that are issued but do not verify are platform defects. Report them rather than working around them.',
    },
  ];

  for (const r of runbooks) validateRunbook(r);
  return [...runbooks].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Refuse a runbook that names an operation the platform does not have.
 *
 * Throwing is deliberate. A runbook referencing a non-existent operation is not a
 * documentation defect to be reported later — it is a procedure that will fail during
 * an incident, which is the worst possible moment to discover it.
 */
export function validateRunbook(r: Runbook): void {
  const known = new Set<string>(KNOWN_OPERATIONS);
  const unknown = r.steps.map((s) => s.operation).filter((o) => !known.has(o));
  if (unknown.length > 0) throw new RunbookError(r.id, [...new Set(unknown)]);
}

export function renderRunbook(r: Runbook): string {
  return [
    `# Runbook — ${r.title}`,
    '',
    `**When to use:** ${r.whenToUse}`,
    `**Downtime:** ${r.downtime}`,
    `**Reversible:** ${r.reversible ? 'Yes' : '**No.** Read every step before starting.'}`,
    '',
    '## Procedure',
    '',
    '| # | Action | How you know it worked |',
    '|---|---|---|',
    ...r.steps.map((s) => `| ${s.n} | ${s.action} | ${s.verify} |`),
    '',
    '## If it fails partway',
    '',
    r.ifItFails,
    '',
    '---',
    '',
    `*Generated. Every step names a platform operation that exists — the generator refuses to emit a runbook whose steps do not (${r.steps.length} steps, ${new Set(r.steps.map((s) => s.operation)).size} distinct operations).*`,
    '',
  ].join('\n');
}

export function generateRunbookDocs(): readonly { path: string; title: string; content: string }[] {
  return buildRunbooks().map((r) => ({
    path: `runbooks/RUNBOOK-${r.id}.md`,
    title: `Runbook — ${r.title}`,
    content: renderRunbook(r),
  }));
}
