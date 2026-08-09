# Architecture overview

Enough to reason about the platform. Not the internal architecture.

## Two planes

```
  Intelligence Plane                    Execution Plane
  (DBiz, multi-tenant)                  (your tenancy)
                                    
  certificate authority                 generated solution
  authorisation server        <────     your tests
  API gateway                 outbound  your test data
  tenant registry             only      your results
                                    
  stores no customer content            owns everything above
```

**The arrow points one way.** Your deployment initiates; nothing initiates into it.
This is why no inbound firewall rule is ever required.

## Why the split

Your source, credentials and results stay where they are governed — with you. The
platform holds identity, policy and orchestration. It is a boundary that is
verified on every build rather than described in a contract.

## What crosses

| Crosses | Never crosses |
|---|---|
| Execution packages (what to do) | Your source |
| Evidence references (hashes) | Your screenshots |
| Certificates and tokens | Your secrets or keys |

Evidence is referenced by hash. The platform can prove **what** your run produced
without holding it — the same move as a receipt for a document it never read.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
