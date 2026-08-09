/**
 * Onboarding Session — orchestration metadata only. It does NOT own tenant configuration.
 *
 * TRACEABILITY
 *   Architecture : 21-tenant-lifecycle.md §3d (the projection is an overlay) · 06-data-sovereignty.md
 *   ADR          : ADR-0032 (the Tenant Configuration Repository owns the config; the session tracks the journey)
 *
 * AFTER ADR-0032 THE SESSION IS A THIN JOURNEY TRACKER. The canonical tenant configuration
 * lives in the Tenant Configuration Repository (`tenants/<slug>/tenant.json`), the single
 * source of truth. The session holds only what the repository must not: the current step,
 * UI progress, locks, activity and resume state — and a pointer (`tenantSlug`) to the SSOT.
 * It owns no business, platform, discovery, recommendation, capability or certification data.
 */

/** The six experience stages (ADR-0031). A presentation sequence over the frozen lifecycle. */
export const EXPERIENCE_STAGES = [
  'welcome', 'connect', 'discovery', 'recommendations', 'review', 'activation',
] as const;
export type ExperienceStage = (typeof EXPERIENCE_STAGES)[number];

/** A provider the customer chose to connect. Selection only — the token stayed at the edge (INV-2). */
export interface ConnectionSelection {
  readonly kind: 'project-management' | 'test-management' | 'source-control' | 'ai';
  readonly provider: string;
  readonly connected: boolean;
  /**
   * ADR-0085 §4.1 — `test-management` only. THE QUESTION A CUSTOMER MUST NOW ANSWER.
   *
   * It is asked HERE, where the tenant is choosing their test tool, because it is a DECLARATION
   * ABOUT THE WORLD that no discovery can make on their behalf: whether the test repository this
   * platform will write into already exists, and what should happen when it does not. The edge can
   * observe that a project has plans; it cannot observe whether the tenant intends this platform to
   * write into one of them, create one, or refuse until someone approves.
   *
   * ABSENT MEANS "NOT ANSWERED YET" AND NEVER "CREATE ONE FOR ME". The journey may legitimately
   * reach this stage without an answer; certification is where the absence stops being acceptable.
   */
  readonly repositoryDisposition?: 'reuse-existing' | 'create-if-absent' | 'must-exist';
  /** ADR-0085 §4.2 ruling 2 — the organisation root; rulings 3 and 4 are unreachable without it. */
  readonly baseUrl?: string;
  /** Ruling 3 — plan identity. The ID is authoritative; a disagreeing name is recorded, never used to re-target. */
  readonly planId?: string;
  readonly planName?: string;
  /** Ruling 4 — suite identity, same rule, plus the discriminant `discoverGrouping` returns. */
  readonly suiteId?: string;
  readonly suiteName?: string;
  readonly suiteKind?: 'requirement-based' | 'static';
}

export interface SessionActivity { readonly at: string; readonly event: string }

/** Orchestration metadata for one journey. Points at the SSOT; never holds it. */
export interface OnboardingSession {
  readonly id: string;
  readonly createdAt: string;
  updatedAt: string;
  /** The tenant SSOT this journey is enriching, once Stage 1 has created it. */
  tenantSlug?: string;
  currentStep: ExperienceStage;
  progress: number;
  locks: string[];
  activity: SessionActivity[];
}

export interface SessionClock { now(): string }
const systemClock: SessionClock = { now: () => new Date().toISOString() };

export interface SessionStore {
  get(id: string): OnboardingSession | undefined;
  put(session: OnboardingSession): void;
  readonly durable: boolean;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, OnboardingSession>();
  readonly durable = false;
  get(id: string): OnboardingSession | undefined { return this.sessions.get(id); }
  put(session: OnboardingSession): void { this.sessions.set(session.id, session); }
}

/** Tracks the journey. It never calls onboard() and never writes tenant configuration. */
export class OnboardingSessionService {
  constructor(
    private readonly store: SessionStore = new InMemorySessionStore(),
    private readonly clock: SessionClock = systemClock,
  ) {}

  start(id: string): OnboardingSession {
    const at = this.clock.now();
    const session: OnboardingSession = {
      id, createdAt: at, updatedAt: at, currentStep: 'welcome', progress: 0, locks: [], activity: [],
    };
    this.store.put(session);
    return session;
  }

  resume(id: string): OnboardingSession | undefined { return this.store.get(id); }

  private mutate(id: string, f: (s: OnboardingSession) => void): OnboardingSession {
    const s = this.store.get(id);
    if (!s) throw new Error(`unknown onboarding session "${id}"`);
    f(s);
    s.updatedAt = this.clock.now();
    this.store.put(s);
    return s;
  }

  /** Bind the session to the tenant SSOT created at Stage 1. */
  linkTenant(id: string, tenantSlug: string): OnboardingSession {
    return this.mutate(id, (s) => { s.tenantSlug = tenantSlug; s.activity.push({ at: this.clock.now(), event: `linked to tenant ${tenantSlug}` }); });
  }

  advance(id: string, step: ExperienceStage, progress: number): OnboardingSession {
    return this.mutate(id, (s) => { s.currentStep = step; s.progress = progress; s.activity.push({ at: this.clock.now(), event: `advanced to ${step}` }); });
  }

  lock(id: string, resource: string): OnboardingSession {
    return this.mutate(id, (s) => { if (!s.locks.includes(resource)) s.locks.push(resource); });
  }

  unlock(id: string, resource: string): OnboardingSession {
    return this.mutate(id, (s) => { s.locks = s.locks.filter((l) => l !== resource); });
  }
}
