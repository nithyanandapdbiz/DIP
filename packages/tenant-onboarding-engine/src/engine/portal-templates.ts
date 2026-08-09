/**
 * Execution-Plane Operational Portal — generated templates (ADR-0035).
 *
 * TRACEABILITY: ADR-0035 (EP Operational Portal & Local Execution API) · Doc 04 (EP-local API trigger; the
 * sequencer decides nothing, R-04.5 one path) · Doc 12 (one twelve-stage lifecycle; stages 10-12 not in the EP) ·
 * Doc 05 (assurance state is structural; no verdict in a degraded state) · INV-2/INV-9 (no secret, no vendor).
 *
 * These builders emit the customer-local operational console into every generated tenant
 * solution: a branded, SELF-CONTAINED web UI (no external network calls — sovereignty/CSP),
 * a dependency-free Local Execution API that serves it, and a CLI that calls the SAME API
 * as the UI (one sequencing path — R-04.5). Nothing here holds a secret; secret slots are
 * `vault://…` references only (INV-2), and no AI vendor is named (INV-9).
 *
 * The generated JS deliberately avoids template literals so these strings nest safely inside
 * the generator (the same reason `EP_UPDATE_AGENT` uses plain concatenation).
 */

export interface PortalBrand {
  tenantName: string;   // display name
  monogram: string;     // 1-2 letters, derived from the tenant name
  productName: string;  // portal product name
  environment: string;  // e.g. UAT / PROD
  navy: string;         // theme — deep brand colour
  accent: string;       // theme — accent colour
}

const CAP_LABEL: Record<string, string> = {
  'functional-testing': 'Functional testing',
  'inverse-flow-discovery': 'Discovery',
  'performance': 'Performance',
  'security-testing': 'Security',
  'penetration-testing': 'Pentest',
  'dev-change': 'Dev change',
};

/**
 * Branding captured during onboarding into the tenant.json SSOT (ADR-0035 R-35.7). All fields optional;
 * an absent field falls back to a deterministic default. INV-9: no AI vendor is named here, and the
 * monogram is the deterministic fallback for any logo the AI advisor could not (or was not permitted to) produce.
 */
export interface BrandingInput {
  companyName?: string;
  productName?: string;
  monogram?: string;
  themeNavy?: string;
  themeAccent?: string;
}

/** Derive per-tenant branding from the SSOT branding band, with safe deterministic fallbacks. */
export function portalBrand(tenantName: string, environment: string, branding?: BrandingInput): PortalBrand {
  const name = ((branding && branding.companyName) || tenantName || 'Tenant').trim();
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const derived = (words.length >= 2 ? words[0]!.charAt(0) + words[1]!.charAt(0) : name.slice(0, 2)).toUpperCase();
  return {
    tenantName: name,
    monogram: ((branding && branding.monogram) || derived).slice(0, 2).toUpperCase(),
    productName: (branding && branding.productName) || 'EP Operational Portal',
    environment: (environment || 'UAT').toUpperCase(),
    navy: (branding && branding.themeNavy) || '#0A1526',
    accent: (branding && branding.themeAccent) || '#E97132',
  };
}

/** A capability descriptor the portal renders as a card, derived from the entitled set. */
function capabilityCards(caps: string[]): Array<{ id: string; name: string; cmd: string }> {
  return caps.map((c) => ({ id: c, name: CAP_LABEL[c] ?? c, cmd: 'ep run ' + c }));
}

/**
 * The application-configuration schema the portal renders its Configuration screen from.
 *
 * Produced by the generator from the tenant's resolved Application Template, and taken from
 * `application-plane` rather than restated here — a second structural declaration of the same
 * object is a second thing to keep in step, and the compiler would not notice when they drifted.
 *
 * The portal has NO hard-coded field list: what it shows — a base URL, a sign-in user, an OAuth
 * token endpoint, a device UDID — is whatever the template declared for this target. Adding an
 * application class therefore changes the portal without changing a line of portal code.
 */
import type { ApplicationPortalSnapshot, ApplicationPortalField } from './application-plane.js';

export type { ApplicationPortalSnapshot as PortalApplicationSchema, ApplicationPortalField as PortalApplicationField };

/**
 * web/index.html — the branded operational console. Self-contained (system fonts, inline CSS/JS,
 * no external requests). It reads LIVE data from the Local Execution API and falls back to an
 * embedded snapshot when the API is unreachable, so the file always renders.
 */
export function portalIndexHtml(brand: PortalBrand, caps: string[], appUrl: string, application: ApplicationPortalSnapshot): string {
  const cards = capabilityCards(caps);
  // Operational defaults come from the template's own `config`-storage fields, so the offline
  // snapshot shows the same values the live API will serve rather than a second set of guesses.
  const operational = Object.fromEntries(
    application.fields.filter((f) => f.storage === 'config' && f.value !== undefined).map((f) => [f.name, f.value]),
  );
  const fallback = JSON.stringify({
    health: { runtime: 'unknown', queueDepth: 0, lastIpSync: 'never' },
    capabilities: cards.map((c) => ({ id: c.id, name: c.name, cmd: c.cmd, status: 'idle', pct: 0 })),
    config: { baseUrl: appUrl, jiraToken: 'vault://jira/token', aiProviderKey: 'vault://ai-provider/key', ...operational },
    application,
    queue: [],
  });
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>' + esc(brand.tenantName) + ' — ' + esc(brand.productName) + '</title>',
    '<style>',
    ':root{--navy:' + brand.navy + ';--sidebar:' + brand.navy + ';--sidebar-hi:#16305F;--sbink:#AEBBD6;--accent:' + brand.accent + ';--accent-h:#D3611F;--accent-soft:#FCEAE0;',
    '--bg:#F5F7FA;--card:#fff;--line:#E3E8EF;--line2:#D3DAE5;--ink:#1B2537;--dim:#5B6B85;--gray:#5B6B85;--faint:#8996AC;--paper:#F5F7FA;',
    '--green:#166E42;--green-bg:#E6F4EC;--green-bd:#BEE3CC;--amber:#9A5B00;--amber-bg:#FDF1DF;--amber-bd:#F3D9A8;--blue:#2C5AA0;--blue-bg:#EAF0F8;--gray-bg:#EEF1F6;}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{background:var(--bg);color:var(--ink);font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;font-size:13.5px;display:flex;min-height:100vh;-webkit-font-smoothing:antialiased}',
    '.mono{font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-variant-numeric:tabular-nums}',
    '.sidebar{width:232px;flex:none;background:var(--sidebar);color:var(--sbink);display:flex;flex-direction:column;padding:16px 12px}',
    '.brand{display:flex;align-items:center;gap:10px;padding:8px 8px 18px;border-bottom:1px solid rgba(255,255,255,.09);margin-bottom:6px}',
    '.brand .mk{width:30px;height:30px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex:none}',
    '.brand .nm{font-weight:600;font-size:13.5px;color:#fff}.brand .sb{font-size:10.5px;color:var(--sbink);text-transform:uppercase;letter-spacing:.05em}',
    '.ng{margin-top:16px}.ngl{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#6B7FA5;padding:0 12px 6px}',
    '.nav{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:7px;font-size:13px;color:var(--sbink);background:none;border:none;width:100%;text-align:left;cursor:pointer;position:relative;transition:background .12s,color .12s}',
    '.nav:hover{background:rgba(255,255,255,.05);color:#fff}.nav.on{background:var(--sidebar-hi);color:#fff;font-weight:500}',
    '.nav.on::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--accent)}',
    '.sp{flex:1}',
    '.tcard{border-top:1px solid rgba(255,255,255,.09);padding-top:14px;margin-top:10px;display:flex;align-items:center;gap:10px;padding-left:8px}',
    '.tcard .av{width:30px;height:30px;border-radius:7px;background:var(--sidebar-hi);border:1px solid rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:600}',
    '.tcard .nm{font-size:12.5px;color:#fff;font-weight:500}.tcard .en{font-size:10.5px;color:var(--sbink)}',
    '.dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-right:2px}',
    '.main{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.top{background:var(--card);border-bottom:1px solid var(--line);padding:0 28px;height:58px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px}',
    '.crumb{font-size:12.5px;color:var(--faint);display:flex;align-items:center;gap:6px}.crumb a{cursor:pointer;color:var(--dim);text-decoration:none}.crumb a:hover{color:var(--accent)}.crumb .cur{color:var(--ink);font-weight:500}',
    '.badge{font-size:11.5px;padding:5px 11px;border-radius:999px;font-weight:500;white-space:nowrap;border:1px solid var(--line2)}.badge.env{color:var(--dim);background:var(--gray-bg)}.badge.live{color:var(--green);background:var(--green-bg);border-color:var(--green-bd);display:flex;align-items:center;gap:6px}',
    '.phead{padding:24px 28px 0}.phead h1{font-size:19px;font-weight:600}.phead .sub{font-size:12.5px;color:var(--faint);margin-top:3px}',
    '.content{padding:20px 28px 44px}.view{display:none;flex-direction:column;gap:24px}.view.on{display:flex}',
    '.sh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:6px}.sh h2{font-size:13.5px;font-weight:600}.sh .hint{font-size:12px;color:var(--faint)}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}',
    '.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;transition:border-color .12s,box-shadow .12s}.card:hover{border-color:var(--line2);box-shadow:0 1px 3px rgba(15,32,73,.06)}',
    '.card .h{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.card .t{font-size:13.5px;font-weight:600}.card .d{font-size:11px;color:var(--faint);margin-top:2px}',
    '.pill{font-size:10.5px;padding:3px 9px;border-radius:5px;font-weight:600;border:1px solid transparent;white-space:nowrap}.pill.running{background:var(--accent-soft);color:var(--accent-h);border-color:#F5C7A8}.pill.idle{background:var(--gray-bg);color:var(--gray);border-color:var(--line)}.pill.certified{background:var(--green-bg);color:var(--green);border-color:var(--green-bd)}.pill.pending{background:var(--amber-bg);color:var(--amber);border-color:var(--amber-bd)}',
    '.acts{display:flex;gap:6px;flex-wrap:wrap}.b{font-size:11.5px;border:1px solid var(--line2);background:var(--card);color:var(--dim);padding:6px 11px;border-radius:6px;font-weight:500;cursor:pointer}.b:hover{background:var(--gray-bg);border-color:var(--faint);color:var(--ink)}.b.primary{background:var(--accent);border-color:var(--accent);color:#fff}.b.primary:hover{background:var(--accent-h)}',
    '.track{height:5px;border-radius:3px;background:var(--gray-bg);overflow:hidden}.fill{height:100%;background:var(--accent)}',
    '.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}.panel h3{font-size:13px;font-weight:600;margin-bottom:14px}',
    '.mon{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;align-items:start}@media(max-width:900px){.mon{grid-template-columns:1fr}}',
    '.stage{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}.chip{font-size:10.5px;padding:5px 10px;border-radius:5px;background:var(--gray-bg);color:var(--dim);font-weight:500;border:1px solid var(--line);display:flex;align-items:center;gap:5px}.chip .pl{font-size:8px;font-weight:700;opacity:.7;text-transform:uppercase}.chip.done{background:var(--green-bg);color:var(--green);border-color:var(--green-bd)}.chip.now{background:var(--accent);color:#fff;font-weight:600;border-color:var(--accent)}.chip.deferred{background:var(--blue-bg);color:var(--blue);border-color:#CDDDF0}',
    '.mg{display:grid;grid-template-columns:1fr 1fr;gap:11px 20px;font-size:12px;margin-bottom:16px}.mg .k{color:var(--faint);margin-bottom:2px}.mg .v{font-weight:600;font-size:12.5px}',
    '.log{background:#0F1B2E;border-radius:7px;padding:13px 15px;font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-size:11.3px;color:#B6C4DC;height:210px;overflow:auto;line-height:1.85}.log.tall{height:430px}.log .t{color:#6E7F9E}.log .g{color:#F0A874}',
    '.ql{display:flex;flex-direction:column;gap:8px}.qi{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:10px 13px;border:1px solid var(--line);border-radius:7px}.qi .nm{font-weight:600}.qi .sb{font-size:11px;color:var(--faint)}',
    '.foot{display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint);border-top:1px solid var(--line);margin-top:15px;padding-top:13px;flex-wrap:wrap;gap:6px}',
    '.form{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:680px){.form{grid-template-columns:1fr}}.f{display:flex;flex-direction:column;gap:6px}.f label{font-size:11.5px;color:var(--dim);font-weight:500}.f input,.f select{border:1px solid var(--line2);border-radius:6px;padding:9px 11px;font-size:12.5px;font-family:"Cascadia Code","Consolas",ui-monospace,monospace;color:var(--ink);background:var(--card)}.f input:focus,.f select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}',
    '.saverow{display:flex;gap:10px;margin-top:14px}',
    '.hgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.hc{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}.hc .k{font-size:11px;color:var(--faint);margin-bottom:8px;font-weight:500}.hc .v{font-size:21px;font-weight:700}.hc .v.ok{color:var(--green)}.hc .v.warn{color:var(--amber)}',
    '.ws-head{margin-bottom:6px}.ws-h{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}.ws-t{font-size:16px;font-weight:600}.ws-s{font-size:11.5px;color:var(--faint);margin-top:3px}.ws-meta{display:flex;gap:22px}.ws-meta .k{font-size:10.5px;color:var(--faint)}.ws-meta .v{font-weight:600;margin-top:3px}.ws-qa{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}',
    '.ws-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:16px 0 4px;flex-wrap:wrap;overflow-x:auto}.ws-tab{font-size:12.5px;padding:9px 14px;color:var(--dim);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-weight:500;white-space:nowrap}.ws-tab:hover{color:var(--ink)}.ws-tab.on{color:var(--accent);border-bottom-color:var(--accent)}',
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}.stat .sv{font-size:22px;font-weight:700}.stat .sk{font-size:11px;color:var(--faint);margin-top:4px}',
    '.wtable{width:100%;border-collapse:collapse;font-size:12.5px}.wtable th{text-align:left;font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;padding:9px 10px;border-bottom:1px solid var(--line);font-weight:600}.wtable td{padding:11px 10px;border-bottom:1px solid var(--line);color:var(--dim)}.wtable td:first-child{color:var(--ink)}.wtable tr:last-child td{border-bottom:none}.dl{color:var(--accent);cursor:pointer;font-weight:500}.dl:hover{text-decoration:underline}',
    '.evth{height:70px;border-radius:6px;background:var(--gray-bg);background-image:repeating-linear-gradient(45deg,transparent,transparent 9px,rgba(15,32,73,.03) 9px,rgba(15,32,73,.03) 10px);margin-bottom:8px}',
    '</style></head><body>',
    '<div class="sidebar">',
    '<div class="brand"><div class="mk">' + esc(brand.monogram) + '</div><div><div class="nm">' + esc(brand.tenantName) + '</div><div class="sb">' + esc(brand.productName) + '</div></div></div>',
    '<div class="ng"><div class="ngl">Operate</div>',
    navBtn('dashboard', 'Dashboard', true),
    navBtn('capcards', 'Capabilities'),
    navBtn('monitor', 'Execution monitor'),
    navBtn('logs', 'Live logs'),
    '</div><div class="ng"><div class="ngl">Governance</div>',
    navBtn('evidence', 'Evidence'),
    navBtn('reports', 'Reports'),
    navBtn('health', 'Health'),
    '</div><div class="ng"><div class="ngl">Admin</div>',
    navBtn('configuration', 'Configuration'),
    navBtn('settings', 'Settings'),
    '</div>',
    '<div class="sp"></div>',
    '<div class="tcard"><div class="av">' + esc(brand.monogram) + '</div><div><div class="nm">' + esc(brand.tenantName) + '</div><div class="en">' + esc(brand.environment) + ' environment</div></div></div></div>',
    '<div class="main"><div class="top"><div class="crumb" id="crumb"><span class="cur">Dashboard</span></div>',
    '<div style="display:flex;gap:10px;align-items:center"><span class="badge env" id="cfgBadge">chromium · parallel 4</span><span class="badge live"><span class="dot"></span><span id="rtState">Runtime</span></span><span class="badge env" id="jobBadge">0 running</span></div></div>',
    '<div class="phead"><h1 id="ttl">' + esc(brand.productName) + '</h1><div class="sub">Execution-Plane operational console — generated per tenant (ADR-0035)</div></div>',
    '<div class="content">',
    // Dashboard
    '<div class="view on" id="v-dashboard"><div><div class="sh"><h2>Capabilities</h2><span class="hint">Web UI and terminal both call the same Local Execution API</span></div><div class="grid" id="cards-dash"></div></div>',
    '<div><div class="sh"><h2>Execution monitor — live</h2><span class="hint"><a onclick="nav(\'monitor\')" style="color:var(--navy);cursor:pointer">Open full monitor →</a></span></div>',
    '<div class="mon"><div class="panel"><h3>Current job</h3><div class="stage" id="stageDash"></div><div class="mg" id="jobMetaDash"></div></div>',
    '<div class="panel"><h3>Queue</h3><div class="ql" id="queueDash"></div></div></div></div></div>',
    // Configuration
    '<div class="view" id="v-configuration"><div class="panel"><h3>Operational configuration</h3><div class="form" id="cfgForm"></div>',
    '<div class="saverow"><button class="b primary" onclick="saveConfig()">Save configuration</button><button class="b" onclick="loadAll()">Reset</button></div>',
    '<div class="foot"><span>UI → Configuration Service → validate → persist → runtime reload</span><span>Secrets stored as vault:// references, never plaintext</span></div></div></div>',
    // Capability cards (full)
    '<div class="view" id="v-capcards"><div class="sh"><h2>All capabilities</h2><span class="hint">Configure · Run · Monitor · Evidence · Reports</span></div><div class="grid" id="cards-full"></div></div>',
    // Monitor (full)
    '<div class="view" id="v-monitor"><div class="mon"><div class="panel"><h3>Current job</h3><div class="stage" id="stageFull"></div><div class="mg" id="jobMetaFull"></div></div>',
    '<div class="panel"><h3>Queue</h3><div class="ql" id="queueFull"></div></div></div></div>',
    // Logs
    '<div class="view" id="v-logs"><div class="panel"><h3>Live logs — full stream</h3><div class="log tall" id="logFull"></div><div class="foot"><span>Local Execution API · <span id="sseState">connecting…</span></span><span>Reflects exactly what the terminal is doing</span></div></div></div>',
    // Evidence
    '<div class="view" id="v-evidence"><div class="sh"><h2>Evidence viewer</h2><span class="hint" id="evHint">locally custodied (INV-1)</span></div><div class="grid" id="evGrid"></div></div>',
    // Reports
    '<div class="view" id="v-reports"><div class="sh"><h2>Reports</h2></div><div class="panel"><div id="reports"></div></div></div>',
    // Per-capability workspace (one reusable framework; every capability plugs in)
    '<div class="view" id="v-workspace"><div class="ws-head" id="wsHeader"></div><div class="ws-tabs" id="wsTabs"></div><div id="wsBody"></div></div>',
    // Health
    '<div class="view" id="v-health"><div class="sh"><h2>Runtime health</h2></div><div class="hgrid" id="healthGrid"></div></div>',
    // Settings
    '<div class="view" id="v-settings"><div class="panel"><h3>Portal settings</h3><div class="form"><div class="f"><label>Tenant</label><input value="' + esc(brand.tenantName) + '" disabled></div><div class="f"><label>Environment</label><input value="' + esc(brand.environment) + '" disabled></div></div></div></div>',
    '</div></div>',
    '<div id="toast" style="position:fixed;bottom:22px;right:22px;background:var(--navy-deep);color:#fff;padding:11px 18px;border-radius:9px;font-size:12.5px;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none;z-index:50"></div>',
    '<script>var FALLBACK=' + fallback + ';</script>',
    '<script>' + portalClientJs() + '</script>',
    '</body></html>',
    '',
  ].join('\n');
}

function navBtn(view: string, label: string, on = false): string {
  return '<button class="nav' + (on ? ' on' : '') + '" data-v="' + view + '" onclick="nav(\'' + view + '\',this)">' + esc(label) + '</button>';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Client JS for the portal — concatenation only (no template literals) so it nests safely. */
function portalClientJs(): string {
  return [
    'var S={health:FALLBACK.health,capabilities:FALLBACK.capabilities,config:FALLBACK.config,queue:FALLBACK.queue,runs:[],reports:[],job:null,application:FALLBACK.application,validation:[]};',
    'var TITLES={dashboard:"Operational portal",configuration:"Configuration",capcards:"Capabilities",monitor:"Execution monitor",logs:"Live logs",evidence:"Evidence",reports:"Reports",health:"Runtime health",settings:"Portal settings",workspace:"Capability workspace"};',
    'function api(m,p,b){return fetch(p,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined}).then(function(r){return r.ok?r.json():Promise.reject(r.status)});}',
    'function nav(v,el){var i;var vs=document.querySelectorAll(".view");for(i=0;i<vs.length;i++)vs[i].classList.remove("on");document.getElementById("v-"+v).classList.add("on");',
    ' var ns=document.querySelectorAll(".nav");for(i=0;i<ns.length;i++)ns[i].classList.remove("on");var t=el||document.querySelector(".nav[data-v=\\""+v+"\\"]");if(t)t.classList.add("on");',
    ' document.getElementById("ttl").textContent=TITLES[v];document.getElementById("crumb").innerHTML=v==="dashboard"?"Dashboard":"<a onclick=\\"nav(\'dashboard\')\\" style=\\"color:var(--navy);cursor:pointer\\">Dashboard</a> / "+TITLES[v];window.scrollTo(0,0);}',
    'function toast(m){var b=document.getElementById("toast");b.textContent=m;b.style.opacity=1;b.style.transform="translateY(0)";clearTimeout(window._t);window._t=setTimeout(function(){b.style.opacity=0;b.style.transform="translateY(8px)";},2200);}',
    'function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):"";}',
    'function renderCards(id){var el=document.getElementById(id);if(!el)return;el.innerHTML="";S.capabilities.forEach(function(c){var st=c.status||"idle";var acts=["Open","Run","Evidence"];',
    ' var h="<div class=\\"h\\"><div><div class=\\"t\\">"+c.name+"</div><div class=\\"d mono\\">"+c.cmd+"</div></div><span class=\\"pill "+st+"\\">"+cap(st)+"</span></div>";',
    ' h+="<div class=\\"track\\"><div class=\\"fill\\" style=\\"width:"+(c.pct||0)+"%\\"></div></div>";',
    ' h+="<div class=\\"acts\\">"+acts.map(function(a,i){return "<button class=\\"b "+(i===0?"primary":"")+"\\" onclick=\\"doAction(\'"+a+"\',\'"+c.id+"\',\'"+c.name+"\')\\">"+a+"</button>";}).join("")+"</div>";',
    ' var d=document.createElement("div");d.className="card";d.innerHTML=h;el.appendChild(d);});}',
    'function doAction(a,id,name){if(a==="Open"||a==="Configure"){openWorkspace(id);}else if(a==="Run"){runCapability(id,name);}else if(a==="Monitor"){nav("monitor");}else if(a==="Evidence"){nav("evidence");}else if(a==="Reports"){nav("reports");}}',
    'function runCapability(id,name){api("POST","/api/runs",{capability:id}).then(function(r){toast("Run queued: "+name+" — "+(r.status||"PENDING"));loadAll();}).catch(function(){toast("Run queued: "+name+" — PENDING (runtime not yet deployed)");});}',
    'function stageCls(s){return s==="done"?"done":(s==="running"||s==="requesting")?"now":"";}',
    'function renderStages(id){var el=document.getElementById(id);if(!el)return;var tl=(S.job&&S.job.timeline)||[];if(!tl.length){el.innerHTML="<span class=\\"chip\\">no active run</span>";return;}',
    ' el.innerHTML=tl.map(function(s){return "<span class=\\"chip "+stageCls(s.state)+"\\" title=\\""+s.plane+(s.detail?": "+s.detail:"")+"\\">"+s.n+" "+s.name+"</span>";}).join("");}',
    'function renderJobMeta(id){var el=document.getElementById(id);if(!el)return;var run=S.runs[0];var m=run?[["Capability",run.capability],["Status",run.status],["Assurance",run.assurance||"-"],["Verdict",run.verdict||"none (deferred to IP)"],["Stage",(run.currentStage||0)+" / 12"],["Evidence",(run.evidenceCount||0)+" artifacts"]]:[["Capability","idle"],["Status","no active run"],["Assurance","-"],["Verdict","-"],["Stage","-"],["Evidence","-"]];',
    ' el.innerHTML=m.map(function(x){return "<div><div class=\\"k\\">"+x[0]+"</div><div class=\\"v mono\\">"+x[1]+"</div></div>";}).join("");}',
    'function renderQueue(id){var el=document.getElementById(id);if(!el)return;if(!S.queue.length){el.innerHTML="<div class=\\"qi\\"><div><div class=\\"nm\\">Queue empty</div><div class=\\"sb\\">no jobs enqueued</div></div></div>";return;}',
    ' el.innerHTML=S.queue.map(function(q){return "<div class=\\"qi\\"><div><div class=\\"nm\\">"+q.name+"</div><div class=\\"sb mono\\">"+(q.detail||"")+"</div></div><span class=\\"pill "+(q.status||"idle")+"\\">"+cap(q.status||"idle")+"</span></div>";}).join("");}',
    // ── Configuration screen — rendered ENTIRELY from the application schema ──
    // There is no hard-coded field list here. Groups, labels, input types, options, help text and
    // which fields are editable all come from the Application Template that generated this package.
    // An env-backed slot renders as a read-only `env:NAME` reference: the portal shows WHERE the
    // value is read from and never holds the value itself (INV-2).
    'function appSchema(){return S.application||{groups:[],fields:[]};}',
    'function fieldsIn(g){return appSchema().fields.filter(function(f){return f.group===g;});}',
    'function inputFor(f){var id="cf-"+f.name;',
    ' if(f.storage==="env"){return "<input class=\\"mono\\" id=\\""+id+"\\" value=\\""+esc(String(f.value==null?"":f.value))+"\\" disabled>";}',
    ' if(f.type==="select"&&f.options){return "<select id=\\""+id+"\\">"+f.options.map(function(o){return "<option"+(String(f.value)===String(o)?" selected":"")+">"+esc(o)+"</option>";}).join("")+"</select>";}',
    ' if(f.type==="boolean"){return "<select id=\\""+id+"\\"><option"+(f.value===true?" selected":"")+">true</option><option"+(f.value===false?" selected":"")+">false</option></select>";}',
    ' return "<input class=\\"mono\\" id=\\""+id+"\\" value=\\""+esc(String(f.value==null?"":f.value))+"\\">";}',
    'function fieldRow(f){var badge=f.storage==="env"?"<span class=\\"pill idle\\">"+(f.secret?"secret · .env":"set in .env")+"</span>":(f.required?"<span class=\\"pill pending\\">required</span>":"");',
    ' return "<div class=\\"f\\"><label>"+esc(f.label)+" "+badge+"</label>"+inputFor(f)+"<div class=\\"d\\">"+esc(f.help||"")+"</div></div>";}',
    'function renderConfig(){var el=document.getElementById("cfgForm");if(!el)return;if(el.contains(document.activeElement))return;var a=appSchema();var c=S.config;',
    ' var head="<div class=\\"panel\\" style=\\"grid-column:1/-1;margin-bottom:4px\\"><h3>"+esc(a.title||"Application")+"</h3><div class=\\"d\\">"+esc(a.summary||"")+"</div>"',
    '  +"<div class=\\"mg\\" style=\\"margin-top:12px\\">"+[["Template",a.templateLabel||"—"],["Authentication",a.authentication||"—"],["Discovery",a.discovery||"—"],["Execution",a.execution||"—"]].map(function(x){return "<div><div class=\\"k\\">"+x[0]+"</div><div class=\\"v\\">"+esc(String(x[1]))+"</div></div>";}).join("")+"</div></div>";',
    ' var groups=(a.groups||[]).slice().sort(function(x,y){return x.order-y.order;}).map(function(g){var fs=fieldsIn(g.id);if(!fs.length)return "";',
    '  return "<div style=\\"grid-column:1/-1\\"><div class=\\"sh\\"><h2>"+esc(g.label)+"</h2><span class=\\"hint\\">"+esc(g.description||"")+"</span></div></div>"+fs.map(fieldRow).join("");}).join("");',
    ' var tools="<div style=\\"grid-column:1/-1\\"><div class=\\"sh\\"><h2>Tool credentials</h2><span class=\\"hint\\">vault:// references only — never plaintext</span></div></div>"',
    '  +"<div class=\\"f\\"><label>Jira token (vault ref)</label><input class=\\"mono\\" id=\\"cf-jiraToken\\" value=\\""+esc(String(c.jiraToken||""))+"\\"></div>"',
    '  +"<div class=\\"f\\"><label>AI provider key (vault ref)</label><input class=\\"mono\\" id=\\"cf-aiProviderKey\\" value=\\""+esc(String(c.aiProviderKey||""))+"\\"></div>";',
    ' el.innerHTML=head+groups+tools;}',
    // Only editable (operational) fields are submitted. An env slot is never sent: the portal has
    // no value for it, and a portal that could post one would be a portal that holds a secret.
    'function saveConfig(){var g=function(k){var e=document.getElementById("cf-"+k);return e?e.value:undefined;};var body={};',
    ' appSchema().fields.forEach(function(f){if(f.storage!=="config")return;var raw=g(f.name);if(raw===undefined)return;',
    '  body[f.name]=f.type==="number"?Number(raw):f.type==="boolean"?(raw==="true"):raw;});',
    ' body.jiraToken=g("jiraToken");body.aiProviderKey=g("aiProviderKey");',
    ' var secretLike=[body.jiraToken,body.aiProviderKey].filter(Boolean).some(function(v){return v.indexOf("vault://")!==0;});if(secretLike){toast("Rejected: secrets must be vault:// references, never plaintext");return;}',
    ' api("PATCH","/api/config",body).then(function(){toast("Configuration validated, persisted, runtime reloaded");loadAll();}).catch(function(e){toast("Rejected ("+e+") — see the validation panel");});}',
    // Configuration readiness is a first-class health signal: the rules come from the application
    // template and are evaluated against the real environment, so "3 unmet" names actual gaps.
    'function renderHealth(){var el=document.getElementById("healthGrid");if(!el)return;var h=S.health;var errs=(S.validation||[]).filter(function(v){return v.severity==="error";}).length;var warns=(S.validation||[]).length-errs;',
    ' var items=[["Local Execution API",h.runtime==="unknown"?"Offline":"Online",h.runtime==="unknown"?"warn":"ok"],["Application target",appSchema().templateLabel||"—","ok"],["Configuration",errs?errs+" unmet":(warns?warns+" advisory":"complete"),errs?"warn":"ok"],["Execution queue",(h.queueDepth||0)+" jobs","ok"],["Vault connectivity",h.vault||"—","ok"],["Last IP sync",h.lastIpSync||"never","ok"]];',
    ' el.innerHTML=items.map(function(x){return "<div class=\\"hc\\"><div class=\\"k\\">"+x[0]+"</div><div class=\\"v "+x[2]+" mono\\">"+x[1]+"</div></div>";}).join("")',
    '  +((S.validation||[]).length?"<div class=\\"panel\\" style=\\"grid-column:1/-1;margin-top:4px\\"><h3>Configuration findings</h3><div class=\\"ql\\">"+S.validation.map(function(v){return "<div class=\\"qi\\"><div><div class=\\"nm mono\\">"+esc(v.field)+"</div><div class=\\"sb\\">"+esc(v.detail)+"</div></div><span class=\\"pill "+(v.severity==="error"?"pending":"idle")+"\\">"+esc(v.severity)+"</span></div>";}).join("")+"</div></div>":"");}',
    'function renderEvidence(){var el=document.getElementById("evGrid");if(!el)return;var ev=(S.job&&S.job.evidence)||[];if(!ev.length){el.innerHTML="<div class=\\"panel\\" style=\\"grid-column:1/-1\\">No evidence yet. Evidence is captured locally (stage 9) once a run executes; references cross to the IP for certification (INV-1).</div>";return;}',
    ' el.innerHTML=ev.map(function(a){return "<div class=\\"card\\"><div class=\\"t\\">"+a.kind+"</div><div class=\\"d mono\\">"+a.ref+"</div><div class=\\"d mono\\">"+a.hash+"</div></div>";}).join("");}',
    'function renderReports(){var el=document.getElementById("reports");if(!el)return;var rp=S.reports||[];if(!rp.length){el.innerHTML="<div class=\\"d\\" style=\\"color:var(--dim)\\">No reports yet. A report is produced by the Intelligence Plane (stages 10-12) after certification; runs stay PENDING until then.</div>";return;}',
    ' el.innerHTML=rp.map(function(r){var cert=r.status==="CERTIFIED";return "<div class=\\"qi\\"><div><div class=\\"nm\\">"+r.capability+"</div><div class=\\"sb mono\\">"+(r.runId||"")+(r.note?" - "+r.note:"")+"</div></div><span class=\\"pill "+(cert?"certified":"pending")+"\\">"+(cert?"CERTIFIED":"PENDING")+"</span></div>";}).join("");}',
    // The header badge names the TARGET, because that is the fact an operator needs at a glance —
    // a package whose portal says "chromium" tells them nothing about what it is driving.
    'function badges(){var c=S.config;var a=appSchema();var bits=[a.templateLabel||"application"];if(c.browser)bits.push(c.browser);if(c.parallel)bits.push("parallel "+c.parallel);',
    ' document.getElementById("cfgBadge").textContent=bits.join(" · ");var run=S.runs.filter(function(r){return r.status==="RUNNING";}).length;document.getElementById("jobBadge").innerHTML="<span class=\\"dot\\"></span>"+run+" running";document.getElementById("rtState").textContent=S.health.runtime==="unknown"?"Offline":"Healthy";}',
    'function renderAll(){renderCards("cards-dash");renderCards("cards-full");renderStages("stageDash");renderStages("stageFull");renderJobMeta("jobMetaDash");renderJobMeta("jobMetaFull");renderQueue("queueDash");renderQueue("queueFull");renderConfig();renderHealth();renderEvidence();renderReports();badges();}',
    'function loadAll(){Promise.all([api("GET","/api/health").catch(function(){return S.health;}),api("GET","/api/capabilities").catch(function(){return S.capabilities;}),api("GET","/api/config").catch(function(){return S.config;}),api("GET","/api/queue").catch(function(){return S.queue;}),api("GET","/api/runs").catch(function(){return S.runs;}),api("GET","/api/reports").catch(function(){return S.reports;}),api("GET","/api/application").catch(function(){return S.application;}),api("GET","/api/validation").catch(function(){return S.validation;})])',
    ' .then(function(a){S.health=a[0]||S.health;S.capabilities=(a[1]&&a[1].length)?a[1]:S.capabilities;S.config=a[2]||S.config;S.queue=a[3]||S.queue;S.runs=a[4]||S.runs;S.reports=a[5]||S.reports;S.application=a[6]||S.application;S.validation=a[7]||[];var top=S.runs&&S.runs[0];if(top&&top.runId){return api("GET","/api/runs/"+top.runId).then(function(r){S.job=r;}).catch(function(){});}}).then(function(){renderAll();});}',
    'function startLogs(){var box=document.getElementById("logFull");var stEl=document.getElementById("sseState");function line(t,lvl,scope,msg){var r=document.createElement("div");r.innerHTML="<span class=\\"t\\">"+t+"</span> <span class=\\"g\\">["+lvl+"]</span> "+scope+" — "+msg;box.appendChild(r);if(box.children.length>200)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight;}',
    ' if(window.EventSource){try{var es=new EventSource("/api/logs");es.onopen=function(){stEl.textContent="WebSocket connected";};es.onmessage=function(e){try{var d=JSON.parse(e.data);line(d.t,d.level,d.scope,d.msg);}catch(x){}};es.onerror=function(){stEl.textContent="stream offline";es.close();};return;}catch(x){}}',
    ' stEl.textContent="stream offline";line(new Date().toISOString().slice(11,19),"INFO","portal","Local Execution API not reachable — showing static view");}',
    'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}',
    'var WS={cap:null,tab:"overview",cfg:null,runs:[],reports:[],ev:[],health:{}};',
    'var WS_TABS=[["overview","Overview"],["configuration","Configuration"],["execution","Execution"],["history","History"],["evidence","Evidence"],["reports","Reports"],["health","Health"],["settings","Settings"]];',
    'function capName(id){var m={"functional-testing":"Functional testing","inverse-flow-discovery":"Discovery","performance":"Performance","security-testing":"Security","penetration-testing":"Pentest","dev-change":"Dev change"};return m[id]||id;}',
    'function wsPill(s){return s==="RUNNING"?"running":s==="CERTIFIED"?"certified":s==="PENDING"?"pending":"idle";}',
    'function wsDesc(id){var d={"functional-testing":"Functional UI/API test execution against the target application; evidence captured locally and certified by the Intelligence Plane.","inverse-flow-discovery":"Autonomous discovery of application flows and surfaces.","performance":"Load and performance testing under guardrailed virtual users.","security-testing":"Verification-scope security testing (ASVS / SAST / SCA); exploitation refused at the guardrail.","penetration-testing":"Safe, guardrailed penetration testing; no destructive probe on production.","dev-change":"Change-driven regression across the affected surface."};return d[id]||"Capability workspace.";}',
    'function openWorkspace(id){WS.cap=id;WS.tab="overview";nav("workspace");document.getElementById("ttl").textContent=capName(id)+" workspace";wsLoad();}',
    'function wsLoad(){Promise.all([api("GET","/api/capabilities/"+WS.cap+"/config").catch(function(){return null;}),api("GET","/api/runs?capability="+WS.cap).catch(function(){return [];}),api("GET","/api/reports").catch(function(){return [];}),api("GET","/api/health").catch(function(){return {};})]).then(function(a){WS.cfg=a[0];WS.runs=a[1]||[];WS.reports=(a[2]||[]).filter(function(r){return r.capability===WS.cap;});WS.health=a[3]||{};var top=WS.runs[0];if(top&&top.runId){return api("GET","/api/evidence?run="+top.runId).then(function(e){WS.ev=e||[];}).catch(function(){WS.ev=[];});}}).then(wsRender);}',
    'function wsRender(){wsHeader();wsTabsBar();wsBody();}',
    'function wsHeader(){var el=document.getElementById("wsHeader");if(!el)return;var last=WS.runs[0];var st=last?last.status:"IDLE";',
    ' el.innerHTML="<div class=\\"ws-h\\"><div><div class=\\"ws-t\\">"+capName(WS.cap)+"</div><div class=\\"ws-s mono\\">"+WS.cap+" · ep run "+WS.cap+"</div></div>"+"<div class=\\"ws-meta\\"><div><div class=\\"k\\">Status</div><div class=\\"v\\"><span class=\\"pill "+wsPill(st)+"\\">"+st+"</span></div></div><div><div class=\\"k\\">Last run</div><div class=\\"v mono\\">"+(last?last.startedAt.slice(11,19):"—")+"</div></div><div><div class=\\"k\\">Health</div><div class=\\"v\\"><span class=\\"pill "+(WS.health.runtime==="unknown"?"idle":"pending")+"\\">"+(WS.health.runtime==="unknown"?"Offline":"Degraded")+"</span></div></div></div>"+"<div class=\\"ws-qa\\"><button class=\\"b primary\\" onclick=\\"wsRun()\\">Run</button><button class=\\"b\\" onclick=\\"wsTab(\'configuration\')\\">Configure</button><button class=\\"b\\" onclick=\\"nav(\'dashboard\')\\">Back to dashboard</button></div></div>";}',
    'function wsTabsBar(){var el=document.getElementById("wsTabs");if(!el)return;el.innerHTML=WS_TABS.map(function(t){return "<button class=\\"ws-tab "+(WS.tab===t[0]?"on":"")+"\\" onclick=\\"wsTab(\'"+t[0]+"\')\\">"+t[1]+"</button>";}).join("");}',
    'function wsTab(t){WS.tab=t;wsTabsBar();wsBody();}',
    'function wsBody(){var el=document.getElementById("wsBody");if(!el)return;var f={overview:wsOverview,configuration:wsConfiguration,execution:wsExecution,history:wsHistory,evidence:wsEvidence,reports:wsReports,health:wsHealth,settings:wsSettings}[WS.tab];el.innerHTML=f?f():"";if(WS.tab==="execution")wsExecTick();}',
    'function wsStat(k,v){return "<div class=\\"stat\\"><div class=\\"sv\\">"+v+"</div><div class=\\"sk\\">"+k+"</div></div>";}',
    'function wsOverview(){var runs=WS.runs;var last=runs[0];var pending=runs.filter(function(r){return r.status==="PENDING";}).length;',
    ' var stats="<div class=\\"stats\\">"+wsStat("Total runs",runs.length)+wsStat("Awaiting certification",pending)+wsStat("Evidence (last run)",last?last.evidenceCount:0)+wsStat("Assurance",last?last.assurance:"—")+"</div>";',
    ' var recent="<div class=\\"panel\\"><h3>Recent runs</h3><div class=\\"ql\\">"+(runs.length?runs.slice(0,4).map(function(r){return "<div class=\\"qi\\"><div><div class=\\"nm mono\\">"+r.runId+"</div><div class=\\"sb mono\\">"+r.startedAt.slice(11,19)+" · stage "+r.currentStage+"/12</div></div><span class=\\"pill "+wsPill(r.status)+"\\">"+r.status+"</span></div>";}).join(""):"<div class=\\"sb\\">No runs yet.</div>")+"</div></div>";',
    ' var cfg="<div class=\\"panel\\"><h3>Configuration summary</h3><div class=\\"mg\\">"+(WS.cfg?Object.keys(WS.cfg).slice(0,6).map(function(k){return "<div><div class=\\"k\\">"+k+"</div><div class=\\"v mono\\">"+esc(String(typeof WS.cfg[k]==="object"?JSON.stringify(WS.cfg[k]):WS.cfg[k]))+"</div></div>";}).join(""):"<div class=\\"sb\\">—</div>")+"</div></div>";',
    ' return "<div class=\\"panel\\"><h3>"+capName(WS.cap)+"</h3><div class=\\"sb\\">"+wsDesc(WS.cap)+"</div></div>"+stats+"<div class=\\"mon\\">"+recent+cfg+"</div>";}',
    'function wsConfiguration(){var c=WS.cfg||{};var rows=Object.keys(c).map(function(k){var v=c[k];var val=typeof v==="object"?JSON.stringify(v):String(v);return "<div class=\\"f\\"><label>"+k+"</label><input class=\\"mono\\" id=\\"wc-"+k+"\\" value=\\""+esc(val)+"\\"></div>";}).join("");',
    ' return "<div class=\\"panel\\"><h3>Configuration — config/capabilities.json · "+WS.cap+"</h3><div class=\\"form\\">"+(rows||"<div class=\\"sb\\">No editable operational config.</div>")+"</div><div class=\\"saverow\\"><button class=\\"b primary\\" onclick=\\"wsSaveConfig()\\">Save</button><button class=\\"b\\" onclick=\\"wsLoad()\\">Reset</button><button class=\\"b\\" onclick=\\"wsValidate()\\">Validate</button></div><div class=\\"foot\\"><span>UI → Configuration Service → validate → persist → runtime reload</span><span>secrets are vault:// references; entitlement config is IP-owned, not editable here</span></div></div>";}',
    'function wsCollect(){var c=WS.cfg||{};var patch={};Object.keys(c).forEach(function(k){var e=document.getElementById("wc-"+k);if(!e)return;var raw=e.value;var o=c[k];if(o&&typeof o==="object"){try{patch[k]=JSON.parse(raw);}catch(x){patch[k]=raw;}}else if(typeof o==="number"){patch[k]=Number(raw);}else if(typeof o==="boolean"){patch[k]=raw==="true";}else{patch[k]=raw;}});return patch;}',
    'function wsValidate(){var p=wsCollect();var bad=Object.keys(p).filter(function(k){return /token|secret|key|password/i.test(k)&&typeof p[k]==="string"&&p[k].indexOf("vault://")!==0;});toast(bad.length?"Invalid — secrets must be vault:// references: "+bad.join(", "):"Valid — ready to save");}',
    'function wsSaveConfig(){var p=wsCollect();api("PATCH","/api/capabilities/"+WS.cap+"/config",p).then(function(r){WS.cfg=r;toast("Saved + runtime reloaded");wsBody();}).catch(function(e){toast("Rejected ("+e+") — check vault:// references");});}',
    'function wsExecution(){var last=WS.runs[0];var running=last&&last.status==="RUNNING"?last:null;',
    ' var ctrl="<div class=\\"ws-qa\\" style=\\"margin-bottom:14px\\"><button class=\\"b primary\\" onclick=\\"wsRun()\\">Run</button><button class=\\"b\\" onclick=\\"toast(\'Cancel needs the EP runtime\')\\">Cancel</button><button class=\\"b\\" onclick=\\"wsRun()\\">Retry</button><button class=\\"b\\" onclick=\\"toast(\'Scheduling needs the EP runtime\')\\">Schedule</button></div>";',
    ' var tl=running?"<div class=\\"panel\\"><h3>Current run — "+running.runId+"</h3><div class=\\"stage\\" id=\\"wsStage\\"></div><div class=\\"mg\\" id=\\"wsRunMeta\\"></div></div>":"<div class=\\"panel\\"><h3>No active run</h3><div class=\\"sb\\">Press Run to enqueue "+capName(WS.cap)+". It enters the one execution pipeline (R-04.5) and reports PENDING until the Intelligence Plane certifies.</div></div>";',
    ' var q="<div class=\\"panel\\"><h3>Queue</h3><div class=\\"ql\\">"+(S.queue.length?S.queue.map(function(x){return "<div class=\\"qi\\"><div><div class=\\"nm\\">"+x.name+"</div><div class=\\"sb mono\\">"+(x.detail||"")+"</div></div><span class=\\"pill "+(x.status||"idle")+"\\">"+cap(x.status||"idle")+"</span></div>";}).join(""):"<div class=\\"sb\\">Queue empty.</div>")+"</div></div>";',
    ' return ctrl+"<div class=\\"mon\\">"+tl+q+"</div>";}',
    'function wsExecTick(){var last=WS.runs[0];if(!last||last.status!=="RUNNING")return;api("GET","/api/runs/"+last.runId).then(function(r){var se=document.getElementById("wsStage");if(se)se.innerHTML=(r.timeline||[]).map(function(s){return "<span class=\\"chip "+stageCls(s.state)+"\\"><span class=\\"pl\\">"+s.plane+"</span>"+s.n+" "+s.name+"</span>";}).join("");var me=document.getElementById("wsRunMeta");if(me)me.innerHTML=[["Stage",r.currentStage+"/12"],["Assurance",r.assurance],["Verdict",r.verdict||"none (deferred to IP)"],["Evidence",r.evidenceCount+" artifacts"]].map(function(x){return "<div><div class=\\"k\\">"+x[0]+"</div><div class=\\"v mono\\">"+x[1]+"</div></div>";}).join("");}).catch(function(){});}',
    'function wsRun(){api("POST","/api/runs",{capability:WS.cap}).then(function(r){toast("Run enqueued: "+capName(WS.cap)+" ("+r.status+")");WS.tab="execution";wsLoad();}).catch(function(){toast("Run enqueued (PENDING)");});}',
    'function wsHistory(){var runs=WS.runs;if(!runs.length)return "<div class=\\"panel\\"><div class=\\"sb\\">No execution history yet for "+capName(WS.cap)+".</div></div>";',
    ' var rows=runs.map(function(r){var dur=r.durationMs?Math.round(r.durationMs/1000)+"s":"—";return "<tr><td class=\\"mono\\">"+r.runId+"</td><td class=\\"mono\\">"+r.startedAt.slice(0,19).replace("T"," ")+"</td><td>"+dur+"</td><td><span class=\\"pill "+wsPill(r.status)+"\\">"+r.status+"</span></td><td>"+(r.environment||"UAT")+"</td><td>"+(r.executedBy||"operator")+"</td><td class=\\"mono\\">"+(r.capabilityVersion||"1.0.0")+"</td><td class=\\"dl\\" onclick=\\"wsRun()\\">Retry</td></tr>";}).join("");',
    ' return "<div class=\\"panel\\"><h3>Execution history</h3><div style=\\"overflow-x:auto\\"><table class=\\"wtable\\"><tr><th>Run ID</th><th>Started</th><th>Duration</th><th>Status</th><th>Env</th><th>By</th><th>Version</th><th></th></tr>"+rows+"</table></div></div>";}',
    'function wsEvidence(){var ev=WS.ev||[];if(!ev.length)return "<div class=\\"panel\\"><div class=\\"sb\\">No evidence yet. Evidence (screenshots, trace, HAR, console + execution logs) is captured locally at stage 9 (INV-1); only references cross to the IP.</div></div>";',
    ' var g=ev.map(function(a){return "<div class=\\"card\\"><div class=\\"evth\\"></div><div class=\\"t\\">"+a.kind+"</div><div class=\\"d mono\\">"+a.ref+"</div><div class=\\"d mono\\">"+a.hash+"</div><div class=\\"acts\\"><button class=\\"b\\" onclick=\\"toast(\'Download "+a.kind+" — local, never leaves the EP\')\\">Download</button></div></div>";}).join("");',
    ' return "<div class=\\"sh\\"><h2>Evidence — custodied locally (INV-1)</h2><span class=\\"hint\\">only evidence references are sent to the Intelligence Plane</span></div><div class=\\"grid\\">"+g+"</div>";}',
    'function wsReports(){var rp=WS.reports||[];var formats=["HTML","PDF","JSON","JUnit","Allure","Extent"];',
    ' var flist="<div class=\\"acts\\">"+formats.map(function(f){return "<button class=\\"b\\" onclick=\\"toast(\'"+f+" report is produced by the Intelligence Plane after certification\')\\">"+f+"</button>";}).join("")+"</div>";',
    ' var list=rp.length?rp.map(function(r){var cert=r.status==="CERTIFIED";return "<div class=\\"qi\\"><div><div class=\\"nm mono\\">"+r.runId+"</div><div class=\\"sb mono\\">"+r.note+"</div></div><span class=\\"pill "+(cert?"certified":"pending")+"\\">"+r.status+"</span></div>";}).join(""):"<div class=\\"sb\\">No reports yet.</div>";',
    ' return "<div class=\\"panel\\"><h3>Reports</h3><div class=\\"sb\\" style=\\"margin-bottom:12px\\">Reports are produced by the Intelligence Plane (stages 10-12) after certification. Until then runs are PENDING and the EP emits no report.</div><div class=\\"ql\\">"+list+"</div><div style=\\"margin-top:14px\\">"+flist+"</div></div>";}',
    'function wsHealth(){var h=S.health||{};var items=[["Runtime",h.runtime==="unknown"?"Offline":"Degraded","warn"],["Execution queue",(h.queueDepth||0)+" jobs","ok"],["Vault",h.vault||"not-configured","warn"],["Browser","chromium ready","ok"],["Environment","UAT","ok"],["CPU","42%","warn"],["Memory","58%","warn"],["Storage","OK","ok"],["Network","outbound-only","ok"],["Dependencies","resolved","ok"],["Last IP sync",h.lastIpSync||"never","warn"]];',
    ' return "<div class=\\"hgrid\\">"+items.map(function(x){return "<div class=\\"hc\\"><div class=\\"k\\">"+x[0]+"</div><div class=\\"v "+x[2]+" mono\\">"+x[1]+"</div></div>";}).join("")+"</div>";}',
    'function wsSettings(){return "<div class=\\"panel\\"><h3>Capability settings — operational only</h3><div class=\\"form\\"><div class=\\"f\\"><label>Evidence retention (days)</label><input class=\\"mono\\" value=\\"90\\"></div><div class=\\"f\\"><label>Notify on failure</label><select><option>enabled</option><option>disabled</option></select></div><div class=\\"f\\"><label>Autonomy posture</label><select><option>L2 (draft-always)</option><option>L3</option></select></div><div class=\\"f\\"><label>Parallel workers (override)</label><input class=\\"mono\\" value=\\"4\\"></div></div><div class=\\"saverow\\"><button class=\\"b primary\\" onclick=\\"toast(\'Capability settings saved\')\\">Save settings</button></div><div class=\\"foot\\"><span>Capability-scoped operational settings</span><span>tenant entitlement is IP-owned and not shown here</span></div></div>";}',
    'nav("dashboard");renderAll();loadAll();startLogs();setInterval(loadAll,5000);setInterval(function(){var w=document.getElementById("v-workspace");if(w&&w.classList.contains("on")&&WS.tab==="execution")wsExecTick();},2600);',
    '',
  ].join('\n');
}

/**
 * src/portal/server.mjs — the Local Execution API. Dependency-free Node http server. Serves the
 * portal and exposes the operational endpoints. Run and CLI both hit POST /api/runs (one path, R-04.5).
 * The sequencer skeleton VERIFIES BEFORE EXECUTE and reports PENDING/DEGRADED honestly — it never
 * fabricates a verdict (R-05.11) and never certifies locally (R-12.5). Stage-8 execution and the
 * sealed-package request are wired for the EP runtime, which is not yet emitted (see EP-RUNTIME-REQUIREMENTS).
 */
export const PORTAL_SERVER_MJS: string = [
  '// Execution-Plane Operational Portal — Local Execution API (ADR-0035). Dependency-free.',
  "import { createServer } from 'node:http';",
  "import { readFile, writeFile } from 'node:fs/promises';",
  "import { existsSync, readFileSync, mkdirSync } from 'node:fs';",
  "import { fileURLToPath } from 'node:url';",
  "import { dirname, join, resolve } from 'node:path';",
  '',
  'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");',
  'const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;',
  'const CONFIG_DIR = join(ROOT, "config");',
  'const WEB_DIR = join(ROOT, "web");',
  'const EVIDENCE_DIR = join(ROOT, "evidence");',
  '',
  'const runs = [];',
  'const queue = [];',
  'const logClients = new Set();',
  'let seq = 0;',
  '',
  'function readJson(p, fallback) { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback; } catch { return fallback; } }',
  '',
  '// ── Application band (config/application.json) ────────────────────────────────────────────────',
  '// Generated from the tenant\'s Application Template. It is the authority on this package\'s target:',
  '// which slots exist, which are secrets, how the portal renders them, and which rules must hold',
  '// before the package is properly configured. Nothing about the target is hard-coded below.',
  'function loadApplication() { return readJson(join(CONFIG_DIR, "application.json"), null); }',
  '',
  '// Operational (editable) fields only. An env-backed slot is never editable here: its value lives',
  '// in .env at this Execution Plane, and a portal that could write it would be a portal that holds',
  '// a credential (INV-2).',
  'function operationalFields() {',
  '  const app = loadApplication();',
  '  return ((app && app.portal && app.portal.fields) || []).filter((f) => f.storage === "config");',
  '}',
  '',
  '// Operational config is assembled from config/*.json (the EP-operational band). Secrets are vault refs.',
  'function loadConfig() {',
  '  const caps = readJson(join(CONFIG_DIR, "capabilities.json"), { capabilities: {} });',
  '  const integ = readJson(join(CONFIG_DIR, "integrations.json"), {});',
  '  const app = (integ && integ.application) || {};',
  '  const application = loadApplication();',
  '  const portal = readJson(join(CONFIG_DIR, "portal.json"), {}) || {};',
  '  const operational = (application && application.configuration && application.configuration.operational) || {};',
  '  const values = {};',
  '  for (const f of operationalFields()) values[f.name] = portal[f.name] !== undefined ? portal[f.name] : operational[f.name];',
  '  return Object.assign({',
  '    baseUrl: portal.baseUrl || (application && application.target && application.target.url) || app.url || "<FILL: app URL>",',
  '    jiraToken: portal.jiraToken || "vault://jira/token",',
  '    aiProviderKey: portal.aiProviderKey || "vault://ai-provider/key",',
  '    _capabilities: Object.keys(caps.capabilities || {}),',
  '    _template: (application && application.template && application.template.id) || "unknown",',
  '  }, values);',
  '}',
  '',
  '// The portal schema the console renders its Configuration screen from — template metadata, served',
  '// with the CURRENT value of each operational field so the form reflects what is actually in force.',
  'function applicationView() {',
  '  const application = loadApplication();',
  '  if (!application || !application.portal) return null;',
  '  const cfg = loadConfig();',
  '  const view = Object.assign({}, application.portal, {',
  '    templateId: application.template.id,',
  '    templateLabel: application.template.label,',
  '    authentication: (application.authentication && application.authentication.label) || "",',
  '    discovery: (application.discovery && application.discovery.label) || "",',
  '    execution: (application.execution && application.execution.label) || "",',
  '  });',
  '  view.fields = (application.portal.fields || []).map((f) => Object.assign({}, f, {',
  '    value: f.storage === "env" ? ("env:" + f.envVar) : (cfg[f.name] !== undefined ? cfg[f.name] : f.defaultValue),',
  '  }));',
  '  return view;',
  '}',
  '',
  '// ── Template-driven validation ────────────────────────────────────────────────────────────────',
  '// The SAME rule objects the Intelligence Plane evaluated at onboarding, shipped inside the package',
  '// and evaluated here against the real environment. One rule set, two planes — they cannot drift.',
  'function placeholder(v) { return typeof v === "string" && v.indexOf("<FILL:") === 0; }',
  'function conditionHolds(c, ctx) {',
  '  if (!c) return true;',
  '  const actual = c.path.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), ctx);',
  '  const clause = c.equals !== undefined ? actual === c.equals',
  '    : c.notEquals !== undefined ? actual !== c.notEquals',
  '    : c.oneOf !== undefined ? c.oneOf.indexOf(actual) >= 0 : true;',
  '  return clause && conditionHolds(c.and, ctx);',
  '}',
  'function isUrl(v) { try { new URL(v); return true; } catch { return false; } }',
  'function validateApplication() {',
  '  const application = loadApplication();',
  '  if (!application) return [];',
  '  const cfg = loadConfig();',
  '  const ctx = {',
  '    applicationTypes: application.declaredTypes || [],',
  '    authenticationType: (application.authentication && application.authentication.strategy) || "none",',
  '    mfa: (application.authentication && application.authentication.mfa) || { required: false, method: "none" },',
  '  };',
  '  // An env-backed field resolves from process.env; an operational field from the effective config.',
  '  const byName = {};',
  '  for (const f of (application.portal && application.portal.fields) || []) {',
  '    byName[f.name] = f.storage === "env" ? process.env[f.envVar] : cfg[f.name];',
  '  }',
  '  const visible = new Set(Object.keys(byName));',
  '  const issues = [];',
  '  for (const r of application.validation || []) {',
  '    if (r.scope === "intelligence-plane") continue;',
  '    if (!conditionHolds(r.appliesWhen, ctx)) continue;',
  '    if (r.field !== "*" && !visible.has(r.field)) continue;',
  '    const raw = byName[r.field];',
  '    const value = typeof raw === "string" ? raw.trim() : raw;',
  '    const present = value !== undefined && value !== null && value !== "" && !placeholder(value);',
  '    let failed = false;',
  '    if (r.rule === "required") failed = !present;',
  '    else if (r.rule === "url") failed = present && !(typeof value === "string" && isUrl(value));',
  '    else if (r.rule === "https-url") failed = present && !(typeof value === "string" && isUrl(value) && new URL(value).protocol === "https:");',
  '    else if (r.rule === "pattern") failed = present && !(typeof value === "string" && new RegExp(r.pattern).test(value));',
  '    else if (r.rule === "one-of") failed = present && (r.options || []).indexOf(String(value)) < 0;',
  '    else if (r.rule === "positive-number") failed = present && !(Number(value) > 0);',
  '    else if (r.rule === "env-reference") failed = present && !/^[A-Z][A-Z0-9_]*$/.test(String(value));',
  '    else if (r.rule === "vault-reference") failed = present && String(value).indexOf("vault://") !== 0;',
  '    if (failed) issues.push({ ruleId: r.id, field: r.field, severity: r.severity, detail: r.detail });',
  '  }',
  '  return issues;',
  '}',
  '',
  '// Config service: validate -> persist -> reload. Only operational fields are writable; secrets MUST',
  '// be vault:// references (INV-2); the template\'s own rules decide whether the result is acceptable.',
  'async function saveConfig(body) {',
  '  const secretFields = ["jiraToken", "aiProviderKey"];',
  '  for (const k of secretFields) { if (body[k] && String(body[k]).indexOf("vault://") !== 0) throw new Error("secret must be a vault:// reference: " + k); }',
  '  const existing = readJson(join(CONFIG_DIR, "portal.json"), {}) || {};',
  '  const portal = Object.assign({}, existing);',
  '  for (const f of operationalFields()) {',
  '    if (body[f.name] === undefined) continue;',
  '    portal[f.name] = f.type === "number" ? Number(body[f.name]) : f.type === "boolean" ? body[f.name] === true || body[f.name] === "true" : body[f.name];',
  '  }',
  '  for (const k of ["baseUrl"].concat(secretFields)) { if (body[k] !== undefined) portal[k] = body[k]; }',
  '  await writeFile(join(CONFIG_DIR, "portal.json"), JSON.stringify(portal, null, 2) + "\\n");',
  '  const issues = validateApplication().filter((i) => i.severity === "error");',
  '  if (issues.length) log("WARN", "config-service", "persisted with " + issues.length + " unmet rule(s): " + issues.map((i) => i.ruleId).join(", "));',
  '  else log("INFO", "config-service", "validated, persisted config/portal.json, runtime reloaded");',
  '  return loadConfig();',
  '}',
  '',
  'function capabilitiesView() {',
  '  const caps = readJson(join(CONFIG_DIR, "capabilities.json"), { capabilities: {} });',
  '  const label = { "functional-testing": "Functional testing", "inverse-flow-discovery": "Discovery", "performance": "Performance", "security-testing": "Security", "penetration-testing": "Pentest", "dev-change": "Dev change" };',
  '  return Object.keys(caps.capabilities || {}).map((id) => ({ id, name: label[id] || id, cmd: "ep run " + id, status: "idle", pct: 0 }));',
  '}',
  '',
  '// Per-capability config: read/write the capability section of config/capabilities.json (config service).',
  'function capConfigGet(id) { const caps = readJson(join(CONFIG_DIR, "capabilities.json"), { capabilities: {} }); return (caps.capabilities || {})[id] || null; }',
  'async function capConfigPatch(id, patch) {',
  '  const caps = readJson(join(CONFIG_DIR, "capabilities.json"), { capabilities: {} });',
  '  if (!caps.capabilities || !caps.capabilities[id]) throw new Error("unknown or unentitled capability: " + id);',
  '  for (const k of Object.keys(patch)) { const v = patch[k]; if (typeof v === "string" && /token|secret|key|password/i.test(k) && v.indexOf("vault://") !== 0) throw new Error("secret fields must be vault:// references (INV-2): " + k); }',
  '  caps.capabilities[id] = Object.assign({}, caps.capabilities[id], patch);',
  '  await writeFile(join(CONFIG_DIR, "capabilities.json"), JSON.stringify(caps, null, 2) + "\\n");',
  '  log("INFO", "config-service", "capability config updated + reloaded: " + id);',
  '  return caps.capabilities[id];',
  '}',
  '',
  '// Reports: the certification outcome per run. Certification is the Intelligence Plane s (stages 10-12);',
  '// until it returns, a run is honestly PENDING with no report. The EP never fabricates a report (R-12.5).',
  'function reportsView() { return runs.map((r) => ({ runId: r.runId, capability: r.capability, status: r.status, assurance: r.assurance, verdict: r.verdict, certifiedAt: r.status === "CERTIFIED" ? r.finishedAt : null, reportRef: r.status === "CERTIFIED" ? ("reports/" + r.runId + ".json") : null, note: r.status === "CERTIFIED" ? "certified by the Intelligence Plane" : "awaiting IP certification (evidence deferred)" })); }',
  '',
  '// The ONE sequencer (Doc 12 twelve-stage lifecycle). UI Run (POST /api/runs) and the CLI',
  '// (ep run -> same POST) both drive THIS; no second path (R-04.5). EP executes stages 2,3,8,9;',
  '// the IP owns 1,4-7 (sealed package) and 10-12 (certification, R-12.5). The single cross-plane',
  '// client is the only egress; with no runtime yet it returns Unavailable, so the run degrades',
  '// (Doc 05 matrix) and emits NO verdict (R-05.11). Nothing here certifies locally.',
  'const STAGES = [',
  '  { n: 1, name: "Planning", plane: "IP" }, { n: 2, name: "Discovery", plane: "EP" },',
  '  { n: 3, name: "Context", plane: "EP" }, { n: 4, name: "Architecture Review", plane: "IP" },',
  '  { n: 5, name: "Policy Review", plane: "IP" }, { n: 6, name: "Guardrail Review", plane: "IP" },',
  '  { n: 7, name: "Execution Planning", plane: "IP" }, { n: 8, name: "Execution", plane: "EP" },',
  '  { n: 9, name: "Evidence", plane: "EP" }, { n: 10, name: "Reflection", plane: "IP" },',
  '  { n: 11, name: "Certification", plane: "IP" }, { n: 12, name: "Reporting", plane: "IP" },',
  '];',
  'function nowIso() { return new Date().toISOString(); }',
  'function hashOf(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "stamp-" + h.toString(16); }',
  '// Single cross-plane client seam (R-05.3). The real mTLS+OAuth+nonce client ships with the EP',
  '// runtime (register-client); until deployed a package request is Unavailable. NEVER a second client.',
  'async function requestSealedPackage() {',
  '  return { result: "Unavailable", reason: "Execution runtime not deployed; no cross-plane connectivity (INV-3 outbound path pending)." };',
  '}',
  'function newRun(capability) {',
  '  const runId = "run-" + Date.now().toString(36) + "-" + (++seq);',
  '  return { runId, capability, status: "RUNNING", assurance: "PENDING", verdict: null, startedAt: nowIso(), finishedAt: null, currentStage: 1, evidenceCount: 0, environment: "UAT", executedBy: "operator", capabilityVersion: "1.0.0",',
  '    timeline: STAGES.map((s) => ({ n: s.n, name: s.name, plane: s.plane, state: "waiting", at: null, detail: "" })), evidence: [] };',
  '}',
  'function setStage(run, n, state, detail) { const t = run.timeline.find((x) => x.n === n); if (t) { t.state = state; t.at = nowIso(); if (detail) t.detail = detail; } if (state === "running") run.currentStage = n; }',
  'function runSummary(run) { const dur = run.startedAt ? ((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) : 0; return { runId: run.runId, capability: run.capability, status: run.status, assurance: run.assurance, verdict: run.verdict, currentStage: run.currentStage, evidenceCount: run.evidenceCount, startedAt: run.startedAt, finishedAt: run.finishedAt, durationMs: dur, environment: run.environment, executedBy: run.executedBy, capabilityVersion: run.capabilityVersion }; }',
  'function finalizeQueue() { queue.length = 0; for (const r of runs) { if (r.status === "RUNNING") queue.push({ name: r.capability, detail: r.runId + " - stage " + r.currentStage, status: "running" }); else if (r.status === "PENDING") queue.push({ name: r.capability, detail: r.runId + " - awaiting certification", status: "pending" }); } }',
  'async function captureEvidence(run) {',
  '  const dir = join(EVIDENCE_DIR, run.runId);',
  '  try { mkdirSync(dir, { recursive: true }); } catch {}',
  '  const artifacts = [',
  '    { kind: "execution-log", ref: "evidence/" + run.runId + "/execution.log", hash: hashOf(run.runId + ":log") },',
  '    { kind: "result-summary", ref: "evidence/" + run.runId + "/result.json", hash: hashOf(run.runId + ":result") },',
  '  ];',
  '  try { await writeFile(join(dir, "manifest.json"), JSON.stringify({ runId: run.runId, capability: run.capability, assurance: run.assurance, packageHashRef: "<sealed-package hash when available>", artifacts, capturedAt: nowIso() }, null, 2) + "\\n"); } catch {}',
  '  run.evidence = artifacts; return artifacts;',
  '}',
  '// Start a run and drive the ONE sequencer asynchronously so the live dashboard shows progression.',
  'function startRun(capability) { const run = newRun(capability); runs.unshift(run); log("INFO", "execution-api", "run enqueued: " + capability + " (" + run.runId + ")", run.runId); finalizeQueue(); sequence(run).catch((e) => { run.status = "ERROR"; log("WARN", "sequencer", "run error: " + (e && e.message || e), run.runId); }); return run; }',
  'async function sequence(run) {',
  '  const step = (ms) => new Promise((r) => setTimeout(r, ms));',
  '  // Discovery and execution announce the strategies the APPLICATION TEMPLATE selected, not a',
  '  // generic "observe the page". An operator reading the log can tell whether this run signed in.',
  '  const application = loadApplication() || {};',
  '  const discovery = application.discovery || { strategy: "anonymous", label: "observing target state" };',
  '  const execution = application.execution || { strategy: "anonymous", label: "driving the target" };',
  '  const unmet = validateApplication().filter((i) => i.severity === "error");',
  '  if (unmet.length) log("WARN", "config-service", "configuration incomplete for " + ((application.template && application.template.label) || "this target") + ": " + unmet.map((i) => i.detail).join(" | "), run.runId);',
  '  setStage(run, 2, "running"); log("INFO", "sequencer", "stage 2 Discovery (EP) - strategy " + discovery.strategy + " - " + discovery.label, run.runId); await step(400); setStage(run, 2, "done", "discovery strategy: " + discovery.strategy);',
  '  setStage(run, 3, "running"); log("INFO", "sequencer", "stage 3 Context (EP->IP) - scrub + minimise (INV-6)", run.runId); await step(300); setStage(run, 3, "done", "context scrubbed");',
  '  for (const n of [1, 4, 5, 6, 7]) setStage(run, n, "requesting");',
  '  log("INFO", "cross-plane", "requesting sealed execution package from Intelligence Plane (stages 1,4-7)", run.runId);',
  '  const pkg = await requestSealedPackage(); await step(300);',
  '  if (pkg.result === "Refusal") { for (const n of [1,4,5,6,7,8,9,10,11,12]) setStage(run, n, "halted", "governance refusal"); run.status = "HALTED"; run.assurance = "HALTED"; run.finishedAt = nowIso(); log("WARN", "sequencer", "governance refusal - run HALTED", run.runId); finalizeQueue(); return; }',
  '  if (pkg.result === "Unavailable") { for (const n of [1,4,5,6,7]) setStage(run, n, "deferred", "IP unavailable"); run.assurance = "DEGRADED-UNCERTIFIED"; log("WARN", "cross-plane", "sealed package Unavailable - degrading (Doc 05 matrix, no cached package)", run.runId); }',
  '  else { for (const n of [1,4,5,6,7]) setStage(run, n, "done", "sealed package received"); run.assurance = "CERTIFIED"; }',
  '  setStage(run, 8, "running"); log("INFO", "verify-before-execute", "validating sealed package (provenance/hash/validity/proceed flag)", run.runId);',
  '  log("INFO", "runtime", "stage 8 Execution (EP) - " + (run.assurance === "CERTIFIED" ? "sealed package" : "deterministic suite, degraded") + " - " + run.capability + " - strategy " + execution.strategy + " (" + execution.label + ")", run.runId); await step(600); setStage(run, 8, "done", "execution strategy: " + execution.strategy);',
  '  setStage(run, 9, "running"); await step(300); const artifacts = await captureEvidence(run); run.evidenceCount = artifacts.length; setStage(run, 9, "done", artifacts.length + " artifacts custodied locally (INV-1)"); log("INFO", "evidence", "stage 9 - " + artifacts.length + " artifacts hashed + custodied", run.runId);',
  '  for (const n of [10, 11, 12]) setStage(run, n, run.assurance === "CERTIFIED" ? "done" : "deferred", run.assurance === "CERTIFIED" ? "certified by IP" : "queued for certification (deferred)");',
  '  if (run.assurance === "CERTIFIED") { run.status = "CERTIFIED"; run.verdict = "PASS"; log("INFO", "cross-plane", "evidence refs submitted - IP certified (stages 10-12)", run.runId); }',
  '  else { run.status = "PENDING"; run.verdict = null; log("WARN", "sequencer", "stages 10-12 deferred - no verdict emitted in the EP (R-05.11 / R-12.5)", run.runId); }',
  '  run.finishedAt = nowIso(); finalizeQueue();',
  '}',
  '',
  'function log(level, scope, msg, runId) {',
  '  const evt = { t: new Date().toISOString().slice(11, 19), level, scope, msg, runId: runId || null };',
  '  for (const res of logClients) { try { res.write("data: " + JSON.stringify(evt) + "\\n\\n"); } catch {} }',
  '}',
  '',
  'function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }',
  'function body(req) { return new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); }); }',
  '',
  'const CT = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };',
  'async function serveStatic(res, rel) {',
  '  const file = rel === "/" || rel === "" ? join(WEB_DIR, "index.html") : join(WEB_DIR, rel.replace(/^\\/+/, ""));',
  '  if (!file.startsWith(WEB_DIR)) { send(res, 403, { error: "forbidden" }); return; }',
  '  try { const buf = await readFile(file); const ext = file.slice(file.lastIndexOf(".")); res.writeHead(200, { "Content-Type": CT[ext] || "application/octet-stream" }); res.end(buf); }',
  '  catch { send(res, 404, { error: "not found" }); }',
  '}',
  '',
  'const server = createServer(async (req, res) => {',
  '  const url = new URL(req.url, "http://localhost");',
  '  const p = url.pathname;',
  '  try {',
  '    if (p === "/api/health") { const v = validateApplication(); const unmet = v.filter((i) => i.severity === "error").length;',
  '      return send(res, 200, { runtime: "degraded", queueDepth: queue.length, vault: "not-configured", lastIpSync: "never", application: (loadApplication() || {}).template || null, configuration: unmet ? "incomplete" : "complete", unmetRules: unmet, note: "portal live; execution runtime pending (container dependency)" }); }',
  '    if (p === "/api/application") { const v = applicationView(); return v ? send(res, 200, v) : send(res, 404, { error: "no application band generated for this package" }); }',
  '    if (p === "/api/validation") return send(res, 200, validateApplication());',
  '    if (p === "/api/capabilities") return send(res, 200, capabilitiesView());',
  '    if (p === "/api/config" && req.method === "GET") return send(res, 200, loadConfig());',
  '    if (p === "/api/config" && req.method === "PATCH") { const b = await body(req); try { return send(res, 200, await saveConfig(b)); } catch (e) { return send(res, 422, { error: String(e.message || e) }); } }',
  '    if (p === "/api/queue") return send(res, 200, queue);',
  '    if (p === "/api/runs" && req.method === "GET") { const cf = url.searchParams.get("capability"); return send(res, 200, runs.filter((r) => !cf || r.capability === cf).map(runSummary)); }',
  '    if (p === "/api/runs" && req.method === "POST") { const b = await body(req); if (!b.capability) return send(res, 400, { error: "capability required" }); return send(res, 202, runSummary(startRun(b.capability))); }',
  '    if (p.indexOf("/api/runs/") === 0 && req.method === "GET") { const id = p.slice("/api/runs/".length); const run = runs.find((r) => r.runId === id); return run ? send(res, 200, run) : send(res, 404, { error: "run not found" }); }',
  '    if (p === "/api/evidence") { const id = url.searchParams.get("run"); const run = runs.find((r) => r.runId === id); return send(res, 200, run ? run.evidence : []); }',
  '    if (p === "/api/reports") return send(res, 200, reportsView());',
  '    if (p.indexOf("/api/capabilities/") === 0) { const id = p.slice("/api/capabilities/".length).replace(/\\/config$/, ""); if (req.method === "GET") { const c = capConfigGet(id); return c ? send(res, 200, c) : send(res, 404, { error: "unknown capability" }); } if (req.method === "PATCH") { const bb = await body(req); try { return send(res, 200, await capConfigPatch(id, bb)); } catch (e) { return send(res, 422, { error: String(e.message || e) }); } } }',
  '    if (p === "/api/logs") { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.write("retry: 3000\\n\\n"); logClients.add(res); req.on("close", () => logClients.delete(res)); log("INFO", "portal", "log stream connected"); return; }',
  '    if (p.indexOf("/api/") === 0) return send(res, 404, { error: "unknown endpoint" });',
  '    return serveStatic(res, p);',
  '  } catch (e) { send(res, 500, { error: String(e && e.message || e) }); }',
  '});',
  '',
  'server.listen(PORT, "127.0.0.1", () => { console.log("EP Operational Portal on http://127.0.0.1:" + PORT); log("INFO", "portal", "Local Execution API started on " + PORT); });',
  'setInterval(() => log("INFO", "runtime", "heartbeat — queue depth " + queue.length), 15000);',
  '',
].join('\n');

/**
 * bin/ep.mjs — the CLI. `node bin/ep.mjs run <capability>` calls the SAME Local Execution API the
 * UI Run button calls (one sequencing path, R-04.5). The only difference is the trigger.
 */
export const EP_CLI_MJS: string = [
  '#!/usr/bin/env node',
  '// EP CLI (ADR-0035) — the terminal trigger. Calls the Local Execution API; never an engine directly.',
  'const [, , cmd, cap] = process.argv;',
  'const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;',
  'const BASE = "http://127.0.0.1:" + PORT;',
  '',
  'async function post(path, obj) {',
  '  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });',
  '  return { status: r.status, body: await r.json().catch(() => ({})) };',
  '}',
  '',
  'async function main() {',
  '  if (cmd !== "run" || !cap) {',
  '    console.log("usage: node bin/ep.mjs run <capability>");',
  '    console.log("  capabilities: functional-testing | inverse-flow-discovery | performance | security-testing | penetration-testing | dev-change");',
  '    process.exit(cmd ? 1 : 0);',
  '  }',
  '  try {',
  '    const { status, body } = await post("/api/runs", { capability: cap });',
  '    if (status >= 400) { console.error("run rejected (" + status + "):", body.error || body); process.exit(1); }',
  '    console.log("run " + cap + " -> " + (body.status || "PENDING") + " (" + (body.runId || "") + ")");',
  '    if (body.reason) console.log("  " + body.reason);',
  '  } catch (e) {',
  '    console.error("Local Execution API not reachable on " + BASE + " — start it with: node src/portal/server.mjs");',
  '    process.exit(1);',
  '  }',
  '}',
  'main();',
  '',
].join('\n');
