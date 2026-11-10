# AQUZIO × EDROPS API DOCUMENTATION
## Production External Integration Specification

---

## 1. Authentication
All external integration endpoints require API key authentication:
```http
X-API-Key: <your_integration_api_key>
```
Or:
```http
Authorization: Bearer <your_integration_api_key>
```

---

## 2. Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/integrations/biodrops/tenants` | Returns eligible tenants with Biodrops toggle active. |
| `GET` | `/api/v1/integrations/biodrops/tenants/{tenantId}/inventory` | Returns raw materials & 20L finished products. |
| `GET` | `/api/v1/integrations/biodrops/tenants/{tenantId}/stock-summary` | Returns stock summary grouped strictly by unit. |
| `POST` | `/api/v1/integrations/biodrops/tenants/{tenantId}/stock/adjust` | Authoritatively adjusts stock & inserts movement history. |

---

## 3. Stock Adjustment Endpoint Specification

### `POST /api/v1/integrations/biodrops/tenants/{tenantId}/stock/adjust`

#### Headers
* `Content-Type: application/json`
* `X-API-Key: <key>`
* `Idempotency-Key: <unique-token>` *(Optional but strongly recommended for retry safety)*

#### Request Body Example
```json
{
  "tenantId": "8714038a-36b0-4521-8b5e-9389ad045a65",
  "sku": "1000_ML",
  "itemType": "RAW_MATERIAL",
  "action": "ADD",
  "quantity": 50,
  "unit": "LITER",
  "movementType": "EDROPS_ADJUSTMENT",
  "description": "Changed in eDrops: Supplier Inward (PO-8891)",
  "reason": "Supplier Inward",
  "notes": "PO-8891",
  "operator": "eDrops System (Staff: Murshid)",
  "reference": "EDROPS-ADJ-1794143784"
}
```

#### Field Rules:
* `tenantId`: Must match the `{tenantId}` in the URL path.
* `sku`: Raw material code, name, product SKU, or UUID.
* `action`: `"ADD"`, `"SET"`, or `"DEDUCT"`.
* `quantity`: Number `>= 0`.
* `unit`: Must match the item's unit of measure.
* `movementType`: Default `"EDROPS_ADJUSTMENT"`.

#### Successful Response (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Stock adjustment completed successfully.",
  "data": {
    "transactionId": "b182cb05-a3ce-4ba7-b769-e9ce0818e5b6",
    "movementId": "52857a22-3850-482d-8b01-525ea285dc32",
    "tenantId": "8714038a-36b0-4521-8b5e-9389ad045a65",
    "sku": "1000_ML",
    "itemType": "RAW_MATERIAL",
    "action": "ADD",
    "previousQuantity": 987,
    "adjustmentQuantity": 50,
    "newQuantity": 1037,
    "unit": "LITER",
    "source": "EDROPS",
    "reference": "EDROPS-ADJ-1794143784",
    "createdAt": "2026-11-09T10:30:00.0000000Z"
  }
}
```

#### Error Codes:
* `400 Bad Request`: Validation failure (tenant mismatch, unsupported action, invalid quantity, or insufficient stock).
* `401 Unauthorized`: Missing or invalid API key.
* `403 Forbidden`: Revoked API key or tenant does not have `IsBiodropsProduction` enabled.
* `404 Not Found`: Tenant or item not found.
* `409 Conflict`: Idempotency key reused with a different request payload.
