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

            if (twentyLProducts.Count > 0)
            {
                for (int i = 0; i < twentyLProducts.Count; i++)
                {
                    var p = twentyLProducts[i];
                    finishedProductsList.Add(new BiodropsProductStockDto
                    {
                        ProductId = p.Id,
                        ProductName = p.Name,
                        Sku = p.SKU,
                        ProductCategory = string.IsNullOrWhiteSpace(p.Category) ? "Jar" : p.Category,
                        AvailableStock = p.CurrentStock,
                        ReservedStock = i == 0 ? reservedStockTotal : 0,
                        DamagedStock = i == 0 ? damagedStockTotal : 0,
                        Unit = "Jar"
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
                    ReorderLevel = null
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
