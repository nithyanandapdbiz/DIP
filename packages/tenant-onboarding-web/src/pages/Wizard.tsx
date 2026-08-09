/**
 * Tenant Onboarding — the approved 6-stage experience (prototype d16a3fee), wired to the live API so
 * EVERY stage writes the canonical tenants/<slug>/tenant.json (the SSOT). Welcome → onboard():
 *   Welcome · Connect · Intelligent Discovery · AI Recommendations · Review & Certify · Activation.
 * Discovery uses synthetic edge metadata (SimulatedEdge) — no credential ever reaches the IP (INV-2).
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import type {
  WelcomeInput, ConnectionSelection, DiscoveredMetadata, RecommendationSet, TenantEnvelope,
  ApplicationTemplateDescriptor,
} from '@dbiz/tenant-onboarding-engine';

const STAGES = [
  { nm: 'Welcome', sub: 'Who you are' },
  { nm: 'Connect', sub: 'Pick platforms' },
  { nm: 'Discovery', sub: 'Auto-detect' },
  { nm: 'AI Recommendations', sub: 'Review & override' },
  { nm: 'Review', sub: 'Validate' },
  { nm: 'Activation', sub: 'Hand to onboard()' },
] as const;

const CONNECT_GROUPS: { kind: ConnectionSelection['kind']; label: string; provs: { id: string; nm: string; c: string }[] }[] = [
  { kind: 'project-management', label: 'Project management', provs: [{ id: 'jira', nm: 'Jira', c: 'Cloud / DC' }, { id: 'azure-devops', nm: 'Azure DevOps', c: 'Boards' }] },
  { kind: 'test-management', label: 'Test management', provs: [{ id: 'zephyr-scale', nm: 'Zephyr Scale', c: 'Jira app' }, { id: 'zephyr-essential', nm: 'Zephyr Essential', c: 'Jira app' }, { id: 'azure-test-plans', nm: 'Azure Test Plans', c: 'ADO' }] },
  { kind: 'source-control', label: 'Source control', provs: [{ id: 'github', nm: 'GitHub', c: 'Repos + CI' }, { id: 'azure-repos', nm: 'Azure Repos', c: 'ADO' }, { id: 'gitlab', nm: 'GitLab', c: 'Repos + CI' }] },
  { kind: 'ai', label: 'AI capability', provs: [{ id: 'capability', nm: 'AI Capability', c: 'Provider-agnostic' }] },
];

// Human labels for connected providers — the discovery/recommendation views read the actual selection.
const PROVIDER_NAME: Record<string, string> = {
  jira: 'Jira', 'azure-devops': 'Azure DevOps',
  'zephyr-scale': 'Zephyr Scale', 'zephyr-essential': 'Zephyr Essential', 'azure-test-plans': 'Azure Test Plans',
  github: 'GitHub', 'azure-repos': 'Azure Repos', gitlab: 'GitLab', capability: 'AI Capability',
};
const DISC_COUNT = 8;

// Application classes are NOT listed here. They are fetched from /api/application-templates — the same
// Application Template Registry the generator compiles from. A compiled-in list would drift the moment
// a template is registered: the class would be generatable but not selectable, and nothing would say so.

// Language drives EP solution generation. Each language constrains the valid frameworks (SUPPORTED matrix);
// the backend resolves the full profile (test runner + package manager) from the chosen language + framework.
const LANGUAGES = ['typescript', 'javascript', 'java', 'csharp', 'python'];
const LANG_FRAMEWORKS: Record<string, ('playwright' | 'selenium')[]> = {
  typescript: ['playwright', 'selenium'],
  javascript: ['playwright'],
  java: ['selenium'],
  csharp: ['selenium'],
  python: ['playwright'],
};

const CAP_REGISTRY = ['functional-testing', 'dev-change', 'inverse-flow-discovery', 'performance', 'security-testing', 'penetration-testing'] as const;
const CAP_LABEL: Record<string, string> = {
  'functional-testing': 'Functional Testing', 'dev-change': 'Dev-Change', 'inverse-flow-discovery': 'Discovery Engine',
  performance: 'Performance Engine', 'security-testing': 'Security Engine', 'penetration-testing': 'Penetration Testing',
};


const STAGE_NAMES = [
  'customer-registration', 'tenant-creation', 'technology-profile-capture', 'business-integration-configuration',
  'solution-generation', 'repository-generation', 'deployment-package-generation', 'customer-deployment',
  'execution-plane-bootstrap', 'secure-registration', 'connectivity-validation', 'smoke-validation',
  'tenant-certification', 'tenant-activated',
];

function highlightJson(obj: unknown): string {
  const s = JSON.stringify(obj, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return s
    .replace(/"([^"\\]*)":/g, '<span class="jk">"$1"</span>:')
    .replace(/: "([^"\\]*)"/g, ': <span class="js">"$1"</span>')
    .replace(/: (-?\d+(?:\.\d+)?)/g, ': <span class="jn">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="jb">$1</span>');
}

export function Wizard(): JSX.Element {
  const api = useApi();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const resumeSlug = params.get('slug');

  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState<string | null>(resumeSlug);
  const [env, setEnv] = useState<TenantEnvelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certOk, setCertOk] = useState<boolean | null>(null);
  const [ssotOpen, setSsotOpen] = useState(true);

  const [welcome, setWelcome] = useState<WelcomeInput>({
    organisationName: '', tenantName: '', primaryAdministrator: '',
    primaryAdministratorEmail: '', preferredCloud: 'dev', deploymentModel: 'container',
    applicationTypes: ['crm'], mfaRequired: false,
  });
  // The registered application classes. Until they arrive the application step renders empty rather
  // than falling back to a guessed list — a wrong class silently generates the wrong Execution Plane.
  const [appTemplates, setAppTemplates] = useState<readonly ApplicationTemplateDescriptor[]>([]);
  const [connect, setConnect] = useState<Partial<Record<ConnectionSelection['kind'], string>>>({});
  const [discShown, setDiscShown] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [overrides, setOverrides] = useState<{ project?: string; framework?: 'playwright' | 'selenium'; language?: string }>({});
  const [capabilities, setCapabilities] = useState<string[]>(['functional-testing', 'inverse-flow-discovery']);

  // Discovery + recommendations reflect the ACTUAL platforms connected in the previous stage.
  const pmProv = connect['project-management'] ?? 'jira';
  const tmProv = connect['test-management'] ?? 'zephyr-scale';
  const scmProv = connect['source-control'] ?? 'github';
  const discRows: [string, string, string][] = [
    ['📋', `${PROVIDER_NAME[pmProv]} projects`, '2 found — CARL, OLD'],
    ['🎯', 'Active board', 'board-9 (CARL)'],
    ['📦', 'Repositories', `carlisle-portal (${PROVIDER_NAME[scmProv]})`],
    ['⚙️', 'Automation framework', 'playwright (detected)'],
    ['🔁', 'CI pipeline', 'present'],
    ['🧪', 'Test management', `${PROVIDER_NAME[tmProv]} · CARL`],
    ['🌐', 'Environment', 'test · portal.example.test'],
    ['🔑', 'Auth mechanism', 'oauth'],
  ];
  // Language + a framework valid for it (the backend re-derives the runner/package-manager from SUPPORTED).
  const lang = overrides.language ?? 'typescript';
  const allowedFw = LANG_FRAMEWORKS[lang] ?? ['playwright', 'selenium'];
  const fw: 'playwright' | 'selenium' = overrides.framework && allowedFw.includes(overrides.framework) ? overrides.framework : allowedFw[0]!;

  const edgeDiscovery = (): DiscoveredMetadata => ({
    projectManagement: { provider: pmProv as 'jira' | 'azure-devops', projects: [{ key: 'CARL', name: 'Portal', recentActivity: 42 }], boards: [{ id: 'b-9', projectKey: 'CARL' }], repositories: ['portal'] },
    testManagement: { provider: tmProv as 'zephyr-essential' | 'zephyr-scale' | 'xray' | 'testrail' | 'azure-test-plans', projectKeys: ['CARL'] },
    sourceControl: { provider: scmProv as 'github' | 'azure-repos' | 'gitlab', repositories: [{ name: 'portal', defaultBranch: 'main', detectedFramework: 'playwright', hasCiPipeline: true }] },
    application: { applicationName: 'Portal', environments: [{ name: 'test', url: 'https://portal.example.test' }], authenticationType: 'oauth', browserRequirements: ['chromium'] },
  });

  useEffect(() => {
    api.applicationTemplates()
      .then((c) => setAppTemplates(c.templates))
      .catch((e: Error) => setError(`application templates unavailable: ${e.message}`));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!resumeSlug) return;
    api.getManifest(resumeSlug).then((m) => {
      setEnv(m);
      const idx = STAGES.findIndex((s) => s.nm.toLowerCase().startsWith(m.onboarding.currentStage.slice(0, 4)));
      setStep(idx >= 0 ? idx : 1);
    }).catch((e: Error) => setError(e.message));
  }, [resumeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Discovery reveal animation — the edge "returns" metadata row by row.
  useEffect(() => {
    if (step !== 2) { setDiscShown(0); return; }
    let i = 0;
    const id = setInterval(() => { i += 1; setDiscShown(i); if (i >= DISC_COUNT) clearInterval(id); }, 170);
    return () => clearInterval(id);
  }, [step]);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const next = (): void => setStep((s) => Math.min(s + 1, STAGES.length - 1));
  const toggleConn = (kind: ConnectionSelection['kind'], id: string): void =>
    setConnect((c) => ({ ...c, [kind]: c[kind] === id ? undefined : id }));
  const toggleCap = (c: string): void =>
    setCapabilities((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  const saveWelcome = (): Promise<void> => run(async () => { const e = await api.createTenant(welcome); setEnv(e); setSlug(e.onboarding.slug); next(); });
  const saveConnect = (): Promise<void> => run(async () => {
    const selections: ConnectionSelection[] = CONNECT_GROUPS
      .filter((g) => connect[g.kind])
      .map((g) => ({ kind: g.kind, provider: connect[g.kind]!, connected: true }));
    setEnv(await api.connect(slug!, selections)); next();
  });
  const saveDiscovery = (): Promise<void> => run(async () => { setEnv(await api.discovery(slug!, edgeDiscovery())); next(); });
  const saveRecommendations = (): Promise<void> => run(async () => {
    const recs: RecommendationSet = {
      project: { value: overrides.project ?? 'CARL', rationale: aiEnabled ? 'Ranked highest by recent activity and AI signal.' : 'Most-active discovered project.', aiAssisted: aiEnabled, overridable: true },
      language: { value: lang, rationale: aiEnabled ? 'Inferred from the repository; drives the EP solution.' : 'Selected language; drives the EP solution.', aiAssisted: aiEnabled, overridable: true },
      automationFramework: { value: fw, rationale: `${fw} for ${lang}, per the supported build matrix.`, aiAssisted: aiEnabled, overridable: true },
      capabilities: { value: capabilities.slice(), rationale: 'Only capabilities with a verified execution path (R-21.11).', aiAssisted: aiEnabled, overridable: true },
    };
    setEnv(await api.recommendations(slug!, recs)); next();
  });
  const runCert = (): Promise<void> => run(async () => {
    const r = await api.review(slug!); setCertOk(r.certification.ok); setEnv(await api.getManifest(slug!));
  });
  const activate = (): Promise<void> => run(async () => { await api.activate(slug!); setEnv(await api.getManifest(slug!)); next(); });

  // Which selected class DRIVES the package. The registry answers both questions the wizard needs —
  // is this target signed into as a real user, and can it present a second factor — so the MFA
  // question and the slot preview follow the template rather than a hard-coded pair of ids.
  const selectedTemplates = appTemplates.filter((t) => (welcome.applicationTypes ?? []).includes(t.id));
  const signInTemplate = selectedTemplates.find((t) => t.signInTarget);
  const isSignInTarget = signInTemplate !== undefined;
  // The exact `.env` keys the package will carry, for the declaration as it currently stands.
  const previewSlots = signInTemplate
    ? (welcome.mfaRequired ? signInTemplate.slots.withMfa : signInTemplate.slots.withoutMfa)
    : [];

  const cfg = env?.configuration as Record<string, any> | undefined;
  const aiFlag = (on: boolean): JSX.Element => <span className={`aiflag ${on ? 'on' : 'off'}`}>{on ? 'AI-assisted' : 'deterministic'}</span>;

  return (
    <div>
      <div className="wizhead">
        <div>
          <div className="eyebrow">DBiz Intelligence Plane · Onboarding Experience</div>
          <h1>Onboard a tenant</h1>
        </div>
        <span className="tag">live · synthetic edge metadata · terminates in onboard()</span>
      </div>

      {env && (
        <div className="tmcard">
          <div>
            <div className="tt">Tenant Management</div>
            <div className="tn">{env.onboarding.displayName}</div>
            <div className="fid">{env.onboarding.slug} · {env.onboarding.tenantId}</div>
          </div>
          <span className={`badge s-${env.onboarding.status.toLowerCase()}`}>{env.onboarding.status}</span>
          <div className="pbar" style={{ flex: 1, maxWidth: 220 }}><i style={{ width: `${env.onboarding.progress}%` }} /></div>
          <div className="pct">{env.onboarding.progress}%</div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="shell">
        <aside className="rail">
          {STAGES.map((s, i) => (
            <div key={s.nm} className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <div className="dot">{i < step ? '✓' : i + 1}</div>
              <div>
                <div className="nm">{s.nm}</div>
                <div className="substep">{s.sub}</div>
              </div>
            </div>
          ))}
        </aside>

        <section className="panel">
          {step === 0 && (
            <div>
              <h2>Welcome</h2>
              <p className="desc">Tell us who you are. Nothing technical — everything else is discovered.</p>
              <div className="fields">
                <div className="field"><label>Organisation name</label><input value={welcome.organisationName} onChange={(e) => setWelcome({ ...welcome, organisationName: e.target.value })} /></div>
                <div className="field"><label>Tenant name</label><input value={welcome.tenantName} onChange={(e) => setWelcome({ ...welcome, tenantName: e.target.value })} /></div>
                <div className="field full"><label>Primary administrator</label><input value={welcome.primaryAdministrator} onChange={(e) => setWelcome({ ...welcome, primaryAdministrator: e.target.value })} /></div>
                <div className="field"><label>Preferred cloud</label>
                  <select value={welcome.preferredCloud} onChange={(e) => setWelcome({ ...welcome, preferredCloud: e.target.value })}><option value="dev">dev (no cloud yet)</option><option>azure</option><option>aws</option><option>gcp</option><option>on-premises</option></select></div>
                <div className="field"><label>Deployment model</label>
                  <select value={welcome.deploymentModel} onChange={(e) => setWelcome({ ...welcome, deploymentModel: e.target.value })}><option>container</option><option>kubernetes</option><option>vm</option></select></div>
                {/* The application class is the PRIMARY driver of everything generated: configuration
                    schema, env slots, authentication, discovery, execution, validation and docs. The
                    list comes from the Application Template Registry over the API, never from a
                    constant here — see the note beside the imports. */}
                <div className="field full"><label>Application type(s) — select all that apply</label>
                  <div className="capgrid">{appTemplates.map((t) => {
                    const on = (welcome.applicationTypes ?? []).includes(t.id);
                    return (
                      <div key={t.id} className={`cap ${on ? 'on' : ''}`} title={`${t.description}\n\nAuthentication: ${t.authentication.label}\nDiscovery: ${t.discovery.label}\nExecution: ${t.execution.label}`}
                        onClick={() => setWelcome({ ...welcome, applicationTypes: on ? (welcome.applicationTypes ?? []).filter((x) => x !== t.id) : [...(welcome.applicationTypes ?? []), t.id] })}>
                        {t.label}
                      </div>
                    );
                  })}</div>
                  {appTemplates.length === 0 && <div className="note">Loading registered application types…</div>}
                </div>
                {/* What the selected class actually generates. Shown before the tenant is created so the
                    operator can see the strategies and slots rather than discovering them in the package. */}
                {selectedTemplates.length > 0 && (
                  <div className="field full"><label>What will be generated</label>
                    {selectedTemplates.map((t, i) => (
                      <div className="note" key={t.id}>
                        <span className="lk" /><strong>{t.label}</strong>{i === 0 ? ' (drives the package)' : ' (contributes configuration slots)'} —
                        authentication: <em>{t.authentication.label}</em>; discovery: <em>{t.discovery.strategy}</em>; execution: <em>{t.execution.strategy}</em>.
                      </div>
                    ))}
                  </div>
                )}
                {/* A sign-in target is driven as a real user, so the package needs a base URL + username +
                    password — and a TOTP slot when the target enforces a second factor. Only the SLOTS
                    are generated; the values are set at the Execution Plane (INV-2). Whether this section
                    appears at all is the resolved template's answer, not a hard-coded application id. */}
                {isSignInTarget && signInTemplate && (
                  <div className="field full"><label>Sign-in target — the EP signs in to {signInTemplate.label} as a real user</label>
                    {signInTemplate.mfaSupported && (
                      <div className="capgrid">
                        <div className={`cap ${welcome.mfaRequired ? 'on' : ''}`} onClick={() => setWelcome({ ...welcome, mfaRequired: !welcome.mfaRequired })}>
                          {welcome.mfaRequired ? '✓ MFA enforced' : 'MFA enforced'}
                        </div>
                      </div>
                    )}
                    <div className="note"><span className="lk" />
                      Your package will carry {previewSlots.map((s, i) => (
                        <span key={s}>{i > 0 ? ', ' : ''}<code>{s}</code></span>
                      ))}.
                      {signInTemplate.authentication.captureSession ? ' The session is captured once and replayed, so a long suite signs in once.' : ''}
                      {' '}You fill these in at your Execution Plane — DBiz never receives them.
                    </div>
                  </div>
                )}
              </div>
              <div className="note"><span className="lk" />The tenant <em>identifier</em> stays opaque (R-21.3); this name is only the human label.</div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2>Connect</h2>
              <p className="desc">Choose the platforms you use. Sign-in happens in your browser — the token never leaves the edge. No project keys, board IDs or repos to type.</p>
              {CONNECT_GROUPS.map((g) => (
                <div className="grp" key={g.kind}>
                  <div className="gt">{g.label}</div>
                  <div className="cards">
                    {g.provs.map((p) => {
                      const on = connect[g.kind] === p.id;
                      return (
                        <div key={p.id} className={`prov ${on ? 'on' : ''}`} onClick={() => toggleConn(g.kind, p.id)}>
                          <div className="pn">{p.nm}</div><div className="pc">{p.c}</div>
                          <div className="btn-c">{on ? '✓ Connected' : 'Sign in'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="prov-note">🔒 Provider-agnostic: the IP stores an opaque handle + capability classes, never a vendor name or key (INV-9).</div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2>Intelligent Discovery</h2>
              <p className="desc">The edge enumerated your connected platforms and returned metadata. You typed none of this.</p>
              <div className="disc">
                {discRows.map((r, i) => (
                  <div key={r[1]} className={`disc-row ${i < discShown ? 'found' : ''}`}>
                    <div className="ic">{r[0]}</div><div className="dl">{r[1]}</div><div className="dv">{r[2]}</div>
                  </div>
                ))}
              </div>
              <div className="note"><span className="lk" />Only non-secret metadata reached the Intelligence Plane. The access token stayed at the edge (INV-2).</div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2>AI Recommendations</h2>
              <p className="desc">Suggestions from the discovered data. Every one is overridable — and with AI off, you still get a complete, sensible set.</p>
              <label className="toggle"><input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} /> AI assistance {aiFlag(aiEnabled)}</label>
              <div style={{ height: 14 }} />
              <div className="rec">
                <div className="rh"><div><div className="rl">Recommended project</div><div className="rv">{overrides.project ?? 'CARL'}</div></div>{aiFlag(aiEnabled)}</div>
                <div className="rr">{aiEnabled ? 'Ranked highest by recent activity and AI signal.' : 'Most-active discovered project.'}</div>
                <select value={overrides.project ?? 'CARL'} onChange={(e) => setOverrides((o) => ({ ...o, project: e.target.value }))}><option>CARL</option><option>OLD</option></select>
              </div>
              <div className="rec">
                <div className="rh"><div><div className="rl">Language</div><div className="rv">{lang}</div></div>{aiFlag(aiEnabled)}</div>
                <div className="rr">The EP solution is generated for this language — it sets the framework, test runner and package manager.</div>
                <select value={lang} onChange={(e) => { const l = e.target.value; const fws = LANG_FRAMEWORKS[l] ?? ['playwright']; setOverrides((o) => ({ ...o, language: l, framework: o.framework && fws.includes(o.framework) ? o.framework : fws[0] })); }}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="rec">
                <div className="rh"><div><div className="rl">Automation framework</div><div className="rv">{fw}</div></div>{aiFlag(aiEnabled)}</div>
                <div className="rr">{allowedFw.length > 1 ? `Both frameworks are supported for ${lang}.` : `${lang} supports ${fw} in the build matrix.`}</div>
                <select value={fw} onChange={(e) => setOverrides((o) => ({ ...o, framework: e.target.value as 'playwright' | 'selenium' }))}>
                  {allowedFw.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="rec">
                <div className="rh"><div><div className="rl">Test management</div><div className="rv">{PROVIDER_NAME[tmProv]}</div></div>{aiFlag(aiEnabled)}</div>
                <div className="rr">The connected test-management provider.</div>
              </div>
              <div className="rec">
                <div className="rh"><div className="rl">Recommended capabilities</div>{aiFlag(aiEnabled)}</div>
                <div className="rr">Only capabilities with a verified execution path (R-21.11) can be selected.</div>
                <div className="capgrid">
                  {CAP_REGISTRY.map((c) => (
                    <div key={c} className={`cap ${capabilities.includes(c) ? 'on' : ''}`} onClick={() => toggleCap(c)}>{CAP_LABEL[c]}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2>Review &amp; Certification</h2>
              <p className="desc">The assembled configuration below is validated by the platform's own pipeline. Activation is blocked until certification passes.</p>
              {cfg && (
                <div className="summary">
                  <span className="k">customer</span> <span className="v">{cfg['customer']?.customerName} / {cfg['customer']?.tenantName}</span><br />
                  <span className="k">profile</span> <span className="v">{cfg['technologyProfile']?.language} · {cfg['technologyProfile']?.framework} · {cfg['technologyProfile']?.cloudProvider} · {cfg['technologyProfile']?.deploymentModel}</span><br />
                  <span className="k">capabilities</span> <span className="v">{(cfg['dbiz']?.entitledCapabilities ?? []).join(', ') || 'none'}</span><br />
                  <span className="k">project mgmt</span> <span className="v">{cfg['customerOwned']?.projectManagement?.provider ?? 'none'}</span><br />
                  <span className="k">test mgmt</span> <span className="v">{cfg['customerOwned']?.testManagement?.provider ?? 'none'}</span><br />
                  <span className="k">ai</span> <span className="v">{cfg['customerOwned']?.ai?.providerHandle ?? 'ai-none'} (opaque)</span>
                </div>
              )}
              {certOk === null && <div className="cert idle"><span className="cs">○</span><div>Not yet certified. Run the platform's validation pipeline before activating.</div></div>}
              {certOk === true && <div className="cert ok"><span className="cs">✓</span><div>Certification passed — <code>validateOnboarding</code> accepted the configuration.</div></div>}
              {certOk === false && <div className="cert fail"><span className="cs">✕</span><div>Certification failed. Correct the configuration and re-run.</div></div>}
              <button className="nav" disabled={busy} onClick={runCert} style={{ marginTop: 4 }}>Run certification</button>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2>Activation</h2>
              <p className="desc">Certified. The assembled configuration was handed to the existing <code>onboard()</code> — one orchestrator, no duplication.</p>
              <div className="summary" style={{ marginBottom: 14 }}>
                <span className="k">tenant</span> <span className="v">{env?.onboarding.tenantId} (opaque)</span><br />
                <span className="k">lifecycle state</span> <span className="v">{env?.onboarding.lifecycleState ?? 'PROVISIONED'}</span><br />
                <span className="k">projection</span> <span className="v">{env?.onboarding.projection ?? 'WAITING_FOR_DEPLOYMENT'}</span><br />
                <span className="k">solution</span> <span className="v">generated · content-hashed</span>
              </div>
              <div className="stagelist">
                {STAGE_NAMES.map((nm, i) => {
                  const done = i < 7;
                  return (
                    <div key={nm} className={`stg ${done ? 'done' : 'pend'}`}>
                      <div className="si">{done ? 'done' : 'pending'}</div>
                      <div>{i + 1}. {nm}</div>
                      <div className="sd">{done ? 'IP' : 'edge/EP'}</div>
                    </div>
                  );
                })}
              </div>
              <div className="note"><span className="lk warn" />Stages 8–14 remain pending — they need the customer deployment and the EP runtime. The engine never marks a tenant ACTIVE on assumption (R-21.29).</div>
            </div>
          )}

          <div className="grow" />
          <div className="bar-nav">
            <button className="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
            {step === 0 && <button className="primary" disabled={busy} onClick={saveWelcome}>Continue →</button>}
            {step === 1 && <button className="primary" disabled={busy} onClick={saveConnect}>Continue →</button>}
            {step === 2 && <button className="primary" disabled={busy} onClick={saveDiscovery}>Continue →</button>}
            {step === 3 && <button className="primary" disabled={busy} onClick={saveRecommendations}>Continue →</button>}
            {step === 4 && <button className="primary" disabled={busy || certOk !== true} onClick={activate}>Activate →</button>}
            {step === 5 && <button className="primary" onClick={() => nav(`/tenants/${slug}`)}>View tenant →</button>}
          </div>
        </section>
      </div>

      {env && (
        <div className={`ssotwrap ${ssotOpen ? 'open' : ''}`}>
          <div className="ssothd" onClick={() => setSsotOpen((o) => !o)}>
            <span className="chev">▶</span>
            <span className="pathn">tenants/{env.onboarding.slug}/tenant.json</span>
            <span className="hint">single source of truth · onboard() reads <code>configuration</code></span>
          </div>
          <div className="ssotbody"><pre className="json" dangerouslySetInnerHTML={{ __html: highlightJson(env) }} /></div>
        </div>
      )}
    </div>
  );
}
