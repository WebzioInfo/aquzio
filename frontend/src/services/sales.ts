import { api } from './api'
import type { ApiResponse } from './auth'
import type { PagedResult } from './products'

export interface SalesTransaction {
  id: string
  transactionNumber: string
  customerId: string
  customerName: string
  customerCode: string
  productId: string
  productName: string
  productSku: string
  cases: number
  transactionType: string
  transactionDate: string
  referenceNumber: string | null
  remarks: string | null
  status: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string | null
  // Simple Accounts V1 & New ERP Fields
  paymentMethod?: string | null
  paymentTerms?: string | null
  bankAccountId?: string | null
  bankAccountName?: string | null
  cashBookId?: string | null
  cashBookName?: string | null
  unitPrice?: number
  discountAmount?: number
  taxAmount?: number
  gstRate?: number
  isGstApplicable?: boolean
  taxTreatment?: string | null
  cgst?: number
  sgst?: number
  igst?: number
  metadataJson?: string | null
  invoiceType?: string | null
  billType?: string | null

  totalAmount?: number
  amountReceived?: number
  outstandingAmount?: number
  paymentStatus?: string
  returnedAmount?: number
  refundAmount?: number
  adjustmentAmount?: number
  returnType?: string
  isReplacementRequired?: boolean
  productValue?: number
  parentTransactionId?: string | null
  relatedCount?: number
  damageCost?: number
  damageReason?: string
  items?: SalesTransactionItem[]
}

export interface SalesTransactionItem {
  id?: string
  salesTransactionId?: string
  productId: string
  productName?: string | null
  productSku?: string | null
  caseConfigurationId?: string | null
  caseConfigurationName?: string | null
  unitsPerCase?: number
  cases: number
  unitPrice: number
  discountAmount?: number
  taxableAmount?: number
  taxAmount?: number
  gstRate?: number
  isGstApplicable?: boolean
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount?: number
  lineTotal?: number
  remarks?: string | null
}

export interface SalesTransactionItemRequest {
  productId: string
  productName?: string | null
  productSku?: string | null
  caseConfigurationId?: string | null
  caseConfigurationName?: string | null
  unitsPerCase?: number
  cases: number
  unitPrice: number
  discountAmount?: number
  taxableAmount?: number
  taxAmount?: number
  gstRate?: number
  isGstApplicable?: boolean
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount?: number
  lineTotal?: number
  remarks?: string | null
}

export interface SalesDashboard {
  todaySalesCases: number
  todayReturns: number
  todayDamage: number
  totalDispatch: number
  monthlyDispatch: number
}

export interface CreateSalesTransactionRequest {
  customerId: string
  productId: string
  parentTransactionId?: string | null
  caseConfigurationId?: string | null
  unitsPerCase?: number
  cases: number
  transactionType: string
  transactionDate: string
  referenceNumber?: string
  remarks?: string

  // Multi-Product Line Items
  items?: SalesTransactionItemRequest[]

  // ERP & V1 Fields
  paymentMethod?: string
  paymentTerms?: string
  bankAccountId?: string
  cashBookId?: string
  unitPrice?: number
  discountAmount?: number
  taxAmount?: number
  gstRate?: number
  isGstApplicable?: boolean
  taxTreatment?: string
  cgst?: number
  sgst?: number
  igst?: number
  metadataJson?: string

  totalAmount?: number
  amountReceived?: number
  returnedAmount?: number
  refundAmount?: number
  adjustmentAmount?: number
  returnType?: string
  returnCondition?: string
  settlementMethod?: string
  isReplacementRequired?: boolean
  productValue?: number
  damageCost?: number
  damageReason?: string
}

export interface SalesTransactionTimelineEvent {
  id: string
  timestamp: string
  eventType: string
  title: string
  actorName: string
  actorRole?: string | null
  status: string
  description: string
  metadata?: Record<string, any> | null
}

export interface CollectSalesPaymentRequest {
  amount: number
  paymentMethod: string
  bankAccountId?: string | null
  cashBookId?: string | null
  referenceNumber?: string
  notes?: string
  paymentDate?: string
}

export interface SalesPaymentRecord {
  id: string
  date: string
  createdAt: string
  amount: number
  paymentMethod: string
  referenceNumber: string
  description: string
  accountName: string
  collectedBy: string
}

export interface DailySalesTrend {
  date: string
  formattedDate: string
  totalSales: number
  transactionCount: number
  totalCases: number
}

export interface TopProductSales {
  productId: string
  productName: string
  productSku: string
  totalSales: number
  totalCases: number
  transactionCount: number
}

export interface TopCustomerSales {
  customerId: string
  customerName: string
  customerCode: string
  totalSales: number
  totalCases: number
  transactionCount: number
}

export interface SalesTypeBreakdown {
  transactionType: string
  totalSales: number
  totalCases: number
  transactionCount: number
}

export interface OwnerSalesOverview {
  totalSales: number
  salesToday: number
  thisMonthSales: number
  totalTransactions: number
  thisMonthTransactions: number
  averageSale: number
  dailyTrend: DailySalesTrend[]
  topProducts: TopProductSales[]
  topCustomers: TopCustomerSales[]
  typeBreakdown: SalesTypeBreakdown[]
}

export const salesService = {
  getTransactions: async (
    page: number = 1,
    limit: number = 10,
    search: string = '',
    product: string = '',
    customer: string = '',
    type: string = '',
    status: string = '',
    startDate: string = '',
    endDate: string = '',
    sort: string = 'newest'
  ) => {
    let url = `/api/v1/sales?pageNumber=${page}&pageSize=${limit}&search=${encodeURIComponent(search)}&sort=${sort}`
    if (product) url += `&product=${encodeURIComponent(product)}`
    if (customer) url += `&customer=${encodeURIComponent(customer)}`
    if (type) url += `&type=${encodeURIComponent(type)}`
    if (status) url += `&status=${encodeURIComponent(status)}`
    if (startDate) url += `&startDate=${startDate}`
    if (endDate) url += `&endDate=${endDate}`

    const res = await api.get<ApiResponse<PagedResult<SalesTransaction>>>(url)
    return res.data
  },

  getTransaction: async (id: string) => {
    const res = await api.get<ApiResponse<SalesTransaction>>(`/api/v1/sales/${id}`)
    return res.data
  },

  getTransactionTimeline: async (id: string) => {
    const res = await api.get<ApiResponse<SalesTransactionTimelineEvent[]>>(`/api/v1/sales/${id}/timeline`)
    return res.data
  },

  getPayments: async (id: string) => {
    const res = await api.get<ApiResponse<SalesPaymentRecord[]>>(`/api/v1/sales/${id}/payments`)
    return res.data
  },

  collectPayment: async ({ id, data }: { id: string; data: CollectSalesPaymentRequest }) => {
    const res = await api.post<ApiResponse<SalesTransaction>>(`/api/v1/sales/${id}/collect`, data)
    return res.data
  },

  createTransaction: async (data: CreateSalesTransactionRequest) => {
    const res = await api.post<ApiResponse<SalesTransaction>>('/api/v1/sales', data)
    return res.data
  },

  updateTransaction: async ({ id, data }: { id: string; data: CreateSalesTransactionRequest }) => {
    const res = await api.put<ApiResponse<SalesTransaction>>(`/api/v1/sales/${id}`, data)
    return res.data
  },

  deleteTransaction: async (id: string) => {
    const res = await api.delete<ApiResponse<any>>(`/api/v1/sales/${id}`)
    return res.data
  },

  getDispatchHistory: async (id: string) => {
    const res = await api.get<ApiResponse<{
      parentDispatch: {
        id: string
        transactionNumber: string
        transactionDate: string
        customerName: string
        productName: string
        originalCases: number
        totalAmount: number
        returnedCases: number
        damagedCases: number
        remainingCases: number
      }
      history: Array<{
        id: string
        date: string
        createdAt: string
        transactionNumber: string
        transactionType: string
        cases: number
        totalAmount: number
        paymentMethod: string | null
        status: string
        createdBy: string
        isParent: boolean
      }>
    }>>(`/api/v1/sales/${id}/history`)
    return res.data
  },

  getDashboard: async () => {
    const res = await api.get<ApiResponse<SalesDashboard>>('/api/v1/sales/dashboard')
    return res.data
  },

  getOwnerOverview: async (startDate?: string, endDate?: string) => {
    let url = '/api/v1/sales/owner-overview'
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    if (params.toString()) url += `?${params.toString()}`
    const res = await api.get<ApiResponse<OwnerSalesOverview>>(url)
    return res.data
  },

  downloadInvoicePdf: async (id: string, transactionNumber?: string) => {
    const res = await api.get(`/api/v1/sales/${id}/invoice-pdf`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Invoice_${transactionNumber || id.slice(0, 8)}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.parentNode?.removeChild(link)
    window.URL.revokeObjectURL(url)
  }
}
