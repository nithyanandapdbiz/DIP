<!-- ADR-0066 — Functional Testing Workflow is the platform constitution (FT-001 → FT-025). -->

## Summary

<!-- What does this change do? -->

## Workflow Impact Assessment (ADR-0066 — required)

The Functional Testing Workflow is the platform constitution. Declare this change's impact.
The `functional-workflow-governance` CI job (FWGA) **blocks merge** if the workflow sequence,
checksum or ownership changes without an approved workflow-version re-lock.

| Field | Value |
|---|---|
| Affected workflow step(s) | <!-- FT-0xx, … or "none" --> |
| Current workflow version | <!-- from governance/functional-workflow/workflow-version.json --> |
| Step added | YES / **NO** |
| Step removed | YES / **NO** |
| Step reordered / merged / split | YES / **NO** |
| EP/IP ownership changed | YES / **NO** |
| Security boundary changed | YES / **NO** |
| Traceability changed | YES / **NO** |
| Constitution compliance (FWGA) | **PASS** / FAIL |

> If any of the first six rows is **YES**, this is a **breaking** workflow change: it requires an
> approved new workflow version (Architecture Board) and a re-lock (`fwga.js --relock`) in the same
> PR. Otherwise the FWGA CI gate will reject it (checksum mismatch).

## Checklist

- [ ] `node governance/functional-workflow/fwga.js` → COMPLIANT · EXECUTION PERMITTED
- [ ] `node governance/functional-workflow/fwga.js --selftest` → PASS
- [ ] No parallel/duplicate implementation introduced; existing implementation reused
- [ ] EP/IP ownership, security model, data sovereignty and execution semantics unchanged (or version re-locked with approval)
