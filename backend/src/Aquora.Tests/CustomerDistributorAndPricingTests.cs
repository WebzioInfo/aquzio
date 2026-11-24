using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using Aquora.API.Controllers;
using Aquora.API.Hubs;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.DTOs.Customers;
using Aquora.Domain.Entities;
using Aquora.Persistence.Context;
using Aquora.Shared.Models;

namespace Aquora.Tests
{
    public class CustomerDistributorAndPricingTests
    {
        private (TenantDbContext Context, Guid TenantId, Guid CompanyId, Guid BrandId) CreateContext()
        {
            var tenantId = Guid.NewGuid();
            var companyId = Guid.NewGuid();
            var brandId = Guid.NewGuid();

            var options = new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var mockTenantProvider = new Mock<ITenantProvider>();
            mockTenantProvider.Setup(x => x.TenantId).Returns(tenantId);
            mockTenantProvider.Setup(x => x.TenantSchemaName).Returns("public");

            var mockCurrentUserContext = new Mock<ICurrentUserContext>();
            mockCurrentUserContext.Setup(x => x.UserId).Returns("test-user-id");
            mockCurrentUserContext.Setup(x => x.TenantId).Returns(tenantId);
            mockCurrentUserContext.Setup(x => x.Roles).Returns(new List<string> { "Admin", "Operator" });

            var mockDateTimeProvider = new Mock<IDateTimeProvider>();
            mockDateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);

            var context = new TenantDbContext(options, mockTenantProvider.Object, mockCurrentUserContext.Object, mockDateTimeProvider.Object);

            var company = new Company
            {
                Id = companyId,
                TenantId = tenantId,
                Name = "Aquora Test Bottling",
                Code = "ATB-01",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.Companies.Add(company);

            var brand = new Brand
            {
                Id = brandId,
                Name = "Aquora Brand",
                IsActive = true
            };
            context.Brands.Add(brand);

            context.SaveChanges();

            return (context, tenantId, companyId, brandId);
        }

        private Mock<ICurrentUserContext> CreateUserContextMock(Guid tenantId, string role = "Admin")
        {
            var mock = new Mock<ICurrentUserContext>();
            mock.Setup(x => x.TenantId).Returns(tenantId);
            mock.Setup(x => x.UserId).Returns("test-user-id");
            mock.Setup(x => x.Roles).Returns(new List<string> { role });
            return mock;
        }

        [Fact]
        public async Task Phase2_QuickAddCustomer_CreatesValidCustomer_InDatabase()
        {
            var (context, tenantId, companyId, _) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(context, mockUserContext.Object, mockLedgerService.Object, mockLogger.Object);
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            var request = new QuickCreateCustomerRequest
            {
                CustomerName = "Al-Noor Supermarket",
                Phone = "+966551234567",
                CustomerType = "B2B",
                PaymentTerms = "Net 15",
                City = "Riyadh"
            };

            var actionResult = await controller.QuickCreateCustomer(request);
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var envelope = Assert.IsType<ApiResponse<CustomerDto>>(createdResult.Value);
            var customer = envelope.Data;

            Assert.NotNull(customer);
            Assert.NotEqual(Guid.Empty, customer.Id);
            Assert.Equal("Al-Noor Supermarket", customer.CustomerName);
            Assert.Equal("+966551234567", customer.Phone);
            Assert.Equal("B2B", customer.CustomerType);
            Assert.Equal("Net 15", customer.PaymentTerms);

            // Verify database persistence
            var dbCustomer = await context.Customers.FirstOrDefaultAsync(c => c.Id == customer.Id);
            Assert.NotNull(dbCustomer);
            Assert.Equal("Al-Noor Supermarket", dbCustomer.CustomerName);
            Assert.Equal(tenantId, dbCustomer.TenantId);
        }

        [Fact]
        public async Task Phase2_QuickAddDistributor_CreatesCustomer_And_LinksDistributorProfile()
        {
            var (context, tenantId, companyId, _) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(context, mockUserContext.Object, mockLedgerService.Object, mockLogger.Object);
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            var request = new QuickCreateCustomerRequest
            {
                CustomerName = "Al-Riyadh Fast Distribution",
                Phone = "+966509876543",
                CustomerType = "Distributor",
                DistributorType = "Normal Distributor",
                PaymentTerms = "COD",
                AssignedRoute = "North Ring Route",
                AssignedVehicle = "KSA-9988"
            };

            var actionResult = await controller.QuickCreateCustomer(request);
            var createdResult = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var envelope = Assert.IsType<ApiResponse<CustomerDto>>(createdResult.Value);
            var customer = envelope.Data;

            Assert.NotNull(customer);
            Assert.Equal("Distributor", customer.CustomerType);

            // Verify TwentyLDistributorProfile was created and linked
            var profile = await context.TwentyLDistributorProfiles
                .FirstOrDefaultAsync(p => p.CustomerId == customer.Id && p.CompanyId == companyId);
            Assert.NotNull(profile);
            Assert.Equal("Normal Distributor", profile.DistributorType);
            Assert.Equal("COD", profile.PaymentTerms);

            // Verify customer has assigned route & vehicle
            var dbCustomer = await context.Customers.FirstOrDefaultAsync(c => c.Id == customer.Id);
            Assert.NotNull(dbCustomer);
            Assert.Equal("North Ring Route", dbCustomer.AssignedRoute);
            Assert.Equal("KSA-9988", dbCustomer.AssignedVehicle);
        }

        [Fact]
        public async Task Phase3_ProductWiseCustomerPricing_ResolvesNegotiatedPrice_Correctly()
        {
            var (context, tenantId, companyId, brandId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(context, mockUserContext.Object, mockLedgerService.Object, mockLogger.Object);
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            // Seed 2 products with standard catalog prices
            var prod1 = new Product
            {
                Id = Guid.NewGuid(),
                BrandId = brandId,
                Name = "Biodrops 500ml Case",
                SellingPrice = 120.00m,
                CostPrice = 80.00m,
                IsActive = true
            };
            var prod2 = new Product
            {
                Id = Guid.NewGuid(),
                BrandId = brandId,
                Name = "Biodrops 1.5L Case",
                SellingPrice = 150.00m,
                CostPrice = 100.00m,
                IsActive = true
            };
            context.Products.AddRange(prod1, prod2);

            // Seed Customer A
            var customerA = new Customer
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                TenantId = tenantId,
                CustomerName = "Supermarket Delta",
                CustomerCode = "CUST-DELTA",
                IsActive = true
            };
            context.Customers.Add(customerA);

            // Seed custom price for Product 1 (110.00 vs 120.00 standard)
            var customPrice1 = new CustomerProductPrice
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                TenantId = tenantId,
                CustomerId = customerA.Id,
                ProductId = prod1.Id,
                CustomPrice = 110.00m,
                IsActive = true
            };
            context.CustomerProductPrices.Add(customPrice1);
            await context.SaveChangesAsync();

            // Product 1 has negotiated price -> should return 110.00 with CustomerAgreement source
            var pricingProd1 = await controller.GetApplicablePrice(customerA.Id, prod1.Id);
            var okProd1 = Assert.IsType<OkObjectResult>(pricingProd1.Result);
            var envelope1 = Assert.IsType<ApiResponse<ApplicablePriceResponseDto>>(okProd1.Value);
            Assert.NotNull(envelope1.Data);
            Assert.Equal(110.00m, envelope1.Data.ApplicablePrice);
            Assert.Equal("CustomerAgreement", envelope1.Data.PriceSource);

            // Product 2 has NO negotiated price -> should fallback to standard catalog price (150.00)
            var pricingProd2 = await controller.GetApplicablePrice(customerA.Id, prod2.Id);
            var okProd2 = Assert.IsType<OkObjectResult>(pricingProd2.Result);
            var envelope2 = Assert.IsType<ApiResponse<ApplicablePriceResponseDto>>(okProd2.Value);
            Assert.NotNull(envelope2.Data);
            Assert.Equal(150.00m, envelope2.Data.ApplicablePrice);
            Assert.Equal("StandardCatalog", envelope2.Data.PriceSource);
        }

        [Fact]
        public async Task Phase4_SalesTransaction_PaymentFlexibility_PartialAndCOD_HandledCorrectly()
        {
            var (context, tenantId, companyId, brandId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockInventoryMovementService = new Mock<IInventoryMovementService>();
            var mockPlatformContext = new Mock<IPlatformDbContext>();
            var mockDashboardHub = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<DashboardHub>>();
            var mockLedgerService = new Mock<ILedgerService>();
            var mockTenantProvider = new Mock<ITenantProvider>();
            var mockInvoicePdfService = new Mock<IInvoicePdfService>();

            var controller = new SalesController(
                context,
                mockUserContext.Object,
                mockInventoryMovementService.Object,
                mockPlatformContext.Object,
                mockDashboardHub.Object,
                mockLedgerService.Object,
                mockTenantProvider.Object,
                mockInvoicePdfService.Object
            );
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                TenantId = tenantId,
                CustomerName = "Retailer Prime",
                CustomerCode = "CUST-PRIME",
                IsActive = true
            };
            var product = new Product
            {
                Id = Guid.NewGuid(),
                BrandId = brandId,
                Name = "Water Gallon 20L",
                SellingPrice = 10.00m,
                CostPrice = 5.00m,
                CurrentStock = 100,
                IsActive = true
            };
            context.Customers.Add(customer);
            context.Products.Add(product);
            await context.SaveChangesAsync();

            // Scenario 1: COD order with 0 amount received -> MUST NOT be marked Paid!
            var codRequest = new CreateSalesTransactionRequest
            {
                TransactionType = "Sales Dispatch",
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 10,
                UnitPrice = 10.00m,
                PaymentMethod = "Cash",
                PaymentTerms = "COD",
                AmountReceived = 0m // Not collected yet
            };

            var codResult = await controller.CreateSalesTransaction(codRequest);
            var codOk = Assert.IsType<OkObjectResult>(codResult.Result);
            var codEnvelope = Assert.IsType<ApiResponse<SalesTransactionDto>>(codOk.Value);
            Assert.NotNull(codEnvelope.Data);
            SalesTransactionDto codTxn = codEnvelope.Data;

            Assert.Equal("Pending", codTxn.PaymentStatus);
            Assert.Equal("COD", codTxn.PaymentTerms);
            Assert.Equal(0m, codTxn.AmountReceived);

            // Scenario 2: Partial payment on a 100.00 order (receive 40.00 now)
            var partialRequest = new CreateSalesTransactionRequest
            {
                TransactionType = "Sales Dispatch",
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 10,
                UnitPrice = 10.00m,
                PaymentMethod = "Cash",
                PaymentTerms = "Net 15",
                AmountReceived = 40.00m
            };

            var partialResult = await controller.CreateSalesTransaction(partialRequest);
            var partialOk = Assert.IsType<OkObjectResult>(partialResult.Result);
            var partialEnvelope = Assert.IsType<ApiResponse<SalesTransactionDto>>(partialOk.Value);
            Assert.NotNull(partialEnvelope.Data);
            SalesTransactionDto partialTxn = partialEnvelope.Data;

            Assert.Equal("Partial", partialTxn.PaymentStatus);
            Assert.Equal(40.00m, partialTxn.AmountReceived);
            Assert.Equal(100.00m, partialTxn.TotalAmount);
            Assert.Equal("Net 15", partialTxn.PaymentTerms);
        }
    }
}
