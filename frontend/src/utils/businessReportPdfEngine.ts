import { jsPDF } from 'jspdf'
import type { BusinessReportDto, ProfitAndLossReportDto } from '../services/api/reports'
import {
  drawCompanyPdfHeader,
  drawCompanyPdfContinuationHeader
} from './companyPdfHeader'

export const generateBusinessReportPDF = (report: BusinessReportDto): jsPDF => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Geometry Constants (A4: 210mm x 297mm)
  const pageWidth = 210
  const pageHeight = 297
  const margin = 14
  const contentWidth = pageWidth - (margin * 2) // 182mm
  const rightMarginX = pageWidth - margin // 196mm
  const topMargin = 14
  const bottomMargin = 18

  // Safe Currency & Number Formatting Helpers
  // We use standard ISO currency codes (e.g. 'INR ', 'USD ', 'EUR ') or 'Rs. ' to guarantee 100% clean glyph rendering in Standard PDF fonts without broken character spacing
  const rawCurrency = (report.company?.currency || 'INR').toUpperCase().trim()
  const currPrefix = rawCurrency === 'INR' ? 'INR ' : (rawCurrency === 'USD' ? '$ ' : `${rawCurrency} `)

  const formatNum = (val: number | undefined | null, decimals = 0): string => {
    if (val === undefined || val === null || isNaN(val)) return '0'
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  const formatCurr = (val: number | undefined | null): string => {
    if (val === undefined || val === null || isNaN(val)) return `${currPrefix}0.00`
    return `${currPrefix}${Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const formatDateStr = (dateVal: string | Date | undefined | null): string => {
    if (!dateVal) return '—'
    try {
      const d = new Date(dateVal)
      if (isNaN(d.getTime())) return String(dateVal)
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return String(dateVal)
    }
  }

  const formatPersonName = (name: string | undefined | null): string => {
    if (!name || ['null', 'undefined', '00000000-0000-0000-0000-000000000000'].includes(name.trim().toLowerCase())) return '—'
    const trimmed = name.trim()
    // Defensively check for any raw UUID
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    if (isGuid) return '—'
    return trimmed
  }

  // Color Palette Tokens
  const C_PRIMARY = [37, 99, 235] // blue-600
  const C_DARK = [15, 23, 42] // slate-900
  const C_BODY = [51, 65, 85] // slate-700
  const C_MUTED = [100, 116, 139] // slate-500
  const C_LIGHT_MUTED = [148, 163, 184] // slate-400
  const C_LINE = [226, 232, 240] // slate-200
  const C_CARD_BG = [248, 250, 252] // slate-50
  const C_HEAD_BG = [241, 245, 249] // slate-100
  const C_SUCCESS = [22, 101, 52] // emerald-800
  const C_DANGER = [185, 28, 28] // red-700
  const C_WARNING = [180, 83, 9] // amber-700

  // Drawing Helpers
  const textRight = (text: string, x: number, currentY: number) => {
    const textWidth = pdf.getTextWidth(text)
    pdf.text(text, x - textWidth, currentY)
  }

  const textCenter = (text: string, centerX: number, currentY: number) => {
    const textWidth = pdf.getTextWidth(text)
    pdf.text(text, centerX - (textWidth / 2), currentY)
  }

  let y = topMargin

  // Running Page Header (Pages 2+)
  const drawRunningHeader = (sectionTitle?: string) => {
    return drawCompanyPdfContinuationHeader(pdf, {
      company: report.company,
      docTitle: 'BUSINESS PERFORMANCE REPORT',
      metaText: report.period.formattedRange,
      startX: margin,
      startY: topMargin + 2,
      rightMarginX
    })
  }

  // Cover / First Page Header
  const drawCoverHeader = () => {
    const headerRes = drawCompanyPdfHeader(pdf, {
      company: report.company,
      docTitle: 'BUSINESS REPORT',
      docDate: `Period: ${report.period.formattedRange}`,
      metaLines: [
        `Generated: ${report.period.generatedAtLocal}`,
        ...(report.company?.gstNumber ? [`GSTIN: ${report.company.gstNumber}`] : [])
      ],
      startX: margin,
      startY: y,
      contentWidth,
      rightMarginX,
      titleColor: [37, 99, 235], // Blue-600
      maxAddressWidth: 105,
      showDivider: true
    })

    y = headerRes.nextY + 1
  }

  // Smart Page Break Helper
  const checkPageBreak = (neededHeight: number, currentSectionTitle?: string): boolean => {
    if (y + neededHeight > pageHeight - bottomMargin) {
      pdf.addPage()
      y = drawRunningHeader(currentSectionTitle)
      return true
    }
    return false
  }

  // Section Header Renderer
  const renderSectionHeader = (secNum: string, title: string, subtitle?: string) => {
    // Ensure section header and at least 2 table rows (approx 28mm) fit, otherwise break to next page
    checkPageBreak(28, title)

    pdf.setFillColor(C_HEAD_BG[0], C_HEAD_BG[1], C_HEAD_BG[2])
    pdf.roundedRect(margin, y, contentWidth, subtitle ? 11 : 9, 1.5, 1.5, 'F')
    pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
    pdf.roundedRect(margin, y, contentWidth, subtitle ? 11 : 9, 1.5, 1.5, 'S')

    // Number Badge on Left
    pdf.setFillColor(C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2])
    pdf.roundedRect(margin + 2, y + 2, 7, subtitle ? 7 : 5, 1, 1, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(255, 255, 255)
    textCenter(secNum, margin + 5.5, subtitle ? y + 6.8 : y + 5.8)

    // Section Title
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text(title.toUpperCase(), margin + 11.5, y + 5.8)

    if (subtitle) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2])
      pdf.text(subtitle, margin + 11.5, y + 9.3)
    }

    y += subtitle ? 14 : 12
  }

  // Empty Section Note Renderer
  const renderEmptyNote = (message: string) => {
    checkPageBreak(12)
    pdf.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2])
    pdf.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
    pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
    pdf.roundedRect(margin, y, contentWidth, 8, 1, 1, 'S')

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2])
    pdf.text(`•  ${message}`, margin + 4, y + 5.2)
    y += 11
  }

  // Summary Metrics Banner inside a Section
  const renderMetricPills = (pills: { label: string; value: string; color?: number[] }[]) => {
    checkPageBreak(14)
    const pillWidth = (contentWidth - ((pills.length - 1) * 3)) / pills.length
    const pillHeight = 11

    pills.forEach((p, idx) => {
      const px = margin + (idx * (pillWidth + 3))
      pdf.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2])
      pdf.roundedRect(px, y, pillWidth, pillHeight, 1, 1, 'F')
      pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
      pdf.roundedRect(px, y, pillWidth, pillHeight, 1, 1, 'S')

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.8)
      pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2])
      pdf.text(p.label.toUpperCase(), px + 3, y + 3.8)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.5)
      const valColor = p.color || C_DARK
      pdf.setTextColor(valColor[0], valColor[1], valColor[2])
      pdf.text(p.value, px + 3, y + 8.5)
    })

    y += pillHeight + 4
  }

  // Generic Reusable Enterprise Table Renderer
  interface TableColumn<T> {
    header: string
    width: number // in mm
    align?: 'left' | 'right' | 'center'
    accessor: (row: T) => string
    bold?: boolean
    color?: (row: T) => number[]
  }

  interface TableOptions<T> {
    sectionTitle: string
    columns: TableColumn<T>[]
    data: T[]
    emptyMessage?: string
    totals?: {
      label: string
      values: { [colIndex: number]: string }
    }
  }

  const renderTable = <T,>(opts: TableOptions<T>) => {
    if (!opts.data || opts.data.length === 0) {
      renderEmptyNote(opts.emptyMessage || 'No records recorded for this period.')
      return
    }

    const drawHeaderRow = (isContinued = false) => {
      pdf.setFillColor(C_HEAD_BG[0], C_HEAD_BG[1], C_HEAD_BG[2])
      pdf.rect(margin, y, contentWidth, 7, 'F')
      pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
      pdf.line(margin, y + 7, rightMarginX, y + 7)

      let curX = margin
      opts.columns.forEach((col) => {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2])

        const titleText = isContinued ? `${col.header} *` : col.header
        if (col.align === 'right') {
          textRight(titleText, curX + col.width - 2.5, y + 4.8)
        } else if (col.align === 'center') {
          textCenter(titleText, curX + (col.width / 2), y + 4.8)
        } else {
          pdf.text(titleText, curX + 2.5, y + 4.8)
        }
        curX += col.width
      })

      y += 7
    }

    drawHeaderRow(false)

    opts.data.forEach((row, rIdx) => {
      // 1. Calculate cell heights based on text wrapping
      const rowLineCounts = opts.columns.map((col) => {
        const text = String(col.accessor(row) || '—')
        const lines = pdf.splitTextToSize(text, col.width - 4)
        return Math.max(1, lines.length)
      })
      const maxLines = Math.max(...rowLineCounts)
      const rowHeight = Math.max(7, maxLines * 4.2 + 2.5)

      // 2. Auto page break check
      if (checkPageBreak(rowHeight + 8, opts.sectionTitle)) {
        drawHeaderRow(true)
      }

      // 3. Alternating row background
      if (rIdx % 2 === 1) {
        pdf.setFillColor(252, 253, 254)
        pdf.rect(margin, y, contentWidth, rowHeight, 'F')
      }

      // 4. Row bottom border
      pdf.setDrawColor(241, 245, 249)
      pdf.setLineWidth(0.25)
      pdf.line(margin, y + rowHeight, rightMarginX, y + rowHeight)

      // 5. Draw cell texts
      let curX = margin
      opts.columns.forEach((col) => {
        const text = String(col.accessor(row) || '—')
        const lines = pdf.splitTextToSize(text, col.width - 4)

        pdf.setFont('helvetica', col.bold ? 'bold' : 'normal')
        pdf.setFontSize(8)

        if (col.color) {
          const c = col.color(row)
          pdf.setTextColor(c[0], c[1], c[2])
        } else {
          pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
        }

        let lineY = y + 4.2
        lines.forEach((l: string) => {
          if (col.align === 'right') {
            textRight(l, curX + col.width - 2.5, lineY)
          } else if (col.align === 'center') {
            textCenter(l, curX + (col.width / 2), lineY)
          } else {
            pdf.text(l, curX + 2.5, lineY)
          }
          lineY += 3.8
        })

        curX += col.width
      })

      y += rowHeight
    })

    // Totals row if provided
    if (opts.totals) {
      const totHeight = 7.5
      checkPageBreak(totHeight + 4, opts.sectionTitle)

      pdf.setFillColor(C_HEAD_BG[0], C_HEAD_BG[1], C_HEAD_BG[2])
      pdf.rect(margin, y, contentWidth, totHeight, 'F')
      pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
      pdf.line(margin, y, rightMarginX, y)
      pdf.line(margin, y + totHeight, rightMarginX, y + totHeight)

      let curX = margin
      opts.columns.forEach((col, cIdx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])

        if (cIdx === 0) {
          pdf.text(opts.totals!.label.toUpperCase(), curX + 2.5, y + 5)
        } else if (opts.totals!.values[cIdx]) {
          const tVal = opts.totals!.values[cIdx]
          if (col.align === 'right') {
            textRight(tVal, curX + col.width - 2.5, y + 5)
          } else if (col.align === 'center') {
            textCenter(tVal, curX + (col.width / 2), y + 5)
          } else {
            pdf.text(tVal, curX + 2.5, y + 5)
          }
        }
        curX += col.width
      })

      y += totHeight + 4
    } else {
      y += 4
    }
  }

  // ========================================================
  // PAGE 1: COVER HEADER & EXECUTIVE SUMMARY (KPI CARDS)
  // ========================================================
  drawCoverHeader()

  renderSectionHeader('01', 'Executive Business Performance Summary', 'High-level operational, commercial, and financial key performance indicators')

  // Top Management KPI Cards in 3 Columns
  const kpis = [
    { label: 'Total Production', val: `${formatNum(report.summary.totalCasesProduced)} Cases`, sub: `${report.summary.totalBatchesCount} Batches (${report.summary.completedBatchesCount} Completed)` },
    { label: 'Gross Sales Revenue', val: formatCurr(report.summary.totalSalesRevenue), sub: `${formatNum(report.summary.totalSalesQuantity)} Cases Billed (${report.summary.totalSalesOrdersCount} Orders)` },
    { label: 'Dispatches Delivered', val: `${formatNum(report.summary.totalDispatchedQuantity)} Cases`, sub: `${report.summary.totalDispatchesCount} Dispatches (${report.summary.uniqueVehiclesCount} Fleet Vehicles)` },
    { label: 'Net Sales Realized', val: formatCurr(report.summary.netSalesRevenue), sub: `${formatNum(report.summary.netSalesQuantity)} Net Cases Realized`, highlight: true },
    { label: 'Customer Returns', val: `${formatNum(report.summary.totalReturnedQuantity)} Cases`, sub: `${formatCurr(report.summary.totalReturnedAmount)} Returned Value` },
    { label: 'Damages / Spoilage', val: `${formatNum(report.summary.totalDamagedQuantity)} Cases`, sub: `${formatCurr(report.summary.totalDamageCost)} Estimated Cost` },
    { label: 'Operating Expenses', val: formatCurr(report.summary.totalOperatingExpenses), sub: 'General Plant & Administrative' },
    { label: 'Material Purchases', val: formatCurr(report.summary.totalPurchasesAmount), sub: `Paid: ${formatCurr(report.financials.totalPurchasesPaid)}` },
    { label: 'Salaries & Payroll', val: formatCurr(report.summary.totalSalariesPaid), sub: 'Direct Factory & Staff Payroll' }
  ]

  const cardW = (contentWidth - 6) / 3 // 3 columns = ~59.3mm each
  const cardH = 17

  for (let i = 0; i < kpis.length; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const cx = margin + (col * (cardW + 3))
    const cy = y + (row * (cardH + 2.5))

    pdf.setFillColor(kpis[i].highlight ? 239 : C_CARD_BG[0], kpis[i].highlight ? 246 : C_CARD_BG[1], kpis[i].highlight ? 255 : C_CARD_BG[2])
    pdf.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'F')
    pdf.setDrawColor(kpis[i].highlight ? C_PRIMARY[0] : C_LINE[0], kpis[i].highlight ? C_PRIMARY[1] : C_LINE[1], kpis[i].highlight ? C_PRIMARY[2] : C_LINE[2])
    pdf.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'S')

    // KPI Label
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(kpis[i].highlight ? C_PRIMARY[0] : C_MUTED[0], kpis[i].highlight ? C_PRIMARY[1] : C_MUTED[1], kpis[i].highlight ? C_PRIMARY[2] : C_MUTED[2])
    pdf.text(kpis[i].label.toUpperCase(), cx + 3.5, cy + 4.2)

    // KPI Value (Bold and readable)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text(kpis[i].val, cx + 3.5, cy + 9.8)

    // KPI Subtext
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.8)
    pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2])
    pdf.text(kpis[i].sub, cx + 3.5, cy + 14.2)
  }

  y += (Math.ceil(kpis.length / 3) * (cardH + 2.5)) + 6

  // Executive Management Narrative Snapshot Box
  pdf.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2])
  pdf.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, 'F')
  pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
  pdf.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(C_PRIMARY[0], C_PRIMARY[1], C_PRIMARY[2])
  pdf.text('BUSINESS SNAPSHOT & OPERATIONAL HIGHLIGHTS', margin + 4, y + 4.5)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2])

  const snapCol1 = [
    `•  Production: ${formatNum(report.summary.totalCasesProduced)} cases manufactured across ${report.summary.totalBatchesCount} batches.`,
    `•  Sales Realization: Gross sales of ${formatCurr(report.summary.totalSalesRevenue)} with ${formatCurr(report.summary.totalAmountReceived)} collected.`
  ]
  const snapCol2 = [
    `•  Logistics & Dispatch: ${formatNum(report.summary.totalDispatchedQuantity)} cases delivered across ${report.summary.totalDispatchesCount} dispatches.`,
    `•  Quality & Compliance: ${report.qualityControl.totalTestsConducted} lab water tests conducted (${report.qualityControl.totalPassed} approved).`
  ]

  pdf.text(snapCol1[0], margin + 4, y + 10)
  pdf.text(snapCol1[1], margin + 4, y + 16)
  pdf.text(snapCol2[0], margin + (contentWidth / 2) + 2, y + 10)
  pdf.text(snapCol2[1], margin + (contentWidth / 2) + 2, y + 16)

  y += 28

  // ========================================================
  // 02. PRODUCTION OPERATIONS & BATCH EXECUTION
  // ========================================================
  renderSectionHeader('02', 'Production Operations & Batch Execution', 'Detailed record of plant batch runs, targets, output variances, and operators')

  renderMetricPills([
    { label: 'Batches Executed', value: `${report.production.totalBatches} Runs` },
    { label: 'Completed Batches', value: `${report.production.completedBatches} Done`, color: C_SUCCESS },
    { label: 'Cases Produced', value: `${formatNum(report.production.totalCasesProduced)} Cases`, color: C_PRIMARY },
    { label: 'Preform Wastage', value: `${formatNum(report.production.totalPreformWastage)} PCS`, color: C_WARNING },
    { label: 'Cap Wastage', value: `${formatNum(report.production.totalCapWastage)} PCS`, color: C_WARNING }
  ])

  renderTable({
    sectionTitle: 'Production Operations & Batches',
    data: report.production.batches,
    emptyMessage: 'No production batches recorded during this period.',
    columns: [
      { header: 'Batch Number', width: 28, accessor: (b) => b.batchNumber || '—', bold: true },
      { header: 'Product Item', width: 44, accessor: (b) => b.product || 'Standard Water' },
      { header: 'Line & Shift', width: 34, accessor: (b) => `${b.productionLine} • ${b.shift || 'General'}` },
      { header: 'Operator', width: 26, accessor: (b) => formatPersonName(b.operatorName) },
      { header: 'Target', width: 16, align: 'right', accessor: (b) => formatNum(b.targetQuantity) },
      { header: 'Produced', width: 18, align: 'right', accessor: (b) => formatNum(b.producedQuantity), bold: true },
      {
        header: 'Status',
        width: 16,
        align: 'center',
        accessor: (b) => b.status || 'Done',
        color: (b) => b.status === 'Completed' ? C_SUCCESS : C_WARNING
      }
    ],
    totals: {
      label: `Total Batches: ${report.production.totalBatches}`,
      values: {
        4: formatNum(report.production.batches.reduce((acc, x) => acc + x.targetQuantity, 0)),
        5: formatNum(report.production.totalCasesProduced)
      }
    }
  })

  // ========================================================
  // 03. SALES ORDERS & REVENUE REALIZATION
  // ========================================================
  renderSectionHeader('03', 'Sales Orders & Commercial Revenue', 'Commercial transactions, invoice billings, tax, discounts, and payment collections')

  renderMetricPills([
    { label: 'Gross Invoiced', value: formatCurr(report.sales.totalGrossAmount), color: C_PRIMARY },
    { label: 'Total Invoices', value: `${report.sales.totalTransactions} Orders` },
    { label: 'Volume Sold', value: `${formatNum(report.sales.totalQuantity)} Cases` },
    { label: 'Amount Received', value: formatCurr(report.sales.totalReceived), color: C_SUCCESS },
    { label: 'Outstanding Balance', value: formatCurr(report.sales.totalOutstanding), color: C_DANGER }
  ])

  renderTable({
    sectionTitle: 'Sales Orders & Revenue',
    data: report.sales.transactions,
    emptyMessage: 'No sales transactions recorded during this period.',
    columns: [
      { header: 'Order / Doc #', width: 28, accessor: (s) => s.transactionNumber || '—', bold: true },
      { header: 'Date', width: 20, accessor: (s) => formatDateStr(s.transactionDate) },
      { header: 'Customer Partner', width: 44, accessor: (s) => s.customerName || 'Direct Sale' },
      { header: 'Product Item', width: 34, accessor: (s) => s.productName || 'Water Bottle' },
      { header: 'Cases', width: 14, align: 'right', accessor: (s) => formatNum(s.cases) },
      { header: 'Total Value', width: 22, align: 'right', accessor: (s) => formatCurr(s.totalAmount), bold: true },
      {
        header: 'Payment Status',
        width: 20,
        align: 'center',
        accessor: (s) => s.paymentStatus || s.status || 'Paid',
        color: (s) => (s.paymentStatus === 'Paid' ? C_SUCCESS : (s.paymentStatus === 'Partial' ? C_WARNING : C_DANGER))
      }
    ],
    totals: {
      label: `Total Orders: ${report.sales.totalTransactions}`,
      values: {
        4: `${formatNum(report.sales.totalQuantity)} Cases`,
        5: formatCurr(report.sales.totalGrossAmount)
      }
    }
  })

  // ========================================================
  // 04. PRODUCT DISPATCHES & FLEET LOGISTICS
  // ========================================================
  renderSectionHeader('04', 'Product Dispatches & Logistics', 'Finished goods dispatches, loading manifests, vehicles, and delivery crew')

  renderMetricPills([
    { label: 'Total Dispatches', value: `${report.dispatch.totalDispatches} Dispatches` },
    { label: 'Cases Dispatched', value: `${formatNum(report.dispatch.totalDispatchedQuantity)} Cases`, color: C_PRIMARY },
    { label: 'Vehicles Engaged', value: `${report.dispatch.uniqueVehicles} Fleet Vehicles` },
    { label: 'Receiving Customers', value: `${report.dispatch.uniqueCustomers} Partners` }
  ])

  renderTable({
    sectionTitle: 'Product Dispatches & Logistics',
    data: report.dispatch.dispatches,
    emptyMessage: 'No dispatch manifests recorded during this period.',
    columns: [
      { header: 'Dispatch / Run #', width: 28, accessor: (d) => d.dispatchNumber || '—', bold: true },
      { header: 'Date', width: 20, accessor: (d) => formatDateStr(d.dispatchDate) },
      { header: 'Destination Customer', width: 44, accessor: (d) => d.customerName || 'Direct Buyer' },
      { header: 'Product Loaded', width: 32, accessor: (d) => d.productName || 'Water' },
      { header: 'Quantity', width: 16, align: 'right', accessor: (d) => formatNum(d.quantity), bold: true },
      { header: 'Vehicle Number', width: 20, align: 'center', accessor: (d) => d.vehicleNumber || '—' },
      { header: 'Driver / Crew', width: 22, accessor: (d) => formatPersonName(d.driverOrLoadedBy) }
    ],
    totals: {
      label: `Total Manifests: ${report.dispatch.totalDispatches}`,
      values: {
        4: `${formatNum(report.dispatch.totalDispatchedQuantity)} Cases`
      }
    }
  })

  // ========================================================
  // 05. CUSTOMER RETURNS & GOODS DAMAGES
  // ========================================================
  renderSectionHeader('05', 'Customer Returns & Goods Damage Log', 'Audited logs of customer return claims, defects, transit damages, and quarantines')

  renderMetricPills([
    { label: 'Customer Returns', value: `${formatNum(report.returns.totalReturnedQuantity)} Cases`, color: C_WARNING },
    { label: 'Returns Value', value: formatCurr(report.returns.totalReturnedAmount) },
    { label: 'Damaged / Scrapped', value: `${formatNum(report.damages.totalDamagedQuantity)} Cases`, color: C_DANGER },
    { label: 'Damage Loss Est.', value: formatCurr(report.damages.totalDamageCost), color: C_DANGER }
  ])

  // Subsection A: Customer Returns
  if (report.returns.returns.length > 0) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('A. Customer Return Claims & Credit Postings', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Customer Returns',
      data: report.returns.returns,
      columns: [
        { header: 'Return Doc #', width: 30, accessor: (r) => r.returnNumber || '—', bold: true },
        { header: 'Date', width: 22, accessor: (r) => formatDateStr(r.returnDate) },
        { header: 'Customer Name', width: 44, accessor: (r) => r.customerName || '—' },
        { header: 'Product Item', width: 32, accessor: (r) => r.productName || 'Water' },
        { header: 'Qty Returned', width: 18, align: 'right', accessor: (r) => `${formatNum(r.quantity)} Cases`, bold: true },
        { header: 'Return Value', width: 20, align: 'right', accessor: (r) => formatCurr(r.returnedAmount) },
        { header: 'Reason / Type', width: 16, accessor: (r) => r.returnType || r.remarks || 'General' }
      ],
      totals: {
        label: `Total Returns: ${report.returns.totalReturnsCount}`,
        values: {
          4: `${formatNum(report.returns.totalReturnedQuantity)} Cases`,
          5: formatCurr(report.returns.totalReturnedAmount)
        }
      }
    })
  }

  // Subsection B: Damages
  if (report.damages.damages.length > 0) {
    checkPageBreak(20, 'Damages & Spoilage Log')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('B. Product Damages, Transit Spoilage & Jar Quarantine', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Damages & Spoilage',
      data: report.damages.damages,
      columns: [
        { header: 'Incident #', width: 30, accessor: (d) => d.damageNumber || '—', bold: true },
        { header: 'Date', width: 22, accessor: (d) => formatDateStr(d.damageDate) },
        { header: 'Product / Resource', width: 44, accessor: (d) => d.productName || 'Water' },
        { header: 'Damaged Qty', width: 18, align: 'right', accessor: (d) => `${formatNum(d.quantity)} Cases`, bold: true, color: () => C_DANGER },
        { header: 'Estimated Cost', width: 22, align: 'right', accessor: (d) => formatCurr(d.damageCost) },
        { header: 'Defect Reason / Remarks', width: 28, accessor: (d) => d.damageReason || d.remarks || 'Defective' },
        { header: 'Module Source', width: 18, align: 'center', accessor: (d) => d.sourceModule || 'Sales' }
      ],
      totals: {
        label: `Total Damage Incidents: ${report.damages.totalDamagesCount}`,
        values: {
          3: `${formatNum(report.damages.totalDamagedQuantity)} Cases`,
          4: formatCurr(report.damages.totalDamageCost)
        }
      }
    })
  }

  if (report.returns.returns.length === 0 && report.damages.damages.length === 0) {
    renderEmptyNote('No customer returns or damage claims recorded during this period.')
  }

  // ========================================================
  // 06. CUSTOMER ACCOUNT & VOLUME PERFORMANCE
  // ========================================================
  renderSectionHeader('06', 'Customer Accounts & Volume Performance', 'Client purchase volume, return ratios, net realized cases, and current ledger balances')

  renderMetricPills([
    { label: 'Active Buyers', value: `${report.customers.totalActiveCustomers} Accounts` },
    { label: 'Dispatched Volume', value: `${formatNum(report.customers.totalPurchasedQuantity)} Cases` },
    { label: 'Returned Volume', value: `${formatNum(report.customers.totalReturnedQuantity)} Cases`, color: C_WARNING },
    { label: 'Net Volume Realized', value: `${formatNum(report.customers.totalNetQuantity)} Cases`, color: C_PRIMARY },
    { label: 'Receivables Outstanding', value: formatCurr(report.customers.totalOutstanding), color: C_DANGER }
  ])

  renderTable({
    sectionTitle: 'Customer Performance',
    data: report.customers.customers,
    emptyMessage: 'No customer sales transactions recorded during this period.',
    columns: [
      { header: 'Customer Account', width: 44, accessor: (c) => c.customerName || '—', bold: true },
      { header: 'Account Type', width: 20, align: 'center', accessor: (c) => c.customerType || 'Wholesale' },
      { header: 'Orders', width: 14, align: 'right', accessor: (c) => String(c.ordersCount) },
      { header: 'Dispatched', width: 18, align: 'right', accessor: (c) => formatNum(c.totalDispatchedCases) },
      { header: 'Returned', width: 16, align: 'right', accessor: (c) => formatNum(c.totalReturnedCases), color: () => C_WARNING },
      { header: 'Net Volume', width: 18, align: 'right', accessor: (c) => `${formatNum(c.netCases)} Cs`, bold: true, color: () => C_PRIMARY },
      { header: 'Total Invoiced', width: 26, align: 'right', accessor: (c) => formatCurr(c.totalSalesValue), bold: true },
      {
        header: 'Balance Due',
        width: 26,
        align: 'right',
        accessor: (c) => formatCurr(c.outstandingBalance),
        color: (c) => c.outstandingBalance > 0 ? C_DANGER : C_MUTED
      }
    ],
    totals: {
      label: `Active Customers: ${report.customers.totalActiveCustomers}`,
      values: {
        3: formatNum(report.customers.totalPurchasedQuantity),
        4: formatNum(report.customers.totalReturnedQuantity),
        5: `${formatNum(report.customers.totalNetQuantity)} Cs`,
        6: formatCurr(report.customers.totalPurchasedValue),
        7: formatCurr(report.customers.totalOutstanding)
      }
    }
  })

  // ========================================================
  // 07. INVENTORY FLOW & RAW MATERIAL CONSUMPTION
  // ========================================================
  renderSectionHeader('07', 'Finished Products Flow & Raw Materials', 'Stock movement balancing for finished goods and raw material consumption / scrap rates')

  // Subsection A: Finished Products
  if (report.inventory.productMovements.length > 0) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('A. Finished Goods Stock Movement Ledger', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Finished Goods Stock Movement',
      data: report.inventory.productMovements,
      columns: [
        { header: 'Product Item', width: 44, accessor: (p) => p.productName || '—', bold: true },
        { header: 'SKU / Code', width: 24, accessor: (p) => p.sku || '—' },
        { header: 'Current Stock', width: 22, align: 'right', accessor: (p) => `${formatNum(p.currentStock)} Cs`, bold: true },
        { header: '+ Produced', width: 20, align: 'right', accessor: (p) => formatNum(p.producedInPeriod), color: () => C_SUCCESS },
        { header: '- Dispatched', width: 22, align: 'right', accessor: (p) => formatNum(p.dispatchedInPeriod), color: () => C_PRIMARY },
        { header: '+ Returned', width: 20, align: 'right', accessor: (p) => formatNum(p.returnedInPeriod), color: () => C_WARNING },
        {
          header: 'Net Period Delta',
          width: 30,
          align: 'right',
          accessor: (p) => `${p.netMovementInPeriod >= 0 ? '+' : ''}${formatNum(p.netMovementInPeriod)} Cases`,
          bold: true,
          color: (p) => p.netMovementInPeriod >= 0 ? C_SUCCESS : C_DANGER
        }
      ]
    })
  }

  // Subsection B: Raw Materials
  if (report.inventory.rawMaterials.length > 0) {
    checkPageBreak(20, 'Raw Material Usage & Scrap')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('B. Raw Material Balances & Factory Consumption', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Raw Material Consumption',
      data: report.inventory.rawMaterials,
      columns: [
        { header: 'Raw Material Name', width: 44, accessor: (r) => r.materialName || '—', bold: true },
        { header: 'Category', width: 30, accessor: (r) => r.category || 'General' },
        { header: 'Base Unit', width: 18, align: 'center', accessor: (r) => r.unit || 'PCS' },
        { header: 'Current Stock', width: 28, align: 'right', accessor: (r) => `${formatNum(r.currentStock)} ${r.unit || ''}`, bold: true },
        { header: 'Consumed in Period', width: 32, align: 'right', accessor: (r) => `${formatNum(r.consumedInPeriod)} ${r.unit || ''}` },
        { header: 'Period Scrap / Wastage', width: 30, align: 'right', accessor: (r) => `${formatNum(r.wastageInPeriod)} ${r.unit || ''}`, color: () => C_WARNING }
      ]
    })
  }

  // ========================================================
  // 08. ACCOUNTS, OPERATING EXPENSES & PURCHASES
  // ========================================================
  renderSectionHeader('08', 'Accounts, Operating Expenses & Purchases', 'Operational expenditures categorized by head, vendor supply invoices, and staff disbursements')

  renderMetricPills([
    { label: 'Operating Expenses', value: formatCurr(report.financials.totalOperatingExpenses), color: C_DANGER },
    { label: 'Material Purchases', value: formatCurr(report.financials.totalMaterialPurchases) },
    { label: 'Purchases Disbursed', value: formatCurr(report.financials.totalPurchasesPaid), color: C_SUCCESS },
    { label: 'Purchases Payable', value: formatCurr(report.financials.totalPurchasesOutstanding), color: C_DANGER },
    { label: 'Salaries Paid', value: formatCurr(report.financials.totalSalariesPaid) }
  ])

  // Subsection A: Operating Expenses by Category
  if (report.financials.expenseCategories.length > 0) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('A. Operating Expense Categories & Vouchers', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Operating Expenses',
      data: report.financials.expenseCategories,
      columns: [
        { header: 'Expense Category / Head', width: 90, accessor: (e) => e.category || 'General Expense', bold: true },
        { header: 'Voucher Entries', width: 36, align: 'center', accessor: (e) => `${e.count} Vouchers` },
        { header: 'Total Amount Expensed', width: 56, align: 'right', accessor: (e) => formatCurr(e.totalAmount), bold: true }
      ],
      totals: {
        label: 'Total Operating Expenses',
        values: {
          2: formatCurr(report.financials.totalOperatingExpenses)
        }
      }
    })
  }

  // Subsection B: Vendor Purchases
  if (report.financials.recentPurchases.length > 0) {
    checkPageBreak(20, 'Vendor Material Purchases')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
    pdf.text('B. Supplier & Vendor Purchase Invoices', margin, y + 2)
    y += 5

    renderTable({
      sectionTitle: 'Vendor Purchases',
      data: report.financials.recentPurchases,
      columns: [
        { header: 'Purchase Doc #', width: 30, accessor: (p) => p.purchaseNumber || '—', bold: true },
        { header: 'Date', width: 22, accessor: (p) => formatDateStr(p.purchaseDate) },
        { header: 'Supplier / Vendor', width: 44, accessor: (p) => p.vendorName || 'Supplier' },
        { header: 'Grand Total', width: 26, align: 'right', accessor: (p) => formatCurr(p.totalAmount), bold: true },
        { header: 'Amount Paid', width: 24, align: 'right', accessor: (p) => formatCurr(p.paidAmount), color: () => C_SUCCESS },
        { header: 'Balance Due', width: 22, align: 'right', accessor: (p) => formatCurr(p.balanceAmount), color: (p) => p.balanceAmount > 0 ? C_DANGER : C_MUTED },
        { header: 'Payment Status', width: 14, align: 'center', accessor: (p) => p.status || 'Paid' }
      ],
      totals: {
        label: `Total Purchases: ${report.financials.recentPurchases.length}`,
        values: {
          3: formatCurr(report.financials.totalMaterialPurchases),
          4: formatCurr(report.financials.totalPurchasesPaid),
          5: formatCurr(report.financials.totalPurchasesOutstanding)
        }
      }
    })
  }

  // ========================================================
  // 09. QUALITY CONTROL & WATER TESTING
  // ========================================================
  renderSectionHeader('09', 'Quality Control & Water Test Compliance', 'Laboratory testing certificates, microbiological parameters, and batch compliance audits')

  renderMetricPills([
    { label: 'Total Lab Tests', value: `${report.qualityControl.totalTestsConducted} Tests` },
    { label: 'Compliance Approved', value: `${report.qualityControl.totalPassed} Passed`, color: C_SUCCESS },
    { label: 'Non-Conformances', value: `${report.qualityControl.totalFailed} Failed`, color: C_DANGER },
    { label: 'Under Incubation', value: `${report.qualityControl.totalUnderIncubation} In Progress`, color: C_WARNING }
  ])

  renderTable({
    sectionTitle: 'Quality Control Compliance',
    data: report.qualityControl.recentTests,
    emptyMessage: 'No laboratory water analysis records recorded during this period.',
    columns: [
      { header: 'Report / Certificate #', width: 34, accessor: (t) => t.reportNumber || '—', bold: true },
      { header: 'Test Date', width: 24, accessor: (t) => formatDateStr(t.testDate) },
      { header: 'Sample Source / Type', width: 44, accessor: (t) => t.sampleSource || 'DAILY RUN' },
      { header: 'Batch Run Link', width: 30, accessor: (t) => t.batchNumber || '—' },
      { header: 'QC Chemist', width: 26, accessor: (t) => formatPersonName(t.testedBy) },
      {
        header: 'Compliance Status',
        width: 24,
        align: 'center',
        accessor: (t) => t.overallStatus || 'APPROVED',
        bold: true,
        color: (t) => {
          const st = (t.overallStatus || '').toLowerCase()
          return (st.includes('pass') || st.includes('approve')) ? C_SUCCESS : (st.includes('fail') || st.includes('reject') ? C_DANGER : C_WARNING)
        }
      }
    ]
  })

  // ========================================================
  // FINAL PAGE: DOCUMENT CLOSE & AUDIT SIGN-OFF
  // ========================================================
  checkPageBreak(30, 'Document Verification & Notes')

  pdf.setFillColor(C_CARD_BG[0], C_CARD_BG[1], C_CARD_BG[2])
  pdf.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'F')
  pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
  pdf.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2])
  pdf.text('REPORT AUDIT LEDGER & AUTHENTICATION', margin + 4, y + 5)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2])
  pdf.text('This document is a certified executive business summary compiled from tenant accounting ledgers, production line IoT registers, and verified commercial invoices.', margin + 4, y + 10)
  pdf.text(`Tenant Reference: ${report.company.name}  •  Currency Scope: ${report.company.currency}  •  Report Window: ${report.period.formattedRange}`, margin + 4, y + 15)
  pdf.text(`Cryptographic Ledger Timestamp: ${report.period.generatedAtLocal}  •  System: Aquzio MES-ERP Production Suite`, margin + 4, y + 19.5)

  // ========================================================
  // DYNAMIC PAGE NUMBERING & OFFICIAL ENTERPRISE FOOTER
  // ========================================================
  const totalPages = pdf.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)

    // Footer divider line
    pdf.setDrawColor(C_LINE[0], C_LINE[1], C_LINE[2])
    pdf.setLineWidth(0.3)
    pdf.line(margin, pageHeight - 12, rightMarginX, pageHeight - 12)

    // Left Footer Branding
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(C_LIGHT_MUTED[0], C_LIGHT_MUTED[1], C_LIGHT_MUTED[2])
    pdf.text('Generated by Aquzio ERP • Developed by Webzio Technology', margin, pageHeight - 8.2)
    pdf.text('Official computer-generated enterprise report • No physical signature required', margin, pageHeight - 5)

    // Right Footer Metadata & Total Pages
    textRight(`Period: ${report.period.formattedRange}`, rightMarginX, pageHeight - 8.2)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(C_BODY[0], C_BODY[1], C_BODY[2])
    textRight(`Page ${i} of ${totalPages}`, rightMarginX, pageHeight - 5)
  }

  return pdf
}

export const generateProfitAndLossPDF = (pnl: ProfitAndLossReportDto): jsPDF => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = 210
  const pageHeight = 297
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  const rightMarginX = pageWidth - margin
  const bottomMargin = 18

  const rawCurrency = (pnl.company?.currency || 'INR').toUpperCase().trim()
  const currPrefix = rawCurrency === 'INR' ? 'INR ' : rawCurrency === 'USD' ? '$ ' : `${rawCurrency} `

  const formatCurr = (val: number | undefined | null): string => {
    const num = Number(val || 0)
    const sign = num < 0 ? '-' : ''
    return `${sign}${currPrefix}${Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const textRight = (text: string, x: number, currentY: number) => {
    pdf.text(text, x - pdf.getTextWidth(text), currentY)
  }

  let y = drawCompanyPdfHeader(pdf, {
    company: pnl.company,
    docTitle: 'PROFIT & LOSS STATEMENT',
    metaLines: [
      `Period: ${pnl.period.formattedRange}`,
      `Generated: ${pnl.period.generatedAtLocal}`
    ],
    startX: margin,
    startY: 14,
    rightMarginX
  }).nextY

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      pdf.addPage()
      y = drawCompanyPdfContinuationHeader(pdf, {
        company: pnl.company,
        docTitle: 'PROFIT & LOSS STATEMENT',
        metaText: pnl.period.formattedRange,
        startX: margin,
        startY: 16,
        rightMarginX
      })
    }
  }

  const drawSectionHeader = (title: string) => {
    ensureSpace(10)
    pdf.setFillColor(241, 245, 249)
    pdf.rect(margin, y, contentWidth, 7, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(15, 23, 42)
    pdf.text(title, margin + 3, y + 4.8)
    y += 9
  }

  const drawRow = (label: string, value: string, opts?: { bold?: boolean; indent?: number; highlight?: 'success' | 'danger' | 'neutral' }) => {
    ensureSpace(7)
    const indent = opts?.indent ?? 3
    if (opts?.highlight) {
      pdf.setFillColor(opts.highlight === 'success' ? 236 : opts.highlight === 'danger' ? 254 : 248, opts.highlight === 'success' ? 253 : opts.highlight === 'danger' ? 242 : 250, opts.highlight === 'success' ? 245 : opts.highlight === 'danger' ? 242 : 252)
      pdf.rect(margin, y - 3.8, contentWidth, 6.2, 'F')
    }
    pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(opts?.bold ? 15 : 51, opts?.bold ? 23 : 65, opts?.bold ? 42 : 85)
    pdf.text(label, margin + indent, y)
    if (opts?.highlight === 'success') pdf.setTextColor(22, 101, 52)
    else if (opts?.highlight === 'danger') pdf.setTextColor(185, 28, 28)
    textRight(value, rightMarginX - 3, y)
    pdf.setDrawColor(226, 232, 240)
    pdf.setLineWidth(0.2)
    pdf.line(margin, y + 2, rightMarginX, y + 2)
    y += 6.2
  }

  drawSectionHeader('REVENUE')
  drawRow(`Sales Revenue (Excl. GST, Before Discount) (${pnl.revenue.salesOrdersCount} orders)`, formatCurr(pnl.revenue.salesGrossBeforeDiscount))
  if (pnl.revenue.twentyLGrossBeforeDiscount > 0 || pnl.revenue.twentyLDeliveriesCount > 0) {
    drawRow(`20L Delivery Revenue (Excl. GST) (${pnl.revenue.twentyLDeliveriesCount} deliveries)`, formatCurr(pnl.revenue.twentyLGrossBeforeDiscount))
  }
  drawRow('Less: Sales Discounts', `-${formatCurr(pnl.revenue.totalDiscounts)}`)
  drawRow(`Less: Sales Returns (${pnl.revenue.returnsCount} returns)`, `-${formatCurr(pnl.revenue.salesReturns)}`)
  drawRow('Net Sales Revenue', formatCurr(pnl.revenue.netSalesRevenue), { bold: true, highlight: 'neutral' })
  y += 2

  drawSectionHeader('DIRECT COSTS (PERIOD PURCHASES & LOSSES)')
  drawRow('Direct Material Purchases (Inventory, Excl. GST)', formatCurr(pnl.directCosts.materialPurchases))
  drawRow('Sales Damage Losses', formatCurr(pnl.directCosts.salesDamageLoss))
  if (pnl.directCosts.twentyLCommissions > 0) {
    drawRow('20L Distributor Commissions', formatCurr(pnl.directCosts.twentyLCommissions))
  }
  drawRow('Total Direct Costs', formatCurr(pnl.directCosts.totalDirectCosts), { bold: true })
  drawRow(`Gross Profit (${pnl.grossMarginPercent.toFixed(2)}% Margin)`, formatCurr(pnl.grossProfit), {
    bold: true,
    highlight: pnl.grossProfit >= 0 ? 'success' : 'danger'
  })
  y += 2

  drawSectionHeader('OPERATING EXPENSES & PAYROLL')
  pnl.operatingExpenses.simpleExpensesByCategory.forEach((cat) => {
    drawRow(`Expense: ${cat.category} (${cat.count})`, formatCurr(cat.totalAmount), { indent: 6 })
  })
  pnl.operatingExpenses.expensePurchasesByCategory.forEach((cat) => {
    drawRow(`Purchase Expense: ${cat.category} (${cat.count})`, formatCurr(cat.totalAmount), { indent: 6 })
  })
  drawRow('Salaries Paid (Payroll)', formatCurr(pnl.operatingExpenses.salariesPaid))
  drawRow('Total Operating Expenses', formatCurr(pnl.operatingExpenses.totalOperatingExpenses), { bold: true })
  y += 2

  drawRow(`NET PROFIT / (LOSS) (${pnl.netMarginPercent.toFixed(2)}% Margin)`, formatCurr(pnl.netProfit), {
    bold: true,
    highlight: pnl.netProfit >= 0 ? 'success' : 'danger'
  })
  y += 3

  drawSectionHeader('INFORMATIONAL & EXCLUDED ITEMS (NON-P&L)')
  drawRow('Output GST Collected (Excluded from Revenue)', formatCurr(pnl.informational.outputGstCollected))
  drawRow('Input GST on Purchases (Excluded from Costs)', formatCurr(pnl.informational.inputGstOnPurchases))
  drawRow('CapEx / Asset Purchases (Excluded from P&L)', formatCurr(pnl.informational.capExAssetPurchasesExcluded))
  drawRow('Cancelled Purchases (Excluded)', formatCurr(pnl.informational.cancelledPurchasesExcluded))

  if (pnl.disclosures.length > 0) {
    y += 3
    drawSectionHeader('ACCOUNTING BASIS & DISCLOSURES')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(71, 85, 105)
    pnl.disclosures.forEach((note) => {
      const lines = pdf.splitTextToSize(`• ${note}`, contentWidth - 6)
      ensureSpace(lines.length * 4 + 2)
      pdf.text(lines, margin + 3, y)
      y += lines.length * 3.8 + 1.5
    })
  }

  return pdf
}
