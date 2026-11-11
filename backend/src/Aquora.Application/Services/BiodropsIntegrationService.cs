using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Aquora.Application.DTOs.Integrations.Biodrops;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;

namespace Aquora.Application.Services
{
    public class BiodropsIntegrationService : IBiodropsIntegrationService
    {
        private readonly IPlatformDbContext _platformContext;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<BiodropsIntegrationService> _logger;

        public BiodropsIntegrationService(
            IPlatformDbContext platformContext,
            IServiceScopeFactory scopeFactory,
            ILogger<BiodropsIntegrationService> logger)
        {
            _platformContext = platformContext;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        public async Task<List<BiodropsTenantDto>> GetEligibleTenantsAsync(CancellationToken cancellationToken = default)
        {
            _logger.LogInformation("[BIODROPS INTEGRATION] Querying eligible Biodrops Production tenants from platform registry.");

            var eligibleTenants = await _platformContext.Tenants
                .AsNoTracking()
                .Where(t => t.IsActive && !t.IsDeleted && t.IsBiodropsProduction)
                .OrderBy(t => t.Name)
                .Select(t => new BiodropsTenantDto
                {
                    TenantId = t.Id,
                    CompanyName = t.Name,
                    DisplayName = t.Name,
                    Code = t.Code,
                    Subdomain = t.Subdomain,
                    IsBiodropsProduction = t.IsBiodropsProduction,
                    CreatedAtUtc = t.CreatedAt
                })
                .ToListAsync(cancellationToken);

            _logger.LogInformation("[BIODROPS INTEGRATION] Found {Count} eligible Biodrops Production tenants.", eligibleTenants.Count);
            return eligibleTenants;
        }

        public async Task<BiodropsInventoryDto?> GetTenantInventoryAsync(Guid tenantId, CancellationToken cancellationToken = default)
        {
            // 1. Strict verification against Platform catalog: Tenant must exist, be active, not deleted, and have Biodrops Production toggle enabled
            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Rejected request: Tenant {TenantId} not found.", tenantId);
                return null;
            }

            if (!tenant.IsActive || !tenant.IsBiodropsProduction)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Rejected request: Tenant {TenantId} ('{TenantName}') has Biodrops Production disabled or is inactive.", tenantId, tenant.Name);
                return null;
            }

            // 2. Resolve tenant-specific schema using Aquora tenant resolution mechanism
            using var scope = _scopeFactory.CreateScope();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ITenantProvider>();
            tenantProvider.SetTenantId(tenant.Id);
            tenantProvider.SetTenantSchemaName(!string.IsNullOrWhiteSpace(tenant.SchemaName) ? tenant.SchemaName : "public");

            var tenantDb = scope.ServiceProvider.GetRequiredService<ITenantDbContext>();

            // 3. Query 20L Jar Finished Products
            var products = await tenantDb.Products
                .AsNoTracking()
                .Where(p => !p.IsDeleted)
                .ToListAsync(cancellationToken);

            var twentyLProducts = products.Where(IsTwentyLJarProduct).ToList();

            // Query reserved stock (filled jars reserved for distributors/orders pending collection)
            decimal reservedStockTotal = 0;
            try
            {
                reservedStockTotal = await tenantDb.OperationsReservedJars
                    .AsNoTracking()
                    .Where(r => r.TenantId == tenant.Id && r.Type == "Filled" && r.Status == "Pending" && !r.IsDeleted)
                    .SumAsync(r => (decimal)r.Quantity, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[BIODROPS INTEGRATION] Could not query OperationsReservedJars for tenant {TenantId}: {Message}", tenant.Id, ex.Message);
            }

            // Query damaged stock (from unloading condition inspections & container positions)
            decimal damagedStockTotal = 0;
            try
            {
                var damagedConditions = await tenantDb.OperationsJarConditions
                    .AsNoTracking()
                    .Where(c => c.TenantId == tenant.Id && c.ConditionType != "Good" && c.ConditionType != "Normal" && !c.IsDeleted)
                    .SumAsync(c => (decimal)c.Quantity, cancellationToken);

                var damagedPositions = await tenantDb.TwentyLJarPositions
                    .AsNoTracking()
                    .Where(p => p.TenantId == tenant.Id && p.ContainerStatus == "DAMAGED")
                    .SumAsync(p => (decimal)p.Quantity, cancellationToken);

                damagedStockTotal = damagedConditions + damagedPositions;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[BIODROPS INTEGRATION] Could not query damaged jar indicators for tenant {TenantId}: {Message}", tenant.Id, ex.Message);
            }

            var finishedProductsList = new List<BiodropsProductStockDto>();

            var productIds = twentyLProducts.Select(p => p.Id).ToList();
            List<InventoryMovement> recentProductMovements = new();
            try
            {
                recentProductMovements = await tenantDb.InventoryMovements
                    .AsNoTracking()
                    .Where(m => m.TenantId == tenant.Id && m.ProductId != null && productIds.Contains(m.ProductId.Value) && !m.IsDeleted)
                    .OrderByDescending(m => m.CreatedAt)
                    .ToListAsync(cancellationToken);
            }
            catch { }

            if (twentyLProducts.Count > 0)
            {
                for (int i = 0; i < twentyLProducts.Count; i++)
                {
                    var p = twentyLProducts[i];
                    var lastMv = recentProductMovements.FirstOrDefault(m => m.ProductId == p.Id);
                    bool isEdrops = (lastMv != null && (lastMv.ReferenceType?.Contains("EDROPS", StringComparison.OrdinalIgnoreCase) == true || lastMv.CreatedBy?.Contains("eDrops", StringComparison.OrdinalIgnoreCase) == true)) ||
                                    (p.UpdatedBy?.Contains("eDrops", StringComparison.OrdinalIgnoreCase) == true);

                    finishedProductsList.Add(new BiodropsProductStockDto
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        Sku = p.SKU,
                        ProductCategory = string.IsNullOrWhiteSpace(p.Category) ? "Jar" : p.Category,
                        AvailableStock = p.CurrentStock,
                        ReservedStock = i == 0 ? reservedStockTotal : 0,
                        DamagedStock = i == 0 ? damagedStockTotal : 0,
                        Unit = "Jar",
                        LastUpdatedUtc = lastMv?.CreatedAt ?? p.UpdatedAt ?? p.CreatedAt,
                        LastUpdatedBy = lastMv?.CreatedBy ?? p.UpdatedBy ?? "Plant Operator",
                        LastSource = isEdrops ? "EDROPS" : "AQUZIO",
                        LastMovementNotes = lastMv?.Notes ?? (isEdrops ? "Changed in eDrops" : "Changed in Aquzio (Plant)")
                    });
                }
            }
            else
            {
                // Fallback: Check 20L Plant Positions in container ledger if no explicit 20L product was configured
                try
                {
                    var plantPositions = await tenantDb.TwentyLJarPositions
                        .AsNoTracking()
                        .Where(p => p.TenantId == tenant.Id && p.LocationType == "PLANT" && p.ContainerStatus == "FILLED")
                        .ToListAsync(cancellationToken);

                    if (plantPositions.Count > 0)
                    {
                        finishedProductsList.Add(new BiodropsProductStockDto
                        {
                            ProductId = plantPositions[0].ProductId ?? Guid.Empty,
                            ProductName = "20L Water Jar",
                            Sku = "20L-JAR",
                            ProductCategory = "Jar",
                            AvailableStock = plantPositions.Sum(p => (decimal)p.Quantity),
                            ReservedStock = reservedStockTotal,
                            DamagedStock = damagedStockTotal,
                            Unit = "Jar"
                        });
                    }
                }
                catch { }
            }

            // 4. Query Raw Materials & calculate consumption/wastage from production entries
            var rawMaterials = await tenantDb.RawMaterials
                .AsNoTracking()
                .Where(rm => rm.TenantId == tenant.Id && !rm.IsDeleted && rm.IsActive)
                .OrderBy(rm => rm.Name)
                .ToListAsync(cancellationToken);

            List<ProductionEntry> productionEntries = new();
            try
            {
                productionEntries = await tenantDb.ProductionEntries
                    .AsNoTracking()
                    .Where(e => e.TenantId == tenant.Id && !e.IsDeleted)
                    .ToListAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[BIODROPS INTEGRATION] Could not query ProductionEntries for tenant {TenantId}: {Message}", tenant.Id, ex.Message);
            }

            var rawMaterialDtos = new List<BiodropsRawMaterialStockDto>();

            var rmIds = rawMaterials.Select(rm => rm.Id).ToList();
            List<InventoryMovement> recentRmMovements = new();
            try
            {
                recentRmMovements = await tenantDb.InventoryMovements
                    .AsNoTracking()
                    .Where(m => m.TenantId == tenant.Id && m.RawMaterialId != null && rmIds.Contains(m.RawMaterialId.Value) && !m.IsDeleted)
                    .OrderByDescending(m => m.CreatedAt)
                    .ToListAsync(cancellationToken);
            }
            catch { }

            foreach (var rm in rawMaterials)
            {
                decimal usedQuantity = 0;
                decimal wastedQuantity = 0;

                foreach (var entry in productionEntries)
                {
                    bool usedDynamic = false;

                    // Parse dynamic material consumptions JSON if present
                    if (!string.IsNullOrWhiteSpace(entry.MaterialConsumptionsJson))
                    {
                        try
                        {
                            using var doc = JsonDocument.Parse(entry.MaterialConsumptionsJson);
                            if (doc.RootElement.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var el in doc.RootElement.EnumerateArray())
                                {
                                    if (el.TryGetProperty("rawMaterialId", out var idProp) &&
                                        Guid.TryParse(idProp.GetString(), out var lineMatId) &&
                                        lineMatId == rm.Id)
                                    {
                                        if (el.TryGetProperty("usageQuantity", out var uProp) && uProp.TryGetDecimal(out var uVal))
                                            usedQuantity += uVal;
                                        if (el.TryGetProperty("wastageQuantity", out var wProp) && wProp.TryGetDecimal(out var wVal))
                                            wastedQuantity += wVal;

                                        usedDynamic = true;
                                    }
                                }
                            }
                        }
                        catch { }
                    }

                    // Fallback to legacy fixed columns if dynamic JSON was not used for this line
                    if (!usedDynamic)
                    {
                        if (entry.PreformMaterialId == rm.Id)
                        {
                            usedQuantity += entry.PreformUsage;
                            wastedQuantity += entry.PreformWastage;
                        }
                        if (entry.CapMaterialId == rm.Id)
                        {
                            usedQuantity += entry.CapUsage;
                            wastedQuantity += entry.CapWastage;
                        }
                        if (entry.LabelMaterialId == rm.Id)
                        {
                            usedQuantity += entry.LabelUsage;
                            wastedQuantity += entry.LabelWastage;
                        }
                        if (entry.ShrinkMaterialId == rm.Id)
                        {
                            usedQuantity += entry.ShrinkUsage;
                            wastedQuantity += entry.ShrinkWastage;
                        }
                        if (entry.GlueMaterialId == rm.Id)
                        {
                            usedQuantity += (entry.GlueUsage ?? 0);
                        }
                    }
                }

                var lastMv = recentRmMovements.FirstOrDefault(m => m.RawMaterialId == rm.Id);
                bool isEdrops = (lastMv != null && (lastMv.ReferenceType?.Contains("EDROPS", StringComparison.OrdinalIgnoreCase) == true || lastMv.CreatedBy?.Contains("eDrops", StringComparison.OrdinalIgnoreCase) == true)) ||
                                (rm.UpdatedBy?.Contains("eDrops", StringComparison.OrdinalIgnoreCase) == true);

                rawMaterialDtos.Add(new BiodropsRawMaterialStockDto
                {
                    MaterialId = rm.Id,
                    MaterialName = rm.Name,
                    Sku = rm.Code ?? string.Empty,
                    MaterialCategory = rm.Category ?? string.Empty,
                    AvailableQuantity = rm.CurrentStock,
                    UsedQuantity = usedQuantity,
                    WastedQuantity = wastedQuantity,
                    ConfiguredUnit = rm.Unit ?? "Unit",
                    ReorderLevel = null,
                    LastUpdatedUtc = lastMv?.CreatedAt ?? rm.UpdatedAt ?? rm.CreatedAt,
                    LastUpdatedBy = lastMv?.CreatedBy ?? rm.UpdatedBy ?? "Plant Operator",
                    LastSource = isEdrops ? "EDROPS" : "AQUZIO",
                    LastMovementNotes = lastMv?.Notes ?? (isEdrops ? "Changed in eDrops" : "Changed in Aquzio (Plant)")
                });
            }

            return new BiodropsInventoryDto
            {
                TenantId = tenant.Id,
                CompanyName = tenant.Name,
                InventoryTimestampUtc = DateTime.UtcNow,
                FinishedProducts = finishedProductsList,
                RawMaterials = rawMaterialDtos
            };
        }

        public async Task<BiodropsStockSummaryDto?> GetTenantStockSummaryAsync(Guid tenantId, CancellationToken cancellationToken = default)
        {
            var inventory = await GetTenantInventoryAsync(tenantId, cancellationToken);
            if (inventory == null) return null;

            var totalTwentyLStock = inventory.FinishedProducts.Sum(p => p.AvailableStock);

            var rawMaterialStock = inventory.RawMaterials.Select(rm => new BiodropsRawMaterialSummaryItemDto
            {
                MaterialId = rm.MaterialId,
                MaterialName = rm.MaterialName,
                Sku = rm.Sku,
                Category = rm.MaterialCategory,
                TotalQuantity = rm.AvailableQuantity,
                Unit = rm.ConfiguredUnit
            }).ToList();

            // Group strictly by unit so quantities with different units are NEVER added together
            var groupedByUnit = inventory.RawMaterials
                .GroupBy(rm => rm.ConfiguredUnit, StringComparer.OrdinalIgnoreCase)
                .Select(g => new BiodropsUnitGroupSummaryDto
                {
                    Unit = g.Key,
                    TotalQuantity = g.Sum(x => x.AvailableQuantity),
                    ItemCount = g.Count()
                })
                .OrderBy(g => g.Unit)
                .ToList();

            return new BiodropsStockSummaryDto
            {
                TenantId = inventory.TenantId,
                CompanyName = inventory.CompanyName,
                TotalTwentyLStock = totalTwentyLStock,
                TotalTwentyLUnit = "Jar",
                RawMaterials = rawMaterialStock,
                RawMaterialStockByUnit = groupedByUnit,
                InventorySummaryTimestampUtc = DateTime.UtcNow
            };
        }

        public async Task<List<BiodropsSaleDto>?> GetTenantSalesAsync(Guid tenantId, CancellationToken cancellationToken = default)
        {
            // 1. Strict verification against Platform catalog: Tenant must exist, be active, not deleted, and have Biodrops Production toggle enabled
            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Rejected sales request: Tenant {TenantId} not found.", tenantId);
                return null;
            }

            if (!tenant.IsActive)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Rejected sales request: Tenant {TenantId} is inactive.", tenantId);
                return null;
            }

            if (!tenant.IsBiodropsProduction)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Rejected sales request: Biodrops Production is not enabled for tenant {TenantId}.", tenantId);
                return null;
            }

            // 2. Resolve scoped TenantDbContext configured for the tenant's dedicated PostgreSQL schema
            using var scope = _scopeFactory.CreateScope();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ITenantProvider>();
            tenantProvider.SetTenantId(tenant.Id);
            tenantProvider.SetTenantSchemaName(!string.IsNullOrWhiteSpace(tenant.SchemaName) ? tenant.SchemaName : "public");

            var tenantDb = scope.ServiceProvider.GetRequiredService<ITenantDbContext>();

            // 3. Query Sales Transactions including Product and Customer
            var salesQuery = await tenantDb.SalesTransactions
                .AsNoTracking()
                .Include(s => s.Product)
                .Include(s => s.Customer)
                .Where(s => !s.IsDeleted)
                .OrderByDescending(s => s.TransactionDate)
                .ToListAsync(cancellationToken);

            // Filter to only Biodrops products (20L Jars)
            var eligibleSales = salesQuery
                .Where(s => s.Product != null && IsTwentyLJarProduct(s.Product))
                .Select(s => new BiodropsSaleDto
                {
                    TransactionId = s.Id,
                    TransactionNumber = s.TransactionNumber,
                    TransactionDate = s.TransactionDate,
                    CustomerId = s.CustomerId,
                    CustomerName = s.Customer != null ? (string.IsNullOrWhiteSpace(s.Customer.CustomerName) ? (s.Customer.BusinessName ?? "Direct Customer") : s.Customer.CustomerName) : "Direct Customer",
                    ProductId = s.ProductId,
                    ProductName = s.Product != null ? s.Product.Name : "20L Water Jar",
                    Sku = s.Product?.SKU,
                    Quantity = s.Cases,
                    Unit = "Jar",
                    UnitPrice = s.UnitPrice,
                    TotalAmount = s.TotalAmount,
                    AmountPaid = s.AmountReceived,
                    OutstandingAmount = s.OutstandingAmount,
                    PaymentStatus = s.PaymentStatus,
                    PaymentMethod = s.PaymentMethod,
                    Status = s.Status,
                    Remarks = s.Remarks,
                    Source = "AQUZIO",
                    BadgeLabel = "Changed the sales in Aquzio",
                    CreatedAtUtc = s.CreatedAt,
                    UpdatedAtUtc = s.UpdatedAt
                })
                .ToList();

            _logger.LogInformation("[BIODROPS INTEGRATION] Found {Count} eligible Biodrops sales for tenant {TenantId}.", eligibleSales.Count, tenantId);
            return eligibleSales;
        }

        public async Task<BiodropsStockAdjustmentResultDto> AdjustTenantStockAsync(
            Guid tenantId,
            BiodropsStockAdjustmentRequestDto request,
            string? idempotencyKey = null,
            CancellationToken cancellationToken = default)
        {
            if (tenantId == Guid.Empty || request.TenantId == Guid.Empty)
            {
                throw new ArgumentException("A valid non-empty tenant ID must be provided.");
            }

            if (tenantId != request.TenantId)
            {
                throw new ArgumentException($"Tenant ID mismatch: URL tenant ID '{tenantId}' does not match body tenant ID '{request.TenantId}'.");
            }

            if (string.IsNullOrWhiteSpace(request.Sku))
            {
                throw new ArgumentException("SKU or item identifier is required.");
            }

            var cleanAction = (request.Action ?? string.Empty).Trim().ToUpperInvariant();
            if (cleanAction != "ADD" && cleanAction != "SET" && cleanAction != "DEDUCT")
            {
                throw new ArgumentException($"Invalid stock adjustment action '{request.Action}'. Supported actions are ADD, SET, and DEDUCT.");
            }

            if (request.Quantity < 0)
            {
                throw new ArgumentException("Adjustment quantity must be greater than or equal to 0.");
            }

            // 1. Verify tenant in Platform Registry: must be active, not deleted, and have Biodrops toggle enabled
            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Stock adjustment rejected: Tenant {TenantId} not found.", tenantId);
                throw new KeyNotFoundException($"Tenant {tenantId} not found.");
            }

            if (!tenant.IsActive || !tenant.IsBiodropsProduction)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Stock adjustment rejected: Tenant {TenantId} ('{TenantName}') has Biodrops Production disabled or is inactive.", tenantId, tenant.Name);
                throw new UnauthorizedAccessException($"Tenant '{tenant.Name}' does not have Biodrops Production integration enabled.");
            }

            // 2. Check persistent idempotency to guarantee network retries do not apply adjustments twice
            var effectiveIdempotencyKey = !string.IsNullOrWhiteSpace(idempotencyKey)
                ? idempotencyKey.Trim()
                : (!string.IsNullOrWhiteSpace(request.Reference) ? request.Reference.Trim() : null);

            var requestSignature = $"{cleanAction}:{request.Sku.Trim().ToLowerInvariant()}:{request.Quantity}:{request.ItemType?.Trim().ToUpperInvariant()}";

            if (!string.IsNullOrWhiteSpace(effectiveIdempotencyKey))
            {
                var existingLog = await _platformContext.PlatformAuditLogs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(l => l.TenantId == tenant.Id &&
                                              l.Action == "EDROPS_IDEMPOTENCY" &&
                                              l.PrimaryKey == effectiveIdempotencyKey, cancellationToken);

                if (existingLog != null)
                {
                    if (existingLog.OldValues == requestSignature && !string.IsNullOrWhiteSpace(existingLog.NewValues))
                    {
                        _logger.LogInformation("[BIODROPS INTEGRATION] Idempotency match for key '{Key}' on tenant {TenantId}. Returning cached committed response.", effectiveIdempotencyKey, tenant.Id);
                        try
                        {
                            var cachedResult = JsonSerializer.Deserialize<BiodropsStockAdjustmentResultDto>(existingLog.NewValues);
                            if (cachedResult != null)
                            {
                                return cachedResult;
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "[BIODROPS INTEGRATION] Failed to deserialize cached idempotency payload for key '{Key}'. Re-evaluating adjustment.", effectiveIdempotencyKey);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("[BIODROPS INTEGRATION] Idempotency conflict for key '{Key}' on tenant {TenantId}. Payload signature mismatch.", effectiveIdempotencyKey, tenant.Id);
                        throw new InvalidOperationException($"Idempotency key '{effectiveIdempotencyKey}' has already been processed with a different request payload.");
                    }
                }
            }

            // 3. Resolve tenant-specific PostgreSQL schema
            using var scope = _scopeFactory.CreateScope();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ITenantProvider>();
            tenantProvider.SetTenantId(tenant.Id);
            tenantProvider.SetTenantSchemaName(!string.IsNullOrWhiteSpace(tenant.SchemaName) ? tenant.SchemaName : "public");

            var tenantDb = scope.ServiceProvider.GetRequiredService<ITenantDbContext>();

            var company = await tenantDb.Companies.FirstOrDefaultAsync(c => !c.IsDeleted, cancellationToken);
            var companyId = company?.Id ?? tenant.Id;

            // 4. Determine item classification (Raw Material vs Finished Product)
            var itemTypeUpper = (request.ItemType ?? string.Empty).Trim().ToUpperInvariant();
            var isProductExplicit = itemTypeUpper == "PRODUCT" || itemTypeUpper == "FINISHED_PRODUCT" || itemTypeUpper == "FINISHED_GOODS";
            var isRawMaterialExplicit = itemTypeUpper == "RAW_MATERIAL" || itemTypeUpper == "RAW" || itemTypeUpper == "MATERIAL";

            Guid? targetRawMaterialId = null;
            Guid? targetProductId = null;
            string targetItemName = string.Empty;
            decimal previousStock = 0;
            string resolvedUnit = request.Unit ?? "Unit";

            RawMaterial? rawMaterial = null;
            Product? product = null;

            bool isSkuGuid = Guid.TryParse(request.Sku, out var parsedSkuGuid);
            var skuLower = request.Sku.Trim().ToLower();

            if (!isProductExplicit)
            {
                // Attempt raw material resolution first
                rawMaterial = await tenantDb.RawMaterials
                    .FirstOrDefaultAsync(rm => rm.TenantId == tenant.Id &&
                                               !rm.IsDeleted &&
                                               (rm.Code == request.Sku ||
                                                rm.Name.ToLower() == skuLower ||
                                                (isSkuGuid && rm.Id == parsedSkuGuid)), cancellationToken);

                if (rawMaterial != null)
                {
                    targetRawMaterialId = rawMaterial.Id;
                    targetItemName = rawMaterial.Name;
                    previousStock = rawMaterial.CurrentStock;
                    resolvedUnit = !string.IsNullOrWhiteSpace(rawMaterial.Unit) ? rawMaterial.Unit : request.Unit;
                }
            }

            if (rawMaterial == null && !isRawMaterialExplicit)
            {
                // Fallback or explicit check for finished products
                product = await tenantDb.Products
                    .FirstOrDefaultAsync(p => !p.IsDeleted &&
                                              (p.SKU == request.Sku ||
                                               p.Name.ToLower() == skuLower ||
                                               (isSkuGuid && p.Id == parsedSkuGuid)), cancellationToken);

                if (product != null)
                {
                    targetProductId = product.Id;
                    targetItemName = product.Name;
                    previousStock = product.CurrentStock;
                    resolvedUnit = "Jar";
                }
            }

            if (rawMaterial == null && product == null)
            {
                _logger.LogWarning("[BIODROPS INTEGRATION] Target item not found for tenant {TenantId}. SKU: '{Sku}', ItemType: '{ItemType}'", tenant.Id, request.Sku, request.ItemType);
                throw new KeyNotFoundException($"Item with SKU/identifier '{request.Sku}' was not found in tenant '{tenant.Name}'.");
            }

            // 5. Authoritatively calculate new stock balance inside Aquzio (never trust client-asserted balance)
            decimal adjustmentQty = 0;
            decimal newStock = 0;

            switch (cleanAction)
            {
                case "ADD":
                    adjustmentQty = request.Quantity;
                    newStock = previousStock + adjustmentQty;
                    break;

                case "DEDUCT":
                    if (previousStock < request.Quantity)
                    {
                        throw new InvalidOperationException($"Insufficient stock for '{targetItemName}'. Current stock: {previousStock} {resolvedUnit}, requested deduction: {request.Quantity} {resolvedUnit}.");
                    }
                    adjustmentQty = -request.Quantity;
                    newStock = previousStock + adjustmentQty; // previousStock - quantity
                    break;

                case "SET":
                    adjustmentQty = request.Quantity - previousStock;
                    newStock = request.Quantity;
                    break;
            }

            if (newStock < 0)
            {
                throw new InvalidOperationException($"Adjustment would result in negative stock balance ({newStock} {resolvedUnit}). Operation rejected.");
            }

            // 6. Persist stock adjustment and insert immutable movement history in one atomic database transaction
            var transactionId = Guid.NewGuid();
            var movementId = Guid.NewGuid();

            var operatorName = !string.IsNullOrWhiteSpace(request.Operator)
                ? request.Operator.Trim()
                : "eDrops System";

            var movementDescription = !string.IsNullOrWhiteSpace(request.Description)
                ? request.Description.Trim()
                : $"Changed in eDrops: {(!string.IsNullOrWhiteSpace(request.Reason) ? request.Reason : "Stock Adjustment")}{(!string.IsNullOrWhiteSpace(request.Notes) ? $" ({request.Notes})" : string.Empty)}";

            var movementClassification = !string.IsNullOrWhiteSpace(request.MovementType)
                ? request.MovementType.Trim()
                : "EDROPS_ADJUSTMENT";

            if (rawMaterial != null)
            {
                rawMaterial.CurrentStock = newStock;
                rawMaterial.UpdatedAt = DateTime.UtcNow;
                rawMaterial.UpdatedBy = operatorName;
            }
            else if (product != null)
            {
                product.CurrentStock = newStock;
                product.UpdatedAt = DateTime.UtcNow;
                product.UpdatedBy = operatorName;
            }

            var movement = new InventoryMovement
            {
                Id = movementId,
                RawMaterialId = targetRawMaterialId,
                ProductId = targetProductId,
                InventoryType = rawMaterial != null ? "RawMaterial" : "FinishedProduct",
                Quantity = adjustmentQty,
                BalanceAfter = newStock,
                ReferenceType = movementClassification,
                ReferenceId = transactionId,
                Notes = movementDescription,
                TenantId = tenant.Id,
                CompanyId = companyId,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = operatorName,
                IsDeleted = false
            };

            tenantDb.InventoryMovements.Add(movement);

            // Execute database commit
            await tenantDb.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("[BIODROPS INTEGRATION] Stock successfully adjusted for tenant {TenantId}. Item: '{Item}', Action: {Action}, Prev: {Prev}, New: {New}, MovementId: {MovementId}",
                tenant.Id, targetItemName, cleanAction, previousStock, newStock, movementId);

            var result = new BiodropsStockAdjustmentResultDto
            {
                TransactionId = transactionId,
                MovementId = movementId,
                TenantId = tenant.Id,
                Sku = request.Sku,
                ItemType = rawMaterial != null ? "RAW_MATERIAL" : "FINISHED_PRODUCT",
                Action = cleanAction,
                PreviousQuantity = previousStock,
                AdjustmentQuantity = adjustmentQty,
                NewQuantity = newStock,
                Unit = resolvedUnit,
                Source = "EDROPS",
                Reference = !string.IsNullOrWhiteSpace(request.Reference) ? request.Reference.Trim() : $"EDROPS-ADJ-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}",
                CreatedAt = movement.CreatedAt
            };

            // 7. Persist idempotency audit record so duplicate network requests return committed state
            if (!string.IsNullOrWhiteSpace(effectiveIdempotencyKey))
            {
                try
                {
                    var auditLog = new PlatformAuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenant.Id,
                        Action = "EDROPS_IDEMPOTENCY",
                        TableName = rawMaterial != null ? "RawMaterials" : "Products",
                        PrimaryKey = effectiveIdempotencyKey,
                        OldValues = requestSignature,
                        NewValues = JsonSerializer.Serialize(result),
                        Timestamp = DateTime.UtcNow,
                        Module = "BiodropsIntegration",
                        Reason = $"Committed eDrops adjustment: {cleanAction} {request.Quantity} {resolvedUnit} on '{targetItemName}'",
                        UserId = !string.IsNullOrWhiteSpace(request.Operator) ? request.Operator.Trim() : "eDrops-System",
                        UserEmail = "integration@edrops.in",
                        IpAddress = "127.0.0.1",
                        Device = "eDrops Integration Agent"
                    };

                    _platformContext.PlatformAuditLogs.Add(auditLog);
                    await _platformContext.SaveChangesAsync(cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[BIODROPS INTEGRATION] Failed to record idempotency log for key '{Key}': {Message}", effectiveIdempotencyKey, ex.Message);
                }
            }

            return result;
        }

        public static bool IsTwentyLJarProduct(Product p)
        {
            if (p == null) return false;

            // Category match
            if (!string.IsNullOrWhiteSpace(p.Category) &&
                (p.Category.Equals("Jar", StringComparison.OrdinalIgnoreCase) ||
                 p.Category.Equals("20L", StringComparison.OrdinalIgnoreCase) ||
                 p.Category.Equals("20L Jar", StringComparison.OrdinalIgnoreCase) ||
                 p.Category.Equals("20L Water Jar", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            // BottleSize match
            if (!string.IsNullOrWhiteSpace(p.BottleSize) &&
                (p.BottleSize.Contains("20", StringComparison.OrdinalIgnoreCase) ||
                 p.BottleSize.Contains("Jar", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            // Name match
            if (!string.IsNullOrWhiteSpace(p.Name) &&
                (p.Name.Contains("20L", StringComparison.OrdinalIgnoreCase) ||
                 p.Name.Contains("20 L", StringComparison.OrdinalIgnoreCase) ||
                 p.Name.Contains("20 LTR", StringComparison.OrdinalIgnoreCase) ||
                 p.Name.Contains("20-Liter", StringComparison.OrdinalIgnoreCase) ||
                 p.Name.Contains("Jar", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            return false;
        }
    }
}
