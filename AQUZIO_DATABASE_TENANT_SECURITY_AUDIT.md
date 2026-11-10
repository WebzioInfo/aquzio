# AQUZIO DATABASE & TENANT SECURITY AUDIT
## Multi-Tenant Isolation & Cryptographic Protection Analysis
**Target Database:** Supabase PostgreSQL (`aws-1-ap-northeast-2.pooler.supabase.com`)  
**Auditor:** Principal Database Architect & Application Security Engineer  

---

## 1. Tenant Isolation Architecture

### 1.1. Schema-Per-Tenant Model
Aquzio uses dedicated PostgreSQL schemas per company rather than shared tables with tenant discriminators:
* `public`: Houses the master registry `public.Tenants` and global audit logs.
* `aquora_tenant_<company>`: Dedicated schema per company containing tables:
  * `RawMaterials`
  * `Products`
  * `InventoryMovements`
  * `Companies`
  * `Purchases`

### 1.2. Cross-Tenant Protection Guarantee
* **Zero Cross-Talk:** Because queries execute against the resolved PostgreSQL schema for the authenticated tenant, an adjustment targeted at Tenant A (`aquora_tenant_accountant_company`) cannot physically read or modify tables in Tenant B (`aquora_tenant_sinan_company`).
* **Feature Toggle Barrier:** The API rejects any request if `public.Tenants.IsBiodropsProduction == false`.

---

## 2. API Key Security & Constant-Time Verification
* **Secret Handling:** Keys are retrieved from server environment variables (`Integration__Biodrops__ApiKey`).
* **Timing-Attack Resistance:** Validated using `CryptographicOperations.FixedTimeEquals` to prevent timing analysis.
* **Revocation List:** SHA-256 fingerprint hash matching against `Integration:Biodrops:RevokedKeys`. Revoked keys return HTTP 403 Forbidden.
* **Header Support:** Supports `X-API-Key: <key>` and `Authorization: Bearer <key>`.

---

## 3. Data Integrity & Concurrency Controls
1. **Authoritative Clock:** The server clock (`DateTime.UtcNow`) and PostgreSQL `NOW()` timestamps are strictly used.
2. **Authoritative Balance Calculation:** Client-supplied balances are discarded. The database computes `previousBalance ± quantity`.
3. **Atomic Single-Transaction Execution:** Inventory balance update and `InventoryMovement` insertion are committed together. If movement creation fails, the stock change rolls back.
4. **Persistent Idempotency:** Managed via `PlatformAuditLogs` with key `EDROPS_IDEMPOTENCY`. Duplicate requests return the original committed state.
