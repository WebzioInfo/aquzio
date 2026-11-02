using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using Aquora.API.Authorization;
using Aquora.API.Controllers;
using Aquora.Application.DTOs.Integrations.Biodrops;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.Services;
using Aquora.Domain.Entities;
using Aquora.Persistence.Context;
using Aquora.Shared.Models;

namespace Aquora.Tests
{
    public class TestTenantProvider : ITenantProvider
    {
        public Guid TenantId { get; private set; }
        public string TenantSchemaName { get; private set; } = string.Empty;

        public void SetTenantId(Guid tenantId) => TenantId = tenantId;
        public void SetTenantSchemaName(string schemaName) => TenantSchemaName = schemaName;
    }

    public class BiodropsIntegrationApiTests
    {
        private const string TestValidApiKey = "biodrops_test_key_valid_2026";
        private const string TestRevokedApiKey = "biodrops_test_key_revoked_2026";
        private const string CompromisedLegacyKeyPlaintext = "biodrops_live_secret_key_2026";

        private (PlatformDbContext PlatformDb, TenantDbContext TenantDb1, TenantDbContext TenantDb2, IServiceProvider ServiceProvider) CreateTestEnvironment(
            Guid tenant1Id,
            Guid tenant2Id,
            Dictionary<string, string?>? customConfig = null)
        {
            var services = new ServiceCollection();

            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var platformDb = new PlatformDbContext(platformOptions);

            var tenantOptions1 = new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var tenantOptions2 = new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var mockTenantProvider = new Mock<ITenantProvider>();
            mockTenantProvider.SetupGet(p => p.TenantId).Returns(tenant1Id);
            mockTenantProvider.SetupGet(p => p.TenantSchemaName).Returns("tenant_alpha");

            var mockUserContext = new Mock<ICurrentUserContext>();
            mockUserContext.SetupGet(u => u.TenantId).Returns(tenant1Id);
            mockUserContext.SetupGet(u => u.UserId).Returns("integration-user");

            var tenantDb1 = new TenantDbContext(tenantOptions1, mockTenantProvider.Object, mockUserContext.Object);
            var tenantDb2 = new TenantDbContext(tenantOptions2, mockTenantProvider.Object, mockUserContext.Object);

            var configDict = customConfig ?? new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", TestValidApiKey },
                { "Integration:Biodrops:RevokedKeys", TestRevokedApiKey }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(configDict)
                .Build();

            services.AddSingleton<IConfiguration>(configuration);
            services.AddLogging();
            services.AddSingleton<IPlatformDbContext>(platformDb);
            services.AddSingleton(platformDb);

            // Register scoped ITenantDbContext resolving the matching tenant's DbContext
            services.AddScoped<ITenantProvider, TestTenantProvider>();

            services.AddScoped<ITenantDbContext>(sp =>
            {
                var tp = sp.GetRequiredService<ITenantProvider>();
                var opts = tp.TenantId == tenant2Id ? tenantOptions2 : tenantOptions1;
                return new TenantDbContext(opts, tp, mockUserContext.Object);
            });

            services.AddSingleton<IBiodropsIntegrationAuthService, BiodropsIntegrationAuthService>();
            services.AddScoped<IBiodropsIntegrationService, BiodropsIntegrationService>();

            var sp = services.BuildServiceProvider();
            return (platformDb, tenantDb1, tenantDb2, sp);
        }

        #region 1. Eligible Tenant Listing Tests

        [Fact]
        public async Task GetEligibleTenants_ReturnsOnlyEnabledTenants()
        {
            // Arrange
            var enabledTenantId = Guid.NewGuid();
            var disabledTenantId = Guid.NewGuid();
            var deletedTenantId = Guid.NewGuid();

            var (platformDb, _, _, sp) = CreateTestEnvironment(enabledTenantId, disabledTenantId);

            platformDb.Tenants.AddRange(
                new Tenant
                {
                    Id = enabledTenantId,
                    Name = "Biodrops Bottling Plant Alpha",
                    Code = "ALPHA",
                    SchemaName = "tenant_alpha",
                    Subdomain = "alpha",
                    IsActive = true,
                    IsDeleted = false,
                    IsBiodropsProduction = true,
                    CreatedBy = "System",
                    CreatedAt = DateTime.UtcNow
                },
                new Tenant
                {
                    Id = disabledTenantId,
                    Name = "Standard Commercial Bottler Beta",
                    Code = "BETA",
                    SchemaName = "tenant_beta",
                    Subdomain = "beta",
                    IsActive = true,
                    IsDeleted = false,
                    IsBiodropsProduction = false, // Disabled
                    CreatedBy = "System",
                    CreatedAt = DateTime.UtcNow
                },
                new Tenant
                {
                    Id = deletedTenantId,
                    Name = "Deleted Plant Gamma",
                    Code = "GAMMA",
                    SchemaName = "tenant_gamma",
                    Subdomain = "gamma",
                    IsActive = true,
                    IsDeleted = true, // Soft-deleted
                    IsBiodropsProduction = true,
                    CreatedBy = "System",
                    CreatedAt = DateTime.UtcNow
                }
            );
            await platformDb.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();
            var logger = sp.GetRequiredService<ILogger<BiodropsIntegrationController>>();
            var controller = new BiodropsIntegrationController(service, logger);

            // Act
            var actionResult = await controller.GetEligibleTenants(CancellationToken.None);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var apiResponse = Assert.IsType<ApiResponse<List<BiodropsTenantDto>>>(okResult.Value);

            Assert.True(apiResponse.Success);
            Assert.NotNull(apiResponse.Data);
            Assert.Single(apiResponse.Data);

            var item = apiResponse.Data[0];
            Assert.Equal(enabledTenantId, item.TenantId);
            Assert.Equal("Biodrops Bottling Plant Alpha", item.CompanyName);
            Assert.Equal("Biodrops Bottling Plant Alpha", item.DisplayName);
            Assert.True(item.IsBiodropsProduction);

            // Ensure disabled and deleted tenants NEVER appear
            Assert.DoesNotContain(apiResponse.Data, t => t.TenantId == disabledTenantId);
            Assert.DoesNotContain(apiResponse.Data, t => t.TenantId == deletedTenantId);
        }

        #endregion

        #region 2. Tenant Inventory Tests

        [Fact]
        public async Task GetTenantInventory_EnabledTenant_ReturnsCorrectStockAndCalculations()
        {
            // Arrange
            var tenantId = Guid.NewGuid();
            var companyId = Guid.NewGuid();

            var (platformDb, tenantDb, _, sp) = CreateTestEnvironment(tenantId, Guid.NewGuid());

            platformDb.Tenants.Add(new Tenant
            {
                Id = tenantId,
                Name = "Apex Water Solutions",
                Code = "APEX",
                SchemaName = "tenant_apex",
                Subdomain = "apex",
                IsActive = true,
                IsDeleted = false,
                IsBiodropsProduction = true,
                CreatedBy = "System",
                CreatedAt = DateTime.UtcNow
            });
            await platformDb.SaveChangesAsync();

            var brandId = Guid.NewGuid();
            var product20LId = Guid.NewGuid();
            var rawMaterialPreformId = Guid.NewGuid();
            var rawMaterialCapId = Guid.NewGuid();

            // Seed Product: 20L Jar with 150 current stock
            tenantDb.Products.Add(new Product
            {
                Id = product20LId,
                Name = "Biodrops 20 LTR Water Jar",
                Category = "Jar",
                BottleSize = "20L",
                SKU = "BIO-20L-JAR",
                BrandId = brandId,
                CurrentStock = 150m,
                IsActive = true,
                IsDeleted = false,
                CreatedBy = "Admin"
            });

            // Seed Raw Materials: Preform (PCS) and Cap (PCS)
            tenantDb.RawMaterials.AddRange(
                new RawMaterial
                {
                    Id = rawMaterialPreformId,
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "20L Preform 650g",
                    Code = "RM-PRE-650",
                    Category = "PREFORM",
                    Unit = "PCS",
                    BaseUnit = "PCS",
                    CurrentStock = 1200m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                },
                new RawMaterial
                {
                    Id = rawMaterialCapId,
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "20L Smart Cap",
                    Code = "RM-CAP-55",
                    Category = "CAP",
                    Unit = "PCS",
                    BaseUnit = "PCS",
                    CurrentStock = 2500m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                }
            );

            // Seed Production Entry with usage and wastage
            var productionLineId = Guid.NewGuid();
            tenantDb.ProductionEntries.Add(new ProductionEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                OperatorId = Guid.NewGuid(),
                OperatorName = "Operator 1",
                ProductionLineId = productionLineId,
                ProductId = product20LId,
                Shift = "Day",
                Time = "10:00",
                CasesProduced = 100,
                PreformMaterialId = rawMaterialPreformId,
                PreformUsage = 105m,
                PreformWastage = 5m,
                CapMaterialId = rawMaterialCapId,
                CapUsage = 102m,
                CapWastage = 2m,
                CreatedBy = "Admin",
                IsDeleted = false
            });

            // Seed Reserved Jars (25 filled jars reserved)
            tenantDb.OperationsReservedJars.Add(new OperationsReservedJar
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                DistributorId = Guid.NewGuid(),
                Quantity = 25,
                Type = "Filled",
                Status = "Pending",
                IsDeleted = false,
                CreatedBy = "Admin"
            });

            // Seed Damaged jar condition (10 damaged jars)
            tenantDb.OperationsJarConditions.Add(new OperationsJarCondition
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                VisitId = Guid.NewGuid(),
                ConditionType = "Cracked Neck",
                Quantity = 10,
                IsDeleted = false,
                CreatedBy = "Admin"
            });

            await tenantDb.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();
            var logger = sp.GetRequiredService<ILogger<BiodropsIntegrationController>>();
            var controller = new BiodropsIntegrationController(service, logger);

            // Act
            var actionResult = await controller.GetTenantInventory(tenantId, CancellationToken.None);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<BiodropsInventoryDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // Verify 20L finished product
            Assert.Single(response.Data.FinishedProducts);
            var finishedProduct = response.Data.FinishedProducts[0];
            Assert.Equal(product20LId, finishedProduct.ProductId);
            Assert.Equal("Biodrops 20 LTR Water Jar", finishedProduct.ProductName);
            Assert.Equal("BIO-20L-JAR", finishedProduct.Sku);
            Assert.Equal(150m, finishedProduct.AvailableStock);
            Assert.Equal(25m, finishedProduct.ReservedStock);
            Assert.Equal(10m, finishedProduct.DamagedStock);
            Assert.Equal("Jar", finishedProduct.Unit);

            // Verify raw materials
            Assert.Equal(2, response.Data.RawMaterials.Count);

            var preform = response.Data.RawMaterials.First(rm => rm.MaterialId == rawMaterialPreformId);
            Assert.Equal("20L Preform 650g", preform.MaterialName);
            Assert.Equal("RM-PRE-650", preform.Sku);
            Assert.Equal("PREFORM", preform.MaterialCategory);
            Assert.Equal(1200m, preform.AvailableQuantity);
            Assert.Equal(105m, preform.UsedQuantity);
            Assert.Equal(5m, preform.WastedQuantity);
            Assert.Equal("PCS", preform.ConfiguredUnit);

            var cap = response.Data.RawMaterials.First(rm => rm.MaterialId == rawMaterialCapId);
            Assert.Equal("20L Smart Cap", cap.MaterialName);
            Assert.Equal(2500m, cap.AvailableQuantity);
            Assert.Equal(102m, cap.UsedQuantity);
            Assert.Equal(2m, cap.WastedQuantity);
            Assert.Equal("PCS", cap.ConfiguredUnit);
        }

        [Fact]
        public async Task GetTenantInventory_DisabledTenant_ReturnsNotFound()
        {
            // Arrange
            var disabledTenantId = Guid.NewGuid();
            var (platformDb, _, _, sp) = CreateTestEnvironment(disabledTenantId, Guid.NewGuid());

            platformDb.Tenants.Add(new Tenant
            {
                Id = disabledTenantId,
                Name = "Disabled Plant",
                Code = "DIS",
                SchemaName = "tenant_dis",
                Subdomain = "dis",
                IsActive = true,
                IsDeleted = false,
                IsBiodropsProduction = false, // Disabled toggle!
                CreatedBy = "System"
            });
            await platformDb.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();
            var logger = sp.GetRequiredService<ILogger<BiodropsIntegrationController>>();
            var controller = new BiodropsIntegrationController(service, logger);

            // Act
            var actionResult = await controller.GetTenantInventory(disabledTenantId, CancellationToken.None);

            // Assert
            var objectResult = Assert.IsType<ObjectResult>(actionResult.Result);
            Assert.Equal((int)HttpStatusCode.NotFound, objectResult.StatusCode);

            var response = Assert.IsType<ApiResponse<BiodropsInventoryDto>>(objectResult.Value);
            Assert.False(response.Success);
            Assert.Contains("Biodrops Production is not enabled", response.Message);
        }

        [Fact]
        public async Task GetTenantInventory_InvalidOrEmptyTenantId_ReturnsBadRequestOrNotFound()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var service = sp.GetRequiredService<IBiodropsIntegrationService>();
            var logger = sp.GetRequiredService<ILogger<BiodropsIntegrationController>>();
            var controller = new BiodropsIntegrationController(service, logger);

            // Act 1: Empty Guid
            var emptyResult = await controller.GetTenantInventory(Guid.Empty, CancellationToken.None);
            var badRequest = Assert.IsType<ObjectResult>(emptyResult.Result);
            Assert.Equal((int)HttpStatusCode.BadRequest, badRequest.StatusCode);

            // Act 2: Non-existent Guid
            var nonExistentResult = await controller.GetTenantInventory(Guid.NewGuid(), CancellationToken.None);
            var notFound = Assert.IsType<ObjectResult>(nonExistentResult.Result);
            Assert.Equal((int)HttpStatusCode.NotFound, notFound.StatusCode);
        }

        #endregion

        #region 3. Tenant Stock Summary Tests

        [Fact]
        public async Task GetTenantStockSummary_NeverMixesUnits_GroupsStrictlyByUnit()
        {
            // Arrange
            var tenantId = Guid.NewGuid();
            var companyId = Guid.NewGuid();

            var (platformDb, tenantDb, _, sp) = CreateTestEnvironment(tenantId, Guid.NewGuid());

            platformDb.Tenants.Add(new Tenant
            {
                Id = tenantId,
                Name = "PureLife BioDrops Plant",
                Code = "PURE",
                SchemaName = "tenant_pure",
                Subdomain = "pure",
                IsActive = true,
                IsDeleted = false,
                IsBiodropsProduction = true,
                CreatedBy = "System"
            });
            await platformDb.SaveChangesAsync();

            // Seed two 20L finished products
            tenantDb.Products.AddRange(
                new Product
                {
                    Id = Guid.NewGuid(),
                    Name = "20L Mineral Jar",
                    Category = "Jar",
                    CurrentStock = 200m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                },
                new Product
                {
                    Id = Guid.NewGuid(),
                    Name = "20L Alkaline Jar",
                    Category = "Jar",
                    CurrentStock = 120m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                }
            );

            // Seed Raw Materials with MULTIPLE DIFFERENT UNITS (KG, PCS, LITRE)
            tenantDb.RawMaterials.AddRange(
                new RawMaterial
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "Preform 650g",
                    Code = "RM-1",
                    Category = "PREFORM",
                    Unit = "PCS",
                    BaseUnit = "PCS",
                    CurrentStock = 1000m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                },
                new RawMaterial
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "Smart Cap 55mm",
                    Code = "RM-2",
                    Category = "CAP",
                    Unit = "PCS",
                    BaseUnit = "PCS",
                    CurrentStock = 3000m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                },
                new RawMaterial
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "Chlorine Disinfectant",
                    Code = "RM-3",
                    Category = "CHEMICAL",
                    Unit = "LITRE",
                    BaseUnit = "LITRE",
                    CurrentStock = 50m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                },
                new RawMaterial
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    Name = "Hot Melt Glue Granules",
                    Code = "RM-4",
                    Category = "GLUE",
                    Unit = "KG",
                    BaseUnit = "KG",
                    CurrentStock = 25m,
                    IsActive = true,
                    IsDeleted = false,
                    CreatedBy = "Admin"
                }
            );
            await tenantDb.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();
            var logger = sp.GetRequiredService<ILogger<BiodropsIntegrationController>>();
            var controller = new BiodropsIntegrationController(service, logger);

            // Act
            var actionResult = await controller.GetTenantStockSummary(tenantId, CancellationToken.None);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<BiodropsStockSummaryDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);

            // Finished products: 200 + 120 = 320 Jars
            Assert.Equal(320m, response.Data.TotalTwentyLStock);
            Assert.Equal("Jar", response.Data.TotalTwentyLUnit);

            // Raw materials count
            Assert.Equal(4, response.Data.RawMaterials.Count);

            // Verify that units are NEVER mixed: groupedByUnit has separate entries for PCS, LITRE, KG
            var grouped = response.Data.RawMaterialStockByUnit;
            Assert.Equal(3, grouped.Count);

            var pcsGroup = grouped.First(g => g.Unit.Equals("PCS", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(4000m, pcsGroup.TotalQuantity); // 1000 + 3000 PCS
            Assert.Equal(2, pcsGroup.ItemCount);

            var litreGroup = grouped.First(g => g.Unit.Equals("LITRE", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(50m, litreGroup.TotalQuantity);
            Assert.Equal(1, litreGroup.ItemCount);

            var kgGroup = grouped.First(g => g.Unit.Equals("KG", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(25m, kgGroup.TotalQuantity);
            Assert.Equal(1, kgGroup.ItemCount);

            Assert.True(response.Data.InventorySummaryTimestampUtc <= DateTime.UtcNow);
        }

        #endregion

        #region 4. Authentication, Revocation & Security Tests

        [Fact]
        public void Authentication_MissingApiKey_FailsWithUnauthorized()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act
            var result = authService.Authenticate(null, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert
            Assert.False(result.IsAuthorized);
            Assert.False(result.IsRevoked);
            Assert.Contains("missing", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Authentication_InvalidApiKey_FailsWithUnauthorized()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act
            var result = authService.Authenticate("invalid_random_key_9999", "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert
            Assert.False(result.IsAuthorized);
            Assert.False(result.IsRevoked);
            Assert.Contains("Invalid API key", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Authentication_ValidApiKey_Succeeds()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act
            var result = authService.Authenticate(TestValidApiKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert
            Assert.True(result.IsAuthorized);
            Assert.NotNull(result.ClientName);
        }

        [Fact]
        public void Authentication_RevokedApiKey_FailsWithRevokedStatus()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act 1: Configured revoked key
            var result1 = authService.Authenticate(TestRevokedApiKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            Assert.False(result1.IsAuthorized);
            Assert.True(result1.IsRevoked);

            // Act 2: Dynamic runtime revocation
            const string tempKey = "temp_valid_key_to_revoke";
            authService.RevokeApiKey(tempKey, "Security compromise test");

            var result2 = authService.Authenticate(tempKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            Assert.False(result2.IsAuthorized);
            Assert.True(result2.IsRevoked);
            Assert.Contains("revoked", result2.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public async Task AuthFilter_RejectsUnauthorizedRequestsDirectly()
        {
            // Arrange
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid());
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();
            var filter = new BiodropsApiKeyAuthFilter(authService);

            var httpContext = new DefaultHttpContext();
            var actionContext = new ActionContext(httpContext, new Microsoft.AspNetCore.Routing.RouteData(), new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
            var actionExecutingContext = new ActionExecutingContext(actionContext, new List<IFilterMetadata>(), new Dictionary<string, object?>(), controller: null!);

            bool nextCalled = false;

            // Act 1: No Header
            await filter.OnActionExecutionAsync(actionExecutingContext, () =>
            {
                nextCalled = true;
                return Task.FromResult<ActionExecutedContext>(null!);
            });

            // Assert 1
            Assert.False(nextCalled);
            var objResult = Assert.IsType<ObjectResult>(actionExecutingContext.Result);
            Assert.Equal((int)HttpStatusCode.Unauthorized, objResult.StatusCode);

            // Act 2: Revoked Header
            httpContext.Request.Headers["X-API-Key"] = TestRevokedApiKey;
            actionExecutingContext.Result = null;

            await filter.OnActionExecutionAsync(actionExecutingContext, () =>
            {
                nextCalled = true;
                return Task.FromResult<ActionExecutedContext>(null!);
            });

            // Assert 2
            Assert.False(nextCalled);
            var objResult2 = Assert.IsType<ObjectResult>(actionExecutingContext.Result);
            Assert.Equal((int)HttpStatusCode.Forbidden, objResult2.StatusCode);
        }

        [Fact]
        public void Authentication_ValidEnvironmentVariableKey_Succeeds()
        {
            // Arrange: Provide key using double underscore ASP.NET Core environment variable format
            const string envKey = "super_secure_env_integration_key_99999";
            var customConfig = new Dictionary<string, string?>
            {
                { "Integration__Biodrops__ApiKey", envKey }
            };

            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), customConfig);
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act
            var result = authService.Authenticate(envKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert
            Assert.True(result.IsAuthorized);
            Assert.Equal("BiodropsProductionApp", result.ClientName);
        }

        [Fact]
        public void Authentication_MissingProductionKey_FailsSafelyWithoutFallback()
        {
            // Arrange: Empty configuration (no keys set in environment)
            var emptyConfig = new Dictionary<string, string?>();
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), emptyConfig);
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Assert IsConfigured is false
            Assert.False(authService.IsConfigured);

            // Act: Attempt to authenticate with any key or legacy key
            var result1 = authService.Authenticate("any_attempted_key", "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            var result2 = authService.Authenticate(CompromisedLegacyKeyPlaintext, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert: Must fail safely with no fallback
            Assert.False(result1.IsAuthorized);
            Assert.Contains("not configured", result1.ErrorMessage, StringComparison.OrdinalIgnoreCase);

            Assert.False(result2.IsAuthorized);
            Assert.True(result2.IsRevoked);
        }

        [Fact]
        public void Authentication_CompromisedLegacyKey_IsPermanentlyRevokedAndRejected()
        {
            // Arrange: Even if someone accidentally provides the old exposed key in configuration
            var legacyConfig = new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", CompromisedLegacyKeyPlaintext }
            };
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), legacyConfig);
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act
            var result = authService.Authenticate(CompromisedLegacyKeyPlaintext, "10.0.0.1", "/api/v1/integrations/biodrops/tenants");

            // Assert: Always blocked and marked revoked
            Assert.False(result.IsAuthorized);
            Assert.True(result.IsRevoked);
            Assert.Contains("revoked", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Authentication_CredentialRotation_SupportsBothPrimaryAndSecondaryKeys()
        {
            // Arrange: Configure primary key and a secondary key for zero-downtime rotation
            const string primaryKey = "primary_active_secret_key_11111";
            const string secondaryKey = "secondary_rotation_secret_key_22222";

            var rotationConfig = new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", primaryKey },
                { "Integration:Biodrops:SecondaryApiKey", secondaryKey }
            };
            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), rotationConfig);
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();

            // Act 1: Primary key authenticates
            var resultPrimary = authService.Authenticate(primaryKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            Assert.True(resultPrimary.IsAuthorized);
            Assert.Equal("BiodropsProductionApp", resultPrimary.ClientName);

            // Act 2: Secondary key authenticates seamlessly
            var resultSecondary = authService.Authenticate(secondaryKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            Assert.True(resultSecondary.IsAuthorized);
            Assert.Equal("BiodropsRotationApp", resultSecondary.ClientName);

            // Act 3: Revoke primary key post-rotation
            authService.RevokeApiKey(primaryKey, "Completed key rotation");
            var resultPrimaryAfterRevoke = authService.Authenticate(primaryKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");
            var resultSecondaryAfterRevoke = authService.Authenticate(secondaryKey, "127.0.0.1", "/api/v1/integrations/biodrops/tenants");

            Assert.False(resultPrimaryAfterRevoke.IsAuthorized);
            Assert.True(resultPrimaryAfterRevoke.IsRevoked);
            Assert.True(resultSecondaryAfterRevoke.IsAuthorized);
        }

        [Fact]
        public void Authentication_NoCredentialsInLogs()
        {
            // Arrange: Verify logs never contain plaintext keys
            const string secretKey = "super_private_secret_key_never_log_me_33333";
            var mockLogger = new Mock<ILogger<BiodropsIntegrationAuthService>>();

            var configDict = new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", secretKey }
            };
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(configDict).Build();
            var authService = new BiodropsIntegrationAuthService(configuration, mockLogger.Object);

            // Act: Perform successful, invalid, missing, and revoked calls
            authService.Authenticate(secretKey, "192.168.1.10", "/api/v1/integrations/biodrops/tenants");
            authService.Authenticate("invalid_attempt_key_44444", "192.168.1.10", "/api/v1/integrations/biodrops/tenants");
            authService.Authenticate(null, "192.168.1.10", "/api/v1/integrations/biodrops/tenants");

            // Assert: Verify mockLogger was called, but none of the logged formatted strings contain the secretKey or invalid key
            foreach (var invocation in mockLogger.Invocations.Where(i => i.Method.Name == "Log"))
            {
                var loggedMessage = invocation.Arguments[2]?.ToString() ?? string.Empty;
                Assert.DoesNotContain(secretKey, loggedMessage);
                Assert.DoesNotContain("invalid_attempt_key_44444", loggedMessage);
            }
        }

        [Fact]
        public void StartupConfigurationValidation_Production_ValidatesCorrectly()
        {
            // 1. Missing key in production -> Fails
            var emptyConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
            var missingResult = BiodropsConfigurationValidator.Validate(emptyConfig, isProduction: true);
            Assert.False(missingResult.IsValid);
            Assert.Contains("missing required integration API key", missingResult.ErrorMessage);

            // 2. Revoked legacy key in production -> Fails
            var legacyConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", CompromisedLegacyKeyPlaintext }
            }).Build();
            var legacyResult = BiodropsConfigurationValidator.Validate(legacyConfig, isProduction: true);
            Assert.False(legacyResult.IsValid);
            Assert.Contains("revoked credential fingerprint", legacyResult.ErrorMessage);

            // 3. Short key in production -> Fails
            var shortConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", "short_key_123" }
            }).Build();
            var shortResult = BiodropsConfigurationValidator.Validate(shortConfig, isProduction: true);
            Assert.False(shortResult.IsValid);
            Assert.Contains("too short", shortResult.ErrorMessage);

            // 4. Valid strong key in production -> Passes
            var validConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", "strong_production_key_random_64_bytes_entropy_abc123" }
            }).Build();
            var validResult = BiodropsConfigurationValidator.Validate(validConfig, isProduction: true);
            Assert.True(validResult.IsValid);
            Assert.True(validResult.IsConfigured);
        }

        [Fact]
        public void StartupConfigurationValidation_Development_ValidatesCorrectly()
        {
            // Missing key in development -> Valid but with warnings (fails safe at runtime)
            var emptyConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
            var devResult = BiodropsConfigurationValidator.Validate(emptyConfig, isProduction: false);
            Assert.True(devResult.IsValid);
            Assert.False(devResult.IsConfigured);
            Assert.NotEmpty(devResult.Warnings);

            // Valid key in development -> Valid
            var validConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", "dev_local_test_key_12345" }
            }).Build();
            var validDevResult = BiodropsConfigurationValidator.Validate(validConfig, isProduction: false);
            Assert.True(validDevResult.IsValid);
            Assert.True(validDevResult.IsConfigured);
        }

        [Fact]
        public async Task AuthenticationFilter_AllSevenSecurityAuditScenarios_VerifyExpectedStatusCodesAndSafeBehavior()
        {
            // Scenario configuration
            const string primaryKey = "audit_prod_primary_key_abc123456789";
            const string secondaryKey = "audit_prod_secondary_key_xyz987654321";
            const string randomRevokedKey = "revoked_random_token_55555";

            // Hash the random revoked key to test SHA-256 fingerprint matching
            var revokedFingerprintHex = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(randomRevokedKey))).ToLowerInvariant();

            var configDict = new Dictionary<string, string?>
            {
                { "Integration:Biodrops:ApiKey", primaryKey },
                { "Integration:Biodrops:SecondaryApiKey", secondaryKey },
                { "Integration:Biodrops:RevokedKeys", revokedFingerprintHex }
            };

            var (_, _, _, sp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), configDict);
            var authService = sp.GetRequiredService<IBiodropsIntegrationAuthService>();
            var filter = new BiodropsApiKeyAuthFilter(authService);

            async Task<(int StatusCode, bool NextExecuted)> ExecuteRequestAsync(string? headerName, string? headerVal)
            {
                var httpContext = new DefaultHttpContext();
                if (headerName != null && headerVal != null)
                {
                    httpContext.Request.Headers[headerName] = headerVal;
                }

                var actionContext = new ActionContext(httpContext, new Microsoft.AspNetCore.Routing.RouteData(), new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
                var actionExecutingContext = new ActionExecutingContext(actionContext, new List<IFilterMetadata>(), new Dictionary<string, object?>(), controller: null!);

                bool nextExecuted = false;
                await filter.OnActionExecutionAsync(actionExecutingContext, () =>
                {
                    nextExecuted = true;
                    return Task.FromResult<ActionExecutedContext>(null!);
                });

                if (nextExecuted)
                {
                    return ((int)HttpStatusCode.OK, true);
                }

                var objResult = Assert.IsType<ObjectResult>(actionExecutingContext.Result);
                return (objResult.StatusCode ?? 0, false);
            }

            // 1. Correct primary key -> 200
            var (status1, next1) = await ExecuteRequestAsync("X-API-Key", primaryKey);
            Assert.True(next1);
            Assert.Equal((int)HttpStatusCode.OK, status1);

            // 2. Correct secondary key -> 200
            var (status2, next2) = await ExecuteRequestAsync("Authorization", $"Bearer {secondaryKey}");
            Assert.True(next2);
            Assert.Equal((int)HttpStatusCode.OK, status2);

            // 3. Previous exposed key -> 403
            var (status3, next3) = await ExecuteRequestAsync("X-API-Key", CompromisedLegacyKeyPlaintext);
            Assert.False(next3);
            Assert.Equal((int)HttpStatusCode.Forbidden, status3);

            // 4. Invalid key -> 401
            var (status4, next4) = await ExecuteRequestAsync("X-API-Key", "totally_invalid_token_9999");
            Assert.False(next4);
            Assert.Equal((int)HttpStatusCode.Unauthorized, status4);

            // 5. Missing key -> 401
            var (status5, next5) = await ExecuteRequestAsync(null, null);
            Assert.False(next5);
            Assert.Equal((int)HttpStatusCode.Unauthorized, status5);

            // 6. Revoked key -> 403
            var (status6, next6) = await ExecuteRequestAsync("X-API-Key", randomRevokedKey);
            Assert.False(next6);
            Assert.Equal((int)HttpStatusCode.Forbidden, status6);

            // 7. Missing production configuration -> application fails safely (401 Unauthorized / unconfigured)
            var (_, _, _, unconfiguredSp) = CreateTestEnvironment(Guid.NewGuid(), Guid.NewGuid(), new Dictionary<string, string?>());
            var unconfiguredFilter = new BiodropsApiKeyAuthFilter(unconfiguredSp.GetRequiredService<IBiodropsIntegrationAuthService>());

            var unconfiguredContext = new DefaultHttpContext();
            unconfiguredContext.Request.Headers["X-API-Key"] = primaryKey;
            var unconfiguredActionContext = new ActionContext(unconfiguredContext, new Microsoft.AspNetCore.Routing.RouteData(), new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
            var unconfiguredExecContext = new ActionExecutingContext(unconfiguredActionContext, new List<IFilterMetadata>(), new Dictionary<string, object?>(), controller: null!);

            bool unconfiguredNext = false;
            await unconfiguredFilter.OnActionExecutionAsync(unconfiguredExecContext, () =>
            {
                unconfiguredNext = true;
                return Task.FromResult<ActionExecutedContext>(null!);
            });

            Assert.False(unconfiguredNext);
            var unconfiguredResult = Assert.IsType<ObjectResult>(unconfiguredExecContext.Result);
            Assert.Equal((int)HttpStatusCode.Unauthorized, unconfiguredResult.StatusCode);
        }

        #endregion

        #region 5. Cross-Tenant Data Isolation & Read-Only Tests

        [Fact]
        public async Task CrossTenantDataAccess_IsCompletelyPrevented()
        {
            // Arrange
            var tenantAId = Guid.NewGuid();
            var tenantBId = Guid.NewGuid();

            var (platformDb, tenantDbA, tenantDbB, sp) = CreateTestEnvironment(tenantAId, tenantBId);

            platformDb.Tenants.AddRange(
                new Tenant
                {
                    Id = tenantAId,
                    Name = "Tenant Alpha (Biodrops)",
                    Code = "ALPHA",
                    SchemaName = "tenant_alpha",
                    Subdomain = "alpha",
                    IsActive = true,
                    IsDeleted = false,
                    IsBiodropsProduction = true,
                    CreatedBy = "System"
                },
                new Tenant
                {
                    Id = tenantBId,
                    Name = "Tenant Beta (Biodrops)",
                    Code = "BETA",
                    SchemaName = "tenant_beta",
                    Subdomain = "beta",
                    IsActive = true,
                    IsDeleted = false,
                    IsBiodropsProduction = true,
                    CreatedBy = "System"
                }
            );
            await platformDb.SaveChangesAsync();

            // Tenant A Product: 100 cases
            tenantDbA.Products.Add(new Product
            {
                Id = Guid.NewGuid(),
                Name = "Tenant A 20L Jar",
                Category = "Jar",
                CurrentStock = 100m,
                IsActive = true,
                IsDeleted = false,
                CreatedBy = "Admin"
            });
            await tenantDbA.SaveChangesAsync();

            // Tenant B Product: 500 cases
            tenantDbB.Products.Add(new Product
            {
                Id = Guid.NewGuid(),
                Name = "Tenant B 20L Jar",
                Category = "Jar",
                CurrentStock = 500m,
                IsActive = true,
                IsDeleted = false,
                CreatedBy = "Admin"
            });
            await tenantDbB.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();

            // Act
            var inventoryA = await service.GetTenantInventoryAsync(tenantAId);
            var inventoryB = await service.GetTenantInventoryAsync(tenantBId);

            // Assert
            Assert.NotNull(inventoryA);
            Assert.NotNull(inventoryB);

            // Tenant A sees only Tenant A's stock (100)
            Assert.Equal("Tenant Alpha (Biodrops)", inventoryA.CompanyName);
            Assert.Equal(100m, inventoryA.FinishedProducts[0].AvailableStock);
            Assert.Equal("Tenant A 20L Jar", inventoryA.FinishedProducts[0].ProductName);

            // Tenant B sees only Tenant B's stock (500)
            Assert.Equal("Tenant Beta (Biodrops)", inventoryB.CompanyName);
            Assert.Equal(500m, inventoryB.FinishedProducts[0].AvailableStock);
            Assert.Equal("Tenant B 20L Jar", inventoryB.FinishedProducts[0].ProductName);
        }

        [Fact]
        public async Task ReadOnlyIntegration_CannotModifyDatabaseOrInventory()
        {
            // Arrange
            var tenantId = Guid.NewGuid();
            var (platformDb, tenantDb, _, sp) = CreateTestEnvironment(tenantId, Guid.NewGuid());

            platformDb.Tenants.Add(new Tenant
            {
                Id = tenantId,
                Name = "ReadOnly Test Plant",
                Code = "RO",
                SchemaName = "tenant_ro",
                Subdomain = "ro",
                IsActive = true,
                IsDeleted = false,
                IsBiodropsProduction = true,
                CreatedBy = "System"
            });
            await platformDb.SaveChangesAsync();

            var rawMaterialId = Guid.NewGuid();
            tenantDb.RawMaterials.Add(new RawMaterial
            {
                Id = rawMaterialId,
                TenantId = tenantId,
                CompanyId = Guid.NewGuid(),
                Name = "Test Material",
                Code = "RM-TEST",
                Category = "PREFORM",
                Unit = "PCS",
                BaseUnit = "PCS",
                CurrentStock = 777m,
                IsActive = true,
                IsDeleted = false,
                CreatedBy = "Admin"
            });
            await tenantDb.SaveChangesAsync();

            var service = sp.GetRequiredService<IBiodropsIntegrationService>();

            // Act: Call inventory and summary multiple times
            await service.GetTenantInventoryAsync(tenantId);
            await service.GetTenantStockSummaryAsync(tenantId);

            // Assert: CurrentStock must remain strictly unchanged (777)
            var materialAfter = await tenantDb.RawMaterials.FindAsync(rawMaterialId);
            Assert.NotNull(materialAfter);
            Assert.Equal(777m, materialAfter.CurrentStock);
        }

        #endregion
    }
}
