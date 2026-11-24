import PageContainer from '../../components/ui/layout/PageContainer';
import PageHeader from '../../components/ui/layout/PageHeader';
import KPICard from '../../components/ui/layout/KPICard';
import FilterBar from '../../components/ui/layout/FilterBar';
import React, { useState } from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HubConnectionBuilder, HubConnection, HttpTransportType } from '@microsoft/signalr'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, API_BASE_URL } from '../../services/api'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useAuthStore } from '../../store/useAuthStore'
import { authService } from '../../services/auth'
import { productsService } from '../../services/products'
import { rawMaterialsService } from '../../services/rawMaterials'
import { brandService } from '../../services/brands'
import { productionShiftsService } from '../../services/productionShifts'
import { salesService } from '../../services/sales'
import { ProductionShiftsManager } from './ProductionShiftsManager'
import {
  Factory, ShieldCheck, Wrench, CheckCircle,
  ArrowUpRight, ArrowDownRight, CloudSun, Play, Search, Plus, Eye, EyeOff, Key, Trash2, Edit2, ToggleLeft, ToggleRight,
  Pause, ExternalLink, Clock, Users, TrendingUp, Package, Settings, X,
  AlertTriangle, Activity, ChevronDown, Droplets, Beaker, Truck, Receipt,
  ClipboardCheck, FileText, UserCheck, BarChart3, Zap, Box, Shield, Calendar
} from 'lucide-react'
import EnterpriseHeader from '../../components/ui/EnterpriseHeader'
import EnterpriseCard from '../../components/ui/EnterpriseCard'
import EnterpriseTable from '../../components/ui/EnterpriseTable'
import EnterpriseBadge from '../../components/ui/EnterpriseBadge'
import EnterpriseModal from '../../components/ui/EnterpriseModal'
import EnterpriseInput from '../../components/ui/EnterpriseInput'
import EnterpriseSelect from '../../components/ui/EnterpriseSelect'
import EnterpriseEmptyState from '../../components/ui/EnterpriseEmptyState'
import EnterpriseLoading from '../../components/ui/EnterpriseLoading'
import EnterpriseButton from '../../components/ui/EnterpriseButton'
import { InventoryPage } from '../../modules/inventory/InventoryPage'
import { CustomersPage } from './CustomersPage'
import { SalesPage } from './SalesPage'
import { useStationConfig } from '../../hooks/useStationConfig'
import { ProductionBatchesView } from '../../components/batch'
import { BatchNumberSuggestion } from '../../components/batch/BatchNumberSuggestion'

// --- SVG BUSINESS CHARTS FOR ENTERPRISE DASHBOARD ---

const getSmoothSplinePath = (pts: { x: number; y: number }[]) => {
  if (!pts || pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return path
}

interface ProdPointItem {
  label: string
  dateStr?: string
  totalCases: number
  loggedCases?: number
  entriesCount?: number
  recordedTimes?: string[]
  products?: { productName: string; cases: number; entriesCount: number; recordedTimes?: string[] }[]
  operatorName?: string
  shift?: string
  batchNumber?: string
  timestamp?: number
}

const isNumber = (val: any): val is number => typeof val === 'number'

const DashboardLineChart: React.FC<{ data: ProdPointItem[]; height?: number; emptyMessage?: string }> = ({ data, height = 190, emptyMessage = "No production recorded for this period." }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!data || data.length === 0 || data.every(d => d.totalCases === 0)) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-4">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
          <Factory className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-[12px] font-semibold text-slate-500">{emptyMessage}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Production events will plot on this smooth curve live</p>
      </div>
    )
  }

  const padding = 30
  const width = 600
  const maxVal = Math.max(...data.map(d => d.totalCases), 10)

  const points = data.map((d, i) => {
    let x = padding
    if (data.length > 1) {
      x = padding + (i / (data.length - 1)) * (width - padding * 2)
    } else {
      x = width / 2
    }
    const y = height - padding - (d.totalCases / maxVal) * (height - padding * 2)
    return { x, y, item: d, idx: i }
  })

  const getSmoothSplinePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return path
  }

  const pathD = getSmoothSplinePath(points)

  const shouldShowLabel = (idx: number) => {
    if (data.length <= 12) return true;
    if (idx === 0 || idx === data.length - 1) return true;
    return idx % Math.ceil(data.length / 8) === 0;
  }

  return (
    <div className="w-full relative space-y-2">
      <div style={{ height }} className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[190px] overflow-visible">
          <defs>
            <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#12A89A" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#12A89A" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(ratio => {
            const y = height - padding - ratio * (height - padding * 2)
            return (
              <line key={ratio} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#E8EDF0" strokeWidth="1" strokeDasharray="4 4" />
            )
          })}
          <path d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`} fill="url(#line-gradient)" />
          <path d={pathD} fill="none" stroke="#12A89A" strokeWidth="2" className="animate-draw-line" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 6 : 4} fill="#ffffff" stroke={hoveredIdx === i ? "#0B7A70" : "#12A89A"} strokeWidth={hoveredIdx === i ? 2.5 : 2} className="transition-all duration-200 cursor-pointer" onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} />
              {shouldShowLabel(i) && (
                <text x={p.x} y={height - 10} textAnchor="middle" fontSize="10" fill={hoveredIdx === i ? "#0B7A70" : "#64748B"} fontWeight={hoveredIdx === i ? "700" : "600"} className="transition-colors duration-200 pointer-events-none">
                  {p.item.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        <style>{`
          @keyframes drawLine {
            from { stroke-dashoffset: 2500; }
            to { stroke-dashoffset: 0; }
          }
          .animate-draw-line {
            stroke-dasharray: 2500;
            animation: drawLine 600ms ease-out forwards;
          }
        `}</style>

        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute z-50 bg-slate-900 text-white rounded-xl p-3 shadow-xl text-xs space-y-2 border border-slate-800 min-w-[210px] pointer-events-none transition-all duration-150"
            style={{
              left: `${(points[hoveredIdx].x / width) * 100}%`,
              top: `${Math.max(10, (points[hoveredIdx].y / height) * 100 - 30)}%`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <span className="font-bold text-blue-400">{points[hoveredIdx].item.timestamp ? 'Time: ' : ''}{points[hoveredIdx].item.label}</span>
              {points[hoveredIdx].item.dateStr && (
                <span className="text-[10px] text-slate-400">{points[hoveredIdx].item.dateStr}</span>
              )}
            </div>

            <div className="space-y-1">
              {points[hoveredIdx].item.timestamp ? (
                <>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Total Production</span>
                    <span className="font-mono font-bold text-emerald-400">{points[hoveredIdx].item.totalCases.toLocaleString()} Cases</span>
                  </div>
                  {points[hoveredIdx].item.loggedCases !== undefined && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-300">Logged Entry</span>
                      <span className="font-mono font-medium text-emerald-300">{points[hoveredIdx].item.loggedCases.toLocaleString()} Cases</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[11px] mt-1 pt-1 border-t border-slate-700/50">
                    <span className="text-slate-300">Product</span>
                    <span className="font-medium text-white max-w-[110px] truncate">{points[hoveredIdx].item.products?.[0]?.productName || 'Standard'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Operator</span>
                    <span className="font-medium text-slate-200">{points[hoveredIdx].item.operatorName || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Shift</span>
                    <span className="font-medium text-slate-200">{points[hoveredIdx].item.shift || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Batch</span>
                    <span className="font-mono text-blue-300">{points[hoveredIdx].item.batchNumber || '-'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Total Production</span>
                    <span className="font-mono font-bold text-emerald-400">{points[hoveredIdx].item.totalCases.toLocaleString()} Cases</span>
                  </div>
                  {points[hoveredIdx].item.entriesCount ? (
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>Production Entries</span>
                      <span className="font-mono text-blue-300 font-medium">{points[hoveredIdx].item.entriesCount} {points[hoveredIdx].item.entriesCount === 1 ? 'Entry' : 'Entries'}</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {!points[hoveredIdx].item.timestamp && points[hoveredIdx].item.products && points[hoveredIdx].item.products!.length > 0 && (
              <div className="pt-1.5 border-t border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Product Breakdown</span>
                {points[hoveredIdx].item.products!.map((prod, pIdx) => (
                  <div key={pIdx} className="flex justify-between text-[11px] gap-3">
                    <span className="text-slate-200 truncate max-w-[120px] font-medium">{prod.productName}</span>
                    <span className="font-mono font-semibold text-blue-300">{prod.cases} cases ({prod.entriesCount} {prod.entriesCount === 1 ? 'entry' : 'entries'})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface DispatchPointItem {
  label: string
  dateStr?: string
  dayOfWeek?: string
  dispatchedCases: number
  loggedDispatched?: number
  returnedCases?: number
  loggedReturned?: number
  damageCases?: number
  loggedDamage?: number
  netDispatchCases?: number
  transactionType?: string
  transactionNumber?: string
  customerName?: string
  productName?: string
  quantity?: number
  runningTotal?: number
  timestamp?: number
  products?: { productName: string; dispatchedCases: number; returnedCases: number; netDispatchCases: number }[]
}

const getPointTransactionTotals = (item: DispatchPointItem) => {
  const categories: { label: string; count: number; colorClass: string }[] = []

  const dispatchVal = item.loggedDispatched !== undefined ? item.loggedDispatched : item.dispatchedCases
  const returnVal = item.loggedReturned !== undefined ? item.loggedReturned : (item.returnedCases || 0)
  const damageVal = item.loggedDamage !== undefined ? item.loggedDamage : (item.damageCases || 0)

  if (item.transactionType) {
    if (item.transactionType === 'Customer Return') {
      const cnt = item.quantity || returnVal || 0
      if (cnt > 0) categories.push({ label: 'Return', count: cnt, colorClass: 'text-amber-400' })
    } else if (item.transactionType === 'Damage') {
      const cnt = item.quantity || damageVal || 0
      if (cnt > 0) categories.push({ label: 'Damage', count: cnt, colorClass: 'text-rose-400' })
    } else {
      const cnt = item.quantity || dispatchVal || 0
      if (cnt > 0) categories.push({ label: 'Dispatch', count: cnt, colorClass: 'text-emerald-400' })
    }
  } else {
    if (dispatchVal > 0) categories.push({ label: 'Dispatch', count: dispatchVal, colorClass: 'text-emerald-400' })
    if (returnVal > 0) categories.push({ label: 'Return', count: returnVal, colorClass: 'text-amber-400' })
    if (damageVal > 0) categories.push({ label: 'Damage', count: damageVal, colorClass: 'text-rose-400' })
  }

  return categories
}

const getTooltipPosition = (ptX: number, ptY: number, width: number, height: number) => {
  const xRatio = ptX / width
  const yRatio = ptY / height

  let leftPercent = (ptX / width) * 100
  let topPercent = (ptY / height) * 100

  let placement: 'above' | 'above-left' | 'above-right' | 'below' = 'above'
  let transform = 'translate(-50%, calc(-100% - 14px))'
  let caretLeft = '50%'

  if (yRatio < 0.3) {
    placement = 'below'
    transform = 'translate(-50%, 14px)'
  } else if (xRatio > 0.8) {
    placement = 'above-left'
    transform = 'translate(-85%, calc(-100% - 14px))'
    caretLeft = '85%'
  } else if (xRatio < 0.2) {
    placement = 'above-right'
    transform = 'translate(-15%, calc(-100% - 14px))'
    caretLeft = '15%'
  }

  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    transform,
    placement,
    caretLeft
  }
}

const renderCaret = (placement: 'above' | 'above-left' | 'above-right' | 'below', caretLeft: string = '50%') => {
  if (placement === 'below') {
    return <div style={{ left: caretLeft }} className="absolute -top-1.5 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px] border-b-slate-900 drop-shadow-sm pointer-events-none" />
  }
  return <div style={{ left: caretLeft }} className="absolute -bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-900 drop-shadow-sm pointer-events-none" />
}

const DashboardBarChart: React.FC<{ data: DispatchPointItem[]; height?: number; barColor?: string; emptyMessage?: string }> = ({ data, height = 190, emptyMessage = "No dispatches recorded for this period." }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const hasData = data && data.length > 0 && !data.every(d =>
    (d.loggedDispatched || 0) === 0 &&
    (d.loggedReturned || 0) === 0 &&
    (d.loggedDamage || 0) === 0 &&
    (d.dispatchedCases || 0) === 0 &&
    (d.netDispatchCases || 0) === 0 &&
    (d.quantity || 0) === 0
  )

  if (!hasData) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-4">
        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-2">
          <Truck className="w-5 h-5 text-emerald-600" />
        </div>
        <p className="text-[12px] font-semibold text-slate-600">{emptyMessage}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Logged transaction events will appear here in real time</p>
      </div>
    )
  }

  const padding = 35
  const width = 600
  const maxVal = Math.max(
    ...data.map(d => {
      const disp = d.loggedDispatched !== undefined ? d.loggedDispatched : (d.dispatchedCases || 0)
      const ret = d.loggedReturned !== undefined ? d.loggedReturned : (d.returnedCases || 0)
      const dam = d.loggedDamage !== undefined ? d.loggedDamage : (d.damageCases || 0)
      return Math.max(disp, ret, dam, d.netDispatchCases || 0, d.quantity || 0)
    }),
    10
  )

  const points = data.map((d, i) => {
    let x = padding
    if (data.length > 1) {
      x = padding + (i / (data.length - 1)) * (width - padding * 2)
    } else {
      x = width / 2
    }
    const val = d.quantity || (d.loggedDispatched !== undefined ? d.loggedDispatched : d.dispatchedCases) || d.loggedReturned || d.loggedDamage || d.netDispatchCases || 0
    const y = height - padding - (val / maxVal) * (height - padding * 2)
    return { x, y, item: d, idx: i }
  })

  const getSmoothSplinePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
    if (pts.length === 2) {
      const dx = (pts[1].x - pts[0].x) / 3
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} C ${(pts[0].x + dx).toFixed(1)} ${pts[0].y.toFixed(1)}, ${(pts[1].x - dx).toFixed(1)} ${pts[1].y.toFixed(1)}, ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`
    }

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return path
  }

  const pathD = getSmoothSplinePath(points)
  const shouldShowLabel = (idx: number) => {
    if (data.length <= 15) return true;
    if (idx === 0 || idx === data.length - 1) return true;
    return idx % Math.ceil(data.length / 10) === 0;
  }

  return (
    <div className="w-full relative space-y-2">
      <div style={{ height }} className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[190px] overflow-visible">
          <defs>
            <linearGradient id="dispatch-line-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(ratio => {
            const y = height - padding - ratio * (height - padding * 2)
            return (
              <line key={ratio} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
            )
          })}
          <path d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`} fill="url(#dispatch-line-gradient)" />
          <path d={pathD} fill="none" stroke="#10B981" strokeWidth="3" className="drop-shadow-md" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 6 : 4}
                fill="#ffffff"
                stroke={hoveredIdx === i ? "#059669" : "#10B981"}
                strokeWidth={hoveredIdx === i ? 3 : 2}
                className="transition-all duration-200 cursor-pointer drop-shadow-sm"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              {shouldShowLabel(i) && (
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill={hoveredIdx === i ? "#059669" : "#94a3b8"}
                  fontWeight={hoveredIdx === i ? "700" : "600"}
                  className="transition-colors duration-200 pointer-events-none"
                >
                  {p.item.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {hoveredIdx !== null && points[hoveredIdx] && (() => {
          const pos = getTooltipPosition(points[hoveredIdx].x, points[hoveredIdx].y, width, height)
          const categories = getPointTransactionTotals(points[hoveredIdx].item)
          if (categories.length === 0) return null

          const item = points[hoveredIdx].item
          const headerTitle = item.dayOfWeek || (item.dateStr ? new Date(item.dateStr).toLocaleDateString('en-US', { weekday: 'long' }) : 'Event Detail')
          const isTimeLabel = item.label && (item.label.includes(':') || item.label.includes('AM') || item.label.includes('PM'))
          const headerSubtitle = isTimeLabel
            ? (item.dateStr ? `${item.label} • ${item.dateStr}` : item.label)
            : (item.dateStr || item.label)

          return (
            <div
              className="absolute z-50 bg-slate-900/95 backdrop-blur-md text-white rounded-xl p-3 shadow-2xl text-xs border border-slate-800 pointer-events-none transition-all duration-200 ease-out animate-in fade-in zoom-in-95"
              style={{
                left: pos.left,
                top: pos.top,
                transform: pos.transform
              }}
            >
              {renderCaret(pos.placement, pos.caretLeft)}
              <div className="flex flex-col gap-0.5 border-b border-slate-800 pb-1.5 mb-1.5">
                <span className="font-bold text-white text-[12px] leading-tight">{headerTitle}</span>
                <span className="text-[10px] text-slate-400 font-medium leading-tight">{headerSubtitle}</span>
              </div>
              <div className="space-y-1.5 min-w-[130px]">
                {categories.map((cat, cIdx) => (
                  <div key={cIdx} className="flex justify-between items-center text-xs gap-4">
                    <span className="text-slate-300 font-medium">{cat.label}</span>
                    <span className={`font-mono font-bold ${cat.colorClass}`}>
                      {cat.count.toLocaleString()} Cases
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

const DashboardAreaChart: React.FC<{ data: { label: string; value: number }[]; height?: number }> = ({ data, height = 180 }) => {
  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center text-center">
        <p className="text-[12px] font-semibold text-slate-400">₹0 • No sales recorded</p>
        <p className="text-[11px] text-slate-300 mt-0.5">Revenue graphs will plot here</p>
      </div>
    )
  }

  const padding = 25
  const width = 500
  const maxVal = Math.max(...data.map(d => d.value), 1000)

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding)
    const y = height - padding - (d.value / maxVal) * (height - 2 * padding)
    return { x, y, value: d.value, label: d.label }
  })

  const pathD = points.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[180px] overflow-visible">
        <defs>
          <linearGradient id="areaRevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#areaRevGrad)" />
        <path d={pathD} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#059669" stroke="#FFFFFF" strokeWidth="1.5">
            <title>{`${p.label}: ₹${p.value.toLocaleString('en-IN')}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between px-4 mt-1 text-[11px] font-medium text-slate-400">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

const DashboardHorizontalBarChart: React.FC<{ data: { label: string; value: number; color?: string }[] }> = ({ data }) => {
  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div className="py-10 flex flex-col items-center justify-center text-center">
        <p className="text-[12px] font-semibold text-slate-400">No line production data recorded</p>
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const pct = Math.round((item.value / maxVal) * 100)
        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-[12px] font-medium">
              <span className="text-slate-700 font-semibold">{item.label}</span>
              <span className="text-slate-500 tabular-nums">{item.value.toLocaleString()} cases</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, pct)}%`, backgroundColor: item.color || '#12A89A' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const DashboardDonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; emptyMessage?: string }> = ({ data, emptyMessage = "No active or completed batches." }) => {
  const filtered = data.filter(d => d.value > 0)
  const total = filtered.reduce((acc, d) => acc + d.value, 0)

  if (total === 0) {
    return (
      <div className="py-10 flex flex-col items-center justify-center text-center">
        <p className="text-[12px] font-semibold text-slate-400">{emptyMessage}</p>
      </div>
    )
  }

  let cumulativePercent = 0
  const segments = filtered.map(d => {
    const startPct = cumulativePercent
    const pct = d.value / total
    cumulativePercent += pct
    return { ...d, startPct, endPct: cumulativePercent, pct }
  })

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
          {segments.map((seg, i) => {
            const strokeDasharray = `${seg.pct * 100} ${100 - seg.pct * 100}`
            const strokeDashoffset = -seg.startPct * 100
            return (
              <circle
                key={i}
                cx="18"
                cy="18"
                r="15.91549430918954"
                fill="transparent"
                stroke={seg.color}
                strokeWidth="3.8"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            )
          })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-[18px] font-bold text-slate-800 tabular-nums">{total}</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Batches</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {segments.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-slate-700">{item.label}</span>
            </div>
            <span className="font-mono text-slate-500 tabular-nums font-semibold">
              {item.value} ({Math.round(item.pct * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const CompanyDashboardPage: React.FC = () => {
  const location = useLocation()
  const path = location.pathname
  const isDashboardView = path === '/company' || path === '/company/' || path === '/company/dashboard'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useNotificationStore()
  const { user } = useAuthStore()
  const { isBlowingEnabled, isFillingEnabled, isLabelingEnabled, isPackingEnabled } = useStationConfig()

  // Global Date Filter State
  const [dashboardDateFilter, setDashboardDateFilter] = useState<'today' | '7days' | '30days'>('today')

  // Fetch Cockpit Reporting Data from Single Source of Truth Backend Endpoint
  const { data: cockpitReportingData, isLoading: cockpitReportingLoading } = useQuery({
    queryKey: ['cockpitReporting', dashboardDateFilter],
    queryFn: async () => {
      const tzOffset = new Date().getTimezoneOffset()
      const res = await api.get(`/api/v1/production/cockpit-reporting?range=${dashboardDateFilter}&tzOffset=${tzOffset}`)
      return res.data?.data
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // --- DASHBOARD QUICK ACTION STATES & HANDLERS ---
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false)
  const [isDashboardAddInventoryOpen, setIsDashboardAddInventoryOpen] = useState(false)
  const [dashboardAdjustMatId, setDashboardAdjustMatId] = useState('')
  const [dashboardAdjustQty, setDashboardAdjustQty] = useState('')
  const [dashboardAdjustNotes, setDashboardAdjustNotes] = useState('Admin Dashboard Adjustment')

  const [isDashboardSalesOrderOpen, setIsDashboardSalesOrderOpen] = useState(false)
  const [dashboardSalesClient, setDashboardSalesClient] = useState('Apex Distributors')
  const [dashboardSalesProduct, setDashboardSalesProduct] = useState('')
  const [dashboardSalesQty, setDashboardSalesQty] = useState('')
  const [dashboardSalesAmount, setDashboardSalesAmount] = useState('')

  const adjustStockMutation = useMutation({
    mutationFn: async ({ id, quantity, notes }: { id: string; quantity: number; notes?: string }) => {
      const res = await rawMaterialsService.addStock(id, { quantity, notes })
      return res.data
    },
    onSuccess: (data) => {
      showToast('Stock adjusted successfully.', 'success')
      queryClient.invalidateQueries({ queryKey: ['dashboardRawMaterials'] })
      setIsDashboardAddInventoryOpen(false)
      setDashboardAdjustMatId('')
      setDashboardAdjustQty('')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to adjust stock.'
      showToast(msg, 'error')
    }
  })

  // Live clock state
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    if (!isDashboardView) return
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [isDashboardView])

  // Onboarding polling / SignalR state
  const [onboarding, setOnboarding] = useState({
    progress: user?.onboardingProgress ?? 10,
    step: user?.onboardingStep ?? 'Queueing provisioning',
    status: user?.tenantStatus ?? 'Provisioning',
    failureReason: user?.onboardingFailureReason ?? ''
  })

  // Estimated remaining time computation (visual only)
  const getEstimatedRemainingTime = (progress: number) => {
    if (progress >= 100) return '0s'
    if (progress >= 95) return '2s'
    if (progress >= 85) return '5s'
    if (progress >= 75) return '8s'
    if (progress >= 65) return '12s'
    if (progress >= 50) return '15s'
    if (progress >= 35) return '18s'
    if (progress >= 20) return '22s'
    return '25s'
  }

  // Handle completion transitions (autoredirect, auth refresh, success toast)
  const handleOnboardingComplete = async (sessionData?: any) => {
    try {
      const data = sessionData || (await authService.getSession()).data
      if (data) {
        useAuthStore.getState().updateUser({
          tenantStatus: 'Ready',
          isTenantInitialized: true,
          roles: data.roles,
          permissions: data.permissions,
          tenantId: data.tenantId,
          ownsCompany: true
        })
        showToast('Workspace provisioned successfully! Welcome to Aquzio.', 'success')
      }
    } catch (e) {
      console.error('Error refreshing session on onboarding complete:', e)
    }
  }

  useEffect(() => {
    if (user?.tenantStatus !== 'Provisioning') return

    let isMounted = true
    let connection: HubConnection | null = null
    let pollIntervalId: any = null

    const fetchLatestStatus = async () => {
      try {
        const res = await authService.getSession()
        if (res.success && res.data && isMounted) {
          const data = res.data
          setOnboarding({
            progress: data.onboardingProgress,
            step: data.onboardingStep || 'Provisioning workspace',
            status: data.tenantStatus,
            failureReason: data.onboardingFailureReason || ''
          })

          if (data.tenantStatus === 'Ready' || data.tenantStatus === 'Completed' || data.isTenantInitialized) {
            if (pollIntervalId) {
              clearInterval(pollIntervalId)
              pollIntervalId = null
            }
            handleOnboardingComplete(data)
          } else if (data.tenantStatus === 'Failed') {
            if (pollIntervalId) {
              clearInterval(pollIntervalId)
              pollIntervalId = null
            }
            setOnboarding(prev => ({ ...prev, status: 'Failed', failureReason: data.onboardingFailureReason || 'Provisioning failed' }))
          }
        }
      } catch (err) {
        console.error('Error fetching onboarding status:', err)
      }
    }

    // Try starting SignalR connection
    const token = useAuthStore.getState().token
    const hubUrl = `${API_BASE_URL}/hub/provisioning`

    connection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token || '',
      })
      .withAutomaticReconnect()
      .build()

    connection.on('ProvisionProgressUpdated', (data: { progress: number; stage: string; message: string; status: string; failureReason?: string }) => {
      if (!isMounted) return
      console.log('[SIGNALR EVENT]: Received progress update:', data)
      setOnboarding({
        progress: data.progress,
        step: data.message || data.stage,
        status: data.status,
        failureReason: data.failureReason || ''
      })

      if (data.status === 'Ready' || data.progress === 100) {
        if (pollIntervalId) {
          clearInterval(pollIntervalId)
          pollIntervalId = null
        }
        handleOnboardingComplete()
      } else if (data.status === 'Failed') {
        if (pollIntervalId) {
          clearInterval(pollIntervalId)
          pollIntervalId = null
        }
      }
    })

    const startHub = async () => {
      try {
        await connection!.start()
        console.log('[SIGNALR CONNECTED]: Provisioning Hub connection established.')
        // Initial sync when connected
        await fetchLatestStatus()
      } catch (err) {
        console.warn('[SIGNALR ERROR]: Failed to start connection, falling back to polling.', err)
        // Fallback to polling
        await fetchLatestStatus()
        pollIntervalId = setInterval(fetchLatestStatus, 4000)
      }
    }

    startHub()

    // Handle connection state changes
    connection.onreconnected(() => {
      console.log('[SIGNALR RECONNECTED]: Recovering latest progress...')
      fetchLatestStatus()
    })

    return () => {
      isMounted = false
      if (pollIntervalId) clearInterval(pollIntervalId)
      if (connection) {
        connection.stop()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantStatus, showToast])

  // Centralized Real-time SignalR Dashboard Subscription
  useEffect(() => {
    if (!user?.tenantId || user?.tenantStatus === 'Provisioning' || !user?.isTenantInitialized) return

    let hubConn: HubConnection | null = null

    const connectHub = async () => {
      try {
        hubConn = new HubConnectionBuilder()
          .withUrl(`${API_BASE_URL}/hubs/dashboard`, {
            skipNegotiation: true,
            transport: HttpTransportType.WebSockets
          })
          .withAutomaticReconnect([1000, 2000, 5000, 10000, 30000])
          .build()

        hubConn.on('DashboardEvent', (evt: any) => {
          const eventType = evt?.event_type
          console.log('[SIGNALR EVENT RECEIVED]:', eventType, evt)

          if (eventType === 'production-entry-created') {
            queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
            queryClient.invalidateQueries({ queryKey: ['productionDashboard'] })
          } else if (eventType === 'batch-started' || eventType === 'batch-completed' || eventType === 'batch-status-changed') {
            queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
            queryClient.invalidateQueries({ queryKey: ['productionLinesList'] })
            queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
            queryClient.invalidateQueries({ queryKey: ['productionDashboard'] })
          } else if (eventType === 'dispatch-created' || eventType === 'dispatch-returned') {
            queryClient.invalidateQueries({ queryKey: ['salesDashboard'] })
            queryClient.invalidateQueries({ queryKey: ['dashboardSalesTransactions'] })
            queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
          } else if (eventType === 'production-line-status-changed') {
            queryClient.invalidateQueries({ queryKey: ['productionLinesList'] })
            queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
          } else {
            queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
          }
        })

        await hubConn.start()
        await hubConn.invoke('SubscribeToTenant', user.tenantId)
        console.log(`[SIGNALR DASHBOARD CONNECTED]: Subscribed to tenant_${user.tenantId}`)
      } catch (err) {
        console.warn('[SIGNALR DASHBOARD ERROR]: Connection failed', err)
      }
    }

    connectHub()

    return () => {
      if (hubConn) {
        hubConn.stop()
      }
    }
  }, [user?.tenantId, user?.tenantStatus, user?.isTenantInitialized, queryClient])



  // Search & Filter state for Employee List
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 5

  // Modal toggle states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [selectedEmployeeForView, setSelectedEmployeeForView] = useState<any | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEmployeeForView(null)
      }
    }
    if (selectedEmployeeForView) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedEmployeeForView])

  // Add Employee Form States
  const [addFullName, setAddFullName] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addRoleCode, setAddRoleCode] = useState('')
  const [addPasswordOrPin, setAddPasswordOrPin] = useState('')
  const [addDepartment, setAddDepartment] = useState('Operations')
  const [addCurrentSalary, setAddCurrentSalary] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addOwnershipPercentage, setAddOwnershipPercentage] = useState('')
  const [addInitialInvestment, setAddInitialInvestment] = useState('')
  const [addEmployeeErrors, setAddEmployeeErrors] = useState<Record<string, string>>({})

  // Edit Employee Form States
  const [editEmployeeId, setEditEmployeeId] = useState('')
  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPin, setEditPin] = useState('')
  const [editRoleCode, setEditRoleCode] = useState('')
  const [editDepartment, setEditDepartment] = useState('Operations')
  const [editCurrentSalary, setEditCurrentSalary] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editOwnershipPercentage, setEditOwnershipPercentage] = useState('')
  const [editInitialInvestment, setEditInitialInvestment] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editEmployeeErrors, setEditEmployeeErrors] = useState<Record<string, string>>({})

  // Reset Password Form States
  const [resetEmployeeId, setResetEmployeeId] = useState('')
  const [resetEmployeeName, setResetEmployeeName] = useState('')
  const [resetPasswordOrPin, setResetPasswordOrPin] = useState('')
  const [resetAdminPin, setResetAdminPin] = useState('')

  // Company Secret PIN states
  const [securityPin, setSecurityPin] = useState('')
  const [confirmSecurityPin, setConfirmSecurityPin] = useState('')
  const [isSavingSecurityPin, setIsSavingSecurityPin] = useState(false)

  // PIN Verification and custom credential protection states
  const [isPinVerifyModalOpen, setIsPinVerifyModalOpen] = useState(false)
  const [pinVerifyValue, setPinVerifyValue] = useState('')
  const [isPinVerifying, setIsPinVerifying] = useState(false)
  const [verifiedPinForChange, setVerifiedPinForChange] = useState('')

  // Custom Change Password form states
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isGeneratingPassword, setIsGeneratingPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Production lines state
  const [productionTab, setProductionTab] = useState<'batches' | 'lines'>('batches')
  const [isAddLineModalOpen, setIsAddLineModalOpen] = useState(false)
  const [isEditLineModalOpen, setIsEditLineModalOpen] = useState(false)

  // Add Production Line Form
  const [addLineName, setAddLineName] = useState('')
  const [addLineCode, setAddLineCode] = useState('')
  const [addLineIsActive, setAddLineIsActive] = useState(true)

  // Edit Production Line Form
  const [editLineId, setEditLineId] = useState('')
  const [editLineName, setEditLineName] = useState('')
  const [editLineCode, setEditLineCode] = useState('')
  const [editLineIsActive, setEditLineIsActive] = useState(true)

  // Active batches control states
  const [isStartBatchModalOpen, setIsStartBatchModalOpen] = useState(false)
  const [startBatchLineId, setStartBatchLineId] = useState('')
  const [startBatchNumber, setStartBatchNumber] = useState('')
  const companyBadgeLetters = React.useMemo(() => {
    try {
      const p = JSON.parse(localStorage.getItem('aquzio_company_profile') || '{}')
      return (p.badgeLetters || '').toUpperCase()
    } catch {
      return ''
    }
  }, [])
  const [startBatchProduct, setStartBatchProduct] = useState('')
  const [startBatchShift, setStartBatchShift] = useState('')
  const [startBatchTargetQty, setStartBatchTargetQty] = useState<string | number>('')
  const [batchSearch, setBatchSearch] = useState('')
  const [batchLineFilter, setBatchLineFilter] = useState('')
  const [batchStatusFilter, setBatchStatusFilter] = useState('All')
  const [batchDateFilter, setBatchDateFilter] = useState('')
  const [selectedBatchForView, setSelectedBatchForView] = useState<any | null>(null)
  const [isViewBatchModalOpen, setIsViewBatchModalOpen] = useState(false)

  // Master data tabs state
  const [inventoryTab, setInventoryTab] = useState<'products' | 'raw_materials' | 'brands'>('products')

  // Products state
  const [productsPage, setProductsPage] = useState(1)
  const [productsSearch, setProductsSearch] = useState('')
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false)
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [productFormName, setProductFormName] = useState('')
  const [productFormBrandId, setProductFormBrandId] = useState('')
  const [productFormSKU, setProductFormSKU] = useState('')
  const [productFormIsActive, setProductFormIsActive] = useState(true)

  // Brands state
  const [brandsPage, setBrandsPage] = useState(1)
  const [brandsSearch, setBrandsSearch] = useState('')
  const [isAddBrandModalOpen, setIsAddBrandModalOpen] = useState(false)
  const [isEditBrandModalOpen, setIsEditBrandModalOpen] = useState(false)
  const [selectedBrand, setSelectedBrand] = useState<any | null>(null)
  const [brandFormName, setBrandFormName] = useState('')
  const [brandFormCode, setBrandFormCode] = useState('')
  const [brandFormDescription, setBrandFormDescription] = useState('')
  const [brandFormIsActive, setBrandFormIsActive] = useState(true)

  // Raw Materials state
  const [rawMaterialsPage, setRawMaterialsPage] = useState(1)
  const [rawMaterialsSearch, setRawMaterialsSearch] = useState('')
  const [isAddRawMaterialModalOpen, setIsAddRawMaterialModalOpen] = useState(false)
  const [isEditRawMaterialModalOpen, setIsEditRawMaterialModalOpen] = useState(false)
  const [selectedRawMaterial, setSelectedRawMaterial] = useState<any | null>(null)
  const [rawMaterialFormName, setRawMaterialFormName] = useState('')
  const [rawMaterialFormCategory, setRawMaterialFormCategory] = useState('PREFORM')
  const [rawMaterialFormUnit, setRawMaterialFormUnit] = useState('PIECE')
  const [rawMaterialFormIsActive, setRawMaterialFormIsActive] = useState(true)
  const [rawMaterialFormCurrentStock, setRawMaterialFormCurrentStock] = useState('0')
  const [rawMaterialFormStockAdjustment, setRawMaterialFormStockAdjustment] = useState('0')


  const isOwnerRole = (user?.roles?.some((role: string) =>
    ['owner', 'companyowner', 'platformowner'].includes(role.toLowerCase())
  ) || user?.roleName?.toLowerCase() === 'owner') ?? false

  const canWrite = !isOwnerRole && (user?.roles?.some((role: string) =>
    ['CompanyAdmin', 'Admin', 'Manager', 'Accountant'].includes(role)
  ) ?? false)

  const isCompanyAdmin = !isOwnerRole && (user?.roles?.some((role: string) =>
    ['CompanyAdmin', 'SuperAdmin', 'PlatformAdmin', 'Accountant'].includes(role)
  ) ?? false)

  // Fetch Products List
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['productsList', productsPage, productsSearch],
    queryFn: async () => {
      const res = await productsService.getProducts(productsPage, 5, productsSearch)
      return res.data
    },
    enabled: path.includes('/inventory') && inventoryTab === 'products' && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Paginated Brands List for Brands Tab
  const { data: paginatedBrandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ['brandsPaginated', brandsPage, brandsSearch],
    queryFn: async () => {
      const res = await brandService.getBrands(brandsPage, 5, brandsSearch)
      return res.data
    },
    enabled: path.includes('/inventory') && inventoryTab === 'brands' && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Brands List for dropdown
  const { data: brands = [] } = useQuery({
    queryKey: ['brandsDropdown'],
    queryFn: async () => {
      const res = await brandService.getBrands(1, 1000)
      return res.data?.items || []
    },
    enabled: path.includes('/inventory') && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Production Shifts for dropdown
  const { data: productionShifts = [] } = useQuery({
    queryKey: ['productionShifts'],
    queryFn: async () => {
      try {
        const res = await productionShiftsService.getAll()
        return res.data?.data || []
      } catch (err) {
        return []
      }
    },
    enabled: user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Create Brand Mutation
  const createBrandMutation = useMutation({
    mutationFn: brandService.createBrand,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Brand created successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['brandsPaginated'] })
        queryClient.invalidateQueries({ queryKey: ['brandsDropdown'] })
        setIsAddBrandModalOpen(false)
        setBrandFormName('')
        setBrandFormCode('')
        setBrandFormDescription('')
        setBrandFormIsActive(true)
      } else {
        showToast(data.message || 'Failed to create brand.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Update Brand Mutation
  const updateBrandMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => brandService.updateBrand(id, data),
    onSuccess: (data) => {
      if (data.success) {
        showToast('Brand updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['brandsPaginated'] })
        queryClient.invalidateQueries({ queryKey: ['brandsDropdown'] })
        setIsEditBrandModalOpen(false)
      } else {
        showToast(data.message || 'Failed to update brand.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Delete Brand Mutation
  const deleteBrandMutation = useMutation({
    mutationFn: brandService.deleteBrand,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Brand deleted successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['brandsPaginated'] })
        queryClient.invalidateQueries({ queryKey: ['brandsDropdown'] })
      } else {
        showToast(data.message || 'Failed to delete brand.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })


  // Fetch Raw Materials List
  const { data: rawMaterialsData, isLoading: rawMaterialsLoading } = useQuery({
    queryKey: ['rawMaterialsList', rawMaterialsPage, rawMaterialsSearch],
    queryFn: async () => {
      const res = await rawMaterialsService.getRawMaterials(rawMaterialsPage, 5, rawMaterialsSearch)
      return res.data
    },
    enabled: path.includes('/inventory') && inventoryTab === 'raw_materials' && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })



  // --- PRODUCTION STATIONS CONFIGURATION ---
  const [stationStates, setStationStates] = useState<Record<string, boolean>>({
    Blowing: true,
    Filling: true,
    Labeling: true,
    Packing: true
  })

  const { data: stationConfigs, refetch: refetchStations } = useQuery<any[]>({
    queryKey: ['productionStationConfigs'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production-configuration/all')
      return res.data?.data || []
    },
    enabled: path.includes('/settings') && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  useEffect(() => {
    if (stationConfigs) {
      const state: Record<string, boolean> = {}
      stationConfigs.forEach((c: any) => {
        state[c.stationName] = c.isEnabled
      })
      setStationStates(state)
    }
  }, [stationConfigs])

  const saveStationsMutation = useMutation({
    mutationFn: async (payload: any[]) => {
      const res = await api.post('/api/v1/production-configuration', payload)
      return res.data
    },
    onSuccess: () => {
      showToast('Production stations configuration updated successfully.', 'success')
      queryClient.invalidateQueries({ queryKey: ['productionStationConfigs'] })
      queryClient.invalidateQueries({ queryKey: ['enabledProductionStations'] })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to update production stations.'
      showToast(msg, 'error')
    }
  })

  const handleSaveStations = () => {
    const payload = Object.keys(stationStates).map(name => ({
      stationName: name,
      isEnabled: stationStates[name]
    }))
    saveStationsMutation.mutate(payload)
  }

  const canConfigureStations = user?.roles?.some((role: string) =>
    ['CompanyAdmin', 'SuperAdmin', 'PlatformAdmin', 'Accountant'].includes(role)
  ) ?? false


  const handleSaveSecurityPin = async () => {
    if (!securityPin || !confirmSecurityPin) {
      showToast('PIN and Confirm PIN are required.', 'warning')
      return
    }
    if (securityPin.length !== 4 || !/^\d{4}$/.test(securityPin)) {
      showToast('PIN must be exactly 4 digits.', 'warning')
      return
    }
    if (securityPin !== confirmSecurityPin) {
      showToast('PINs do not match.', 'warning')
      return
    }
    setIsSavingSecurityPin(true)
    try {
      const response = await api.post('/api/v1/employees/security-pin', {
        pin: securityPin,
        confirmPin: confirmSecurityPin
      })
      if (response.data.success) {
        showToast('Company Secret PIN updated successfully.', 'success')
        setSecurityPin('')
        setConfirmSecurityPin('')
      } else {
        showToast(response.data.message || 'Failed to save security PIN.', 'error')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error saving security PIN.'
      showToast(msg, 'error')
    } finally {
      setIsSavingSecurityPin(false)
    }
  }

  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinVerifyValue) {
      showToast('PIN is required.', 'warning')
      return
    }
    setIsPinVerifying(true)
    try {
      const response = await api.post('/api/v1/employees/security-pin/verify', {
        adminPin: pinVerifyValue,
        pin: pinVerifyValue
      })
      if (response.data.success && response.data.data === true) {
        setVerifiedPinForChange(pinVerifyValue)
        setIsPinVerifyModalOpen(false)
        setPinVerifyValue('')
        setNewPasswordVal('')
        setConfirmPasswordVal('')
        setShowNewPassword(false)
        setShowConfirmPassword(false)
        setIsChangePasswordModalOpen(true)
      } else {
        showToast(response.data.message || 'Invalid admin PIN.', 'error')
      }
    } catch (err: any) {
      const msg = err.response?.data?.errors?.[0] || err.response?.data?.message || 'Invalid admin PIN.'
      showToast(msg, 'error')
    } finally {
      setIsPinVerifying(false)
    }
  }

  const handleGenerateStrongPassword = () => {
    setIsGeneratingPassword(true)
    try {
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const lowercase = 'abcdefghijklmnopqrstuvwxyz'
      const numbers = '0123456789'
      const symbols = '!@#$%^&*()_+-='
      const allChars = uppercase + lowercase + numbers + symbols

      const getRandomChar = (str: string) => {
        const array = new Uint32Array(1)
        crypto.getRandomValues(array)
        return str[array[0] % str.length]
      }

      let pass = getRandomChar(uppercase) + getRandomChar(lowercase) + getRandomChar(numbers) + getRandomChar(symbols)

      for (let i = 0; i < 10; i++) {
        pass += getRandomChar(allChars)
      }

      const passArray = pass.split('')
      for (let i = passArray.length - 1; i > 0; i--) {
        const randArr = new Uint32Array(1)
        crypto.getRandomValues(randArr)
        const j = randArr[0] % (i + 1)
        const temp = passArray[i]
        passArray[i] = passArray[j]
        passArray[j] = temp
      }
      const finalPass = passArray.join('')

      setNewPasswordVal(finalPass)
      setConfirmPasswordVal(finalPass)
      setShowNewPassword(true)
      setShowConfirmPassword(true)
      showToast('Strong password generated.', 'success')
    } finally {
      setTimeout(() => setIsGeneratingPassword(false), 200)
    }
  }

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPasswordVal || !confirmPasswordVal) {
      showToast('All fields are required.', 'warning')
      return
    }
    if (newPasswordVal.length < 8) {
      showToast('New password must be at least 8 characters.', 'warning')
      return
    }
    if (newPasswordVal !== confirmPasswordVal) {
      showToast('Passwords do not match.', 'warning')
      return
    }
    setIsUpdatingPassword(true)
    try {
      const response = await api.put('/api/v1/employees/reset-password', {
        employeeId: selectedEmployeeForView.id,
        passwordOrPin: newPasswordVal,
        pin: verifiedPinForChange,
        adminPin: verifiedPinForChange
      })
      if (response.data.success) {
        showToast('Employee password updated successfully.', 'success')
        setIsChangePasswordModalOpen(false)
        setVerifiedPinForChange('')
        setNewPasswordVal('')
        setConfirmPasswordVal('')
      } else {
        showToast(response.data.message || 'Failed to update password.', 'error')
      }
    } catch (err: any) {
      const msg = err.response?.data?.errors?.[0] || err.response?.data?.message || 'Failed to update password.'
      showToast(msg, 'error')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  // Create Product Mutation
  const createProductMutation = useMutation({
    mutationFn: productsService.createProduct,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Product created successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productsList'] })
        setIsAddProductModalOpen(false)
        setProductFormName('')
        setProductFormBrandId('')
        setProductFormSKU('')
        setProductFormIsActive(true)
      } else {
        showToast(data.message || 'Failed to create product.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Update Product Mutation
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => productsService.updateProduct(id, data),
    onSuccess: (data) => {
      if (data.success) {
        showToast('Product updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productsList'] })
        setIsEditProductModalOpen(false)
      } else {
        showToast(data.message || 'Failed to update product.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Delete Product Mutation
  const deleteProductMutation = useMutation({
    mutationFn: productsService.deleteProduct,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Product deleted successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productsList'] })
      } else {
        showToast(data.message || 'Failed to delete product.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Create Raw Material Mutation
  const createRawMaterialMutation = useMutation({
    mutationFn: rawMaterialsService.createRawMaterial,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Raw material created successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] })
        queryClient.invalidateQueries({ queryKey: ['rawMaterials'] })
        setIsAddRawMaterialModalOpen(false)
        setRawMaterialFormName('')
        setRawMaterialFormCategory('PREFORM')
        setRawMaterialFormUnit('PIECE')
        setRawMaterialFormIsActive(true)
        setRawMaterialFormCurrentStock('0')
        setRawMaterialFormStockAdjustment('0')
      } else {
        showToast(data.message || 'Failed to create raw material.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Update Raw Material Mutation
  const updateRawMaterialMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => rawMaterialsService.updateRawMaterial(id, data),
    onSuccess: (data) => {
      if (data.success) {
        showToast('Raw material updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] })
        queryClient.invalidateQueries({ queryKey: ['rawMaterials'] })
        setIsEditRawMaterialModalOpen(false)
      } else {
        showToast(data.message || 'Failed to update raw material.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Delete Raw Material Mutation
  const deleteRawMaterialMutation = useMutation({
    mutationFn: rawMaterialsService.deleteRawMaterial,
    onSuccess: (data) => {
      if (data.success) {
        showToast('Raw material deleted successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] })
        queryClient.invalidateQueries({ queryKey: ['rawMaterials'] })
      } else {
        showToast(data.message || 'Failed to delete raw material.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Brand Handlers
  const handleCreateBrandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!brandFormName.trim()) {
      showToast('Brand Name is required.', 'warning')
      return
    }
    createBrandMutation.mutate({
      name: brandFormName.trim(),
      code: brandFormCode.trim() || undefined,
      description: brandFormDescription.trim() || undefined,
      isActive: brandFormIsActive
    })
  }

  const handleEditBrandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBrand) return
    if (!brandFormName.trim()) {
      showToast('Brand Name is required.', 'warning')
      return
    }
    updateBrandMutation.mutate({
      id: selectedBrand.id,
      data: {
        name: brandFormName.trim(),
        code: brandFormCode.trim() || undefined,
        description: brandFormDescription.trim() || undefined,
        isActive: brandFormIsActive
      }
    })
  }

  const openEditBrand = (brand: any) => {
    setSelectedBrand(brand)
    setBrandFormName(brand.name)
    setBrandFormCode(brand.code || '')
    setBrandFormDescription(brand.description || '')
    setBrandFormIsActive(brand.isActive)
    setIsEditBrandModalOpen(true)
  }

  const triggerDeleteBrand = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete brand "${name}"?`)) {
      deleteBrandMutation.mutate(id)
    }
  }

  // Product Handlers
  const handleCreateProductSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!productFormName.trim()) {
      showToast('Product Name is required.', 'warning')
      return
    }
    if (!productFormBrandId) {
      showToast('Brand is required.', 'warning')
      return
    }
    createProductMutation.mutate({
      name: productFormName.trim(),
      brandId: productFormBrandId,
      sku: productFormSKU.trim() || undefined,
      isActive: productFormIsActive
    })
  }

  const handleEditProductSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return
    if (!productFormName.trim()) {
      showToast('Product Name is required.', 'warning')
      return
    }
    if (!productFormBrandId) {
      showToast('Brand is required.', 'warning')
      return
    }
    updateProductMutation.mutate({
      id: selectedProduct.id,
      data: {
        name: productFormName.trim(),
        brandId: productFormBrandId,
        sku: productFormSKU.trim() || undefined,
        isActive: productFormIsActive
      }
    })
  }

  const openEditProduct = (prod: any) => {
    setSelectedProduct(prod)
    setProductFormName(prod.name)
    setProductFormBrandId(prod.brandId)
    setProductFormSKU(prod.sku || '')
    setProductFormIsActive(prod.isActive)
    setIsEditProductModalOpen(true)
  }

  const triggerDeleteProduct = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete product "${name}"?`)) {
      deleteProductMutation.mutate(id)
    }
  }

  // Raw Material Handlers
  const handleCreateRawMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!rawMaterialFormName.trim()) {
      showToast('Material Name is required.', 'warning')
      return
    }
    if (!rawMaterialFormCategory) {
      showToast('Category is required.', 'warning')
      return
    }
    if (!rawMaterialFormUnit) {
      showToast('Unit is required.', 'warning')
      return
    }
    createRawMaterialMutation.mutate({
      name: rawMaterialFormName.trim(),
      category: rawMaterialFormCategory,
      unit: rawMaterialFormUnit,
      isActive: rawMaterialFormIsActive,
      currentStock: parseFloat(rawMaterialFormCurrentStock) || 0
    })
  }

  const handleEditRawMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRawMaterial) return
    if (!rawMaterialFormName.trim()) {
      showToast('Material Name is required.', 'warning')
      return
    }
    if (!rawMaterialFormCategory) {
      showToast('Category is required.', 'warning')
      return
    }
    if (!rawMaterialFormUnit) {
      showToast('Unit is required.', 'warning')
      return
    }
    updateRawMaterialMutation.mutate({
      id: selectedRawMaterial.id,
      data: {
        name: rawMaterialFormName.trim(),
        category: rawMaterialFormCategory,
        unit: rawMaterialFormUnit,
        isActive: rawMaterialFormIsActive,
        currentStock: parseFloat(rawMaterialFormCurrentStock) || 0,
        stockAdjustment: parseFloat(rawMaterialFormStockAdjustment) || 0
      }
    })
  }

  const openEditRawMaterial = (mat: any) => {
    setSelectedRawMaterial(mat)
    setRawMaterialFormName(mat.name)
    setRawMaterialFormCategory(mat.category.toUpperCase())
    setRawMaterialFormUnit(mat.unit.toUpperCase())
    setRawMaterialFormIsActive(mat.isActive)
    setRawMaterialFormCurrentStock(mat.currentStock?.toString() || '0')
    setRawMaterialFormStockAdjustment('0')
    setIsEditRawMaterialModalOpen(true)
  }

  const triggerDeleteRawMaterial = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete raw material "${name}"?`)) {
      deleteRawMaterialMutation.mutate(id)
    }
  }

  // Render content depending on active routing path
  const isProductionView = path.includes('/production')
  const isInventoryView = path.includes('/inventory')
  const isEmployeesView = path.includes('/employees')
  const isSettingsView = path.includes('/settings')
  const isCustomersView = path.includes('/customers')
  const isSalesView = path.includes('/sales')

  // Fetch Employees List
  const { data: employees = [], isLoading: employeesLoading } = useQuery<any[]>({
    queryKey: ['employeesList'],
    queryFn: async () => {
      const res = await api.get('/api/v1/employees')
      return res.data?.data || []
    },
    enabled: isEmployeesView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Roles
  const { data: rawRoles = [] } = useQuery<any[]>({
    queryKey: ['employeesRoles'],
    queryFn: async () => {
      const res = await api.get('/api/v1/employees/roles')
      return res.data?.data || []
    },
    enabled: isEmployeesView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  const roles = React.useMemo(() => {
    let list = [...rawRoles]
    // Filter out system-level Admin so it is NEVER present in the company admin role dropdown
    list = list.filter((r: any) => {
      const name = (r.name || '').trim().toLowerCase()
      const code = (r.code || '').trim().toUpperCase()
      return name !== 'admin' && code !== 'ADMIN'
    })
    // Ensure Accountant is present
    if (!list.some((r: any) => (r.code && r.code.toUpperCase() === 'ACCOUNTANT') || (r.name && r.name.toLowerCase() === 'accountant'))) {
      list.push({ id: 'role-accountant-default', code: 'ACCOUNTANT', name: 'Accountant' })
    }
    // Ensure Owner is present
    if (!list.some((r: any) => (r.code && r.code.toUpperCase() === 'OWNER') || (r.name && r.name.toLowerCase() === 'owner'))) {
      list.push({ id: 'role-owner-default', code: 'OWNER', name: 'Owner' })
    }
    return list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  }, [rawRoles])

  // Fetch Departments
  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ['employeesDepts'],
    queryFn: async () => {
      const res = await api.get('/api/v1/employees/departments')
      return res.data?.data || []
    },
    enabled: isEmployeesView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Create Employee Mutation
  const createEmployeeMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/employees', payload)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        const isOwner = (addRoleCode || '').toUpperCase() === 'OWNER'
        showToast(isOwner ? 'Owner created successfully.' : 'Employee created successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['employeesList'] })
        queryClient.invalidateQueries({ queryKey: ['ownersList'] })
        queryClient.invalidateQueries({ queryKey: ['ownerDetails'] })
        queryClient.invalidateQueries({ queryKey: ['companyTotalInvestment'] })
        queryClient.invalidateQueries({ queryKey: ['simpleAccountsDashboardSummary'] })
        setIsAddModalOpen(false)
        setAddFullName('')
        setAddUsername('')
        setAddEmail('')
        setAddRoleCode('')
        setAddPasswordOrPin('')
        setAddDepartment('Operations')
        setAddCurrentSalary('')
        setAddPhone('')
        setAddOwnershipPercentage('')
        setAddInitialInvestment('')
      } else {
        showToast(data.message || 'Failed to create employee.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Update Employee Mutation
  const updateEmployeeMutation = useMutation({
    mutationFn: async (payload: { id: string; data: any }) => {
      const res = await api.put(`/api/v1/employees/${payload.id}`, payload.data)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Employee updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['employeesList'] })
        queryClient.refetchQueries({ queryKey: ['employeesList'] })
        queryClient.invalidateQueries({ queryKey: ['ownersList'] })
        queryClient.invalidateQueries({ queryKey: ['ownerDetails'] })
        queryClient.invalidateQueries({ queryKey: ['companyTotalInvestment'] })
        queryClient.invalidateQueries({ queryKey: ['simpleAccountsDashboardSummary'] })
        setIsEditModalOpen(false)
        setEditEmployeeErrors({})
      } else {
        showToast(data.message || 'Failed to update employee.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.response?.data?.title || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Reset Password Mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put('/api/v1/employees/reset-password', payload)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Password/PIN reset successfully.', 'success')
        setIsResetModalOpen(false)
        setResetPasswordOrPin('')
        setResetAdminPin('')
      } else {
        showToast(data.message || 'Failed to reset password.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Delete Employee Mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/v1/employees/${id}`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Employee deleted successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['employeesList'] })
      } else {
        showToast(data.message || 'Failed to delete employee.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Fetch Production Lines
  const { data: productionLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ['productionLinesList'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production/lines?includeInactive=true')
      return res.data?.data || []
    },
    enabled: (isProductionView || isDashboardView) && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch all catalog products for batch starting dropdown
  const { data: allCatalogProducts = [], isLoading: productsCatalogLoading } = useQuery<any[]>({
    queryKey: ['allCatalogProductsList'],
    queryFn: async () => {
      const res = await productsService.getProducts(1, 100, '')
      return res.data?.items || []
    },
    enabled: (isProductionView || isDashboardView) && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch all production batches for complete batch register
  const { data: allBatches = [], isLoading: batchesLoading, isError: batchesError } = useQuery<any[]>({
    queryKey: ['allBatchesList'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production/batches')
      return res.data?.data || []
    },
    enabled: (isProductionView || isDashboardView) && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Derived active batches for operational widgets
  const activeBatches = React.useMemo(() => allBatches.filter((b: any) =>
    b.status === 'Active' || b.status === 'Running' || b.status === 'Bottling Active' || b.status === 'In Progress'
  ), [allBatches])

  // Fetch Raw Materials for Dashboard Inventory Health
  const { data: dashboardRawMaterials = [], isLoading: dashboardRawMaterialsLoading } = useQuery<any[]>({
    queryKey: ['dashboardRawMaterials'],
    queryFn: async () => {
      const res = await rawMaterialsService.getRawMaterials(1, 100)
      return res.data?.items || []
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Products for Dashboard Finished Goods Stock
  const { data: dashboardProducts = [], isLoading: dashboardProductsLoading } = useQuery<any[]>({
    queryKey: ['dashboardProducts'],
    queryFn: async () => {
      const res = await productsService.getProducts(1, 100)
      return res.data?.items || []
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Sales Dashboard Metrics
  const { data: salesDashboard, isLoading: salesLoading } = useQuery({
    queryKey: ['salesDashboard'],
    queryFn: async () => {
      const res = await api.get('/api/v1/sales/dashboard')
      return res.data?.data || {
        todaySalesCases: 0,
        todayReturns: 0,
        todayDamage: 0,
        totalDispatch: 0,
        monthlyDispatch: 0
      }
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Sales Transactions for Live Dispatch Trend
  const { data: dashboardSalesTransactions = [] } = useQuery<any[]>({
    queryKey: ['dashboardSalesTransactions'],
    queryFn: async () => {
      const res = await salesService.getTransactions(1, 100, '', '', '', 'Sales Dispatch')
      return res.data?.items || []
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Fetch Production Dashboard Metrics
  const { data: productionDashboard, isLoading: productionDashboardLoading } = useQuery({
    queryKey: ['productionDashboard'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production/dashboard')
      return res.data?.data || {
        todayProduction: 0,
        todayTarget: 0,
        weeklyProduction: 0,
        monthlyProduction: 0,
        pendingDispatch: 0,
        pendingDispatchHighPriority: 0
      }
    },
    enabled: isDashboardView && user?.tenantStatus !== 'Provisioning' && user?.isTenantInitialized
  })

  // Start Batch Mutation
  const startBatchMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/production/batch/start', payload)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production batch started successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
        setIsStartBatchModalOpen(false)
        setStartBatchNumber('')
        setStartBatchTargetQty('')
      } else {
        showToast(data.message || 'Failed to start batch.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Pause Batch Mutation
  const pauseBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/v1/production/batch/${id}/pause`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production batch paused.', 'success')
        queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
      } else {
        showToast(data.message || 'Failed to pause batch.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Resume Batch Mutation
  const resumeBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/v1/production/batch/${id}/resume`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production batch resumed.', 'success')
        queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
      } else {
        showToast(data.message || 'Failed to resume batch.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Complete Batch Mutation
  const completeBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/v1/production/batch/${id}/complete`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production batch completed successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
      } else {
        showToast(data.message || 'Failed to complete batch.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Create Line Mutation
  const createLineMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/production/lines', payload)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production line created successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productionLinesList'] })
        setIsAddLineModalOpen(false)
        setAddLineName('')
        setAddLineCode('')
        setAddLineIsActive(true)
      } else {
        showToast(data.message || 'Failed to create production line.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Update Line Mutation
  const updateLineMutation = useMutation({
    mutationFn: async (payload: { id: string; data: any }) => {
      const res = await api.put(`/api/v1/production/lines/${payload.id}`, payload.data)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production line updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productionLinesList'] })
        setIsEditLineModalOpen(false)
      } else {
        showToast(data.message || 'Failed to update production line.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  // Delete Line Mutation
  const deleteLineMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/v1/production/lines/${id}`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast('Production line deleted successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productionLinesList'] })
      } else {
        showToast(data.message || 'Failed to delete production line.', 'error')
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Error occurred.'
      showToast(msg, 'error')
    }
  })

  const handleAddLineSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addLineName.trim()) {
      showToast('Line Name is required.', 'warning')
      return
    }
    if (!addLineCode.trim()) {
      showToast('Line Code is required.', 'warning')
      return
    }
    createLineMutation.mutate({
      name: addLineName.trim(),
      code: addLineCode.trim().toUpperCase(),
      isActive: addLineIsActive
    })
  }

  const handleEditLineSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editLineName.trim()) {
      showToast('Line Name is required.', 'warning')
      return
    }
    if (!editLineCode.trim()) {
      showToast('Line Code is required.', 'warning')
      return
    }
    updateLineMutation.mutate({
      id: editLineId,
      data: {
        name: editLineName.trim(),
        code: editLineCode.trim().toUpperCase(),
        isActive: editLineIsActive
      }
    })
  }

  const handleToggleLineStatus = (line: any) => {
    updateLineMutation.mutate({
      id: line.lineId,
      data: {
        isActive: !line.isActive
      }
    })
  }

  const triggerDeleteLine = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete production line "${name}"? This soft-deletes the line.`)) {
      deleteLineMutation.mutate(id)
    }
  }

  const openEditLineModal = (line: any) => {
    setEditLineId(line.lineId)
    setEditLineName(line.name)
    setEditLineCode(line.code)
    setEditLineIsActive(line.isActive)
    setIsEditLineModalOpen(true)
  }

  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}

    if (!addFullName.trim()) {
      errs.fullName = 'Please enter Employee Name.'
    }
    if (!addUsername.trim()) {
      errs.username = 'Please enter Username.'
    } else if (addUsername.length < 3) {
      errs.username = 'Username must be at least 3 characters.'
    }
    if (!addEmail.trim()) {
      errs.email = 'Please enter a valid email address.'
    } else if (!addEmail.includes('@')) {
      errs.email = 'Please enter a valid email address.'
    }
    if (!addRoleCode) {
      errs.roleCode = 'Role is required.'
    } else if (addRoleCode.toUpperCase() === 'ADMIN' || addRoleCode.toLowerCase() === 'admin') {
      errs.roleCode = 'System Admin role cannot be created or assigned by Company Admin.'
    }
    if (!addPasswordOrPin) {
      errs.passwordOrPin = 'Password or PIN is required.'
    } else if (addPasswordOrPin.length < 4) {
      errs.passwordOrPin = 'Password or PIN must be at least 4 characters.'
    }

    if (addCurrentSalary === '' || addCurrentSalary === null || addCurrentSalary === undefined) {
      errs.currentSalary = 'Current Salary is required.'
    } else if (isNaN(Number(addCurrentSalary)) || Number(addCurrentSalary) < 0) {
      errs.currentSalary = 'Current Salary cannot be negative.'
    }

    if (Object.keys(errs).length > 0) {
      setAddEmployeeErrors(errs)
      return
    }
    setAddEmployeeErrors({})

    createEmployeeMutation.mutate({
      fullName: addFullName.trim(),
      username: addUsername.trim(),
      email: addEmail.trim(),
      roleCode: addRoleCode,
      passwordOrPin: addPasswordOrPin,
      department: addDepartment,
      currentSalary: Number(addCurrentSalary),
      phone: addPhone.trim() || undefined,
      ownershipPercentage: addOwnershipPercentage ? Number(addOwnershipPercentage) : undefined,
      initialInvestment: addInitialInvestment ? Number(addInitialInvestment) : undefined
    })
  }

  const handleEditEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}

    if (!editFullName.trim()) {
      errs.fullName = 'Please enter Employee Name.'
    }

    if (!editUsername.trim()) {
      errs.username = 'Please enter Username.'
    } else if (editUsername.trim().length < 3) {
      errs.username = 'Username must be at least 3 characters.'
    }

    if (!editEmail.trim()) {
      errs.email = 'Please enter a valid email address.'
    } else if (!editEmail.includes('@') || !editEmail.includes('.')) {
      errs.email = 'Please enter a valid email address.'
    }

    if (editPin.trim()) {
      if (editPin.trim().length < 4) {
        errs.pin = 'Password or PIN must be at least 4 characters.'
      }
    }

    if (!editRoleCode) {
      errs.roleCode = 'Role is required.'
    } else if (editRoleCode.toUpperCase() === 'ADMIN' || editRoleCode.toLowerCase() === 'admin') {
      errs.roleCode = 'System Admin role cannot be assigned by Company Admin.'
    }

    if (editCurrentSalary === '' || editCurrentSalary === null || editCurrentSalary === undefined) {
      errs.currentSalary = 'Current Salary is required.'
    } else if (isNaN(Number(editCurrentSalary)) || Number(editCurrentSalary) < 0) {
      errs.currentSalary = 'Current Salary cannot be negative.'
    }

    if (Object.keys(errs).length > 0) {
      setEditEmployeeErrors(errs)
      return
    }
    setEditEmployeeErrors({})

    updateEmployeeMutation.mutate({
      id: editEmployeeId,
      data: {
        fullName: editFullName.trim(),
        username: editUsername.trim(),
        email: editEmail.trim(),
        pin: editPin.trim() ? editPin.trim() : undefined,
        roleCode: editRoleCode,
        department: editDepartment,
        currentSalary: Number(editCurrentSalary),
        isActive: editIsActive,
        phone: editPhone.trim() || undefined,
        ownershipPercentage: editOwnershipPercentage ? Number(editOwnershipPercentage) : undefined,
        initialInvestment: editInitialInvestment ? Number(editInitialInvestment) : undefined
      }
    })
  }

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPasswordOrPin || resetPasswordOrPin.length < 4) {
      showToast('Password or PIN must be at least 4 characters.', 'warning')
      return
    }
    if (!resetAdminPin || resetAdminPin.length !== 4) {
      showToast('Admin PIN must be exactly 4 digits.', 'warning')
      return
    }

    resetPasswordMutation.mutate({
      employeeId: resetEmployeeId,
      passwordOrPin: resetPasswordOrPin,
      adminPin: resetAdminPin,
      pin: resetAdminPin
    })
  }

  const triggerToggleStatus = (employee: any) => {
    updateEmployeeMutation.mutate({
      id: employee.id,
      data: {
        fullName: employee.fullName,
        username: employee.username,
        email: employee.email,
        roleCode: employee.roleCode,
        department: employee.department,
        currentSalary: employee.currentSalary ?? 0,
        isActive: !employee.isActive
      }
    })
  }

  const triggerDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete employee "${name}"? This soft-deletes the user record.`)) {
      deleteEmployeeMutation.mutate(id)
    }
  }

  const openEditModal = (employee: any) => {
    setEditEmployeeId(employee.id)
    setEditFullName(employee.fullName || '')
    setEditUsername(employee.username || '')
    setEditEmail(employee.email || '')
    setEditPin('')
    setEditRoleCode(employee.roleCode || '')
    setEditDepartment(employee.department || 'Operations')
    setEditCurrentSalary(employee.currentSalary ? employee.currentSalary.toString() : '0')
    setEditIsActive(Boolean(employee.isActive))
    setEditPhone(employee.phone || '')
    setEditOwnershipPercentage('')
    setEditInitialInvestment('')
    setEditEmployeeErrors({})
    setIsEditModalOpen(true)
  }

  const openResetModal = (employee: any) => {
    setResetEmployeeId(employee.id)
    setResetEmployeeName(employee.fullName)
    setResetPasswordOrPin('')
    setResetAdminPin('')
    setIsResetModalOpen(true)
  }

  // Filters calculation
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.department || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = roleFilter ? (emp.roleCode || '').toUpperCase() === roleFilter.toUpperCase() : true
    const matchesStatus = statusFilter ? (statusFilter === 'active' ? emp.isActive : !emp.isActive) : true
    return matchesSearch && matchesRole && matchesStatus
  })

  // Pagination calculation
  const totalPages = Math.ceil(filteredEmployees.length / pageSize)
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const getRoleBadgeVariant = (code: string) => {
    switch (code.toUpperCase()) {
      case 'SUPERADMIN':
      case 'PLATFORMADMIN':
        return 'danger'
      case 'COMPANYADMIN':
      case 'ACCOUNTANT':
        return 'primary'
      case 'MANAGER':
        return 'info'
      case 'SUPERVISOR':
        return 'warning'
      case 'OPERATOR':
        return 'warning'
      case 'QUALITY_CONTROLLER':
        return 'success'
      case 'MAINTENANCE':
        return 'gray'
      default:
        return 'gray'
    }
  }

  // Onboarding progress view
  if (user?.tenantStatus === 'Provisioning' || onboarding.status === 'Provisioning') {
    const checklistItems = [
      { percentage: 10, label: 'Workspace Registered' },
      { percentage: 20, label: 'Tenant Database Mapped' },
      { percentage: 50, label: 'Core Schema Migrations' },
      { percentage: 65, label: 'Security Roles Seeded' },
      { percentage: 75, label: 'Dynamic Permissions Seeding' },
      { percentage: 85, label: 'Enterprise Administrator Mapped' },
      { percentage: 95, label: 'Production Stations Initialized' },
      { percentage: 100, label: 'Workspace Complete & Ready' }
    ]

    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-6 font-sans relative overflow-hidden">
        {/* Futuristic Background Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse"></div>

        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800/80 backdrop-blur-2xl rounded-3xl p-8 shadow-[0_0_50px_rgba(37,99,235,0.15)] text-center space-y-8 relative z-10 animate-fade-in">

          {/* Top Logo / Spinner */}
          <div className="flex justify-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse"></div>
              {onboarding.progress >= 100 ? (
                <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center shadow-lg relative animate-scale-in">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-lg relative">
                  <Factory className="w-10 h-10 text-white animate-bounce" />
                  <div className="absolute inset-0 border-4 border-blue-400/30 border-t-blue-400 rounded-3xl animate-spin"></div>
                </div>
              )}
            </div>
          </div>

          {/* Header Title & Stage */}
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white font-display">
              {onboarding.progress >= 100 ? 'Workspace Ready!' : 'Initializing Tenant Environment'}
            </h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Establishing isolated Postgres schema credentials and provisioning company assets.
            </p>
          </div>

          {/* Large Animated Progress Section */}
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-mono font-bold text-slate-400 px-1">
              <span className="text-blue-400 animate-pulse">{onboarding.step}</span>
              <span className="text-white">{onboarding.progress}%</span>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-4 overflow-hidden p-1 border border-slate-800">
              <div
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                style={{ width: `${onboarding.progress}%` }}
              ></div>
            </div>

            {/* Estimated Remaining Time */}
            {onboarding.progress < 100 && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Estimated remaining time: <strong className="text-slate-350">{getEstimatedRemainingTime(onboarding.progress)}</strong></span>
              </div>
            )}
          </div>

          {/* Completed Checklist */}
          <div className="border-t border-slate-850 pt-5 text-left space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">Setup Progress Checklist</h3>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
              {checklistItems.map((item, idx) => {
                const isCompleted = onboarding.progress >= item.percentage
                const isCurrent = onboarding.progress < item.percentage && (idx === 0 || onboarding.progress >= checklistItems[idx - 1].percentage)

                return (
                  <div
                    key={item.percentage}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all duration-300 ${isCompleted
                      ? 'bg-green-950/20 border-green-500/20 text-green-300'
                      : isCurrent
                        ? 'bg-blue-950/30 border-blue-500/30 text-blue-300 animate-pulse'
                        : 'bg-slate-900/50 border-slate-850 text-slate-650'
                      }`}
                  >
                    <span className="text-[11px] font-semibold">{item.label}</span>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : isCurrent ? (
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 tracking-wider uppercase font-mono border-t border-slate-850 pt-4 flex justify-between items-center px-1">
            <span>Protocol: <strong className="text-indigo-400">SignalR Core</strong></span>
            <span>Status: <span className="text-blue-400 font-semibold">{onboarding.status}</span></span>
          </div>
        </div>
      </div>
    )
  }

  // Onboarding failure view
  if (onboarding.status === 'Failed') {
    const handleRetry = () => {
      useAuthStore.getState().updateUser({
        tenantStatus: null,
        tenantId: null,
        isTenantInitialized: false
      })
      navigate('/onboarding')
    }

    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-6 font-sans relative overflow-hidden">
        {/* Red Glow Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-650/5 rounded-full blur-[120px]"></div>

        <div className="max-w-md w-full bg-slate-900 border border-red-500/20 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl text-center space-y-6 relative z-10 animate-scale-in">
          <div className="w-16 h-16 bg-red-950/30 border border-red-500/30 rounded-2xl flex items-center justify-center shadow-lg mx-auto animate-pulse">
            <Wrench className="w-8 h-8 text-red-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-red-400 font-display">Provisioning Failed</h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
              An exception occurred at step: <strong className="text-slate-200">"{onboarding.step}"</strong>. Schema rollback was successfully triggered.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 text-[11px] text-red-300 text-left font-mono max-h-36 overflow-y-auto break-words leading-relaxed select-all">
            {onboarding.failureReason || 'Error Code: EXEC_ROLLBACK_ONBOARDING'}
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <EnterpriseButton
              variant="primary"
              className="w-full bg-red-600 hover:bg-red-500 border-none font-bold text-white transition-all shadow-[0_4px_12px_rgba(220,38,38,0.2)]"
              onClick={handleRetry}
            >
              Retry Onboarding Setup
            </EnterpriseButton>

            <div className="text-[10px] text-slate-500 text-center leading-relaxed">
              If the problem persists, contact our platform Support: <br />
              <strong className="text-slate-350 select-all">webzio.info@gmail.com</strong>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isSettingsView) {
    return (
      <PageContainer>
        <PageHeader
          title="Company Settings"
          description="Manage configuration parameters for the current company tenant."
        />
        <EnterpriseCard title="Tenant Setup Preferences">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <EnterpriseInput label="Tenant Name" defaultValue="Aquzio Ltd" />
            <EnterpriseInput label="Subdomain PREFIX" defaultValue="aquzio" disabled className="bg-slate-50 dark:bg-slate-800" />
            <EnterpriseInput label="Primary Admin Email" defaultValue="admin@aquzio.industrial" />
          </div>
          <EnterpriseButton>Save Preferences</EnterpriseButton>
        </EnterpriseCard>

        <EnterpriseCard title="Security">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[#111827]">Company Secret PIN</h3>
            <p className="text-xs text-[#6B7280]">
              Configure the Company Secret PIN required to view or change employee access credentials. Only Company Admins can manage this setting.
            </p>
            {!isCompanyAdmin ? (
              <div className="mt-4 p-3 bg-[#FEF3C7] text-[#92400E] rounded-[8px] text-xs font-semibold select-none">
                You do not have administrative permissions to view or update the Company Secret PIN.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <EnterpriseInput
                    label="Company Secret PIN"
                    type="password"
                    placeholder="Enter 4+ digit PIN"
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value)}
                  />
                  <EnterpriseInput
                    label="Confirm Company Secret PIN"
                    type="password"
                    placeholder="Confirm PIN"
                    value={confirmSecurityPin}
                    onChange={(e) => setConfirmSecurityPin(e.target.value)}
                  />
                </div>
                <div>
                  <EnterpriseButton onClick={handleSaveSecurityPin} loading={isSavingSecurityPin}>
                    Save Security PIN
                  </EnterpriseButton>
                </div>
              </div>
            )}
          </div>
        </EnterpriseCard>

        <ProductionShiftsManager />

        <EnterpriseCard title="Production Stations Configuration">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-4 select-none">
            Toggle production lines active stations ({!canConfigureStations ? 'Read-only' : 'Tenant Administrator'})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {Object.keys(stationStates).map((stationName) => {
              const isEnabled = stationStates[stationName]
              return (
                <div key={stationName} className="flex items-center justify-between p-3.5 bg-slate-50 border border-[#E5E7EB] rounded-[8px]">
                  <div className="text-left select-none">
                    <span className="text-xs font-bold text-slate-800 block">{stationName} Station</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {stationName === 'Blowing' && 'Preform usage/wastage logging & stock movement.'}
                      {stationName === 'Filling' && 'Cap usage/wastage, bottle & water filling.'}
                      {stationName === 'Labeling' && 'Label usage/wastage logging & stock movement.'}
                      {stationName === 'Packing' && 'Shrink film, glue, ink, and makeup logs.'}
                    </span>
                  </div>
                  <label className={`relative inline-flex items-center cursor-pointer select-none ${!canConfigureStations ? 'pointer-events-none opacity-60' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      disabled={!canConfigureStations}
                      onChange={(e) => setStationStates(prev => ({ ...prev, [stationName]: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                </div>
              )
            })}
          </div>
          {canConfigureStations && (
            <EnterpriseButton onClick={handleSaveStations} loading={saveStationsMutation.isPending}>
              Save Production Stations
            </EnterpriseButton>
          )}
        </EnterpriseCard>
      </PageContainer>
    )
  }

  // Live ticking duration component for manufacturing batches
  const RunningDurationCell: React.FC<{ startedAt: string }> = ({ startedAt }) => {
    const [duration, setDuration] = useState('00:00:00')

    useEffect(() => {
      const update = () => {
        const diff = Math.max(0, Date.now() - new Date(startedAt).getTime())
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const mins = Math.floor((diff / (1000 * 60)) % 60)
        const secs = Math.floor((diff / 1000) % 60)
        setDuration(
          `${hours.toString().padStart(2, '0')}:${mins
            .toString()
            .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        )
      }
      update()
      const interval = setInterval(update, 1000)
      return () => clearInterval(interval)
    }, [startedAt])

    return <span className="font-mono font-semibold text-xs tracking-wider text-slate-600 dark:text-slate-300">{duration}</span>
  }

  if (isProductionView) {
    // Actions and Form Handlers
    const handleStartBatchSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!startBatchLineId) {
        showToast('Production line is required.', 'warning')
        return
      }
      if (!startBatchNumber.trim()) {
        showToast('Batch number is required.', 'warning')
        return
      }
      if (!startBatchProduct) {
        showToast('Product selection is required.', 'warning')
        return
      }
      if (!startBatchTargetQty || Number(startBatchTargetQty) <= 0) {
        showToast('Target quantity must be greater than zero.', 'warning')
        return
      }

      startBatchMutation.mutate({
        productionLineId: startBatchLineId,
        batchNumber: startBatchNumber.trim(),
        product: startBatchProduct,
        shift: startBatchShift,
        targetQuantity: Number(startBatchTargetQty)
      })
    }

    const handleOpenOperatorSession = (row: any) => {
      const lineObj = {
        lineId: row.productionLineId,
        name: row.productionLineName,
        code: row.productionLineCode,
        isActive: true
      }
      localStorage.setItem('mes_selected_line', JSON.stringify(lineObj))
      localStorage.setItem('mes_selected_shift', row.shift)
      window.open('/operator', '_blank')
    }

    const handlePauseBatch = (id: string) => { pauseBatchMutation.mutate(id) }
    const handleResumeBatch = (id: string) => { resumeBatchMutation.mutate(id) }
    const handleCompleteBatch = (id: string) => {
      if (confirm('Are you sure you want to complete and lock this active production batch?')) {
        completeBatchMutation.mutate(id)
      }
    }

    // Local filtering logic for the complete batch register
    const filteredBatches = allBatches.filter((batch: any) => {
      const s = (batchSearch || '').trim().toLowerCase()
      const matchesSearch = !s ||
        (batch.batchNumber && batch.batchNumber.toLowerCase().includes(s)) ||
        (batch.product && batch.product.toLowerCase().includes(s)) ||
        (batch.operatorName && batch.operatorName.toLowerCase().includes(s)) ||
        (batch.productionLineName && batch.productionLineName.toLowerCase().includes(s)) ||
        (batch.productionLineCode && batch.productionLineCode.toLowerCase().includes(s)) ||
        (batch.shift && batch.shift.toLowerCase().includes(s))

      const matchesLine = batchLineFilter === '' || batch.productionLineId === batchLineFilter

      let matchesStatus = true
      if (batchStatusFilter && batchStatusFilter !== 'All') {
        const statusUpper = (batch.status || (batch.completedAt ? 'COMPLETED' : '')).toUpperCase()
        if (batchStatusFilter === 'Running' || batchStatusFilter === 'Active') {
          matchesStatus = statusUpper === 'ACTIVE' || statusUpper === 'RUNNING' || statusUpper === 'BOTTLING ACTIVE' || statusUpper === 'IN PROGRESS'
        } else if (batchStatusFilter === 'Paused') {
          matchesStatus = statusUpper === 'PAUSED'
        } else if (batchStatusFilter === 'Completed') {
          matchesStatus = statusUpper === 'COMPLETED' || !!batch.completedAt
        } else if (batchStatusFilter === 'Cancelled') {
          matchesStatus = statusUpper === 'CANCELLED' || statusUpper === 'STOPPED'
        } else {
          matchesStatus = statusUpper === batchStatusFilter.toUpperCase()
        }
      }

      let matchesDate = true
      if (batchDateFilter) {
        const batchDate = batch.startedAt || batch.createdAt || batch.completedAt
        matchesDate = !!batchDate && new Date(batchDate).toISOString().slice(0, 10) === batchDateFilter
      }

      return matchesSearch && matchesLine && matchesStatus && matchesDate
    })

    const searchParams = new URLSearchParams(location.search)
    const productionTab = searchParams.get('tab') || 'batches'

    if (productionTab === 'batches') {
      return (
        <div className="w-full h-full min-h-0">
          <ProductionBatchesView
            allBatches={allBatches}
            activeBatches={activeBatches}
            batchesLoading={batchesLoading}
            isError={batchesError}
            productionLines={productionLines}
            catalogProducts={allCatalogProducts}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['allBatchesList'] })
              queryClient.invalidateQueries({ queryKey: ['activeBatchesList'] })
              queryClient.invalidateQueries({ queryKey: ['productionDashboard'] })
              queryClient.invalidateQueries({ queryKey: ['cockpitReporting'] })
            }}
            isOwnerRole={isOwnerRole}
            onCreateBatchClick={() => {
              if (productionLines.length > 0) setStartBatchLineId(productionLines[0].lineId)
              if (allCatalogProducts.length > 0) setStartBatchProduct(allCatalogProducts[0].name)
              setIsStartBatchModalOpen(true)
            }}
          />

          {/* Premium Light Theme Create Production Batch Modal */}
          {isStartBatchModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                onClick={() => !startBatchMutation.isPending && setIsStartBatchModalOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
              />

              <div className="relative w-full max-w-[650px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
                role="dialog" aria-modal="true" aria-labelledby="batch-modal-title"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && !startBatchMutation.isPending) {
                    setIsStartBatchModalOpen(false);
                  }
                }}>

                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                  <div>
                    <h3 id="batch-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Factory className="w-5 h-5 text-slate-500" /> Create Production Batch
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Initialize a new water run on the production floor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !startBatchMutation.isPending && setIsStartBatchModalOpen(false)}
                    className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                    disabled={startBatchMutation.isPending}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleStartBatchSubmit} className="flex flex-col gap-6">

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Row 1 */}
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-sm font-semibold text-gray-700">Production Line <span className="text-red-500">*</span></label>
                      <select
                        value={startBatchLineId}
                        onChange={e => setStartBatchLineId(e.target.value)}
                        required
                        className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                      >
                        <option value="" disabled>Select Production Line</option>
                        {productionLines.map((line: any) => (
                          <option key={line.lineId} value={line.lineId}>{line.name} ({line.code})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-sm font-semibold text-gray-700">Batch Number / Code <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="e.g. LOT-001, B-RUN-12"
                        value={startBatchNumber}
                        onChange={e => setStartBatchNumber(e.target.value)}
                        required
                        className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                      />
                      <BatchNumberSuggestion
                        value={startBatchNumber}
                        badgeLetters={companyBadgeLetters}
                        onApplyPrefix={setStartBatchNumber}
                      />
                    </div>

                    {/* Row 2 */}
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-sm font-semibold text-gray-700">Product <span className="text-red-500">*</span></label>
                      <select
                        value={startBatchProduct}
                        onChange={e => setStartBatchProduct(e.target.value)}
                        required
                        className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                      >
                        <option value="" disabled>Select Product</option>
                        {allCatalogProducts.map((prod: any) => (
                          <option key={prod.id} value={prod.name}>{prod.name} {prod.sku ? `(${prod.sku})` : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-sm font-semibold text-gray-700">Shift <span className="text-red-500">*</span></label>
                      <select
                        value={startBatchShift}
                        onChange={e => setStartBatchShift(e.target.value)}
                        required
                        className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                      >
                        <option value="" disabled>Select Shift</option>
                        {productionShifts.filter((s: any) => s.isActive).map((shift: any) => (
                          <option key={shift.id} value={shift.name}>{shift.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-sm font-semibold text-gray-700">Target Quantity (Cases) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      placeholder="e.g. 1000"
                      value={startBatchTargetQty}
                      onChange={e => setStartBatchTargetQty(e.target.value)}
                      required
                      className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsStartBatchModalOpen(false)}
                      disabled={startBatchMutation.isPending}
                      className="px-5 h-10 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={startBatchMutation.isPending}
                      className="px-6 h-10 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-sm cursor-pointer"
                    >
                      {startBatchMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Starting...
                        </span>
                      ) : 'Start Batch'}
                    </button>
                  </div>

                </form>
              </div>
            </div>
          )}
        </div>
      )
    }

    const pageTitle = productionTab === 'lines' ? 'Production Lines' : 'Production Shifts'
    const pageDesc = productionTab === 'lines' ? 'Manage production bottling & packaging lines' : 'Configure operational shifts, start & end times'

    return (
      <PageContainer>
        <PageHeader
          title={pageTitle}
          description={pageDesc}
          actions={
            productionTab === 'batches' ? (
              !isOwnerRole ? (
                <button
                  onClick={() => {
                    if (productionLines.length > 0) setStartBatchLineId(productionLines[0].lineId)
                    if (allCatalogProducts.length > 0) setStartBatchProduct(allCatalogProducts[0].name)
                    setIsStartBatchModalOpen(true)
                  }}
                  className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Batch</span>
                </button>
              ) : null
            ) : productionTab === 'lines' ? (
              !isOwnerRole ? (
                <button
                  onClick={() => setIsAddLineModalOpen(true)}
                  className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Production Line</span>
                </button>
              ) : null
            ) : null
          }
        />

        {productionTab === 'lines' ? (
          <>
            {/* Production Lines Table */}
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-[12px] font-bold text-slate-700">Production Lines</span>
            </div>
            {linesLoading ? (
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 text-center text-[12px] text-slate-400 shadow-sm">
                Loading production lines...
              </div>
            ) : productionLines.length > 0 ? (
              <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px] border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-slate-600 font-bold select-none h-[36px]">
                        <th className="py-2 px-4">Line Code</th>
                        <th className="py-2 px-4">Line Name</th>
                        <th className="py-2 px-4">Status</th>
                        {!isOwnerRole && <th className="py-2 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {productionLines.map((row: any) => (
                        <tr key={row.lineId} className="hover:bg-[#F8FAFC] h-[38px] transition-colors">
                          <td className="py-2 px-4 font-mono font-bold text-blue-600">{row.code}</td>
                          <td className="py-2 px-4 font-semibold text-slate-900">{row.name}</td>
                          <td className="py-2 px-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${row.isActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                              {row.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          {!isOwnerRole && (
                            <td className="py-2 px-4 text-right">
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => openEditLineModal(row)}
                                  className="p-1 border border-[#E5E7EB] hover:bg-slate-50 text-slate-500 rounded"
                                  title="Edit Line"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => triggerDeleteLine(row.lineId, row.name)}
                                  className="p-1 border border-red-200 hover:bg-red-50 text-red-600 rounded"
                                  title="Delete Line"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-10 text-center shadow-sm">
                <p className="text-[13px] font-semibold text-slate-500">No production lines found. Create your first line to get started.</p>
              </div>
            )}
          </>
        ) : (
          <ProductionShiftsManager />
        )}

        {/* Add Production Line Modal */}
        <EnterpriseModal isOpen={isAddLineModalOpen} onClose={() => setIsAddLineModalOpen(false)} title="Create Production Line">
          <form onSubmit={handleAddLineSubmit} className="flex flex-col gap-4">
            <EnterpriseInput label="Line Name *" value={addLineName} onChange={(e) => setAddLineName(e.target.value)} placeholder="e.g. Bottling Line C" required />
            <EnterpriseInput label="Line Code *" value={addLineCode} onChange={(e) => setAddLineCode(e.target.value)} placeholder="e.g. LINE_C" required />
            <div className="flex items-center gap-3 mt-2 select-none">
              <button type="button" onClick={() => setAddLineIsActive(!addLineIsActive)} className="cursor-pointer">
                {addLineIsActive ? <ToggleRight className="w-9 h-9 text-green-500" /> : <ToggleLeft className="w-9 h-9 text-slate-400" />}
              </button>
              <span className="text-xs font-semibold text-slate-800">Active Status</span>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => setIsAddLineModalOpen(false)} variant="secondary">Cancel</EnterpriseButton>
              <EnterpriseButton type="submit" loading={createLineMutation.isPending}>Create Line</EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* Edit Production Line Modal */}
        <EnterpriseModal isOpen={isEditLineModalOpen} onClose={() => setIsEditLineModalOpen(false)} title="Modify Production Line">
          <form onSubmit={handleEditLineSubmit} className="flex flex-col gap-4">
            <EnterpriseInput label="Line Name *" value={editLineName} onChange={(e) => setEditLineName(e.target.value)} required />
            <EnterpriseInput label="Line Code *" value={editLineCode} onChange={(e) => setEditLineCode(e.target.value)} required />
            <div className="flex items-center gap-3 mt-2 select-none">
              <button type="button" onClick={() => setEditLineIsActive(!editLineIsActive)} className="cursor-pointer">
                {editLineIsActive ? <ToggleRight className="w-9 h-9 text-green-500" /> : <ToggleLeft className="w-9 h-9 text-slate-400" />}
              </button>
              <span className="text-xs font-semibold text-slate-800">Active Status</span>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => setIsEditLineModalOpen(false)} variant="secondary">Cancel</EnterpriseButton>
              <EnterpriseButton type="submit" loading={updateLineMutation.isPending}>Save Changes</EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* Premium Light Theme Create Production Batch Modal */}
        {isStartBatchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              onClick={() => !startBatchMutation.isPending && setIsStartBatchModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            />

            <div className="relative w-full max-w-[650px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
              role="dialog" aria-modal="true" aria-labelledby="batch-modal-title"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !startBatchMutation.isPending) {
                  setIsStartBatchModalOpen(false);
                }
              }}>

              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                <div>
                  <h3 id="batch-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Factory className="w-5 h-5 text-slate-500" /> Create Production Batch
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Initialize a new water run on the production floor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !startBatchMutation.isPending && setIsStartBatchModalOpen(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                  disabled={startBatchMutation.isPending}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleStartBatchSubmit} className="flex flex-col gap-6">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Row 1 */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-sm font-semibold text-gray-700">Production Line <span className="text-red-500">*</span></label>
                    <select
                      value={startBatchLineId}
                      onChange={e => setStartBatchLineId(e.target.value)}
                      required
                      className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                    >
                      <option value="" disabled>Select Production Line</option>
                      {productionLines.map((line: any) => (
                        <option key={line.lineId} value={line.lineId}>{line.name} ({line.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-sm font-semibold text-gray-700">Batch Number / Code <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. LOT-001, B-RUN-12"
                      value={startBatchNumber}
                      onChange={e => setStartBatchNumber(e.target.value)}
                      required
                      className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                    />
                    <BatchNumberSuggestion
                      value={startBatchNumber}
                      badgeLetters={companyBadgeLetters}
                      onApplyPrefix={setStartBatchNumber}
                    />
                  </div>

                  {/* Row 2 */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-sm font-semibold text-gray-700">Product <span className="text-red-500">*</span></label>
                    <select
                      value={startBatchProduct}
                      onChange={e => setStartBatchProduct(e.target.value)}
                      required
                      className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                    >
                      <option value="" disabled>Select Product</option>
                      {allCatalogProducts.map((prod: any) => (
                        <option key={prod.id} value={prod.name}>{prod.name} {prod.sku ? `(${prod.sku})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-sm font-semibold text-gray-700">Shift <span className="text-red-500">*</span></label>
                    <select
                      value={startBatchShift}
                      onChange={e => setStartBatchShift(e.target.value)}
                      required
                      className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                    >
                      <option value="" disabled>Select Shift</option>
                      {productionShifts.filter((s: any) => s.isActive).map((shift: any) => (
                        <option key={shift.id} value={shift.name}>{shift.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Target Quantity (Cases) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={startBatchTargetQty}
                    onChange={e => setStartBatchTargetQty(e.target.value)}
                    required
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                  />
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsStartBatchModalOpen(false)}
                    disabled={startBatchMutation.isPending}
                    className="px-5 h-10 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={startBatchMutation.isPending}
                    className="px-6 h-10 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-sm cursor-pointer"
                  >
                    {startBatchMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Starting...
                      </span>
                    ) : 'Start Batch'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}
      </PageContainer>
    )
  }

  if (isSalesView) {
    return (
      <SalesPage canWrite={canWrite} showToast={showToast} />
    )
  }

  if (isCustomersView) {
    return (
      <CustomersPage />
    )
  }

  if (isInventoryView) {
    return (
      <InventoryPage canWrite={canWrite} showToast={showToast} />
    )
  }

  if (isEmployeesView) {
    const employeeColumns = [
      {
        key: 'fullName',
        title: 'Employee',
        render: (row: any) => (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-[#E6F6F4] text-[#0B7A70] border border-[#B8E6E0] font-extrabold flex items-center justify-center uppercase text-xs">
              {row.fullName.charAt(0)}
            </div>
            <span className="font-semibold text-[#111827]">{row.fullName}</span>
          </div>
        )
      },
      {
        key: 'username',
        title: 'Username',
        render: (row: any) => <span className="font-mono text-[#6B7280]">{row.username}</span>
      },
      {
        key: 'roleName',
        title: 'Role',
        render: (row: any) => {
          let badgeClass = "bg-slate-100 text-[#374151]"
          const code = row.roleCode.toUpperCase()
          if (code === 'COMPANYADMIN' || code === 'ACCOUNTANT') badgeClass = "bg-[#E6F6F4] text-[#0B7A70] border border-[#B8E6E0]"
          else if (code === 'OWNER') badgeClass = "bg-[#FEF3C7] text-[#92400E]"
          else if (code === 'OPERATOR') badgeClass = "bg-[#FEF3C7] text-[#B45309]"
          else if (code === 'SUPERVISOR') badgeClass = "bg-[#F3E8FF] text-[#6B21A8]"
          else if (code === 'MANAGER') badgeClass = "bg-[#D1FAE5] text-[#047857]"
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold select-none ${badgeClass}`}>
              {row.roleName}
            </span>
          )
        }
      },
      {
        key: 'department',
        title: 'Department',
        className: 'font-medium text-[#374151]'
      },
      {
        key: 'currentSalary',
        title: 'Current Salary',
        render: (row: any) => <span className="font-semibold text-[#111827]">₹{(row.currentSalary ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      },
      {
        key: 'isActive',
        title: 'Status',
        render: (row: any) => (
          <button
            onClick={() => triggerToggleStatus(row)}
            className="flex items-center gap-1 hover:opacity-80 cursor-pointer"
            title="Toggle Account active state"
          >
            <EnterpriseBadge variant={row.isActive ? 'success' : 'danger'}>
              {row.isActive ? 'Active' : 'Inactive'}
            </EnterpriseBadge>
          </button>
        )
      },
      {
        key: 'createdAt',
        title: 'Created Date',
        render: (row: any) => <span className="text-[#374151]">{new Date(row.createdAt).toLocaleDateString()}</span>
      },
      {
        key: 'lastLogin',
        title: 'Last Login',
        render: (row: any) => <span className="text-[#374151]">{row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'}</span>
      },
      {
        key: 'actions',
        title: 'Actions',
        className: 'text-right',
        render: (row: any) => (
          <div className="flex gap-1 justify-end">
            <button onClick={() => setSelectedEmployeeForView(row)} className="p-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-full cursor-pointer transition-colors" title="View details"><Eye className="w-3.5 h-3.5" /></button>
            <button onClick={() => openEditModal(row)} className="p-2 text-[#0B7A70] hover:bg-[#F4F7F8] rounded-full cursor-pointer transition-colors" title="Edit Profile"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => openResetModal(row)} className="p-2 text-[#D97706] hover:bg-[#F3F4F6] rounded-full cursor-pointer transition-colors" title="Reset Password/PIN"><Key className="w-3.5 h-3.5" /></button>
            <button onClick={() => triggerDelete(row.id, row.fullName)} className="p-2 text-[#EF4444] hover:bg-[#F3F4F6] rounded-full cursor-pointer transition-colors" title="Delete User"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )
      }
    ]

    return (
      <PageContainer>
        <PageHeader
          title="Employees"
          description="Provision operator credentials and configure RBAC authorization roles."
          actions={
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Employee
            </button>
          }
        />

        {/* Filters */}
        <FilterBar>
          <div className="flex-1 relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search by name, username, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-xs pl-9 pr-4 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 border border-slate-200 bg-white text-slate-700 text-xs px-3 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">All Roles</option>
            {roles.map((r: any) => (
              <option key={r.id} value={r.code}>{r.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 border border-slate-200 bg-white text-slate-700 text-xs px-3 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FilterBar>

        {/* Table Grid list */}
        {employeesLoading ? (
          <EnterpriseLoading label="Fetching employee listings..." />
        ) : filteredEmployees.length > 0 ? (
          <div className="flex flex-col gap-4">
            <EnterpriseTable
              columns={employeeColumns}
              data={paginatedEmployees}
              emptyMessage="No employees matched your criteria."
            />
            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="p-4 border border-[#E5E7EB] bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex justify-between items-center text-xs select-none">
                <span className="text-[#6B7280] font-semibold">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <EnterpriseButton
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    variant="secondary"
                    className="py-1 px-3 text-xs"
                  >
                    Prev
                  </EnterpriseButton>
                  <EnterpriseButton
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    variant="secondary"
                    className="py-1 px-3 text-xs"
                  >
                    Next
                  </EnterpriseButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EnterpriseEmptyState
            title="No Employees Found"
            description="Clear your filter criteria or register a new employee to get started."
            actionLabel="Add Employee"
            onAction={() => setIsAddModalOpen(true)}
          />
        )}

        {/* 1. View Employee Modal card */}
        {selectedEmployeeForView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Inline stylesheet for transition animations */}
            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes modalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes modalScaleIn {
                from { transform: scale(0.96); }
                to { transform: scale(1); }
              }
              .animate-modal-backdrop {
                animation: modalFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
              .animate-modal-container {
                animation: modalFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards,
                           modalScaleIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}} />

            {/* Backdrop */}
            <div
              onClick={() => setSelectedEmployeeForView(null)}
              className="fixed inset-0 bg-[#0F172A]/35 backdrop-blur-[4px] animate-modal-backdrop"
            />

            {/* Dialog Body Container */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              className="relative w-full max-w-[620px] max-h-[90vh] overflow-y-auto bg-white border border-[#E5E7EB] p-[28px] rounded-[16px] shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col gap-6 animate-modal-container z-10 select-none"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-5 border-b border-[#E5E7EB]">
                <div className="flex items-center gap-4">
                  {/* Circular Avatar */}
                  <div className="w-[56px] h-[56px] rounded-full bg-[#E6F6F4] text-[#05303B] border border-[#B8E6E0] flex items-center justify-center font-bold text-[22px] uppercase shrink-0">
                    {selectedEmployeeForView.fullName.charAt(0)}
                  </div>
                  <div className="flex flex-col text-left">
                    <h4 id="modal-title" className="font-semibold text-[20px] text-[#111827] leading-tight">
                      {selectedEmployeeForView.fullName}
                    </h4>
                    <span className="text-[14px] text-[#6B7280] font-normal mt-1 leading-none">
                      {selectedEmployeeForView.department}
                    </span>
                  </div>
                </div>
                {/* Circular Close Button */}
                <button
                  onClick={() => setSelectedEmployeeForView(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] transition-all cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grid Information Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                {/* Authorization Role */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5 items-start">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Authorization Role</span>
                  {(() => {
                    let badgeClass = "bg-slate-100 text-[#374151]"
                    const code = selectedEmployeeForView.roleCode.toUpperCase()
                    if (code === 'COMPANYADMIN' || code === 'ACCOUNTANT') badgeClass = "bg-[#E6F6F4] text-[#0B7A70] border border-[#B8E6E0]"
                    else if (code === 'OWNER') badgeClass = "bg-[#FEF3C7] text-[#92400E]"
                    else if (code === 'OPERATOR') badgeClass = "bg-[#FEF3C7] text-[#92400E]"
                    else if (code === 'SUPERVISOR') badgeClass = "bg-[#F3E8FF] text-[#6B21A8]"
                    else if (code === 'MANAGER') badgeClass = "bg-[#D1FAE5] text-[#065F46]"
                    return (
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold select-none ${badgeClass} leading-tight`}>
                        {selectedEmployeeForView.roleName}
                      </span>
                    )
                  })()}
                </div>

                {/* Department */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Department</span>
                  <span className="text-[15px] font-semibold text-[#111827] leading-tight">
                    {selectedEmployeeForView.department}
                  </span>
                </div>

                {/* Current Salary */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Current Salary</span>
                  <span className="text-[15px] font-semibold text-[#111827] leading-tight">
                    ₹{(selectedEmployeeForView.currentSalary ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Status */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5 items-start">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Status</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold select-none leading-none ${selectedEmployeeForView.isActive
                    ? 'bg-[#DCFCE7] text-[#166534]'
                    : 'bg-[#FEE2E2] text-[#991B1B]'
                    }`}>
                    {selectedEmployeeForView.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Created Date */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Created Date</span>
                  <span className="text-[15px] font-semibold text-[#111827] leading-tight">
                    {new Date(selectedEmployeeForView.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Last Login */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Last Login</span>
                  <span className="text-[15px] font-semibold text-[#111827] leading-tight">
                    {selectedEmployeeForView.lastLogin
                      ? new Date(selectedEmployeeForView.lastLogin).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </span>
                </div>

                {/* Record ID */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-[#6B7280] leading-none">Record ID</span>
                  <div className="flex items-center justify-between gap-3">
                    <span style={{ fontFamily: 'SF Mono, monospace' }} className="text-[13px] bg-[#F3F4F6] text-[#111827] px-2.5 py-1 rounded-[8px] select-all truncate flex-1 text-left leading-normal border border-[#E5E7EB]">
                      {selectedEmployeeForView.id}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedEmployeeForView.id);
                        showToast('Record ID copied to clipboard.', 'success');
                      }}
                      className="px-3 py-1 text-xs font-semibold text-[#0B7A70] hover:bg-[#E6F6F4] rounded-[8px] cursor-pointer transition-colors shrink-0"
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Login Credentials Section */}
                <div className="md:col-span-2 border-t border-[#E5E7EB] pt-4 mt-2">
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-4 select-none">Login Credentials</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Username */}
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium text-[#6B7280] leading-none">Username</span>
                      <span className="text-[14px] font-semibold text-[#111827] font-mono leading-tight truncate">
                        {selectedEmployeeForView.username}
                      </span>
                    </div>

                    {/* Email */}
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium text-[#6B7280] leading-none">Email</span>
                      <span className="text-[14px] font-semibold text-[#111827] font-mono leading-tight truncate" title={selectedEmployeeForView.email}>
                        {selectedEmployeeForView.email || 'N/A'}
                      </span>
                    </div>

                    {/* Security & Password Reset Action */}
                    {isCompanyAdmin && (
                      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col justify-between gap-1.5">
                        <span className="text-[12px] font-medium text-[#6B7280] leading-none">Security</span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-slate-600 font-medium">Password</span>
                          <button
                            type="button"
                            onClick={() => {
                              setPinVerifyValue('');
                              setIsPinVerifyModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white rounded-[8px] cursor-pointer transition-colors"
                          >
                            Change Password
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-4 border-t border-[#E5E7EB] mt-2">
                <button
                  onClick={() => setSelectedEmployeeForView(null)}
                  className="px-6 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-medium text-sm rounded-[10px] h-[42px] cursor-pointer transition-all active:scale-[0.98]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin PIN Verification Modal */}
        <EnterpriseModal
          isOpen={isPinVerifyModalOpen}
          onClose={() => setIsPinVerifyModalOpen(false)}
          title="Verify Admin PIN"
          maxWidth="sm"
        >
          <form onSubmit={handleVerifyPinSubmit} className="flex flex-col gap-4">
            <p className="text-[11px] text-[#6B7280]">
              Enter your 4-digit Admin PIN to continue.
            </p>
            <EnterpriseInput
              label="Admin PIN *"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="• • • •"
              value={pinVerifyValue}
              onChange={(e) => setPinVerifyValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => setIsPinVerifyModalOpen(false)} variant="secondary">
                Cancel
              </EnterpriseButton>
              <EnterpriseButton type="submit" loading={isPinVerifying} disabled={isPinVerifying || pinVerifyValue.length !== 4}>
                {isPinVerifying ? 'Verifying...' : 'Verify PIN'}
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* Change Employee Password Modal */}
        <EnterpriseModal
          isOpen={isChangePasswordModalOpen}
          onClose={() => setIsChangePasswordModalOpen(false)}
          title="Change Employee Password"
          maxWidth="sm"
        >
          <form onSubmit={handleUpdatePasswordSubmit} className="flex flex-col gap-4">
            <p className="text-[11px] text-[#6B7280]">
              Set a new secure password for <strong className="text-slate-800">{selectedEmployeeForView?.fullName ?? 'this employee'}</strong>. Minimum 8 characters required.
            </p>
            <div className="relative">
              <EnterpriseInput
                label="New Password *"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={newPasswordVal}
                onChange={(e) => setNewPasswordVal(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <EnterpriseInput
                label="Confirm Password *"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPasswordVal}
                onChange={(e) => setConfirmPasswordVal(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleGenerateStrongPassword}
                disabled={isGeneratingPassword}
                className="px-3 py-1.5 text-xs font-semibold text-[#0B7A70] hover:bg-[#E6F6F4] disabled:opacity-50 rounded-[8px] cursor-pointer transition-colors"
              >
                {isGeneratingPassword ? 'Generating...' : 'Generate Password'}
              </button>
              <div className="flex gap-2">
                <EnterpriseButton type="button" onClick={() => setIsChangePasswordModalOpen(false)} variant="secondary">
                  Cancel
                </EnterpriseButton>
                <EnterpriseButton type="submit" loading={isUpdatingPassword} disabled={isUpdatingPassword}>
                  {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
                </EnterpriseButton>
              </div>
            </div>
          </form>
        </EnterpriseModal>

        {/* 2. Add Employee dialog */}
        <EnterpriseModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false)
            setAddEmployeeErrors({})
          }}
          title="Register New Employee"
        >
          <form onSubmit={handleAddEmployeeSubmit} className="flex flex-col gap-4">
            <EnterpriseInput
              label="Full Name *"
              value={addFullName}
              onChange={(e) => setAddFullName(e.target.value)}
              placeholder="e.g. John Doe"
              error={addEmployeeErrors.fullName}
            />
            <EnterpriseInput
              label="Username *"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              placeholder="e.g. john_doe"
              error={addEmployeeErrors.username}
            />
            <EnterpriseInput
              label="Email *"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="e.g. john.doe@company.com"
              error={addEmployeeErrors.email}
            />
            <EnterpriseSelect
              label="Role *"
              value={addRoleCode}
              onChange={(e) => setAddRoleCode(e.target.value)}
              error={addEmployeeErrors.roleCode}
            >
              <option value="">Select Role</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.code}>{r.name}</option>
              ))}
            </EnterpriseSelect>

            {addRoleCode.toUpperCase() === 'OWNER' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col gap-3 transition-all animate-fadeIn">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-semibold text-amber-900">Owner Profile Integration</span>
                  <span className="text-[10px] bg-amber-200/70 text-amber-800 px-1.5 py-0.5 rounded font-medium ml-auto">Auto-Linked Profile</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Registering this employee as <strong>Owner</strong> will automatically create and link an official Owner profile under Accounts &gt; Owners with identical credentials and tenant isolation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <EnterpriseInput
                    label="Phone Number"
                    placeholder="e.g. +91 98765 43210"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                  />
                  <EnterpriseInput
                    label="Ownership Share (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 50"
                    value={addOwnershipPercentage}
                    onChange={(e) => setAddOwnershipPercentage(e.target.value)}
                  />
                </div>
                <EnterpriseInput
                  label="Initial Capital Investment (₹)"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="e.g. 500000"
                  value={addInitialInvestment}
                  onChange={(e) => setAddInitialInvestment(e.target.value)}
                />
              </div>
            )}

            <EnterpriseInput
              label="Password or PIN *"
              type="password"
              placeholder="Enter Password or PIN"
              value={addPasswordOrPin}
              onChange={(e) => setAddPasswordOrPin(e.target.value)}
              error={addEmployeeErrors.passwordOrPin}
            />

            <EnterpriseSelect
              label="Department"
              value={addDepartment}
              onChange={(e) => setAddDepartment(e.target.value)}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </EnterpriseSelect>

            <EnterpriseInput
              label="Current Salary (₹) *"
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter Current Monthly Salary"
              value={addCurrentSalary}
              onChange={(e) => setAddCurrentSalary(e.target.value)}
              error={addEmployeeErrors.currentSalary}
            />

            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => {
                setIsAddModalOpen(false)
                setAddEmployeeErrors({})
              }} variant="secondary">
                Cancel
              </EnterpriseButton>
              <EnterpriseButton type="submit" loading={createEmployeeMutation.isPending}>
                Create User
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* 3. Edit Employee dialog */}
        <EnterpriseModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setEditEmployeeErrors({})
          }}
          title="Modify Employee Account"
        >
          <form onSubmit={handleEditEmployeeSubmit} className="flex flex-col gap-4">
            <EnterpriseInput
              label="Full Name *"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              placeholder="e.g. John Doe"
              error={editEmployeeErrors.fullName}
            />

            <EnterpriseInput
              label="Username *"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              placeholder="e.g. john_doe"
              error={editEmployeeErrors.username}
            />

            <EnterpriseInput
              label="Email *"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="e.g. john.doe@company.com"
              error={editEmployeeErrors.email}
            />

            <div>
              <EnterpriseInput
                label="Password or PIN (Optional)"
                type="password"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value)}
                placeholder="Leave blank to keep existing password"
                error={editEmployeeErrors.pin}
              />
              <p className="text-[11px] text-[#6B7280] mt-1 ml-0.5">
                Leave blank to keep current password unchanged. Min 4 characters to set a new password or PIN.
              </p>
            </div>

            <EnterpriseSelect
              label="Role *"
              value={editRoleCode}
              onChange={(e) => setEditRoleCode(e.target.value)}
              error={editEmployeeErrors.roleCode}
            >
              {roles.map((r: any) => (
                <option key={r.id} value={r.code}>{r.name}</option>
              ))}
            </EnterpriseSelect>

            {editRoleCode.toUpperCase() === 'OWNER' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col gap-3 transition-all animate-fadeIn">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-semibold text-amber-900">Owner Profile Integration</span>
                  <span className="text-[10px] bg-amber-200/70 text-amber-800 px-1.5 py-0.5 rounded font-medium ml-auto">Linked Profile</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Configuring this employee with role <strong>Owner</strong> will link or update the official Owner profile in Accounts &gt; Owners.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <EnterpriseInput
                    label="Phone Number"
                    placeholder="e.g. +91 98765 43210"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                  <EnterpriseInput
                    label="Ownership Share (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 50"
                    value={editOwnershipPercentage}
                    onChange={(e) => setEditOwnershipPercentage(e.target.value)}
                  />
                </div>
                <EnterpriseInput
                  label="Initial Capital Investment (₹)"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="e.g. 500000"
                  value={editInitialInvestment}
                  onChange={(e) => setEditInitialInvestment(e.target.value)}
                />
              </div>
            )}

            <EnterpriseSelect
              label="Department"
              value={editDepartment}
              onChange={(e) => setEditDepartment(e.target.value)}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </EnterpriseSelect>

            <EnterpriseInput
              label="Current Salary (₹) *"
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter Current Monthly Salary"
              value={editCurrentSalary}
              onChange={(e) => setEditCurrentSalary(e.target.value)}
              error={editEmployeeErrors.currentSalary}
            />

            <div className="flex items-center gap-3 mt-2 select-none">
              <button
                type="button"
                onClick={() => setEditIsActive(!editIsActive)}
                className="text-hydro-navy cursor-pointer"
              >
                {editIsActive ? (
                  <ToggleRight className="w-9 h-9 text-green-500 fill-green-50" />
                ) : (
                  <ToggleLeft className="w-9 h-9 text-slate-400 fill-slate-50" />
                )}
              </button>
              <span className="text-xs font-semibold text-[#374151]">Account Active Status</span>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => setIsEditModalOpen(false)} variant="secondary">
                Cancel
              </EnterpriseButton>
              <EnterpriseButton type="submit" loading={updateEmployeeMutation.isPending}>
                Save Changes
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* 4. Reset Credentials dialog */}
        <EnterpriseModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          title="Reset Credentials"
        >
          <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
            <p className="text-[11px] text-[#6B7280] select-none">Resetting access credentials for: <strong className="text-[#111827]">{resetEmployeeName}</strong>.</p>
            <EnterpriseInput
              label="New Password or PIN *"
              type="password"
              placeholder="Enter Password or PIN"
              value={resetPasswordOrPin}
              onChange={(e) => setResetPasswordOrPin(e.target.value)}
              required
            />
            <EnterpriseInput
              label="Admin PIN *"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="• • • •"
              value={resetAdminPin}
              onChange={(e) => setResetAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
            <div className="flex gap-2 justify-end mt-4">
              <EnterpriseButton type="button" onClick={() => setIsResetModalOpen(false)} variant="secondary">
                Cancel
              </EnterpriseButton>
              <EnterpriseButton type="submit" loading={resetPasswordMutation.isPending} disabled={resetPasswordMutation.isPending || resetPasswordOrPin.length < 4 || resetAdminPin.length !== 4}>
                {resetPasswordMutation.isPending ? 'Saving...' : 'Save Credentials'}
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>
      </PageContainer>
    )
  }

  const handleAdjustStockSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dashboardAdjustMatId) {
      showToast('Please select a material.', 'warning')
      return
    }
    const qty = parseFloat(dashboardAdjustQty)
    if (isNaN(qty) || qty === 0) {
      showToast('Please enter a valid quantity.', 'warning')
      return
    }
    adjustStockMutation.mutate({
      id: dashboardAdjustMatId,
      quantity: qty,
      notes: dashboardAdjustNotes
    })
  }





  const handleSalesOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    showToast(`Sales order created for ${dashboardSalesClient} (Amount: $${dashboardSalesAmount || '0'}).`, 'success')
    setIsDashboardSalesOrderOpen(false)
    setDashboardSalesQty('')
    setDashboardSalesAmount('')
  }



  const getShiftName = (date: Date) => {
    const hour = date.getHours()
    if (hour >= 6 && hour < 14) return 'Morning Shift (06:00 - 14:00)'
    if (hour >= 14 && hour < 22) return 'Evening Shift (14:00 - 22:00)'
    return 'Night Shift (22:00 - 06:00)'
  }

  // Fallbacks for display to avoid blank dashboards
  const displayLines = productionLines || []
  const displayBatches = activeBatches || []

  // Inventory logic using actual database stats + safe fallback levels
  const getMaterialStock = (category: string, fallback: number) => {
    const mat = dashboardRawMaterials.find(m => m.category === category)
    return mat ? mat.currentStock : fallback
  }

  const getProductStockSum = (fallback: number) => {
    const total = dashboardProducts.reduce((sum, p) => sum + (p.currentStock || 0), 0)
    return total > 0 ? total : fallback
  }

  const stockPreforms = getMaterialStock('PREFORM', 0)
  const stockCaps = getMaterialStock('CAP', 0)
  const stockLabels = getMaterialStock('LABEL', 0)
  const stockShrinkRolls = getMaterialStock('SHRINK_FILM', 0)
  const stockFinishedGoods = getProductStockSum(0)

  const getStockStatus = (current: number, safe: number) => {
    if (current <= safe * 0.4) {
      return { label: 'Critical', color: 'text-red-600', barColor: 'bg-red-500' }
    }
    if (current < safe) {
      return { label: 'Low', color: 'text-amber-600', barColor: 'bg-amber-500' }
    }
    return { label: 'Healthy', color: 'text-green-600', barColor: 'bg-green-500' }
  }

  const getFactoryStatus = () => {
    const active = displayBatches.filter((b: any) => b.status === 'Active')
    const paused = displayBatches.filter((b: any) => b.status === 'Paused')

    if (active.length > 0) {
      return {
        label: 'PRODUCTION RUNNING',
        variant: 'success' as const,
        description: `${active.length} of ${displayLines.filter(l => l.isActive).length} lines running`
      }
    } else if (paused.length > 0) {
      return {
        label: 'PRODUCTION PAUSED',
        variant: 'warning' as const,
        description: 'All active batches are currently paused'
      }
    } else {
      return {
        label: 'FACILITY IDLE',
        variant: 'gray' as const,
        description: 'No active production batches'
      }
    }
  }



  // Synchronized Single-Source KPI Metrics
  const filteredProductionQty = cockpitReportingData?.productionTotalCases ?? 0
  const filteredDispatchQty = cockpitReportingData?.dispatchTotalCases ?? 0
  const filteredTargetQty = cockpitReportingData?.targetTotalCases ?? 0
  const filteredEfficiencyPct = cockpitReportingData?.efficiencyPercentage ?? 0

  const runningLinesCount = cockpitReportingData?.runningLinesCount ?? displayLines.filter((l: any) => l.isActive).length
  const totalActiveLinesCount = cockpitReportingData?.totalActiveLinesCount ?? displayLines.length
  const activeBatchesCount = cockpitReportingData?.activeBatchesCount ?? 0

  // Real Single-Source Production Trend Chart Data
  const getProductionTrendData = () => {
    return cockpitReportingData?.productionTrend || []
  }

  // Real Single-Source Dispatch Trend Chart Data
  const getDispatchTrendData = () => {
    return cockpitReportingData?.dispatchTrend || []
  }

  // Real Single-Source Batch Status Data
  const getBatchStatusData = () => {
    return cockpitReportingData?.batchStatusBreakdown || []
  }

  // Real Single-Source Recent Activity Events
  const activities = cockpitReportingData?.recentActivities || []

  const factoryStatus = getFactoryStatus()
  const getGreeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  // ----------------------------------------------------------------------
  // FACTORY COCKPIT — Dashboard Loading Skeleton
  // ----------------------------------------------------------------------
  const isDashboardLoading =
    cockpitReportingLoading ||
    linesLoading ||
    batchesLoading ||
    salesLoading ||
    dashboardRawMaterialsLoading ||
    dashboardProductsLoading

  if (isDashboardView && isDashboardLoading) {
    return (
      <PageContainer>
        <div className="space-y-6 animate-pulse">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className="h-7 bg-gray-200 rounded-lg w-72" />
              <div className="h-4 bg-gray-100 rounded w-96" />
            </div>
            <div className="flex gap-3">
              <div className="h-9 bg-gray-200 rounded-xl w-36" />
              <div className="h-9 bg-gray-100 rounded-xl w-28" />
            </div>
          </div>
          <div className="h-12 bg-gray-100 rounded-xl w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-3">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-8 bg-gray-200 rounded w-20" />
                <div className="h-3 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-56 bg-gray-100 rounded-2xl" />
            <div className="h-56 bg-gray-100 rounded-2xl" />
          </div>
        </div>
      </PageContainer>
    )
  }

  // ----------------------------------------------------------------------
  // FACTORY COCKPIT — Main Dashboard View
  // ----------------------------------------------------------------------

  return (
    <>
      <PageContainer>
        <div className="space-y-6">

          {/* ROW 0: COMMAND HEADER */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Left: Greeting + Context */}
            <div>
              <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">
                {getGreeting()}, {user?.fullName?.split(' ')[0] || 'Admin'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                <span className="text-[13px] font-medium text-[#374151]">{user?.tenantName || 'Aquzio Ltd'}</span>
                <span className="text-gray-300">•</span>
                <span className="text-[13px] text-[#6B7280]">Plant A</span>
                <span className="text-gray-300">•</span>
                <span className="text-[13px] text-[#6B7280]">{getShiftName(currentTime).split('(')[0].trim()}</span>
                <span className="text-gray-300">•</span>
                <span className="text-[13px] text-[#6B7280]">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Right: Plant Status + Last Updated + Quick Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className={`flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl border ${factoryStatus.variant === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : factoryStatus.variant === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}>
                <span className={`w-2 h-2 rounded-full ${factoryStatus.variant === 'success' ? 'bg-emerald-500 animate-pulse'
                  : factoryStatus.variant === 'warning' ? 'bg-amber-500'
                    : 'bg-gray-400'
                  }`} />
                {factoryStatus.variant === 'success' ? 'Operational' : factoryStatus.variant === 'warning' ? 'Paused' : 'Idle'}
              </div>

              <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>

              <div className="relative">
                <button
                  onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Quick Actions
                  <ChevronDown className={`w-3 h-3 transition-transform ${isQuickActionsOpen ? 'rotate-180' : ''}`} />
                </button>
                {isQuickActionsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#E5E7EB] rounded-xl shadow-lg z-50 py-1.5">
                    {[
                      {
                        label: 'Start Batch', icon: Play, action: () => {
                          if (productionLines.length > 0) setStartBatchLineId(productionLines[0].lineId)
                          if (allCatalogProducts.length > 0) setStartBatchProduct(allCatalogProducts[0].name)
                          setIsStartBatchModalOpen(true)
                          setIsQuickActionsOpen(false)
                        }
                      },
                      {
                        label: 'Add Inventory', icon: Package, action: () => {
                          if (dashboardRawMaterials.length > 0) setDashboardAdjustMatId(dashboardRawMaterials[0].id)
                          setIsDashboardAddInventoryOpen(true)
                          setIsQuickActionsOpen(false)
                        }
                      },
                      {
                        label: 'Sales Order', icon: Receipt, action: () => {
                          setIsDashboardSalesOrderOpen(true)
                          setIsQuickActionsOpen(false)
                        }
                      },
                      { label: 'View Production', icon: Factory, action: () => { navigate('/company/production'); setIsQuickActionsOpen(false) } },
                      { label: 'View Inventory', icon: Box, action: () => { navigate('/company/inventory'); setIsQuickActionsOpen(false) } },
                      { label: 'View Employees', icon: Users, action: () => { navigate('/company/employees'); setIsQuickActionsOpen(false) } },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#F3F4F6] transition-colors text-left cursor-pointer"
                      >
                        <item.icon className="w-4 h-4 text-[#9CA3AF]" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ROW 1: GLOBAL DATE FILTER BAR */}
          <div className="flex items-center justify-between bg-white rounded-xl border border-[#E5E7EB] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-slate-500 px-3 select-none flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Date Range:
              </span>
              {[
                { id: 'today', label: 'Today' },
                { id: '7days', label: 'Last 7 Days' },
                { id: '30days', label: 'Last 30 Days' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setDashboardDateFilter(btn.id as any)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-lg transition-all cursor-pointer ${dashboardDateFilter === btn.id
                    ? 'bg-[#05303B] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 font-medium hidden sm:block px-3">
              Showing metrics for <span className="font-semibold text-slate-600">{dashboardDateFilter === 'today' ? 'Today' : dashboardDateFilter === '7days' ? 'Past 7 Days' : 'Past 30 Days'}</span>
            </div>
          </div>

          {/* ROW 2: EXECUTIVE KPI GRID */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Production Quantity */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Production</p>
              <p className="text-[26px] font-bold text-[#111827] tabular-nums leading-tight mt-1.5">
                {filteredProductionQty > 0 ? filteredProductionQty.toLocaleString() : '0'}
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                {filteredProductionQty > 0 ? 'cases produced' : 'No production recorded'}
              </p>
            </div>

            {/* Dispatch Quantity */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Dispatch</p>
              <p className="text-[26px] font-bold text-[#111827] tabular-nums leading-tight mt-1.5">
                {filteredDispatchQty > 0 ? filteredDispatchQty.toLocaleString() : '0'}
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                {filteredDispatchQty > 0 ? 'cases released' : 'No dispatches recorded'}
              </p>
            </div>

            {/* Efficiency */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Efficiency</p>
              <p className={`text-[26px] font-bold tabular-nums leading-tight mt-1.5 ${filteredEfficiencyPct >= 80 ? 'text-emerald-600' : filteredEfficiencyPct >= 50 ? 'text-amber-600' : 'text-[#111827]'
                }`}>
                {filteredEfficiencyPct}%
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                {filteredTargetQty > 0 ? `of ${filteredTargetQty.toLocaleString()} target` : 'Target efficiency'}
              </p>
            </div>

            {/* Running Lines */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Running Lines</p>
              <p className="text-[26px] font-bold text-[#111827] tabular-nums leading-tight mt-1.5">
                {runningLinesCount}
                <span className="text-[16px] font-normal text-[#9CA3AF]"> / {displayLines.filter((l: any) => l.isActive).length}</span>
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                {runningLinesCount > 0 ? 'lines active' : 'No active lines'}
              </p>
            </div>

            {/* Active Batches */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Active Batches</p>
              <p className="text-[26px] font-bold text-[#111827] tabular-nums leading-tight mt-1.5">
                {activeBatchesCount}
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">
                {activeBatchesCount > 0 ? 'runs in progress' : 'No active batches'}
              </p>
            </div>
          </section>

          {/* ROW 3: CHARTS — Production Trend + Batch Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Production Trend (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Production Trend</h2>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Cases produced over selected timeline</p>
                </div>
                <span className="text-[11px] font-bold text-[#0B7A70] bg-[#E6F6F4] border border-[#B8E6E0] px-2.5 py-1 rounded-md">
                  {dashboardDateFilter === 'today' ? 'Hourly Output' : 'Daily Output'}
                </span>
              </div>
              <DashboardLineChart data={getProductionTrendData()} height={180} emptyMessage="No production recorded for this period." />
            </div>

            {/* Batch Status (1 col) */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
              <div>
                <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Batch Status</h2>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Current run status distribution</p>
              </div>
              <DashboardDonutChart data={getBatchStatusData()} emptyMessage="No active or completed batches." />
            </div>
          </div>

          {/* ROW 4: CHARTS — Dispatch Trend */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Dispatch Trend</h2>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">Cases dispatched over selected timeline</p>
              </div>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                {dashboardDateFilter === 'today' ? 'Event Timeline' : 'Daily Timeline'}
              </span>
            </div>
            <DashboardBarChart data={getDispatchTrendData()} height={180} barColor="#10B981" emptyMessage="No dispatches recorded for this period." />
          </div>

          {/* ROW 5: LIVE PRODUCTION LINE MONITOR */}
          <section className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#12A89A]" />
                <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Running Production Lines</h2>
              </div>
              <button
                onClick={() => navigate('/company/production')}
                className="text-[11px] font-semibold text-[#0B7A70] hover:text-[#05303B] transition-colors cursor-pointer"
              >
                View All →
              </button>
            </div>

            {displayLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 bg-[#F3F4F6] rounded-xl flex items-center justify-center mb-3">
                  <Factory className="w-6 h-6 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#374151]">No production lines configured</p>
                <p className="text-[11px] text-[#9CA3AF] mt-1">Set up production lines in Settings to start monitoring</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayLines.map((line: any) => {
                  const batch = displayBatches.find((b: any) => b.productionLineId === line.lineId)
                  const isRunning = line.isActive && batch?.status === 'Active'
                  const isPaused = line.isActive && batch?.status === 'Paused'
                  const produced = batch?.producedQuantity || 0
                  const target = batch?.targetQuantity || 0
                  const pct = target > 0 ? Math.round((produced / target) * 100) : 0

                  return (
                    <div key={line.lineId} className={`rounded-xl border p-4 space-y-3 transition-all ${isRunning ? 'border-emerald-200 bg-emerald-50/30' : isPaused ? 'border-amber-200 bg-amber-50/30' : 'border-[#E5E7EB] bg-[#F9FAFB]'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-gray-300'}`} />
                          <span className="text-[13px] font-bold text-[#111827]">{line.name}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${isRunning ? 'bg-emerald-100 text-emerald-700' : isPaused ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
                        </span>
                      </div>

                      {batch ? (
                        <>
                          <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                            <div>
                              <span className="text-[#9CA3AF]">Batch</span>
                              <p className="font-mono font-semibold text-[#111827]">{batch.batchNumber}</p>
                            </div>
                            <div>
                              <span className="text-[#9CA3AF]">Operator</span>
                              <p className="font-medium text-[#111827]">{batch.operatorName || '-'}</p>
                            </div>
                            <div>
                              <span className="text-[#9CA3AF]">Product</span>
                              <p className="font-medium text-[#111827] truncate pr-2">{batch.product || '-'}</p>
                            </div>
                            <div>
                              <span className="text-[#9CA3AF]">Shift</span>
                              <p className="font-medium text-[#111827]">{batch.shift || 'Default Shift'}</p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-[#6B7280] tabular-nums">{produced.toLocaleString()} / {target.toLocaleString()} cases</span>
                              <span className={`font-bold tabular-nums ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-[#374151]'}`}>{pct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all duration-500 ${isRunning ? 'bg-[#12A89A]' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="py-3">
                          <p className="text-[12px] text-[#9CA3AF] italic">No active batch running</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Recent Activity */}
          <section className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#12A89A]" />
              <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Recent Activity</h2>
            </div>

            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((item: any, i: number) => (
                  <div key={i} className="flex items-baseline gap-3 text-[13px]">
                    <span className="text-[11px] font-mono text-[#9CA3AF] tabular-nums w-12 flex-shrink-0">{item.time}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#12A89A] mt-1.5 flex-shrink-0" />
                    <span className="text-[#374151]">{item.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-4">
                <div className="w-10 h-10 bg-[#F3F4F6] rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[#9CA3AF]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#374151]">No recent activity</p>
                  <p className="text-[11px] text-[#9CA3AF]">Production events and system activities will appear here</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ------------------- MODALS (preserved) ------------------- */}

        {/* Start Batch Modal */}
        <EnterpriseModal isOpen={isStartBatchModalOpen} onClose={() => setIsStartBatchModalOpen(false)} title="Start Production Batch">
          <form onSubmit={(e: React.FormEvent) => {
            e.preventDefault()
            if (!startBatchLineId) { showToast('Production line is required.', 'warning'); return }
            if (!startBatchNumber.trim()) { showToast('Batch number is required.', 'warning'); return }
            if (!startBatchProduct) { showToast('Product selection is required.', 'warning'); return }
            if (!startBatchTargetQty || Number(startBatchTargetQty) <= 0) { showToast('Target quantity must be greater than zero.', 'warning'); return }
            startBatchMutation.mutate({
              productionLineId: startBatchLineId,
              batchNumber: startBatchNumber.trim(),
              product: startBatchProduct,
              shift: startBatchShift,
              targetQuantity: Number(startBatchTargetQty)
            })
          }} className="flex flex-col gap-4">
            <EnterpriseSelect label="Production Line *" value={startBatchLineId} onChange={(e) => setStartBatchLineId(e.target.value)} required>
              {productionLines.filter((l: any) => l.isActive).map((line: any) => (
                <option key={line.lineId} value={line.lineId}>{line.name}</option>
              ))}
            </EnterpriseSelect>
            <EnterpriseInput label="Batch Number *" placeholder="e.g. B-001" value={startBatchNumber} onChange={(e) => setStartBatchNumber(e.target.value)} required />
            <EnterpriseSelect label="Product *" value={startBatchProduct} onChange={(e) => setStartBatchProduct(e.target.value)} required>
              {allCatalogProducts.map((prod: any) => (
                <option key={prod.id} value={prod.name}>{prod.name}</option>
              ))}
            </EnterpriseSelect>
            <EnterpriseSelect label="Shift" value={startBatchShift} onChange={(e) => setStartBatchShift(e.target.value)}>
              {productionShifts.map((s: any) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </EnterpriseSelect>
            <EnterpriseInput label="Target Quantity (Cases) *" type="number" placeholder="e.g. 500" value={String(startBatchTargetQty)} onChange={(e) => setStartBatchTargetQty(e.target.value)} required />
            <div className="flex gap-2 justify-end mt-2">
              <EnterpriseButton type="button" onClick={() => setIsStartBatchModalOpen(false)} variant="secondary">Cancel</EnterpriseButton>
              <EnterpriseButton type="submit" loading={startBatchMutation.isPending}>Start Batch</EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* Add Inventory */}
        <EnterpriseModal isOpen={isDashboardAddInventoryOpen} onClose={() => setIsDashboardAddInventoryOpen(false)} title="Add Inventory Stock">
          <form onSubmit={handleAdjustStockSubmit} className="flex flex-col gap-4">
            <EnterpriseSelect label="Raw Material *" value={dashboardAdjustMatId} onChange={(e) => setDashboardAdjustMatId(e.target.value)} required>
              {dashboardRawMaterials.map((mat: any) => (
                <option key={mat.id} value={mat.id}>{mat.name} ({mat.category})</option>
              ))}
            </EnterpriseSelect>
            <EnterpriseInput label="Quantity *" type="number" placeholder="e.g. 5000" value={dashboardAdjustQty} onChange={(e) => setDashboardAdjustQty(e.target.value)} required />
            <EnterpriseInput label="Notes" placeholder="Reason for adjustment" value={dashboardAdjustNotes} onChange={(e) => setDashboardAdjustNotes(e.target.value)} />
            <div className="flex gap-2 justify-end mt-2">
              <EnterpriseButton type="button" onClick={() => setIsDashboardAddInventoryOpen(false)} variant="secondary">Cancel</EnterpriseButton>
              <EnterpriseButton type="submit" loading={adjustStockMutation.isPending}>Update Stock</EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>

        {/* Sales Order */}
        <EnterpriseModal isOpen={isDashboardSalesOrderOpen} onClose={() => setIsDashboardSalesOrderOpen(false)} title="Create Sales Order">
          <form onSubmit={handleSalesOrderSubmit} className="flex flex-col gap-4">
            <EnterpriseInput label="Buyer *" value={dashboardSalesClient} onChange={(e) => setDashboardSalesClient(e.target.value)} required />
            <EnterpriseSelect label="Product *" value={dashboardSalesProduct} onChange={(e) => setDashboardSalesProduct(e.target.value)} required>
              {allCatalogProducts.map((prod: any) => (
                <option key={prod.id} value={prod.name}>{prod.name}</option>
              ))}
            </EnterpriseSelect>
            <div className="grid grid-cols-2 gap-4">
              <EnterpriseInput label="Quantity (Cases) *" type="number" placeholder="500" value={dashboardSalesQty} onChange={(e) => setDashboardSalesQty(e.target.value)} required />
              <EnterpriseInput label="Amount (₹) *" type="number" placeholder="6000" value={dashboardSalesAmount} onChange={(e) => setDashboardSalesAmount(e.target.value)} required />
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <EnterpriseButton type="button" onClick={() => setIsDashboardSalesOrderOpen(false)} variant="secondary">Cancel</EnterpriseButton>
              <EnterpriseButton type="submit">Create Order</EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>
      </PageContainer>
    </>
  )
}
export default CompanyDashboardPage
