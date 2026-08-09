# Drift Report

_Generated 2026-08-07T07:24:07.769Z · node v24.14.1 on win32_

Drift is a divergence between what the platform declares and what it is, measured from disk. **2 drift(s) detected · high-severity drift present.**

| Kind | Severity | Root cause | Impact | Recommended action |
|---|---|---|---|---|
| registry-drift | HIGH | packages resembling capability engines are not in the canonical six: tenant-onboarding-engine | the platform may ship a capability the architecture does not recognise (C-11.4) | add to document 11 §3 by ADR, or remove the package |
| evidence-drift | LOW | evidence with incomplete or mismatched ownership: Performance Engine: performance-evidence.json: no timestamp; Security Testing Engine: sectest-evidence.json: no evidence version; Security Testing Engine: sectest-evidence.json: no timestamp | unattributable evidence cannot support a verdict | have each producer stamp capability, version, timestamp, producer and type |
