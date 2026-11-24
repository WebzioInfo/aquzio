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
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.DTOs.Customers;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.Finance;
using Aquora.Persistence.Context;
using Aquora.Shared.Models;

namespace Aquora.Tests
{
    public class SalesAndCreditSystemTests
    {
        private (TenantDbContext Context, Guid TenantId, Guid CompanyId) CreateContext()
        {
            var tenantId = Guid.NewGuid();
            var companyId = Guid.NewGuid();

            var options = new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var mockTenantProvider = new Mock<ITenantProvider>();
            mockTenantProvider.Setup(x => x.TenantId).Returns(tenantId);
            mockTenantProvider.Setup(x => x.TenantSchemaName).Returns("public");

            var mockCurrentUserContext = new Mock<ICurrentUserContext>();
            mockCurrentUserContext.Setup(x => x.UserId).Returns("test-user");

            var mockDateTimeProvider = new Mock<IDateTimeProvider>();
            mockDateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);

            var context = new TenantDbContext(options, mockTenantProvider.Object, mockCurrentUserContext.Object, mockDateTimeProvider.Object);

            // Seed company
            var company = new Company
            {
                Id = companyId,
                TenantId = tenantId,
                Name = "Test Aqua Company",
                Code = "TAC-01",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            context.Companies.Add(company);
            context.SaveChanges();

            return (context, tenantId, companyId);
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
        public async Task Test01_CreditSale_IncreasesCustomerOutstanding_And_RequiresCustomer()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockInventoryMovementService = new Mock<IInventoryMovementService>();
            var mockPlatformContext = new Mock<IPlatformDbContext>();
            var mockDashboardHub = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<Aquora.API.Hubs.DashboardHub>>();
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

            // Seed Product
            var product = new Product
            {
                Id = Guid.NewGuid(),
                Name = "Mineral Water 1L",
                SellingPrice = 20.0m,
                CostPrice = 12.0m,
                CurrentStock = 100,
                IsActive = true
            };
            context.Products.Add(product);

            // Seed Customer
            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-00001",
                CustomerName = "Royal Distributors",
                Phone = "9876543210",
                OutstandingPlaceholder = 1000m,
                IsActive = true
            };
            context.Customers.Add(customer);
            await context.SaveChangesAsync();

            // Act: Credit Sale
            var request = new CreateSalesTransactionRequest
            {
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 50,
                UnitPrice = 20.0m,
                TotalAmount = 1000.0m,
                TransactionType = "Sales Dispatch",
                TransactionDate = DateTime.UtcNow,
                PaymentMethod = "Credit"
            };

            var actionResult = await controller.CreateSalesTransaction(request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<SalesTransactionDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.Equal("Pending", response.Data.PaymentStatus);
            Assert.Equal(1000.0m, response.Data.OutstandingAmount);
            Assert.Equal(0m, response.Data.AmountReceived);

            // Verify Customer Outstanding increased from 1000 to 2000
            var updatedCustomer = await context.Customers.FindAsync(customer.Id);
            Assert.Equal(2000.0m, updatedCustomer!.OutstandingPlaceholder);
        }

        [Fact]
        public async Task Test02_CashBankSale_DoesNotIncreaseCustomerOutstanding()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockInventoryMovementService = new Mock<IInventoryMovementService>();
            var mockPlatformContext = new Mock<IPlatformDbContext>();
            var mockDashboardHub = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<Aquora.API.Hubs.DashboardHub>>();
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

            // Seed Product & Customer
            var product = new Product { Id = Guid.NewGuid(), Name = "Water 20L", SellingPrice = 50.0m, CurrentStock = 200, IsActive = true };
            var customer = new Customer { Id = Guid.NewGuid(), TenantId = tenantId, CompanyId = companyId, CustomerCode = "CUS-00002", CustomerName = "Apollo Clinic", Phone = "9876543211", OutstandingPlaceholder = 500m, IsActive = true };
            context.Products.Add(product);
            context.Customers.Add(customer);
            await context.SaveChangesAsync();

            // Act: Cash Sale
            var request = new CreateSalesTransactionRequest
            {
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 10,
                UnitPrice = 50.0m,
                TotalAmount = 500.0m,
                TransactionType = "Sales Dispatch",
                TransactionDate = DateTime.UtcNow,
                PaymentMethod = "Cash"
            };

            var actionResult = await controller.CreateSalesTransaction(request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<SalesTransactionDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.Equal("Paid", response.Data.PaymentStatus);
            Assert.Equal(0m, response.Data.OutstandingAmount);
            Assert.Equal(500.0m, response.Data.AmountReceived);

            // Customer outstanding should remain 500 (unchanged)
            var updatedCustomer = await context.Customers.FindAsync(customer.Id);
            Assert.Equal(500.0m, updatedCustomer!.OutstandingPlaceholder);
        }

        [Fact]
        public async Task Test03_CustomerPaymentCollection_DecreasesOutstanding_And_UpdatesLedger()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(
                context,
                mockUserContext.Object,
                mockLedgerService.Object,
                mockLogger.Object
            );
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            // Seed Customer with ₹3,000 outstanding
            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-00003",
                CustomerName = "St. Mary Hospital",
                Phone = "9876543212",
                OutstandingPlaceholder = 3000m,
                IsActive = true
            };
            context.Customers.Add(customer);

            // Seed Cash Book
            var cashBook = new CashBook
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                Name = "Main Counter Cash",
                CurrentBalance = 1000m,
                IsActive = true
            };
            context.CashBooks.Add(cashBook);
            await context.SaveChangesAsync();

            // Act: Record payment of ₹2,000 against customer
            var request = new RecordCustomerPaymentRequest
            {
                Amount = 2000m,
                PaymentMethod = "Cash",
                CashBookId = cashBook.Id,
                PaymentDate = DateTime.UtcNow,
                ReferenceNumber = "PAY-REC-001",
                Remarks = "Part payment received by Cash"
            };

            var actionResult = await controller.RecordCustomerPayment(customer.Id, request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<CustomerDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.Equal(1000.0m, response.Data.OutstandingPlaceholder);

            // Verify Ledger Service was called for Cash Collection
            mockLedgerService.Verify(l => l.RecordCashTransactionAsync(
                cashBook.Id,
                It.IsAny<DateTime>(),
                "PAY-REC-001",
                "Customer Collection",
                It.IsAny<string>(),
                0m,
                2000m,
                customer.Id,
                "CustomerPayment"
            ), Times.Once);
        }

        [Fact]
        public async Task Test04_CustomerPaymentCollection_RejectsExceedingAmount_And_ZeroOutstanding()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(
                context,
                mockUserContext.Object,
                mockLedgerService.Object,
                mockLogger.Object
            );
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            // Seed Customer with ₹500 outstanding
            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-00004",
                CustomerName = "Apollo Pharmacy",
                Phone = "9876543219",
                OutstandingPlaceholder = 500m,
                IsActive = true
            };
            context.Customers.Add(customer);

            var cashBook = new CashBook
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                Name = "Counter Cash",
                CurrentBalance = 100m,
                IsActive = true
            };
            context.CashBooks.Add(cashBook);
            await context.SaveChangesAsync();

            // Act 1: Attempt to collect ₹600 (exceeds ₹500)
            var overRequest = new RecordCustomerPaymentRequest
            {
                Amount = 600m,
                PaymentMethod = "Cash",
                CashBookId = cashBook.Id
            };

            var badResult = await controller.RecordCustomerPayment(customer.Id, overRequest);
            var badObjectResult = Assert.IsType<BadRequestObjectResult>(badResult.Result);
            var badResponse = Assert.IsType<ApiResponse<CustomerDto>>(badObjectResult.Value);
            Assert.False(badResponse.Success);
            Assert.Contains("cannot exceed current customer outstanding balance", badResponse.Message);

            // Act 2: Pay full ₹500
            var exactRequest = new RecordCustomerPaymentRequest
            {
                Amount = 500m,
                PaymentMethod = "Cash",
                CashBookId = cashBook.Id
            };

            var okResult = await controller.RecordCustomerPayment(customer.Id, exactRequest);
            var okObjectResult = Assert.IsType<OkObjectResult>(okResult.Result);
            var okResponse = Assert.IsType<ApiResponse<CustomerDto>>(okObjectResult.Value);
            Assert.True(okResponse.Success);
            Assert.Equal(0m, okResponse.Data.OutstandingPlaceholder);

            // Act 3: Attempt to collect again when outstanding is ₹0
            var zeroResult = await controller.RecordCustomerPayment(customer.Id, exactRequest);
            var zeroObjectResult = Assert.IsType<BadRequestObjectResult>(zeroResult.Result);
            var zeroResponse = Assert.IsType<ApiResponse<CustomerDto>>(zeroObjectResult.Value);
            Assert.False(zeroResponse.Success);
            Assert.Contains("no outstanding balance", zeroResponse.Message);
        }

        [Fact]
        public async Task Test05_FIFO_CreditSalePaymentAllocation()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockLedgerService = new Mock<ILedgerService>();
            var mockLogger = new Mock<ILogger<CustomersController>>();

            var controller = new CustomersController(
                context,
                mockUserContext.Object,
                mockLedgerService.Object,
                mockLogger.Object
            );
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            // Seed Customer with ₹3,000 outstanding (from 2 credit sales)
            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-00005",
                CustomerName = "Webzio Tech",
                Phone = "9876543299",
                OutstandingPlaceholder = 3000m,
                IsActive = true
            };
            context.Customers.Add(customer);

            // Sale 1: ₹1,000 (oldest)
            var sale1 = new SalesTransaction
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerId = customer.Id,
                TransactionNumber = "SAL-001",
                Cases = 10,
                TotalAmount = 1000m,
                AmountReceived = 0m,
                OutstandingAmount = 1000m,
                PaymentStatus = "Pending",
                PaymentMethod = "Credit",
                TransactionDate = DateTime.UtcNow.AddDays(-2)
            };
            // Sale 2: ₹2,000 (newer)
            var sale2 = new SalesTransaction
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerId = customer.Id,
                TransactionNumber = "SAL-002",
                Cases = 20,
                TotalAmount = 2000m,
                AmountReceived = 0m,
                OutstandingAmount = 2000m,
                PaymentStatus = "Pending",
                PaymentMethod = "Credit",
                TransactionDate = DateTime.UtcNow.AddDays(-1)
            };
            context.SalesTransactions.AddRange(sale1, sale2);

            var cashBook = new CashBook
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                Name = "Counter Cash",
                CurrentBalance = 0m,
                IsActive = true
            };
            context.CashBooks.Add(cashBook);
            await context.SaveChangesAsync();

            // Act: Collect ₹1,500
            var request = new RecordCustomerPaymentRequest
            {
                Amount = 1500m,
                PaymentMethod = "Cash",
                CashBookId = cashBook.Id
            };

            var actionResult = await controller.RecordCustomerPayment(customer.Id, request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<CustomerDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.Equal(1500m, response.Data.OutstandingPlaceholder);

            // Verify FIFO allocation:
            // Sale 1 (₹1,000) should be fully paid (Paid, Outstanding = 0)
            var updatedSale1 = await context.SalesTransactions.FindAsync(sale1.Id);
            Assert.Equal(1000m, updatedSale1!.AmountReceived);
            Assert.Equal(0m, updatedSale1.OutstandingAmount);
            Assert.Equal("Paid", updatedSale1.PaymentStatus);

            // Sale 2 (₹2,000) should have ₹500 allocated (Partially Paid, Outstanding = 1500)
            var updatedSale2 = await context.SalesTransactions.FindAsync(sale2.Id);
            Assert.Equal(500m, updatedSale2!.AmountReceived);
            Assert.Equal(1500m, updatedSale2.OutstandingAmount);
            Assert.Equal("Partially Paid", updatedSale2.PaymentStatus);
        }

        [Fact]
        public async Task Test06_CreateSalesTransaction_WithCreditAndGst_CalculatesCorrectly_AndUsesExecutionStrategy()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockInventoryMovementService = new Mock<IInventoryMovementService>();
            var mockPlatformContext = new Mock<IPlatformDbContext>();
            var mockDashboardHub = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<Aquora.API.Hubs.DashboardHub>>();
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

            var product = new Product
            {
                Id = Guid.NewGuid(),
                Name = "Packaged Water 500ml",
                SellingPrice = 100m,
                CostPrice = 60m,
                CurrentStock = 50,
                IsActive = true
            };
            context.Products.Add(product);

            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-CREDIT",
                CustomerName = "Shibal Distributor",
                OutstandingPlaceholder = 10m,
                CreditLimit = 5000m,
                IsActive = true
            };
            context.Customers.Add(customer);
            await context.SaveChangesAsync();

            var request = new CreateSalesTransactionRequest
            {
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 1,
                UnitPrice = 100m,
                IsGstApplicable = true,
                GstRate = 5m,
                PaymentMethod = "Credit",
                PaymentTerms = "Credit",
                AmountReceived = 0m,
                TransactionType = "Sales Dispatch",
                TransactionDate = DateTime.UtcNow
            };

            var actionResult = await controller.CreateSalesTransaction(request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<SalesTransactionDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Equal(105m, response.Data.TotalAmount); // 100 + 5% GST
            Assert.Equal(0m, response.Data.AmountReceived);
            Assert.Equal(105m, response.Data.OutstandingAmount);
            Assert.Equal("Pending", response.Data.PaymentStatus);

            // Verify customer outstanding increased: 10 + 105 = 115
            var updatedCustomer = await context.Customers.FindAsync(customer.Id);
            Assert.Equal(115m, updatedCustomer!.OutstandingPlaceholder);

            // Verify inventory movement recorded
            mockInventoryMovementService.Verify(m => m.RecordProductMovementAsync(
                It.IsAny<ITenantDbContext>(),
                product.Id,
                -1m,
                "SalesTransaction",
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                tenantId,
                companyId,
                It.IsAny<string>()), Times.Once);
        }

        [Fact]
        public async Task Test07_CreateSalesTransaction_DirectPayment_SetsAmountReceived_AndPaidStatus()
        {
            var (context, tenantId, companyId) = CreateContext();
            var mockUserContext = CreateUserContextMock(tenantId);
            var mockInventoryMovementService = new Mock<IInventoryMovementService>();
            var mockPlatformContext = new Mock<IPlatformDbContext>();
            var mockDashboardHub = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<Aquora.API.Hubs.DashboardHub>>();
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

            var product = new Product
            {
                Id = Guid.NewGuid(),
                Name = "Packaged Water 20L",
                SellingPrice = 100m,
                CostPrice = 40m,
                CurrentStock = 20,
                IsActive = true
            };
            context.Products.Add(product);

            var customer = new Customer
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                CustomerCode = "CUS-CASH",
                CustomerName = "Direct Cash Customer",
                OutstandingPlaceholder = 0m,
                IsActive = true
            };
            context.Customers.Add(customer);

            var cashBook = new CashBook
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                Name = "Main Cash Register",
                IsActive = true
            };
            context.CashBooks.Add(cashBook);
            await context.SaveChangesAsync();

            var request = new CreateSalesTransactionRequest
            {
                CustomerId = customer.Id,
                ProductId = product.Id,
                Cases = 1,
                UnitPrice = 100m,
                IsGstApplicable = true,
                GstRate = 5m,
                PaymentMethod = "Cash",
                PaymentTerms = "Immediate",
                AmountReceived = 105m,
                CashBookId = cashBook.Id,
                TransactionType = "Sales Dispatch",
                TransactionDate = DateTime.UtcNow
            };

            var actionResult = await controller.CreateSalesTransaction(request);
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var response = Assert.IsType<ApiResponse<SalesTransactionDto>>(okResult.Value);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
            Assert.Equal(105m, response.Data.TotalAmount);
            Assert.Equal(105m, response.Data.AmountReceived);
            Assert.Equal(0m, response.Data.OutstandingAmount);
            Assert.Equal("Paid", response.Data.PaymentStatus);

            // Customer outstanding remains 0
            var updatedCustomer = await context.Customers.FindAsync(customer.Id);
            Assert.Equal(0m, updatedCustomer!.OutstandingPlaceholder);

            // Verify cash book ledger was recorded
            mockLedgerService.Verify(l => l.RecordCashTransactionAsync(
                cashBook.Id,
                It.IsAny<DateTime>(),
                It.IsAny<string>(),
                "Sales Receipt",
                It.IsAny<string>(),
                0m,
                105m,
                It.IsAny<Guid>(),
                "SalesTransaction"), Times.Once);
        }
    }
}
