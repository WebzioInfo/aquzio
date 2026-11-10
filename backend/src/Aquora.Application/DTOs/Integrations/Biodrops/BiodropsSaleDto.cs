using System;
using System.Collections.Generic;

namespace Aquora.Application.DTOs.Integrations.Biodrops
{
    public class BiodropsSaleDto
    {
        public Guid TransactionId { get; set; }
        public string TransactionNumber { get; set; } = string.Empty;
        public DateTime TransactionDate { get; set; }
        public Guid? CustomerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? Sku { get; set; }
        public decimal Quantity { get; set; }
        public string Unit { get; set; } = "Jar";
        public decimal UnitPrice { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal AmountPaid { get; set; }
        public decimal OutstandingAmount { get; set; }
        public string PaymentStatus { get; set; } = "Pending";
        public string? PaymentMethod { get; set; }
        public string Status { get; set; } = "Completed";
        public string? Remarks { get; set; }
        public string Source { get; set; } = "AQUZIO";
        public string BadgeLabel { get; set; } = "Changed the sales in Aquzio";
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? UpdatedAtUtc { get; set; }
    }
}
