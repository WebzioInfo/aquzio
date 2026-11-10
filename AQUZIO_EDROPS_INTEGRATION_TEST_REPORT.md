# AQUZIO × EDROPS INTEGRATION TEST REPORT
## Automated Test Execution & Verification Summary
**Test Assembly:** `Aquora.Tests.dll` (.NET 10.0)  
**Executed Against:** `Aquora.Tests/BiodropsIntegrationApiTests.cs`  
**Result:** 37 of 37 Tests PASSED (100% Pass Rate)  

---

## 1. Test Execution Summary

| Test Area | Tests Run | Passed | Failed |
|---|---|---|---|
| 1. Eligible Tenant Listing | 3 | 3 | 0 |
| 2. Tenant Inventory Retrieval | 5 | 5 | 0 |
| 3. High-Level Stock Summary | 4 | 4 | 0 |
| 4. Security & API Key Authentication | 7 | 7 | 0 |
| 5. Configuration Validation | 5 | 5 | 0 |
| 6. Rate Limiting Policy | 2 | 2 | 0 |
| 7. Tenant Isolation & Immutability | 5 | 5 | 0 |
| 8. Stock Adjustment & Persistence | 6 | 6 | 0 |
| **Total** | **37** | **37** | **0** |

---

## 2. Specific Stock Adjustment Scenarios Verified
1. **`AdjustTenantStock_AddAction_AuthoritativelyIncreasesStockAndInsertsMovement`:**
   - Pre-condition: Stock is 987 LITER.
   - Action: ADD 50 LITER.
   - Assertion: Stock commits to 1037 LITER in database. `InventoryMovement` row inserted with `Quantity: +50`, `BalanceAfter: 1037`, `Notes: Changed in eDrops: Supplier Inward (PO-8891)`, `CreatedBy: eDrops System (Staff: Murshid)`.
2. **`AdjustTenantStock_DeductAction_DecreasesStockCorrectly`:**
   - Pre-condition: Stock is 100 KG.
   - Action: DEDUCT 10 KG.
   - Assertion: Stock commits to 90 KG.
3. **`AdjustTenantStock_DeductExceedingBalance_ThrowsInvalidOperationException`:**
   - Pre-condition: Stock is 10 KG.
   - Action: DEDUCT 50 KG.
   - Assertion: Throws `InvalidOperationException` ("Insufficient stock"). Database remains at 10 KG.
4. **`AdjustTenantStock_TenantMismatch_ThrowsArgumentException`:**
   - Action: URL tenant ID does not match body tenant ID.
   - Assertion: Request rejected with HTTP 400.
5. **`AdjustTenantStock_DisabledTenantToggle_ThrowsUnauthorizedAccessException`:**
   - Action: Stock adjustment dispatched to tenant with `IsBiodropsProduction == false`.
   - Assertion: Request rejected with HTTP 403 Forbidden.
6. **`AdjustTenantStock_IdempotentRetry_ReturnsCommittedResponseWithoutDoubleAdjustment`:**
   - Action: Dispatched ADD 25 on 100 stock with `Idempotency-Key: KEY-IDEM-001`. Stock became 125.
   - Retry: Dispatched same request again with `KEY-IDEM-001`.
   - Assertion: Returned identical transaction result. Database stock remained 125 (never doubled to 150).
