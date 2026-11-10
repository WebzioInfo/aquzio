import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { productsService } from '../../services/products'
import { rawMaterialsService } from '../../services/rawMaterials'
import { brandService } from '../../services/brands'
import { RAW_MATERIAL_CATEGORIES } from '../../utils/rawMaterialCategories'
import { useAuthStore } from '../../store/useAuthStore'
import { isOwnerUser } from '../../utils/permissions'
import { Search, Plus, Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw, RotateCcw, Package, X } from 'lucide-react'
import EnterpriseModal from '../../components/ui/EnterpriseModal'
import EnterpriseInput from '../../components/ui/EnterpriseInput'
import EnterpriseSelect from '../../components/ui/EnterpriseSelect'
import EnterpriseButton from '../../components/ui/EnterpriseButton'
import EnterpriseNumberInput from '../../components/ui/EnterpriseNumberInput'
import { SearchableDropdown } from '../../components/ui/SearchableDropdown'

type ToastType = 'success' | 'error' | 'warning'

const MOVEMENT_TYPE_MAP: Record<string, { label: string; cls: string; icon: string }> = {
  productionentry: { label: 'Used for Production', cls: 'bg-rose-50 border-rose-200 text-rose-700', icon: '⚙️' },
  productionconsumption: { label: 'Used for Production', cls: 'bg-rose-50 border-rose-200 text-rose-700', icon: '⚙️' },
  production: { label: 'Used for Production', cls: 'bg-rose-50 border-rose-200 text-rose-700', icon: '⚙️' },

  stockadjustment: { label: 'Stock Corrected', cls: 'bg-amber-50 border-amber-200 text-amber-700', icon: '🔧' },
  adjustment: { label: 'Stock Corrected', cls: 'bg-amber-50 border-amber-200 text-amber-700', icon: '🔧' },

  purchase: { label: 'Stock Received', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: '📥' },

  sales: { label: 'Sold', cls: 'bg-blue-50 border-blue-200 text-blue-700', icon: '📤' },
  sale: { label: 'Sold', cls: 'bg-blue-50 border-blue-200 text-blue-700', icon: '📤' },

  transfer: { label: 'Moved Between Warehouses', cls: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: '🚚' },

  return: { label: 'Returned to Stock', cls: 'bg-teal-50 border-teal-200 text-teal-700', icon: '↩️' },

  openingstock: { label: 'Opening Stock', cls: 'bg-slate-100 border-slate-200 text-slate-700', icon: '📦' },
  opening: { label: 'Opening Stock', cls: 'bg-slate-100 border-slate-200 text-slate-700', icon: '📦' },

  stockadded: { label: 'Stock Added', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: '📥' },
  manual: { label: 'Manually Updated', cls: 'bg-violet-50 border-violet-200 text-violet-700', icon: '👤' },
  productioncompleted: { label: 'Production Completed', cls: 'bg-green-50 border-green-200 text-green-700', icon: '🏭' },

  // eDrops integration movement types
  edrops_adjustment: { label: 'Changed in eDrops', cls: 'bg-sky-50 border-sky-200 text-sky-700', icon: '💧' },
  edropsadjustment: { label: 'Changed in eDrops', cls: 'bg-sky-50 border-sky-200 text-sky-700', icon: '💧' },
  edrops: { label: 'Changed in eDrops', cls: 'bg-sky-50 border-sky-200 text-sky-700', icon: '💧' }
}

const getMovementBadge = (type: string) => {
  const lowerType = (type || '').toLowerCase();
  return MOVEMENT_TYPE_MAP[lowerType] || { label: type, cls: 'bg-slate-100 border-slate-200 text-slate-600', icon: '📝' };
}

interface MovementPanelProps {
  materialId: string
  currentStock: number
  unit: string
}

const getInitials = (name: string) => {
  if (!name || name === 'Unknown User') return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const getAvatarColor = (name: string) => {
  if (!name || name === 'Unknown User') return 'bg-slate-100 text-slate-600 border-slate-200'
  if (name === 'System') return 'bg-purple-100 text-purple-700 border-purple-200'
  const colors = [
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-indigo-50 text-indigo-700 border-indigo-200',
    'bg-violet-50 text-violet-700 border-violet-200',
    'bg-pink-50 text-pink-700 border-pink-200',
    'bg-amber-50 text-amber-700 border-amber-200',
    'bg-sky-50 text-sky-700 border-sky-200'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

const MovementPanel: React.FC<MovementPanelProps> = ({ materialId, currentStock, unit }) => {
  const [page, setPage] = useState(1)
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['movements', materialId, page],
    queryFn: async () => {
      const res = await api.get(`/api/v1/rawmaterials/${materialId}/movements?pageNumber=${page}&pageSize=20`)
      return res.data?.data || null
    },
    staleTime: 30_000,
  })
  const movements: any[] = data?.items || []
  const totalPages: number = data?.totalPages || 1
  const fmtDT = (d: string) => {
    const dt = new Date(d)
    return {
      date: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  }
  return (
    <div className="bg-[#F8FAFC] border-t border-[#E5E7EB] px-4 py-4">
      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between select-none">
          <p className="text-[12px] font-bold text-slate-600 uppercase tracking-widest">Movement History</p>
          <button onClick={() => refetch()} className="h-[26px] px-2.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded flex items-center gap-1 transition-all">
            <RefreshCw className="w-3 h-3" />Refresh
          </button>
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-[13px] text-slate-400">Loading movement history...</div>
        ) : movements.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-4 animate-pulse">
              <Package className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-[14px] font-bold text-slate-700">No stock movements recorded yet.</h3>
            <p className="text-[12px] text-slate-400 mt-1 max-w-[280px]">Stock movements will appear here whenever inventory changes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-bold text-slate-500 uppercase tracking-wider h-[34px] select-none">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Time</th>
                  <th className="py-2 px-4">Description</th>
                  <th className="py-2 px-4 text-right">Quantity</th>
                  <th className="py-2 px-4 text-right">Balance After</th>
                  <th className="py-2 px-4">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-slate-700">
                {movements.map((m: any, idx: number) => {
                  const badge = getMovementBadge(m.referenceType)
                  const dt = fmtDT(m.createdAt)

                  const isPos = m.quantity > 0
                  const isNeg = m.quantity < 0
                  let qtyText = ''
                  let qtyCls = ''

                  if (isPos) {
                    qtyText = `+${m.quantity} ${m.unit || unit}`
                    qtyCls = 'text-emerald-600'
                  } else if (isNeg) {
                    qtyText = `−${Math.abs(m.quantity)} ${m.unit || unit}`
                    qtyCls = 'text-rose-600'
                  } else {
                    qtyText = `0 ${m.unit || unit}`
                    qtyCls = 'text-slate-400 font-medium'
                  }

                  return (
                    <tr key={m.id} className={`h-[36px] transition-colors hover:bg-[#F8FAFC] ${idx % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}`}>
                      <td className="py-2 px-4 font-semibold text-slate-800 whitespace-nowrap">{dt.date}</td>
                      <td className="py-2 px-4 text-slate-500 whitespace-nowrap">{dt.time}</td>
                      <td className="py-2 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider w-fit ${badge.cls}`}>
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </span>
                          {m.notes && <span className="text-[11px] text-slate-400 font-medium leading-normal italic">{m.notes}</span>}
                        </div>
                      </td>
                      <td className={`py-2 px-4 text-right font-bold tabular-nums whitespace-nowrap ${qtyCls}`}>
                        {qtyText}
                      </td>
                      <td className="py-2 px-4 text-right font-bold tabular-nums text-slate-900 whitespace-nowrap">{m.balanceAfter} {m.unit || unit}</td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-[24px] h-[24px] rounded-full border flex items-center justify-center text-[9px] font-black uppercase shadow-sm select-none ${getAvatarColor(m.operatorName)}`}>
                            {getInitials(m.operatorName)}
                          </div>
                          <span className="font-semibold text-slate-700">
                            {m.operatorName === 'System' ? 'System' : m.operatorName}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-[#F1F5F9] flex items-center justify-between select-none">
            <span className="text-[11px] text-slate-400 font-semibold">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ProductMovementPanelProps {
  productId: string
  currentStock: number
}

const ProductMovementPanel: React.FC<ProductMovementPanelProps> = ({ productId, currentStock }) => {
  const [page, setPage] = useState(1)
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['productMovements', productId, page],
    queryFn: async () => {
      const res = await api.get(`/api/v1/products/${productId}/movements?pageNumber=${page}&pageSize=20`)
      return res.data?.data || null
    },
    staleTime: 30_000,
  })
  const movements: any[] = data?.items || []
  const totalPages: number = data?.totalPages || 1
  const fmtDT = (d: string) => {
    const dt = new Date(d)
    return {
      date: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  }
  return (
    <div className="bg-[#F8FAFC] border-t border-[#E5E7EB] px-4 py-4">
      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between select-none">
          <p className="text-[12px] font-bold text-slate-600 uppercase tracking-widest">Product Movement History</p>
          <button onClick={() => refetch()} className="h-[26px] px-2.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded flex items-center gap-1 transition-all">
            <RefreshCw className="w-3 h-3" />Refresh
          </button>
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-[13px] text-slate-400">Loading movement history...</div>
        ) : movements.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-4 animate-pulse">
              <Package className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-[14px] font-bold text-slate-700">No stock movements recorded yet.</h3>
            <p className="text-[12px] text-slate-400 mt-1 max-w-[280px]">Product stock movements will appear here whenever production runs or adjustments are made.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-bold text-slate-500 uppercase tracking-wider h-[34px] select-none">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Time</th>
                  <th className="py-2 px-4">Description</th>
                  <th className="py-2 px-4 text-right">Quantity</th>
                  <th className="py-2 px-4 text-right">Balance After</th>
                  <th className="py-2 px-4">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-slate-700">
                {movements.map((m: any, idx: number) => {
                  const badge = getMovementBadge(m.referenceType)
                  const dt = fmtDT(m.createdAt)

                  const isPos = m.quantity > 0
                  const isNeg = m.quantity < 0
                  let qtyText = ''
                  let qtyCls = ''

                  if (isPos) {
                    qtyText = `+${m.quantity} ${m.unit || 'Cases'}`
                    qtyCls = 'text-emerald-600'
                  } else if (isNeg) {
                    qtyText = `−${Math.abs(m.quantity)} ${m.unit || 'Cases'}`
                    qtyCls = 'text-rose-600'
                  } else {
                    qtyText = `0 ${m.unit || 'Cases'}`
                    qtyCls = 'text-slate-400 font-medium'
                  }

                  return (
                    <tr key={m.id} className={`h-[36px] transition-colors hover:bg-[#F8FAFC] ${idx % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}`}>
                      <td className="py-2 px-4 font-semibold text-slate-800 whitespace-nowrap">{dt.date}</td>
                      <td className="py-2 px-4 text-slate-500 whitespace-nowrap">{dt.time}</td>
                      <td className="py-2 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider w-fit ${badge.cls}`}>
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </span>
                          {m.notes && <span className="text-[11px] text-slate-400 font-medium leading-normal italic">{m.notes}</span>}
                        </div>
                      </td>
                      <td className={`py-2 px-4 text-right font-bold tabular-nums whitespace-nowrap ${qtyCls}`}>
                        {qtyText}
                      </td>
                      <td className="py-2 px-4 text-right font-bold tabular-nums text-slate-900 whitespace-nowrap">{m.balanceAfter} {m.unit || 'Cases'}</td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-[24px] h-[24px] rounded-full border flex items-center justify-center text-[9px] font-black uppercase shadow-sm select-none ${getAvatarColor(m.operatorName)}`}>
                            {getInitials(m.operatorName)}
                          </div>
                          <span className="font-semibold text-slate-700">
                            {m.operatorName === 'System' ? 'System' : m.operatorName}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-[#F1F5F9] flex items-center justify-between select-none">
            <span className="text-[11px] text-slate-400 font-semibold">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface InventoryPageProps {
  canWrite: boolean
  showToast: (msg: string, type: 'success' | 'error' | 'warning') => void
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ canWrite, showToast }) => {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isOwner = isOwnerUser(user)

  const searchParams = new URLSearchParams(location.search)
  const queryTab = searchParams.get('tab')
  const inventoryTab = (queryTab === 'raw_materials' ? 'raw_materials' : 'products') as 'products' | 'raw_materials'

  useEffect(() => {
    if (queryTab === 'brands') {
      if (isOwner) {
        navigate('/company/dashboard', { replace: true })
      } else {
        navigate('/company/production-setup?tab=brands', { replace: true })
      }
    }
  }, [isOwner, queryTab, navigate])

  const [globalSearch, setGlobalSearch] = useState('')
  const [productsPage, setProductsPage] = useState(1)
  const [productsSearch, setProductsSearch] = useState('')
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false)
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [productFormName, setProductFormName] = useState('')
  const [productFormBrandId, setProductFormBrandId] = useState('')
  const [productFormSKU, setProductFormSKU] = useState('')
  const [productFormIsActive, setProductFormIsActive] = useState(true)
  const [productFormOpeningStock, setProductFormOpeningStock] = useState('0')
  const [productFormCurrentStock, setProductFormCurrentStock] = useState('0')
  const [editingCostProductId, setEditingCostProductId] = useState<string | null>(null)
  const [editingCostValue, setEditingCostValue] = useState<string>('')
  const [isQuickBrandModalOpen, setIsQuickBrandModalOpen] = useState(false)
  const [quickBrandName, setQuickBrandName] = useState('')
  const [quickBrandError, setQuickBrandError] = useState('')
  const [isSubmittingQuickBrand, setIsSubmittingQuickBrand] = useState(false)
  const [isQuickRawMaterialModalOpen, setIsQuickRawMaterialModalOpen] = useState(false)
  const [quickRawMaterialName, setQuickRawMaterialName] = useState('')
  const [quickRawMaterialCategory, setQuickRawMaterialCategory] = useState('PREFORM')
  const [quickRawMaterialUnit, setQuickRawMaterialUnit] = useState('PIECE')
  const [quickRawMaterialError, setQuickRawMaterialError] = useState('')
  const [isSubmittingQuickRawMaterial, setIsSubmittingQuickRawMaterial] = useState(false)

  const updateCostMutation = useMutation({
    mutationFn: ({ id, unitCost }: { id: string; unitCost: number }) => productsService.updateUnitCost(id, unitCost),
    onSuccess: (res) => {
      if (res.success) {
        showToast('Product unit cost updated successfully.', 'success')
        queryClient.invalidateQueries({ queryKey: ['productsList'] })
        queryClient.invalidateQueries({ queryKey: ['products'] })
        setEditingCostProductId(null)
      } else {
        showToast(res.message || 'Failed to update unit cost.', 'error')
      }
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Error updating unit cost.', 'error')
    }
  })

  const handleSaveCost = (productId: string) => {
    const cost = parseFloat(editingCostValue)
    if (isNaN(cost) || cost < 0) {
      showToast('Please enter a valid numeric unit cost (>= 0).', 'warning')
      return
    }
    updateCostMutation.mutate({ id: productId, unitCost: cost })
  }
  const [rawMaterialsPage, setRawMaterialsPage] = useState(1)
  const [rawMaterialsSearch, setRawMaterialsSearch] = useState('')
  const [isAddRawMaterialModalOpen, setIsAddRawMaterialModalOpen] = useState(false)
  const [isEditRawMaterialModalOpen, setIsEditRawMaterialModalOpen] = useState(false)
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false)
  const [selectedAddStockMaterialId, setSelectedAddStockMaterialId] = useState('')
  const [addStockFormQuantity, setAddStockFormQuantity] = useState('')
  const [addStockFormNotes, setAddStockFormNotes] = useState('')
  const [selectedRawMaterial, setSelectedRawMaterial] = useState<any | null>(null)
  const [rawMaterialFormName, setRawMaterialFormName] = useState('')
  const [rawMaterialFormCategory, setRawMaterialFormCategory] = useState('PREFORM')
  const [rawMaterialFormUnit, setRawMaterialFormUnit] = useState('PIECE')
  const [rawMaterialFormIsActive, setRawMaterialFormIsActive] = useState(true)
  const [rawMaterialFormCurrentStock, setRawMaterialFormCurrentStock] = useState('0')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const toggleRow = (id: string) => setExpandedRowId(prev => prev === id ? null : id)
  const switchTab = (tab: 'products' | 'raw_materials') => {
    navigate(`?tab=${tab}`); setExpandedRowId(null); setGlobalSearch('')
    setProductsSearch(''); setRawMaterialsSearch('')
  }
  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['productsList', productsPage, productsSearch],
    queryFn: async () => (await productsService.getProducts(productsPage, 10, productsSearch)).data,
    enabled: inventoryTab === 'products'
  })
  const { data: brands = [] } = useQuery({
    queryKey: ['brandsDropdown'],
    queryFn: async () => (await brandService.getBrands(1, 1000)).data?.items || []
  })
  const { data: rawMaterialsData, isLoading: rawMaterialsLoading, refetch: refetchMaterials } = useQuery({
    queryKey: ['rawMaterialsList', rawMaterialsPage, rawMaterialsSearch],
    queryFn: async () => (await rawMaterialsService.getRawMaterials(rawMaterialsPage, 10, rawMaterialsSearch)).data,
    enabled: inventoryTab === 'raw_materials'
  })
  const { data: rawMaterialsDropdown = [] } = useQuery({
    queryKey: ['rawMaterialsDropdown'],
    queryFn: async () => (await rawMaterialsService.getRawMaterials(1, 1000)).data?.items || []
  })
  const allMats: any[] = rawMaterialsDropdown.length > 0 ? rawMaterialsDropdown : (rawMaterialsData?.items || [])
  const totalProducts = productsData?.totalCount ?? 0
  const totalMaterials = rawMaterialsData?.totalCount ?? 0
  const lowStock = allMats.filter(m => m.currentStock > 0 && m.currentStock < 50).length
  const outOfStock = allMats.filter(m => m.currentStock <= 0).length
  const createProductMutation = useMutation({
    mutationFn: productsService.createProduct,
    onSuccess: (d) => { if (d.success) { showToast('Product created.', 'success'); queryClient.invalidateQueries({ queryKey: ['productsList'] }); setIsAddProductModalOpen(false) } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => productsService.updateProduct(id, data),
    onSuccess: (d) => { if (d.success) { showToast('Product updated.', 'success'); queryClient.invalidateQueries({ queryKey: ['productsList'] }); setIsEditProductModalOpen(false) } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const deleteProductMutation = useMutation({
    mutationFn: productsService.deleteProduct,
    onSuccess: (d) => { if (d.success) { showToast('Product deleted.', 'success'); queryClient.invalidateQueries({ queryKey: ['productsList'] }) } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const createRawMaterialMutation = useMutation({
    mutationFn: rawMaterialsService.createRawMaterial,
    onSuccess: (d) => { if (d.success) { showToast('Raw material created.', 'success'); queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] }); queryClient.invalidateQueries({ queryKey: ['rawMaterials'] }); setIsAddRawMaterialModalOpen(false); setRawMaterialFormName(''); setRawMaterialFormCurrentStock('0') } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const updateRawMaterialMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => rawMaterialsService.updateRawMaterial(id, data),
    onSuccess: (d) => { if (d.success) { showToast('Raw material updated.', 'success'); queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] }); queryClient.invalidateQueries({ queryKey: ['rawMaterials'] }); setIsEditRawMaterialModalOpen(false) } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const addStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => rawMaterialsService.addStock(id, data),
    onSuccess: (d) => { if (d.success) { showToast('Stock added successfully.', 'success'); queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] }); queryClient.invalidateQueries({ queryKey: ['rawMaterials'] }); queryClient.invalidateQueries({ queryKey: ['movements'] }); setIsAddStockModalOpen(false); setSelectedAddStockMaterialId(''); setAddStockFormQuantity(''); setAddStockFormNotes('') } else showToast(d.message || 'Failed to add stock.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error adding stock.', 'error')
  })
  const deleteRawMaterialMutation = useMutation({
    mutationFn: rawMaterialsService.deleteRawMaterial,
    onSuccess: (d) => { if (d.success) { showToast('Raw material deleted.', 'success'); queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] }); queryClient.invalidateQueries({ queryKey: ['rawMaterials'] }) } else showToast(d.message || 'Failed.', 'error') },
    onError: (e: any) => showToast(e.response?.data?.message || 'Error.', 'error')
  })
  const handleCreateProductSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!productFormName.trim()) return showToast('Product Name is required.', 'warning'); if (!productFormBrandId) return showToast('Brand is required.', 'warning'); createProductMutation.mutate({ name: productFormName.trim(), brandId: productFormBrandId, sku: productFormSKU.trim() || undefined, isActive: productFormIsActive, openingStock: parseFloat(productFormOpeningStock) || 0 }) }
  const handleEditProductSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!selectedProduct || !productFormName.trim()) return showToast('Product Name is required.', 'warning'); if (!productFormBrandId) return showToast('Brand is required.', 'warning'); updateProductMutation.mutate({ id: selectedProduct.id, data: { name: productFormName.trim(), brandId: productFormBrandId, sku: productFormSKU.trim() || undefined, isActive: productFormIsActive, currentStock: parseFloat(productFormCurrentStock) || 0 } }) }
  const openEditProduct = (prod: any) => { setSelectedProduct(prod); setProductFormName(prod.name); setProductFormBrandId(prod.brandId); setProductFormSKU(prod.sku || ''); setProductFormIsActive(prod.isActive); setProductFormCurrentStock(prod.currentStock?.toString() || '0'); setIsEditProductModalOpen(true) }
  const triggerDeleteProduct = (id: string, name: string) => { if (confirm(`Delete product "${name}"?`)) deleteProductMutation.mutate(id) }
  const handleCreateRawMaterialSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!rawMaterialFormName.trim()) return showToast('Material Name is required.', 'warning'); createRawMaterialMutation.mutate({ name: rawMaterialFormName.trim(), category: rawMaterialFormCategory, unit: rawMaterialFormUnit, isActive: rawMaterialFormIsActive, currentStock: parseFloat(rawMaterialFormCurrentStock) || 0 }) }
  const handleEditRawMaterialSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!selectedRawMaterial || !rawMaterialFormName.trim()) return showToast('Material Name is required.', 'warning'); updateRawMaterialMutation.mutate({ id: selectedRawMaterial.id, data: { name: rawMaterialFormName.trim(), category: rawMaterialFormCategory, unit: rawMaterialFormUnit, isActive: rawMaterialFormIsActive, currentStock: parseFloat(rawMaterialFormCurrentStock) || 0 } }) }
  const openEditRawMaterial = (mat: any) => { setSelectedRawMaterial(mat); setRawMaterialFormName(mat.name); setRawMaterialFormCategory(mat.category.toUpperCase()); setRawMaterialFormUnit(mat.unit.toUpperCase()); setRawMaterialFormIsActive(mat.isActive); setRawMaterialFormCurrentStock(mat.currentStock?.toString() || '0'); setIsEditRawMaterialModalOpen(true) }
  const handleAddStockSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAddStockMaterialId) return showToast('Please select a raw material.', 'warning')
    const qty = parseFloat(addStockFormQuantity)
    if (isNaN(qty) || qty <= 0) return showToast('Quantity to add must be greater than zero.', 'warning')
    addStockMutation.mutate({
      id: selectedAddStockMaterialId,
      data: {
        quantity: qty,
        notes: addStockFormNotes.trim() || undefined
      }
    })
  }
  const triggerDeleteRawMaterial = (id: string, name: string) => { if (confirm(`Delete raw material "${name}"?`)) deleteRawMaterialMutation.mutate(id) }

  const handleCloseQuickBrandModal = () => {
    if (isSubmittingQuickBrand) return
    setIsQuickBrandModalOpen(false)
    setQuickBrandName('')
    setQuickBrandError('')
  }

  const handleQuickCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = quickBrandName.trim()
    if (!trimmed) {
      setQuickBrandError('Brand name is required.')
      return
    }

    // Fast client-side duplicate check
    const duplicate = (brands as any[]).some(
      b => b.name && b.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      setQuickBrandError('A brand with this name already exists.')
      return
    }

    setIsSubmittingQuickBrand(true)
    setQuickBrandError('')

    try {
      const res = await brandService.createBrand({ name: trimmed, isActive: true })
      if (res.success && res.data) {
        const newBrand = res.data

        // 1. Immediately update cache so dropdown has the new brand
        queryClient.setQueryData(['brandsDropdown'], (old: any[] = []) => [
          newBrand,
          ...old.filter(b => b.id !== newBrand.id)
        ])
        queryClient.invalidateQueries({ queryKey: ['brandsDropdown'] })
        queryClient.invalidateQueries({ queryKey: ['brandsPaginated'] })

        // 2. Automatically select the newly created brand in the Product form
        setProductFormBrandId(newBrand.id)

        // 3. Close the modal, clean state, notify user
        setIsQuickBrandModalOpen(false)
        setQuickBrandName('')
        setQuickBrandError('')
        showToast('Brand created successfully.', 'success')
      } else {
        const msg = res.message || 'Failed to create brand.'
        setQuickBrandError(msg)
        showToast(msg, 'error')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create brand.'
      setQuickBrandError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSubmittingQuickBrand(false)
    }
  }

  const handleCloseQuickRawMaterialModal = () => {
    if (isSubmittingQuickRawMaterial) return
    setIsQuickRawMaterialModalOpen(false)
    setQuickRawMaterialName('')
    setQuickRawMaterialCategory('PREFORM')
    setQuickRawMaterialUnit('PIECE')
    setQuickRawMaterialError('')
  }

  const handleQuickCreateRawMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = quickRawMaterialName.trim()
    if (!trimmed) {
      setQuickRawMaterialError('Material name is required.')
      return
    }

    // Fast client-side duplicate check
    const duplicate = allMats.some(
      m => m.name && m.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      setQuickRawMaterialError('A raw material with this name already exists.')
      return
    }

    setIsSubmittingQuickRawMaterial(true)
    setQuickRawMaterialError('')

    try {
      const res = await rawMaterialsService.createRawMaterial({
        name: trimmed,
        category: quickRawMaterialCategory,
        unit: quickRawMaterialUnit,
        isActive: true,
        currentStock: 0
      })

      if (res.success && res.data) {
        const newMat = res.data

        // 1. Immediately update cache so dropdown has the new material
        queryClient.setQueryData(['rawMaterialsDropdown'], (old: any[] = []) => [
          newMat,
          ...old.filter(m => m.id !== newMat.id)
        ])
        queryClient.invalidateQueries({ queryKey: ['rawMaterialsDropdown'] })
        queryClient.invalidateQueries({ queryKey: ['rawMaterialsList'] })
        queryClient.invalidateQueries({ queryKey: ['rawMaterials'] })

        // 2. Automatically select the newly created Raw Material in the Add Stock modal
        setSelectedAddStockMaterialId(newMat.id)

        // 3. Close the modal, clean state, notify user
        setIsQuickRawMaterialModalOpen(false)
        setQuickRawMaterialName('')
        setQuickRawMaterialCategory('PREFORM')
        setQuickRawMaterialUnit('PIECE')
        setQuickRawMaterialError('')
        showToast('Raw material created successfully.', 'success')
      } else {
        const msg = res.message || 'Failed to create raw material.'
        setQuickRawMaterialError(msg)
        showToast(msg, 'error')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create raw material.'
      setQuickRawMaterialError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSubmittingQuickRawMaterial(false)
    }
  }
  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const matRowCls = (mat: any, i: number) => {
    if (mat.currentStock <= 0) return 'bg-red-50 hover:bg-red-100/60'
    if (mat.currentStock < 50) return 'bg-amber-50 hover:bg-amber-100/60'
    return i % 2 === 0 ? 'bg-white hover:bg-blue-50/30' : 'bg-[#FAFBFC] hover:bg-blue-50/30'
  }
  const pageTitle = inventoryTab === 'raw_materials' ? 'Raw Materials' : 'Products Inventory'
  const pageDesc = inventoryTab === 'raw_materials' ? 'Monitor raw material stock levels, units, and inventory movements' : 'Track finished goods inventory, SKU details, and stock levels'

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900 bg-[#F8FAFC] min-h-screen">
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-black text-slate-900 leading-tight tracking-tight">{pageTitle}</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">{pageDesc}</p>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[11px] text-slate-400 font-semibold select-none hidden sm:block">{todayStr}</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="Search inventory..." value={globalSearch}
              onChange={e => { const v = e.target.value; setGlobalSearch(v); if (inventoryTab === 'products') { setProductsSearch(v); setProductsPage(1) } else { setRawMaterialsSearch(v); setRawMaterialsPage(1) } }}
              className="h-[32px] pl-8 pr-3 text-[12px] border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] focus:outline-none focus:border-blue-400 w-[200px] text-slate-800" />
          </div>
          <button onClick={() => { if (inventoryTab === 'products') refetchProducts(); else refetchMaterials() }} className="h-[32px] px-2.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-[#E5E7EB] flex items-center gap-1 transition-all cursor-pointer">
            <RotateCcw className="w-3 h-3" />Refresh
          </button>
          {canWrite && inventoryTab === 'products' && <button onClick={() => { setProductFormName(''); setProductFormBrandId((brands[0] as any)?.id || ''); setProductFormSKU(''); setProductFormIsActive(true); setProductFormOpeningStock('0'); setIsAddProductModalOpen(true) }} className="h-[32px] px-3 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"><Plus className="w-3.5 h-3.5" />Product</button>}
          {canWrite && inventoryTab === 'raw_materials' && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setRawMaterialFormName(''); setRawMaterialFormCategory('PREFORM'); setRawMaterialFormUnit('PIECE'); setRawMaterialFormIsActive(true); setRawMaterialFormCurrentStock('0'); setIsAddRawMaterialModalOpen(true) }} className="h-[32px] px-3 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"><Plus className="w-3.5 h-3.5" />Material</button>
              <button onClick={() => { setSelectedAddStockMaterialId(''); setAddStockFormQuantity(''); setAddStockFormNotes(''); setIsAddStockModalOpen(true) }} className="h-[32px] px-3 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"><Plus className="w-3.5 h-3.5" />Add Stock</button>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
        {[{ value: totalProducts, label: 'Total Products', d: false, w: false }, { value: totalMaterials, label: 'Raw Materials', d: false, w: false }, { value: lowStock, label: 'Low Stock Items', d: false, w: lowStock > 0 }, { value: outOfStock, label: 'Out of Stock', d: outOfStock > 0, w: false }].map((k, i) => (
          <div key={i} className="bg-white border border-[#E5E7EB] rounded-lg py-2 px-3 shadow-sm flex flex-col justify-center h-[54px] text-center">
            <span className={`text-[20px] font-black leading-tight ${k.d ? 'text-red-600' : k.w ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{k.label}</span>
          </div>
        ))}
      </div>
      <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
        {inventoryTab === 'products' && (
          productsLoading ? <div className="py-12 text-center text-[13px] text-slate-400">Loading products...</div>
            : productsData?.items && productsData.items.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none h-[36px]">
                      <th className="py-2 px-4">Product Name</th><th className="py-2 px-4">Brand</th>
                      <th className="py-2 px-4 text-right">Current Stock</th><th className="py-2 px-4">Unit</th>
                      <th className="py-2 px-4 text-right">Unit Cost</th>
                      <th className="py-2 px-4 text-center">Status</th><th className="py-2 px-4">Last Updated</th>
                      {canWrite && <th className="py-2 px-4 text-center">Actions</th>}
                      <th className="py-2 px-4 text-center">Movements</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-slate-700">
                      {productsData.items.map((row: any, i: number) => {
                        const isExp = expandedRowId === row.id
                        return (
                          <React.Fragment key={row.id}>
                            <tr className={`h-[38px] cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} hover:bg-blue-50/30`} onClick={() => toggleRow(row.id)}>
                              <td className="py-2 px-4 font-bold text-slate-800">{row.name}</td>
                              <td className="py-2 px-4 text-slate-600">{row.brandName}</td>
                              <td className="py-2 px-4 text-right font-black tabular-nums text-slate-900">{row.currentStock ?? 0}</td>
                              <td className="py-2 px-4 text-slate-500 text-[12px]">Cases</td>
                              <td className="py-2 px-4 text-right font-semibold text-slate-800" onClick={e => e.stopPropagation()}>
                                {editingCostProductId === row.id ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-xs text-slate-500 font-bold">₹</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editingCostValue}
                                      onChange={(e) => setEditingCostValue(e.target.value)}
                                      className="w-20 h-7 px-1.5 text-xs font-bold border border-blue-400 rounded focus:outline-none bg-white text-right"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCost(row.id)
                                        if (e.key === 'Escape') setEditingCostProductId(null)
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveCost(row.id)}
                                      disabled={updateCostMutation.isPending}
                                      className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded cursor-pointer transition-all"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingCostProductId(null)}
                                      className="h-7 px-1.5 text-slate-400 hover:text-slate-700 text-[10px] font-semibold rounded cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="font-bold tabular-nums text-slate-800">
                                      ₹{(row.costPrice ?? row.unitCost ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {canWrite && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditingCostProductId(row.id)
                                          setEditingCostValue((row.costPrice ?? row.unitCost ?? 0).toString())
                                        }}
                                        title="Edit Unit Cost"
                                        className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors cursor-pointer"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-4 text-center"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${row.isActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{row.isActive ? 'Active' : 'Inactive'}</span></td>
                              <td className="py-2 px-4 text-slate-500 text-[12px]">
                                <div className="flex flex-col gap-0.5">
                                  <span>{fmtDate(row.updatedAt || row.createdAt)}</span>
                                  {row.updatedBy?.toLowerCase().includes('edrops') ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 w-fit">
                                      <span>💧</span>
                                      <span>Changed in eDrops</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium">by {row.updatedBy || 'Plant'}</span>
                                  )}
                                </div>
                              </td>
                              {canWrite && <td className="py-2 px-4 text-center" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1">
                                <button onClick={() => openEditProduct(row)} title="Edit" className="h-[26px] w-[26px] flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => triggerDeleteProduct(row.id, row.name)} title="Delete" className="h-[26px] w-[26px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div></td>}
                              <td className="py-2 px-4 text-center">
                                <button onClick={e => { e.stopPropagation(); toggleRow(row.id) }} className="h-[26px] px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200 rounded border border-[#E5E7EB] inline-flex items-center gap-1 select-none transition-all">
                                  {isExp ? <><ChevronUp className="w-3 h-3" />Hide</> : <><ChevronDown className="w-3 h-3" />View</>}
                                </button>
                              </td>
                            </tr>
                            {isExp && <tr><td colSpan={canWrite ? 9 : 8} className="p-0"><ProductMovementPanel productId={row.id} currentStock={row.currentStock ?? 0} /></td></tr>}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {productsData.totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#F1F5F9] flex items-center justify-between select-none">
                    <span className="text-[11px] text-slate-400 font-semibold">Page {productsPage} of {productsData.totalPages} &bull; {productsData.totalCount} products</span>
                    <div className="flex gap-2">
                      <button disabled={!productsData.hasPreviousPage} onClick={() => setProductsPage(p => p - 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Prev</button>
                      <button disabled={!productsData.hasNextPage} onClick={() => setProductsPage(p => p + 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next</button>
                    </div>
                  </div>
                )}
              </div>
            ) : <div className="py-16 text-center"><Package className="w-8 h-8 text-slate-300 mx-auto mb-3" /><p className="text-[14px] font-semibold text-slate-600">No Products Found</p>{canWrite && <button onClick={() => setIsAddProductModalOpen(true)} className="mt-4 h-[32px] px-4 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg cursor-pointer transition-all">Add Product</button>}</div>
        )}
        {inventoryTab === 'raw_materials' && (
          rawMaterialsLoading ? <div className="py-12 text-center text-[13px] text-slate-400">Loading raw materials...</div>
            : rawMaterialsData?.items && rawMaterialsData.items.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none h-[36px]">
                      <th className="py-2 px-4">Material Name</th><th className="py-2 px-4">Category</th>
                      <th className="py-2 px-4 text-right">Current Stock</th><th className="py-2 px-4">Unit</th>
                      <th className="py-2 px-4 text-center">Status</th><th className="py-2 px-4">Last Updated</th>
                      {canWrite && <th className="py-2 px-4 text-center">Actions</th>}
                      <th className="py-2 px-4 text-center">Movements</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-slate-700">
                      {rawMaterialsData.items.map((mat: any, i: number) => {
                        const isExp = expandedRowId === mat.id
                        return (
                          <React.Fragment key={mat.id}>
                            <tr className={`h-[38px] cursor-pointer transition-colors ${matRowCls(mat, i)}`} onClick={() => toggleRow(mat.id)}>
                              <td className="py-2 px-4 font-bold text-slate-800">{mat.name}</td>
                              <td className="py-2 px-4"><span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wider">{mat.category}</span></td>
                              <td className="py-2 px-4 text-right font-black tabular-nums"><span className={mat.currentStock <= 0 ? 'text-red-600' : mat.currentStock < 50 ? 'text-amber-600' : 'text-slate-900'}>{mat.currentStock ?? 0}</span></td>
                              <td className="py-2 px-4 text-slate-500 text-[12px]">{mat.unit}</td>
                              <td className="py-2 px-4 text-center"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${mat.isActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{mat.isActive ? 'Active' : 'Inactive'}</span></td>
                              <td className="py-2 px-4 text-slate-500 text-[12px]">
                                <div className="flex flex-col gap-0.5">
                                  <span>{fmtDate(mat.updatedAt || mat.createdAt)}</span>
                                  {mat.updatedBy?.toLowerCase().includes('edrops') ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 w-fit">
                                      <span>💧</span>
                                      <span>Changed in eDrops</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium">by {mat.updatedBy || 'Plant'}</span>
                                  )}
                                </div>
                              </td>
                              {canWrite && <td className="py-2 px-4 text-center" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1">
                                <button onClick={() => openEditRawMaterial(mat)} title="Edit" className="h-[26px] w-[26px] flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => triggerDeleteRawMaterial(mat.id, mat.name)} title="Delete" className="h-[26px] w-[26px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div></td>}
                              <td className="py-2 px-4 text-center">
                                <button onClick={e => { e.stopPropagation(); toggleRow(mat.id) }} className="h-[26px] px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200 rounded border border-[#E5E7EB] inline-flex items-center gap-1 select-none transition-all">
                                  {isExp ? <><ChevronUp className="w-3 h-3" />Hide</> : <><ChevronDown className="w-3 h-3" />View</>}
                                </button>
                              </td>
                            </tr>
                            {isExp && <tr><td colSpan={canWrite ? 8 : 7} className="p-0"><MovementPanel materialId={mat.id} currentStock={mat.currentStock ?? 0} unit={mat.unit} /></td></tr>}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-[#F1F5F9] flex items-center gap-4 select-none">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legend:</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Low Stock (&lt;50)</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Out of Stock</span>
                </div>
                {rawMaterialsData.totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#F1F5F9] flex items-center justify-between select-none">
                    <span className="text-[11px] text-slate-400 font-semibold">Page {rawMaterialsPage} of {rawMaterialsData.totalPages} &bull; {rawMaterialsData.totalCount} materials</span>
                    <div className="flex gap-2">
                      <button disabled={!rawMaterialsData.hasPreviousPage} onClick={() => setRawMaterialsPage(p => p - 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Prev</button>
                      <button disabled={!rawMaterialsData.hasNextPage} onClick={() => setRawMaterialsPage(p => p + 1)} className="h-[26px] px-3 text-[11px] font-bold text-slate-600 border border-[#E5E7EB] rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next</button>
                    </div>
                  </div>
                )}
              </div>
            ) : <div className="py-16 text-center"><Package className="w-8 h-8 text-slate-300 mx-auto mb-3" /><p className="text-[14px] font-semibold text-slate-600">No Raw Materials Found</p>{canWrite && <button onClick={() => setIsAddRawMaterialModalOpen(true)} className="mt-4 h-[32px] px-4 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg cursor-pointer transition-all">Add Material</button>}</div>
        )}
      </div>
      {/* Redesigned Add New Product Modal */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !createProductMutation.isPending && setIsAddProductModalOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-full max-w-[650px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog" aria-modal="true" aria-labelledby="modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !createProductMutation.isPending) {
                setIsAddProductModalOpen(false);
              }
            }}>

            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 id="modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Add New Product
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Create a new packaged drinking water product.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !createProductMutation.isPending && setIsAddProductModalOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={createProductMutation.isPending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateProductSubmit} className="flex flex-col gap-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Row 1 */}
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Product Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Enter product name"
                    value={productFormName}
                    onChange={e => setProductFormName(e.target.value)}
                    required
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <SearchableDropdown
                    label="Brand"
                    value={productFormBrandId}
                    onChange={setProductFormBrandId}
                    items={(brands as any[]).filter(b => b.isActive).map(b => ({ id: b.id, name: b.name }))}
                    placeholder="Search & Select Brand"
                    required
                    labelRight={
                      canWrite ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickBrandName('')
                            setQuickBrandError('')
                            setIsQuickBrandModalOpen(true)
                          }}
                          className="text-xs font-semibold text-[#0B7A70] hover:text-[#05303B] active:text-[#031F27] transition-colors inline-flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:underline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New Brand</span>
                        </button>
                      ) : undefined
                    }
                  />
                </div>

                {/* Row 2 */}
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">SKU</label>
                  <input
                    type="text"
                    placeholder="Optional SKU"
                    value={productFormSKU}
                    onChange={e => setProductFormSKU(e.target.value)}
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <EnterpriseNumberInput
                    label="Opening Stock (Cases)"
                    placeholder="Enter opening stock"
                    value={productFormOpeningStock}
                    onChange={e => setProductFormOpeningStock(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3 - Toggle Switch */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-[12px] text-left">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Active Product</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Product is available for sales and inventory.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={productFormIsActive}
                  onClick={() => setProductFormIsActive(!productFormIsActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer ${productFormIsActive ? 'bg-[#12A89A]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${productFormIsActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  disabled={createProductMutation.isPending}
                  className="px-5 h-10 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProductMutation.isPending}
                  className="px-6 h-10 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-sm cursor-pointer"
                >
                  {createProductMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : 'Create Product'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Quick Create Brand Modal */}
      {isQuickBrandModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            onClick={handleCloseQuickBrandModal}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div
            className="relative w-full max-w-[420px] bg-white border border-gray-200 p-6 rounded-[16px] shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-brand-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleCloseQuickBrandModal()
              }
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 id="quick-brand-modal-title" className="text-lg font-bold text-gray-900">
                  Create New Brand
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add a brand to select for this product.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseQuickBrandModal}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={isSubmittingQuickBrand}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleQuickCreateBrand} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-xs font-semibold text-gray-700">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Aquzio"
                  value={quickBrandName}
                  onChange={(e) => {
                    setQuickBrandName(e.target.value)
                    if (quickBrandError) setQuickBrandError('')
                  }}
                  disabled={isSubmittingQuickBrand}
                  className={`w-full h-10 px-3 border rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none transition-all ${
                    quickBrandError
                      ? 'border-red-500 ring-2 ring-red-100'
                      : 'border-gray-200 focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20'
                  }`}
                />
                {quickBrandError && (
                  <p className="text-xs font-medium text-red-600 mt-0.5">{quickBrandError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100 mt-1">
                <EnterpriseButton
                  type="button"
                  onClick={handleCloseQuickBrandModal}
                  variant="secondary"
                  disabled={isSubmittingQuickBrand}
                >
                  Cancel
                </EnterpriseButton>
                <EnterpriseButton
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingQuickBrand || !quickBrandName.trim()}
                >
                  {isSubmittingQuickBrand ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create Brand'
                  )}
                </EnterpriseButton>
              </div>
            </form>
          </div>
        </div>
      )}
      <EnterpriseModal isOpen={isEditProductModalOpen} onClose={() => setIsEditProductModalOpen(false)} title="Edit Product" maxWidth="sm">
        <form onSubmit={handleEditProductSubmit} className="flex flex-col gap-4">
          <EnterpriseInput label="Product Name" value={productFormName} onChange={e => setProductFormName(e.target.value)} required />
          <EnterpriseSelect label="Brand" value={productFormBrandId} onChange={e => setProductFormBrandId(e.target.value)} required><option value="">Select a Brand</option>{(brands as any[]).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</EnterpriseSelect>
          <EnterpriseInput label="SKU (Optional)" value={productFormSKU} onChange={e => setProductFormSKU(e.target.value)} />
          <EnterpriseNumberInput label="Current Stock (Cases)" value={productFormCurrentStock} onChange={e => setProductFormCurrentStock(e.target.value)} required />
          <div className="flex items-center gap-2"><input type="checkbox" id="editPA" checked={productFormIsActive} onChange={e => setProductFormIsActive(e.target.checked)} className="w-4 h-4 accent-blue-600" /><label htmlFor="editPA" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">Active Product</label></div>
          <div className="flex justify-end gap-2 mt-2"><EnterpriseButton type="button" onClick={() => setIsEditProductModalOpen(false)} variant="secondary">Cancel</EnterpriseButton><EnterpriseButton type="submit" variant="primary" disabled={updateProductMutation.isPending}>{updateProductMutation.isPending ? 'Saving...' : 'Save Changes'}</EnterpriseButton></div>
        </form>
      </EnterpriseModal>
      {/* Redesigned Add New Raw Material Modal */}
      {isAddRawMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !createRawMaterialMutation.isPending && setIsAddRawMaterialModalOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-full max-w-[650px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog" aria-modal="true" aria-labelledby="rm-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !createRawMaterialMutation.isPending) {
                setIsAddRawMaterialModalOpen(false);
              }
            }}>

            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 id="rm-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Add New Raw Material
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Register a new material for inventory and production.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !createRawMaterialMutation.isPending && setIsAddRawMaterialModalOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={createRawMaterialMutation.isPending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateRawMaterialSubmit} className="flex flex-col gap-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Row 1 */}
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Material Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="E.g., 28mm Preform (Premium)"
                    value={rawMaterialFormName}
                    onChange={e => setRawMaterialFormName(e.target.value)}
                    required
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Category <span className="text-red-500">*</span></label>
                  <select
                    value={rawMaterialFormCategory}
                    onChange={e => setRawMaterialFormCategory(e.target.value)}
                    required
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                  >
                    {Object.values(RAW_MATERIAL_CATEGORIES).map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {/* Row 2 */}
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Unit of Measurement <span className="text-red-500">*</span></label>
                  <select
                    value={rawMaterialFormUnit}
                    onChange={e => setRawMaterialFormUnit(e.target.value)}
                    required
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                  >
                    {['PIECE', 'KG', 'GRAM', 'ROLL', 'BOX', 'BAG', 'LITER', 'ML'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <EnterpriseNumberInput
                    label="Initial Stock"
                    placeholder="E.g., 500"
                    value={rawMaterialFormCurrentStock}
                    onChange={e => setRawMaterialFormCurrentStock(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3 - Toggle Switch */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-[12px] text-left">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Active Material</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Material can be used in production and inventory.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rawMaterialFormIsActive}
                  onClick={() => setRawMaterialFormIsActive(!rawMaterialFormIsActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer ${rawMaterialFormIsActive ? 'bg-[#12A89A]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rawMaterialFormIsActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddRawMaterialModalOpen(false)}
                  disabled={createRawMaterialMutation.isPending}
                  className="px-5 h-10 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRawMaterialMutation.isPending}
                  className="px-6 h-10 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-sm cursor-pointer"
                >
                  {createRawMaterialMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : 'Add Material'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
      <EnterpriseModal isOpen={isEditRawMaterialModalOpen} onClose={() => setIsEditRawMaterialModalOpen(false)} title="Edit Raw Material" maxWidth="sm">
        <form onSubmit={handleEditRawMaterialSubmit} className="flex flex-col gap-4">
          <EnterpriseInput label="Material Name" value={rawMaterialFormName} onChange={e => setRawMaterialFormName(e.target.value)} required />
          <EnterpriseSelect label="Category" value={rawMaterialFormCategory} onChange={e => setRawMaterialFormCategory(e.target.value)} required>{Object.values(RAW_MATERIAL_CATEGORIES).map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}</EnterpriseSelect>
          <EnterpriseSelect label="Unit" value={rawMaterialFormUnit} onChange={e => setRawMaterialFormUnit(e.target.value)} required>{['PIECE', 'KG', 'GRAM', 'ROLL', 'BOX', 'BAG', 'LITER', 'ML'].map(u => <option key={u} value={u}>{u}</option>)}</EnterpriseSelect>
          <div>
            <EnterpriseNumberInput label="Current Stock" value={rawMaterialFormCurrentStock} onChange={e => setRawMaterialFormCurrentStock(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="editMA" checked={rawMaterialFormIsActive} onChange={e => setRawMaterialFormIsActive(e.target.checked)} className="w-4 h-4 accent-blue-600" /><label htmlFor="editMA" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">Active Material</label></div>
          <div className="flex justify-end gap-2 mt-2"><EnterpriseButton type="button" onClick={() => setIsEditRawMaterialModalOpen(false)} variant="secondary">Cancel</EnterpriseButton><EnterpriseButton type="submit" variant="primary" disabled={updateRawMaterialMutation.isPending}>{updateRawMaterialMutation.isPending ? 'Saving...' : 'Save Changes'}</EnterpriseButton></div>
        </form>
      </EnterpriseModal>

      {/* Redesigned Add Stock Modal */}
      {isAddStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !addStockMutation.isPending && setIsAddStockModalOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-full max-w-[650px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog" aria-modal="true" aria-labelledby="stock-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !addStockMutation.isPending) {
                setIsAddStockModalOpen(false);
              }
            }}>

            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 id="stock-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Add Raw Material Stock
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Record new incoming stock for raw materials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !addStockMutation.isPending && setIsAddStockModalOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={addStockMutation.isPending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddStockSubmit} className="flex flex-col gap-6">

              <div className="flex flex-col gap-1.5 text-left">
                <SearchableDropdown
                  label="Raw Material"
                  value={selectedAddStockMaterialId}
                  onChange={setSelectedAddStockMaterialId}
                  items={allMats.filter(m => m.isActive).map((m: any) => ({ id: m.id, name: m.name }))}
                  placeholder="Search & Select Material"
                  required
                  labelRight={
                    canWrite ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickRawMaterialName('')
                          setQuickRawMaterialCategory('PREFORM')
                          setQuickRawMaterialUnit('PIECE')
                          setQuickRawMaterialError('')
                          setIsQuickRawMaterialModalOpen(true)
                        }}
                        className="text-xs font-semibold text-[#0B7A70] hover:text-[#05303B] active:text-[#031F27] transition-colors inline-flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Raw Material</span>
                      </button>
                    ) : undefined
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-sm font-semibold text-gray-700">Current Stock</label>
                  <input
                    type="text"
                    value={selectedAddStockMaterialId ? `${allMats.find(m => m.id === selectedAddStockMaterialId)?.currentStock ?? 0} ${allMats.find(m => m.id === selectedAddStockMaterialId)?.unit ?? ''}` : '—'}
                    disabled
                    className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <EnterpriseNumberInput
                    label="Quantity to Add"
                    placeholder="E.g., 10"
                    value={addStockFormQuantity}
                    onChange={e => setAddStockFormQuantity(e.target.value)}
                    required
                  />
                </div>
              </div>

              {selectedAddStockMaterialId && (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-4 select-none flex items-center justify-between">
                  <div className="flex flex-col items-center w-1/3">
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">Current</span>
                    <span className="text-[15px] font-semibold text-slate-700">{(allMats.find(m => m.id === selectedAddStockMaterialId)?.currentStock ?? 0)} {(allMats.find(m => m.id === selectedAddStockMaterialId)?.unit ?? '')}</span>
                  </div>
                  <div className="text-slate-300 font-light text-xl">+</div>
                  <div className="flex flex-col items-center w-1/3">
                    <span className="text-[11px] text-[#0B7A70] font-bold uppercase tracking-wider mb-1">Adding</span>
                    <span className="text-[15px] font-semibold text-[#0B7A70]">{(parseFloat(addStockFormQuantity) || 0)} {(allMats.find(m => m.id === selectedAddStockMaterialId)?.unit ?? '')}</span>
                  </div>
                  <div className="text-slate-300 font-light text-xl">=</div>
                  <div className="flex flex-col items-center w-1/3">
                    <span className="text-[11px] text-[#16A34A] font-bold uppercase tracking-wider mb-1">New Total</span>
                    <span className="text-[15px] font-bold text-[#16A34A]">{(allMats.find(m => m.id === selectedAddStockMaterialId)?.currentStock ?? 0) + (parseFloat(addStockFormQuantity) || 0)} {(allMats.find(m => m.id === selectedAddStockMaterialId)?.unit ?? '')}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-sm font-semibold text-gray-700">Reason / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="E.g., Purchased from Supplier"
                  value={addStockFormNotes}
                  onChange={e => setAddStockFormNotes(e.target.value)}
                  className="w-full h-11 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddStockModalOpen(false)}
                  disabled={addStockMutation.isPending}
                  className="px-5 h-10 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addStockMutation.isPending}
                  className="px-6 h-10 bg-[#05303B] hover:bg-[#0A4352] active:bg-[#031F27] text-white font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] shadow-sm cursor-pointer"
                >
                  {addStockMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Raw Material Modal */}
      {isQuickRawMaterialModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            onClick={handleCloseQuickRawMaterialModal}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div
            className="relative w-full max-w-[460px] bg-white border border-gray-200 p-6 rounded-[16px] shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-rm-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleCloseQuickRawMaterialModal()
              }
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 id="quick-rm-modal-title" className="text-lg font-bold text-gray-900">
                  Create New Raw Material
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Register a raw material for inventory tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseQuickRawMaterialModal}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={isSubmittingQuickRawMaterial}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleQuickCreateRawMaterial} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-xs font-semibold text-gray-700">
                  Material Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g., 28mm Preform (Premium)"
                  value={quickRawMaterialName}
                  onChange={(e) => {
                    setQuickRawMaterialName(e.target.value)
                    if (quickRawMaterialError) setQuickRawMaterialError('')
                  }}
                  disabled={isSubmittingQuickRawMaterial}
                  className={`w-full h-10 px-3 border rounded-[10px] text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none transition-all ${
                    quickRawMaterialError
                      ? 'border-red-500 ring-2 ring-red-100'
                      : 'border-gray-200 focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20'
                  }`}
                />
                {quickRawMaterialError && (
                  <p className="text-xs font-medium text-red-600 mt-0.5">{quickRawMaterialError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-gray-700">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={quickRawMaterialCategory}
                    onChange={(e) => setQuickRawMaterialCategory(e.target.value)}
                    disabled={isSubmittingQuickRawMaterial}
                    className="w-full h-10 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                  >
                    {Object.values(RAW_MATERIAL_CATEGORIES).map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-gray-700">
                    Unit of Measurement <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={quickRawMaterialUnit}
                    onChange={(e) => setQuickRawMaterialUnit(e.target.value)}
                    disabled={isSubmittingQuickRawMaterial}
                    className="w-full h-10 px-3 border border-gray-200 rounded-[10px] text-sm text-gray-900 bg-white focus:outline-none focus:border-[#12A89A] focus:ring-4 focus:ring-[#12A89A]/20 transition-all cursor-pointer"
                  >
                    {['PIECE', 'KG', 'GRAM', 'ROLL', 'BOX', 'BAG', 'LITER', 'ML'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100 mt-1">
                <EnterpriseButton
                  type="button"
                  onClick={handleCloseQuickRawMaterialModal}
                  variant="secondary"
                  disabled={isSubmittingQuickRawMaterial}
                >
                  Cancel
                </EnterpriseButton>
                <EnterpriseButton
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingQuickRawMaterial || !quickRawMaterialName.trim()}
                >
                  {isSubmittingQuickRawMaterial ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create Raw Material'
                  )}
                </EnterpriseButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default InventoryPage
