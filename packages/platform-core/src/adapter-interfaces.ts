/**
 * Execution adapter interface catalogue — the classes of runner an Execution Plane can bind.
 *
 * TRACEABILITY
 *   Architecture : 11-capability-model.md (R-11.11 adapter interface, R-11.13 no capability without
 *                  a bound runner) · 14-tool-operating-model.md (R-14.14/15 capability-named,
 *                  never vendor-named)
 *
 * INTERFACES ARE CAPABILITY-NAMED, NEVER TOOL-NAMED (R-14.14). `I2-browser` is a CLASS of runner;
 * which product implements it is a tenant decision made at the Execution Plane, not a platform
 * default baked into a package. That is what keeps the platform tool-agnostic: the generator can
 * state that a browser-class runner is required without naming one.
 *
 * This catalogue is PLATFORM metadata, not application metadata. Application Templates reference
 * interface ids from it; they never define their own, so a new template cannot smuggle in a
 * runner class with no credential policy or timeout. Adding an interface here is a platform
 * decision; referencing one is a template decision.
 */

export interface AdapterInterfaceDefinition {
  readonly id: string;
  readonly label: string;
  /** Env var carrying the adapter's own credential, when the class needs one. Name only (INV-2). */
  readonly credentialEnv?: string;
  readonly timeoutSeconds: number;
  /** Human-readable note emitted beside the `.env` slot. */
  readonly credentialComment?: string;
}

/**
 * The catalogue, keyed by interface id. I2–I7 are the classes the six certifiable capabilities
 * drive; I8/I9 are the endpoint classes an application template may require (a desktop binary or
 * a mobile device) and which no capability selects on its own.
 */
export const ADAPTER_INTERFACES: Readonly<Record<string, AdapterInterfaceDefinition>> = {
  'I2-browser': { id: 'I2-browser', label: 'Browser automation', timeoutSeconds: 300 },
  'I3-api': { id: 'I3-api', label: 'HTTP/API automation', credentialEnv: 'API_ADAPTER_TOKEN', timeoutSeconds: 120, credentialComment: 'I3 API adapter credential' },
  'I4-load-generation': { id: 'I4-load-generation', label: 'Load generation', timeoutSeconds: 300 },
  'I5-security-scan': { id: 'I5-security-scan', label: 'Security scanning', credentialEnv: 'SECURITY_SCAN_TOKEN', timeoutSeconds: 1800, credentialComment: 'I5 security-scan adapter credential' },
  'I6-penetration': { id: 'I6-penetration', label: 'Penetration tooling', credentialEnv: 'PEN_TOOL_TOKEN', timeoutSeconds: 3600, credentialComment: 'I6 penetration-tooling credential' },
  'I7-source-control': { id: 'I7-source-control', label: 'Source control', credentialEnv: 'SCM_TOKEN', timeoutSeconds: 600, credentialComment: 'source-control credential' },
  'I8-desktop-ui': { id: 'I8-desktop-ui', label: 'Desktop UI automation', timeoutSeconds: 600 },
  'I9-mobile-device': { id: 'I9-mobile-device', label: 'Mobile device / emulator', credentialEnv: 'MOBILE_DEVICE_TOKEN', timeoutSeconds: 900, credentialComment: 'I9 mobile device-farm credential' },
};

/** Lookup with an explicit failure — an unknown interface is a runner the EP cannot bind (R-11.13). */
export function adapterInterface(id: string): AdapterInterfaceDefinition {
  const def = ADAPTER_INTERFACES[id];
  if (!def) throw new Error(`unknown execution adapter interface "${id}"`);
  return def;
}

/** Every interface id, sorted — deterministic input to generation (C-03.18). */
export const ADAPTER_INTERFACE_IDS: readonly string[] = Object.keys(ADAPTER_INTERFACES).sort();
