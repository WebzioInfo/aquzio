import React, { useState, useEffect } from 'react'
import {
  Calendar, Download, RefreshCw, Filter, ChevronDown, ChevronUp,
  FileText, TrendingUp, Package, ShoppingCart, Truck, AlertTriangle,
  RotateCcw, Activity, Users, Boxes, DollarSign, Droplets, CheckCircle,
  XCircle, Clock, Search, Layers, Sliders, ArrowUpRight, ArrowDownRight,
  ShieldCheck, Printer, BarChart3, PieChart, Sparkles
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, type BusinessReportDto, type ProfitAndLossReportDto, type ReportFilterRequest } from '../../services/api/reports'
import { productsService } from '../../services/products'
import { customersService } from '../../services/customers'
import { generateBusinessReportPDF, generateProfitAndLossPDF } from '../../utils/businessReportPdfEngine'
import { useNotificationStore } from '../../store/useNotificationStore'
import EnterpriseCard from '../../components/ui/EnterpriseCard'
import EnterpriseButton from '../../components/ui/EnterpriseButton'
import EnterpriseBadge from '../../components/ui/EnterpriseBadge'
import EnterpriseEmptyState from '../../components/ui/EnterpriseEmptyState'

// Preset date ranges helper
const getPresetDates = (preset: string): { from: string; to: string } => {
  const now = new Date()
  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const todayStr = formatDate(now)

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = formatDate(y)
      return { from: yStr, to: yStr }
    }
    case '7days': {
      const past7 = new Date(now)
      past7.setDate(past7.getDate() - 6)
      return { from: formatDate(past7), to: todayStr }
    }
    case '30days': {
      const past30 = new Date(now)
      past30.setDate(past30.getDate() - 29)
      return { from: formatDate(past30), to: todayStr }
    }
    case 'this_month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: formatDate(startOfMonth), to: todayStr }
    }
    case 'last_month': {
      const startOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endOfLast = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: formatDate(startOfLast), to: formatDate(endOfLast) }
    }
    case 'this_year': {
      const startOfYear = new Date(now.getFullYear(), 0, 1)
      return { from: formatDate(startOfYear), to: todayStr }
    }
    default:
      return { from: todayStr, to: todayStr }
  }
}

export const ReportsPage: React.FC = () => {
  const { showToast } = useNotificationStore()

  // Filter State
  const [selectedPreset, setSelectedPreset] = useState<string>('30days')
  const defaultDates = getPresetDates('30days')
  const [dateFrom, setDateFrom] = useState<string>(defaultDates.from)
  const [dateTo, setDateTo] = useState<string>(defaultDates.to)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')

  // Active Report & Stale tracking
  const [activeReport, setActiveReport] = useState<BusinessReportDto | null>(null)
  const [pnlReport, setPnlReport] = useState<ProfitAndLossReportDto | null>(null)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false)
  const [isStale, setIsStale] = useState<boolean>(false)

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>('overview')

  // Search filter for tables
  const [tableSearch, setTableSearch] = useState<string>('')

  // Fetch product and customer lists for advanced dropdowns
  const { data: productsData } = useQuery({
    queryKey: ['reportFilterProducts'],
    queryFn: async () => {
      const res = await productsService.getProducts(1, 100)
      return res.data?.items || []
    },
    staleTime: 5 * 60 * 1000
  })

  const { data: customersData } = useQuery({
    queryKey: ['reportFilterCustomers'],
    queryFn: async () => {
      const res = await customersService.getCustomers(1, 100)
      return res.data?.items || []
    },
    staleTime: 5 * 60 * 1000
  })

  // Handle Generating Report
  const handleGenerateReport = async () => {
    if (new Date(dateFrom) > new Date(dateTo)) {
      showToast('From Date cannot be later than To Date.', 'error')
      return
    }

    setIsGenerating(true)
    try {
      const request: ReportFilterRequest = {
        dateFrom,
        dateTo,
        preset: selectedPreset,
        productId: selectedProductId || null,
        customerId: selectedCustomerId || null,
        status: selectedStatus || null
      }

      const [res, pnlRes] = await Promise.all([
        reportsApi.generateReport(request),
        reportsApi.generateProfitAndLoss(request)
      ])
      if (res.success && res.data) {
        setActiveReport(res.data)
        if (pnlRes.success && pnlRes.data) {
          setPnlReport(pnlRes.data)
        }
        setIsStale(false)
        showToast('Business report generated successfully.', 'success')
      } else {
        showToast(res.message || 'Failed to generate report.', 'error')
      }
    } catch (err: any) {
      console.error('Report generation error:', err)
      showToast(err.response?.data?.message || err.message || 'Failed to generate report from server.', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Initial report fetch on page load
  useEffect(() => {
    handleGenerateReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle Preset Selection
  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset)
    if (preset !== 'custom') {
      const dates = getPresetDates(preset)
      setDateFrom(dates.from)
      setDateTo(dates.to)
    }
    setIsStale(true)
  }

  // Handle Direct Date Change
  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    setSelectedPreset('custom')
    setIsStale(true)
  }

  // Handle PDF Export
  const handleDownloadPDF = () => {
    if (activeTab === 'pnl') {
      if (!pnlReport) {
        showToast('Please generate the Profit & Loss report first.', 'error')
        return
      }
      setIsDownloadingPdf(true)
      try {
        const pdf = generateProfitAndLossPDF(pnlReport)
        const cleanRange = pnlReport.period.formattedRange.replace(/[\s—]/g, '_')
        pdf.save(`Aquzio_Profit_And_Loss_${cleanRange}.pdf`)
        showToast('Profit & Loss PDF downloaded successfully.', 'success')
      } catch (pdfErr: any) {
        console.error('P&L PDF export failed:', pdfErr)
        showToast('Failed to generate P&L PDF document.', 'error')
      } finally {
        setIsDownloadingPdf(false)
      }
      return
    }

    if (!activeReport) {
      showToast('Please generate a report first.', 'error')
      return
    }

    setIsDownloadingPdf(true)
    try {
      const pdf = generateBusinessReportPDF(activeReport)
      const cleanRange = activeReport.period.formattedRange.replace(/[\s—]/g, '_')
      const fileName = `Aquzio_Business_Report_${cleanRange}.pdf`
      pdf.save(fileName)
      showToast('Business Report PDF downloaded successfully.', 'success')
    } catch (pdfErr: any) {
      console.error('PDF export failed:', pdfErr)
      showToast('Failed to generate PDF document.', 'error')
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  const curr = activeReport?.company.currencySymbol || '₹'

  const formatNum = (n: number | undefined | null) => {
    if (n === undefined || n === null) return '0'
    return Number(n).toLocaleString('en-IN')
  }

  const formatCurr = (n: number | undefined | null) => {
    if (n === undefined || n === null) return `${curr}0`
    return `${curr}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatPersonName = (name: string | undefined | null): string => {
    if (!name || ['null', 'undefined', '00000000-0000-0000-0000-000000000000'].includes(name.trim().toLowerCase())) return '—'
    const trimmed = name.trim()
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    if (isGuid) return '—'
    return trimmed
  }

  const presetsList = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'this_year', label: 'This Year' },
    { id: 'custom', label: 'Custom Range' },
  ]

  const tabs = [
    { id: 'overview', label: 'Executive Summary', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'production', label: 'Production', icon: <Layers className="w-4 h-4" />, count: activeReport?.production.batches.length },
    { id: 'sales', label: 'Sales Orders', icon: <ShoppingCart className="w-4 h-4" />, count: activeReport?.sales.transactions.length },
    { id: 'dispatch', label: 'Dispatches', icon: <Truck className="w-4 h-4" />, count: activeReport?.dispatch.dispatches.length },
    { id: 'returns_damages', label: 'Returns & Damages', icon: <RotateCcw className="w-4 h-4" />, count: (activeReport?.returns.returns.length || 0) + (activeReport?.damages.damages.length || 0) },
    { id: 'operations', label: '20L Operations', icon: <Activity className="w-4 h-4" />, count: activeReport?.operations.visits.length },
    { id: 'customers', label: 'Customer Performance', icon: <Users className="w-4 h-4" />, count: activeReport?.customers.customers.length },
    { id: 'inventory', label: 'Inventory Movement', icon: <Boxes className="w-4 h-4" />, count: activeReport?.inventory.productMovements.length },
    { id: 'accounts', label: 'Financials & Purchases', icon: <DollarSign className="w-4 h-4" />, count: activeReport?.financials.recentPurchases.length },
    { id: 'pnl', label: 'Profit & Loss', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'qc', label: 'Quality Control', icon: <Droplets className="w-4 h-4" />, count: activeReport?.qualityControl.recentTests.length },
  ]

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[16px] border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Reports & Business Intelligence
            </h1>
            <EnterpriseBadge variant="primary">Enterprise ERP</EnterpriseBadge>
          </div>
          <p className="text-xs text-slate-500">
            Consolidated multi-module operational summaries, production logs, sales ledgers, inventory movements, and financial statements.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <EnterpriseButton
            variant="secondary"
            onClick={handleDownloadPDF}
            disabled={!activeReport || isGenerating || isDownloadingPdf}
            loading={isDownloadingPdf}
            className="flex items-center gap-2 !h-[42px] px-4 font-semibold text-xs border-slate-300 hover:bg-slate-50 text-slate-700"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Download PDF</span>
          </EnterpriseButton>

          <EnterpriseButton
            variant="primary"
            onClick={handleGenerateReport}
            loading={isGenerating}
            disabled={isGenerating}
            className="flex items-center gap-2 !h-[42px] px-5 font-semibold text-xs shadow-sm shadow-blue-500/20"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Generate Report</span>
          </EnterpriseButton>
        </div>
      </div>

      {/* Filter Control Center */}
      <EnterpriseCard className="p-6">
        <div className="space-y-4">
          {/* Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Select Period Preset
              </label>
              {isStale && (
                <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                  Filter changed • Click 'Generate Report' to update
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {presetsList.map((p) => {
                const isSelected = selectedPreset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetChange(p.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 border border-slate-200/60'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date Picker Row & Advanced Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateChange(e.target.value, dateTo)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateChange(dateFrom, e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer h-[38px]"
              >
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>{showAdvancedFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters'}</span>
                {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 h-[38px] shadow-sm shadow-blue-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Generating...' : 'Apply Filters'}</span>
              </button>
            </div>
          </div>

          {/* Advanced Filters Expandable Drawer */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 animate-in fade-in duration-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Product Filter
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value)
                    setIsStale(true)
                  }}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                >
                  <option value="">All Products</option>
                  {productsData?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.brandName || 'Brand'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Customer Filter
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value)
                    setIsStale(true)
                  }}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                >
                  <option value="">All Customers</option>
                  {customersData?.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.customerName} ({c.customerType || 'B2B'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Status Scope
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value)
                    setIsStale(true)
                  }}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                >
                  <option value="">All Transaction Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>
            </div>
          )}

          {/* Active Period Banner */}
          {activeReport && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-900 uppercase tracking-wider text-[11px]">Active Report Period:</span>
                <span className="font-semibold text-blue-700 bg-white px-2.5 py-0.5 rounded-md border border-blue-200 shadow-xs">
                  {activeReport.period.formattedRange}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-600">Company: <strong>{activeReport.company.name}</strong></span>
              </div>

              <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                <span>Currency: <strong className="text-slate-800">{activeReport.company.currency} ({activeReport.company.currencySymbol})</strong></span>
                <span>Generated: <strong className="text-slate-800">{activeReport.period.generatedAtLocal}</strong></span>
              </div>
            </div>
          )}
        </div>
      </EnterpriseCard>

      {/* Loading Overlay State */}
      {isGenerating && !activeReport && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-sm font-bold text-slate-900">Aggregating Enterprise Records...</h3>
          <p className="text-xs text-slate-500 mt-1">Cross-referencing production batches, sales ledgers, dispatch manifests, and financial books.</p>
        </div>
      )}

      {/* Main Report Body */}
      {activeReport && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* High-Level Executive Summary Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Production */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Production</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatNum(activeReport.summary.totalCasesProduced)} <span className="text-xs font-medium text-slate-500">Cases</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span className="font-semibold text-emerald-600">{activeReport.summary.completedBatchesCount} Completed</span>
                <span>•</span>
                <span>{activeReport.summary.activeBatchesCount} Running Batches</span>
              </div>
            </div>

            {/* Total Sales Revenue */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Sales Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatCurr(activeReport.summary.totalSalesRevenue)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">{formatNum(activeReport.summary.totalSalesQuantity)} Cases</span>
                <span>•</span>
                <span>{activeReport.summary.totalSalesOrdersCount} Invoices</span>
              </div>
            </div>

            {/* Dispatches */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dispatches Delivered</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatNum(activeReport.summary.totalDispatchedQuantity)} <span className="text-xs font-medium text-slate-500">Cases</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span>{activeReport.summary.totalDispatchesCount} Dispatches</span>
                <span>•</span>
                <span>{activeReport.summary.uniqueVehiclesCount} Fleet Vehicles</span>
              </div>
            </div>

            {/* Net Sales Realized */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Net Realized Sales</span>
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-blue-700">
                {formatCurr(activeReport.summary.netSalesRevenue)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
                <span>{formatNum(activeReport.summary.netSalesQuantity)} Net Cases</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">{formatCurr(activeReport.summary.totalAmountReceived)} Paid</span>
              </div>
            </div>

            {/* Customer Returns */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customer Returns</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatNum(activeReport.summary.totalReturnedQuantity)} <span className="text-xs font-medium text-slate-500">Cases</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span>{formatCurr(activeReport.summary.totalReturnedAmount)} Total Value</span>
                <span>•</span>
                <span>{activeReport.summary.totalReturnsCount} Claims</span>
              </div>
            </div>

            {/* Damages & Spoilage */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Damages / Spoilage</span>
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatNum(activeReport.summary.totalDamagedQuantity)} <span className="text-xs font-medium text-slate-500">Cases</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span>{formatCurr(activeReport.summary.totalDamageCost)} Estimated Cost</span>
                <span>•</span>
                <span>{activeReport.summary.totalDamagesCount} Logs</span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Operating Expenses</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatCurr(activeReport.summary.totalOperatingExpenses)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span>{activeReport.financials.expenseCategories.length} Categories</span>
                <span>•</span>
                <span>General, Utilities, Fuel</span>
              </div>
            </div>

            {/* Material Purchases */}
            <div className="p-5 bg-white rounded-[14px] border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor Purchases</span>
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {formatCurr(activeReport.summary.totalPurchasesAmount)}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                <span className="text-emerald-600 font-semibold">{formatCurr(activeReport.financials.totalPurchasesPaid)} Paid</span>
                <span>•</span>
                <span className="text-red-500 font-semibold">{formatCurr(activeReport.financials.totalPurchasesOutstanding)} Due</span>
              </div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 select-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/70'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab Search Filter */}
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search across active table rows..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>

            <div className="text-xs text-slate-500">
              Showing report section: <strong className="text-slate-800">{tabs.find(t => t.id === activeTab)?.label}</strong>
            </div>
          </div>

          {/* ======================================================== */}
          {/* TAB 1: OVERVIEW & EXECUTIVE SUMMARY                      */}
          {/* ======================================================== */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Financial Balance Summary Card */}
              <div className="lg:col-span-2 space-y-6">
                <EnterpriseCard title="Period Revenue & Collections Performance">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Gross Invoiced</div>
                      <div className="text-xl font-bold text-slate-900">{formatCurr(activeReport.sales.totalGrossAmount)}</div>
                      <div className="text-[11px] text-slate-400 mt-1">Tax: {formatCurr(activeReport.sales.totalTaxAmount)}</div>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
                      <div className="text-xs font-semibold text-emerald-800 mb-1">Collections Realized</div>
                      <div className="text-xl font-bold text-emerald-700">{formatCurr(activeReport.sales.totalReceived)}</div>
                      <div className="text-[11px] text-emerald-600 mt-1">From active customer billings</div>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100">
                      <div className="text-xs font-semibold text-amber-800 mb-1">Sales Receivables</div>
                      <div className="text-xl font-bold text-amber-700">{formatCurr(activeReport.sales.totalOutstanding)}</div>
                      <div className="text-[11px] text-amber-600 mt-1">Pending payment balances</div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-600">Total Billed Volume:</span>
                      <span className="font-bold text-slate-900">{formatNum(activeReport.sales.totalQuantity)} Cases</span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-t border-slate-50">
                      <span className="text-slate-600">Discounts Conceded:</span>
                      <span className="font-bold text-slate-900">{formatCurr(activeReport.sales.totalDiscountAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1 border-t border-slate-50">
                      <span className="text-slate-600">Returns Deductions:</span>
                      <span className="font-bold text-red-600">-{formatCurr(activeReport.returns.totalReturnedAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold py-2 border-t border-slate-200 bg-slate-50 px-3 rounded-lg">
                      <span className="text-slate-900">Net Commercial Revenue:</span>
                      <span className="text-blue-700">{formatCurr(activeReport.summary.netSalesRevenue)}</span>
                    </div>
                  </div>
                </EnterpriseCard>

                {/* Operations & Wastage Quick Summary */}
                <EnterpriseCard title="Plant Operations & Production Summary">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-lg font-bold text-slate-900">{activeReport.production.totalBatches}</div>
                      <div className="text-[11px] text-slate-500 font-medium">Batches Total</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-lg font-bold text-slate-900">{formatNum(activeReport.production.totalCasesProduced)}</div>
                      <div className="text-[11px] text-slate-500 font-medium">Cases Produced</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-lg font-bold text-slate-900">{formatNum(activeReport.production.totalPreformWastage)}</div>
                      <div className="text-[11px] text-slate-500 font-medium">Preforms Waste</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="text-lg font-bold text-slate-900">{formatNum(activeReport.production.totalCapWastage)}</div>
                      <div className="text-[11px] text-slate-500 font-medium">Caps Waste</div>
                    </div>
                  </div>
                </EnterpriseCard>
              </div>

              {/* Company & Period Overview Sidebar Card */}
              <div className="space-y-6">
                <EnterpriseCard title="Enterprise Profile">
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Legal Entity</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5">{activeReport.company.name}</div>
                    </div>

                    {activeReport.company.address && (
                      <div>
                        <div className="text-slate-400 font-bold uppercase text-[10px]">Plant Address</div>
                        <div className="text-slate-700 mt-0.5 leading-relaxed">{activeReport.company.address}</div>
                      </div>
                    )}

                    {activeReport.company.gstNumber && (
                      <div>
                        <div className="text-slate-400 font-bold uppercase text-[10px]">GST Number</div>
                        <div className="text-slate-700 mt-0.5 font-mono">{activeReport.company.gstNumber}</div>
                      </div>
                    )}

                    {(activeReport.company.email || activeReport.company.phone) && (
                      <div>
                        <div className="text-slate-400 font-bold uppercase text-[10px]">Contact Details</div>
                        <div className="text-slate-700 mt-0.5">
                          {activeReport.company.phone && <span>{activeReport.company.phone}</span>}
                          {activeReport.company.email && <span className="block text-slate-500">{activeReport.company.email}</span>}
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100">
                      <EnterpriseButton
                        variant="secondary"
                        onClick={handleDownloadPDF}
                        disabled={isDownloadingPdf}
                        className="w-full flex items-center justify-center gap-2 text-xs font-bold"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-600" />
                        <span>Print Official PDF Report</span>
                      </EnterpriseButton>
                    </div>
                  </div>
                </EnterpriseCard>

                {/* Quality & Compliance Quick Card */}
                <EnterpriseCard title="Water Quality & Compliance">
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Tests Conducted:</span>
                      <span className="font-bold text-slate-900">{activeReport.qualityControl.totalTestsConducted}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Approved / Passed:</span>
                      <span className="font-bold text-emerald-600">{activeReport.qualityControl.totalPassed} Passed</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Failed / Rejected:</span>
                      <span className="font-bold text-red-600">{activeReport.qualityControl.totalFailed} Failed</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Under Incubation:</span>
                      <span className="font-bold text-amber-600">{activeReport.qualityControl.totalUnderIncubation} In Progress</span>
                    </div>
                  </div>
                </EnterpriseCard>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: PRODUCTION REPORT                                 */}
          {/* ======================================================== */}
          {activeTab === 'production' && (
            <div className="space-y-6">
              <EnterpriseCard title="Production Batches Executed">
                {activeReport.production.batches.length === 0 ? (
                  <EnterpriseEmptyState title="No Production Batches Found" description="No production batch executions were logged for this selected time window." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Batch Number</th>
                          <th className="py-2.5 px-3">Product Item</th>
                          <th className="py-2.5 px-3">Line & Shift</th>
                          <th className="py-2.5 px-3">Operator</th>
                          <th className="py-2.5 px-3 text-right">Target</th>
                          <th className="py-2.5 px-3 text-right">Produced</th>
                          <th className="py-2.5 px-3 text-right">Variance</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.production.batches
                          .filter(b => !tableSearch || b.batchNumber.toLowerCase().includes(tableSearch.toLowerCase()) || b.product.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{b.batchNumber}</td>
                              <td className="py-3 px-3 text-slate-700">{b.product || 'Standard Water'}</td>
                              <td className="py-3 px-3 text-slate-600">{b.productionLine} • {b.shift}</td>
                              <td className="py-3 px-3 text-slate-600">{formatPersonName(b.operatorName)}</td>
                              <td className="py-3 px-3 text-right font-medium text-slate-600">{formatNum(b.targetQuantity)}</td>
                              <td className="py-3 px-3 text-right font-bold text-slate-900">{formatNum(b.producedQuantity)}</td>
                              <td className={`py-3 px-3 text-right font-semibold ${b.variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {b.variance >= 0 ? `+${formatNum(b.variance)}` : formatNum(b.variance)}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <EnterpriseBadge variant={b.status === 'Completed' ? 'success' : 'primary'}>
                                  {b.status}
                                </EnterpriseBadge>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                          <td colSpan={4} className="py-3 px-3">Total Batches: {activeReport.production.totalBatches}</td>
                          <td className="py-3 px-3 text-right">{formatNum(activeReport.production.batches.reduce((acc, x) => acc + x.targetQuantity, 0))}</td>
                          <td className="py-3 px-3 text-right text-blue-700">{formatNum(activeReport.production.totalCasesProduced)} Cases</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </EnterpriseCard>

              {/* Raw Material Wastage in Production */}
              <EnterpriseCard title="Production Material Usage & Scrap Wastage">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Preform Wastage</span>
                    <div className="text-xl font-extrabold text-slate-900 mt-1">{formatNum(activeReport.production.totalPreformWastage)} <span className="text-xs font-normal text-slate-400">PCS</span></div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Cap Wastage</span>
                    <div className="text-xl font-extrabold text-slate-900 mt-1">{formatNum(activeReport.production.totalCapWastage)} <span className="text-xs font-normal text-slate-400">PCS</span></div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Label Wastage</span>
                    <div className="text-xl font-extrabold text-slate-900 mt-1">{formatNum(activeReport.production.totalLabelWastage)} <span className="text-xs font-normal text-slate-400">PCS</span></div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Shrink Wastage</span>
                    <div className="text-xl font-extrabold text-slate-900 mt-1">{formatNum(activeReport.production.totalShrinkWastage)} <span className="text-xs font-normal text-slate-400">KG</span></div>
                  </div>
                </div>
              </EnterpriseCard>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: SALES ORDERS                                      */}
          {/* ======================================================== */}
          {activeTab === 'sales' && (
            <EnterpriseCard title="Sales Invoices & Transactions">
              {activeReport.sales.transactions.length === 0 ? (
                <EnterpriseEmptyState title="No Sales Transactions Found" description="No customer sales transactions recorded during the active date filter." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                        <th className="py-2.5 px-3">Order / Invoice #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Customer Name</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3 text-right">Cases</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Total Amount</th>
                        <th className="py-2.5 px-3 text-right">Received</th>
                        <th className="py-2.5 px-3 text-right">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeReport.sales.transactions
                        .filter(s => !tableSearch || s.transactionNumber.toLowerCase().includes(tableSearch.toLowerCase()) || s.customerName.toLowerCase().includes(tableSearch.toLowerCase()))
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{s.transactionNumber}</td>
                            <td className="py-3 px-3 text-slate-600">{s.transactionDate ? new Date(s.transactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                            <td className="py-3 px-3 font-medium text-slate-800">{s.customerName}</td>
                            <td className="py-3 px-3 text-slate-600">{s.productName}</td>
                            <td className="py-3 px-3 text-right font-semibold text-slate-900">{formatNum(s.cases)}</td>
                            <td className="py-3 px-3 text-right text-slate-600">{formatCurr(s.unitPrice)}</td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurr(s.totalAmount)}</td>
                            <td className="py-3 px-3 text-right font-semibold text-emerald-700">{formatCurr(s.amountReceived)}</td>
                            <td className="py-3 px-3 text-right">
                              <EnterpriseBadge variant={s.paymentStatus === 'Paid' ? 'success' : (s.paymentStatus === 'Partial' ? 'warning' : 'danger')}>
                                {s.paymentStatus || s.status || 'Pending'}
                              </EnterpriseBadge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                        <td colSpan={4} className="py-3 px-3">Total Sales: {activeReport.sales.totalTransactions} Invoices</td>
                        <td className="py-3 px-3 text-right">{formatNum(activeReport.sales.totalQuantity)} Cases</td>
                        <td></td>
                        <td className="py-3 px-3 text-right text-blue-700">{formatCurr(activeReport.sales.totalGrossAmount)}</td>
                        <td className="py-3 px-3 text-right text-emerald-700">{formatCurr(activeReport.sales.totalReceived)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </EnterpriseCard>
          )}

          {/* ======================================================== */}
          {/* TAB 4: DISPATCHES & LOGISTICS                            */}
          {/* ======================================================== */}
          {activeTab === 'dispatch' && (
            <EnterpriseCard title="Dispatches & Fleet Manifests">
              {activeReport.dispatch.dispatches.length === 0 ? (
                <EnterpriseEmptyState title="No Dispatches Found" description="No loading or dispatch records registered during this selected date range." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                        <th className="py-2.5 px-3">Dispatch / Run #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Destination / Customer</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3">Vehicle #</th>
                        <th className="py-2.5 px-3">Driver / Operator</th>
                        <th className="py-2.5 px-3 text-right">Module</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeReport.dispatch.dispatches
                        .filter(d => !tableSearch || d.dispatchNumber.toLowerCase().includes(tableSearch.toLowerCase()) || d.customerName.toLowerCase().includes(tableSearch.toLowerCase()) || d.vehicleNumber.toLowerCase().includes(tableSearch.toLowerCase()))
                        .map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{d.dispatchNumber}</td>
                            <td className="py-3 px-3 text-slate-600">{d.dispatchDate ? new Date(d.dispatchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                            <td className="py-3 px-3 font-medium text-slate-800">{d.customerName}</td>
                            <td className="py-3 px-3 text-slate-600">{d.productName}</td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900">{formatNum(d.quantity)}</td>
                            <td className="py-3 px-3 font-mono text-slate-700">{d.vehicleNumber || '—'}</td>
                            <td className="py-3 px-3 text-slate-600">{formatPersonName(d.driverOrLoadedBy)}</td>
                            <td className="py-3 px-3 text-right">
                              <EnterpriseBadge variant={d.sourceModule.includes('20L') ? 'info' : 'primary'}>
                                {d.sourceModule}
                              </EnterpriseBadge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                        <td colSpan={4} className="py-3 px-3">Total Dispatches: {activeReport.dispatch.totalDispatches}</td>
                        <td className="py-3 px-3 text-right text-blue-700">{formatNum(activeReport.dispatch.totalDispatchedQuantity)} Cases</td>
                        <td colSpan={3} className="py-3 px-3 text-right text-slate-600">Unique Vehicles: {activeReport.dispatch.uniqueVehicles}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </EnterpriseCard>
          )}

          {/* ======================================================== */}
          {/* TAB 5: RETURNS & DAMAGES                                 */}
          {/* ======================================================== */}
          {activeTab === 'returns_damages' && (
            <div className="space-y-6">
              {/* Returns Section */}
              <EnterpriseCard title={`Customer Returns (${activeReport.returns.totalReturnsCount} records)`}>
                {activeReport.returns.returns.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No customer returns logged during this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Return #</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3 text-right">Returned Qty</th>
                          <th className="py-2.5 px-3 text-right">Value</th>
                          <th className="py-2.5 px-3">Return Type / Reason</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.returns.returns
                          .filter(r => !tableSearch || r.returnNumber.toLowerCase().includes(tableSearch.toLowerCase()) || r.customerName.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{r.returnNumber}</td>
                              <td className="py-3 px-3 text-slate-600">{r.returnDate ? new Date(r.returnDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                              <td className="py-3 px-3 font-medium text-slate-800">{r.customerName}</td>
                              <td className="py-3 px-3 text-slate-600">{r.productName}</td>
                              <td className="py-3 px-3 text-right font-bold text-amber-700">{formatNum(r.quantity)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-slate-900">{formatCurr(r.returnedAmount)}</td>
                              <td className="py-3 px-3 text-slate-600">{r.returnType || r.remarks || 'General Return'}</td>
                              <td className="py-3 px-3 text-right">
                                <EnterpriseBadge variant="warning">{r.status || 'Processed'}</EnterpriseBadge>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>

              {/* Damages Section */}
              <EnterpriseCard title={`Damaged Goods & Quarantine (${activeReport.damages.totalDamagesCount} records)`}>
                {activeReport.damages.damages.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No product damages or quarantine incidents logged during this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Damage / Incident #</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Product / Asset</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Est. Cost</th>
                          <th className="py-2.5 px-3">Reason / Defect</th>
                          <th className="py-2.5 px-3 text-right">Module Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.damages.damages
                          .filter(d => !tableSearch || d.damageNumber.toLowerCase().includes(tableSearch.toLowerCase()) || d.productName.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{d.damageNumber}</td>
                              <td className="py-3 px-3 text-slate-600">{d.damageDate ? new Date(d.damageDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                              <td className="py-3 px-3 font-medium text-slate-800">{d.productName}</td>
                              <td className="py-3 px-3 text-right font-bold text-red-600">{formatNum(d.quantity)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-slate-900">{formatCurr(d.damageCost)}</td>
                              <td className="py-3 px-3 text-slate-600">{d.damageReason || d.remarks || 'Broken'}</td>
                              <td className="py-3 px-3 text-right">
                                <EnterpriseBadge variant="danger">{d.sourceModule}</EnterpriseBadge>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: 20L OPERATIONS & PLANT ISSUES                     */}
          {/* ======================================================== */}
          {activeTab === 'operations' && (
            <div className="space-y-6">
              <EnterpriseCard title={`20L Fleet Visits (${activeReport.operations.totalVisits} visits)`}>
                {activeReport.operations.visits.length === 0 ? (
                  <EnterpriseEmptyState title="No 20L Plant Visits" description="No 20L vehicle arrivals or loading visits recorded during this period." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Arrival Time</th>
                          <th className="py-2.5 px-3">Vehicle Number</th>
                          <th className="py-2.5 px-3">Driver Name</th>
                          <th className="py-2.5 px-3">Distributor Account</th>
                          <th className="py-2.5 px-3 text-right">Unloaded Empty</th>
                          <th className="py-2.5 px-3 text-right">Loaded Fresh</th>
                          <th className="py-2.5 px-3 text-right">Quarantined</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.operations.visits
                          .filter(v => !tableSearch || v.vehicleNumber.toLowerCase().includes(tableSearch.toLowerCase()) || v.distributorName.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((v) => (
                            <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 text-slate-600">{new Date(v.arrivalTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="py-3 px-3 font-bold text-slate-900 font-mono">{v.vehicleNumber}</td>
                              <td className="py-3 px-3 text-slate-700">{v.driverName || '—'}</td>
                              <td className="py-3 px-3 font-medium text-slate-800">{v.distributorName}</td>
                              <td className="py-3 px-3 text-right font-semibold text-slate-700">{formatNum(v.unloadedQuantity)}</td>
                              <td className="py-3 px-3 text-right font-bold text-blue-700">{formatNum(v.loadedQuantity)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-red-600">{formatNum(v.quarantinedQuantity)}</td>
                              <td className="py-3 px-3 text-right">
                                <EnterpriseBadge variant={v.status === 'Completed' ? 'success' : 'primary'}>{v.status}</EnterpriseBadge>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>

              {/* Plant Downtime & Issues */}
              <EnterpriseCard title={`Plant Downtime & Maintenance Issues (${activeReport.operations.totalIssuesLogged} issues)`}>
                {activeReport.operations.issues.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No operational breakdowns or machine issues logged during this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Issue #</th>
                          <th className="py-2.5 px-3">Title / Summary</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Machine / Line</th>
                          <th className="py-2.5 px-3 text-right">Downtime</th>
                          <th className="py-2.5 px-3">Reported At</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.operations.issues.map((iss) => (
                          <tr key={iss.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{iss.issueNumber}</td>
                            <td className="py-3 px-3 font-medium text-slate-800">{iss.title}</td>
                            <td className="py-3 px-3 text-slate-600">{iss.category}</td>
                            <td className="py-3 px-3 text-slate-600">{iss.machineName || iss.lineName || 'General Plant'}</td>
                            <td className="py-3 px-3 text-right font-bold text-red-600">{iss.downtimeMinutes} mins</td>
                            <td className="py-3 px-3 text-slate-600">{new Date(iss.reportedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td className="py-3 px-3 text-right">
                              <EnterpriseBadge variant={iss.status === 'Resolved' || iss.status === 'Closed' ? 'success' : 'danger'}>
                                {iss.status}
                              </EnterpriseBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 7: CUSTOMER PERFORMANCE                              */}
          {/* ======================================================== */}
          {activeTab === 'customers' && (
            <EnterpriseCard title="Customer Sales & Volume Performance">
              {activeReport.customers.customers.length === 0 ? (
                <EnterpriseEmptyState title="No Customer Records Found" description="No customer order activity recorded during this period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                        <th className="py-2.5 px-3">Customer Account</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Orders</th>
                        <th className="py-2.5 px-3 text-right">Dispatched Cases</th>
                        <th className="py-2.5 px-3 text-right">Returned Cases</th>
                        <th className="py-2.5 px-3 text-right">Net Volume</th>
                        <th className="py-2.5 px-3 text-right">Total Sales Value</th>
                        <th className="py-2.5 px-3 text-right">Outstanding Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeReport.customers.customers
                        .filter(c => !tableSearch || c.customerName.toLowerCase().includes(tableSearch.toLowerCase()))
                        .map((c) => (
                          <tr key={c.customerId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{c.customerName}</td>
                            <td className="py-3 px-3 text-slate-600">{c.customerType || 'Wholesale'}</td>
                            <td className="py-3 px-3 text-right font-medium text-slate-700">{c.ordersCount}</td>
                            <td className="py-3 px-3 text-right font-semibold text-slate-900">{formatNum(c.totalDispatchedCases)}</td>
                            <td className="py-3 px-3 text-right text-amber-600">{formatNum(c.totalReturnedCases)}</td>
                            <td className="py-3 px-3 text-right font-bold text-blue-700">{formatNum(c.netCases)} Cases</td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurr(c.totalSalesValue)}</td>
                            <td className={`py-3 px-3 text-right font-semibold ${c.outstandingBalance > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                              {formatCurr(c.outstandingBalance)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                        <td colSpan={3} className="py-3 px-3">Active Buyers: {activeReport.customers.totalActiveCustomers}</td>
                        <td className="py-3 px-3 text-right">{formatNum(activeReport.customers.totalPurchasedQuantity)}</td>
                        <td className="py-3 px-3 text-right text-amber-600">{formatNum(activeReport.customers.totalReturnedQuantity)}</td>
                        <td className="py-3 px-3 text-right text-blue-700">{formatNum(activeReport.customers.totalNetQuantity)}</td>
                        <td className="py-3 px-3 text-right text-slate-900">{formatCurr(activeReport.customers.totalPurchasedValue)}</td>
                        <td className="py-3 px-3 text-right text-red-500">{formatCurr(activeReport.customers.totalOutstanding)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </EnterpriseCard>
          )}

          {/* ======================================================== */}
          {/* TAB 8: INVENTORY & STOCK MOVEMENT                        */}
          {/* ======================================================== */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {/* Finished Products */}
              <EnterpriseCard title="Finished Products Stock Flow">
                {activeReport.inventory.productMovements.length === 0 ? (
                  <EnterpriseEmptyState title="No Product Stock Movement" description="No inventory flow recorded for finished goods." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Product Name</th>
                          <th className="py-2.5 px-3">SKU / Code</th>
                          <th className="py-2.5 px-3 text-right">Current Stock</th>
                          <th className="py-2.5 px-3 text-right text-emerald-700">+ Produced</th>
                          <th className="py-2.5 px-3 text-right text-blue-700">- Dispatched</th>
                          <th className="py-2.5 px-3 text-right text-amber-700">+ Returned</th>
                          <th className="py-2.5 px-3 text-right">Net Flow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.inventory.productMovements
                          .filter(p => !tableSearch || p.productName.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((p) => (
                            <tr key={p.productId} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{p.productName}</td>
                              <td className="py-3 px-3 font-mono text-slate-500">{p.sku || '—'}</td>
                              <td className="py-3 px-3 text-right font-bold text-slate-900">{formatNum(p.currentStock)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-emerald-700">{formatNum(p.producedInPeriod)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-blue-700">{formatNum(p.dispatchedInPeriod)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-amber-700">{formatNum(p.returnedInPeriod)}</td>
                              <td className={`py-3 px-3 text-right font-bold ${p.netMovementInPeriod >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                                {p.netMovementInPeriod >= 0 ? `+${formatNum(p.netMovementInPeriod)}` : formatNum(p.netMovementInPeriod)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>

              {/* Raw Materials */}
              <EnterpriseCard title="Raw Materials Stock & Scrap Summary">
                {activeReport.inventory.rawMaterials.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">No raw materials registered in system.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                          <th className="py-2.5 px-3">Raw Material</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Unit</th>
                          <th className="py-2.5 px-3 text-right">Current Stock</th>
                          <th className="py-2.5 px-3 text-right">Consumed in Period</th>
                          <th className="py-2.5 px-3 text-right">Period Scrap / Wastage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeReport.inventory.rawMaterials
                          .filter(r => !tableSearch || r.materialName.toLowerCase().includes(tableSearch.toLowerCase()))
                          .map((r) => (
                            <tr key={r.materialId} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{r.materialName}</td>
                              <td className="py-3 px-3 text-slate-600">{r.category}</td>
                              <td className="py-3 px-3 text-slate-500">{r.unit || 'PCS'}</td>
                              <td className="py-3 px-3 text-right font-bold text-slate-900">{formatNum(r.currentStock)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-slate-700">{formatNum(r.consumedInPeriod)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-red-500">{formatNum(r.wastageInPeriod)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </EnterpriseCard>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 9: FINANCIALS & PURCHASES                            */}
          {/* ======================================================== */}
          {activeTab === 'accounts' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Operating Expenses by Category */}
              <div className="lg:col-span-1">
                <EnterpriseCard title="Operating Expenses by Category">
                  {activeReport.financials.expenseCategories.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4">No operating expenses recorded for this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeReport.financials.expenseCategories.map((exp, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{exp.category}</div>
                            <div className="text-[11px] text-slate-400">{exp.count} vouchers</div>
                          </div>
                          <div className="text-sm font-bold text-slate-900">{formatCurr(exp.totalAmount)}</div>
                        </div>
                      ))}
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between text-xs font-bold text-blue-900">
                        <span>Total Operating Expenses:</span>
                        <span>{formatCurr(activeReport.financials.totalOperatingExpenses)}</span>
                      </div>
                    </div>
                  )}
                </EnterpriseCard>
              </div>

              {/* Vendor Material Purchases */}
              <div className="lg:col-span-2">
                <EnterpriseCard title="Recent Vendor Purchases">
                  {activeReport.financials.recentPurchases.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4">No supplier purchases logged during this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                            <th className="py-2.5 px-3">Purchase #</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Supplier / Vendor</th>
                            <th className="py-2.5 px-3 text-right">Total Amount</th>
                            <th className="py-2.5 px-3 text-right">Amount Paid</th>
                            <th className="py-2.5 px-3 text-right">Balance Due</th>
                            <th className="py-2.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeReport.financials.recentPurchases.map((pur) => (
                            <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-slate-900">{pur.purchaseNumber}</td>
                              <td className="py-3 px-3 text-slate-600">{pur.purchaseDate ? new Date(pur.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                              <td className="py-3 px-3 font-medium text-slate-800">{pur.vendorName}</td>
                              <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurr(pur.totalAmount)}</td>
                              <td className="py-3 px-3 text-right font-semibold text-emerald-700">{formatCurr(pur.paidAmount)}</td>
                              <td className={`py-3 px-3 text-right font-semibold ${pur.balanceAmount > 0 ? 'text-red-500' : 'text-slate-500'}`}>{formatCurr(pur.balanceAmount)}</td>
                              <td className="py-3 px-3 text-right">
                                <EnterpriseBadge variant={pur.status === 'Paid' ? 'success' : (pur.status === 'PartiallyPaid' ? 'warning' : 'danger')}>
                                  {pur.status}
                                </EnterpriseBadge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </EnterpriseCard>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 9B: PROFIT & LOSS (P&L) STATEMENT                    */}
          {/* ======================================================== */}
          {activeTab === 'pnl' && (
            <div className="space-y-6">
              {!pnlReport ? (
                <EnterpriseCard title="Profit & Loss Statement">
                  <EnterpriseEmptyState title="Profit & Loss Data Unavailable" description="Click Generate Report to load the Profit & Loss statement for this period." />
                </EnterpriseCard>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <EnterpriseCard className="p-4 border-l-4 border-l-blue-500">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Net Sales Revenue</p>
                      <p className="mt-1 text-xl font-extrabold text-slate-900">{formatCurr(pnlReport.revenue.netSalesRevenue)}</p>
                    </EnterpriseCard>
                    <EnterpriseCard className="p-4 border-l-4 border-l-amber-500">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gross Profit ({pnlReport.grossMarginPercent.toFixed(1)}%)</p>
                      <p className={`mt-1 text-xl font-extrabold ${pnlReport.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurr(pnlReport.grossProfit)}</p>
                    </EnterpriseCard>
                    <EnterpriseCard className="p-4 border-l-4 border-l-purple-500">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Operating Expenses</p>
                      <p className="mt-1 text-xl font-extrabold text-slate-900">{formatCurr(pnlReport.operatingExpenses.totalOperatingExpenses)}</p>
                    </EnterpriseCard>
                    <EnterpriseCard className={`p-4 border-l-4 ${pnlReport.netProfit >= 0 ? 'border-l-emerald-600' : 'border-l-rose-600'}`}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Net Profit / (Loss) ({pnlReport.netMarginPercent.toFixed(1)}%)</p>
                      <p className={`mt-1 text-xl font-extrabold ${pnlReport.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurr(pnlReport.netProfit)}</p>
                    </EnterpriseCard>
                  </div>

                  <EnterpriseCard title={`Profit & Loss Statement (${pnlReport.period.formattedRange})`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50">
                            <th className="py-2.5 px-4">Particulars</th>
                            <th className="py-2.5 px-4 text-right">Amount ({curr})</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50/70"><td colSpan={2} className="py-2 px-4 font-bold text-slate-800 uppercase tracking-wider">Revenue</td></tr>
                          <tr><td className="py-2.5 px-6 text-slate-700">Sales Revenue (Excl. GST, Before Discount) ({pnlReport.revenue.salesOrdersCount} orders)</td><td className="py-2.5 px-4 text-right font-semibold">{formatCurr(pnlReport.revenue.salesGrossBeforeDiscount)}</td></tr>
                          {(pnlReport.revenue.twentyLGrossBeforeDiscount > 0 || pnlReport.revenue.twentyLDeliveriesCount > 0) && (
                            <tr><td className="py-2.5 px-6 text-slate-700">20L Delivery Revenue (Excl. GST) ({pnlReport.revenue.twentyLDeliveriesCount} deliveries)</td><td className="py-2.5 px-4 text-right font-semibold">{formatCurr(pnlReport.revenue.twentyLGrossBeforeDiscount)}</td></tr>
                          )}
                          <tr><td className="py-2.5 px-6 text-slate-600">Less: Sales Discounts</td><td className="py-2.5 px-4 text-right text-rose-600">-{formatCurr(pnlReport.revenue.totalDiscounts)}</td></tr>
                          <tr><td className="py-2.5 px-6 text-slate-600">Less: Sales Returns ({pnlReport.revenue.returnsCount} returns)</td><td className="py-2.5 px-4 text-right text-rose-600">-{formatCurr(pnlReport.revenue.salesReturns)}</td></tr>
                          <tr className="bg-blue-50/50 font-bold text-slate-900"><td className="py-3 px-4">Net Sales Revenue</td><td className="py-3 px-4 text-right">{formatCurr(pnlReport.revenue.netSalesRevenue)}</td></tr>

                          <tr className="bg-slate-50/70"><td colSpan={2} className="py-2 px-4 font-bold text-slate-800 uppercase tracking-wider">Direct Costs (Period Purchases & Losses)</td></tr>
                          <tr><td className="py-2.5 px-6 text-slate-700">Direct Material Purchases (Inventory, Excl. GST)</td><td className="py-2.5 px-4 text-right">{formatCurr(pnlReport.directCosts.materialPurchases)}</td></tr>
                          <tr><td className="py-2.5 px-6 text-slate-700">Sales Damage Losses</td><td className="py-2.5 px-4 text-right">{formatCurr(pnlReport.directCosts.salesDamageLoss)}</td></tr>
                          {pnlReport.directCosts.twentyLCommissions > 0 && (
                            <tr><td className="py-2.5 px-6 text-slate-700">20L Distributor Commissions</td><td className="py-2.5 px-4 text-right">{formatCurr(pnlReport.directCosts.twentyLCommissions)}</td></tr>
                          )}
                          <tr className="font-semibold text-slate-800"><td className="py-2.5 px-4">Total Direct Costs</td><td className="py-2.5 px-4 text-right text-rose-700">-{formatCurr(pnlReport.directCosts.totalDirectCosts)}</td></tr>
                          <tr className={`${pnlReport.grossProfit >= 0 ? 'bg-emerald-50/60 text-emerald-900' : 'bg-rose-50/60 text-rose-900'} font-bold`}>
                            <td className="py-3 px-4">Gross Profit ({pnlReport.grossMarginPercent.toFixed(2)}% Margin)</td>
                            <td className="py-3 px-4 text-right">{formatCurr(pnlReport.grossProfit)}</td>
                          </tr>

                          <tr className="bg-slate-50/70"><td colSpan={2} className="py-2 px-4 font-bold text-slate-800 uppercase tracking-wider">Operating Expenses & Payroll</td></tr>
                          {pnlReport.operatingExpenses.simpleExpensesByCategory.map((cat) => (
                            <tr key={`se-${cat.category}`}><td className="py-2 px-6 text-slate-700">Expense: {cat.category} ({cat.count})</td><td className="py-2 px-4 text-right">{formatCurr(cat.totalAmount)}</td></tr>
                          ))}
                          {pnlReport.operatingExpenses.expensePurchasesByCategory.map((cat) => (
                            <tr key={`pe-${cat.category}`}><td className="py-2 px-6 text-slate-700">Purchase Expense: {cat.category} ({cat.count})</td><td className="py-2 px-4 text-right">{formatCurr(cat.totalAmount)}</td></tr>
                          ))}
                          <tr><td className="py-2.5 px-6 text-slate-700">Salaries Paid (Payroll)</td><td className="py-2.5 px-4 text-right">{formatCurr(pnlReport.operatingExpenses.salariesPaid)}</td></tr>
                          <tr className="font-semibold text-slate-800"><td className="py-2.5 px-4">Total Operating Expenses</td><td className="py-2.5 px-4 text-right text-rose-700">-{formatCurr(pnlReport.operatingExpenses.totalOperatingExpenses)}</td></tr>

                          <tr className={`${pnlReport.netProfit >= 0 ? 'bg-emerald-100/70 text-emerald-950' : 'bg-rose-100/70 text-rose-950'} font-extrabold text-sm`}>
                            <td className="py-3.5 px-4">Net Profit / (Loss) ({pnlReport.netMarginPercent.toFixed(2)}% Margin)</td>
                            <td className="py-3.5 px-4 text-right">{formatCurr(pnlReport.netProfit)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </EnterpriseCard>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <EnterpriseCard title="Informational & Excluded Items (Non-P&L)">
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-600">Output GST Collected (Excluded from Revenue)</span><span className="font-bold text-slate-800">{formatCurr(pnlReport.informational.outputGstCollected)}</span></div>
                        <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-600">Input GST on Purchases (Excluded from Costs)</span><span className="font-bold text-slate-800">{formatCurr(pnlReport.informational.inputGstOnPurchases)}</span></div>
                        <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-600">CapEx / Asset Purchases (Excluded from P&L)</span><span className="font-bold text-slate-800">{formatCurr(pnlReport.informational.capExAssetPurchasesExcluded)}</span></div>
                        <div className="flex justify-between py-1.5"><span className="text-slate-600">Cancelled Purchases (Excluded)</span><span className="font-bold text-slate-800">{formatCurr(pnlReport.informational.cancelledPurchasesExcluded)}</span></div>
                      </div>
                    </EnterpriseCard>

                    <EnterpriseCard title="Accounting Basis & Disclosures">
                      <ul className="space-y-2 text-xs text-slate-600 list-disc pl-4">
                        {pnlReport.disclosures.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </EnterpriseCard>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 10: QUALITY CONTROL                                  */}
          {/* ======================================================== */}
          {activeTab === 'qc' && (
            <EnterpriseCard title="Water Quality Laboratory Reports">
              {activeReport.qualityControl.recentTests.length === 0 ? (
                <EnterpriseEmptyState title="No Water Test Records Found" description="No laboratory water analysis records recorded during the selected period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="h-10 border-b border-slate-200 text-slate-700 font-bold bg-slate-50 select-none">
                        <th className="py-2.5 px-3">Report / Sample #</th>
                        <th className="py-2.5 px-3">Test Date</th>
                        <th className="py-2.5 px-3">Sample Source / Type</th>
                        <th className="py-2.5 px-3">Batch Number</th>
                        <th className="py-2.5 px-3">Tested By</th>
                        <th className="py-2.5 px-3 text-right">Compliance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeReport.qualityControl.recentTests
                        .filter(t => !tableSearch || t.reportNumber.toLowerCase().includes(tableSearch.toLowerCase()) || t.sampleSource.toLowerCase().includes(tableSearch.toLowerCase()))
                        .map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{t.reportNumber}</td>
                            <td className="py-3 px-3 text-slate-600">{t.testDate ? new Date(t.testDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td className="py-3 px-3 text-slate-700 font-medium">{t.sampleSource}</td>
                            <td className="py-3 px-3 text-slate-600">{t.batchNumber || '—'}</td>
                            <td className="py-3 px-3 text-slate-600">{t.testedBy || 'QC Chemist'}</td>
                            <td className="py-3 px-3 text-right">
                              <EnterpriseBadge variant={
                                t.overallStatus.toLowerCase().includes('pass') || t.overallStatus.toLowerCase().includes('approve')
                                  ? 'success'
                                  : (t.overallStatus.toLowerCase().includes('fail') || t.overallStatus.toLowerCase().includes('reject') ? 'danger' : 'warning')
                              }>
                                {t.overallStatus}
                              </EnterpriseBadge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </EnterpriseCard>
          )}
        </div>
      )}
    </div>
  )
}

export default ReportsPage
