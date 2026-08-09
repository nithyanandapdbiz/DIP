# Tenant Onboarding Web — build/runtime configuration

Configuration is read from the **process environment** (Vite injects `VITE_*` vars at build time) — never
from a committed file. The Intelligence Plane holds no `.env` or secret files (INV-6, E-5 non-retention);
set these as real environment variables in your shell or CI.

## Microsoft (Entra ID) sign-in — frontend

| Variable | Purpose |
|---|---|
| `VITE_AZURE_CLIENT_ID` | Application (client) ID from your Entra app registration. Leave **blank** to use the local dev sign-in (`dev:<email>`) while Microsoft isn't wired. |
| `VITE_AZURE_TENANT_ID` | Directory (tenant) ID from the same registration. Default: `organizations`. |
| `VITE_API_URL` | API base URL. Blank = same-origin (the Vite dev proxy forwards `/api` to the engine on `:4610`). **In a cloud deployment blank is only correct if `/api` is actually routed to the engine on the same origin** — otherwise the SPA calls the static host and sign-in fails at the token exchange, not at Microsoft. |

## Entra redirect URI — one, under the SPA platform

Both sign-in flows call back to **`/blank.html`**. Register it under **Authentication → Single-page
application**, *not* Web — a Web-platform URI refuses the cross-origin token redemption an SPA performs
(`AADSTS9002326`).

```
https://inteligenceplane.dbizsolution.com/blank.html
http://localhost:5173/blank.html                       (local development)
```

The URI is derived from the live origin (`window.location.origin`), so there is no build-time variable
to forget; each origin must instead be registered in the app registration.

### The callback page must run a script

`blank.html` is a **Vite entry point** (`packages/tenant-onboarding-web/blank.html`), not a static asset
in `public/`. It loads exactly one module — [`src/auth/redirect-bridge.ts`](src/auth/redirect-bridge.ts),
which calls `broadcastResponseToMainFrame()` from `@azure/msal-browser/redirect-bridge`.

This is not optional. In msal-browser **v5** the opener does not read the response out of the popup's
URL; the callback page hands it back over a same-origin `BroadcastChannel`. A genuinely empty callback
page — the correct pattern under MSAL v2/v3 — leaves the popup sitting on `blank.html#code=…` as a white
screen until the opener fails with `popup_relay_timeout`. If `blank.html` is ever moved back to
`public/`, or the extra Rollup input is dropped from `vite.config.ts`, sign-in breaks exactly that way.

The same bridge serves the redirect flow: it caches the response and navigates back to the page sign-in
started from, where `handleRedirectPromise()` picks it up. That is why one callback URL is enough.

`/login` still needs the host's SPA fallback to render, but it is no longer an auth callback.

## Multi-factor authentication

MFA is enforced in Entra by Conditional Access against this app registration — no application change is
needed, and the policy applies to the code as it stands. The token verifier does not yet assert the `amr`
claim, so the platform trusts that such a policy exists rather than verifying MFA occurred.
