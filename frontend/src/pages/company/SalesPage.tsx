import { PageContainer, PageHeader, FilterBar, SectionCard, StatusBadge } from '../../components/ui/layout';
import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, Plus, Eye, Edit2, Trash2, X, AlertTriangle,
  User as UserIcon, Calendar, ArrowUpDown, Filter, ChevronLeft, ChevronRight, CheckCircle2,
  Package, ShoppingCart, Info, Phone, Tag, FileSpreadsheet, FileText, Landmark, Printer, Download, ArrowLeft, Send,
  Clock, RotateCcw, Loader2, History, Coins, TrendingUp, BarChart3, Users, Settings
} from 'lucide-react'
import { api } from '../../services/api'
import { salesService, type DailySalesTrend } from '../../services/sales'
import type { SalesTransaction, CreateSalesTransactionRequest, CollectSalesPaymentRequest, SalesPaymentRecord, SalesTransactionItem, SalesTransactionItemRequest } from '../../services/sales'
import { productsService } from '../../services/products'
import { customersService, type ApplicablePriceResponseDto } from '../../services/customers'
import { simpleAccountsService } from '../../services/simpleAccounts'
import { caseConfigurationsService, type CaseConfiguration } from '../../services/caseConfigurations'
import { QuickCreateCaseConfigModal } from './sales/QuickCreateCaseConfigModal'
import { InvoiceViewerModal } from './sales/InvoiceViewerModal'
import { SearchableDropdown } from '../../components/ui/SearchableDropdown'
import { QuickAddCustomerModal } from '../../components/modals/QuickAddCustomerModal'
import { CustomerProductPricingModal } from '../../components/modals/CustomerProductPricingModal'
import { useAuthStore } from '../../store/useAuthStore'
import { generateERPDocumentPDF } from '../../utils/pdfTemplateEngine'
import EnterpriseBadge from '../../components/ui/EnterpriseBadge'
import EnterpriseButton from '../../components/ui/EnterpriseButton'
import EnterpriseNumberInput from '../../components/ui/EnterpriseNumberInput'

const PremiumLabel: React.FC<{ label: string; required?: boolean }> = ({ label, required }) => {
  const hasAsterisk = required || label.endsWith('*');
  const cleanLabel = hasAsterisk ? label.replace('*', '').trim() : label;
  return (
    <label className="text-[13px] font-semibold text-gray-700 select-none mb-1.5 flex items-center">
      <span>{cleanLabel}</span>
      {hasAsterisk && <span className="text-red-500 ml-1 font-bold text-xs select-none">*</span>}
    </label>
  );
};

const OwnerSalesTrendChart: React.FC<{ data: DailySalesTrend[]; height?: number }> = ({ data, height = 200 }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!data || data.length === 0 || data.every(d => d.totalSales === 0)) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-4 select-none">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
          <BarChart3 className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-xs font-bold text-slate-600">No sales data for this period.</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Daily sales trends will automatically plot here as transactions are logged.</p>
      </div>
    )
  }

  const padding = 35
  const width = 640
  const maxVal = Math.max(...data.map(d => d.totalSales), 1000)

  const points = data.map((d, i) => {
    let x = padding
    if (data.length > 1) {
      x = padding + (i / (data.length - 1)) * (width - padding * 2)
    } else {
      x = width / 2
    }
    const y = height - padding - (d.totalSales / maxVal) * (height - padding * 2)
    return { x, y, item: d, idx: i }
  })

  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`
  }
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`

  return (
    <div className="w-full relative space-y-2">
      <div style={{ height }} className="relative select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="sales-trend-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#12A89A" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#12A89A" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {[0, 0.33, 0.66, 1].map((ratio, i) => {
            const y = height - padding - ratio * (height - padding * 2)
            const val = Math.round(ratio * maxVal)
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E8EDF0" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padding - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5B6B75" fontWeight="600">
                  ₹{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                </text>
              </g>
            )
          })}

          <path d={areaD} fill="url(#sales-trend-gradient)" />
          <path d={pathD} fill="none" stroke="#12A89A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((pt, i) => {
            const isHovered = hoveredIdx === i
            return (
              <g key={i} className="cursor-pointer" onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                <circle cx={pt.x} cy={pt.y} r={isHovered ? 5 : 3.5} fill="#FFFFFF" stroke="#12A89A" strokeWidth={isHovered ? 2.5 : 2} className="transition-all duration-150" />
              </g>
            )
          })}
        </svg>

        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute z-30 bg-white text-slate-800 border border-slate-200 rounded-lg p-2.5 text-xs shadow-md pointer-events-none -translate-x-1/2 -translate-y-full mb-2 whitespace-nowrap animate-in fade-in duration-150"
            style={{
              left: `${(points[hoveredIdx].x / width) * 100}%`,
              top: `${(points[hoveredIdx].y / height) * 100}%`
            }}
          >
            <div className="font-bold text-[11px] text-slate-500">{points[hoveredIdx].item.formattedDate}</div>
            <div className="text-[#0B7A70] font-extrabold text-xs">₹{points[hoveredIdx].item.totalSales.toLocaleString('en-IN')}</div>
            <div className="text-[10px] text-slate-500">{points[hoveredIdx].item.transactionCount} Orders • {points[hoveredIdx].item.totalCases} Cases</div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 px-8 pt-1">
        {points.filter((_, idx) => idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1).map((pt, i) => (
          <span key={i}>{pt.item.formattedDate}</span>
        ))}
      </div>
    </div>
  )
}

export interface SalesOrderItemRow {
  id: string
  productId: string
  caseConfigId: string
  cases: string
  unitPrice: string
  discount: string
  isGstEnabled: boolean
  gstRate: string
}

const OrderItemsTableSection: React.FC<{
  orderItems: SalesOrderItemRow[]
  rowErrors: Record<string, { productId?: string; caseConfigId?: string; cases?: string; unitPrice?: string; discount?: string; gstRate?: string; stock?: string }>
  products: any[]
  caseConfigs: CaseConfiguration[]
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onChangeRow: (id: string, field: keyof SalesOrderItemRow, value: any) => void
}> = ({ orderItems, rowErrors, products, caseConfigs, onAddRow, onRemoveRow, onChangeRow }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Order Items ({orderItems.length})</span>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Product</span>
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-[24%]">Product *</th>
                <th className="py-2.5 px-2 w-[18%]">Case Config</th>
                <th className="py-2.5 px-2 text-center w-[10%]">Available Stock</th>
                <th className="py-2.5 px-2 text-right w-[10%]">Cases Qty *</th>
                <th className="py-2.5 px-2 text-right w-[11%]">Price / Case (₹) *</th>
                <th className="py-2.5 px-2 text-right w-[9%]">Discount (₹)</th>
                <th className="py-2.5 px-2 w-[11%]">GST</th>
                <th className="py-2.5 px-3 text-right w-[12%]">Line Total (₹)</th>
                <th className="py-2.5 px-2 text-center w-[5%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderItems.map((row) => {
                const prod = products.find(p => p.id === row.productId)
                const matchingConfigs = caseConfigs.filter(c => c.productId === row.productId && c.isActive)
                const casesNum = parseFloat(row.cases) || 0
                const priceNum = parseFloat(row.unitPrice) || 0
                const discNum = parseFloat(row.discount) || 0
                const gross = casesNum * priceNum
                const taxable = Math.max(0, gross - discNum)
                const gstRateNum = row.isGstEnabled ? (parseFloat(row.gstRate) || 0) : 0
                const gstAmount = Math.round((taxable * gstRateNum / 100) * 100) / 100
                const lineTotal = Math.round((taxable + gstAmount) * 100) / 100
                const currentStock = prod ? prod.currentStock : 0
                const isOverStock = prod && casesNum > currentStock
                const err = rowErrors[row.id]

                return (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Product */}
                    <td className="py-2.5 px-3 align-top">
                      <select
                        value={row.productId}
                        onChange={(e) => onChangeRow(row.id, 'productId', e.target.value)}
                        className={`w-full h-[36px] px-2.5 border text-xs bg-white rounded-lg font-semibold focus:outline-none focus:border-blue-500 cursor-pointer ${err?.productId ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}
                      >
                        <option value="">Select Product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''}
                          </option>
                        ))}
                      </select>
                      {err?.productId && <span className="text-[10px] text-red-500 font-semibold block mt-1">{err.productId}</span>}
                    </td>

                    {/* Case Config */}
                    <td className="py-2.5 px-2 align-top">
                      <select
                        value={row.caseConfigId}
                        onChange={(e) => onChangeRow(row.id, 'caseConfigId', e.target.value)}
                        disabled={!row.productId}
                        className="w-full h-[36px] px-2.5 border border-slate-200 text-xs bg-white rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
                      >
                        {!row.productId ? (
                          <option value="">Select product first</option>
                        ) : matchingConfigs.length === 0 ? (
                          <option value="">Default (24 Bottles)</option>
                        ) : (
                          matchingConfigs.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name ? `${c.name} (${c.unitsPerCase}/cs)` : `${c.unitsPerCase} Bottles/cs`}
                            </option>
                          ))
                        )}
                      </select>
                    </td>

                    {/* Available Stock */}
                    <td className="py-2.5 px-2 align-top text-center">
                      <div className="pt-2">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${!prod ? 'text-slate-400 bg-slate-100' : isOverStock ? 'text-red-700 bg-red-100 border border-red-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'}`}>
                          {prod ? `${currentStock} cs` : '—'}
                        </span>
                        {isOverStock && (
                          <span className="text-[10px] text-red-600 font-bold block mt-1">Exceeds Stock!</span>
                        )}
                      </div>
                    </td>

                    {/* Cases Quantity */}
                    <td className="py-2.5 px-2 align-top text-right">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.cases}
                        onChange={(e) => onChangeRow(row.id, 'cases', e.target.value)}
                        placeholder="0"
                        className={`w-full h-[36px] px-2 text-right border text-xs rounded-lg font-bold focus:outline-none focus:border-blue-500 ${err?.cases || err?.stock || isOverStock ? 'border-red-400 bg-red-50/30 text-red-700' : 'border-slate-200'}`}
                      />
                      {(err?.cases || err?.stock) && (
                        <span className="text-[10px] text-red-500 font-semibold block mt-1 text-right">{err.cases || err.stock}</span>
                      )}
                    </td>

                    {/* Price / Case */}
                    <td className="py-2.5 px-2 align-top text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unitPrice}
                        onChange={(e) => onChangeRow(row.id, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className={`w-full h-[36px] px-2 text-right border text-xs rounded-lg font-bold focus:outline-none focus:border-blue-500 ${err?.unitPrice ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}
                      />
                      {err?.unitPrice && <span className="text-[10px] text-red-500 font-semibold block mt-1 text-right">{err.unitPrice}</span>}
                    </td>

                    {/* Discount */}
                    <td className="py-2.5 px-2 align-top text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.discount}
                        onChange={(e) => onChangeRow(row.id, 'discount', e.target.value)}
                        placeholder="0.00"
                        className={`w-full h-[36px] px-2 text-right border text-xs rounded-lg font-medium focus:outline-none focus:border-blue-500 ${err?.discount ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}
                      />
                      {err?.discount && <span className="text-[10px] text-red-500 font-semibold block mt-1 text-right">{err.discount}</span>}
                    </td>

                    {/* GST */}
                    <td className="py-2.5 px-2 align-top">
                      <div className="flex items-center gap-1.5 pt-1">
                        <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Toggle GST applicable">
                          <input
                            type="checkbox"
                            checked={row.isGstEnabled}
                            onChange={(e) => onChangeRow(row.id, 'isGstEnabled', e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="text-[10px] font-semibold text-slate-600">GST</span>
                        </label>
                        {row.isGstEnabled ? (
                          <select
                            value={row.gstRate}
                            onChange={(e) => onChangeRow(row.id, 'gstRate', e.target.value)}
                            className="h-[32px] px-1 border border-slate-200 rounded text-[11px] font-bold bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">None</span>
                        )}
                      </div>
                      {err?.gstRate && <span className="text-[10px] text-red-500 font-semibold block mt-1">{err.gstRate}</span>}
                    </td>

                    {/* Line Total */}
                    <td className="py-2.5 px-3 align-top text-right font-mono font-black text-slate-900 whitespace-nowrap">
                      <div className="pt-2 text-[13px]">
                        ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {gstAmount > 0 && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            (GST: ₹{gstAmount.toFixed(2)})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Remove Action */}
                    <td className="py-2.5 px-2 align-top text-center">
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={() => onRemoveRow(row.id)}
                          disabled={orderItems.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-20 disabled:hover:text-slate-400 disabled:hover:bg-transparent transition-all cursor-pointer"
                          title={orderItems.length <= 1 ? 'At least 1 item required' : 'Remove item'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-start pt-1">
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Product Row</span>
        </button>
      </div>
    </div>
  )
}

const OrderTransactionSummaryCard: React.FC<{
  summary: {
    totalCases: number
    subtotal: number
    totalDiscount: number
    totalTaxable: number
    totalGst: number
    grandTotal: number
    received: number
    pendingBalance: number
  }
}> = ({ summary }) => (
  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">TRANSACTION SUMMARY</div>
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Total Cases</span>
        <span className="font-extrabold text-slate-900 text-sm font-mono">{summary.totalCases}</span>
      </div>
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Subtotal (Gross)</span>
        <span className="font-bold text-slate-800 font-mono">₹{summary.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Total Discounts</span>
        <span className="font-bold text-rose-600 font-mono">₹{summary.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Taxable Amount</span>
        <span className="font-bold text-slate-800 font-mono">₹{summary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Total GST</span>
        <span className="font-bold text-slate-800 font-mono">₹{summary.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
      <div>
        <span className="text-[10px] text-blue-700 font-bold block">Grand Total</span>
        <span className="font-black text-blue-900 text-sm font-mono">₹{summary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
      <div>
        <span className="text-[10px] text-slate-400 block font-semibold">Pending Balance</span>
        <span className={`font-black text-sm font-mono ${summary.pendingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
          ₹{summary.pendingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  </div>
)

export const SalesPage: React.FC<{ canWrite: boolean; showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void }> = ({ canWrite, showToast }) => {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const isOwner = user?.roles?.some((r: string) => r.toLowerCase() === 'owner') || !canWrite

  const { data: ownerOverviewRes, isLoading: isOwnerOverviewLoading } = useQuery({
    queryKey: ['ownerSalesOverview'],
    queryFn: () => salesService.getOwnerOverview(),
    enabled: isOwner
  })

  const overview = ownerOverviewRes?.data

  // Table parameters
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [productIdFilter, setProductIdFilter] = useState('')
  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  // Parent-child Linked Transaction state
  const [parentDispatch, setParentDispatch] = useState<SalesTransaction | null>(null)

  // Dispatch History Drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyDispatch, setHistoryDispatch] = useState<SalesTransaction | null>(null)

  // Selected records (Full screen details layout when viewing)
  const [selectedTxn, setSelectedTxn] = useState<SalesTransaction | null>(null)
  const [isViewingDetails, setIsViewingDetails] = useState(false)

  // Dynamic Form State Variables
  const [formType, setFormType] = useState('Sales Dispatch')
  const [formProductId, setFormProductId] = useState('')
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formCases, setFormCases] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().substring(0, 10))
  const [formRef, setFormRef] = useState('')
  const [formRemarks, setFormRemarks] = useState('')

  // New ERP Form State Variables
  const [formUnitPrice, setFormUnitPrice] = useState('')
  const [formDiscount, setFormDiscount] = useState('')
  const [isGstEnabled, setIsGstEnabled] = useState(false)
  const [formGstRate, setFormGstRate] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('Cash')
  const [formPaymentTerms, setFormPaymentTerms] = useState('Immediate')
  const [formAmountReceived, setFormAmountReceived] = useState('')
  const [formBankAccountId, setFormBankAccountId] = useState('')
  const [formCashBookId, setFormCashBookId] = useState('')

  // Dynamic Multi-Product Order Items State
  const [orderItems, setOrderItems] = useState<SalesOrderItemRow[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, {
    productId?: string
    caseConfigId?: string
    cases?: string
    unitPrice?: string
    discount?: string
    gstRate?: string
    stock?: string
  }>>({})

  // Product-wise Customer Pricing & Quick Add State
  const [applicablePricing, setApplicablePricing] = useState<ApplicablePriceResponseDto | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState(false)
  const [isProductPricingModalOpen, setIsProductPricingModalOpen] = useState(false)
  const [pricingCustomer, setPricingCustomer] = useState<{ id: string; name: string; code?: string } | null>(null)

  // Invoice & Billing Engine State (BillAura-aligned)
  const [isInvoiceViewerOpen, setIsInvoiceViewerOpen] = useState(false)
  const [invoiceModalTxn, setInvoiceModalTxn] = useState<SalesTransaction | null>(null)
  const [formInvoiceType, setFormInvoiceType] = useState<'B2B' | 'B2C'>('B2B')
  const [formBillType, setFormBillType] = useState<'Tax Invoice' | 'Bill of Supply'>('Tax Invoice')

  // Return specific fields
  const [formOriginalInvoice, setFormOriginalInvoice] = useState('')
  const [formReturnReason, setFormReturnReason] = useState('')
  const [formReturnCondition, setFormReturnCondition] = useState('Good — Restock')
  const [formRefundMethod, setFormRefundMethod] = useState('Credit Note')

  // Case Configuration & Settlement State
  const [formCaseConfigId, setFormCaseConfigId] = useState('')
  const [isQuickCreateConfigOpen, setIsQuickCreateConfigOpen] = useState(false)
  const [formSettlementMethod, setFormSettlementMethod] = useState('Deduct from Customer Credit')
  const [formRefundType, setFormRefundType] = useState('Cash')

  // Damage specific fields
  const [formWarehouse, setFormWarehouse] = useState('Main Warehouse')
  const [formDamageType, setFormDamageType] = useState('Broken')
  const [formApprovedBy, setFormApprovedBy] = useState('')

  // Consumption specific fields
  const [formDepartment, setFormDepartment] = useState('')
  const [formPurpose, setFormPurpose] = useState('')

  // Free Sample specific fields
  const [formMarketingCampaign, setFormMarketingCampaign] = useState('')
  const [formSalesPerson, setFormSalesPerson] = useState('')

  // Stock Adjustment specific fields
  const [formAdjustmentReason, setFormAdjustmentReason] = useState('Correction')
  const [formAdjustmentMode, setFormAdjustmentMode] = useState('Increase')

  // Searchable customer dropdown UI state
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false)
  const [showDetailedAccounting, setShowDetailedAccounting] = useState(false)

  // Queries
  const { data: txnsData, isLoading: isTxnsLoading } = useQuery({
    queryKey: ['salesTransactionsList', page, search, productIdFilter, customerIdFilter, typeFilter, statusFilter, startDateFilter, endDateFilter, sortOrder],
    queryFn: () => salesService.getTransactions(
      page, 10, search, productIdFilter, customerIdFilter, typeFilter, statusFilter, startDateFilter, endDateFilter, sortOrder
    )
  })

  const transactions = txnsData?.data?.items || []
  const pagination = txnsData?.data

  // Fetch all active products
  const { data: productsData } = useQuery({
    queryKey: ['activeProductsForSales'],
    queryFn: async () => {
      const res = await productsService.getProducts(1, 100, '')
      return res.data?.items.filter(p => p.isActive) || []
    }
  })
  const products = productsData || []

  // Fetch Case Configurations master
  const { data: caseConfigsData, refetch: refetchCaseConfigs } = useQuery({
    queryKey: ['caseConfigurationsForSales'],
    queryFn: async () => {
      const res = await caseConfigurationsService.getAll(false)
      return res.data || []
    }
  })
  const caseConfigs = caseConfigsData || []

  const handleQuickCreateConfigSuccess = async (created: CaseConfiguration) => {
    await refetchCaseConfigs()
    if (created.productId === formProductId) {
      setFormCaseConfigId(created.id)
    }
  }

  // Filter available case configurations for selected product
  const availableCaseConfigsForSelectedProduct = useMemo(() => {
    if (!formProductId) return []
    return caseConfigs.filter(c => c.productId === formProductId && c.isActive)
  }, [caseConfigs, formProductId])

  const selectedCaseConfigInForm = useMemo(() => {
    if (availableCaseConfigsForSelectedProduct.length === 0) return null
    return availableCaseConfigsForSelectedProduct.find(c => c.id === formCaseConfigId) || availableCaseConfigsForSelectedProduct[0]
  }, [availableCaseConfigsForSelectedProduct, formCaseConfigId])

  const activeUnitsPerCase = selectedCaseConfigInForm ? selectedCaseConfigInForm.unitsPerCase : 24

  const handleProductChangeInForm = (prodId: string) => {
    setFormProductId(prodId)
    const matchingConfigs = caseConfigs.filter(c => c.productId === prodId && c.isActive)
    if (matchingConfigs.length > 0) {
      setFormCaseConfigId(matchingConfigs[0].id)
    } else {
      setFormCaseConfigId('')
    }
  }

  // Fetch all active customers
  const { data: customersData, refetch: refetchCustomers } = useQuery({
    queryKey: ['activeCustomersForSales'],
    queryFn: async () => {
      const res = await customersService.getCustomers(1, 100, '', '', 'Active')
      const items = res.data?.items || []
      return items.filter(c => (c.status ? c.status === 'Active' : c.isActive))
    },
    retry: 2,
    staleTime: 30000
  })
  const customers = customersData || []

  // Fetch Bank Accounts and Cash Books
  const { data: bankAccounts } = useQuery({
    queryKey: ['bankAccountsDropdown'],
    queryFn: () => simpleAccountsService.getBankAccountDropdown()
  })
  const banks = bankAccounts || []

  const { data: cashBooks } = useQuery({
    queryKey: ['cashBooksDropdown'],
    queryFn: () => simpleAccountsService.getCashBookDropdown()
  })
  const cashRegisters = cashBooks || []

  // Fetch Company Settings for PDF details
  const { data: companySettings } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const res = await api.get('/api/v1/company/settings')
      return res.data?.data
    }
  })

  // Fetch Dispatch History for Drawer
  const { data: historyRes, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['dispatchHistory', historyDispatch?.id],
    queryFn: () => historyDispatch ? salesService.getDispatchHistory(historyDispatch.id) : null,
    enabled: !!historyDispatch
  })

  const [isTimelineOldestFirst, setIsTimelineOldestFirst] = useState(true)

  // Fetch detailed chronological lifecycle audit trail for the selected transaction
  const {
    data: txnTimelineRes,
    isLoading: isTxnTimelineLoading,
    isError: isTxnTimelineError,
    refetch: refetchTxnTimeline,
    isFetching: isTxnTimelineFetching
  } = useQuery({
    queryKey: ['salesTransactionTimeline', selectedTxn?.id],
    queryFn: () => selectedTxn ? salesService.getTransactionTimeline(selectedTxn.id) : null,
    enabled: isViewingDetails && !!selectedTxn?.id
  })

  const rawTimelineEvents = txnTimelineRes?.data || []

  const sortedTimelineEvents = useMemo(() => {
    return [...rawTimelineEvents].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime()
      const timeB = new Date(b.timestamp).getTime()
      return isTimelineOldestFirst ? timeA - timeB : timeB - timeA
    })
  }, [rawTimelineEvents, isTimelineOldestFirst])

  const sortedHistoryItems = useMemo(() => {
    if (!historyRes?.data?.history) return []
    return [...historyRes.data.history].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.date).getTime()
      const timeB = new Date(b.createdAt || b.date).getTime()
      return timeB - timeA
    })
  }, [historyRes?.data?.history])

  // Fetch Parent Dispatch History stats for modal validation
  const { data: parentHistoryRes } = useQuery({
    queryKey: ['dispatchHistoryForModal', parentDispatch?.id],
    queryFn: () => parentDispatch ? salesService.getDispatchHistory(parentDispatch.id) : null,
    enabled: !!parentDispatch
  })

  const parentHistoryInfo = parentHistoryRes?.data?.parentDispatch
  const availableRemainingCases = parentHistoryInfo ? parentHistoryInfo.remainingCases : (parentDispatch ? Math.abs(parentDispatch.cases) : 0)

  // Fetch payment records for selected transaction in detail view
  const {
    data: txnPaymentsRes,
    refetch: refetchTxnPayments
  } = useQuery({
    queryKey: ['salesTransactionPayments', selectedTxn?.id],
    queryFn: () => selectedTxn ? salesService.getPayments(selectedTxn.id) : null,
    enabled: isViewingDetails && !!selectedTxn?.id
  })
  const txnPayments = txnPaymentsRes?.data || []

  // Collect Payment Modal State
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false)
  const [collectTxn, setCollectTxn] = useState<SalesTransaction | null>(null)
  const [collectAmount, setCollectAmount] = useState<number | ''>('')
  const [collectPaymentMethod, setCollectPaymentMethod] = useState('Cash')
  const [collectBankAccountId, setCollectBankAccountId] = useState('')
  const [collectCashBookId, setCollectCashBookId] = useState('')
  const [collectRef, setCollectRef] = useState('')
  const [collectNotes, setCollectNotes] = useState('')
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().split('T')[0])

  const handleOpenCollectModal = (txn: SalesTransaction) => {
    if (!canWrite) {
      showToast('You do not have permission to collect payments.', 'warning')
      return
    }
    const currentOutstanding = txn.outstandingAmount !== undefined && txn.outstandingAmount > 0
      ? txn.outstandingAmount
      : Math.max(0, (txn.totalAmount || 0) - (txn.amountReceived || 0))

    if (currentOutstanding <= 0) {
      showToast('This transaction has already been fully paid.', 'info')
      return
    }

    setCollectTxn(txn)
    setCollectAmount(currentOutstanding)
    setCollectPaymentMethod('Cash')
    if (cashRegisters.length > 0) {
      setCollectCashBookId(cashRegisters[0].id)
    }
    if (banks.length > 0) {
      setCollectBankAccountId(banks[0].id)
    }
    setCollectRef('')
    setCollectNotes('')
    setCollectDate(new Date().toISOString().split('T')[0])
    setIsCollectModalOpen(true)
  }

  const collectPaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CollectSalesPaymentRequest }) =>
      salesService.collectPayment({ id, data }),
    onSuccess: (res, variables) => {
      showToast(`₹${variables.data.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} collected successfully.`, 'success')
      setIsCollectModalOpen(false)
      setCollectTxn(null)

      if (selectedTxn && selectedTxn.id === variables.id && res.data) {
        setSelectedTxn(res.data)
      }

      queryClient.invalidateQueries({ queryKey: ['salesTransactionsList'] })
      queryClient.invalidateQueries({ queryKey: ['salesTransactionTimeline', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['salesTransactionPayments', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['salesDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['activeCustomersForSales'] })
      queryClient.invalidateQueries({ queryKey: ['bankAccountsDropdown'] })
      queryClient.invalidateQueries({ queryKey: ['cashBooksDropdown'] })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to collect payment.'
      showToast(msg, 'error')
    }
  })

  const handleConfirmCollect = (e: React.FormEvent) => {
    e.preventDefault()
    if (!collectTxn) return

    const numAmount = typeof collectAmount === 'number' ? collectAmount : parseFloat(collectAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Collection amount must be greater than zero.', 'error')
      return
    }

    const currentOutstanding = collectTxn.outstandingAmount !== undefined && collectTxn.outstandingAmount > 0
      ? collectTxn.outstandingAmount
      : Math.max(0, (collectTxn.totalAmount || 0) - (collectTxn.amountReceived || 0))

    if (numAmount > currentOutstanding + 0.001) {
      showToast(`Collection amount cannot exceed the outstanding balance of ₹${currentOutstanding.toFixed(2)}.`, 'error')
      return
    }

    collectPaymentMutation.mutate({
      id: collectTxn.id,
      data: {
        amount: numAmount,
        paymentMethod: collectPaymentMethod,
        bankAccountId: ['Bank', 'BankAccount', 'UPI', 'Cheque'].includes(collectPaymentMethod) ? collectBankAccountId || null : null,
        cashBookId: collectPaymentMethod === 'Cash' ? collectCashBookId || null : null,
        referenceNumber: collectRef.trim() || undefined,
        notes: collectNotes.trim() || undefined,
        paymentDate: collectDate ? new Date(collectDate).toISOString() : new Date().toISOString()
      }
    })
  }

  // Quick Customer Creation inline modal
  const handleQuickCreateCustomer = () => {
    if (!canWrite) {
      showToast('You do not have write permissions.', 'warning')
      return
    }
    setIsQuickAddCustomerOpen(true)
  }

  const handleQuickCustomerSuccess = (created: any) => {
    refetchCustomers()
    setFormCustomerId(created.id)
    setCustomerSearch(created.customerName)
    if (created.paymentTerms) {
      setFormPaymentTerms(created.paymentTerms)
    }
    showToast(`Customer "${created.customerName}" created and selected!`, 'success')
  }

  // Restore state after customer creation (legacy support)
  useEffect(() => {
    if (location.state?.fromCustomerCreation) {
      const { salesForm, newCreatedCustomerId } = location.state
      if (salesForm) {
        if (salesForm.formType !== undefined) setFormType(salesForm.formType)
        if (salesForm.formProductId !== undefined) setFormProductId(salesForm.formProductId)
        if (salesForm.formCases !== undefined) setFormCases(salesForm.formCases)
        if (salesForm.formDate !== undefined) setFormDate(salesForm.formDate)
        if (salesForm.formRef !== undefined) setFormRef(salesForm.formRef)
        if (salesForm.formRemarks !== undefined) setFormRemarks(salesForm.formRemarks)
        if (salesForm.isCreateOpen) setIsCreateOpen(true)
      }

      navigate(location.pathname, { replace: true, state: {} })
      queryClient.invalidateQueries({ queryKey: ['activeCustomersForSales'] })
      refetchCustomers().then((res) => {
        const fetched = res.data || []
        const createdCustomer = fetched.find(c => c.id === newCreatedCustomerId)
        if (createdCustomer) {
          setFormCustomerId(createdCustomer.id)
          setCustomerSearch(createdCustomer.customerName)
          if (createdCustomer.paymentTerms) setFormPaymentTerms(createdCustomer.paymentTerms)
        }
      })
    }
  }, [location.state])

  // Computed properties
  const selectedProductInForm = useMemo(() => {
    return products.find(p => p.id === formProductId)
  }, [products, formProductId])

  // A product may carry an explicitly configured rate. Products without one remain at
  // 0% until the user makes a choice; dispatches never inherit an implicit 18% rate.
  useEffect(() => {
    if (selectedProductInForm?.gstRate !== undefined && selectedProductInForm?.gstRate !== null) {
      setFormGstRate(String(selectedProductInForm.gstRate))
    }
  }, [formProductId, selectedProductInForm?.gstRate])

  // Resolve applicable price (Negotiated Customer Price -> 20L Rate Rule -> Product Catalog Fallback)
  useEffect(() => {
    let isCancelled = false
    if (formCustomerId && formProductId && formType === 'Sales Dispatch') {
      setIsLoadingPrice(true)
      customersService.getApplicablePrice(formCustomerId, formProductId)
        .then(res => {
          if (!isCancelled && res) {
            setApplicablePricing(res)
            const price = res.applicablePrice ?? res.unitPrice ?? (selectedProductInForm?.sellingPrice || 0)
            setFormUnitPrice(price.toString())
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setApplicablePricing(null)
            if (selectedProductInForm && selectedProductInForm.sellingPrice !== undefined) {
              setFormUnitPrice(selectedProductInForm.sellingPrice.toString())
            }
          }
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingPrice(false)
        })
    } else if (selectedProductInForm && selectedProductInForm.sellingPrice !== undefined) {
      setApplicablePricing(null)
      setFormUnitPrice(selectedProductInForm.sellingPrice.toString())
    } else {
      setApplicablePricing(null)
    }

    return () => { isCancelled = true }
  }, [formCustomerId, formProductId, formType, selectedProductInForm])

  const selectedCustomerInForm = useMemo(() => {
    return customers.find(c => c.id === formCustomerId)
  }, [customers, formCustomerId])

  const filteredCustomersForForm = useMemo(() => {
    if (!customerSearch) return customers
    const s = customerSearch.toLowerCase()
    return customers.filter(c =>
      c.customerName.toLowerCase().includes(s) ||
      c.customerCode.toLowerCase().includes(s)
    )
  }, [customers, customerSearch])

  // Order Items Row Management
  const handleAddRow = () => {
    const usedProductIds = new Set(orderItems.map(r => r.productId))
    const unusedProduct = products.find(p => !usedProductIds.has(p.id)) || (products.length > 0 ? products[0] : null)
    const prodId = unusedProduct ? unusedProduct.id : ''
    const matchingConfigs = prodId ? caseConfigs.filter(c => c.productId === prodId && c.isActive) : []

    const newRow: SalesOrderItemRow = {
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: prodId,
      caseConfigId: matchingConfigs.length > 0 ? matchingConfigs[0].id : '',
      cases: '',
      unitPrice: unusedProduct?.sellingPrice !== undefined ? unusedProduct.sellingPrice.toString() : '',
      discount: '',
      isGstEnabled: (unusedProduct?.gstRate ?? 0) > 0,
      gstRate: unusedProduct?.gstRate ? String(unusedProduct.gstRate) : ''
    }

    if (formCustomerId && prodId) {
      customersService.getApplicablePrice(formCustomerId, prodId)
        .then(res => {
          if (res) {
            const p = res.applicablePrice ?? res.unitPrice
            if (p !== undefined && p !== null) {
              setOrderItems(curr => curr.map(r => r.id === newRow.id ? { ...r, unitPrice: p.toString() } : r))
            }
          }
        })
        .catch(() => {})
    }

    setOrderItems(prev => [...prev, newRow])
  }

  const handleRemoveRow = (rowId: string) => {
    if (orderItems.length <= 1) {
      showToast('At least one product item is required in the dispatch.', 'info')
      return
    }
    setOrderItems(prev => prev.filter(r => r.id !== rowId))
    setRowErrors(prev => {
      const copy = { ...prev }
      delete copy[rowId]
      return copy
    })
  }

  const handleRowChange = (rowId: string, field: keyof SalesOrderItemRow, value: any) => {
    setOrderItems(prev => prev.map(row => {
      if (row.id !== rowId) return row

      const updated = { ...row, [field]: value }
      if (field === 'productId') {
        const prod = products.find(p => p.id === value)
        const matchingConfigs = caseConfigs.filter(c => c.productId === value && c.isActive)
        updated.caseConfigId = matchingConfigs.length > 0 ? matchingConfigs[0].id : ''
        updated.unitPrice = prod?.sellingPrice !== undefined ? prod.sellingPrice.toString() : ''
        const hasGst = (prod?.gstRate ?? 0) > 0
        updated.isGstEnabled = hasGst
        updated.gstRate = prod?.gstRate ? String(prod.gstRate) : ''

        if (formCustomerId && value) {
          customersService.getApplicablePrice(formCustomerId, value)
            .then(res => {
              if (res) {
                const p = res.applicablePrice ?? res.unitPrice
                if (p !== undefined && p !== null) {
                  setOrderItems(curr => curr.map(r => r.id === rowId && r.productId === value ? { ...r, unitPrice: p.toString() } : r))
                }
              }
            })
            .catch(() => {})
        }
      }
      return updated
    }))

    setRowErrors(prev => {
      if (!prev[rowId]) return prev
      const copy = { ...prev[rowId] }
      delete (copy as any)[field]
      delete copy.stock
      return { ...prev, [rowId]: copy }
    })
  }

  const handleCustomerSelect = (customerId: string) => {
    setFormCustomerId(customerId)
    const found = customers.find(c => c.id === customerId)
    if (found) {
      setCustomerSearch(found.customerName)
      // Auto-detect B2B / B2C and Tax Invoice alignment
      if (found.gstNumber || found.customerType === 'B2B' || found.customerCode?.startsWith('B2B')) {
        setFormInvoiceType('B2B')
        setFormBillType('Tax Invoice')
      } else {
        setFormInvoiceType('B2C')
      }
      if (found.paymentTerms) {
        setFormPaymentTerms(found.paymentTerms)
        if (found.paymentTerms === 'COD' && formPaymentMethod === 'Credit') {
          setFormPaymentMethod('Cash')
          setFormAmountReceived('0')
        } else if (found.paymentTerms === 'Credit' || found.paymentTerms.startsWith('Net')) {
          setFormPaymentMethod('Credit')
          setFormAmountReceived('0')
        }
      }
    }

    if (customerId) {
      orderItems.forEach(item => {
        if (item.productId) {
          customersService.getApplicablePrice(customerId, item.productId)
            .then(res => {
              if (res) {
                const p = res.applicablePrice ?? res.unitPrice
                if (p !== undefined && p !== null) {
                  setOrderItems(curr => curr.map(r => r.id === item.id ? { ...r, unitPrice: p.toString() } : r))
                }
              }
            })
            .catch(() => {})
        }
      })
    }
  }

  // Memoized consolidated order calculations across all line items
  const orderSummary = useMemo(() => {
    let totalCases = 0
    let subtotal = 0
    let totalDiscount = 0
    let totalTaxable = 0
    let totalGst = 0
    let grandTotal = 0

    const lines = orderItems.map(row => {
      const cases = parseFloat(row.cases) || 0
      const price = parseFloat(row.unitPrice) || 0
      const discount = parseFloat(row.discount) || 0
      const gross = cases * price
      const taxable = Math.max(0, gross - discount)
      const rate = row.isGstEnabled ? (parseFloat(row.gstRate) || 0) : 0
      const gst = Math.round((taxable * rate / 100) * 100) / 100
      const lineTotal = Math.round((taxable + gst) * 100) / 100

      totalCases += cases
      subtotal += gross
      totalDiscount += discount
      totalTaxable += taxable
      totalGst += gst
      grandTotal += lineTotal

      return {
        ...row,
        casesNum: cases,
        priceNum: price,
        discountNum: discount,
        gross,
        taxable,
        rate,
        gst,
        lineTotal
      }
    })

    grandTotal = Math.round(grandTotal * 100) / 100
    const received = formAmountReceived !== '' ? (parseFloat(formAmountReceived) || 0) : 0
    const pendingBalance = Math.max(0, Math.round((grandTotal - received) * 100) / 100)

    return {
      lines,
      totalCases,
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalGst: Math.round(totalGst * 100) / 100,
      grandTotal,
      received,
      pendingBalance
    }
  }, [orderItems, formAmountReceived])

  // Live Accounting preview calculations
  const accountingImpactPreview = useMemo(() => {
    if (formType === 'Sales Dispatch') {
      if (orderItems.length === 0 || orderSummary.totalCases <= 0) return []

      let debitAccount = 'Accounts Receivable'
      if (formPaymentMethod === 'Cash') debitAccount = 'Cash'
      else if (['Bank', 'UPI', 'Cheque'].includes(formPaymentMethod)) debitAccount = 'Bank Account'

      const lines: { type: string; account: string; amount: number }[] = [
        { type: 'Debit', account: debitAccount, amount: orderSummary.grandTotal },
        { type: 'Credit', account: 'Sales Revenue', amount: orderSummary.totalTaxable }
      ]

      if (orderSummary.totalGst > 0) {
        const halfTax = Math.round((orderSummary.totalGst / 2) * 100) / 100
        lines.push({ type: 'Credit', account: 'CGST Output Tax', amount: halfTax })
        lines.push({ type: 'Credit', account: 'SGST Output Tax', amount: Math.round((orderSummary.totalGst - halfTax) * 100) / 100 })
      }

      let totalCost = 0
      for (const item of orderItems) {
        const p = products.find(prod => prod.id === item.productId)
        const costPrice = p?.costPrice || p?.unitCost || 0
        const cases = parseFloat(item.cases) || 0
        totalCost += cases * costPrice
      }
      if (totalCost > 0) {
        lines.push({ type: 'Debit', account: 'Cost of Goods Sold', amount: Math.round(totalCost * 100) / 100 })
        lines.push({ type: 'Credit', account: 'Finished Goods Inventory', amount: Math.round(totalCost * 100) / 100 })
      }

      return lines
    }

    if (!selectedProductInForm || !formCases) return []
    const cases = parseFloat(formCases) || 0
    if (cases <= 0 && formType !== 'Stock Adjustment') return []

    const costPrice = selectedProductInForm.costPrice || 0
    const sellingPrice = parseFloat(formUnitPrice) || selectedProductInForm.sellingPrice || 0
    const discount = parseFloat(formDiscount) || 0

    const subtotal = cases * sellingPrice - discount
    let cgst = 0, sgst = 0, igst = 0
    if (isGstEnabled) {
      const gstRate = Math.max(0, parseFloat(formGstRate) || 0)
      cgst = subtotal * (gstRate / 200)
      sgst = subtotal * (gstRate / 200)
    }
    const taxAmount = cgst + sgst + igst
    const grandTotal = subtotal + taxAmount
    const costValue = Math.abs(cases) * costPrice

    if (formType === 'Customer Return') {
      let creditAccount = 'Accounts Receivable'
      if (formRefundMethod === 'Cash') creditAccount = 'Cash'
      else if (formRefundMethod === 'Bank') creditAccount = 'Bank Account'

      return [
        { type: 'Debit', account: 'Sales Return', amount: grandTotal },
        { type: 'Credit', account: creditAccount, amount: grandTotal },
        ...(costValue > 0 ? [
          { type: 'Debit', account: 'Finished Goods Inventory', amount: costValue },
          { type: 'Credit', account: 'Cost of Goods Sold', amount: costValue }
        ] : [])
      ]
    } else if (formType === 'Damage' || formType === 'Damaged Goods') {
      return [
        { type: 'Debit', account: 'Inventory Loss Expense', amount: costValue },
        { type: 'Credit', account: 'Finished Goods Inventory', amount: costValue }
      ]
    } else if (formType === 'Internal Consumption') {
      return [
        { type: 'Debit', account: 'Office Expense', amount: costValue },
        { type: 'Credit', account: 'Finished Goods Inventory', amount: costValue }
      ]
    } else if (formType === 'Free Sample') {
      return [
        { type: 'Debit', account: 'Marketing Expense', amount: costValue },
        { type: 'Credit', account: 'Finished Goods Inventory', amount: costValue }
      ]
    } else if (formType === 'Stock Adjustment') {
      const isIncrease = formAdjustmentMode === 'Increase'
      return [
        { type: isIncrease ? 'Debit' : 'Debit', account: isIncrease ? 'Finished Goods Inventory' : 'Inventory Adjustment Loss', amount: costValue },
        { type: isIncrease ? 'Credit' : 'Credit', account: isIncrease ? 'Inventory Adjustment Gain' : 'Finished Goods Inventory', amount: costValue }
      ]
    }
    return []
  }, [formType, orderItems, orderSummary, formPaymentMethod, products, selectedProductInForm, formCases, formUnitPrice, formDiscount, isGstEnabled, formGstRate, formRefundMethod, formAdjustmentMode])

  // PDF Exporter
  const handleDownloadPDF = (txn: SalesTransaction) => {
    const compName = companySettings?.displayName || companySettings?.name || user?.companyName || 'Aiwa Minerals'
    const compGst = companySettings?.gstNumber || '29AABCA1234F1Z8'
    const compAddr = companySettings?.address || 'Hoodi, KR puram, bengaluru, india'

    const total = txn.totalAmount || (txn.cases * (txn.unitPrice || 0))
    const tax = txn.taxAmount || 0
    const sub = total - tax

    const pdfItems = (txn.items && txn.items.length > 0)
      ? txn.items.map((it, idx) => ({
          sno: idx + 1,
          description: `${it.productName || 'Product'}${it.caseConfigurationName ? ` (${it.caseConfigurationName})` : ''} (SKU: ${it.productSku || 'N/A'})`,
          quantity: Math.abs(it.cases),
          unitPrice: it.unitPrice || 0,
          amount: it.lineTotal ?? it.totalAmount ?? (Math.abs(it.cases) * (it.unitPrice || 0))
        }))
      : [
          {
            sno: 1,
            description: `${txn.productName} (SKU: ${txn.productSku || 'N/A'})`,
            quantity: Math.abs(txn.cases),
            unitPrice: txn.unitPrice || 0,
            amount: total
          }
        ]

    const pdf = generateERPDocumentPDF({
      title: `${txn.transactionType.toUpperCase()} TRANSACTION REGISTER`,
      docNumber: txn.transactionNumber,
      date: new Date(txn.transactionDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
      companyInfo: {
        name: compName,
        displayName: compName,
        gstNumber: compGst,
        address: compAddr,
        email: user?.email || 'accounts@tenant.com'
      },
      partyLabel: 'Business Connection / Customer',
      partyInfo: {
        name: txn.customerName || 'System Internal Ledger',
        details1: txn.customerCode ? `Code: ${txn.customerCode}` : 'Internal Consumption / Physical Correction',
        details2: txn.referenceNumber ? `Ref: ${txn.referenceNumber}` : undefined
      },
      preparedBy: txn.createdByName || 'ERP Core Integration',
      paymentDetails: {
        method: txn.paymentMethod || 'Credit',
        reference: txn.referenceNumber || undefined,
        status: txn.paymentStatus || undefined
      },
      items: pdfItems,
      financialSummary: {
        subTotal: sub,
        taxAmount: tax,
        discountAmount: txn.discountAmount || 0,
        grandTotal: total,
        amountPaid: txn.amountReceived || 0,
        balance: txn.outstandingAmount || 0
      },
      notes: 'Generated by Aquzio ERP system. All postings remain locked under tenant cryptographic ledgers.',
      remarks: txn.remarks || undefined
    })

    pdf.save(`Invoice_${txn.transactionNumber}.pdf`)
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: salesService.createTransaction,
    onSuccess: (res) => {
      if (res.success) {
        showToast('Sales transaction recorded and general ledger posted.', 'success')
        queryClient.invalidateQueries({ queryKey: ['salesTransactionsList'] })
        queryClient.invalidateQueries({ queryKey: ['salesDashboard'] })
        queryClient.invalidateQueries({ queryKey: ['activeProductsForSales'] })
        setIsCreateOpen(false)
        resetForm()
      } else {
        showToast(res.message || 'Failed to create transaction.', 'error')
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Error recording transaction.', 'error')
    }
  })

  const updateMutation = useMutation({
    mutationFn: salesService.updateTransaction,
    onSuccess: (res) => {
      if (res.success) {
        showToast('Sales transaction updated, ledger balances recalculated.', 'success')
        queryClient.invalidateQueries({ queryKey: ['salesTransactionsList'] })
        queryClient.invalidateQueries({ queryKey: ['salesDashboard'] })
        queryClient.invalidateQueries({ queryKey: ['activeProductsForSales'] })
        setIsEditOpen(false)
        resetForm()
        if (selectedTxn && selectedTxn.id === res.data.id) {
          setSelectedTxn(res.data)
        }
      } else {
        showToast(res.message || 'Failed to update transaction.', 'error')
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Error updating transaction.', 'error')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: salesService.deleteTransaction,
    onSuccess: (res) => {
      if (res.success) {
        showToast('Transaction successfully reversed and ledger accounts adjusted.', 'success')
        queryClient.invalidateQueries({ queryKey: ['salesTransactionsList'] })
        queryClient.invalidateQueries({ queryKey: ['salesDashboard'] })
        queryClient.invalidateQueries({ queryKey: ['activeProductsForSales'] })
        setIsDeleteOpen(false)
        setIsViewingDetails(false)
        setSelectedTxn(null)
      } else {
        showToast(res.message || 'Failed to reverse transaction.', 'error')
      }
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Error deleting transaction.', 'error')
    }
  })

  // Handlers
  const resetForm = () => {
    setFormType('Sales Dispatch')
    setFormProductId('')
    setFormCaseConfigId('')
    setFormCustomerId('')
    setFormCases('')
    setFormDate(new Date().toISOString().substring(0, 10))
    setFormRef('')
    setFormRemarks('')
    setCustomerSearch('')
    setFormUnitPrice('')
    setFormDiscount('')
    setIsGstEnabled(false)
    setFormGstRate('')
    setFormPaymentMethod('Credit')
    setFormPaymentTerms('Immediate')
    setFormAmountReceived('')
    setApplicablePricing(null)
    setFormBankAccountId('')
    setFormCashBookId('')
    setFormInvoiceType('B2B')
    setFormBillType('Tax Invoice')
    setFormOriginalInvoice('')
    setFormReturnReason('')
    setFormReturnCondition('Good — Restock')
    setFormRefundMethod('Credit Note')
    setFormSettlementMethod('Deduct from Customer Credit')
    setFormRefundType('Cash')
    setFormWarehouse('Main Warehouse')
    setFormDamageType('Broken')
    setFormApprovedBy('')
    setFormDepartment('')
    setFormPurpose('')
    setFormMarketingCampaign('')
    setFormSalesPerson('')
    setFormAdjustmentReason('Correction')
    setFormAdjustmentMode('Increase')
    setOrderItems([])
    setRowErrors({})
  }

  const handleOpenCreate = () => {
    if (!canWrite) {
      showToast('You do not have write permissions.', 'warning')
      return
    }
    setParentDispatch(null)
    setFormType('Sales Dispatch')
    resetForm()
    const firstProd = products.length > 0 ? products[0] : null
    const firstProdId = firstProd ? firstProd.id : ''
    const matchingConfigs = firstProdId ? caseConfigs.filter(c => c.productId === firstProdId && c.isActive) : []

    setOrderItems([{
      id: `row_${Date.now()}`,
      productId: firstProdId,
      caseConfigId: matchingConfigs.length > 0 ? matchingConfigs[0].id : '',
      cases: '',
      unitPrice: firstProd?.sellingPrice !== undefined ? firstProd.sellingPrice.toString() : '',
      discount: '',
      isGstEnabled: (firstProd?.gstRate ?? 0) > 0,
      gstRate: firstProd?.gstRate ? String(firstProd.gstRate) : ''
    }])
    setRowErrors({})
    setIsCreateOpen(true)
  }

  const handleOpenLinkedReturnDamage = (dispatch: SalesTransaction) => {
    if (!canWrite) {
      showToast('You do not have write permissions.', 'warning')
      return
    }
    setParentDispatch(dispatch)
    setFormType('Customer Return')
    setFormProductId(dispatch.productId)
    setFormCustomerId(dispatch.customerId)
    const matchedCustomer = customers.find(c => c.id === dispatch.customerId)
    setCustomerSearch(matchedCustomer ? matchedCustomer.customerName : dispatch.customerName || '')
    setFormUnitPrice(dispatch.unitPrice?.toString() || '0')
    setFormCases('')
    setFormRemarks('')
    setFormReturnReason('')
    setFormReturnCondition('Good — Restock')
    setFormSettlementMethod('Deduct from Customer Credit')

    if (dispatch.metadataJson) {
      try {
        const meta = JSON.parse(dispatch.metadataJson)
        if (meta.caseConfigurationId) {
          setFormCaseConfigId(meta.caseConfigurationId)
        }
      } catch {}
    }

    setIsCreateOpen(true)
  }

  const handleOpenHistory = (dispatch: SalesTransaction) => {
    setHistoryDispatch(dispatch)
    setIsHistoryOpen(true)
  }

  const handleOpenView = async (txn: SalesTransaction) => {
    try {
      const res = await salesService.getTransaction(txn.id)
      if (res.data) {
        setSelectedTxn(res.data)
        setIsViewingDetails(true)
        return
      }
    } catch {}
    setSelectedTxn(txn)
    setIsViewingDetails(true)
  }

  const handleOpenParentDispatch = async (childTxn: SalesTransaction) => {
    if (!childTxn.parentTransactionId) return
    try {
      const res = await salesService.getTransaction(childTxn.parentTransactionId)
      if (res.data) {
        setSelectedTxn(res.data)
        setIsViewingDetails(true)
      }
    } catch {
      showToast('Could not load parent dispatch details.', 'error')
    }
  }

  const handleOpenHistoryItemView = async (itemId: string) => {
    try {
      const res = await salesService.getTransaction(itemId)
      if (res.data) {
        setSelectedTxn(res.data)
        setIsViewingDetails(true)
        setIsHistoryOpen(false)
      }
    } catch {
      showToast('Failed to load transaction details.', 'error')
    }
  }

  const handleOpenEdit = async (txn: SalesTransaction) => {
    if (!canWrite) {
      showToast('You do not have write permissions.', 'warning')
      return
    }
    let currentTxn = txn
    try {
      const res = await salesService.getTransaction(txn.id)
      if (res.data) currentTxn = res.data
    } catch {}

    setSelectedTxn(currentTxn)
    setFormType(currentTxn.transactionType)
    setFormProductId(currentTxn.productId)
    setFormCustomerId(currentTxn.customerId)
    setFormCases(Math.abs(currentTxn.cases).toString())
    setFormDate(currentTxn.transactionDate.substring(0, 10))
    setFormRef(currentTxn.referenceNumber || '')
    setFormRemarks(currentTxn.remarks || '')

    const matchedCustomer = customers.find(c => c.id === currentTxn.customerId)
    setCustomerSearch(matchedCustomer ? matchedCustomer.customerName : '')

    // ERP specific state restorations
    setFormUnitPrice(currentTxn.unitPrice?.toString() || '')
    setFormDiscount(currentTxn.discountAmount?.toString() || '')
    setIsGstEnabled(currentTxn.isGstApplicable ?? (currentTxn.taxAmount || 0) > 0)
    setFormGstRate((currentTxn.gstRate ?? 0).toString())
    setFormPaymentMethod(currentTxn.paymentMethod || 'Credit')
    setFormPaymentTerms(currentTxn.paymentTerms || 'Immediate')
    setFormAmountReceived(currentTxn.amountReceived !== undefined ? currentTxn.amountReceived.toString() : '')
    setFormBankAccountId(currentTxn.bankAccountId || '')
    setFormCashBookId(currentTxn.cashBookId || '')

    if (currentTxn.items && currentTxn.items.length > 0) {
      setOrderItems(currentTxn.items.map(it => ({
        id: it.id || `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        productId: it.productId,
        caseConfigId: it.caseConfigurationId || '',
        cases: Math.abs(it.cases).toString(),
        unitPrice: (it.unitPrice || 0).toString(),
        discount: (it.discountAmount || 0).toString(),
        isGstEnabled: it.isGstApplicable ?? ((it.gstRate || 0) > 0),
        gstRate: (it.gstRate || 0).toString()
      })))
    } else {
      setOrderItems([{
        id: `row_${Date.now()}`,
        productId: currentTxn.productId,
        caseConfigId: (currentTxn.metadataJson ? (JSON.parse(currentTxn.metadataJson).caseConfigurationId || '') : ''),
        cases: Math.abs(currentTxn.cases).toString(),
        unitPrice: (currentTxn.unitPrice || 0).toString(),
        discount: (currentTxn.discountAmount || 0).toString(),
        isGstEnabled: currentTxn.isGstApplicable ?? ((currentTxn.taxAmount || 0) > 0),
        gstRate: (currentTxn.gstRate || 0).toString()
      }])
    }
    setRowErrors({})

    try {
      const meta = currentTxn.metadataJson ? JSON.parse(currentTxn.metadataJson) : {}
      setFormInvoiceType((currentTxn.invoiceType as any) || (meta.invoiceType as any) || (matchedCustomer?.gstNumber ? 'B2B' : 'B2C'))
      setFormBillType((currentTxn.billType as any) || (meta.billType as any) || 'Tax Invoice')
      setFormOriginalInvoice(meta.originalInvoice || '')
      setFormReturnReason(meta.returnReason || '')
      setFormReturnCondition(meta.returnCondition || 'Good')
      setFormRefundMethod(meta.refundMethod || 'Credit Note')
      setFormWarehouse(meta.warehouse || 'Main Warehouse')
      setFormDamageType(meta.damageType || 'Broken')
      setFormApprovedBy(meta.approvedBy || '')
      setFormDepartment(meta.department || '')
      setFormPurpose(meta.purpose || '')
      setFormMarketingCampaign(meta.marketingCampaign || '')
      setFormSalesPerson(meta.salesPerson || '')
      setFormAdjustmentReason(meta.adjustmentReason || 'Correction')
      setFormAdjustmentMode(currentTxn.cases >= 0 ? 'Increase' : 'Decrease')
    } catch {
      // safe fallback
    }

    setIsEditOpen(true)
  }

  const handleOpenDelete = (txn: SalesTransaction) => {
    if (!canWrite) {
      showToast('You do not have write permissions.', 'warning')
      return
    }
    setSelectedTxn(txn)
    setIsDeleteOpen(true)
  }

  const validateForm = (): boolean => {
    const isCustomerRequired = ['Sales Dispatch', 'Customer Return', 'Free Sample'].includes(formType)
    if (isCustomerRequired && !formCustomerId) {
      showToast('Please select a customer for this transaction.', 'warning')
      return false
    }

    if (!formDate) {
      showToast('Transaction date is required.', 'warning')
      return false
    }

    if (formType === 'Sales Dispatch') {
      if (orderItems.length === 0) {
        showToast('Please add at least one product to the order.', 'warning')
        return false
      }

      const errors: Record<string, { productId?: string; caseConfigId?: string; cases?: string; unitPrice?: string; discount?: string; gstRate?: string; stock?: string }> = {}
      let hasError = false
      const productCasesSum: Record<string, number> = {}

      orderItems.forEach((row) => {
        const rowErr: any = {}
        if (!row.productId) {
          rowErr.productId = 'Product is required'
          hasError = true
        }
        const casesNum = parseFloat(row.cases)
        if (!row.cases || isNaN(casesNum) || casesNum <= 0) {
          rowErr.cases = 'Cases must be > 0'
          hasError = true
        }
        const priceNum = parseFloat(row.unitPrice)
        if (row.unitPrice === '' || isNaN(priceNum) || priceNum < 0) {
          rowErr.unitPrice = 'Price must be >= 0'
          hasError = true
        }
        if (row.discount !== '') {
          const discNum = parseFloat(row.discount)
          if (isNaN(discNum) || discNum < 0) {
            rowErr.discount = 'Invalid discount'
            hasError = true
          }
        }
        if (row.isGstEnabled) {
          const rateNum = parseFloat(row.gstRate)
          if (row.gstRate === '' || isNaN(rateNum) || rateNum < 0) {
            rowErr.gstRate = 'Select GST rate'
            hasError = true
          }
        }

        if (row.productId && !isNaN(casesNum) && casesNum > 0) {
          productCasesSum[row.productId] = (productCasesSum[row.productId] || 0) + casesNum
          const prod = products.find(p => p.id === row.productId)
          if (prod) {
            let maxStock = prod.currentStock
            if (isEditOpen && selectedTxn && selectedTxn.productId === row.productId) {
              maxStock += Math.abs(selectedTxn.cases)
            }
            if (casesNum > maxStock) {
              rowErr.stock = `Max: ${maxStock}`
              hasError = true
            }
          }
        }

        if (Object.keys(rowErr).length > 0) {
          errors[row.id] = rowErr
        }
      })

      for (const [prodId, totalCases] of Object.entries(productCasesSum)) {
        const prod = products.find(p => p.id === prodId)
        if (prod) {
          let maxStock = prod.currentStock
          if (isEditOpen && selectedTxn && selectedTxn.productId === prodId) {
            maxStock += Math.abs(selectedTxn.cases)
          }
          if (totalCases > maxStock) {
            hasError = true
            showToast(`Total quantity for ${prod.name} (${totalCases} cases) exceeds available stock (${maxStock} cases).`, 'error')
            return false
          }
        }
      }

      if (hasError) {
        setRowErrors(errors)
        showToast('Please correct the validation errors in the product table.', 'warning')
        return false
      }

      setRowErrors({})

      const currentTotal = orderSummary.grandTotal
      const receivedVal = formAmountReceived !== '' ? (parseFloat(formAmountReceived) || 0) : 0

      if (formPaymentMethod === 'Credit' && formPaymentTerms === 'COD') {
        showToast('Payment Method "Credit" cannot have Payment Terms "Cash on Delivery". For COD, select Cash or Bank.', 'warning')
        return false
      }

      if (formPaymentMethod === 'Credit' && currentTotal > 0 && receivedVal >= currentTotal) {
        showToast(`Full invoice amount (₹${currentTotal.toFixed(2)}) is received upfront. Please select Cash or Bank instead of Credit.`, 'warning')
        return false
      }

      if (formPaymentTerms === 'COD' && receivedVal > 0) {
        showToast('Cash on Delivery implies payment is collected on delivery. If amount is received now, set Payment Terms to "Immediate / Advance".', 'warning')
        return false
      }

      if (formAmountReceived !== '') {
        if (isNaN(receivedVal) || receivedVal < 0) {
          showToast('Amount received cannot be negative.', 'warning')
          return false
        }
        if (receivedVal > currentTotal + 0.001) {
          showToast(`Amount received (₹${receivedVal.toFixed(2)}) cannot exceed total invoice amount (₹${currentTotal.toFixed(2)}).`, 'warning')
          return false
        }
      }

      if (['Bank', 'UPI', 'Cheque'].includes(formPaymentMethod) && !formBankAccountId) {
        if (banks.length > 0) {
          setFormBankAccountId(banks[0].id)
        } else {
          showToast(`Company Bank Account is required for ${formPaymentMethod} payments.`, 'warning')
          return false
        }
      }
      if (formPaymentMethod === 'Cash' && !formCashBookId) {
        if (cashRegisters.length > 0) {
          setFormCashBookId(cashRegisters[0].id)
        }
      }

      return true
    }

    // Non-dispatch validation
    if (!formProductId) {
      showToast('Please select a product.', 'warning')
      return false
    }

    if (!formCases || formCases.trim() === '') {
      showToast('Please enter the quantity of cases.', 'warning')
      return false
    }

    const casesNum = parseFloat(formCases)
    if (isNaN(casesNum) || casesNum <= 0) {
      showToast('Quantity must be greater than zero.', 'warning')
      return false
    }

    if (parentDispatch && (formType === 'Customer Return' || formType === 'Damage')) {
      if (casesNum > (availableRemainingCases + 0.0001)) {
        showToast(`Cannot process ${casesNum} cases. Maximum remaining available cases on dispatch ${parentDispatch.transactionNumber} is ${availableRemainingCases} cases.`, 'error')
        return false
      }
    }

    if (formType === 'Damage' || formType === 'Damaged Goods' || formType === 'Internal Consumption' || formType === 'Free Sample' || (formType === 'Stock Adjustment' && formAdjustmentMode === 'Decrease')) {
      const prod = products.find(p => p.id === formProductId)
      if (prod) {
        let maxAvailable = prod.currentStock
        if (isEditOpen && selectedTxn && selectedTxn.productId === formProductId) {
          maxAvailable += Math.abs(selectedTxn.cases)
        }
        if (casesNum > maxAvailable) {
          showToast(`Insufficient stock. Max available: ${maxAvailable} Cases.`, 'error')
          return false
        }
      }
    }

    return true
  }

  const buildRequestPayload = (): CreateSalesTransactionRequest => {
    if (formType === 'Sales Dispatch') {
      const itemsPayload: SalesTransactionItemRequest[] = orderItems.map(item => {
        const p = products.find(x => x.id === item.productId)
        const cfg = caseConfigs.find(x => x.id === item.caseConfigId)
        const upc = cfg ? cfg.unitsPerCase : 24
        const cases = parseFloat(item.cases) || 0
        const up = parseFloat(item.unitPrice) || 0
        const disc = parseFloat(item.discount) || 0
        const gross = cases * up
        const taxable = Math.max(0, gross - disc)
        const rate = item.isGstEnabled ? (parseFloat(item.gstRate) || 0) : 0
        const tax = Math.round((taxable * rate / 100) * 100) / 100
        const lineTotal = Math.round((taxable + tax) * 100) / 100

        return {
          productId: item.productId,
          productName: p?.name,
          productSku: p?.sku,
          caseConfigurationId: item.caseConfigId || undefined,
          caseConfigurationName: cfg?.name,
          unitsPerCase: upc,
          cases: cases,
          unitPrice: up,
          discountAmount: disc,
          taxableAmount: taxable,
          gstRate: rate,
          taxAmount: tax,
          totalAmount: lineTotal,
          lineTotal: lineTotal,
          cgst: tax > 0 ? Math.round((tax / 2) * 100) / 100 : 0,
          sgst: tax > 0 ? Math.round((tax - Math.round((tax / 2) * 100) / 100) * 100) / 100 : 0,
          igst: 0,
          isGstApplicable: item.isGstEnabled && rate > 0
        }
      })

      const totalCases = itemsPayload.reduce((s, it) => s + it.cases, 0)
      const totalTax = itemsPayload.reduce((s, it) => s + (it.taxAmount || 0), 0)
      const totalDiscount = itemsPayload.reduce((s, it) => s + (it.discountAmount || 0), 0)
      const grandTotal = itemsPayload.reduce((s, it) => s + (it.lineTotal || 0), 0)
      const firstItem = itemsPayload[0] || {}

      let effectiveAmountReceived = 0
      if (formAmountReceived !== '') {
        const parsed = Math.max(0, parseFloat(formAmountReceived) || 0)
        effectiveAmountReceived = Math.min(parsed, grandTotal)
      } else if (formPaymentMethod !== 'Credit' && formPaymentTerms === 'Immediate') {
        effectiveAmountReceived = grandTotal
      }

      return {
        customerId: formCustomerId || '00000000-0000-0000-0000-000000000000',
        productId: firstItem.productId || '00000000-0000-0000-0000-000000000000',
        caseConfigurationId: firstItem.caseConfigurationId,
        unitsPerCase: firstItem.unitsPerCase || 24,
        cases: totalCases,
        transactionType: formType,
        transactionDate: formDate,
        referenceNumber: formRef ? formRef.trim() : undefined,
        remarks: formRemarks ? formRemarks.trim() : undefined,
        paymentMethod: formPaymentMethod,
        paymentTerms: formPaymentTerms,
        bankAccountId: formBankAccountId || undefined,
        cashBookId: formCashBookId || undefined,
        unitPrice: firstItem.unitPrice || 0,
        discountAmount: totalDiscount,
        isGstApplicable: totalTax > 0,
        gstRate: firstItem.gstRate || 0,
        taxAmount: totalTax,
        totalAmount: grandTotal,
        amountReceived: effectiveAmountReceived,
        items: itemsPayload,
        metadataJson: JSON.stringify({
          invoiceType: formInvoiceType,
          billType: formBillType,
          caseConfigurationId: firstItem.caseConfigurationId,
          unitsPerCase: firstItem.unitsPerCase || 24,
          totalUnits: totalCases * (firstItem.unitsPerCase || 24),
          totalLineItems: itemsPayload.length,
          remarks: formRemarks
        })
      }
    }

    const casesVal = parseFloat(formCases)
    const finalCases = (formType === 'Stock Adjustment' && formAdjustmentMode === 'Decrease') ? -casesVal : casesVal

    const up = parseFloat(formUnitPrice) || 0
    const disc = parseFloat(formDiscount) || 0
    const sub = Math.max(0, finalCases * up - disc)

    let cgst = 0, sgst = 0
    if (isGstEnabled) {
      const rate = Math.max(0, parseFloat(formGstRate) || 0)
      cgst = sub * (rate / 200)
      sgst = sub * (rate / 200)
    }
    const tax = cgst + sgst

    const meta = {
      originalInvoice: formOriginalInvoice,
      returnReason: formReturnReason,
      returnCondition: formReturnCondition,
      refundMethod: formRefundMethod,
      settlementMethod: formSettlementMethod,
      refundType: formRefundType,
      caseConfigurationId: formCaseConfigId,
      unitsPerCase: activeUnitsPerCase,
      totalUnits: (parseFloat(formCases) || 0) * activeUnitsPerCase,
      warehouse: formWarehouse,
      damageType: formDamageType,
      approvedBy: formApprovedBy,
      department: formDepartment,
      purpose: formPurpose,
      marketingCampaign: formMarketingCampaign,
      salesPerson: formSalesPerson,
      adjustmentReason: formAdjustmentReason
    }

    let effectivePaymentMethod = formPaymentMethod
    if (formType === 'Customer Return') {
      if (formSettlementMethod === 'Deduct from Customer Credit') {
        effectivePaymentMethod = 'Credit Note'
      } else {
        effectivePaymentMethod = formRefundType
      }
    }

    return {
      customerId: parentDispatch ? parentDispatch.customerId : (formCustomerId || '00000000-0000-0000-0000-000000000000'),
      productId: parentDispatch ? parentDispatch.productId : formProductId,
      parentTransactionId: parentDispatch ? parentDispatch.id : undefined,
      caseConfigurationId: formCaseConfigId || undefined,
      unitsPerCase: activeUnitsPerCase,
      cases: finalCases,
      transactionType: formType,
      transactionDate: formDate,
      referenceNumber: formRef ? formRef.trim() : undefined,
      remarks: formRemarks ? formRemarks.trim() : undefined,
      paymentMethod: effectivePaymentMethod,
      paymentTerms: formPaymentTerms,
      bankAccountId: formBankAccountId || undefined,
      cashBookId: formCashBookId || undefined,
      unitPrice: up,
      discountAmount: disc,
      taxAmount: tax,
      gstRate: isGstEnabled ? Math.max(0, parseFloat(formGstRate) || 0) : 0,
      isGstApplicable: isGstEnabled,
      taxTreatment: 'IntraState',
      cgst: cgst,
      sgst: sgst,
      igst: 0,
      metadataJson: JSON.stringify(meta),
      totalAmount: sub + tax,
      amountReceived: (() => {
        if (formAmountReceived !== '') {
          const parsed = Math.max(0, parseFloat(formAmountReceived) || 0)
          return Math.min(parsed, sub + tax)
        }
        if (effectivePaymentMethod === 'Credit' || effectivePaymentMethod === 'Credit Note' || formPaymentTerms === 'COD' || formPaymentTerms === 'Credit' || formPaymentTerms.startsWith('Net')) {
          return 0
        }
        return sub + tax
      })(),
      returnedAmount: formType === 'Customer Return' ? (parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0) : 0,
      refundAmount: (formType === 'Customer Return' && formSettlementMethod === 'Refund') ? (parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0) : 0,
      adjustmentAmount: (formType === 'Customer Return' && formSettlementMethod === 'Deduct from Customer Credit') ? (parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0) : 0,
      returnType: formType === 'Customer Return' ? (formSettlementMethod === 'Refund' ? formRefundType : 'Credit Note') : undefined,
      returnCondition: formReturnCondition,
      settlementMethod: formSettlementMethod
    }
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    createMutation.mutate(buildRequestPayload())
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTxn) return
    if (!validateForm()) return
    updateMutation.mutate({ id: selectedTxn.id, data: buildRequestPayload() })
  }

  // Parse dynamic metadata for detail viewing
  const viewMeta = useMemo(() => {
    if (!selectedTxn || !selectedTxn.metadataJson) return {}
    try {
      return JSON.parse(selectedTxn.metadataJson)
    } catch {
      return {}
    }
  }, [selectedTxn])

  if (isViewingDetails && selectedTxn) {
    // Dynamic General Ledger & Financial View for the Sales Transaction details
    const total = selectedTxn.totalAmount ?? (Math.abs(selectedTxn.cases) * (selectedTxn.unitPrice || 0))
    const tax = selectedTxn.taxAmount ?? 0
    const cgst = selectedTxn.cgst ?? (tax > 0 ? tax / 2 : 0)
    const sgst = selectedTxn.sgst ?? (tax > 0 ? tax / 2 : 0)
    const igst = selectedTxn.igst ?? 0
    const discount = selectedTxn.discountAmount ?? 0
    const sub = total - tax

    const matchedProduct = products.find(p => p.id === selectedTxn.productId)
    const matchedCustomer = customers.find(c => c.id === selectedTxn.customerId)
    const matchedCaseConfig = caseConfigs.find(c => c.id === viewMeta?.caseConfigurationId)
    const unitsPerCase = viewMeta?.unitsPerCase || matchedCaseConfig?.unitsPerCase || 24
    const totalUnits = viewMeta?.totalUnits || (Math.abs(selectedTxn.cases) * unitsPerCase)
    const costPerCase = matchedProduct?.costPrice || matchedProduct?.unitCost || 15
    const cost = Math.abs(selectedTxn.cases) * costPerCase

    const resolvedDebit = selectedTxn.paymentMethod === 'Cash'
      ? 'Cash Account'
      : (['BankAccount', 'Bank', 'UPI', 'Cheque'].includes(selectedTxn.paymentMethod || '')
        ? (selectedTxn.bankAccountName || 'Bank Account')
        : 'Accounts Receivable')

    const formattedDate = new Date(selectedTxn.transactionDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })

    const formattedDateTime = selectedTxn.createdAt
      ? new Date(selectedTxn.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      : formattedDate

    const customerAddress = [
      matchedCustomer?.addressLine1,
      matchedCustomer?.addressLine2,
      matchedCustomer?.city,
      matchedCustomer?.state,
      matchedCustomer?.pinCode
    ].filter(Boolean).join(', ')

    return (
      <PageContainer>
        <div className="space-y-4 pb-12">
          {/* Details Header */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsViewingDetails(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                title="Back to Sales Register"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[16px] font-black text-slate-900 leading-tight tracking-tight flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    {selectedTxn.transactionType} Register
                  </h1>
                  <StatusBadge
                    status={
                      selectedTxn.paymentStatus === 'Paid'
                        ? 'active'
                        : selectedTxn.paymentStatus === 'Pending'
                        ? 'pending'
                        : 'info'
                    }
                    label={selectedTxn.paymentStatus || 'POSTED'}
                    size="sm"
                  />
                  {selectedTxn.status && selectedTxn.status !== 'Active' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {selectedTxn.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-0.5 flex-wrap">
                  <span className="font-mono">Document Reference: <strong className="text-slate-700">{selectedTxn.transactionNumber}</strong></span>
                  {selectedTxn.referenceNumber && (
                    <span>• Ref / PO: <strong className="text-slate-700">{selectedTxn.referenceNumber}</strong></span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  setInvoiceModalTxn(selectedTxn)
                  setIsInvoiceViewerOpen(true)
                }}
                className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Export Invoice PDF
              </button>
              {canWrite && (
                <button
                  onClick={() => {
                    setIsViewingDetails(false);
                    handleOpenEdit(selectedTxn);
                  }}
                  className="h-[32px] px-3 bg-white hover:bg-slate-50 text-slate-700 text-[12px] font-bold border border-[#E5E7EB] rounded-lg transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Document
                </button>
              )}
            </div>
          </div>

          {/* Transaction Summary Bar */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-3.5 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 text-left">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Transaction Date</span>
                <span className="text-[12px] font-bold text-slate-800 truncate block">{formattedDate}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Document Reference</span>
                <span className="text-[12px] font-mono font-bold text-slate-800 truncate block">{selectedTxn.transactionNumber}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Customer</span>
                <span className="text-[12px] font-bold text-slate-800 truncate block" title={selectedTxn.customerName}>
                  {selectedTxn.customerName || 'System Internal'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Customer Code</span>
                <span className="text-[12px] font-mono font-bold text-slate-800 truncate block">
                  {selectedTxn.customerCode || matchedCustomer?.customerCode || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Payment Mode</span>
                <span className="text-[12px] font-bold text-slate-800 truncate block">{selectedTxn.paymentMethod || 'Credit'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Recorded By</span>
                <span className="text-[12px] font-bold text-slate-800 truncate block">{selectedTxn.createdByName || 'System'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Transaction Status</span>
                <span className="text-[12px] font-bold text-emerald-700 truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {selectedTxn.status || 'Posted'}
                </span>
              </div>
            </div>
          </div>

          {/* Main 2-Column ERP Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* LEFT COLUMN: 8 COLS */}
            <div className="lg:col-span-8 space-y-4">
              {/* 1. PURCHASED FINISHED GOODS */}
              <SectionCard title="Purchased Finished Goods" noPadding compact>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[10px] font-bold text-slate-500 uppercase tracking-wider h-8">
                        <th className="py-2 px-3.5">Item Description</th>
                        <th className="py-2 px-3">SKU</th>
                        <th className="py-2 px-3 text-right">Quantity</th>
                        <th className="py-2 px-3 text-right">Unit Price</th>
                        <th className="py-2 px-3 text-right">Discount</th>
                        <th className="py-2 px-3 text-right">Taxable Amt</th>
                        <th className="py-2 px-3.5 text-right">Total Amt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {selectedTxn.items && selectedTxn.items.length > 0 ? (
                        selectedTxn.items.map((it, idx) => {
                          const itemUnits = it.unitsPerCase ? Math.abs(it.cases) * it.unitsPerCase : 0
                          const itemTaxable = it.taxableAmount ?? ((Math.abs(it.cases) * (it.unitPrice || 0)) - (it.discountAmount || 0))
                          const itemTotal = it.lineTotal ?? it.totalAmount ?? (itemTaxable + (it.taxAmount || 0))
                          return (
                            <tr key={it.id || idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-3.5 font-bold text-slate-900">
                                {it.productName || selectedTxn.productName}
                                {it.caseConfigurationName && (
                                  <span className="block text-[11px] font-normal text-slate-500">
                                    Config: {it.caseConfigurationName} ({it.unitsPerCase || 24} btls/cs)
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                {it.productSku || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {Math.abs(it.cases)} Cases
                                {itemUnits > 0 && (
                                  <span className="block text-[10px] font-normal text-slate-400">{itemUnits} Units</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                ₹{(it.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-rose-600 whitespace-nowrap">
                                ₹{(it.discountAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                ₹{itemTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                                ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                {it.taxAmount && it.taxAmount > 0 && (
                                  <span className="block text-[10px] font-normal text-slate-400">
                                    (incl. ₹{it.taxAmount.toFixed(2)} GST)
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3.5 font-bold text-slate-900">
                            {selectedTxn.productName}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {selectedTxn.productSku || matchedProduct?.sku || 'NO_SKU_CODE'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {Math.abs(selectedTxn.cases)} Cases
                            {totalUnits > 0 && (
                              <span className="block text-[10px] font-normal text-slate-400">{totalUnits} Units</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                            ₹{(selectedTxn.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-rose-600 whitespace-nowrap">
                            ₹{(selectedTxn.discountAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                            ₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3.5 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {selectedTxn.items && selectedTxn.items.length > 1 && (
                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-800">
                        <tr>
                          <td colSpan={2} className="py-2.5 px-3.5 text-slate-600">Total ({selectedTxn.items.length} items)</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-900">{selectedTxn.items.reduce((s, it) => s + Math.abs(it.cases), 0)} Cases</td>
                          <td colSpan={2}></td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">Taxable: ₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-black text-blue-900">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Subsystem fields for categories (Return / Damage) */}
                {selectedTxn.transactionType === 'Customer Return' && (
                  <div className="bg-slate-50/70 border-t border-[#E5E7EB] px-3.5 py-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Condition</span>
                      <span className="font-bold text-slate-800">{viewMeta.returnCondition || 'Good — Restock'}</span>
                    </div>
                    {viewMeta.returnReason && (
                      <div>
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Return Reason</span>
                        <span className="font-bold text-slate-800">{viewMeta.returnReason}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Refund Settlement</span>
                      <span className="font-bold text-slate-800">{viewMeta.refundMethod || viewMeta.settlementMethod || 'Credit Note'}</span>
                    </div>
                  </div>
                )}

                {selectedTxn.transactionType === 'Damage' && (
                  <div className="bg-slate-50/70 border-t border-[#E5E7EB] px-3.5 py-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Damage Reason</span>
                      <span className="font-bold text-slate-800">{selectedTxn.damageReason || viewMeta.damageType || 'Physical Damage'}</span>
                    </div>
                    {viewMeta.approvedBy && (
                      <div>
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Approved By</span>
                        <span className="font-bold text-slate-800">{viewMeta.approvedBy}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Warehouse</span>
                      <span className="font-bold text-slate-800">{viewMeta.warehouse || 'Main Warehouse'}</span>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* 2. ACCOUNTING & LEDGER IMPACT */}
              <SectionCard title="Accounting & Ledger Impact" noPadding compact>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[10px] font-bold text-slate-500 uppercase tracking-wider h-8">
                        <th className="py-2 px-3.5">Account Ledger</th>
                        <th className="py-2 px-3 text-right">Debit (Dr)</th>
                        <th className="py-2 px-3 text-right">Credit (Cr)</th>
                        <th className="py-2 px-3.5">Transaction Narration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {selectedTxn.transactionType === 'Sales Dispatch' && (
                        <>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 font-bold text-slate-900">{resolvedDebit}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-blue-600">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Sales dispatch accounts receivable posting</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 pl-7 text-slate-700 font-medium">Sales Revenue</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Finished goods income recognition</td>
                          </tr>
                          {tax > 0 && (
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-1.5 px-3.5 pl-7 text-slate-700 font-medium">GST Output Liabilities</td>
                              <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                              <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Postings for statutory GST liabilities</td>
                            </tr>
                          )}
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 font-bold text-slate-900">Cost of Goods Sold</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Asset cost conversion expense</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 pl-7 text-slate-700 font-medium">Finished Goods Inventory</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-rose-600">₹{cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Stock reduction posting</td>
                          </tr>
                        </>
                      )}
                      {selectedTxn.transactionType === 'Customer Return' && (
                        <>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 font-bold text-slate-900">Sales Return Note</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-blue-600">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Contra-income returns registration</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 pl-7 text-slate-700 font-medium">{resolvedDebit}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Customer return refund/credit settlement</td>
                          </tr>
                        </>
                      )}
                      {selectedTxn.transactionType === 'Damage' && (
                        <>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 font-bold text-slate-900">Inventory Loss Expense</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Unsellable damage loss allocation</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3.5 pl-7 text-slate-700 font-medium">Finished Goods Inventory</td>
                            <td className="py-1.5 px-3 text-right text-slate-300 font-mono">—</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-rose-600">₹{cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 px-3.5 text-slate-500 text-[11px]">Reduction of stock asset values</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* 3. INVENTORY & LOGISTICS IMPACT */}
              <SectionCard title="Inventory & Logistics Impact" compact>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Product</span>
                    <span className="font-bold text-slate-900 truncate block">{selectedTxn.productName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Dispatched Quantity</span>
                    <span className="font-mono font-bold text-slate-900 block">{Math.abs(selectedTxn.cases)} Cases</span>
                    {totalUnits > 0 && <span className="text-[10px] text-slate-500 block">{totalUnits} Units</span>}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Stock Deducted</span>
                    <span className="font-mono font-bold text-rose-600 block">-{Math.abs(selectedTxn.cases)} Cases</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Available Stock</span>
                    <span className="font-mono font-bold text-slate-900 block">
                      {matchedProduct?.currentStock !== undefined ? `${matchedProduct.currentStock} Cases` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Warehouse Location</span>
                    <span className="font-medium text-slate-800 block">{viewMeta.warehouse || 'Main Warehouse'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Case Configuration</span>
                    <span className="font-medium text-slate-800 block">{unitsPerCase} Units / Case</span>
                  </div>
                  {viewMeta.batchNumber && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Batch Number</span>
                      <span className="font-mono font-bold text-slate-800 block">{viewMeta.batchNumber}</span>
                    </div>
                  )}
                  {selectedTxn.referenceNumber && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Reference / PO</span>
                      <span className="font-mono font-bold text-slate-800 block">{selectedTxn.referenceNumber}</span>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>

            {/* RIGHT COLUMN: 4 COLS */}
            <div className="lg:col-span-4 space-y-4">
              {/* 1. BILLING / TOTALS BREAKDOWN */}
              <SectionCard title="Billing Breakdown" compact>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-800">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-rose-600">
                      <span>Discount:</span>
                      <span className="font-mono font-semibold">-₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Taxable Amount:</span>
                    <span className="font-mono font-semibold text-slate-800">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {tax > 0 && (
                    <>
                      <div className="flex justify-between items-center text-slate-600">
                        <span>CGST (9%):</span>
                        <span className="font-mono font-semibold text-slate-800">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600">
                        <span>SGST (9%):</span>
                        <span className="font-mono font-semibold text-slate-800">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  {igst > 0 && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span>IGST:</span>
                      <span className="font-mono font-semibold text-slate-800">₹{igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t border-[#E5E7EB] pt-1.5 mt-0.5 flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-900">Grand Total:</span>
                    <span className="text-[13px] font-black text-slate-900 font-mono">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {selectedTxn.amountReceived !== undefined && (
                    <div className="flex justify-between items-center text-[11px] text-slate-500 pt-0.5">
                      <span>Amount Paid:</span>
                      <span className="font-mono font-semibold text-emerald-700">₹{(selectedTxn.amountReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {selectedTxn.outstandingAmount !== undefined && selectedTxn.outstandingAmount > 0 && (
                    <div className="flex justify-between items-center text-[11px] text-slate-500">
                      <span>Amount Due:</span>
                      <span className="font-mono font-bold text-amber-700">₹{selectedTxn.outstandingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 2. CUSTOMER DETAILS */}
              <SectionCard title="Customer Details" compact>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">Name:</span>
                    <span className="font-bold text-slate-900 text-right">{selectedTxn.customerName || 'N/A (System Internal)'}</span>
                  </div>
                  {(selectedTxn.customerCode || matchedCustomer?.customerCode) && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Code:</span>
                      <span className="font-mono font-bold text-slate-800">{selectedTxn.customerCode || matchedCustomer?.customerCode}</span>
                    </div>
                  )}
                  {matchedCustomer?.customerType && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Type:</span>
                      <span className="font-semibold text-slate-800">{matchedCustomer.customerType}</span>
                    </div>
                  )}
                  {matchedCustomer?.contactPerson && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Contact:</span>
                      <span className="font-medium text-slate-800">{matchedCustomer.contactPerson}</span>
                    </div>
                  )}
                  {matchedCustomer?.phone && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Phone:</span>
                      <span className="font-mono font-medium text-slate-800">{matchedCustomer.phone}</span>
                    </div>
                  )}
                  {matchedCustomer?.email && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Email:</span>
                      <span className="font-medium text-slate-800 truncate">{matchedCustomer.email}</span>
                    </div>
                  )}
                  {matchedCustomer?.gstNumber && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">GSTIN:</span>
                      <span className="font-mono font-bold text-slate-800">{matchedCustomer.gstNumber}</span>
                    </div>
                  )}
                  {customerAddress && (
                    <div className="pt-1 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Address</span>
                      <p className="text-[11px] text-slate-700 leading-snug">{customerAddress}</p>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 3. PAYMENT INFORMATION */}
              <SectionCard
                title="Payment Information"
                compact
                actions={
                  canWrite && (selectedTxn.outstandingAmount ?? Math.max(0, (selectedTxn.totalAmount || total) - (selectedTxn.amountReceived || 0))) > 0 && selectedTxn.status !== 'Cancelled' ? (
                    <button
                      type="button"
                      onClick={() => handleOpenCollectModal(selectedTxn)}
                      className="h-[24px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Coins className="w-3 h-3" />
                      Collect Amount
                    </button>
                  ) : null
                }
              >
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">Payment Status:</span>
                    <StatusBadge
                      status={
                        (selectedTxn.outstandingAmount !== undefined && selectedTxn.outstandingAmount <= 0) || selectedTxn.paymentStatus === 'Paid'
                          ? 'active'
                          : selectedTxn.paymentStatus === 'Pending'
                          ? 'pending'
                          : 'warning'
                      }
                      label={selectedTxn.paymentStatus || 'POSTED'}
                      size="sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">Payment Mode:</span>
                    <span className="font-bold text-slate-800">{selectedTxn.paymentMethod || 'Credit'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">Original Amount:</span>
                    <span className="font-mono font-semibold text-slate-800">₹{(selectedTxn.totalAmount || total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">Amount Collected:</span>
                    <span className="font-mono font-bold text-emerald-700">₹{(selectedTxn.amountReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">Outstanding Balance:</span>
                    <span className={`font-mono font-bold ${(selectedTxn.outstandingAmount ?? Math.max(0, (selectedTxn.totalAmount || total) - (selectedTxn.amountReceived || 0))) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      ₹{(selectedTxn.outstandingAmount ?? Math.max(0, (selectedTxn.totalAmount || total) - (selectedTxn.amountReceived || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {selectedTxn.bankAccountName && (
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-500">Bank Account:</span>
                      <span className="font-semibold text-slate-800">{selectedTxn.bankAccountName}</span>
                    </div>
                  )}
                  {selectedTxn.cashBookName && (
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-500">Cash Register:</span>
                      <span className="font-semibold text-slate-800">{selectedTxn.cashBookName}</span>
                    </div>
                  )}
                  {selectedTxn.referenceNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-500">Payment Ref:</span>
                      <span className="font-mono font-medium text-slate-800">{selectedTxn.referenceNumber}</span>
                    </div>
                  )}

                  {/* Payment Collection History Sub-block */}
                  {txnPayments.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Collection Records ({txnPayments.length})</span>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                        {txnPayments.map((p) => (
                          <div key={p.id} className="bg-slate-50 rounded-lg p-2 border border-slate-200/60 text-[11px] space-y-0.5">
                            <div className="flex justify-between items-center">
                              <span className="font-mono font-bold text-emerald-700">₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              <span className="text-[10px] text-slate-400">{new Date(p.date || p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500 text-[10px]">
                              <span>Via: <strong className="text-slate-700">{p.paymentMethod}</strong> ({p.accountName})</span>
                              {p.referenceNumber && <span className="font-mono">Ref: {p.referenceNumber}</span>}
                            </div>
                            {p.collectedBy && (
                              <div className="text-[10px] text-slate-400">
                                Collected by: <span className="text-slate-600 font-medium">{p.collectedBy}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prominent Action Button if outstanding balance exists */}
                  {canWrite && (selectedTxn.outstandingAmount ?? Math.max(0, (selectedTxn.totalAmount || total) - (selectedTxn.amountReceived || 0))) > 0 && selectedTxn.status !== 'Cancelled' && (
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenCollectModal(selectedTxn)}
                        className="w-full h-[32px] bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        Collect Outstanding (₹{(selectedTxn.outstandingAmount ?? Math.max(0, (selectedTxn.totalAmount || total) - (selectedTxn.amountReceived || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                      </button>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 4. SYSTEM POSTING STATUS REGISTRY */}
              <SectionCard title="System Posting Registry" compact>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-[11px] font-medium">1. Inventory Subsystem</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Adjusted
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-[11px] font-medium">2. Customer Ledger</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Adjusted
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-[11px] font-medium">3. General Ledger</span>
                    <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      JV Posted
                    </span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* DEDICATED TRANSACTION HISTORY & AUDIT TRAIL */}
          <SectionCard
            title="Transaction History"
            compact
            description={`Chronological lifecycle audit trail for document #${selectedTxn.transactionNumber}`}
            actions={
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {sortedTimelineEvents.length} {sortedTimelineEvents.length === 1 ? 'Event' : 'Events'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsTimelineOldestFirst(!isTimelineOldestFirst)}
                  className="h-[28px] px-2.5 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold border border-[#E5E7EB] rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  title="Toggle Chronological Order"
                >
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  {isTimelineOldestFirst ? 'Oldest First ↓' : 'Newest First ↑'}
                </button>
                <button
                  type="button"
                  onClick={() => refetchTxnTimeline()}
                  disabled={isTxnTimelineFetching}
                  className="h-[28px] px-2 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-medium border border-[#E5E7EB] rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                  title="Refresh Audit Trail"
                >
                  <RotateCcw className={`w-3 h-3 ${isTxnTimelineFetching ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </div>
            }
          >
            {isTxnTimelineLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading transaction audit history...</span>
              </div>
            ) : isTxnTimelineError ? (
              <div className="py-5 text-center space-y-1.5">
                <p className="text-xs text-rose-600 font-medium">Unable to load transaction history.</p>
                <button
                  type="button"
                  onClick={() => refetchTxnTimeline()}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : sortedTimelineEvents.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-400 italic">
                No transaction history available.
              </div>
            ) : (
              <div className="relative pl-6 space-y-3.5 border-l-2 border-slate-200 ml-3.5 my-1">
                {sortedTimelineEvents.map((evt) => {
                  const evtDate = new Date(evt.timestamp)
                  const formattedEvtDate = evtDate.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })
                  const formattedEvtTime = evtDate.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })

                  // Determine Icon & Color
                  let iconElement = <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  let dotBg = 'bg-blue-50 border-blue-200 text-blue-600'
                  let badgeVariant: 'success' | 'active' | 'pending' | 'info' | 'warning' = 'info'

                  if (evt.eventType === 'CREATED') {
                    iconElement = <FileText className="w-3.5 h-3.5 text-blue-600" />
                    dotBg = 'bg-blue-50 border-blue-200 text-blue-600'
                    badgeVariant = 'info'
                  } else if (evt.eventType === 'INVENTORY') {
                    iconElement = <Package className="w-3.5 h-3.5 text-emerald-600" />
                    dotBg = 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    badgeVariant = 'success'
                  } else if (evt.eventType === 'CUSTOMER_LEDGER') {
                    iconElement = <UserIcon className="w-3.5 h-3.5 text-purple-600" />
                    dotBg = 'bg-purple-50 border-purple-200 text-purple-600'
                    badgeVariant = 'active'
                  } else if (evt.eventType === 'GENERAL_LEDGER') {
                    iconElement = <Landmark className="w-3.5 h-3.5 text-indigo-600" />
                    dotBg = 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    badgeVariant = 'active'
                  } else if (evt.eventType === 'PAYMENT') {
                    iconElement = <Landmark className="w-3.5 h-3.5 text-emerald-600" />
                    dotBg = 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    badgeVariant = 'success'
                  } else if (evt.eventType === 'EDITED' || evt.eventType === 'AUDIT') {
                    iconElement = <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                    dotBg = 'bg-amber-50 border-amber-200 text-amber-600'
                    badgeVariant = 'warning'
                  } else if (evt.eventType === 'CHILD_RETURN' || evt.eventType === 'CHILD_DAMAGE') {
                    iconElement = <ArrowUpDown className="w-3.5 h-3.5 text-rose-600" />
                    dotBg = 'bg-rose-50 border-rose-200 text-rose-600'
                    badgeVariant = 'warning'
                  }

                  return (
                    <div key={evt.id} className="relative group">
                      {/* Timeline Node Icon */}
                      <div className={`absolute -left-[35px] top-0.5 w-6 h-6 rounded-full border flex items-center justify-center ${dotBg} shadow-2xs`}>
                        {iconElement}
                      </div>

                      {/* Event Content Box */}
                      <div className="bg-white border border-[#E5E7EB] hover:border-slate-300 rounded-lg p-2.5 px-3 shadow-2xs transition-all text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-[12px]">{evt.title}</span>
                            <StatusBadge
                              status={badgeVariant}
                              label={evt.status || 'Posted'}
                              size="sm"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formattedEvtDate}, {formattedEvtTime}</span>
                          </div>
                        </div>

                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {evt.description}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                          <div>
                            Recorded by: <strong className="text-slate-700 font-semibold">{evt.actorName || 'System'}</strong>
                            {evt.actorRole && <span className="text-slate-400 ml-1">({evt.actorRole})</span>}
                          </div>

                          {/* Metadata chips */}
                          {evt.metadata && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {evt.metadata.voucherNumber && (
                                <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-semibold">
                                  Voucher: #{evt.metadata.voucherNumber}
                                </span>
                              )}
                              {evt.metadata.referenceNumber && (
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                                  Ref: {evt.metadata.referenceNumber}
                                </span>
                              )}
                              {evt.metadata.balanceAfter !== undefined && (
                                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 font-semibold">
                                  Stock: {evt.metadata.balanceAfter} Cases
                                </span>
                              )}
                              {evt.metadata.linesCount && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                  {evt.metadata.linesCount} GL Lines
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </div>
        {/* BillAura-style GST & Bill of Supply Invoice Viewer & Downloader Modal */}
      <InvoiceViewerModal
        isOpen={isInvoiceViewerOpen}
        onClose={() => setIsInvoiceViewerOpen(false)}
        transaction={invoiceModalTxn}
        companySettings={companySettings}
      />
    </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Sales"
        description={isOwner ? "Company sales overview" : "Log finished goods dispatches, returns, and damages with proper inventory adjustments."}
        actions={
          (canWrite && !isOwner) ? (
            <button
              onClick={handleOpenCreate}
              className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Transaction
            </button>
          ) : undefined
        }
      />

      {/* OWNER EXECUTIVE SALES VIEW */}
      {isOwner && (
        <div className="space-y-6 mb-8 select-none">
          {/* 1. SALES OVERVIEW SUMMARY CARDS */}
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Total Sales */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Total Sales</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Coins className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900 font-mono">
                  {isOwnerOverviewLoading ? '...' : `₹${(overview?.totalSales || 0).toLocaleString('en-IN')}`}
                </div>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Total sales value</span>
              </div>

              {/* Sales Today */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Sales Today</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900 font-mono">
                  {isOwnerOverviewLoading ? '...' : `₹${(overview?.salesToday || 0).toLocaleString('en-IN')}`}
                </div>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Today's sales value</span>
              </div>

              {/* This Month */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">This Month</span>
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900 font-mono">
                  {isOwnerOverviewLoading ? '...' : `₹${(overview?.thisMonthSales || 0).toLocaleString('en-IN')}`}
                </div>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Current month's sales value</span>
              </div>

              {/* Total Transactions */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs hover:shadow-xs transition-all">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Total Transactions</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900 font-mono">
                  {isOwnerOverviewLoading ? '...' : overview?.totalTransactions || 0}
                </div>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Total sales orders count</span>
              </div>
            </div>

            {/* Secondary 2-card row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Average Sale */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-3.5 px-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">Average Sale</span>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    {isOwnerOverviewLoading ? '...' : `₹${(overview?.averageSale || 0).toLocaleString('en-IN')}`}
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">Average transaction value</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4.5 h-4.5" />
                </div>
              </div>

              {/* Month Transactions */}
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-3.5 px-4 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">This Month's Transactions</span>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    {isOwnerOverviewLoading ? '...' : overview?.thisMonthTransactions || 0}
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">Number of transactions this month</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  <Package className="w-4.5 h-4.5" />
                </div>
              </div>
            </div>
          </div>

          {/* 2. SALES TREND / PERFORMANCE */}
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4.5 shadow-2xs">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4 select-none">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Sales Trend
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">Daily sales performance overview</p>
              </div>
              {overview?.dailyTrend && overview.dailyTrend.length > 0 && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Period Total</span>
                  <span className="text-xs font-black text-slate-900 font-mono">
                    ₹{overview.dailyTrend.reduce((sum, d) => sum + d.totalSales, 0).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
            <OwnerSalesTrendChart data={overview?.dailyTrend || []} />
          </div>

          {/* 3. SALES BREAKDOWN */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Products */}
            <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 mb-3 select-none">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  Top Products
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase">By Revenue</span>
              </div>
              {overview?.topProducts && overview.topProducts.length > 0 ? (
                <div className="space-y-2.5">
                  {overview.topProducts.map((p, i) => (
                    <div key={p.productId} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <span className="font-bold text-slate-800 block truncate">{p.productName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.productSku || 'SKU'} • {p.totalCases} Cases</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-slate-900 font-mono block">₹{p.totalSales.toLocaleString('en-IN')}</span>
                        <span className="text-[10px] text-slate-400">{p.transactionCount} Orders</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No sales recorded yet.
                </div>
              )}
            </div>

            {/* Top Customers */}
            <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 shadow-2xs">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 mb-3 select-none">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-teal-600" />
                  Top Customers
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase">By Revenue</span>
              </div>
              {overview?.topCustomers && overview.topCustomers.length > 0 ? (
                <div className="space-y-2.5">
                  {overview.topCustomers.map((c, i) => (
                    <div key={c.customerId} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <span className="font-bold text-slate-800 block truncate">{c.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Code: {c.customerCode || 'N/A'} • {c.totalCases} Cases</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-slate-900 font-mono block">₹{c.totalSales.toLocaleString('en-IN')}</span>
                        <span className="text-[10px] text-slate-400">{c.transactionCount} Orders</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No customer sales recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. HISTORICAL SALES TABLE SECTION */}
      {isOwner && (
        <div className="pt-2 pb-2 mb-3 border-t border-slate-200">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            Sales History
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">Complete record of historical company sales transactions</p>
        </div>
      )}

      {/* FILTERS */}
      <FilterBar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search txn, customer, product..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-4 w-full h-[32px] text-[12px] bg-white border border-[#E5E7EB] rounded-lg placeholder-slate-400 focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-blue-400 cursor-pointer text-slate-700"
        >
          <option value="">All Types</option>
          <option value="Sales Dispatch">Sales Dispatch</option>
          <option value="Customer Return">Customer Return</option>
          <option value="Damage">Damage</option>
        </select>
        <select
          value={productIdFilter}
          onChange={(e) => { setProductIdFilter(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-blue-400 cursor-pointer text-slate-700"
        >
          <option value="">All Products</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={customerIdFilter}
          onChange={(e) => { setCustomerIdFilter(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-blue-400 cursor-pointer text-slate-700"
        >
          <option value="">All Customers</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.customerName}</option>
          ))}
        </select>
        <input
          type="date"
          value={startDateFilter}
          onChange={(e) => { setStartDateFilter(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none cursor-pointer text-slate-700"
        />
        <input
          type="date"
          value={endDateFilter}
          onChange={(e) => { setEndDateFilter(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none cursor-pointer text-slate-700"
        />
        <select
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
          className="h-[32px] px-3 text-[12px] font-semibold bg-white border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-blue-400 cursor-pointer text-slate-700"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="largest_qty">Largest Qty</option>
        </select>
        <button
          onClick={() => { setSearch(''); setProductIdFilter(''); setCustomerIdFilter(''); setTypeFilter(''); setStatusFilter(''); setStartDateFilter(''); setEndDateFilter(''); setSortOrder('newest'); setPage(1); }}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
        >
          Clear Filters
        </button>
      </FilterBar>

      {/* TABLE SECTION */}
      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
        {isTxnsLoading ? (
          <div className="py-20 flex flex-col justify-center items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-xs font-semibold text-slate-400">Loading ledger logs...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 flex flex-col justify-center items-center text-center">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 stroke-[1.2] mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No Sales Transactions</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">No transactions matched your search filters. Click 'Create Transaction' to log stock changes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none h-[36px]">
                  <th className="py-2 px-4">Date</th>
                  {/* <th className="py-2 px-4">Transaction No</th> */}
                  <th className="py-2 px-4">Customer</th>
                  <th className="py-2 px-4">Product</th>
                  <th className="py-2 px-4">Type</th>
                  <th className="py-2 px-4 text-right">Cases</th>
                  <th className="py-2 px-4 text-center">Status</th>
                  <th className="py-2 px-4">Created By</th>
                  <th className="py-2 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-slate-700">
                {transactions.map((txn, i) => (
                  <tr key={txn.id} className={`h-[38px] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-blue-50/30`}>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {new Date(txn.transactionDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    {/* <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {txn.transactionNumber}
                    </td> */}
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {txn.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {txn.productName}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${txn.transactionType === 'Sales Dispatch'
                          ? 'bg-blue-50 text-blue-700 border border-blue-100'
                          : txn.transactionType === 'Customer Return'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                          }`}>
                          {txn.transactionType}
                        </span>
                        {txn.relatedCount && txn.relatedCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200/80">
                            {txn.relatedCount} Related
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-black tabular-nums text-slate-800">
                      {txn.cases.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <EnterpriseBadge variant="success">{txn.status}</EnterpriseBadge>
                    </td>
                    <td className="py-3 px-4 text-slate-650">
                      {txn.createdByName}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenView(txn)}
                          title="View Details"
                          className="p-1.5 text-slate-400 hover:text-blue-650 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setInvoiceModalTxn(txn)
                            setIsInvoiceViewerOpen(true)
                          }}
                          title="View & Print Invoice"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {canWrite && (txn.outstandingAmount ?? Math.max(0, (txn.totalAmount || 0) - (txn.amountReceived || 0))) > 0 && txn.status !== 'Cancelled' && (
                          <button
                            onClick={() => handleOpenCollectModal(txn)}
                            title={`Collect Outstanding Balance (₹${(txn.outstandingAmount ?? Math.max(0, (txn.totalAmount || 0) - (txn.amountReceived || 0))).toFixed(2)})`}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                          >
                            <Coins className="w-3 h-3 text-emerald-600" />
                            Collect
                          </button>
                        )}
                        {txn.parentTransactionId && (
                          <button
                            onClick={() => handleOpenParentDispatch(txn)}
                            title="View Original Sales Dispatch"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/80 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                          >
                            <ArrowLeft className="w-3 h-3 text-blue-600" />
                            Original Dispatch
                          </button>
                        )}
                        {txn.transactionType === 'Sales Dispatch' && canWrite && (
                          <button
                            onClick={() => handleOpenLinkedReturnDamage(txn)}
                            title="Record Return or Damage for this Dispatch"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                          >
                            <ArrowUpDown className="w-3 h-3 text-amber-700" />
                            Return / Damage
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenHistory(txn)}
                          title="View Transaction History"
                          className="p-1.5 text-slate-400 hover:text-purple-650 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => handleOpenEdit(txn)}
                            title="Edit Transaction"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canWrite && (
                          <button
                            onClick={() => handleOpenDelete(txn)}
                            title="Delete/Reverse"
                            className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION CONTROLS */}
        {pagination && pagination.totalPages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Showing page <strong className="font-bold text-slate-700">{page}</strong> of <strong className="font-bold text-slate-700">{pagination.totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className={`bg-white border border-slate-200 w-full ${formType === 'Sales Dispatch' ? 'max-w-5xl' : 'max-w-2xl'} rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all duration-200`}>
            <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                {parentDispatch ? 'Create Return / Damage (Linked)' : 'Record Sales Dispatch'}
              </h2>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* ORIGINAL DISPATCH SUMMARY CARD (LINKED MODE) */}
              {parentDispatch && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-blue-600" />
                      ORIGINAL SALES DISPATCH
                    </span>
                    <span className="font-mono text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full border border-blue-200">
                      {parentDispatch.transactionNumber}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 font-semibold block">Customer:</span>
                      <span className="font-bold text-slate-800 truncate block">{parentDispatch.customerName} 🔒</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Product:</span>
                      <span className="font-bold text-slate-800 truncate block">{parentDispatch.productName} 🔒</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Dispatched:</span>
                      <span className="font-black text-slate-900">{parentDispatch.cases} Cases</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block">Price / Case:</span>
                      <span className="font-bold text-slate-800">₹{(parentDispatch.unitPrice || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Available to Return/Damage:</span>
                    <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      {availableRemainingCases} Cases Available
                    </span>
                  </div>
                </div>
              )}

              {/* Shared Transaction Details Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Transaction Type */}
                <div className="flex flex-col">
                  <PremiumLabel label="Transaction Type *" />
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] bg-white rounded-lg focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
                  >
                    {parentDispatch ? (
                      <>
                        <option value="Customer Return">Return</option>
                        <option value="Damage">Damage</option>
                      </>
                    ) : (
                      <>
                        <option value="Sales Dispatch">Sales Dispatch</option>
                        <option value="Customer Return">Customer Return</option>
                        <option value="Damage">Damaged Goods</option>
                        <option value="Internal Consumption">Internal Consumption</option>
                        <option value="Free Sample">Free Sample</option>
                        <option value="Stock Adjustment">Stock Adjustment</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Transaction Date */}
                <div className="flex flex-col">
                  <PremiumLabel label="Transaction Date *" />
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] rounded-lg focus:outline-none"
                  />
                </div>

                {/* Reference Number / PO */}
                <div className="flex flex-col">
                  <PremiumLabel label="Reference / PO Number" />
                  <input
                    type="text"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    placeholder="e.g. PO-89214"
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] rounded-lg focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

              {/* Invoice Category & Document Type */}
              {formType === 'Sales Dispatch' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50/80 border border-slate-200 rounded-xl">
                  {/* Invoice Category */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-slate-700">Invoice Category</span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formInvoiceType === 'B2B' ? 'With GSTIN' : 'Retail / Cash'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 h-[38px]">
                      <button
                        type="button"
                        onClick={() => setFormInvoiceType('B2B')}
                        className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          formInvoiceType === 'B2B'
                            ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        B2B (Business)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormInvoiceType('B2C')}
                        className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          formInvoiceType === 'B2C'
                            ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        B2C (Retail)
                      </button>
                    </div>
                  </div>

                  {/* Document Type */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-slate-700">Document Type</span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formBillType === 'Tax Invoice' ? 'GST Breakdown' : 'Non-Taxable'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 h-[38px]">
                      <button
                        type="button"
                        onClick={() => setFormBillType('Tax Invoice')}
                        className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          formBillType === 'Tax Invoice'
                            ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Tax Invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormBillType('Bill of Supply')}
                        className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          formBillType === 'Bill of Supply'
                            ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Bill of Supply
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SINGLE PRODUCT SELECTION (Only for Non-Dispatch transactions like Returns, Damage, Adjustments) */}
              {formType !== 'Sales Dispatch' && (
                <>
                  <div className="flex flex-col">
                    <PremiumLabel label="Product *" />
                    <select
                      value={formProductId}
                      onChange={(e) => handleProductChangeInForm(e.target.value)}
                      className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] bg-white rounded-lg focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                      required
                    >
                      <option value="">Select Finished Product...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <PremiumLabel label="Case Configuration *" />
                      {formProductId && (
                        <button
                          type="button"
                          onClick={() => setIsQuickCreateConfigOpen(true)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 px-2 py-0.5 rounded transition-colors cursor-pointer border border-blue-200/60"
                          title="Quick add a new packaging/case configuration for this product"
                        >
                          <Plus className="w-3 h-3" />
                          <span>New Configuration</span>
                        </button>
                      )}
                    </div>
                    <select
                      value={formCaseConfigId}
                      onChange={(e) => setFormCaseConfigId(e.target.value)}
                      disabled={!formProductId}
                      className={`w-full h-[40px] px-3.5 border border-slate-200 text-[14px] bg-white rounded-lg focus:outline-none focus:border-blue-500 font-medium ${!formProductId ? 'opacity-60 bg-slate-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {!formProductId ? (
                        <option value="">Select Product first...</option>
                      ) : availableCaseConfigsForSelectedProduct.length === 0 ? (
                        <option value="">Default — 24 Bottles / Case (Standard)</option>
                      ) : (
                        availableCaseConfigsForSelectedProduct.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name ? `${c.name} (${c.unitsPerCase} Bottles / Case)` : `${c.unitsPerCase} Bottles / Case`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {formProductId && (
                    <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs flex items-center justify-between text-blue-900 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600 shrink-0" />
                        <div>
                          <span className="font-extrabold block text-blue-950 uppercase text-[10px] tracking-wider">CASE CONFIGURATION</span>
                          <span className="font-semibold text-blue-800">{activeUnitsPerCase} Bottles / Case</span>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 bg-white/90 border border-blue-200 rounded-md font-bold text-[11px] text-blue-700 shadow-2xs">
                        1 Case = {activeUnitsPerCase} Bottles
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* SALES DISPATCH MULTI-PRODUCT UI */}
              {formType === 'Sales Dispatch' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  {/* Shared Customer Selection */}
                  <SearchableDropdown
                    label="Customer / Distributor"
                    required
                    value={formCustomerId}
                    onChange={handleCustomerSelect}
                    options={customers.map(c => ({
                      id: c.id,
                      name: c.customerName,
                      subtitle: c.phone || c.customerCode,
                      badge: c.customerType
                    }))}
                    placeholder="Search customer by name, code, or phone..."
                    onQuickAdd={handleQuickCreateCustomer}
                    quickAddLabel="Quick Add Customer"
                  />

                  {/* Dynamic Multi-Product Order Items Table */}
                  <OrderItemsTableSection
                    orderItems={orderItems}
                    rowErrors={rowErrors}
                    products={products}
                    caseConfigs={caseConfigs}
                    onAddRow={handleAddRow}
                    onRemoveRow={handleRemoveRow}
                    onChangeRow={handleRowChange}
                  />

                  {/* Consolidated Transaction Summary Card */}
                  <OrderTransactionSummaryCard summary={orderSummary} />

                  {/* Shared Payment Details Section */}
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Payment Method */}
                      <div className="flex flex-col">
                        <PremiumLabel label="Payment Method *" />
                        <div className="flex gap-2">
                          {['Cash', 'Bank', 'Credit'].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setFormPaymentMethod(m)
                                if (m === 'Credit') {
                                  setFormAmountReceived('0')
                                  if (formPaymentTerms === 'COD' || formPaymentTerms === 'Immediate') {
                                    setFormPaymentTerms('Credit')
                                  }
                                } else {
                                  if (formPaymentTerms === 'Credit' || formPaymentTerms.startsWith('Net')) {
                                    setFormPaymentTerms('Immediate')
                                    setFormAmountReceived(orderSummary.grandTotal.toString())
                                  } else if (formPaymentTerms === 'Immediate') {
                                    setFormAmountReceived(orderSummary.grandTotal.toString())
                                  }
                                }
                              }}
                              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${formPaymentMethod === m ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Payment Terms */}
                      <div className="flex flex-col">
                        <PremiumLabel label="Payment Terms *" />
                        <select
                          value={formPaymentTerms}
                          onChange={(e) => {
                            const terms = e.target.value
                            setFormPaymentTerms(terms)
                            if (terms === 'COD') {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormAmountReceived('0')
                            } else if (terms === 'Credit' || terms.startsWith('Net')) {
                              setFormPaymentMethod('Credit')
                              setFormAmountReceived('0')
                            } else if (terms === 'Immediate') {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormAmountReceived(orderSummary.grandTotal.toString())
                            }
                          }}
                          className="w-full h-[40px] px-3 border border-slate-200 rounded-lg text-xs bg-white font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="Immediate">Immediate / Advance</option>
                          <option value="COD" disabled={formPaymentMethod === 'Credit'}>Cash on Delivery (COD){formPaymentMethod === 'Credit' ? ' (Select Cash/Bank method)' : ''}</option>
                          <option value="Net 7">Net 7 Days</option>
                          <option value="Net 15">Net 15 Days</option>
                          <option value="Net 30">Net 30 Days</option>
                          <option value="Credit">Credit Agreement</option>
                        </select>
                      </div>
                    </div>

                    {/* Amount Received Now Card */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <PremiumLabel label="Amount Received Now (₹)" />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormPaymentTerms('Immediate')
                              setFormAmountReceived(orderSummary.grandTotal.toString())
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md cursor-pointer transition-colors"
                          >
                            Pay Full (₹{orderSummary.grandTotal.toFixed(2)})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormAmountReceived('0')
                              if (formPaymentMethod === 'Credit') {
                                setFormPaymentTerms('Credit')
                              } else if (formPaymentTerms === 'Immediate') {
                                setFormPaymentTerms('COD')
                              }
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-md cursor-pointer transition-colors"
                          >
                            COD / Pending (₹0)
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={orderSummary.grandTotal}
                        value={formAmountReceived}
                        onChange={(e) => setFormAmountReceived(e.target.value)}
                        placeholder={`0.00 (Max: ₹${orderSummary.grandTotal.toFixed(2)})`}
                        className="w-full h-[38px] px-3 border border-slate-200 text-sm font-semibold rounded-lg bg-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
                        <span>Total GST: <strong className="text-slate-800 font-mono">₹{orderSummary.totalGst.toFixed(2)}</strong> · Total Invoice: <strong className="text-slate-800 font-mono">₹{orderSummary.grandTotal.toFixed(2)}</strong></span>
                        <span>Pending Balance: <strong className={`font-mono font-bold ${orderSummary.pendingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          ₹{orderSummary.pendingBalance.toFixed(2)}
                        </strong></span>
                      </div>

                      {formPaymentMethod === 'Credit' && orderSummary.received >= orderSummary.grandTotal && orderSummary.grandTotal > 0 && (
                        <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold mt-1">
                          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Full invoice amount received upfront. This is an immediate cash/bank sale rather than credit.</span>
                        </div>
                      )}
                    </div>

                    {/* Customer Credit exposure warning */}
                    {formPaymentMethod === 'Credit' && selectedCustomerInForm && (
                      <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl space-y-2 text-xs select-none">
                        <div className="flex justify-between items-center text-[#92400E] font-semibold">
                          <span>Customer Outstanding Balance:</span>
                          <span className="font-bold text-[#78350F] font-mono">₹{(selectedCustomerInForm.outstandingPlaceholder || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Credit Limit:</span>
                          <span className="font-bold font-mono">₹{(selectedCustomerInForm.creditLimit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {selectedCustomerInForm.creditLimit > 0 && (
                          <div className="flex justify-between items-center text-slate-600">
                            <span>Available Credit:</span>
                            <span className={`font-bold font-mono ${(selectedCustomerInForm.creditLimit - (selectedCustomerInForm.outstandingPlaceholder || 0)) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              ₹{(selectedCustomerInForm.creditLimit - (selectedCustomerInForm.outstandingPlaceholder || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {selectedCustomerInForm.creditLimit > 0 &&
                          ((selectedCustomerInForm.outstandingPlaceholder || 0) + orderSummary.grandTotal) > selectedCustomerInForm.creditLimit && (
                            <div className="flex items-center gap-1.5 text-red-700 bg-red-100/80 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold mt-1">
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                              <span>Warning: Total credit exposure exceeds customer credit limit!</span>
                            </div>
                          )}
                      </div>
                    )}

                    {/* Bank Account dropdown */}
                    {['Bank', 'UPI', 'Cheque'].includes(formPaymentMethod) && (
                      <div className="flex flex-col">
                        <PremiumLabel label="Company Bank Account *" />
                        <select value={formBankAccountId} onChange={(e) => setFormBankAccountId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                          <option value="">Select Account...</option>
                          {banks.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Cash Book dropdown */}
                    {formPaymentMethod === 'Cash' && (
                      <div className="flex flex-col">
                        <PremiumLabel label="Company Cash Book Register *" />
                        <select value={formCashBookId} onChange={(e) => setFormCashBookId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                          <option value="">Select Cash Register...</option>
                          {cashRegisters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Optional Transaction Remarks */}
                    <div className="flex flex-col">
                      <PremiumLabel label="Transaction Remarks (Optional)" />
                      <input
                        type="text"
                        value={formRemarks}
                        onChange={(e) => setFormRemarks(e.target.value)}
                        placeholder="e.g. Dispatched via Express Logistics / Truck #KA-01-1234"
                        className="w-full h-[40px] px-3.5 border border-slate-200 text-sm rounded-lg bg-white font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Return Conditional UI */}
              {formType === 'Customer Return' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  {/* Customer search selection */}
                  <SearchableDropdown
                    label="Customer *"
                    required
                    value={formCustomerId}
                    onChange={(val) => {
                      setFormCustomerId(val)
                      const found = customers.find(c => c.id === val)
                      if (found) setCustomerSearch(found.customerName)
                    }}
                    options={customers.map(c => ({
                      id: c.id,
                      name: c.customerName,
                      subtitle: c.phone || c.customerCode,
                      badge: c.customerType
                    }))}
                    placeholder="Select return customer..."
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <EnterpriseNumberInput label="Returned Cases *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                    <div className="flex flex-col">
                      <PremiumLabel label="Return Price / Case (₹) *" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formUnitPrice}
                        onChange={(e) => setFormUnitPrice(e.target.value)}
                        placeholder={selectedProductInForm?.sellingPrice?.toString() || selectedProductInForm?.costPrice?.toString() || '0.00'}
                        className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  {/* Return Overview Card */}
                  {formProductId && (
                    <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/90 rounded-xl space-y-2 text-xs">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">RETURN OVERVIEW</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-emerald-900">
                        <div>
                          <span className="text-[10px] text-emerald-700/80 block">Product</span>
                          <span className="font-bold">{selectedProductInForm?.name || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700/80 block">Case Configuration</span>
                          <span className="font-bold">{activeUnitsPerCase} Bottles/Case</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700/80 block">Returned Cases</span>
                          <span className="font-bold">{parseFloat(formCases) || 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700/80 block">Total Bottles</span>
                          <span className="font-extrabold text-emerald-950 tabular-nums">{(parseFloat(formCases) || 0) * activeUnitsPerCase} Bottles</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Calculated Return Value Summary Banner */}
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">TOTAL RETURN VALUE</span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {parseFloat(formCases) || 0} Cases × ₹{(parseFloat(formUnitPrice) || 0).toFixed(2)} / Case
                      </span>
                    </div>
                    <span className="text-lg font-black text-emerald-950 tabular-nums">
                      ₹{((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Return Condition & Settlement Method */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <PremiumLabel label="Return Condition *" />
                      <select
                        value={formReturnCondition}
                        onChange={(e) => setFormReturnCondition(e.target.value)}
                        className="w-full h-[40px] px-3 border border-slate-200 text-sm bg-white rounded-lg font-medium"
                      >
                        <option value="Good — Restock">Good — Restock (Restores Inventory)</option>
                        <option value="Damaged — Do Not Restock">Damaged — Do Not Restock (No Stock Increase)</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <PremiumLabel label="Settlement Method *" />
                      <select
                        value={formSettlementMethod}
                        onChange={(e) => setFormSettlementMethod(e.target.value)}
                        className="w-full h-[40px] px-3 border border-slate-200 text-sm bg-white rounded-lg font-semibold"
                      >
                        <option value="Deduct from Customer Credit">Deduct from Customer Credit</option>
                        <option value="Refund">Refund Customer</option>
                      </select>
                    </div>
                  </div>

                  {/* Refund Method options if Refund selected */}
                  {formSettlementMethod === 'Refund' && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex flex-col">
                        <PremiumLabel label="Refund Method *" />
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setFormRefundType('Cash')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${formRefundType === 'Cash' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                          >
                            Cash Refund
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormRefundType('Bank')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${formRefundType === 'Bank' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                          >
                            Bank Refund
                          </button>
                        </div>
                      </div>

                      {formRefundType === 'Cash' && (
                        <div className="flex flex-col">
                          <PremiumLabel label="Cash Account / Cash Book *" />
                          <select value={formCashBookId} onChange={(e) => setFormCashBookId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                            <option value="">Select Cash Register...</option>
                            {cashRegisters.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {formRefundType === 'Bank' && (
                        <div className="flex flex-col">
                          <PremiumLabel label="Bank Account *" />
                          <select value={formBankAccountId} onChange={(e) => setFormBankAccountId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                            <option value="">Select Bank Account...</option>
                            {banks.map((b: any) => (
                              <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Human-friendly Return Settlement Preview */}
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-950">
                    <div className="font-extrabold uppercase text-[10px] tracking-wider text-blue-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      RETURN SETTLEMENT PREVIEW
                    </div>
                    <div className="space-y-1 pl-5 font-medium text-slate-700">
                      <div>
                        Inventory: <strong>{formReturnCondition.includes('Good') ? `+${parseFloat(formCases) || 0} Cases (${(parseFloat(formCases) || 0) * activeUnitsPerCase} Bottles) restocked to sellable stock` : `${parseFloat(formCases) || 0} Cases recorded as damaged (NO stock increase)`}</strong>
                      </div>
                      <div>
                        Settlement: <strong>{formSettlementMethod === 'Deduct from Customer Credit' ? `₹${((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} deducted/credited to customer ledger` : `₹${((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} refunded via ${formRefundType === 'Cash' ? 'Cash Register' : 'Bank Account'}`}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <PremiumLabel label="Reason for Return" />
                    <input type="text" value={formReturnReason} onChange={(e) => setFormReturnReason(e.target.value)} placeholder="Incorrect goods, defective..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                  </div>
                </div>
              )}

              {/* Damaged Goods Conditional UI */}
              {formType === 'Damage' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <PremiumLabel label="Damage Reason *" />
                      <select value={formDamageType} onChange={(e) => setFormDamageType(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm bg-white rounded-lg">
                        <option value="Broken">Broken</option>
                        <option value="Leak">Leak</option>
                        <option value="Expired">Expired</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <PremiumLabel label="Warehouse Location" />
                      <input type="text" value={formWarehouse} onChange={(e) => setFormWarehouse(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <EnterpriseNumberInput label="Quantity (Cases) *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                    <div className="flex flex-col">
                      <PremiumLabel label="Authorized By" />
                      <input type="text" value={formApprovedBy} onChange={(e) => setFormApprovedBy(e.target.value)} placeholder="Manager initials..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                  </div>
                </div>
              )}

              {/* Internal Consumption Conditional UI */}
              {formType === 'Internal Consumption' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <PremiumLabel label="Department *" />
                      <input type="text" value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} placeholder="E.g., Office, Logistics..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                    <div className="flex flex-col">
                      <PremiumLabel label="Purpose / Reason" />
                      <input type="text" value={formPurpose} onChange={(e) => setFormPurpose(e.target.value)} placeholder="E.g., Event, QA Test..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <EnterpriseNumberInput label="Quantity (Cases) *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                    <div className="flex flex-col">
                      <PremiumLabel label="Approved By" />
                      <input type="text" value={formApprovedBy} onChange={(e) => setFormApprovedBy(e.target.value)} placeholder="Approved by..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                  </div>
                </div>
              )}

              {/* Free Sample Conditional UI */}
              {formType === 'Free Sample' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  {/* Customer search selection */}
                  <SearchableDropdown
                    label="Customer *"
                    required
                    value={formCustomerId}
                    onChange={(val) => {
                      setFormCustomerId(val)
                      const found = customers.find(c => c.id === val)
                      if (found) setCustomerSearch(found.customerName)
                    }}
                    options={customers.map(c => ({
                      id: c.id,
                      name: c.customerName,
                      subtitle: c.phone || c.customerCode,
                      badge: c.customerType
                    }))}
                    placeholder="Select customer target..."
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <PremiumLabel label="Marketing Campaign" />
                      <input type="text" value={formMarketingCampaign} onChange={(e) => setFormMarketingCampaign(e.target.value)} placeholder="Summer promotion..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                    <div className="flex flex-col">
                      <PremiumLabel label="Sales Executive" />
                      <input type="text" value={formSalesPerson} onChange={(e) => setFormSalesPerson(e.target.value)} placeholder="Representative name..." className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1">
                    <EnterpriseNumberInput label="Quantity (Cases) *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                  </div>
                </div>
              )}

              {/* Stock Adjustment Conditional UI */}
              {formType === 'Stock Adjustment' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <PremiumLabel label="Adjustment Type *" />
                      <select value={formAdjustmentMode} onChange={(e) => setFormAdjustmentMode(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm bg-white rounded-lg">
                        <option value="Increase">Increase Stock (+)</option>
                        <option value="Decrease">Decrease Stock (-)</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <PremiumLabel label="Adjustment Reason" />
                      <select value={formAdjustmentReason} onChange={(e) => setFormAdjustmentReason(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm bg-white rounded-lg">
                        <option value="Correction">Physical Audit Correction</option>
                        <option value="Reconciliation">Reconciliation Offset</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1">
                    <EnterpriseNumberInput label="Adjustment Quantity (Cases) *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                  </div>
                </div>
              )}

              {/* General Reference & Remarks fields for non-sales types */}
              {formType !== 'Sales Dispatch' && formType !== 'Customer Return' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div className="flex flex-col">
                    <PremiumLabel label="Reference Number" />
                    <input type="text" value={formRef} onChange={(e) => setFormRef(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                  </div>
                  <div className="flex flex-col">
                    <PremiumLabel label="Remarks" />
                    <input type="text" value={formRemarks} onChange={(e) => setFormRemarks(e.target.value)} className="w-full h-[40px] px-3 border border-slate-200 text-sm rounded-lg" />
                  </div>
                </div>
              )}

              {/* ACCOUNTING PREVIEW SECTION */}
              {accountingImpactPreview.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-blue-600" />
                      Accounting Preview
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDetailedAccounting(!showDetailedAccounting)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      Accounting Details {showDetailedAccounting ? '▲' : '▼'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    This shows how this transaction will affect your accounts when saved.
                  </p>

                  {/* Human-friendly explanation bullets */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
                    <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-1">What happens when you save?</div>
                    {formType === 'Customer Return' && (
                      <>
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span><strong>{parseFloat(formCases) || 0} cases</strong> will be added back to inventory.</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Return value: <strong>₹{((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {formRefundMethod === 'Cash' ? '₹' + ((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' will be refunded to customer in cash.' :
                              formRefundMethod === 'Bank' ? '₹' + ((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' will be refunded through bank account.' :
                                '₹' + ((parseFloat(formCases) || 0) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' will be credited to customer account.'}
                          </span>
                        </div>
                      </>
                    )}
                    {formType === 'Sales Dispatch' && (
                      <>
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span><strong>{parseFloat(formCases) || 0} cases</strong> will be deducted from inventory.</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Sales revenue: <strong>₹{(parseFloat(formCases) * (parseFloat(formUnitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                      </>
                    )}
                    {formType !== 'Customer Return' && formType !== 'Sales Dispatch' && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Inventory adjustment recorded for <strong>{parseFloat(formCases) || 0} cases</strong>.</span>
                      </div>
                    )}
                  </div>

                  {/* Detailed double-entry table */}
                  {showDetailedAccounting && (
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mt-2">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                            <th className="py-1.5 px-3">Account</th>
                            <th className="py-1.5 px-3 text-right">Debit</th>
                            <th className="py-1.5 px-3 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {accountingImpactPreview.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-1.5 px-3 font-semibold">{item.account}</td>
                              <td className="py-1.5 px-3 text-right font-bold text-blue-700">
                                {item.type === 'Debit' ? `₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-slate-600">
                                {item.type === 'Credit' ? `₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <EnterpriseButton
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 bg-blue-650 hover:bg-blue-750 text-white rounded-lg h-11 text-sm font-semibold transition-all shadow-md shadow-blue-200/50 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving Transaction...
                    </>
                  ) : (
                    'Record Transaction'
                  )}
                </EnterpriseButton>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="w-[100px] h-11 border border-slate-200 text-slate-500 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && selectedTxn && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
            <div className={`bg-white border border-slate-200 w-full ${formType === 'Sales Dispatch' ? 'max-w-5xl' : 'max-w-2xl'} rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200`}>
            <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
                Edit Transaction: {selectedTxn.transactionNumber}
              </h2>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-250 rounded-lg p-3.5 text-xs text-amber-800 flex items-start gap-2.5 leading-relaxed">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Important Stock Reversal Alert:</span>
                  <p className="mt-0.5">
                    Modifying this transaction will automatically reverse the original stock movement of <strong>{selectedTxn.cases} Cases</strong> before applying the new quantity. This prevents stock duplication or inconsistencies.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <PremiumLabel label="Transaction Type *" />
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] bg-white rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Sales Dispatch">Sales Dispatch</option>
                    <option value="Customer Return">Customer Return</option>
                    <option value="Damage">Damaged Goods</option>
                    <option value="Internal Consumption">Internal Consumption</option>
                    <option value="Free Sample">Free Sample</option>
                    <option value="Stock Adjustment">Stock Adjustment</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <PremiumLabel label="Transaction Date *" />
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              {/* Single Product Selection (for non-Sales Dispatch types) */}
              {formType !== 'Sales Dispatch' && (
                <div className="flex flex-col">
                  <PremiumLabel label="Product *" />
                  <select
                    value={formProductId}
                    onChange={(e) => setFormProductId(e.target.value)}
                    className="w-full h-[40px] px-3.5 border border-slate-200 text-[14px] bg-white rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select Finished Product...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Multi-Product Sales Dispatch Form */}
              {formType === 'Sales Dispatch' && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  {/* Invoice Category & Document Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50/80 border border-slate-200 rounded-xl">

                    {/* Invoice Category */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-700">Invoice Category</span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {formInvoiceType === 'B2B' ? 'With GSTIN' : 'Retail / Cash'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 h-[38px]">
                        <button
                          type="button"
                          onClick={() => setFormInvoiceType('B2B')}
                          className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            formInvoiceType === 'B2B'
                              ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                              : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          B2B (Business)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormInvoiceType('B2C')}
                          className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            formInvoiceType === 'B2C'
                              ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                              : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          B2C (Retail)
                        </button>
                      </div>
                    </div>
                    {/* Document Type */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-700">Document Type</span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {formBillType === 'Tax Invoice' ? 'GST Breakdown' : 'Non-Taxable'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 h-[38px]">
                        <button
                          type="button"
                          onClick={() => setFormBillType('Tax Invoice')}
                          className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            formBillType === 'Tax Invoice'
                              ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                              : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Tax Invoice
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormBillType('Bill of Supply')}
                          className={`px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            formBillType === 'Bill of Supply'
                              ? 'bg-[#12A89A] text-white border-[#12A89A] shadow-xs'
                              : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Bill of Supply
                        </button>
                      </div>
                    </div>
                  </div>

                {/* Shared Customer Selection */}
                <SearchableDropdown
                  label="Customer / Distributor"
                  required
                  value={formCustomerId}
                  onChange={handleCustomerSelect}
                  options={customers.map(c => ({
                    id: c.id,
                    name: c.customerName,
                    subtitle: c.phone || c.customerCode,
                    badge: c.customerType
                  }))}
                  placeholder="Search customer by name, code, or phone..."
                  onQuickAdd={handleQuickCreateCustomer}
                  quickAddLabel="Quick Add Customer"
                />

                  {/* Dynamic Multi-Product Order Items Table */}
                  <OrderItemsTableSection
                    orderItems={orderItems}
                    rowErrors={rowErrors}
                    products={products}
                    caseConfigs={caseConfigs}
                    onAddRow={handleAddRow}
                    onRemoveRow={handleRemoveRow}
                    onChangeRow={handleRowChange}
                  />

                  {/* Consolidated Transaction Summary Card */}
                  <OrderTransactionSummaryCard summary={orderSummary} />

                  {/* Shared Payment Details Section */}
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Payment Method */}
                      <div className="flex flex-col">
                        <PremiumLabel label="Payment Method *" />
                        <div className="flex gap-2">
                          {['Cash', 'Bank', 'Credit', 'UPI', 'Cheque'].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setFormPaymentMethod(m)
                                if (m === 'Credit') {
                                  setFormAmountReceived('0')
                                  if (formPaymentTerms === 'COD' || formPaymentTerms === 'Immediate') {
                                    setFormPaymentTerms('Credit')
                                  }
                                } else {
                                  if (formPaymentTerms === 'Credit' || formPaymentTerms.startsWith('Net')) {
                                    setFormPaymentTerms('Immediate')
                                    setFormAmountReceived(orderSummary.grandTotal.toString())
                                  } else if (formPaymentTerms === 'Immediate') {
                                    setFormAmountReceived(orderSummary.grandTotal.toString())
                                  }
                                }
                              }}
                              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${formPaymentMethod === m ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Payment Terms */}
                      <div className="flex flex-col">
                        <PremiumLabel label="Payment Terms *" />
                        <select
                          value={formPaymentTerms}
                          onChange={(e) => {
                            const terms = e.target.value
                            setFormPaymentTerms(terms)
                            if (terms === 'COD') {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormAmountReceived('0')
                            } else if (terms === 'Credit' || terms.startsWith('Net')) {
                              setFormPaymentMethod('Credit')
                              setFormAmountReceived('0')
                            } else if (terms === 'Immediate') {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormAmountReceived(orderSummary.grandTotal.toString())
                            }
                          }}
                          className="w-full h-[40px] px-3 border border-slate-200 rounded-lg text-xs bg-white font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="Immediate">Immediate / Advance</option>
                          <option value="COD" disabled={formPaymentMethod === 'Credit'}>Cash on Delivery (COD){formPaymentMethod === 'Credit' ? ' (Select Cash/Bank method)' : ''}</option>
                          <option value="Net 7">Net 7 Days</option>
                          <option value="Net 15">Net 15 Days</option>
                          <option value="Net 30">Net 30 Days</option>
                          <option value="Credit">Credit Agreement</option>
                        </select>
                      </div>
                    </div>

                    {/* Amount Received Now Card */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <PremiumLabel label="Amount Received Now (₹)" />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (formPaymentMethod === 'Credit') setFormPaymentMethod('Cash')
                              setFormPaymentTerms('Immediate')
                              setFormAmountReceived(orderSummary.grandTotal.toString())
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md cursor-pointer transition-colors"
                          >
                            Pay Full (₹{orderSummary.grandTotal.toFixed(2)})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormAmountReceived('0')
                              if (formPaymentMethod === 'Credit') {
                                setFormPaymentTerms('Credit')
                              } else if (formPaymentTerms === 'Immediate') {
                                setFormPaymentTerms('COD')
                              }
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-md cursor-pointer transition-colors"
                          >
                            COD / Pending (₹0)
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={orderSummary.grandTotal}
                        value={formAmountReceived}
                        onChange={(e) => setFormAmountReceived(e.target.value)}
                        placeholder={`0.00 (Max: ₹${orderSummary.grandTotal.toFixed(2)})`}
                        className="w-full h-[38px] px-3 border border-slate-200 text-sm font-semibold rounded-lg bg-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
                        <span>Total GST: <strong className="text-slate-800 font-mono">₹{orderSummary.totalGst.toFixed(2)}</strong> · Total Invoice: <strong className="text-slate-800 font-mono">₹{orderSummary.grandTotal.toFixed(2)}</strong></span>
                        <span>Pending Balance: <strong className={`font-mono font-bold ${orderSummary.pendingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          ₹{orderSummary.pendingBalance.toFixed(2)}
                        </strong></span>
                      </div>

                      {formPaymentMethod === 'Credit' && orderSummary.received >= orderSummary.grandTotal && orderSummary.grandTotal > 0 && (
                        <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold mt-1">
                          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Full invoice amount received upfront. This is an immediate cash/bank sale rather than credit.</span>
                        </div>
                      )}
                    </div>

                    {/* Customer Credit exposure warning */}
                    {formPaymentMethod === 'Credit' && selectedCustomerInForm && (
                      <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl space-y-2 text-xs select-none">
                        <div className="flex justify-between items-center text-[#92400E] font-semibold">
                          <span>Customer Outstanding Balance:</span>
                          <span className="font-bold text-[#78350F] font-mono">₹{(selectedCustomerInForm.outstandingPlaceholder || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Credit Limit:</span>
                          <span className="font-bold font-mono">₹{(selectedCustomerInForm.creditLimit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {selectedCustomerInForm.creditLimit > 0 && (
                          <div className="flex justify-between items-center text-slate-600">
                            <span>Available Credit:</span>
                            <span className={`font-bold font-mono ${(selectedCustomerInForm.creditLimit - (selectedCustomerInForm.outstandingPlaceholder || 0)) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              ₹{(selectedCustomerInForm.creditLimit - (selectedCustomerInForm.outstandingPlaceholder || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {selectedCustomerInForm.creditLimit > 0 &&
                          ((selectedCustomerInForm.outstandingPlaceholder || 0) + orderSummary.grandTotal) > selectedCustomerInForm.creditLimit && (
                            <div className="flex items-center gap-1.5 text-red-700 bg-red-100/80 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold mt-1">
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                              <span>Warning: Total credit exposure exceeds customer credit limit!</span>
                            </div>
                          )}
                      </div>
                    )}

                    {/* Bank Account dropdown */}
                    {['Bank', 'UPI', 'Cheque'].includes(formPaymentMethod) && (
                      <div className="flex flex-col">
                        <PremiumLabel label="Company Bank Account *" />
                        <select value={formBankAccountId} onChange={(e) => setFormBankAccountId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                          <option value="">Select Account...</option>
                          {banks.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Cash Book dropdown */}
                    {formPaymentMethod === 'Cash' && (
                      <div className="flex flex-col">
                        <PremiumLabel label="Company Cash Book Register *" />
                        <select value={formCashBookId} onChange={(e) => setFormCashBookId(e.target.value)} className="w-full h-[40px] border border-slate-200 rounded-lg text-sm bg-white font-medium">
                          <option value="">Select Cash Register...</option>
                          {cashRegisters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Optional Transaction Remarks */}
                    <div className="flex flex-col">
                      <PremiumLabel label="Transaction Remarks (Optional)" />
                      <input
                        type="text"
                        value={formRemarks}
                        onChange={(e) => setFormRemarks(e.target.value)}
                        placeholder="e.g. Dispatched via Express Logistics / Truck #KA-01-1234"
                        className="w-full h-[40px] px-3.5 border border-slate-200 text-sm rounded-lg bg-white font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {formType !== 'Sales Dispatch' && (
                <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4">
                  <EnterpriseNumberInput label="Cases Quantity *" value={formCases} onChange={(e) => setFormCases(e.target.value)} placeholder="0" allowDecimals={false} />
                </div>
              )}

              {/* Accounting preview for edits */}
              {accountingImpactPreview.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Live Accounting Impact Preview</span>
                  <div className="divide-y divide-slate-100 text-[12px] font-mono">
                    {accountingImpactPreview.map((item, i) => (
                      <div key={i} className="flex justify-between py-1.5">
                        <span className={item.type === 'Credit' ? 'pl-6 text-slate-500' : 'font-semibold text-slate-800'}>{item.account}</span>
                        <span className="font-bold">({item.type === 'Credit' ? 'Cr' : 'Dr'}) ₹{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <EnterpriseButton
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 bg-amber-650 hover:bg-amber-700 text-white rounded-lg h-11 text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Updating Transaction...
                    </>
                  ) : (
                    'Update Transaction'
                  )}
                </EnterpriseButton>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="w-[100px] h-11 border border-slate-200 text-slate-500 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteOpen && selectedTxn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex justify-center items-center p-4">
          <div className="bg-white border border-slate-100 w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3.5 text-rose-600">
              <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-850 leading-tight">Reverse Stock & Delete?</h3>
                <p className="text-xs text-slate-450 mt-1 leading-normal">
                  This transaction will be soft-deleted. The inventory effect will be automatically reversed.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4.5 space-y-3 text-xs text-slate-650">
              <div className="flex justify-between border-b border-slate-150/40 pb-2">
                <span className="font-semibold text-slate-400">Transaction ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedTxn.transactionNumber}</span>
              </div>
              <div className="flex justify-between border-b border-slate-150/40 pb-2">
                <span className="font-semibold text-slate-400">Product:</span>
                <span className="font-bold text-slate-800">{selectedTxn.productName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-150/40 pb-2">
                <span className="font-semibold text-slate-400">Customer:</span>
                <span className="font-bold text-slate-800">{selectedTxn.customerName}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="font-bold text-slate-650 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Inventory Restored:
                </span>
                <span className="font-black font-mono text-emerald-600 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-lg text-xs">
                  {selectedTxn.transactionType === 'Customer Return' ? '-' : '+'}{selectedTxn.cases} Cases
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => deleteMutation.mutate(selectedTxn.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-11 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200/50 active:scale-[0.98] cursor-pointer"
              >
                {deleteMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing Reversal...
                  </>
                ) : (
                  'Confirm & Reverse'
                )}
              </button>
              <button
                onClick={() => setIsDeleteOpen(false)}
                className="w-[100px] h-11 border border-slate-200 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPATCH HISTORY MODAL */}
      {isHistoryOpen && historyDispatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  Transaction History & Traceability
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Dispatch Reference: {historyDispatch.transactionNumber}
                </p>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. ORIGINAL DISPATCH SUMMARY CARD */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
                  <Package className="w-4 h-4 text-purple-600" />
                  ORIGINAL SALES DISPATCH SUMMARY
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block">Customer:</span>
                    <span className="font-bold text-slate-800">{historyRes?.data?.parentDispatch?.customerName || historyDispatch.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Product:</span>
                    <span className="font-bold text-slate-800">{historyRes?.data?.parentDispatch?.productName || historyDispatch.productName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Original Quantity:</span>
                    <span className="font-black text-slate-900">{Math.abs(historyRes?.data?.parentDispatch?.originalCases || historyDispatch.cases)} Cases</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Total Value:</span>
                    <span className="font-bold text-slate-800">₹{(historyRes?.data?.parentDispatch?.totalAmount || historyDispatch.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* 2. CHRONOLOGICAL TIMELINE SECTION */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  TRANSACTION TIMELINE
                </h3>

                {isHistoryLoading ? (
                  <div className="py-12 flex justify-center items-center gap-2 text-xs text-slate-400">
                    <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
                    Loading dispatch timeline...
                  </div>
                ) : !historyRes?.data?.history || historyRes.data.history.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400">
                    No returns or damages recorded for this dispatch.
                  </div>
                ) : (
                  <div className="space-y-3 relative pl-4 border-l-2 border-slate-200 ml-2">
                    {sortedHistoryItems.map((item) => (
                      <div
                        key={item.id}
                        className={`relative p-4 rounded-xl border transition-all ${
                          item.isParent
                            ? 'bg-blue-50/40 border-blue-200 shadow-2xs'
                            : item.transactionType === 'Customer Return'
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : 'bg-rose-50/30 border-rose-200'
                        }`}
                      >
                        {/* Dot Connector */}
                        <div className={`absolute -left-[23px] top-5 w-3 h-3 rounded-full border-2 bg-white ${
                          item.isParent ? 'border-blue-600 bg-blue-600' :
                          item.transactionType === 'Customer Return' ? 'border-emerald-600 bg-emerald-600' :
                          'border-rose-600 bg-rose-600'
                        }`} />

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/60 text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              item.isParent ? 'bg-blue-100 text-blue-800' :
                              item.transactionType === 'Customer Return' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {item.isParent ? 'ORIGINAL SALES DISPATCH' : item.transactionType}
                            </span>
                            <span className="font-mono text-slate-500 font-semibold">{item.transactionNumber}</span>
                          </div>
                          <div className="text-slate-500 text-[11px] font-medium">
                            {new Date(item.createdAt || item.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-xs items-center">
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Quantity</span>
                            <span className="font-extrabold text-slate-900">{item.cases} Cases</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Amount</span>
                            <span className="font-extrabold text-slate-900">₹{(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Settlement</span>
                            <span className="font-bold text-slate-700">{item.paymentMethod || 'Credit'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Created By</span>
                            <span className="font-bold text-slate-700">{item.createdBy}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. SUMMARY METRICS CARD */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
                  <Landmark className="w-4 h-4 text-purple-600" />
                  SUMMARY BREAKDOWN
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-900">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Original Dispatch</span>
                    <span className="font-black text-base">{historyRes?.data?.parentDispatch?.originalCases ?? Math.abs(historyDispatch.cases)} Cases</span>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Total Returned</span>
                    <span className="font-black text-base">{historyRes?.data?.parentDispatch?.returnedCases || 0} Cases</span>
                  </div>
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950">
                    <span className="text-[10px] font-bold text-rose-700 uppercase block">Total Damaged</span>
                    <span className="font-black text-base">{historyRes?.data?.parentDispatch?.damagedCases || 0} Cases</span>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-950">
                    <span className="text-[10px] font-bold text-blue-700 uppercase block">Remaining Available</span>
                    <span className="font-black text-base">{historyRes?.data?.parentDispatch?.remainingCases ?? Math.abs(historyDispatch.cases)} Cases</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="px-6 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT MODAL */}
      {isCollectModalOpen && collectTxn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Collect Credit Amount</h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {collectTxn.transactionNumber} • {collectTxn.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!collectPaymentMutation.isPending) {
                    setIsCollectModalOpen(false)
                    setCollectTxn(null)
                  }
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content & Form */}
            <form onSubmit={handleConfirmCollect} className="p-5 space-y-4">
              {/* Transaction Summary Card */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Original</span>
                    <span className="font-mono font-bold text-slate-800">
                      ₹{(collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Collected</span>
                    <span className="font-mono font-bold text-emerald-600">
                      ₹{(collectTxn.amountReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-amber-200/80 bg-amber-50/30 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">Outstanding</span>
                    <span className="font-mono font-black text-amber-800">
                      ₹{(collectTxn.outstandingAmount ?? Math.max(0, (collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))) - (collectTxn.amountReceived || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Input Fields */}
              <div className="space-y-3">
                {/* Collection Amount */}
                <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[12px] font-bold text-slate-700">Collection Amount (₹) *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const bal = collectTxn.outstandingAmount ?? Math.max(0, (collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))) - (collectTxn.amountReceived || 0))
                        setCollectAmount(bal)
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer underline"
                    >
                      Collect Full Balance
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={collectTxn.outstandingAmount ?? Math.max(0, (collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))) - (collectTxn.amountReceived || 0))}
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount to collect..."
                    required
                    className="w-full h-[38px] px-3.5 border border-slate-300 text-sm font-mono font-bold text-slate-800 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {typeof collectAmount === 'number' && collectAmount > (collectTxn.outstandingAmount ?? Math.max(0, (collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))) - (collectTxn.amountReceived || 0))) && (
                    <span className="text-[11px] text-rose-600 font-semibold mt-1">
                      Amount cannot exceed outstanding balance of ₹{(collectTxn.outstandingAmount ?? Math.max(0, (collectTxn.totalAmount || (collectTxn.cases * (collectTxn.unitPrice || 0))) - (collectTxn.amountReceived || 0))).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Payment Method & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Payment Method *</label>
                    <select
                      value={collectPaymentMethod}
                      onChange={(e) => setCollectPaymentMethod(e.target.value)}
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs font-semibold bg-white rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank Transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Collection Date</label>
                    <input
                      type="date"
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs font-semibold bg-white rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Account Selection based on Payment Method */}
                {collectPaymentMethod === 'Cash' ? (
                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Deposit To Cash Register *</label>
                    <select
                      value={collectCashBookId}
                      onChange={(e) => setCollectCashBookId(e.target.value)}
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs font-medium bg-white rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      {cashRegisters.length === 0 && <option value="">Default Main Cash Register</option>}
                      {cashRegisters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Current: ₹{c.currentBalance.toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Deposit To Bank Account *</label>
                    <select
                      value={collectBankAccountId}
                      onChange={(e) => setCollectBankAccountId(e.target.value)}
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs font-medium bg-white rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      {banks.length === 0 && <option value="">Default Company Bank Account</option>}
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} - {b.accountNumber} (Balance: ₹{b.currentBalance.toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reference Number & Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Payment Ref / UTR / Cheque #</label>
                    <input
                      type="text"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      placeholder="e.g. UTR-98213892..."
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[12px] font-bold text-slate-700 mb-1">Notes / Remarks</label>
                    <input
                      type="text"
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      placeholder="e.g. Partial collection..."
                      className="w-full h-[36px] px-3 border border-slate-300 text-xs rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={collectPaymentMutation.isPending || !collectAmount || (typeof collectAmount === 'number' && collectAmount <= 0)}
                  className="flex-1 h-[38px] bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  {collectPaymentMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Collecting Payment...
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4" />
                      Collect ₹{(typeof collectAmount === 'number' ? collectAmount : parseFloat(collectAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={collectPaymentMutation.isPending}
                  onClick={() => {
                    setIsCollectModalOpen(false)
                    setCollectTxn(null)
                  }}
                  className="w-[80px] h-[38px] border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Case Configuration Modal */}
      <QuickCreateCaseConfigModal
        isOpen={isQuickCreateConfigOpen}
        onClose={() => setIsQuickCreateConfigOpen(false)}
        productId={formProductId}
        productName={products.find(p => p.id === formProductId)?.name}
        onSuccess={handleQuickCreateConfigSuccess}
      />

      {/* Quick Add Customer / Distributor Modal */}
      <QuickAddCustomerModal
        isOpen={isQuickAddCustomerOpen}
        onClose={() => setIsQuickAddCustomerOpen(false)}
        onSuccess={(newCustomer) => {
          setFormCustomerId(newCustomer.id)
          setCustomerSearch(newCustomer.customerName)
          if (newCustomer.paymentTerms) setFormPaymentTerms(newCustomer.paymentTerms)
        }}
      />

      {/* Customer Product-Wise Pricing Modal */}
      {pricingCustomer && (
        <CustomerProductPricingModal
          isOpen={isProductPricingModalOpen}
          onClose={() => {
            setIsProductPricingModalOpen(false)
            setPricingCustomer(null)
          }}
          customerId={pricingCustomer.id}
          customerName={pricingCustomer.name}
          customerCode={pricingCustomer.code}
          products={products.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku || '',
            baseSellingPrice: p.sellingPrice || 0
          }))}
          onSaved={() => {
            if (formCustomerId && formProductId) {
              customersService.getApplicablePrice(formCustomerId, formProductId)
                .then(res => {
                  setApplicablePricing(res)
                  if (res?.applicablePrice != null) {
                    setFormUnitPrice(res.applicablePrice.toString())
                  }
                })
                .catch(() => {})
            }
          }}
        />
      )}
      {/* BillAura-style GST & Bill of Supply Invoice Viewer & Downloader Modal */}
      <InvoiceViewerModal
        isOpen={isInvoiceViewerOpen}
        onClose={() => setIsInvoiceViewerOpen(false)}
        transaction={invoiceModalTxn}
        companySettings={companySettings}
      />
    </PageContainer>
  )
}
