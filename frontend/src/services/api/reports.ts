import { api } from '../api'

export interface ReportFilterRequest {
  dateFrom?: string | null
  dateTo?: string | null
  preset?: string
  tzOffset?: number
  productId?: string | null
  customerId?: string | null
  productionLineId?: string | null
  status?: string | null
}

export interface ReportPeriodDto {
  dateFromUtc: string
  dateToUtc: string
  formattedRange: string
  generatedAtLocal: string
  preset: string
}

export interface CompanyReportInfoDto {
  name: string
  displayName?: string | null
  email?: string | null
  phone?: string | null
  gstNumber?: string | null
  address?: string | null
  logoUrl?: string | null
  currency: string
  currencySymbol: string
}

export interface ReportSummaryDto {
  totalCasesProduced: number
  totalBatchesCount: number
  completedBatchesCount: number
  activeBatchesCount: number

  totalSalesQuantity: number
  totalSalesRevenue: number
  totalTaxAmount: number
  totalDiscountAmount: number
  totalAmountReceived: number
  totalOutstandingAmount: number
  totalSalesOrdersCount: number

  totalDispatchedQuantity: number
  totalDispatchesCount: number
  uniqueCustomersCount: number
  uniqueVehiclesCount: number

  totalReturnedQuantity: number
  totalReturnedAmount: number
  totalReturnsCount: number

  totalDamagedQuantity: number
  totalDamageCost: number
  totalDamagesCount: number

  netSalesQuantity: number
  netSalesRevenue: number

  totalPlantVisits: number
  totalPlantDowntimeMinutes: number
  totalOperatingExpenses: number
  totalPurchasesAmount: number
  totalSalariesPaid: number
}

export interface ProductionBatchItemDto {
  id: string
  batchNumber: string
  product: string
  productionLine: string
  shift: string
  operatorName: string
  startedAt: string
  completedAt?: string | null
  status: string
  targetQuantity: number
  producedQuantity: number
  variance: number
}

export interface ProductionEntryItemDto {
  id: string
  date: string
  time: string
  shift: string
  productionLine: string
  productName: string
  operatorName: string
  casesProduced: number
  preformUsage: number
  preformWastage: number
  capUsage: number
  capWastage: number
  labelUsage: number
  labelWastage: number
}

export interface ProductionReportSectionDto {
  totalBatches: number
  completedBatches: number
  runningBatches: number
  totalCasesProduced: number
  totalPreformWastage: number
  totalCapWastage: number
  totalLabelWastage: number
  totalShrinkWastage: number
  batches: ProductionBatchItemDto[]
  entries: ProductionEntryItemDto[]
}

export interface SalesTransactionItemDto {
  id: string
  transactionNumber: string
  transactionDate: string
  customerName: string
  productName: string
  cases: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  amountReceived: number
  outstandingAmount: number
  paymentStatus: string
  paymentMethod?: string | null
  status: string
  referenceNumber?: string | null
}

export interface SalesReportSectionDto {
  totalQuantity: number
  totalGrossAmount: number
  totalTaxAmount: number
  totalDiscountAmount: number
  totalNetAmount: number
  totalReceived: number
  totalOutstanding: number
  totalTransactions: number
  transactions: SalesTransactionItemDto[]
}

export interface DispatchItemDto {
  id: string
  dispatchDate: string
  dispatchNumber: string
  customerName: string
  productName: string
  quantity: number
  vehicleNumber: string
  driverOrLoadedBy: string
  status: string
  referenceNumber?: string | null
  sourceModule: string
}

export interface DispatchReportSectionDto {
  totalDispatchedQuantity: number
  totalDispatches: number
  uniqueCustomers: number
  uniqueVehicles: number
  dispatches: DispatchItemDto[]
}

export interface ReturnReasonCountDto {
  reason: string
  count: number
  totalQuantity: number
}

export interface ReturnItemDto {
  id: string
  returnDate: string
  returnNumber: string
  referenceNumber?: string | null
  customerName: string
  productName: string
  quantity: number
  returnType?: string | null
  returnedAmount: number
  refundAmount: number
  isReplacementRequired: boolean
  status: string
  remarks?: string | null
}

export interface ReturnsReportSectionDto {
  totalReturnedQuantity: number
  totalReturnedAmount: number
  totalRefundAmount: number
  totalReturnsCount: number
  reasonBreakdown: ReturnReasonCountDto[]
  returns: ReturnItemDto[]
}

export interface DamageReasonCountDto {
  reason: string
  count: number
  totalQuantity: number
}

export interface DamageItemDto {
  id: string
  damageDate: string
  damageNumber: string
  referenceNumber?: string | null
  productName: string
  quantity: number
  productValue: number
  damageCost: number
  damageReason?: string | null
  status: string
  remarks?: string | null
  sourceModule: string
}

export interface DamageReportSectionDto {
  totalDamagedQuantity: number
  totalDamageCost: number
  totalProductValue: number
  totalDamagesCount: number
  reasonBreakdown: DamageReasonCountDto[]
  damages: DamageItemDto[]
}

export interface OperationsVisitSummaryDto {
  id: string
  arrivalTime: string
  vehicleNumber: string
  driverName: string
  distributorName: string
  priority: string
  status: string
  loadedQuantity: number
  unloadedQuantity: number
  quarantinedQuantity: number
}

export interface OperationsIssueItemDto {
  id: string
  issueNumber: string
  title: string
  category: string
  severity: string
  status: string
  lineName?: string | null
  machineName?: string | null
  downtimeMinutes: number
  reportedAt: string
  reportedByName?: string | null
  resolvedAt?: string | null
}

export interface OperationsReportSectionDto {
  totalVisits: number
  completedVisits: number
  totalJarsUnloaded: number
  totalJarsLoaded: number
  totalJarsQuarantined: number
  totalIssuesLogged: number
  totalDowntimeMinutes: number
  visits: OperationsVisitSummaryDto[]
  issues: OperationsIssueItemDto[]
}

export interface CustomerPerformanceItemDto {
  customerId: string
  customerName: string
  phone?: string | null
  customerType: string
  ordersCount: number
  totalDispatchedCases: number
  totalSalesValue: number
  totalReturnedCases: number
  netCases: number
  amountReceived: number
  outstandingBalance: number
  lastOrderDate?: string | null
}

export interface CustomersReportSectionDto {
  totalActiveCustomers: number
  totalPurchasedQuantity: number
  totalPurchasedValue: number
  totalReturnedQuantity: number
  totalNetQuantity: number
  totalOutstanding: number
  customers: CustomerPerformanceItemDto[]
}

export interface ProductStockMovementDto {
  productId: string
  productName: string
  sku?: string | null
  category: string
  currentStock: number
  sellingPrice: number
  producedInPeriod: number
  dispatchedInPeriod: number
  returnedInPeriod: number
  damagedInPeriod: number
  netMovementInPeriod: number
}

export interface RawMaterialStockDto {
  materialId: string
  materialName: string
  category: string
  currentStock: number
  unit: string
  consumedInPeriod: number
  wastageInPeriod: number
  reorderLevel: number
}

export interface InventoryReportSectionDto {
  totalFinishedProductsCount: number
  totalRawMaterialsCount: number
  productMovements: ProductStockMovementDto[]
  rawMaterials: RawMaterialStockDto[]
}

export interface ExpenseCategorySummaryDto {
  category: string
  totalAmount: number
  count: number
}

export interface PurchaseSummaryItemDto {
  id: string
  purchaseNumber: string
  purchaseDate: string
  vendorName: string
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  status: string
}

export interface FinancialReportSectionDto {
  totalGrossSales: number
  totalCollectedFromSales: number
  totalSalesReceivables: number
  totalOperatingExpenses: number
  totalMaterialPurchases: number
  totalPurchasesPaid: number
  totalPurchasesOutstanding: number
  totalSalariesPaid: number
  netOperationalMargin: number
  expenseCategories: ExpenseCategorySummaryDto[]
  recentPurchases: PurchaseSummaryItemDto[]
}

export interface QCTestSummaryItemDto {
  id: string
  reportNumber: string
  testDate: string
  sampleSource: string
  batchNumber: string
  overallStatus: string
  testedBy: string
}

export interface QCReportSectionDto {
  totalTestsConducted: number
  totalPassed: number
  totalFailed: number
  totalUnderIncubation: number
  recentTests: QCTestSummaryItemDto[]
}

export interface BusinessReportDto {
  period: ReportPeriodDto
  company: CompanyReportInfoDto
  summary: ReportSummaryDto
  production: ProductionReportSectionDto
  sales: SalesReportSectionDto
  dispatch: DispatchReportSectionDto
  returns: ReturnsReportSectionDto
  damages: DamageReportSectionDto
  operations: OperationsReportSectionDto
  customers: CustomersReportSectionDto
  inventory: InventoryReportSectionDto
  financials: FinancialReportSectionDto
  qualityControl: QCReportSectionDto
}

export interface ProfitAndLossRevenueDto {
  salesGrossBeforeDiscount: number
  twentyLGrossBeforeDiscount: number
  totalGrossBeforeDiscount: number
  totalDiscounts: number
  salesReturns: number
  netSalesRevenue: number
  salesOrdersCount: number
  twentyLDeliveriesCount: number
  returnsCount: number
}

export interface ProfitAndLossDirectCostsDto {
  materialPurchases: number
  salesDamageLoss: number
  twentyLCommissions: number
  totalDirectCosts: number
}

export interface ProfitAndLossOperatingExpensesDto {
  simpleExpensesByCategory: ExpenseCategorySummaryDto[]
  totalSimpleExpenses: number
  expensePurchasesByCategory: ExpenseCategorySummaryDto[]
  totalExpensePurchases: number
  salariesPaid: number
  totalOperatingExpenses: number
}

export interface ProfitAndLossInformationalDto {
  outputGstCollected: number
  inputGstOnPurchases: number
  capExAssetPurchasesExcluded: number
  cancelledPurchasesExcluded: number
  depreciationEventsCount: number
  simpleExpensesSalaryOverlapAmount: number
}

export interface ProfitAndLossReportDto {
  period: ReportPeriodDto
  company: CompanyReportInfoDto
  revenue: ProfitAndLossRevenueDto
  directCosts: ProfitAndLossDirectCostsDto
  grossProfit: number
  grossMarginPercent: number
  operatingExpenses: ProfitAndLossOperatingExpensesDto
  operatingProfit: number
  netProfit: number
  netMarginPercent: number
  informational: ProfitAndLossInformationalDto
  disclosures: string[]
}

export const reportsApi = {
  getReport: async (filters: ReportFilterRequest): Promise<{ success: boolean; data: BusinessReportDto; message?: string }> => {
    const tzOffset = new Date().getTimezoneOffset()
    const params: any = {
      tzOffset,
      ...filters
    }
    const response = await api.get('/api/v1/reports', { params })
    return response.data
  },

  generateReport: async (request: ReportFilterRequest): Promise<{ success: boolean; data: BusinessReportDto; message?: string }> => {
    const tzOffset = new Date().getTimezoneOffset()
    const payload = {
      ...request,
      tzOffset
    }
    const response = await api.post('/api/v1/reports/generate', payload)
    return response.data
  },

  generateProfitAndLoss: async (request: ReportFilterRequest): Promise<{ success: boolean; data: ProfitAndLossReportDto; message?: string }> => {
    const tzOffset = new Date().getTimezoneOffset()
    const payload = {
      ...request,
      tzOffset
    }
    const response = await api.post('/api/v1/reports/profit-and-loss', payload)
    return response.data
  }
}
