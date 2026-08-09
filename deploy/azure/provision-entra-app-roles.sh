#!/usr/bin/env bash
#
# Provision the DBiz application roles on an Entra app registration, and optionally assign one.
#
#   ./provision-entra-app-roles.sh <app-client-id> [user-principal-name] [role-value]
#
# Example — create the roles and make someone a platform admin:
#   ./provision-entra-app-roles.sh deee6bc0-f3f1-49fa-ac8d-62e7ccb8b16e you@yourorg.com DBiz.Platform.Admin
#
# Run it in Azure Cloud Shell (already authenticated) or anywhere with `az login` done. The signed-in
# account needs to administer the app registration — Application Administrator, Cloud Application
# Administrator, or ownership of the app.
#
# WHY THIS EXISTS. The roles are part of the solution (see entra-app-roles.json), but the API can only
# CONSUME them; a directory object has to be created before any token can carry one. Reproducing them
# by hand from documentation is how a deployment ends up with the role check enabled and no role that
# satisfies it — the operator is then locked out by a control that is working exactly as designed.
#
# ADDITIVE AND IDEMPOTENT. Existing roles are preserved: roles already present (matched by id) are left
# untouched, so re-running this is safe and it will not disturb roles this solution does not own.
set -euo pipefail

APP_ID="${1:-}"
ASSIGN_UPN="${2:-}"
ASSIGN_ROLE="${3:-DBiz.Platform.Admin}"
ROLES_FILE="$(dirname "$0")/entra-app-roles.json"

if [ -z "$APP_ID" ]; then
  echo "usage: $0 <app-client-id> [user-principal-name] [role-value]" >&2
  exit 2
fi
[ -f "$ROLES_FILE" ] || { echo "missing $ROLES_FILE" >&2; exit 1; }

OBJECT_ID="$(az ad app show --id "$APP_ID" --query id -o tsv)"
echo "app registration: $APP_ID (object $OBJECT_ID)"

# ── 1. Merge the declared roles into whatever is already there ────────────────────────────────────
# A PATCH REPLACES the whole appRoles collection, so the existing set must be read and merged. Sending
# only our three would silently delete every other role on the application.
CURRENT="$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/applications/$OBJECT_ID" \
  --query appRoles -o json)"

MERGED="$(python3 - "$ROLES_FILE" <<PY
import json, sys
declared = json.load(open(sys.argv[1]))["appRoles"]
current = json.loads('''$CURRENT''' or "[]")
by_id = {r["id"]: r for r in current}
added = []
for role in declared:
    if role["id"] not in by_id:
        by_id[role["id"]] = role
        added.append(role["value"])
print(json.dumps({"appRoles": list(by_id.values()), "added": added}))
PY
)"
ADDED="$(echo "$MERGED" | python3 -c 'import json,sys; print(", ".join(json.load(sys.stdin)["added"]) or "(none — already present)")')"

if [ "$ADDED" != "(none — already present)" ]; then
  echo "$MERGED" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({"appRoles": d["appRoles"]}))' > /tmp/dbiz-app-roles.json
  az rest --method PATCH \
    --uri "https://graph.microsoft.com/v1.0/applications/$OBJECT_ID" \
    --headers 'Content-Type=application/json' \
    --body @/tmp/dbiz-app-roles.json
  rm -f /tmp/dbiz-app-roles.json
fi
echo "roles added: $ADDED"

# ── 2. Assign, if a user was named ────────────────────────────────────────────────────────────────
# DEFINING A ROLE EMITS NOTHING. Until a user is assigned, their token carries no `roles` claim at all
# and the API refuses them. This is the step most often missed, because the portal presents role
# creation (App registrations) and role assignment (Enterprise applications) as unrelated screens.
if [ -z "$ASSIGN_UPN" ]; then
  echo
  echo "No user named — roles exist but NOBODY IS ASSIGNED, so no token will carry one yet."
  echo "Re-run as: $0 $APP_ID <user-principal-name> [role-value]"
  exit 0
fi

SP_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || true)"
if [ -z "$SP_ID" ]; then
  # No enterprise application means there is nothing to assign against. Create it rather than failing.
  echo "no service principal for $APP_ID — creating the enterprise application"
  SP_ID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"
fi

USER_ID="$(az ad user show --id "$ASSIGN_UPN" --query id -o tsv)"
ROLE_ID="$(python3 -c "
import json,sys
roles=json.load(open('$ROLES_FILE'))['appRoles']
m=[r['id'] for r in roles if r['value'].lower()=='$ASSIGN_ROLE'.lower()]
print(m[0] if m else '')
")"
[ -n "$ROLE_ID" ] || { echo "unknown role value '$ASSIGN_ROLE' — see $ROLES_FILE" >&2; exit 1; }

if az rest --method GET \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignedTo" \
    --query "value[?principalId=='$USER_ID' && appRoleId=='$ROLE_ID'] | [0].id" -o tsv | grep -q .; then
  echo "already assigned: $ASSIGN_UPN -> $ASSIGN_ROLE"
else
  az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignedTo" \
    --headers 'Content-Type=application/json' \
    --body "{\"principalId\":\"$USER_ID\",\"resourceId\":\"$SP_ID\",\"appRoleId\":\"$ROLE_ID\"}" >/dev/null
  echo "assigned: $ASSIGN_UPN -> $ASSIGN_ROLE"
fi

echo
echo "Done. Sign in again USING THE SIGN-IN BUTTON, not a page refresh — a refresh can replay a"
echo "cached token issued before the assignment, which will still be refused."
