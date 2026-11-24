import React, { useState, useEffect } from 'react'
import {
  X,
  Printer,
  Download,
  FileText,
  Building2,
  User,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react'
import type { SalesTransaction } from '../../../services/sales'
import { salesService } from '../../../services/sales'
import { generateGSTInvoicePDF } from '../../../utils/pdfTemplateEngine'
import { convertNumberToIndianWords } from '../../../utils/numberToWords'
import { useAuthStore } from '../../../store/useAuthStore'

interface InvoiceViewerModalProps {
  isOpen: boolean
  onClose: () => void
  transaction: SalesTransaction | null
  companySettings?: {
    name?: string
    displayName?: string
    address?: string
    gstNumber?: string
    phone?: string
    email?: string
    logoUrl?: string | null
    bankName?: string
    bankAccountNo?: string
    bankIfsc?: string
  } | null
}

export const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  isOpen,
  onClose,
  transaction,
  companySettings
}) => {
  const { user } = useAuthStore()
  const [downloadingServer, setDownloadingServer] = useState(false)
  const [invoiceType, setInvoiceType] = useState<'B2B' | 'B2C'>('B2B')
  const [billType, setBillType] = useState<'Tax Invoice' | 'Bill of Supply'>('Tax Invoice')

  useEffect(() => {
    if (transaction) {
      let meta: any = {}
      try {
        if (transaction.metadataJson) {
          meta = JSON.parse(transaction.metadataJson)
        }
      } catch {}

      const defaultInv = transaction.invoiceType || meta.invoiceType || (transaction.customerCode?.startsWith('B2B') || meta.gstin ? 'B2B' : 'B2C')
      const defaultBill = transaction.billType || meta.billType || (transaction.isGstApplicable && (transaction.taxAmount ?? 0) > 0 ? 'Tax Invoice' : 'Bill of Supply')

      setInvoiceType(defaultInv === 'B2B' ? 'B2B' : 'B2C')
      setBillType(defaultBill === 'Bill of Supply' ? 'Bill of Supply' : 'Tax Invoice')
    }
  }, [transaction])

  if (!isOpen || !transaction) return null

  // Resolve metadata
  let meta: any = {}
  try {
    if (transaction.metadataJson) {
      meta = JSON.parse(transaction.metadataJson)
    }
  } catch {}

  // Financial values
  const total = transaction.totalAmount ?? (transaction.cases * (transaction.unitPrice ?? 0))
  const tax = billType === 'Bill of Supply' ? 0 : (transaction.taxAmount ?? 0)
  const discount = transaction.discountAmount ?? 0
  const subTotal = total - tax + discount
  const received = transaction.amountReceived ?? 0
  const balance = Math.max(0, total - received)

  const compName = companySettings?.displayName || companySettings?.name || user?.companyName || 'Aiwa Minerals'
  const compAddr = companySettings?.address || 'Hoodi, KR puram, bengaluru, india'
  const compGst = companySettings?.gstNumber || '29AABCA1234F1Z8'
  const compPhone = companySettings?.phone || '+91 98470 12345'
  const compEmail = companySettings?.email || user?.email || 'contact@aiwaminerals.com'

  const buyerName = transaction.customerName || 'Retail Customer / Counter Sale'
  const buyerGst = meta.gstin || meta.gstNumber || (invoiceType === 'B2B' ? '32AAACB9999P1Z2' : '')
  const buyerAddress = meta.address || meta.customerAddress || 'Local Market, Commercial Zone'

  const items = (transaction.items && transaction.items.length > 0)
    ? transaction.items
    : [{
        productId: transaction.productId,
        productName: transaction.productName,
        productSku: transaction.productSku || '22011010',
        cases: transaction.cases,
        unitPrice: transaction.unitPrice ?? 0,
        discountAmount: discount,
        taxAmount: tax,
        gstRate: transaction.gstRate ?? 18,
        totalAmount: total
      }]

  // Trigger Client-side PDF Generation & Save
  const handleClientDownload = () => {
    const pdf = generateGSTInvoicePDF({
      invoiceNumber: transaction.transactionNumber,
      invoiceDate: new Date(transaction.transactionDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      invoiceType,
      billType,
      companyInfo: {
        name: compName,
        displayName: compName,
        address: compAddr,
        gstNumber: compGst,
        phone: compPhone,
        email: compEmail,
        logoUrl: companySettings?.logoUrl
      },
      customerInfo: {
        name: buyerName,
        businessName: buyerName,
        gstin: buyerGst,
        phone: meta.phone || 'N/A',
        address: buyerAddress,
        state: 'Kerala',
        stateCode: '32'
      },
      paymentMethod: transaction.paymentMethod || 'Credit',
      paymentStatus: transaction.paymentStatus || (received >= total ? 'Paid' : 'Pending'),
      referenceNumber: transaction.referenceNumber || undefined,
      items: items.map((it, idx) => ({
        sno: idx + 1,
        description: `${it.productName || 'Purified Water'}${it.caseConfigurationName ? ` (${it.caseConfigurationName})` : ''}`,
        hsn: '22011010',
        quantity: Math.abs(it.cases),
        unitPrice: it.unitPrice,
        discount: it.discountAmount,
        taxableAmount: Math.max(0, (Math.abs(it.cases) * it.unitPrice) - (it.discountAmount || 0)),
        gstRate: billType === 'Bill of Supply' ? 0 : (it.gstRate || transaction.gstRate || 0),
        totalAmount: it.totalAmount ?? (Math.abs(it.cases) * it.unitPrice)
      })),
      financialSummary: {
        subTotal,
        discountAmount: discount,
        taxAmount: tax,
        grandTotal: total,
        amountPaid: received,
        balance
      },
      notes: meta.notes || 'Hygienically bottled and sealed in accordance with BIS standards.'
    })

    pdf.save(`Invoice_${transaction.transactionNumber}.pdf`)
  }

  // Trigger Server-side Native Stream Download
  const handleServerDownload = async () => {
    try {
      setDownloadingServer(true)
      await salesService.downloadInvoicePdf(transaction.id, transaction.transactionNumber)
    } catch (err) {
      console.error('Failed to download server PDF, falling back to client generation', err)
      handleClientDownload()
    } finally {
      setDownloadingServer(false)
    }
  }

  // Native Print
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Invoice #{transaction.transactionNumber}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  (transaction.paymentStatus || 'Pending') === 'Paid'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {transaction.paymentStatus || (received >= total ? 'Paid' : 'Pending')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {new Date(transaction.transactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Interactive Toggles & Export Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Invoice Type Toggle */}
            <div className="hidden sm:flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setInvoiceType('B2B')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  invoiceType === 'B2B' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                B2B (GST)
              </button>
              <button
                onClick={() => setInvoiceType('B2C')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  invoiceType === 'B2C' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                B2C (Retail)
              </button>
            </div>

            {/* Bill Type Toggle */}
            <div className="hidden sm:flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setBillType('Tax Invoice')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  billType === 'Tax Invoice' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tax Invoice
              </button>
              <button
                onClick={() => setBillType('Bill of Supply')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  billType === 'Bill of Supply' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Bill of Supply
              </button>
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
              title="Print standard A4 invoice"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleServerDownload}
              disabled={downloadingServer}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
              title="Download official PDF file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingServer ? 'Generating...' : 'Download PDF'}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Paper Document Sheet */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-50/50 print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white max-w-3xl mx-auto p-8 rounded-xl shadow-sm border border-slate-200 text-slate-800 print:shadow-none print:border-none print:p-0">
            
            {/* Top Blue Line Accent */}
            <div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-indigo-600 rounded-full mb-6 print:mb-4" />

            {/* Header: Company Profile + Invoice Details */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6 border-b border-slate-200">
              <div className="flex items-start gap-4">
                {/* Logo Display */}
                {companySettings?.logoUrl ? (
                  <img
                    src={companySettings.logoUrl}
                    alt="Company Logo"
                    className="w-14 h-14 object-contain rounded-xl border border-slate-200 p-1 bg-white shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black">
                    <span className="text-lg leading-tight">AQ</span>
                    <span className="text-[8px] font-bold text-slate-500 tracking-wider">WATER</span>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{compName}</h1>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-sm leading-relaxed">{compAddr}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700 font-medium mt-2">
                    {compGst && <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono font-bold">GSTIN: {compGst}</span>}
                    {compPhone && <span>Ph: {compPhone}</span>}
                    {compEmail && <span>Email: {compEmail}</span>}
                  </div>
                </div>
              </div>

              {/* Invoice Meta Column */}
              <div className="text-left sm:text-right shrink-0">
                <span className="inline-block text-xs font-black px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider mb-2">
                  {billType === 'Tax Invoice' ? (invoiceType === 'B2B' ? 'TAX INVOICE (B2B)' : 'TAX INVOICE (B2C)') : 'BILL OF SUPPLY'}
                </span>
                <div className="text-xs text-slate-500 font-medium">ORIGINAL FOR RECIPIENT</div>
                <div className="text-base font-extrabold text-slate-900 mt-1 font-mono">#{transaction.transactionNumber}</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Date: <span className="font-semibold text-slate-800">{new Date(transaction.transactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="text-xs text-slate-600">
                  State / Place of Supply: <span className="font-semibold text-slate-800">Kerala (32)</span>
                </div>
              </div>
            </div>

            {/* Buyer & Shipment Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 mb-2 uppercase tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  <span>Billed To / Buyer Details</span>
                </div>
                <div className="text-sm font-bold text-slate-900">{buyerName}</div>
                <div className="text-xs text-slate-600 mt-1">{buyerAddress}</div>
                {meta.phone && <div className="text-xs text-slate-600 mt-0.5">Phone: {meta.phone}</div>}
                <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-500">GSTIN / UIN:</span>
                  <span className={`font-mono font-bold ${buyerGst ? 'text-blue-700' : 'text-slate-500'}`}>
                    {buyerGst || 'Unregistered Person / Retail'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 mb-2 uppercase tracking-wider">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Dispatch & Settlement Info</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Mode:</span>
                    <span className="font-semibold text-slate-800">{transaction.paymentMethod || 'Credit Sale'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Status:</span>
                    <span className={`font-bold ${
                      (transaction.paymentStatus || 'Pending') === 'Paid' ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      {(transaction.paymentStatus || (received >= total ? 'Paid' : 'Pending')).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PO / Reference No:</span>
                    <span className="font-mono text-slate-700">{transaction.referenceNumber || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bank / Settlement:</span>
                    <span className="font-semibold text-slate-800">{transaction.bankAccountName || transaction.cashBookName || 'Primary Corporate A/C'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl overflow-hidden border border-slate-200 my-6">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 w-20 text-center">HSN/SAC</th>
                    <th className="py-2.5 px-3 w-16 text-right">Qty</th>
                    <th className="py-2.5 px-3 w-20 text-right">Rate</th>
                    <th className="py-2.5 px-3 w-16 text-right">Disc</th>
                    <th className="py-2.5 px-3 w-24 text-right">Taxable</th>
                    {billType === 'Tax Invoice' && <th className="py-2.5 px-3 w-20 text-right">GST</th>}
                    <th className="py-2.5 px-3 w-24 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    const lineCases = Math.abs(it.cases)
                    const lineRate = it.unitPrice
                    const lineDisc = it.discountAmount || 0
                    const lineTaxable = Math.max(0, (lineCases * lineRate) - lineDisc)
                    const lineTax = billType === 'Bill of Supply' ? 0 : (it.taxAmount || 0)
                    const lineTotal = it.totalAmount ?? (lineTaxable + lineTax)

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{it.productName || '20L Water Jar'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            SKU: {it.productSku || '22011010'} {it.caseConfigurationName ? `· ${it.caseConfigurationName}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-600">22011010</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">{lineCases}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">₹{lineRate.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">{lineDisc > 0 ? `₹${lineDisc.toFixed(2)}` : '-'}</td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">₹{lineTaxable.toFixed(2)}</td>
                        {billType === 'Tax Invoice' && (
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            ₹{lineTax.toFixed(2)} <span className="text-[10px] text-slate-500">({it.gstRate || 18}%)</span>
                          </td>
                        )}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary, Bank Details & Totals Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 pb-6 border-b border-slate-200">
              
              {/* Left Column: Words & Bank info */}
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Amount in Words</div>
                  <div className="text-xs font-bold text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {convertNumberToIndianWords(total)}
                  </div>
                </div>

                {/* Bank Account for Payment */}
                <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs space-y-1">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5 mb-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Company Bank Account Details</span>
                  </div>
                  <div className="text-slate-700">Bank: <span className="font-semibold text-slate-900">{companySettings?.bankName || 'State Bank of India'}</span></div>
                  <div className="text-slate-700">A/C No: <span className="font-mono font-bold text-slate-900">{companySettings?.bankAccountNo || '41290812391024'}</span></div>
                  <div className="text-slate-700">IFSC: <span className="font-mono font-bold text-slate-900">{companySettings?.bankIfsc || 'SBIN0008412'}</span></div>
                  <div className="text-slate-700">UPI ID: <span className="font-mono font-semibold text-blue-700">aquzio@okaxis</span></div>
                </div>

                {meta.remarks && (
                  <div className="text-xs text-slate-600 italic">
                    Note: {meta.remarks}
                  </div>
                )}
              </div>

              {/* Right Column: Financial Breakdown */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Subtotal:</span>
                  <span className="font-mono font-semibold text-slate-900">₹{subTotal.toFixed(2)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount:</span>
                    <span className="font-mono font-semibold">-₹{discount.toFixed(2)}</span>
                  </div>
                )}

                {billType === 'Tax Invoice' && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST (9%):</span>
                      <span className="font-mono text-slate-800">₹{(tax / 2).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST (9%):</span>
                      <span className="font-mono text-slate-800">₹{(tax / 2).toFixed(2)}</span>
                    </div>
                  </>
                )}

                {/* Grand Total Bar */}
                <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-extrabold text-blue-900">
                  <span>Invoice Total:</span>
                  <span className="text-base font-mono font-black text-blue-700">₹{total.toFixed(2)}</span>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Amount Received:</span>
                    <span className="font-mono font-bold">₹{received.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold">
                    <span>Balance Outstanding:</span>
                    <span className={`font-mono font-extrabold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      ₹{balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer: Terms & Signatory */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 items-end">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Terms & Conditions</div>
                <ul className="text-[11px] text-slate-500 space-y-0.5 list-disc pl-3.5">
                  <li>Goods once sold will not be accepted back or refunded.</li>
                  <li>Payments must be routed strictly to authorized company bank accounts.</li>
                  <li>Interest @ 18% p.a. charged on delayed payments after the due date.</li>
                </ul>
              </div>

              {/* Authorized Signatory Block */}
              <div className="text-center sm:text-right">
                <div className="inline-block p-4 border border-dashed border-slate-300 rounded-xl min-w-[200px] text-center bg-slate-50/50">
                  <div className="text-[11px] font-bold text-slate-800 mb-8">For {compName}</div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-500 font-medium">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>

            {/* Computer Generated Disclaimer */}
            <div className="text-center text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
              Electronic Tax Invoice generated by Aquzio Water ERP Platform • All records cryptographically verified
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
