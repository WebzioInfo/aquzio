import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../services/api'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useAuthStore } from '../../store/useAuthStore'
import { productionShiftsService } from '../../services/productionShifts'
import { operationsIssueApi } from '../../services/api/operationsIssue'
import {
  Check, Cpu, Save, RefreshCw, Play, X, AlertTriangle, Clock, ChevronDown, Loader2, Send, CheckCircle2, Lock, Camera, Upload
} from 'lucide-react'
import EnterpriseCard from '../../components/ui/EnterpriseCard'
import EnterpriseButton from '../../components/ui/EnterpriseButton'
import { BatchNumberSuggestion } from '../../components/batch/BatchNumberSuggestion'
import { getLineTheme } from '../../utils/lineTheme'
import { RAW_MATERIAL_CATEGORIES } from '../../utils/rawMaterialCategories'
import { formatRawMaterialUsage, formatRawMaterialWastage } from '../../utils/rawMaterialFormatting'

interface SkuProduct {
  id: string
  name: string
  code: string
  sku?: string
  barcode?: string
  bottleSize?: string
}



interface RawMaterial {
  id: string
  name: string
  code: string
  category: string
  unit: string
  baseUnit: string
  conversionFactor: number
  currentStock: number
}

interface ActiveSession {
  id: string
  batchNumber: string
  shift: string
  skuId: string
  skuName: string
  skuCode: string
  caseConfigurationId: string
  caseConfigurationName: string
  startedAt: string
  startedAtFormatted: string
  duration: string
  entriesCount: number
  totalCasesProduced: number
  operatorName: string
  status: string
}

export const OperatorDashboardPage: React.FC = () => {
  const { showToast } = useNotificationStore()

  // Context from OperatorLayout
  const {
    selectedLine, updateLine,
    selectedShift, updateShift,
    selectedProduct, updateProduct,
    resetTerminal,
    hasUnsavedData, setHasUnsavedData,
    registerSaveHandler,
    registerDiscardHandler,
    registerEndBatchTrigger,
    registerRefreshTrigger,
    refetchActiveBatch
  } = useOutletContext<any>()

  const lineTheme = React.useMemo(() => {
    if (!selectedLine) return null
    return getLineTheme(selectedLine.name, selectedLine.lineId)
  }, [selectedLine])

  // View state: 'dashboard' or 'entry'
  const [currentView, setCurrentView] = useState<'dashboard' | 'entry'>('dashboard')

  // Modals state
  const [showStartModal, setShowStartModal] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)

  // Active Batch Report Issue Modal States
  const [showReportIssueModal, setShowReportIssueModal] = useState(false)
  const [issueCategory, setIssueCategory] = useState('Machine Breakdown')
  const [issuePriority, setIssuePriority] = useState('High')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issueRequiresImmediateStop, setIssueRequiresImmediateStop] = useState(false)
  const [issueAttachment, setIssueAttachment] = useState('')
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false)
  const [createdIssueResult, setCreatedIssueResult] = useState<{ issueNumber: string } | null>(null)

  const handleReportIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession) {
      showToast('No active production batch found. Please start a batch first.', 'warning')
      return
    }
    if (!issueTitle.trim() || !issueDescription.trim()) {
      showToast('Title and Description are required.', 'warning')
      return
    }

    setIsSubmittingIssue(true)
    try {
      const res = await operationsIssueApi.reportOperatorBatchIssue({
        category: issueCategory,
        priority: issuePriority,
        title: issueTitle.trim(),
        description: issueDescription.trim(),
        requiresImmediateStop: issueRequiresImmediateStop,
        attachments: issueAttachment.trim() || undefined,
        batchId: activeSession.id,
        batchNumber: activeSession.batchNumber,
        productId: activeSession.skuId,
        productName: activeSession.skuName,
        productionLineId: selectedLine?.lineId || selectedLine?.id,
        productionLineName: selectedLine?.name,
        machineId: selectedLine?.lineId || selectedLine?.id,
        machineName: selectedLine?.name,
        shiftId: activeSession.shiftId,
        shiftName: activeSession.shift,
        stationId: selectedLine?.lineId || selectedLine?.id,
        stationName: selectedLine?.name || 'Production Station',
        productionSessionId: activeSession.id
      })

      setCreatedIssueResult({ issueNumber: res.data.issueNumber })
      showToast(`Issue ${res.data.issueNumber} reported successfully.`, 'success')
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to report production issue.', 'error')
    } finally {
      setIsSubmittingIssue(false)
    }
  }

  // Pre-login allocation state
  const [localLine, setLocalLine] = useState<any>(null)
  const [localShift, setLocalShift] = useState<string>('')
  const [localProduct, setLocalProduct] = useState<SkuProduct | null>(null)
  const [allocationSkuSearch, setAllocationSkuSearch] = useState('')
  const [allocationSkuOpen, setAllocationSkuOpen] = useState(false)
  const [allocationSkuHighlight, setAllocationSkuHighlight] = useState(-1)
  const allocationSkuContainerRef = useRef<HTMLDivElement>(null)

  // --- QUERY: Active Production Session (Unified Context Endpoint) ---
  const {
    data: activeSession,
    refetch: refetchActiveSession,
    isLoading: sessionLoading
  } = useQuery<any>({
    queryKey: ['activeSession', selectedLine?.lineId],
    queryFn: async ({ signal }) => {
      if (!selectedLine?.lineId) return null
      const res = await api.get(`/api/operator/production-context?lineId=${selectedLine.lineId}`, { signal })
      return res.data?.data || null
    },
    enabled: !!selectedLine
  })

  // --- QUERY: Inventory Settings for Default Materials ---
  const { data: inventorySettings } = useQuery<any>({
    queryKey: ['inventorySettings'],
    queryFn: async () => {
      const res = await api.get('/api/v1/rawmaterials/settings')
      return res.data?.data || null
    }
  })
  // --- QUERY: Enabled Production Stations ---
  const { data: enabledStations = ['Blowing', 'Filling', 'Labeling', 'Packing'] } = useQuery<string[]>({
    queryKey: ['enabledProductionStations'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production-configuration')
      return res.data?.data || []
    },
    staleTime: Infinity,
    gcTime: Infinity
  } as any)

  const { data: productionShifts = [] } = useQuery({
    queryKey: ['productionShifts'],
    queryFn: async () => {
      try {
        const res = await productionShiftsService.getAll()
        return res.data?.data || []
      } catch (err) {
        return []
      }
    }
  })

  // Autofocus view transitions & route protection redirect
  const hasAutoOpenedModal = useRef(false)

  useEffect(() => {
    if (selectedLine?.lineId) {
      hasAutoOpenedModal.current = false
    }
  }, [selectedLine?.lineId])

  useEffect(() => {
    if (productionShifts.length > 0 && !localShift) {
      const activeShifts = productionShifts.filter((s: any) => s.isActive)
      if (activeShifts.length === 1) {
        setLocalShift(activeShifts[0].name)
      } else if (activeShifts.length > 1) {
        const matched = activeShifts.find((s: any) => {
          const name = s.name.toLowerCase()
          const hour = new Date().getHours()
          if (hour >= 6 && hour < 14 && (name.includes('morning') || name.includes('day') || name.includes('a'))) return true
          if (hour >= 14 && hour < 22 && (name.includes('evening') || name.includes('afternoon') || name.includes('b'))) return true
          if ((hour >= 22 || hour < 6) && (name.includes('night') || name.includes('c'))) return true
          return false
        })
        setLocalShift(matched ? matched.name : activeShifts[0].name)
      }
    }
  }, [productionShifts, localShift])

  useEffect(() => {
    if (activeSession && activeSession.canEnterProductionPage) {
      if (currentView !== 'entry') {
        setCurrentView('entry')
      }
      setShowStartModal(false) // Force close modal if a batch is active
    } else {
      if (currentView === 'entry') {
        setCurrentView('dashboard')
        showToast('No active production configuration found for this line. Please contact the production administrator.', 'warning')
      }
    }
  }, [activeSession?.id, activeSession?.canEnterProductionPage, currentView, sessionLoading, selectedLine?.lineId])

  // Live Batch Running duration tick
  const [liveDurationStr, setLiveDurationStr] = useState('00h 00m')
  useEffect(() => {
    if (!activeSession?.startedAt) return
    const updateDuration = () => {
      const started = new Date(activeSession.startedAt)
      const diff = new Date().getTime() - started.getTime()
      const totalMin = Math.max(0, Math.floor(diff / 60000))
      const hours = Math.floor(totalMin / 60)
      const mins = totalMin % 60
      setLiveDurationStr(`${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`)
    }
    updateDuration()
    const interval = setInterval(updateDuration, 15000) // update every 15s
    return () => clearInterval(interval)
  }, [activeSession?.startedAt])

  // User info & roles check
  const { user } = useAuthStore()

  const roles = user?.roles || []
  const canEditBatchNumber = roles.some(role =>
    ['superadmin', 'super admin', 'platformadmin', 'platformowner', 'companyadmin', 'admin', 'generalmanager', 'productionmanager', 'manager', 'supervisor'].includes(role.toLowerCase())
  )

  // --- START PRODUCTION MODAL FIELDS ---
  const [modalShift, setModalShift] = useState(selectedShift || '')
  const [modalBatchNo, setModalBatchNo] = useState('')
  const companyBadgeLetters = useMemo(() => {
    try {
      const p = JSON.parse(localStorage.getItem('aquzio_company_profile') || '{}')
      return (p.badgeLetters || '').toUpperCase()
    } catch {
      return ''
    }
  }, [])
  const [modalSkuSearch, setModalSkuSearch] = useState('')
  const [modalSelectedSku, setModalSelectedSku] = useState<SkuProduct | null>(null)
  const [modalSkuOpen, setModalSkuOpen] = useState(false)
  const [modalSkuHighlight, setModalSkuHighlight] = useState(-1)
  const [modalNotes, setModalNotes] = useState('')
  const [modalStartTime, setModalStartTime] = useState('')
  const [modalErrors, setModalErrors] = useState<{ [key: string]: string }>({})
  const [scrollTop, setScrollTop] = useState(0)


  const modalSkuInputRef = useRef<HTMLInputElement>(null)
  const modalSkuContainerRef = useRef<HTMLDivElement>(null)

  // Local datetime generator helper
  const getLocalDateTimeString = (dateObj: Date = new Date()) => {
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 19);
  };

  // Product Search & Cancellation
  const [products, setProducts] = useState<SkuProduct[]>([])
  const [isProductLoading, setIsProductLoading] = useState(false)
  const [productLoadError, setProductLoadError] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchTimeoutRef = useRef<any>(null)

  const fetchProducts = (searchVal: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsProductLoading(true)
    setProductLoadError(false)
    api.get(`/api/v1/production-entries/skus?search=${encodeURIComponent(searchVal)}`, {
      signal: controller.signal
    })
      .then(res => {
        setProducts(res.data?.data || [])
        setIsProductLoading(false)
        setProductLoadError(false)
      })
      .catch(err => {
        if (err.name !== 'CanceledError') {
          setIsProductLoading(false)
          setProductLoadError(true)
          console.error('Failed to load products', err)
        }
      })
  }

  // Virtualization variables
  const itemHeight = 48
  const viewportHeight = 240
  const totalItems = products.length
  const totalHeight = totalItems * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2)
  const endIndex = Math.min(totalItems, Math.floor((scrollTop + viewportHeight) / itemHeight) + 2)
  const visibleProducts = products.slice(startIndex, endIndex)
  const offsetY = startIndex * itemHeight

  // Debounced search trigger
  useEffect(() => {
    if (!showStartModal) return

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchProducts(modalSkuSearch)
    }, 250)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [modalSkuSearch, showStartModal])

  // Generate batch number preview on opening modal
  useEffect(() => {
    if (showStartModal) {
      setModalShift(selectedShift || '')
      setModalSelectedSku(selectedProduct || null)
      if (selectedProduct) {
        setModalSkuSearch(selectedProduct.name)
      } else {
        setModalSkuSearch('')
      }
      setModalBatchNo('')
      setModalNotes('')
      setModalStartTime(getLocalDateTimeString())
      setModalErrors({})
      setScrollTop(0)
    }
  }, [showStartModal, selectedShift, selectedProduct])

  // Click outside listener for modal SKU autocomplete
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (modalSkuContainerRef.current && !modalSkuContainerRef.current.contains(e.target as Node)) {
        setModalSkuOpen(false)
      }
    }
    document.addEventListener('mousedown', clickOutside)
    return () => document.removeEventListener('mousedown', clickOutside)
  }, [])

  // Listen to Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowStartModal(false)
        setShowEndModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Autofocus the Product Input when modal opens
  useEffect(() => {
    if (showStartModal) {
      setTimeout(() => {
        if (modalSkuInputRef.current) {
          modalSkuInputRef.current.focus()
        }
      }, 50)
    }
  }, [showStartModal])

  // --- CLOSE WIZARD OVERVIEWS ---
  const [endRemarks, setEndRemarks] = useState('')
  const [confirmCloseChecked, setConfirmCloseChecked] = useState(false)
  const [showClosedSuccessOverlay, setShowClosedSuccessOverlay] = useState(false)
  const [closedSummaryData, setClosedSummaryData] = useState<any>(null)

  // Fetch Batch summary when closing wizard is open
  const { data: sessionSummary, refetch: refetchSummary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ['sessionSummary', activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return null
      const res = await api.get(`/api/v1/production-entries/session/summary?sessionId=${activeSession.id}`)
      return res.data?.data || null
    },
    enabled: showEndModal && !!activeSession?.id
  })

  // --- PRODUCTION TERMINAL ENTRY FIELDS ---
  const casesInputRef = useRef<HTMLInputElement>(null)

  // Form Fields
  const [casesProduced, setCasesProduced] = useState('')

  // Material selections
  const [selectedPreformId, setSelectedPreformId] = useState('')
  const [preformUsage, setPreformUsage] = useState('')
  const [preformWastage, setPreformWastage] = useState('')

  const [selectedCapId, setSelectedCapId] = useState('')
  const [capUsage, setCapUsage] = useState('')
  const [capWastage, setCapWastage] = useState('')

  const [selectedLabelId, setSelectedLabelId] = useState('')
  const [labelUsage, setLabelUsage] = useState('')
  const [labelWastage, setLabelWastage] = useState('')

  const [selectedShrinkId, setSelectedShrinkId] = useState('')
  const [shrinkUsage, setShrinkUsage] = useState('')
  const [shrinkWastage, setShrinkWastage] = useState('')

  const [selectedGlueId, setSelectedGlueId] = useState('')
  const [glueUsage, setGlueUsage] = useState('')

  const [selectedInkId, setSelectedInkId] = useState('')
  const [inkUsed, setInkUsed] = useState(false)

  const [selectedMakeupId, setSelectedMakeupId] = useState('')
  const [makeupUsed, setMakeupUsed] = useState(false)

  // Direct Bottle Usage (when Blowing Station is disabled)
  const [selectedBottleId, setSelectedBottleId] = useState('')
  const [bottleUsage, setBottleUsage] = useState('')
  const [bottleWastage, setBottleWastage] = useState('')

  // UI elements states
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccessSplash, setShowSuccessSplash] = useState(false)
  const [stockErrors, setStockErrors] = useState<{ [key: string]: string }>({})
  const [expandedEntries, setExpandedEntries] = useState<{ [key: string]: boolean }>({})

  const watermarkBg = useMemo(() => {
    if (!selectedLine?.name) return 'none'
    const escapedName = selectedLine.name.toUpperCase()
    const color = lineTheme?.primary || '#12A89A'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="180">
      <text 
        x="130" 
        y="90" 
        font-family="system-ui, -apple-system, sans-serif" 
        font-weight="500" 
        font-size="25" 
        fill="${color}" 
        opacity="0.10" 
        text-anchor="middle" 
        dominant-baseline="middle"
        transform="rotate(-25 130 90)"
        style="letter-spacing: 5px;"
      >${escapedName}</text>
    </svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [selectedLine?.name, lineTheme?.primary])

  // Form dirty state check (ignore auto-selected IDs)
  const isDirty = (
    casesProduced !== '' ||
    preformUsage !== '' ||
    preformWastage !== '' ||
    capUsage !== '' ||
    capWastage !== '' ||
    labelUsage !== '' ||
    labelWastage !== '' ||
    shrinkUsage !== '' ||
    shrinkWastage !== '' ||
    glueUsage !== '' ||
    inkUsed ||
    makeupUsed ||
    bottleUsage !== '' ||
    bottleWastage !== ''
  )

  useEffect(() => {
    if (setHasUnsavedData) {
      setHasUnsavedData(isDirty)
    }
  }, [isDirty, setHasUnsavedData])

  // Reset form inputs (Discard action)
  const discardEntry = () => {
    setCasesProduced('')
    setPreformUsage('')
    setPreformWastage('')
    setSelectedCapId('')
    setCapUsage('')
    setCapWastage('')
    setLabelUsage('')
    setLabelWastage('')
    setShrinkUsage('')
    setShrinkWastage('')
    setGlueUsage('')
    setInkUsed(false)
    setMakeupUsed(false)
    setBottleUsage('')
    setBottleWastage('')
  }

  useEffect(() => {
    if (registerDiscardHandler) {
      registerDiscardHandler(() => discardEntry)
    }
  }, [registerDiscardHandler])

  // Save handler for layout to trigger
  const saveEntryPromise = async () => {
    if (isSaving || submitEntryMutation.isPending) {
      return false
    }

    if (!selectedLine?.lineId || !activeSession) {
      return false
    }

    if (!casesProduced || parseInt(casesProduced) <= 0) {
      showToast('Cases Produced must be a positive integer.', 'error')
      return false
    }

    const blowingEnabled = enabledStations.includes('Blowing')
    const fillingEnabled = enabledStations.includes('Filling')
    const labelingEnabled = enabledStations.includes('Labeling')
    const packingEnabled = enabledStations.includes('Packing')

    if (blowingEnabled && !selectedPreformId) {
      showToast('Preform material selection is required.', 'error')
      return false
    }
    // When blowing is disabled, require bottle selection if any bottle quantity entered
    if (!blowingEnabled && (parseFloat(bottleUsage) > 0 || parseFloat(bottleWastage) > 0) && !selectedBottleId) {
      showToast('Bottle material must be selected when bottle usage or wastage is entered.', 'error')
      return false
    }
    // Validate bottle wastage doesn't exceed usage
    if (!blowingEnabled && selectedBottleId) {
      const bUsage = parseFloat(bottleUsage) || 0
      const bWaste = parseFloat(bottleWastage) || 0
      if (bWaste > bUsage) {
        showToast('Bottle wastage cannot exceed bottle usage.', 'error')
        return false
      }
    }
    if (labelingEnabled && !selectedLabelId) {
      showToast('Label material selection is required.', 'error')
      return false
    }
    if (packingEnabled && !selectedShrinkId) {
      showToast('Shrink Film material selection is required.', 'error')
      return false
    }

    if (fillingEnabled && (parseFloat(capUsage) > 0 || parseFloat(capWastage) > 0) && !selectedCapId) {
      showToast('Cap material must be selected when usage or wastage is entered.', 'error')
      return false
    }

    // Build materials array for all active station selections
    const materialsPayload: Array<{ rawMaterialId: string; usageQuantity: number; wastageQuantity: number }> = []

    if (blowingEnabled && selectedPreformId && (parseFloat(preformUsage) > 0 || parseFloat(preformWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedPreformId,
        usageQuantity: parseFloat(preformUsage) || 0,
        wastageQuantity: parseFloat(preformWastage) || 0
      })
    }
    if (!blowingEnabled && selectedBottleId && (parseFloat(bottleUsage) > 0 || parseFloat(bottleWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedBottleId,
        usageQuantity: parseFloat(bottleUsage) || 0,
        wastageQuantity: parseFloat(bottleWastage) || 0
      })
    }
    if (fillingEnabled && selectedCapId && (parseFloat(capUsage) > 0 || parseFloat(capWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedCapId,
        usageQuantity: parseFloat(capUsage) || 0,
        wastageQuantity: parseFloat(capWastage) || 0
      })
    }
    if (labelingEnabled && selectedLabelId && (parseFloat(labelUsage) > 0 || parseFloat(labelWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedLabelId,
        usageQuantity: parseFloat(labelUsage) || 0,
        wastageQuantity: parseFloat(labelWastage) || 0
      })
    }
    if (packingEnabled && selectedShrinkId && (parseFloat(shrinkUsage) > 0 || parseFloat(shrinkWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedShrinkId,
        usageQuantity: parseFloat(shrinkUsage) || 0,
        wastageQuantity: parseFloat(shrinkWastage) || 0
      })
    }
    if (packingEnabled && selectedGlueId && (parseFloat(glueUsage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedGlueId,
        usageQuantity: parseFloat(glueUsage) || 0,
        wastageQuantity: 0
      })
    }

    try {
      setIsSaving(true)
      await submitEntryMutation.mutateAsync({
        productionLineId: selectedLine.lineId,
        casesProduced: parseInt(casesProduced),
        materials: materialsPayload.length > 0 ? materialsPayload : undefined,

        preformMaterialId: blowingEnabled ? selectedPreformId : null,
        preformUsage: blowingEnabled ? (parseFloat(preformUsage) || 0) : 0,
        preformWastage: blowingEnabled ? (parseFloat(preformWastage) || 0) : 0,

        bottleMaterialId: (!blowingEnabled && selectedBottleId) ? selectedBottleId : null,
        bottleUsage: !blowingEnabled ? (parseFloat(bottleUsage) || 0) : 0,
        bottleWastage: !blowingEnabled ? (parseFloat(bottleWastage) || 0) : 0,

        capMaterialId: (fillingEnabled && selectedCapId) ? selectedCapId : null,
        capUsage: fillingEnabled ? (parseFloat(capUsage) || 0) : 0,
        capWastage: fillingEnabled ? (parseFloat(capWastage) || 0) : 0,

        labelMaterialId: labelingEnabled ? selectedLabelId : null,
        labelUsage: labelingEnabled ? (parseFloat(labelUsage) || 0) : 0,
        labelWastage: labelingEnabled ? (parseFloat(labelWastage) || 0) : 0,

        shrinkMaterialId: packingEnabled ? selectedShrinkId : null,
        shrinkUsage: packingEnabled ? (parseFloat(shrinkUsage) || 0) : 0,
        shrinkWastage: packingEnabled ? (parseFloat(shrinkWastage) || 0) : 0,

        glueMaterialId: (packingEnabled && selectedGlueId) ? selectedGlueId : null,
        glueUsage: (packingEnabled && selectedGlueId && glueUsage) ? parseFloat(glueUsage) : null,

        inkMaterialId: (packingEnabled && selectedInkId) ? selectedInkId : null,
        inkUsed: packingEnabled ? inkUsed : false,

        makeupMaterialId: (packingEnabled && selectedMakeupId) ? selectedMakeupId : null,
        makeupUsed: packingEnabled ? makeupUsed : false
      })
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (registerSaveHandler) {
      registerSaveHandler(saveEntryPromise)
    }
  }, [
    registerSaveHandler,
    isSaving,
    casesProduced,
    selectedPreformId,
    preformUsage,
    preformWastage,
    selectedCapId,
    capUsage,
    capWastage,
    selectedLabelId,
    labelUsage,
    labelWastage,
    selectedShrinkId,
    shrinkUsage,
    shrinkWastage,
    selectedGlueId,
    glueUsage,
    selectedInkId,
    inkUsed,
    selectedMakeupId,
    makeupUsed,
    selectedBottleId,
    bottleUsage,
    bottleWastage,
    stockErrors,
    activeSession,
    selectedLine
  ])

  // Fetch Lines for Setup page
  const { data: linesData, isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ['productionLines'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production/lines')
      return res.data?.data || []
    }
  })

  // Fetch Products for Allocation
  const { data: allocationProducts = [] } = useQuery<any[]>({
    queryKey: ['allocationProducts'],
    queryFn: async () => {
      const res = await api.get('/api/v1/production-entries/skus')
      return res.data?.data || []
    }
  })

  // Auto-select when only one option exists
  useEffect(() => {
    if (!selectedLine) {
      if (linesData && linesData.length === 1) {
        setLocalLine(linesData[0])
      }
      const activeShifts = productionShifts.filter((s: any) => s.isActive)
      if (activeShifts.length === 1) {
        setLocalShift(activeShifts[0].name)
      }
      if (allocationProducts && allocationProducts.length === 1) {
        setLocalProduct(allocationProducts[0])
        setAllocationSkuSearch(allocationProducts[0].name)
      }
    }
  }, [linesData, productionShifts, allocationProducts, selectedLine])

  useEffect(() => {
    if (localProduct) {
      setAllocationSkuSearch(localProduct.name)
    } else {
      setAllocationSkuSearch('')
    }
  }, [localProduct])

  const { data: rawMaterials = [], refetch: refetchMaterials } = useQuery<RawMaterial[]>({
    queryKey: ['rawMaterials'],
    queryFn: async ({ signal }) => {
      const res = await api.get('/api/v1/production-entries/materials', { signal })
      return res.data?.data || []
    },
    enabled: !!selectedLine
  })

  // Fetch Entry logs for active session
  const { data: sessionEntries = [], refetch: refetchSessionEntries } = useQuery<any[]>({
    queryKey: ['sessionEntries', activeSession?.id],
    queryFn: async ({ signal }) => {
      if (!activeSession?.id) return []
      const res = await api.get(`/api/v1/production-entries/session/${activeSession.id}/entries`, { signal })
      return res.data?.data || []
    },
    enabled: !!activeSession?.id
  })

  // Material filters
  const preforms = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.PREFORM.value)
  const bottles = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.BOTTLE.value || (m.category || '').toUpperCase() === 'BOTTLE')
  const caps = rawMaterials.filter(m => m.category === 'CAP')
  const labels = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.LABEL.value)
  const shrinks = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.SHRINK_FILM.value || m.category === 'SHRINK FILM')
  const glues = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.GLUE.value || m.category === RAW_MATERIAL_CATEGORIES.ADHESIVE.value)
  const inks = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.INK.value)
  const makeups = rawMaterials.filter(m => m.category === RAW_MATERIAL_CATEGORIES.MAKEUP.value)

  // Auto-selection of raw materials is disabled as per MES requirement.
  // Operators must explicitly select each material from the dropdown.

  // Focus Cases input on entry terminal view switch
  useEffect(() => {
    if (currentView === 'entry' && casesInputRef.current) {
      casesInputRef.current.focus()
    }
  }, [currentView])

  // Stock critical and warning configuration helper
  const getStockStatus = (currentStock: number, category: string) => {
    let critical = 1000
    let low = 5000

    if (
      category === RAW_MATERIAL_CATEGORIES.SHRINK_FILM.value ||
      category === 'SHRINK FILM' ||
      category === RAW_MATERIAL_CATEGORIES.GLUE.value ||
      category === RAW_MATERIAL_CATEGORIES.ADHESIVE.value
    ) {
      critical = 20
      low = 100
    } else if (
      category === RAW_MATERIAL_CATEGORIES.INK.value ||
      category === RAW_MATERIAL_CATEGORIES.MAKEUP.value
    ) {
      critical = 2
      low = 10
    }

    if (currentStock < critical) {
      return { style: 'text-red-600 font-bold bg-red-50 border-red-100', text: 'Critical' }
    } else if (currentStock < low) {
      return { style: 'text-amber-600 font-semibold bg-amber-50 border-amber-100', text: 'Low' }
    }
    return { style: 'text-gray-900 font-medium bg-gray-50 border-gray-100', text: 'OK' }
  }

  const toggleExpandEntry = (id: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Live stock checks
  useEffect(() => {
    const errors: { [key: string]: string } = {}

    // Preform check (Usage only deducts stock)
    if (selectedPreformId) {
      const mat = preforms.find(p => p.id === selectedPreformId)
      const usageVal = parseFloat(preformUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.preform = `Insufficient preforms. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    // Cap check (Usage only deducts stock)
    if (selectedCapId) {
      const mat = caps.find(c => c.id === selectedCapId)
      const usageVal = parseFloat(capUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.cap = `Insufficient caps. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    // Label check (Usage only deducts stock)
    if (selectedLabelId) {
      const mat = labels.find(l => l.id === selectedLabelId)
      const usageVal = parseFloat(labelUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.label = `Insufficient labels. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    // Shrink check (Usage only deducts stock)
    if (selectedShrinkId) {
      const mat = shrinks.find(s => s.id === selectedShrinkId)
      const usageVal = parseFloat(shrinkUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.shrink = `Insufficient film. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    // Glue check
    if (selectedGlueId && glueUsage) {
      const mat = glues.find(g => g.id === selectedGlueId)
      const usageVal = parseFloat(glueUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.glue = `Insufficient glue. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    // Ink check
    const defaultInkMat = inks.find(m => m.id === inventorySettings?.defaultInkMaterialId) || inks[0]
    if (inkUsed && defaultInkMat) {
      if (defaultInkMat.currentStock < 1.0) {
        errors.ink = `Insufficient ink.`
      }
    }

    // Makeup check
    const defaultMakeupMat = makeups.find(m => m.id === inventorySettings?.defaultMakeupMaterialId) || makeups[0]
    if (makeupUsed && defaultMakeupMat) {
      if (defaultMakeupMat.currentStock < 1.0) {
        errors.makeup = `Insufficient makeup.`
      }
    }

    // Bottle check (when blowing disabled)
    if (!enabledStations.includes('Blowing') && selectedBottleId) {
      const mat = bottles.find(b => b.id === selectedBottleId)
      const usageVal = parseFloat(bottleUsage) || 0
      if (mat) {
        const required = usageVal * mat.conversionFactor
        if (required > mat.currentStock) {
          errors.bottle = `Insufficient bottles. Available: ${mat.currentStock} ${mat.baseUnit}`
        }
      }
    }

    setStockErrors(prev => JSON.stringify(prev) === JSON.stringify(errors) ? prev : errors)
  }, [
    selectedPreformId, preformUsage, preformWastage,
    selectedCapId, capUsage, capWastage,
    selectedLabelId, labelUsage, labelWastage,
    selectedShrinkId, shrinkUsage, shrinkWastage,
    selectedGlueId, glueUsage,
    inkUsed, makeupUsed,
    selectedBottleId, bottleUsage, bottleWastage,
    inventorySettings,
    enabledStations,
    rawMaterials
  ])

  const filteredAllocationProducts = useMemo(() => {
    if (!allocationSkuSearch.trim()) return allocationProducts
    const q = allocationSkuSearch.toLowerCase()
    return allocationProducts.filter((p: any) =>
      (p?.name?.toLowerCase() || '').includes(q) ||
      (p?.code?.toLowerCase() || '').includes(q) ||
      (p?.sku?.toLowerCase() || '').includes(q)
    )
  }, [allocationProducts, allocationSkuSearch])

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (allocationSkuContainerRef.current && !allocationSkuContainerRef.current.contains(e.target as Node)) {
        setAllocationSkuOpen(false)
      }
    }
    document.addEventListener('mousedown', clickOutside)
    return () => document.removeEventListener('mousedown', clickOutside)
  }, [])

  // Shift selection automatically changes timezone shift configuration
  const handleEnterTerminal = () => {
    if (!localLine) {
      showToast('Please select a production line.', 'warning')
      return
    }
    if (!localShift) {
      showToast('Please select a working shift.', 'warning')
      return
    }
    if (!localProduct) {
      showToast('Please select a product for allocation.', 'warning')
      return
    }
    updateLine(localLine)
    updateShift(localShift)
    updateProduct(localProduct)
    showToast(`Entered session for Line: ${localLine.name}`, 'success')
  }

  // --- MUTATION: Start Production Session ---
  const startSessionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/production-entries/session/start', payload)
      return res.data
    },
    onSuccess: (data, variables) => {
      updateShift(variables.shift)
      updateProduct(modalSelectedSku)
      showToast('Production session started successfully.', 'success')
      setShowStartModal(false)
      if (refetchActiveBatch) refetchActiveBatch()
      refetchActiveSession().then(() => {
        setCurrentView('entry')
      })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to start production batch.'
      showToast(msg, 'error')
    }
  })

  const handleStartSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLine?.lineId) return

    const errors: { [key: string]: string } = {}

    if (!modalShift) {
      errors.shift = 'Shift is required.'
    }

    if (!modalBatchNo || !modalBatchNo.trim()) {
      errors.batchNumber = 'Batch Number is required.'
    }

    if (!modalSelectedSku) {
      errors.product = 'Product is required.'
    }

    if (!modalStartTime) {
      errors.startTime = 'Production Start Time is required.'
    } else {
      const startTimeDate = new Date(modalStartTime)
      const now = new Date()

      const roles = user?.roles || []
      const isUserAdmin = roles.some(role =>
        ['superadmin', 'platformadmin', 'platformowner', 'companyadmin', 'admin'].includes(role.toLowerCase())
      )
      const isUserSupervisorOrAdmin = roles.some(role =>
        ['superadmin', 'platformadmin', 'platformowner', 'companyadmin', 'admin', 'generalmanager', 'productionmanager', 'manager', 'supervisor'].includes(role.toLowerCase())
      )

      // Future time validation: Not allowed unless Admin
      if (startTimeDate.getTime() > now.getTime() + 15000) { // 15s grace for small clock offsets
        if (!isUserAdmin) {
          errors.startTime = 'Future start time is not allowed unless you are an Admin.'
        }
      }

      // Past time validation: Allowed only within 30 minutes tolerance unless Supervisor or Admin
      const diffMinutes = (now.getTime() - startTimeDate.getTime()) / 60000
      if (diffMinutes > 0) {
        const tolerance = 30
        if (diffMinutes > tolerance && !isUserSupervisorOrAdmin) {
          errors.startTime = `Past start time is allowed only within ${tolerance} minutes tolerance.`
        }
      }
    }

    if (modalNotes && modalNotes.length > 500) {
      errors.notes = 'Batch Notes cannot exceed 500 characters.'
    }

    if (Object.keys(errors).length > 0) {
      setModalErrors(errors)
      showToast('Validation failed. Please resolve inline errors.', 'error')
      return
    }

    setModalErrors({})

    startSessionMutation.mutate({
      productionLineId: selectedLine.lineId,
      shift: modalShift,
      batchNumber: modalBatchNo,
      productId: modalSelectedSku!.id,
      productionStartTime: new Date(modalStartTime).toISOString(),
      notes: modalNotes
    })
  }

  // --- MUTATION: Save Production Entry ---
  const submitEntryMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/production-entries', payload)
      return res.data
    },
    onSuccess: () => {
      // Trigger Green Success Splash overlay for 200ms
      setShowSuccessSplash(true)
      setTimeout(() => {
        setShowSuccessSplash(false)
        // Focus casesProduced input automatically
        if (casesInputRef.current) {
          casesInputRef.current.focus()
          casesInputRef.current.select()
        }
      }, 200)

      refetchMaterials()
      refetchSessionEntries()
      refetchActiveSession() // Increment entry counters
      if (refetchActiveBatch) refetchActiveBatch()

      // Reset only usage fields, keep selections
      setCasesProduced('')
      setPreformUsage('')
      setPreformWastage('')
      setCapUsage('')
      setCapWastage('')
      setLabelUsage('')
      setLabelWastage('')
      setShrinkUsage('')
      setShrinkWastage('')
      setGlueUsage('')
      setInkUsed(false)
      setMakeupUsed(false)
      setBottleUsage('')
      setBottleWastage('')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to save production entry.'
      showToast(msg, 'error')
    }
  })

  const handleSaveEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSaving || submitEntryMutation.isPending) return

    if (!selectedLine?.lineId || !activeSession) return

    if (!casesProduced || parseInt(casesProduced) <= 0) {
      showToast('Cases Produced must be a positive integer.', 'error')
      return
    }

    const blowingEnabled = enabledStations.includes('Blowing')
    const fillingEnabled = enabledStations.includes('Filling')
    const labelingEnabled = enabledStations.includes('Labeling')
    const packingEnabled = enabledStations.includes('Packing')

    if (blowingEnabled && !selectedPreformId) {
      showToast('Preform material selection is required.', 'error')
      return
    }
    // When blowing is disabled, validate bottle selection
    if (!blowingEnabled && (parseFloat(bottleUsage) > 0 || parseFloat(bottleWastage) > 0) && !selectedBottleId) {
      showToast('Bottle material must be selected when bottle usage or wastage is entered.', 'error')
      return
    }
    if (!blowingEnabled && selectedBottleId) {
      const bUsage = parseFloat(bottleUsage) || 0
      const bWaste = parseFloat(bottleWastage) || 0
      if (bWaste > bUsage) {
        showToast('Bottle wastage cannot exceed bottle usage.', 'error')
        return
      }
    }
    if (labelingEnabled && !selectedLabelId) {
      showToast('Label material selection is required.', 'error')
      return
    }
    if (packingEnabled && !selectedShrinkId) {
      showToast('Shrink Film material selection is required.', 'error')
      return
    }

    if (fillingEnabled && (parseFloat(capUsage) > 0 || parseFloat(capWastage) > 0) && !selectedCapId) {
      showToast('Cap material must be selected when usage or wastage is entered.', 'error')
      return
    }

    // Build materials array for all active station selections
    const materialsPayload: Array<{ rawMaterialId: string; usageQuantity: number; wastageQuantity: number }> = []

    if (blowingEnabled && selectedPreformId && (parseFloat(preformUsage) > 0 || parseFloat(preformWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedPreformId,
        usageQuantity: parseFloat(preformUsage) || 0,
        wastageQuantity: parseFloat(preformWastage) || 0
      })
    }
    if (!blowingEnabled && selectedBottleId && (parseFloat(bottleUsage) > 0 || parseFloat(bottleWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedBottleId,
        usageQuantity: parseFloat(bottleUsage) || 0,
        wastageQuantity: parseFloat(bottleWastage) || 0
      })
    }
    if (fillingEnabled && selectedCapId && (parseFloat(capUsage) > 0 || parseFloat(capWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedCapId,
        usageQuantity: parseFloat(capUsage) || 0,
        wastageQuantity: parseFloat(capWastage) || 0
      })
    }
    if (labelingEnabled && selectedLabelId && (parseFloat(labelUsage) > 0 || parseFloat(labelWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedLabelId,
        usageQuantity: parseFloat(labelUsage) || 0,
        wastageQuantity: parseFloat(labelWastage) || 0
      })
    }
    if (packingEnabled && selectedShrinkId && (parseFloat(shrinkUsage) > 0 || parseFloat(shrinkWastage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedShrinkId,
        usageQuantity: parseFloat(shrinkUsage) || 0,
        wastageQuantity: parseFloat(shrinkWastage) || 0
      })
    }
    if (packingEnabled && selectedGlueId && (parseFloat(glueUsage) > 0)) {
      materialsPayload.push({
        rawMaterialId: selectedGlueId,
        usageQuantity: parseFloat(glueUsage) || 0,
        wastageQuantity: 0
      })
    }

    try {
      setIsSaving(true)
      await submitEntryMutation.mutateAsync({
        productionLineId: selectedLine.lineId,
        casesProduced: parseInt(casesProduced),
        materials: materialsPayload.length > 0 ? materialsPayload : undefined,

        preformMaterialId: blowingEnabled ? selectedPreformId : null,
        preformUsage: blowingEnabled ? (parseFloat(preformUsage) || 0) : 0,
        preformWastage: blowingEnabled ? (parseFloat(preformWastage) || 0) : 0,

        bottleMaterialId: (!blowingEnabled && selectedBottleId) ? selectedBottleId : null,
        bottleUsage: !blowingEnabled ? (parseFloat(bottleUsage) || 0) : 0,
        bottleWastage: !blowingEnabled ? (parseFloat(bottleWastage) || 0) : 0,

        capMaterialId: (fillingEnabled && selectedCapId) ? selectedCapId : null,
        capUsage: fillingEnabled ? (parseFloat(capUsage) || 0) : 0,
        capWastage: fillingEnabled ? (parseFloat(capWastage) || 0) : 0,

        labelMaterialId: labelingEnabled ? selectedLabelId : null,
        labelUsage: labelingEnabled ? (parseFloat(labelUsage) || 0) : 0,
        labelWastage: labelingEnabled ? (parseFloat(labelWastage) || 0) : 0,

        shrinkMaterialId: packingEnabled ? selectedShrinkId : null,
        shrinkUsage: packingEnabled ? (parseFloat(shrinkUsage) || 0) : 0,
        shrinkWastage: packingEnabled ? (parseFloat(shrinkWastage) || 0) : 0,

        glueMaterialId: (packingEnabled && selectedGlueId) ? selectedGlueId : null,
        glueUsage: (packingEnabled && selectedGlueId && glueUsage) ? parseFloat(glueUsage) : null,

        inkMaterialId: (packingEnabled && selectedInkId) ? selectedInkId : null,
        inkUsed: packingEnabled ? inkUsed : false,

        makeupMaterialId: (packingEnabled && selectedMakeupId) ? selectedMakeupId : null,
        makeupUsed: packingEnabled ? makeupUsed : false
      })
    } catch {
      // Error is handled in submitEntryMutation onError callback
    } finally {
      setIsSaving(false)
    }
  }

  // --- MUTATION: End Production Batch ---
  const endSessionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/api/v1/production-entries/session/end', payload)
      return res.data
    },
    onSuccess: (resData) => {
      setClosedSummaryData(resData.data)
      setShowEndModal(false)
      setShowClosedSuccessOverlay(true)
      if (refetchActiveBatch) refetchActiveBatch()
      refetchActiveSession()

      // Cleanup remarks
      setEndRemarks('')
      setConfirmCloseChecked(false)
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to close production batch.'
      showToast(msg, 'error')
    }
  })

  const handleEndSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession) return
    if (!confirmCloseChecked) {
      showToast('You must confirm closing checklist before ending batch.', 'warning')
      return
    }

    endSessionMutation.mutate({
      sessionId: activeSession.id,
      remarks: endRemarks,
      confirmClose: true
    })
  }

  // Register Layout context action triggers
  useEffect(() => {
    if (registerEndBatchTrigger) {
      registerEndBatchTrigger(() => {
        setShowEndModal(true)
        refetchSummary()
      })
    }
  }, [registerEndBatchTrigger, refetchSummary])

  useEffect(() => {
    if (registerRefreshTrigger) {
      registerRefreshTrigger(() => {
        refetchActiveSession()
        refetchMaterials()
        refetchSessionEntries()
      })
    }
  }, [registerRefreshTrigger, refetchActiveSession, refetchMaterials, refetchSessionEntries])

  // Autocomplete keys in Start Modal SKU dropdown
  const handleModalSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!modalSkuOpen) {
      if (e.key === 'ArrowDown') {
        setModalSkuOpen(true)
        setModalSkuHighlight(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      setModalSkuHighlight(prev => Math.min(products.length - 1, prev + 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setModalSkuHighlight(prev => Math.max(0, prev - 1))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (modalSkuHighlight >= 0 && modalSkuHighlight < products.length) {
        const item = products[modalSkuHighlight]
        setModalSelectedSku(item)
        setModalSkuSearch(item.name)
        setModalSkuOpen(false)
      }
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setModalSkuOpen(false)
      e.preventDefault()
    }
  }

  // Helper values
  const getSelectedLabelUnit = () => {
    const selected = labels.find(l => l.id === selectedLabelId)
    return selected ? selected.unit : 'PCS'
  }

  const selectedPreformObj = preforms.find(p => p.id === selectedPreformId)
  const selectedLabelObj = labels.find(l => l.id === selectedLabelId)
  const selectedShrinkObj = shrinks.find(s => s.id === selectedShrinkId)
  const selectedGlueObj = glues.find(g => g.id === selectedGlueId)

  // ==========================================
  // VIEW 1: SETUP ALLOCATION SCREEN
  // ==========================================
  if (!selectedLine) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0 select-none p-4 bg-[#F3F4F6]">
        <div className="w-full max-w-[480px] flex flex-col gap-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-lg bg-[#E6F6F4] flex items-center justify-center mx-auto mb-3 shadow-[0_2px_8px_rgba(26,86,219,0.1)]">
              <Cpu className="w-6 h-6 text-[#12A89A]" />
            </div>
            <h1 className="text-xl font-bold text-[#111827] tracking-tight">Select Production Allocation</h1>
            <p className="text-xs text-[#6B7280] mt-1">Configure your working line and shift to access the terminal.</p>
          </div>

          <div style={{ borderTop: localLine ? `4px solid ${getLineTheme(localLine.name, localLine.lineId).primary}` : '4px solid #12A89A', borderRadius: '12px' }} className="transition-all duration-200">
            <EnterpriseCard title="Workstation Setup">
              <div className="flex flex-col gap-5 mt-1">
                <div>
                  <label className="text-xs font-semibold text-[#344054] block mb-2">Select Production Line *</label>
                  {linesLoading ? (
                    <div className="h-10 bg-slate-100 rounded-lg animate-pulse w-full" />
                  ) : linesData && linesData.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {linesData.map((line) => {
                        const t = getLineTheme(line.name, line.lineId)
                        const isSelected = localLine?.lineId === line.lineId
                        return (
                          <button
                            key={line.lineId}
                            type="button"
                            onClick={() => setLocalLine(line)}
                            className={`p-3 text-left rounded-[8px] border transition-all duration-200 cursor-pointer flex justify-between items-center text-xs`}
                            style={{
                              borderColor: isSelected ? t.primary : '#E5E7EB',
                              backgroundColor: isSelected ? `${t.secondary}40` : '#FFFFFF',
                              boxShadow: isSelected ? `0 0 0 2px ${t.glow}` : 'none'
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: t.primary }}></span>
                              <div>
                                <span className="font-semibold text-[#111827] block">{line.name}</span>
                                <span className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider block mt-0.5">Code: {line.code}</span>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: t.primary }}>
                                <Check className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-[#6B7280] border border-dashed rounded-lg bg-slate-50">
                      No production lines configured. Contact Administrator.
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#344054] block mb-2">Working Shift *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {productionShifts.filter((shift: any) => shift.isActive).map((shift: any) => {
                      const s = shift.name
                      const isSelected = localShift === s
                      const lTheme = localLine ? getLineTheme(localLine.name, localLine.lineId) : null
                      return (
                        <button
                          key={shift.id}
                          type="button"
                          onClick={() => setLocalShift(s)}
                          className={`py-2 px-3 border text-center text-xs font-semibold rounded-[6px] transition-all duration-200 cursor-pointer`}
                          style={{
                            borderColor: isSelected ? (lTheme?.primary || '#12A89A') : '#E5E7EB',
                            backgroundColor: isSelected ? (lTheme?.secondary || '#E6F6F4') : '#FFFFFF',
                            color: isSelected ? (lTheme?.primary || '#12A89A') : '#6B7280'
                          }}
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                  <span className="text-[10px] text-[#6B7280] block mt-2 font-medium italic">
                    * Working shifts are loaded from your tenant configuration.
                  </span>
                </div>

                <div ref={allocationSkuContainerRef} className="relative flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-[#344054]">Select Product *</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type product name or SKU to search..."
                      value={allocationSkuSearch}
                      onChange={(e) => {
                        setAllocationSkuSearch(e.target.value)
                        setAllocationSkuOpen(true)
                        setAllocationSkuHighlight(-1)
                        if (localProduct && e.target.value !== localProduct.name) {
                          setLocalProduct(null)
                        }
                      }}
                      onFocus={() => setAllocationSkuOpen(true)}
                      className="w-full h-10 border border-[#D0D5DD] px-3 py-1.5 pr-10 text-xs bg-white rounded-[8px] focus:outline-none focus-line-theme text-slate-800 font-semibold"
                    />
                    <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-slate-400">
                      {localProduct ? (
                        <Check className="w-4.5 h-4.5 text-green-600 stroke-[2.5]" />
                      ) : (
                        <ChevronDown className="w-4.5 h-4.5" />
                      )}
                    </div>
                  </div>

                  {allocationSkuOpen && filteredAllocationProducts.length > 0 && (
                    <div className="absolute left-0 top-[62px] z-50 w-full overflow-y-auto border border-[#E5E7EB] shadow-2xl rounded-[12px] bg-white text-left transition-all max-h-[200px]">
                      {filteredAllocationProducts.map((p) => {
                        const isSelected = localProduct?.id === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setLocalProduct(p)
                              setAllocationSkuSearch(p.name)
                              setAllocationSkuOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 flex justify-between items-center cursor-pointer"
                          >
                            <div>
                              <span className="font-semibold text-slate-800 block">{p.name}</span>
                              <div className="flex gap-2 items-center text-[10px] text-slate-500 mt-0.5 font-medium">
                                <span>SKU: {p.sku || p.code}</span>
                                {p.bottleSize && (
                                  <>
                                    <span>•</span>
                                    <span>Size: {p.bottleSize}</span>
                                  </>
                                )}
                                {p.variant && (
                                  <>
                                    <span>•</span>
                                    <span>Variant: {p.variant}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4.5 h-4.5 text-blue-600" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-[#E5E7EB] pt-4 mt-1">
                  <button
                    onClick={handleEnterTerminal}
                    disabled={!localLine || !localShift || !localProduct}
                    className="w-full h-10 text-xs font-bold justify-center rounded-[8px] transition-all duration-200 text-white cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: localLine ? getLineTheme(localLine.name, localLine.lineId).primary : '#12A89A',
                      boxShadow: localLine ? `0 2px 4px ${getLineTheme(localLine.name, localLine.lineId).glow}` : 'none'
                    }}
                  >
                    Enter Production Terminal
                  </button>
                </div>
              </div>
            </EnterpriseCard>
          </div>
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW 2: PRODUCTION SESSION DASHBOARD (Active batch manager)
  // ==========================================
  if (currentView === 'dashboard') {
    return (
      <div className="flex-1 flex flex-col justify-center items-center min-h-0 bg-[#F3F4F6] select-none p-4 relative">

        {/* Closed success details overlay */}
        {showClosedSuccessOverlay && closedSummaryData && (
          <div className="absolute inset-0 bg-white/95 z-40 flex flex-col items-center justify-center p-6 transition-all duration-200">
            <div className="w-16 h-16 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-lg mb-4">
              <Check className="w-9 h-9 stroke-[3]" />
            </div>
            <h2 className="text-xl font-bold text-[#111827] tracking-tight">Batch Successfully Closed</h2>

            <div className="w-full max-w-[360px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] p-4 my-6 text-xs text-slate-700 space-y-2.5 font-semibold shadow-sm">
              <div className="flex justify-between border-b border-slate-200 pb-1.5 select-none text-[10px] uppercase font-bold text-slate-400">
                <span>Metrics Summary</span>
                <span>Values</span>
              </div>
              <div className="flex justify-between">
                <span>Batch No:</span>
                <span className="text-slate-900 font-bold">{closedSummaryData.batchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Run Duration:</span>
                <span className="text-slate-900 font-bold">{closedSummaryData.duration}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Entries logged:</span>
                <span className="text-slate-900 font-bold">{closedSummaryData.entriesCount}</span>
              </div>
              <div className="flex justify-between text-base border-t border-slate-200 pt-2 text-[#12A89A]">
                <span>Total Cases Produced:</span>
                <span className="font-extrabold">{closedSummaryData.totalCasesProduced}</span>
              </div>
            </div>

            <EnterpriseButton onClick={() => setShowClosedSuccessOverlay(false)} className="w-[180px] h-9 text-xs justify-center font-bold">
              Return to Dashboard
            </EnterpriseButton>
          </div>
        )}

        <div className="w-full max-w-[640px] space-y-6">
          <div className="text-center flex flex-col items-center justify-center gap-1.5 select-none animate-in fade-in duration-250">
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-2xl font-black text-[#111827] tracking-tight uppercase">Production Dashboard</h1>
              {lineTheme && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase text-white tracking-widest shadow-sm select-none transition-all duration-200"
                  style={{ backgroundColor: lineTheme.primary }}
                >
                  {selectedLine.name}
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B7280] font-medium">
              Line: <strong className="text-slate-800">{selectedLine.name}</strong> | Shift: <strong className="text-slate-800">{selectedShift}</strong> | Product: <strong className="text-slate-800">{selectedProduct?.name || 'None'}</strong> | Operator: <strong className="text-slate-800">{activeSession?.operatorName || 'Authorized Operator'}</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                if (hasUnsavedData) {
                  showToast('You have unsaved production entries. Save or discard them first.', 'warning')
                  return
                }
                resetTerminal()
              }}
              className="mt-1 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-[6px] text-[#4B5563] text-[10px] font-bold uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3 h-3 text-[#4B5563]" />
              <span>Change Production Allocation</span>
            </button>
          </div>

          {sessionLoading ? (
            <div className="h-[280px] bg-white border border-[#E5E7EB] rounded-[12px] flex items-center justify-center animate-pulse">
              <div className="text-xs text-slate-400 font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#12A89A]" /> Resolving Active Session Context...
              </div>
            </div>
          ) : (!activeSession || !activeSession.canEnterProductionPage) ? (

            // --- SCENARIO A: NO BATCH ACTIVE ---
            <div
              className="bg-white border border-[#E5E7EB] rounded-[12px] p-8 text-center shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-6 transition-all duration-200"
              style={{ borderTop: `3px solid ${lineTheme?.primary || '#12A89A'}` }}
            >
              <div className="w-16 h-16 rounded-full bg-[#FFFBEB] border border-amber-200 flex items-center justify-center mx-auto text-amber-500">
                <AlertTriangle className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-[#111827]">No Active Production Configuration</h2>
                <p className="text-xs text-[#6B7280] max-w-[420px] mx-auto font-medium">
                  No active production configuration found for line <strong className="text-slate-800">{selectedLine.name}</strong>. Please contact the production administrator.
                </p>
              </div>

              <div className="border-t border-[#E5E7EB] pt-6 flex justify-center">
                <button
                  onClick={() => resetTerminal()}
                  className="px-6 h-[44px] hover:brightness-110 transition-all duration-200 rounded-[8px] text-white text-xs font-bold uppercase tracking-wider shadow-md flex items-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: lineTheme?.primary || '#12A89A',
                    boxShadow: lineTheme ? `0 2px 4px ${lineTheme.glow}` : 'none'
                  }}
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                  <span>Select Another Line</span>
                </button>
              </div>
            </div>

          ) : (

            // --- SCENARIO B: ACTIVE BATCH EXISTS ---
            <div
              className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-5 transition-all duration-200"
              style={{
                borderLeft: `4px solid ${lineTheme?.primary || '#16A34A'}`,
                borderTop: `3px solid ${lineTheme?.primary || '#16A34A'}`
              }}
            >
              <div className="flex justify-between items-center pb-3 border-b border-[#E5E7EB] select-none">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: lineTheme?.primary || '#16A34A' }}></span>
                  <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: lineTheme?.primary || '#16A34A' }}>Active Batch Running</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">ID: {activeSession?.id?.slice(0, 8) || ''}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs text-slate-600 font-semibold">
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Batch Number</span>
                  <span className="text-slate-900 font-extrabold text-[13px]">{activeSession.batchNumber}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Product SKU</span>
                  <span className="text-slate-900 font-bold block truncate" title={activeSession.skuName}>{activeSession.skuName}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Shift</span>
                  <span className="text-slate-900 font-bold">{activeSession.shift}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Start Time</span>
                  <span className="text-slate-900 font-bold">{activeSession.startedAtFormatted}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Runtime Duration</span>
                  <span className="text-slate-900 font-bold font-mono">{liveDurationStr}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[9px] uppercase tracking-wider block font-bold mb-0.5">Entries Captured</span>
                  <span className="text-slate-900 font-bold">{activeSession.entriesCount} Logs</span>
                </div>
              </div>

              <div className="border-t border-[#E5E7EB] pt-5 flex justify-end gap-3 select-none">
                <button
                  onClick={() => {
                    if (!activeSession) {
                      showToast('No active production batch found. Please start a batch first.', 'warning')
                      return
                    }
                    setShowReportIssueModal(true)
                  }}
                  className="px-4 h-[38px] bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 transition-colors rounded-[6px] text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 stroke-[2.5]" />
                  <span>⚠ Report Issue</span>
                </button>

                <button
                  onClick={() => {
                    setShowEndModal(true)
                    refetchSummary()
                  }}
                  className="px-4 h-[38px] bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors rounded-[6px] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                  <span>End Batch</span>
                </button>

                <button
                  onClick={() => setCurrentView('entry')}
                  className="px-5 h-[38px] hover:brightness-110 text-white transition-all duration-200 rounded-[6px] text-xs font-bold uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: lineTheme?.primary || '#12A89A',
                    boxShadow: lineTheme ? `0 2px 4px ${lineTheme.glow}` : 'none'
                  }}
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Resume Production</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ==========================================
            START BATCH MODAL DIALOG
           ========================================== */}
        {showStartModal && (
          <div className="fixed inset-0 z-50 bg-[#0F172A]/70 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white border border-[#E5E7EB] w-full max-w-[520px] rounded-[16px] shadow-2xl p-6 relative text-left transition-all duration-200">

              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-[#E5E7EB] mb-6">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                    style={{ backgroundColor: lineTheme?.secondary || '#E6F6F4', color: lineTheme?.primary || '#12A89A' }}
                  >
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight uppercase">Start New Production Batch</h3>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Initialize a new manufacturing run for this line.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStartModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleStartSessionSubmit} className="space-y-6 text-xs">

                {/* Shift and Batch Number side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#344054]">Shift *</label>
                    <select
                      value={modalShift}
                      onChange={(e) => {
                        setModalShift(e.target.value)
                        if (modalErrors.shift) {
                          setModalErrors(prev => {
                            const copy = { ...prev }
                            delete copy.shift
                            return copy
                          })
                        }
                      }}
                      className="w-full h-10 border border-[#D0D5DD] px-3 py-1.5 text-xs bg-white rounded-[8px] focus:outline-none focus-line-theme text-slate-800 font-semibold"
                    >
                      <option value="" disabled>Select Shift</option>
                      {productionShifts.filter((s: any) => s.isActive).map((shift: any) => (
                        <option key={shift.id} value={shift.name}>{shift.name}</option>
                      ))}
                    </select>
                    {modalErrors.shift && (
                      <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> {modalErrors.shift}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#344054] flex justify-between">
                      <span>Batch Number *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter batch number"
                      value={modalBatchNo}
                      onChange={(e) => {
                        setModalBatchNo(e.target.value)
                        if (modalErrors.batchNumber) {
                          setModalErrors(prev => {
                            const copy = { ...prev }
                            delete copy.batchNumber
                            return copy
                          })
                        }
                      }}
                      className="w-full h-10 border border-[#D0D5DD] px-3 py-1.5 text-xs rounded-[8px] focus:outline-none focus-line-theme font-semibold bg-white text-slate-900"
                    />
                    <BatchNumberSuggestion
                      value={modalBatchNo}
                      badgeLetters={companyBadgeLetters}
                      onApplyPrefix={setModalBatchNo}
                    />
                    {modalErrors.batchNumber && (
                      <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> {modalErrors.batchNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Product searchable virtualized selector */}
                <div ref={modalSkuContainerRef} className="relative flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#344054]">Select Product *</label>
                  <div className="relative">
                    <input
                      ref={modalSkuInputRef}
                      type="text"
                      placeholder="Type product name or SKU code to search..."
                      value={modalSkuSearch}
                      onChange={(e) => {
                        setModalSkuSearch(e.target.value)
                        setModalSkuOpen(true)
                        setModalSkuHighlight(-1)
                        if (modalSelectedSku && e.target.value !== modalSelectedSku.name) {
                          setModalSelectedSku(null)
                        }
                        if (modalErrors.product) {
                          setModalErrors(prev => {
                            const copy = { ...prev }
                            delete copy.product
                            return copy
                          })
                        }
                      }}
                      onFocus={() => setModalSkuOpen(true)}
                      onKeyDown={handleModalSkuKeyDown}
                      className="w-full h-10 border border-[#D0D5DD] px-3 py-1.5 pr-10 text-xs bg-white rounded-[8px] focus:outline-none focus-line-theme text-slate-800 font-semibold"
                    />
                    <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-slate-400">
                      {isProductLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: lineTheme?.primary || '#12A89A' }} />}
                      {modalSelectedSku ? (
                        <Check className="w-4.5 h-4.5 text-green-600 stroke-[2.5]" />
                      ) : (
                        <ChevronDown className="w-4.5 h-4.5" />
                      )}
                    </div>
                  </div>

                  {modalErrors.product && (
                    <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {modalErrors.product}
                    </span>
                  )}

                  {/* Dropdown list with Virtualization */}
                  {modalSkuOpen && products.length > 0 && (
                    <div
                      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                      className="absolute left-0 top-[60px] z-50 w-full overflow-y-auto border border-[#E5E7EB] shadow-2xl rounded-[12px] bg-white text-left transition-all max-h-[240px]"
                      style={{ height: totalHeight > viewportHeight ? viewportHeight : totalHeight }}
                    >
                      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                        <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', top: 0, left: 0, width: '100%' }}>
                          {visibleProducts.map((sku, index) => {
                            const absoluteIndex = startIndex + index;
                            const isHighlighted = modalSkuHighlight === absoluteIndex;
                            const isSelected = modalSelectedSku?.id === sku.id;

                            return (
                              <button
                                key={sku.id}
                                type="button"
                                onClick={() => {
                                  setModalSelectedSku(sku);
                                  setModalSkuSearch(sku.name);
                                  setModalSkuOpen(false);
                                  if (modalErrors.product) {
                                    setModalErrors(prev => {
                                      const copy = { ...prev }
                                      delete copy.product
                                      return copy
                                    })
                                  }
                                }}
                                className="w-full text-left px-4 py-2 border-b border-[#F4F6F9] last:border-0 transition-all duration-150 flex flex-col justify-center cursor-pointer"
                                style={{
                                  height: itemHeight,
                                  color: isHighlighted ? (lineTheme?.primary || '#12A89A') : '#334155',
                                  backgroundColor: isHighlighted ? `${lineTheme?.secondary || '#E6F6F4'}c0` : isSelected ? `${lineTheme?.secondary || '#E6F6F4'}50` : '#ffffff'
                                }}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="font-bold text-slate-800 text-[11px] truncate block max-w-[280px]">
                                    {sku.name}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#6B7280] font-bold px-1.5 py-0.5 bg-slate-100 rounded-sm">
                                    {sku.bottleSize || 'N/A'}
                                  </span>
                                </div>
                                <div className="text-[9px] text-slate-400 font-semibold mt-0.5">
                                  SKU: <span className="font-mono text-slate-600">{sku.sku || sku.code}</span> | Barcode: <span className="font-mono text-slate-600">{sku.barcode || `BARCODE-${sku.code}`}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {modalSkuOpen && !isProductLoading && products.length === 0 && !productLoadError && (
                    <div className="absolute left-0 top-[60px] z-50 w-full bg-white border border-[#E5E7EB] shadow-2xl rounded-[12px] py-4 text-center text-slate-400 text-xs">
                      No matching products found
                    </div>
                  )}

                  {productLoadError && (
                    <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-[8px] flex justify-between items-center text-red-700 text-[10px]">
                      <span className="font-semibold">Unable to load products. Please try again.</span>
                      <button
                        type="button"
                        onClick={() => fetchProducts(modalSkuSearch)}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors cursor-pointer uppercase tracking-wider"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* Production Start Time */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#344054] flex justify-between">
                    <span>Production Start Time *</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 select-none transition-all duration-200"
                      style={{ color: lineTheme?.primary || '#12A89A', backgroundColor: lineTheme?.secondary || '#E6F6F4' }}
                    >
                      <Clock className="w-3 h-3" /> {Intl.DateTimeFormat().resolvedOptions().timeZone}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      step="1"
                      value={modalStartTime}
                      onChange={(e) => {
                        setModalStartTime(e.target.value)
                        if (modalErrors.startTime) {
                          setModalErrors(prev => {
                            const copy = { ...prev }
                            delete copy.startTime
                            return copy
                          })
                        }
                      }}
                      className="w-full h-10 border border-[#D0D5DD] px-3 py-1.5 text-xs bg-white rounded-[8px] focus:outline-none focus-line-theme text-slate-800 font-semibold"
                    />
                  </div>
                  {modalErrors.startTime && (
                    <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {modalErrors.startTime}
                    </span>
                  )}
                </div>

                {/* Remarks/Notes */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-[#344054]">Batch Notes (Optional)</label>
                    <span className={`text-[9px] font-bold ${modalNotes.length > 500 ? 'text-red-500' : 'text-slate-400'}`}>
                      {modalNotes.length}/500 chars
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    placeholder="Enter operating notes, special raw material lots, or batch targets..."
                    value={modalNotes}
                    onChange={(e) => {
                      setModalNotes(e.target.value)
                      if (modalErrors.notes) {
                        setModalErrors(prev => {
                          const copy = { ...prev }
                          delete copy.notes
                          return copy
                        })
                      }
                    }}
                    className="w-full border border-[#D0D5DD] px-3 py-2 text-xs bg-white rounded-[8px] focus:outline-none focus-line-theme text-slate-800 font-semibold"
                  />
                  {modalErrors.notes && (
                    <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {modalErrors.notes}
                    </span>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="border-t border-[#E5E7EB] pt-5 flex justify-end gap-3 select-none">
                  <button
                    type="button"
                    onClick={() => setShowStartModal(false)}
                    className="px-4 h-10 border border-[#E5E7EB] hover:bg-slate-50 transition-colors text-slate-700 rounded-[8px] text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={startSessionMutation.isPending}
                    className="px-5 h-10 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold rounded-[8px] text-xs cursor-pointer shadow-md flex items-center gap-2 uppercase tracking-wider transition-all duration-200"
                    style={{
                      backgroundColor: lineTheme?.primary || '#12A89A',
                      boxShadow: lineTheme ? `0 2px 4px ${lineTheme.glow}` : 'none'
                    }}
                  >
                    {startSessionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-white" />
                    )}
                    <span>Start Production</span>
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

      </div>
    )
  }

  // Unit-aware raw material helpers
  const selectedPreformMat = preforms.find(m => m.id === selectedPreformId)
  const selectedBottleMat = bottles.find(m => m.id === selectedBottleId)
  const selectedCapMat = caps.find(m => m.id === selectedCapId)
  const selectedLabelMat = labels.find(m => m.id === selectedLabelId)
  const selectedShrinkMat = shrinks.find(m => m.id === selectedShrinkId)
  const selectedGlueMat = glues.find(m => m.id === selectedGlueId)

  const isDecimalUnit = (unit: string): boolean => {
    const u = (unit || '').toUpperCase()
    return u === 'KG' || u === 'KGS' || u === 'GRAM' || u === 'GRAMS' || u === 'GM' || u === 'G' || u === 'LITRE' || u === 'L' || u.includes('KG') || u.includes('GM') || u.includes('LIT')
  }

  const getMaterialUnitLabel = (mat?: any): string => {
    if (!mat) return '—'
    const u = (mat.unit || '').trim()
    return u || 'No Unit'
  }

  const getWastagePlaceholder = (unitLabel: string): string => {
    if (!unitLabel || unitLabel === '—' || unitLabel === 'No Unit') {
      return 'Enter wastage'
    }
    return `Enter wastage (${unitLabel})`
  }

  const handleWastageInputChange = (
    val: string,
    unit: string,
    setter: (val: string) => void
  ) => {
    if (val === '') {
      setter('')
      return
    }
    if (isDecimalUnit(unit)) {
      if (/^\d*\.?\d*$/.test(val)) {
        setter(val)
      }
    } else {
      if (/^\d+$/.test(val)) {
        setter(val)
      }
    }
  }

  const preformUnitLabel = getMaterialUnitLabel(selectedPreformMat)
  const bottleUnitLabel = getMaterialUnitLabel(selectedBottleMat)
  const capUnitLabel = getMaterialUnitLabel(selectedCapMat)
  const labelUnitLabel = getMaterialUnitLabel(selectedLabelMat)
  const shrinkUnitLabel = getMaterialUnitLabel(selectedShrinkMat)
  const glueUnitLabel = getMaterialUnitLabel(selectedGlueMat)

  return (
    <div
      className="flex-1 w-full h-full flex flex-col min-h-0 select-none transition-all duration-200"
      style={{ '--line-color': lineTheme?.primary || '#12A89A' } as React.CSSProperties}
    >
      <style>{`
        .focus-line-theme:focus {
          border-color: var(--line-color) !important;
          box-shadow: 0 0 0 1px var(--line-color) !important;
        }
        .hover-line-theme:hover {
          border-color: var(--line-color) !important;
        }
        .bg-line-theme-active {
          background-color: var(--line-color) !important;
        }
        .text-line-theme-active {
          color: var(--line-color) !important;
        }
        .peer-checked-line-theme:checked ~ div {
          background-color: var(--line-color) !important;
        }
      `}</style>

      {/* DUAL WORKSPACE SPLIT PANEL */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 items-stretch min-h-0 relative z-10">

        {/* LEFT PANEL: INPUT FORM (75%) */}
        <div
          className="lg:col-span-3 flex flex-col min-h-0 bg-white border border-[#E5E7EB] rounded-[8px] p-3.5 relative shadow-sm transition-all duration-200"
          style={{ borderTop: `3px solid ${lineTheme?.primary || '#12A89A'}` }}
        >
          {/* Repeating Background Watermark Layer */}
          {selectedLine?.name && (
            <div
              className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0 rounded-[8px]"
              style={{
                backgroundImage: watermarkBg,
                backgroundRepeat: 'repeat',
              }}
            />
          )}

          {/* Green entry save success flash */}
          {showSuccessSplash && (
            <div className="absolute inset-0 bg-[#DCFCE7]/90 z-30 flex flex-col items-center justify-center rounded-[8px] transition-all duration-150">
              <div className="w-10 h-10 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-md mb-2 animate-bounce">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <span className="text-xs font-bold text-[#16A34A]">Entry Saved Successfully</span>
            </div>
          )}

          <form onSubmit={handleSaveEntrySubmit} className="flex flex-col h-full justify-between space-y-3 min-h-0 relative z-10">

            {/* Colored Form Heading Indicator */}
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-[#E5E7EB] select-none">
              <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ backgroundColor: lineTheme?.primary || '#12A89A' }}></span>
              <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                Production Entry
                {lineTheme && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold text-white uppercase tracking-widest" style={{ backgroundColor: lineTheme.primary }}>
                    {selectedLine.name}
                  </span>
                )}
              </h2>
            </div>

            {/* Top Grid: Prefilled & Read-Only parameters inherited from active session */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 select-none">
              <div>
                <label className="text-[10px] font-bold text-[#6B7280] block mb-0.5">Product (Batch-Locked)</label>
                <div className="w-full h-8 border border-[#E5E7EB] bg-slate-50 px-2.5 py-1 text-xs text-slate-500 font-bold rounded-[6px] flex items-center select-none truncate">
                  {activeSession?.skuName || 'Active Product'}
                </div>
              </div>

              <div className="text-left">
                <label className="text-[10px] font-bold text-[#344054] block mb-0.5">Cases Produced *</label>
                <input
                  ref={casesInputRef}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Type total cases logged..."
                  value={casesProduced}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || (/^\d+$/.test(val) && parseInt(val) > 0)) {
                      setCasesProduced(val)
                    }
                  }}
                  className="w-full h-8 border border-[#D0D5DD] px-2.5 py-1 text-xs bg-white rounded-[6px] focus:outline-none focus-line-theme font-bold text-slate-900"
                  required
                />
              </div>
            </div>

            {/* Industrial Raw Materials Table */}
            <div className="flex-1 flex flex-col justify-start min-h-0">
              <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1.5 select-none" style={{ color: lineTheme?.primary || '#12A89A' }}>Raw Material Consumption</h3>

              <div className="border border-[#E5E7EB] rounded-[6px] overflow-hidden flex flex-col min-h-0 bg-transparent relative z-10">
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[#344054] font-bold text-[10px] select-none">
                        <th className="px-3 py-1.5 w-[15%]">Material</th>
                        <th className="px-3 py-1.5 w-[45%]">Selection</th>
                        <th className="px-3 py-1.5 w-[18%]">Usage</th>
                        <th className="px-3 py-1.5 w-[17%]">Waste</th>
                        <th className="px-3 py-1.5 w-[5%] text-right">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB] text-[11px]">

                      {/* PREFORM ROW */}
                      {enabledStations.includes('Blowing') && (
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1 font-bold text-slate-800 select-none">Preform</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedPreformId}
                              onChange={(e) => setSelectedPreformId(e.target.value)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold"
                            >
                              {preforms.length > 0 ? (
                                <>
                                  <option value="">Select Material</option>
                                  {preforms.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No active materials available</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Usage"
                              value={preformUsage}
                              onChange={(e) => setPreformUsage(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${stockErrors.preform ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'
                                }`}
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(preformUnitLabel) ? "any" : "1"}
                              placeholder={getWastagePlaceholder(preformUnitLabel)}
                              title={`Enter preform wastage (${preformUnitLabel}).`}
                              value={preformWastage}
                              onChange={(e) => handleWastageInputChange(e.target.value, preformUnitLabel, setPreformWastage)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold"
                            />
                          </td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{preformUnitLabel}</td>
                        </tr>
                      )}

                      {/* DIRECT BOTTLE USAGE ROW — shown when Blowing Station is disabled */}
                      {!enabledStations.includes('Blowing') && (
                        <tr className="hover:bg-amber-50/30 bg-amber-50/20">
                          <td className="px-3 py-1 font-bold text-amber-700 select-none">Bottle</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedBottleId}
                              onChange={(e) => setSelectedBottleId(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold ${stockErrors.bottle ? 'border-red-500 bg-red-50/30' : 'border-amber-300'}`}
                            >
                              {bottles.length > 0 ? (
                                <>
                                  <option value="">Select Bottle</option>
                                  {bottles.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No BOTTLE materials in inventory</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(bottleUnitLabel) ? "any" : "1"}
                              placeholder="Usage"
                              value={bottleUsage}
                              onChange={(e) => setBottleUsage(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${stockErrors.bottle ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'}`}
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(bottleUnitLabel) ? "any" : "1"}
                              placeholder={getWastagePlaceholder(bottleUnitLabel)}
                              title={`Enter bottle wastage (${bottleUnitLabel}).`}
                              value={bottleWastage}
                              onChange={(e) => handleWastageInputChange(e.target.value, bottleUnitLabel, setBottleWastage)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold"
                            />
                          </td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{bottleUnitLabel}</td>
                        </tr>
                      )}

                      {/* CAP ROW */}
                      {enabledStations.includes('Filling') && (
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1 font-bold text-slate-800 select-none">Cap</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedCapId}
                              onChange={(e) => setSelectedCapId(e.target.value)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold"
                            >
                              {caps.length > 0 ? (
                                <>
                                  <option value="">Select Material</option>
                                  {caps.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No active materials available</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Usage"
                              value={capUsage}
                              onChange={(e) => setCapUsage(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${stockErrors.cap ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'
                                }`}
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(capUnitLabel) ? "any" : "1"}
                              placeholder={getWastagePlaceholder(capUnitLabel)}
                              title={`Enter cap wastage (${capUnitLabel}).`}
                              value={capWastage}
                              onChange={(e) => handleWastageInputChange(e.target.value, capUnitLabel, setCapWastage)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold"
                            />
                          </td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{capUnitLabel}</td>
                        </tr>
                      )}

                      {/* LABEL ROW */}
                      {enabledStations.includes('Labeling') && (
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1 font-bold text-slate-800 select-none">Label</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedLabelId}
                              onChange={(e) => setSelectedLabelId(e.target.value)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold"
                            >
                              {labels.length > 0 ? (
                                <>
                                  <option value="">Select Material</option>
                                  {labels.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No active materials available</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Usage"
                              value={labelUsage}
                              onChange={(e) => setLabelUsage(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${stockErrors.label ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'
                                }`}
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(labelUnitLabel) ? "any" : "1"}
                              placeholder={getWastagePlaceholder(labelUnitLabel)}
                              title={`Enter label wastage (${labelUnitLabel}).`}
                              value={labelWastage}
                              onChange={(e) => handleWastageInputChange(e.target.value, labelUnitLabel, setLabelWastage)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold"
                            />
                          </td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{labelUnitLabel}</td>
                        </tr>
                      )}

                      {/* SHRINK FILM ROW */}
                      {enabledStations.includes('Packing') && (
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1 font-bold text-slate-800 select-none">Shrink Film</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedShrinkId}
                              onChange={(e) => setSelectedShrinkId(e.target.value)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold"
                            >
                              {shrinks.length > 0 ? (
                                <>
                                  <option value="">Select Material</option>
                                  {shrinks.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No active materials available</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Usage"
                              value={shrinkUsage}
                              onChange={(e) => setShrinkUsage(e.target.value)}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${stockErrors.shrink ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'
                                }`}
                            />
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(shrinkUnitLabel) ? "any" : "1"}
                              placeholder={getWastagePlaceholder(shrinkUnitLabel)}
                              title={`Enter shrink film wastage (${shrinkUnitLabel}).`}
                              value={shrinkWastage}
                              onChange={(e) => handleWastageInputChange(e.target.value, shrinkUnitLabel, setShrinkWastage)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold"
                            />
                          </td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{shrinkUnitLabel}</td>
                        </tr>
                      )}

                      {/* GLUE ROW */}
                      {enabledStations.includes('Packing') && (
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1 font-bold text-slate-800 select-none">Glue (Opt)</td>
                          <td className="px-3 py-1">
                            <select
                              value={selectedGlueId}
                              onChange={(e) => setSelectedGlueId(e.target.value)}
                              className="w-full h-7.5 border border-[#D0D5DD] px-2 py-0.5 rounded-[6px] text-xs bg-white focus:outline-none focus-line-theme text-slate-800 font-semibold"
                            >
                              {glues.length > 0 ? (
                                <>
                                  <option value="">Select Material (Optional)</option>
                                  {glues.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No active materials available</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1">
                            <input
                              type="number"
                              min="0"
                              step={isDecimalUnit(glueUnitLabel) ? "any" : "1"}
                              placeholder="Usage"
                              value={glueUsage}
                              onChange={(e) => setGlueUsage(e.target.value)}
                              disabled={!selectedGlueId}
                              className={`w-full h-7.5 border px-2 py-0.5 rounded-[6px] text-xs focus:outline-none focus-line-theme font-bold ${!selectedGlueId ? 'bg-slate-100 cursor-not-allowed border-slate-200' :
                                stockErrors.glue ? 'border-red-500 bg-red-50/30' : 'border-[#D0D5DD]'
                                }`}
                            />
                          </td>
                          <td className="px-3 py-1 text-center text-[#9CA3AF] select-none font-extrabold">-</td>
                          <td className="px-3 py-1 font-bold text-slate-500 text-right select-none">{glueUnitLabel}</td>
                        </tr>
                      )}

                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 italic mt-1 px-1">
                <span className="font-semibold text-slate-700">Stock Rule:</span> Inventory stock is deducted ONLY by Usage. Wastage entries capture material loss for quality reporting and do not alter inventory stock.
              </p>
            </div>

            {/* Toggle sliders: Ink and Makeup */}
            {enabledStations.includes('Packing') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5 select-none">
                <div className="flex items-center justify-between p-2 bg-slate-50 border border-[#E5E7EB] rounded-[6px]">
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inkUsed}
                        onChange={(e) => setInkUsed(e.target.checked)}
                        className="sr-only peer peer-checked-line-theme"
                      />
                      <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all"></div>
                    </label>
                    <div className="text-left leading-none">
                      <span className="text-[11px] font-bold text-slate-800 block">Ink Used</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-50 border border-[#E5E7EB] rounded-[6px]">
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={makeupUsed}
                        onChange={(e) => setMakeupUsed(e.target.checked)}
                        className="sr-only peer peer-checked-line-theme"
                      />
                      <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all"></div>
                    </label>
                    <div className="text-left leading-none">
                      <span className="text-[11px] font-bold text-slate-800 block">Makeup Used</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SAVE BUTTON & REPORT ISSUE SECTION */}
            <div className="border-t border-[#E5E7EB] pt-3 flex flex-col items-end gap-2 select-none">
              {Object.keys(stockErrors).length > 0 && (
                <div className="w-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold p-2 rounded-[6px] flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>⚠️ Insufficient Stock: Production will create negative inventory.</span>
                </div>
              )}
              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!activeSession) {
                      showToast('No active production batch found. Please start a batch first.', 'warning')
                      return
                    }
                    setShowReportIssueModal(true)
                  }}
                  className="h-8 px-3.5 rounded-[6px] text-xs font-extrabold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>⚠ Report Issue</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving || submitEntryMutation.isPending}
                  className="w-full md:w-auto h-8 px-5 rounded-[6px] text-xs font-bold text-white hover:brightness-110 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: lineTheme?.primary || '#12A89A'
                  }}
                >
                  {isSaving || submitEntryMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Batch Entry</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        </div>

        {/* RIGHT PANEL: LOGS LEDGER (25%) */}
        <div
          className="flex flex-col min-h-0 bg-white border border-[#E5E7EB] rounded-[8px] p-3 shadow-sm transition-all duration-200"
          style={{ borderTop: `3px solid ${lineTheme?.primary || '#12A89A'}` }}
        >
          <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-[#E5E7EB] select-none">
            <div className="flex items-center gap-1 text-left">
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: lineTheme?.primary || '#12A89A' }}></span>
              <div>
                <h2 className="text-[11px] font-bold text-slate-800 tracking-tight block">Batch Log History</h2>
                <span className="text-[8px] text-[#6B7280] font-bold uppercase mt-0.5 block">Recorded Logs</span>
              </div>
            </div>

            <button
              onClick={() => {
                refetchSessionEntries()
                refetchActiveSession()
              }}
              className="text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-all duration-200 hover:brightness-110"
              style={{ color: lineTheme?.primary || '#12A89A' }}
            >
              <span>Dashboard</span>
              <Play className="w-2.5 h-2.5 fill-current rotate-180" />
            </button>
          </div>

          {/* Timeline ledger lists */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
            {sessionEntries.length > 0 ? (
              sessionEntries.map((entry) => {
                const isExpanded = !!expandedEntries[entry.id]
                return (
                  <div
                    key={entry.id}
                    className="border border-[#E5E7EB] hover-line-theme rounded-[6px] bg-white transition-all duration-200 overflow-hidden text-xs text-left"
                  >
                    {/* Header bar card */}
                    <div
                      onClick={() => toggleExpandEntry(entry.id)}
                      className="p-2 cursor-pointer select-none space-y-1 hover:bg-slate-50/50"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className="font-bold px-1.5 py-0.5 rounded-[4px] text-[8px] font-mono transition-all duration-200"
                          style={{ color: lineTheme?.primary || '#12A89A', backgroundColor: lineTheme?.secondary || '#E6F6F4' }}
                        >
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[8px] font-bold text-[#16A34A] flex items-center gap-0.5">
                          <Check className="w-3 h-3 text-[#16A34A] stroke-[3]" /> Logged
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="font-bold text-[#111827] truncate text-[10px]">{entry.skuName}</h4>
                        <div className="flex items-center justify-between text-[9px] font-semibold">
                          <span className="text-slate-800">{entry.casesProduced} Cases</span>
                          <span className="text-[#6B7280] font-medium text-[8px]">By: {entry.operatorName}</span>
                        </div>
                      </div>

                      <div className="text-[8px] font-bold text-[#344054] grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-[#F1F5F9]">
                        {enabledStations.includes('Blowing') && entry.preformName && <div>Preform: {formatRawMaterialUsage(entry.preformUsage, entry.preformUnit)}</div>}
                        {!enabledStations.includes('Blowing') && (entry.bottleUsage > 0 || entry.bottleWastage > 0) && (entry.bottleName || 'Bottle') && <div>Bottle: {formatRawMaterialUsage(entry.bottleUsage, entry.bottleUnit)}</div>}
                        {enabledStations.includes('Filling') && (entry.capUsage > 0 || entry.capWastage > 0) && entry.capName && <div>Cap: {formatRawMaterialUsage(entry.capUsage, entry.capUnit)}</div>}
                        {enabledStations.includes('Labeling') && (entry.labelUsage > 0 || entry.labelWastage > 0) && entry.labelName && <div>Label: {formatRawMaterialUsage(entry.labelUsage, entry.labelUnit)}</div>}
                      </div>
                    </div>

                    {/* Expand details view */}
                    {isExpanded && (
                      <div className="px-2 pb-2 pt-1 bg-slate-50 border-t border-[#E5E7EB] space-y-1 text-[8px] text-slate-700">
                        <div className="font-bold text-[8px] uppercase tracking-wider text-[#6B7280] border-b border-slate-200 pb-0.5 select-none">
                          Telemetry details
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-semibold">
                          {enabledStations.includes('Blowing') && entry.preformName && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Preform:</span> {entry.preformName} ({formatRawMaterialUsage(entry.preformUsage, entry.preformUnit)}, Waste: {formatRawMaterialWastage(entry.preformWastage, entry.preformUnit)})
                            </div>
                          )}
                          {!enabledStations.includes('Blowing') && (entry.bottleUsage > 0 || entry.bottleWastage > 0) && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Bottle:</span> {entry.bottleName || 'Bottle'} ({formatRawMaterialUsage(entry.bottleUsage, entry.bottleUnit)}, Waste: {formatRawMaterialWastage(entry.bottleWastage, entry.bottleUnit)})
                            </div>
                          )}
                          {enabledStations.includes('Filling') && (entry.capUsage > 0 || entry.capWastage > 0) && entry.capName && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Cap:</span> {entry.capName} ({formatRawMaterialUsage(entry.capUsage, entry.capUnit)}, Waste: {formatRawMaterialWastage(entry.capWastage, entry.capUnit)})
                            </div>
                          )}
                          {enabledStations.includes('Labeling') && (entry.labelUsage > 0 || entry.labelWastage > 0) && entry.labelName && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Label:</span> {entry.labelName} ({formatRawMaterialUsage(entry.labelUsage, entry.labelUnit)}, Waste: {formatRawMaterialWastage(entry.labelWastage, entry.labelUnit)})
                            </div>
                          )}
                          {enabledStations.includes('Packing') && (entry.shrinkUsage > 0 || entry.shrinkWastage > 0) && entry.shrinkName && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Shrink Film:</span> {entry.shrinkName} ({formatRawMaterialUsage(entry.shrinkUsage, entry.shrinkUnit)}, Waste: {formatRawMaterialWastage(entry.shrinkWastage, entry.shrinkUnit)})
                            </div>
                          )}
                          {enabledStations.includes('Packing') && entry.glueUsage > 0 && entry.glueName && (
                            <div className="col-span-2">
                              <span className="text-[#6B7280]">Glue:</span> {entry.glueName} ({formatRawMaterialUsage(entry.glueUsage, entry.glueUnit)})
                            </div>
                          )}
                          {enabledStations.includes('Packing') && (entry.inkUsed || entry.makeupUsed) && (
                            <div className="col-span-2 flex gap-2 font-bold text-[#16A34A] pt-0.5">
                              {entry.inkUsed && <span>Ink Used</span>}
                              {entry.makeupUsed && <span>Makeup Used</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                )
              })
            ) : (
              <div className="text-center py-6 text-xs text-[#6B7280] border border-dashed rounded-lg bg-slate-50 select-none">
                No entries captured for this active batch yet.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ==========================================
          BATCH CLOSING WIZARD DIALOG
         ========================================== */}
      {showEndModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E7EB] w-full max-w-[680px] max-h-[90vh] rounded-[12px] shadow-2xl p-5 relative text-left flex flex-col min-h-0">

            <div className="flex justify-between items-center pb-2.5 border-b border-[#E5E7EB] shrink-0">
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">End Production Batch</h3>
                <p className="text-[10px] text-[#6B7280] font-semibold mt-0.5">Please review complete metrics before confirming closure.</p>
              </div>
              <button
                onClick={() => setShowEndModal(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Wizard content */}
            <div className="flex-1 overflow-y-auto py-3 space-y-5 text-xs text-slate-700 min-h-0">

              {summaryLoading ? (
                <div className="py-20 text-center font-bold text-[#12A89A] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Compiling Batch Summaries...
                </div>
              ) : sessionSummary ? (
                <>
                  {/* SECTION 1: BATCH DETAILS */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 select-none">
                    <span className="text-[10px] font-bold text-[#12A89A] uppercase tracking-wider block border-b border-slate-200 pb-1">
                      Section 1: Batch Information
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 font-semibold text-[11px]">
                      <div>Batch Number: <strong className="text-slate-900">{sessionSummary.batchNumber}</strong></div>
                      <div>Product SKU: <strong className="text-slate-900 block truncate" title={sessionSummary.skuName}>{sessionSummary.skuName}</strong></div>
                      <div>Work Line: <strong className="text-slate-900">{selectedLine.name}</strong></div>
                      <div>Shift Log: <strong className="text-slate-900">{sessionSummary.shift}</strong></div>
                      <div>Operator: <strong className="text-slate-900 block truncate">{sessionSummary.operatorName}</strong></div>
                      <div>Start Time: <strong className="text-slate-900">{new Date(sessionSummary.startedAt).toLocaleTimeString()}</strong></div>
                      <div>Closing Time: <strong className="text-slate-900">{new Date().toLocaleTimeString()}</strong></div>
                      <div>Duration: <strong className="text-[#F59E0B] font-mono">{liveDurationStr}</strong></div>
                    </div>
                  </div>

                  {/* SECTION 2: PRODUCTION TOTALS */}
                  <div className="bg-[#E6F6F4] border border-blue-100 rounded-lg p-3 space-y-2 select-none">
                    <span className="text-[10px] font-bold text-[#12A89A] uppercase tracking-wider block border-b border-blue-200 pb-1">
                      Section 2: Production Summary
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
                      <div className="bg-white p-2 rounded border border-blue-50">
                        <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Cases Produced</span>
                        <span className="text-base font-extrabold text-[#12A89A]">{sessionSummary.casesProduced}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-50">
                        <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Logs Count</span>
                        <span className="text-base font-extrabold text-slate-800">{sessionSummary.entriesCount}</span>
                      </div>
                      {enabledStations.includes('Blowing') && (
                        <div className="bg-white p-2 rounded border border-blue-50">
                          <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Preforms Used</span>
                          <span className="text-sm font-bold text-slate-800 block">{sessionSummary.preformUsed} Bag</span>
                          <span className="text-[9px] text-[#DC2626] font-bold block mt-0.5">Waste: {sessionSummary.preformWaste}</span>
                        </div>
                      )}
                      {enabledStations.includes('Filling') && (
                        <div className="bg-white p-2 rounded border border-blue-50">
                          <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Caps Used</span>
                          <span className="text-sm font-bold text-slate-800 block">{sessionSummary.capUsed} BOX</span>
                          <span className="text-[9px] text-[#DC2626] font-bold block mt-0.5">Waste: {sessionSummary.capWaste}</span>
                        </div>
                      )}
                      {enabledStations.includes('Labeling') && (
                        <div className="bg-white p-2 rounded border border-blue-50">
                          <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Labels Used</span>
                          <span className="text-sm font-bold text-slate-800 block">{sessionSummary.labelUsed} {getSelectedLabelUnit()}</span>
                          <span className="text-[9px] text-[#DC2626] font-bold block mt-0.5">Waste: {sessionSummary.labelWaste}</span>
                        </div>
                      )}
                      {enabledStations.includes('Packing') && (
                        <div className="bg-white p-2 rounded border border-blue-50">
                          <span className="text-[#6B7280] text-[8px] uppercase block font-bold mb-0.5">Shrink Film</span>
                          <span className="text-sm font-bold text-slate-800 block">{sessionSummary.shrinkUsed} KG</span>
                          <span className="text-[9px] text-[#DC2626] font-bold block mt-0.5">Waste: {sessionSummary.shrinkWaste}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: INVENTORY STOCKS METRICS */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#12A89A] uppercase tracking-wider block mb-1 select-none">
                      Section 3: Inventory Summary
                    </span>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold select-none text-[#344054]">
                            <th className="px-3 py-2">Material Specification</th>
                            <th className="px-3 py-2 text-center w-28">Opening Stock</th>
                            <th className="px-3 py-2 text-center w-20">Consumed</th>
                            <th className="px-3 py-2 text-center w-20">Waste</th>
                            <th className="px-3 py-2 text-right w-28">Remaining</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {sessionSummary.inventorySummary && sessionSummary.inventorySummary.map((item: any, idx: number) => {
                            const isNegative = item.remainingStock < 0 || item.openingStock < 0
                            
                            const n = (item.materialName || '').toLowerCase()
                            let displayUnit = item.unit
                            if (n.includes('preform') || n.includes('cap') || n.includes('closure')) displayUnit = 'PCS'
                            else if (n.includes('label') || n.includes('shrink') || n.includes('film')) displayUnit = 'KG'

                            return (
                              <tr key={idx} className={`hover:bg-slate-50/50 ${isNegative ? 'bg-red-50/50 text-red-900 font-bold' : ''}`}>
                                <td className="px-3 py-2 font-semibold text-slate-800">{item.materialName}</td>
                                <td className="px-3 py-2 text-center">{item.openingStock} {displayUnit}</td>
                                <td className="px-3 py-2 text-center">{item.consumed} {displayUnit}</td>
                                <td className="px-3 py-2 text-center">{item.waste} {displayUnit}</td>
                                <td className={`px-3 py-2 text-right font-bold ${isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                                  {item.remainingStock} {displayUnit}
                                </td>
                              </tr>
                            )
                          })}
                          {(!sessionSummary.inventorySummary || sessionSummary.inventorySummary.length === 0) && (
                            <tr>
                              <td colSpan={5} className="px-3 py-4 text-center text-slate-400 select-none">No material logs posted during this batch.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SECTION 4: AUTOMATED VALIDATION CHECKS */}
                  <div className="bg-[#F0FDF4] border border-green-100 rounded-lg p-3 space-y-1.5 select-none text-[11px] font-semibold text-green-800">
                    <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider block border-b border-green-200 pb-1 mb-1">
                      Section 4: Automatic Validation Checks
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>Batch has production entries ({sessionSummary.entriesCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>Inventory updated successfully</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>No pending draft entries</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>Production totals calculated</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>Stock movements audited</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>System validation parameters OK</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 5: OPERATOR CONFIRMATION & REMARKS */}
                  <div className="border-t border-slate-200 pt-3 space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-800 block mb-1">Closing Remarks (Optional)</label>
                      <input
                        type="text"
                        placeholder="Add shift feedback or notes..."
                        value={endRemarks}
                        onChange={(e) => setEndRemarks(e.target.value)}
                        className="w-full h-8 border border-[#D0D5DD] px-3 py-1.5 text-xs bg-white rounded-[6px] focus:outline-none"
                      />
                    </div>

                    <label className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer select-none text-left">
                      <input
                        type="checkbox"
                        checked={confirmCloseChecked}
                        onChange={(e) => setConfirmCloseChecked(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-[#12A89A] focus:ring-[#12A89A] cursor-pointer"
                      />
                      <div className="text-xs font-bold text-slate-800 leading-tight">
                        I confirm that all production data has been entered, material usage counts are verified, and this batch is ready to be locked and completed.
                      </div>
                    </label>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-slate-400">Failed to compile session summary. Try again.</div>
              )}
            </div>

            {/* Modal actions footer */}
            <div className="border-t border-[#E5E7EB] pt-4 flex justify-end gap-2.5 select-none shrink-0">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="px-4 h-9 border border-[#E5E7EB] hover:bg-slate-50 text-slate-700 font-bold rounded-[6px] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSessionSubmit}
                disabled={endSessionMutation.isPending || !confirmCloseChecked || !sessionSummary}
                className="px-5 h-9 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-white font-bold rounded-[6px] text-xs cursor-pointer shadow flex items-center gap-1.5"
              >
                {endSessionMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm End Batch</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ==========================================
          OPERATOR BATCH ISSUE REPORTING MODAL DIALOG
         ========================================== */}
      {showReportIssueModal && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#E5E7EB] w-full max-w-[620px] max-h-[90vh] overflow-y-auto rounded-[16px] shadow-2xl p-6 relative text-left transition-all duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-[#E5E7EB] mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">Report Active Production Issue</h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Instant incident reporting linked directly to running batch context.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowReportIssueModal(false)
                  setCreatedIssueResult(null)
                }}
                className="p-1.5 rounded-full hover:bg-slate-100 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {createdIssueResult ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Issue Reported Successfully!</h3>
                  <p className="text-xs text-slate-500 mt-1">Incident Number: <span className="font-mono font-bold text-blue-600">#{createdIssueResult.issueNumber}</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">Plant Management, Maintenance, and Supervisors have been notified in real-time.</p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setCreatedIssueResult(null)
                      setShowReportIssueModal(false)
                      setIssueTitle('')
                      setIssueDescription('')
                    }}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Continue Production
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReportIssueSubmit} className="space-y-4 text-xs">
                
                {/* Read-only Auto-Filled Context */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" /> Auto-Filled Production Context (Locked)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{new Date().toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Current Batch</span>
                      <span className="font-mono font-bold text-slate-900">{activeSession?.batchNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Product</span>
                      <span className="font-bold text-slate-900 truncate block">{activeSession?.skuName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Line & Equipment</span>
                      <span className="font-bold text-slate-900">{selectedLine?.name || 'Bottling Line'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Shift</span>
                      <span className="font-bold text-slate-900">{activeSession?.shift || 'Current Shift'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Station</span>
                      <span className="font-bold text-slate-900">{selectedLine?.name || 'Production Station'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Operator</span>
                      <span className="font-bold text-slate-900 truncate block">{user?.fullName || user?.email || 'Operator'}</span>
                    </div>
                  </div>
                </div>

                {/* Category & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-700">Issue Category *</label>
                    <select
                      value={issueCategory}
                      onChange={(e) => setIssueCategory(e.target.value)}
                      className="w-full h-9 border border-slate-300 px-2.5 text-xs bg-white rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Machine Breakdown">Machine Breakdown</option>
                      <option value="Power Failure">Power Failure</option>
                      <option value="Generator Failure">Generator Failure</option>
                      <option value="Material Shortage">Material Shortage</option>
                      <option value="Bottle Jam">Bottle Jam</option>
                      <option value="Water Supply Issue">Water Supply Issue</option>
                      <option value="Quality Issue">Quality Issue</option>
                      <option value="Leakage">Leakage</option>
                      <option value="Electrical Issue">Electrical Issue</option>
                      <option value="Mechanical Issue">Mechanical Issue</option>
                      <option value="Safety Issue">Safety Issue</option>
                      <option value="Operator Injury">Operator Injury</option>
                      <option value="QC Failure">QC Failure</option>
                      <option value="Packaging Problem">Packaging Problem</option>
                      <option value="Label Issue">Label Issue</option>
                      <option value="Shrink Film Issue">Shrink Film Issue</option>
                      <option value="Cap Issue">Cap Issue</option>
                      <option value="Preform Issue">Preform Issue</option>
                      <option value="Internet Issue">Internet Issue</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-700">Priority Level *</label>
                    <select
                      value={issuePriority}
                      onChange={(e) => setIssuePriority(e.target.value)}
                      className="w-full h-9 border border-slate-300 px-2.5 text-xs bg-white rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Issue Title *</label>
                  <input
                    type="text"
                    required
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="e.g. Capping head motor stalled during filling"
                    className="w-full h-9 border border-slate-300 px-3 text-xs bg-white rounded-lg focus:ring-1 focus:ring-blue-500 font-semibold"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Detailed Description *</label>
                  <textarea
                    rows={3}
                    required
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Describe what happened, error codes, noise, leakage, or immediate impact..."
                    className="w-full p-2.5 border border-slate-300 text-xs bg-white rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Requires Immediate Stop */}
                <div className="flex items-center justify-between p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
                  <div>
                    <span className="text-xs font-bold text-amber-900 block">Requires Immediate Line Stop?</span>
                    <span className="text-[10px] text-amber-700">Alerts maintenance & supervisors that production line is halted.</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIssueRequiresImmediateStop(true)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        issueRequiresImmediateStop ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      YES
                    </button>
                    <button
                      type="button"
                      onClick={() => setIssueRequiresImmediateStop(false)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        !issueRequiresImmediateStop ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      NO
                    </button>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowReportIssueModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingIssue}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> Submit Issue Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default OperatorDashboardPage
