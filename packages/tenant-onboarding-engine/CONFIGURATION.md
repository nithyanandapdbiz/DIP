# Tenant Onboarding Engine — runtime configuration

Configuration is read from the **process environment** — never from a committed file. The Intelligence
Plane holds no `.env` or secret files (INV-6, E-5 non-retention); set these as real environment variables
in your shell or the deployment's secret store. `run-server.mjs` reads them via `process.env`.

## DBIZ IP Admin sign-in (server side, read by `run-server.mjs`)

| Variable | Purpose |
|---|---|
| `IP_ADMIN_ALLOWLIST` | Comma-separated emails allowed to sign in as DBIZ IP Admin (the only role). A Microsoft account whose email is not listed is refused with a clear "no access" message. Example: `admin@dbiz.example,exec@dbiz.example`. Default when unset: `admin@dbiz.example`. |
| `AZURE_TENANT_ID` | Entra directory (tenant) ID. When **both** this and `AZURE_CLIENT_ID` are set, the API validates real Microsoft id_tokens against Entra (JWKS, RS256). |
| `AZURE_CLIENT_ID` | Entra Application (client) ID. When unset (either ID blank), the API uses the DEV verifier (`dev:<email>`) — the allow-list above still applies. |
| `SESSION_SECRET` | Secret used to sign DBIZ session tokens (HS256, stateless — no database). Leave blank in dev to auto-generate a fresh secret per run. |

Example (PowerShell): `$env:IP_ADMIN_ALLOWLIST = 'you@yourorg.com'` before `node run-server.mjs`.
