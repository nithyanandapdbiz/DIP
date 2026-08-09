/**
 * AppModule — wires the tenant controller to the injected domain dependencies.
 *
 * TRACEABILITY: ADR-0033. The domain (repository, services, authenticate) is supplied at
 * registration; the module adds no state and no logic of its own.
 */
import { Module, type DynamicModule, type Provider, type Type } from '@nestjs/common';
import type { ApiDeps } from '../engine/index.js';
import { TenantController } from './tenant.controller.js';
import { ApplicationTemplateController } from './application-template.controller.js';
import { HealthController } from './health.controller.js';
import { WorkPathController } from './work-path.controller.js';
import { AuthController } from './auth.controller.js';
import { RegistrationController } from './registration.controller.js';
import { PackageController } from './package.controller.js';
import { EvidenceController } from './evidence.controller.js';
import { TENANT_DEPS, MS_AUTH, REGISTRATION_DEPS, PACKAGE_DEPS, EVIDENCE_DEPS } from './tokens.js';

@Module({})
export class AppModule {
  /** Register the module with the concrete domain dependencies (DI). */
  static register(deps: ApiDeps): DynamicModule {
    // ApplicationTemplateController is NOT opt-in: the onboarding wizard's application step cannot
    // render without the catalogue, and it needs only the deps every registration already supplies.
    // WorkPathController is NOT opt-in either, and the reason is D-147 rather than convenience. It
    // needs only `repo` and `authenticate`, which every registration supplies — and the capability it
    // drives spent its whole existence unreachable BECAUSE nothing mounted it. A conditional mount
    // would reintroduce exactly one way for that to happen again.
    const controllers: Type<unknown>[] = [TenantController, ApplicationTemplateController, HealthController, WorkPathController];
    const providers: Provider[] = [{ provide: TENANT_DEPS, useValue: deps }];
    // The Microsoft sign-in surface is opt-in: mounted only when the bridge is configured.
    if (deps.microsoftAuth) {
      controllers.push(AuthController);
      providers.push({ provide: MS_AUTH, useValue: deps.microsoftAuth });
    }
    // The EP registration surface is opt-in: mounted only when the OTC store is configured.
    if (deps.registration) {
      controllers.push(RegistrationController);
      providers.push({ provide: REGISTRATION_DEPS, useValue: deps.registration });
    }
    // Sealed package retrieval (ADR-0079) is opt-in: mounted only when the store is configured.
    // Mounting it without a store would answer 501 on every request, which reads as an outage
    // rather than as a surface that was never enabled.
    if (deps.packageStore) {
      controllers.push(PackageController);
      // `authenticate` is passed because the controller resolves its own principal from headers —
      // nothing in this application populates `req.principal`. Omitting it makes the route answer
      // 401 to every caller, including the package's owner.
      providers.push({
        provide: PACKAGE_DEPS,
        useValue: {
          repo: deps.repo,
          store: deps.packageStore,
          ...(deps.authenticate ? { authenticate: deps.authenticate } : {}),
        },
      });
    }
    // Evidence ingress (ADR-0082, D-128). TWO CONDITIONS NOW, AND THE SECOND IS NEW.
    //
    // WITHOUT `authenticate` IT IS NOT MOUNTED AT ALL, rather than mounted and answering 501 to
    // every caller: an unauthenticated evidence surface is not a degraded surface, it is an open
    // one, and the fail-closed answer to "the tier cannot authenticate" is no route.
    //
    // WITHOUT `runRecords` IT IS ALSO NOT MOUNTED — ADR-0082 §6 step 1 (P-82.5). **This reverses
    // what this comment used to say**, which was that the route "needs NO optional store: it
    // validates and refuses, and the durable record is §6 step 3." That was true while the binding
    // was PRESENCE-only; it stopped being true when the binding became RESOLUTION against a known
    // run, and the store it resolves against now exists.
    //
    // The reversal does not reopen D-128. That debt ruled against enforcing R-20.12 on a development
    // path only — and the condition here is not a development/production split but the same
    // fail-closed shape `authenticate` already has. **A mounted route with no run record store would
    // answer 202 to references naming packages this plane never authored**, which is P-82.5 defeated
    // by an omitted dependency; 404 says the surface is absent, which is true and correctable.
    if (deps.authenticate && deps.runRecords) {
      controllers.push(EvidenceController);
      providers.push({
        provide: EVIDENCE_DEPS,
        useValue: { repo: deps.repo, runs: deps.runRecords, authenticate: deps.authenticate },
      });
    }
    return { module: AppModule, controllers, providers };
  }
}
