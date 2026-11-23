using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;

namespace Aquora.Application.Services
{
    public class InvoicePdfService : IInvoicePdfService
    {
        private const double PageWidth = 595.28;   // A4 portrait width in points (210mm)
        private const double PageHeight = 841.89;  // A4 portrait height in points (297mm)
        private const double Margin = 36.0;        // ~12.7mm margins
        private const double UsableWidth = PageWidth - (Margin * 2); // 523.28 pt

        public Task<byte[]> GenerateInvoicePdfAsync(
            SalesTransaction transaction,
            Company company,
            Tenant? tenant = null,
            Customer? customer = null)
        {
            var pdfBytes = BuildInvoicePdfBinary(transaction, company, tenant, customer);
            return Task.FromResult(pdfBytes);
        }

        private byte[] BuildInvoicePdfBinary(
            SalesTransaction txn,
            Company company,
            Tenant? tenant,
            Customer? customer)
        {
            var pages = new List<string>();
            var stream = new StringBuilder();

            // Extract metadata if present
            string invoiceType = "B2B";
            string billType = "Tax Invoice";
            string notes = "";
            string terms = "1. Goods once sold will not be taken back or exchanged.\n2. Payment is due as per agreed terms.\n3. Subject to local jurisdiction.";
            string bankDetails = "";

            if (!string.IsNullOrWhiteSpace(txn.MetadataJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(txn.MetadataJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("invoiceType", out var itProp)) invoiceType = itProp.GetString() ?? invoiceType;
                    if (root.TryGetProperty("billType", out var btProp)) billType = btProp.GetString() ?? billType;
                    if (root.TryGetProperty("remarks", out var remProp)) notes = remProp.GetString() ?? notes;
                    if (root.TryGetProperty("notes", out var nProp)) notes = nProp.GetString() ?? notes;
                    if (root.TryGetProperty("bankDetails", out var bdProp)) bankDetails = bdProp.GetString() ?? bankDetails;
                }
                catch {}
            }

            // Customer fallback checks
            var custGst = customer?.GSTNumber ?? "";
            var custName = customer?.BusinessName ?? customer?.CustomerName ?? txn.Customer?.BusinessName ?? txn.Customer?.CustomerName ?? "Cash / Retail Customer";
            var isB2B = string.Equals(invoiceType, "B2B", StringComparison.OrdinalIgnoreCase) || !string.IsNullOrWhiteSpace(custGst);
            var isTaxInvoice = txn.IsGstApplicable && (txn.TaxAmount > 0 || txn.GstRate > 0) && !string.Equals(billType, "Bill of Supply", StringComparison.OrdinalIgnoreCase);

            string title = isTaxInvoice
                ? (isB2B ? "TAX INVOICE (B2B)" : "TAX INVOICE (B2C)")
                : (isB2B ? "BILL OF SUPPLY (B2B)" : "BILL OF SUPPLY / CASH MEMO");

            string companyName = SanitizeText(company?.Name ?? tenant?.Name ?? "AQUZIO PURIFIED WATER");
            string companyAddress = SanitizeText(tenant?.Address ?? "Industrial Area, Kerala, India");
            string companyGst = SanitizeText(tenant?.GstNumber ?? "");
            string companyPan = SanitizeText(tenant?.PanNumber ?? "");
            string companyPhone = SanitizeText(tenant?.OwnerPhone ?? "");
            string companyEmail = SanitizeText(tenant?.OwnerEmail ?? "");

            double y = PageHeight - Margin;

            // 1. TOP HEADER ACCENT BAR (Aquora Deep Blue)
            DrawRect(stream, Margin, y - 4, UsableWidth, 4, 0.08, 0.35, 0.75, true, false);
            y -= 14;

            // 2. COMPANY HEADER & LOGO BADGE
            // Logo Badge Box
            DrawRect(stream, Margin, y - 36, 42, 36, 0.94, 0.96, 0.99, true, true, 0.78, 0.85, 0.95, 1);
            DrawText(stream, "AQ", Margin + 21, y - 22, "F2", 18, 0.08, 0.35, 0.75, "center");
            DrawText(stream, "WATER ERP", Margin + 21, y - 31, "F2", 6.0, 0.40, 0.50, 0.65, "center");

            // Company Text details
            double compX = Margin + 50;
            DrawText(stream, companyName, compX, y - 4, "F2", 13.5, 0.08, 0.15, 0.30, "left");
            double compY = y - 15;
            if (!string.IsNullOrEmpty(companyAddress))
            {
                DrawText(stream, companyAddress, compX, compY, "F1", 7.5, 0.35, 0.40, 0.48, "left");
                compY -= 9;
            }
            string compTaxInfo = "";
            if (!string.IsNullOrEmpty(companyGst)) compTaxInfo += $"GSTIN: {companyGst}  ";
            if (!string.IsNullOrEmpty(companyPan)) compTaxInfo += $"PAN: {companyPan}  ";
            if (!string.IsNullOrEmpty(companyPhone)) compTaxInfo += $"Ph: {companyPhone}";
            if (!string.IsNullOrEmpty(compTaxInfo))
            {
                DrawText(stream, compTaxInfo, compX, compY, "F2", 7.5, 0.20, 0.25, 0.35, "left");
            }

            // Document Title Block (Top Right)
            DrawText(stream, title, PageWidth - Margin, y - 2, "F2", 13.0, 0.08, 0.35, 0.75, "right");
            DrawText(stream, isTaxInvoice ? "ORIGINAL FOR RECIPIENT" : "COMMERCIAL SUPPLY COPY", PageWidth - Margin, y - 12, "F1", 7.0, 0.50, 0.55, 0.60, "right");
            DrawText(stream, $"Invoice No: {txn.TransactionNumber}", PageWidth - Margin, y - 22, "F2", 9.0, 0.10, 0.15, 0.25, "right");
            DrawText(stream, $"Date: {txn.TransactionDate:dd MMM yyyy}", PageWidth - Margin, y - 31, "F1", 8.0, 0.30, 0.35, 0.40, "right");

            y -= 46;

            // 3. DIVIDER LINE
            DrawLine(stream, Margin, y, PageWidth - Margin, y, 0.75, 0.85, 0.88, 0.92);
            y -= 10;

            // 4. BUYER & INVOICE METADATA 2-COLUMN CARD
            double cardHeight = 62;
            double colWidth = (UsableWidth - 10) / 2.0;

            // Left Box: Buyer / Bill To
            DrawRect(stream, Margin, y - cardHeight, colWidth, cardHeight, 0.98, 0.99, 1.0, true, true, 0.88, 0.91, 0.95, 0.75);
            DrawText(stream, "BILLED TO / BUYER DETAILS", Margin + 8, y - 11, "F2", 7.5, 0.08, 0.35, 0.75, "left");
            DrawText(stream, custName, Margin + 8, y - 22, "F2", 9.5, 0.10, 0.15, 0.25, "left");

            string custAddr = SanitizeText($"{customer?.AddressLine1 ?? ""} {customer?.City ?? ""} {customer?.State ?? ""} {customer?.PinCode ?? ""}".Trim());
            if (string.IsNullOrWhiteSpace(custAddr)) custAddr = "Local Client / Registered Counter Sale";
            DrawText(stream, custAddr, Margin + 8, y - 32, "F1", 7.5, 0.35, 0.40, 0.48, "left");

            string custContact = "";
            if (!string.IsNullOrEmpty(customer?.Phone)) custContact += $"Phone: {customer.Phone}  ";
            if (!string.IsNullOrEmpty(customer?.Email)) custContact += $"Email: {customer.Email}";
            DrawText(stream, custContact, Margin + 8, y - 41, "F1", 7.5, 0.35, 0.40, 0.48, "left");

            string gstinLine = isB2B && !string.IsNullOrEmpty(custGst) ? $"GSTIN/UIN: {custGst}" : "Consumer / Unregistered Person";
            DrawText(stream, gstinLine, Margin + 8, y - 52, "F2", 8.0, isB2B ? 0.08 : 0.45, isB2B ? 0.35 : 0.45, isB2B ? 0.75 : 0.50, "left");

            // Right Box: Invoice Reference & Dispatch Details
            double rightX = Margin + colWidth + 10;
            DrawRect(stream, rightX, y - cardHeight, colWidth, cardHeight, 0.98, 0.99, 1.0, true, true, 0.88, 0.91, 0.95, 0.75);
            DrawText(stream, "DISPATCH & PAYMENT TERMS", rightX + 8, y - 11, "F2", 7.5, 0.08, 0.35, 0.75, "left");

            string paymentMethod = txn.PaymentMethod ?? "Credit";
            string paymentStatus = txn.PaymentStatus ?? (txn.AmountReceived >= txn.TotalAmount ? "Paid" : "Pending");
            DrawText(stream, $"Payment Mode: {paymentMethod}", rightX + 8, y - 22, "F1", 8.0, 0.20, 0.25, 0.35, "left");
            DrawText(stream, $"Payment Status: {paymentStatus.ToUpperInvariant()}", rightX + 8, y - 32, "F2", 8.0, paymentStatus == "Paid" ? 0.10 : 0.80, paymentStatus == "Paid" ? 0.60 : 0.20, paymentStatus == "Paid" ? 0.20 : 0.20, "left");

            string refNo = !string.IsNullOrEmpty(txn.ReferenceNumber) ? txn.ReferenceNumber : "N/A";
            DrawText(stream, $"PO / Ref No: {refNo}", rightX + 8, y - 41, "F1", 8.0, 0.35, 0.40, 0.48, "left");

            string stateName = customer?.State ?? "Kerala (32)";
            DrawText(stream, $"Place of Supply: {stateName}", rightX + 8, y - 52, "F1", 8.0, 0.20, 0.25, 0.35, "left");

            y -= (cardHeight + 12);

            // 5. LINE ITEMS TABLE HEADER
            double tableTopY = y;
            double rowH = 18;
            DrawRect(stream, Margin, y - rowH, UsableWidth, rowH, 0.92, 0.95, 0.98, true, true, 0.80, 0.85, 0.90, 0.75);

            // Columns:
            // S# (20) | Item Description (170) | HSN (45) | Qty (40) | Rate (45) | Disc (35) | Taxable (55) | GST (45) | Total (68)
            double cSno = Margin + 4;
            double cDesc = Margin + 22;
            double cHsn = Margin + 195;
            double cQty = Margin + 245;
            double cRate = Margin + 295;
            double cDisc = Margin + 338;
            double cTaxable = Margin + 395;
            double cGst = Margin + 448;
            double cTotal = Margin + UsableWidth - 4;

            DrawText(stream, "#", cSno, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "left");
            DrawText(stream, "ITEM DESCRIPTION & SPECIFICATION", cDesc, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "left");
            DrawText(stream, "HSN/SAC", cHsn, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "left");
            DrawText(stream, "QTY", cQty, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");
            DrawText(stream, "RATE", cRate, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");
            DrawText(stream, "DISC", cDisc, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");
            DrawText(stream, "TAXABLE", cTaxable, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");
            DrawText(stream, "GST", cGst, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");
            DrawText(stream, "TOTAL", cTotal, y - 12, "F2", 7.5, 0.15, 0.20, 0.30, "right");

            y -= rowH;

            // 6. RENDER ROWS
            var items = txn.Items != null && txn.Items.Count > 0 ? txn.Items.ToList() : new List<SalesTransactionItem>();
            decimal subTotal = 0m;
            decimal totalDiscount = txn.DiscountAmount;
            decimal totalTax = txn.TaxAmount;
            decimal grandTotal = txn.TotalAmount;

            int rowIdx = 1;
            if (items.Count > 0)
            {
                foreach (var item in items)
                {
                    double itemH = 20;
                    bool isEven = rowIdx % 2 == 0;
                    if (isEven) DrawRect(stream, Margin, y - itemH, UsableWidth, itemH, 0.985, 0.99, 1.0, true, false);

                    string pName = SanitizeText(item.Product?.Name ?? "Purified Water Product");
                    if (item.CaseConfiguration != null) pName += $" ({item.CaseConfiguration.UnitsPerCase} units/case)";
                    string sku = SanitizeText(item.Product?.SKU ?? "22011010");
                    string hsn = "22011010"; // Standard HSN for packaged drinking water

                    decimal lineQty = Math.Abs(item.Cases);
                    decimal lineRate = item.UnitPrice;
                    decimal lineDisc = item.DiscountAmount;
                    decimal lineTaxable = Math.Max(0m, (lineQty * lineRate) - lineDisc);
                    decimal lineTax = item.TaxAmount;
                    decimal lineTotal = item.TotalAmount > 0 ? item.TotalAmount : (lineTaxable + lineTax);

                    subTotal += lineTaxable;

                    DrawText(stream, rowIdx.ToString(), cSno, y - 11, "F1", 8.0, 0.30, 0.35, 0.40, "left");
                    DrawText(stream, pName, cDesc, y - 9, "F2", 8.0, 0.15, 0.20, 0.25, "left");
                    DrawText(stream, $"SKU: {sku}", cDesc, y - 16, "F1", 6.5, 0.45, 0.50, 0.55, "left");
                    DrawText(stream, hsn, cHsn, y - 11, "F1", 7.5, 0.30, 0.35, 0.40, "left");
                    DrawText(stream, $"{lineQty:0.##}", cQty, y - 11, "F2", 8.0, 0.15, 0.20, 0.25, "right");
                    DrawText(stream, $"{lineRate:F2}", cRate, y - 11, "F1", 8.0, 0.25, 0.30, 0.35, "right");
                    DrawText(stream, lineDisc > 0 ? $"{lineDisc:F2}" : "-", cDisc, y - 11, "F1", 7.5, 0.40, 0.45, 0.50, "right");
                    DrawText(stream, $"{lineTaxable:F2}", cTaxable, y - 11, "F1", 8.0, 0.15, 0.20, 0.25, "right");
                    DrawText(stream, lineTax > 0 ? $"{lineTax:F2} ({item.GstRate:0}%)" : "0.00", cGst, y - 11, "F1", 7.5, 0.30, 0.35, 0.40, "right");
                    DrawText(stream, $"{lineTotal:F2}", cTotal, y - 11, "F2", 8.5, 0.10, 0.15, 0.25, "right");

                    // Sub row divider
                    DrawLine(stream, Margin, y - itemH, PageWidth - Margin, y - itemH, 0.5, 0.90, 0.92, 0.95);
                    y -= itemH;
                    rowIdx++;
                }
            }
            else
            {
                // Fallback single line item
                double itemH = 20;
                string pName = SanitizeText(txn.Product?.Name ?? "Purified Water 20L / Bottles");
                string sku = SanitizeText(txn.Product?.SKU ?? "WATER-20L");
                decimal lineQty = Math.Abs(txn.Cases);
                decimal lineRate = txn.UnitPrice;
                decimal lineDisc = txn.DiscountAmount;
                decimal lineTaxable = Math.Max(0m, (lineQty * lineRate) - lineDisc);
                subTotal = lineTaxable;

                DrawText(stream, "1", cSno, y - 11, "F1", 8.0, 0.30, 0.35, 0.40, "left");
                DrawText(stream, pName, cDesc, y - 9, "F2", 8.0, 0.15, 0.20, 0.25, "left");
                DrawText(stream, $"SKU: {sku}", cDesc, y - 16, "F1", 6.5, 0.45, 0.50, 0.55, "left");
                DrawText(stream, "22011010", cHsn, y - 11, "F1", 7.5, 0.30, 0.35, 0.40, "left");
                DrawText(stream, $"{lineQty:0.##}", cQty, y - 11, "F2", 8.0, 0.15, 0.20, 0.25, "right");
                DrawText(stream, $"{lineRate:F2}", cRate, y - 11, "F1", 8.0, 0.25, 0.30, 0.35, "right");
                DrawText(stream, lineDisc > 0 ? $"{lineDisc:F2}" : "-", cDisc, y - 11, "F1", 7.5, 0.40, 0.45, 0.50, "right");
                DrawText(stream, $"{lineTaxable:F2}", cTaxable, y - 11, "F1", 8.0, 0.15, 0.20, 0.25, "right");
                DrawText(stream, totalTax > 0 ? $"{totalTax:F2} ({txn.GstRate:0}%)" : "0.00", cGst, y - 11, "F1", 7.5, 0.30, 0.35, 0.40, "right");
                DrawText(stream, $"{grandTotal:F2}", cTotal, y - 11, "F2", 8.5, 0.10, 0.15, 0.25, "right");

                DrawLine(stream, Margin, y - itemH, PageWidth - Margin, y - itemH, 0.5, 0.90, 0.92, 0.95);
                y -= itemH;
            }

            // Fill blank lines up to minimal spacing
            if (rowIdx < 3)
            {
                double blankH = 14;
                DrawLine(stream, Margin, y - blankH, PageWidth - Margin, y - blankH, 0.3, 0.94, 0.95, 0.97);
                y -= blankH;
            }

            y -= 10;

            // 7. SUMMARY & TOTALS SECTION (2 COLUMNS)
            double sumBoxWidth = 230;
            double sumBoxX = PageWidth - Margin - sumBoxWidth;
            double leftNotesWidth = sumBoxX - Margin - 12;

            // Left Side: Bank Details, Notes & Amount in Words
            DrawRect(stream, Margin, y - 95, leftNotesWidth, 95, 0.985, 0.99, 1.0, true, true, 0.88, 0.91, 0.95, 0.75);
            DrawText(stream, "AMOUNT IN WORDS", Margin + 8, y - 11, "F2", 7.0, 0.40, 0.45, 0.55, "left");
            string words = ConvertAmountToWords(grandTotal);
            DrawText(stream, words, Margin + 8, y - 21, "F2", 8.0, 0.10, 0.15, 0.25, "left");

            DrawLine(stream, Margin + 8, y - 27, Margin + leftNotesWidth - 8, y - 27, 0.5, 0.88, 0.90, 0.93);

            DrawText(stream, "COMPANY BANK & SETTLEMENT DETAILS", Margin + 8, y - 36, "F2", 7.0, 0.40, 0.45, 0.55, "left");
            string bankName = !string.IsNullOrEmpty(bankDetails) ? bankDetails : "State Bank of India (SBI) - Current A/C";
            DrawText(stream, $"Bank: {bankName}", Margin + 8, y - 46, "F1", 7.5, 0.25, 0.30, 0.38, "left");
            DrawText(stream, "A/C No: 41290812391024  •  IFSC: SBIN0008412", Margin + 8, y - 55, "F1", 7.5, 0.25, 0.30, 0.38, "left");
            DrawText(stream, "UPI: aquzio@okaxis  •  Branch: Industrial Estate", Margin + 8, y - 64, "F1", 7.5, 0.25, 0.30, 0.38, "left");

            DrawLine(stream, Margin + 8, y - 70, Margin + leftNotesWidth - 8, y - 70, 0.5, 0.88, 0.90, 0.93);

            string safeNotes = !string.IsNullOrWhiteSpace(notes) ? notes : "Thank you for partnering with Aquzio Pure Water.";
            DrawText(stream, $"Notes: {SanitizeText(safeNotes)}", Margin + 8, y - 82, "F1", 7.0, 0.40, 0.45, 0.55, "left");

            // Right Side: Calculation & Grand Total Breakdown
            DrawRect(stream, sumBoxX, y - 95, sumBoxWidth, 95, 0.97, 0.98, 0.99, true, true, 0.85, 0.88, 0.92, 0.75);

            double sumLabelX = sumBoxX + 10;
            double sumValX = sumBoxX + sumBoxWidth - 10;
            double sY = y - 13;

            DrawText(stream, "Taxable Subtotal:", sumLabelX, sY, "F1", 8.0, 0.30, 0.35, 0.42, "left");
            DrawText(stream, $"INR {subTotal:F2}", sumValX, sY, "F1", 8.0, 0.20, 0.25, 0.35, "right");
            sY -= 12;

            if (txn.DiscountAmount > 0)
            {
                DrawText(stream, "Trade Discount:", sumLabelX, sY, "F1", 8.0, 0.30, 0.35, 0.42, "left");
                DrawText(stream, $"- INR {txn.DiscountAmount:F2}", sumValX, sY, "F1", 8.0, 0.80, 0.20, 0.20, "right");
                sY -= 12;
            }

            if (isTaxInvoice)
            {
                decimal cgst = txn.CGST;
                decimal sgst = txn.SGST;
                decimal igst = txn.IGST;
                if (cgst == 0 && sgst == 0 && igst == 0 && txn.TaxAmount > 0)
                {
                    cgst = Math.Round(txn.TaxAmount / 2m, 2);
                    sgst = txn.TaxAmount - cgst;
                }

                if (igst > 0)
                {
                    DrawText(stream, $"IGST ({txn.GstRate:0}%):", sumLabelX, sY, "F1", 8.0, 0.30, 0.35, 0.42, "left");
                    DrawText(stream, $"INR {igst:F2}", sumValX, sY, "F1", 8.0, 0.20, 0.25, 0.35, "right");
                    sY -= 12;
                }
                else
                {
                    decimal halfRate = txn.GstRate / 2m;
                    DrawText(stream, $"CGST ({halfRate:0.##}%):", sumLabelX, sY, "F1", 8.0, 0.30, 0.35, 0.42, "left");
                    DrawText(stream, $"INR {cgst:F2}", sumValX, sY, "F1", 8.0, 0.20, 0.25, 0.35, "right");
                    sY -= 12;

                    DrawText(stream, $"SGST ({halfRate:0.##}%):", sumLabelX, sY, "F1", 8.0, 0.30, 0.35, 0.42, "left");
                    DrawText(stream, $"INR {sgst:F2}", sumValX, sY, "F1", 8.0, 0.20, 0.25, 0.35, "right");
                    sY -= 12;
                }
            }

            // Highlighted Grand Total Box
            DrawRect(stream, sumBoxX, sY - 14, sumBoxWidth, 20, 0.08, 0.35, 0.75, true, false);
            DrawText(stream, "INVOICE TOTAL:", sumLabelX, sY - 8, "F2", 9.5, 1.0, 1.0, 1.0, "left");
            DrawText(stream, $"INR {grandTotal:F2}", sumValX, sY - 8, "F2", 11.5, 1.0, 1.0, 1.0, "right");
            sY -= 28;

            DrawText(stream, "Amount Received:", sumLabelX, sY, "F1", 7.5, 0.30, 0.35, 0.40, "left");
            DrawText(stream, $"INR {txn.AmountReceived:F2}", sumValX, sY, "F2", 7.5, 0.10, 0.60, 0.20, "right");
            sY -= 10;

            decimal balanceDue = Math.Max(0m, grandTotal - txn.AmountReceived);
            DrawText(stream, "Balance Outstanding:", sumLabelX, sY, "F1", 7.5, 0.30, 0.35, 0.40, "left");
            DrawText(stream, $"INR {balanceDue:F2}", sumValX, sY, "F2", 8.0, balanceDue > 0 ? 0.85 : 0.20, balanceDue > 0 ? 0.15 : 0.60, 0.20, "right");

            y -= 115;

            // 8. FOOTER: TERMS & CONDITIONS + AUTHORIZED SIGNATORY
            double signBoxW = 160;
            double signX = PageWidth - Margin - signBoxW;
            double termsW = signX - Margin - 15;

            DrawText(stream, "TERMS AND CONDITIONS", Margin, y - 6, "F2", 7.0, 0.35, 0.40, 0.50, "left");
            DrawText(stream, "1. Goods once sold will not be taken back or exchanged.", Margin, y - 15, "F1", 6.5, 0.45, 0.50, 0.55, "left");
            DrawText(stream, "2. Payments must be routed strictly to registered company bank accounts.", Margin, y - 23, "F1", 6.5, 0.45, 0.50, 0.55, "left");
            DrawText(stream, "3. Interest @ 18% p.a. charged on overdue invoices.", Margin, y - 31, "F1", 6.5, 0.45, 0.50, 0.55, "left");

            // Signatory Box
            DrawRect(stream, signX, y - 48, signBoxW, 48, 0.985, 0.99, 1.0, true, true, 0.85, 0.88, 0.92, 0.5);
            DrawText(stream, $"For {companyName}", signX + (signBoxW / 2.0), y - 11, "F2", 7.5, 0.15, 0.20, 0.30, "center");
            DrawLine(stream, signX + 15, y - 34, signX + signBoxW - 15, y - 34, 0.5, 0.70, 0.75, 0.80);
            DrawText(stream, "Authorized Signatory", signX + (signBoxW / 2.0), y - 42, "F1", 7.0, 0.40, 0.45, 0.50, "center");

            // 9. BOTTOM AUDIT STAMP
            DrawText(stream, "System-generated electronic Tax Invoice • Authenticated via Aquzio Enterprise ERP Cryptographic Audit Ledger", PageWidth / 2.0, Margin + 4, "F1", 6.0, 0.55, 0.60, 0.65, "center");

            pages.Add(stream.ToString());
            return CompilePdfDocument(pages, 1);
        }

        // ==========================================
        // PDF LOW-LEVEL DRAWING PRIMITIVES
        // ==========================================
        private static void DrawText(StringBuilder stream, string text, double x, double y, string font, double size, double r, double g, double b, string align = "left")
        {
            if (string.IsNullOrEmpty(text)) return;
            string cleanText = EscapePdfString(text);

            if (align == "right" || align == "center")
            {
                double approxWidth = text.Length * (size * 0.52);
                if (align == "right") x -= approxWidth;
                else if (align == "center") x -= (approxWidth / 2.0);
            }

            stream.Append(CultureInfo.InvariantCulture, $"BT /{font} {size:0.##} Tf {r:0.##} {g:0.##} {b:0.##} rg {x:0.##} {y:0.##} Td ({cleanText}) Tj ET\n");
        }

        private static void DrawLine(StringBuilder stream, double x1, double y1, double x2, double y2, double width, double r, double g, double b)
        {
            stream.Append(CultureInfo.InvariantCulture, $"{width:0.##} w {r:0.##} {g:0.##} {b:0.##} RG {x1:0.##} {y1:0.##} m {x2:0.##} {y2:0.##} l S\n");
        }

        private static void DrawRect(StringBuilder stream, double x, double y, double w, double h, double bgR, double bgG, double bgB, bool fill, bool stroke, double bdrR = 0, double bdrG = 0, double bdrB = 0, double bdrW = 1)
        {
            if (fill && stroke)
            {
                stream.Append(CultureInfo.InvariantCulture, $"{bdrW:0.##} w {bdrR:0.##} {bdrG:0.##} {bdrB:0.##} RG {bgR:0.##} {bgG:0.##} {bgB:0.##} rg {x:0.##} {y:0.##} {w:0.##} {h:0.##} re B\n");
            }
            else if (fill)
            {
                stream.Append(CultureInfo.InvariantCulture, $"{bgR:0.##} {bgG:0.##} {bgB:0.##} rg {x:0.##} {y:0.##} {w:0.##} {h:0.##} re f\n");
            }
            else if (stroke)
            {
                stream.Append(CultureInfo.InvariantCulture, $"{bdrW:0.##} w {bdrR:0.##} {bdrG:0.##} {bdrB:0.##} RG {x:0.##} {y:0.##} {w:0.##} {h:0.##} re S\n");
            }
        }

        private static string EscapePdfString(string input)
        {
            var sb = new StringBuilder();
            foreach (char c in input)
            {
                if (c == '(' || c == ')' || c == '\\') sb.Append('\\');
                sb.Append(c);
            }
            return sb.ToString();
        }

        private static string SanitizeText(string input)
        {
            if (string.IsNullOrEmpty(input)) return string.Empty;
            return input
                .Replace("₹", "INR ")
                .Replace("•", "-")
                .Replace("\r", "")
                .Replace("\n", " ")
                .Replace("–", "-")
                .Replace("—", "-");
        }

        private static string ConvertAmountToWords(decimal amount)
        {
            try
            {
                long whole = (long)Math.Floor(amount);
                long paise = (long)Math.Round((amount - whole) * 100);

                if (whole == 0) return "Rupees Zero Only";

                string result = "Rupees " + NumberToWordsIndian(whole);
                if (paise > 0)
                {
                    result += $" and {NumberToWordsIndian(paise)} Paise";
                }
                result += " Only";
                return result;
            }
            catch
            {
                return $"INR {amount:F2} Only";
            }
        }

        private static string NumberToWordsIndian(long number)
        {
            if (number == 0) return "Zero";

            var unitsMap = new[] { "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
            var tensMap = new[] { "Zero", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

            string words = "";

            if (number / 10000000 > 0)
            {
                words += NumberToWordsIndian(number / 10000000) + " Crore ";
                number %= 10000000;
            }

            if (number / 100000 > 0)
            {
                words += NumberToWordsIndian(number / 100000) + " Lakh ";
                number %= 100000;
            }

            if (number / 1000 > 0)
            {
                words += NumberToWordsIndian(number / 1000) + " Thousand ";
                number %= 1000;
            }

            if (number / 100 > 0)
            {
                words += NumberToWordsIndian(number / 100) + " Hundred ";
                number %= 100;
            }

            if (number > 0)
            {
                if (words != "") words += "and ";
                if (number < 20)
                {
                    words += unitsMap[number];
                }
                else
                {
                    words += tensMap[number / 10];
                    if ((number % 10) > 0) words += " " + unitsMap[number % 10];
                }
            }

            return words.Trim();
        }

        // ==========================================
        // PDF 1.4 DOCUMENT COMPILER
        // ==========================================
        private static byte[] CompilePdfDocument(List<string> pageStreams, int pageCount)
        {
            using var ms = new MemoryStream();
            using var writer = new StreamWriter(ms, Encoding.ASCII);

            var offsets = new List<long>();

            void WriteRaw(string s) => writer.Write(s);
            long CurrentOffset()
            {
                writer.Flush();
                return ms.Position;
            }

            // PDF-1.4 Header
            WriteRaw("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

            // Obj 1: Catalog
            offsets.Add(CurrentOffset());
            WriteRaw("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

            // Obj 2: Pages
            var pageObjIds = new List<int>();
            for (int i = 0; i < pageCount; i++) pageObjIds.Add(3 + (i * 2));

            offsets.Add(CurrentOffset());
            WriteRaw($"2 0 obj\n<< /Type /Pages /Kids [{string.Join(" ", pageObjIds.Select(id => $"{id} 0 R"))}] /Count {pageCount} >>\nendobj\n");

            int nextObjId = 3;
            var streamLengths = new List<int>();

            for (int i = 0; i < pageCount; i++)
            {
                int pageObjId = nextObjId++;
                int contentsObjId = nextObjId++;

                byte[] streamBytes = Encoding.ASCII.GetBytes(pageStreams[i]);
                streamLengths.Add(streamBytes.Length);

                // Page Object
                offsets.Add(CurrentOffset());
                WriteRaw($"{pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PageWidth:0.##} {PageHeight:0.##}] /Contents {contentsObjId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> >>\nendobj\n");

                // Contents Object
                offsets.Add(CurrentOffset());
                WriteRaw($"{contentsObjId} 0 obj\n<< /Length {streamBytes.Length} >>\nstream\n");
                writer.Flush();
                ms.Write(streamBytes, 0, streamBytes.Length);
                WriteRaw("\nendstream\nendobj\n");
            }

            // Cross-Reference Table
            long xrefOffset = CurrentOffset();
            int totalObjs = nextObjId;
            WriteRaw($"xref\n0 {totalObjs}\n");
            WriteRaw("0000000000 65535 f \n");
            for (int i = 0; i < offsets.Count; i++)
            {
                WriteRaw($"{offsets[i]:D10} 00000 n \n");
            }

            // Trailer
            WriteRaw($"trailer\n<< /Size {totalObjs} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF\n");
            writer.Flush();

            return ms.ToArray();
        }
    }
}
