using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.DTOs.Reports;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.Finance;
using Aquora.Domain.Entities.Payroll;
using Aquora.Domain.Entities.Operations;
using Aquora.Domain.Entities.QC;

namespace Aquora.Application.Services
{
    public class ReportService : IReportService
    {
        private readonly ITenantDbContext _tenantContext;
        private readonly IPlatformDbContext _platformContext;
        private readonly ICurrentUserContext _userContext;

        public ReportService(
            ITenantDbContext tenantContext,
            IPlatformDbContext platformContext,
            ICurrentUserContext userContext)
        {
            _tenantContext = tenantContext;
            _platformContext = platformContext;
            _userContext = userContext;
        }

        public async Task<BusinessReportDto> GenerateBusinessReportAsync(ReportFilterRequest request)
        {
            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                throw new UnauthorizedAccessException("Authenticated tenant context is required.");
            }

            // 1. Resolve Timezone and Date Range with safe inclusive bounds
            var userOffset = TimeSpan.FromMinutes(-request.TzOffset);
            var nowUtc = DateTime.UtcNow;
            var nowLocal = nowUtc.Add(userOffset);
            var todayLocal = nowLocal.Date;

            DateTime fromLocal;
            DateTime toLocal;

            var preset = (request.Preset ?? "custom").ToLowerInvariant().Trim();

            switch (preset)
            {
                case "today":
                    fromLocal = todayLocal;
                    toLocal = todayLocal;
                    break;
                case "yesterday":
                    fromLocal = todayLocal.AddDays(-1);
                    toLocal = todayLocal.AddDays(-1);
                    break;
                case "7days":
                case "last7days":
                    fromLocal = todayLocal.AddDays(-6);
                    toLocal = todayLocal;
                    break;
                case "30days":
                case "last30days":
                    fromLocal = todayLocal.AddDays(-29);
                    toLocal = todayLocal;
                    break;
                case "this_month":
                case "thismonth":
                    fromLocal = new DateTime(todayLocal.Year, todayLocal.Month, 1);
                    toLocal = todayLocal;
                    break;
                case "last_month":
                case "lastmonth":
                    var firstOfThisMonth = new DateTime(todayLocal.Year, todayLocal.Month, 1);
                    var lastOfPrevMonth = firstOfThisMonth.AddDays(-1);
                    fromLocal = new DateTime(lastOfPrevMonth.Year, lastOfPrevMonth.Month, 1);
                    toLocal = lastOfPrevMonth;
                    break;
                case "this_year":
                case "thisyear":
                    fromLocal = new DateTime(todayLocal.Year, 1, 1);
                    toLocal = todayLocal;
                    break;
                default: // custom or explicit dates
                    if (request.DateFrom.HasValue)
                        fromLocal = request.DateFrom.Value.Date;
                    else
                        fromLocal = todayLocal.AddDays(-29);

                    if (request.DateTo.HasValue)
                        toLocal = request.DateTo.Value.Date;
                    else
                        toLocal = todayLocal;

                    if (fromLocal > toLocal)
                    {
                        var temp = fromLocal;
                        fromLocal = toLocal;
                        toLocal = temp;
                    }
                    break;
            }

            var fromUtc = fromLocal.Subtract(userOffset);
            // Include entire end day up to 23:59:59.999
            var toUtc = toLocal.AddDays(1).AddMilliseconds(-1).Subtract(userOffset);

            // Helper for converting to local date string
            DateTime ToLocal(DateTime dt)
            {
                if (dt == default) return nowLocal;
                var utc = dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                return utc.Add(userOffset);
            }

            // 1.5. Resolve Employee/User/Driver Names for the tenant
            var tenantUsers = await _platformContext.Users
                .AsNoTracking()
                .Where(u => u.TenantId == tenantId && !u.IsDeleted)
                .Select(u => new
                {
                    u.Id,
                    u.FirstName,
                    u.LastName,
                    u.Username,
                    u.Email
                })
                .ToListAsync();

            var userMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var u in tenantUsers)
            {
                var fullName = $"{u.FirstName} {u.LastName}".Trim();
                if (string.IsNullOrWhiteSpace(fullName))
                {
                    fullName = !string.IsNullOrWhiteSpace(u.Username) ? u.Username : (u.Email ?? "Staff");
                }
                userMap[u.Id.ToString()] = fullName;
                if (!string.IsNullOrWhiteSpace(u.Username)) userMap[u.Username] = fullName;
                if (!string.IsNullOrWhiteSpace(u.Email)) userMap[u.Email] = fullName;
            }

            string ResolvePersonName(string? identifier, string fallback = "—")
            {
                if (string.IsNullOrWhiteSpace(identifier) || identifier == "null" || identifier == "undefined")
                    return fallback;

                var trimmed = identifier.Trim();
                if (userMap.TryGetValue(trimmed, out var resolvedName) && !string.IsNullOrWhiteSpace(resolvedName))
                    return resolvedName;

                // If identifier is a GUID that didn't resolve to a known user, return fallback so no raw UUID leaks
                if (Guid.TryParse(trimmed, out _))
                {
                    return fallback;
                }

                return trimmed;
            }

            // 2. Fetch Company & Tenant Info dynamically
            var company = await _tenantContext.Companies
                .AsNoTracking()
                .FirstOrDefaultAsync(c => !c.IsDeleted && c.TenantId == tenantId);

            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId);

            var resolvedCompanyName = !string.IsNullOrWhiteSpace(company?.Name) && company.Name != "Company"
                ? company.Name
                : (tenant?.Name ?? "Aquora Water ERP");

            var currencyCode = !string.IsNullOrWhiteSpace(tenant?.Currency) && !tenant.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase)
                ? tenant.Currency
                : "INR";

            var currencySymbol = currencyCode == "INR" ? "₹" : (currencyCode == "USD" ? "$" : currencyCode);

            var report = new BusinessReportDto
            {
                Period = new ReportPeriodDto
                {
                    DateFromUtc = fromUtc,
                    DateToUtc = toUtc,
                    FormattedRange = $"{fromLocal:dd MMM yyyy} — {toLocal:dd MMM yyyy}",
                    GeneratedAtLocal = $"{nowLocal:dd MMM yyyy, hh:mm tt}",
                    Preset = preset
                },
                Company = new CompanyReportInfoDto
                {
                    Name = resolvedCompanyName,
                    DisplayName = resolvedCompanyName,
                    Email = tenant?.OwnerEmail,
                    Phone = tenant?.OwnerPhone,
                    GstNumber = tenant?.GstNumber,
                    Address = tenant?.Address,
                    LogoUrl = tenant?.LogoUrl,
                    Currency = currencyCode,
                    CurrencySymbol = currencySymbol
                }
            };

            // 3. PRODUCTION DATA
            var batchesQuery = _tenantContext.ProductionBatches
                .Include(b => b.ProductionLine)
                .AsNoTracking()
                .Where(b => b.TenantId == tenantId && !b.IsDeleted &&
                    ((b.StartedAt >= fromUtc && b.StartedAt <= toUtc) ||
                     (b.CompletedAt.HasValue && b.CompletedAt.Value >= fromUtc && b.CompletedAt.Value <= toUtc) ||
                     (b.CreatedAt >= fromUtc && b.CreatedAt <= toUtc)));

            if (request.ProductionLineId.HasValue && request.ProductionLineId.Value != Guid.Empty)
            {
                batchesQuery = batchesQuery.Where(b => b.ProductionLineId == request.ProductionLineId.Value);
            }

            var batches = await batchesQuery
                .OrderByDescending(b => b.StartedAt)
                .ToListAsync();

            var entriesQuery = _tenantContext.ProductionEntries
                .Include(e => e.Product)
                .Include(e => e.ProductionLine)
                .AsNoTracking()
                .Where(e => e.TenantId == tenantId && !e.IsDeleted &&
                    ((e.CreatedAt >= fromUtc && e.CreatedAt <= toUtc) ||
                     (e.Date >= fromLocal && e.Date <= toLocal)));

            if (request.ProductId.HasValue && request.ProductId.Value != Guid.Empty)
            {
                entriesQuery = entriesQuery.Where(e => e.ProductId == request.ProductId.Value);
            }
            if (request.ProductionLineId.HasValue && request.ProductionLineId.Value != Guid.Empty)
            {
                entriesQuery = entriesQuery.Where(e => e.ProductionLineId == request.ProductionLineId.Value);
            }

            var entries = await entriesQuery
                .OrderByDescending(e => e.CreatedAt)
                .ToListAsync();

            report.Production.TotalBatches = batches.Count;
            report.Production.CompletedBatches = batches.Count(b => b.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase));
            report.Production.RunningBatches = batches.Count(b => !b.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase));
            report.Production.TotalCasesProduced = entries.Sum(e => e.CasesProduced);
            report.Production.TotalPreformWastage = entries.Sum(e => e.PreformWastage);
            report.Production.TotalCapWastage = entries.Sum(e => e.CapWastage);
            report.Production.TotalLabelWastage = entries.Sum(e => e.LabelWastage);
            report.Production.TotalShrinkWastage = entries.Sum(e => e.ShrinkWastage);

            report.Production.Batches = batches.Select(b => new ProductionBatchItemDto
            {
                Id = b.Id,
                BatchNumber = b.BatchNumber,
                Product = b.Product,
                ProductionLine = b.ProductionLine?.Name ?? "Line 1",
                Shift = b.Shift,
                OperatorName = ResolvePersonName(b.OperatorName ?? b.CreatedBy, "Operator"),
                StartedAt = ToLocal(b.StartedAt),
                CompletedAt = b.CompletedAt.HasValue ? ToLocal(b.CompletedAt.Value) : null,
                Status = b.Status,
                TargetQuantity = b.TargetQuantity,
                ProducedQuantity = b.ProducedQuantity
            }).ToList();

            report.Production.Entries = entries.Take(100).Select(e => new ProductionEntryItemDto
            {
                Id = e.Id,
                Date = e.Date != default ? e.Date : ToLocal(e.CreatedAt).Date,
                Time = !string.IsNullOrWhiteSpace(e.Time) ? e.Time : ToLocal(e.CreatedAt).ToString("hh:mm tt"),
                Shift = e.Shift,
                ProductionLine = e.ProductionLine?.Name ?? "Line 1",
                ProductName = e.Product?.Name ?? "Standard Water",
                OperatorName = ResolvePersonName(e.OperatorName ?? e.CreatedBy, "Operator"),
                CasesProduced = e.CasesProduced,
                PreformUsage = e.PreformUsage,
                PreformWastage = e.PreformWastage,
                CapUsage = e.CapUsage,
                CapWastage = e.CapWastage,
                LabelUsage = e.LabelUsage,
                LabelWastage = e.LabelWastage
            }).ToList();

            // 4. SALES, DISPATCHES, RETURNS, DAMAGES (from SalesTransactions)
            var salesTxnQuery = _tenantContext.SalesTransactions
                .Include(s => s.Customer)
                .Include(s => s.Product)
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId && !s.IsDeleted &&
                    ((s.TransactionDate >= fromUtc && s.TransactionDate <= toUtc) ||
                     (s.CreatedAt >= fromUtc && s.CreatedAt <= toUtc)));

            if (request.ProductId.HasValue && request.ProductId.Value != Guid.Empty)
            {
                salesTxnQuery = salesTxnQuery.Where(s => s.ProductId == request.ProductId.Value);
            }
            if (request.CustomerId.HasValue && request.CustomerId.Value != Guid.Empty)
            {
                salesTxnQuery = salesTxnQuery.Where(s => s.CustomerId == request.CustomerId.Value);
            }
            if (!string.IsNullOrWhiteSpace(request.Status))
            {
                salesTxnQuery = salesTxnQuery.Where(s => s.Status == request.Status || s.PaymentStatus == request.Status);
            }

            var allTxns = await salesTxnQuery
                .OrderByDescending(s => s.TransactionDate)
                .ToListAsync();

            var salesList = allTxns.Where(s => s.TransactionType.Contains("Dispatch") || s.TransactionType.Contains("Sale") || string.IsNullOrWhiteSpace(s.TransactionType)).ToList();
            var returnsList = allTxns.Where(s => s.TransactionType.Contains("Return")).ToList();
            var damagesList = allTxns.Where(s => s.TransactionType.Contains("Damage")).ToList();

            // A. Sales Section
            report.Sales.TotalQuantity = salesList.Sum(s => s.Cases);
            report.Sales.TotalGrossAmount = salesList.Sum(s => s.TotalAmount > 0 ? s.TotalAmount : (s.Cases * s.UnitPrice));
            report.Sales.TotalTaxAmount = salesList.Sum(s => s.TaxAmount);
            report.Sales.TotalDiscountAmount = salesList.Sum(s => s.DiscountAmount);
            report.Sales.TotalNetAmount = report.Sales.TotalGrossAmount - report.Sales.TotalDiscountAmount;
            report.Sales.TotalReceived = salesList.Sum(s => s.AmountReceived);
            report.Sales.TotalOutstanding = salesList.Sum(s => s.OutstandingAmount);
            report.Sales.TotalTransactions = salesList.Count;

            report.Sales.Transactions = salesList.Select(s => new SalesTransactionItemDto
            {
                Id = s.Id,
                TransactionNumber = s.TransactionNumber,
                TransactionDate = ToLocal(s.TransactionDate != default ? s.TransactionDate : s.CreatedAt),
                CustomerName = s.Customer?.CustomerName ?? "Direct Sale",
                ProductName = s.Product?.Name ?? "Water Bottle",
                Cases = s.Cases,
                UnitPrice = s.UnitPrice > 0 ? s.UnitPrice : (s.Product?.SellingPrice ?? 0),
                DiscountAmount = s.DiscountAmount,
                TaxAmount = s.TaxAmount,
                TotalAmount = s.TotalAmount > 0 ? s.TotalAmount : (s.Cases * s.UnitPrice),
                AmountReceived = s.AmountReceived,
                OutstandingAmount = s.OutstandingAmount,
                PaymentStatus = s.PaymentStatus,
                PaymentMethod = s.PaymentMethod,
                Status = s.Status,
                ReferenceNumber = s.ReferenceNumber
            }).ToList();

            // B. Dispatch Section (combines Sales Dispatches & 20L Loadings)
            var dispatchItems = new List<DispatchItemDto>();

            foreach (var s in salesList)
            {
                var assignedDriver = !string.IsNullOrWhiteSpace(s.Customer?.AssignedDriver)
                    ? s.Customer.AssignedDriver
                    : s.CreatedBy;

                dispatchItems.Add(new DispatchItemDto
                {
                    Id = s.Id,
                    DispatchDate = ToLocal(s.TransactionDate != default ? s.TransactionDate : s.CreatedAt),
                    DispatchNumber = s.TransactionNumber,
                    CustomerName = s.Customer?.CustomerName ?? "Direct Sale",
                    ProductName = s.Product?.Name ?? "Water Bottle",
                    Quantity = s.Cases,
                    VehicleNumber = s.ReferenceNumber ?? "—",
                    DriverOrLoadedBy = ResolvePersonName(assignedDriver, "—"),
                    Status = s.Status,
                    ReferenceNumber = s.ReferenceNumber,
                    SourceModule = "Sales Dispatch"
                });
            }

            // Also check 20L Operations Loadings in range
            var operationsVisits = await _tenantContext.OperationsVisits
                .Include(v => v.Distributor)
                .Include(v => v.Loadings).ThenInclude(l => l.Product)
                .Include(v => v.Unloadings)
                .Include(v => v.Quarantines)
                .AsNoTracking()
                .Where(v => v.TenantId == tenantId && !v.IsDeleted &&
                    ((v.ArrivalTime >= fromUtc && v.ArrivalTime <= toUtc) ||
                     (v.CreatedAt >= fromUtc && v.CreatedAt <= toUtc)))
                .OrderByDescending(v => v.ArrivalTime)
                .ToListAsync();

            foreach (var visit in operationsVisits)
            {
                foreach (var loading in visit.Loadings)
                {
                    var rawDriver = !string.IsNullOrWhiteSpace(loading.LoadedBy)
                        ? loading.LoadedBy
                        : (!string.IsNullOrWhiteSpace(visit.DriverName) ? visit.DriverName : visit.Distributor?.AssignedDriver);

                    dispatchItems.Add(new DispatchItemDto
                    {
                        Id = loading.Id,
                        DispatchDate = ToLocal(loading.LoadingTime != default ? loading.LoadingTime : visit.ArrivalTime),
                        DispatchNumber = $"20L-{loading.Id.ToString()[..6].ToUpper()}",
                        CustomerName = visit.Distributor?.CustomerName ?? "20L Distributor",
                        ProductName = loading.Product?.Name ?? "20L Jar",
                        Quantity = loading.QuantityLoaded,
                        VehicleNumber = !string.IsNullOrWhiteSpace(visit.VehicleNumber) ? visit.VehicleNumber : (loading.VehicleNumber ?? "—"),
                        DriverOrLoadedBy = ResolvePersonName(rawDriver, "—"),
                        Status = visit.Status,
                        ReferenceNumber = loading.BatchNumber,
                        SourceModule = "20L Loading"
                    });
                }
            }

            report.Dispatch.Dispatches = dispatchItems.OrderByDescending(d => d.DispatchDate).ToList();
            report.Dispatch.TotalDispatchedQuantity = dispatchItems.Sum(d => d.Quantity);
            report.Dispatch.TotalDispatches = dispatchItems.Count;
            report.Dispatch.UniqueCustomers = dispatchItems.Select(d => d.CustomerName).Distinct().Count();
            report.Dispatch.UniqueVehicles = dispatchItems.Where(d => d.VehicleNumber != "—" && !string.IsNullOrWhiteSpace(d.VehicleNumber)).Select(d => d.VehicleNumber).Distinct().Count();

            // C. Returns Section
            report.Returns.TotalReturnedQuantity = returnsList.Sum(r => r.Cases);
            report.Returns.TotalReturnedAmount = returnsList.Sum(r => r.ReturnedAmount > 0 ? r.ReturnedAmount : (r.Cases * r.UnitPrice));
            report.Returns.TotalRefundAmount = returnsList.Sum(r => r.RefundAmount);
            report.Returns.TotalReturnsCount = returnsList.Count;

            report.Returns.Returns = returnsList.Select(r => new ReturnItemDto
            {
                Id = r.Id,
                ReturnDate = ToLocal(r.TransactionDate != default ? r.TransactionDate : r.CreatedAt),
                ReturnNumber = r.TransactionNumber,
                ReferenceNumber = r.ReferenceNumber,
                CustomerName = r.Customer?.CustomerName ?? "Unknown",
                ProductName = r.Product?.Name ?? "Water Bottle",
                Quantity = r.Cases,
                ReturnType = r.ReturnType ?? "Normal Return",
                ReturnedAmount = r.ReturnedAmount > 0 ? r.ReturnedAmount : (r.Cases * r.UnitPrice),
                RefundAmount = r.RefundAmount,
                IsReplacementRequired = r.IsReplacementRequired,
                Status = r.Status,
                Remarks = r.Remarks
            }).ToList();

            report.Returns.ReasonBreakdown = returnsList
                .GroupBy(r => !string.IsNullOrWhiteSpace(r.ReturnType) ? r.ReturnType : (!string.IsNullOrWhiteSpace(r.Remarks) ? r.Remarks : "General Return"))
                .Select(g => new ReturnReasonCountDto
                {
                    Reason = g.Key,
                    Count = g.Count(),
                    TotalQuantity = g.Sum(x => x.Cases)
                }).OrderByDescending(x => x.TotalQuantity).ToList();

            // D. Damages Section (Sales Damages + Defective/Quarantined Jars)
            var damageItems = new List<DamageItemDto>();

            foreach (var d in damagesList)
            {
                damageItems.Add(new DamageItemDto
                {
                    Id = d.Id,
                    DamageDate = ToLocal(d.TransactionDate != default ? d.TransactionDate : d.CreatedAt),
                    DamageNumber = d.TransactionNumber,
                    ReferenceNumber = d.ReferenceNumber,
                    ProductName = d.Product?.Name ?? "Product Bottle",
                    Quantity = d.Cases,
                    ProductValue = d.ProductValue > 0 ? d.ProductValue : (d.Cases * (d.Product?.SellingPrice ?? d.UnitPrice)),
                    DamageCost = d.DamageCost > 0 ? d.DamageCost : (d.Cases * (d.Product?.CostPrice ?? 10)),
                    DamageReason = d.DamageReason ?? d.Remarks ?? "Broken/Damaged during transit",
                    Status = d.Status,
                    Remarks = d.Remarks,
                    SourceModule = "Sales Damage"
                });
            }

            foreach (var visit in operationsVisits)
            {
                foreach (var q in visit.Quarantines)
                {
                    damageItems.Add(new DamageItemDto
                    {
                        Id = q.Id,
                        DamageDate = ToLocal(q.CreatedAt != default ? q.CreatedAt : visit.ArrivalTime),
                        DamageNumber = $"QR-{q.Id.ToString()[..6].ToUpper()}",
                        ReferenceNumber = visit.VehicleNumber,
                        ProductName = "20L Jar (Quarantine)",
                        Quantity = q.Quantity,
                        ProductValue = q.Quantity * 150m,
                        DamageCost = q.Quantity * 150m,
                        DamageReason = !string.IsNullOrWhiteSpace(q.Reason) ? q.Reason : "Defective/Contaminated Jar",
                        Status = q.Status,
                        Remarks = $"Quarantined by {q.CreatedBy}",
                        SourceModule = "20L Quarantine"
                    });
                }
            }

            report.Damages.Damages = damageItems.OrderByDescending(d => d.DamageDate).ToList();
            report.Damages.TotalDamagedQuantity = damageItems.Sum(d => d.Quantity);
            report.Damages.TotalDamageCost = damageItems.Sum(d => d.DamageCost);
            report.Damages.TotalProductValue = damageItems.Sum(d => d.ProductValue);
            report.Damages.TotalDamagesCount = damageItems.Count;

            report.Damages.ReasonBreakdown = damageItems
                .GroupBy(d => !string.IsNullOrWhiteSpace(d.DamageReason) ? d.DamageReason : "General Damage")
                .Select(g => new DamageReasonCountDto
                {
                    Reason = g.Key,
                    Count = g.Count(),
                    TotalQuantity = g.Sum(x => x.Quantity)
                }).OrderByDescending(x => x.TotalQuantity).ToList();

            // 5. 20L OPERATIONS & PLANT ISSUES
            report.Operations.TotalVisits = operationsVisits.Count;
            report.Operations.CompletedVisits = operationsVisits.Count(v => v.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase));
            report.Operations.TotalJarsUnloaded = operationsVisits.Sum(v => v.Unloadings.Sum(u => u.ReturnedEmptyCount));
            report.Operations.TotalJarsLoaded = operationsVisits.Sum(v => v.Loadings.Sum(l => l.QuantityLoaded));
            report.Operations.TotalJarsQuarantined = operationsVisits.Sum(v => v.Quarantines.Sum(q => q.Quantity));

            report.Operations.Visits = operationsVisits.Take(50).Select(v => new OperationsVisitSummaryDto
            {
                Id = v.Id,
                ArrivalTime = ToLocal(v.ArrivalTime),
                VehicleNumber = v.VehicleNumber,
                DriverName = v.DriverName,
                DistributorName = v.Distributor?.CustomerName ?? "Direct",
                Priority = v.Priority,
                Status = v.Status,
                LoadedQuantity = v.Loadings.Sum(l => l.QuantityLoaded),
                UnloadedQuantity = v.Unloadings.Sum(u => u.ReturnedEmptyCount),
                QuarantinedQuantity = v.Quarantines.Sum(q => q.Quantity)
            }).ToList();

            var issues = await _tenantContext.OperationsIssues
                .Include(i => i.AffectedMachines)
                .AsNoTracking()
                .Where(i => i.TenantId == tenantId && !i.IsDeleted &&
                    ((i.ReportedAt >= fromUtc && i.ReportedAt <= toUtc) ||
                     (i.CreatedAt >= fromUtc && i.CreatedAt <= toUtc)))
                .OrderByDescending(i => i.ReportedAt)
                .ToListAsync();

            report.Operations.TotalIssuesLogged = issues.Count;
            report.Operations.TotalDowntimeMinutes = issues.Sum(i => i.DowntimeMinutes ?? 0);

            report.Operations.Issues = issues.Select(i => new OperationsIssueItemDto
            {
                Id = i.Id,
                IssueNumber = i.IssueNumber,
                Title = i.Title,
                Category = i.Category,
                Severity = i.Priority,
                Status = i.Status,
                LineName = i.ProductionLineName,
                MachineName = i.MachineName,
                DowntimeMinutes = i.DowntimeMinutes ?? 0,
                ReportedAt = ToLocal(i.ReportedAt),
                ReportedByName = ResolvePersonName(i.ReportedByName ?? i.CreatedBy, "Staff"),
                ResolvedAt = i.ResolvedAt.HasValue ? ToLocal(i.ResolvedAt.Value) : null
            }).ToList();

            // 6. CUSTOMER ACCOUNT PERFORMANCE
            var customerGroups = allTxns
                .GroupBy(t => t.CustomerId)
                .Where(g => g.Key != Guid.Empty);

            var customersList = new List<CustomerPerformanceItemDto>();
            foreach (var group in customerGroups)
            {
                var custObj = group.FirstOrDefault()?.Customer;
                var custDispatches = group.Where(t => t.TransactionType.Contains("Dispatch") || t.TransactionType.Contains("Sale")).ToList();
                var custReturns = group.Where(t => t.TransactionType.Contains("Return")).ToList();

                var dispatchedQty = custDispatches.Sum(x => x.Cases);
                var returnedQty = custReturns.Sum(x => x.Cases);
                var salesValue = custDispatches.Sum(x => x.TotalAmount > 0 ? x.TotalAmount : (x.Cases * x.UnitPrice));
                var received = custDispatches.Sum(x => x.AmountReceived);
                var outstanding = custDispatches.Sum(x => x.OutstandingAmount);

                customersList.Add(new CustomerPerformanceItemDto
                {
                    CustomerId = group.Key,
                    CustomerName = custObj?.CustomerName ?? "Customer #" + group.Key.ToString()[..6],
                    Phone = custObj?.Phone,
                    CustomerType = custObj?.CustomerType ?? "Wholesale",
                    OrdersCount = custDispatches.Count,
                    TotalDispatchedCases = dispatchedQty,
                    TotalSalesValue = salesValue,
                    TotalReturnedCases = returnedQty,
                    AmountReceived = received,
                    OutstandingBalance = outstanding,
                    LastOrderDate = group.Max(x => x.TransactionDate).ToString("dd MMM yyyy")
                });
            }

            report.Customers.Customers = customersList.OrderByDescending(c => c.TotalSalesValue).ToList();
            report.Customers.TotalActiveCustomers = customersList.Count;
            report.Customers.TotalPurchasedQuantity = customersList.Sum(c => c.TotalDispatchedCases);
            report.Customers.TotalPurchasedValue = customersList.Sum(c => c.TotalSalesValue);
            report.Customers.TotalReturnedQuantity = customersList.Sum(c => c.TotalReturnedCases);
            report.Customers.TotalNetQuantity = customersList.Sum(c => c.NetCases);
            report.Customers.TotalOutstanding = customersList.Sum(c => c.OutstandingBalance);

            // 7. INVENTORY & STOCK MOVEMENT
            var products = await _tenantContext.Products
                .AsNoTracking()
                .Where(p => !p.IsDeleted)
                .OrderBy(p => p.DisplayOrder)
                .ToListAsync();

            var rawMaterials = await _tenantContext.RawMaterials
                .AsNoTracking()
                .Where(r => r.TenantId == tenantId && !r.IsDeleted)
                .OrderBy(r => r.Name)
                .ToListAsync();

            report.Inventory.TotalFinishedProductsCount = products.Count;
            report.Inventory.TotalRawMaterialsCount = rawMaterials.Count;

            report.Inventory.ProductMovements = products.Select(p =>
            {
                var producedInPeriod = entries.Where(e => e.ProductId == p.Id).Sum(e => (decimal)e.CasesProduced);
                var dispatchedInPeriod = salesList.Where(s => s.ProductId == p.Id).Sum(s => s.Cases);
                var returnedInPeriod = returnsList.Where(r => r.ProductId == p.Id).Sum(r => r.Cases);
                var damagedInPeriod = damagesList.Where(d => d.ProductId == p.Id).Sum(d => d.Cases);

                return new ProductStockMovementDto
                {
                    ProductId = p.Id,
                    ProductName = p.Name,
                    SKU = p.SKU,
                    Category = p.Category,
                    CurrentStock = p.CurrentStock,
                    SellingPrice = p.SellingPrice,
                    ProducedInPeriod = producedInPeriod,
                    DispatchedInPeriod = dispatchedInPeriod,
                    ReturnedInPeriod = returnedInPeriod,
                    DamagedInPeriod = damagedInPeriod
                };
            }).ToList();

            report.Inventory.RawMaterials = rawMaterials.Select(r =>
            {
                decimal consumed = 0;
                decimal wastage = 0;

                // Sum usages from entries
                consumed += entries.Where(e => e.PreformMaterialId == r.Id).Sum(e => e.PreformUsage);
                wastage += entries.Where(e => e.PreformMaterialId == r.Id).Sum(e => e.PreformWastage);

                consumed += entries.Where(e => e.CapMaterialId == r.Id).Sum(e => e.CapUsage);
                wastage += entries.Where(e => e.CapMaterialId == r.Id).Sum(e => e.CapWastage);

                consumed += entries.Where(e => e.LabelMaterialId == r.Id).Sum(e => e.LabelUsage);
                wastage += entries.Where(e => e.LabelMaterialId == r.Id).Sum(e => e.LabelWastage);

                consumed += entries.Where(e => e.ShrinkMaterialId == r.Id).Sum(e => e.ShrinkUsage);
                wastage += entries.Where(e => e.ShrinkMaterialId == r.Id).Sum(e => e.ShrinkWastage);

                consumed += entries.Where(e => e.GlueMaterialId == r.Id).Sum(e => e.GlueUsage ?? 0);

                return new RawMaterialStockDto
                {
                    MaterialId = r.Id,
                    MaterialName = r.Name,
                    Category = r.Category,
                    CurrentStock = r.CurrentStock,
                    Unit = r.Unit,
                    ConsumedInPeriod = consumed,
                    WastageInPeriod = wastage,
                    ReorderLevel = 0
                };
            }).ToList();

            // 8. ACCOUNTS & FINANCIAL DETAILS
            var expenses = await _tenantContext.SimpleExpenses
                .AsNoTracking()
                .Where(e => e.TenantId == tenantId && !e.IsDeleted &&
                    ((e.ExpenseDate >= fromUtc && e.ExpenseDate <= toUtc) ||
                     (e.CreatedAt >= fromUtc && e.CreatedAt <= toUtc)))
                .ToListAsync();

            var purchases = await _tenantContext.Purchases
                .Include(p => p.Vendor)
                .AsNoTracking()
                .Where(p => p.TenantId == tenantId && !p.IsDeleted &&
                    ((p.PurchaseDate >= fromUtc && p.PurchaseDate <= toUtc) ||
                     (p.CreatedAt >= fromUtc && p.CreatedAt <= toUtc)))
                .OrderByDescending(p => p.PurchaseDate)
                .ToListAsync();

            var salaryPayments = await _tenantContext.SalaryPayments
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId && !s.IsDeleted &&
                    ((s.PaymentDate >= fromUtc && s.PaymentDate <= toUtc) ||
                     (s.CreatedAt >= fromUtc && s.CreatedAt <= toUtc)))
                .ToListAsync();

            report.Financials.TotalGrossSales = report.Sales.TotalGrossAmount;
            report.Financials.TotalCollectedFromSales = report.Sales.TotalReceived;
            report.Financials.TotalSalesReceivables = report.Sales.TotalOutstanding;

            report.Financials.TotalOperatingExpenses = expenses.Sum(e => e.Amount);
            report.Financials.TotalMaterialPurchases = purchases.Sum(p => p.GrandTotal);
            report.Financials.TotalPurchasesPaid = purchases.Sum(p => p.AmountPaid);
            report.Financials.TotalPurchasesOutstanding = purchases.Sum(p => p.BalanceAmount);

            report.Financials.TotalSalariesPaid = salaryPayments.Sum(s => s.Amount);

            report.Financials.ExpenseCategories = expenses
                .GroupBy(e => !string.IsNullOrWhiteSpace(e.Category) ? e.Category : "General")
                .Select(g => new ExpenseCategorySummaryDto
                {
                    Category = g.Key,
                    TotalAmount = g.Sum(x => x.Amount),
                    Count = g.Count()
                }).OrderByDescending(x => x.TotalAmount).ToList();

            report.Financials.RecentPurchases = purchases.Take(30).Select(p => new PurchaseSummaryItemDto
            {
                Id = p.Id,
                PurchaseNumber = p.PurchaseNo,
                PurchaseDate = ToLocal(p.PurchaseDate != default ? p.PurchaseDate : p.CreatedAt),
                VendorName = p.Vendor?.Name ?? p.VendorName ?? "Supplier",
                TotalAmount = p.GrandTotal,
                PaidAmount = p.AmountPaid,
                BalanceAmount = p.BalanceAmount,
                Status = p.PaymentStatus
            }).ToList();

            // 9. QUALITY CONTROL
            var waterTests = await _tenantContext.WaterTestReports
                .AsNoTracking()
                .Where(w => w.TenantId == tenantId && !w.IsDeleted &&
                    ((w.CreatedAt >= fromUtc && w.CreatedAt <= toUtc) ||
                     (w.ProductionDate.HasValue && w.ProductionDate.Value >= fromUtc && w.ProductionDate.Value <= toUtc)))
                .OrderByDescending(w => w.CreatedAt)
                .ToListAsync();

            report.QualityControl.TotalTestsConducted = waterTests.Count;
            report.QualityControl.TotalPassed = waterTests.Count(w => w.Status.Equals("APPROVED", StringComparison.OrdinalIgnoreCase) || w.Status.Equals("PUBLISHED", StringComparison.OrdinalIgnoreCase) || w.Status.Equals("Passed", StringComparison.OrdinalIgnoreCase));
            report.QualityControl.TotalFailed = waterTests.Count(w => w.Status.Equals("REJECTED", StringComparison.OrdinalIgnoreCase) || w.Status.Equals("Failed", StringComparison.OrdinalIgnoreCase));
            report.QualityControl.TotalUnderIncubation = waterTests.Count(w => w.Status.Equals("DRAFT", StringComparison.OrdinalIgnoreCase) || w.Status.Equals("SUBMITTED", StringComparison.OrdinalIgnoreCase) || w.Status.Equals("In Progress", StringComparison.OrdinalIgnoreCase));

            report.QualityControl.RecentTests = waterTests.Take(30).Select(w => new QCTestSummaryItemDto
            {
                Id = w.Id,
                ReportNumber = !string.IsNullOrWhiteSpace(w.SampleNumber) ? w.SampleNumber : (!string.IsNullOrWhiteSpace(w.BatchNumber) ? w.BatchNumber : w.Id.ToString()[..8].ToUpper()),
                TestDate = ToLocal(w.ProductionDate ?? w.CreatedAt),
                SampleSource = w.ReportType,
                BatchNumber = w.BatchNumber,
                OverallStatus = w.Status,
                TestedBy = ResolvePersonName(w.TestedBy ?? w.CreatedBy, "Chemist")
            }).ToList();

            // 10. EXECUTIVE SUMMARY TOP-LEVEL TOTALS
            report.Summary = new ReportSummaryDto
            {
                TotalCasesProduced = report.Production.TotalCasesProduced,
                TotalBatchesCount = report.Production.TotalBatches,
                CompletedBatchesCount = report.Production.CompletedBatches,
                ActiveBatchesCount = report.Production.RunningBatches,

                TotalSalesQuantity = report.Sales.TotalQuantity,
                TotalSalesRevenue = report.Sales.TotalGrossAmount,
                TotalTaxAmount = report.Sales.TotalTaxAmount,
                TotalDiscountAmount = report.Sales.TotalDiscountAmount,
                TotalAmountReceived = report.Sales.TotalReceived,
                TotalOutstandingAmount = report.Sales.TotalOutstanding,
                TotalSalesOrdersCount = report.Sales.TotalTransactions,

                TotalDispatchedQuantity = report.Dispatch.TotalDispatchedQuantity,
                TotalDispatchesCount = report.Dispatch.TotalDispatches,
                UniqueCustomersCount = report.Dispatch.UniqueCustomers,
                UniqueVehiclesCount = report.Dispatch.UniqueVehicles,

                TotalReturnedQuantity = report.Returns.TotalReturnedQuantity,
                TotalReturnedAmount = report.Returns.TotalReturnedAmount,
                TotalReturnsCount = report.Returns.TotalReturnsCount,

                TotalDamagedQuantity = report.Damages.TotalDamagedQuantity,
                TotalDamageCost = report.Damages.TotalDamageCost,
                TotalDamagesCount = report.Damages.TotalDamagesCount,

                NetSalesQuantity = report.Sales.TotalQuantity - report.Returns.TotalReturnedQuantity,
                NetSalesRevenue = report.Sales.TotalGrossAmount - report.Returns.TotalReturnedAmount,

                TotalPlantVisits = report.Operations.TotalVisits,
                TotalPlantDowntimeMinutes = report.Operations.TotalDowntimeMinutes,
                TotalOperatingExpenses = report.Financials.TotalOperatingExpenses,
                TotalPurchasesAmount = report.Financials.TotalMaterialPurchases,
                TotalSalariesPaid = report.Financials.TotalSalariesPaid
            };

            return report;
        }

        public async Task<ProfitAndLossReportDto> GenerateProfitAndLossAsync(ReportFilterRequest request)
        {
            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                throw new UnauthorizedAccessException("Authenticated tenant context is required.");
            }

            var userOffset = TimeSpan.FromMinutes(-request.TzOffset);
            var nowUtc = DateTime.UtcNow;
            var nowLocal = nowUtc.Add(userOffset);
            var todayLocal = nowLocal.Date;

            var preset = (request.Preset ?? "custom").ToLowerInvariant().Trim();
            DateTime fromLocal;
            DateTime toLocal;

            switch (preset)
            {
                case "today":
                    fromLocal = todayLocal;
                    toLocal = todayLocal;
                    break;
                case "yesterday":
                    fromLocal = todayLocal.AddDays(-1);
                    toLocal = todayLocal.AddDays(-1);
                    break;
                case "7days":
                case "last7days":
                    fromLocal = todayLocal.AddDays(-6);
                    toLocal = todayLocal;
                    break;
                case "30days":
                case "last30days":
                    fromLocal = todayLocal.AddDays(-29);
                    toLocal = todayLocal;
                    break;
                case "this_month":
                case "thismonth":
                    fromLocal = new DateTime(todayLocal.Year, todayLocal.Month, 1);
                    toLocal = todayLocal;
                    break;
                case "last_month":
                case "lastmonth":
                    var firstOfThisMonth = new DateTime(todayLocal.Year, todayLocal.Month, 1);
                    var lastOfPrevMonth = firstOfThisMonth.AddDays(-1);
                    fromLocal = new DateTime(lastOfPrevMonth.Year, lastOfPrevMonth.Month, 1);
                    toLocal = lastOfPrevMonth;
                    break;
                case "this_year":
                case "thisyear":
                    fromLocal = new DateTime(todayLocal.Year, 1, 1);
                    toLocal = todayLocal;
                    break;
                default:
                    fromLocal = request.DateFrom.HasValue ? request.DateFrom.Value.Date : todayLocal.AddDays(-29);
                    toLocal = request.DateTo.HasValue ? request.DateTo.Value.Date : todayLocal;
                    if (fromLocal > toLocal)
                    {
                        (fromLocal, toLocal) = (toLocal, fromLocal);
                    }
                    break;
            }

            var fromUtc = fromLocal.Subtract(userOffset);
            var toUtc = toLocal.AddDays(1).AddMilliseconds(-1).Subtract(userOffset);

            var company = await _tenantContext.Companies
                .AsNoTracking()
                .FirstOrDefaultAsync(c => !c.IsDeleted && c.TenantId == tenantId);

            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId);

            var resolvedCompanyName = !string.IsNullOrWhiteSpace(company?.Name) && company.Name != "Company"
                ? company.Name
                : (tenant?.Name ?? "Aquora Water ERP");

            var currencyCode = !string.IsNullOrWhiteSpace(tenant?.Currency) && !tenant.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase)
                ? tenant.Currency
                : "INR";

            var currencySymbol = currencyCode == "INR" ? "₹" : (currencyCode == "USD" ? "$" : currencyCode);

            // 1. SalesTransactions (strictly filtered by business TransactionDate)
            var salesQuery = _tenantContext.SalesTransactions
                .Include(s => s.Product)
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId && !s.IsDeleted &&
                    s.TransactionDate >= fromUtc && s.TransactionDate <= toUtc);

            if (request.ProductId.HasValue && request.ProductId.Value != Guid.Empty)
            {
                salesQuery = salesQuery.Where(s => s.ProductId == request.ProductId.Value);
            }
            if (request.CustomerId.HasValue && request.CustomerId.Value != Guid.Empty)
            {
                salesQuery = salesQuery.Where(s => s.CustomerId == request.CustomerId.Value);
            }

            var salesTxns = await salesQuery.ToListAsync();

            var salesDispatches = salesTxns.Where(s =>
                string.IsNullOrWhiteSpace(s.TransactionType) ||
                s.TransactionType.Equals("Sales Dispatch", StringComparison.OrdinalIgnoreCase) ||
                s.TransactionType.Contains("Sale", StringComparison.OrdinalIgnoreCase) ||
                s.TransactionType.Contains("Dispatch", StringComparison.OrdinalIgnoreCase))
                .Where(s => !s.TransactionType.Contains("Return", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var salesReturns = salesTxns.Where(s =>
                s.TransactionType.Contains("Return", StringComparison.OrdinalIgnoreCase)).ToList();

            var salesDamages = salesTxns.Where(s =>
                s.TransactionType.Equals("Damage", StringComparison.OrdinalIgnoreCase) ||
                s.TransactionType.Equals("Damaged Goods", StringComparison.OrdinalIgnoreCase)).ToList();

            decimal salesGrossExclGst = salesDispatches.Sum(s =>
            {
                var total = s.TotalAmount > 0 ? s.TotalAmount : (s.Cases * s.UnitPrice);
                return Math.Max(0m, total - s.TaxAmount);
            });
            decimal salesDiscounts = salesDispatches.Sum(s => s.DiscountAmount);
            decimal salesGrossBeforeDiscount = salesGrossExclGst + salesDiscounts;
            decimal salesOutputGst = salesDispatches.Sum(s => s.TaxAmount);
            decimal salesReturnsTotal = salesReturns.Sum(r => r.ReturnedAmount > 0 ? r.ReturnedAmount : (r.Cases * r.UnitPrice));
            decimal salesDamageLoss = salesDamages.Sum(d =>
                d.DamageCost > 0 ? d.DamageCost : (d.Cases * (d.Product != null && d.Product.CostPrice > 0 ? d.Product.CostPrice : 0m)));

            // 2. 20L Deliveries (only unlinked to SalesTransactions and not cancelled) & Commissions
            var twentyLQuery = _tenantContext.TwentyLDeliveries
                .AsNoTracking()
                .Where(d => d.TenantId == tenantId &&
                    d.Status != "CANCELLED" &&
                    d.SalesTransactionId == null &&
                    d.DeliveredAt >= fromUtc && d.DeliveredAt <= toUtc);

            if (request.ProductId.HasValue && request.ProductId.Value != Guid.Empty)
            {
                twentyLQuery = twentyLQuery.Where(d => d.ProductId == request.ProductId.Value);
            }
            if (request.CustomerId.HasValue && request.CustomerId.Value != Guid.Empty)
            {
                twentyLQuery = twentyLQuery.Where(d => d.CustomerId == request.CustomerId.Value);
            }

            var twentyLDeliveries = await twentyLQuery.ToListAsync();
            decimal twentyLGrossExclGst = twentyLDeliveries.Sum(d => Math.Max(0m, d.TotalAmount - d.TaxAmount));
            decimal twentyLDiscounts = twentyLDeliveries.Sum(d => d.DiscountAmount);
            decimal twentyLGrossBeforeDiscount = twentyLGrossExclGst + twentyLDiscounts;
            decimal twentyLOutputGst = twentyLDeliveries.Sum(d => d.TaxAmount);

            var twentyLCommissions = await _tenantContext.TwentyLCommissionTransactions
                .AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.OccurredAt >= fromUtc && c.OccurredAt <= toUtc)
                .SumAsync(c => (decimal?)c.Amount) ?? 0m;

            // 3. Purchases (classified by PurchaseCategory.Treatment; strictly PurchaseDate)
            var categoryTreatments = await _tenantContext.PurchaseCategories
                .AsNoTracking()
                .Where(c => c.TenantId == tenantId && !c.IsDeleted)
                .ToDictionaryAsync(c => c.Code, c => c.Treatment, StringComparer.OrdinalIgnoreCase);

            string ResolveTreatment(string categoryCode)
            {
                if (!string.IsNullOrWhiteSpace(categoryCode) && categoryTreatments.TryGetValue(categoryCode.Trim(), out var t))
                    return t;
                if (string.Equals(categoryCode, "RawMaterial", StringComparison.OrdinalIgnoreCase)) return "Inventory";
                if (string.Equals(categoryCode, "Machine", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(categoryCode, "OfficeAsset", StringComparison.OrdinalIgnoreCase)) return "Asset";
                return "Expense";
            }

            var purchases = await _tenantContext.Purchases
                .AsNoTracking()
                .Where(p => p.TenantId == tenantId && !p.IsDeleted &&
                    p.PurchaseDate >= fromUtc && p.PurchaseDate <= toUtc)
                .ToListAsync();

            var cancelledPurchasesExcluded = purchases.Where(p => p.IsCancelled).Sum(p => p.GrandTotal);
            var activePurchases = purchases.Where(p => !p.IsCancelled).ToList();

            decimal GetPurchaseExclGst(Purchase p) =>
                p.TaxableAmount > 0 ? p.TaxableAmount : Math.Max(0m, p.GrandTotal - p.TaxAmount);

            var inventoryPurchases = activePurchases.Where(p => ResolveTreatment(p.PurchaseCategory) == "Inventory").ToList();
            var assetPurchases = activePurchases.Where(p => ResolveTreatment(p.PurchaseCategory) == "Asset").ToList();
            var expensePurchases = activePurchases.Where(p => ResolveTreatment(p.PurchaseCategory) == "Expense").ToList();

            decimal materialPurchasesTotal = inventoryPurchases.Sum(GetPurchaseExclGst);
            decimal capExExcludedTotal = assetPurchases.Sum(GetPurchaseExclGst);
            decimal inputGstOnPnlPurchases = inventoryPurchases.Sum(p => p.TaxAmount) + expensePurchases.Sum(p => p.TaxAmount);

            var expensePurchasesByCategory = expensePurchases
                .GroupBy(p => string.IsNullOrWhiteSpace(p.PurchaseCategory) ? "Other" : p.PurchaseCategory)
                .Select(g => new ExpenseCategorySummaryDto
                {
                    Category = g.Key,
                    TotalAmount = g.Sum(GetPurchaseExclGst),
                    Count = g.Count()
                })
                .OrderByDescending(x => x.TotalAmount)
                .ToList();

            decimal totalExpensePurchases = expensePurchasesByCategory.Sum(x => x.TotalAmount);

            // 4. SimpleExpenses (strictly ExpenseDate)
            var simpleExpenses = await _tenantContext.SimpleExpenses
                .AsNoTracking()
                .Where(e => e.TenantId == tenantId && !e.IsDeleted &&
                    e.ExpenseDate >= fromUtc && e.ExpenseDate <= toUtc)
                .ToListAsync();

            var simpleExpensesByCategory = simpleExpenses
                .GroupBy(e => string.IsNullOrWhiteSpace(e.Category) ? "Miscellaneous" : e.Category.Trim())
                .Select(g => new ExpenseCategorySummaryDto
                {
                    Category = g.Key,
                    TotalAmount = g.Sum(x => x.Amount),
                    Count = g.Count()
                })
                .OrderByDescending(x => x.TotalAmount)
                .ToList();

            decimal totalSimpleExpenses = simpleExpensesByCategory.Sum(x => x.TotalAmount);
            decimal simpleExpensesSalaryOverlap = simpleExpenses
                .Where(e => e.Category.Equals("Salary", StringComparison.OrdinalIgnoreCase))
                .Sum(e => e.Amount);

            // 5. SalaryPayments (strictly PaymentDate)
            decimal salariesPaid = await _tenantContext.SalaryPayments
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId && !s.IsDeleted &&
                    s.PaymentDate >= fromUtc && s.PaymentDate <= toUtc)
                .SumAsync(s => (decimal?)s.Amount) ?? 0m;

            // 6. Check Depreciation events in period (disclosure only, Pre-Depreciation P&L)
            int depreciationEventsCount = await _tenantContext.AssetHistories
                .Include(h => h.Asset)
                .AsNoTracking()
                .Where(h => h.Asset.TenantId == tenantId && !h.Asset.IsDeleted &&
                    h.Action == "Depreciation Applied" &&
                    h.Date >= fromUtc && h.Date <= toUtc)
                .CountAsync();

            // 7. Compute P&L Totals
            decimal totalGrossBeforeDiscount = salesGrossBeforeDiscount + twentyLGrossBeforeDiscount;
            decimal totalDiscounts = salesDiscounts + twentyLDiscounts;
            decimal netSalesRevenue = totalGrossBeforeDiscount - totalDiscounts - salesReturnsTotal;

            decimal totalDirectCosts = materialPurchasesTotal + salesDamageLoss + twentyLCommissions;
            decimal grossProfit = netSalesRevenue - totalDirectCosts;
            decimal grossMarginPct = netSalesRevenue > 0 ? Math.Round((grossProfit / netSalesRevenue) * 100m, 2) : 0m;

            decimal totalOperatingExpenses = totalSimpleExpenses + totalExpensePurchases + salariesPaid;
            decimal operatingProfit = grossProfit - totalOperatingExpenses;
            decimal netProfit = operatingProfit;
            decimal netMarginPct = netSalesRevenue > 0 ? Math.Round((netProfit / netSalesRevenue) * 100m, 2) : 0m;

            var disclosures = new List<string>
            {
                "Basis: Operational / Period-Purchase P&L. Direct material costs reflect non-cancelled Inventory purchases in the period rather than FIFO/weighted-average COGS.",
                "GST Treatment: Sales Revenue and Purchases are shown net of GST. Output GST collected and Input GST on purchases are listed separately in the Informational section.",
                "Non-P&L Exclusions: Owner investments/withdrawals, bank deposits/transfers, cashbook settlements, and CapEx (Machine/OfficeAsset) purchases are excluded."
            };

            if (depreciationEventsCount > 0)
            {
                disclosures.Add($"Pre-Depreciation P&L: {depreciationEventsCount} asset depreciation event(s) occurred in this period and are not deducted above.");
            }
            if (simpleExpensesSalaryOverlap > 0 && salariesPaid > 0)
            {
                disclosures.Add($"Potential Overlap Notice: Both Payroll Salary Payments ({currencySymbol}{salariesPaid:N2}) and Simple Expenses categorized as 'Salary' ({currencySymbol}{simpleExpensesSalaryOverlap:N2}) exist in this period.");
            }

            return new ProfitAndLossReportDto
            {
                Period = new ReportPeriodDto
                {
                    DateFromUtc = fromUtc,
                    DateToUtc = toUtc,
                    FormattedRange = $"{fromLocal:dd MMM yyyy} — {toLocal:dd MMM yyyy}",
                    GeneratedAtLocal = $"{nowLocal:dd MMM yyyy, hh:mm tt}",
                    Preset = preset
                },
                Company = new CompanyReportInfoDto
                {
                    Name = resolvedCompanyName,
                    DisplayName = resolvedCompanyName,
                    Email = tenant?.OwnerEmail,
                    Phone = tenant?.OwnerPhone,
                    GstNumber = tenant?.GstNumber,
                    Address = tenant?.Address,
                    LogoUrl = tenant?.LogoUrl,
                    Currency = currencyCode,
                    CurrencySymbol = currencySymbol
                },
                Revenue = new ProfitAndLossRevenueDto
                {
                    SalesGrossBeforeDiscount = salesGrossBeforeDiscount,
                    TwentyLGrossBeforeDiscount = twentyLGrossBeforeDiscount,
                    TotalGrossBeforeDiscount = totalGrossBeforeDiscount,
                    TotalDiscounts = totalDiscounts,
                    SalesReturns = salesReturnsTotal,
                    NetSalesRevenue = netSalesRevenue,
                    SalesOrdersCount = salesDispatches.Count,
                    TwentyLDeliveriesCount = twentyLDeliveries.Count,
                    ReturnsCount = salesReturns.Count
                },
                DirectCosts = new ProfitAndLossDirectCostsDto
                {
                    MaterialPurchases = materialPurchasesTotal,
                    SalesDamageLoss = salesDamageLoss,
                    TwentyLCommissions = twentyLCommissions,
                    TotalDirectCosts = totalDirectCosts
                },
                GrossProfit = grossProfit,
                GrossMarginPercent = grossMarginPct,
                OperatingExpenses = new ProfitAndLossOperatingExpensesDto
                {
                    SimpleExpensesByCategory = simpleExpensesByCategory,
                    TotalSimpleExpenses = totalSimpleExpenses,
                    ExpensePurchasesByCategory = expensePurchasesByCategory,
                    TotalExpensePurchases = totalExpensePurchases,
                    SalariesPaid = salariesPaid,
                    TotalOperatingExpenses = totalOperatingExpenses
                },
                OperatingProfit = operatingProfit,
                NetProfit = netProfit,
                NetMarginPercent = netMarginPct,
                Informational = new ProfitAndLossInformationalDto
                {
                    OutputGstCollected = salesOutputGst + twentyLOutputGst,
                    InputGstOnPurchases = inputGstOnPnlPurchases,
                    CapExAssetPurchasesExcluded = capExExcludedTotal,
                    CancelledPurchasesExcluded = cancelledPurchasesExcluded,
                    DepreciationEventsCount = depreciationEventsCount,
                    SimpleExpensesSalaryOverlapAmount = simpleExpensesSalaryOverlap
                },
                Disclosures = disclosures
            };
        }
    }
}
