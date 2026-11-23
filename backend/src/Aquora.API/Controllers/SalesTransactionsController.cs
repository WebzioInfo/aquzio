using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.Finance;
using Aquora.Shared.Models;
using Aquora.Application.DTOs.Finance;

using Microsoft.AspNetCore.SignalR;
using Aquora.API.Hubs;

namespace Aquora.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/v1/[controller]")]
    public class SalesController : ApiControllerBase
    {
        private readonly ITenantDbContext _tenantContext;
        private readonly ICurrentUserContext _currentUserContext;
        private readonly IInventoryMovementService _inventoryMovementService;
        private readonly IPlatformDbContext _platformContext;
        private readonly IHubContext<DashboardHub> _dashboardHub;
        private readonly ILedgerService _ledgerService;
        private readonly ITenantProvider _tenantProvider;
        private readonly IInvoicePdfService _invoicePdfService;

        public SalesController(
            ITenantDbContext tenantContext,
            ICurrentUserContext currentUserContext,
            IInventoryMovementService inventoryMovementService,
            IPlatformDbContext platformContext,
            IHubContext<DashboardHub> dashboardHub,
            ILedgerService ledgerService,
            ITenantProvider tenantProvider,
            IInvoicePdfService invoicePdfService)
        {
            _tenantContext = tenantContext;
            _currentUserContext = currentUserContext;
            _inventoryMovementService = inventoryMovementService;
            _platformContext = platformContext;
            _dashboardHub = dashboardHub;
            _ledgerService = ledgerService;
            _tenantProvider = tenantProvider;
            _invoicePdfService = invoicePdfService;
        }

        private async Task NotifyDashboardAsync(string eventName, object? data = null)
        {
            try
            {
                var tenantId = _currentUserContext.TenantId.ToString();
                await _dashboardHub.Clients.Group($"tenant_{tenantId}").SendAsync("DashboardEvent", new
                {
                    event_type = eventName,
                    tenant_id = tenantId,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    payload = data
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SIGNALR WARNING]: Failed to emit dashboard event '{eventName}': {ex.Message}");
            }
        }

        private static bool IsBankPaymentMethod(string? paymentMethod)
        {
            var method = paymentMethod?.Trim();
            return method != null &&
                (method.Equals("Bank", StringComparison.OrdinalIgnoreCase) ||
                 method.Equals("BankAccount", StringComparison.OrdinalIgnoreCase) ||
                 method.Equals("UPI", StringComparison.OrdinalIgnoreCase) ||
                 method.Equals("Cheque", StringComparison.OrdinalIgnoreCase));
        }

        private static void CalculateDispatchTax(CreateSalesTransactionRequest request, Product product)
        {
            if (!request.IsGstApplicable)
            {
                request.GstRate = 0m;
                request.TaxAmount = request.CGST = request.SGST = request.IGST = 0m;
                return;
            }
            var isProductConfiguredRate = product.GstRate.HasValue && product.GstRate.Value == request.GstRate;
            if (!new[] { 0m, 5m, 12m, 18m, 28m }.Contains(request.GstRate) && !isProductConfiguredRate)
                throw new InvalidOperationException("GST rate must be one of 0%, 5%, 12%, 18%, or 28%, or the product's configured GST rate.");

            var taxableAmount = Math.Max(0m, (request.Cases * request.UnitPrice) - request.DiscountAmount);
            request.TaxAmount = Math.Round(taxableAmount * request.GstRate / 100m, 2, MidpointRounding.AwayFromZero);
            if (string.Equals(request.TaxTreatment, "InterState", StringComparison.OrdinalIgnoreCase))
            {
                request.CGST = request.SGST = 0m;
                request.IGST = request.TaxAmount;
            }
            else
            {
                request.CGST = Math.Round(request.TaxAmount / 2m, 2, MidpointRounding.AwayFromZero);
                request.SGST = request.TaxAmount - request.CGST;
                request.IGST = 0m;
                request.TaxTreatment = "IntraState";
            }
        }
        private bool IsAuthorizedToWrite()
        {
            var allowedRoles = new[] { "Owner", "CompanyOwner", "SuperAdmin", "PlatformAdmin", "CompanyAdmin", "Accountant", "Admin", "Manager", "Sales" };
            return _currentUserContext.Roles.Any(r => allowedRoles.Contains(r, StringComparer.OrdinalIgnoreCase));
        }

        private static string? ExtractMetadataField(string? metadataJson, string fieldName)
        {
            if (string.IsNullOrWhiteSpace(metadataJson)) return null;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(metadataJson);
                if (doc.RootElement.TryGetProperty(fieldName, out var val))
                {
                    return val.GetString();
                }
            }
            catch {}
            return null;
        }

        private static string EnsureInvoiceMetadata(string? existingJson, string? invoiceType, string? billType)
        {
            var dict = string.IsNullOrWhiteSpace(existingJson)
                ? new Dictionary<string, object?>()
                : (System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(existingJson) ?? new Dictionary<string, object?>());
            if (!string.IsNullOrWhiteSpace(invoiceType)) dict["invoiceType"] = invoiceType;
            if (!string.IsNullOrWhiteSpace(billType)) dict["billType"] = billType;
            return System.Text.Json.JsonSerializer.Serialize(dict);
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _healedSalesCustomerSchemas = new();

        private async Task EnsureCustomerColumnsAsync()
        {
            var schema = !string.IsNullOrWhiteSpace(_tenantProvider.TenantSchemaName)
                ? _tenantProvider.TenantSchemaName
                : (!string.IsNullOrWhiteSpace(_tenantContext.SchemaName) ? _tenantContext.SchemaName : "public");

            if (_healedSalesCustomerSchemas.ContainsKey(schema)) return;

            try
            {
                var sql = $@"
                    ALTER TABLE ""{schema}"".""Customers"" ADD COLUMN IF NOT EXISTS ""Price"" numeric NOT NULL DEFAULT 0;
                    ALTER TABLE ""{schema}"".""Customers"" ADD COLUMN IF NOT EXISTS ""Discount"" numeric NOT NULL DEFAULT 0;
                    ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""ParentTransactionId"" uuid NULL;
                    CREATE INDEX IF NOT EXISTS ""IX_SalesTransactions_ParentTransactionId"" ON ""{schema}"".""SalesTransactions"" (""ParentTransactionId"");
                    CREATE TABLE IF NOT EXISTS ""{schema}"".""SalesTransactionItems"" (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""TenantId"" uuid NOT NULL,
                        ""CompanyId"" uuid NOT NULL,
                        ""SalesTransactionId"" uuid NOT NULL,
                        ""ProductId"" uuid NOT NULL,
                        ""CaseConfigurationId"" uuid NULL,
                        ""UnitsPerCase"" integer NOT NULL DEFAULT 24,
                        ""Cases"" numeric NOT NULL DEFAULT 0,
                        ""UnitPrice"" numeric NOT NULL DEFAULT 0,
                        ""DiscountAmount"" numeric NOT NULL DEFAULT 0,
                        ""TaxAmount"" numeric NOT NULL DEFAULT 0,
                        ""GstRate"" numeric NOT NULL DEFAULT 0,
                        ""IsGstApplicable"" boolean NOT NULL DEFAULT false,
                        ""CGST"" numeric NOT NULL DEFAULT 0,
                        ""SGST"" numeric NOT NULL DEFAULT 0,
                        ""IGST"" numeric NOT NULL DEFAULT 0,
                        ""TotalAmount"" numeric NOT NULL DEFAULT 0,
                        ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT now()
                    );
                    CREATE INDEX IF NOT EXISTS ""IX_SalesTransactionItems_SalesTransactionId"" ON ""{schema}"".""SalesTransactionItems"" (""SalesTransactionId"");
                    CREATE INDEX IF NOT EXISTS ""IX_SalesTransactionItems_ProductId"" ON ""{schema}"".""SalesTransactionItems"" (""ProductId"");
                ";
                await _tenantContext.Database.ExecuteSqlRawAsync(sql);
                _healedSalesCustomerSchemas.TryAdd(schema, true);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SALES DB HEAL WARNING]: {ex.Message}");
            }
        }

        private static List<SalesTransactionItemDto> ParseMetadataItemsOrFallback(SalesTransaction t)
        {
            if (!string.IsNullOrWhiteSpace(t.MetadataJson))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(t.MetadataJson);
                    if (doc.RootElement.TryGetProperty("items", out var itemsElem) && itemsElem.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        var parsed = new List<SalesTransactionItemDto>();
                        foreach (var el in itemsElem.EnumerateArray())
                        {
                            parsed.Add(new SalesTransactionItemDto
                            {
                                Id = Guid.NewGuid(),
                                ProductId = el.TryGetProperty("productId", out var pId) && Guid.TryParse(pId.GetString(), out var gId) ? gId : t.ProductId,
                                ProductName = el.TryGetProperty("productName", out var pName) ? pName.GetString() ?? "" : (t.Product?.Name ?? "Product"),
                                ProductSku = el.TryGetProperty("productSku", out var pSku) ? pSku.GetString() ?? "" : (t.Product?.SKU ?? ""),
                                CaseConfigurationId = el.TryGetProperty("caseConfigurationId", out var ccId) && Guid.TryParse(ccId.GetString(), out var gccId) ? gccId : null,
                                UnitsPerCase = el.TryGetProperty("unitsPerCase", out var upc) ? upc.GetInt32() : 24,
                                Cases = el.TryGetProperty("cases", out var cVal) ? cVal.GetDecimal() : 0,
                                UnitPrice = el.TryGetProperty("unitPrice", out var upVal) ? upVal.GetDecimal() : 0,
                                DiscountAmount = el.TryGetProperty("discountAmount", out var discVal) ? discVal.GetDecimal() : 0,
                                TaxAmount = el.TryGetProperty("taxAmount", out var taxVal) ? taxVal.GetDecimal() : 0,
                                GstRate = el.TryGetProperty("gstRate", out var rateVal) ? rateVal.GetDecimal() : 0,
                                IsGstApplicable = el.TryGetProperty("isGstApplicable", out var gstAppVal) && gstAppVal.GetBoolean(),
                                CGST = el.TryGetProperty("cgst", out var cgstVal) ? cgstVal.GetDecimal() : 0,
                                SGST = el.TryGetProperty("sgst", out var sgstVal) ? sgstVal.GetDecimal() : 0,
                                IGST = el.TryGetProperty("igst", out var igstVal) ? igstVal.GetDecimal() : 0,
                                TotalAmount = el.TryGetProperty("totalAmount", out var totVal) ? totVal.GetDecimal() : 0
                            });
                        }
                        if (parsed.Any()) return parsed;
                    }
                }
                catch { }
            }

            return new List<SalesTransactionItemDto>
            {
                new SalesTransactionItemDto
                {
                    Id = t.Id,
                    ProductId = t.ProductId,
                    ProductName = t.Product?.Name ?? "Product",
                    ProductSku = t.Product?.SKU ?? string.Empty,
                    Cases = t.Cases,
                    UnitPrice = t.UnitPrice,
                    DiscountAmount = t.DiscountAmount,
                    TaxAmount = t.TaxAmount,
                    GstRate = t.GstRate,
                    IsGstApplicable = t.IsGstApplicable,
                    CGST = t.CGST,
                    SGST = t.SGST,
                    IGST = t.IGST,
                    TotalAmount = t.TotalAmount
                }
            };
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<PagedResult<SalesTransactionDto>>>> GetSales(
            [FromQuery] int pageNumber = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null,
            [FromQuery] Guid? product = null,
            [FromQuery] Guid? customer = null,
            [FromQuery] string? type = null,
            [FromQuery] string? status = null,
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null,
            [FromQuery] string? sort = "newest")
        {
            try
            {
                await EnsureCustomerColumnsAsync();
                var tenantId = _currentUserContext.TenantId;
                var query = _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .Where(t => t.TenantId == tenantId && !t.IsDeleted)
                    .AsQueryable();

                // Searching
                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(t =>
                        t.TransactionNumber.ToLower().Contains(term) ||
                        t.Customer.CustomerName.ToLower().Contains(term) ||
                        t.Product.Name.ToLower().Contains(term));
                }

                // Filtering
                if (product.HasValue && product.Value != Guid.Empty)
                {
                    query = query.Where(t => t.ProductId == product.Value);
                }

                if (customer.HasValue && customer.Value != Guid.Empty)
                {
                    query = query.Where(t => t.CustomerId == customer.Value);
                }

                if (!string.IsNullOrWhiteSpace(type) && !type.Equals("All", StringComparison.OrdinalIgnoreCase) && !type.Equals("All Types", StringComparison.OrdinalIgnoreCase))
                {
                    query = query.Where(t => t.TransactionType == type);
                }
                else if (string.IsNullOrWhiteSpace(search))
                {
                    // Default collapsed register mode (All Types): Show only root parent transactions (where ParentTransactionId == null)
                    query = query.Where(t => t.ParentTransactionId == null);
                }

                if (!string.IsNullOrWhiteSpace(status))
                {
                    query = query.Where(t => t.Status == status);
                }

                if (startDate.HasValue)
                {
                    query = query.Where(t => t.TransactionDate >= startDate.Value.ToUniversalTime());
                }

                if (endDate.HasValue)
                {
                    query = query.Where(t => t.TransactionDate <= endDate.Value.ToUniversalTime());
                }

                // Sorting by actual creation timestamp (newest created first)
                if (sort == "oldest")
                {
                    query = query.OrderBy(t => t.CreatedAt).ThenBy(t => t.TransactionDate).ThenBy(t => t.Id);
                }
                else
                {
                    query = query.OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.TransactionDate).ThenByDescending(t => t.Id);
                }

                var totalCount = await query.CountAsync();
                var items = await query
                    .Skip((pageNumber - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                // Calculate related child counts for parent dispatches in current page
                var parentIds = items.Select(t => t.Id).ToList();
                var childCounts = await _tenantContext.SalesTransactions
                    .Where(t => t.ParentTransactionId.HasValue && parentIds.Contains(t.ParentTransactionId.Value) && !t.IsDeleted)
                    .GroupBy(t => t.ParentTransactionId!.Value)
                    .Select(g => new { ParentId = g.Key, Count = g.Count() })
                    .ToDictionaryAsync(x => x.ParentId, x => x.Count);

                // Look up user names to display who created it
                var creatorIds = items
                    .Select(t => t.CreatedBy)
                    .Where(cb => !string.IsNullOrEmpty(cb) && Guid.TryParse(cb, out _))
                    .Select(Guid.Parse)
                    .Distinct()
                    .ToList();

                var users = await _platformContext.Users
                    .Where(u => creatorIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id.ToString(), u => $"{u.FirstName} {u.LastName}");

                var bankAccountsDict = await _tenantContext.BankAccounts.ToDictionaryAsync(b => b.Id, b => b.BankName);
                var cashBooksDict = await _tenantContext.CashBooks.ToDictionaryAsync(c => c.Id, c => c.Name);

                // Batch load multi-product line items for page
                var allTxnIds = items.Select(t => t.Id).ToList();
                List<SalesTransactionItem> dbLineItems = new();
                try
                {
                    dbLineItems = await _tenantContext.SalesTransactionItems
                        .Include(i => i.Product)
                        .Include(i => i.CaseConfiguration)
                        .Where(i => allTxnIds.Contains(i.SalesTransactionId))
                        .ToListAsync();
                }
                catch { }
                var itemsByTxnId = dbLineItems.GroupBy(i => i.SalesTransactionId).ToDictionary(g => g.Key, g => g.ToList());

                var dtos = items.Select(t => new SalesTransactionDto
                {
                    Id = t.Id,
                    TransactionNumber = t.TransactionNumber,
                    CustomerId = t.CustomerId,
                    CustomerName = t.Customer?.CustomerName ?? "Unknown Customer",
                    CustomerCode = t.Customer?.CustomerCode ?? string.Empty,
                    ProductId = t.ProductId,
                    ProductName = t.Product?.Name ?? "Unknown Product",
                    ProductSku = t.Product?.SKU ?? string.Empty,
                    ParentTransactionId = t.ParentTransactionId,
                    RelatedCount = childCounts.TryGetValue(t.Id, out var rCount) ? rCount : 0,
                    Cases = t.Cases,
                    TransactionType = t.TransactionType,
                    TransactionDate = t.TransactionDate,
                    ReferenceNumber = t.ReferenceNumber,
                    Remarks = t.Remarks,
                    Status = t.Status,
                    PaymentMethod = t.PaymentMethod,
                    PaymentTerms = t.PaymentTerms,
                    BankAccountId = t.BankAccountId,
                    BankAccountName = t.BankAccountId.HasValue && bankAccountsDict.TryGetValue(t.BankAccountId.Value, out var bName) ? bName : null,
                    CashBookId = t.CashBookId,
                    CashBookName = t.CashBookId.HasValue && cashBooksDict.TryGetValue(t.CashBookId.Value, out var cName) ? cName : null,
                    UnitPrice = t.UnitPrice,
                    DiscountAmount = t.DiscountAmount,
                    TaxAmount = t.TaxAmount,
                    GstRate = t.GstRate,
                    IsGstApplicable = t.IsGstApplicable,
                    TaxTreatment = t.TaxTreatment,
                    CGST = t.CGST,
                    SGST = t.SGST,
                    IGST = t.IGST,
                    MetadataJson = t.MetadataJson,
                    TotalAmount = t.TotalAmount,
                    AmountReceived = t.AmountReceived,
                    OutstandingAmount = t.OutstandingAmount,
                    PaymentStatus = t.PaymentStatus,
                    ReturnedAmount = t.ReturnedAmount,
                    RefundAmount = t.RefundAmount,
                    AdjustmentAmount = t.AdjustmentAmount,
                    ReturnType = t.ReturnType,
                    IsReplacementRequired = t.IsReplacementRequired,
                    ProductValue = t.ProductValue,
                    DamageCost = t.DamageCost,
                    DamageReason = t.DamageReason,
                    InvoiceType = ExtractMetadataField(t.MetadataJson, "invoiceType") ?? (!string.IsNullOrWhiteSpace(t.Customer?.GSTNumber) || string.Equals(t.Customer?.CustomerType, "B2B", StringComparison.OrdinalIgnoreCase) ? "B2B" : "B2C"),
                    BillType = ExtractMetadataField(t.MetadataJson, "billType") ?? (t.IsGstApplicable && (t.TaxAmount > 0 || t.GstRate > 0) ? "Tax Invoice" : "Bill of Supply"),
                    Items = itemsByTxnId.TryGetValue(t.Id, out var lines) && lines.Any()
                        ? lines.Select(li => new SalesTransactionItemDto
                        {
                            Id = li.Id,
                            ProductId = li.ProductId,
                            ProductName = li.Product?.Name ?? "Product",
                            ProductSku = li.Product?.SKU ?? string.Empty,
                            CaseConfigurationId = li.CaseConfigurationId,
                            CaseConfigurationName = li.CaseConfiguration?.Name,
                            UnitsPerCase = li.UnitsPerCase,
                            Cases = li.Cases,
                            UnitPrice = li.UnitPrice,
                            DiscountAmount = li.DiscountAmount,
                            TaxAmount = li.TaxAmount,
                            GstRate = li.GstRate,
                            IsGstApplicable = li.IsGstApplicable,
                            CGST = li.CGST,
                            SGST = li.SGST,
                            IGST = li.IGST,
                            TotalAmount = li.TotalAmount
                        }).ToList()
                        : ParseMetadataItemsOrFallback(t),
                    CreatedBy = t.CreatedBy,
                    CreatedByName = users.TryGetValue(t.CreatedBy, out var name) ? name : "System",
                    CreatedAt = t.CreatedAt,
                    UpdatedAt = t.UpdatedAt
                }).ToList();

                var pagedResult = new PagedResult<SalesTransactionDto>(dtos, totalCount, pageNumber, pageSize);
                return Success(pagedResult, "Sales transactions retrieved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<PagedResult<SalesTransactionDto>>(ex.Message, "Failed to retrieve sales transactions.");
            }
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<ApiResponse<SalesTransactionDto>>> GetSalesTransaction(Guid id)
        {
            try
            {
                var tenantId = _currentUserContext.TenantId;
                var txn = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (txn == null)
                {
                    return NotFound(ApiResponse<SalesTransactionDto>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                string createdByName = "System";
                if (Guid.TryParse(txn.CreatedBy, out var cbGuid))
                {
                    var user = await _platformContext.Users.FirstOrDefaultAsync(u => u.Id == cbGuid);
                    if (user != null)
                    {
                        createdByName = $"{user.FirstName} {user.LastName}";
                    }
                }

                var bankAccount = txn.BankAccountId.HasValue ? await _tenantContext.BankAccounts.FindAsync(txn.BankAccountId.Value) : null;
                var cashBook = txn.CashBookId.HasValue ? await _tenantContext.CashBooks.FindAsync(txn.CashBookId.Value) : null;

                List<SalesTransactionItemDto> itemDtos = new();
                try
                {
                    var dbLines = await _tenantContext.SalesTransactionItems
                        .Include(i => i.Product)
                        .Include(i => i.CaseConfiguration)
                        .Where(i => i.SalesTransactionId == txn.Id)
                        .ToListAsync();

                    if (dbLines.Any())
                    {
                        itemDtos = dbLines.Select(li => new SalesTransactionItemDto
                        {
                            Id = li.Id,
                            ProductId = li.ProductId,
                            ProductName = li.Product?.Name ?? "Product",
                            ProductSku = li.Product?.SKU ?? string.Empty,
                            CaseConfigurationId = li.CaseConfigurationId,
                            CaseConfigurationName = li.CaseConfiguration?.Name,
                            UnitsPerCase = li.UnitsPerCase,
                            Cases = li.Cases,
                            UnitPrice = li.UnitPrice,
                            DiscountAmount = li.DiscountAmount,
                            TaxAmount = li.TaxAmount,
                            GstRate = li.GstRate,
                            IsGstApplicable = li.IsGstApplicable,
                            CGST = li.CGST,
                            SGST = li.SGST,
                            IGST = li.IGST,
                            TotalAmount = li.TotalAmount
                        }).ToList();
                    }
                }
                catch { }

                if (!itemDtos.Any())
                {
                    itemDtos = ParseMetadataItemsOrFallback(txn);
                }

                var dto = new SalesTransactionDto
                {
                    Id = txn.Id,
                    TransactionNumber = txn.TransactionNumber,
                    CustomerId = txn.CustomerId,
                    CustomerName = txn.Customer?.CustomerName ?? "Unknown Customer",
                    CustomerCode = txn.Customer?.CustomerCode ?? string.Empty,
                    ProductId = txn.ProductId,
                    ProductName = txn.Product?.Name ?? "Unknown Product",
                    ProductSku = txn.Product?.SKU ?? string.Empty,
                    Cases = txn.Cases,
                    TransactionType = txn.TransactionType,
                    TransactionDate = txn.TransactionDate,
                    ReferenceNumber = txn.ReferenceNumber,
                    Remarks = txn.Remarks,
                    Status = txn.Status,
                    PaymentMethod = txn.PaymentMethod,
                    PaymentTerms = txn.PaymentTerms,
                    BankAccountId = txn.BankAccountId,
                    BankAccountName = bankAccount?.BankName,
                    CashBookId = txn.CashBookId,
                    CashBookName = cashBook?.Name,
                    UnitPrice = txn.UnitPrice,
                    DiscountAmount = txn.DiscountAmount,
                    TaxAmount = txn.TaxAmount,
                    GstRate = txn.GstRate,
                    IsGstApplicable = txn.IsGstApplicable,
                    TaxTreatment = txn.TaxTreatment,
                    CGST = txn.CGST,
                    SGST = txn.SGST,
                    IGST = txn.IGST,
                    MetadataJson = txn.MetadataJson,
                    TotalAmount = txn.TotalAmount,
                    AmountReceived = txn.AmountReceived,
                    OutstandingAmount = txn.OutstandingAmount,
                    PaymentStatus = txn.PaymentStatus,
                    ReturnedAmount = txn.ReturnedAmount,
                    RefundAmount = txn.RefundAmount,
                    AdjustmentAmount = txn.AdjustmentAmount,
                    ReturnType = txn.ReturnType,
                    IsReplacementRequired = txn.IsReplacementRequired,
                    ProductValue = txn.ProductValue,
                    DamageCost = txn.DamageCost,
                    DamageReason = txn.DamageReason,
                    InvoiceType = ExtractMetadataField(txn.MetadataJson, "invoiceType") ?? (!string.IsNullOrWhiteSpace(txn.Customer?.GSTNumber) || string.Equals(txn.Customer?.CustomerType, "B2B", StringComparison.OrdinalIgnoreCase) ? "B2B" : "B2C"),
                    BillType = ExtractMetadataField(txn.MetadataJson, "billType") ?? (txn.IsGstApplicable && (txn.TaxAmount > 0 || txn.GstRate > 0) ? "Tax Invoice" : "Bill of Supply"),
                    Items = itemDtos,
                    CreatedBy = txn.CreatedBy,
                    CreatedByName = createdByName,
                    CreatedAt = txn.CreatedAt,
                    UpdatedAt = txn.UpdatedAt
                };

                return Success(dto, "Sales transaction retrieved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<SalesTransactionDto>(ex.Message, "Failed to retrieve sales transaction.");
            }
        }

        /// <summary>
        /// Authoritatively renders and streams an official Tax Invoice (B2B/B2C) or Bill of Supply PDF.
        /// Includes Company Branding, Buyer details, HSN table, GST breakdown, Bank info, and amount in words.
        /// </summary>
        [HttpGet("{id:guid}/invoice-pdf")]
        public async Task<IActionResult> DownloadInvoicePdf(Guid id)
        {
            try
            {
                var tenantId = _currentUserContext.TenantId;
                var txn = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .Include(t => t.Items)
                        .ThenInclude(i => i.Product)
                    .Include(t => t.Items)
                        .ThenInclude(i => i.CaseConfiguration)
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (txn == null)
                {
                    return NotFound(ApiResponse<object>.CreateFailure("Sales transaction / invoice not found.", "NOT_FOUND"));
                }

                var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => c.TenantId == tenantId && !c.IsDeleted) 
                    ?? new Company { Name = "Aquzio Purified Water Co." };
                var tenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);

                var pdfBytes = await _invoicePdfService.GenerateInvoicePdfAsync(txn, company, tenant, txn.Customer);
                var safeInvoiceNo = string.IsNullOrWhiteSpace(txn.TransactionNumber) ? txn.Id.ToString()[..8].ToUpper() : txn.TransactionNumber;
                return File(pdfBytes, "application/pdf", $"Invoice_{safeInvoiceNo}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.CreateFailure(ex.Message, "PDF_GENERATION_FAILED"));
            }
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<SalesTransactionDto>>> CreateSalesTransaction([FromBody] CreateSalesTransactionRequest request)
        {
            if (!IsAuthorizedToWrite())
            {
                return Unauthorized(ApiResponse<SalesTransactionDto>.CreateFailure("Unauthorized to create transactions.", "Unauthorized", HttpContext.TraceIdentifier));
            }

            if (request.Items != null && request.Items.Any())
            {
                request.Cases = request.Items.Sum(i => i.Cases);
                if (request.ProductId == Guid.Empty)
                {
                    request.ProductId = request.Items[0].ProductId;
                }
            }

            if (request.Cases <= 0 && request.TransactionType != "Stock Adjustment")
            {
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Quantity of cases must be greater than zero.", "Validation Error", HttpContext.TraceIdentifier));
            }

            var dbContext = _tenantContext as DbContext;
            if (dbContext == null)
            {
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Database context is invalid.", "Infrastructure Error", HttpContext.TraceIdentifier));
            }

            await EnsureCustomerColumnsAsync();

            var strategy = dbContext.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                using var dbTransaction = await dbContext.Database.BeginTransactionAsync();
                try
                {
                var tenantId = _currentUserContext.TenantId;
                var currentUserId = _currentUserContext.UserId ?? "System";

                // Load primary product
                var product = await _tenantContext.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId && !p.IsDeleted);
                if (product == null && (request.Items == null || !request.Items.Any()))
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Product not found.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                if (company == null)
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Company not found.", "Validation Error", HttpContext.TraceIdentifier));
                }

                SalesTransaction? parentDispatch = null;
                if (request.TransactionType == "Customer Return" || request.TransactionType == "Damage" || request.TransactionType == "Damaged Goods")
                {
                    if (!request.ParentTransactionId.HasValue || request.ParentTransactionId.Value == Guid.Empty)
                    {
                        return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure($"Parent Sales Dispatch is required for creating a {request.TransactionType}.", "Validation Error", HttpContext.TraceIdentifier));
                    }

                    parentDispatch = await _tenantContext.SalesTransactions
                        .Include(s => s.Customer)
                        .Include(s => s.Product)
                        .FirstOrDefaultAsync(s => s.Id == request.ParentTransactionId.Value && s.TenantId == tenantId && !s.IsDeleted);

                    if (parentDispatch == null || !string.Equals(parentDispatch.TransactionType, "Sales Dispatch", StringComparison.OrdinalIgnoreCase))
                    {
                        return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Associated Sales Dispatch transaction not found or invalid.", "Validation Error", HttpContext.TraceIdentifier));
                    }

                    request.CustomerId = parentDispatch.CustomerId;
                    request.ProductId = parentDispatch.ProductId;

                    // Calculate existing returns/damages against parent
                    var existingChildCases = await _tenantContext.SalesTransactions
                        .Where(s => s.ParentTransactionId == parentDispatch.Id && !s.IsDeleted)
                        .SumAsync(s => Math.Abs(s.Cases));

                    var remainingCases = Math.Abs(parentDispatch.Cases) - existingChildCases;
                    if (Math.Abs(request.Cases) > (remainingCases + 0.0001m))
                    {
                        return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(
                            $"Requested {request.TransactionType} of {Math.Abs(request.Cases)} cases exceeds available remaining quantity of {remainingCases} cases on Sales Dispatch {parentDispatch.TransactionNumber} (Original: {Math.Abs(parentDispatch.Cases)}, Processed: {existingChildCases}).",
                            "Over-Return Error",
                            HttpContext.TraceIdentifier));
                    }
                }

                // Load customer
                var customer = await _tenantContext.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId && c.TenantId == tenantId && !c.IsDeleted);
                if (customer == null && (request.TransactionType == "Sales Dispatch" || request.TransactionType == "Customer Return" || request.TransactionType == "Free Sample"))
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure($"Customer is required for {request.TransactionType}.", "Validation Error", HttpContext.TraceIdentifier));
                }

                // Auto-resolve customer if not required but constraint needs one
                if (customer == null)
                {
                    customer = await _tenantContext.Customers.FirstOrDefaultAsync(c => c.TenantId == tenantId && !c.IsDeleted);
                    if (customer == null)
                    {
                        customer = new Customer
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            CompanyId = company.Id,
                            CustomerName = "General / System Customer",
                            CustomerCode = "CUST-SYS",
                            Phone = "0000000000",
                            Email = "system@aquora.com",
                            OutstandingPlaceholder = 0,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        };
                        _tenantContext.Customers.Add(customer);
                        await _tenantContext.SaveChangesAsync();
                    }
                }

                // Generate txn number
                var randomCode = new Random().Next(1000, 9999);
                var txnNumber = $"TXN-{DateTime.UtcNow:yyyyMMdd}-{randomCode}";
                var transactionId = Guid.NewGuid();

                decimal totalAmount = 0m;
                decimal amountReceived = 0m;
                decimal outstandingAmount = 0m;
                string paymentStatus = "Pending";

                decimal returnedAmount = 0m;
                decimal refundAmount = 0m;
                decimal adjustmentAmount = 0m;
                string? returnType = null;

                decimal productValue = 0m;
                decimal damageCost = 0m;
                string? damageReason = null;

                decimal stockAdjustment = 0;

                // Journal ledger lines accumulator
                var journalLines = new List<(Account account, decimal debit, decimal credit, string description)>();

                var dispatchItems = new List<(SalesTransactionItem ItemEntity, Product Product)>();

                if (request.TransactionType == "Sales Dispatch")
                {
                    var requestedItems = (request.Items != null && request.Items.Any())
                        ? request.Items
                        : new List<SalesTransactionItemRequest>
                        {
                            new SalesTransactionItemRequest
                            {
                                ProductId = request.ProductId,
                                CaseConfigurationId = request.CaseConfigurationId,
                                UnitsPerCase = request.UnitsPerCase,
                                Cases = request.Cases,
                                UnitPrice = request.UnitPrice,
                                DiscountAmount = request.DiscountAmount,
                                TaxAmount = request.TaxAmount,
                                GstRate = request.GstRate,
                                IsGstApplicable = request.IsGstApplicable,
                                CGST = request.CGST,
                                SGST = request.SGST,
                                IGST = request.IGST,
                                TotalAmount = request.TotalAmount
                            }
                        };

                    foreach (var itemReq in requestedItems)
                    {
                        if (itemReq.ProductId == Guid.Empty)
                        {
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Each order item must specify a product.", "Validation Error", HttpContext.TraceIdentifier));
                        }

                        if (itemReq.Cases <= 0)
                        {
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Each order item must have a positive quantity of cases.", "Validation Error", HttpContext.TraceIdentifier));
                        }

                        var itemProduct = await _tenantContext.Products.FirstOrDefaultAsync(p => p.Id == itemReq.ProductId && !p.IsDeleted);
                        if (itemProduct == null)
                        {
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure($"Product with ID '{itemReq.ProductId}' not found.", "Validation Error", HttpContext.TraceIdentifier));
                        }

                        if (itemReq.UnitPrice <= 0)
                        {
                            var custPrice = await _tenantContext.CustomerProductPrices
                                .Where(cp => cp.TenantId == tenantId && cp.CustomerId == customer.Id && cp.ProductId == itemProduct.Id && cp.IsActive && !cp.IsDeleted)
                                .OrderByDescending(cp => cp.CreatedAt)
                                .FirstOrDefaultAsync();

                            if (custPrice != null && custPrice.CustomPrice > 0)
                            {
                                itemReq.UnitPrice = custPrice.CustomPrice;
                            }
                            else if (itemProduct.SellingPrice > 0)
                            {
                                itemReq.UnitPrice = itemProduct.SellingPrice;
                            }
                        }

                        decimal lineGross = itemReq.Cases * itemReq.UnitPrice;
                        decimal lineTaxable = Math.Max(0m, lineGross - itemReq.DiscountAmount);
                        decimal lineTax = 0m;
                        decimal lineCgst = 0m, lineSgst = 0m, lineIgst = 0m;

                        if (itemReq.IsGstApplicable && itemReq.GstRate > 0)
                        {
                            lineTax = Math.Round(lineTaxable * itemReq.GstRate / 100m, 2, MidpointRounding.AwayFromZero);
                            var isInterState = string.Equals(request.TaxTreatment, "InterState", StringComparison.OrdinalIgnoreCase);
                            if (isInterState)
                            {
                                lineIgst = lineTax;
                            }
                            else
                            {
                                lineCgst = Math.Round(lineTax / 2m, 2, MidpointRounding.AwayFromZero);
                                lineSgst = lineTax - lineCgst;
                            }
                        }

                        decimal lineTotal = Math.Round(lineTaxable + lineTax, 2, MidpointRounding.AwayFromZero);

                        var itemEntity = new SalesTransactionItem
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            CompanyId = company.Id,
                            SalesTransactionId = transactionId,
                            ProductId = itemProduct.Id,
                            CaseConfigurationId = itemReq.CaseConfigurationId,
                            UnitsPerCase = itemReq.UnitsPerCase > 0 ? itemReq.UnitsPerCase : 24,
                            Cases = itemReq.Cases,
                            UnitPrice = itemReq.UnitPrice,
                            DiscountAmount = itemReq.DiscountAmount,
                            TaxAmount = lineTax,
                            GstRate = itemReq.GstRate,
                            IsGstApplicable = itemReq.IsGstApplicable,
                            CGST = lineCgst,
                            SGST = lineSgst,
                            IGST = lineIgst,
                            TotalAmount = lineTotal,
                            CreatedAt = DateTime.UtcNow
                        };

                        dispatchItems.Add((itemEntity, itemProduct));
                    }

                    // Stock availability verification
                    var groupedStockReq = dispatchItems.GroupBy(x => x.Product.Id).ToDictionary(g => g.Key, g => g.Sum(x => x.ItemEntity.Cases));
                    foreach (var kvp in groupedStockReq)
                    {
                        var prod = dispatchItems.First(x => x.Product.Id == kvp.Key).Product;
                        if (kvp.Value > prod.CurrentStock)
                        {
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(
                                $"Insufficient stock for '{prod.Name}'. Available: {prod.CurrentStock} Cases, Requested: {kvp.Value} Cases.",
                                "Insufficient Stock",
                                HttpContext.TraceIdentifier));
                        }
                    }

                    // Consolidated transaction metrics
                    request.Cases = dispatchItems.Sum(x => x.ItemEntity.Cases);
                    request.DiscountAmount = dispatchItems.Sum(x => x.ItemEntity.DiscountAmount);
                    request.TaxAmount = dispatchItems.Sum(x => x.ItemEntity.TaxAmount);
                    request.CGST = dispatchItems.Sum(x => x.ItemEntity.CGST);
                    request.SGST = dispatchItems.Sum(x => x.ItemEntity.SGST);
                    request.IGST = dispatchItems.Sum(x => x.ItemEntity.IGST);
                    request.TotalAmount = dispatchItems.Sum(x => x.ItemEntity.TotalAmount);
                    totalAmount = request.TotalAmount;
                    request.ProductId = dispatchItems[0].Product.Id;
                    request.UnitPrice = dispatchItems.Count == 1 ? dispatchItems[0].ItemEntity.UnitPrice : (request.Cases > 0 ? Math.Round((totalAmount - request.TaxAmount + request.DiscountAmount) / request.Cases, 2) : 0);
                    request.IsGstApplicable = dispatchItems.Any(x => x.ItemEntity.IsGstApplicable);
                    request.GstRate = dispatchItems.Count == 1 ? dispatchItems[0].ItemEntity.GstRate : (request.TaxAmount > 0 && (totalAmount - request.TaxAmount) > 0 ? Math.Round(request.TaxAmount / (totalAmount - request.TaxAmount) * 100m, 2) : 0);

                    var isCreditSale = string.Equals(request.PaymentMethod, "Credit", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(request.PaymentTerms, "Credit", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(request.PaymentTerms, "Net 7", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(request.PaymentTerms, "Net 15", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(request.PaymentTerms, "Net 30", StringComparison.OrdinalIgnoreCase);

                    if (isCreditSale)
                    {
                        if (customer == null || customer.CustomerCode == "CUST-SYS" || request.CustomerId == Guid.Empty)
                        {
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Select a customer for credit sales.", "Validation Error", HttpContext.TraceIdentifier));
                        }

                        // Validate Customer Credit Limit
                        if (customer.CreditLimit > 0 && (customer.OutstandingPlaceholder + totalAmount) > customer.CreditLimit)
                        {
                            var availableCredit = Math.Max(0m, customer.CreditLimit - customer.OutstandingPlaceholder);
                            return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(
                                $"Credit sale of ₹{totalAmount:N2} exceeds customer's available credit limit. Current outstanding: ₹{customer.OutstandingPlaceholder:N2}, Credit limit: ₹{customer.CreditLimit:N2}, Available credit: ₹{availableCredit:N2}.",
                                "Credit Limit Exceeded",
                                HttpContext.TraceIdentifier));
                        }

                        amountReceived = request.AmountReceived > 0 ? request.AmountReceived : 0m;
                        outstandingAmount = Math.Max(0m, totalAmount - amountReceived);
                        paymentStatus = outstandingAmount <= 0 ? "Paid" : (amountReceived <= 0 ? "Pending" : "Partial");

                        if (outstandingAmount > 0)
                        {
                            customer.OutstandingPlaceholder += outstandingAmount;
                        }
                        AppendCustomerLedgerEntry(customer, $"Sales Dispatch ({request.PaymentTerms ?? "Credit"})", txnNumber, totalAmount, amountReceived, customer.OutstandingPlaceholder);
                    }
                    else
                    {
                        if (request.AmountReceived > 0)
                        {
                            amountReceived = request.AmountReceived;
                            outstandingAmount = Math.Max(0m, totalAmount - amountReceived);
                            paymentStatus = outstandingAmount <= 0 ? "Paid" : "Partial";
                        }
                        else if (string.Equals(request.PaymentTerms, "COD", StringComparison.OrdinalIgnoreCase))
                        {
                            amountReceived = 0m;
                            outstandingAmount = totalAmount;
                            paymentStatus = "Pending";
                        }
                        else
                        {
                            amountReceived = totalAmount;
                            outstandingAmount = 0m;
                            paymentStatus = "Paid";
                        }

                        if (outstandingAmount > 0)
                        {
                            customer.OutstandingPlaceholder += outstandingAmount;
                        }
                        AppendCustomerLedgerEntry(customer, $"Sales Dispatch ({request.PaymentMethod ?? "Cash"})", txnNumber, totalAmount, amountReceived, customer.OutstandingPlaceholder);
                    }

                    // Resolve general ledger accounts
                    var salesRevenueAccount = await ResolveAccountAsync("Sales Revenue", "4001", "Revenue", "Cr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);
                    var cogsAccount = await ResolveAccountAsync("Cost of Goods Sold", "5002", "Expenses", "Dr", tenantId, company.Id);

                    Account debitAccount;
                    if (IsBankPaymentMethod(request.PaymentMethod))
                    {
                        debitAccount = await ResolveAccountAsync("Bank Account", "1002", "Assets", "Dr", tenantId, company.Id);
                    }
                    else if (request.PaymentMethod == "Cash")
                    {
                        debitAccount = await ResolveAccountAsync("Cash", "1001", "Assets", "Dr", tenantId, company.Id);
                    }
                    else
                    {
                        debitAccount = await ResolveAccountAsync("Accounts Receivable", "1200", "Assets", "Dr", tenantId, company.Id);
                    }

                    // Journal lines
                    journalLines.Add((debitAccount, totalAmount, 0m, $"Customer dispatch record: {txnNumber}"));
                    journalLines.Add((salesRevenueAccount, 0m, totalAmount - request.TaxAmount, $"Dispatch sales revenue: {txnNumber}"));
                    if (request.CGST > 0) journalLines.Add((await ResolveAccountAsync("CGST Output Tax", "2101", "Liabilities", "Cr", tenantId, company.Id), 0m, request.CGST, $"CGST liability: {txnNumber}"));
                    if (request.SGST > 0) journalLines.Add((await ResolveAccountAsync("SGST Output Tax", "2102", "Liabilities", "Cr", tenantId, company.Id), 0m, request.SGST, $"SGST liability: {txnNumber}"));
                    if (request.IGST > 0) journalLines.Add((await ResolveAccountAsync("IGST Output Tax", "2103", "Liabilities", "Cr", tenantId, company.Id), 0m, request.IGST, $"IGST liability: {txnNumber}"));

                    decimal totalCogs = dispatchItems.Sum(x => x.ItemEntity.Cases * x.Product.CostPrice);
                    if (totalCogs > 0)
                    {
                        journalLines.Add((cogsAccount, totalCogs, 0m, $"Cost of goods sold: {txnNumber}"));
                        journalLines.Add((inventoryAccount, 0m, totalCogs, $"Inventory deduction: {txnNumber}"));
                    }
                }
                else if (request.TransactionType == "Customer Return")
                {
                    decimal calculatedReturn = Math.Abs(request.Cases) * (request.UnitPrice > 0 ? request.UnitPrice : product.SellingPrice);
                    returnedAmount = calculatedReturn > 0 ? calculatedReturn : (request.ReturnedAmount > 0 ? request.ReturnedAmount : 0m);

                    var isRefundSettlement = string.Equals(request.SettlementMethod, "Refund", StringComparison.OrdinalIgnoreCase) ||
                        request.PaymentMethod == "Cash" || request.PaymentMethod == "Bank" || request.ReturnType == "Cash" || request.ReturnType == "Bank";

                    if (isRefundSettlement)
                    {
                        refundAmount = returnedAmount;
                        adjustmentAmount = 0m;
                    }
                    else // Deduct from Customer Credit / Credit Note / Account Adjustment
                    {
                        refundAmount = 0m;
                        adjustmentAmount = returnedAmount;
                    }
                    returnType = !string.IsNullOrWhiteSpace(request.ReturnType) ? request.ReturnType : (request.PaymentMethod ?? "Credit Note");

                    // Reduce customer balance if credit-note/receivable adjustments
                    if (adjustmentAmount > 0)
                    {
                        customer.OutstandingPlaceholder = Math.Max(0m, customer.OutstandingPlaceholder - adjustmentAmount);
                        AppendCustomerLedgerEntry(customer, "Customer Return Note", txnNumber, 0, adjustmentAmount, customer.OutstandingPlaceholder);
                    }

                    var salesReturnAccount = await ResolveAccountAsync("Sales Return", "4002", "Revenue", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);
                    var cogsAccount = await ResolveAccountAsync("Cost of Goods Sold", "5002", "Expenses", "Dr", tenantId, company.Id);

                    Account creditAccount;
                    if (IsBankPaymentMethod(request.PaymentMethod))
                    {
                        creditAccount = await ResolveAccountAsync("Bank Account", "1002", "Assets", "Dr", tenantId, company.Id);
                    }
                    else if (request.PaymentMethod == "Cash")
                    {
                        creditAccount = await ResolveAccountAsync("Cash", "1001", "Assets", "Dr", tenantId, company.Id);
                    }
                    else
                    {
                        creditAccount = await ResolveAccountAsync("Accounts Receivable", "1200", "Assets", "Dr", tenantId, company.Id);
                    }

                    journalLines.Add((salesReturnAccount, returnedAmount, 0m, $"Customer returns: {txnNumber}"));
                    journalLines.Add((creditAccount, 0m, returnedAmount, $"Returns refund settlement: {txnNumber}"));

                    var isDamagedReturn = !string.IsNullOrWhiteSpace(request.ReturnCondition) &&
                        (request.ReturnCondition.StartsWith("Damaged", StringComparison.OrdinalIgnoreCase) ||
                         request.ReturnCondition.StartsWith("Reject", StringComparison.OrdinalIgnoreCase) ||
                         request.ReturnCondition.StartsWith("No Restock", StringComparison.OrdinalIgnoreCase));

                    if (isDamagedReturn)
                    {
                        // Damaged goods: Do NOT increase sellable stock
                        stockAdjustment = 0;
                    }
                    else
                    {
                        // Good / Restock: Increase sellable inventory
                        decimal cost = request.Cases * product.CostPrice;
                        if (cost > 0)
                        {
                            journalLines.Add((inventoryAccount, cost, 0m, $"Restoring stock: {txnNumber}"));
                            journalLines.Add((cogsAccount, 0m, cost, $"COGS credit reversal: {txnNumber}"));
                        }
                        stockAdjustment = Math.Abs(request.Cases);
                    }
                }
                else if (request.TransactionType == "Damage" || request.TransactionType == "Damaged Goods")
                {
                    productValue = product.CostPrice;
                    damageCost = request.Cases * productValue;
                    damageReason = request.DamageReason ?? request.Remarks;

                    var lossAccount = await ResolveAccountAsync("Inventory Loss Expense", "5003", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((lossAccount, damageCost, 0m, $"Unsellable inventory loss: {txnNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Writedown inventory: {txnNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Internal Consumption")
                {
                    productValue = product.CostPrice;
                    damageCost = request.Cases * productValue;

                    var officeExpenseAccount = await ResolveAccountAsync("Office Expense", "5004", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((officeExpenseAccount, damageCost, 0m, $"Internal department usage: {txnNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Finished goods consumption: {txnNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Free Sample")
                {
                    productValue = product.CostPrice;
                    damageCost = request.Cases * productValue;

                    var marketingExpenseAccount = await ResolveAccountAsync("Marketing Expense", "5005", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((marketingExpenseAccount, damageCost, 0m, $"Marketing sample distribution: {txnNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Finished goods sample: {txnNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Stock Adjustment")
                {
                    productValue = product.CostPrice;
                    damageCost = request.Cases * productValue; // Quantity * Cost

                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    if (request.Cases >= 0)
                    {
                        var adjustmentGainAccount = await ResolveAccountAsync("Inventory Adjustment Gain", "4003", "Revenue", "Cr", tenantId, company.Id);
                        journalLines.Add((inventoryAccount, Math.Abs(damageCost), 0m, $"Physical audit surplus: {txnNumber}"));
                        journalLines.Add((adjustmentGainAccount, 0m, Math.Abs(damageCost), $"Inventory adjustment gain: {txnNumber}"));
                    }
                    else
                    {
                        var adjustmentLossAccount = await ResolveAccountAsync("Inventory Adjustment Loss", "5006", "Expenses", "Dr", tenantId, company.Id);
                        journalLines.Add((adjustmentLossAccount, Math.Abs(damageCost), 0m, $"Physical audit shortage: {txnNumber}"));
                        journalLines.Add((inventoryAccount, 0m, Math.Abs(damageCost), $"Inventory adjustment loss: {txnNumber}"));
                    }

                    stockAdjustment = request.Cases;
                }

                // Add main transaction record
                var transaction = new SalesTransaction
                {
                    Id = transactionId,
                    TenantId = tenantId,
                    CompanyId = company.Id,
                    TransactionNumber = txnNumber,
                    CustomerId = customer.Id,
                    ProductId = request.ProductId,
                    ParentTransactionId = request.ParentTransactionId,
                    Cases = request.Cases,
                    TransactionType = request.TransactionType,
                    TransactionDate = request.TransactionDate.ToUniversalTime(),
                    ReferenceNumber = request.ReferenceNumber?.Trim(),
                    Remarks = request.Remarks?.Trim(),
                    Status = "Completed",
                    PaymentMethod = request.PaymentMethod,
                    PaymentTerms = request.PaymentTerms ?? "Immediate",
                    BankAccountId = request.BankAccountId,
                    CashBookId = request.CashBookId,
                    UnitPrice = request.UnitPrice,
                    DiscountAmount = request.DiscountAmount,
                    TaxAmount = request.TaxAmount,
                    GstRate = request.GstRate,
                    IsGstApplicable = request.IsGstApplicable,
                    TaxTreatment = request.TaxTreatment,
                    CGST = request.CGST,
                    SGST = request.SGST,
                    IGST = request.IGST,
                    MetadataJson = EnsureInvoiceMetadata(request.MetadataJson, request.InvoiceType, request.BillType),
                    TotalAmount = totalAmount,
                    AmountReceived = amountReceived,
                    OutstandingAmount = outstandingAmount,
                    PaymentStatus = paymentStatus,
                    ReturnedAmount = returnedAmount,
                    RefundAmount = refundAmount,
                    AdjustmentAmount = adjustmentAmount,
                    ReturnType = returnType,
                    IsReplacementRequired = request.IsReplacementRequired,
                    ProductValue = productValue,
                    DamageCost = damageCost,
                    DamageReason = damageReason,
                    CreatedBy = currentUserId,
                    CreatedAt = DateTime.UtcNow
                };

                // Apply general ledger journal entries
                if (journalLines.Any())
                {
                    await CreateJournalEntryAsync(tenantId, company.Id, "Journal Voucher", $"Sales module auto-posting: {txnNumber}", txnNumber, journalLines, currentUserId);
                }

                // Apply stock movement and persist line items
                if (dispatchItems.Any())
                {
                    foreach (var (itemEntity, itemProduct) in dispatchItems)
                    {
                        await _inventoryMovementService.RecordProductMovementAsync(
                            _tenantContext,
                            itemEntity.ProductId,
                            -itemEntity.Cases,
                            "SalesTransaction",
                            transaction.Id,
                            $"{request.TransactionType}: {txnNumber} ({itemProduct.Name})",
                            tenantId,
                            company.Id,
                            currentUserId);

                        _tenantContext.SalesTransactionItems.Add(itemEntity);
                    }

                    // Embed structured items into MetadataJson
                    try
                    {
                        var metaItems = dispatchItems.Select(x => new
                        {
                            productId = x.ItemEntity.ProductId,
                            productName = x.Product.Name,
                            productSku = x.Product.SKU ?? string.Empty,
                            caseConfigurationId = x.ItemEntity.CaseConfigurationId,
                            unitsPerCase = x.ItemEntity.UnitsPerCase,
                            cases = x.ItemEntity.Cases,
                            unitPrice = x.ItemEntity.UnitPrice,
                            discountAmount = x.ItemEntity.DiscountAmount,
                            taxAmount = x.ItemEntity.TaxAmount,
                            gstRate = x.ItemEntity.GstRate,
                            isGstApplicable = x.ItemEntity.IsGstApplicable,
                            cgst = x.ItemEntity.CGST,
                            sgst = x.ItemEntity.SGST,
                            igst = x.ItemEntity.IGST,
                            totalAmount = x.ItemEntity.TotalAmount
                        }).ToList();

                        var dict = string.IsNullOrWhiteSpace(request.MetadataJson)
                            ? new Dictionary<string, object?>()
                            : (System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(request.MetadataJson) ?? new Dictionary<string, object?>());
                        dict["items"] = metaItems;
                        transaction.MetadataJson = System.Text.Json.JsonSerializer.Serialize(dict);
                    }
                    catch { }
                }
                else if (stockAdjustment != 0)
                {
                    await _inventoryMovementService.RecordProductMovementAsync(
                        _tenantContext,
                        request.ProductId,
                        stockAdjustment,
                        "SalesTransaction",
                        transaction.Id,
                        $"{request.TransactionType}: {txnNumber}",
                        tenantId,
                        company.Id,
                        currentUserId);
                }

                _tenantContext.SalesTransactions.Add(transaction);
                await _tenantContext.SaveChangesAsync();

                if (transaction.TransactionType == "Sales Dispatch" && transaction.AmountReceived > 0)
                {
                    if (IsBankPaymentMethod(transaction.PaymentMethod))
                    {
                        await _ledgerService.RecordTransactionAsync(
                            transaction.BankAccountId.GetValueOrDefault(),
                            transaction.TransactionDate,
                            transaction.ReferenceNumber ?? transaction.TransactionNumber,
                            "Sales Receipt",
                            $"Sales payment received from {customer.CustomerName}",
                            0m,
                            transaction.AmountReceived,
                            transaction.Id,
                            "SalesTransaction");
                    }
                    else if (transaction.PaymentMethod == "Cash")
                    {
                        await _ledgerService.RecordCashTransactionAsync(
                            transaction.CashBookId.GetValueOrDefault(),
                            transaction.TransactionDate,
                            transaction.ReferenceNumber ?? transaction.TransactionNumber,
                            "Sales Receipt",
                            $"Sales payment received from {customer.CustomerName}",
                            0m,
                            transaction.AmountReceived,
                            transaction.Id,
                            "SalesTransaction");
                    }
                }
                else if (transaction.TransactionType == "Customer Return" && transaction.RefundAmount > 0)
                {
                    if (IsBankPaymentMethod(transaction.PaymentMethod))
                    {
                        await _ledgerService.RecordTransactionAsync(
                            transaction.BankAccountId.GetValueOrDefault(),
                            transaction.TransactionDate,
                            transaction.ReferenceNumber ?? transaction.TransactionNumber,
                            "Sales Return Refund",
                            $"Sales return refund: {transaction.TransactionNumber} - {customer.CustomerName} - {(product?.Name ?? "Product")}",
                            transaction.RefundAmount,
                            0m,
                            transaction.Id,
                            "SalesTransaction");
                    }
                    else if (transaction.PaymentMethod == "Cash")
                    {
                        await _ledgerService.RecordCashTransactionAsync(
                            transaction.CashBookId.GetValueOrDefault(),
                            transaction.TransactionDate,
                            transaction.ReferenceNumber ?? transaction.TransactionNumber,
                            "Sales Return Refund",
                            $"Sales return refund: {transaction.TransactionNumber} - {customer.CustomerName} - {(product?.Name ?? "Product")}",
                            transaction.RefundAmount,
                            0m,
                            transaction.Id,
                            "SalesTransaction");
                    }
                }

                await dbTransaction.CommitAsync();

                await NotifyDashboardAsync(request.TransactionType == "Customer Return" ? "dispatch-returned" : "dispatch-created");

                var primaryProductName = product?.Name ?? (dispatchItems.Any() ? dispatchItems[0].Product.Name : "Product");
                var primaryProductSku = product?.SKU ?? (dispatchItems.Any() ? (dispatchItems[0].Product.SKU ?? string.Empty) : string.Empty);

                var dto = new SalesTransactionDto
                {
                    Id = transaction.Id,
                    TransactionNumber = transaction.TransactionNumber,
                    CustomerId = transaction.CustomerId,
                    CustomerName = customer.CustomerName,
                    CustomerCode = customer.CustomerCode,
                    ProductId = transaction.ProductId,
                    ProductName = primaryProductName,
                    ProductSku = primaryProductSku,
                    Cases = transaction.Cases,
                    TransactionType = transaction.TransactionType,
                    TransactionDate = transaction.TransactionDate,
                    ReferenceNumber = transaction.ReferenceNumber,
                    Remarks = transaction.Remarks,
                    Status = transaction.Status,
                    PaymentMethod = transaction.PaymentMethod,
                    PaymentTerms = transaction.PaymentTerms,
                    BankAccountId = transaction.BankAccountId,
                    BankAccountName = transaction.BankAccountId.HasValue ? (await _tenantContext.BankAccounts.FindAsync(transaction.BankAccountId.Value))?.BankName : null,
                    CashBookId = transaction.CashBookId,
                    CashBookName = transaction.CashBookId.HasValue ? (await _tenantContext.CashBooks.FindAsync(transaction.CashBookId.Value))?.Name : null,
                    UnitPrice = transaction.UnitPrice,
                    DiscountAmount = transaction.DiscountAmount,
                    TaxAmount = transaction.TaxAmount,
                    GstRate = transaction.GstRate,
                    IsGstApplicable = transaction.IsGstApplicable,
                    TaxTreatment = transaction.TaxTreatment,
                    CGST = transaction.CGST,
                    SGST = transaction.SGST,
                    IGST = transaction.IGST,
                    MetadataJson = transaction.MetadataJson,
                    TotalAmount = transaction.TotalAmount,
                    AmountReceived = transaction.AmountReceived,
                    OutstandingAmount = transaction.OutstandingAmount,
                    PaymentStatus = transaction.PaymentStatus,
                    ReturnedAmount = transaction.ReturnedAmount,
                    RefundAmount = transaction.RefundAmount,
                    AdjustmentAmount = transaction.AdjustmentAmount,
                    ReturnType = transaction.ReturnType,
                    IsReplacementRequired = transaction.IsReplacementRequired,
                    ProductValue = transaction.ProductValue,
                    DamageCost = transaction.DamageCost,
                    DamageReason = damageReason,
                    Items = dispatchItems.Any()
                        ? dispatchItems.Select(x => new SalesTransactionItemDto
                        {
                            Id = x.ItemEntity.Id,
                            ProductId = x.ItemEntity.ProductId,
                            ProductName = x.Product.Name,
                            ProductSku = x.Product.SKU ?? string.Empty,
                            CaseConfigurationId = x.ItemEntity.CaseConfigurationId,
                            UnitsPerCase = x.ItemEntity.UnitsPerCase,
                            Cases = x.ItemEntity.Cases,
                            UnitPrice = x.ItemEntity.UnitPrice,
                            DiscountAmount = x.ItemEntity.DiscountAmount,
                            TaxAmount = x.ItemEntity.TaxAmount,
                            GstRate = x.ItemEntity.GstRate,
                            IsGstApplicable = x.ItemEntity.IsGstApplicable,
                            CGST = x.ItemEntity.CGST,
                            SGST = x.ItemEntity.SGST,
                            IGST = x.ItemEntity.IGST,
                            TotalAmount = x.ItemEntity.TotalAmount
                        }).ToList()
                        : new List<SalesTransactionItemDto>
                        {
                            new SalesTransactionItemDto
                            {
                                Id = transaction.Id,
                                ProductId = transaction.ProductId,
                                ProductName = primaryProductName,
                                ProductSku = primaryProductSku,
                                Cases = transaction.Cases,
                                UnitPrice = transaction.UnitPrice,
                                DiscountAmount = transaction.DiscountAmount,
                                TaxAmount = transaction.TaxAmount,
                                GstRate = transaction.GstRate,
                                IsGstApplicable = transaction.IsGstApplicable,
                                CGST = transaction.CGST,
                                SGST = transaction.SGST,
                                IGST = transaction.IGST,
                                TotalAmount = transaction.TotalAmount
                            }
                        },
                    CreatedBy = transaction.CreatedBy,
                    CreatedByName = _currentUserContext.Email?.Split('@')[0] ?? "System",
                    CreatedAt = transaction.CreatedAt,
                    UpdatedAt = transaction.UpdatedAt
                };

                return Success(dto, "Sales transaction created successfully.");
            }
            catch (InvalidOperationException ex)
            {
                await dbTransaction.RollbackAsync();
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(ex.Message, "Validation Error", HttpContext.TraceIdentifier));
            }
            catch (Exception ex)
            {
                await dbTransaction.RollbackAsync();
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(ex.Message, "Transaction Failed", HttpContext.TraceIdentifier));
            }
            });
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult<ApiResponse<SalesTransactionDto>>> UpdateSalesTransaction(Guid id, [FromBody] CreateSalesTransactionRequest request)
        {
            if (!IsAuthorizedToWrite())
            {
                return Unauthorized(ApiResponse<SalesTransactionDto>.CreateFailure("Unauthorized to edit transactions.", "Unauthorized", HttpContext.TraceIdentifier));
            }

            var dbContext = _tenantContext as DbContext;
            if (dbContext == null)
            {
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Database context is invalid.", "Infrastructure Error", HttpContext.TraceIdentifier));
            }

            var strategy = dbContext.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                using var dbTransaction = await dbContext.Database.BeginTransactionAsync();
                try
                {
                var tenantId = _currentUserContext.TenantId;
                var currentUserId = _currentUserContext.UserId ?? "System";

                // Load existing transaction
                var existingTxn = await _tenantContext.SalesTransactions
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (existingTxn == null)
                {
                    return NotFound(ApiResponse<SalesTransactionDto>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                // 1. REVERSE PREVIOUS GL ENTRIES & BANK LEDGERS
                var journalEntry = await _tenantContext.JournalEntries
                    .Include(j => j.Lines)
                    .FirstOrDefaultAsync(j => j.ReferenceNumber == existingTxn.TransactionNumber && j.TenantId == tenantId);

                if (journalEntry != null)
                {
                    foreach (var line in journalEntry.Lines)
                    {
                        var account = await _tenantContext.Accounts.FindAsync(line.AccountId);
                        if (account != null)
                        {
                            // Reverse the current balances
                            if (line.DebitAmount > 0)
                            {
                                if (account.BalanceType == "Dr") account.CurrentBalance -= line.DebitAmount;
                                else account.CurrentBalance += line.DebitAmount;
                            }
                            if (line.CreditAmount > 0)
                            {
                                if (account.BalanceType == "Cr") account.CurrentBalance -= line.CreditAmount;
                                else account.CurrentBalance += line.CreditAmount;
                            }
                        }
                    }
                    _tenantContext.JournalEntries.Remove(journalEntry);
                }
                await _ledgerService.RemoveLedgerEntryForEntityAsync(existingTxn.Id, "SalesTransaction");

                // Restore customer outstanding
                var customer = await _tenantContext.Customers.FindAsync(existingTxn.CustomerId);
                if (customer != null)
                {
                    if (existingTxn.TransactionType == "Sales Dispatch")
                    {
                        customer.OutstandingPlaceholder = Math.Max(0m, customer.OutstandingPlaceholder - existingTxn.OutstandingAmount);
                    }
                    else if (existingTxn.TransactionType == "Customer Return")
                    {
                        customer.OutstandingPlaceholder += existingTxn.AdjustmentAmount;
                    }
                }

                // 2. REVERSE STOCK MOVEMENT ALGORITHM & PREVIOUS LINE ITEMS
                var oldMovements = await _tenantContext.InventoryMovements
                    .Where(m => m.ReferenceType == "SalesTransaction" && m.ReferenceId == existingTxn.Id && !m.IsDeleted)
                    .ToListAsync();

                foreach (var oldMovement in oldMovements)
                {
                    var oldProduct = await _tenantContext.Products.FirstOrDefaultAsync(p => p.Id == oldMovement.ProductId && !p.IsDeleted);
                    if (oldProduct != null)
                    {
                        oldProduct.CurrentStock -= oldMovement.Quantity;
                    }
                    oldMovement.IsDeleted = true;
                    oldMovement.DeletedAt = DateTime.UtcNow;
                    oldMovement.DeletedBy = currentUserId;
                }

                try
                {
                    var prevItems = await _tenantContext.SalesTransactionItems.Where(i => i.SalesTransactionId == existingTxn.Id).ToListAsync();
                    if (prevItems.Any())
                    {
                        _tenantContext.SalesTransactionItems.RemoveRange(prevItems);
                    }
                }
                catch { }

                await _tenantContext.SaveChangesAsync();

                // 3. APPLY NEW TRANSACTIONS (Re-runs the post workflow safely)
                var newProduct = await _tenantContext.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId && !p.IsDeleted);
                if (newProduct == null)
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("New product not found.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var company = await _tenantContext.Companies.FirstAsync();

                // Recalculate
                decimal totalAmount = 0m;
                decimal amountReceived = 0m;
                decimal outstandingAmount = 0m;
                string paymentStatus = "Pending";

                decimal returnedAmount = 0m;
                decimal refundAmount = 0m;
                decimal adjustmentAmount = 0m;
                string? returnType = null;

                decimal productValue = 0m;
                decimal damageCost = 0m;
                string? damageReason = null;

                decimal stockAdjustment = 0;
                var journalLines = new List<(Account account, decimal debit, decimal credit, string description)>();

                // Auto-resolve customer
                var newCustomer = await _tenantContext.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId && c.TenantId == tenantId && !c.IsDeleted);
                if (newCustomer == null)
                {
                    newCustomer = customer ?? await _tenantContext.Customers.FirstAsync(c => c.TenantId == tenantId);
                }

                if (request.TransactionType == "Sales Dispatch")
                {
                    CalculateDispatchTax(request, newProduct);
                    totalAmount = Math.Round(Math.Max(0m, (request.Cases * request.UnitPrice) - request.DiscountAmount) + request.TaxAmount, 2, MidpointRounding.AwayFromZero);
                    amountReceived = request.AmountReceived;
                    outstandingAmount = Math.Max(0m, totalAmount - amountReceived);

                    if (amountReceived == 0m) paymentStatus = "Pending";
                    else if (amountReceived < totalAmount) paymentStatus = "Partial";
                    else paymentStatus = "Paid";

                    newCustomer.OutstandingPlaceholder += outstandingAmount;
                    AppendCustomerLedgerEntry(newCustomer, "Sales Dispatch (Edited)", existingTxn.TransactionNumber, totalAmount, amountReceived, newCustomer.OutstandingPlaceholder);

                    var salesRevenueAccount = await ResolveAccountAsync("Sales Revenue", "4001", "Revenue", "Cr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);
                    var cogsAccount = await ResolveAccountAsync("Cost of Goods Sold", "5002", "Expenses", "Dr", tenantId, company.Id);

                    Account debitAccount;
                    if (IsBankPaymentMethod(request.PaymentMethod))
                    {
                        debitAccount = await ResolveAccountAsync("Bank Account", "1002", "Assets", "Dr", tenantId, company.Id);
                        if (request.BankAccountId.HasValue && request.BankAccountId.Value != Guid.Empty && amountReceived > 0)
                        {
                            await _ledgerService.RecordTransactionAsync(request.BankAccountId.Value, request.TransactionDate, request.ReferenceNumber?.Trim() ?? existingTxn.TransactionNumber, "Sales Receipt", $"Sales payment received from {newCustomer.CustomerName}", 0m, amountReceived, existingTxn.Id, "SalesTransaction");
                        }
                    }
                    else if (request.PaymentMethod == "Cash")
                    {
                        debitAccount = await ResolveAccountAsync("Cash", "1001", "Assets", "Dr", tenantId, company.Id);
                        if (request.CashBookId.HasValue && request.CashBookId.Value != Guid.Empty && amountReceived > 0)
                        {
                            await _ledgerService.RecordCashTransactionAsync(request.CashBookId.Value, request.TransactionDate, request.ReferenceNumber?.Trim() ?? existingTxn.TransactionNumber, "Sales Receipt", $"Sales payment received from {newCustomer.CustomerName}", 0m, amountReceived, existingTxn.Id, "SalesTransaction");
                        }
                    }
                    else
                    {
                        debitAccount = await ResolveAccountAsync("Accounts Receivable", "1200", "Assets", "Dr", tenantId, company.Id);
                    }

                    journalLines.Add((debitAccount, totalAmount, 0m, $"Customer dispatch record: {existingTxn.TransactionNumber}"));
                    journalLines.Add((salesRevenueAccount, 0m, totalAmount - request.TaxAmount, $"Dispatch sales revenue: {existingTxn.TransactionNumber}"));
                    if (request.CGST > 0) journalLines.Add((await ResolveAccountAsync("CGST Output Tax", "2101", "Liabilities", "Cr", tenantId, company.Id), 0m, request.CGST, $"CGST liability: {existingTxn.TransactionNumber}"));
                    if (request.SGST > 0) journalLines.Add((await ResolveAccountAsync("SGST Output Tax", "2102", "Liabilities", "Cr", tenantId, company.Id), 0m, request.SGST, $"SGST liability: {existingTxn.TransactionNumber}"));
                    if (request.IGST > 0) journalLines.Add((await ResolveAccountAsync("IGST Output Tax", "2103", "Liabilities", "Cr", tenantId, company.Id), 0m, request.IGST, $"IGST liability: {existingTxn.TransactionNumber}"));

                    decimal cost = request.Cases * newProduct.CostPrice;
                    if (cost > 0)
                    {
                        journalLines.Add((cogsAccount, cost, 0m, $"Cost of goods sold: {existingTxn.TransactionNumber}"));
                        journalLines.Add((inventoryAccount, 0m, cost, $"Inventory deduction: {existingTxn.TransactionNumber}"));
                    }

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Customer Return")
                {
                    returnedAmount = request.ReturnedAmount;
                    refundAmount = request.RefundAmount;
                    adjustmentAmount = request.AdjustmentAmount > 0 ? request.AdjustmentAmount : Math.Max(0m, returnedAmount - refundAmount);
                    returnType = request.ReturnType ?? "Customer Return";

                    if (adjustmentAmount > 0)
                    {
                        newCustomer.OutstandingPlaceholder = Math.Max(0m, newCustomer.OutstandingPlaceholder - adjustmentAmount);
                        AppendCustomerLedgerEntry(newCustomer, "Customer Return Note (Edited)", existingTxn.TransactionNumber, 0, adjustmentAmount, newCustomer.OutstandingPlaceholder);
                    }

                    var salesReturnAccount = await ResolveAccountAsync("Sales Return", "4002", "Revenue", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);
                    var cogsAccount = await ResolveAccountAsync("Cost of Goods Sold", "5002", "Expenses", "Dr", tenantId, company.Id);

                    Account creditAccount;
                    if (IsBankPaymentMethod(request.PaymentMethod))
                    {
                        creditAccount = await ResolveAccountAsync("Bank Account", "1002", "Assets", "Dr", tenantId, company.Id);
                        if (request.BankAccountId.HasValue && request.BankAccountId.Value != Guid.Empty && refundAmount > 0)
                        {
                            await _ledgerService.RecordTransactionAsync(request.BankAccountId.Value, request.TransactionDate, request.ReferenceNumber?.Trim() ?? existingTxn.TransactionNumber, "Sales Return Refund", $"Sales return refund: {existingTxn.TransactionNumber} - {newCustomer.CustomerName} - {newProduct.Name}", refundAmount, 0m, existingTxn.Id, "SalesTransaction");
                        }
                    }
                    else if (request.PaymentMethod == "Cash")
                    {
                        creditAccount = await ResolveAccountAsync("Cash", "1001", "Assets", "Dr", tenantId, company.Id);
                        if (request.CashBookId.HasValue && request.CashBookId.Value != Guid.Empty && refundAmount > 0)
                        {
                            await _ledgerService.RecordCashTransactionAsync(request.CashBookId.Value, request.TransactionDate, request.ReferenceNumber?.Trim() ?? existingTxn.TransactionNumber, "Sales Return Refund", $"Sales return refund: {existingTxn.TransactionNumber} - {newCustomer.CustomerName} - {newProduct.Name}", refundAmount, 0m, existingTxn.Id, "SalesTransaction");
                        }
                    }
                    else
                    {
                        creditAccount = await ResolveAccountAsync("Accounts Receivable", "1200", "Assets", "Dr", tenantId, company.Id);
                    }

                    journalLines.Add((salesReturnAccount, returnedAmount, 0m, $"Customer returns: {existingTxn.TransactionNumber}"));
                    journalLines.Add((creditAccount, 0m, returnedAmount, $"Returns refund settlement: {existingTxn.TransactionNumber}"));

                    decimal cost = request.Cases * newProduct.CostPrice;
                    if (cost > 0)
                    {
                        journalLines.Add((inventoryAccount, cost, 0m, $"Restoring stock: {existingTxn.TransactionNumber}"));
                        journalLines.Add((cogsAccount, 0m, cost, $"COGS credit reversal: {existingTxn.TransactionNumber}"));
                    }

                    stockAdjustment = request.Cases;
                }
                else if (request.TransactionType == "Damage" || request.TransactionType == "Damaged Goods")
                {
                    productValue = newProduct.CostPrice;
                    damageCost = request.Cases * productValue;
                    damageReason = request.DamageReason ?? request.Remarks;

                    var lossAccount = await ResolveAccountAsync("Inventory Loss Expense", "5003", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((lossAccount, damageCost, 0m, $"Unsellable inventory loss: {existingTxn.TransactionNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Writedown inventory: {existingTxn.TransactionNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Internal Consumption")
                {
                    productValue = newProduct.CostPrice;
                    damageCost = request.Cases * productValue;

                    var officeExpenseAccount = await ResolveAccountAsync("Office Expense", "5004", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((officeExpenseAccount, damageCost, 0m, $"Internal department usage: {existingTxn.TransactionNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Finished goods consumption: {existingTxn.TransactionNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Free Sample")
                {
                    productValue = newProduct.CostPrice;
                    damageCost = request.Cases * productValue;

                    var marketingExpenseAccount = await ResolveAccountAsync("Marketing Expense", "5005", "Expenses", "Dr", tenantId, company.Id);
                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    journalLines.Add((marketingExpenseAccount, damageCost, 0m, $"Marketing sample distribution: {existingTxn.TransactionNumber}"));
                    journalLines.Add((inventoryAccount, 0m, damageCost, $"Finished goods sample: {existingTxn.TransactionNumber}"));

                    stockAdjustment = -request.Cases;
                }
                else if (request.TransactionType == "Stock Adjustment")
                {
                    productValue = newProduct.CostPrice;
                    damageCost = request.Cases * productValue;

                    var inventoryAccount = await ResolveAccountAsync("Finished Goods Inventory", "1003", "Assets", "Dr", tenantId, company.Id);

                    if (request.Cases >= 0)
                    {
                        var adjustmentGainAccount = await ResolveAccountAsync("Inventory Adjustment Gain", "4003", "Revenue", "Cr", tenantId, company.Id);
                        journalLines.Add((inventoryAccount, Math.Abs(damageCost), 0m, $"Physical audit surplus: {existingTxn.TransactionNumber}"));
                        journalLines.Add((adjustmentGainAccount, 0m, Math.Abs(damageCost), $"Inventory adjustment gain: {existingTxn.TransactionNumber}"));
                    }
                    else
                    {
                        var adjustmentLossAccount = await ResolveAccountAsync("Inventory Adjustment Loss", "5006", "Expenses", "Dr", tenantId, company.Id);
                        journalLines.Add((adjustmentLossAccount, Math.Abs(damageCost), 0m, $"Physical audit shortage: {existingTxn.TransactionNumber}"));
                        journalLines.Add((inventoryAccount, 0m, Math.Abs(damageCost), $"Inventory adjustment loss: {existingTxn.TransactionNumber}"));
                    }

                    stockAdjustment = request.Cases;
                }

                // Apply GL entries
                if (journalLines.Any())
                {
                    await CreateJournalEntryAsync(tenantId, company.Id, "Journal Voucher", $"Sales module auto-posting (Edited): {existingTxn.TransactionNumber}", existingTxn.TransactionNumber, journalLines, currentUserId);
                }

                // Apply stock movement
                if (stockAdjustment != 0)
                {
                    await _inventoryMovementService.RecordProductMovementAsync(
                        _tenantContext,
                        request.ProductId,
                        stockAdjustment,
                        "SalesTransaction",
                        existingTxn.Id,
                        $"{request.TransactionType}: {existingTxn.TransactionNumber} (Edited)",
                        tenantId,
                        company.Id,
                        currentUserId);
                }

                // Update properties
                existingTxn.CustomerId = newCustomer.Id;
                existingTxn.ProductId = request.ProductId;
                existingTxn.Cases = request.Cases;
                existingTxn.TransactionType = request.TransactionType;
                existingTxn.TransactionDate = request.TransactionDate.ToUniversalTime();
                existingTxn.ReferenceNumber = request.ReferenceNumber?.Trim();
                existingTxn.Remarks = request.Remarks?.Trim();
                existingTxn.PaymentMethod = request.PaymentMethod;
                existingTxn.BankAccountId = request.BankAccountId;
                existingTxn.CashBookId = request.CashBookId;
                existingTxn.UnitPrice = request.UnitPrice;
                existingTxn.DiscountAmount = request.DiscountAmount;
                existingTxn.TaxAmount = request.TaxAmount;
                existingTxn.GstRate = request.GstRate;
                existingTxn.IsGstApplicable = request.IsGstApplicable;
                existingTxn.TaxTreatment = request.TaxTreatment;
                existingTxn.CGST = request.CGST;
                existingTxn.SGST = request.SGST;
                existingTxn.IGST = request.IGST;
                existingTxn.MetadataJson = EnsureInvoiceMetadata(request.MetadataJson, request.InvoiceType, request.BillType);
                existingTxn.TotalAmount = totalAmount;
                existingTxn.AmountReceived = amountReceived;
                existingTxn.OutstandingAmount = outstandingAmount;
                existingTxn.PaymentStatus = paymentStatus;
                existingTxn.ReturnedAmount = returnedAmount;
                existingTxn.RefundAmount = refundAmount;
                existingTxn.AdjustmentAmount = adjustmentAmount;
                existingTxn.ReturnType = returnType;
                existingTxn.IsReplacementRequired = request.IsReplacementRequired;
                existingTxn.ProductValue = productValue;
                existingTxn.DamageCost = damageCost;
                existingTxn.DamageReason = damageReason;
                existingTxn.UpdatedAt = DateTime.UtcNow;
                existingTxn.UpdatedBy = currentUserId;

                await _tenantContext.SaveChangesAsync();

                await dbTransaction.CommitAsync();

                var dto = new SalesTransactionDto
                {
                    Id = existingTxn.Id,
                    TransactionNumber = existingTxn.TransactionNumber,
                    CustomerId = existingTxn.CustomerId,
                    CustomerName = newCustomer.CustomerName,
                    CustomerCode = newCustomer.CustomerCode,
                    ProductId = existingTxn.ProductId,
                    ProductName = newProduct.Name,
                    ProductSku = newProduct.SKU ?? string.Empty,
                    Cases = existingTxn.Cases,
                    TransactionType = existingTxn.TransactionType,
                    TransactionDate = existingTxn.TransactionDate,
                    ReferenceNumber = existingTxn.ReferenceNumber,
                    Remarks = existingTxn.Remarks,
                    Status = existingTxn.Status,
                    PaymentMethod = existingTxn.PaymentMethod,
                    BankAccountId = existingTxn.BankAccountId,
                    BankAccountName = existingTxn.BankAccountId.HasValue ? (await _tenantContext.BankAccounts.FindAsync(existingTxn.BankAccountId.Value))?.BankName : null,
                    CashBookId = existingTxn.CashBookId,
                    CashBookName = existingTxn.CashBookId.HasValue ? (await _tenantContext.CashBooks.FindAsync(existingTxn.CashBookId.Value))?.Name : null,
                    UnitPrice = existingTxn.UnitPrice,
                    DiscountAmount = existingTxn.DiscountAmount,
                    TaxAmount = existingTxn.TaxAmount,
                    GstRate = existingTxn.GstRate,
                    IsGstApplicable = existingTxn.IsGstApplicable,
                    TaxTreatment = existingTxn.TaxTreatment,
                    CGST = existingTxn.CGST,
                    SGST = existingTxn.SGST,
                    IGST = existingTxn.IGST,
                    MetadataJson = existingTxn.MetadataJson,
                    TotalAmount = existingTxn.TotalAmount,
                    AmountReceived = existingTxn.AmountReceived,
                    OutstandingAmount = existingTxn.OutstandingAmount,
                    PaymentStatus = existingTxn.PaymentStatus,
                    ReturnedAmount = existingTxn.ReturnedAmount,
                    RefundAmount = existingTxn.RefundAmount,
                    AdjustmentAmount = existingTxn.AdjustmentAmount,
                    ReturnType = existingTxn.ReturnType,
                    IsReplacementRequired = existingTxn.IsReplacementRequired,
                    ProductValue = existingTxn.ProductValue,
                    DamageCost = existingTxn.DamageCost,
                    DamageReason = existingTxn.DamageReason,
                    CreatedBy = existingTxn.CreatedBy,
                    CreatedByName = _currentUserContext.Email?.Split('@')[0] ?? "System",
                    CreatedAt = existingTxn.CreatedAt,
                    UpdatedAt = existingTxn.UpdatedAt
                };

                return Success(dto, "Sales transaction updated successfully.");
            }
            catch (InvalidOperationException ex)
            {
                await dbTransaction.RollbackAsync();
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(ex.Message, "Validation Error", HttpContext.TraceIdentifier));
            }
            catch (Exception ex)
            {
                await dbTransaction.RollbackAsync();
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(ex.Message, "Transaction Failed", HttpContext.TraceIdentifier));
            }
            });
        }

        [HttpDelete("{id:guid}")]
        public async Task<ActionResult<ApiResponse<object>>> DeleteSalesTransaction(Guid id)
        {
            if (!IsAuthorizedToWrite())
            {
                return Unauthorized(ApiResponse<object>.CreateFailure("Unauthorized to delete transactions.", "Unauthorized", HttpContext.TraceIdentifier));
            }

            var dbContext = _tenantContext as DbContext;
            if (dbContext == null)
            {
                return BadRequest(ApiResponse<object>.CreateFailure("Database context is invalid.", "Infrastructure Error", HttpContext.TraceIdentifier));
            }

            var strategy = dbContext.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                using var dbTransaction = await dbContext.Database.BeginTransactionAsync();
                try
                {
                var tenantId = _currentUserContext.TenantId;
                var currentUserId = _currentUserContext.UserId ?? "System";

                // Load transaction
                var transaction = await _tenantContext.SalesTransactions
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (transaction == null)
                {
                    return NotFound(ApiResponse<object>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                // 1. REVERSE GL ENTRIES & BANK LEDGERS
                if (string.Equals(transaction.TransactionType, "Sales Dispatch", StringComparison.OrdinalIgnoreCase))
                {
                    var hasChildren = await _tenantContext.SalesTransactions
                        .AnyAsync(s => s.ParentTransactionId == id && !s.IsDeleted);

                    if (hasChildren)
                    {
                        return BadRequest(ApiResponse<object>.CreateFailure("Cannot delete this Sales Dispatch because active Returns or Damages are linked to it. Reverse the child transactions first.", "Validation Error", HttpContext.TraceIdentifier));
                    }
                }

                // 1. REVERSE JOURNAL ENTRIES AND LEDGER
                var journalEntry = await _tenantContext.JournalEntries
                    .Include(j => j.Lines)
                    .FirstOrDefaultAsync(j => j.ReferenceNumber == transaction.TransactionNumber && j.TenantId == tenantId);

                if (journalEntry != null)
                {
                    foreach (var line in journalEntry.Lines)
                    {
                        var account = await _tenantContext.Accounts.FindAsync(line.AccountId);
                        if (account != null)
                        {
                            if (line.DebitAmount > 0)
                            {
                                if (account.BalanceType == "Dr") account.CurrentBalance -= line.DebitAmount;
                                else account.CurrentBalance += line.DebitAmount;
                            }
                            if (line.CreditAmount > 0)
                            {
                                if (account.BalanceType == "Cr") account.CurrentBalance -= line.CreditAmount;
                                else account.CurrentBalance += line.CreditAmount;
                            }
                        }
                    }
                    _tenantContext.JournalEntries.Remove(journalEntry);
                }
                await _ledgerService.RemoveLedgerEntryForEntityAsync(transaction.Id, "SalesTransaction");

                // Restore customer balance
                var customer = await _tenantContext.Customers.FindAsync(transaction.CustomerId);
                if (customer != null)
                {
                    if (transaction.TransactionType == "Sales Dispatch")
                    {
                        customer.OutstandingPlaceholder = Math.Max(0m, customer.OutstandingPlaceholder - transaction.OutstandingAmount);
                        AppendCustomerLedgerEntry(customer, "Sales Cancelled", transaction.TransactionNumber, 0, transaction.TotalAmount, customer.OutstandingPlaceholder);
                    }
                    else if (transaction.TransactionType == "Customer Return")
                    {
                        customer.OutstandingPlaceholder += transaction.AdjustmentAmount;
                        AppendCustomerLedgerEntry(customer, "Returns Cancelled", transaction.TransactionNumber, transaction.ReturnedAmount, 0, customer.OutstandingPlaceholder);
                    }
                }

                // 2. REVERSE STOCK MOVEMENT ALGORITHM
                var oldMovements = await _tenantContext.InventoryMovements
                    .Where(m => m.ReferenceType == "SalesTransaction" && m.ReferenceId == transaction.Id && !m.IsDeleted)
                    .ToListAsync();

                foreach (var oldMovement in oldMovements)
                {
                    var product = await _tenantContext.Products.FirstOrDefaultAsync(p => p.Id == oldMovement.ProductId && !p.IsDeleted);
                    if (product != null)
                    {
                        product.CurrentStock -= oldMovement.Quantity;
                    }

                    oldMovement.IsDeleted = true;
                    oldMovement.DeletedAt = DateTime.UtcNow;
                    oldMovement.DeletedBy = currentUserId;
                }

                // 3. SOFT DELETE TRANSACTION
                transaction.IsDeleted = true;
                transaction.DeletedAt = DateTime.UtcNow;
                transaction.DeletedBy = currentUserId;

                await _tenantContext.SaveChangesAsync();

                await dbTransaction.CommitAsync();

                return Success<object?>(null, "Sales transaction deleted successfully.");
            }
            catch (Exception ex)
            {
                await dbTransaction.RollbackAsync();
                return BadRequest(ApiResponse<object>.CreateFailure(ex.Message, "Transaction Failed", HttpContext.TraceIdentifier));
            }
            });
        }

        [HttpGet("{id}/history")]
        public async Task<ActionResult<ApiResponse<object>>> GetDispatchHistory(Guid id)
        {
            try
            {
                await EnsureCustomerColumnsAsync();
                var tenantId = _currentUserContext.TenantId;
                var target = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (target == null)
                {
                    return NotFound(ApiResponse<object>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                // If target is a child transaction (e.g. Return or Damage), resolve its parent dispatch
                var parent = target;
                if (target.ParentTransactionId.HasValue)
                {
                    id = target.ParentTransactionId.Value;
                    parent = await _tenantContext.SalesTransactions
                        .Include(t => t.Customer)
                        .Include(t => t.Product)
                        .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                    if (parent == null)
                    {
                        return NotFound(ApiResponse<object>.CreateFailure("Parent Sales Dispatch not found.", "Not Found", HttpContext.TraceIdentifier));
                    }
                }

                var children = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .Where(t => t.ParentTransactionId == id && t.TenantId == tenantId && !t.IsDeleted)
                    .OrderBy(t => t.CreatedAt)
                    .ToListAsync();

                var usersDict = await _tenantContext.Users.ToDictionaryAsync(
                    u => u.Id.ToString(), 
                    u => !string.IsNullOrWhiteSpace(u.FirstName) ? $"{u.FirstName} {u.LastName}".Trim() : (u.Username ?? u.Email));

                decimal returnedCases = children.Where(c => c.TransactionType == "Customer Return").Sum(c => Math.Abs(c.Cases));
                decimal damagedCases = children.Where(c => c.TransactionType == "Damage" || c.TransactionType == "Damaged Goods").Sum(c => Math.Abs(c.Cases));
                decimal originalCases = Math.Abs(parent.Cases);
                decimal remainingCases = Math.Max(0, originalCases - (returnedCases + damagedCases));

                var items = new List<(Guid id, DateTime date, DateTime createdAt, string transactionNumber, string transactionType, decimal cases, decimal totalAmount, string? paymentMethod, string status, string createdBy, bool isParent)>
                {
                    (
                        parent.Id,
                        parent.TransactionDate,
                        parent.CreatedAt,
                        parent.TransactionNumber,
                        parent.TransactionType,
                        Math.Abs(parent.Cases),
                        parent.TotalAmount,
                        parent.PaymentMethod,
                        parent.Status,
                        usersDict.TryGetValue(parent.CreatedBy, out var pUser) ? pUser : parent.CreatedBy,
                        true
                    )
                };

                foreach (var child in children)
                {
                    items.Add((
                        child.Id,
                        child.TransactionDate,
                        child.CreatedAt,
                        child.TransactionNumber,
                        child.TransactionType,
                        Math.Abs(child.Cases),
                        child.TotalAmount,
                        child.PaymentMethod ?? child.ReturnType,
                        child.Status,
                        usersDict.TryGetValue(child.CreatedBy, out var cUser) ? cUser : child.CreatedBy,
                        false
                    ));
                }

                var historyList = items
                    .OrderByDescending(x => x.createdAt)
                    .Select(x => new
                    {
                        id = x.id,
                        date = x.date,
                        createdAt = x.createdAt,
                        transactionNumber = x.transactionNumber,
                        transactionType = x.transactionType,
                        cases = x.cases,
                        totalAmount = x.totalAmount,
                        paymentMethod = x.paymentMethod,
                        status = x.status,
                        createdBy = x.createdBy,
                        isParent = x.isParent
                    })
                    .ToList();

                return Success<object>(new
                {
                    parentDispatch = new
                    {
                        id = parent.Id,
                        transactionNumber = parent.TransactionNumber,
                        transactionDate = parent.TransactionDate,
                        customerName = parent.Customer?.CustomerName ?? "Unknown Customer",
                        productName = parent.Product?.Name ?? "Unknown Product",
                        originalCases = originalCases,
                        totalAmount = parent.TotalAmount,
                        returnedCases = returnedCases,
                        damagedCases = damagedCases,
                        remainingCases = remainingCases
                    },
                    history = historyList
                }, "Dispatch history retrieved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>(ex.Message, "Failed to retrieve dispatch history.");
            }
        }

        [HttpGet("{id:guid}/timeline")]
        public async Task<ActionResult<ApiResponse<List<SalesTransactionTimelineEventDto>>>> GetSalesTransactionTimeline(Guid id)
        {
            try
            {
                var tenantId = _currentUserContext.TenantId;
                var txn = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (txn == null)
                {
                    return NotFound(ApiResponse<List<SalesTransactionTimelineEventDto>>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                // Resolve user mappings for friendly display names
                var tenantUsers = await _tenantContext.Users
                    .ToDictionaryAsync(
                        u => u.Id.ToString(),
                        u => !string.IsNullOrWhiteSpace(u.FirstName) ? $"{u.FirstName} {u.LastName}".Trim() : (u.Username ?? u.Email));

                var platformUsers = await _platformContext.Users
                    .ToDictionaryAsync(
                        u => u.Id.ToString(),
                        u => !string.IsNullOrWhiteSpace(u.FirstName) ? $"{u.FirstName} {u.LastName}".Trim() : (u.Username ?? u.Email));

                string ResolveUserName(string? userId)
                {
                    if (string.IsNullOrWhiteSpace(userId)) return "System";
                    if (tenantUsers.TryGetValue(userId, out var tName) && !string.IsNullOrWhiteSpace(tName)) return tName;
                    if (platformUsers.TryGetValue(userId, out var pName) && !string.IsNullOrWhiteSpace(pName)) return pName;
                    if (Guid.TryParse(userId, out _)) return "System";
                    return userId;
                }

                var timeline = new List<SalesTransactionTimelineEventDto>();

                // 1. Transaction Initialized & Created Event
                var creatorName = ResolveUserName(txn.CreatedBy);
                timeline.Add(new SalesTransactionTimelineEventDto
                {
                    Id = $"create-{txn.Id}",
                    Timestamp = txn.CreatedAt,
                    EventType = "CREATED",
                    Title = "Document Initialized & Posted",
                    ActorName = creatorName,
                    Status = "Success",
                    Description = $"{txn.TransactionType} document {txn.TransactionNumber} initialized for {Math.Abs(txn.Cases)} Cases of {txn.Product?.Name ?? "Product"} (Customer: {txn.Customer?.CustomerName ?? "System Internal"}). Total: ₹{txn.TotalAmount:N2}.",
                    Metadata = new Dictionary<string, object?>
                    {
                        { "transactionNumber", txn.TransactionNumber },
                        { "transactionType", txn.TransactionType },
                        { "cases", Math.Abs(txn.Cases) },
                        { "unitPrice", txn.UnitPrice },
                        { "totalAmount", txn.TotalAmount },
                        { "customerName", txn.Customer?.CustomerName },
                        { "productName", txn.Product?.Name },
                        { "paymentMethod", txn.PaymentMethod }
                    }
                });

                // 2. Inventory Movement Events
                var inventoryMovements = await _tenantContext.InventoryMovements
                    .Include(m => m.Product)
                    .Where(m => m.ReferenceType == "SalesTransaction" && m.ReferenceId == txn.Id && m.TenantId == tenantId && !m.IsDeleted)
                    .OrderBy(m => m.CreatedAt)
                    .ToListAsync();

                foreach (var movement in inventoryMovements)
                {
                    var isDeduction = movement.Quantity < 0;
                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"inv-{movement.Id}",
                        Timestamp = movement.CreatedAt,
                        EventType = "INVENTORY",
                        Title = isDeduction ? "Inventory Stock Deducted" : "Inventory Stock Restored",
                        ActorName = ResolveUserName(movement.CreatedBy),
                        Status = "Success",
                        Description = $"{Math.Abs(movement.Quantity)} Cases {(isDeduction ? "deducted from" : "restored to")} finished goods inventory for {movement.Product?.Name ?? txn.Product?.Name ?? "Product"}. (Balance after movement: {movement.BalanceAfter} Cases).",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "quantity", movement.Quantity },
                            { "inventoryType", movement.InventoryType },
                            { "balanceAfter", movement.BalanceAfter },
                            { "notes", movement.Notes }
                        }
                    });
                }

                // If no direct movement entity is found but transaction changed physical cases
                if (!inventoryMovements.Any() && txn.Cases != 0)
                {
                    var isDeduction = txn.TransactionType == "Sales Dispatch" || txn.TransactionType == "Damage" || txn.TransactionType == "Internal Consumption" || txn.TransactionType == "Free Sample";
                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"inv-auto-{txn.Id}",
                        Timestamp = txn.CreatedAt.AddSeconds(1),
                        EventType = "INVENTORY",
                        Title = isDeduction ? "Inventory Stock Deducted" : "Inventory Adjusted",
                        ActorName = creatorName,
                        Status = "Success",
                        Description = $"{Math.Abs(txn.Cases)} Cases deducted from finished goods stock for {txn.Product?.Name ?? "Product"}.",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "cases", Math.Abs(txn.Cases) },
                            { "productName", txn.Product?.Name }
                        }
                    });
                }

                // 3. Customer Ledger Posting Event
                if (txn.Customer != null && txn.CustomerId != Guid.Empty)
                {
                    var isCredit = string.Equals(txn.PaymentMethod, "Credit", StringComparison.OrdinalIgnoreCase);
                    var customerNarration = isCredit
                        ? $"Accounts Receivable posted: ₹{txn.TotalAmount:N2} (Outstanding balance updated for {txn.Customer.CustomerName})."
                        : $"Customer dispatch ledger updated: ₹{txn.TotalAmount:N2} via {txn.PaymentMethod ?? "Cash"}. Amount received: ₹{txn.AmountReceived:N2}.";

                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"cust-ledger-{txn.Id}",
                        Timestamp = txn.CreatedAt.AddSeconds(2),
                        EventType = "CUSTOMER_LEDGER",
                        Title = "Customer Ledger Updated",
                        ActorName = creatorName,
                        Status = "Success",
                        Description = customerNarration,
                        Metadata = new Dictionary<string, object?>
                        {
                            { "customerName", txn.Customer.CustomerName },
                            { "totalAmount", txn.TotalAmount },
                            { "amountReceived", txn.AmountReceived },
                            { "outstandingAmount", txn.OutstandingAmount },
                            { "paymentStatus", txn.PaymentStatus }
                        }
                    });
                }

                // 4. General Ledger Double-Entry (Journal Entries)
                var journalEntries = await _tenantContext.JournalEntries
                    .Include(j => j.Lines)
                    .ThenInclude(l => l.Account)
                    .Where(j => (j.ReferenceNumber == txn.TransactionNumber || j.SourceSalesTransactionId == txn.Id) && j.TenantId == tenantId)
                    .OrderBy(j => j.CreatedAt)
                    .ToListAsync();

                foreach (var journal in journalEntries)
                {
                    var lineDetails = journal.Lines.Select(l => new
                    {
                        account = l.Account?.AccountName ?? "Account",
                        dr = l.DebitAmount,
                        cr = l.CreditAmount,
                        narration = l.Description
                    }).ToList();

                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"gl-{journal.Id}",
                        Timestamp = journal.CreatedAt,
                        EventType = "GENERAL_LEDGER",
                        Title = "General Ledger Posted",
                        ActorName = ResolveUserName(journal.CreatedBy),
                        Status = "Success",
                        Description = $"Journal voucher #{journal.VoucherNumber} posted successfully with {journal.Lines.Count} double-entry lines ({journal.Remarks ?? journal.VoucherType}).",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "voucherNumber", journal.VoucherNumber },
                            { "linesCount", journal.Lines.Count },
                            { "lines", lineDetails }
                        }
                    });
                }

                // 5. Payment & Settlement Ledger Records (Bank/Cash)
                var ledgerEntries = await _tenantContext.BankLedgerEntries
                    .Include(b => b.BankAccount)
                    .Include(b => b.CashBook)
                    .Where(b => b.RelatedEntityId == txn.Id && b.RelatedEntityType == "SalesTransaction" && b.TenantId == tenantId)
                    .OrderBy(b => b.CreatedAt)
                    .ToListAsync();

                foreach (var entry in ledgerEntries)
                {
                    var isDeposit = entry.Debit > 0;
                    var amount = isDeposit ? entry.Debit : entry.Credit;
                    var accountName = entry.BankAccount?.BankName ?? entry.CashBook?.Name ?? (entry.LedgerAccountType == "CashBook" ? "Cash Register" : "Bank Account");

                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"ledger-{entry.Id}",
                        Timestamp = entry.CreatedAt,
                        EventType = "PAYMENT",
                        Title = isDeposit ? "Payment Settlement Received" : "Refund Disbursed",
                        ActorName = ResolveUserName(entry.CreatedBy),
                        Status = "Success",
                        Description = $"₹{amount:N2} {(isDeposit ? "received into" : "paid from")} {accountName}. Ref / UTR: {entry.ReferenceNumber}.",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "amount", amount },
                            { "accountName", accountName },
                            { "referenceNumber", entry.ReferenceNumber }
                        }
                    });
                }

                // 6. Audit Logs & Edit History
                var auditLogs = await _tenantContext.AuditLogs
                    .Where(a => a.TableName == "SalesTransactions" && a.PrimaryKey == txn.Id.ToString() && a.TenantId == tenantId)
                    .OrderBy(a => a.Timestamp)
                    .ToListAsync();

                foreach (var audit in auditLogs)
                {
                    var actionName = audit.Action ?? "Modified";
                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"audit-{audit.Id}",
                        Timestamp = audit.Timestamp,
                        EventType = "AUDIT",
                        Title = actionName == "Update" ? "Transaction Edited" : $"Audit Event ({actionName})",
                        ActorName = audit.UserEmail ?? ResolveUserName(audit.UserId),
                        Status = "Edited",
                        Description = audit.Reason ?? $"Transaction record {actionName.ToLower()} in system.",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "action", audit.Action },
                            { "oldValues", audit.OldValues },
                            { "newValues", audit.NewValues }
                        }
                    });
                }

                // If transaction has UpdatedAt and wasn't already covered by AuditLogs
                if (txn.UpdatedAt.HasValue && (txn.UpdatedAt.Value - txn.CreatedAt).TotalSeconds > 10 && !auditLogs.Any(a => Math.Abs((a.Timestamp - txn.UpdatedAt.Value).TotalSeconds) < 5))
                {
                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"edit-{txn.Id}-{txn.UpdatedAt.Value.Ticks}",
                        Timestamp = txn.UpdatedAt.Value,
                        EventType = "EDITED",
                        Title = "Transaction Edited & Re-Posted",
                        ActorName = ResolveUserName(txn.UpdatedBy),
                        Status = "Edited",
                        Description = "Sales document was modified and financial/inventory postings were synchronized.",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "updatedAt", txn.UpdatedAt.Value },
                            { "cases", Math.Abs(txn.Cases) },
                            { "totalAmount", txn.TotalAmount }
                        }
                    });
                }

                // 7. Linked Child Transactions (Customer Returns / Damages)
                var childTxns = await _tenantContext.SalesTransactions
                    .Include(c => c.Product)
                    .Where(c => c.ParentTransactionId == txn.Id && c.TenantId == tenantId && !c.IsDeleted)
                    .OrderBy(c => c.CreatedAt)
                    .ToListAsync();

                foreach (var child in childTxns)
                {
                    var isReturn = child.TransactionType == "Customer Return";
                    timeline.Add(new SalesTransactionTimelineEventDto
                    {
                        Id = $"child-{child.Id}",
                        Timestamp = child.CreatedAt,
                        EventType = isReturn ? "CHILD_RETURN" : "CHILD_DAMAGE",
                        Title = isReturn ? "Customer Return Linked" : "Damage Logged",
                        ActorName = ResolveUserName(child.CreatedBy),
                        Status = "Info",
                        Description = $"{child.TransactionType} {child.TransactionNumber} logged against this dispatch: {Math.Abs(child.Cases)} Cases (₹{child.TotalAmount:N2}). Status: {child.Status}.",
                        Metadata = new Dictionary<string, object?>
                        {
                            { "childTransactionId", child.Id },
                            { "transactionNumber", child.TransactionNumber },
                            { "transactionType", child.TransactionType },
                            { "cases", Math.Abs(child.Cases) },
                            { "totalAmount", child.TotalAmount },
                            { "status", child.Status }
                        }
                    });
                }

                // 8. Linked Parent Dispatch (if this transaction is a Return or Damage)
                if (txn.ParentTransactionId.HasValue)
                {
                    var parentTxn = await _tenantContext.SalesTransactions
                        .FirstOrDefaultAsync(p => p.Id == txn.ParentTransactionId.Value && p.TenantId == tenantId && !p.IsDeleted);

                    if (parentTxn != null)
                    {
                        timeline.Add(new SalesTransactionTimelineEventDto
                        {
                            Id = $"parent-{parentTxn.Id}",
                            Timestamp = txn.CreatedAt,
                            EventType = "PARENT_LINK",
                            Title = "Linked to Parent Sales Dispatch",
                            ActorName = creatorName,
                            Status = "Info",
                            Description = $"Linked to original Sales Dispatch {parentTxn.TransactionNumber} ({Math.Abs(parentTxn.Cases)} Cases, ₹{parentTxn.TotalAmount:N2}).",
                            Metadata = new Dictionary<string, object?>
                            {
                                { "parentTransactionId", parentTxn.Id },
                                { "parentTransactionNumber", parentTxn.TransactionNumber },
                                { "parentCases", Math.Abs(parentTxn.Cases) }
                            }
                        });
                    }
                }

                // Sort timeline chronologically (Oldest to Newest)
                var sortedTimeline = timeline.OrderBy(t => t.Timestamp).ToList();

                return Success(sortedTimeline, "Transaction timeline retrieved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<List<SalesTransactionTimelineEventDto>>(ex.Message, "Failed to retrieve transaction timeline.");
            }
        }

        [HttpPost("{id:guid}/collect")]
        public async Task<ActionResult<ApiResponse<SalesTransactionDto>>> CollectPayment(Guid id, [FromBody] CollectSalesPaymentRequest request)
        {
            if (!IsAuthorizedToWrite())
            {
                return Unauthorized(ApiResponse<SalesTransactionDto>.CreateFailure("You do not have permission to perform payment collections.", "Unauthorized", HttpContext.TraceIdentifier));
            }

            if (request == null || request.Amount <= 0)
            {
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Collection amount must be greater than zero.", "Validation Error", HttpContext.TraceIdentifier));
            }

            var dbContext = _tenantContext as DbContext;
            if (dbContext == null)
            {
                return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Database context is invalid.", "Infrastructure Error", HttpContext.TraceIdentifier));
            }

            var strategy = dbContext.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                using var dbTransaction = await dbContext.Database.BeginTransactionAsync();
                try
                {
                var tenantId = _currentUserContext.TenantId;
                var currentUserId = _currentUserContext.UserId ?? "System";
                var userEmail = _currentUserContext.Email ?? "system@aquzio.com";

                // Load authoritative Sales Transaction
                var txn = await _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (txn == null)
                {
                    return NotFound(ApiResponse<SalesTransactionDto>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                // Authoritative balance calculation
                decimal saleTotal = txn.TotalAmount;
                decimal currentReceived = txn.AmountReceived;
                decimal actualOutstanding = txn.OutstandingAmount > 0 
                    ? txn.OutstandingAmount 
                    : Math.Max(0m, saleTotal - currentReceived);

                if (actualOutstanding <= 0)
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("This credit transaction has already been fully settled (₹0.00 outstanding balance).", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (request.Amount > (actualOutstanding + 0.0001m))
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure(
                        $"Collection amount (₹{request.Amount:N2}) exceeds the current outstanding balance of ₹{actualOutstanding:N2}. Outstanding balance may have changed. Please refresh and try again.",
                        "Validation Error",
                        HttpContext.TraceIdentifier));
                }

                var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                if (company == null)
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Company profile not found.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var paymentMethod = string.IsNullOrWhiteSpace(request.PaymentMethod) ? "Cash" : request.PaymentMethod.Trim();
                var isBank = IsBankPaymentMethod(paymentMethod);
                var isCash = paymentMethod.Equals("Cash", StringComparison.OrdinalIgnoreCase);

                if (!isCash && !isBank)
                {
                    return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("Please select a valid payment method (Cash, Bank Transfer, UPI, Cheque).", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (isBank && (!request.BankAccountId.HasValue || request.BankAccountId.Value == Guid.Empty))
                {
                    var defaultBank = await _tenantContext.BankAccounts.FirstOrDefaultAsync(b => b.TenantId == tenantId && !b.IsDeleted);
                    if (defaultBank != null) request.BankAccountId = defaultBank.Id;
                    else return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("A Bank Account is required to receive electronic/bank payments.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (isCash && (!request.CashBookId.HasValue || request.CashBookId.Value == Guid.Empty))
                {
                    var defaultCash = await _tenantContext.CashBooks.FirstOrDefaultAsync(c => c.TenantId == tenantId && !c.IsDeleted);
                    if (defaultCash != null) request.CashBookId = defaultCash.Id;
                    else return BadRequest(ApiResponse<SalesTransactionDto>.CreateFailure("A Cash Register is required to receive cash payments.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var paymentRef = string.IsNullOrWhiteSpace(request.ReferenceNumber) 
                    ? $"COL-{DateTime.UtcNow:yyyyMMdd}-{new Random().Next(1000, 9999)}" 
                    : request.ReferenceNumber.Trim();

                var paymentDate = request.PaymentDate.HasValue && request.PaymentDate.Value != default 
                    ? request.PaymentDate.Value.ToUniversalTime() 
                    : DateTime.UtcNow;

                // 1. Update Sales Transaction
                txn.AmountReceived += request.Amount;
                txn.OutstandingAmount = Math.Max(0m, saleTotal - txn.AmountReceived);
                txn.PaymentStatus = txn.OutstandingAmount <= 0 ? "Paid" : "Partially Paid";
                txn.UpdatedAt = DateTime.UtcNow;
                txn.UpdatedBy = currentUserId;

                _tenantContext.SalesTransactions.Update(txn);

                // 2. Update Customer Balance and append to Customer Ledger
                if (txn.Customer != null)
                {
                    txn.Customer.OutstandingPlaceholder = Math.Max(0m, txn.Customer.OutstandingPlaceholder - request.Amount);
                    AppendCustomerLedgerEntry(
                        txn.Customer, 
                        "Credit Sale Collection", 
                        paymentRef, 
                        0m, 
                        request.Amount, 
                        txn.Customer.OutstandingPlaceholder);

                    _tenantContext.Customers.Update(txn.Customer);
                }

                // 3. Post General Ledger Double-Entry (Receipt Voucher)
                var arAccount = await ResolveAccountAsync("Accounts Receivable", "1200", "Assets", "Dr", tenantId, company.Id);
                Account receivedAccount;

                if (isBank)
                {
                    receivedAccount = await ResolveAccountAsync("Bank Account", "1002", "Assets", "Dr", tenantId, company.Id);
                }
                else
                {
                    receivedAccount = await ResolveAccountAsync("Cash", "1001", "Assets", "Dr", tenantId, company.Id);
                }

                var journalLines = new List<(Account account, decimal debit, decimal credit, string description)>
                {
                    (receivedAccount, request.Amount, 0m, $"Credit sales collection for {txn.TransactionNumber} - {txn.Customer?.CustomerName ?? "Customer"}"),
                    (arAccount, 0m, request.Amount, $"Settlement of Accounts Receivable for {txn.TransactionNumber}")
                };

                await CreateJournalEntryAsync(
                    tenantId, 
                    company.Id, 
                    "Receipt Voucher", 
                    $"Collection for {txn.TransactionNumber}: ₹{request.Amount:N2} via {paymentMethod}", 
                    paymentRef, 
                    journalLines, 
                    currentUserId);

                // 4. Post Bank Ledger / Cash Register Transaction
                var ledgerDescription = $"Credit sale payment collected for {txn.TransactionNumber} from {txn.Customer?.CustomerName ?? "Customer"}" +
                    (!string.IsNullOrWhiteSpace(request.Notes) ? $" (Notes: {request.Notes})" : "");

                if (isBank && request.BankAccountId.HasValue)
                {
                    await _ledgerService.RecordTransactionAsync(
                        request.BankAccountId.Value,
                        paymentDate,
                        paymentRef,
                        "Sales Collection",
                        ledgerDescription,
                        0m,
                        request.Amount,
                        txn.Id,
                        "SalesTransaction");
                }
                else if (isCash && request.CashBookId.HasValue)
                {
                    await _ledgerService.RecordCashTransactionAsync(
                        request.CashBookId.Value,
                        paymentDate,
                        paymentRef,
                        "Sales Collection",
                        ledgerDescription,
                        0m,
                        request.Amount,
                        txn.Id,
                        "SalesTransaction");
                }

                // 5. Add Audit Log
                _tenantContext.AuditLogs.Add(new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    UserId = currentUserId,
                    UserEmail = userEmail,
                    Action = "Payment Collected",
                    TableName = "SalesTransactions",
                    PrimaryKey = txn.Id.ToString(),
                    Reason = $"Collected ₹{request.Amount:N2} via {paymentMethod} (Ref: {paymentRef}). Outstanding remaining: ₹{txn.OutstandingAmount:N2}.",
                    Timestamp = DateTime.UtcNow
                });

                await _tenantContext.SaveChangesAsync();
                await dbTransaction.CommitAsync();

                // 6. SignalR Broadcast
                await NotifyDashboardAsync("SalesPaymentCollected", new
                {
                    transactionId = txn.Id,
                    transactionNumber = txn.TransactionNumber,
                    amount = request.Amount,
                    remainingBalance = txn.OutstandingAmount,
                    paymentStatus = txn.PaymentStatus
                });

                // 7. Return refreshed SalesTransactionDto
                var creatorUser = await _platformContext.Users.FirstOrDefaultAsync(u => u.Id.ToString() == txn.CreatedBy);
                var createdByName = creatorUser != null ? $"{creatorUser.FirstName} {creatorUser.LastName}" : "System";

                var dto = new SalesTransactionDto
                {
                    Id = txn.Id,
                    TransactionNumber = txn.TransactionNumber,
                    CustomerId = txn.CustomerId,
                    CustomerName = txn.Customer?.CustomerName ?? "Unknown Customer",
                    CustomerCode = txn.Customer?.CustomerCode ?? string.Empty,
                    ProductId = txn.ProductId,
                    ProductName = txn.Product?.Name ?? "Unknown Product",
                    ProductSku = txn.Product?.SKU ?? string.Empty,
                    ParentTransactionId = txn.ParentTransactionId,
                    Cases = txn.Cases,
                    TransactionType = txn.TransactionType,
                    TransactionDate = txn.TransactionDate,
                    ReferenceNumber = txn.ReferenceNumber,
                    Remarks = txn.Remarks,
                    Status = txn.Status,
                    PaymentMethod = txn.PaymentMethod,
                    BankAccountId = txn.BankAccountId,
                    CashBookId = txn.CashBookId,
                    UnitPrice = txn.UnitPrice,
                    DiscountAmount = txn.DiscountAmount,
                    TaxAmount = txn.TaxAmount,
                    GstRate = txn.GstRate,
                    IsGstApplicable = txn.IsGstApplicable,
                    TaxTreatment = txn.TaxTreatment,
                    CGST = txn.CGST,
                    SGST = txn.SGST,
                    IGST = txn.IGST,
                    MetadataJson = txn.MetadataJson,
                    TotalAmount = txn.TotalAmount,
                    AmountReceived = txn.AmountReceived,
                    OutstandingAmount = txn.OutstandingAmount,
                    PaymentStatus = txn.PaymentStatus,
                    ReturnedAmount = txn.ReturnedAmount,
                    RefundAmount = txn.RefundAmount,
                    AdjustmentAmount = txn.AdjustmentAmount,
                    ReturnType = txn.ReturnType,
                    IsReplacementRequired = txn.IsReplacementRequired,
                    ProductValue = txn.ProductValue,
                    DamageCost = txn.DamageCost,
                    DamageReason = txn.DamageReason,
                    CreatedBy = txn.CreatedBy,
                    CreatedByName = createdByName,
                    CreatedAt = txn.CreatedAt,
                    UpdatedAt = txn.UpdatedAt
                };

                return Success(dto, $"Payment of ₹{request.Amount:N2} collected successfully for {txn.TransactionNumber}.");
            }
            catch (Exception ex)
            {
                await dbTransaction.RollbackAsync();
                return Failure<SalesTransactionDto>(ex.Message, "Failed to collect sales payment.");
            }
            });
        }

        [HttpGet("{id:guid}/payments")]
        public async Task<ActionResult<ApiResponse<List<SalesPaymentRecordDto>>>> GetSalesPayments(Guid id)
        {
            try
            {
                var tenantId = _currentUserContext.TenantId;
                var txn = await _tenantContext.SalesTransactions
                    .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId && !t.IsDeleted);

                if (txn == null)
                {
                    return NotFound(ApiResponse<List<SalesPaymentRecordDto>>.CreateFailure("Sales transaction not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                var entries = await _tenantContext.BankLedgerEntries
                    .Include(b => b.BankAccount)
                    .Include(b => b.CashBook)
                    .Where(b => b.RelatedEntityId == id && b.RelatedEntityType == "SalesTransaction" && b.TenantId == tenantId)
                    .OrderByDescending(b => b.TransactionDate)
                    .ThenByDescending(b => b.CreatedAt)
                    .ToListAsync();

                var creatorIds = entries
                    .Select(e => e.CreatedBy)
                    .Where(cb => !string.IsNullOrEmpty(cb) && Guid.TryParse(cb, out _))
                    .Select(Guid.Parse)
                    .Distinct()
                    .ToList();

                var usersDict = await _platformContext.Users
                    .Where(u => creatorIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id.ToString(), u => $"{u.FirstName} {u.LastName}");

                var records = entries.Select(e => new SalesPaymentRecordDto
                {
                    Id = e.Id,
                    Date = e.TransactionDate,
                    CreatedAt = e.CreatedAt,
                    Amount = e.Debit > 0 ? e.Debit : (e.Credit > 0 ? e.Credit : 0m),
                    PaymentMethod = e.LedgerAccountType == "CashBook" || e.CashBookId.HasValue ? "Cash" : "Bank Transfer",
                    ReferenceNumber = e.ReferenceNumber,
                    Description = e.Description,
                    AccountName = e.BankAccount?.BankName ?? e.CashBook?.Name ?? (e.LedgerAccountType == "CashBook" ? "Cash Register" : "Bank Account"),
                    CollectedBy = usersDict.TryGetValue(e.CreatedBy, out var uName) ? uName : (string.IsNullOrWhiteSpace(e.CreatedBy) ? "System" : e.CreatedBy)
                }).ToList();

                return Success(records, "Payment records retrieved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<List<SalesPaymentRecordDto>>(ex.Message, "Failed to retrieve sales payment records.");
            }
        }

        private async Task<Account> ResolveAccountAsync(string name, string code, string groupName, string balanceType, Guid tenantId, Guid companyId)
        {
            var account = await _tenantContext.Accounts.FirstOrDefaultAsync(a => a.AccountName == name && a.TenantId == tenantId);
            if (account == null)
            {
                var group = await _tenantContext.AccountGroups.FirstOrDefaultAsync(g => g.Name == groupName && g.TenantId == tenantId);
                if (group == null)
                {
                    group = new AccountGroup
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        CompanyId = companyId,
                        Name = groupName,
                        Type = groupName == "Revenue" ? "Revenue" : (groupName == "Expenses" ? "Expense" : "Asset"),
                        Code = code.Substring(0, 1) + "000",
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.AccountGroups.Add(group);
                    await _tenantContext.SaveChangesAsync();
                }

                account = new Account
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    AccountName = name,
                    AccountCode = code,
                    AccountGroupId = group.Id,
                    BalanceType = balanceType,
                    CurrentBalance = 0,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "System"
                };
                _tenantContext.Accounts.Add(account);
                await _tenantContext.SaveChangesAsync();
            }
            return account;
        }

        private async Task CreateJournalEntryAsync(
            Guid tenantId, 
            Guid companyId, 
            string voucherType, 
            string remarks, 
            string referenceNumber,
            List<(Account account, decimal debit, decimal credit, string description)> lines,
            string currentUserId)
        {
            if (!lines.Any()) return;

            var journalEntry = new JournalEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                VoucherNumber = $"JV-{DateTime.UtcNow:yyyyMMdd}-{new Random().Next(1000, 9999)}",
                TransactionDate = DateTime.UtcNow,
                VoucherType = voucherType,
                ReferenceNumber = referenceNumber,
                Remarks = remarks,
                TotalAmount = lines.Sum(l => l.debit),
                Status = "Posted",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = currentUserId
            };

            foreach (var line in lines)
            {
                journalEntry.Lines.Add(new JournalEntryLine
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    AccountId = line.account.Id,
                    Description = line.description,
                    DebitAmount = line.debit,
                    CreditAmount = line.credit
                });

                // Update running balance
                if (line.debit > 0)
                {
                    if (line.account.BalanceType == "Dr") line.account.CurrentBalance += line.debit;
                    else line.account.CurrentBalance -= line.debit;
                }
                if (line.credit > 0)
                {
                    if (line.account.BalanceType == "Cr") line.account.CurrentBalance += line.credit;
                    else line.account.CurrentBalance -= line.credit;
                }
            }

            _tenantContext.JournalEntries.Add(journalEntry);
        }

        private void AppendCustomerLedgerEntry(Customer customer, string type, string refNo, decimal debit, decimal credit, decimal balance)
        {
            var list = new List<CustomerLedgerEntry>();
            if (!string.IsNullOrWhiteSpace(customer.LedgerPlaceholder))
            {
                try
                {
                    list = System.Text.Json.JsonSerializer.Deserialize<List<CustomerLedgerEntry>>(customer.LedgerPlaceholder) ?? new List<CustomerLedgerEntry>();
                }
                catch {}
            }

            list.Add(new CustomerLedgerEntry
            {
                Date = DateTime.UtcNow,
                TransactionType = type,
                Reference = refNo,
                Debit = debit,
                Credit = credit,
                Balance = balance
            });

            customer.LedgerPlaceholder = System.Text.Json.JsonSerializer.Serialize(list);
        }

        public class CustomerLedgerEntry
        {
            public DateTime Date { get; set; }
            public string TransactionType { get; set; } = string.Empty;
            public string Reference { get; set; } = string.Empty;
            public decimal Debit { get; set; }
            public decimal Credit { get; set; }
            public decimal Balance { get; set; }
        }

        [HttpGet("dashboard")]
        public async Task<ActionResult<ApiResponse<SalesDashboardDto>>> GetSalesDashboard()
        {
            try
            {
                var tenantId = _currentUserContext.TenantId;
                var todayUtc = DateTime.UtcNow.Date;
                var todayLocalStart = todayUtc.AddDays(-1); // Resilient timezone window
                var startOfMonth = new DateTime(todayUtc.Year, todayUtc.Month, 1, 0, 0, 0, DateTimeKind.Utc);

                var query = _tenantContext.SalesTransactions
                    .Where(t => t.TenantId == tenantId && !t.IsDeleted);

                var txns = await query.ToListAsync();

                var todaySalesCases = txns
                    .Where(t => (t.TransactionDate.Date >= todayUtc || t.CreatedAt.Date >= todayUtc || t.TransactionDate >= todayLocalStart) && t.TransactionType == "Sales Dispatch")
                    .Sum(t => t.Cases);

                var todayReturns = txns
                    .Where(t => (t.TransactionDate.Date >= todayUtc || t.CreatedAt.Date >= todayUtc || t.TransactionDate >= todayLocalStart) && t.TransactionType == "Customer Return")
                    .Sum(t => t.Cases);

                var todayDamage = txns
                    .Where(t => (t.TransactionDate.Date >= todayUtc || t.CreatedAt.Date >= todayUtc || t.TransactionDate >= todayLocalStart) && t.TransactionType == "Damage")
                    .Sum(t => t.Cases);

                var totalDispatch = txns
                    .Where(t => t.TransactionType == "Sales Dispatch")
                    .Sum(t => t.Cases);

                var monthlyDispatch = txns
                    .Where(t => (t.TransactionDate >= startOfMonth || t.CreatedAt >= startOfMonth) && t.TransactionType == "Sales Dispatch")
                    .Sum(t => t.Cases);

                var dashboard = new SalesDashboardDto
                {
                    TodaySalesCases = todaySalesCases,
                    TodayReturns = todayReturns,
                    TodayDamage = todayDamage,
                    TotalDispatch = totalDispatch,
                    MonthlyDispatch = monthlyDispatch
                };

                return Success(dashboard, "Sales dashboard loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<SalesDashboardDto>(ex.Message, "Failed to load sales dashboard.");
            }
        }

        // GET /api/v1/sales/owner-overview
        [HttpGet("owner-overview")]
        public async Task<ActionResult<ApiResponse<OwnerSalesOverviewDto>>> GetOwnerOverview(
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null)
        {
            try
            {
                await EnsureCustomerColumnsAsync();
                var tenantId = _currentUserContext.TenantId;
                var now = DateTime.UtcNow;
                var todayStart = now.Date;
                var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

                var query = _tenantContext.SalesTransactions
                    .Include(t => t.Customer)
                    .Include(t => t.Product)
                    .Where(t => t.TenantId == tenantId && !t.IsDeleted && t.ParentTransactionId == null);

                var allSales = await query.ToListAsync();

                var salesTxns = allSales.Where(t =>
                    t.TransactionType == "Sales Dispatch" ||
                    t.TransactionType == "SALE" ||
                    t.TransactionType == "DISPATCH" ||
                    t.TransactionType == "DELIVERY").ToList();

                decimal totalSales = salesTxns.Sum(t => t.TotalAmount);
                decimal salesToday = salesTxns.Where(t => t.TransactionDate >= todayStart).Sum(t => t.TotalAmount);
                decimal thisMonthSales = salesTxns.Where(t => t.TransactionDate >= monthStart).Sum(t => t.TotalAmount);

                int totalTransactions = salesTxns.Count;
                int thisMonthTransactions = salesTxns.Where(t => t.TransactionDate >= monthStart).Count();
                decimal averageSale = totalTransactions > 0 ? Math.Round(totalSales / totalTransactions, 2) : 0;

                // Daily trend over last 30 days or specified range
                var trendStart = startDate ?? now.AddDays(-29).Date;
                var trendEnd = endDate ?? now.Date;

                var dailyTrend = salesTxns
                    .Where(t => t.TransactionDate >= trendStart && t.TransactionDate <= trendEnd.AddDays(1).AddTicks(-1))
                    .GroupBy(t => t.TransactionDate.Date)
                    .Select(g => new DailySalesTrendDto
                    {
                        Date = g.Key.ToString("yyyy-MM-dd"),
                        FormattedDate = g.Key.ToString("MMM dd"),
                        TotalSales = g.Sum(t => t.TotalAmount),
                        TransactionCount = g.Count(),
                        TotalCases = (int)g.Sum(t => t.Cases)
                    })
                    .OrderBy(d => d.Date)
                    .ToList();

                // Top products by revenue
                var topProducts = salesTxns
                    .GroupBy(t => new { t.ProductId, ProductName = t.Product?.Name ?? "Unknown Product", ProductSku = t.Product?.SKU ?? "" })
                    .Select(g => new TopProductSalesDto
                    {
                        ProductId = g.Key.ProductId,
                        ProductName = g.Key.ProductName,
                        ProductSku = g.Key.ProductSku,
                        TotalSales = g.Sum(t => t.TotalAmount),
                        TotalCases = (int)g.Sum(t => t.Cases),
                        TransactionCount = g.Count()
                    })
                    .OrderByDescending(p => p.TotalSales)
                    .Take(5)
                    .ToList();

                // Top customers by revenue
                var topCustomers = salesTxns
                    .GroupBy(t => new { t.CustomerId, CustomerName = t.Customer?.CustomerName ?? "Unknown Customer", CustomerCode = t.Customer?.CustomerCode ?? "" })
                    .Select(g => new TopCustomerSalesDto
                    {
                        CustomerId = g.Key.CustomerId,
                        CustomerName = g.Key.CustomerName,
                        CustomerCode = g.Key.CustomerCode,
                        TotalSales = g.Sum(t => t.TotalAmount),
                        TotalCases = (int)g.Sum(t => t.Cases),
                        TransactionCount = g.Count()
                    })
                    .OrderByDescending(c => c.TotalSales)
                    .Take(5)
                    .ToList();

                // Sales by Transaction Type
                var typeBreakdown = allSales
                    .GroupBy(t => t.TransactionType)
                    .Select(g => new SalesTypeBreakdownDto
                    {
                        TransactionType = g.Key,
                        TotalSales = g.Sum(t => t.TotalAmount),
                        TotalCases = (int)g.Sum(t => t.Cases),
                        TransactionCount = g.Count()
                    })
                    .OrderByDescending(tb => tb.TotalSales)
                    .ToList();

                var result = new OwnerSalesOverviewDto
                {
                    TotalSales = totalSales,
                    SalesToday = salesToday,
                    ThisMonthSales = thisMonthSales,
                    TotalTransactions = totalTransactions,
                    ThisMonthTransactions = thisMonthTransactions,
                    AverageSale = averageSale,
                    DailyTrend = dailyTrend,
                    TopProducts = topProducts,
                    TopCustomers = topCustomers,
                    TypeBreakdown = typeBreakdown
                };

                return Success(result, "Owner sales overview loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<OwnerSalesOverviewDto>(ex.Message, "Failed to load owner sales overview.");
            }
        }
    }

    public class SalesTransactionDto
    {
        public Guid Id { get; set; }
        public string TransactionNumber { get; set; } = string.Empty;
        public Guid CustomerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string CustomerCode { get; set; } = string.Empty;
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string ProductSku { get; set; } = string.Empty;

        public Guid? ParentTransactionId { get; set; }
        public int RelatedCount { get; set; }
        public decimal Cases { get; set; }
        public string TransactionType { get; set; } = string.Empty;
        public DateTime TransactionDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Remarks { get; set; }
        public string Status { get; set; } = string.Empty;

        // Simple Accounts V1 & New ERP Fields
        public string? PaymentMethod { get; set; }
        public string? PaymentTerms { get; set; }
        public Guid? BankAccountId { get; set; }
        public string? BankAccountName { get; set; }
        public Guid? CashBookId { get; set; }
        public string? CashBookName { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal GstRate { get; set; }
        public bool IsGstApplicable { get; set; }
        public string? TaxTreatment { get; set; }
        public decimal CGST { get; set; }
        public decimal SGST { get; set; }
        public decimal IGST { get; set; }
        public string? MetadataJson { get; set; }
        public string? InvoiceType { get; set; }
        public string? BillType { get; set; }

        public decimal TotalAmount { get; set; }
        public decimal AmountReceived { get; set; }
        public decimal OutstandingAmount { get; set; }
        public string PaymentStatus { get; set; } = string.Empty;
        public decimal ReturnedAmount { get; set; }
        public decimal RefundAmount { get; set; }
        public decimal AdjustmentAmount { get; set; }
        public string? ReturnType { get; set; }
        public bool IsReplacementRequired { get; set; }
        public decimal ProductValue { get; set; }
        public decimal DamageCost { get; set; }
        public string? DamageReason { get; set; }

        public List<SalesTransactionItemDto> Items { get; set; } = new();

        public string CreatedBy { get; set; } = string.Empty;
        public string CreatedByName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class SalesTransactionItemRequest
    {
        public Guid ProductId { get; set; }
        public Guid? CaseConfigurationId { get; set; }
        public int UnitsPerCase { get; set; } = 24;
        public decimal Cases { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal GstRate { get; set; }
        public bool IsGstApplicable { get; set; }
        public decimal CGST { get; set; }
        public decimal SGST { get; set; }
        public decimal IGST { get; set; }
        public decimal TotalAmount { get; set; }
    }

    public class SalesTransactionItemDto
    {
        public Guid Id { get; set; }
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string ProductSku { get; set; } = string.Empty;
        public Guid? CaseConfigurationId { get; set; }
        public string? CaseConfigurationName { get; set; }
        public int UnitsPerCase { get; set; } = 24;
        public decimal Cases { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal GstRate { get; set; }
        public bool IsGstApplicable { get; set; }
        public decimal CGST { get; set; }
        public decimal SGST { get; set; }
        public decimal IGST { get; set; }
        public decimal TotalAmount { get; set; }
    }

    public class CreateSalesTransactionRequest
    {
        public Guid CustomerId { get; set; }
        public Guid ProductId { get; set; }
        public Guid? ParentTransactionId { get; set; }
        public Guid? CaseConfigurationId { get; set; }
        public int UnitsPerCase { get; set; } = 24;
        public decimal Cases { get; set; }
        public string TransactionType { get; set; } = string.Empty;
        public DateTime TransactionDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Remarks { get; set; }

        // Multi-Product Line Items
        public List<SalesTransactionItemRequest>? Items { get; set; }

        // Simple Accounts V1 & New ERP Fields
        public string? PaymentMethod { get; set; }
        public string? PaymentTerms { get; set; }
        public Guid? BankAccountId { get; set; }
        public Guid? CashBookId { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal GstRate { get; set; }
        public bool IsGstApplicable { get; set; }
        public string? TaxTreatment { get; set; }
        public decimal CGST { get; set; }
        public decimal SGST { get; set; }
        public decimal IGST { get; set; }
        public string? MetadataJson { get; set; }
        public string? InvoiceType { get; set; }
        public string? BillType { get; set; }

        public decimal TotalAmount { get; set; }
        public decimal AmountReceived { get; set; }
        public decimal ReturnedAmount { get; set; }
        public decimal RefundAmount { get; set; }
        public decimal AdjustmentAmount { get; set; }
        public string? ReturnType { get; set; }
        public string? ReturnCondition { get; set; }
        public string? SettlementMethod { get; set; }
        public bool IsReplacementRequired { get; set; }
        public decimal ProductValue { get; set; }
        public decimal DamageCost { get; set; }
        public string? DamageReason { get; set; }
    }

    public class SalesDashboardDto
    {
        public decimal TodaySalesCases { get; set; }
        public decimal TodayReturns { get; set; }
        public decimal TodayDamage { get; set; }
        public decimal TotalDispatch { get; set; }
        public decimal MonthlyDispatch { get; set; }
    }

    public class SalesTransactionTimelineEventDto
    {
        public string Id { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public string EventType { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string ActorName { get; set; } = string.Empty;
        public string? ActorRole { get; set; }
        public string Status { get; set; } = "Success";
        public string Description { get; set; } = string.Empty;
        public Dictionary<string, object?>? Metadata { get; set; }
    }

    public class CollectSalesPaymentRequest
    {
        public decimal Amount { get; set; }
        public string PaymentMethod { get; set; } = "Cash";
        public Guid? BankAccountId { get; set; }
        public Guid? CashBookId { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Notes { get; set; }
        public DateTime? PaymentDate { get; set; }
    }

    public class SalesPaymentRecordDto
    {
        public Guid Id { get; set; }
        public DateTime Date { get; set; }
        public DateTime CreatedAt { get; set; }
        public decimal Amount { get; set; }
        public string PaymentMethod { get; set; } = string.Empty;
        public string ReferenceNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string AccountName { get; set; } = string.Empty;
        public string CollectedBy { get; set; } = string.Empty;
    }

    public class OwnerSalesOverviewDto
    {
        public decimal TotalSales { get; set; }
        public decimal SalesToday { get; set; }
        public decimal ThisMonthSales { get; set; }
        public int TotalTransactions { get; set; }
        public int ThisMonthTransactions { get; set; }
        public decimal AverageSale { get; set; }
        public List<DailySalesTrendDto> DailyTrend { get; set; } = new();
        public List<TopProductSalesDto> TopProducts { get; set; } = new();
        public List<TopCustomerSalesDto> TopCustomers { get; set; } = new();
        public List<SalesTypeBreakdownDto> TypeBreakdown { get; set; } = new();
    }

    public class DailySalesTrendDto
    {
        public string Date { get; set; } = string.Empty;
        public string FormattedDate { get; set; } = string.Empty;
        public decimal TotalSales { get; set; }
        public int TransactionCount { get; set; }
        public int TotalCases { get; set; }
    }

    public class TopProductSalesDto
    {
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string ProductSku { get; set; } = string.Empty;
        public decimal TotalSales { get; set; }
        public int TotalCases { get; set; }
        public int TransactionCount { get; set; }
    }

    public class TopCustomerSalesDto
    {
        public Guid CustomerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string CustomerCode { get; set; } = string.Empty;
        public decimal TotalSales { get; set; }
        public int TotalCases { get; set; }
        public int TransactionCount { get; set; }
    }

    public class SalesTypeBreakdownDto
    {
        public string TransactionType { get; set; } = string.Empty;
        public decimal TotalSales { get; set; }
        public int TotalCases { get; set; }
        public int TransactionCount { get; set; }
    }
}


