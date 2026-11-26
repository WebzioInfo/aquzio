using System;
using System.Collections.Generic;

namespace Aquora.Application.DTOs.Reports
{
    public class ReportFilterRequest
    {
        public DateTime? DateFrom { get; set; }
        public DateTime? DateTo { get; set; }
        public string? Preset { get; set; } // "today", "yesterday", "7days", "30days", "this_month", "last_month", "this_year", "custom"
        public int TzOffset { get; set; } = -330; // Minutes offset (e.g. -330 for IST UTC+5:30)
        
        // Optional Advanced Filters
        public Guid? ProductId { get; set; }
        public Guid? CustomerId { get; set; }
        public Guid? ProductionLineId { get; set; }
        public string? Status { get; set; }
    }

    public class BusinessReportDto
    {
        public ReportPeriodDto Period { get; set; } = new();
        public CompanyReportInfoDto Company { get; set; } = new();
        public ReportSummaryDto Summary { get; set; } = new();
        public ProductionReportSectionDto Production { get; set; } = new();
        public SalesReportSectionDto Sales { get; set; } = new();
        public DispatchReportSectionDto Dispatch { get; set; } = new();
        public ReturnsReportSectionDto Returns { get; set; } = new();
        public DamageReportSectionDto Damages { get; set; } = new();
        public OperationsReportSectionDto Operations { get; set; } = new();
        public CustomersReportSectionDto Customers { get; set; } = new();
        public InventoryReportSectionDto Inventory { get; set; } = new();
        public FinancialReportSectionDto Financials { get; set; } = new();
        public QCReportSectionDto QualityControl { get; set; } = new();
    }

    public class ReportPeriodDto
    {
        public DateTime DateFromUtc { get; set; }
        public DateTime DateToUtc { get; set; }
        public string FormattedRange { get; set; } = string.Empty;
        public string GeneratedAtLocal { get; set; } = string.Empty;
        public string Preset { get; set; } = "custom";
    }

    public class CompanyReportInfoDto
    {
        public string Name { get; set; } = string.Empty;
        public string? DisplayName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? GstNumber { get; set; }
        public string? Address { get; set; }
        public string? LogoUrl { get; set; }
        public string Currency { get; set; } = "INR";
        public string CurrencySymbol { get; set; } = "₹";
    }

    public class ReportSummaryDto
    {
        // Production
        public int TotalCasesProduced { get; set; }
        public int TotalBatchesCount { get; set; }
        public int CompletedBatchesCount { get; set; }
        public int ActiveBatchesCount { get; set; }

        // Sales & Dispatches
        public decimal TotalSalesQuantity { get; set; }
        public decimal TotalSalesRevenue { get; set; }
        public decimal TotalTaxAmount { get; set; }
        public decimal TotalDiscountAmount { get; set; }
        public decimal TotalAmountReceived { get; set; }
        public decimal TotalOutstandingAmount { get; set; }
        public int TotalSalesOrdersCount { get; set; }

        // Dispatches
        public decimal TotalDispatchedQuantity { get; set; }
        public int TotalDispatchesCount { get; set; }
        public int UniqueCustomersCount { get; set; }
        public int UniqueVehiclesCount { get; set; }

        // Returns & Damages
        public decimal TotalReturnedQuantity { get; set; }
        public decimal TotalReturnedAmount { get; set; }
        public int TotalReturnsCount { get; set; }

        public decimal TotalDamagedQuantity { get; set; }
        public decimal TotalDamageCost { get; set; }
        public int TotalDamagesCount { get; set; }

        // Net Sales
        public decimal NetSalesQuantity { get; set; }
        public decimal NetSalesRevenue { get; set; }

        // Operations & Accounts
        public int TotalPlantVisits { get; set; }
        public int TotalPlantDowntimeMinutes { get; set; }
        public decimal TotalOperatingExpenses { get; set; }
        public decimal TotalPurchasesAmount { get; set; }
        public decimal TotalSalariesPaid { get; set; }
    }

    public class ProductionReportSectionDto
    {
        public int TotalBatches { get; set; }
        public int CompletedBatches { get; set; }
        public int RunningBatches { get; set; }
        public int TotalCasesProduced { get; set; }
        public decimal TotalPreformWastage { get; set; }
        public decimal TotalCapWastage { get; set; }
        public decimal TotalLabelWastage { get; set; }
        public decimal TotalShrinkWastage { get; set; }

        public List<ProductionBatchItemDto> Batches { get; set; } = new();
        public List<ProductionEntryItemDto> Entries { get; set; } = new();
    }

    public class ProductionBatchItemDto
    {
        public Guid Id { get; set; }
        public string BatchNumber { get; set; } = string.Empty;
        public string Product { get; set; } = string.Empty;
        public string ProductionLine { get; set; } = string.Empty;
        public string Shift { get; set; } = string.Empty;
        public string OperatorName { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string Status { get; set; } = string.Empty;
        public int TargetQuantity { get; set; }
        public int ProducedQuantity { get; set; }
        public int Variance => ProducedQuantity - TargetQuantity;
    }

    public class ProductionEntryItemDto
    {
        public Guid Id { get; set; }
        public DateTime Date { get; set; }
        public string Time { get; set; } = string.Empty;
        public string Shift { get; set; } = string.Empty;
        public string ProductionLine { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public string OperatorName { get; set; } = string.Empty;
        public int CasesProduced { get; set; }
        public decimal PreformUsage { get; set; }
        public decimal PreformWastage { get; set; }
        public decimal CapUsage { get; set; }
        public decimal CapWastage { get; set; }
        public decimal LabelUsage { get; set; }
        public decimal LabelWastage { get; set; }
    }

    public class SalesReportSectionDto
    {
        public decimal TotalQuantity { get; set; }
        public decimal TotalGrossAmount { get; set; }
        public decimal TotalTaxAmount { get; set; }
        public decimal TotalDiscountAmount { get; set; }
        public decimal TotalNetAmount { get; set; }
        public decimal TotalReceived { get; set; }
        public decimal TotalOutstanding { get; set; }
        public int TotalTransactions { get; set; }

        public List<SalesTransactionItemDto> Transactions { get; set; } = new();
    }

    public class SalesTransactionItemDto
    {
        public Guid Id { get; set; }
        public string TransactionNumber { get; set; } = string.Empty;
        public DateTime TransactionDate { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public decimal Cases { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal AmountReceived { get; set; }
        public decimal OutstandingAmount { get; set; }
        public string PaymentStatus { get; set; } = string.Empty;
        public string? PaymentMethod { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? ReferenceNumber { get; set; }
    }

    public class DispatchReportSectionDto
    {
        public decimal TotalDispatchedQuantity { get; set; }
        public int TotalDispatches { get; set; }
        public int UniqueCustomers { get; set; }
        public int UniqueVehicles { get; set; }

        public List<DispatchItemDto> Dispatches { get; set; } = new();
    }

    public class DispatchItemDto
    {
        public Guid Id { get; set; }
        public DateTime DispatchDate { get; set; }
        public string DispatchNumber { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public string VehicleNumber { get; set; } = string.Empty;
        public string DriverOrLoadedBy { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? ReferenceNumber { get; set; }
        public string SourceModule { get; set; } = "Sales Dispatch"; // "Sales Dispatch" or "20L Loading"
    }

    public class ReturnsReportSectionDto
    {
        public decimal TotalReturnedQuantity { get; set; }
        public decimal TotalReturnedAmount { get; set; }
        public decimal TotalRefundAmount { get; set; }
        public int TotalReturnsCount { get; set; }
        public List<ReturnReasonCountDto> ReasonBreakdown { get; set; } = new();
        public List<ReturnItemDto> Returns { get; set; } = new();
    }

    public class ReturnReasonCountDto
    {
        public string Reason { get; set; } = string.Empty;
        public int Count { get; set; }
        public decimal TotalQuantity { get; set; }
    }

    public class ReturnItemDto
    {
        public Guid Id { get; set; }
        public DateTime ReturnDate { get; set; }
        public string ReturnNumber { get; set; } = string.Empty;
        public string? ReferenceNumber { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public string? ReturnType { get; set; }
        public decimal ReturnedAmount { get; set; }
        public decimal RefundAmount { get; set; }
        public bool IsReplacementRequired { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Remarks { get; set; }
    }

    public class DamageReportSectionDto
    {
        public decimal TotalDamagedQuantity { get; set; }
        public decimal TotalDamageCost { get; set; }
        public decimal TotalProductValue { get; set; }
        public int TotalDamagesCount { get; set; }
        public List<DamageReasonCountDto> ReasonBreakdown { get; set; } = new();
        public List<DamageItemDto> Damages { get; set; } = new();
    }

    public class DamageReasonCountDto
    {
        public string Reason { get; set; } = string.Empty;
        public int Count { get; set; }
        public decimal TotalQuantity { get; set; }
    }

    public class DamageItemDto
    {
        public Guid Id { get; set; }
        public DateTime DamageDate { get; set; }
        public string DamageNumber { get; set; } = string.Empty;
        public string? ReferenceNumber { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public decimal ProductValue { get; set; }
        public decimal DamageCost { get; set; }
        public string? DamageReason { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Remarks { get; set; }
        public string SourceModule { get; set; } = "Sales Damage";
    }

    public class OperationsReportSectionDto
    {
        public int TotalVisits { get; set; }
        public int CompletedVisits { get; set; }
        public int TotalJarsUnloaded { get; set; }
        public int TotalJarsLoaded { get; set; }
        public int TotalJarsQuarantined { get; set; }
        public int TotalIssuesLogged { get; set; }
        public int TotalDowntimeMinutes { get; set; }

        public List<OperationsVisitSummaryDto> Visits { get; set; } = new();
        public List<OperationsIssueItemDto> Issues { get; set; } = new();
    }

    public class OperationsVisitSummaryDto
    {
        public Guid Id { get; set; }
        public DateTime ArrivalTime { get; set; }
        public string VehicleNumber { get; set; } = string.Empty;
        public string DriverName { get; set; } = string.Empty;
        public string DistributorName { get; set; } = string.Empty;
        public string Priority { get; set; } = "Normal";
        public string Status { get; set; } = string.Empty;
        public int LoadedQuantity { get; set; }
        public int UnloadedQuantity { get; set; }
        public int QuarantinedQuantity { get; set; }
    }

    public class OperationsIssueItemDto
    {
        public Guid Id { get; set; }
        public string IssueNumber { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? LineName { get; set; }
        public string? MachineName { get; set; }
        public int DowntimeMinutes { get; set; }
        public DateTime ReportedAt { get; set; }
        public string? ReportedByName { get; set; }
        public DateTime? ResolvedAt { get; set; }
    }

    public class CustomersReportSectionDto
    {
        public int TotalActiveCustomers { get; set; }
        public decimal TotalPurchasedQuantity { get; set; }
        public decimal TotalPurchasedValue { get; set; }
        public decimal TotalReturnedQuantity { get; set; }
        public decimal TotalNetQuantity { get; set; }
        public decimal TotalOutstanding { get; set; }

        public List<CustomerPerformanceItemDto> Customers { get; set; } = new();
    }

    public class CustomerPerformanceItemDto
    {
        public Guid CustomerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public string CustomerType { get; set; } = string.Empty;
        public int OrdersCount { get; set; }
        public decimal TotalDispatchedCases { get; set; }
        public decimal TotalSalesValue { get; set; }
        public decimal TotalReturnedCases { get; set; }
        public decimal NetCases => TotalDispatchedCases - TotalReturnedCases;
        public decimal AmountReceived { get; set; }
        public decimal OutstandingBalance { get; set; }
        public string? LastOrderDate { get; set; }
    }

    public class InventoryReportSectionDto
    {
        public int TotalFinishedProductsCount { get; set; }
        public int TotalRawMaterialsCount { get; set; }

        public List<ProductStockMovementDto> ProductMovements { get; set; } = new();
        public List<RawMaterialStockDto> RawMaterials { get; set; } = new();
    }

    public class ProductStockMovementDto
    {
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? SKU { get; set; }
        public string Category { get; set; } = string.Empty;
        public decimal CurrentStock { get; set; }
        public decimal SellingPrice { get; set; }
        public decimal ProducedInPeriod { get; set; }
        public decimal DispatchedInPeriod { get; set; }
        public decimal ReturnedInPeriod { get; set; }
        public decimal DamagedInPeriod { get; set; }
        public decimal NetMovementInPeriod => ProducedInPeriod + ReturnedInPeriod - DispatchedInPeriod - DamagedInPeriod;
    }

    public class RawMaterialStockDto
    {
        public Guid MaterialId { get; set; }
        public string MaterialName { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public decimal CurrentStock { get; set; }
        public string Unit { get; set; } = string.Empty;
        public decimal ConsumedInPeriod { get; set; }
        public decimal WastageInPeriod { get; set; }
        public decimal ReorderLevel { get; set; }
    }

    public class FinancialReportSectionDto
    {
        public decimal TotalGrossSales { get; set; }
        public decimal TotalCollectedFromSales { get; set; }
        public decimal TotalSalesReceivables { get; set; }

        public decimal TotalOperatingExpenses { get; set; }
        public decimal TotalMaterialPurchases { get; set; }
        public decimal TotalPurchasesPaid { get; set; }
        public decimal TotalPurchasesOutstanding { get; set; }

        public decimal TotalSalariesPaid { get; set; }

        public decimal NetOperationalMargin => TotalGrossSales - TotalOperatingExpenses - TotalMaterialPurchases - TotalSalariesPaid;

        public List<ExpenseCategorySummaryDto> ExpenseCategories { get; set; } = new();
        public List<PurchaseSummaryItemDto> RecentPurchases { get; set; } = new();
    }

    public class ExpenseCategorySummaryDto
    {
        public string Category { get; set; } = string.Empty;
        public decimal TotalAmount { get; set; }
        public int Count { get; set; }
    }

    public class PurchaseSummaryItemDto
    {
        public Guid Id { get; set; }
        public string PurchaseNumber { get; set; } = string.Empty;
        public DateTime PurchaseDate { get; set; }
        public string VendorName { get; set; } = string.Empty;
        public decimal TotalAmount { get; set; }
        public decimal PaidAmount { get; set; }
        public decimal BalanceAmount { get; set; }
        public string Status { get; set; } = string.Empty;
    }

    public class QCReportSectionDto
    {
        public int TotalTestsConducted { get; set; }
        public int TotalPassed { get; set; }
        public int TotalFailed { get; set; }
        public int TotalUnderIncubation { get; set; }
        public List<QCTestSummaryItemDto> RecentTests { get; set; } = new();
    }

    public class QCTestSummaryItemDto
    {
        public Guid Id { get; set; }
        public string ReportNumber { get; set; } = string.Empty;
        public DateTime TestDate { get; set; }
        public string SampleSource { get; set; } = string.Empty;
        public string BatchNumber { get; set; } = string.Empty;
        public string OverallStatus { get; set; } = string.Empty;
        public string TestedBy { get; set; } = string.Empty;
    }

    public class ProfitAndLossReportDto
    {
        public ReportPeriodDto Period { get; set; } = new();
        public CompanyReportInfoDto Company { get; set; } = new();
        public ProfitAndLossRevenueDto Revenue { get; set; } = new();
        public ProfitAndLossDirectCostsDto DirectCosts { get; set; } = new();
        public decimal GrossProfit { get; set; }
        public decimal GrossMarginPercent { get; set; }
        public ProfitAndLossOperatingExpensesDto OperatingExpenses { get; set; } = new();
        public decimal OperatingProfit { get; set; }
        public decimal NetProfit { get; set; }
        public decimal NetMarginPercent { get; set; }
        public ProfitAndLossInformationalDto Informational { get; set; } = new();
        public List<string> Disclosures { get; set; } = new();
    }

    public class ProfitAndLossRevenueDto
    {
        public decimal SalesGrossBeforeDiscount { get; set; }
        public decimal TwentyLGrossBeforeDiscount { get; set; }
        public decimal TotalGrossBeforeDiscount { get; set; }
        public decimal TotalDiscounts { get; set; }
        public decimal SalesReturns { get; set; }
        public decimal NetSalesRevenue { get; set; }
        public int SalesOrdersCount { get; set; }
        public int TwentyLDeliveriesCount { get; set; }
        public int ReturnsCount { get; set; }
    }

    public class ProfitAndLossDirectCostsDto
    {
        public decimal MaterialPurchases { get; set; }
        public decimal SalesDamageLoss { get; set; }
        public decimal TwentyLCommissions { get; set; }
        public decimal TotalDirectCosts { get; set; }
    }

    public class ProfitAndLossOperatingExpensesDto
    {
        public List<ExpenseCategorySummaryDto> SimpleExpensesByCategory { get; set; } = new();
        public decimal TotalSimpleExpenses { get; set; }
        public List<ExpenseCategorySummaryDto> ExpensePurchasesByCategory { get; set; } = new();
        public decimal TotalExpensePurchases { get; set; }
        public decimal SalariesPaid { get; set; }
        public decimal TotalOperatingExpenses { get; set; }
    }

    public class ProfitAndLossInformationalDto
    {
        public decimal OutputGstCollected { get; set; }
        public decimal InputGstOnPurchases { get; set; }
        public decimal CapExAssetPurchasesExcluded { get; set; }
        public decimal CancelledPurchasesExcluded { get; set; }
        public int DepreciationEventsCount { get; set; }
        public decimal SimpleExpensesSalaryOverlapAmount { get; set; }
    }
}
