/**
 * TRACEABILITY: 08-security-model.md · ADR-0033
 *
 * The deployable app-role declaration must agree with the role table the API enforces.
 *
 * These are two halves of one contract held in different languages: `deploy/azure/entra-app-roles.json`
 * is what gets CREATED in the directory, and `ENTRA_ROLE_MAP` is what the API ACCEPTS. Drift between
 * them is silent and one-directional in its damage — a role that exists in the directory but not in the
 * table admits nobody, and the refusal blames the operator's account rather than the mismatch.
 *
 * This is exactly how the deployment reached production with the role check enabled and no role that
 * could satisfy it: the vocabulary existed only in TypeScript, so nothing could be provisioned from it
 * and nothing checked that what got provisioned matched.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ENTRA_ROLE_MAP, mapEntraRoles } from '../src/engine/microsoft-auth.js';
import type { Role } from '../src/engine/authz.js';

interface AppRole {
  readonly id: string;
  readonly value: string;
  readonly displayName: string;
  readonly allowedMemberTypes: readonly string[];
  readonly isEnabled: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const declaration = JSON.parse(
  readFileSync(join(here, '..', '..', '..', '..', 'deploy', 'azure', 'entra-app-roles.json'), 'utf8'),
) as { appRoles: readonly AppRole[] };

describe('the deployable Entra app roles match the roles the API accepts', () => {
  test('every declared role resolves to a DBiz role', () => {
    // A declared role the API does not recognise is worse than a missing one: it can be assigned, it
    // appears correct in the portal, and it grants nothing.
    for (const role of declaration.appRoles) {
      const mapped = mapEntraRoles([role.value]);
      assert.equal(mapped.length, 1, `app role "${role.value}" maps to no DBiz role — ENTRA_ROLE_MAP would refuse anyone holding it`);
    }
  });

  test('every DBiz role an operator can hold is declared', () => {
    // Otherwise a role is enforceable but not provisionable — the state that caused the lockout.
    const declaredRoles = new Set<Role>(declaration.appRoles.flatMap((r) => mapEntraRoles([r.value])));
    for (const role of new Set(Object.values(ENTRA_ROLE_MAP))) {
      assert.ok(declaredRoles.has(role), `DBiz role "${role}" is accepted by the API but no app role declares it`);
    }
  });

  test('roles are assignable to USERS, and enabled', () => {
    // An Application-only role never appears in a user's token, and a disabled one is never issued.
    // Both fail exactly like an unassigned role, which is the hardest failure here to tell apart.
    for (const role of declaration.appRoles) {
      assert.ok(role.allowedMemberTypes.includes('User'), `app role "${role.value}" is not assignable to users`);
      assert.equal(role.isEnabled, true, `app role "${role.value}" is disabled and would never be issued`);
    }
  });

  test('role ids are stable, unique GUIDs', () => {
    // Azure keys assignments by role id. A duplicated or regenerated id orphans live assignments, and
    // the symptom is an operator silently losing access at their next sign-in.
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = new Set<string>();
    for (const role of declaration.appRoles) {
      assert.match(role.id, guid, `app role "${role.value}" has an id that is not a GUID`);
      assert.ok(!ids.has(role.id), `duplicate app role id ${role.id}`);
      ids.add(role.id);
    }
  });

  test('the canonical DBiz.* values are the declared ones', () => {
    // The `value` is the only field Entra puts in the token and the only one the API matches; the
    // display name is matched by nothing. Pinning these keeps the operator-facing refusal message,
    // the provisioning script and the directory talking about the same strings.
    assert.deepEqual(
      declaration.appRoles.map((r) => r.value).sort(),
      ['DBiz.Platform.Admin', 'DBiz.Tenant.Admin', 'DBiz.Viewer'],
    );
  });
});
