# AQUZIO × EDROPS DEPLOYMENT HANDOVER
## Production Deployment & Operational Guide

---

## 1. Environment Configuration

### Required Environment Variables
In Aquzio backend (`backend/.env` or hosting provider environment variables like Railway):
```ini
# Production External Integration API Secret
Integration__Biodrops__ApiKey=your_production_secret_key_here

# Optional Zero-Downtime Key Rotation Secondary Key
Integration__Biodrops__SecondaryApiKey=

# Optional Revoked SHA-256 Fingerprints
Integration__Biodrops__RevokedKeys=
```

In eDrops backend (`backend/.env`):
```ini
AQUZIO_API_URL=https://api.aquzio.webziotech.in
AQUZIO_API_KEY=your_production_secret_key_here
```

---

## 2. Exposing New Tenants to eDrops
If a manufacturing tenant (such as **Sinan Company**) should appear in eDrops:
Execute in Supabase SQL Editor:
```sql
UPDATE public."Tenants"
SET "IsBiodropsProduction" = true
WHERE "Id" = '7d77da44-5307-489c-b474-bf9cdc6137ee';
```
To hide a tenant from eDrops:
```sql
UPDATE public."Tenants"
SET "IsBiodropsProduction" = false
WHERE "Id" = '<tenant-uuid>';
```

---

## 3. Deployment Safety Protocol
1. **Zero Database Destructive Actions:** No tables or columns were dropped or renamed.
2. **Backward Compatibility:** All existing endpoints (`GET /tenants`, `GET /inventory`, `GET /stock-summary`) remain 100% untouched.
3. **Rollback Plan:**
   - To roll back code: Revert to previous git commit.
   - Database remains completely intact because existing tables (`RawMaterials`, `Products`, `InventoryMovements`) were reused cleanly.
