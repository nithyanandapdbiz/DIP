# Configuration compatibility matrix

**Derived from the supported-combination registry, then validated by execution.**
Nothing in this table is declared by hand: a combination appears because the
platform can build it, and it is marked validated because a run proved it.

| Language | Framework | Test runners | Package managers | Status |
|---|---|---|---|---|
| typescript | playwright | playwright-test, vitest | pnpm, npm | **Validated** |
| typescript | selenium | jest, vitest | pnpm, npm | **Validated** |
| javascript | playwright | playwright-test, jest | npm | **Validated** |
| java | selenium | junit5 | maven, gradle | **Validated** |
| csharp | selenium | nunit | nuget | **Validated** |
| python | playwright | pytest | pip | **Validated** |

## What is not here

Anything absent from this table is **not supported**, and the platform will refuse
it at onboarding rather than generating something that cannot build. That refusal is
deliberate: a profile that parses is not a profile that can be built, and the
registry is what knows the difference.

If you need a combination that is not listed, that is a roadmap conversation rather
than a configuration change. Editing the profile to name an unlisted framework will
produce a clear refusal, not a broken solution.

## Migrating a configuration

The profile carries `profileVersion`. When the platform introduces a new version, it
accepts the previous one for the whole of its supported window — you upgrade when it
suits you, not when the platform ships. A profile from outside that window is refused
with the version it was, the window that is current, and what to change.

**Changing a profile does not migrate an existing solution.** It changes what is
generated next. Regenerating produces a new solution; adopting it is a pull request
in your repository, reviewed by you, on your schedule.
