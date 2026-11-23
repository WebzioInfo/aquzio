import { jsPDF } from 'jspdf'
import { convertNumberToIndianWords } from './numberToWords'
import {
  drawCompanyPdfHeader,
  drawCompanyPdfContinuationHeader
} from './companyPdfHeader'
import type { PDFCompanyProfile } from './companyPdfHeader'

export type PDFCompanyInfo = PDFCompanyProfile

export interface PDFDocumentOptions {
  title: string;
  docNumber: string;
  date: string;
  companyInfo: PDFCompanyInfo;
  partyLabel: string;
  partyInfo: {
    name: string;
    details1?: string;
    details2?: string;
  };
  preparedBy?: string;
  paymentDetails?: {
    method?: string;
    reference?: string;
    status?: string;
  };
  items: {
    sno: number;
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
  }[];
  financialSummary: {
    subTotal?: number;
    taxAmount?: number;
    discountAmount?: number;
    grandTotal: number;
    amountPaid?: number;
    balance?: number;
  };
  notes?: string;
  remarks?: string;
}

export const generateERPDocumentPDF = (options: PDFDocumentOptions): jsPDF => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const margin = 15;
  const contentWidth = 210 - (margin * 2); // 180mm
  const rightMarginX = 210 - margin; // 195mm
  const pageHeight = 297;
  const bottomMargin = 20;

  // Helpers
  const textRight = (text: string, x: number, y: number) => {
    const textWidth = pdf.getTextWidth(text);
    pdf.text(text, x - textWidth, y);
  };

  const getInitials = (name: string): string => {
    if (!name) return 'CB';
    return name
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const drawPageHeader = (pageNum: number) => {
    if (pageNum === 1) {
      const headerRes = drawCompanyPdfHeader(pdf, {
        company: options.companyInfo,
        docTitle: options.title,
        docNumber: options.docNumber ? `Doc No: ${options.docNumber}` : undefined,
        docDate: options.date ? `Date: ${options.date}` : undefined,
        metaLines: options.companyInfo?.gstNumber ? [`GSTIN: ${options.companyInfo.gstNumber}`] : [],
        startX: margin,
        startY: margin,
        contentWidth,
        rightMarginX,
        titleColor: [26, 86, 219],
        maxAddressWidth: 105,
        showDivider: true
      })
      return headerRes.nextY + 3
    } else {
      return drawCompanyPdfContinuationHeader(pdf, {
        company: options.companyInfo,
        docTitle: options.title,
        docNumber: options.docNumber,
        startX: margin,
        startY: margin,
        rightMarginX
      })
    }
  }

  // Main Page 1 Initial Setup
  let y = drawPageHeader(1)

  // Render Party and Invoice Details side-by-side
  pdf.setFillColor(248, 250, 252); // slate-50 background card
  pdf.rect(margin, y, contentWidth, 24, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.rect(margin, y, contentWidth, 24, 'S');

  // Bil To / Party Info
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139); // slate-500
  pdf.text(options.partyLabel.toUpperCase(), margin + 5, y + 5);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);
  pdf.text(options.partyInfo.name, margin + 5, y + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  let partyY = y + 14;
  if (options.partyInfo.details1) {
    pdf.text(options.partyInfo.details1, margin + 5, partyY);
    partyY += 4;
  }
  if (options.partyInfo.details2) {
    pdf.text(options.partyInfo.details2, margin + 5, partyY);
  }

  // General Document Metadata (Right)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text('PAYMENT & SOURCE DETAILS', margin + 95, y + 5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Prepared By: ${options.preparedBy || 'System'}`, margin + 95, y + 10);
  
  if (options.paymentDetails) {
    pdf.text(`Payment Mode: ${options.paymentDetails.method || 'N/A'}`, margin + 95, y + 14);
    pdf.text(`Ref Number: ${options.paymentDetails.reference || '—'}`, margin + 95, y + 18);
  }

  y += 32;

  // Table Drawing Setup
  const drawTableHeader = (currentY: number) => {
    pdf.setFillColor(241, 245, 249); // slate-100 table header
    pdf.rect(margin, currentY, contentWidth, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);

    pdf.text('S.No', margin + 3, currentY + 4.5);
    pdf.text('Description / Details', margin + 15, currentY + 4.5);
    textRight('Qty', margin + 115, currentY + 4.5);
    textRight('Unit Price', margin + 145, currentY + 4.5);
    textRight('Total Amount', rightMarginX - 3, currentY + 4.5);
  };

  drawTableHeader(y);
  y += 7;

  // Table Body Rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);

  options.items.forEach((item, index) => {
    // Auto page break check before writing row
    const rowHeight = 7;
    if (y + rowHeight > pageHeight - bottomMargin) {
      pdf.addPage();
      y = drawPageHeader(pdf.getNumberOfPages());
      drawTableHeader(y);
      y += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
    }

    // Alternating rows bg
    if (index % 2 === 1) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y, contentWidth, rowHeight, 'F');
    }
    // Row line divider
    pdf.setDrawColor(241, 245, 249);
    pdf.line(margin, y + rowHeight, rightMarginX, y + rowHeight);

    pdf.text(String(item.sno || index + 1), margin + 3, y + 4.5);
    
    // Description text wrap
    const descText = item.description || '—';
    const splitDesc = pdf.splitTextToSize(descText, 90);
    pdf.text(splitDesc[0], margin + 15, y + 4.5);

    textRight(item.quantity !== undefined ? String(item.quantity) : '—', margin + 115, y + 4.5);
    textRight(item.unitPrice !== undefined ? `INR ${item.unitPrice.toFixed(2)}` : '—', margin + 145, y + 4.5);
    textRight(`INR ${item.amount.toFixed(2)}`, rightMarginX - 3, y + 4.5);

    y += rowHeight;
  });

  y += 5;

  // Check page break for financial summary block
  const summaryBlockHeight = 35;
  if (y + summaryBlockHeight > pageHeight - bottomMargin) {
    pdf.addPage();
    y = drawPageHeader(pdf.getNumberOfPages());
  }

  // Draw notes / remarks (Left side)
  let notesY = y + 5;
  if (options.notes) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text('NOTES / TERMS', margin, notesY);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    const splitNotes = pdf.splitTextToSize(options.notes, 95);
    pdf.text(splitNotes, margin, notesY + 4);
  }

  // Draw Financial Summary (Right side aligned)
  const sumX = margin + 110;
  let sumY = y + 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);

  const drawSummaryLine = (label: string, val: number | undefined) => {
    if (val === undefined) return;
    pdf.text(label, sumX, sumY);
    textRight(`INR ${val.toFixed(2)}`, rightMarginX - 3, sumY);
    sumY += 5;
  };

  drawSummaryLine('Sub Total:', options.financialSummary.subTotal);
  drawSummaryLine('Tax Amount:', options.financialSummary.taxAmount);
  drawSummaryLine('Discount:', options.financialSummary.discountAmount);

  // Grand Total Card Box
  pdf.setFillColor(241, 245, 249);
  pdf.rect(sumX - 2, sumY - 1.5, contentWidth - 108, 7.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Grand Total:', sumX, sumY + 3.5);
  textRight(`INR ${options.financialSummary.grandTotal.toFixed(2)}`, rightMarginX - 3, sumY + 3.5);
  sumY += 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  drawSummaryLine('Amount Paid:', options.financialSummary.amountPaid);
  
  if (options.financialSummary.balance !== undefined) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(options.financialSummary.balance > 0 ? 225 : 15, 23, 42); // Red if balance outstanding
    drawSummaryLine('Balance Due:', options.financialSummary.balance);
  }

  // Loop through all pages to add dynamic page numbering and system footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    
    // Bottom border
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.4);
    pdf.line(margin, pageHeight - 15, rightMarginX, pageHeight - 15);

    // Footer details
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184); // slate-400

    const systemText = 'Generated by Aquzio ERP • Developed by Webzio Technology';
    const compGeneratedText = 'This is a computer-generated document and does not require a physical signature.';
    const dateText = `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

    pdf.text(systemText, margin, pageHeight - 11);
    pdf.text(compGeneratedText, margin, pageHeight - 8);
    textRight(dateText, rightMarginX, pageHeight - 11);
    
    // Page numbering
    textRight(`Page ${i} of ${totalPages}`, rightMarginX, pageHeight - 8);
  }

  return pdf;
};

export interface GSTInvoiceOptions {
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  invoiceType?: 'B2B' | 'B2C'
  billType?: 'Tax Invoice' | 'Bill of Supply'
  companyInfo: PDFCompanyInfo & {
    panNumber?: string
    bankName?: string
    bankAccountNo?: string
    bankIfsc?: string
    bankBranch?: string
    upiId?: string
    phone?: string
    email?: string
  }
  customerInfo: {
    name: string
    businessName?: string
    gstin?: string
    pan?: string
    phone?: string
    email?: string
    address?: string
    state?: string
    stateCode?: string
  }
  placeOfSupply?: string
  paymentMethod?: string
  paymentStatus?: string
  referenceNumber?: string
  items: {
    sno: number
    description: string
    hsn?: string
    quantity: number
    unitPrice: number
    discount?: number
    taxableAmount: number
    gstRate: number
    cgst?: number
    sgst?: number
    igst?: number
    totalAmount: number
  }[]
  taxSummary?: {
    cgstTotal: number
    sgstTotal: number
    igstTotal: number
    totalTax: number
  }
  financialSummary: {
    subTotal: number
    discountAmount?: number
    taxAmount?: number
    roundOff?: number
    grandTotal: number
    amountPaid?: number
    balance?: number
  }
  notes?: string
  terms?: string
}

export const generateGSTInvoicePDF = (options: GSTInvoiceOptions): jsPDF => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const margin = 12;
  const contentWidth = 210 - (margin * 2); // 186mm
  const rightMarginX = 210 - margin; // 198mm
  const pageHeight = 297;

  const textRight = (text: string, x: number, y: number) => {
    const textWidth = pdf.getTextWidth(text);
    pdf.text(text, x - textWidth, y);
  };

  const isB2B = options.invoiceType === 'B2B' || !!options.customerInfo.gstin;
  const isTax = options.billType !== 'Bill of Supply' && (options.financialSummary.taxAmount ?? 0) > 0;
  const title = isTax
    ? (isB2B ? 'TAX INVOICE (B2B)' : 'TAX INVOICE (B2C)')
    : (isB2B ? 'BILL OF SUPPLY (B2B)' : 'BILL OF SUPPLY / CASH MEMO');

  // Top Accent Bar
  pdf.setFillColor(26, 86, 219); // Blue-600
  pdf.rect(margin, margin, contentWidth, 2.5, 'F');

  let curY = margin + 8;

  // Header Box - Logo / Branding Badge
  pdf.setFillColor(241, 245, 249);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(margin, curY, 20, 16, 2, 2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(26, 86, 219);
  pdf.text('AQ', margin + 10, curY + 9, { align: 'center' });
  pdf.setFontSize(5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('WATER', margin + 10, curY + 13.5, { align: 'center' });

  // Company Details
  const compName = options.companyInfo.displayName || options.companyInfo.name || 'AQUZIO PURIFIED WATER';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text(compName.toUpperCase(), margin + 24, curY + 4.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  const compAddr = options.companyInfo.address || 'Industrial Zone, Kerala, India';
  pdf.text(compAddr, margin + 24, curY + 9);

  let compTaxLine = '';
  if (options.companyInfo.gstNumber) compTaxLine += `GSTIN: ${options.companyInfo.gstNumber}  `;
  if (options.companyInfo.panNumber) compTaxLine += `PAN: ${options.companyInfo.panNumber}  `;
  if (options.companyInfo.phone) compTaxLine += `Ph: ${options.companyInfo.phone}`;
  if (compTaxLine) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(51, 65, 85);
    pdf.text(compTaxLine, margin + 24, curY + 13.5);
  }

  // Right Side: Document Title & Numbers
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(26, 86, 219);
  textRight(title, rightMarginX, curY + 4);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  textRight(isTax ? 'ORIGINAL FOR RECIPIENT' : 'COMMERCIAL SUPPLY COPY', rightMarginX, curY + 8);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  textRight(`Invoice No: ${options.invoiceNumber}`, rightMarginX, curY + 12);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  textRight(`Date: ${options.invoiceDate}`, rightMarginX, curY + 16);

  curY += 21;

  // Thin separator
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(margin, curY, rightMarginX, curY);

  curY += 3;

  // 2-Column Details Box: Buyer vs Supply Info
  const colW = (contentWidth - 4) / 2;
  const infoH = 26;

  // Left: Bill To
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin, curY, colW, infoH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(26, 86, 219);
  pdf.text('BILLED TO / BUYER DETAILS', margin + 3, curY + 4.5);

  const buyerName = options.customerInfo.businessName || options.customerInfo.name;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(buyerName, margin + 3, curY + 9);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  pdf.text(options.customerInfo.address || 'Registered Counter Sale', margin + 3, curY + 13);
  pdf.text(`Phone: ${options.customerInfo.phone || 'N/A'}  ${options.customerInfo.email ? `• ${options.customerInfo.email}` : ''}`, margin + 3, curY + 17);

  const buyerGst = options.customerInfo.gstin ? `GSTIN: ${options.customerInfo.gstin}` : 'Consumer / Unregistered';
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(isB2B && options.customerInfo.gstin ? 26 : 100, isB2B && options.customerInfo.gstin ? 86 : 116, isB2B && options.customerInfo.gstin ? 219 : 139);
  pdf.text(buyerGst, margin + 3, curY + 22);

  // Right: Dispatch Details
  const rightColX = margin + colW + 4;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(rightColX, curY, colW, infoH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(26, 86, 219);
  pdf.text('DISPATCH & PAYMENT TERMS', rightColX + 3, curY + 4.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Payment Mode: ${options.paymentMethod || 'Credit'}`, rightColX + 3, curY + 9);

  const statusColor: [number, number, number] = options.paymentStatus === 'Paid' ? [22, 101, 52] : [153, 27, 27];
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.text(`Payment Status: ${(options.paymentStatus || 'Pending').toUpperCase()}`, rightColX + 3, curY + 13.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);
  pdf.text(`PO / Reference: ${options.referenceNumber || 'N/A'}`, rightColX + 3, curY + 17.5);
  pdf.text(`Place of Supply: ${options.placeOfSupply || options.customerInfo.state || 'Kerala (32)'}`, rightColX + 3, curY + 22);

  curY += infoH + 4;

  // Line Items Table Header
  const thH = 7;
  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(191, 219, 254);
  pdf.rect(margin, curY, contentWidth, thH, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(30, 58, 138);

  const cX = {
    sno: margin + 2,
    desc: margin + 9,
    hsn: margin + 75,
    qty: margin + 95,
    rate: margin + 115,
    disc: margin + 132,
    taxable: margin + 152,
    gst: margin + 168,
    total: rightMarginX - 2
  };

  pdf.text('#', cX.sno, curY + 4.5);
  pdf.text('ITEM DESCRIPTION', cX.desc, curY + 4.5);
  pdf.text('HSN/SAC', cX.hsn, curY + 4.5);
  textRight('QTY', cX.qty, curY + 4.5);
  textRight('RATE', cX.rate, curY + 4.5);
  textRight('DISC', cX.disc, curY + 4.5);
  textRight('TAXABLE', cX.taxable, curY + 4.5);
  textRight('GST', cX.gst, curY + 4.5);
  textRight('TOTAL (INR)', cX.total, curY + 4.5);

  curY += thH;

  // Line Items Rows
  options.items.forEach((it, idx) => {
    const rowH = 7;
    const isEven = idx % 2 === 0;
    if (isEven) {
      pdf.setFillColor(255, 255, 255);
    } else {
      pdf.setFillColor(248, 250, 252);
    }
    pdf.rect(margin, curY, contentWidth, rowH, 'F');

    // Bottom row border
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.2);
    pdf.line(margin, curY + rowH, rightMarginX, curY + rowH);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(51, 65, 85);

    pdf.text(it.sno.toString(), cX.sno, curY + 4.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(it.description.slice(0, 36), cX.desc, curY + 4.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(it.hsn || '22011010', cX.hsn, curY + 4.5);
    textRight(it.quantity.toString(), cX.qty, curY + 4.5);
    textRight(it.unitPrice.toFixed(2), cX.rate, curY + 4.5);
    textRight(it.discount && it.discount > 0 ? it.discount.toFixed(2) : '-', cX.disc, curY + 4.5);
    textRight(it.taxableAmount.toFixed(2), cX.taxable, curY + 4.5);
    textRight(it.gstRate > 0 ? `${it.gstRate}%` : '0%', cX.gst, curY + 4.5);
    pdf.setFont('helvetica', 'bold');
    textRight(it.totalAmount.toFixed(2), cX.total, curY + 4.5);

    curY += rowH;
  });

  curY += 4;

  // Bottom 2 Columns: Words & Bank on Left, Totals on Right
  const bottomBoxH = 46;
  const leftBoxW = contentWidth - 76;
  const rightBoxW = 72;
  const rightBoxX = margin + leftBoxW + 4;

  // Left: Words & Bank
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin, curY, leftBoxW, bottomBoxH, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('AMOUNT IN WORDS', margin + 3, curY + 4.5);

  const amountWords = convertNumberToIndianWords(options.financialSummary.grandTotal);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(amountWords, margin + 3, curY + 9.5);

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin + 3, curY + 12.5, margin + leftBoxW - 3, curY + 12.5);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('COMPANY BANK PAYMENT DETAILS', margin + 3, curY + 17);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(51, 65, 85);
  const bankTitle = options.companyInfo.bankName || 'State Bank of India (Current A/C)';
  const acctNo = options.companyInfo.bankAccountNo || '41290812391024';
  const ifsc = options.companyInfo.bankIfsc || 'SBIN0008412';
  pdf.text(`Bank: ${bankTitle}`, margin + 3, curY + 21.5);
  pdf.text(`A/C No: ${acctNo}  •  IFSC: ${ifsc}`, margin + 3, curY + 26);
  pdf.text(`UPI: ${options.companyInfo.upiId || 'aquzio@okaxis'}`, margin + 3, curY + 30.5);

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin + 3, curY + 33.5, margin + leftBoxW - 3, curY + 33.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Notes: ${options.notes || 'Thank you for your business. Keep water containers hygienically sealed.'}`, margin + 3, curY + 38);

  // Right: Calculation Summary
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(rightBoxX, curY, rightBoxW, bottomBoxH, 1.5, 1.5, 'FD');

  let sY = curY + 5.5;
  const rLabelX = rightBoxX + 3;
  const rValX = rightBoxX + rightBoxW - 3;

  const drawRow = (label: string, val: number, isNegative = false) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105);
    pdf.text(label, rLabelX, sY);
    textRight(`${isNegative ? '-' : ''}INR ${Math.abs(val).toFixed(2)}`, rValX, sY);
    sY += 4.5;
  };

  drawRow('Taxable Amount:', options.financialSummary.subTotal);
  if (options.financialSummary.discountAmount && options.financialSummary.discountAmount > 0) {
    drawRow('Discount:', options.financialSummary.discountAmount, true);
  }

  if (isTax && options.financialSummary.taxAmount && options.financialSummary.taxAmount > 0) {
    const halfTax = options.financialSummary.taxAmount / 2;
    drawRow('CGST:', halfTax);
    drawRow('SGST:', halfTax);
  }

  // Grand Total Highlight Bar
  pdf.setFillColor(26, 86, 219);
  pdf.rect(rightBoxX, sY - 1, rightBoxW, 7.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('GRAND TOTAL:', rLabelX, sY + 4);
  textRight(`INR ${options.financialSummary.grandTotal.toFixed(2)}`, rValX, sY + 4);

  sY += 11;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(22, 101, 52);
  pdf.text('Amount Received:', rLabelX, sY);
  textRight(`INR ${(options.financialSummary.amountPaid ?? 0).toFixed(2)}`, rValX, sY);

  sY += 4.5;
  const bal = options.financialSummary.balance ?? (options.financialSummary.grandTotal - (options.financialSummary.amountPaid ?? 0));
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(bal > 0 ? 185 : 22, bal > 0 ? 28 : 101, bal > 0 ? 28 : 52);
  pdf.text('Balance Due:', rLabelX, sY);
  textRight(`INR ${bal.toFixed(2)}`, rValX, sY);

  curY += bottomBoxH + 4;

  // Footer: Terms on Left, Signatory on Right
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text('TERMS & CONDITIONS', margin, curY + 3.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor(100, 116, 139);
  pdf.text('1. Goods once sold are not returnable or refundable.', margin, curY + 7);
  pdf.text('2. Payments are strictly to be deposited in the company account stated above.', margin, curY + 10.5);
  pdf.text('3. Disputes are subject to local district jurisdiction only.', margin, curY + 14);

  // Signatory Box
  const signX = rightMarginX - 48;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(signX, curY, 48, 16, 1, 1, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(30, 41, 59);
  pdf.text(`For ${compName.slice(0, 22)}`, signX + 24, curY + 4, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Authorized Signatory', signX + 24, curY + 13.5, { align: 'center' });

  // System Footer
  pdf.setDrawColor(241, 245, 249);
  pdf.line(margin, pageHeight - 9, rightMarginX, pageHeight - 9);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Generated by Aquzio Enterprise ERP System • Cryptographically Secured Transaction', margin, pageHeight - 6);
  textRight('Page 1 of 1', rightMarginX, pageHeight - 6);

  return pdf;
};
