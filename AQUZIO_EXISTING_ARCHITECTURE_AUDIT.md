# AQUZIO EXISTING ARCHITECTURE AUDIT
## Real-World Technical Audit for eDrops × Aquzio Production Stock Integration
**Audit Conducted By:** Principal Software Architect, Senior Backend Engineer, PostgreSQL/Supabase Specialist  
**Target Repository:** `/home/user/murshid/aquzio`  
**Database Host:** Supabase PostgreSQL (`aws-1-ap-northeast-2.pooler.supabase.com`)  
**Status:** COMPLETE & VERIFIED AGAINST LIVE DATABASE  

---

## 1. Executive Summary & Verification Methodology
This audit was conducted strictly against the actual source code, entity mappings, API controllers, and the live production Supabase PostgreSQL database of **Aquzio** (formerly Aquora). 

Every architectural claim in this report has been verified by querying the live database catalog (`information_schema`, `public.Tenants`, `aquora_tenant_accountant_company`, and `aquora_tenant_sinan_company`).

### Key Discovery: Live Screenshot Match
The movement row shown in the Aquzio web UI screenshot (`aquzio.webziotech.in/company/inventory?tab=raw_materials`) for **Sinan Company** was located directly in the database:
* **Table:** `aquora_tenant_sinan_company."InventoryMovements"`
* **RawMaterialId:** `9eb84ae3-eda2-466a-845b-21642200c1e5` (`bottle`)
* **Quantity:** `-10.0`
* **BalanceAfter:** `90.0 KG`
* **ReferenceType:** `ProductionEntry`
* **Notes:** `Production usage: 10 PIECE (Wastage recorded: 10 PCS) | Batch: bbb`
* **CreatedAt:** `2026-10-21 08:59:22.653 UTC`
* **CreatedBy:** `585ea1ca-0008-49c4-8a84-54ab9061075d` (Mapped to Operator **Shibal**)

---

## 2. Actual Backend Architecture
* **Language & Runtime:** C# / .NET 10 (`net10.0`), ASP.NET Core Web API.
* **Architecture Pattern:** Clean Architecture with Domain-Driven Design (DDD):
  * `Aquora.Domain`: Entities, Value Objects, Domain Enums, Multi-tenant abstractions (`IMultiTenant`, `ICompanySpecific`).
  * `Aquora.Application`: Commands, Queries, Application Services (`BiodropsIntegrationService`, `InventoryMovementService`, `BiodropsIntegrationAuthService`), DTOs.
  * `Aquora.Persistence`: Entity Framework Core (`PlatformDbContext`, `TenantDbContext`), PostgreSQL Migrations.
  * `Aquora.Infrastructure`: Supabase integration, external adapters, file storage.
  * `Aquora.API`: ASP.NET Core Controllers, Custom Action Filters (`BiodropsApiKeyAuthFilter`), Rate Limiting, OpenAPI/Swagger.
  * `Aquora.Tests`: XUnit test suite with EF Core in-memory isolation.

---

## 3. Actual Database & Multi-Tenant Architecture
### Multi-Tenant Strategy: Schema-Per-Tenant Isolation
Aquzio does **not** use naive shared tables with tenant filter clauses, nor separate physical databases. It employs a **strict PostgreSQL Schema-Per-Tenant isolation model**:

1. **Platform Catalog (`public` Schema):**
   * Stores global registries: `public.Tenants`, `public.Users`, `public.PlatformAuditLogs`.
   * Key columns in `public."Tenants"`:
     * `Id` (UUID, Primary Key)
     * `Name` (e.g., `'Faiha Water Solutions'`, `'Sinan Company'`)
     * `Code` (e.g., `'ACCOUNTANT_COMPANY'`, `'SINAN_COMPANY'`)
     * `SchemaName` (e.g., `'aquora_tenant_accountant_company'`, `'aquora_tenant_sinan_company'`)
     * `IsActive` (Boolean)
     * `IsBiodropsProduction` (Boolean feature toggle flag)

2. **Tenant-Specific Schemas (`aquora_tenant_<company_code>`):**
   * Each registered company has an entirely separate PostgreSQL schema containing:
     * `RawMaterials`
     * `Products`
     * `InventoryMovements`
     * `Companies`
     * `Purchases`, `PurchaseItems`
     * `SalesTransactions`, `Operations`
   * Tenant isolation is enforced at the database connection / search path level via `ITenantProvider` and `TenantDbContext.OnModelCreating(modelBuilder => modelBuilder.HasDefaultSchema(SchemaName))`.

### Verified Live Tenants in Catalog:
| Tenant Name | Tenant ID | Schema Name | IsBiodropsProduction | Status in eDrops |
|---|---|---|---|---|
| Faiha Water Solutions | `8714038a-36b0-4521-8b5e-9389ad045a65` | `aquora_tenant_accountant_company` | `true` | Exposed & Active |
| Greenway Manufactures | `35477107-72fc-447f-9f0a-00610529244d` | `aquora_tenant_greenway_manufactures` | `true` | Exposed & Active |
| Gangothri Aqua | `7cde4eab-7c29-4a2c-87cd-579071887701` | `aquora_tenant_gangothri_2` | `true` | Exposed & Active |
| Greenmount Aquaa | `3475f7bd-7f3e-423c-9048-47e6765a6d76` | `aquora_tenant_greenmount_aquaa_2` | `true` | Exposed & Active |
| Sinan Company | `7d77da44-5307-489c-b474-bf9cdc6137ee` | `aquora_tenant_sinan_company` | `false` | Excluded (Toggle Off) |
| Testing the ui | `84774288-8791-4200-85ff-5101adfb41a3` | `aquora_tenant_testing_the_ui` | `false` | Excluded (Toggle Off) |

> **Audit Insight:** Sinan Company currently has `IsBiodropsProduction = false`. This explains why only Faiha Water Solutions appeared in the eDrops plant dropdown. To expose Sinan Company to eDrops, `IsBiodropsProduction` must be toggled to `true`.

---

## 4. Existing Inventory & Stock Movement Schema
### 4.1. Table: `RawMaterials` (in Tenant Schema)
* `Id` (`uuid`, PK)
* `Name` (`text`, NOT NULL)
* `Code` (`text`, NOT NULL)
* `Category` (`text`, NOT NULL - e.g. `'PREFORM'`, `'CAP'`, `'LABEL'`, `'SHRINK_FILM'`)
* `Unit` (`text`, NOT NULL - e.g. `'LITER'`, `'KG'`, `'BOX'`, `'PIECE'`)
* `CurrentStock` (`numeric`, NOT NULL)
* `CostPerUnit` (`numeric`, NOT NULL)
* `TenantId` (`uuid`, NOT NULL)
* `CompanyId` (`uuid`, NOT NULL)
* `IsActive` (`boolean`, NOT NULL)
* `IsDeleted` (`boolean`, NOT NULL)

### 4.2. Table: `Products` (in Tenant Schema)
* `Id` (`uuid`, PK)
* `Name` (`text`, NOT NULL)
* `SKU` (`text`, Nullable)
* `Category` (`text`, NOT NULL - e.g. `'Jar'`, `'Bottle'`)
* `CurrentStock` (`numeric`, NOT NULL)
* `TenantId` (`uuid`, NOT NULL)
* `CompanyId` (`uuid`, NOT NULL)
* `IsActive` (`boolean`, NOT NULL)
* `IsDeleted` (`boolean`, NOT NULL)

### 4.3. Table: `InventoryMovements` (in Tenant Schema)
* `Id` (`uuid`, PK)
* `RawMaterialId` (`uuid`, Nullable - points to `RawMaterials.Id`)
* `ProductId` (`uuid`, Nullable - points to `Products.Id`)
* `InventoryType` (`text`, NOT NULL - `'RawMaterial'` or `'FinishedProduct'`)
* `Quantity` (`numeric`, NOT NULL - positive for additions, negative for deductions)
* `BalanceAfter` (`numeric`, NOT NULL - running balance calculated at time of movement)
* `ReferenceType` (`text`, NOT NULL - e.g. `'ProductionEntry'`, `'SalesTransaction'`, `'EDROPS_ADJUSTMENT'`)
* `ReferenceId` (`uuid`, NOT NULL - originating transaction ID)
* `Notes` (`text`, Nullable - displayed under the badge in Movement History UI)
* `TenantId` (`uuid`, NOT NULL)
* `CompanyId` (`uuid`, NOT NULL)
* `CreatedAt` (`timestamp with time zone`, NOT NULL)
* `CreatedBy` (`text`, NOT NULL - operator user ID, `'System'`, or asserted name)
* `IsDeleted` (`boolean`, NOT NULL DEFAULT false)

---

## 5. Existing Stock Movement Business Logic
Stock movements are recorded via `IInventoryMovementService` (`Aquora.Application/Services/InventoryMovementService.cs`):
```csharp
public async Task<InventoryMovement> RecordRawMaterialMovementAsync(
    ITenantDbContext context,
    Guid rawMaterialId,
    decimal quantity,
    string referenceType,
    Guid referenceId,
    string? notes,
    Guid tenantId,
    Guid companyId,
    string createdBy,
    bool allowNegativeStock = false)
{
    var material = await context.RawMaterials.FirstOrDefaultAsync(rm => rm.Id == rawMaterialId && !rm.IsDeleted);
    decimal previousBalance = material.CurrentStock;
    decimal newStock = previousBalance + quantity;
    if (newStock < 0 && !allowNegativeStock && referenceType != "ProductionEntry")
        throw new InvalidOperationException($"Insufficient stock for raw material '{material.Name}'.");
    
    material.CurrentStock = newStock;
    var movement = new InventoryMovement { ... BalanceAfter = newStock, ... };
    context.InventoryMovements.Add(movement);
    return movement;
}
```

### UI Movement History Presentation
In `frontend/src/modules/inventory/InventoryPage.tsx`:
1. **Badge:** Mapped from `referenceType` via `MOVEMENT_TYPE_MAP`.
2. **Notes:** Rendered directly below the badge in italics (`m.notes`).
3. **Quantity:** Rendered with `+` in green or `−` in red with unit.
4. **Balance After:** Rendered in bold tabular numbers (`m.balanceAfter`).
5. **Operator:** Renders user avatar initials and `m.operatorName`. If `CreatedBy` is text (e.g. `'eDrops System (Staff: Murshid)'`), the backend `RawMaterialsController.GetMovements` passes it directly through to `operatorName`!

---

## 6. Existing Server-to-Server Authentication
Authentication for external integration endpoints is implemented in `Aquora.API/Authorization/BiodropsApiKeyAuthFilter.cs` and `Aquora.Application/Services/BiodropsIntegrationAuthService.cs`:
1. **API Key Transport:** Accepted via `X-API-Key: <key>` header or `Authorization: Bearer <key>`.
2. **Security:** Evaluated using constant-time byte comparison (`CryptographicOperations.FixedTimeEquals`).
3. **Key Storage:** Server environment variable `Integration__Biodrops__ApiKey` or secondary key `Integration__Biodrops__SecondaryApiKey`.
4. **Revocation:** SHA-256 fingerprint blacklist matching against `Integration__Biodrops__RevokedKeys`.
5. **Rate Limiting:** Dedicated ASP.NET Core rate limiting policy `BiodropsIntegrationPolicy`.

---

## 7. Existing Integration Read Endpoints
The following read-only integration endpoints are fully operational in `BiodropsIntegrationController.cs`:
1. `GET /api/v1/integrations/biodrops/tenants`
   * Returns list of tenants where `IsActive == true` and `IsBiodropsProduction == true`.
2. `GET /api/v1/integrations/biodrops/tenants/{tenantId}/inventory`
   * Validates tenant existence and `IsBiodropsProduction`.
   * Returns 20L finished products and raw materials with current stock, reserved stock, and damaged stock.
3. `GET /api/v1/integrations/biodrops/tenants/{tenantId}/stock-summary`
   * Returns high-level summary grouped strictly by unit of measure.

---

## 8. Missing Components Required for Stock Adjustment
1. **The Endpoint:** `POST /api/v1/integrations/biodrops/tenants/{tenantId}/stock/adjust` does not exist yet.
2. **DTO & Command:** `AdjustTenantStockRequestDto`, `AdjustTenantStockResponseDto`, and corresponding command logic in `Aquora.Application`.
3. **Persistent Idempotency:** An `IntegrationIdempotencyRecords` table or persistent ledger to prevent duplicate adjustments on network retry.
4. **Frontend Badge Mapping:** Add `edrops_adjustment` and `edrops` to `MOVEMENT_TYPE_MAP` in `frontend/src/modules/inventory/InventoryPage.tsx` so the UI displays `💧 CHANGED IN EDROPS`.

---

## 9. Risks and Recommended Implementation Approach
1. **Risk of Cross-Tenant Data Leak:** Prevented completely by resolving the tenant schema dynamically through `ITenantProvider.SetTenantSchemaName(tenant.SchemaName)`.
2. **Risk of Balance Desynchronization:** Never trust `calculatedNewQuantity` from eDrops. Execute an atomic PostgreSQL transaction with row-level locking (`SELECT ... FOR UPDATE`), compute the balance authoritatively inside PostgreSQL, update the stock, insert the `InventoryMovement`, and commit.
3. **Zero-Unauthorized-Change Compliance:** All changes must strictly extend existing models and controllers without modifying existing production, sales, or accounting workflows.
