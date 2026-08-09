# ADR-0008 — Encryption at Rest and Key Ownership

**Status:** ACCEPTED · **Date:** 2026-07-22 · **Closes:** AD-019
**Retrospective:** decision taken in M1.3; regularised under D-001

---

## 1. Problem

Data at rest spans two tenancies under two owners. Which data is encrypted, and — the question that actually matters — **who holds the keys**?

## 2. Context

- The sovereign split exists so customer data does not become DBiz-accessible. Storage location alone does not achieve that: **whoever holds the keys holds the data**, wherever the bytes sit.
- Customer tenancies hold C1, C2, C3 and evidence. DBiz holds C4 decisions and C5 operational data ([06](../architecture/06-data-sovereignty.md)).
- Tenants may declare residency regions (R-06.7).
- Key rotation must not require data migration or downtime, at hundreds of customers.

## 3. Alternatives

| Option | Assessment |
|---|---|
| **DBiz holds all keys** | Operationally simplest. **Rejected**: it makes customer data functionally DBiz-accessible wherever it is stored, reducing the split to a topology detail rather than a sovereignty guarantee. |
| **Customer holds all keys, including for decisions** | Maximally sovereign. **Rejected**: DBiz could not read its own decision records, making platform-level certification, support and audit impossible — and a customer could render DBiz's audit trail unreadable. |
| **Split by data ownership** | **Selected.** Keys follow the tenancy that owns the data. |
| **No encryption at rest, relying on tenancy isolation** | Rejected: fails every enterprise procurement baseline and offers nothing against storage-layer compromise or misconfigured backups. |

## 4. Decision

| Data | Encrypted at rest | Keys held by |
|---|---|---|
| C1 customer content | Yes | **Customer** |
| C2 customer secrets | Yes | **Customer** |
| C3 customer metadata (in customer tenancy) | Yes | **Customer** |
| Evidence | Yes | **Customer** |
| C4 decisions and hashes | Yes | DBiz, scoped per residency region |
| C5 operational data | Yes | DBiz, scoped per residency region |

- **DBiz SHALL NOT hold keys to customer-tenancy data** (R-08.23).
- All data is encrypted **in transit** across every trust boundary (R-08.22).
- Rotation SHALL be supported **without data migration and without downtime** (R-08.25).
- C3 held ephemerally in the Intelligence Plane is never persisted, so the question does not arise ([ADR-0006](ADR-0006-retention-model.md)).

**This is the encryption expression of sovereignty.** The split's promise is not "your data is stored in your tenancy" — it is "your data is not accessible to DBiz." Only key ownership delivers the second, and the first without the second is theatre.

## 5. Consequences

**Positive.** Customer data is cryptographically inaccessible to DBiz, including to a DBiz insider and to an attacker who compromises DBiz entirely; a compromised Intelligence Plane yields judgments and hashes but no customer content; residency scoping is enforceable at the key layer.

**Negative, accepted.** DBiz cannot assist with customer-side data recovery — **key loss in a customer tenancy means evidence loss**, and this must be stated in onboarding rather than discovered during an incident. Customers carry key-management responsibility, which is a real operational burden and a genuine adoption barrier for less mature organisations. Cross-tenancy debugging is harder by construction, which is the intended trade.

**Explicitly prohibited.** Any escrow, recovery key, or break-glass mechanism giving DBiz access to customer-tenancy data. Such a mechanism would negate this decision entirely, and its existence — not its use — is the violation.

## 6. Migration strategy

None required — taken before any data exists.

**Key rotation** is routine: encrypt new data under the new key; retain the previous key for decryption within its retention window; re-encrypt lazily or on access; retire the old key once no data under it remains. **No migration, no downtime.**

**Should a customer need to change key custodian** (for example, migrating key management providers), the migration is customer-side and DBiz is not a participant — which is the correct consequence of DBiz not holding the keys.

**Reversal is not available in practice.** Data encrypted under customer keys cannot be brought under DBiz keys without the customer performing the re-encryption. This asymmetry is deliberate: it means the sovereignty guarantee cannot be quietly withdrawn later.

## 7. Version impact

No contract version change: encryption is a storage property, not a contract property. Nothing about the wire format changes, because payloads are encrypted at rest, not in the contract.

**Forward obligation.** Each new store declares its data class, and its class determines key custody. A store cannot be registered without declaring its class ([ADR-0006](ADR-0006-retention-model.md)), so key custody is decided at registration rather than discovered later.

## 8. Affected components

[08](../architecture/08-security-model.md) §7 (owning document) · [06](../architecture/06-data-sovereignty.md) (classification determines custody) · [21](../architecture/21-tenant-lifecycle.md) §4 (customer key provisioning at onboarding) · [17](../architecture/17-deployment-topology.md) (key management behind a platform interface, not a cloud primitive) · [22](../architecture/22-security-threat-model.md) §3.1 (path P-04) · every store in both planes.
