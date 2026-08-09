# Security Report

_Generated 2026-08-07T07:24:07.769Z · node v24.14.1 on win32_

Zero Trust, mutual TLS, OAuth2, replay protection, tenant isolation, credential isolation and runtime authorization are implemented in `@dbiz/platform-runtime` and are **unchanged** by any capability engine. The capability-level posture measured here is that no capability moves a credential or secret across the boundary — carried by the data-sovereignty dimension.

| # | Capability | Sovereignty (no-secret-crossing proxy) | Reason |
|---|---|---|---|
| 2 | Dev-Change Engine | CERTIFIED | 2 evidence property/properties observed |
| 3 | Inverse-Flow Discovery Engine | CERTIFIED | 2 evidence property/properties observed |
| 4 | Performance Engine | NOT-MEASURED | no conformance property maps to this dimension |
| 5 | Security Testing Engine | NOT-MEASURED | no conformance property maps to this dimension |
| 6 | Penetration Testing Engine | NOT-MEASURED | no conformance property maps to this dimension |

**No security regression.** No capability engine modified a security document or control.
