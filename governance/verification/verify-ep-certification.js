'use strict';
/**
 * GOVERNANCE — Execution-Plane certification verification (EDR-4).
 * ============================================================================
 * The Intelligence Plane VERIFIES a signed Execution-Plane certification; it does NOT
 * execute browser automation. The browser, and its artefacts, stay in the Execution Plane
 * (sovereign split). What crosses is a signed package of references, hashes, a verdict and
 * governance metadata — verified here against the EP's public trust anchor.
 *
 * This gate reads ONLY Intelligence-Plane-local files: the received certification
 * (governance/ep-received/) and the EP public key held from registration
 * (governance/ep-trust/). It never reads across the plane boundary.
 *
 * IT VERIFIES, IT DOES NOT TRUST. A tampered payload (hash mismatch), a forged signature,
 * a certification carrying artefact CONTENT, a missing verdict or a failed governance
 * result is rejected. No browser dependency is introduced into the Intelligence Plane.
 *
 * Run:  node governance/verification/verify-ep-certification.js
 * Exit: 0 = the EP certification is valid and trustworthy   1 = rejected
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const CERT = path.join(ROOT, 'governance', 'ep-received', 'ep-certification.json');
// The trust anchor is JSON-wrapped (public key inside a field), not a bare .pem — a stray
// .pem/.key in the repository trips the non-retention scan (E-5), and a PUBLIC key is not a
// secret but the scan is filename-based. The wrapping keeps the anchor auditable and clean.
const TRUST = path.join(ROOT, 'governance', 'ep-trust', 'ep-cert-trust.json');

let failures = 0;
const line = (s) => console.log(s);
const check = (label, cond, detail) => {
  line(`  ${cond ? 'PASS ' : 'FAIL '} ${label}`);
  if (detail) line(`         ${detail}`);
  if (!cond) failures++;
  return cond;
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

line('');
line('GOVERNANCE — Execution-Plane certification verification (EDR-4)');
line('='.repeat(74));

line('\n1. Inputs (Intelligence-Plane-local only)');
const haveCert = fs.existsSync(CERT);
const haveKey = fs.existsSync(TRUST);
check('a received EP certification package exists', haveCert, haveCert ? 'governance/ep-received/ep-certification.json' : 'absent');
check('the EP public trust anchor exists', haveKey, haveKey ? 'governance/ep-trust/ep-cert-trust.json' : 'absent (register the EP)');
if (!haveCert || !haveKey) {
  line('\n' + '='.repeat(74));
  line('RESULT: FAIL — EP certification cannot be verified.');
  process.exit(1);
}

let cert = null;
try { cert = JSON.parse(fs.readFileSync(CERT, 'utf8')); } catch { cert = null; }
if (!check('the certification package parses', cert !== null && typeof cert === 'object')) {
  line('\nRESULT: FAIL — unparseable certification.'); process.exit(1);
}
let trust = null;
try { trust = JSON.parse(fs.readFileSync(TRUST, 'utf8')); } catch { trust = null; }
const publicKeyPem = trust && typeof trust.publicKeyPem === 'string' ? trust.publicKeyPem : '';
check('the trust anchor carries a public key', publicKeyPem.includes('PUBLIC KEY'), trust && trust.keyId ? `keyId ${trust.keyId}` : 'malformed trust anchor');

line('\n2. Cryptographic verification');
const payload = cert.payload;
const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
// (a) content hash binds the signature to THIS payload — a tampered payload fails here.
check('content hash matches the payload (not tampered)', typeof cert.contentHash === 'string' && sha256(bytes) === cert.contentHash,
  sha256(bytes) === cert.contentHash ? `sha256 ${String(cert.contentHash).slice(0, 16)}…` : 'HASH MISMATCH — payload altered after signing');
// (b) ed25519 signature verifies against the EP trust anchor — a forged signature fails here.
let sigOk = false;
try { sigOk = cert.algorithm === 'ed25519' && crypto.verify(null, bytes, publicKeyPem, Buffer.from(String(cert.signature), 'base64')); } catch { sigOk = false; }
check('ed25519 signature verifies against the EP trust anchor', sigOk, sigOk ? `keyId ${cert.keyId}` : 'SIGNATURE INVALID — not signed by the trusted EP key');

line('\n3. Certification & evidence contract');
check('the package declares the Execution Plane', payload && payload.plane === 'execution', payload && payload.plane);
check('a contract version is present', payload && typeof payload.contractVersion === 'string' && payload.contractVersion.length > 0, payload && payload.contractVersion);
check('a verdict is present and CERTIFIED', payload && payload.verdict === 'CERTIFIED', payload && payload.verdict);
const results = (payload && payload.governanceResults) || [];
check('every EP governance result passed', results.length > 0 && results.every((r) => r.ok === true),
  `${results.filter((r) => r && r.ok).length}/${results.length} governance checks`);
const refs = (payload && payload.evidenceReferences) || [];
// The contract: references + hashes only. A certification carrying artefact CONTENT is a
// sovereignty breach and is rejected here, structurally.
const refsClean = refs.length > 0 && refs.every((r) => r && typeof r.sha256 === 'string' && typeof r.locator === 'string' && !('content' in r));
check('evidence references are hash+locator only — NO artefact content crossed', refsClean,
  refsClean ? `${refs.length} references, all hash-only` : 'a reference carried content, or a hash/locator was missing');

// Evidence artifact — what the IP verified (not the browser, the certification).
const evidence = {
  evidenceId: 'ep-certification-verification',
  generator: 'governance/verification/verify-ep-certification.js',
  generatorVersion: '1.0.0',
  executionContext: `node ${process.version} on ${process.platform}`,
  repository: 'DBiz_IntelligencePlane',
  edrReference: ['EDR-3', 'EDR-4'],
  ruleReference: ['INV-2', 'INV-3', 'R-04.11', 'R-05.3'],
  verifiedCertificationId: payload && payload.certificationId,
  verifiedExecutionId: payload && payload.executionId,
  signatureVerified: sigOk,
  evidenceReferenceCount: refs.length,
  verificationStatus: failures === 0 ? 'verified' : 'rejected',
  timestamp: new Date().toISOString(),
};
fs.writeFileSync(path.join(ROOT, 'governance', 'ep-received', 'ep-certification-verification-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');

line('\n' + '='.repeat(74));
if (failures === 0) {
  line('RESULT: PASS — the Execution-Plane certification is valid, signed and contract-compliant.');
  line('The Intelligence Plane verified certification, not browser execution.');
} else {
  line(`RESULT: FAIL — ${failures} check(s) rejected the EP certification.`);
}
line('');
process.exit(failures === 0 ? 0 : 1);
