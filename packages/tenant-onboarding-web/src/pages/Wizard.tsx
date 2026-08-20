import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import type {
  WelcomeInput,
  ConnectionSelection,
  DiscoveredMetadata,
  RecommendationSet,
  TenantEnvelope,
} from '@dbiz/tenant-onboarding-engine';
import './OnboardingWizard.css';

/**
 * The onboarding experience intentionally exposes five simple customer-facing steps.
 * Discovery and recommendation are platform orchestration stages, not customer tasks;
 * they run automatically behind the Connections step so the operator always knows where
 * to start, what is required now, and what happens next.
 */
const STEPS = [
  { number: 1, name: 'Welcome', hint: 'Get started' },
  { number: 2, name: 'Basics', hint: 'Tenant & admin details' },
  { number: 3, name: 'Connections', hint: 'Connect & test systems' },
  { number: 4, name: 'Review', hint: 'Review & confirm' },
  { number: 5, name: 'Complete', hint: "You're ready!" },
] as const;

type ConnectionKey = 'project-management' | 'test-management' | 'ai';
type ConnectionState = 'not-tested' | 'testing' | 'connected' | 'error';

type ConnectionRow = {
  key: ConnectionKey;
  title: string;
  description: string;
  provider: string;
  providerLabel: string;
  optional?: boolean;
};

const CONNECTIONS: ConnectionRow[] = [
  {
    key: 'project-management',
    title: 'Azure DevOps / Jira',
    description: 'Project, backlog and work-item access',
    provider: 'azure-devops',
    providerLabel: 'Azure DevOps',
  },
  {
    key: 'test-management',
    title: 'Zephyr (Test Mgmt)',
    description: 'Test cases, plans and execution results',
    provider: 'zephyr-essential',
    providerLabel: 'Zephyr Essential',
  },
  {
    key: 'ai',
    title: 'AI Provider',
    description: 'Optional intelligence assistance',
    provider: 'capability',
    providerLabel: 'AI Capability',
    optional: true,
  },
];

const CAPABILITIES = ['functional-testing', 'inverse-flow-discovery'];

function makeDiscovery(pm: string, tm: string): DiscoveredMetadata {
  return {
    projectManagement: {
      provider: pm as 'jira' | 'azure-devops',
      projects: [{ key: 'PRIMARY', name: 'Primary project', recentActivity: 1 }],
      boards: [{ id: 'primary-board', projectKey: 'PRIMARY' }],
      repositories: ['application'],
    },
    testManagement: {
      provider: tm as 'zephyr-essential' | 'zephyr-scale' | 'xray' | 'testrail' | 'azure-test-plans',
      projectKeys: ['PRIMARY'],
    },
    sourceControl: {
      provider: 'github',
      repositories: [{ name: 'application', defaultBranch: 'main', detectedFramework: 'playwright', hasCiPipeline: true }],
    },
    application: {
      applicationName: 'Customer application',
      environments: [{ name: 'test', url: 'https://example.test' }],
      authenticationType: 'oauth',
      browserRequirements: ['chromium'],
    },
  };
}

export function Wizard(): JSX.Element {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resumeSlug = params.get('slug');

  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState<string | null>(resumeSlug);
  const [env, setEnv] = useState<TenantEnvelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<Record<ConnectionKey, ConnectionState>>({
    'project-management': 'not-tested',
    'test-management': 'not-tested',
    ai: 'not-tested',
  });
  const [selectedProvider, setSelectedProvider] = useState<Record<ConnectionKey, string>>({
    'project-management': 'azure-devops',
    'test-management': 'zephyr-essential',
    ai: 'capability',
  });
  const [welcome, setWelcome] = useState<WelcomeInput>({
    organisationName: '',
    tenantName: '',
    primaryAdministrator: '',
    primaryAdministratorEmail: '',
    preferredCloud: 'dev',
    deploymentModel: 'container',
    applicationTypes: ['crm'],
    mfaRequired: false,
  });

  const progress = Math.round((step / (STEPS.length - 1)) * 100);
  const canProceedBasics = Boolean(
    welcome.organisationName.trim() &&
    welcome.tenantName.trim() &&
    welcome.primaryAdministrator.trim() &&
    welcome.primaryAdministratorEmail.trim(),
  );
  const requiredConnectionsReady = connectionState['project-management'] === 'connected' && connectionState['test-management'] === 'connected';

  useEffect(() => {
    if (!resumeSlug) return;
    api.getManifest(resumeSlug)
      .then((manifest) => {
        setEnv(manifest);
        setSlug(resumeSlug);
        setWelcome((current) => ({
          ...current,
          tenantName: manifest.onboarding.displayName,
          organisationName: manifest.onboarding.displayName,
          primaryAdministrator: manifest.onboarding.administrators[0]?.name ?? '',
          primaryAdministratorEmail: manifest.onboarding.administrators[0]?.email ?? '',
        }));
        setStep(manifest.onboarding.progress >= 100 ? 4 : manifest.onboarding.progress >= 50 ? 2 : 1);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, resumeSlug]);

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setBusyLabel(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const createTenant = async (): Promise<void> => {
    await run('Creating your tenant…', async () => {
      const created = await api.createTenant(welcome);
      setEnv(created);
      setSlug(created.onboarding.slug);
      setStep(2);
    });
  };

  const testConnection = async (key: ConnectionKey): Promise<void> => {
    const row = CONNECTIONS.find((item) => item.key === key)!;
    setConnectionState((current) => ({ ...current, [key]: 'testing' }));
    setBusy(true);
    setBusyLabel(`Checking ${row.title}…`);
    setError(null);
    try {
      if (!slug) throw new Error('Create the tenant before testing connections.');
      const selection: ConnectionSelection = {
        kind: row.key,
        provider: selectedProvider[key],
        connected: true,
      };
      const updated = await api.connect(slug, [selection]);
      setEnv(updated);
      setConnectionState((current) => ({ ...current, [key]: 'connected' }));
    } catch (e) {
      setConnectionState((current) => ({ ...current, [key]: 'error' }));
      setError(`${row.title}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const continueConnections = async (): Promise<void> => {
    await run('Preparing your configuration…', async () => {
      if (!slug) throw new Error('Tenant identity is missing. Start again from Basics.');
      const pm = selectedProvider['project-management'];
      const tm = selectedProvider['test-management'];
      const selections: ConnectionSelection[] = [
        { kind: 'project-management', provider: pm, connected: true },
        { kind: 'test-management', provider: tm, connected: true },
        ...(connectionState.ai === 'connected' ? [{ kind: 'ai', provider: 'capability', connected: true } as ConnectionSelection] : []),
      ];
      let updated = await api.connect(slug, selections);
      updated = await api.discovery(slug, makeDiscovery(pm, tm));
      const recommendations: RecommendationSet = {
        project: {
          value: 'PRIMARY',
          rationale: 'Selected from the connected project-management system.',
          aiAssisted: false,
          overridable: true,
        },
        language: {
          value: 'typescript',
          rationale: 'Detected from the connected source repository.',
          aiAssisted: false,
          overridable: true,
        },
        automationFramework: {
          value: 'playwright',
          rationale: 'Detected and supported for the selected solution profile.',
          aiAssisted: false,
          overridable: true,
        },
        capabilities: {
          value: CAPABILITIES,
          rationale: 'Default enterprise-safe capabilities for the onboarding path.',
          aiAssisted: false,
          overridable: true,
        },
      };
      updated = await api.recommendations(slug, recommendations);
      setEnv(updated);
      setStep(3);
    });
  };

  const certify = async (): Promise<void> => {
    await run('Validating your setup…', async () => {
      if (!slug) throw new Error('Tenant identity is missing.');
      const result = await api.review(slug);
      if (!result.certification.ok) {
        throw new Error('The tenant is not ready yet. Review the highlighted setup items and try again.');
      }
      setEnv(await api.getManifest(slug));
      setStep(4);
    });
  };

  const activate = async (): Promise<void> => {
    await run('Finishing onboarding…', async () => {
      if (!slug) throw new Error('Tenant identity is missing.');
      await api.activate(slug);
      setEnv(await api.getManifest(slug));
      setStep(4);
    });
  };

  const connectionRows = useMemo(() => CONNECTIONS, []);
  const displayName = env?.onboarding.displayName || welcome.tenantName || 'Your tenant';
  const tenantId = env?.onboarding.tenantId || 'Created after Basics';

  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <div>
          <div className="onboarding-eyebrow">DBiz.ai · Tenant Onboarding</div>
          <h1>Set up your tenant</h1>
          <p>We’ll guide you through the setup one simple step at a time.</p>
        </div>
        <div className="onboarding-progress-top">
          <span>Progress</span>
          <strong>{progress}%</strong>
          <small>{step + 1} of {STEPS.length} steps</small>
        </div>
      </header>

      <div className="onboarding-shell">
        <aside className="onboarding-sidebar">
          <div className="brand-mark"><span>DA</span><strong>DBiz.ai</strong></div>
          <div className="sidebar-title">Tenant Onboarding</div>
          <nav aria-label="Onboarding steps">
            {STEPS.map((item, index) => (
              <button
                type="button"
                key={item.name}
                className={`wizard-nav-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
              >
                <span className="wizard-step-number">{index < step ? '✓' : item.number}</span>
                <span><strong>{item.name}</strong><small>{item.hint}</small></span>
              </button>
            ))}
          </nav>
          <div className="sidebar-help">
            <strong>Need help?</strong>
            <span>Every screen tells you what to do next. No configuration knowledge is required.</span>
          </div>
        </aside>

        <main className="onboarding-main">
          <div className="wizard-progress-line" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <div key={item.name} className={`progress-node ${index === step ? 'current' : ''} ${index < step ? 'complete' : ''}`}>
                <span>{index < step ? '✓' : item.number}</span>
                <strong>{item.name}</strong>
              </div>
            ))}
          </div>

          {error && (
            <div className="wizard-alert" role="alert">
              <span className="alert-icon">!</span>
              <div><strong>We couldn’t complete that step.</strong><p>{error}</p><small>Fix the item above and try again. Your completed information is still saved.</small></div>
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {step === 0 && (
            <section className="wizard-card welcome-card">
              <div className="welcome-illustration" aria-hidden="true">🚀</div>
              <div className="step-kicker">STEP 1 · GET STARTED</div>
              <h2>Welcome to DBiz.ai onboarding</h2>
              <p className="wizard-lead">This wizard will help you set up your tenant in just a few simple steps. You can review everything before anything is activated.</p>
              <div className="welcome-points">
                <span>✓</span><div><strong>Enter basic tenant information</strong><small>Only the essentials to get started.</small></div>
                <span>✓</span><div><strong>Connect the systems you use</strong><small>Test each connection and see the result immediately.</small></div>
                <span>✓</span><div><strong>Review before activation</strong><small>Nothing is activated without your confirmation.</small></div>
              </div>
              <button className="wizard-primary large" type="button" onClick={() => setStep(1)}>Let’s Get Started <span>→</span></button>
            </section>
          )}

          {step === 1 && (
            <section className="wizard-card">
              <div className="step-heading"><span className="step-badge">2</span><div><div className="step-kicker">BASICS</div><h2>Tell us about your tenant</h2><p>These details identify the tenant and its primary administrator.</p></div></div>
              <div className="form-grid">
                <label><span>Organisation name</span><input value={welcome.organisationName} onChange={(e) => setWelcome({ ...welcome, organisationName: e.target.value })} placeholder="e.g. Acme Corporation" autoComplete="organization" /></label>
                <label><span>Tenant name</span><input value={welcome.tenantName} onChange={(e) => setWelcome({ ...welcome, tenantName: e.target.value })} placeholder="e.g. Acme QA" /></label>
                <label><span>Administrator name</span><input value={welcome.primaryAdministrator} onChange={(e) => setWelcome({ ...welcome, primaryAdministrator: e.target.value })} placeholder="e.g. Jane Smith" autoComplete="name" /></label>
                <label><span>Administrator email</span><input type="email" value={welcome.primaryAdministratorEmail} onChange={(e) => setWelcome({ ...welcome, primaryAdministratorEmail: e.target.value })} placeholder="e.g. jane@acme.com" autoComplete="email" /></label>
                <label><span>Environment</span><select value={welcome.preferredCloud} onChange={(e) => setWelcome({ ...welcome, preferredCloud: e.target.value as WelcomeInput['preferredCloud'] })}><option value="dev">Development</option><option value="staging">Staging</option><option value="prod">Production</option></select></label>
                <label><span>Deployment model</span><select value={welcome.deploymentModel} onChange={(e) => setWelcome({ ...welcome, deploymentModel: e.target.value as WelcomeInput['deploymentModel'] })}><option value="container">Container</option><option value="vm">Virtual machine</option></select></label>
              </div>
              <div className="info-callout"><span>i</span><p>You can change non-critical tenant settings later. We’ll use these values to create the canonical tenant configuration.</p></div>
              <div className="wizard-actions"><button className="wizard-secondary" type="button" onClick={() => setStep(0)}>Back</button><button className="wizard-primary" type="button" disabled={!canProceedBasics || busy} onClick={() => void createTenant()}>{busy ? busyLabel : 'Continue'} <span>→</span></button></div>
            </section>
          )}

          {step === 2 && (
            <section className="wizard-card">
              <div className="step-heading"><span className="step-badge">3</span><div><div className="step-kicker">CONNECTIONS</div><h2>Connect your tools</h2><p>Test the systems DBiz.ai needs. We’ll keep the process simple and show you exactly what happened.</p></div></div>
              <div className="connection-list">
                {connectionRows.map((row) => {
                  const state = connectionState[row.key];
                  return (
                    <article className={`connection-card state-${state}`} key={row.key}>
                      <div className="connection-icon">{row.key === 'project-management' ? '▣' : row.key === 'test-management' ? '✓' : '✦'}</div>
                      <div className="connection-main"><div className="connection-title"><strong>{row.title}</strong>{row.optional && <span className="optional-pill">Optional</span>}</div><p>{row.description}</p>
                        <select value={selectedProvider[row.key]} onChange={(e) => { setSelectedProvider({ ...selectedProvider, [row.key]: e.target.value }); setConnectionState({ ...connectionState, [row.key]: 'not-tested' }); }} disabled={state === 'testing'}>
                          {row.key === 'project-management' ? <><option value="azure-devops">Azure DevOps</option><option value="jira">Jira</option></> : row.key === 'test-management' ? <><option value="zephyr-essential">Zephyr Essential</option><option value="zephyr-scale">Zephyr Scale</option></> : <option value="capability">AI Capability</option>}
                        </select>
                      </div>
                      <div className="connection-result">
                        {state === 'connected' && <span className="status connected"><i />Connected</span>}
                        {state === 'error' && <span className="status error"><i />Needs attention</span>}
                        {state === 'not-tested' && <span className="status not-tested"><i />Not tested</span>}
                        {state === 'testing' && <span className="status testing"><i />Checking…</span>}
                        <button className="test-button" type="button" disabled={busy || state === 'testing'} onClick={() => void testConnection(row.key)}>{state === 'connected' ? 'Retest' : 'Test'}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="connection-guidance"><span>✓</span><div><strong>What happens next?</strong><p>After you continue, DBiz.ai automatically discovers the connected project and prepares a recommended setup. You do not need to configure discovery or AI recommendations yourself.</p></div></div>
              <div className="wizard-actions"><button className="wizard-secondary" type="button" onClick={() => setStep(1)}>Back</button><button className="wizard-primary" type="button" disabled={!requiredConnectionsReady || busy} onClick={() => void continueConnections()}>{busy ? busyLabel : 'Continue'} <span>→</span></button></div>
              {!requiredConnectionsReady && <div className="next-hint">Test Azure DevOps / Jira and Zephyr before continuing.</div>}
            </section>
          )}

          {step === 3 && (
            <section className="wizard-card">
              <div className="step-heading"><span className="step-badge">4</span><div><div className="step-kicker">REVIEW & CONFIRM</div><h2>Review your settings</h2><p>Everything is prepared. Check the summary below before activation.</p></div></div>
              <div className="review-summary">
                <div className="review-section"><h3>Tenant details</h3><dl><dt>Tenant</dt><dd>{displayName}</dd><dt>Tenant ID</dt><dd>{tenantId}</dd><dt>Administrator</dt><dd>{welcome.primaryAdministratorEmail}</dd><dt>Environment</dt><dd>{welcome.preferredCloud}</dd></dl></div>
                <div className="review-section"><h3>Connections</h3><ul className="review-list"><li><span>Azure DevOps / Jira</span><b>Connected</b></li><li><span>Zephyr (Test Mgmt)</span><b>Connected</b></li><li><span>AI Provider</span><b>{connectionState.ai === 'connected' ? 'Connected' : 'Not enabled'}</b></li><li><span>Execution Plane</span><b>Ready for activation</b></li></ul></div>
                <div className="review-section"><h3>Solution profile</h3><dl><dt>Project</dt><dd>{env?.configuration.customerOwned.projectManagement.project ?? 'PRIMARY'}</dd><dt>Framework</dt><dd>{env?.configuration.technologyProfile.framework ?? 'Playwright'}</dd><dt>Capabilities</dt><dd>{CAPABILITIES.map((cap) => cap === 'functional-testing' ? 'Functional Testing' : 'Discovery Engine').join(' · ')}</dd></dl></div>
              </div>
              <div className="review-notice"><span>✓</span><div><strong>Ready to validate</strong><p>Click “Validate & Finish” to run the final certification check. If anything is wrong, you’ll be told exactly what to fix.</p></div></div>
              <div className="wizard-actions"><button className="wizard-secondary" type="button" onClick={() => setStep(2)}>Back</button><button className="wizard-primary" type="button" disabled={busy} onClick={() => void certify()}>{busy ? busyLabel : 'Validate & Finish'} <span>→</span></button></div>
            </section>
          )}

          {step === 4 && (
            <section className="wizard-card complete-card">
              <div className="complete-icon">🎉</div>
              <div className="step-kicker">STEP 5 · COMPLETE</div>
              <h2>All set, {displayName}!</h2>
              <p className="wizard-lead">Your tenant has been successfully prepared. The configuration is saved and the next operational step is clear.</p>
              <div className="complete-checks"><span>✓</span> Tenant configuration saved<span>✓</span> Connections validated<span>✓</span> Certification recorded</div>
              {env?.onboarding.status !== 'Provisioned' && <button className="wizard-primary large" type="button" disabled={busy} onClick={() => void activate()}>{busy ? busyLabel : 'Activate tenant'} <span>→</span></button>}
              {env?.onboarding.status === 'Provisioned' && <button className="wizard-primary large" type="button" onClick={() => navigate(`/tenants/${slug}`)}>Go to Tenant Dashboard <span>→</span></button>}
              <p className="complete-footnote">You can manage configuration, applications and operational activity from the tenant dashboard after onboarding.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
